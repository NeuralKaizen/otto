import type { SessionState } from "../../voice/types";

// Motor de la escena del panel general: núcleo esférico de partículas,
// anillo de polvo, starfield y wordmark "OTTO" — un solo canvas 2D con
// blending aditivo. Sin three.js: proyección 3D manual, suficiente y barata.

interface OrbParticle {
  theta: number;
  phi: number;
  rf: number; // factor de radio (superficie ~1, interior <1)
  size: number;
  tw: number; // fase de twinkle
  twSpeed: number;
  spd: number; // variación de velocidad angular (swirl en processing)
  r: number;
  g: number;
  b: number;
  tr: number;
  tg: number;
  tb: number;
}

interface RingParticle {
  ang: number;
  rad: number; // múltiplo del radio del núcleo
  lift: number; // dispersión vertical
  size: number;
  tw: number;
  spd: number;
}

interface Star {
  x: number; // 0..1 relativo al viewport
  y: number;
  size: number;
  tw: number;
  vx: number;
  vy: number;
}

interface WordParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  size: number;
  alpha: number;
}

interface ModeParams {
  rot: number; // rad/s de rotación del núcleo
  rad: number; // factor del radio base
  breatheAmp: number;
  breatheFreq: number;
  glow: number; // intensidad del halo central
  jitter: number; // agitación radial (processing)
  ringAlpha: number;
  orbAlpha: number;
}

const MODE: Record<SessionState, ModeParams> = {
  idle: { rot: 0.055, rad: 1.0, breatheAmp: 0.018, breatheFreq: 0.22, glow: 0.22, jitter: 0, ringAlpha: 0.5, orbAlpha: 0.62 },
  listening: { rot: 0.14, rad: 1.07, breatheAmp: 0.05, breatheFreq: 0.55, glow: 0.55, jitter: 0.08, ringAlpha: 0.65, orbAlpha: 1 },
  processing: { rot: 1.05, rad: 0.85, breatheAmp: 0.045, breatheFreq: 1.7, glow: 0.7, jitter: 0.55, ringAlpha: 0.32, orbAlpha: 1 },
  speaking: { rot: 0.2, rad: 1.03, breatheAmp: 0.1, breatheFreq: 1.0, glow: 0.6, jitter: 0.06, ringAlpha: 0.55, orbAlpha: 1 },
};

// Paletas por estado: base + variación cálida/fría por partícula.
type RGB = [number, number, number];
const PALETTE: Record<SessionState, { base: RGB; lo: RGB; hi: RGB }> = {
  idle: { base: [187, 214, 255], lo: [110, 150, 210], hi: [240, 248, 255] },
  listening: { base: [255, 199, 120], lo: [240, 158, 64], hi: [255, 240, 205] },
  processing: { base: [124, 231, 255], lo: [40, 190, 250], hi: [222, 250, 255] },
  speaking: { base: [255, 184, 107], lo: [250, 140, 70], hi: [255, 231, 192] },
};

function samplePalette(mode: SessionState): RGB {
  const p = PALETTE[mode];
  const t = Math.random();
  const mix = (i: number) =>
    t < 0.5 ? p.lo[i] + (p.base[i] - p.lo[i]) * (t * 2) : p.base[i] + (p.hi[i] - p.base[i]) * ((t - 0.5) * 2);
  return [mix(0), mix(1), mix(2)];
}

const ORB_COUNT = 1500;
const RING_COUNT = 420;
const STAR_COUNT = 150;
const WORD_TEXT = "OTTO";

export class OttoEngine {
  private mode: SessionState = "idle";
  private orb: OrbParticle[] = [];
  private ring: RingParticle[] = [];
  private stars: Star[] = [];
  private word: WordParticle[] = [];
  private wordTargets: { x: number; y: number }[] = [];

  // Parámetros actuales, interpolados hacia MODE[mode] cada frame.
  private cur: ModeParams = { ...MODE.idle };
  private rotY = 0;
  private rotX = -0.35;
  private ringRot = 0;

  private w = 0;
  private h = 0;
  reducedMotion = false;

  constructor() {
    for (let i = 0; i < ORB_COUNT; i++) {
      // Distribución uniforme en la esfera (capa superficial + interior tenue)
      const u = Math.random();
      const v = Math.random();
      const surface = i < ORB_COUNT * 0.78;
      const [r, g, b] = samplePalette("idle");
      this.orb.push({
        theta: 2 * Math.PI * u,
        phi: Math.acos(2 * v - 1),
        rf: surface ? 0.92 + Math.random() * 0.1 : 0.25 + Math.random() * 0.6,
        size: surface ? 0.9 + Math.random() * 1.5 : 0.6 + Math.random() * 0.9,
        tw: Math.random() * Math.PI * 2,
        twSpeed: 0.6 + Math.random() * 2.4,
        spd: Math.random() * 2 - 1,
        r, g, b, tr: r, tg: g, tb: b,
      });
    }
    for (let i = 0; i < RING_COUNT; i++) {
      // Banda de polvo: densa cerca del borde interno, se deshilacha afuera
      const edge = Math.pow(Math.random(), 2.2);
      this.ring.push({
        ang: Math.random() * Math.PI * 2,
        rad: 1.35 + edge * 0.85 + Math.random() * 0.08,
        lift: (Math.random() * 2 - 1) * (0.05 + edge * 0.22),
        size: 0.5 + Math.random() * 1.1,
        tw: Math.random() * Math.PI * 2,
        spd: 0.5 + Math.random() * 0.9,
      });
    }
    for (let i = 0; i < STAR_COUNT; i++) {
      this.stars.push({
        x: Math.random(),
        y: Math.random(),
        size: Math.random() < 0.85 ? 1 : 1.6,
        tw: Math.random() * Math.PI * 2,
        vx: (Math.random() * 2 - 1) * 0.0016,
        vy: (Math.random() * 2 - 1) * 0.0009,
      });
    }
  }

  get orbCenter(): { x: number; y: number } {
    return { x: this.w / 2, y: this.h * 0.42 };
  }
  get orbRadius(): number {
    return Math.min(this.w, this.h) * 0.205;
  }

  setMode(mode: SessionState) {
    if (mode === this.mode) return;
    this.mode = mode;
    for (const p of this.orb) {
      const [r, g, b] = samplePalette(mode);
      p.tr = r; p.tg = g; p.tb = b;
    }
    this.retargetWord();
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.sampleWordTargets();
    this.retargetWord();
  }

  // Muestrea el wordmark a puntos via canvas offscreen (espíritu del
  // particle-text-effect, integrado a la misma escena).
  private sampleWordTargets() {
    this.wordTargets = [];
    if (typeof document === "undefined" || this.w === 0) return;
    const off = document.createElement("canvas");
    off.width = this.w;
    off.height = 220;
    const ctx = off.getContext("2d");
    if (!ctx) return;
    const fontSize = Math.min(this.w * 0.11, 118);
    ctx.fillStyle = "#fff";
    ctx.font = `400 ${fontSize}px Michroma, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(WORD_TEXT, off.width / 2, off.height / 2);
    const data = ctx.getImageData(0, 0, off.width, off.height).data;
    const step = 4;
    const yBase = this.h * 0.42 + this.orbRadius * 2.05 - off.height / 2;
    for (let y = 0; y < off.height; y += step) {
      for (let x = 0; x < off.width; x += step) {
        if (data[(y * off.width + x) * 4 + 3] > 128) {
          this.wordTargets.push({ x, y: y + yBase });
        }
      }
    }
    // Ajusta el pool de partículas del wordmark al nuevo target set
    while (this.word.length < this.wordTargets.length) {
      const ang = Math.random() * Math.PI * 2;
      const d = Math.max(this.w, this.h) * 0.7;
      this.word.push({
        x: this.w / 2 + Math.cos(ang) * d,
        y: this.h / 2 + Math.sin(ang) * d,
        vx: 0, vy: 0, tx: 0, ty: 0,
        size: 0.8 + Math.random() * 1.1,
        alpha: 0,
      });
    }
    this.word.length = Math.max(this.wordTargets.length, 0);
  }

  private retargetWord() {
    const c = this.orbCenter;
    for (let i = 0; i < this.word.length; i++) {
      const p = this.word[i];
      if (this.mode === "idle") {
        const t = this.wordTargets[i];
        if (t) { p.tx = t.x; p.ty = t.y; }
      } else {
        // Al despertar, las letras son absorbidas por el núcleo
        const ang = Math.random() * Math.PI * 2;
        const r = Math.random() * this.orbRadius * 0.5;
        p.tx = c.x + Math.cos(ang) * r;
        p.ty = c.y + Math.sin(ang) * r * 0.8;
      }
    }
  }

  frame(ctx: CanvasRenderingContext2D, dt: number, t: number, externalAmp: number) {
    const target = MODE[this.mode];
    const k = Math.min(1, dt * 2.4);
    this.cur.rot += (target.rot - this.cur.rot) * k;
    this.cur.rad += (target.rad - this.cur.rad) * k;
    this.cur.breatheAmp += (target.breatheAmp - this.cur.breatheAmp) * k;
    this.cur.breatheFreq += (target.breatheFreq - this.cur.breatheFreq) * k;
    this.cur.glow += (target.glow - this.cur.glow) * k;
    this.cur.jitter += (target.jitter - this.cur.jitter) * k;
    this.cur.ringAlpha += (target.ringAlpha - this.cur.ringAlpha) * k;
    this.cur.orbAlpha += (target.orbAlpha - this.cur.orbAlpha) * k;

    const amp = Math.max(externalAmp, this.ambientAmplitude(t));
    const motion = this.reducedMotion ? 0.25 : 1;
    this.rotY += this.cur.rot * dt * motion;
    this.rotX = -0.35 + Math.sin(t * 0.07) * 0.06 * motion;
    this.ringRot += dt * 0.05 * motion;

    const { x: cx, y: cy } = this.orbCenter;
    const R = this.orbRadius * this.cur.rad * (1 + amp * 0.12);
    const breathe = Math.sin(t * this.cur.breatheFreq * Math.PI * 2) * this.cur.breatheAmp;

    ctx.clearRect(0, 0, this.w, this.h);
    this.drawStars(ctx, dt, t);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    this.drawGlow(ctx, cx, cy, R, amp);
    this.drawRing(ctx, cx, cy, R, t);
    this.drawOrb(ctx, cx, cy, R, breathe, dt, t, amp);
    this.drawWord(ctx, dt, t);
    ctx.restore();
  }

  // Envolvente orgánica por estado: el núcleo se siente vivo aunque todavía
  // no llegue amplitud real de mic/TTS (esa entra por externalAmp).
  private ambientAmplitude(t: number): number {
    if (this.reducedMotion) return 0.1;
    switch (this.mode) {
      case "listening":
        return 0.18 + 0.1 * Math.sin(t * 1.7) + 0.06 * Math.sin(t * 4.3 + 1.2);
      case "processing":
        return 0.22 + 0.08 * Math.sin(t * 6.1);
      case "speaking": {
        // Cadencia tipo habla: ráfagas moduladas por una compuerta lenta
        const gate = Math.sin(t * 1.9) > -0.25 ? 1 : 0.2;
        const burst = 0.5 + 0.3 * Math.sin(t * 7.3) + 0.2 * Math.sin(t * 13.7 + 1);
        return Math.max(0, burst * gate * 0.55);
      }
      default:
        return 0.04 + 0.02 * Math.sin(t * 0.7);
    }
  }

  private drawStars(ctx: CanvasRenderingContext2D, dt: number, t: number) {
    ctx.save();
    for (const s of this.stars) {
      if (!this.reducedMotion) {
        s.x = (s.x + s.vx * dt + 1) % 1;
        s.y = (s.y + s.vy * dt + 1) % 1;
      }
      const a = 0.1 + 0.14 * (0.5 + 0.5 * Math.sin(t * 0.8 + s.tw));
      ctx.fillStyle = `rgba(190, 212, 240, ${a})`;
      ctx.fillRect(s.x * this.w, s.y * this.h, s.size, s.size);
    }
    ctx.restore();
  }

  private drawGlow(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, amp: number) {
    const p = PALETTE[this.mode].base;
    const rad = R * (1.55 + amp * 0.35);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${0.16 * this.cur.glow + amp * 0.05})`);
    g.addColorStop(0.55, `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${0.05 * this.cur.glow})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }

  private drawRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, t: number) {
    const p = PALETTE[this.mode].base;
    const tilt = 0.32; // achatamiento del anillo (perspectiva)
    const lean = -0.16; // inclinación del eje
    const cosL = Math.cos(lean);
    const sinL = Math.sin(lean);
    for (const q of this.ring) {
      const ang = q.ang + this.ringRot * q.spd;
      const rx = Math.cos(ang) * R * q.rad;
      const ry = Math.sin(ang) * R * q.rad * tilt + q.lift * R;
      const x = cx + rx * cosL - ry * sinL;
      const y = cy + rx * sinL + ry * cosL;
      const a = this.cur.ringAlpha * (0.1 + 0.22 * (0.5 + 0.5 * Math.sin(t * q.spd * 1.4 + q.tw)));
      ctx.fillStyle = `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${a})`;
      ctx.fillRect(x, y, q.size, q.size);
    }
  }

  private drawOrb(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number, R: number,
    breathe: number, dt: number, t: number, amp: number,
  ) {
    const f = R * 3.2; // distancia focal de la proyección
    const cosX = Math.cos(this.rotX);
    const sinX = Math.sin(this.rotX);
    const colorK = Math.min(1, dt * 2.2);
    for (const p of this.orb) {
      // swirl: en processing cada partícula deriva a su propio ritmo
      const theta = p.theta + this.rotY * (1 + p.spd * this.cur.jitter * 1.6);
      const jitterR = this.cur.jitter * Math.sin(t * 9 + p.tw) * 0.05;
      const rf = p.rf * (1 + breathe + jitterR + amp * 0.06);
      const sinPhi = Math.sin(p.phi);
      let x = R * rf * sinPhi * Math.cos(theta);
      let y = R * rf * Math.cos(p.phi);
      let z = R * rf * sinPhi * Math.sin(theta);
      // rotación X (inclinación del eje)
      const y2 = y * cosX - z * sinX;
      z = y * sinX + z * cosX;
      y = y2;
      const persp = f / (f + z);
      x = cx + x * persp;
      y = cy + y * persp;

      p.r += (p.tr - p.r) * colorK;
      p.g += (p.tg - p.g) * colorK;
      p.b += (p.tb - p.b) * colorK;

      const twinkle = this.reducedMotion ? 0.85 : 0.6 + 0.4 * Math.sin(t * p.twSpeed + p.tw);
      const depth = 0.35 + 0.65 * ((1 - z / R) / 2); // el frente brilla más
      const a = this.cur.orbAlpha * twinkle * depth;
      const s = p.size * persp;
      ctx.fillStyle = `rgba(${p.r | 0}, ${p.g | 0}, ${p.b | 0}, ${Math.min(1, a)})`;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
  }

  private drawWord(ctx: CanvasRenderingContext2D, dt: number, t: number) {
    if (this.word.length === 0) return;
    const idle = this.mode === "idle";
    const p0 = PALETTE[this.mode].base;
    const step = Math.min(dt, 1 / 30);
    for (const p of this.word) {
      // resorte críticamente amortiguado hacia el target
      const ax = (p.tx - p.x) * 26 - p.vx * 9;
      const ay = (p.ty - p.y) * 26 - p.vy * 9;
      p.vx += ax * step;
      p.vy += ay * step;
      p.x += p.vx * step;
      p.y += p.vy * step;
      const targetAlpha = idle ? 0.95 : 0;
      p.alpha += (targetAlpha - p.alpha) * Math.min(1, dt * (idle ? 1.6 : 3.2));
      if (p.alpha < 0.01) continue;
      const tw = this.reducedMotion ? 0.9 : 0.75 + 0.25 * Math.sin(t * 2.3 + p.tx * 0.05);
      ctx.fillStyle = `rgba(${p0[0]}, ${p0[1]}, ${p0[2]}, ${p.alpha * tw})`;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
  }
}
