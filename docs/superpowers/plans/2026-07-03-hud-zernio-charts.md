# Gráficas de Zernio en el HUD — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El HUD muestra las métricas de Zernio (`social_metrics_lookup`) como gráficas de barras SVG estilo holográfico, reveladas con una coreografía narrativa beat a beat.

**Architecture:** Extractor puro en el cliente convierte los `tool_call_completed` del WS en `RenderedWidget[]`; `agentClient` los acumula por run y los entrega en `message_done`; un widget nuevo `metric_chart` (SVG a mano, sin Recharts) los pinta; `Canvas` sustituye el stagger plano por beats acumulativos por tipo.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library, CSS puro (App.css). Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-07-03-hud-zernio-charts-design.md`

## Global Constraints

- No tocar ni commitear `apps/hud/src/voice/adapters/webSpeech.ts`, `elevenLabsSpeaker.ts`, `elevenLabsSpeaker.test.ts` (otra sesión los trabaja).
- No cambiar de rama (working tree compartido); commits sobre `feat/wattson-voice-wiring`, siempre con `git add <archivos explícitos>`.
- Sin dependencias nuevas (nada de Recharts).
- Tests: `pnpm --filter @wattson/hud test` (vitest run). Typecheck: `pnpm --filter @wattson/hud typecheck`.
- `prefers-reduced-motion` debe colapsar toda animación nueva a estado final estático.
- Copy en español (títulos: "Seguidores", "Engagement", "Posts por plataforma", "Likes por plataforma", "Vistas por plataforma", "Top contenido"; vacío: "sin datos").

---

### Task 1: Extractor `widgetsFromToolResult`

**Files:**
- Create: `apps/hud/src/api/metricsWidgets.ts`
- Test: `apps/hud/src/api/metricsWidgets.test.ts`

**Interfaces:**
- Consumes: `RenderedWidget` de `apps/hud/src/voice/types.ts` (`{type: string; title: string; data: unknown}`).
- Produces: `widgetsFromToolResult(toolName: string, result: unknown): RenderedWidget[]` y `export interface MetricChartData { points: {name: string; value: number}[]; unit?: string; subtitle?: string }`. Task 2 llama a la función; Task 3 renderiza `MetricChartData`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/hud/src/api/metricsWidgets.test.ts
import { describe, it, expect } from "vitest";
import { widgetsFromToolResult } from "./metricsWidgets";

// Shape real de SocialMetricsResponse (packages/skills/src/social/types.ts)
const zernioResult = {
  request: { platform: "all", username: "luciano" },
  profiles: [
    {
      platform: "instagram",
      username: "luciano",
      followers: 12400,
      engagementRate: 4.27,
      totalPosts: 48,
      totalLikes: 5300,
      totalViews: 91000,
      topPosts: [
        { title: "Lanzamiento del HUD de Wattson", likes: 900 },
        { title: "Detrás de cámaras", views: 700 },
        { title: "corto", impressions: 300 },
      ],
      lastUpdated: "2026-07-01",
    },
    {
      platform: "tiktok",
      username: "luciano",
      totalPosts: 21,
      totalLikes: 8800,
      totalViews: 240000,
      lastUpdated: "2026-07-01",
    },
  ],
  summary: "ok",
  insights: [],
  recommendations: [],
  dataSource: "zernio",
  isMock: false,
  warnings: [],
  unavailable: [],
};

describe("widgetsFromToolResult", () => {
  it("shape Zernio multi-perfil → KPIs + charts por plataforma + top contenido, en orden narrativo", () => {
    const w = widgetsFromToolResult("social_metrics_lookup", zernioResult);
    expect(w.map((x) => `${x.type}:${x.title}`)).toEqual([
      "kpi_card:Seguidores",
      "kpi_card:Engagement",
      "metric_chart:Posts por plataforma",
      "metric_chart:Likes por plataforma",
      "metric_chart:Vistas por plataforma",
      "metric_chart:Top contenido",
    ]);
    expect(w[0].data).toEqual({ value: 12400 });
    expect(w[1].data).toEqual({ value: "4.3%" });
    expect(w[2].data).toMatchObject({
      points: [
        { name: "instagram", value: 48 },
        { name: "tiktok", value: 21 },
      ],
      unit: "posts",
      subtitle: "@luciano · instagram",
    });
  });

  it("top contenido: top 5, trunca títulos largos a 15 chars + elipsis, fallback 'Post N'", () => {
    const w = widgetsFromToolResult("social_metrics_lookup", zernioResult);
    const top = w.find((x) => x.title === "Top contenido")!;
    const points = (top.data as { points: { name: string; value: number }[] }).points;
    expect(points[0]).toEqual({ name: "Lanzamiento del…", value: 900 });
    expect(points[1]).toEqual({ name: "Detrás de cámar…", value: 700 });
    expect(points[2]).toEqual({ name: "corto", value: 300 });
  });

  it("subscribers cubre followers (YouTube)", () => {
    const w = widgetsFromToolResult("social_metrics_lookup", {
      profiles: [{ platform: "youtube", username: "mkbhd", subscribers: 2000, lastUpdated: "t" }],
    });
    expect(w[0]).toMatchObject({ type: "kpi_card", title: "Seguidores", data: { value: 2000 } });
  });

  it("profiles vacío (respuesta 'no encontré username') → []", () => {
    expect(
      widgetsFromToolResult("social_metrics_lookup", { profiles: [], summary: "no username" }),
    ).toEqual([]);
  });

  it("tool ajeno → []", () => {
    expect(widgetsFromToolResult("notion_query", zernioResult)).toEqual([]);
  });

  it("shapes corruptos → [] sin lanzar", () => {
    expect(widgetsFromToolResult("social_metrics_lookup", null)).toEqual([]);
    expect(widgetsFromToolResult("social_metrics_lookup", "boom")).toEqual([]);
    expect(widgetsFromToolResult("social_metrics_lookup", { profiles: "nope" })).toEqual([]);
    expect(widgetsFromToolResult("social_metrics_lookup", { profiles: [null, 7] })).toEqual([]);
  });

  it("métricas en 0 o ausentes no generan charts vacíos", () => {
    const w = widgetsFromToolResult("social_metrics_lookup", {
      profiles: [{ platform: "instagram", username: "x", totalPosts: 0, lastUpdated: "t" }],
    });
    expect(w).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @wattson/hud test -- src/api/metricsWidgets.test.ts`
Expected: FAIL (module `./metricsWidgets` no existe).

- [ ] **Step 3: Write the implementation**

```ts
// apps/hud/src/api/metricsWidgets.ts
import type { RenderedWidget } from "../voice/types";

// Datos que consume el widget metric_chart (Task 3).
export interface MetricChartData {
  points: { name: string; value: number }[];
  unit?: string;
  subtitle?: string;
}

// Alias defensivos: el nombre canónico del skill es social_metrics_lookup,
// los otros son los que usa Jarvis_mvp — cubrirlos cuesta nada.
const SOCIAL_TOOLS = new Set(["social_metrics_lookup", "social_metrics", "social_metrics_skill"]);

const TITLE_MAX = 15;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function toNum(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function truncate(s: string): string {
  return s.length > TITLE_MAX ? `${s.slice(0, TITLE_MAX)}…` : s;
}

// El resultado cruza el WS como JSON: nada aquí confía en el shape.
// Cualquier cosa inesperada → [] (el HUD simplemente no muestra gráficas).
export function widgetsFromToolResult(toolName: string, result: unknown): RenderedWidget[] {
  if (!SOCIAL_TOOLS.has(toolName) || !isRecord(result)) return [];
  const profiles = Array.isArray(result.profiles) ? result.profiles.filter(isRecord) : [];
  if (profiles.length === 0) return [];

  const first = profiles[0];
  const subtitleParts = [
    typeof first.username === "string" && first.username ? `@${first.username}` : null,
    typeof first.platform === "string" && first.platform !== "unknown" ? first.platform : null,
  ].filter((p): p is string => p !== null);
  const subtitle = subtitleParts.length > 0 ? subtitleParts.join(" · ") : undefined;

  const widgets: RenderedWidget[] = [];

  // El orden de emisión ES la narrativa del reveal: cabecera → desgloses → top.
  const followers = toNum(first.followers) || toNum(first.subscribers);
  if (followers > 0) widgets.push({ type: "kpi_card", title: "Seguidores", data: { value: followers } });

  const rate = toNum(first.engagementRate);
  if (rate > 0) widgets.push({ type: "kpi_card", title: "Engagement", data: { value: `${rate.toFixed(1)}%` } });

  const perPlatform = (title: string, unit: string, pick: (p: Record<string, unknown>) => number) => {
    const points = profiles
      .map((p) => ({ name: String(p.platform ?? "?"), value: pick(p) }))
      .filter((d) => d.value > 0);
    if (points.length > 0) {
      const data: MetricChartData = { points, unit, subtitle };
      widgets.push({ type: "metric_chart", title, data });
    }
  };
  perPlatform("Posts por plataforma", "posts", (p) => toNum(p.totalPosts));
  perPlatform("Likes por plataforma", "likes", (p) => toNum(p.totalLikes) || toNum(p.likes));
  perPlatform("Vistas por plataforma", "vistas", (p) => toNum(p.totalViews));

  const rawTop = Array.isArray(first.topPosts)
    ? first.topPosts
    : Array.isArray(first.recentContent)
    ? first.recentContent
    : [];
  const topPoints = rawTop
    .filter(isRecord)
    .slice(0, 5)
    .map((p, i) => ({
      name: typeof p.title === "string" && p.title ? truncate(p.title) : `Post ${i + 1}`,
      value: toNum(p.likes) || toNum(p.views) || toNum(p.impressions),
    }))
    .filter((d) => d.value > 0);
  if (topPoints.length > 0) {
    const data: MetricChartData = { points: topPoints, subtitle };
    widgets.push({ type: "metric_chart", title: "Top contenido", data });
  }

  return widgets;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @wattson/hud test -- src/api/metricsWidgets.test.ts`
Expected: PASS (7 tests). Ojo con el truncado: `"Lanzamiento del HUD de Wattson".slice(0, 15)` = `"Lanzamiento del"` → `"Lanzamiento del…"`; si el test esperado difiere, el test manda (ajustar implementación, no el test).

- [ ] **Step 5: Commit**

```bash
git add apps/hud/src/api/metricsWidgets.ts apps/hud/src/api/metricsWidgets.test.ts
git commit -m "feat(hud): extractor de widgets desde resultados de social_metrics_lookup (Zernio)"
```

---

### Task 2: agentClient acumula widgets del run

**Files:**
- Modify: `apps/hud/src/api/agentClient.ts` (interfaz `PendingRun`, `converse()`, `handleEvent()`)
- Test: `apps/hud/src/api/agentClient.test.ts` (añadir describe nuevo al final)

**Interfaces:**
- Consumes: `widgetsFromToolResult` de Task 1.
- Produces: `converse()` resuelve `{ narration, widgets }` con los widgets extraídos del run (antes siempre `[]`). Error/approval siguen con `widgets: []`.

- [ ] **Step 1: Write the failing tests** (añadir al final de `agentClient.test.ts`, dentro de un nuevo `describe`; reutiliza `setup()` existente)

```ts
describe("agentClient widgets", () => {
  const zernioResult = {
    profiles: [
      { platform: "instagram", username: "luciano", followers: 100, totalPosts: 5, lastUpdated: "t" },
    ],
  };

  it("entrega los widgets extraídos de tool_call_completed en message_done", async () => {
    const { client, sock } = setup();
    const p = client.converse("métricas de @luciano");
    await Promise.resolve();
    sock.emit({ type: "message_started", messageId: "m1", provider: "openai", timestamp: "t" });
    sock.emit({ type: "tool_call_completed", toolCallId: "tc1", toolName: "social_metrics_lookup", result: zernioResult, timestamp: "t" });
    sock.emit({ type: "message_done", messageId: "m1", content: "Aquí tienes", timestamp: "t" });
    const r = await p;
    expect(r.narration).toBe("Aquí tienes");
    expect(r.widgets.map((w) => `${w.type}:${w.title}`)).toEqual([
      "kpi_card:Seguidores",
      "metric_chart:Posts por plataforma",
    ]);
    client.dispose();
  });

  it("tools sin datos de métricas no aportan widgets", async () => {
    const { client, sock } = setup();
    const p = client.converse("x");
    await Promise.resolve();
    sock.emit({ type: "message_started", messageId: "m1", provider: "openai", timestamp: "t" });
    sock.emit({ type: "tool_call_completed", toolCallId: "tc1", toolName: "notion_query", result: { rows: [] }, timestamp: "t" });
    sock.emit({ type: "message_done", messageId: "m1", content: "ok", timestamp: "t" });
    await expect(p).resolves.toEqual({ narration: "ok", widgets: [] });
    client.dispose();
  });

  it("los widgets no se filtran entre runs consecutivos", async () => {
    const { client, sock } = setup();
    const p1 = client.converse("uno");
    await Promise.resolve();
    sock.emit({ type: "message_started", messageId: "m1", provider: "openai", timestamp: "t" });
    sock.emit({ type: "tool_call_completed", toolCallId: "tc1", toolName: "social_metrics_lookup", result: zernioResult, timestamp: "t" });
    sock.emit({ type: "message_done", messageId: "m1", content: "ok", timestamp: "t" });
    expect((await p1).widgets.length).toBeGreaterThan(0);

    const p2 = client.converse("dos");
    await Promise.resolve();
    sock.emit({ type: "message_started", messageId: "m2", provider: "openai", timestamp: "t" });
    sock.emit({ type: "message_done", messageId: "m2", content: "ok2", timestamp: "t" });
    await expect(p2).resolves.toEqual({ narration: "ok2", widgets: [] });
    client.dispose();
  });

  it("una respuesta con error no entrega widgets parciales", async () => {
    const { client, sock } = setup();
    const p = client.converse("x");
    await Promise.resolve();
    sock.emit({ type: "tool_call_completed", toolCallId: "tc1", toolName: "social_metrics_lookup", result: zernioResult, timestamp: "t" });
    sock.emit({ type: "error", error: "boom", timestamp: "t" });
    await expect(p).rejects.toThrow("boom");
    client.dispose();
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pnpm --filter @wattson/hud test -- src/api/agentClient.test.ts`
Expected: FAIL — el primer test nuevo espera 2 widgets y recibe `[]`.

- [ ] **Step 3: Implement** — tres ediciones en `agentClient.ts`:

1. Import (arriba, junto a los existentes):
```ts
import { widgetsFromToolResult } from "./metricsWidgets";
```
2. `PendingRun` gana el acumulador:
```ts
interface PendingRun {
  messageId: string | null;
  resolve: (r: ConverseResult) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  // Widgets extraídos de los tool_call_completed de ESTE run; se entregan
  // en message_done y mueren con el run (nunca cruzan a un turno siguiente).
  widgets: RenderedWidget[];
  ready: Promise<void>;
}
```
3. En `converse()`, inicializar: `const run: PendingRun = { messageId: null, resolve, reject, timer, widgets: [], ready: Promise.resolve() };`
4. En `handleEvent`, nuevo case (antes de `default`) y usar el acumulador en `message_done`:
```ts
      case "tool_call_completed":
        pending.widgets.push(...widgetsFromToolResult(e.toolName, e.result));
        break;
```
y en el case `message_done`, dentro del `run.ready.then`:
```ts
            if (content && content.trim()) settleResolve({ narration: content, widgets: run.widgets });
```

- [ ] **Step 4: Run the full file + typecheck**

Run: `pnpm --filter @wattson/hud test -- src/api/agentClient.test.ts && pnpm --filter @wattson/hud typecheck`
Expected: PASS todos (los 9 previos siguen verdes; los previos asertan `widgets: []` y siguen siendo correctos porque no emiten tool_call_completed).

- [ ] **Step 5: Commit**

```bash
git add apps/hud/src/api/agentClient.ts apps/hud/src/api/agentClient.test.ts
git commit -m "feat(hud): agentClient entrega widgets de Zernio extraídos del run (tool_call_completed → message_done)"
```

---

### Task 3: Widget `MetricChart` (SVG estilo HUD) + registry + CSS

**Files:**
- Create: `apps/hud/src/hud/widgets/format.ts`
- Create: `apps/hud/src/hud/widgets/format.test.ts`
- Create: `apps/hud/src/hud/widgets/MetricChart.tsx`
- Modify: `apps/hud/src/hud/widgets/registry.tsx` (registrar `metric_chart`)
- Modify: `apps/hud/src/hud/widgets/registry.test.tsx` (casos nuevos)
- Modify: `apps/hud/src/App.css` (estilos `.metric-chart` + reduced-motion)

**Interfaces:**
- Consumes: `MetricChartData` (Task 1), `DecryptText` (`{text, startDelay?, duration?}`), CSS vars del HUD (`--accent`, `--accent-soft`, `--accent-line`, `--ink-dim`, `--mono`).
- Produces: `MetricChart({title, data, delay})`, `formatCompact(n: number): string` (`950 → "950"`, `12400 → "12.4K"`, `1200000 → "1.2M"`, `1000 → "1K"`).

- [ ] **Step 1: Failing tests — formatCompact**

```ts
// apps/hud/src/hud/widgets/format.test.ts
import { describe, it, expect } from "vitest";
import { formatCompact } from "./format";

describe("formatCompact", () => {
  it("números pequeños tal cual", () => {
    expect(formatCompact(0)).toBe("0");
    expect(formatCompact(950)).toBe("950");
  });
  it("miles con una decimal, sin .0 redundante", () => {
    expect(formatCompact(1000)).toBe("1K");
    expect(formatCompact(12400)).toBe("12.4K");
  });
  it("millones", () => {
    expect(formatCompact(1200000)).toBe("1.2M");
    expect(formatCompact(2000000)).toBe("2M");
  });
});
```

- [ ] **Step 2: Failing tests — registry con metric_chart** (añadir a `registry.test.tsx`)

```tsx
  it("metric_chart renderiza labels, valores y total", () => {
    const el = widgetFor({
      type: "metric_chart",
      title: "Posts por plataforma",
      data: {
        points: [
          { name: "instagram", value: 48 },
          { name: "tiktok", value: 12400 },
        ],
        unit: "posts",
        subtitle: "@luciano · instagram",
      },
    });
    render(<>{el}</>);
    expect(screen.getByText("Posts por plataforma")).toBeInTheDocument();
    expect(screen.getByText("@luciano · instagram")).toBeInTheDocument();
    expect(screen.getByText("instagram")).toBeInTheDocument();
    expect(screen.getByText("48")).toBeInTheDocument();
    // "12.4K" aparece dos veces: valor de la barra (12400) y total (48+12400=12448)
    expect(screen.getAllByText("12.4K")).toHaveLength(2);
    expect(screen.getByText("posts")).toBeInTheDocument();
  });

  it("metric_chart con data malformado renderiza sin datos", () => {
    const el = widgetFor({ type: "metric_chart", title: "Posts", data: { points: "nope" } });
    render(<>{el}</>);
    expect(screen.getByText(/sin datos/i)).toBeInTheDocument();
  });

  it("metric_chart con points vacío renderiza sin datos", () => {
    const el = widgetFor({ type: "metric_chart", title: "Posts", data: { points: [] } });
    render(<>{el}</>);
    expect(screen.getByText(/sin datos/i)).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run to verify fail**

Run: `pnpm --filter @wattson/hud test -- src/hud/widgets`
Expected: FAIL (`./format` no existe; `metric_chart` cae al fallback "sin renderer").

- [ ] **Step 4: Implement format.ts**

```ts
// apps/hud/src/hud/widgets/format.ts

// Formato compacto para cifras del HUD: 950 → "950", 12400 → "12.4K", 1200000 → "1.2M".
export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${trimZero((n / 1_000_000).toFixed(1))}M`;
  if (n >= 1_000) return `${trimZero((n / 1_000).toFixed(1))}K`;
  return String(n);
}

function trimZero(s: string): string {
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}
```

- [ ] **Step 5: Implement MetricChart.tsx**

```tsx
// apps/hud/src/hud/widgets/MetricChart.tsx
import { DecryptText } from "../DecryptText";
import { formatCompact } from "./format";
import type { MetricChartData } from "../../api/metricsWidgets";

// Coreografía interna de la tarjeta, relativa al --delay del slot:
// 1) la tarjeta materializa (widget-materialize ~0.85s),
// 2) el título/total se descifran (DECRYPT_LEAD, igual que KpiCard),
// 3) las barras crecen una a una (BARS_LEAD + i·BAR_STAGGER).
const DECRYPT_LEAD = 420;
const DECRYPT_DURATION = 1000;
const BARS_LEAD = 520;
const BAR_STAGGER = 110;

// Geometría del SVG (viewBox fijo; escala con la tarjeta vía width:100%)
const VB_W = 240;
const VB_H = 116;
const PLOT_X = 8;
const PLOT_W = VB_W - PLOT_X * 2;
const BASELINE_Y = 92;
const MAX_BAR_H = 62;
const LABEL_Y = 106;

function parseData(data: unknown): MetricChartData | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as { points?: unknown; unit?: unknown; subtitle?: unknown };
  if (!Array.isArray(d.points)) return null;
  const points = d.points.filter(
    (p): p is { name: string; value: number } =>
      typeof p === "object" &&
      p !== null &&
      typeof (p as { name?: unknown }).name === "string" &&
      typeof (p as { value?: unknown }).value === "number",
  );
  if (points.length === 0) return null;
  return {
    points,
    unit: typeof d.unit === "string" ? d.unit : undefined,
    subtitle: typeof d.subtitle === "string" ? d.subtitle : undefined,
  };
}

export function MetricChart({
  title,
  data,
  delay = 0,
}: {
  title: string;
  data: unknown;
  delay?: number;
}) {
  const parsed = parseData(data);

  if (!parsed) {
    return (
      <div className="widget metric-chart">
        <div className="widget-title">{title}</div>
        <div className="widget-empty">sin datos</div>
      </div>
    );
  }

  const { points, unit, subtitle } = parsed;
  const total = points.reduce((s, p) => s + p.value, 0);
  const max = Math.max(...points.map((p) => p.value));
  const slotW = PLOT_W / points.length;
  const barW = Math.min(34, slotW * 0.55);

  return (
    <div className="widget metric-chart">
      <div className="mc-head">
        <div>
          <div className="widget-title">
            <DecryptText text={title} startDelay={delay + DECRYPT_LEAD} duration={DECRYPT_DURATION} />
          </div>
          {subtitle && <div className="mc-sub">{subtitle}</div>}
        </div>
        <div className="mc-total">
          <DecryptText
            text={formatCompact(total)}
            startDelay={delay + DECRYPT_LEAD}
            duration={DECRYPT_DURATION}
          />
          {unit && <span className="mc-unit">{unit}</span>}
        </div>
      </div>

      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} role="img" aria-label={title}>
        {/* gridlines tenues + línea base */}
        <line className="mc-grid" x1={PLOT_X} x2={VB_W - PLOT_X} y1={BASELINE_Y - MAX_BAR_H * (2 / 3)} y2={BASELINE_Y - MAX_BAR_H * (2 / 3)} />
        <line className="mc-grid" x1={PLOT_X} x2={VB_W - PLOT_X} y1={BASELINE_Y - MAX_BAR_H / 3} y2={BASELINE_Y - MAX_BAR_H / 3} />
        <line className="mc-base" x1={PLOT_X} x2={VB_W - PLOT_X} y1={BASELINE_Y} y2={BASELINE_Y} />

        {points.map((p, i) => {
          const h = max > 0 ? Math.max(2, (p.value / max) * MAX_BAR_H) : 2;
          const cx = PLOT_X + slotW * i + slotW / 2;
          const x = cx - barW / 2;
          const y = BASELINE_Y - h;
          const barDelay = `${delay + BARS_LEAD + i * BAR_STAGGER}ms`;
          return (
            <g key={`${p.name}-${i}`}>
              {/* la barra crece desde la base; cap superior más brillante */}
              <g className="mc-bar" style={{ animationDelay: barDelay }}>
                <rect className="mc-bar-fill" x={x} y={y} width={barW} height={h} rx={1.5} />
                <rect className="mc-bar-cap" x={x} y={y} width={barW} height={2} />
              </g>
              <text className="mc-val" x={cx} y={y - 5} textAnchor="middle" style={{ animationDelay: barDelay }}>
                {formatCompact(p.value)}
              </text>
              <text className="mc-label" x={cx} y={LABEL_Y} textAnchor="middle" style={{ animationDelay: barDelay }}>
                {p.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
```

- [ ] **Step 6: Register in registry.tsx**

```tsx
import { MetricChart } from "./MetricChart";
// ...
const REGISTRY: Record<string, Renderer> = {
  kpi_card: (w, delay) => <KpiCard title={w.title} data={w.data} delay={delay} />,
  table: (w, delay) => <TableWidget title={w.title} data={w.data} delay={delay} />,
  metric_chart: (w, delay) => <MetricChart title={w.title} data={w.data} delay={delay} />,
};
```

- [ ] **Step 7: CSS** — en `App.css`, después del bloque `.table-widget` (~línea 408) añadir:

```css
/* ── Metric chart: barras holográficas de Zernio ─────────────────── */

.widget.metric-chart {
  min-width: 250px;
  max-width: 310px;
}

.metric-chart .mc-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 6px;
}

.metric-chart .mc-head .widget-title {
  margin-bottom: 2px;
}

.metric-chart .mc-sub {
  font-family: var(--mono);
  font-size: 8px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--ink-dim);
}

.metric-chart .mc-total {
  font-family: var(--mono);
  font-size: 24px;
  font-weight: 600;
  line-height: 1;
  color: var(--accent);
  text-shadow: 0 0 18px var(--accent-soft);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.metric-chart .mc-unit {
  font-size: 9px;
  font-weight: 400;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--ink-dim);
  margin-left: 5px;
}

.metric-chart svg {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}

.metric-chart .mc-grid {
  stroke: rgba(150, 185, 225, 0.09);
  stroke-width: 1;
}

.metric-chart .mc-base {
  stroke: var(--accent-line);
  stroke-width: 1;
}

/* Cada barra sube desde la base, una tras otra (animation-delay inline). */
.metric-chart .mc-bar {
  transform-box: fill-box;
  transform-origin: center bottom;
  filter: drop-shadow(0 0 7px var(--accent-soft));
  animation: mc-bar-grow 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.metric-chart .mc-bar-fill {
  fill: var(--accent);
  fill-opacity: 0.24;
  stroke: var(--accent);
  stroke-opacity: 0.35;
  stroke-width: 0.5;
}

.metric-chart .mc-bar-cap {
  fill: var(--accent);
}

@keyframes mc-bar-grow {
  from { transform: scaleY(0); opacity: 0; }
  to   { transform: scaleY(1); opacity: 1; }
}

.metric-chart .mc-val {
  font-family: var(--mono);
  font-size: 9px;
  fill: var(--accent);
  font-variant-numeric: tabular-nums;
  animation: mc-fade-in 0.45s ease both;
}

.metric-chart .mc-label {
  font-family: var(--mono);
  font-size: 7.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  fill: rgba(150, 185, 225, 0.55);
  animation: mc-fade-in 0.45s ease both;
}

@keyframes mc-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
```

Y dentro del bloque `@media (prefers-reduced-motion: reduce)` existente, añadir:

```css
  .metric-chart .mc-bar,
  .metric-chart .mc-val,
  .metric-chart .mc-label {
    animation: none !important;
  }
```

Y en el bloque `@media (max-width: 900px)` existente, junto a los otros widgets:

```css
  .widget.metric-chart { min-width: 200px; max-width: 250px; }
```

- [ ] **Step 8: Run tests + typecheck**

Run: `pnpm --filter @wattson/hud test -- src/hud/widgets && pnpm --filter @wattson/hud typecheck`
Expected: PASS todos.

- [ ] **Step 9: Commit**

```bash
git add apps/hud/src/hud/widgets/format.ts apps/hud/src/hud/widgets/format.test.ts \
  apps/hud/src/hud/widgets/MetricChart.tsx apps/hud/src/hud/widgets/registry.tsx \
  apps/hud/src/hud/widgets/registry.test.tsx apps/hud/src/App.css
git commit -m "feat(hud): widget metric_chart — barras SVG holográficas con crecimiento secuencial"
```

---

### Task 4: Coreografía narrativa en Canvas

**Files:**
- Modify: `apps/hud/src/hud/Canvas.tsx`
- Test: `apps/hud/src/hud/Canvas.test.tsx`
- Modify: `docs/superpowers/specs/2026-07-03-hud-zernio-charts-design.md` (sectores finales: charts 250°–305°, table 205°)

**Interfaces:**
- Consumes: `widgetFor(w, delay)` (registry), `BurstTarget`/`LinkTarget` (sin cambios — ya llevan `delay`).
- Produces: `Canvas({widgets})` con delays acumulativos por beats: `kpi_card` 380ms, `metric_chart` 650ms, resto 500ms; sectores: KPIs 25°–70° (derecha), charts 250°–305° (izquierda), tabla/otros 205°.

- [ ] **Step 1: Failing test** — reemplazar el contenido de `Canvas.test.tsx` por:

```tsx
import { describe, it, expect } from "vitest";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { Canvas } from "./Canvas";

describe("Canvas", () => {
  it("renderiza un widget por cada entrada del spec", () => {
    render(
      <Canvas
        widgets={[
          { type: "kpi_card", title: "Atrasadas", data: { value: 3 } },
          { type: "kpi_card", title: "Activas", data: { value: 12 } },
        ]}
      />,
    );
    expect(screen.getByText("Atrasadas")).toBeInTheDocument();
    expect(screen.getByText("Activas")).toBeInTheDocument();
  });

  it("coreografía narrativa: delays acumulativos por tipo, en orden de emisión", () => {
    const { container } = render(
      <Canvas
        widgets={[
          { type: "kpi_card", title: "Seguidores", data: { value: 100 } },      // t=0
          { type: "metric_chart", title: "Posts", data: { points: [{ name: "ig", value: 5 }] } }, // t=380
          { type: "kpi_card", title: "Engagement", data: { value: 4 } },        // t=380+650=1030
        ]}
      />,
    );
    const delays = Array.from(container.querySelectorAll(".hud-slot")).map((el) =>
      (el as HTMLElement).style.getPropertyValue("--delay"),
    );
    expect(delays).toEqual(["0ms", "380ms", "1030ms"]);
  });

  it("los charts van al arco izquierdo (tx negativo) y los KPIs al derecho (tx positivo)", () => {
    const { container } = render(
      <Canvas
        widgets={[
          { type: "kpi_card", title: "K", data: { value: 1 } },
          { type: "metric_chart", title: "C", data: { points: [{ name: "ig", value: 5 }] } },
        ]}
      />,
    );
    const slots = Array.from(container.querySelectorAll(".hud-slot")) as HTMLElement[];
    expect(Number(slots[0].style.getPropertyValue("--tx"))).toBeGreaterThan(0);
    expect(Number(slots[1].style.getPropertyValue("--tx"))).toBeLessThan(0);
  });
});
```

Nota: el orden DOM de los slots debe seguir el orden del array `widgets` (el map final itera el array original, no los grupos).

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @wattson/hud test -- src/hud/Canvas.test.tsx`
Expected: FAIL — hoy los delays son `0ms/130ms/260ms` y `metric_chart` cae al slot de la tabla (220° también es tx negativo, así que el fallo visible es el test de delays).

- [ ] **Step 3: Implement** — en `Canvas.tsx`:

1. Constantes nuevas (sustituyen a `TABLE_DEG` y al `i * 130`):
```ts
// Sector de las gráficas: arco oeste, espejo de los KPIs
const CHART_RADIUS    = 47;   // vmin
const CHART_START_DEG = 250;
const CHART_END_DEG   = 305;

// Tabla / otros: sur-suroeste, despejado de las gráficas
const TABLE_DEG = 205;

// Cadencia narrativa: cada widget entra un beat después del anterior, en el
// orden en que el agente los emitió. Una gráfica reserva más tiempo que un
// KPI para que se le vea crecer las barras antes del siguiente beat.
const BEAT_MS: Record<string, number> = {
  kpi_card: 380,
  metric_chart: 650,
};
const DEFAULT_BEAT_MS = 500;
```
2. Generalizar el arco (sustituye el cuerpo de `kpiSlotStyle`; `tableSlotStyle` queda igual pero con el nuevo `TABLE_DEG`):
```ts
function arcSlotStyle(index: number, total: number, startDeg: number, endDeg: number, radius: number): SlotStyle {
  const t = total <= 1 ? 0.5 : index / (total - 1);
  const rad = degToRad(startDeg + t * (endDeg - startDeg));
  return {
    tx: radius * Math.sin(rad),
    ty: -radius * Math.cos(rad),
    dx: Math.sin(rad),
    dy: -Math.cos(rad),
  };
}

function kpiSlotStyle(index: number, total: number): SlotStyle {
  return arcSlotStyle(index, total, KPI_START_DEG, KPI_END_DEG, CARD_RADIUS);
}

function chartSlotStyle(index: number, total: number): SlotStyle {
  return arcSlotStyle(index, total, CHART_START_DEG, CHART_END_DEG, CHART_RADIUS);
}
```
3. Cuerpo del componente — delays acumulativos y slots por tipo, preservando el orden de emisión:
```ts
export function Canvas({ widgets }: { widgets: RenderedWidget[] }) {
  const kpiCount = widgets.filter((w) => w.type === "kpi_card").length;
  const chartCount = widgets.filter((w) => w.type === "metric_chart").length;

  let elapsed = 0;
  let kpiSeen = 0;
  let chartSeen = 0;
  const slottedWidgets = widgets.map((widget) => {
    const slot =
      widget.type === "kpi_card"
        ? kpiSlotStyle(kpiSeen++, kpiCount)
        : widget.type === "metric_chart"
        ? chartSlotStyle(chartSeen++, chartCount)
        : tableSlotStyle();
    const delay = elapsed;
    elapsed += BEAT_MS[widget.type] ?? DEFAULT_BEAT_MS;
    return { widget, slot, delay };
  });
  // ... (targets/bursts/links y el return quedan igual que hoy)
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm --filter @wattson/hud test && pnpm --filter @wattson/hud typecheck`
Expected: PASS (suite completa del HUD).

- [ ] **Step 5: Ajustar los sectores en el spec** (charts 250°–305°, tabla 205°) y commit:

```bash
git add apps/hud/src/hud/Canvas.tsx apps/hud/src/hud/Canvas.test.tsx \
  docs/superpowers/specs/2026-07-03-hud-zernio-charts-design.md
git commit -m "feat(hud): coreografía narrativa en Canvas — beats por tipo y arco oeste para gráficas"
```

---

### Task 5: Verificación integral

- [ ] **Step 1:** `pnpm --filter @wattson/hud test && pnpm --filter @wattson/hud typecheck` — todo verde.
- [ ] **Step 2:** Smoke visual manual: `pnpm --filter @wattson/hud dev` y en la consola del navegador simular un render (o pedir a Wattson "métricas de @<cuenta>"): las tarjetas deben entrar beat a beat (KPI → KPI → gráficas con barras subiendo una a una), gráficas a la izquierda, KPIs a la derecha.
- [ ] **Step 3:** `git status` — confirmar que los archivos de voz de la otra sesión siguen sin tocar ni commitear.
