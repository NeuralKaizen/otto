# Spec — Gráficas de Zernio en el HUD con reveal narrativo

**Fecha:** 2026-07-03
**Estado:** aprobado para implementación (usuario AFK; decisiones tomadas con su directriz: "UI bien implementada, coherencia visual, animación narrativa de película")
**Referencia externa:** Jarvis_mvp `6345a858` — "feat: metrics charts inline in chat (Recharts)" (extractor de chart data desde `tool_call_completed` + MetricsCharts con Recharts)

## Problema

El HUD de Wattson ya tiene un sistema de widgets cinematográfico (Canvas radial, beams,
partículas, `widget-materialize`, `DecryptText`), pero `agentClient.converse()` siempre
devuelve `widgets: []`: los resultados de los tools del agente (en particular
`social_metrics_lookup`, que consulta Zernio) se descartan y nunca llega nada al Canvas.
Además no existe un widget de gráfica, y el stagger actual (130ms plano) saca las
tarjetas casi de golpe.

## Objetivo

Cuando Wattson responde a una consulta de métricas sociales, el HUD muestra las
gráficas de Zernio alrededor del núcleo con una coreografía narrativa: las tarjetas
entran en secuencia (beat a beat), cada gráfica dibuja sus barras progresivamente y
los valores se descifran encima — coherente con el estilo holográfico existente.

## Decisiones de diseño

1. **SVG propio, no Recharts.** El compañero usó Recharts; aquí las barras se dibujan
   a mano en SVG con el lenguaje visual del HUD. Motivo: control total de la animación
   (crecimiento secuencial de barras sincronizado con el materialize y el decrypt),
   coherencia visual perfecta, cero dependencia nueva (~100KB menos). La lógica de
   *extracción de datos* sí se guía por la del compañero.
2. **Extracción en el cliente (HUD), no en el backend.** Igual que Jarvis_mvp: el
   extractor escucha `tool_call_completed` en el WS y convierte el resultado del tool
   en widgets. El backend no cambia.
3. **Duck-typing defensivo.** El resultado cruza el WS como JSON; el extractor valida
   con guards (`isRecord`, `toNum`) y devuelve `[]` ante cualquier shape inesperado.
   Nunca lanza.

## Componentes

### 1. `apps/hud/src/api/metricsWidgets.ts` — extractor puro

```ts
widgetsFromToolResult(toolName: string, result: unknown): RenderedWidget[]
```

- Solo reacciona a `social_metrics_lookup` (más alias `social_metrics`,
  `social_metrics_skill` por si el backend cambia de nombre). Otros tools → `[]`.
- Shape esperado: `SocialMetricsResponse` de `packages/skills/src/social/types.ts`
  (`profiles[]` con `platform`, `username`, `followers`, `subscribers`, `totalPosts`,
  `totalLikes`, `totalViews`, `engagementRate`, `topPosts[]`, `recentContent[]`).
- Produce, en este orden (el orden ES la narrativa):
  1. `kpi_card` "Seguidores" — `followers ?? subscribers` del primer perfil (si > 0).
  2. `kpi_card` "Engagement" — `engagementRate` formateado `x.x%` (si existe).
  3. `metric_chart` "Posts por plataforma" — un punto por perfil con `totalPosts > 0`.
  4. `metric_chart` "Likes por plataforma" — `totalLikes ?? likes` por perfil.
  5. `metric_chart` "Vistas por plataforma" — `totalViews` por perfil.
  6. `metric_chart` "Top contenido" — top 5 de `topPosts ?? recentContent` del primer
     perfil, valor `likes || views || impressions`, labels truncados a 15 chars.
- Cada `metric_chart` lleva `data: { points: [{name, value}], unit?, subtitle? }`.
  `subtitle` = `@username · platform` cuando existan.
- Gráficas con < 1 punto no se emiten. Si no sale nada, `[]`.

### 2. `apps/hud/src/api/agentClient.ts` — acumular widgets del run

- `PendingRun` gana `widgets: RenderedWidget[]` (inicia `[]` en cada `converse()`).
- Nuevo case `tool_call_completed` en `handleEvent`: `run.widgets.push(...widgetsFromToolResult(e.toolName, e.result))`.
- `message_done` resuelve `{ narration, widgets: run.widgets }` (antes `[]` fijo).
- Rutas de error / approval-decline siguen devolviendo `widgets: []` (no mostrar
  datos parciales de un run fallido).

### 3. `apps/hud/src/hud/widgets/MetricChart.tsx` + registry

- Registrado como `metric_chart` en `registry.tsx`.
- Tarjeta `.widget.metric-chart` (hereda glass/materialize/line-sweep).
- Cabecera: título (DecryptText tras el aterrizaje, como KpiCard), subtitle en
  mono dim, y el total agregado grande a la derecha con DecryptText
  (formato compacto: `12.4K`, `1.2M`).
- Cuerpo: SVG de barras verticales.
  - Barras: `fill` con gradiente cian del HUD (`--accent`), glow suave
    (filter drop-shadow), borde superior más brillante.
  - Cada barra anima `scaleY` 0→1 (transform-origin bottom) con
    `delay = --delay + MATERIALIZE_LEAD + i * BAR_STAGGER` (~90ms por barra):
    las barras "suben" una a una después de que la tarjeta bootea.
  - Labels bajo cada barra: mono, 8-9px, uppercase, dim; valores encima de cada
    barra en mono accent (aparecen con la barra, mismo delay).
  - Línea base fina (`--accent-line`) y 2 gridlines horizontales tenues.
- `prefers-reduced-motion`: barras estáticas a escala completa (CSS, mismo patrón
  que el resto del HUD).
- Formateo compacto compartido `formatCompact(n)`: `>=1M → x.xM`, `>=1k → x.xK`.

### 4. `apps/hud/src/hud/Canvas.tsx` — coreografía narrativa

- Sectores: KPIs arco derecho (25°–70°, igual que hoy); `metric_chart` arco
  izquierdo repartido 195°–265° (radio ~47vmin); `table` baja al sector 150°
  para no chocar con las gráficas.
- Stagger: se sustituye el `i * 130` plano por beats acumulativos por tipo:
  - `kpi_card`: 380ms de beat.
  - `metric_chart`: 650ms de beat (deja verse el crecimiento de barras antes
    del siguiente).
  - `table` y otros: 500ms.
  El delay de cada widget = suma de los beats de todos los anteriores (los widgets
  se coreografían en el orden en que el extractor los emite).
- Beams y bursts ya consumen `delay` por target — heredan la nueva cadencia sin
  cambios.

## Flujo de datos

```
agente ejecuta social_metrics_lookup
  → WS tool_call_completed {toolName, result}
  → agentClient: widgetsFromToolResult() → run.widgets
  → WS message_done → converse() resuelve {narration, widgets}
  → FSM → efecto render → useSession.setWidgets → Canvas (coreografía) → registry → MetricChart
```

Sin cambios en backend, FSM, useSession ni tipos de voz (`RenderedWidget` ya es
`{type, title, data: unknown}`).

## Manejo de errores

- Extractor: nunca lanza; shape raro → `[]`.
- `MetricChart` con `data` malformado → placeholder "sin datos" (patrón KpiCard).
- Runs con error/timeout/approval-decline → `widgets: []`.
- Widgets de un run anterior se sustituyen al completo en el siguiente `render`
  (comportamiento actual de useSession, sin cambios).

## Testing (vitest, patrón del repo)

- `metricsWidgets.test.ts`: shape Zernio completo (multi-perfil), perfil único,
  respuesta sin username (profiles vacío) → `[]`, tool ajeno → `[]`, shape
  corrupto/null → `[]`, truncado de títulos, formateo de engagement.
- `agentClient.test.ts` (ampliar): `tool_call_completed` + `message_done` entrega
  widgets; runs consecutivos no filtran widgets; error deja `widgets` fuera.
- `registry.test.tsx`: `metric_chart` resuelve al renderer.
- `MetricChart.test.tsx`: renderiza barras y labels, respeta datos vacíos,
  formateo compacto.

## Fuera de alcance

- Voz/TTS (otra sesión activa está trabajando `webSpeech.ts` /
  `elevenLabsSpeaker*` — esos archivos no se tocan ni se commitean aquí).
- Cambios en el backend o en el skill de Zernio.
- Gráficas de línea/tendencia (growth) — iteración futura.
