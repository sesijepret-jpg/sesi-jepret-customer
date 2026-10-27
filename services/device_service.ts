import { DeviceStatus } from '../types';
import { SettingsRepository } from '../repositories/settings_repository';
import { db } from '../lib/firebase';

const BRIDGE_URL = (process.env.NEXT_PUBLIC_CANON_BRIDGE_URL || 'http://127.0.0.1:8765').replace(/\/$/, '');

export interface IDeviceService {
  checkFirebase(): Promise<boolean>;
  checkInternet(): Promise<boolean>;
  checkPrinter(): Promise<boolean>;
  checkUsbCamera(): Promise<boolean>;
  checkFrontCamera(): Promise<boolean>;
  checkAll(): Promise<DeviceStatus>;
  syncToFirestore(status: DeviceStatus): Promise<void>;
  startHeartbeat(intervalMs?: number): () => void;
  watchUsbCameraStatus(
    onNext: (status: DeviceStatus) => void,
    intervalMs?: number
  ): () => void;
  lastDeviceStatus: DeviceStatus;
}

export class DeviceService implements IDeviceService {
  private readonly settingsRepo: SettingsRepository;

  lastDeviceStatus: DeviceStatus = {
    firebaseConnected: false,
    internetAvailable: false,
    printerReady: false,
    usbCameraConnected: false,
    frontCameraReady: false,
    lastChecked: new Date(),
  };

  constructor(settingsRepo?: SettingsRepository) {
    this.settingsRepo = settingsRepo || new SettingsRepository();
  }

  async checkFirebase(): Promise<boolean> {
    try {
      return (typeof navigator !== 'undefined' ? navigator.onLine : true) && db !== null;
    } catch {
      return false;
    }
  }

  async checkInternet(): Promise<boolean> {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  async checkPrinter(): Promise<boolean> {
    try {
      const res = await fetch(`${BRIDGE_URL}/print-status`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(2500),
      });
      if (res.ok) {
        const data = await res.json();
        return !!data.ready;
      }
      return false;
    } catch {
      return false;
    }
  }

  async checkUsbCamera(): Promise<boolean> {
    // 1. Cek Canon bridge terlebih dahulu (DSLR)
    try {
      const res = await fetch(`${BRIDGE_URL}/health`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(2500),
      });
      if (res.ok) return true;
    } catch {
      // Canon bridge tidak merespons, coba cek webcam USB
    }

    // 2. Cek apakah ada kamera eksternal USB via browser MediaDevices
    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
        const hasExternal = videoInputs.some((d) => {
          const label = d.label.toLowerCase();
          return label.includes('usb') || label.includes('external') || label.includes('cam');
        });
        return hasExternal || videoInputs.length > 1;
      }
    } catch {
      // mediaDevices error
    }

    return false;
  }

  async checkFrontCamera(): Promise<boolean> {
    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
        return videoInputs.length > 0;
      }
    } catch {
      // mediaDevices error
    }
    return false;
  }

  async checkAll(): Promise<DeviceStatus> {
    const [firebaseConnected, internetAvailable, printerReady, usbCameraConnected, frontCameraReady] =
      await Promise.all([
        this.checkFirebase(),
        this.checkInternet(),
        this.checkPrinter(),
        this.checkUsbCamera(),
        this.checkFrontCamera(),
      ]);

    this.lastDeviceStatus = {
      firebaseConnected,
      internetAvailable,
      printerReady,
      usbCameraConnected,
      frontCameraReady,
      lastChecked: new Date(),
    };

    return this.lastDeviceStatus;
  }

  async syncToFirestore(status: DeviceStatus): Promise<void> {
    try {
      await this.settingsRepo.updateDeviceStatus({
        usbCameraConnected: status.usbCameraConnected,
        frontCameraReady: status.frontCameraReady,
        firebaseConnected: status.firebaseConnected,
        internetAvailable: status.internetAvailable,
        printerReady: status.printerReady,
      });
    } catch (e) {
      console.warn('[DeviceService] Gagal sinkron status perangkat ke Firestore:', e);
    }
  }

  /**
   * Menjalankan heartbeat berkala untuk memperbarui status perangkat ke Firestore.
   * Dipanggil sekali saat kiosk web dibuka.
   */
  startHeartbeat(intervalMs: number = 25000): () => void {
    let timer: NodeJS.Timeout | null = null;
    let isRunning = false;

    const performSync = async () => {
      if (isRunning) return;
      isRunning = true;
      try {
        const status = await this.checkAll();
        await this.syncToFirestore(status);
      } catch (err) {
        console.warn('[DeviceService] Heartbeat loop error:', err);
      } finally {
        isRunning = false;
      }
    };

    // Jalankan sinkronisasi awal setelah 2 detik
    const initialTimer = setTimeout(performSync, 2000);

    // Jalankan periodik tiap intervalMs (default 25 detik)
    timer = setInterval(performSync, intervalMs);

    const onNetworkChange = () => {
      performSync();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', onNetworkChange);
      window.addEventListener('offline', onNetworkChange);
    }

    return () => {
      clearTimeout(initialTimer);
      if (timer) clearInterval(timer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', onNetworkChange);
        window.removeEventListener('offline', onNetworkChange);
      }
    };
  }

  watchUsbCameraStatus(
    onNext: (status: DeviceStatus) => void,
    intervalMs: number = 5000
  ): () => void {
    return this.startHeartbeat(intervalMs);
  }
}
