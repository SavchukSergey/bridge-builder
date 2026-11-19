/**
 * Game sound, synthesized with the Web Audio API (no audio files): member snaps, creaks under
 * heavy load, truck engines and horns, splashes, a win/lose jingle, and a quiet ambience of
 * wind (and water where there is a river).
 *
 * Browsers only allow audio after a user gesture, so nothing plays until {@link Sound.unlock}
 * is called from one. Without Web Audio (e.g. in tests) every method does nothing.
 */

const MASTER_VOLUME = 0.6;

/**
 * A short sound, as parts to play together: tones sliding from one pitch to another, and
 * bursts of filtered noise.
 * @typedef {{ tone: OscillatorType, from: number, to: number, at?: number, dur: number, vol: number }
 *   | { noise: BiquadFilterType, freq: number, q?: number, at?: number, dur: number, vol: number }} SoundPart
 */

/**
 * What each material sounds like when a piece of it is placed: a road slab's thunk, steel's
 * clank (light steel higher), wood's knock, a cable's zip, a winch's ratchet.
 * @type {Record<string, SoundPart[]>}
 */
export const PLACE_SOUNDS = {
  road: [{ tone: "sine", from: 140, to: 70, dur: 0.18, vol: 0.3 }, { noise: "lowpass", freq: 600, dur: 0.12, vol: 0.12 }],
  rail: [{ tone: "sine", from: 130, to: 70, dur: 0.16, vol: 0.25 }, { tone: "triangle", from: 1500, to: 1450, at: 0.02, dur: 0.3, vol: 0.05 }],
  steel: [{ tone: "triangle", from: 620, to: 560, dur: 0.22, vol: 0.12 }, { noise: "bandpass", freq: 2200, q: 6, dur: 0.08, vol: 0.18 }],
  "steel-light": [{ tone: "triangle", from: 1050, to: 980, dur: 0.16, vol: 0.1 }, { noise: "bandpass", freq: 3200, q: 6, dur: 0.06, vol: 0.14 }],
  wood: [{ tone: "sine", from: 320, to: 190, dur: 0.1, vol: 0.28 }, { noise: "bandpass", freq: 900, q: 2, dur: 0.05, vol: 0.18 }],
  cable: [{ tone: "sawtooth", from: 260, to: 900, dur: 0.14, vol: 0.04 }, { noise: "highpass", freq: 3000, dur: 0.12, vol: 0.06 }],
  "cable-thin": [{ tone: "sawtooth", from: 420, to: 1500, dur: 0.1, vol: 0.035 }, { noise: "highpass", freq: 4500, dur: 0.08, vol: 0.05 }],
  winch: [0, 0.06, 0.12].map(at => ({ noise: /** @type {BiquadFilterType} */ ("bandpass"), freq: 2600, q: 4, at, dur: 0.035, vol: 0.2 })),
};

/**
 * Extra parts of a break, for the materials that break their own way: wood splinters in a
 * run of cracks, light steel pings higher than steel, and rail rings.
 * @type {Record<string, SoundPart[]>}
 */
export const BREAK_SOUNDS = {
  wood: [0, 0.05, 0.11, 0.2].map((at, i) => ({ noise: /** @type {BiquadFilterType} */ ("bandpass"), freq: 700 + 250 * i, q: 1.5, at, dur: 0.07, vol: 0.3 - 0.05 * i })),
  "steel-light": [{ tone: "triangle", from: 2400, to: 900, dur: 0.3, vol: 0.07 }],
  rail: [{ tone: "triangle", from: 1300, to: 1250, dur: 0.9, vol: 0.06 }],
  winch: [{ tone: "sawtooth", from: 700, to: 90, dur: 0.4, vol: 0.06 }],
};

export class Sound {
  /** @type {AudioContext | undefined} */
  ctx = undefined;
  /** @type {GainNode | undefined} */
  master = undefined;
  /** @type {AudioBuffer | undefined} */
  noise = undefined;
  muted = false;
  /** 0..1, scales everything. */
  volume = 1;

  /** @type {{ osc: OscillatorNode[], gain: GainNode, filter: BiquadFilterNode } | undefined} */
  __engine = undefined;
  /** @type {{ src: AudioBufferSourceNode, hum: OscillatorNode, gain: GainNode } | undefined} */
  __rumble = undefined;
  /** @type {{ wind: GainNode, water: GainNode } | undefined} */
  __ambience = undefined;
  __lastCreak = 0;

  /**
   * Creates the audio graph; call from a user gesture (click, key press).
   */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AudioCtx = globalThis.AudioContext ?? /** @type {any} */ (globalThis).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.__level();
    this.master.connect(ctx.destination);

    // two seconds of white noise, reused by every noisy sound
    const length = 2 * ctx.sampleRate;
    this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

    this.__startAmbience();
  }

  /** @param {boolean} muted */
  setMuted(muted) {
    this.muted = muted;
    this.__applyLevel();
  }

  /** @param {number} volume - 0..1 */
  setVolume(volume) {
    this.volume = Math.min(1, Math.max(0, volume));
    this.__applyLevel();
  }

  __level() {
    return this.muted ? 0 : MASTER_VOLUME * this.volume;
  }

  __applyLevel() {
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.__level(), this.ctx.currentTime, 0.05);
  }

  /**
   * How loud the river is: 0 on a level without water.
   * @param {number} level - 0..1
   */
  setWater(level) {
    if (!this.ctx || !this.__ambience) return;
    this.__ambience.water.gain.setTargetAtTime(0.05 * level, this.ctx.currentTime, 0.5);
  }

  /**
   * A member snapping: a sharp crack and, for heavier members, a low thump.
   * @param {"deck" | "beam" | "cable"} kind
   * @param {number} size - ~0.5 (cable) to ~1.6 (deck)
   * @param {string} [material] - its material id, for the ones that break their own way
   */
  snap(kind, size, material = "") {
    const { ctx } = this;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.__play(BREAK_SOUNDS[material] ?? [], t);
    if (material === "wood") {
      // wood doesn't ping or twang: its splinters and a dull thump
      this.__tone("sine", 110, 45, t, 0.3, 0.3 * size);
      return;
    }
    const crack = this.__noiseSource(t, 0.25);
    const band = ctx.createBiquadFilter();
    band.type = kind === "cable" ? "highpass" : "bandpass";
    band.frequency.value = kind === "cable" ? 2500 : kind === "beam" ? 1800 : 900;
    band.Q.value = kind === "beam" ? 3 : 0.8;
    const gain = this.__envelope(t, 0.002, kind === "cable" ? 0.12 : 0.22, 0.5 * Math.min(1, 0.5 + size / 2));
    crack.connect(band).connect(gain).connect(/** @type {GainNode} */ (this.master));

    if (kind === "beam") this.__tone("triangle", 1200 + Math.random() * 600, 300, t, 0.25, 0.08); // ping
    if (kind === "cable") this.__tone("sawtooth", 900, 120, t, 0.18, 0.06); // twang
    this.__tone("sine", 90, 40, t, 0.35, 0.35 * size); // thump
  }

  /**
   * A low groan from a member near its limit. Rate-limited, so it can be called every frame.
   * @param {number} load - utilization of the most loaded member, 0..1
   */
  creak(load) {
    const { ctx } = this;
    if (!ctx || load < 0.7) return;
    const t = ctx.currentTime;
    const gap = 1.4 - load; // more often near the limit
    if (t - this.__lastCreak < gap + Math.random() * 0.4) return;
    this.__lastCreak = t;

    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    const f = 70 + Math.random() * 60;
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.linearRampToValueAtTime(f * (0.8 + Math.random() * 0.5), t + 0.5);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 300 + Math.random() * 300;
    band.Q.value = 6;
    const gain = this.__envelope(t, 0.08, 0.5, 0.12 * Math.min(1, (load - 0.7) / 0.3 + 0.3));
    osc.connect(band).connect(gain).connect(/** @type {GainNode} */ (this.master));
    osc.start(t);
    osc.stop(t + 0.7);
  }

  /**
   * Truck engines: a diesel rumble whose loudness follows how many trucks are driving.
   * @param {number} driving - number of trucks moving
   */
  engines(driving) {
    const { ctx } = this;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (!this.__engine && driving > 0) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 260;
      filter.Q.value = 2;
      const osc = [48, 50.5, 97].map((f, i) => {
        const o = ctx.createOscillator();
        o.type = i === 2 ? "square" : "sawtooth";
        o.frequency.value = f;
        o.connect(filter);
        o.start();
        return o;
      });
      filter.connect(gain).connect(/** @type {GainNode} */ (this.master));
      this.__engine = { osc, gain, filter };
    }
    if (!this.__engine) return;
    const level = driving ? 0.05 + 0.03 * Math.min(4, driving) : 0;
    this.__engine.gain.gain.setTargetAtTime(level, t, 0.3);
    if (!driving) {
      const engine = this.__engine;
      this.__engine = undefined;
      for (const o of engine.osc) o.stop(t + 1.5);
    }
  }

  /**
   * An earthquake's deep rumble, following how hard the ground shakes.
   * @param {number} strength - 0 (still) to 1 (a big earthquake at its strongest)
   */
  rumble(strength) {
    const { ctx } = this;
    if (!ctx || !this.noise) return;
    const t = ctx.currentTime;
    if (!this.__rumble && strength > 0.01) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 110;
      filter.Q.value = 1.2;
      const hum = ctx.createOscillator();
      hum.type = "sine";
      hum.frequency.value = 38;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain);
      hum.connect(gain);
      gain.connect(/** @type {GainNode} */ (this.master));
      src.start();
      hum.start();
      this.__rumble = { src, hum, gain };
    }
    if (!this.__rumble) return;
    this.__rumble.gain.gain.setTargetAtTime(0.35 * Math.min(1, strength), t, 0.25);
    if (strength <= 0.01) {
      const { src, hum } = this.__rumble;
      this.__rumble = undefined;
      src.stop(t + 1.5);
      hum.stop(t + 1.5);
    }
  }

  /** A truck reached the flag: a short two-note air horn. */
  horn() {
    const { ctx } = this;
    if (!ctx) return;
    const t = ctx.currentTime;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1800;
    const gain = this.__envelope(t, 0.02, 0.45, 0.09);
    filter.connect(gain).connect(/** @type {GainNode} */ (this.master));
    for (const f of [311, 392]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.connect(filter);
      o.start(t);
      o.stop(t + 0.5);
    }
  }

  /**
   * Something hitting the water.
   * @param {number} size - 1 for a truck
   */
  splash(size) {
    const { ctx } = this;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = this.__noiseSource(t, 1.4);
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.setValueAtTime(3000, t);
    low.frequency.exponentialRampToValueAtTime(250, t + 1.1);
    const gain = this.__envelope(t, 0.01, 1.1 * Math.sqrt(size), 0.45 * Math.min(1, size));
    src.connect(low).connect(gain).connect(/** @type {GainNode} */ (this.master));
    this.__tone("sine", 70, 35, t, 0.5, 0.3 * size);
  }

  /**
   * A heavy landing on the ground.
   * @param {number} size
   */
  thud(size) {
    const { ctx } = this;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.__tone("sine", 75, 30, t, 0.4, 0.4 * size);
    const src = this.__noiseSource(t, 0.4);
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 500;
    src.connect(low).connect(this.__envelope(t, 0.005, 0.3, 0.3 * size)).connect(/** @type {GainNode} */ (this.master));
  }

  /**
   * A piece was placed: the sound of its material ({@link PLACE_SOUNDS}).
   * @param {string} material - material id
   */
  place(material) {
    const { ctx } = this;
    if (!ctx) return;
    this.__play(PLACE_SOUNDS[material] ?? PLACE_SOUNDS.steel, ctx.currentTime);
  }

  /**
   * Plays the parts of a sound together.
   * @param {SoundPart[]} parts
   * @param {number} t
   */
  __play(parts, t) {
    const ctx = /** @type {AudioContext} */ (this.ctx);
    for (const part of parts) {
      const at = t + (part.at ?? 0);
      if ("tone" in part) {
        this.__tone(part.tone, part.from, part.to, at, part.dur, part.vol);
      } else {
        const src = this.__noiseSource(at, part.dur + 0.05);
        const filter = ctx.createBiquadFilter();
        filter.type = part.noise;
        filter.frequency.value = part.freq;
        filter.Q.value = part.q ?? 0.8;
        src.connect(filter).connect(this.__envelope(at, 0.003, part.dur, part.vol)).connect(/** @type {GainNode} */ (this.master));
      }
    }
  }

  /** @param {boolean} won */
  jingle(won) {
    const { ctx } = this;
    if (!ctx) return;
    const t = ctx.currentTime + 0.1;
    const notes = won ? [523.25, 659.25, 783.99, 1046.5] : [392, 349.23, 311.13, 261.63];
    notes.forEach((f, i) => this.__tone(won ? "triangle" : "sine", f, f, t + i * (won ? 0.11 : 0.18), won ? 0.5 : 0.45, 0.12));
  }

  __startAmbience() {
    const ctx = /** @type {AudioContext} */ (this.ctx);
    const loop = (/** @type {number} */ freq, /** @type {BiquadFilterType} */ type, /** @type {number} */ q) => {
      const src = ctx.createBufferSource();
      src.buffer = /** @type {AudioBuffer} */ (this.noise);
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(/** @type {GainNode} */ (this.master));
      src.start();
      return { gain, filter };
    };
    const wind = loop(380, "lowpass", 0.7);
    const water = loop(900, "bandpass", 0.6);
    this.__ambience = { wind: wind.gain, water: water.gain };

    // gusts: a slow wobble on the wind's volume and pitch
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const depth = ctx.createGain();
    depth.gain.value = 0.012;
    lfo.connect(depth).connect(wind.gain.gain);
    const sweep = ctx.createGain();
    sweep.gain.value = 140;
    lfo.connect(sweep).connect(wind.filter.frequency);
    lfo.start();
    wind.gain.gain.setTargetAtTime(0.022, ctx.currentTime, 1.5);
  }

  /**
   * @param {number} t
   * @param {number} duration
   */
  __noiseSource(t, duration) {
    const ctx = /** @type {AudioContext} */ (this.ctx);
    const src = ctx.createBufferSource();
    src.buffer = /** @type {AudioBuffer} */ (this.noise);
    src.start(t, Math.random() * 1.5);
    src.stop(t + duration);
    return src;
  }

  /**
   * A gain node that rises over `attack` and decays over `decay` seconds.
   * @param {number} t
   * @param {number} attack
   * @param {number} decay
   * @param {number} peak
   */
  __envelope(t, attack, decay, peak) {
    const ctx = /** @type {AudioContext} */ (this.ctx);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return gain;
  }

  /**
   * A tone sliding from one frequency to another.
   * @param {OscillatorType} type
   * @param {number} from
   * @param {number} to
   * @param {number} t
   * @param {number} duration
   * @param {number} peak
   */
  __tone(type, from, to, t, duration, peak) {
    const ctx = /** @type {AudioContext} */ (this.ctx);
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + duration);
    osc.connect(this.__envelope(t, 0.005, duration, peak)).connect(/** @type {GainNode} */ (this.master));
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }
}
