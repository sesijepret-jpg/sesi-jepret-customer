import { GIFEncoder, quantize, applyPalette } from 'gifenc';

export interface BoomerangResult {
  blob: Blob;
  blobUrl: string;
  base64: string;
  sizeBytes: number;
}

export interface BoomerangOptions {
  targetWidth?: number;
  delay?: number;
  watermarkText?: string;
  logoUrl?: string;
  brandColor?: string;
}

/**
 * Load image from Data URL or HTTP URL with Promise
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

/**
 * Convert Blob to Base64 Data URL
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Draw a rounded rectangle on a canvas 2D context
 */
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Draw a crisp, vector camera brand icon on a canvas 2D context
 */
function drawCameraIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  brandColor: string = '#E6007A'
) {
  const w = size;
  const h = Math.round(size * 0.78);
  const cx = x + w / 2;

  ctx.save();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Camera body (rounded rect)
  const bodyY = y + 3;
  const bodyH = h - 2;
  const r = 2;
  ctx.beginPath();
  ctx.moveTo(x + r, bodyY);
  ctx.lineTo(x + w - r, bodyY);
  ctx.quadraticCurveTo(x + w, bodyY, x + w, bodyY + r);
  ctx.lineTo(x + w, bodyY + bodyH - r);
  ctx.quadraticCurveTo(x + w, bodyY + bodyH, x + w - r, bodyY + bodyH);
  ctx.lineTo(x + r, bodyY + bodyH);
  ctx.quadraticCurveTo(x, bodyY + bodyH, x, bodyY + bodyH - r);
  ctx.lineTo(x, bodyY + r);
  ctx.quadraticCurveTo(x, bodyY, x + r, bodyY);
  ctx.closePath();
  ctx.stroke();

  // Top viewfinder notch
  const notchW = 5;
  const notchX = cx - notchW / 2;
  ctx.beginPath();
  ctx.moveTo(notchX, bodyY);
  ctx.lineTo(notchX + 1, y + 1);
  ctx.lineTo(notchX + notchW - 1, y + 1);
  ctx.lineTo(notchX + notchW, bodyY);
  ctx.stroke();

  // Lens circle
  const lensRadius = 3.2;
  ctx.beginPath();
  ctx.arc(cx, bodyY + bodyH / 2, lensRadius, 0, Math.PI * 2);
  ctx.stroke();

  // Signature brand magenta dot
  ctx.fillStyle = brandColor;
  ctx.beginPath();
  ctx.arc(cx, bodyY + bodyH / 2, 1.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export class BoomerangGenerator {
  private static inFlightPromise: Promise<BoomerangResult | null> | null = null;
  private static inFlightKey: string | null = null;
  private static cachedResult: BoomerangResult | null = null;
  private static cachedKey: string | null = null;

  /**
   * Reset any active in-flight or cached Boomerang state (e.g. on photo retake)
   */
  static reset(): void {
    this.inFlightPromise = null;
    this.inFlightKey = null;
    this.cachedResult = null;
    this.cachedKey = null;
  }

  /**
   * Generates a Boomerang Ping-Pong GIF from an array of photo data URLs.
   * Frame sequence: P1 -> P2 -> ... -> Pn -> P(n-1) -> ... -> P2 (looping).
   *
   * @param photoDataUrls Array of base64 data URLs or objects with dataUrl property
   * @param options Customization options (targetWidth, delay, watermarkText, logoUrl, brandColor)
   */
  static generateBoomerang(
    photoDataUrls: Array<string | { dataUrl: string }>,
    options?: BoomerangOptions
  ): Promise<BoomerangResult | null> {
    if (typeof window === 'undefined') {
      return Promise.resolve(null);
    }

    const rawUrls = photoDataUrls
      .map((item) => (typeof item === 'string' ? item : item.dataUrl))
      .filter((url): url is string => Boolean(url && url.length > 0));

    if (rawUrls.length === 0) {
      return Promise.resolve(null);
    }

    // Deduplication signature to prevent concurrent duplicate generation
    const currentKey = `${rawUrls.length}:${rawUrls.map((u) => u.length + '_' + u.slice(-15)).join(':')}`;

    if (this.cachedResult && this.cachedKey === currentKey) {
      return Promise.resolve(this.cachedResult);
    }

    if (this.inFlightPromise && this.inFlightKey === currentKey) {
      return this.inFlightPromise;
    }

    this.inFlightKey = currentKey;
    this.inFlightPromise = this.doGenerate(rawUrls, options)
      .then((result) => {
        if (result) {
          this.cachedResult = result;
          this.cachedKey = currentKey;
        }
        return result;
      })
      .finally(() => {
        this.inFlightPromise = null;
        this.inFlightKey = null;
      });

    return this.inFlightPromise;
  }

  private static async doGenerate(
    rawUrls: string[],
    options?: BoomerangOptions
  ): Promise<BoomerangResult | null> {
    const targetWidth = Math.max(100, options?.targetWidth || 600);
    const delay = options?.delay || 400; // ~400ms per frame
    const watermarkText = options?.watermarkText || 'sesijepret';
    const brandColor = options?.brandColor || '#E6007A';

    // 1. Load all source pose images
    const loadedImages: HTMLImageElement[] = [];
    for (const url of rawUrls) {
      try {
        const img = await loadImage(url);
        loadedImages.push(img);
      } catch (err) {
        console.warn('[BoomerangGenerator] Gagal memuat frame:', err);
      }
    }

    if (loadedImages.length === 0) {
      return null;
    }

    // 2. Compute Ping-Pong frame sequence
    // Example with 4 poses: [0, 1, 2, 3, 2, 1]
    const n = loadedImages.length;
    const sequenceIndices: number[] = [];

    if (n === 1) {
      sequenceIndices.push(0);
    } else if (n === 2) {
      sequenceIndices.push(0, 1);
    } else {
      // Forward: 0 to n - 1
      for (let i = 0; i < n; i++) {
        sequenceIndices.push(i);
      }
      // Backward: n - 2 down to 1
      for (let i = n - 2; i > 0; i--) {
        sequenceIndices.push(i);
      }
    }

    // 3. Calculate output dimensions based on first image's aspect ratio
    const firstImg = loadedImages[0];
    const firstW = firstImg.naturalWidth > 0 ? firstImg.naturalWidth : targetWidth;
    const firstH = firstImg.naturalHeight > 0 ? firstImg.naturalHeight : Math.round(targetWidth * (4 / 3));
    const aspectRatio = firstH / firstW;
    const rawHeight = Math.round(targetWidth * aspectRatio);
    // Ensure height is an even number >= 2 for encoder compatibility
    const targetHeight = Math.max(2, rawHeight % 2 === 0 ? rawHeight : rawHeight + 1);

    // 4. Initialize Canvas
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('Canvas 2D context tidak tersedia.');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // 5. Precompute Watermark Badge layout
    const paddingX = 12;
    const pillHeight = 28;
    const iconSize = 16;
    const gap = 7;
    const margin = 16;
    const radius = pillHeight / 2;

    ctx.font = "700 12.5px 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    const textWidth = ctx.measureText(watermarkText).width;
    const contentWidth = iconSize + gap + textWidth;
    const pillWidth = paddingX * 2 + contentWidth;

    const pillX = targetWidth - margin - pillWidth;
    const pillY = targetHeight - margin - pillHeight;

    // 6. Initialize GIF Encoder
    const gif = GIFEncoder();

    try {
      // 7. Process each frame in ping-pong sequence
      for (let frameIdx = 0; frameIdx < sequenceIndices.length; frameIdx++) {
        const img = loadedImages[sequenceIndices[frameIdx]];

        // Clear canvas
        ctx.clearRect(0, 0, targetWidth, targetHeight);

        // Aspect-ratio preserving center crop (cover)
        const imgW = img.naturalWidth > 0 ? img.naturalWidth : targetWidth;
        const imgH = img.naturalHeight > 0 ? img.naturalHeight : targetHeight;
        const imgRatio = imgW / imgH;
        const targetRatio = targetWidth / targetHeight;

        let sx = 0;
        let sy = 0;
        let sWidth = imgW;
        let sHeight = imgH;

        if (imgRatio > targetRatio) {
          sWidth = Math.round(imgH * targetRatio);
          sx = Math.round((imgW - sWidth) / 2);
        } else if (imgRatio < targetRatio) {
          sHeight = Math.round(imgW / targetRatio);
          sy = Math.round((imgH - sHeight) / 2);
        }

        ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, targetWidth, targetHeight);

        // Draw aesthetic dark pill watermark badge in bottom right
        ctx.save();
        ctx.fillStyle = 'rgba(12, 12, 12, 0.72)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.lineWidth = 1;
        drawRoundedRect(ctx, pillX, pillY, pillWidth, pillHeight, radius);
        ctx.fill();
        ctx.stroke();

        // Render camera brand icon
        let currentX = pillX + paddingX;
        drawCameraIcon(ctx, currentX, pillY + (pillHeight - 14) / 2, iconSize, brandColor);
        currentX += iconSize + gap;

        // Render watermark text
        ctx.fillStyle = '#FFFFFF';
        ctx.font = "700 12.5px 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.textBaseline = 'middle';
        ctx.fillText(watermarkText, currentX, pillY + pillHeight / 2 + 0.5);
        ctx.restore();

        // Extract frame RGBA pixel data
        const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
        const rgba = imageData.data;

        // Quantize colors to 256 RGB565 palette
        const palette = quantize(rgba, 256, { format: 'rgb565' });
        const indexed = applyPalette(rgba, palette, 'rgb565');

        // Write frame into GIF stream (repeat: 0 = loop forever)
        gif.writeFrame(indexed, targetWidth, targetHeight, {
          palette,
          delay,
          repeat: 0,
        });

        // Yield to event loop to avoid UI freezing
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      // 8. Finish GIF encoding
      gif.finish();
      const bytes = gif.bytes();
      const blob = new Blob([new Uint8Array(bytes)], { type: 'image/gif' });
      const blobUrl = URL.createObjectURL(blob);
      const base64 = await blobToBase64(blob);

      console.log(
        `[BoomerangGenerator] ✅ Boomerang GIF berhasil dibuat: ${sequenceIndices.length} frames, ${(bytes.byteLength / 1024).toFixed(1)} KB`
      );

      return {
        blob,
        blobUrl,
        base64,
        sizeBytes: bytes.byteLength,
      };
    } finally {
      // Reclaim canvas GPU buffer memory
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}
