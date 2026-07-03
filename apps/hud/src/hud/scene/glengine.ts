import type { SessionState } from "../../voice/types";

// Motor WebGL2 de la escena — v3 "cuerpo de luz".
//
// Un solo sistema de ~14k partículas que MUTA de forma por estado:
//   idle:       cielo estrellado a pantalla completa + wordmark WATTSON
//   listening:  esfera-grafo densa, iluminada (diffuse + rim), dorada
//   processing: vórtice de anillo de polvo (ref. videos de docs/), cian
//   speaking:   la esfera late con la voz, ondas recorren el cuerpo
//
// Las transiciones son DURAS: resorte con stiffness disparada (snap) →
// las partículas se estrellan contra la nueva forma, con flash y ondas.
// Bloom barato: cada pasada de puntos se dibuja dos veces (core + halo).
// El fondo es un quad con shader: nebulosa, estrellas, luz central y
// ondas de choque — todo reactivo al estado y a la amplitud de voz.

const N = 14000;
const SHELL = 0.9;  // fracción de la esfera en cáscara (el resto, volumen)
const MAX_EDGES = 4200;
const WORD = "ALFRED";

// Especificación estática de los 3 anillos HUD: [factor-radio, velocidad-rotación].
// Definida a nivel de módulo para evitar allocaciones por frame en drawRings.
const RING_SPEC: ReadonlyArray<readonly [number, number]> = [
  [1.15,  0.10],
  [1.45, -0.07],
  [1.80,  0.04],
];

type RGB = [number, number, number];
type World = Record<SessionState, { base: RGB; lo: RGB; hi: RGB }>;

// Paleta Aurora — teal + violeta + verde + rosa, fluido tipo aurora boreal.
const PALETTE: World = {
  idle:       { base: [40, 200, 180],  lo: [20, 90, 130],   hi: [150, 120, 255] },
  listening:  { base: [80, 230, 150],  lo: [30, 180, 180],  hi: [255, 150, 220] },
  processing: { base: [140, 120, 255], lo: [40, 200, 190],  hi: [120, 255, 180] },
  speaking:   { base: [70, 230, 160],  lo: [150, 110, 240], hi: [120, 240, 230] },
};

// forma por estado: 0 = cielo, 1 = esfera, 2 = anillo
const FORM: Record<SessionState, number> = { idle: 0, listening: 1, processing: 2, speaking: 1 };

interface ModeParams {
  glow: number;     // luz central del fondo
  rot: number;      // rotación de la esfera
  edge: number;     // alpha del grafo
  fire: number;     // sinapsis
  turb: number;     // turbulencia
  body: number;     // alpha del cuerpo
  sky: number;      // mezcla "cielo" del fondo
}

const MODE: Record<SessionState, ModeParams> = {
  idle: { glow: 0.35, rot: 0.05, edge: 0, fire: 0, turb: 0.3, body: 0.9, sky: 1 },
  listening: { glow: 1.0, rot: 0.32, edge: 0.9, fire: 0.22, turb: 0.14, body: 1, sky: 0 },
  processing: { glow: 1.25, rot: 0.4, edge: 0, fire: 1, turb: 0.55, body: 1, sky: 0 },
  speaking: { glow: 1.1, rot: 0.36, edge: 0.75, fire: 0.35, turb: 0.12, body: 1, sky: 0 },
};

const BG_VERT = `#version 300 es
layout(location=0) in vec2 a;
void main(){ gl_Position = vec4(a, 0., 1.); }`;

const BG_FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 u_res;
uniform float u_t;
uniform vec3 u_color;
uniform float u_glow;
uniform float u_amp;
uniform vec2 u_center;
uniform float u_sky;
uniform float u_flash;
uniform vec4 u_waves[4];

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float stars(vec2 px, float cell, float thresh, float tw){
  vec2 g = floor(px / cell);
  float h = hash(g);
  if (h < thresh) return 0.0;
  vec2 c = (g + 0.5 + 0.4 * vec2(hash(g + 1.3), hash(g + 7.7)) - 0.5) * cell;
  float d = length(px - c);
  float twk = 0.55 + 0.45 * sin(u_t * (0.6 + h * 2.4) + h * 40.0);
  return exp(-d * d * 0.55) * twk * tw;
}

void main(){
  vec2 px = gl_FragCoord.xy;
  vec2 uv = px / u_res;
  float dc = distance(px, u_center) / u_res.y;

  // gradiente base: noche azul profunda, más rica cuando es "cielo"
  vec3 deep = mix(vec3(0.006, 0.012, 0.03), vec3(0.012, 0.024, 0.06), u_sky);
  vec3 mid  = mix(vec3(0.012, 0.022, 0.05), vec3(0.03, 0.05, 0.11), u_sky);
  vec3 col = mix(mid, deep, clamp(dc * 1.15, 0.0, 1.0));

  // nebulosa que respira, teñida del color del estado
  vec2 q = uv * vec2(u_res.x / u_res.y, 1.0);
  float n1 = sin(q.x * 2.1 + u_t * 0.05) * sin(q.y * 2.7 - u_t * 0.04);
  float n2 = sin(q.x * 3.7 - u_t * 0.03 + 1.7) * sin(q.y * 1.9 + u_t * 0.06 + 0.4);
  float neb = max(0.0, n1 * 0.5 + n2 * 0.5);
  col += u_color * neb * neb * (0.045 + 0.075 * u_sky);
  col += vec3(0.05, 0.1, 0.22) * neb * (0.05 + 0.14 * u_sky);

  // dos capas de estrellas de fondo (profundidad detrás de las partículas)
  float st = stars(px, 42.0, 0.93, 1.0) + stars(px + 31.7, 23.0, 0.965, 0.6);
  col += vec3(0.75, 0.85, 1.0) * st * (0.22 + 0.5 * u_sky);

  // luz central: el cuerpo ilumina la escena y late con la voz
  float glow = exp(-dc * dc * 5.5) * u_glow;
  col += u_color * glow * (0.16 + 0.3 * u_amp + 0.45 * u_flash);

  // ondas de choque luminosas
  for (int i = 0; i < 4; i++) {
    float wr = u_waves[i].x;
    float wa = u_waves[i].y;
    if (wa > 0.001 && wr > 0.0) {
      float dd = abs(distance(px, u_center) - wr);
      float sig = 7.0 + wr * 0.045;
      col += u_color * wa * exp(-dd * dd / (2.0 * sig * sig));
    }
  }

  // flash global de transición + viñeta
  col += u_color * u_flash * 0.06;
  float vig = smoothstep(1.45, 0.5, length(uv - 0.5) * 1.7);
  col *= mix(0.7, 1.0, vig);
  o = vec4(col, 1.0);
}`;

const PT_VERT = `#version 300 es
layout(location=0) in vec2 a_pos;
layout(location=1) in vec4 a_col;
layout(location=2) in float a_size;
uniform vec2 u_res;
uniform float u_sizeMul;
out vec4 v_col;
void main(){
  vec2 ndc = (a_pos / u_res) * 2.0 - 1.0;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
  gl_PointSize = max(1.0, a_size * u_sizeMul);
  v_col = a_col;
}`;

const PT_FRAG = `#version 300 es
precision mediump float;
in vec4 v_col;
uniform float u_alphaMul;
out vec4 o;
void main(){
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float fall = exp(-r2 * 3.0) * (1.0 - r2 * r2 * 0.25);
  o = vec4(v_col.rgb * v_col.a * fall * u_alphaMul, 0.0);
}`;

const LN_VERT = `#version 300 es
layout(location=0) in vec2 a_pos;
layout(location=1) in vec4 a_col;
uniform vec2 u_res;
out vec4 v_col;
void main(){
  vec2 ndc = (a_pos / u_res) * 2.0 - 1.0;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
  v_col = a_col;
}`;

const LN_FRAG = `#version 300 es
precision mediump float;
in vec4 v_col;
out vec4 o;
void main(){ o = vec4(v_col.rgb * v_col.a, 0.0); }`;

function compile(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const make = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(s) ?? "shader error");
    }
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, make(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, make(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(p) ?? "link error");
  }
  return p;
}

function samplePalette(mode: SessionState, t: number): RGB {
  const p = PALETTE[mode];
  const mix = (i: number) =>
    t < 0.5 ? p.lo[i] + (p.base[i] - p.lo[i]) * (t * 2) : p.base[i] + (p.hi[i] - p.base[i]) * ((t - 0.5) * 2);
  return [mix(0) / 255, mix(1) / 255, mix(2) / 255];
}

interface Wave { r: number; v: number; a0: number }

export class WattsonGLEngine {
  private gl: WebGL2RenderingContext;
  private bgProg: WebGLProgram;
  private ptProg: WebGLProgram;
  private lnProg: WebGLProgram;
  private bgVao: WebGLVertexArrayObject;
  private ptVao: WebGLVertexArrayObject;
  private lnVao: WebGLVertexArrayObject;
  private posBuf: WebGLBuffer;
  private colBuf: WebGLBuffer;
  private sizeBuf: WebGLBuffer;
  private eposBuf: WebGLBuffer;
  private ecolBuf: WebGLBuffer;
  // anillos HUD concéntricos — VAO dedicado para no interferir con el grafo
  private ringVao: WebGLVertexArrayObject;
  private rposBuf: WebGLBuffer;
  private rcolBuf: WebGLBuffer;
  // preallocated CPU arrays — peak vertex count por modo:
  //   Base (todos los modos):  3×120×2 = 720 (arcos) + 3×30×2 = 180 (ticks) = 900
  //   blip orbitante (siempre): 14 segmentos × 2 = 28  → 928
  //   processing (extra):      1 línea frontal + 4 trail = 5 segmentos × 2 = 10  → 938
  //   listening  (extra):      arco-medidor en anillo exterior, hasta 120 segs × 2  = 240 → 1168
  // Pico teórico estático: 1168 (listening con arco completo + blip).
  // NOTA: durante la transición listening→processing, ringAlign decae lentamente
  // (condición: ringAlign>0.05) y el radar activa al mismo frame; pico transitorio
  // ≈ 928 + 240 + 10 = 1178 verts — sigue por debajo de 1536.
  // Los guards (vIdx+2 > MAX_RING_VERTS) previenen cualquier desbordamiento.
  // Se usa 1536 (1024+512) para dar margen amplio a futuras capas de telemetría.
  private static readonly MAX_RING_VERTS = 1536;
  private rpos = new Float32Array(WattsonGLEngine.MAX_RING_VERTS * 2); // x,y por vértice
  private rcol = new Float32Array(WattsonGLEngine.MAX_RING_VERTS * 4); // r,g,b,a por vértice
  private uni: Record<string, WebGLUniformLocation | null> = {};

  private mode: SessionState = "idle";
  reducedMotion = false;

  // estado físico por partícula
  private cur = new Float32Array(N * 3);
  private vel = new Float32Array(N * 3);
  private dir = new Float32Array(N * 3); // dirección unitaria (esfera)
  private sphR = new Float32Array(N);    // factor de radio en la esfera
  private sky = new Float32Array(N * 3);
  private seed = new Float32Array(N);
  private size0 = new Float32Array(N);
  private cr = new Float32Array(N);
  private cg = new Float32Array(N);
  private cb = new Float32Array(N);
  private tr = new Float32Array(N);
  private tg = new Float32Array(N);
  private tb = new Float32Array(N);

  // buffers dinámicos hacia GPU
  private pos2 = new Float32Array(N * 2);
  private col4 = new Float32Array(N * 4);
  private sz = new Float32Array(N);
  private wv = new Float32Array(16);  // wave uniform — reutilizado cada frame (hoisted)

  // grafo
  private edgeA = new Uint16Array(MAX_EDGES);
  private edgeB = new Uint16Array(MAX_EDGES);
  private edgePh = new Float32Array(MAX_EDGES);
  private edgeSp = new Float32Array(MAX_EDGES);
  private edgeFPh = new Float32Array(MAX_EDGES);
  private edgeFSp = new Float32Array(MAX_EDGES);
  private edgeCount = 0;
  private epos: Float32Array;
  private ecol: Float32Array;

  // wordmark
  private wordCount = 0;
  private wordPos = new Float32Array(0);

  private curP: ModeParams = { ...MODE.idle };
  private rotY = 0;
  private snap = 0;  // dureza de transición (stiffness extra), decae
  private flash = 0;
  private breath = 0; // envolvente lenta de respiración (0..1)
  // listening: alineación de los anillos (0 = giro libre, 1 = orientación fija)
  private ringAlign = 0;
  // listening: inclinación hacia adelante extra de la esfera (radianes)
  private tiltLean = 0;
  // speaking: pop radial efímero para erupciones en picos de amp
  private eruptionPop = 0;
  private spikeMask = new Float32Array(N); // ~8% de cáscara: 1 = punta activa
  private waves: Wave[] = [];
  private waveCooldown = 0;
  // Temporizador de "lock": en processing, dispara un pulso breve cada ~0.8 s
  // cuando una oleada de datos llega al núcleo — patrón igual que waveCooldown.
  private lockCooldown = 0.4; // empezar desplazado para que el primer pulso no sea inmediato

  private w = 0;
  private h = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.bgProg = compile(gl, BG_VERT, BG_FRAG);
    this.ptProg = compile(gl, PT_VERT, PT_FRAG);
    this.lnProg = compile(gl, LN_VERT, LN_FRAG);

    // quad de fondo
    this.bgVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.bgVao);
    const quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // puntos
    this.ptVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.ptVao);
    this.posBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.pos2.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.colBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.col4.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
    this.sizeBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sizeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.sz.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);

    // líneas (grafo)
    this.epos = new Float32Array(MAX_EDGES * 4);
    this.ecol = new Float32Array(MAX_EDGES * 8);
    this.lnVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.lnVao);
    this.eposBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.eposBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.epos.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.ecolBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ecolBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.ecol.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);

    // anillos HUD — VAO dedicado, reutiliza lnProg (genérico screen-space)
    this.ringVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.ringVao);
    this.rposBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.rposBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.rpos.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.rcolBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.rcolBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.rcol.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);

    this.uni = {
      bg_res: gl.getUniformLocation(this.bgProg, "u_res"),
      bg_t: gl.getUniformLocation(this.bgProg, "u_t"),
      bg_color: gl.getUniformLocation(this.bgProg, "u_color"),
      bg_glow: gl.getUniformLocation(this.bgProg, "u_glow"),
      bg_amp: gl.getUniformLocation(this.bgProg, "u_amp"),
      bg_center: gl.getUniformLocation(this.bgProg, "u_center"),
      bg_sky: gl.getUniformLocation(this.bgProg, "u_sky"),
      bg_flash: gl.getUniformLocation(this.bgProg, "u_flash"),
      bg_waves: gl.getUniformLocation(this.bgProg, "u_waves"),
      pt_res: gl.getUniformLocation(this.ptProg, "u_res"),
      pt_sizeMul: gl.getUniformLocation(this.ptProg, "u_sizeMul"),
      pt_alphaMul: gl.getUniformLocation(this.ptProg, "u_alphaMul"),
      ln_res: gl.getUniformLocation(this.lnProg, "u_res"),
    };

    this.initParticles();
    this.buildEdges();
  }

  // Ruido de valor barato: hash determinista de la dirección redondeada.
  // Devuelve un valor en [0, 1]. Sin deps externas, sin imports.
  private dirNoise(dx: number, dy: number, dz: number): number {
    // Redondear a grid de 0.15 unidades para que partículas vecinas
    // compartan el mismo valor → "continentes" de 3-4 celdas de ancho.
    const gx = Math.round(dx * 6.67);
    const gy = Math.round(dy * 6.67);
    const gz = Math.round(dz * 6.67);
    // hash entero de 3 componentes → fract
    const h = Math.sin(gx * 127.1 + gy * 311.7 + gz * 74.9) * 43758.5453;
    return h - Math.floor(h);
  }

  private initParticles() {
    // direcciones fibonacci → cobertura pareja de la esfera
    const ga = Math.PI * (3 - Math.sqrt(5));
    const ns = Math.floor(N * SHELL);
    for (let i = 0; i < N; i++) {
      let y: number, r: number, th: number;
      if (i < ns) {
        y = 1 - (i / (ns - 1)) * 2;
        r = Math.sqrt(Math.max(0, 1 - y * y));
        th = ga * i;
        const baseR = 0.94 + Math.random() * 0.08;
        const dx = r * Math.cos(th);
        const dz = r * Math.sin(th);
        // Asimetría: multiplicar por 1 + 0.35*noise (noise ∈ [0,1]).
        // Invariante: piso de cáscara (0.94) × multiplicador mínimo (≥1.0)
        // debe permanecer > 0.9 (umbral shell-detection en simulate).
        // Si SHELL, el piso (0.94) o el umbral (0.9) cambian, verificar que
        // sphR de cáscara siga siendo > 0.9 tras la perturbación asimétrica.
        const noise = this.dirNoise(dx, y, dz);
        this.sphR[i] = baseR * (1 + 0.35 * noise);
      } else {
        // volumen interior: el cuerpo se siente macizo
        y = Math.random() * 2 - 1;
        r = Math.sqrt(Math.max(0, 1 - y * y));
        th = Math.random() * Math.PI * 2;
        this.sphR[i] = 0.2 + Math.pow(Math.random(), 0.5) * 0.68;
      }
      this.dir[i * 3] = r * Math.cos(th);
      this.dir[i * 3 + 1] = y;
      this.dir[i * 3 + 2] = r * Math.sin(th);

      this.seed[i] = Math.random() * Math.PI * 2;
      this.size0[i] = 1.3 + Math.random() * 2.1;
      const [cr, cg, cb] = samplePalette("idle", Math.random());
      this.cr[i] = cr; this.cg[i] = cg; this.cb[i] = cb;
      this.tr[i] = cr; this.tg[i] = cg; this.tb[i] = cb;
    }

    // Máscara de púas: ~1/13 ≈ 7.7% de partículas de cáscara se marcan como activas.
    // Hash determinista sobre TODOS los índices → cobertura espacial uniforme
    // (sin early-exit: evita la concentración hemisférica que ocurría antes).
    for (let i = 0; i < ns; i++) {
      this.spikeMask[i] = (((i * 2654435761) >>> 0) % 13 === 0) ? 1 : 0;
    }
  }

  // vecinos en la cáscara via grid esférico → aristas del grafo
  private buildEdges() {
    const ns = Math.floor(N * SHELL);
    const B = 48;
    const cells = new Map<number, number[]>();
    const cellOf = (i: number) => {
      const y = this.dir[i * 3 + 1];
      const th = Math.atan2(this.dir[i * 3 + 2], this.dir[i * 3]);
      const a = Math.floor(((y + 1) / 2) * (B - 1));
      const b = Math.floor(((th + Math.PI) / (2 * Math.PI)) * (B - 1));
      return a * B + b;
    };
    for (let i = 0; i < ns; i++) {
      const c = cellOf(i);
      let arr = cells.get(c);
      if (!arr) { arr = []; cells.set(c, arr); }
      arr.push(i);
    }
    const deg = new Uint8Array(ns);
    // Subir umbral de grado 3→4 para más conexiones y textura de circuito
    const maxDeg = 4;
    const thresh2 = 0.0021; // chord² ≈ vecinos inmediatos en 11.5k puntos
    let e = 0;
    // Recorrer en orden áureo ENTRELAZADO (no por latitud): el índice fibonacci
    // crece monótono con la latitud, así que iterar 0..ns secuencialmente agota
    // el presupuesto MAX_EDGES en un casquete polar y deja el resto de la esfera
    // sin aristas. El stride áureo visita todas las latitudes intercaladas → las
    // aristas se reparten parejo por TODA la esfera con el mismo presupuesto.
    const stride = Math.round(ns * 0.6180339887) | 1;
    outer: for (let k = 0, i = 0; k < ns; k++, i = (i + stride) % ns) {
      if (deg[i] >= maxDeg) continue;
      const y = this.dir[i * 3 + 1];
      const th = Math.atan2(this.dir[i * 3 + 2], this.dir[i * 3]);
      const a0 = Math.floor(((y + 1) / 2) * (B - 1));
      const b0 = Math.floor(((th + Math.PI) / (2 * Math.PI)) * (B - 1));
      for (let da = -1; da <= 1; da++) {
        for (let db = -1; db <= 1; db++) {
          const arr = cells.get((a0 + da) * B + ((b0 + db + B) % B));
          if (!arr) continue;
          for (const j of arr) {
            if (j <= i || deg[j] >= maxDeg) continue;
            const dx = this.dir[i * 3] - this.dir[j * 3];
            const dy = this.dir[i * 3 + 1] - this.dir[j * 3 + 1];
            const dz = this.dir[i * 3 + 2] - this.dir[j * 3 + 2];
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < thresh2) {
              this.edgeA[e] = i;
              this.edgeB[e] = j;
              this.edgePh[e] = Math.random() * Math.PI * 2;
              this.edgeSp[e] = 0.8 + Math.random() * 1.8;
              this.edgeFPh[e] = Math.random() * Math.PI * 2;
              this.edgeFSp[e] = 2 + Math.random() * 6;
              deg[i]++; deg[j]++;
              if (++e >= MAX_EDGES) break outer;
              if (deg[i] >= maxDeg) break;
            }
          }
        }
        if (deg[i] >= maxDeg) break;
      }
    }
    this.edgeCount = e;
  }

  get center(): { x: number; y: number } {
    return { x: this.w / 2, y: this.h * 0.5 };
  }
  get R(): number {
    return Math.min(this.w, this.h) * 0.23;
  }

  resize(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.gl.viewport(0, 0, w, h);
    this.regenSky();
    this.sampleWord();
  }

  private regenSky() {
    const { x: cx, y: cy } = this.center;
    for (let i = 0; i < N; i++) {
      this.sky[i * 3] = (Math.random() - 0.5) * this.w * 1.15;
      this.sky[i * 3 + 1] = Math.random() * this.h * 1.1 - cy;
      this.sky[i * 3 + 2] = (Math.random() - 0.5) * this.R * 1.6;
    }
    void cx;
  }

  private sampleWord() {
    this.wordCount = 0;
    if (typeof document === "undefined" || this.w === 0) return;
    const off = document.createElement("canvas");
    const fontSize = Math.min(this.w * 0.12, this.h * 0.22);
    off.width = this.w;
    off.height = Math.ceil(fontSize * 1.6);
    const ctx = off.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.font = `400 ${fontSize}px Michroma, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(WORD, off.width / 2, off.height / 2);
    const data = ctx.getImageData(0, 0, off.width, off.height).data;
    const pts: number[] = [];
    const step = Math.max(3, Math.round(fontSize / 38));
    const { x: cx, y: cy } = this.center;
    const yBase = cy + this.R * 1.35 - off.height / 2;
    for (let y = 0; y < off.height; y += step) {
      for (let x = 0; x < off.width; x += step) {
        if (data[(y * off.width + x) * 4 + 3] > 128) {
          pts.push(x - cx, y + yBase - cy);
        }
      }
    }
    this.wordCount = Math.min(2400, pts.length / 2);
    this.wordPos = new Float32Array(pts.slice(0, this.wordCount * 2));
  }

  setMode(mode: SessionState) {
    if (mode === this.mode) return;
    const prev = this.mode;
    this.mode = mode;
    for (let i = 0; i < N; i++) {
      const [r, g, b] = samplePalette(mode, Math.random());
      this.tr[i] = r; this.tg[i] = g; this.tb[i] = b;
    }
    const wake = prev === "idle";
    const motion = this.reducedMotion ? 0.25 : 1;
    // listening: snap más duro — las partículas se clavan en la esfera con convicción
    const listenExtra = mode === "listening" ? 1.35 : 1.0;
    this.snap = Math.min(1.3, this.snap + (wake ? 1.15 : 0.85) * listenExtra) * motion;
    this.flash = Math.min(1.4, this.flash + (wake ? 1.1 : 0.55));
    this.spawnWaves(wake ? 3 : 1, wake ? 0.5 : 0.26);
    if (mode === "processing") this.lockCooldown = 0.4;
    // patada 3D: el cuerpo se sacude al cambiar
    const R = this.R || 200;
    // listening: kick más fuerte para que las partículas lleguen con más inercia
    const kick = (wake ? 0.55 : 0.35) * listenExtra * motion;
    for (let i = 0; i < N; i++) {
      const az = this.seed[i] * 7.7 + i;
      const el = Math.acos(2 * ((i * 0.61803) % 1) - 1);
      const m = R * kick * (0.5 + ((i * 0.317) % 1) * 1.6);
      const s = Math.sin(el);
      this.vel[i * 3] += s * Math.cos(az) * m;
      this.vel[i * 3 + 1] += Math.cos(el) * m;
      this.vel[i * 3 + 2] += s * Math.sin(az) * m;
    }
  }

  private spawnWaves(count: number, a0: number) {
    const R = this.R || 200;
    for (let i = 0; i < count; i++) {
      this.waves.push({ r: -i * R * 0.5, v: R * 3.8, a0 });
    }
    if (this.waves.length > 4) this.waves.splice(0, this.waves.length - 4);
  }

  frame(dt: number, t: number, externalAmp: number) {
    const gl = this.gl;
    const target = MODE[this.mode];
    const k = Math.min(1, dt * 3);
    this.curP.glow += (target.glow - this.curP.glow) * k;
    this.curP.rot += (target.rot - this.curP.rot) * k;
    this.curP.edge += (target.edge - this.curP.edge) * k;
    this.curP.fire += (target.fire - this.curP.fire) * k;
    this.curP.turb += (target.turb - this.curP.turb) * k;
    this.curP.body += (target.body - this.curP.body) * k;
    this.curP.sky += (target.sky - this.curP.sky) * k;

    this.snap *= Math.exp(-dt * 2.6);
    this.flash *= Math.exp(-dt * 2.6);
    this.waveCooldown -= dt;
    this.lockCooldown -= dt;

    // listening: alinear anillos (1) o liberar (0) suavemente — tasa ~dt*3
    const ringAlignTarget = this.mode === "listening" ? 1 : 0;
    this.ringAlign += (ringAlignTarget - this.ringAlign) * Math.min(1, dt * 3);

    // listening: inclinar la esfera levemente hacia adelante (~-0.12 rad extra)
    // atenuado con reducedMotion
    const leanTarget = (this.mode === "listening" && !this.reducedMotion) ? -0.12 : 0;
    this.tiltLean += (leanTarget - this.tiltLean) * Math.min(1, dt * 3);

    // speaking: decaer el pop radial de erupción
    this.eruptionPop *= Math.exp(-dt * 8.0);

    const amp = Math.min(1, Math.max(externalAmp, this.ambient(t)));
    if (this.mode === "speaking" && amp > 0.55 && this.waveCooldown <= 0 && !this.reducedMotion) {
      this.spawnWaves(1, 0.1 + amp * 0.14);
      this.waveCooldown = 0.35;
      // Erupción radial: bump de flash y pop para que la esfera estalle en el pico
      // (reducedMotion ya verificado en el guard del if: motion = 1 aquí)
      this.flash = Math.min(1.4, this.flash + 0.18 * amp);
      this.eruptionPop = Math.min(0.18, this.eruptionPop + 0.12 * amp);
    }

    // Pulsos de "lock": cada ~0.8 s en processing, una oleada llega al núcleo
    // y el anillo interior flashea — emula datos siendo capturados/procesados.
    // Respeta reducedMotion: pulso más débil y sin onda de choque extra.
    if (this.mode === "processing" && this.lockCooldown <= 0) {
      const motion = this.reducedMotion ? 0.3 : 1;
      this.flash = Math.min(1.4, this.flash + 0.22 * motion);
      this.spawnWaves(1, 0.18 * motion);
      this.lockCooldown = 0.75 + Math.random() * 0.1; // ~0.8 s con jitter leve
    }

    const motion = this.reducedMotion ? 0.3 : 1;
    this.rotY += this.curP.rot * dt * motion;

    // Respiración: ciclo lento sinusoidal; más lento con reducedMotion
    const breathSpeed = this.reducedMotion ? 0.25 : 0.6;
    this.breath = 0.5 + 0.5 * Math.sin(t * breathSpeed);

    this.simulate(dt, t, amp, motion);

    // ---- draw ----
    const { x: cx, y: cy } = this.center;
    gl.useProgram(this.bgProg);
    gl.blendFunc(gl.ONE, gl.ZERO);
    gl.uniform2f(this.uni.bg_res, this.w, this.h);
    gl.uniform1f(this.uni.bg_t, t);
    const base = PALETTE[this.mode].base;
    gl.uniform3f(this.uni.bg_color, base[0] / 255, base[1] / 255, base[2] / 255);
    gl.uniform1f(this.uni.bg_glow, this.curP.glow);
    gl.uniform1f(this.uni.bg_amp, amp);
    gl.uniform2f(this.uni.bg_center, cx, this.h - cy);
    gl.uniform1f(this.uni.bg_sky, this.curP.sky);
    gl.uniform1f(this.uni.bg_flash, this.flash);
    this.wv.fill(0);
    const wv = this.wv;
    let wi = 0;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.r += w.v * dt;
      const maxR = this.R * 3.4;
      if (w.r > maxR) { this.waves.splice(i, 1); continue; }
      if (wi < 4 && w.r > 0) {
        wv[wi * 4] = w.r;
        wv[wi * 4 + 1] = w.a0 * Math.max(0, 1 - w.r / maxR);
        wi++;
      }
    }
    gl.uniform4fv(this.uni.bg_waves, wv);
    gl.bindVertexArray(this.bgVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.blendFunc(gl.ONE, gl.ONE); // aditivo: todo es luz

    // grafo
    if (this.curP.edge > 0.02 && this.edgeCount > 0) {
      this.fillEdges(t, amp);
      gl.useProgram(this.lnProg);
      gl.uniform2f(this.uni.ln_res, this.w, this.h);
      gl.bindVertexArray(this.lnVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.eposBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.epos, 0, this.edgeCount * 4);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ecolBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.ecol, 0, this.edgeCount * 8);
      gl.drawArrays(gl.LINES, 0, this.edgeCount * 2);
    }

    // anillos HUD: intensity sube fuera de idle para leer "el sistema activo"
    const ringIntensity = this.mode === "idle"
      ? 0.35 + this.curP.glow * 0.15
      : 0.65 + this.curP.glow * 0.25;
    this.drawRings(t, ringIntensity, amp);

    // puntos: pasada halo (bloom barato) + pasada núcleo
    gl.useProgram(this.ptProg);
    gl.uniform2f(this.uni.pt_res, this.w, this.h);
    gl.bindVertexArray(this.ptVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.pos2);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.col4);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sizeBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.sz);
    gl.uniform1f(this.uni.pt_sizeMul, 3.4);
    gl.uniform1f(this.uni.pt_alphaMul, 0.16 + this.flash * 0.12);
    gl.drawArrays(gl.POINTS, 0, N);
    gl.uniform1f(this.uni.pt_sizeMul, 1.0);
    gl.uniform1f(this.uni.pt_alphaMul, 1.0);
    gl.drawArrays(gl.POINTS, 0, N);
    gl.bindVertexArray(null);
  }

  private ambient(t: number): number {
    if (this.reducedMotion) return 0.12;
    switch (this.mode) {
      case "listening":
        return 0.2 + 0.13 * Math.sin(t * 1.7) + 0.08 * Math.sin(t * 4.3 + 1.2);
      case "processing":
        return 0.3 + 0.12 * Math.sin(t * 6.1);
      case "speaking": {
        const gate = Math.sin(t * 1.9) > -0.25 ? 1 : 0.2;
        const burst = 0.5 + 0.3 * Math.sin(t * 7.3) + 0.2 * Math.sin(t * 13.7 + 1);
        return Math.max(0, burst * gate * 0.7);
      }
      default:
        return 0.05 + 0.03 * Math.sin(t * 0.7);
    }
  }

  // física + proyección + color de las N partículas
  private simulate(dt: number, t: number, amp: number, motion: number) {
    const { x: cx, y: cy } = this.center;
    const R = this.R;
    const f = R * 3.4;
    const form = FORM[this.mode];
    const cosY = Math.cos(this.rotY);
    const sinY = Math.sin(this.rotY);
    // tiltLean: inclinación suave hacia adelante en listening (0 en otros estados)
    const tiltAngle = -0.34 + this.tiltLean;
    const tiltC = Math.cos(tiltAngle);
    const tiltS = Math.sin(tiltAngle);
    const K = (9 + this.snap * 75) * motion;
    const D = 4.4 + this.snap * 3.5;
    const colorK = Math.min(1, dt * 2.8);
    const turb = this.curP.turb * R * 0.9 * motion;
    // luz que orbita el cuerpo
    const Lx = Math.sin(t * 0.25) * 0.62;
    const Ly = 0.55;
    const Lz = -Math.cos(t * 0.25) * 0.62;
    // Respiración: expansión/contracción suave; atenuada con reducedMotion
    const breathScale = this.reducedMotion ? 0.3 : 1.0;
    let ampR = 1 + amp * 0.17 + this.flash * 0.05;
    ampR *= 1 + this.breath * 0.04 * breathScale;
    const sizeBoost = (1 + this.flash * 0.5) * (1 + amp * 0.18);
    const bodyA = this.curP.body;
    const skyMix = this.curP.sky;

    for (let i = 0; i < N; i++) {
      const i3 = i * 3;
      // ---- target según la forma activa ----
      let tx: number, ty: number, tz: number;
      let bright: number;
      let alpha: number;
      let size: number;

      if (form === 0) {
        if (i < this.wordCount) {
          tx = this.wordPos[i * 2];
          ty = this.wordPos[i * 2 + 1];
          tz = -R * 0.15;
          bright = 1.15;
          alpha = 0.8 * (0.7 + 0.3 * Math.sin(t * 2.1 + this.seed[i]));
          size = this.size0[i] * 0.9;
        } else {
          tx = this.sky[i3] + Math.sin(t * 0.07 + this.seed[i]) * 9;
          ty = this.sky[i3 + 1] + Math.cos(t * 0.05 + this.seed[i] * 1.3) * 7;
          tz = this.sky[i3 + 2];
          const tw = 0.5 + 0.5 * Math.sin(t * (0.5 + (this.seed[i] % 1.7)) + this.seed[i] * 13);
          alpha = (0.18 + 0.5 * tw * tw) * 0.9;
          bright = 0.95;
          size = this.size0[i] * (0.55 + 0.45 * tw);
        }
      } else if (form === 1) {
        // esfera iluminada; ondas de voz recorren el cuerpo al hablar
        const dx = this.dir[i3];
        const dy = this.dir[i3 + 1];
        const dz = this.dir[i3 + 2];
        const rx = dx * cosY + dz * sinY;
        const rz = -dx * sinY + dz * cosY;
        let rad = R * this.sphR[i] * ampR;
        if (this.mode === "speaking") {
          const lat = Math.acos(Math.max(-1, Math.min(1, dy)));
          // Onda primaria reforzada (0.06 → 0.10) + segundo armónico para riqueza
          rad += Math.sin(lat * 7 - t * 11) * amp * R * 0.10;
          rad += Math.sin(lat * 13 - t * 17 + 0.8) * amp * R * 0.04;
          // Pop radial de erupción: breve expansión en picos de amp (clamped)
          rad += this.eruptionPop * R * (0.5 + 0.5 * this.sphR[i]);
        }
        const shell = this.sphR[i] > 0.9;
        // Púas radiales: cáscara marcada se eriza con la voz; atenuado con reducedMotion
        if (shell && this.spikeMask[i] > 0) {
          const spikeAtten = this.reducedMotion ? 0.3 : 1.0;
          rad += amp * R * 0.12 * this.spikeMask[i] * spikeAtten;
        }
        tx = rx * rad;
        ty = dy * rad;
        tz = rz * rad;
        const diff = 0.4 + 0.6 * Math.max(0, rx * Lx + dy * Ly + rz * Lz);
        const rim = Math.pow(1 - Math.abs(rz), 2.2) * 0.85;
        bright = (diff + rim) * (shell ? 1.15 : 0.7);
        alpha = (shell ? 0.85 : 0.4) * bodyA * (0.75 + 0.25 * Math.sin(t * this.seed[i] + i));
        size = this.size0[i] * (shell ? 1 : 0.8);
      } else {
        // processing: escaneo / fetch de información estilo Jarvis.
        // Las partículas fluyen HACIA ADENTRO en oleadas continuas —
        // "fragmentos de datos siendo absorbidos por el núcleo" — con PARCHES DE
        // DENSIDAD que derivan por la nube mientras se mueve, para que no se lea
        // plana (zonas más densas/brillantes que la recorren).
        //
        //   STREAM_SPEED = 0.55  — velocidad de barrido (ciclo ~1.8 s).
        //   EXTRA_RAD    = 1.6   — distancia máxima de origen (1.6 × R fuera de la esfera).
        //   NEAR_THRESH  = 0.08  — fracción de ciclo donde la partícula "llegó".
        //
        // sweep s ∈ (0,1]: 1 = lejos (recién salida), 0 = llegó al núcleo.
        const STREAM_SPEED = 0.55;
        const EXTRA_RAD    = 1.6;
        const NEAR_THRESH  = 0.08;

        const raw = t * STREAM_SPEED + this.seed[i] / (Math.PI * 2);
        const s = 1 - (raw - Math.floor(raw)); // s ∈ (0, 1], grande = lejos

        // radio: parte lejos (sphR[i] + EXTRA_RAD) y se acerca suavemente al núcleo
        const distFrac = s * s; // curvatura cuadrática → aceleración al llegar
        const rad = R * (this.sphR[i] + distFrac * EXTRA_RAD);

        // dirección fija en la esfera → trayectoria radial propia (cobertura total)
        const dx = this.dir[i3];
        const dy = this.dir[i3 + 1];
        const dz = this.dir[i3 + 2];
        const rx = dx * cosY + dz * sinY;
        const rz = -dx * sinY + dz * cosY;
        tx = rx * rad;
        ty = dy * rad;
        tz = rz * rad;

        // Parches de densidad móviles: lóbulos suaves sobre la dirección fija que
        // derivan con el tiempo → zonas de la nube más densas/brillantes que la
        // recorren mientras se mueve. dens ∈ [0,1].
        const lobe =
          Math.sin(dx * 2.3 + dy * 1.7 + t * 0.9) *
          Math.cos(dz * 2.1 - dy * 1.3 + t * 0.6);
        const dens = Math.max(0, lobe);

        const nearness = 1 - s;                         // 0 = lejos, 1 = llegó
        const atNucleus = s < NEAR_THRESH ? 1 : 0;
        bright = (0.45 + nearness * 0.9 + atNucleus * 0.4 + amp * 0.25) * (0.85 + 0.6 * dens);
        const arrivalAlpha = Math.max(0, 1 - s * s * 3);  // fade-in rápido
        alpha  = (0.25 + arrivalAlpha * 0.65) * bodyA * (0.8 + 0.5 * dens);
        size = this.size0[i] * (0.6 + nearness * 0.55) * (0.9 + 0.5 * dens);
      }

      // ---- resorte + turbulencia ----
      let vx = this.vel[i3];
      let vy = this.vel[i3 + 1];
      let vz = this.vel[i3 + 2];
      vx += ((tx - this.cur[i3]) * K - vx * D) * dt;
      vy += ((ty - this.cur[i3 + 1]) * K - vy * D) * dt;
      vz += ((tz - this.cur[i3 + 2]) * K - vz * D) * dt;
      if (turb > 0.01) {
        // el wordmark se mantiene legible: casi nada de turbulencia
        const tb = form === 0 && i < this.wordCount ? turb * 0.15 : turb;
        vx += Math.sin(t * 1.3 + this.seed[i] * 5.1) * tb * dt;
        vy += Math.sin(t * 1.7 + this.seed[i] * 3.7) * tb * dt * 0.7;
        vz += Math.cos(t * 1.1 + this.seed[i] * 7.3) * tb * dt;
      }
      this.vel[i3] = vx;
      this.vel[i3 + 1] = vy;
      this.vel[i3 + 2] = vz;
      const x = (this.cur[i3] += vx * dt);
      let y = this.cur[i3 + 1] += vy * dt;
      let z = this.cur[i3 + 2] += vz * dt;

      // tilt global + proyección
      const y2 = y * tiltC - z * tiltS;
      z = y * tiltS + z * tiltC;
      y = y2;
      const persp = f / (f + z);
      this.pos2[i * 2] = cx + x * persp;
      this.pos2[i * 2 + 1] = cy + y * persp;

      // color
      const cr = (this.cr[i] += (this.tr[i] - this.cr[i]) * colorK);
      const cg = (this.cg[i] += (this.tg[i] - this.cg[i]) * colorK);
      const cb = (this.cb[i] += (this.tb[i] - this.cb[i]) * colorK);
      const depth = form === 0 ? 1 : 0.55 + 0.45 * persp * persp;
      const i4 = i * 4;
      this.col4[i4] = cr * bright;
      this.col4[i4 + 1] = cg * bright;
      this.col4[i4 + 2] = cb * bright;
      this.col4[i4 + 3] = Math.min(1, alpha * depth * (1 - skyMix * 0.18) * (1 + this.flash * 0.5));
      this.sz[i] = Math.max(1, size * persp * sizeBoost);
    }
  }

  // Anillos HUD concéntricos: 3 anillos finos que rotan a velocidades
  // distintas + ticks radiales cortos ("telemetría"). Color = Aurora idle.hi.
  // No aloca en el hot-path: escribe en rpos/rcol preallocated.
  // amp: amplitud de mic 0..1 — usada para el arco-medidor en listening.
  private drawRings(t: number, intensity: number, amp: number) {
    const gl = this.gl;
    const { x: cx, y: cy } = this.center;
    const R = this.R;
    // reducedMotion: congelar casi por completo la rotación
    const motionScale = this.reducedMotion ? 0.08 : 1.0;
    const SEGS = 120;          // segmentos de arco por anillo
    const TICK_STEP = 12;      // grado entre ticks (cada 12°)
    const TICKS = Math.round(360 / TICK_STEP); // = 30
    const TICK_LEN = 0.06;     // fracción del radio del anillo

    // Color base del anillo = accent del estado (el mismo PALETTE.base que viste el
    // chrome HTML y el fondo), para que el marco se sienta parte del mismo sistema
    // vivo y no un overlay violeta pegado aparte.
    const BASE = PALETTE[this.mode].base;
    const br = BASE[0] / 255;
    const bg = BASE[1] / 255;
    const bb = BASE[2] / 255;
    // Color de acento para los realces de telemetría (el dot que corre por los ticks
    // y el blip que orbita): el .hi del estado, para que "salte" sobre el anillo base.
    const ACC = PALETTE[this.mode].hi;
    const ar = ACC[0] / 255;
    const ag = ACC[1] / 255;
    const ab = ACC[2] / 255;

    // Respiración del marco: late con el mismo ciclo de respiración del núcleo + la
    // voz, así el anillo no se siente estático. breathPulse ∈ ~[-1,1].
    const breathPulse = (this.breath - 0.5) * 2;
    const breathR = this.reducedMotion ? 0 : 0.014 * breathPulse + amp * 0.03;
    // alpha base "vivo": piso + respiración + surge con la voz. Blending aditivo, así
    // que más alpha = más glow → el marco se ilumina cuando Wattson habla/escucha.
    const baseA = intensity * (0.22 + 0.12 * this.breath + 0.30 * amp);

    let vIdx = 0;  // siguiente vértice disponible
    const rpos = this.rpos;
    const rcol = this.rcol;

    // En processing, acelerar la rotación de los anillos para transmitir urgencia.
    // Factor 3× solo en processing, sin afectar otros estados.
    const ringSpeedMul = this.mode === "processing" ? 3.0 : 1.0;

    // listening: ángulo de alineación fijo — los anillos "se detienen" aquí.
    // Se elige π/6 (30°) como postura natural de escucha.
    const ALIGN_ANGLE = Math.PI / 6;

    for (let ri = 0; ri < RING_SPEC.length; ri++) {
      const [factor, speed] = RING_SPEC[ri];
      // El radio respira (breathR) en sincronía con el núcleo.
      const r = R * factor * (1 + breathR);
      // baseSpin: el giro libre; se mezcla hacia ALIGN_ANGLE según ringAlign.
      // En processing ringSpeedMul no se toca (ringAlign = 0 ahí).
      const baseSpin = t * speed * motionScale * ringSpeedMul;
      const rotOff = baseSpin * (1 - this.ringAlign) + ALIGN_ANGLE * this.ringAlign;

      // ---- arco como gl.LINES (120 segmentos) ----
      for (let s = 0; s < SEGS; s++) {
        if (vIdx + 2 > WattsonGLEngine.MAX_RING_VERTS) break;
        const a0 = rotOff + (s / SEGS) * Math.PI * 2;
        const a1 = rotOff + ((s + 1) / SEGS) * Math.PI * 2;
        const p0x = cx + Math.cos(a0) * r;
        const p0y = cy + Math.sin(a0) * r;
        const p1x = cx + Math.cos(a1) * r;
        const p1y = cy + Math.sin(a1) * r;
        const v = vIdx * 2;
        rpos[v]     = p0x; rpos[v + 1] = p0y;
        rpos[v + 2] = p1x; rpos[v + 3] = p1y;
        const c = vIdx * 4;
        rcol[c]     = br; rcol[c + 1] = bg; rcol[c + 2] = bb; rcol[c + 3] = baseA;
        rcol[c + 4] = br; rcol[c + 5] = bg; rcol[c + 6] = bb; rcol[c + 7] = baseA;
        vIdx += 2;
      }

      // ---- ticks radiales: gauge mayor/menor + realce que CORRE ----
      // Patrón de instrumento: cada 5º tick es "mayor" (más largo y brillante).
      // Encima, un pulso agudo recorre el anillo (chase) — un punto de luz que da la
      // vuelta, dirección alterna por anillo, para que el marco lea "escaneando".
      const chaseDir = (ri % 2 === 0) ? 1 : -1;
      const chaseSpeed = this.reducedMotion ? 0 : (0.6 + ri * 0.28);
      for (let ti = 0; ti < TICKS; ti++) {
        if (vIdx + 2 > WattsonGLEngine.MAX_RING_VERTS) break;
        const frac = ti / TICKS;
        const ang = rotOff + frac * Math.PI * 2;
        const isMajor = (ti % 5) === 0;
        // chase ∈ [0,1]: pulso agudo (pow) viajando una vuelta por el anillo.
        const chase = Math.pow(
          Math.max(0, Math.sin(frac * Math.PI * 2 - chaseDir * t * chaseSpeed)),
          6,
        );
        const tickA = baseA * (isMajor ? 1.5 : 0.7) + baseA * 2.6 * chase;
        const r0 = r;
        const r1 = r * (1 + TICK_LEN * (isMajor ? 1.6 : 1.0) + TICK_LEN * 1.3 * chase);
        // color: base→accent según el chase, así el punto que corre toma el .hi.
        const mr = br + (ar - br) * chase;
        const mg = bg + (ag - bg) * chase;
        const mb = bb + (ab - bb) * chase;
        const cosA = Math.cos(ang);
        const sinA = Math.sin(ang);
        const v = vIdx * 2;
        rpos[v]     = cx + cosA * r0; rpos[v + 1] = cy + sinA * r0;
        rpos[v + 2] = cx + cosA * r1; rpos[v + 3] = cy + sinA * r1;
        const c = vIdx * 4;
        rcol[c]     = mr; rcol[c + 1] = mg; rcol[c + 2] = mb; rcol[c + 3] = tickA;
        rcol[c + 4] = mr; rcol[c + 5] = mg; rcol[c + 6] = mb; rcol[c + 7] = tickA;
        vIdx += 2;
      }
    }

    // ---- Blip de telemetría orbitando (SIEMPRE activo, también en reposo) ----
    // Un arco corto y brillante que da vueltas perpetuamente sobre el anillo medio:
    // dice "el sistema siempre está escaneando", incluso idle. Brillo en campana
    // (sin(π·f)) para que se desvanezca en los bordes en vez de cortar seco.
    {
      const blipR = R * RING_SPEC[1][0] * (1 + breathR);
      const blipSpeed = this.reducedMotion ? 0.05 : 0.5;
      const blipCenter = t * blipSpeed;
      const BLIP_SEGS = 14;
      const BLIP_SPAN = 0.42;                     // ~24° de arco
      const blipA = intensity * (0.55 + 0.45 * amp);
      for (let s = 0; s < BLIP_SEGS; s++) {
        if (vIdx + 2 > WattsonGLEngine.MAX_RING_VERTS) break;
        const f0 = s / BLIP_SEGS;
        const f1 = (s + 1) / BLIP_SEGS;
        const a0 = blipCenter + (f0 - 0.5) * BLIP_SPAN;
        const a1 = blipCenter + (f1 - 0.5) * BLIP_SPAN;
        const e0 = Math.sin(f0 * Math.PI);        // envolvente campana
        const e1 = Math.sin(f1 * Math.PI);
        const v = vIdx * 2;
        rpos[v]     = cx + Math.cos(a0) * blipR; rpos[v + 1] = cy + Math.sin(a0) * blipR;
        rpos[v + 2] = cx + Math.cos(a1) * blipR; rpos[v + 3] = cy + Math.sin(a1) * blipR;
        const c = vIdx * 4;
        rcol[c]     = ar; rcol[c + 1] = ag; rcol[c + 2] = ab; rcol[c + 3] = blipA * e0;
        rcol[c + 4] = ar; rcol[c + 5] = ag; rcol[c + 6] = ab; rcol[c + 7] = blipA * e1;
        vIdx += 2;
      }
    }

    // ---- Arco-medidor de mic (solo en listening) ----
    // Dibuja un arco más brillante en el anillo exterior (factor 1.80) proporcional
    // a amp — de 0° a amp×340° (casi la vuelta completa en voz alta).
    // Usa PALETTE.listening.hi para diferenciarse visualmente del anillo base.
    // No aloca: escribe en rpos/rcol preallocated; el pico de 120 segs × 2 = 240 verts
    // ya está incluido en MAX_RING_VERTS = 1280 (ver cálculo en la declaración).
    if (this.mode === "listening" || this.ringAlign > 0.05) {
      const outerFactor = RING_SPEC[RING_SPEC.length - 1][0]; // 1.80
      const outerR = R * outerFactor;
      // ángulo de inicio: parte de la orientación fija del anillo alineado
      const arcStart = ALIGN_ANGLE;
      // sweep: 0..340° proporcional a amp (no toca los últimos 20° como respiradero)
      const arcSweep = amp * (340 / 360) * Math.PI * 2;
      // color: PALETTE.listening.hi = [255, 150, 220]
      const LH = PALETTE.listening.hi;
      const lr = LH[0] / 255;
      const lg = LH[1] / 255;
      const lb = LH[2] / 255;
      // alpha: más brillante que el anillo base, mezclado con ringAlign para
      // que el arco no aparezca en estados donde ringAlign es casi cero.
      // reducedMotion: suprimir el arco-medidor por completo (motion cero).
      const arcA = 0.75 * intensity * this.ringAlign * (this.reducedMotion ? 0 : 1);
      // segmentos proporcionales a amp — mínimo 2, máximo SEGS
      const arcSegs = Math.max(2, Math.round(SEGS * amp));
      for (let s = 0; s < arcSegs; s++) {
        if (vIdx + 2 > WattsonGLEngine.MAX_RING_VERTS) break;
        const a0 = arcStart + (s / arcSegs) * arcSweep;
        const a1 = arcStart + ((s + 1) / arcSegs) * arcSweep;
        const p0x = cx + Math.cos(a0) * outerR;
        const p0y = cy + Math.sin(a0) * outerR;
        const p1x = cx + Math.cos(a1) * outerR;
        const p1y = cy + Math.sin(a1) * outerR;
        const v = vIdx * 2;
        rpos[v]     = p0x; rpos[v + 1] = p0y;
        rpos[v + 2] = p1x; rpos[v + 3] = p1y;
        const c = vIdx * 4;
        rcol[c]     = lr; rcol[c + 1] = lg; rcol[c + 2] = lb; rcol[c + 3] = arcA;
        rcol[c + 4] = lr; rcol[c + 5] = lg; rcol[c + 6] = lb; rcol[c + 7] = arcA;
        vIdx += 2;
      }
    }

    if (vIdx === 0) return;

    gl.useProgram(this.lnProg);
    gl.uniform2f(this.uni.ln_res, this.w, this.h);
    gl.bindVertexArray(this.ringVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.rposBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, rpos, 0, vIdx * 2);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.rcolBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, rcol, 0, vIdx * 4);
    gl.drawArrays(gl.LINES, 0, vIdx);
    gl.bindVertexArray(null);
  }

  private fillEdges(t: number, amp: number) {
    const base = this.curP.edge;
    const p0 = PALETTE[this.mode].base;
    const hi = PALETTE[this.mode].hi;
    const R = this.R;
    const maxLen2 = (R * 0.32) ** 2;
    for (let e = 0; e < this.edgeCount; e++) {
      const a = this.edgeA[e];
      const b = this.edgeB[e];
      const ax = this.pos2[a * 2];
      const ay = this.pos2[a * 2 + 1];
      const bx = this.pos2[b * 2];
      const by = this.pos2[b * 2 + 1];
      const dx = ax - bx;
      const dy = ay - by;
      const stretch = 1 - (dx * dx + dy * dy) / maxLen2;
      let alpha = 0;
      let sr = 0, sg = 0, sb = 0;
      if (stretch > 0) {
        const pulse = this.reducedMotion ? 0.7 : 0.45 + 0.55 * Math.sin(t * this.edgeSp[e] + this.edgePh[e]);
        const spark = this.curP.fire > 0.02 && !this.reducedMotion
          ? Math.pow(Math.max(0, Math.sin(t * this.edgeFSp[e] + this.edgeFPh[e])), 28) * this.curP.fire
          : 0;
        alpha = base * stretch * (0.22 + 0.48 * pulse + amp * 0.35) + spark * 0.85;
        const m = spark;
        sr = (p0[0] + (hi[0] - p0[0]) * m) / 255;
        sg = (p0[1] + (hi[1] - p0[1]) * m) / 255;
        sb = (p0[2] + (hi[2] - p0[2]) * m) / 255;
      }
      const e4 = e * 4;
      this.epos[e4] = ax; this.epos[e4 + 1] = ay;
      this.epos[e4 + 2] = bx; this.epos[e4 + 3] = by;
      const e8 = e * 8;
      this.ecol[e8] = sr; this.ecol[e8 + 1] = sg; this.ecol[e8 + 2] = sb; this.ecol[e8 + 3] = alpha;
      this.ecol[e8 + 4] = sr; this.ecol[e8 + 5] = sg; this.ecol[e8 + 6] = sb; this.ecol[e8 + 7] = alpha;
    }
  }
}
