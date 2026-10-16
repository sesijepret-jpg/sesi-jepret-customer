'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import PrimaryButton from '@/components/ui/PrimaryButton';
import SecondaryButton from '@/components/ui/SecondaryButton';
import PageTitle from '@/components/ui/PageTitle';
import Typography from '@/components/ui/Typography';
import { ArrowLeft, Image as ImageIcon, RefreshCcw } from 'lucide-react';

import { useSessionStore } from '@/store/session_store';
import { SessionRepository } from '@/repositories/session_repository';
import { useSessionTimer, formatTime } from '@/hooks/useSessionTimer';

interface PhotoSlot {
  id: string;
  dataUrl: string;
}

const sessionRepository = new SessionRepository();

export default function PreviewPage() {
  const router = useRouter();
  const [photoSlots, setPhotoSlots] = useState<PhotoSlot[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [slotCount, setSlotCount] = useState<number>(3);
  const [isReady, setIsReady] = useState(false);

  const sessionId = useSessionStore((state) => state.sessionId);
  const storePhotos = useSessionStore((state) => state.capturedPhotos);
  const storeTemplateName = useSessionStore((state) => state.selectedTemplateName);
  const composedPhotoBlobUrl = useSessionStore((state) => state.composedPhotoBlobUrl);
  const composedPhotoBase64 = useSessionStore((state) => state.composedPhotoBase64);

  const sessionTimeLeft = useSessionTimer(false, () => {
    router.push('/edit-photo');
  });

  useEffect(() => {
    // Gunakan murni Zustand store dalam-memori untuk menghindari QuotaExceededError
    if (storePhotos && storePhotos.length > 0) {
      setPhotoSlots(storePhotos);
    } else {
      setPhotoSlots([]);
    }

    const savedTemplate = sessionStorage.getItem('boro_selected_template');
    if (savedTemplate) {
      try {
        const parsed = JSON.parse(savedTemplate);
        if (parsed.name) {
          setSelectedTemplate(parsed.name);
        } else if (storeTemplateName) {
          setSelectedTemplate(storeTemplateName);
        }
        if (parsed.photoCount) {
          setSlotCount(Number(parsed.photoCount));
        }
      } catch {
        setSelectedTemplate(storeTemplateName || null);
      }
    } else if (storeTemplateName) {
      setSelectedTemplate(storeTemplateName);
    }

    setIsReady(true);
  }, [storePhotos, storeTemplateName]);

  useEffect(() => {
    if (isReady && photoSlots.length === 0) {
      router.replace('/camera');
    }
  }, [isReady, photoSlots.length, router]);

  const expectedCount = Math.max(slotCount, photoSlots.length, 1);

  const slotRows = useMemo(
    () => Array.from({ length: expectedCount }, (_, index) => photoSlots[index] ?? null),
    [photoSlots, expectedCount]
  );

  const hasPhotos = photoSlots.length > 0;

  // Gunakan PNG final jika sudah di-compose, fallback ke grid individual
  const composedUrl = composedPhotoBlobUrl || composedPhotoBase64 || null;

  const handleRetakeAll = async () => {
    useSessionStore.getState().setCapturedPhotos([]);
    useSessionStore.getState().setComposedPhotoBase64(null);
    useSessionStore.getState().setComposedPhotoBlobUrl(null);
    useSessionStore.getState().setUploadedPhotoUrl(null);

    if (sessionId) {
      try {
        await sessionRepository.updatePhotoCount({ sessionId, photoCount: 0 });
        await sessionRepository.updateStage(sessionId, 'STARTED');
      } catch (e) {
        console.error('Failed to reset photo count in Firestore:', e);
      }
    }

    router.push('/camera');
  };

  const timerElement = (
    <div className="flex items-center justify-center rounded-full bg-red-50 px-3 py-1 border border-red-100 ml-2">
      <Typography variant="label" className="text-red-600 font-bold tracking-widest text-sm">
        {formatTime(sessionTimeLeft)}
      </Typography>
    </div>
  );

  return (
    <MainLayout step={5} footerHint="Periksa hasil foto Anda sebelum melanjutkan" headerLeftElement={timerElement}>
      <div className="w-full h-full flex flex-col gap-6 max-w-6xl mx-auto px-4 py-6">
        <PageTitle
          title="Preview Foto"
          subtitle="Periksa hasil jepretan dan pilih langkah berikutnya."
        />

        <div className="grid gap-6 lg:grid-cols-[2.25fr_1fr]">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="rounded-[28px] border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Typography variant="label" className="text-black/50 uppercase tracking-[0.28em]">
                  Preview Foto
                </Typography>
                <Typography variant="body" className="mt-2 text-black/70">
                  {selectedTemplate
                    ? `Template aktif: ${selectedTemplate}`
                    : 'Template tidak ditemukan. Kembali ke template untuk memilih ulang.'}
                </Typography>
              </div>
              <div className="rounded-full border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-black/70">
                {photoSlots.length} / {expectedCount}
              </div>
            </div>

            {/* Tampilkan PNG final jika sudah tersedia, atau grid foto individual */}
            {composedUrl ? (
              <div className="flex justify-center">
                <img
                  src={composedUrl}
                  alt="Hasil Foto Final"
                  className="max-w-full rounded-[16px] border border-gray-200 shadow-sm"
                  style={{ maxHeight: '70vh', objectFit: 'contain' }}
                />
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {slotRows.map((slot, index) => (
                  <div
                    key={index}
                    className="aspect-square overflow-hidden rounded-[24px] border border-gray-200 bg-gray-50 flex items-center justify-center shadow-inner"
                  >
                    {slot ? (
                      <img src={slot.dataUrl} alt={`Foto ${index + 1}`} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2 text-black/30 text-center px-3">
                        <ImageIcon size={24} />
                        <p className="text-[11px]">Slot {index + 1}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.1 }}
            className="rounded-[28px] border border-gray-200 bg-white p-5 flex flex-col justify-between shadow-sm"
          >
            <div className="space-y-4">
              <Typography variant="label" className="text-black/50 uppercase tracking-[0.28em]">
                Langkah berikutnya
              </Typography>
              <Typography variant="body" className="text-black/70 leading-relaxed">
                Kirim foto ke email atau cetak hasilnya langsung. Atau ambil ulang semua foto jika ingin hasil baru.
              </Typography>
            </div>

            <div className="space-y-3">
              <Link href="/edit-photo">
                <PrimaryButton size="md" fullWidth disabled={!hasPhotos}>
                  Lanjut ke Edit Foto
                </PrimaryButton>
              </Link>

              <Link href="/camera">
                <SecondaryButton size="sm" fullWidth>
                  <ArrowLeft size={14} />
                  Foto Ulang
                </SecondaryButton>
              </Link>

              <button
                type="button"
                onClick={handleRetakeAll}
                disabled={!hasPhotos}
                className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-black/80 hover:bg-gray-100 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCcw size={16} className="inline-block mr-2" />
                Ambil ulang semua foto
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </MainLayout>
  );
}
