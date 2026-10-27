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
  /** Status apakah pembuatan Boomerang Ping-Pong GIF sedang berlangsung di background */
  isBoomerangGenerating: boolean;
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
  setIsBoomerangGenerating: (isGenerating: boolean) => void;
  setEmail: (email: string | null) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
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
      isBoomerangGenerating: false,
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
      setIsBoomerangGenerating: (isGenerating) => set({ isBoomerangGenerating: isGenerating }),
      setEmail: (email) => set({ email }),
      reset: () => {
        const state = get();
        if (state.boomerangGifBlobUrl) {
          try {
            URL.revokeObjectURL(state.boomerangGifBlobUrl);
          } catch {
            // ignore
          }
        }
        if (state.composedPhotoBlobUrl) {
          try {
            URL.revokeObjectURL(state.composedPhotoBlobUrl);
          } catch {
            // ignore
          }
        }
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
          isBoomerangGenerating: false,
          email: null,
        });
      },
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
