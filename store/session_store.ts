import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface PhotoSlot {
  id: string;
  dataUrl: string;
}

interface SessionState {
  sessionId: string | null;
  voucherCode: string | null;
  selectedTemplateId: string | null;
  selectedTemplateName: string | null;
  capturedPhotos: PhotoSlot[];
  uploadedPhotoUrl: string | null;
  /** Base64 data URL dari foto yang sudah di-compose (untuk email & print) */
  composedPhotoBase64: string | null;
  /** Object URL dari Blob compose (untuk Preview — tidak perlu base64 besar) */
  composedPhotoBlobUrl: string | null;
  /** Base64 data URL dari Boomerang Ping-Pong GIF */
  boomerangGifBase64: string | null;
  /** Object URL dari Boomerang Ping-Pong GIF untuk preview */
  boomerangGifBlobUrl: string | null;
  email: string | null;

  setSessionId: (id: string | null) => void;
  setVoucherCode: (code: string | null) => void;
  setSelectedTemplate: (id: string | null, name: string | null) => void;
  setCapturedPhotos: (photos: PhotoSlot[]) => void;
  setUploadedPhotoUrl: (url: string | null) => void;
  setComposedPhotoBase64: (base64: string | null) => void;
  setComposedPhotoBlobUrl: (url: string | null) => void;
  setBoomerangGifBase64: (base64: string | null) => void;
  setBoomerangGifBlobUrl: (url: string | null) => void;
  setEmail: (email: string | null) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      sessionId: null,
      voucherCode: null,
      selectedTemplateId: null,
      selectedTemplateName: null,
      capturedPhotos: [],
      uploadedPhotoUrl: null,
      composedPhotoBase64: null,
      composedPhotoBlobUrl: null,
      boomerangGifBase64: null,
      boomerangGifBlobUrl: null,
      email: null,

      setSessionId: (id) => set({ sessionId: id }),
      setVoucherCode: (code) => set({ voucherCode: code }),
      setSelectedTemplate: (id, name) => set({ selectedTemplateId: id, selectedTemplateName: name }),
      setCapturedPhotos: (photos) => set({ capturedPhotos: photos }),
      setUploadedPhotoUrl: (url) => set({ uploadedPhotoUrl: url }),
      setComposedPhotoBase64: (base64) => set({ composedPhotoBase64: base64 }),
      setComposedPhotoBlobUrl: (url) => set({ composedPhotoBlobUrl: url }),
      setBoomerangGifBase64: (base64) => set({ boomerangGifBase64: base64 }),
      setBoomerangGifBlobUrl: (url) => set({ boomerangGifBlobUrl: url }),
      setEmail: (email) => set({ email }),
      reset: () =>
        set({
          sessionId: null,
          voucherCode: null,
          selectedTemplateId: null,
          selectedTemplateName: null,
          capturedPhotos: [],
          uploadedPhotoUrl: null,
          composedPhotoBase64: null,
          composedPhotoBlobUrl: null,
          boomerangGifBase64: null,
          boomerangGifBlobUrl: null,
          email: null,
        }),
    }),
    {
      name: 'boro-photo-booth-session',
      storage: createJSONStorage(() => sessionStorage),
      // composedPhotoBlobUrl tidak di-persist (Object URL tidak valid lintas page reload)
      partialize: (state) => ({
        sessionId: state.sessionId,
        voucherCode: state.voucherCode,
        selectedTemplateId: state.selectedTemplateId,
        selectedTemplateName: state.selectedTemplateName,
        // capturedPhotos TIDAK disimpan ke sessionStorage agar tidak error QuotaExceeded
        uploadedPhotoUrl: state.uploadedPhotoUrl,
        // composedPhotoBase64 TIDAK disimpan ke sessionStorage
        email: state.email,
      }),
    }
  )
);
