import { defaultGameConfig } from "../gameConfig/defaultGameConfig.js";

const cfg = defaultGameConfig.components.audio;

// Every sound is synthesised with Web Audio, so the build ships no audio files. Output goes through
// the framework's AudioListener, so its mute / pause / isSoundEnabled handling applies here too.

const midi = (note) => 440 * 2 ** ((note - 69) / 12);

// A minor, drifting through i - VI - III - VII: calm, a little mysterious.
const CHORDS = [
  [45, 52, 57, 60],
  [41, 48, 53, 57],
  [48, 55, 60, 64],
  [43, 50, 55, 59]
];
const BAR = 6.4; // seconds per chord
const SCALE = [69, 72, 74, 76, 79, 81, 84]; // A minor pentatonic for the music-box line

function noiseBuffer(ctx, seconds) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Pinkish noise: water sounds soft rather than hissing.
  let b0 = 0,
    b1 = 0,
    b2 = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.099046;
    b1 = 0.963 * b1 + white * 0.2965164;
    b2 = 0.57 * b2 + white * 1.0526913;
    data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.2;
  }
  return buffer;
}

export class GameAudio {
  constructor(listener) {
    this.ctx = listener.context;
    this.output = this.ctx.createGain();
    this.output.connect(listener.getInput());
    this.started = false;
    this.pourLevel = 0;

    this.musicBus = this.gain(0, this.output);
    this.fxBus = this.gain(cfg.effectsVolume, this.output);
    this.noise = noiseBuffer(this.ctx, 2);

    const unlock = () => {
      if (this.ctx.state !== "running") this.ctx.resume();
      this.start();
    };
    for (const type of ["pointerdown", "touchend", "keydown"]) window.addEventListener(type, unlock, { passive: true });
    // Browsers that allow autoplay (or a context the framework already resumed) need no gesture.
    this.ctx.addEventListener("statechange", () => this.ctx.state === "running" && this.start());
    if (this.ctx.state === "running") this.start();
  }

  gain(value, destination) {
    const node = this.ctx.createGain();
    node.gain.value = value;
    if (destination) node.connect(destination);
    return node;
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.buildPour();
    this.buildMusic();
  }

  // ── Pour ──────────────────────────────────────────────────────────────────
  // A quiet high trickle plus small bubble pops whose pitch climbs as the beaker fills, the way a
  // filling glass rises in tone. A slow random wobble keeps it from sounding static.

  buildPour() {
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;

    this.pourGain = this.gain(0, this.fxBus);
    // Thin, high trickle only; a wide low band is what made it sound like a waterfall.
    this.streamFilter = ctx.createBiquadFilter();
    this.streamFilter.type = "bandpass";
    this.streamFilter.frequency.value = 3200;
    this.streamFilter.Q.value = 1.4;
    source.connect(this.streamFilter).connect(this.pourGain);
    source.start();
  }

  /** Per frame: `pour` is the current pour strength (0..1), `fill` how full the mixer is (0..1). */
  update(dt, pour, fill) {
    if (!this.started || !this.pourGain) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(cfg.enabled ? cfg.musicVolume : 0, t, 0.4);
    this.fxBus.gain.setTargetAtTime(cfg.enabled ? cfg.effectsVolume : 0, t, 0.05);

    const target = pour > 0.01 ? 0.35 + 0.65 * Math.sqrt(pour) : 0;
    // Quick attack, softer release so the tail of a pour trickles out.
    this.pourLevel += (target - this.pourLevel) * Math.min(1, dt * (target > this.pourLevel ? 18 : 6));
    const wobble = Math.sin(t * 7.3) * 0.12 + Math.sin(t * 2.9 + 1) * 0.1;
    this.pourGain.gain.setTargetAtTime(this.pourLevel * cfg.pourVolume * 0.22 * (1 + wobble), t, 0.03);
    this.streamFilter.frequency.setTargetAtTime(2600 + 900 * fill + 400 * wobble, t, 0.05);

    // Bubbles popping where the stream lands: what makes the noise read as water.
    this.bubbleClock = (this.bubbleClock ?? 0) - dt * (pour > 0.01 ? 14 + 22 * pour : 0);
    while (this.bubbleClock < 0) {
      this.bubbleClock += 0.4 + Math.random() * 1.2;
      this.bubble(t + Math.random() * 0.03, 700 + 1200 * fill + Math.random() * 600, 0.04 + 0.05 * pour);
    }
  }

  /** A single bubble: a short sine whose pitch rises as it resonates and dies away. */
  bubble(time, frequency, volume) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const duration = 0.03 + Math.random() * 0.05;
    osc.frequency.setValueAtTime(frequency, time);
    osc.frequency.exponentialRampToValueAtTime(frequency * (1.5 + Math.random() * 0.8), time + duration);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(volume * cfg.pourVolume, time + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(env).connect(this.fxBus);
    osc.start(time);
    osc.stop(time + duration + 0.02);
  }

  // ── Background music ──────────────────────────────────────────────────────
  // A sparse music-box melody over a slow chord loop, scheduled a little ahead. No sustained tones.

  buildMusic() {
    const ctx = this.ctx;
    this.echo = ctx.createDelay(1);
    this.echo.delayTime.value = 0.42;
    const feedback = this.gain(0.35, this.echo);
    this.echo.connect(feedback);
    this.echo.connect(this.gain(0.5, this.musicBus));

    this.bar = 0;
    this.nextBar = ctx.currentTime + 0.1;
    this.schedule();
    this.scheduler = setInterval(() => this.schedule(), 250);
  }

  schedule() {
    const ctx = this.ctx;
    while (this.nextBar < ctx.currentTime + 1) {
      const chord = CHORDS[this.bar % CHORDS.length];
      // A soft low bell marks each chord instead of a sustained pad.
      this.bell(this.nextBar, midi(chord[0] + 12), 0.035, 3, this.musicBus, this.echo);
      // Three or four notes per bar, on eighth-note slots, leaning on chord tones.
      const slots = [0, 2, 3, 5, 6, 8, 10, 11, 13, 14].sort(() => Math.random() - 0.5).slice(0, 3 + (this.bar % 2));
      for (const slot of slots) {
        const tone =
          Math.random() < 0.6
            ? chord[1 + Math.floor(Math.random() * 3)] + 24
            : SCALE[Math.floor(Math.random() * SCALE.length)];
        this.bell(this.nextBar + (slot * BAR) / 16, midi(tone), 0.05, 1.6, this.musicBus, this.echo);
      }
      this.bar++;
      this.nextBar += BAR;
    }
  }

  /** A struck bell / music-box note: sine with an inharmonic overtone and a long decay. */
  bell(time, frequency, volume, decay, destination, send) {
    const ctx = this.ctx;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(volume, time + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, time + decay);
    env.connect(destination);
    if (send) env.connect(send);
    for (const [ratio, level] of [
      [1, 1],
      [2.76, 0.25],
      [5.4, 0.08]
    ]) {
      const osc = ctx.createOscillator();
      osc.frequency.value = frequency * ratio;
      const g = this.gain(level, env);
      osc.connect(g);
      osc.start(time);
      osc.stop(time + decay + 0.05);
    }
  }

  // ── One-shots ─────────────────────────────────────────────────────────────

  /** Glass lifted: a light clink. */
  pick() {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    this.bell(t, 2350 + Math.random() * 200, 0.12, 0.35, this.fxBus);
    this.bell(t + 0.045, 3150 + Math.random() * 200, 0.05, 0.25, this.fxBus);
  }

  /** Level passed: a rising arpeggio of chimes and a shimmer; more stars, more notes. */
  win(stars = 3) {
    if (!this.started) return;
    const t = this.ctx.currentTime + 0.02;
    const notes = [72, 76, 79, 84, 88].slice(0, 2 + stars);
    notes.forEach((note, i) => this.bell(t + i * 0.11, midi(note), 0.22, 1.4, this.fxBus, this.echo));
    const end = t + notes.length * 0.11;
    [84, 88, 91].forEach((note) => this.bell(end, midi(note), 0.1, 2.2, this.fxBus, this.echo));
    this.shimmer(end, 1.2);
  }

  /** Level failed: two soft falling tones, disappointed rather than harsh. */
  lose() {
    if (!this.started) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    [
      [64, 0],
      [59, 0.32]
    ].forEach(([note, offset]) => {
      const start = t + offset;
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(midi(note), start);
      osc.frequency.exponentialRampToValueAtTime(midi(note - 2), start + 0.45);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1400;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, start);
      env.gain.linearRampToValueAtTime(0.28, start + 0.03);
      env.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
      osc.connect(filter).connect(env).connect(this.fxBus);
      osc.start(start);
      osc.stop(start + 0.65);
    });
  }

  /** Airy sparkle: high-passed noise with a quick swell and fade. */
  shimmer(time, duration) {
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 6000;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(0.08, time + 0.1);
    env.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter).connect(env).connect(this.fxBus);
    source.start(time);
    source.stop(time + duration + 0.05);
  }
}
