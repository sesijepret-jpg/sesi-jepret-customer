/**
 * EmailService
 *
 * Di mode development (lokal), langsung panggil Next.js API route /api/send-email
 * dengan foto dikirim sebagai base64 — tidak memerlukan Firebase Functions Emulator
 * maupun Firebase Storage yang aktif.
 *
 * Di mode production, coba Firebase Cloud Function terlebih dahulu,
 * lalu fallback ke API route jika gagal.
 */
import { AppConstants } from '../constants/app_constants';

export class EmailService {
  /**
   * Konversi URL (bisa berupa Firebase Storage URL atau blob: URL)
   * menjadi base64 data URL agar bisa dikirim ke server tanpa masalah CORS/auth.
   */
  private async urlToBase64(url: string): Promise<string | null> {
    try {
      // Jika sudah berupa data URL, kembalikan langsung
      if (url.startsWith('data:')) return url;

      const response = await fetch(url);
      if (!response.ok) return null;
      const blob = await response.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  }

  /**
   * Send photo via email.
   *
   * Strategy:
   * - Development: langsung ke /api/send-email dengan photo_base64
   * - Production: coba Firebase Cloud Function, fallback ke /api/send-email
   */
  async sendPhotoEmail(params: {
    email: string;
    photoUrl: string;
    sessionId: string;
    recipientName?: string;
    /** Data base64 foto (opsional, prioritas utama jika disediakan) */
    photoBase64?: string;
    /** Foto-foto pose asli tanpa bingkai (base64 data URL) */
    rawPhotos?: string[];
    /** Boomerang Ping-Pong GIF (base64 data URL) */
    boomerangGifBase64?: string;
  }): Promise<boolean> {
    const { email, photoUrl, sessionId, recipientName, photoBase64, rawPhotos, boomerangGifBase64 } = params;
    const isDev = process.env.NODE_ENV === 'development';

    // ── Persiapkan base64 foto ──────────────────────────────────────────────
    // Gunakan base64 yang sudah disiapkan, atau convert dari URL
    let base64: string | null = photoBase64 || null;

    if (!base64) {
      console.log('[EmailService] Converting photo URL to base64...');
      base64 = await this.urlToBase64(photoUrl);
      if (!base64) {
        console.warn('[EmailService] Gagal konversi URL ke base64, akan coba foto_url langsung.');
      }
    }

    // ── Jika ada rawPhotos / boomerangGifBase64 atau mode development: langsung ke API route ───
    // API route /api/send-email mendukung pengiriman multi-lampiran (strip + pose asli + boomerang GIF)
    if (isDev || (rawPhotos && rawPhotos.length > 0) || boomerangGifBase64) {
      console.log('[EmailService] Mengirim via /api/send-email (mendukung multi-lampiran foto pose asli & boomerang GIF)');
      return this._callApiRoute({ email, photoUrl, photoBase64: base64 ?? undefined, rawPhotos, boomerangGifBase64, sessionId, recipientName });
    }

    // ── Mode production tanpa rawPhotos & boomerang: coba Firebase Cloud Function dulu ──
    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { default: app } = await import('../lib/firebase');
      const functions = getFunctions(app);
      const sendEmailCallable = httpsCallable<{
        email: string;
        photo_url: string;
        session_id: string;
        recipient_name: string;
      }, { success?: boolean }>(functions, AppConstants.funcSendEmail);

      const result = await sendEmailCallable({
        email,
        photo_url: photoUrl,
        session_id: sessionId,
        recipient_name: recipientName || 'Pelanggan Sesijepret',
      });
      return result.data.success === true;
    } catch (e: any) {
      console.warn('[EmailService] Cloud Function gagal, fallback ke API route:', e?.message);
      return this._callApiRoute({ email, photoUrl, photoBase64: base64 ?? undefined, rawPhotos, boomerangGifBase64, sessionId, recipientName });
    }
  }

  /** Panggil /api/send-email dengan photo_base64 atau photo_url sebagai fallback */
  private async _callApiRoute(params: {
    email: string;
    photoUrl: string;
    photoBase64?: string;
    rawPhotos?: string[];
    boomerangGifBase64?: string;
    sessionId: string;
    recipientName?: string;
  }): Promise<boolean> {
    const { email, photoUrl, photoBase64, rawPhotos, boomerangGifBase64, sessionId, recipientName } = params;

    const body: Record<string, any> = {
      email,
      session_id: sessionId,
      recipient_name: recipientName || 'Pelanggan Sesijepret',
    };

    if (photoBase64) {
      body.photo_base64 = photoBase64;
    } else {
      body.photo_url = photoUrl;
    }

    if (rawPhotos && rawPhotos.length > 0) {
      body.raw_photos = rawPhotos;
    }

    if (boomerangGifBase64) {
      body.boomerang_gif_base64 = boomerangGifBase64;
    }

    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      const resData = await response.json();
      return resData.success === true;
    } else {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Server returned status ${response.status}`);
    }
  }
}
