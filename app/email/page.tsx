'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import PrimaryButton from '@/components/ui/PrimaryButton';
import SecondaryButton from '@/components/ui/SecondaryButton';
import PageTitle from '@/components/ui/PageTitle';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import EmailSuccessDialog from '@/components/dialogs/EmailSuccessDialog';
import EmailErrorDialog from '@/components/dialogs/EmailErrorDialog';
import { ArrowLeft, Mail, Send } from 'lucide-react';
import { useSessionStore } from '@/store/session_store';
import { useEmailSend } from '@/hooks/useEmailSend';
import { TemplateService } from '@/services/template_service';
import { StorageService } from '@/services/storage_service';
import { PhotoComposer } from '@/utils/photo_composer';
import { SessionRepository } from '@/repositories/session_repository';
import { TemplateModel } from '@/models/template_model';
import { isValidEmail } from '@/utils/validators';
import toast from 'react-hot-toast';

const templateService = new TemplateService();
const storageService = new StorageService();
const sessionRepository = new SessionRepository();

export default function EmailPage() {
  const router = useRouter();
  const {
    sessionId,
    selectedTemplateId,
    capturedPhotos,
    uploadedPhotoUrl,
    setUploadedPhotoUrl,
    composedPhotoBase64,
    setComposedPhotoBase64,
    setComposedPhotoBlobUrl,
    email: storeEmail,
  } = useSessionStore();

  const { sendEmail, loading: sending, success, error, setSuccess, setError } = useEmailSend();

  const [emailInput, setEmailInput] = useState(storeEmail || '');
  const [preparing, setPreparing] = useState(false);
  const [prepError, setPrepError] = useState<string | null>(null);

  // Helper untuk upload ke Cloud & simpan lokal di latar belakang tanpa memblokir layar
  const triggerBackgroundUpload = async (base64: string, existingBytes?: Uint8Array) => {
    if (!sessionId) return;
    try {
      let bytes = existingBytes;
      if (!bytes) {
        const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
        const binaryStr = atob(base64Data);
        bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
      }

      // 1. Simpan ke IndexedDB lokal (non-fatal)
      try {
        await storageService.saveToLocalStorage({ sessionId, imageBytes: bytes });
      } catch (localErr) {
        console.warn('[EmailPage] Local save gagal (non-fatal):', localErr);
      }

      // 2. Upload ke Firebase Storage di background (non-fatal)
      const downloadUrl = await storageService.uploadComposedPhoto({
        sessionId,
        imageBytes: bytes,
      });
      setUploadedPhotoUrl(downloadUrl);

      // 3. Update stage di Firestore (non-fatal)
      try {
        await sessionRepository.updateStage(sessionId, 'PHOTO_COMPOSED');
      } catch (firestoreErr) {
        console.warn('[EmailPage] Firestore updateStage gagal (non-fatal):', firestoreErr);
      }
    } catch (err) {
      console.warn('[EmailPage] Background cloud upload gagal (non-fatal):', err);
    }
  };

  // Persiapkan foto jika belum ada di memori
  useEffect(() => {
    const preparePhoto = async () => {
      if (!sessionId) {
        toast.error('Sesi tidak ditemukan. Kembali ke awal.');
        router.replace('/');
        return;
      }

      // Kasus 1: Sudah di-compose di halaman Edit Photo (Alur Utama - Instan 0 Detik)
      if (composedPhotoBase64) {
        if (!uploadedPhotoUrl) {
          triggerBackgroundUpload(composedPhotoBase64);
        }
        return;
      }

      // Kasus 2: Cek apakah ada di cache IndexedDB lokal (misal setelah refresh)
      try {
        const localBlob = await storageService.getLatestLocalPhoto(sessionId);
        if (localBlob) {
          const objUrl = URL.createObjectURL(localBlob);
          setComposedPhotoBlobUrl(objUrl);
          const base64String = await PhotoComposer.blobToBase64(localBlob);
          setComposedPhotoBase64(base64String);
          if (!uploadedPhotoUrl) {
            triggerBackgroundUpload(base64String);
          }
          return;
        }
      } catch (idbErr) {
        console.warn('[EmailPage] Gagal memulihkan foto dari IndexedDB:', idbErr);
      }

      // Kasus 3: Fallback compose jika belum ada di memori atau IndexedDB
      if (capturedPhotos.length === 0) {
        toast.error('Tidak ada foto yang ditemukan.');
        router.replace('/camera');
        return;
      }

      setPreparing(true);
      setPrepError(null);

      try {
        // ── 1. Ambil template & layout ──────────────────────────────────────
        const templates = await templateService.getActiveTemplates();
        const activeTemplate =
          templates.find((t) => t.id === selectedTemplateId) ||
          templates[0] ||
          TemplateModel.localTemplates[0];
        const layout = await templateService.getTemplateLayout(activeTemplate.id);

        // ── 2. Compose menjadi PNG final ────────────────────────────────────
        const blob = await PhotoComposer.compose({
          template: activeTemplate,
          layout,
          photos: capturedPhotos,
          fallbackColor: '#000000',
        });

        // ── 3. Simpan ke state memori agar UI langsung bisa dipakai ─────────
        const objectUrl = URL.createObjectURL(blob);
        setComposedPhotoBlobUrl(objectUrl);

        const base64String = await PhotoComposer.blobToBase64(blob);
        setComposedPhotoBase64(base64String);

        // UI langsung dibuka (tidak menunggu upload cloud selesai)
        setPreparing(false);

        // ── 4. Upload cloud & IndexedDB di latar belakang ───────────────────
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        triggerBackgroundUpload(base64String, bytes);
      } catch (e: any) {
        console.error('[EmailPage] Gagal compose foto:', e);
        setPrepError(e.message || 'Gagal memproses foto.');
        toast.error('Gagal mempersiapkan foto.');
        setPreparing(false);
      }
    };

    preparePhoto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, composedPhotoBase64]);

  const handleSendEmail = async () => {
    if (!isValidEmail(emailInput)) {
      toast.error('Masukkan alamat email yang valid.');
      return;
    }
    await sendEmail(emailInput);
  };

  // Setelah email sukses → langsung ke halaman Print
  const handleSuccessConfirm = () => {
    setSuccess(false);
    router.push('/print');
  };

  const handleSkip = () => {
    router.push('/print');
  };

  const handleRetryPrep = () => {
    setUploadedPhotoUrl(null);
    setComposedPhotoBase64(null);
    setComposedPhotoBlobUrl(null);
  };

  return (
    <MainLayout step={6} footerHint="Foto strip dan seluruh foto pose asli akan dikirim ke email Anda">
      <div className="w-full max-w-md mx-auto flex flex-col items-center gap-8">
        <PageTitle
          title="Kirim ke Email"
          subtitle="Masukkan email Anda untuk menerima foto strip dan seluruh foto pose asli (tanpa frame)."
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="w-full rounded-2xl p-8 border border-gray-200 bg-white shadow-md flex flex-col items-center gap-6"
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(230,0,122,0.12)', border: '1px solid rgba(230,0,122,0.25)' }}
          >
            <Mail size={28} className="text-[#E6007A]" />
          </div>

          {prepError ? (
            <div className="w-full text-center space-y-3">
              <p className="text-sm text-red-400 font-medium">Gagal mempersiapkan foto hasil akhir.</p>
              <button
                onClick={handleRetryPrep}
                className="text-xs text-[#E6007A] hover:underline font-semibold"
              >
                Coba Lagi
              </button>
            </div>
          ) : (
            <div className="w-full flex flex-col gap-2">
              <label htmlFor="email-input" className="text-xs text-black/60 font-semibold uppercase tracking-wider">
                Alamat Email
              </label>
              <input
                id="email-input"
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="contoh@email.com"
                disabled={preparing || sending}
                className="w-full text-base bg-transparent border-b-2 border-gray-300 focus:border-[#E83E8C] text-black placeholder:text-black/30 outline-none pb-2 transition-colors duration-200"
              />
            </div>
          )}

          <PrimaryButton
            id="send-email-btn"
            size="lg"
            fullWidth
            disabled={!isValidEmail(emailInput) || preparing || sending || (!uploadedPhotoUrl && !composedPhotoBase64)}
            onClick={handleSendEmail}
            loading={sending}
          >
            <Send size={16} />
            {sending ? 'Mengirim...' : 'KIRIM FOTO'}
          </PrimaryButton>
        </motion.div>

        <div className="flex items-center gap-4">
          <Link href="/edit-photo">
            <SecondaryButton size="sm">
              <ArrowLeft size={15} />
              Kembali
            </SecondaryButton>
          </Link>
          <button onClick={handleSkip} className="px-4 py-2 text-sm font-semibold text-black/50 hover:text-black hover:bg-gray-100 rounded-xl transition-all">
            Lewati
          </button>
        </div>
      </div>

      {/* Loading overlay untuk proses compose */}
      <LoadingOverlay visible={preparing} message="Memproses foto hasil akhir..." />

      {/* Success Dialog */}
      <EmailSuccessDialog open={success} email={emailInput} onConfirm={handleSuccessConfirm} />

      {/* Error Dialog */}
      <EmailErrorDialog
        open={!!error}
        error={error || ''}
        onRetry={() => {
          setError(null);
          handleSendEmail();
        }}
        onSkip={() => {
          setError(null);
          handleSkip();
        }}
      />
    </MainLayout>
  );
}
