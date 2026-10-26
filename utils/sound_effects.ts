/**
 * SoundEffects Utility
 *
 * Menggunakan Web Audio API sintetis untuk menghasilkan efek suara:
 * - Suara "Bip... Bip... Bip..." seiring hitungan mundur.
 * - Suara "Cekrek! 📸" rana shutter kamera saat memotret.
 *
 * Keunggulan:
 * - Tanpa file audio eksternal (0 KB, 100% offline, bebas 404).
 * - Latensi 0 ms (suara berbunyi persis saat angka countdown berganti).
 * - Kompatibel dengan semua browser modern (Chrome, Edge, Safari, Firefox).
 */
class SoundEffects {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * Suara "Bip..." ala timer hitungan mundur kamera digital
   * @param isHigh true untuk nada lebih tinggi (pada detik terakhir / angka 1)
   */
  playBeep(isHigh = false): void {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(isHigh ? 1320 : 880, now);

      // Envelope suara bip: attack cepat, decay halus tanpa bunyi 'pop'
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.3, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.13);
    } catch (e) {
      console.warn('[SoundEffects] Beep audio failed:', e);
    }
  }

  /**
   * Suara "Cekrek! 📸" rana shutter kamera mekanik (mirror flip + curtain snap)
   */
  playShutter(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;

      // 1. Klik pertama: Mirror flip (naik)
      this._click(ctx, now, 1100, 0.025);

      // 2. Klik kedua: Shutter curtain snap (60ms kemudian)
      this._click(ctx, now + 0.06, 750, 0.035);

      // 3. Noise gesekan mekanik rana kamera
      this._shutterNoise(ctx, now + 0.02, 0.09);
    } catch (e) {
      console.warn('[SoundEffects] Shutter audio failed:', e);
    }
  }

  private _click(ctx: AudioContext, time: number, freq: number, duration: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);
    osc.frequency.exponentialRampToValueAtTime(80, time + duration);

    gain.gain.setValueAtTime(0.45, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(time);
    osc.stop(time + duration);
  }

  private _shutterNoise(ctx: AudioContext, time: number, duration: number): void {
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.4));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1600;
    filter.Q.value = 1.2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(time);
    noise.stop(time + duration);
  }
}

export const soundEffects = new SoundEffects();
