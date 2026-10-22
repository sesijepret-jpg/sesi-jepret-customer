'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import PrimaryButton from '@/components/ui/PrimaryButton';
import SecondaryButton from '@/components/ui/SecondaryButton';
import Typography from '@/components/ui/Typography';
import { ArrowLeft, Camera, Image as ImageIcon, RotateCcw } from 'lucide-react';

import { useSessionStore } from '@/store/session_store';
import { SessionRepository } from '@/repositories/session_repository';
import { useSessionTimer } from '@/hooks/useSessionTimer';
import { captureCanonPhoto, checkCanonCamera, getCanonPreview, photoBlobToDataUrl } from '@/services/canon_bridge_client';
import { WebcamClient } from '@/services/webcam_client';

const sessionRepository = new SessionRepository();

type CameraMode = 'detecting' | 'canon' | 'webcam';

interface PhotoSlot {
  id: string;
  dataUrl: string;
}

export default function CameraPage() {
  const router = useRouter();
  const previewUrlRef = useRef<string | null>(null);
  const previewPausedRef = useRef(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [supportMessage, setSupportMessage] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [showFlash, setShowFlash] = useState(false);
  const [photoSlots, setPhotoSlots] = useState<PhotoSlot[]>([]);
  const [countdown, setCountdown] = useState<number>(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [photoSlotsCount, setPhotoSlotsCount] = useState<number>(4);

  // Webcam fallback state
  const [cameraMode, setCameraMode] = useState<CameraMode>('detecting');
  const webcamRef = useRef<WebcamClient | null>(null);
  const webcamVideoRef = useRef<HTMLVideoElement | null>(null);
  const webcamContainerRef = useRef<HTMLDivElement | null>(null);

  const sessionId = useSessionStore((state) => state.sessionId);
  const setCapturedPhotos = useSessionStore((state) => state.setCapturedPhotos);

  const canCapture = cameraReady && !isCapturing && photoSlots.length < photoSlotsCount;
  const hasPhotos = photoSlots.length > 0;

  useEffect(() => {
    const selected = sessionStorage.getItem('boro_selected_template');
    if (selected) {
      try {
        const parsed = JSON.parse(selected);
        if (parsed.photoCount) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setPhotoSlotsCount(parsed.photoCount);
        }
      } catch {
        // Keep the default four slots if the saved template is invalid.
      }
    }
  }, []);

  const sessionTimeLeft = useSessionTimer(false, () => {
    if (photoSlots.length > 0) {
      setCapturedPhotos(photoSlots);
      if (sessionId) {
        sessionRepository.updatePhotoCount({ sessionId, photoCount: photoSlots.length }).catch(console.error);
        sessionRepository.updateStage(sessionId, 'PHOTO_CAPTURED').catch(console.error);
      }
      router.push('/edit-photo');
    } else {
      router.push('/');
    }
  });

  const handleFinish = useCallback(async () => {
    setCapturedPhotos(photoSlots);
    if (sessionId) {
      try {
        await sessionRepository.updatePhotoCount({ sessionId, photoCount: photoSlots.length });
        await sessionRepository.updateStage(sessionId, 'PHOTO_CAPTURED');
      } catch (error) {
        console.error('Failed to update photo stats in Firestore:', error);
      }
    }
    router.push('/preview');
  }, [photoSlots, router, sessionId, setCapturedPhotos]);

  useEffect(() => {
    if (photoSlotsCount > 0 && photoSlots.length >= photoSlotsCount) {
      const t = setTimeout(() => {
        void handleFinish();
      }, 800);
      return () => clearTimeout(t);
    }
  }, [photoSlots.length, photoSlotsCount, handleFinish]);

  // ─── Detection: try Canon bridge first, fallback to webcam ───
  useEffect(() => {
    let active = true;

    const detect = async () => {
      // Try Canon bridge first
      try {
        await checkCanonCamera();
        if (active) {
          setCameraMode('canon');
          setCameraReady(true);
          setSupportMessage(null);
        }
        return;
      } catch {
        // Canon bridge not available, try webcam
      }

      // Fallback to browser webcam
      try {
        const client = new WebcamClient();
        const video = await client.start();
        if (active) {
          webcamRef.current = client;
          webcamVideoRef.current = video;
          setCameraMode('webcam');
          setCameraReady(true);
          setSupportMessage(null);
        } else {
          client.stop();
        }
      } catch {
        if (active) {
          setCameraReady(false);
          setSupportMessage('Tidak dapat mengakses kamera. Izinkan akses kamera di browser Anda.');
        }
      }
    };

    void detect();

    return () => {
      active = false;
    };
  }, []);

  // ─── Canon mode: health check polling ───
  useEffect(() => {
    if (cameraMode !== 'canon') return;
    let active = true;
    let checking = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        await checkCanonCamera();
        if (active) {
          setCameraReady(true);
          setSupportMessage(null);
        }
      } catch (error) {
        if (active) {
          setCameraReady(false);
          setSupportMessage(error instanceof Error ? error.message : 'Kamera Canon belum siap.');
        }
      } finally {
        checking = false;
      }
    };
    const timer = window.setInterval(check, 2500);
    return () => { active = false; window.clearInterval(timer); };
  }, [cameraMode]);

  // ─── Canon mode: live preview polling ───
  useEffect(() => {
    if (cameraMode !== 'canon' || !cameraReady) return;
    let active = true;
    const controller = new AbortController();
    let failedFrames = 0;
    const poll = async () => {
      while (active) {
        let delay = 250;
        if (!previewPausedRef.current) {
          try {
            const blob = await getCanonPreview(controller.signal);
            if (!active) break;
            failedFrames = 0;
            setPreviewError(null);
            const nextUrl = URL.createObjectURL(blob);
            const previousUrl = previewUrlRef.current;
            previewUrlRef.current = nextUrl;
            setPreviewUrl(nextUrl);
            if (previousUrl) window.setTimeout(() => URL.revokeObjectURL(previousUrl), 500);
          } catch (error) {
            if (!active) break;
            failedFrames += 1;
            delay = 1000;
            if (failedFrames >= 3) {
              setPreviewError(error instanceof Error ? error.message : 'Pratinjau kamera belum siap.');
              if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
              previewUrlRef.current = null;
              setPreviewUrl(null);
            }
          }
        }
        await new Promise<void>((resolve) => window.setTimeout(resolve, delay));
      }
    };
    void poll();
    return () => {
      active = false;
      controller.abort();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
      setPreviewUrl(null);
    };
  }, [cameraMode, cameraReady]);

  // ─── Webcam mode: attach video element to DOM ───
  useEffect(() => {
    if (cameraMode !== 'webcam') return;
    const container = webcamContainerRef.current;
    const video = webcamVideoRef.current;
    if (container && video) {
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'cover';
      video.style.transform = 'scaleX(-1)';
      container.appendChild(video);
    }
    return () => {
      if (container && video && container.contains(video)) {
        container.removeChild(video);
      }
    };
  }, [cameraMode]);

  // ─── Cleanup webcam on unmount ───
  useEffect(() => {
    return () => {
      webcamRef.current?.stop();
    };
  }, []);

  const capturePhoto = async () => {
    if (!cameraReady || isCapturing) return;

    setIsCapturing(true);

    // Hitung mundur 3 detik
    setCountdown(3);
    await new Promise<void>((resolve) => {
      let currentCount = 3;
      const interval = setInterval(() => {
        currentCount -= 1;
        setCountdown(currentCount);
        if (currentCount <= 0) {
          clearInterval(interval);
          resolve();
        }
      }, 1000);
    });

    // Jeda 1 detik tambahan sebelum memotret
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));

    // Shutter Visual and Sound
    setShowFlash(true);
    try {
      const shutterAudio = new Audio('/sounds/shutter.mp3');
      shutterAudio.play().catch(() => {
        // Ignore autoplay errors
      });
    } catch {
      // Ignore audio creation errors
    }
    setTimeout(() => {
      setShowFlash(false);
    }, 150);

    try {
      if (cameraMode === 'canon') {
        // Canon capture
        previewPausedRef.current = true;
        const jpeg = await captureCanonPhoto();
        const dataUrl = await photoBlobToDataUrl(jpeg);
        setPhotoSlots((prev) => [...prev, { id: `${Date.now()}`, dataUrl }].slice(-photoSlotsCount));
        setSupportMessage(null);
      } else if (cameraMode === 'webcam') {
        // Webcam capture
        const webcam = webcamRef.current;
        if (!webcam) throw new Error('Webcam tidak tersedia.');
        const blob = await webcam.capture();
        const dataUrl = await photoBlobToDataUrl(blob);
        setPhotoSlots((prev) => [...prev, { id: `${Date.now()}`, dataUrl }].slice(-photoSlotsCount));
        setSupportMessage(null);
      }
    } catch (error) {
      setSupportMessage(error instanceof Error ? error.message : 'Gagal memotret.');
      if (cameraMode === 'canon') {
        setCameraReady(false);
      }
    } finally {
      previewPausedRef.current = false;
      setIsCapturing(false);
    }
  };

  const removeLastPhoto = () => {
    setPhotoSlots((prev) => prev.slice(0, -1));
  };

  const slotPreviews = useMemo(
    () => Array.from({ length: photoSlotsCount }, (_, index) => photoSlots[index] || null),
    [photoSlots, photoSlotsCount]
  );

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const timerElement = (
    <div className="flex items-center justify-center rounded-full bg-red-50 px-3 py-1 border border-red-100 ml-2">
      <Typography variant="label" className="text-red-600 font-bold tracking-widest text-sm">
        {formatTime(sessionTimeLeft)}
      </Typography>
    </div>
  );

  const modeLabel = cameraMode === 'canon' ? 'Canon EOS M50' : cameraMode === 'webcam' ? 'Webcam' : '';

  return (
    <MainLayout step={4} footerHint="Klik tombol kamera untuk mengambil foto" headerLeftElement={timerElement}>
      <div className="w-full h-full flex flex-col lg:flex-row gap-6 max-w-6xl mx-auto px-4 py-4">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="relative flex-1 rounded-[32px] border border-gray-200 overflow-hidden bg-black shadow-lg"
          style={{ minHeight: '26rem' }}
        >
          {/* Canon live preview */}
          {cameraMode === 'canon' && previewUrl && (
            // Live view arrives as a changing local Blob URL; Next Image optimization is not applicable.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Pratinjau langsung Canon EOS M50" className="w-full h-full object-cover" />
          )}

          {/* Webcam live preview */}
          {cameraMode === 'webcam' && (
            <div ref={webcamContainerRef} className="w-full h-full" />
          )}

          {showFlash && (
            <div className="absolute inset-0 bg-white z-50 pointer-events-none" />
          )}

          {(supportMessage || previewError) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-black/80 z-20">
              <Camera size={48} className="text-white/40 mb-3" />
              <p className="text-white font-medium max-w-sm">{supportMessage || previewError}</p>
            </div>
          )}

          {cameraMode === 'detecting' && !supportMessage && (
            <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">
              Mendeteksi kamera...
            </div>
          )}

          {cameraMode === 'canon' && !previewUrl && !supportMessage && (
            <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">
              Menyiapkan pratinjau Canon EOS M50...
            </div>
          )}

          {countdown > 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <motion.div
                initial={{ scale: 0.88, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="flex h-36 w-36 items-center justify-center rounded-full bg-white/10 border border-white/20 text-white text-[4rem] font-black"
              >
                {countdown}
              </motion.div>
            </div>
          )}

          {/* Camera mode badge */}
          {cameraMode !== 'detecting' && (
            <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1 z-10">
              <span className="text-white/80 text-xs font-medium">{modeLabel}</span>
            </div>
          )}

        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="w-full lg:w-[22rem] flex flex-col gap-4"
        >
          <div className="grid grid-cols-2 gap-3">
            {slotPreviews.map((slot, index) => (
              <div
                key={index}
                className="aspect-square overflow-hidden rounded-3xl border border-gray-200 bg-gray-50 flex items-center justify-center shadow-sm"
              >
                {slot ? (
                  // Captured photos are in-memory data URLs until the session is composed.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={slot.dataUrl} alt={`Foto ${index + 1}`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 text-black/30 px-3 text-center">
                    <ImageIcon size={20} />
                    <p className="text-[11px]">Slot {index + 1}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="rounded-3xl border border-gray-200 bg-white p-4 flex flex-col gap-4 shadow-md">
            <Typography variant="label" className="text-black/50 uppercase tracking-[0.28em]">
              Kontrol Kamera
            </Typography>

            <PrimaryButton
              size="lg"
              fullWidth
              disabled={!canCapture}
              onClick={capturePhoto}
            >
              <Camera size={18} />
              {canCapture ? 'Ambil Foto' : hasPhotos ? 'Ambil Foto Lagi' : cameraMode === 'detecting' ? 'Mendeteksi Kamera...' : 'Menyiapkan Kamera...'}
            </PrimaryButton>

            <SecondaryButton size="md" fullWidth disabled={!hasPhotos} onClick={removeLastPhoto}>
              <RotateCcw size={16} />
              Hapus Foto Terakhir
            </SecondaryButton>

            <PrimaryButton
              size="md"
              fullWidth
              disabled={!hasPhotos}
              onClick={handleFinish}
            >
              Selesai Foto
            </PrimaryButton>

            <Link href="/templates">
              <SecondaryButton size="sm" fullWidth>
                <ArrowLeft size={14} />
                Ganti Template
              </SecondaryButton>
            </Link>
          </div>
        </motion.div>
      </div>
    </MainLayout>
  );
}
