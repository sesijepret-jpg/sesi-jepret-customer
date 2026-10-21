import { TemplateModel } from '../models/template_model';
import { LayoutModel } from '../models/layout_model';

export interface PhotoSlot {
  id: string;
  dataUrl: string;
}

/**
 * Spesifikasi standar ukuran strip photo booth (2 x 6 inci pada 300 DPI)
 */
export const PHOTO_STRIP_SPEC = {
  name: 'Standard Photo Booth Strip',
  widthInches: 2,
  heightInches: 6,
  widthMm: 50.8,
  heightMm: 152.4,
  widthCm: 5.08,
  heightCm: 15.24,
  widthPx: 600,
  heightPx: 1800,
  dpi: 300,
  aspectRatio: '1:3',
  // Format 4R untuk cetak 2 strip sekaligus pada kertas 4x6 inci
  doubleStripWidthInches: 4,
  doubleStripWidthPx: 1200,
} as const;

/**
 * PhotoComposer
 *
 * Alur:
 *  1. Buat canvas sesuai ukuran standar strip (600 x 1800 px, 2x6 inci @ 300 DPI)
 *  2. Gambar foto user ke setiap slot dengan object-fit: cover (crop center, no stretch)
 *  3. Gambar template PNG di atas sebagai overlay (frame)
 *  4. Export canvas ke PNG Blob (kualitas asli 300 DPI)
 *
 * Hasil Blob ini digunakan bersama oleh:
 *  - Preview (sebagai ObjectURL)
 *  - Email (sebagai base64)
 *  - Print (PNG 2x6 inci dikirim ke layanan cetak lokal)
 */
export class PhotoComposer {
  /**
   * Helper: load gambar dari URL atau data URL.
   * Tidak set crossOrigin untuk data:/blob: URL agar canvas tidak jadi "tainted".
   */
  static loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      if (!src) {
        reject(new Error('Image source is empty'));
        return;
      }
      const img = new Image();
      if (src.startsWith('http://') || src.startsWith('https://')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = src;
    });
  }

  /**
   * Gambar satu foto ke slot canvas dengan object-fit: cover.
   * Foto selalu memenuhi slot, tidak ada ruang kosong, aspect ratio dijaga.
   */
  private static drawCover(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    destX: number,
    destY: number,
    destW: number,
    destH: number,
    opacity: number = 1,
    rotation: number = 0
  ): void {
    const srcW = img.naturalWidth;
    const srcH = img.naturalHeight;

    if (srcW === 0 || srcH === 0 || destW === 0 || destH === 0) return;

    // Hitung crop untuk object-fit: cover (center crop)
    const srcAspect = srcW / srcH;
    const dstAspect = destW / destH;

    let sx = 0, sy = 0, sw = srcW, sh = srcH;

    if (srcAspect > dstAspect) {
      // Sumber lebih lebar → crop kiri kanan
      sw = srcH * dstAspect;
      sx = (srcW - sw) / 2;
    } else {
      // Sumber lebih tinggi → crop atas bawah
      sh = srcW / dstAspect;
      sy = (srcH - sh) / 2;
    }

    ctx.save();
    ctx.globalAlpha = opacity;

    if (rotation) {
      const cx = destX + destW / 2;
      const cy = destY + destH / 2;
      ctx.translate(cx, cy);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }

    // Clip ke area slot agar foto tidak tumpah ke luar frame
    ctx.beginPath();
    ctx.rect(destX, destY, destW, destH);
    ctx.clip();

    ctx.drawImage(img, sx, sy, sw, sh, destX, destY, destW, destH);

    ctx.restore();
  }

  /**
   * Compose foto user + template PNG menjadi satu gambar final.
   *
   * @returns Blob PNG hasil compose (kualitas asli, tidak di-compress ke JPEG)
   */
  static async compose(params: {
    template: TemplateModel;
    layout: LayoutModel;
    photos: PhotoSlot[];
    fallbackColor?: string;
  }): Promise<Blob> {
    const { template, layout, photos, fallbackColor = '#000000' } = params;

    // ── 1. Buat canvas sesuai ukuran template ──────────────────────────────
    // Standar strip photo booth: 600 x 1800 piksel (2 x 6 inci @ 300 DPI)
    const canvas = document.createElement('canvas');
    const width = template.canvasWidth || PHOTO_STRIP_SPEC.widthPx;
    const height = template.canvasHeight || PHOTO_STRIP_SPEC.heightPx;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D canvas context');

    // Isi background (akan tertutup oleh foto dan template PNG)
    ctx.fillStyle = fallbackColor;
    ctx.fillRect(0, 0, width, height);

    // ── 2. Load template image (if any) ──────────────────────────────────
    const overlayUrl = template.templateImage || template.imageUrl;
    let overlayImg: HTMLImageElement | null = null;
    if (overlayUrl) {
      try {
        overlayImg = await PhotoComposer.loadImage(overlayUrl);
      } catch (e) {
        console.warn('[PhotoComposer] Gagal load template overlay:', e);
      }
    }

    const drawPhotos = async () => {
      for (let i = 0; i < layout.slots.length; i++) {
        const slot = layout.slots[i];
        const photo = photos[i];

        if (!photo?.dataUrl) continue;

        try {
          const img = await PhotoComposer.loadImage(photo.dataUrl);
          PhotoComposer.drawCover(
            ctx,
            img,
            slot.x,
            slot.y,
            slot.width,
            slot.height,
            slot.opacity ?? 1,
            slot.rotation ?? 0
          );
        } catch (e) {
          console.error(`[PhotoComposer] Gagal gambar foto slot ${slot.slotNumber}:`, e);
        }
      }
    };

    // ── 3. Draw depending on drawOnTop ───────────────────────────────────
    if (layout.drawOnTop) {
      if (overlayImg) ctx.drawImage(overlayImg, 0, 0, width, height);
      await drawPhotos();
    } else {
      await drawPhotos();
      if (overlayImg) {
        ctx.drawImage(overlayImg, 0, 0, width, height);
      } else {
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, width - 4, height - 4);
      }
    }

    // ── 4. Export canvas ke PNG Blob (tanpa kompresi lossy) ───────────────
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('[PhotoComposer] Gagal generate canvas blob'));
          }
        },
        'image/png'
      );
    });
  }

  /**
   * Helper: Gabungkan strip tunggal (600x1800) menjadi 2 strip berdampingan di kertas 4R (1200x1800 piksel / 4x6 inci @ 300 DPI).
   */
  static async composeDoubleStrip(singleStripBlobOrDataUrl: Blob | string): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = PHOTO_STRIP_SPEC.doubleStripWidthPx; // 1200 px (4 inci @ 300 DPI)
    canvas.height = PHOTO_STRIP_SPEC.heightPx; // 1800 px (6 inci @ 300 DPI)

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context for double strip');

    const src =
      typeof singleStripBlobOrDataUrl === 'string'
        ? singleStripBlobOrDataUrl
        : URL.createObjectURL(singleStripBlobOrDataUrl);

    try {
      const img = await PhotoComposer.loadImage(src);
      // Strip kiri (0 sampai 600)
      ctx.drawImage(img, 0, 0, PHOTO_STRIP_SPEC.widthPx, PHOTO_STRIP_SPEC.heightPx);
      // Strip kanan (600 sampai 1200)
      ctx.drawImage(img, PHOTO_STRIP_SPEC.widthPx, 0, PHOTO_STRIP_SPEC.widthPx, PHOTO_STRIP_SPEC.heightPx);

      // Garis potong halus di tengah untuk panduan pemotongan
      ctx.save();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(PHOTO_STRIP_SPEC.widthPx, 0);
      ctx.lineTo(PHOTO_STRIP_SPEC.widthPx, PHOTO_STRIP_SPEC.heightPx);
      ctx.stroke();
      ctx.restore();

      return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('[PhotoComposer] Gagal generate double strip canvas blob'));
          },
          'image/png'
        );
      });
    } finally {
      if (typeof singleStripBlobOrDataUrl !== 'string') {
        URL.revokeObjectURL(src);
      }
    }
  }

  /**
   * Convert Blob ke base64 data URL (untuk pengiriman email).
   */
  static blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

}
