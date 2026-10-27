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

export class BoomerangGenerator {
  /**
   * Generates a Boomerang Ping-Pong GIF from an array of photo data URLs.
   * Frame sequence: P1 -> P2 -> ... -> Pn -> P(n-1) -> ... -> P2 (looping).
   *
   * @param photoDataUrls Array of base64 data URLs or objects with dataUrl property
   * @param options Customization options (targetWidth, delay, watermarkText, logoUrl)
   */
  static async generateBoomerang(
    photoDataUrls: Array<string | { dataUrl: string }>,
    options?: BoomerangOptions
  ): Promise<BoomerangResult | null> {
    if (typeof window === 'undefined') {
      return null;
    }

    const rawUrls = photoDataUrls
      .map((item) => (typeof item === 'string' ? item : item.dataUrl))
      .filter((url): url is string => Boolean(url && url.length > 0));

    if (rawUrls.length === 0) {
      return null;
    }

    const targetWidth = options?.targetWidth || 600;
    const delay = options?.delay || 400; // ~400ms per frame
    const watermarkText = options?.watermarkText || 'sesijepret';
    const logoUrl = options?.logoUrl || '/assets/logo/logo.png';

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

    // 2. Try loading watermark logo image
    let logoImg: HTMLImageElement | null = null;
    try {
      logoImg = await loadImage(logoUrl);
    } catch {
      logoImg = null;
    }

    // 3. Compute Ping-Pong frame sequence
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

    // 4. Calculate output dimensions based on first image's aspect ratio
    const firstImg = loadedImages[0];
    const aspectRatio = firstImg.naturalHeight / (firstImg.naturalWidth || 1);
    const rawHeight = Math.round(targetWidth * aspectRatio);
    // Ensure height is an even number for optimal encoder compatibility
    const targetHeight = rawHeight % 2 === 0 ? rawHeight : rawHeight + 1;

    // 5. Initialize Canvas
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('Canvas 2D context tidak tersedia.');
    }

    // 6. Precompute Watermark Badge layout
    const paddingX = 12;
    const pillHeight = 28;
    const logoSize = 18;
    const gap = 6;
    const margin = 16;
    const radius = pillHeight / 2;

    ctx.font = "600 12.5px 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    const textWidth = ctx.measureText(watermarkText).width;
    const contentWidth = (logoImg ? logoSize + gap : 0) + textWidth;
    const pillWidth = paddingX * 2 + contentWidth;

    const pillX = targetWidth - margin - pillWidth;
    const pillY = targetHeight - margin - pillHeight;

    // 7. Initialize GIF Encoder
    const gif = GIFEncoder();

    // 8. Process each frame in ping-pong sequence
    for (let frameIdx = 0; frameIdx < sequenceIndices.length; frameIdx++) {
      const img = loadedImages[sequenceIndices[frameIdx]];

      // Clear & Draw frame photo
      ctx.clearRect(0, 0, targetWidth, targetHeight);
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      // Draw aesthetic dark pill watermark in bottom right
      ctx.save();
      ctx.fillStyle = 'rgba(15, 15, 15, 0.65)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      drawRoundedRect(ctx, pillX, pillY, pillWidth, pillHeight, radius);
      ctx.fill();
      ctx.stroke();

      // Render logo if available
      let currentX = pillX + paddingX;
      if (logoImg) {
        ctx.drawImage(
          logoImg,
          currentX,
          pillY + (pillHeight - logoSize) / 2,
          logoSize,
          logoSize
        );
        currentX += logoSize + gap;
      }

      // Render watermark text
      ctx.fillStyle = '#FFFFFF';
      ctx.font = "600 12.5px 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.textBaseline = 'middle';
      ctx.fillText(watermarkText, currentX, pillY + pillHeight / 2);
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

    // 9. Finish GIF encoding
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
  }
}
