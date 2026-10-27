'use client';

import { useEffect } from 'react';
import { DeviceService } from '@/services/device_service';

const deviceService = new DeviceService();

export default function DeviceHeartbeat() {
  useEffect(() => {
    // Jalankan heartbeat periodik tiap 25 detik ke Firestore
    const stop = deviceService.startHeartbeat(25000);
    return () => {
      stop();
    };
  }, []);

  return null;
}
