'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, Printer, RefreshCw, Scissors } from 'lucide-react';
import MainLayout from '@/components/layout/MainLayout';
import PageTitle from '@/components/ui/PageTitle';
import { useSessionStore } from '@/store/session_store';
import { SessionRepository } from '@/repositories/session_repository';
import { PrintService } from '@/services/print_service';
import { StorageService } from '@/services/storage_service';
import toast from 'react-hot-toast';

const printer = new PrintService();
const sessionRepository = new SessionRepository();
const storageService = new StorageService();

export default function PrintPage() {
  const router = useRouter();
  const { sessionId, composedPhotoBase64, composedPhotoBlobUrl } = useSessionStore();
  const [restoredPhotoUrl, setRestoredPhotoUrl] = useState<string | null>(null);
  const photo = composedPhotoBlobUrl || composedPhotoBase64 || restoredPhotoUrl;
  const [bridgeConnected, setBridgeConnected] = useState(false);
  const [checking, setChecking] = useState(true);
  const [isPrinting, setIsPrinting] = useState(false);
  const [hasPrinted, setHasPrinted] = useState(false);
  const [message, setMessage] = useState('Memeriksa layanan cetak lokal...');
  const inFlight = useRef(false);

  useEffect(() => {
    if (!sessionId) {
      router.replace('/');
      return;
    }
    let active = true;
    printer.checkPrinterStatus().then((status) => {
      if (!active) return;
      setBridgeConnected(true);
      setMessage(`${status.printer} terhubung. Siapkan satu lembar glossy A5.`);
    }).catch((error) => {
      if (!active) return;
      setBridgeConnected(false);
      setMessage(error instanceof Error ? error.message : 'Layanan cetak tidak tersedia.');
    }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [sessionId, router]);

  useEffect(() => {
    if (!sessionId || composedPhotoBase64) return;
    let active = true;
    let url: string | null = null;
    storageService.getLatestLocalPhoto(sessionId).then((blob) => {
      if (!active || !blob) return;
      url = URL.createObjectURL(blob);
      setRestoredPhotoUrl(url);
    }).catch((error) => console.warn('Foto lokal tidak dapat dipulihkan:', error));
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [sessionId, composedPhotoBase64]);

  const checkAgain = async () => {
    setChecking(true);
    try {
      const status = await printer.checkPrinterStatus();
      setBridgeConnected(true);
      setMessage(`${status.printer} terhubung. Siapkan satu lembar glossy A5.`);
    } catch (error) {
      setBridgeConnected(false);
      setMessage(error instanceof Error ? error.message : 'Layanan cetak tidak tersedia.');
    } finally {
      setChecking(false);
    }
  };

  const handlePrint = async () => {
    if (inFlight.current || hasPrinted || !sessionId) return;
    const imageDataUrl = composedPhotoBase64 || composedPhotoBlobUrl || restoredPhotoUrl;
    if (!imageDataUrl) {
      toast.error('Foto belum siap untuk dicetak. Kembali ke langkah edit foto.');
      return;
    }
    inFlight.current = true;
    setIsPrinting(true);
    setMessage('Mengirim dua strip ke printer...');
    try {
      const result = await printer.printPhoto({ imageDataUrl, sessionId });
      if (!result.accepted) throw new Error('Pekerjaan cetak belum diterima.');
      setHasPrinted(true);
      setMessage(result.already_sent
        ? 'Sesi ini sudah pernah dikirim ke printer. Periksa hasil cetak atau antrean printer.'
        : 'Pekerjaan diterima antrean printer. Ambil hasil dua strip setelah kertas keluar.');
      try {
        await sessionRepository.markAsPrinted(sessionId);
        await sessionRepository.updateStage(sessionId, 'PRINTED');
      } catch (error) {
        console.error('Gagal memperbarui status sesi setelah pekerjaan diterima printer:', error);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Gagal mengirim pekerjaan cetak.';
      setMessage(detail);
      toast.error(detail);
    } finally {
      inFlight.current = false;
      setIsPrinting(false);
    }
  };

  return (
    <MainLayout step={6} footerHint="Satu sesi mendapat dua strip sekitar 6 × 18 cm pada satu lembar A5 glossy.">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4">
        <PageTitle
          title={hasPrinted ? 'Foto Dikirim ke Printer' : 'Cetak Foto Booth'}
          subtitle="Dua strip sekitar 6 × 18 cm dicetak langsung melalui Canon pada satu lembar A5 glossy."
        />

        <div className="grid gap-6 md:grid-cols-[1fr_1fr]">
          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-gray-500">
              <span>Pratinjau hasil</span>
              <span>2 strip · 6 × 18 cm</span>
            </div>
            <div className="mx-auto flex aspect-[148.5/210] max-h-[480px] items-center justify-center rounded-xl border border-gray-200 bg-white p-[8%] shadow-inner">
              {photo ? (
                <div className="flex h-full max-h-[400px] aspect-[2/3] overflow-hidden border border-gray-200">
                  <img src={photo} alt="Strip pertama" className="h-full w-1/2 object-fill" />
                  <img src={photo} alt="Strip kedua" className="h-full w-1/2 border-l border-dashed border-gray-400 object-fill" />
                </div>
              ) : <span className="text-sm text-gray-400">Foto belum siap</span>}
            </div>
            <p className="mt-4 text-center text-xs text-gray-500">Kertas A5 148,5 × 210 mm · dua strip sekitar 6 × 18 cm</p>
          </div>

          <div className="flex flex-col gap-5 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${hasPrinted ? 'bg-green-100 text-green-700' : 'bg-pink-100 text-[#E6007A]'}`}>
                {hasPrinted ? <CheckCircle /> : <Printer />}
              </div>
              <div>
                <h2 className="font-bold text-gray-900">{hasPrinted ? 'Pekerjaan cetak terkirim' : 'Printer Canon iP2700 series'}</h2>
                <p className="text-xs text-gray-500">Cetak langsung tanpa dialog Chrome</p>
              </div>
            </div>

            <p role="status" className={`rounded-xl p-3 text-sm ${bridgeConnected || hasPrinted ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900'}`}>
              {message}
            </p>

            <div className="rounded-xl border border-pink-100 bg-pink-50 p-4 text-sm text-gray-700">
              <div className="mb-2 flex items-center gap-2 font-semibold text-[#E6007A]"><Scissors size={17} /> Persiapan kertas</div>
              <ol className="list-inside list-decimal space-y-1 text-xs leading-relaxed">
                <li>Potong A4 menjadi dua lembar A5 sebelum sesi dimulai.</li>
                <li>Masukkan A5 glossy ke tray Canon dengan sisi cetak sesuai petunjuk printer.</li>
                <li>Tekan Cetak Foto. Satu lembar A5 menghasilkan dua strip.</li>
              </ol>
            </div>

            <div className="mt-auto flex flex-col gap-3">
              <button type="button" onClick={handlePrint} disabled={!bridgeConnected || checking || isPrinting || hasPrinted || !photo}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#E6007A] px-5 py-3 font-semibold text-white transition hover:bg-[#c80069] disabled:cursor-not-allowed disabled:bg-gray-300">
                {hasPrinted ? <><CheckCircle size={18} /> Sudah dikirim ke printer</> : <><Printer size={18} /> {isPrinting ? 'Mengirim...' : 'Cetak Foto'}</>}
              </button>
              {!bridgeConnected && !hasPrinted && <button type="button" onClick={checkAgain} disabled={checking} className="flex items-center justify-center gap-2 rounded-2xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 disabled:opacity-50"><RefreshCw size={16} /> Periksa lagi</button>}
              <button type="button" onClick={() => router.replace('/thank-you')} disabled={!hasPrinted}
                className="w-full rounded-2xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400">Selesai</button>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
