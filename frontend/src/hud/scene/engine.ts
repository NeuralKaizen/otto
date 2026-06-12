import type { SessionState } from "../../voice/types";

// Motor de la escena del panel general — v2 "show agresivo".
//
// idle:       enjambre suelto y oscuro, wordmark OTTO tenue en partículas.
// wake:       el wordmark EXPLOTA (espíritu del particle-text-effect), el
//             enjambre recibe un kick violento + ondas de choque + flash,
//             y se estructura en un grafo 3D conectado.
// listening:  grafo dorado pulsante, aristas respirando.
// processing: ciclón cian, aristas disparando como sinapsis.
// speaking:   ámbar caliente latiendo con la voz, emite ondas al hablar.
//
// Todo canvas 2D + blending aditivo. Sin three.js.

interface OrbParticle {
  theta: number;
  phi: number;
  rf: number; // factor de radio (superficie ~1, interior <1)
  size: number;
  tw: number;
  twSpeed: number;
  spd: number; // variación de velocidad angular (swirl)
  // offset 3D con resorte (kicks de transición)
  ox: number; oy: number; oz: number;
  vx: number; vy: number; vz: number;
  // proyección del frame actual (para dibujar aristas)
  sx: number; sy: number; da: number; sc: number;
  // color actual → objetivo
  r: number; g: number; b: number;
  tr: number; tg: number; tb: number;
}

interface Edge { a: number; b: number; phase: number; speed: number; fphase: number; fspeed: number }
interface Wave { r: number; v: number; a0: number }
interface RingParticle { ang: number; rad: number; lift: number; size: number; tw: number; spd: number }
interface Star { x: number; y: number; size: number; tw: number; vx: number; vy: number }
interface WordParticle {
  x: number; y: number; vx: number; vy: number;
  tx: number; ty: number; size: number; alpha: number;
  exploding: boolean;
}

interface ModeParams {
  rot: number;
  rad: number;
  breatheAmp: number;
  breatheFreq: number;
  glow: number;
  jitter: number;
  ringAlpha: number;
  orbAlpha: number;
  scatter: number;   // 1 = enjambre suelto (idle), 0 = esfera estructurada
  edgeAlpha: number; // visibilidad del grafo
  edgeFire: number;  // sinapsis disparando (processing)
}

const MODE: Record<SessionState, ModeParams> = {
  idle: { rot: 0.04, rad: 1.0, breatheAmp: 0.02, breatheFreq: 0.2, glow: 0.12, jitter: 0, ringAlpha: 0.3, orbAlpha: 0.5, scatter: 1, edgeAlpha: 0, edgeFire: 0 },
  listening: { rot: 0.25, rad: 1.08, breatheAmp: 0.055, breatheFreq: 0.6, glow: 0.85, jitter: 0.1, ringAlpha: 0.7, orbAlpha: 1, scatter: 0, edgeAlpha: 0.55, edgeFire: 0.25 },
  processing: { rot: 1.5, rad: 0.8, breatheAmp: 0.05, breatheFreq: 1.8, glow: 1.0, jitter: 0.65, ringAlpha: 0.3, orbAlpha: 1, scatter: 0, edgeAlpha: 0.85, edgeFire: 1 },
  speaking: { rot: 0.32, rad: 1.05, breatheAmp: 0.12, breatheFreq: 1.0, glow: 0.9, jitter: 0.08, ringAlpha: 0.6, orbAlpha: 1, scatter: 0, edgeAlpha: 0.6, edgeFire: 0.35 },
};

type RGB = [number, number, number];
const PALETTE: Record<SessionState, { base: RGB; lo: RGB; hi: RGB }> = {
  idle: { base: [150, 190, 240], lo: [90, 130, 200], hi: [220, 240, 255] },
  listening: { base: [255, 184, 70], lo: [255, 130, 20], hi: [255, 238, 190] },
  processing: { base: [70, 225, 255], lo: [0, 180, 255], hi: [215, 250, 255] },
  speaking: { base: [255, 150, 60], lo: [255, 100, 30], hi: [255, 215, 160] },
};

function samplePalette(mode: SessionState): RGB {
  const p = PALETTE[mode];
  const t = Math.random();
  const mix = (i: number) =>
    t < 0.5 ? p.lo[i] + (p.base[i] - p.lo[i]) * (t * 2) : p.base[i] + (p.hi[i] - p.base[i]) * ((t - 0.5) * 2);
  return [mix(0), mix(1), mix(2)];
}

const ORB_COUNT = 1500;
const SURFACE_RATIO = 0.78;
const RING_COUNT = 420;
const STAR_COUNT = 150;
const MAX_EDGES = 780;
const WORD_TEXT = "OTTO";

export class OttoEngine {
  private mode: SessionState = "idle";
  private orb: OrbParticle[] = [];
  private edges: Edge[] = [];
  private waves: Wave[] = [];
  private ring: RingParticle[] = [];
  private stars: Star[] = [];
  private word: WordParticle[] = [];
  private wordTargets: { x: number; y: number }[] = [];

  private cur: ModeParams = { ...MODE.idle };
  private rotY = 0;
  private rotX = -0.35;
  private ringRot = 0;
  private flash = 0; // energía del flash de transición, decae sola
  private waveCooldown = 0;

  private w = 0;
  private h = 0;
  reducedMotion = false;

  constructor() {
    for (let i = 0; i < ORB_COUNT; i++) {
      const u = Math.random();
      const v = Math.random();
      const surface = i < ORB_COUNT * SURFACE_RATIO;
      const [r, g, b] = samplePalette("idle");
      this.orb.push({
        theta: 2 * Math.PI * u,
        phi: Math.acos(2 * v - 1),
        rf: surface ? 0.92 + Math.random() * 0.1 : 0.25 + Math.random() * 0.6,
        size: surface ? 1.1 + Math.random() * 1.7 : 0.7 + Math.random() * 1.0,
        tw: Math.random() * Math.PI * 2,
        twSpeed: 0.6 + Math.random() * 2.4,
        spd: Math.random() * 2 - 1,
        ox: 0, oy: 0, oz: 0, vx: 0, vy: 0, vz: 0,
        sx: 0, sy: 0, da: 0, sc: 1,
        r, g, b, tr: r, tg: g, tb: b,
      });
    }
    this.buildEdges();
    for (let i = 0; i < RING_COUNT; i++) {
      const edge = Math.pow(Math.random(), 2.2);
      this.ring.push({
        ang: Math.random() * Math.PI * 2,
        rad: 1.35 + edge * 0.85 + Math.random() * 0.08,
        lift: (Math.random() * 2 - 1) * (0.05 + edge * 0.22),
        size: 0.5 + Math.random() * 1.2,
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

  // Grafo 3D: vecinos angulares en la cáscara → aristas fijas que aparecen
  // cuando el enjambre se estructura ("mega grafo").
  private buildEdges() {
    const n = Math.floor(ORB_COUNT * SURFACE_RATIO);
    const px = new Float32Array(n);
    const py = new Float32Array(n);
    const pz = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = this.orb[i];
      const s = Math.sin(p.phi);
      px[i] = s * Math.cos(p.theta);
      py[i] = Math.cos(p.phi);
      pz[i] = s * Math.sin(p.theta);
    }
    const thresh2 = 0.028; // ~chord² para ~2 vecinos por nodo
    const degree = new Uint8Array(n);
    for (let i = 0; i < n && this.edges.length < MAX_EDGES; i++) {
      if (degree[i] >= 3) continue;
      for (let j = i + 1; j < n; j++) {
        if (degree[j] >= 3) continue;
        const dx = px[i] - px[j];
        const dy = py[i] - py[j];
        const dz = pz[i] - pz[j];
        if (dx * dx + dy * dy + dz * dz < thresh2) {
          this.edges.push({
            a: i, b: j,
            phase: Math.random() * Math.PI * 2,
            speed: 0.8 + Math.random() * 1.6,
            fphase: Math.random() * Math.PI * 2,
            fspeed: 2 + Math.random() * 5,
          });
          degree[i]++;
          degree[j]++;
          if (degree[i] >= 3 || this.edges.length >= MAX_EDGES) break;
        }
      }
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
    const prev = this.mode;
    this.mode = mode;
    for (const p of this.orb) {
      const [r, g, b] = samplePalette(mode);
      p.tr = r; p.tg = g; p.tb = b;
    }

    // FX de transición: el despertar es EL momento show
    const wake = prev === "idle" && mode !== "idle";
    const release = mode === "idle";
    const intensity = wake ? 1 : release ? 0.25 : 0.55;
    this.kick(intensity);
    this.flash = Math.min(1.4, this.flash + (wake ? 1.2 : release ? 0.25 : 0.6));
    if (!release) this.spawnWaves(wake ? 3 : 1, wake ? 0.55 : 0.3);

    if (prev === "idle" && mode !== "idle") this.explodeWord();
    if (mode === "idle") this.reassembleWord();
  }

  // Impulso 3D a todo el enjambre; el resorte lo trae de vuelta con wobble.
  private kick(intensity: number) {
    const R = this.orbRadius || 180;
    const k = this.reducedMotion ? intensity * 0.2 : intensity;
    for (const p of this.orb) {
      const az = Math.random() * Math.PI * 2;
      const el = Math.acos(2 * Math.random() - 1);
      const m = R * k * (1.6 + Math.random() * 2.6);
      const s = Math.sin(el);
      p.vx += s * Math.cos(az) * m;
      p.vy += Math.cos(el) * m;
      p.vz += s * Math.sin(az) * m;
    }
  }

  private spawnWaves(count: number, a0: number) {
    const R = this.orbRadius || 180;
    for (let i = 0; i < count; i++) {
      // r negativo = delay escalonado entre ondas
      this.waves.push({ r: -i * R * 0.45, v: R * 3.4, a0 });
    }
  }

  private explodeWord() {
    const cx = this.w / 2;
    const cy = this.h * 0.42 + this.orbRadius * 2.05;
    for (const p of this.word) {
      p.exploding = true;
      const dx = p.x - cx;
      const dy = p.y - cy;
      const d = Math.max(20, Math.hypot(dx, dy));
      const m = (this.reducedMotion ? 80 : 280) + Math.random() * 620;
      p.vx = (dx / d) * m + (Math.random() * 2 - 1) * 160;
      p.vy = (dy / d) * m + (Math.random() * 2 - 1) * 160 - 60;
    }
  }

  private reassembleWord() {
    for (let i = 0; i < this.word.length; i++) {
      const p = this.word[i];
      p.exploding = false;
      // re-materializa desde un anillo lejano y converge al texto
      const ang = Math.random() * Math.PI * 2;
      const d = Math.max(this.w, this.h) * (0.5 + Math.random() * 0.3);
      p.x = this.w / 2 + Math.cos(ang) * d;
      p.y = this.h / 2 + Math.sin(ang) * d;
      p.vx = 0;
      p.vy = 0;
      p.alpha = 0;
      const t = this.wordTargets[i];
      if (t) { p.tx = t.x; p.ty = t.y; }
    }
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.sampleWordTargets();
    if (this.mode === "idle") this.reassembleWord();
    else for (const p of this.word) p.alpha = 0;
  }

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
    while (this.word.length < this.wordTargets.length) {
      const ang = Math.random() * Math.PI * 2;
      const d = Math.max(this.w, this.h) * 0.7;
      this.word.push({
        x: this.w / 2 + Math.cos(ang) * d,
        y: this.h / 2 + Math.sin(ang) * d,
        vx: 0, vy: 0, tx: 0, ty: 0,
        size: 0.9 + Math.random() * 1.2,
        alpha: 0,
        exploding: false,
      });
    }
    this.word.length = Math.max(this.wordTargets.length, 0);
    for (let i = 0; i < this.word.length; i++) {
      const t = this.wordTargets[i];
      if (t) { this.word[i].tx = t.x; this.word[i].ty = t.y; }
    }
  }

  frame(ctx: CanvasRenderingContext2D, dt: number, t: number, externalAmp: number) {
    const target = MODE[this.mode];
    const k = Math.min(1, dt * 2.8);
    this.cur.rot += (target.rot - this.cur.rot) * k;
    this.cur.rad += (target.rad - this.cur.rad) * k;
    this.cur.breatheAmp += (target.breatheAmp - this.cur.breatheAmp) * k;
    this.cur.breatheFreq += (target.breatheFreq - this.cur.breatheFreq) * k;
    this.cur.glow += (target.glow - this.cur.glow) * k;
    this.cur.jitter += (target.jitter - this.cur.jitter) * k;
    this.cur.ringAlpha += (target.ringAlpha - this.cur.ringAlpha) * k;
    this.cur.orbAlpha += (target.orbAlpha - this.cur.orbAlpha) * k;
    this.cur.scatter += (target.scatter - this.cur.scatter) * k;
    this.cur.edgeAlpha += (target.edgeAlpha - this.cur.edgeAlpha) * k;
    this.cur.edgeFire += (target.edgeFire - this.cur.edgeFire) * k;

    this.flash *= Math.exp(-dt * 2.4);
    this.waveCooldown -= dt;

    const amp = Math.max(externalAmp, this.ambientAmplitude(t));
    // hablando fuerte → el núcleo emite ondas
    if (this.mode === "speaking" && amp > 0.55 && this.waveCooldown <= 0 && !this.reducedMotion) {
      this.spawnWaves(1, 0.16 + amp * 0.12);
      this.waveCooldown = 0.4;
    }

    const motion = this.reducedMotion ? 0.25 : 1;
    this.rotY += this.cur.rot * dt * motion;
    this.rotX = -0.35 + Math.sin(t * 0.07) * 0.06 * motion;
    this.ringRot += dt * 0.05 * motion;

    const { x: cx, y: cy } = this.orbCenter;
    const R = this.orbRadius * this.cur.rad * (1 + amp * 0.16 + this.flash * 0.06);
    const breathe = Math.sin(t * this.cur.breatheFreq * Math.PI * 2) * this.cur.breatheAmp;

    ctx.clearRect(0, 0, this.w, this.h);
    this.drawStars(ctx, dt, t);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    this.drawGlow(ctx, cx, cy, R, amp);
    this.drawRing(ctx, cx, cy, R, t);
    this.updateOrb(cx, cy, R, breathe, dt, t, amp);
    this.drawEdges(ctx, t, amp, R);
    this.drawOrbParticles(ctx, t);
    this.drawWaves(ctx, cx, cy, R, dt);
    this.drawWord(ctx, dt, t);
    ctx.restore();
  }

  private ambientAmplitude(t: number): number {
    if (this.reducedMotion) return 0.1;
    switch (this.mode) {
      case "listening":
        return 0.2 + 0.12 * Math.sin(t * 1.7) + 0.07 * Math.sin(t * 4.3 + 1.2);
      case "processing":
        return 0.26 + 0.1 * Math.sin(t * 6.1);
      case "speaking": {
        const gate = Math.sin(t * 1.9) > -0.25 ? 1 : 0.2;
        const burst = 0.5 + 0.3 * Math.sin(t * 7.3) + 0.2 * Math.sin(t * 13.7 + 1);
        return Math.max(0, burst * gate * 0.65);
      }
      default:
        return 0.04 + 0.02 * Math.sin(t * 0.7);
    }
  }

  private drawStars(ctx: CanvasRenderingContext2D, dt: number, t: number) {
    ctx.save();
    const dim = this.mode === "idle" ? 0.65 : 1;
    for (const s of this.stars) {
      if (!this.reducedMotion) {
        s.x = (s.x + s.vx * dt + 1) % 1;
        s.y = (s.y + s.vy * dt + 1) % 1;
      }
      const a = dim * (0.08 + 0.14 * (0.5 + 0.5 * Math.sin(t * 0.8 + s.tw)));
      ctx.fillStyle = `rgba(190, 212, 240, ${a})`;
      ctx.fillRect(s.x * this.w, s.y * this.h, s.size, s.size);
    }
    ctx.restore();
  }

  private drawGlow(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, amp: number) {
    const p = PALETTE[this.mode].base;
    const boost = 1 + this.flash * 1.7;
    const rad = R * (1.7 + amp * 0.5 + this.flash * 0.6);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${Math.min(0.6, (0.3 * this.cur.glow + amp * 0.1) * boost)})`);
    g.addColorStop(0.5, `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${Math.min(0.3, 0.08 * this.cur.glow * boost)})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    // núcleo caliente
    const hot = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.5);
    hot.addColorStop(0, `rgba(255, 255, 255, ${Math.min(0.22, 0.1 * this.cur.glow * boost)})`);
    hot.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = hot;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  }

  private drawRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, t: number) {
    const p = PALETTE[this.mode].base;
    const tilt = 0.32;
    const lean = -0.16;
    const cosL = Math.cos(lean);
    const sinL = Math.sin(lean);
    for (const q of this.ring) {
      const ang = q.ang + this.ringRot * q.spd;
      const rx = Math.cos(ang) * R * q.rad;
      const ry = Math.sin(ang) * R * q.rad * tilt + q.lift * R;
      const x = cx + rx * cosL - ry * sinL;
      const y = cy + rx * sinL + ry * cosL;
      const a = this.cur.ringAlpha * (0.12 + 0.26 * (0.5 + 0.5 * Math.sin(t * q.spd * 1.4 + q.tw)));
      ctx.fillStyle = `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${a})`;
      ctx.fillRect(x, y, q.size, q.size);
    }
  }

  // Actualiza física + proyección de cada partícula (sin dibujar todavía:
  // las aristas del grafo necesitan todas las posiciones proyectadas).
  private updateOrb(
    cx: number, cy: number, R: number,
    breathe: number, dt: number, t: number, amp: number,
  ) {
    const f = R * 3.2;
    const cosX = Math.cos(this.rotX);
    const sinX = Math.sin(this.rotX);
    const colorK = Math.min(1, dt * 2.6);
    const scatter = this.cur.scatter;
    const springK = 9;
    const springD = 3.2;
    for (const p of this.orb) {
      // resorte 3D del kick
      p.vx += (-p.ox * springK - p.vx * springD) * dt;
      p.vy += (-p.oy * springK - p.vy * springD) * dt;
      p.vz += (-p.oz * springK - p.vz * springD) * dt;
      p.ox += p.vx * dt;
      p.oy += p.vy * dt;
      p.oz += p.vz * dt;

      const theta = p.theta + this.rotY * (1 + p.spd * this.cur.jitter * 1.6);
      const jitterR = this.cur.jitter * Math.sin(t * 9 + p.tw) * 0.05;
      const rf = p.rf * (1 + breathe + jitterR + amp * 0.07);
      const sinPhi = Math.sin(p.phi);
      // enjambre suelto en idle: deriva orgánica por partícula
      const wx = Math.sin(t * 0.26 + p.tw * 2.1) * R * 0.2 * scatter;
      const wy = Math.sin(t * 0.21 + p.tw * 1.3) * R * 0.16 * scatter;
      const wz = Math.sin(t * 0.17 + p.tw * 3.7) * R * 0.2 * scatter;
      const x = R * rf * sinPhi * Math.cos(theta) + p.ox + wx;
      let y = R * rf * Math.cos(p.phi) + p.oy + wy;
      let z = R * rf * sinPhi * Math.sin(theta) + p.oz + wz;
      const y2 = y * cosX - z * sinX;
      z = y * sinX + z * cosX;
      y = y2;
      const persp = f / (f + z);
      p.sx = cx + x * persp;
      p.sy = cy + y * persp;
      p.sc = persp;
      p.da = 0.35 + 0.65 * ((1 - z / R) / 2);

      p.r += (p.tr - p.r) * colorK;
      p.g += (p.tg - p.g) * colorK;
      p.b += (p.tb - p.b) * colorK;
    }
  }

  // El "mega grafo 3D": aristas entre vecinos de la cáscara, pulsando; en
  // processing disparan ráfagas blancas como sinapsis.
  private drawEdges(ctx: CanvasRenderingContext2D, t: number, amp: number, R: number) {
    const base = this.cur.edgeAlpha;
    if (base < 0.02) return;
    const p0 = PALETTE[this.mode].base;
    const hi = PALETTE[this.mode].hi;
    // las aristas estiradas (vecinos que el swirl separó) se desvanecen:
    // mantiene el grafo nítido en vez de degenerar en una bola de lana
    const maxLen2 = (R * 0.4) ** 2;
    ctx.lineWidth = 0.8;
    for (const e of this.edges) {
      const A = this.orb[e.a];
      const B = this.orb[e.b];
      const ex = A.sx - B.sx;
      const ey = A.sy - B.sy;
      const stretch = 1 - (ex * ex + ey * ey) / maxLen2;
      if (stretch <= 0) continue;
      const depth = Math.min(A.da, B.da) * stretch;
      const pulse = this.reducedMotion ? 0.7 : 0.45 + 0.55 * Math.sin(t * e.speed + e.phase);
      const spark = this.cur.edgeFire > 0.02 && !this.reducedMotion
        ? Math.pow(Math.max(0, Math.sin(t * e.fspeed + e.fphase)), 24) * this.cur.edgeFire
        : 0;
      const a = base * depth * (0.3 + 0.6 * pulse + amp * 0.3) + spark * 0.9;
      if (a < 0.02) continue;
      const cr = p0[0] + (hi[0] - p0[0]) * spark;
      const cg = p0[1] + (hi[1] - p0[1]) * spark;
      const cb = p0[2] + (hi[2] - p0[2]) * spark;
      ctx.strokeStyle = `rgba(${cr | 0}, ${cg | 0}, ${cb | 0}, ${Math.min(1, a)})`;
      ctx.beginPath();
      ctx.moveTo(A.sx, A.sy);
      ctx.lineTo(B.sx, B.sy);
      ctx.stroke();
    }
  }

  private drawOrbParticles(ctx: CanvasRenderingContext2D, t: number) {
    const sizeBoost = 1 + this.flash * 0.5;
    const alphaBoost = Math.min(1.5, 1 + this.flash * 0.8);
    for (const p of this.orb) {
      const twinkle = this.reducedMotion ? 0.85 : 0.6 + 0.4 * Math.sin(t * p.twSpeed + p.tw);
      const a = this.cur.orbAlpha * twinkle * p.da * alphaBoost;
      if (a < 0.015) continue;
      const s = p.size * p.sc * sizeBoost;
      ctx.fillStyle = `rgba(${p.r | 0}, ${p.g | 0}, ${p.b | 0}, ${Math.min(1, a)})`;
      ctx.fillRect(p.sx - s / 2, p.sy - s / 2, s, s);
    }
  }

  // Ondas de choque de las transiciones (y del habla fuerte).
  private drawWaves(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, dt: number) {
    if (this.waves.length === 0) return;
    const p = PALETTE[this.mode].base;
    const maxR = R * 3;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.r += w.v * dt;
      if (w.r > maxR) {
        this.waves.splice(i, 1);
        continue;
      }
      if (w.r <= 0) continue; // todavía en delay
      const a = w.a0 * Math.max(0, 1 - w.r / maxR);
      ctx.strokeStyle = `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${a})`;
      ctx.lineWidth = 1.5 + w.r * 0.012;
      ctx.beginPath();
      ctx.ellipse(cx, cy, w.r, w.r * 0.92, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawWord(ctx: CanvasRenderingContext2D, dt: number, t: number) {
    if (this.word.length === 0) return;
    const idle = this.mode === "idle";
    const p0 = PALETTE[this.mode].base;
    const step = Math.min(dt, 1 / 30);
    for (const p of this.word) {
      if (p.exploding) {
        // vuelo libre con drag — el efecto "kill" del particle-text
        p.x += p.vx * step;
        p.y += p.vy * step;
        p.vx *= 1 - 1.1 * step;
        p.vy *= 1 - 1.1 * step;
        p.alpha = Math.max(0, p.alpha - dt * 1.05);
      } else {
        const ax = (p.tx - p.x) * 26 - p.vx * 9;
        const ay = (p.ty - p.y) * 26 - p.vy * 9;
        p.vx += ax * step;
        p.vy += ay * step;
        p.x += p.vx * step;
        p.y += p.vy * step;
        const targetAlpha = idle ? 0.62 : 0; // tenue: no roba protagonismo
        p.alpha += (targetAlpha - p.alpha) * Math.min(1, dt * (idle ? 1.4 : 3.2));
      }
      if (p.alpha < 0.01) continue;
      const tw = this.reducedMotion ? 0.9 : 0.72 + 0.28 * Math.sin(t * 2.3 + p.tx * 0.05);
      ctx.fillStyle = `rgba(${p0[0]}, ${p0[1]}, ${p0[2]}, ${p.alpha * tw})`;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
  }
}
