'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import PrimaryButton from '@/components/ui/PrimaryButton';
import SecondaryButton from '@/components/ui/SecondaryButton';
import PageTitle from '@/components/ui/PageTitle';
import Card from '@/components/ui/Card';
import Typography from '@/components/ui/Typography';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import { ArrowLeft, Sparkles, Check, RefreshCcw, AlertTriangle } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { useSessionStore } from '@/store/session_store';
import { SessionRepository } from '@/repositories/session_repository';
import { TemplateService } from '@/services/template_service';
import { StorageService } from '@/services/storage_service';
import { TemplateModel } from '@/models/template_model';
import { LayoutModel } from '@/models/layout_model';
import { PhotoComposer } from '@/utils/photo_composer';
import { BoomerangGenerator } from '@/utils/boomerang_generator';
import toast from 'react-hot-toast';
import { useSessionTimer } from '@/hooks/useSessionTimer';

interface PhotoSlot {
  id: string;
  dataUrl: string;
}

const sessionRepository = new SessionRepository();
const storageService = new StorageService();

const FILTERS = [
  { id: 'none', name: 'Original', class: '', filterVal: 'none' },
  { id: 'bw', name: 'B&W', class: 'grayscale', filterVal: 'grayscale(1)' },
  { id: 'vintage', name: 'Vintage', class: 'sepia', filterVal: 'sepia(0.85) contrast(0.95)' },
  { id: 'warm', name: 'Retro Warm', class: 'sepia-[0.35] saturate-[1.25]', filterVal: 'sepia(0.3) saturate(1.2) contrast(1.05)' },
];

export default function EditPhotoPage() {
  const router = useRouter();
  const {
    sessionId,
    capturedPhotos,
    setCapturedPhotos,
    setComposedPhotoBase64,
    setComposedPhotoBlobUrl,
  } = useSessionStore();
  const [selectedFilter, setSelectedFilter] = useState('none');
  const [processing, setProcessing] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [template, setTemplate] = useState<TemplateModel | null>(null);
  const [layout, setLayout] = useState<LayoutModel | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [showRetakeModal, setShowRetakeModal] = useState(false);
  const [isRetaking, setIsRetaking] = useState(false);

  // Simpan blob dan filter hasil render terbaru untuk dipakai langsung saat 'Lanjut' (0 detik loading)
  const latestBlobRef = useRef<Blob | null>(null);
  const latestFilterRef = useRef<string>('none');

  // Hentikan timer ketika masuk halaman edit
  useSessionTimer(true);

  // Blokir navigasi kembali
  useEffect(() => {
    window.history.pushState(null, '', window.location.href);
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
      toast.error('Anda tidak dapat kembali ke halaman sebelumnya.');
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    if (!sessionId) {
      toast.error('Sesi tidak ditemukan.');
      router.replace('/');
      return;
    }
    if (capturedPhotos.length === 0) {
      toast.error('Belum ada foto yang diambil.');
      router.replace('/camera');
      return;
    }
    setIsReady(true);

    const selected = sessionStorage.getItem('boro_selected_template');
    if (selected) {
      try {
        const parsed = JSON.parse(selected);
        const tplService = new TemplateService();
        tplService.getActiveTemplates().then((tpls) => {
          const found = tpls.find((t) => t.id === parsed.id);
          if (found) setTemplate(found);
        });
        tplService.getTemplateLayout(parsed.id).then((lay) => setLayout(lay));
      } catch (e) {
        console.error('Failed to load template info', e);
      }
    }
  }, [sessionId, capturedPhotos, router]);

  // Apply CSS filters on a canvas to bake them into the image dataUrls
  const applyFilterToImage = (dataUrl: string, filterVal: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Apply filter to context if not none
        if (filterVal !== 'none') {
          ctx.filter = filterVal;
        }

        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = (e) => reject(e);
      img.src = dataUrl;
    });
  };

  useEffect(() => {
    if (!template || !layout || capturedPhotos.length === 0) return;

    let isMounted = true;
    const generatePreview = async () => {
      setGeneratingPreview(true);
      try {
        const filterObj = FILTERS.find((f) => f.id === selectedFilter);
        const filterVal = filterObj ? filterObj.filterVal : 'none';

        let filteredPhotos = [...capturedPhotos];
        if (filterVal !== 'none') {
          const promises = capturedPhotos.map(async (photo) => {
            const filteredUrl = await applyFilterToImage(photo.dataUrl, filterVal);
            return { id: photo.id, dataUrl: filteredUrl };
          });
          filteredPhotos = await Promise.all(promises);
        }

        const blob = await PhotoComposer.compose({
          template,
          layout,
          photos: filteredPhotos,
        });

        if (isMounted) {
          latestBlobRef.current = blob;
          latestFilterRef.current = selectedFilter;
          if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
          setPreviewBlobUrl(URL.createObjectURL(blob));
        }
      } catch (e) {
        console.error('Failed to generate preview', e);
      } finally {
        if (isMounted) setGeneratingPreview(false);
      }
    };

    generatePreview();
    return () => { isMounted = false; };
  }, [template, layout, capturedPhotos, selectedFilter]);

  const handleRetakeConfirm = async () => {
    setIsRetaking(true);
    try {
      latestBlobRef.current = null;
      BoomerangGenerator.reset();
      useSessionStore.getState().setCapturedPhotos([]);
      useSessionStore.getState().setComposedPhotoBase64(null);
      useSessionStore.getState().setComposedPhotoBlobUrl(null);
      useSessionStore.getState().setBoomerangGifBase64(null);
      useSessionStore.getState().setBoomerangGifBlobUrl(null);
      useSessionStore.getState().setIsBoomerangGenerating(false);
      useSessionStore.getState().setUploadedPhotoUrl(null);

      if (sessionId) {
        try {
          await sessionRepository.updatePhotoCount({ sessionId, photoCount: 0 });
          await sessionRepository.updateStage(sessionId, 'STARTED');
        } catch (e) {
          console.error('Failed to reset photo count in Firestore:', e);
        }
      }

      toast.success('Silakan ambil foto ulang!');
      router.push('/camera');
    } catch (e) {
      console.error('Failed to retake photos:', e);
      toast.error('Gagal mengatur ulang sesi foto.');
    } finally {
      setIsRetaking(false);
      setShowRetakeModal(false);
    }
  };

  const handleSaveAndContinue = async () => {
    setProcessing(true);
    try {
      const filterObj = FILTERS.find((f) => f.id === selectedFilter);
      const filterVal = filterObj ? filterObj.filterVal : 'none';

      let updatedPhotos: PhotoSlot[] = [];

      if (filterVal === 'none') {
        updatedPhotos = [...capturedPhotos];
      } else {
        // Apply filter to each photo in canvas
        const promises = capturedPhotos.map(async (photo) => {
          const filteredUrl = await applyFilterToImage(photo.dataUrl, filterVal);
          return {
            id: photo.id,
            dataUrl: filteredUrl,
          };
        });
        updatedPhotos = await Promise.all(promises);
      }

      // Save to store
      setCapturedPhotos(updatedPhotos);

      // Mulai pembuatan Boomerang Ping-Pong GIF di latar belakang tanpa blocking navigasi
      useSessionStore.getState().setIsBoomerangGenerating(true);
      BoomerangGenerator.generateBoomerang(updatedPhotos)
        .then(async (result) => {
          if (result) {
            useSessionStore.getState().setBoomerangGifBase64(result.base64);
            useSessionStore.getState().setBoomerangGifBlobUrl(result.blobUrl);
            if (sessionId) {
              await storageService.saveBoomerangToLocalStorage({
                sessionId,
                blob: result.blob,
              });
            }
          }
        })
        .catch((err) => console.warn('[EditPhoto] Boomerang generation gagal (non-fatal):', err))
        .finally(() => {
          useSessionStore.getState().setIsBoomerangGenerating(false);
        });

      // Gunakan blob yang sudah selesai di-render di preview jika filter cocok,
      // atau lakukan compose sekali jika belum ada.
      let finalBlob =
        latestFilterRef.current === selectedFilter && latestBlobRef.current
          ? latestBlobRef.current
          : null;

      if (!finalBlob && template && layout) {
        finalBlob = await PhotoComposer.compose({
          template,
          layout,
          photos: updatedPhotos,
        });
      }

      if (finalBlob) {
        const objectUrl = URL.createObjectURL(finalBlob);
        setComposedPhotoBlobUrl(objectUrl);
        const base64 = await PhotoComposer.blobToBase64(finalBlob);
        setComposedPhotoBase64(base64);

        // Simpan ke IndexedDB lokal secara non-blocking di latar belakang
        finalBlob
          .arrayBuffer()
          .then((buf) => {
            storageService
              .saveToLocalStorage({
                sessionId: sessionId || 'session',
                imageBytes: new Uint8Array(buf),
              })
              .catch((err) => console.warn('[EditPhoto] Local save non-fatal:', err));
          })
          .catch((err) => console.warn('[EditPhoto] arrayBuffer non-fatal:', err));
      }

      if (sessionId) {
        await sessionRepository.updateStage(sessionId, 'EDIT_PHOTO_COMPLETED');
      }

      toast.success('Efek foto berhasil disimpan!');
      router.push('/email');
    } catch (e) {
      console.error('Failed to bake filters:', e);
      toast.error('Gagal menerapkan efek foto.');
    } finally {
      setProcessing(false);
    }
  };

  if (!isReady) return null;

  const currentFilter = FILTERS.find((f) => f.id === selectedFilter);

  return (
    <MainLayout step={5} footerHint="Pilih efek filter terbaik untuk foto Anda">
      <div className="w-full h-full flex flex-col gap-6 max-w-6xl mx-auto px-4 py-6">
        <PageTitle
          title="Edit Foto & Efek"
          subtitle="Tambahkan efek filter estetis untuk mempercantik hasil foto Anda."
        />

        <div className="grid gap-6 lg:grid-cols-[2.25fr_1fr]">
          {/* Main Preview Panel */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="rounded-[28px] border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div className="mb-4">
              <Typography variant="label" className="text-black/50 uppercase tracking-[0.28em]">
                Pratinjau Hasil
              </Typography>
            </div>

            {previewBlobUrl ? (
              <div className="flex justify-center h-[60vh] items-center relative rounded-2xl bg-gray-50 border border-gray-200 p-2">
                {generatingPreview && (
                  <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center z-10 rounded-2xl">
                    <Typography variant="body" className="font-medium animate-pulse text-gray-800">
                      Menerapkan efek...
                    </Typography>
                  </div>
                )}
                <img
                  src={previewBlobUrl}
                  alt="Template Preview"
                  className="h-full w-auto object-contain shadow-lg"
                />
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {capturedPhotos.map((photo, index) => (
                  <div
                    key={photo.id || index}
                    className="aspect-square overflow-hidden rounded-[24px] border border-gray-200 bg-gray-50 flex items-center justify-center relative shadow-inner"
                  >
                    <img
                      src={photo.dataUrl}
                      alt={`Foto ${index + 1}`}
                      className={`h-full w-full object-cover transition-all duration-300`}
                      style={{ filter: currentFilter?.filterVal }}
                    />
                    <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md text-[10px] font-bold text-white px-2.5 py-1 rounded-full border border-white/10">
                      Foto {index + 1}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          {/* Control Panel */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.1 }}
            className="rounded-[28px] border border-gray-200 bg-white p-5 flex flex-col justify-between shadow-sm"
          >
            <div className="space-y-6">
              <div>
                <Typography variant="label" className="text-black/50 uppercase tracking-[0.28em]">
                  Pilih Filter
                </Typography>
                <p className="text-xs text-black/40 mt-1">Ketuk filter untuk melihat pratinjau instan</p>
              </div>

              {/* Filter List */}
              <div className="grid grid-cols-2 gap-2">
                {FILTERS.map((filter) => {
                  const active = filter.id === selectedFilter;
                  return (
                    <button
                      key={filter.id}
                      onClick={() => setSelectedFilter(filter.id)}
                      className={`flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all duration-200 cursor-pointer ${
                        active
                          ? 'border-[#E83E8C] bg-[#E83E8C]/10 text-[#E83E8C] shadow-sm'
                          : 'border-gray-200 bg-gray-50 text-black/70 hover:border-gray-300 hover:bg-gray-100'
                      }`}
                    >
                      <Sparkles
                        size={18}
                        className={active ? 'text-[#E83E8C] mb-1.5' : 'text-black/40 mb-1.5'}
                      />
                      <span className="text-xs font-semibold">{filter.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3 mt-6">
              <PrimaryButton
                size="md"
                fullWidth
                onClick={handleSaveAndContinue}
                disabled={processing || isRetaking}
                loading={processing}
              >
                <Check size={16} />
                Terapkan & Lanjut
              </PrimaryButton>

              <button
                type="button"
                onClick={() => setShowRetakeModal(true)}
                disabled={processing || isRetaking}
                className="w-full flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-black/80 hover:bg-gray-100 hover:border-gray-300 transition-colors disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                <RefreshCcw size={16} />
                Foto Ulang
              </button>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Modal Konfirmasi Foto Ulang */}
      <Modal
        open={showRetakeModal}
        onClose={() => !isRetaking && setShowRetakeModal(false)}
        title="Ambil Ulang Foto?"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-200">
              <AlertTriangle size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                Apakah Anda yakin ingin mengambil foto ulang?
              </p>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                Semua foto yang sudah diambil pada sesi ini akan diatur ulang, dan Anda akan diarahkan kembali ke layar kamera untuk mengambil foto baru dengan template yang sama.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              disabled={isRetaking}
              onClick={() => setShowRetakeModal(false)}
              className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={isRetaking}
              onClick={handleRetakeConfirm}
              className="px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCcw size={14} className={isRetaking ? 'animate-spin' : ''} />
              {isRetaking ? 'Mereset...' : 'Ya, Foto Ulang'}
            </button>
          </div>
        </div>
      </Modal>

      <LoadingOverlay visible={processing} message="Menerapkan efek filter pada foto..." />
    </MainLayout>
  );
}
