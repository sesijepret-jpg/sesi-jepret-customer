import { Template as ITemplate } from '../types';

export class TemplateModel implements ITemplate {
  readonly id: string;
  readonly name: string;
  readonly imageUrl: string;
  readonly thumbnail: string;
  readonly templateImage: string;
  readonly orientation: string;
  readonly printSize: string;
  readonly category: string;
  readonly photoCount: number;
  readonly active: boolean;
  readonly canvasWidth: number;
  readonly canvasHeight: number;

  constructor(data: ITemplate) {
    this.id = data.id;
    this.name = data.name;
    this.imageUrl = data.imageUrl;
    this.thumbnail = data.thumbnail;
    this.templateImage = data.templateImage;
    this.orientation = data.orientation;
    this.printSize = data.printSize;
    this.category = data.category;
    this.photoCount = data.photoCount;
    this.active = data.active;
    this.canvasWidth = data.canvasWidth;
    this.canvasHeight = data.canvasHeight;
  }

  static fromFirestore(docId: string, data: Record<string, any>): TemplateModel {
    const imageUrl = data.image_url || data.templateImage || '';
    const templateImage = data.templateImage || data.image_url || '';
    const thumbnail = data.thumbnail || imageUrl;

    return new TemplateModel({
      id: docId,
      name: data.name || '',
      imageUrl,
      thumbnail,
      templateImage,
      orientation: data.orientation || 'portrait',
      printSize: data.print_size || '2x6',
      category: data.category || 'General',
      photoCount: data.photo_count ?? data.photoCount ?? 3,
      active: data.active !== undefined ? !!data.active : true,
      canvasWidth: Number(data.canvasWidth ?? data.canvas_width ?? 600),
      canvasHeight: Number(data.canvasHeight ?? data.canvas_height ?? 1800),
    });
  }

  toFirestore(): Record<string, any> {
    return {
      name: this.name,
      image_url: this.imageUrl,
      thumbnail: this.thumbnail,
      templateImage: this.templateImage,
      orientation: this.orientation,
      print_size: this.printSize,
      category: this.category,
      photo_count: this.photoCount,
      active: this.active,
      canvas_width: this.canvasWidth,
      canvas_height: this.canvasHeight,
    };
  }

  /** Alias ke localTemplates untuk kompatibilitas mundur */
  static get placeholders(): TemplateModel[] {
    return TemplateModel.localTemplates;
  }

  /**
   * Template lokal berbasis PNG asli di /templates/.
   * Digunakan sebagai fallback utama jika Firestore tidak tersedia.
   * Layout diambil dari layout-template-N.json di folder yang sama.
   */
  static get localTemplates(): TemplateModel[] {
    const photoCounts: Record<number, number> = {
      1: 3, 2: 3, 3: 2, 4: 4, 5: 3, 6: 3, 7: 3, 8: 3,
      9: 4, 10: 4, 11: 4, 12: 4, 13: 3, 14: 4, 15: 4, 16: 3, 17: 4, 18: 3, 19: 4,
      20: 2, 21: 3, 22: 3, 23: 4, 24: 4, 25: 3, 26: 4, 27: 4, 28: 4, 29: 3,
    };

    const upiTemplates = [11, 13, 14, 15, 16, 21, 22, 23, 25, 26];

    return Array.from({ length: 29 }).map((_, i) => {
      const num = i + 1;
      const count = photoCounts[num] ?? 3;
      const cdnUrl = `https://cdn.jsdelivr.net/gh/sesijepret-jpg/templates@main/${num}.png?v=20261022b`;
      const isUpi = upiTemplates.includes(num);

      return new TemplateModel({
        id: `local_template_${num}`,
        name: `Photo Booth ${num}`,
        imageUrl: cdnUrl,
        thumbnail: cdnUrl,
        templateImage: cdnUrl,
        orientation: 'portrait',
        printSize: '2x6',
        category: isUpi ? 'Tutorial UPI' : 'Photo Booth',
        photoCount: count,
        active: true,
        canvasWidth: 600,
        canvasHeight: 1800,
      });
    });
  }

  /**
   * Kembalikan path ke layout JSON berdasarkan ID template.
   * Mengarah ke CDN GitHub sebagai fallback jika Firestore tidak punya layout.
   */
  static getLocalLayoutPath(templateId: string): string | null {
    const match = templateId.match(/(?:local_)?template_(\d+)/);
    if (match) {
      return `https://cdn.jsdelivr.net/gh/sesijepret-jpg/templates@main/layout-template-${match[1]}.json?v=20261022b`;
    }
    return null;
  }
}
