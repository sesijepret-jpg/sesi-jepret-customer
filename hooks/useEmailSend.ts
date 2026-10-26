import { useState } from 'react';
import { useSessionStore } from '../store/session_store';
import { EmailService } from '../services/email_service';
import { SessionRepository } from '../repositories/session_repository';
import { PhotoComposer } from '../utils/photo_composer';
import { withRetry } from '../utils/firestore_helpers';
import toast from 'react-hot-toast';

const emailService = new EmailService();
const sessionRepository = new SessionRepository();

/**
 * Konversi blob: URL atau http: URL ke base64 data URL.
 * Diperlukan agar /api/send-email bisa menerima foto tanpa
 * harus mengakses Firebase Storage dari sisi server.
 */
async function resolvePhotoBase64(photoUrl: string): Promise<string | undefined> {
  try {
    // Jika sudah data URL, langsung kembalikan
    if (photoUrl.startsWith('data:')) return photoUrl;

    const response = await fetch(photoUrl);
    if (!response.ok) return undefined;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn('[useEmailSend] Gagal konversi foto ke base64:', e);
    return undefined;
  }
}

export function useEmailSend() {
  const { sessionId, uploadedPhotoUrl, composedPhotoBase64, capturedPhotos, setEmail } = useSessionStore();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendEmail = async (targetEmail: string) => {
    if (!targetEmail || !targetEmail.includes('@')) {
      toast.error('Format email tidak valid.');
      return;
    }

    if (!sessionId || (!uploadedPhotoUrl && !composedPhotoBase64)) {
      toast.error('Sesi aktif atau foto hasil akhir tidak ditemukan.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      // Simpan email ke Zustand store agar tersedia lintas halaman
      setEmail(targetEmail);

      // Konversi foto ke base64 terlebih dahulu (sekali saja, sebelum retry)
      // Ini menghindari masalah fetch Firebase Storage dari server-side
      let photoBase64 = composedPhotoBase64;
      if (!photoBase64 && uploadedPhotoUrl) {
        photoBase64 = await resolvePhotoBase64(uploadedPhotoUrl) || null;
      }

      if (!photoBase64) {
        console.warn('[useEmailSend] Tidak bisa konversi foto ke base64, akan coba via photo_url.');
      }

      // Siapkan foto-foto pose asli terkompresi (web-optimized 1600px ~250KB per foto)
      let compressedRawPhotos: string[] = [];
      if (capturedPhotos && capturedPhotos.length > 0) {
        try {
          const promises = capturedPhotos.map((photo) =>
            PhotoComposer.compressForEmail(photo.dataUrl, 1600, 0.8)
          );
          compressedRawPhotos = await Promise.all(promises);
        } catch (compErr) {
          console.warn('[useEmailSend] Gagal kompres raw photos:', compErr);
        }
      }

      // Kirim email dengan maksimal 3 kali percobaan
      await withRetry(
        async () => {
          const successResult = await emailService.sendPhotoEmail({
            email: targetEmail,
            photoUrl: uploadedPhotoUrl || '',
            sessionId: sessionId,
            photoBase64: photoBase64 ?? undefined,
            rawPhotos: compressedRawPhotos,
          });

          if (!successResult) {
            throw new Error('Server mengembalikan status tidak berhasil.');
          }
        },
        3,
        '[EmailSend]'
      );

      // Simpan status ke Firestore: email, stage EMAIL_SENT, dan timestamp
      try {
        await sessionRepository.markEmailSent(sessionId, targetEmail);
      } catch (firestoreErr) {
        // Non-fatal: email sudah terkirim, Firestore update gagal tidak membatalkan sesi
        console.warn('[useEmailSend] Firestore markEmailSent gagal (non-fatal):', firestoreErr);
      }

      setSuccess(true);
      toast.success('Email berhasil dikirim!');
    } catch (e: unknown) {
      const errMsg =
        e instanceof Error
          ? e.message
          : 'Gagal mengirim email setelah 3 kali percobaan.';
      setError(errMsg);
      toast.error('Email gagal dikirim.');
    } finally {
      setLoading(false);
    }
  };

  return { sendEmail, loading, success, error, setSuccess, setError };
}
