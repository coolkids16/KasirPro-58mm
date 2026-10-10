/**
 * Web Audio API synthesized sound effects for POS barcode scanner feedback.
 * Guaranteed zero-latency audio feedback across all devices (Linux, Android, Web).
 */

class SoundEffects {
  private audioCtx: AudioContext | null = null;
  private hasInitializedTouchListener = false;

  constructor() {
    this.initTouchUnlock();
  }

  private initTouchUnlock() {
    if (typeof window === 'undefined') return;
    if (this.hasInitializedTouchListener) return;

    const unlock = () => {
      try {
        const ctx = this.getContext();
        if (ctx) {
          if (ctx.state === 'suspended') {
            ctx.resume();
          }
          // Play silent buffer to fully unlock Android WebView audio context
          const buffer = ctx.createBuffer(1, 1, 22050);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.start(0);
        }
      } catch (e) {
        // Ignore unlock errors
      } finally {
        window.removeEventListener('touchstart', unlock);
        window.removeEventListener('click', unlock);
        window.removeEventListener('keydown', unlock);
      }
    };

    window.addEventListener('touchstart', unlock, { once: true, passive: true });
    window.addEventListener('click', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true, passive: true });
    this.hasInitializedTouchListener = true;
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return null;

      if (!this.audioCtx || this.audioCtx.state === 'closed') {
        this.audioCtx = new AudioCtxClass();
      }

      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
    } catch (e) {
      console.warn('AudioContext initialization error:', e);
    }
    return this.audioCtx;
  }

  /**
   * Crisp high-pitch beep for successful barcode scan (1200Hz, 0.08s)
   */
  async playScanBeep() {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, ctx.currentTime);
      
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.08);
    } catch (e) {
      console.warn('Audio play failure:', e);
    }
  }

  /**
   * Pleasant ascending two-tone chime for success / saved operations (587Hz -> 880Hz)
   */
  async playSuccess() {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.09); // A5

      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.22);
    } catch (e) {
      console.warn('Audio play failure:', e);
    }
  }

  /**
   * Low warning beep for unrecognized barcode (350Hz, 0.2s)
   */
  async playErrorBeep() {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    } catch (e) {
      console.warn('Audio play failure:', e);
    }
  }
}

export const sounds = new SoundEffects();
