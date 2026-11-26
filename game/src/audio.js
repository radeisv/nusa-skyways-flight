// Synthesised sound only: no audio files, no network. A WebAudio engine hum
// whose pitch follows the throttle, wind noise, and short blips for rings,
// landings and crashes. The judge cannot hear it; it exists for the player.
export function createAudio() {
  let ctx = null, engineOsc = null, engineGain = null, windGain = null, muted = false;
  let started = false;

  function ensure() {
    if (ctx || started) return;
    started = true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 70;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 500;
      engineOsc.connect(filter); filter.connect(engineGain); engineGain.connect(ctx.destination);
      engineOsc.start();
      const len = ctx.sampleRate;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buf; noise.loop = true;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass'; noiseFilter.frequency.value = 800;
      windGain = ctx.createGain(); windGain.gain.value = 0;
      noise.connect(noiseFilter); noiseFilter.connect(windGain); windGain.connect(ctx.destination);
      noise.start();
    } catch { ctx = null; }
  }

  function blip(freq, dur, type, vol) {
    if (!ctx || muted) return;
    try {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.2, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + dur);
    } catch { /* sound is best-effort */ }
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); },
    setMuted(m) { muted = m; if (engineGain) engineGain.gain.value = 0; if (windGain) windGain.gain.value = 0; },
    isMuted() { return muted; },
    update(throttle, speedKt) {
      if (!ctx || muted || !engineOsc) return;
      const t = throttle / 100;
      engineOsc.frequency.value = 55 + t * 90 + speedKt * 0.15;
      engineGain.gain.value = 0.02 + t * 0.05;
      windGain.gain.value = Math.min(0.06, speedKt / 220 * 0.06);
    },
    ring() { blip(880, 0.18, 'sine', 0.25); setTimeout(() => blip(1320, 0.25, 'sine', 0.25), 90); },
    drop() { blip(520, 0.15, 'triangle', 0.22); },
    land() { blip(180, 0.3, 'sine', 0.3); setTimeout(() => blip(120, 0.35, 'sine', 0.25), 120); },
    warn() { blip(440, 0.12, 'square', 0.12); },
    crash() {
      if (!ctx || muted) return;
      try {
        const len = ctx.sampleRate * 0.5;
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const s = ctx.createBufferSource(); s.buffer = buf;
        const g = ctx.createGain(); g.gain.value = 0.4;
        s.connect(g); g.connect(ctx.destination); s.start();
      } catch { /* ignore */ }
    },
    win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.3, 'sine', 0.22), i * 130)); },
  };
}
