'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/layout/MainLayout';
import PrimaryButton from '@/components/ui/PrimaryButton';
import SecondaryButton from '@/components/ui/SecondaryButton';
import PageTitle from '@/components/ui/PageTitle';
import Typography from '@/components/ui/Typography';
import { Printer, CheckCircle, Sparkles, Layers, Check, ArrowRight, Clock } from 'lucide-react';
import { useSessionStore } from '@/store/session_store';
import { PhotoComposer, PrintMode } from '@/utils/photo_composer';
import { SessionRepository } from '@/repositories/session_repository';
import toast from 'react-hot-toast';

const sessionRepository = new SessionRepository();

export type BoothPrinterType = 'canon' | 'roll';

export default function PrintPage() {
  const router = useRouter();
  const { sessionId, composedPhotoBase64, composedPhotoBlobUrl, selectedTemplateName } = useSessionStore();

  const [printerType, setPrinterType] = useState<BoothPrinterType>('canon');
  const [hasPrinted, setHasPrinted] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);

  const isNavigatingRef = useRef(false);

  const photoSrc = composedPhotoBlobUrl || composedPhotoBase64;

  // Baca tipe printer yang sebelumnya tersimpan di localStorage
  useEffect(() => {
    if (!sessionId) {
      toast.error('Sesi tidak ditemukan.');
      router.replace('/');
      return;
    }

    try {
      const savedPrinter = localStorage.getItem('sesijepret_printer_type') as BoothPrinterType | null;
      if (savedPrinter === 'canon' || savedPrinter === 'roll') {
        setPrinterType(savedPrinter);
      }
    } catch (e) {
      console.warn('Gagal membaca preferensi printer:', e);
    }
  }, [sessionId, router]);

  // Handler ganti tipe printer (hanya bisa diganti sebelum mencetak)
  const handleSelectPrinter = (type: BoothPrinterType) => {
    if (hasPrinted || isPrinting) return;
    setPrinterType(type);
    try {
      localStorage.setItem('sesijepret_printer_type', type);
      toast.success(
        type === 'canon'
          ? 'Printer dipilih: Canon (2 Strip Langsung)'
          : 'Printer dipilih: Roll 2 Inci (1 Roll 2x Cetak)'
      );
    } catch (e) {}
  };

  // Navigasi ke halaman Terima Kasih
  const handleGoToThankYou = () => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    router.replace('/thank-you');
  };

  // Eksekusi cetak foto (hanya bisa dipencet 1 kali)
  const handlePrint = () => {
    if (hasPrinted || isPrinting) return;

    if (!composedPhotoBase64) {
      toast.error('Foto belum siap untuk dicetak.');
      return;
    }

    setIsPrinting(true);
    setHasPrinted(true);
    setProgress(10);

    const modeToUse: PrintMode =
      printerType === 'canon' ? 'canon_double_strip' : 'roll_2inch_double';

    // Buka print dialog
    PhotoComposer.printImage(composedPhotoBase64, {
      templateName: selectedTemplateName || 'Photo Booth',
      mode: modeToUse,
      onAfterPrint: async () => {
        // Callback saat dialog print ditutup
        console.log('[PrintPage] Dialog print selesai.');
      },
    });

    // Simulasi progress pencetakan (3 detik)
    const duration = 3000;
    const intervalTime = 60;
    const steps = duration / intervalTime;
    let currentStep = 0;

    const interval = setInterval(async () => {
      currentStep++;
      const currentProgress = Math.min(Math.round((currentStep / steps) * 100), 100);
      setProgress(currentProgress);

      if (currentProgress >= 100) {
        clearInterval(interval);
        setIsPrinting(false);
        toast.success('Perintah cetak berhasil dikirim! Silakan ambil hasil foto.');

        // Update status di Firestore
        try {
          if (sessionId) {
            await sessionRepository.markAsPrinted(sessionId);
            await sessionRepository.updateStage(sessionId, 'PRINTED');
          }
        } catch (e) {
          console.error('Failed to update print status in Firestore:', e);
        }

        // Mulai hitung mundur 5 detik untuk redirect otomatis ke halaman terima kasih
        setCountdown(5);
      }
    }, intervalTime);
  };

  // Efek countdown 5 detik setelah cetak selesai jika user tidak menekan tombol selesai
  useEffect(() => {
    if (countdown === null) return;

    if (countdown <= 0) {
      const timeoutId = setTimeout(() => {
        handleGoToThankYou();
      }, 50);
      return () => clearTimeout(timeoutId);
    }

    const timerId = setInterval(() => {
      setCountdown((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);

  return (
    <MainLayout
      step={6}
      footerHint={
        hasPrinted
          ? 'Silakan ambil hasil cetak foto Anda di printer booth.'
          : printerType === 'canon'
          ? 'Format Canon: 2 strip dicetak langsung di 1 lembar kertas 4R'
          : 'Format Roll 2 Inci: 1 roll otomatis mencetak 2 kali berurutan'
      }
    >
      <div className="w-full max-w-4xl mx-auto flex flex-col items-center gap-6 px-4">
        <PageTitle
          title={hasPrinted ? (isPrinting ? 'Sedang Mencetak Foto...' : 'Pencetakan Selesai') : 'Cetak Foto Booth'}
          subtitle={
            hasPrinted
              ? isPrinting
                ? 'Foto sedang dikirim ke printer antrean booth. Mohon tunggu...'
                : 'Foto Anda telah berhasil dikirim ke printer. Silakan ambil hasil cetak Anda.'
              : 'Pilih tipe printer yang akan digunakan, lalu tekan tombol Cetak di bawah.'
          }
        />

        <div className="w-full grid grid-cols-1 md:grid-cols-[1.1fr_1.3fr] gap-6 items-start">
          {/* Preview Strip Photo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm flex flex-col items-center"
          >
            <div className="w-full flex items-center justify-between mb-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <span>Pratinjau Hasil Cetak</span>
              <span className="inline-flex items-center gap-1 text-[#E6007A]">
                <Sparkles size={14} /> 300 DPI
              </span>
            </div>

            {photoSrc ? (
              <div className="relative flex justify-center items-center bg-gray-50 rounded-2xl p-3 border border-gray-100 max-h-[50vh] w-full overflow-hidden">
                {printerType === 'canon' ? (
                  /* Canon Preview: 2 strip side-by-side with cut line */
                  <div className="relative flex flex-row items-center justify-center gap-1.5 max-h-[46vh]">
                    <img
                      src={photoSrc}
                      alt="Hasil Cetak Strip 1"
                      className="max-h-[46vh] w-auto rounded-md shadow-sm object-contain aspect-[1/3]"
                    />
                    <div className="h-[44vh] border-r border-dashed border-gray-400 opacity-60" />
                    <img
                      src={photoSrc}
                      alt="Hasil Cetak Strip 2"
                      className="max-h-[46vh] w-auto rounded-md shadow-sm object-contain aspect-[1/3]"
                    />
                  </div>
                ) : (
                  /* Roll 2 Inci Preview: 2 kali cetak berurutan */
                  <div className="relative flex flex-row items-center justify-center gap-3 max-h-[46vh]">
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] font-bold text-gray-400 mb-1">Cetak 1</span>
                      <img
                        src={photoSrc}
                        alt="Hasil Cetak Roll 1"
                        className="max-h-[42vh] w-auto rounded-lg shadow-sm object-contain aspect-[1/3]"
                      />
                    </div>
                    <div className="h-[40vh] border-r border-gray-200" />
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] font-bold text-gray-400 mb-1">Cetak 2</span>
                      <img
                        src={photoSrc}
                        alt="Hasil Cetak Roll 2"
                        className="max-h-[42vh] w-auto rounded-lg shadow-sm object-contain aspect-[1/3]"
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full h-64 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-400">
                Memuat foto...
              </div>
            )}

            {/* Dimension Badge */}
            <div className="mt-4 w-full bg-pink-50/70 border border-pink-100 rounded-xl p-3 text-center">
              <Typography variant="caption" className="font-semibold text-[#E6007A] block">
                {printerType === 'canon'
                  ? 'Format: Canon (2 Strip Langsung di Kertas 4R 4 × 6 Inci)'
                  : 'Format: Printer Roll 2 Inci (1 Roll Dicetak 2 Kali Berurutan)'}
              </Typography>
              <Typography variant="caption" className="text-gray-500 text-[11px] block mt-0.5">
                {printerType === 'canon'
                  ? 'Berisi 2 strip 600 × 1800 px (300 DPI) siap digunting di garis tengah'
                  : 'Standar 2 × 6 Inci (600 × 1800 px @ 300 DPI), otomatis 2 lembar'}
              </Typography>
            </div>
          </motion.div>

          {/* Status & Control Card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col gap-5"
          >
            {/* Status Header */}
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-gray-50 border border-gray-100">
              <motion.div
                animate={hasPrinted && !isPrinting ? { scale: [1, 1.1, 1] } : { y: [0, -3, 0] }}
                transition={
                  hasPrinted && !isPrinting
                    ? { duration: 0.3 }
                    : { repeat: Infinity, duration: 1.4, ease: 'easeInOut' }
                }
                className={`w-14 h-14 rounded-2xl flex items-center justify-center border transition-all duration-300 shrink-0 ${
                  hasPrinted && !isPrinting
                    ? 'bg-green-500/10 border-green-500/30 text-green-600'
                    : isPrinting
                    ? 'bg-[#E6007A]/15 border-[#E6007A]/30 text-[#E6007A]'
                    : 'bg-gray-100 border-gray-200 text-gray-700'
                }`}
              >
                {hasPrinted && !isPrinting ? <CheckCircle size={30} /> : <Printer size={30} />}
              </motion.div>

              <div className="flex-1">
                <Typography variant="body" className="font-bold text-gray-900">
                  {!hasPrinted
                    ? 'Siap Mencetak'
                    : isPrinting
                    ? 'Sedang Memproses Cetak...'
                    : 'Pencetakan Selesai'}
                </Typography>
                <Typography variant="caption" className="text-gray-500 text-xs">
                  {!hasPrinted
                    ? 'Pilih tipe printer di bawah, lalu klik Cetak Foto.'
                    : isPrinting
                    ? 'Mohon tunggu, printer sedang menyiapkan media cetak.'
                    : 'Foto berhasil dikirim ke printer antrean booth.'}
                </Typography>
              </div>
            </div>

            {/* Progress bar (aktif saat mencetak) */}
            {hasPrinted && (
              <div className="w-full">
                <div className="flex justify-between text-xs text-gray-500 mb-2 font-medium">
                  <span>{isPrinting ? 'Proses Mencetak' : 'Status Selesai'}</span>
                  <span className="font-semibold text-gray-700">{progress}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                  <motion.div
                    initial={{ width: '0%' }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.1, ease: 'linear' }}
                    className="h-full rounded-full"
                    style={{
                      background:
                        progress >= 100
                          ? 'linear-gradient(to right, #4CAF50, #81C784)'
                          : 'linear-gradient(to right, #E6007A, #9b27af)',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Pilihan Tipe Printer Booth */}
            <div className="border border-gray-100 rounded-2xl p-4 bg-gray-50/70 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <Typography variant="caption" className="font-semibold text-gray-700 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Layers size={14} className="text-[#E6007A]" /> 1. Pilih Tipe Printer:
                </Typography>
                {hasPrinted && (
                  <span className="text-[10px] text-gray-400 font-medium">Terkunci (Sudah dicetak)</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={hasPrinted || isPrinting}
                  onClick={() => handleSelectPrinter('canon')}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                    printerType === 'canon'
                      ? 'border-[#E6007A] bg-pink-50/70 text-[#E6007A] font-semibold shadow-sm'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  } ${hasPrinted || isPrinting ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <span className="text-xs font-bold inline-flex items-center gap-1">
                    Canon (2 Strip Langsung) {printerType === 'canon' && <Check size={13} className="text-[#E6007A]" />}
                  </span>
                  <span className="text-[10px] text-gray-500 mt-0.5">Kertas foto 4R (4 × 6")</span>
                </button>

                <button
                  type="button"
                  disabled={hasPrinted || isPrinting}
                  onClick={() => handleSelectPrinter('roll')}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                    printerType === 'roll'
                      ? 'border-[#E6007A] bg-pink-50/70 text-[#E6007A] font-semibold shadow-sm'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  } ${hasPrinted || isPrinting ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <span className="text-xs font-bold inline-flex items-center gap-1">
                    Printer Roll 2 Inci {printerType === 'roll' && <Check size={13} className="text-[#E6007A]" />}
                  </span>
                  <span className="text-[10px] text-gray-500 mt-0.5">1 roll dicetak 2 kali (2x6")</span>
                </button>
              </div>

              {/* Petunjuk Penggunaan Berdasarkan Tipe Printer */}
              {printerType === 'canon' ? (
                <div className="rounded-xl border border-blue-200/80 bg-blue-50/80 p-3 text-[11px] text-blue-900 leading-relaxed flex flex-col gap-1">
                  <span className="font-bold text-blue-950">
                    💡 Petunjuk Printer Canon (Kertas 4R):
                  </span>
                  <span>
                    1. Masukkan <strong>Kertas Foto 4R (4 × 6 inci / 10 × 15 cm)</strong> ke tray printer.
                  </span>
                  <span>
                    2. Pada dialog print Chrome, pastikan <strong>Paper size: 4 x 6 in</strong> dan <strong>Margins: None</strong>.
                  </span>
                  <span>
                    3. Hasil cetak akan berisi <strong>2 strip $2 \times 6$ inci</strong> berdampingan di bagian paling atas kertas.
                  </span>
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/80 p-3 text-[11px] text-emerald-900 leading-relaxed flex flex-col gap-1">
                  <span className="font-bold text-emerald-950">
                    💡 Petunjuk Printer Roll 2 Inci:
                  </span>
                  <span>
                    1. Pasang <strong>Kertas Roll 2 Inci (50.8 mm / 58 mm)</strong> pada printer booth.
                  </span>
                  <span>
                    2. Pada dialog print Chrome, pastikan ukuran kertas diatur ke <strong>2 x 6 in (atau continuous)</strong> dan <strong>Margins: None</strong>.
                  </span>
                  <span>
                    3. Printer roll akan otomatis mencetak <strong>2 lembar strip secara berurutan</strong> dari 1 roll.
                  </span>
                </div>
              )}
            </div>

            {/* Info Countdown 5 Detik Setelah Selesai Cetak */}
            {countdown !== null && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-center gap-2 p-3 bg-pink-50 border border-pink-200 rounded-xl text-center"
              >
                <Clock size={16} className="text-[#E6007A] animate-pulse" />
                <span className="text-xs text-gray-700">
                  Halaman otomatis beralih ke halaman selesai dalam{' '}
                  <strong className="text-[#E6007A] text-sm font-bold">{countdown}</strong> detik...
                </span>
              </motion.div>
            )}

            {/* Action Buttons: HANYA ADA TOMBOL CETAK & SELESAI */}
            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              {/* Tombol Cetak (Hanya bisa ditekan 1 kali saja) */}
              <button
                type="button"
                onClick={handlePrint}
                disabled={hasPrinted || isPrinting}
                className={`w-full sm:w-auto flex-1 flex items-center justify-center gap-2 py-3 px-5 rounded-2xl font-semibold text-sm transition-all shadow-sm ${
                  hasPrinted
                    ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed shadow-none'
                    : isPrinting
                    ? 'bg-[#E6007A]/80 text-white cursor-wait'
                    : 'bg-[#E6007A] hover:bg-[#D0006E] text-white active:scale-[0.98]'
                }`}
              >
                {hasPrinted ? (
                  <>
                    <Check size={18} className="text-green-600" />
                    <span>Sudah Dicetak (1x)</span>
                  </>
                ) : isPrinting ? (
                  <>
                    <Printer size={18} className="animate-bounce" />
                    <span>Mencetak...</span>
                  </>
                ) : (
                  <>
                    <Printer size={18} />
                    <span>Cetak Foto</span>
                  </>
                )}
              </button>

              {/* Tombol Selesai (Hanya bisa ditekan setelah foto dicetak) */}
              <button
                type="button"
                onClick={handleGoToThankYou}
                disabled={!hasPrinted}
                className={`w-full sm:w-auto flex-1 flex items-center justify-center gap-2 py-3 px-5 rounded-2xl font-semibold text-sm transition-all shadow-sm ${
                  !hasPrinted
                    ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed shadow-none'
                    : 'bg-black hover:bg-gray-800 text-white active:scale-[0.98]'
                }`}
              >
                <span>Selesai</span>
                <ArrowRight size={18} />
              </button>
            </div>

            {/* Keterangan Aturan Alur */}
            <div className="text-center text-[11px] text-gray-400">
              {!hasPrinted
                ? '* Anda harus menekan tombol "Cetak Foto" terlebih dahulu sebelum dapat menekan "Selesai".'
                : '* Pencetakan hanya dapat dilakukan 1 kali. Tekan "Selesai" untuk mengakhiri sesi sekarang.'}
            </div>
          </motion.div>
        </div>
      </div>
    </MainLayout>
  );
}
