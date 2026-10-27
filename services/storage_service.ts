import { ref, uploadBytes, getDownloadURL, FirebaseStorage } from 'firebase/storage';
import { storage as dbStorage } from '../lib/firebase';
import { AppConstants } from '../constants/app_constants';
import { withTimeout } from '../utils/firestore_helpers';

// ── IndexedDB Helpers for Web Local Cache ─────────────────────────────────────

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('IndexedDB is only available in browser environments.'));
      return;
    }
    const request = indexedDB.open('BoroPhotoBoothDB', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('local_photos')) {
        db.createObjectStore('local_photos');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeLocalPhoto(key: string, blob: Blob): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('local_photos', 'readwrite');
    const store = tx.objectStore('local_photos');
    store.put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getLatestLocalPhoto(sessionId: string): Promise<Blob | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('local_photos', 'readonly');
    const prefix = `${sessionId}/photo_`;
    const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`);
    const request = tx.objectStore('local_photos').openCursor(range, 'prev');
    request.onsuccess = () => resolve((request.result?.value as Blob | undefined) || null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function getLocalBoomerang(sessionId: string): Promise<Blob | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('local_photos', 'readonly');
    const key = `${sessionId}/boomerang.gif`;
    const request = tx.objectStore('local_photos').get(key);
    request.onsuccess = () => resolve((request.result as Blob | undefined) || null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function deleteLocalPhotos(prefix: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('local_photos', 'readwrite');
    const store = tx.objectStore('local_photos');
    const request = store.openKeyCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        const key = cursor.key as string;
        if (key.startsWith(prefix)) {
          store.delete(key);
        }
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function clearAllLocalPhotos(): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('local_photos', 'readwrite');
    const store = tx.objectStore('local_photos');
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── StorageService ────────────────────────────────────────────────────────────

export class StorageService {
  private readonly storage: FirebaseStorage;

  constructor(storage?: FirebaseStorage) {
    this.storage = storage || dbStorage;
  }

  /** Restore the final PNG after refreshing the print page. */
  async getLatestLocalPhoto(sessionId: string): Promise<Blob | null> {
    return getLatestLocalPhoto(sessionId);
  }

  /** Restore the Boomerang GIF after page reload or directly on email screen. */
  async getLatestLocalBoomerang(sessionId: string): Promise<Blob | null> {
    return getLocalBoomerang(sessionId);
  }

  /** Save Boomerang GIF Blob to IndexedDB cache */
  async saveBoomerangToLocalStorage(params: {
    sessionId: string;
    blob: Blob;
  }): Promise<string> {
    const { sessionId, blob } = params;
    try {
      const key = `${sessionId}/boomerang.gif`;
      await storeLocalPhoto(key, blob);
      return URL.createObjectURL(blob);
    } catch (e) {
      console.warn('[StorageService] Gagal simpan boomerang ke IndexedDB:', e);
      return URL.createObjectURL(blob);
    }
  }

  /**
   * Upload final composed photo to Firebase Storage exports/ folder.
   * Returns download URL
   */
  async uploadComposedPhoto(params: {
    sessionId: string;
    imageBytes: Uint8Array;
  }): Promise<string> {
    const { sessionId, imageBytes } = params;
    try {
      const fileName = `photo_${Date.now()}.jpg`;
      const storageRef = ref(
        this.storage,
        `${AppConstants.storageExports}/${sessionId}/${fileName}`
      );

      const blob = new Blob([imageBytes.buffer as ArrayBuffer], { type: 'image/jpeg' });
      const metadata = {
        contentType: 'image/jpeg',
        customMetadata: {
          session_id: sessionId,
          uploaded_at: new Date().toISOString(),
        },
      };

      // Batas waktu wajar — jika Firebase Storage Rules memblokir upload atau jaringan lambat,
      // fallback segera aktif tanpa membuat antrean menunggu lama.
      const uploadTask = await withTimeout(
        uploadBytes(storageRef, blob, metadata),
        7000,
        'Upload foto gagal: koneksi ke Firebase Storage timeout (7s). Menggunakan penyimpanan lokal.'
      );
      const downloadUrl = await withTimeout(
        getDownloadURL(uploadTask.ref),
        4000,
        'Gagal mendapatkan URL foto: timeout (4s).'
      );
      return downloadUrl;
    } catch (e) {
      // ── Fallback: gunakan blob URL lokal jika Firebase Storage tidak tersedia ──
      // Firebase Storage mungkin belum di-setup, CORS bermasalah, atau rules memblokir.
      // Blob URL tetap berfungsi untuk email (foto dikirim via base64 dari composedPhotoBase64).
      console.warn(
        '[StorageService] Firebase Storage gagal, menggunakan blob URL lokal sebagai fallback:',
        e instanceof Error ? e.message : e
      );
      const blob = new Blob([imageBytes.buffer as ArrayBuffer], { type: 'image/jpeg' });
      return URL.createObjectURL(blob);
    }
  }

  /**
   * Save image to local storage as well (Web equivalent using IndexedDB and Blob URLs)
   */
  async saveToLocalStorage(params: {
    sessionId: string;
    imageBytes: Uint8Array;
  }): Promise<string> {
    const { sessionId, imageBytes } = params;
    try {
      const blob = new Blob([imageBytes.buffer as ArrayBuffer], { type: 'image/png' });
      const fileName = `photo_${Date.now()}.png`;
      const key = `${sessionId}/${fileName}`;

      // Save to IndexedDB for offline persistence
      await storeLocalPhoto(key, blob);

      // Return local Object URL for instant browser rendering
      return URL.createObjectURL(blob);
    } catch (e) {
      throw new Error(`Gagal menyimpan foto lokal: ${e}`);
    }
  }

  /**
   * Delete local session files (cache cleanup)
   */
  async clearLocalSessionCache(sessionId: string): Promise<void> {
    try {
      await deleteLocalPhotos(`${sessionId}/`);
    } catch (_) {
      // Silently fail on cache cleanup
    }
  }

  /**
   * Clear all local session caches
   */
  async clearAllSessionCaches(): Promise<void> {
    try {
      await clearAllLocalPhotos();
    } catch (_) {
      // Silently fail
    }
  }
}
