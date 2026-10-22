/**
 * Webcam fallback client for SesiJepret camera page.
 *
 * When the Canon EOS M50 bridge is not running, this module provides live
 * preview and capture using the browser's built-in getUserMedia API with the
 * laptop webcam.
 */

export class WebcamClient {
  private stream: MediaStream | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private canvasEl: HTMLCanvasElement | null = null;

  /** Request webcam access and start streaming. */
  async start(): Promise<HTMLVideoElement> {
    if (this.videoEl && this.stream) return this.videoEl;

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });

    const video = document.createElement('video');
    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    video.muted = true;
    await video.play();

    this.stream = stream;
    this.videoEl = video;
    this.canvasEl = document.createElement('canvas');

    return video;
  }

  /** Return a JPEG blob captured from the current video frame. */
  capture(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.videoEl || !this.canvasEl) {
        reject(new Error('Webcam belum dimulai.'));
        return;
      }
      const video = this.videoEl;
      const canvas = this.canvasEl;
      canvas.width = video.videoWidth || 1920;
      canvas.height = video.videoHeight || 1080;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Gagal membuat canvas context.'));
        return;
      }
      // Mirror the image horizontally for front camera
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Gagal mengambil foto dari webcam.'));
        },
        'image/jpeg',
        0.92
      );
    });
  }

  /** Stop the webcam stream and release resources. */
  stop(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.videoEl) {
      this.videoEl.srcObject = null;
      this.videoEl = null;
    }
    this.canvasEl = null;
  }

  /** Check whether the webcam stream is active. */
  get isActive(): boolean {
    return !!(this.stream && this.stream.active);
  }
}
