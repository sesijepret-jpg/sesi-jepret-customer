const BRIDGE_URL = (process.env.NEXT_PUBLIC_CANON_BRIDGE_URL || 'http://127.0.0.1:8765').replace(/\/$/, '');

export interface PrintStatus {
  ready: boolean;
  printer: string;
}

export interface PrintResult {
  accepted: boolean;
  already_sent: boolean;
}

export class PrintBridgeError extends Error {}

async function parseError(response: Response): Promise<PrintBridgeError> {
  try {
    const data = await response.json();
    return new PrintBridgeError(data.error || `Printer gagal (${response.status})`);
  } catch {
    return new PrintBridgeError(`Printer gagal (${response.status})`);
  }
}

export class PrintService {
  async checkPrinterStatus(): Promise<PrintStatus> {
    try {
      const response = await fetch(`${BRIDGE_URL}/print-status`, {
        cache: 'no-store', signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw await parseError(response);
      return response.json();
    } catch (error) {
      if (error instanceof PrintBridgeError) throw error;
      throw new PrintBridgeError('Layanan cetak lokal belum berjalan. Jalankan ulang SesiJepret Camera Bridge pada komputer printer.');
    }
  }

  async printPhoto(params: { imageDataUrl: string; sessionId: string }): Promise<PrintResult> {
    const response = await fetch(params.imageDataUrl);
    const image = await response.blob();
    try {
      const printResponse = await fetch(`${BRIDGE_URL}/print`, {
        method: 'POST',
        headers: {
          'Content-Type': 'image/png',
          'X-SesiJepret-Bridge': '1',
          'X-SesiJepret-Session': params.sessionId,
        },
        body: image,
        cache: 'no-store',
        signal: AbortSignal.timeout(120000),
      });
      if (!printResponse.ok) throw await parseError(printResponse);
      return printResponse.json();
    } catch (error) {
      if (error instanceof PrintBridgeError) throw error;
      throw new PrintBridgeError('Koneksi ke printer lokal terputus. Periksa bridge dan antrean cetak sebelum mencoba lagi.');
    }
  }
}
