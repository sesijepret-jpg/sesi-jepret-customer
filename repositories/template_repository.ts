import {
  Firestore,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  onSnapshot,
  doc,
  getDoc,
  limit,
  addDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AppConstants } from '../constants/app_constants';
import { TemplateModel } from '../models/template_model';
import { LayoutModel } from '../models/layout_model';

export class TemplateRepository {
  private readonly firestore: Firestore;

  constructor(firestore?: Firestore) {
    this.firestore = firestore || db;
  }

  private get collection() {
    return collection(this.firestore, AppConstants.colTemplates);
  }

  async getActiveTemplates(): Promise<TemplateModel[]> {
    try {
      const q = query(this.collection, where('active', '==', true));
      const querySnap = await getDocs(q);
      const templates = querySnap.docs.map((docSnap) => TemplateModel.fromFirestore(docSnap.id, docSnap.data()));
      
      // Urutkan berdasarkan nama di memori untuk menghindari kebutuhan composite index di Firestore
      return templates.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    } catch (e) {
      console.warn('[TemplateRepo] getActiveTemplates failed, using placeholders:', e);
      return TemplateModel.placeholders;
    }
  }

  /**
   * Fetch layout for a specific template
   */
  async getTemplateLayout(templateId: string): Promise<LayoutModel> {
    try {
      const layoutsCol = collection(this.firestore, AppConstants.colTemplates, templateId, 'layouts');
      const activeLayoutRef = doc(layoutsCol, 'active');
      const activeLayoutSnap = await getDoc(activeLayoutRef);

      if (activeLayoutSnap.exists()) {
        return LayoutModel.fromFirestore(activeLayoutSnap.id, activeLayoutSnap.data());
      }

      // Fallback: try checking if any layout documents exist
      const q = query(layoutsCol, limit(1));
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        const fallbackDoc = querySnap.docs[0];
        return LayoutModel.fromFirestore(fallbackDoc.id, fallbackDoc.data());
      }

      return LayoutModel.fallback;
    } catch (e) {
      console.warn('[TemplateRepo] getTemplateLayout failed, using fallback:', e);
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
    const q = query(this.collection, where('active', '==', true));
    return onSnapshot(
      q,
      (snapshot) => {
        const templates = snapshot.docs.map((docSnap) =>
          TemplateModel.fromFirestore(docSnap.id, docSnap.data())
        );
        onNext(templates);
      },
      (error) => {
        if (onError) onError(error);
      }
    );
  }

  /**
   * Seed demo templates
   */
  async seedDemoTemplates(): Promise<void> {
    for (const t of TemplateModel.placeholders) {
      const q = query(this.collection, where('name', '==', t.name), limit(1));
      const existing = await getDocs(q);
      if (existing.empty) {
        await addDoc(this.collection, t.toFirestore());
      }
    }
  }
}
