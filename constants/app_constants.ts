export const AppConstants = {
  // App Info
  appName: 'Sesijepret Photo Booth',
  appTagline: 'Capture Your Moments',

  // Timer Durations (in seconds) — defaults, overridden by Firestore /settings/config
  sessionTimerSeconds: 600, // 10 minutes
  thankYouScreenSeconds: 5, // 5 seconds auto-return
  splashScreenSeconds: 1, // Splash duration
  photoCountdownSeconds: 5, // 5-4-3-2-1 countdown
  inactivityTimeoutSeconds: 120, // 2 min inactivity reset

  // Photo Slots
  maxPhotoSlots: 4, // 4 slot foto per sesi

  // Routes
  routeSplash: '/',
  routeWelcome: '/welcome',
  routeInputCode: '/input-code',
  routeRules: '/rules',
  routeSelectTemplate: '/select-template',
  routeSelectCamera: '/select-camera',
  routePhotoSession: '/photo-session',
  routePreview: '/preview',
  routeEmail: '/email',
  routePrint: '/print',
  routeThankYou: '/thank-you',

  // Firestore Collections
  colVouchers: 'vouchers', // renamed from 'codes'
  colCodes: 'codes',
  colTemplates: 'templates',
  colSessions: 'sessions',
  colSettings: 'settings',
  colAdmins: 'admins',

  // Firestore Settings Document
  settingsDocId: 'config',

  // Storage Paths
  storagePhotos: 'photos',
  storageExports: 'exports',
  storageTemplates: 'templates',
  storageLogos: 'logos',

  // Firebase Functions
  funcSendEmail: 'sendPhotoEmail',

  // UI Constants
  buttonMinHeight: 60.0,
  buttonBorderRadius: 8.0,
  cardBorderRadius: 24.0,
  inputBorderRadius: 8.0,
  screenPadding: 32.0,
  cardPadding: 24.0,

  // Photo Booth Standard Strip Specification (2 x 6 inch @ 300 DPI)
  photoStrip: {
    name: 'Standard Photo Booth Strip',
    widthInches: 2,
    heightInches: 6,
    widthMm: 50.8,
    heightMm: 152.4,
    widthCm: 5.08,
    heightCm: 15.24,
    widthPx: 600,
    heightPx: 1800,
    dpi: 300,
    aspectRatio: '1:3',
    // Spesifikasi untuk cetak 4R (2 strip berdampingan)
    doubleStripWidthInches: 4,
    doubleStripWidthPx: 1200,
  },

  // Aturan Penggunaan
  rules: [
    '📸  Pastikan area foto bebas dari gangguan',
    '⏱️  Sesi foto berlangsung selama 10 menit',
    '🎨  Pilih template yang tersedia sebelum memulai',
    '👤  Gunakan kamera yang paling sesuai dengan posisi Anda',
    '📷  Anda dapat mengambil foto berkali-kali selama sesi',
    '🖨️  Hasil foto dapat dicetak atau dikirim ke email Anda',
    '🔒  Data Anda aman dan hanya digunakan untuk sesi ini',
    '✅  Tekan tombol OK untuk memulai sesi foto',
  ],
} as const;
