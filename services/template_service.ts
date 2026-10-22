import { TemplateRepository } from '../repositories/template_repository';
import { TemplateModel } from '../models/template_model';
import { LayoutModel } from '../models/layout_model';
import { SlotModel } from '../models/slot_model';

export class TemplateService {
  private readonly repository: TemplateRepository;
  private cachedDynamicTemplates: TemplateModel[] = [];

  constructor(repository?: TemplateRepository) {
    this.repository = repository || new TemplateRepository();
  }

  /**
   * Menggabungkan template dari Firestore dengan template lokal,
   * memastikan template baru (seperti 20-29) tidak hilang jika belum terdaftar di Firestore.
   */
  private _mergeTemplates(firestoreTemplates: TemplateModel[], localTemplates: TemplateModel[]): TemplateModel[] {
    const getNum = (t: TemplateModel) => {
      const match = t.id.match(/\d+/) || t.name.match(/\d+/);
      return match ? parseInt(match[0], 10) : 0;
    };

    const existingNums = new Set(firestoreTemplates.map(getNum));
    const merged = [...firestoreTemplates];

    for (const localTpl of localTemplates) {
      const num = getNum(localTpl);
      if (!existingNums.has(num)) {
        merged.push(localTpl);
        existingNums.add(num);
      }
    }

    return merged.sort((a, b) => getNum(a) - getNum(b));
  }

  /**
   * Retrieve all active templates.
   * Prioritas: Menggabungkan Firestore dengan template lokal agar semua template (1-29) selalu lengkap.
   */
  async getActiveTemplates(): Promise<TemplateModel[]> {
    let localList = TemplateModel.localTemplates;

    // Fetch dynamic template list from API if available
    try {
      const res = await fetch('/api/templates');
      if (res.ok) {
        const data = await res.json();
        if (data.templates && data.templates.length > 0) {
          localList = data.templates.map((t: any) => new TemplateModel(t));
        }
      }
    } catch (e) {
      console.warn('Failed to fetch dynamic templates:', e);
    }
    this.cachedDynamicTemplates = localList;

    try {
      const firestoreTemplates = await this.repository.getActiveTemplates();
      if (firestoreTemplates.length > 0 && !firestoreTemplates.every((t) => t.id.startsWith('placeholder_'))) {
        return this._mergeTemplates(firestoreTemplates, localList);
      }
    } catch (e) {
      console.warn('Failed to fetch from Firestore, falling back to local', e);
    }

    return localList;
  }

  /**
   * Retrieve the layout configuration for a specific template.
   * Prioritas: Firestore → Layout JSON lokal (dari dynamic API atau name match)
   */
  async getTemplateLayout(templateId: string): Promise<LayoutModel> {
    // 1. Cek apakah ini template dinamis lokal (dari API route)
    const dynamicTpl = this.cachedDynamicTemplates.find(t => t.id === templateId);
    if (dynamicTpl) {
      // API route menyertakan layoutFile property jika ada
      const layoutPath = (dynamicTpl as any).layoutFile || TemplateModel.getLocalLayoutPath(templateId);
      if (layoutPath) {
        return this._loadLocalLayout(layoutPath, templateId);
      }
    }

    // 2. Cek apakah ini hardcoded local template
    const localLayoutPath = TemplateModel.getLocalLayoutPath(templateId);
    if (localLayoutPath) {
      return this._loadLocalLayout(localLayoutPath, templateId);
    }

    // 3. Fallback Firestore
    if (!templateId || templateId.startsWith('placeholder_')) {
      return LayoutModel.fallback;
    }

    try {
      const firestoreLayout = await this.repository.getTemplateLayout(templateId);
      if (firestoreLayout.id !== 'fallback') {
        return firestoreLayout;
      }
    } catch (e) {
      console.warn('Failed to fetch layout from Firestore', e);
    }
    
    // Jika masih gagal dari firestore, coba guessing layout dari id (e.g. template_1 -> layout-template-1.json)
    const match = templateId.match(/\d+/);
    if (match) {
      return this._loadLocalLayout(`https://cdn.jsdelivr.net/gh/sesijepret-jpg/templates@main/layout-template-${match[0]}.json`, templateId);
    }

    return LayoutModel.fallback;
  }

  /**
   * Load layout dari file JSON lokal di /public/templates/.
   */
  private async _loadLocalLayout(path: string, fallbackId: string): Promise<LayoutModel> {
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`Failed to fetch layout: ${res.status}`);
      const json = await res.json();

      const slots: SlotModel[] = (json.slots || []).map((s: any, idx: number) =>
        new SlotModel({
          slotNumber: s.slotNumber ?? idx + 1,
          x: Number(s.x ?? 0),
          y: Number(s.y ?? 0),
          width: Number(s.width ?? 100),
          height: Number(s.height ?? 100),
          rotation: Number(s.rotation ?? 0),
          fit: (s.fit as 'cover' | 'contain' | 'fill') || 'cover',
          radius: Number(s.radius ?? 0),
          opacity: Number(s.opacity ?? 1),
        })
      );

      return new LayoutModel({ id: json.id || fallbackId, slots, drawOnTop: json.drawOnTop === true });
    } catch (e) {
      console.warn('[TemplateService] Gagal load layout lokal dari', path, e);
      return LayoutModel.fallback;
    }
  }

  /**
   * Stream of active templates for real-time updates
   */
  watchActiveTemplates(
    onNext: (templates: TemplateModel[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    return this.repository.watchActiveTemplates(
      async (templates) => {
        const localList = this.cachedDynamicTemplates.length > 0
          ? this.cachedDynamicTemplates
          : TemplateModel.localTemplates;

        if (templates.length === 0 || templates.every((t) => t.id.startsWith('placeholder_'))) {
          onNext(localList);
        } else {
          onNext(this._mergeTemplates(templates, localList));
        }
      },
      onError
    );
  }
}
