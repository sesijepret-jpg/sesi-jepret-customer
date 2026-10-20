const BRIDGE_URL = (process.env.NEXT_PUBLIC_CANON_BRIDGE_URL || 'http://127.0.0.1:8765').replace(/\/$/, '');

async function bridgeError(response: Response): Promise<Error> {
  try {
    const body = await response.json();
    return new Error(body.error || `Kamera tidak siap (${response.status})`);
  } catch {
    return new Error(`Kamera tidak siap (${response.status})`);
  }
}

export async function checkCanonCamera(): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${BRIDGE_URL}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new Error('Kamera lokal belum terhubung. Jalankan SesiJepret Camera Bridge dan izinkan akses jaringan lokal untuk website ini di browser.');
  }
  if (!response.ok) throw await bridgeError(response);
}

export async function getCanonPreview(signal?: AbortSignal): Promise<Blob> {
  const timeout = AbortSignal.timeout(5000);
  const response = await fetch(`${BRIDGE_URL}/preview`, {
    cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) throw await bridgeError(response);
  return response.blob();
}

export async function captureCanonPhoto(): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(`${BRIDGE_URL}/capture`, {
      method: 'POST',
      headers: { 'X-SesiJepret-Bridge': '1' },
      cache: 'no-store',
      signal: AbortSignal.timeout(35000),
    });
  } catch {
    throw new Error('Koneksi ke aplikasi kamera lokal terputus.');
  }
  if (!response.ok) throw await bridgeError(response);
  if (!response.headers.get('content-type')?.startsWith('image/jpeg')) {
    throw new Error('Aplikasi kamera tidak mengirim file JPEG.');
  }
  const blob = await response.blob();
  if (blob.size < 100_000) throw new Error('File JPEG kamera tidak lengkap.');
  return blob;
}

export function photoBlobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Gagal membaca JPEG kamera.'));
    reader.readAsDataURL(blob);
  });
}
