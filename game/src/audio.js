// Audio: every sound is synthesized with WebAudio — no audio files exist.
// A shared noise buffer, a few oscillator shapes and filters cover gunshots,
// reloads, footsteps, beeps, explosions and the round stingers. Distant
// shots pass a distance (0 = at the ear) and come back quieter and duller.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.45;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return true;
  }

  function noise(dur, { freq = 1200, q = 0.8, gain = 0.5, type = 'bandpass', slideTo = 0 } = {}) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (slideTo) filter.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t + dur);
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function tone(freq, dur, { type = 'square', gain = 0.2, slideTo = 0, delay = 0 } = {}) {
    if (!ensure()) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // Gunshot voices per weapon slot; dist 0..60 m dulls and quiets them.
  const SHOT = {
    pistol: { f: 1500, g: 0.5, d: 0.11, thump: 300 },
    smg: { f: 1250, g: 0.42, d: 0.09, thump: 260 },
    rifle: { f: 1050, g: 0.6, d: 0.14, thump: 210 },
    sniper: { f: 800, g: 0.85, d: 0.3, thump: 130 },
  };

  return {
    resume: ensure,
    shot(kind, dist = 0) {
      const s = SHOT[kind] || SHOT.rifle;
      const att = 1 / (1 + dist * 0.14);
      noise(s.d, { freq: s.f * (1 - Math.min(0.5, dist * 0.012)), gain: s.g * att, slideTo: 220 });
      tone(s.thump, s.d * 0.8, { type: 'triangle', gain: 0.35 * att, slideTo: 60 });
    },
    dry() { tone(1900, 0.04, { type: 'square', gain: 0.12 }); },
    reload() {
      tone(700, 0.05, { type: 'square', gain: 0.14 });
      tone(420, 0.05, { type: 'square', gain: 0.16, delay: 0.16 });
      tone(950, 0.06, { type: 'square', gain: 0.18, delay: 0.34 });
    },
    hit(head) {
      tone(head ? 1560 : 1050, 0.07, { type: 'sine', gain: 0.3 });
      if (head) tone(2090, 0.09, { type: 'sine', gain: 0.22, delay: 0.03 });
    },
    hurt() { tone(160, 0.12, { type: 'sawtooth', gain: 0.16, slideTo: 90 }); },
    step(run) { noise(0.06, { freq: run ? 500 : 380, gain: run ? 0.1 : 0.05, type: 'lowpass' }); },
    beep(freq = 1180) { tone(freq, 0.09, { type: 'sine', gain: 0.25 }); },
    throwNade() { noise(0.16, { freq: 900, gain: 0.1, slideTo: 300 }); },
    bounce() { tone(320, 0.05, { type: 'square', gain: 0.1 }); },
    explode() {
      noise(0.7, { freq: 300, gain: 0.95, type: 'lowpass', slideTo: 50 });
      tone(90, 0.6, { type: 'sine', gain: 0.7, slideTo: 34 });
    },
    smokePop() { noise(0.35, { freq: 2000, gain: 0.2, slideTo: 500 }); },
    buy() { tone(1320, 0.06, { type: 'sine', gain: 0.2 }); tone(1760, 0.08, { type: 'sine', gain: 0.18, delay: 0.05 }); },
    denied() { tone(220, 0.1, { type: 'square', gain: 0.14 }); },
    sting(win) {
      if (win) {
        tone(523, 0.16, { type: 'triangle', gain: 0.28 });
        tone(659, 0.16, { type: 'triangle', gain: 0.28, delay: 0.13 });
        tone(784, 0.3, { type: 'triangle', gain: 0.3, delay: 0.26 });
      } else {
        tone(392, 0.18, { type: 'triangle', gain: 0.26 });
        tone(330, 0.18, { type: 'triangle', gain: 0.26, delay: 0.15 });
        tone(262, 0.34, { type: 'triangle', gain: 0.28, delay: 0.3 });
      }
    },
  };
}
