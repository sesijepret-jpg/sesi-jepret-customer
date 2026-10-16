'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import PrimaryButton from '@/components/ui/PrimaryButton';
import SecondaryButton from '@/components/ui/SecondaryButton';
import Typography from '@/components/ui/Typography';
import { ArrowLeft, Camera, Image as ImageIcon, RotateCcw } from 'lucide-react';
import { AppConstants } from '@/constants/app_constants';

import { useSessionStore } from '@/store/session_store';
import { SessionRepository } from '@/repositories/session_repository';
import { useSessionTimer } from '@/hooks/useSessionTimer';

const sessionRepository = new SessionRepository();

interface PhotoSlot {
  id: string;
  dataUrl: string;
}

export default function CameraPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [supportMessage, setSupportMessage] = useState<string | null>(null);
  const [showFlash, setShowFlash] = useState(false);
  const [photoSlots, setPhotoSlots] = useState<PhotoSlot[]>([]);
  const [countdown, setCountdown] = useState<number>(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [selectedTemplateName, setSelectedTemplateName] = useState<string | null>(null);
  const [photoSlotsCount, setPhotoSlotsCount] = useState<number>(4);

  const sessionId = useSessionStore((state) => state.sessionId);
  const setCapturedPhotos = useSessionStore((state) => state.setCapturedPhotos);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStream(null);
  }, []);

  const canCapture = !!stream && !isCapturing && photoSlots.length < photoSlotsCount;
  const hasPhotos = photoSlots.length > 0;

  useEffect(() => {
    const selected = sessionStorage.getItem('boro_selected_template');
    if (selected) {
      try {
        const parsed = JSON.parse(selected);
        setSelectedTemplateName(parsed.name ?? null);
        if (parsed.photoCount) {
          setPhotoSlotsCount(parsed.photoCount);
        }
      } catch {
        setSelectedTemplateName(null);
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
      stopCamera();
      router.push('/edit-photo');
    } else {
      stopCamera();
      router.push('/');
    }
  });

  useEffect(() => {
    if (photoSlotsCount > 0 && photoSlots.length >= photoSlotsCount) {
      const t = setTimeout(() => {
        handleFinish();
      }, 800);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoSlots.length, photoSlotsCount]);

  useEffect(() => {
    let isMounted = true;

    const stopExistingStream = () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };

    const init = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setSupportMessage('Perangkat Anda tidak mendukung kamera web. Gunakan browser yang mendukung MediaDevices API.');
        return;
      }

      try {
        stopExistingStream();
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });

        if (!isMounted) {
          mediaStream.getTracks().forEach(track => track.stop());
          return;
        }

        streamRef.current = mediaStream;
        setStream(mediaStream);
        setSupportMessage(null);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          await videoRef.current.play();
        }
      } catch (error) {
        setSupportMessage('Tidak dapat mengakses kamera. Periksa izin browser dan coba lagi.');
      }
    };

    init();

    return () => {
      isMounted = false;
      stopCamera();
    };
  }, [stopCamera]);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current || !stream || isCapturing) return;

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
    } catch (e) {
      // Ignore audio creation errors
    }
    setTimeout(() => {
      setShowFlash(false);
    }, 150);

    let dataUrl = '';
    const track = streamRef.current?.getVideoTracks()[0];

    // Coba gunakan ImageCapture API (untuk benar-benar memfoto dari hardware)
    try {
      // @ts-ignore - ImageCapture mungkin tidak dikenali oleh TS standar
      if (track && typeof ImageCapture !== 'undefined') {
        // @ts-ignore
        const imageCapture = new ImageCapture(track);
        const blob = await imageCapture.takePhoto();
        
        // Konversi blob ke base64 (DataURL)
        const reader = new FileReader();
        dataUrl = await new Promise<string>((resolve, reject) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }
    } catch (e) {
      console.warn('ImageCapture failed atau tidak didukung, menggunakan fallback canvas:', e);
    }

    // Jika ImageCapture gagal atau tidak didukung, fallback ke metode Canvas (grab frame)
    if (!dataUrl) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      let width = video.videoWidth || 1280;
      let height = video.videoHeight || 720;

      if (track) {
        const settings = track.getSettings();
        if (settings.width && settings.height) {
          width = settings.width;
          height = settings.height;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');

      if (!context) {
        setIsCapturing(false);
        return;
      }

      context.drawImage(video, 0, 0, width, height);
      dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    }

    setPhotoSlots((prev) => {
      const next = [...prev, { id: `${Date.now()}`, dataUrl }];
      return next.slice(-photoSlotsCount);
    });
    setIsCapturing(false);
  };

  const removeLastPhoto = () => {
    setPhotoSlots((prev) => prev.slice(0, -1));
  };

  const handleFinish = async () => {
    setCapturedPhotos(photoSlots);
    
    if (sessionId) {
      try {
        await sessionRepository.updatePhotoCount({ sessionId, photoCount: photoSlots.length });
        await sessionRepository.updateStage(sessionId, 'PHOTO_CAPTURED');
      } catch (e) {
        console.error('Failed to update photo stats in Firestore:', e);
      }
    }
    
    stopCamera();
    router.push('/preview');
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
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
            autoPlay
            disablePictureInPicture
          />

          {showFlash && (
            <div className="absolute inset-0 bg-white z-50 pointer-events-none" />
          )}

          {!stream && supportMessage && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-black/80 z-20">
              <Camera size={48} className="text-white/40 mb-3" />
              <p className="text-white font-medium max-w-sm">{supportMessage}</p>
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

          <canvas ref={canvasRef} className="hidden" />
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
              {canCapture ? 'Ambil Foto' : hasPhotos ? 'Ambil Foto Lagi' : 'Menyiapkan Kamera...'}
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
