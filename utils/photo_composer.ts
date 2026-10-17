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

export type PrintMode =
  | 'canon_double_strip'
  | 'roll_2inch_double'
  | 'double_strip'
  | 'single_strip';

export interface PrintImageOptions {
  templateName?: string;
  mode?: PrintMode;
  onAfterPrint?: () => void;
}

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
 *  - Print (buka window print 2x6 inci atau 4R double-strip)
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

  /**
   * Buka dialog print menggunakan iframe tersembunyi (menghindari popup diblokir).
   *
   * Mendukung:
   * 1. 'single_strip' (Default): Ukuran standar 2 x 6 inci (50.8 x 152.4 mm, 600 x 1800 px @ 300 DPI)
   * 2. 'double_strip': Ukuran 4R (4 x 6 inci, 101.6 x 152.4 mm, 1200 x 1800 px) dengan 2 strip berdampingan
   */
  static printImage(
    base64DataUrl: string,
    options?: string | PrintImageOptions
  ): void {
    const opts: PrintImageOptions =
      typeof options === 'string'
        ? { templateName: options, mode: 'canon_double_strip' }
        : { mode: 'canon_double_strip', ...options };

    const mode = opts.mode || 'canon_double_strip';
    const templateName = opts.templateName || 'Photo Booth Strip';
    const isCanon = mode === 'canon_double_strip' || mode === 'double_strip';

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      console.error('[PhotoComposer] Gagal mendapatkan document iframe untuk print');
      return;
    }

    const pageSize = isCanon ? '4in 6in' : '2in 6in';
    const pageTitle = isCanon
      ? `Print - ${templateName} (Canon 4R - 2 Strip)`
      : `Print - ${templateName} (Roll 2 Inci - 2x Cetak)`;

    // Callback onAfterPrint guard
    let afterPrintTriggered = false;
    const triggerAfterPrint = () => {
      if (!afterPrintTriggered) {
        afterPrintTriggered = true;
        if (opts.onAfterPrint) {
          opts.onAfterPrint();
        }
      }
    };

    const messageHandler = (event: MessageEvent) => {
      if (event.data?.type === 'SESIJEPRET_PRINT_DONE') {
        window.removeEventListener('message', messageHandler);
        triggerAfterPrint();
      }
    };
    window.addEventListener('message', messageHandler);

    try {
      iframe.contentWindow?.addEventListener('afterprint', triggerAfterPrint);
    } catch (e) {
      console.warn('[PhotoComposer] Gagal attach afterprint ke iframe window:', e);
    }
    window.addEventListener('afterprint', triggerAfterPrint, { once: true });

    doc.open();
    doc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${pageTitle}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    @page {
      size: auto;
      margin: 0mm;
    }
    html, body {
      width: 100% !important;
      height: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      overflow: hidden !important;
      page-break-inside: avoid !important;
      page-break-after: avoid !important;
      page-break-before: avoid !important;
      break-inside: avoid !important;
      break-after: avoid !important;
      break-before: avoid !important;
    }
    .print-outer {
      width: 100% !important;
      height: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important; /* Horizontal center */
      justify-content: flex-start !important; /* Vertical TOP (paling atas) */
      position: relative !important;
      page-break-inside: avoid !important;
      page-break-after: avoid !important;
      break-inside: avoid !important;
      break-after: avoid !important;
      overflow: hidden !important;
    }
    .print-wrapper {
      width: ${isCanon ? '4in' : '2in'} !important;
      height: 6in !important;
      margin-top: 0 !important;
      margin-bottom: auto !important;
      margin-left: auto !important;
      margin-right: auto !important;
      padding: 0 !important;
      display: flex !important;
      flex-direction: row !important;
      justify-content: ${isCanon ? 'space-between' : 'center'} !important;
      align-items: flex-start !important;
      position: relative !important;
      flex-shrink: 0 !important;
      page-break-inside: avoid !important;
      page-break-after: avoid !important;
      break-inside: avoid !important;
      break-after: avoid !important;
      overflow: hidden !important;
    }
    .strip-item {
      width: ${isCanon ? '50%' : '100%'} !important;
      height: 6in !important;
      display: flex !important;
      justify-content: center !important;
      align-items: flex-start !important;
      margin: 0 !important;
      padding: 0 !important;
      flex-shrink: 0 !important;
      overflow: hidden !important;
    }
    img.strip-img {
      width: 100% !important;
      height: 100% !important;
      display: block !important;
      margin: 0 !important;
      padding: 0 !important;
      vertical-align: top !important;
      object-fit: fill !important;
      image-rendering: -webkit-optimize-contrast !important;
    }
    .cut-line {
      position: absolute !important;
      left: 50% !important;
      top: 0 !important;
      bottom: 0 !important;
      width: 0 !important;
      border-left: 1px dashed rgba(0, 0, 0, 0.25) !important;
      z-index: 10 !important;
    }
    .page-break {
      page-break-before: always !important;
      break-before: page !important;
    }
    @media print {
      @page {
        size: auto;
        margin: 0mm;
      }
      html, body {
        width: 100% !important;
        height: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
      .print-outer {
        width: 100% !important;
        height: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: flex-start !important; /* Paling atas di kertas print */
        overflow: hidden !important;
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
      .print-wrapper {
        width: ${isCanon ? '4in' : '2in'} !important;
        height: 6in !important;
        margin-top: 0 !important;
        margin-bottom: auto !important;
        margin-left: auto !important;
        margin-right: auto !important;
        align-items: flex-start !important;
        page-break-inside: avoid !important;
        page-break-after: avoid !important;
        break-inside: avoid !important;
        break-after: avoid !important;
      }
      .page-break {
        page-break-before: always !important;
        break-before: page !important;
      }
    }
  </style>
</head>
<body>
  ${
    isCanon
      ? `<div class="print-outer">
           <div class="print-wrapper">
             <div class="strip-item">
               <img class="strip-img" src="${base64DataUrl}" alt="Photo Strip 1" />
             </div>
             <div class="cut-line"></div>
             <div class="strip-item">
               <img class="strip-img" src="${base64DataUrl}" alt="Photo Strip 2" />
             </div>
           </div>
         </div>`
      : `<!-- Roll 2 Inci: 1 roll, 2 kali print (masing-masing 1 page di tengah paling atas) -->
         <div class="print-outer">
           <div class="print-wrapper">
             <div class="strip-item">
               <img class="strip-img" src="${base64DataUrl}" alt="Photo Strip 1" />
             </div>
           </div>
         </div>
         <div class="print-outer page-break">
           <div class="print-wrapper">
             <div class="strip-item">
               <img class="strip-img" src="${base64DataUrl}" alt="Photo Strip 2" />
             </div>
           </div>
         </div>`
  }
  <script>
    function notifyFinish() {
      try {
        window.parent.postMessage({ type: 'SESIJEPRET_PRINT_DONE' }, '*');
      } catch (e) {}
    }
    window.addEventListener('afterprint', notifyFinish);
    window.addEventListener('load', function() {
      setTimeout(function() {
        window.focus();
        window.print();
      }, 250);
    });
  </script>
</body>
</html>`);
    doc.close();

    // Hapus iframe setelah beberapa saat (memberi waktu print dialog muncul)
    setTimeout(() => {
      try {
        window.removeEventListener('message', messageHandler);
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      } catch (e) {}
    }, 25000);
  }
}
