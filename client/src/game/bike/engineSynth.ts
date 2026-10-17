// The motorcycle's engine, made in code (Andrew, 2026-10-17, after hearing the stitched-together
// recordings): one continuous inline-four whose note glides with the revs. Each cylinder firing is a
// pressure pulse rung through fixed exhaust resonances (that's what makes the note change colour as
// the revs sweep), with intake roar on the throttle, a soft-clipped rasp, and pops: an ignition cut
// and bang on each upshift, a throttle blip and crackle on each downshift, the odd pop on overrun,
// and the rev limiter bouncing. At the bottom it blends into Andrew's real idle recording.
//
// Plain code with no browser parts, so the game (engineWorklet.ts) and the demo renderer
// (tools/render-engine.mts) run exactly the same sound.

export const ENGINE_RPM = { idle: 2400, redline: 16000 } as const;

/** Revs (0…1 of the redline, as shared/src/bike.ts counts them) to engine rpm. */
export const revsToRpm = (revs: number) => Math.max(ENGINE_RPM.idle, revs * ENGINE_RPM.redline);

/** How hard each cylinder fires (firing order 1-2-4-3): a little uneven, which gives the idle its lope. */
const CYLINDER = [1, 0.86, 0.95, 0.8] as const;
/** The exhaust's resonances (Hz) and how loud each rings: fixed, like a real pipe. */
const RESONANCES = [
  [95, 2.2, 0.9],
  [240, 3, 0.75],
  [560, 3.5, 0.5],
  [1150, 4, 0.32],
  [2600, 4, 0.16],
] as const;

/** Overall level: idle comes out as loud as Andrew's idle loop did (~-18 dB RMS), full throttle ~-12. */
const OUTPUT = 0.4;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A two-pole band-pass filter (RBJ biquad, constant peak gain). */
class BandPass {
  private b0: number; private b2: number; private a1: number; private a2: number;
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  constructor(sr: number, f: number, q: number) {
    const w = (2 * Math.PI * f) / sr, alpha = Math.sin(w) / (2 * q), a0 = 1 + alpha;
    this.b0 = alpha / a0;
    this.b2 = -alpha / a0;
    this.a1 = (-2 * Math.cos(w)) / a0;
    this.a2 = (1 - alpha) / a0;
  }
  run(x: number) {
    const y = this.b0 * x + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x;
    this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

export class EngineSynth {
  /** Engine speed now (rpm), gliding toward the target. */
  rpm: number = ENGINE_RPM.idle;
  private throttle = 0;
  private phase = 0;
  private cyl = 0;
  private jitter = 0;
  private pulse = 0;
  private seed: number;
  private res: BandPass[];
  private intake: BandPass;
  private mech: BandPass;
  private tone = 0;
  private dc = 0;
  private dcIn = 0;
  // Pops: a crack of noise and a low thump.
  private pop = 0;
  private thump = 0;
  private thumpPhase = 0;
  // Shifts (seconds left): ignition cut on an upshift, a blip and then crackles on a downshift.
  private cut = 0;
  private blip = 0;
  private crackle = 0;
  private limiter = 0;
  private idle: Float32Array | null = null;
  private idleRate = 1;
  private idlePos = 0;

  private sr: number;

  constructor(sr: number, seed = 1) {
    this.sr = sr;
    this.seed = seed;
    this.res = RESONANCES.map(([f, q]) => new BandPass(sr, f, q));
    this.intake = new BandPass(sr, 1900, 0.9);
    this.mech = new BandPass(sr, 3200, 0.7);
  }

  /** Andrew's idle recording (a seamless loop) and its sample rate, blended in at the bottom of the revs. */
  setIdle(samples: Float32Array, rate: number) {
    this.idle = samples;
    this.idleRate = rate / this.sr;
  }

  /** A gear change: +1 up (cut and bang), −1 down (blip, then crackle). */
  shift(dir: number) {
    if (dir > 0) {
      this.cut = 0.06;
      this.firePop(1);
    } else {
      this.blip = 0.13;
      this.crackle = 0.4;
    }
  }

  private rand() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  private firePop(size: number) {
    this.pop = Math.max(this.pop, size);
    this.thump = Math.max(this.thump, size * 0.8);
    this.thumpPhase = 0;
  }

  /**
   * Fill `out` with engine sound. `rpmTarget`: where the revs are heading (rpm); `throttle` 0…1.
   * Called in blocks (128 samples in the browser); the revs and throttle glide between calls.
   */
  render(out: Float32Array, rpmTarget: number, throttle: number) {
    const sr = this.sr, dt = 1 / sr;
    const redline = ENGINE_RPM.redline;
    for (let i = 0; i < out.length; i++) {
      // --- where the revs and throttle are going ---
      let target = Math.min(redline * 1.01, Math.max(ENGINE_RPM.idle, rpmTarget));
      let thr = throttle;
      if (this.blip > 0) {
        target *= 1.1; // the blip overshoots a touch before the clutch comes out
        thr = 0.85;
        this.blip -= dt;
      }
      if (this.cut > 0) {
        thr = 0;
        this.cut -= dt;
      }
      // Revs climb a little quicker than they fall; shifts move them fast.
      const tau = this.cut > 0 || this.blip > 0 ? 0.05 : target > this.rpm ? 0.06 : 0.11;
      this.rpm += (target - this.rpm) * (dt / tau);
      this.throttle += (thr - this.throttle) * (dt / 0.03);
      const load = this.throttle;
      const norm = this.rpm / redline;
      // The rev limiter: ignition cuts in and out a dozen times a second.
      let firing = this.cut > 0 ? 0.12 : 1;
      if (this.rpm > redline * 0.985 && throttle > 0.5) {
        this.limiter += dt;
        if (this.limiter % 0.085 < 0.03) firing = 0.1;
      } else this.limiter = 0;

      // --- each cylinder firing: a pressure pulse ---
      const f = this.rpm / 30; // an inline-four fires twice per revolution
      this.phase += f * dt * (1 + this.jitter);
      if (this.phase >= 1) {
        this.phase -= 1;
        this.cyl = (this.cyl + 1) % 4;
        const idleness = 1 - smooth(ENGINE_RPM.idle, 6000, this.rpm);
        this.jitter = (this.rand() - 0.5) * (0.012 + 0.05 * idleness);
        // Uneven cylinders give the idle its lope; up the revs they even out into one scream.
        const even = 1 + (CYLINDER[this.cyl]! - 1) * (0.25 + 0.75 * idleness);
        // Off the throttle each firing is weaker and more ragged: the overrun burble.
        const ragged = load < 0.5 ? 1 - (0.5 - load) * 0.6 * this.rand() : 1;
        const a = even * (0.92 + this.rand() * 0.16) * (0.8 + 0.2 * load) * ragged * firing;
        this.pulse = Math.max(this.pulse, a);
        // Pops on the overrun (off the throttle, revs falling) and after a downshift.
        const overrun = load < 0.15 && this.rpm > 5500 && target < this.rpm;
        const chance = this.crackle > 0 ? 0.04 : overrun ? 0.012 : 0;
        if (chance && this.rand() < chance) this.firePop(0.35 + this.rand() * 0.6);
      }
      this.crackle = Math.max(0, this.crackle - dt);
      // The pulse dies away within its share of the cycle, so pulses run together into a tone up high.
      const s = this.pulse;
      this.pulse *= Math.exp(-dt * f * 3.2);

      // --- through the exhaust: fixed resonances, plus the raw thump of the pulse ---
      let ex = s * 0.6;
      for (let r = 0; r < this.res.length; r++) ex += this.res[r]!.run(s) * RESONANCES[r]![2] * 6;
      // Intake roar: noise breathing with each firing, louder on the throttle and up the revs.
      const noise = this.rand() * 2 - 1;
      const roar = this.intake.run(noise) * (0.25 + s) * load * (0.2 + norm) * 1.6;
      // The engine's own clatter (valves, cam chain): there on or off the throttle, rising with the revs.
      const clatter = this.mech.run(noise) * (0.3 + 0.7 * s) * norm * 0.9;
      // Off the throttle the note goes duller; on it, brighter.
      let x = ex + roar + clatter;
      const cutoff = 1300 + 5200 * (0.45 + 0.55 * load) * (0.4 + 0.6 * norm);
      this.tone += (x - this.tone) * Math.min(1, (2 * Math.PI * cutoff) / sr);
      x = this.tone;
      // Rasp: soft clipping, harder on the throttle.
      x = Math.tanh(x * (1.1 + 1.6 * load)) * (0.75 + 0.25 * load) * (0.7 + 0.3 * norm);

      // --- pops: a crack of bright noise and a low thump ---
      if (this.pop > 0.001 || this.thump > 0.001) {
        this.thumpPhase += dt;
        x += (this.rand() * 2 - 1) * this.pop * 1.3 + Math.sin(2 * Math.PI * 72 * this.thumpPhase) * this.thump;
        this.pop *= Math.exp(-dt / 0.006);
        this.thump *= Math.exp(-dt / 0.03);
      }

      // --- blended into Andrew's idle at the bottom of the revs ---
      const idleMix = this.idle ? 1 - smooth(2700, 4300, this.rpm) : 0;
      if (idleMix > 0 && this.idle) {
        const n = this.idle.length, p = Math.floor(this.idlePos), k = this.idlePos - p;
        const v = this.idle[p % n]! * (1 - k) + this.idle[(p + 1) % n]! * k;
        this.idlePos = (this.idlePos + this.idleRate * Math.min(1.7, this.rpm / ENGINE_RPM.idle)) % n;
        x = x * (1 - idleMix * 0.75) + v * idleMix * 1.6;
      }

      // Block DC (the pulses are one-sided).
      this.dc = x - this.dcIn + 0.995 * this.dc;
      this.dcIn = x;
      out[i] = this.dc * OUTPUT;
    }
  }
}
