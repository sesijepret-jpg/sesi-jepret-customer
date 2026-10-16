'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import PrimaryButton from '@/components/ui/PrimaryButton';
import PageTitle from '@/components/ui/PageTitle';
import { Printer, CheckCircle } from 'lucide-react';
import { useSessionStore } from '@/store/session_store';
import { PhotoComposer } from '@/utils/photo_composer';
import { SessionRepository } from '@/repositories/session_repository';
import toast from 'react-hot-toast';

const sessionRepository = new SessionRepository();

export default function PrintPage() {
  const router = useRouter();
  const { sessionId, composedPhotoBase64, selectedTemplateName } = useSessionStore();
  const [progress, setProgress] = useState(0);
  const [isPrinted, setIsPrinted] = useState(false);
  // Guard agar print hanya dipanggil sekali walau komponen re-render
  const hasPrintedRef = useRef(false);

  useEffect(() => {
    if (!sessionId) {
      toast.error('Sesi tidak ditemukan.');
      router.replace('/');
      return;
    }

    // Hanya kirim perintah print satu kali
    if (!hasPrintedRef.current) {
      hasPrintedRef.current = true;
      if (composedPhotoBase64) {
        PhotoComposer.printImage(composedPhotoBase64, selectedTemplateName || 'Photo Booth');
      } else {
        console.warn('[PrintPage] composedPhotoBase64 tidak tersedia — print tidak dapat dilakukan.');
      }
    }

    // Animasi progress selama 4 detik
    const duration = 4000;
    const intervalTime = 100;
    const steps = duration / intervalTime;
    let currentStep = 0;

    const interval = setInterval(async () => {
      currentStep++;
      const currentProgress = Math.min(Math.round((currentStep / steps) * 100), 100);
      setProgress(currentProgress);

      if (currentProgress >= 100) {
        clearInterval(interval);
        setIsPrinted(true);
        toast.success('Pencetakan selesai!');

        try {
          await sessionRepository.markAsPrinted(sessionId);
          await sessionRepository.updateStage(sessionId, 'PRINTED');
        } catch (e) {
          console.error('Failed to update print status in Firestore:', e);
        }

        // Auto-navigate ke thank-you setelah 1.5 detik
        setTimeout(() => {
          router.push('/thank-you');
        }, 1500);
      }
    }, intervalTime);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return (
    <MainLayout step={6} footerHint="Proses pencetakan sedang berlangsung, mohon tunggu">
      <div className="w-full max-w-md mx-auto flex flex-col items-center gap-8">
        <PageTitle
          title={isPrinted ? 'Pencetakan Selesai' : 'Mencetak Foto'}
          subtitle={
            isPrinted
              ? 'Silakan ambil foto Anda pada printer booth.'
              : 'Foto Anda sedang dicetak. Harap tunggu beberapa saat.'
          }
        />

        {/* Printer animation card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="w-full rounded-2xl p-10 border border-gray-200 bg-white shadow-md flex flex-col items-center gap-6"
        >
          {/* Animated printer icon */}
          <motion.div
            animate={isPrinted ? { scale: [1, 1.1, 1] } : { y: [0, -6, 0] }}
            transition={
              isPrinted
                ? { duration: 0.3 }
                : { repeat: Infinity, duration: 1.4, ease: 'easeInOut' }
            }
            className={`w-20 h-20 rounded-2xl flex items-center justify-center border transition-all duration-300 ${
              isPrinted
                ? 'bg-green-500/10 border-green-500/30 text-green-500'
                : 'bg-[#E6007A]/10 border-[#E6007A]/25 text-[#E6007A]'
            }`}
          >
            {isPrinted ? <CheckCircle size={36} /> : <Printer size={36} />}
          </motion.div>

          {/* Progress bar */}
          <div className="w-full">
            <div className="flex justify-between text-[10px] text-black/50 mb-2 font-medium">
              <span>{isPrinted ? 'Selesai' : 'Mencetak...'}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
              <motion.div
                initial={{ width: '0%' }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.1, ease: 'linear' }}
                className="h-full rounded-full"
                style={{
                  background: isPrinted
                    ? 'linear-gradient(to right, #4CAF50, #81C784)'
                    : 'linear-gradient(to right, #E6007A, #9b27af)',
                }}
              />
            </div>
          </div>

          <p className="text-xs text-black/50 text-center leading-relaxed">
            {isPrinted ? (
              <span className="text-green-400 font-semibold">Mengalihkan ke halaman selesai...</span>
            ) : (
              <span>Mengirim perintah ke printer antrean booth local...</span>
            )}
          </p>
        </motion.div>

        <div className="flex items-center justify-center">
          <Link href="/thank-you">
            <PrimaryButton size="sm" disabled={!isPrinted}>
              Lanjut ke Selesai
            </PrimaryButton>
          </Link>
        </div>
      </div>
    </MainLayout>
  );
}
