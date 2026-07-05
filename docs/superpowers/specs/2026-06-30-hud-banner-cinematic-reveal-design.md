# Diseño — Reveal cinematográfico de los banners del HUD

> Fecha: 2026-06-30 · Rama: `feat/voice-hud-prototype`
> Estado: diseño aprobado, listo para plan de implementación.

## 1. Objetivo

Hacer que las tarjetas de información que Otto despliega en el HUD (los "banners":
KPI cards y tablas) **entren de forma cinematográfica**, con lenguaje holográfico
y de descifrado, en vez del único gesto actual (spring desde el núcleo + glow de
aterrizaje).

Decisiones tomadas en el brainstorming:

- **Foco: entrada** (no salida ni vida-en-reposo — quedan fuera de scope).
- **Vocabulario visual:** holográfico/flicker + descifrado (scramble → valor).
- **Alcance del descifrado:** todo el texto (títulos, labels, valores, celdas).
- **Intensidad:** teátral y marcada (~800–900ms por tarjeta).
- **Enfoque técnico:** CSS para el holograma + componente JS mínimo para el
  descifrado. Cero dependencias nuevas (el frontend hoy es React + CSS, sin libs
  de animación).

## 2. Estado actual (punto de partida)

Las tarjetas son DOM/React renderizadas en `frontend/src/hud/Canvas.tsx`,
posicionadas en arco alrededor del anillo. La animación de entrada existente
vive en `frontend/src/App.css`:

- `slot-emerge` (sobre `.hud-slot`) — la tarjeta viaja desde el centro con spring
  `cubic-bezier(0.34, 1.56, 0.64, 1)`, 0.9s.
- `widget-land` (sobre `.widget`) — glow de aterrizaje (border/shadow de caliente
  a frío).
- `line-sweep` (sobre `.widget::before`) — línea de acento superior que se dibuja.
- Stagger por CSS var `--delay` (130ms entre tarjetas), inyectada desde
  `Canvas.tsx`. Dirección de reveal por `--dx/--dy`.
- `@media (prefers-reduced-motion: reduce)` ya anula estas animaciones.

No hay animación de salida (React desmonta de golpe) — fuera de scope acá.

El sistema "accent por estado" existe: CSS vars `--accent`, `--accent-soft`,
`--accent-line` keyeadas a `.hud[data-state="idle|listening|processing|speaking"]`.

## 3. Arquitectura por capas

Se montan dos capas nuevas encima de la mecánica actual, sin tocar `slot-emerge`:

| Capa         | Elemento         | Qué hace                                             | Tech                          |
|--------------|------------------|------------------------------------------------------|-------------------------------|
| Entrega      | `.hud-slot`      | Viaja desde el núcleo (spring)                       | CSS existente — se mantiene   |
| **Materializar** | `.widget`    | Flicker de proyector + split RGB que converge + jitter | **CSS nuevo** (reemplaza `widget-land`) |
| Barrido      | `.widget::before`| Línea de acento superior                            | CSS existente — se mantiene   |
| **Descifrado**   | cada texto   | Scramble → valor real                                | **Componente JS nuevo**       |

**Por qué en elementos distintos:** el materializar/jitter anima `transform` en
`.widget`; `slot-emerge` anima `transform` en el padre `.hud-slot`. Al ser
elementos separados, ambas transformaciones se componen sin pisarse.

## 4. Componentes y archivos

### Nuevos

- `frontend/src/hud/DecryptText.tsx` — componente autocontenido del descifrado.
- `frontend/src/hud/DecryptText.test.tsx` — tests.

### Modificados

- `frontend/src/hud/widgets/KpiCard.tsx` — envuelve label, value y delta en `<DecryptText>`.
- `frontend/src/hud/widgets/TableWidget.tsx` — envuelve título, headers y celdas.
- `frontend/src/hud/widgets/registry.tsx` — `widgetFor` acepta y reenvía `delay`.
- `frontend/src/hud/Canvas.tsx` — pasa el `delay` del stagger (ya lo calcula) al widget.
- `frontend/src/App.css` — keyframes `widget-materialize`, fringe RGB del texto,
  y extensión del bloque `prefers-reduced-motion`.

## 5. `DecryptText` — contrato del componente

```tsx
<DecryptText text="42" startDelay={delay} duration={800} />
```

- **Props:** `text: string` (valor final), `startDelay: number` (ms, mismo stagger
  que la tarjeta), `duration?: number` (ms, default ~800).
- **Comportamiento:**
  - Al montar, agenda el arranque en `startDelay`.
  - Luego, sobre `duration`, resuelve carácter a carácter de izquierda a derecha:
    los caracteres ya "lockeados" muestran el valor final; los del frente parpadean
    entre glyphs random de un pool (katakana + latino + dígitos + símbolos); los no
    alcanzados aún muestran glyph random. Los espacios se mantienen como espacios.
  - **Termina siempre exactamente en `text`** (el scramble es cosmético; nunca
    altera el valor final — respeta la regla "el dato manda" de Otto).
  - Usa un único loop `requestAnimationFrame`, que se **cancela al terminar** (no
    corre en reposo) y **se limpia al desmontar**.
  - Si `prefers-reduced-motion: reduce`, renderiza `text` de una (sin animar).
- **Remonte por cambio de datos:** los slots en `Canvas.tsx` se keyean por
  `${type}-${title}-${i}`, así que un cambio de widget remonta y re-dispara el
  descifrado naturalmente.

## 6. Coreografía y timing

Perfil teátral ≈ 800–900ms por tarjeta. Todo referido al `--delay` D de esa
tarjeta (stagger 130ms entre tarjetas):

```
D+0ms     slot-emerge arranca — viaje desde el núcleo (spring, 0.9s) [existente]
D+0ms     widget-materialize arranca sobre .widget:
            · flicker de proyector — opacity en pasos irregulares (0→.6→.2→1→.5→1…)
            · split RGB — drop-shadow cyan/magenta desfasado ~3px que converge a 0
            · brillo — spikes cortos de brightness/contrast al bootear
            · jitter — translate sub-pixel que se apaga hacia el final
D+120ms   descifrado arranca (la tarjeta ya "existe") — resuelve char a char ~800ms
D+~200ms  line-sweep dibuja la línea de acento superior [existente]
D+~900ms  todo asentado, en reposo
```

El descifrado entra un pelín después del materializar para leerse como "el
holograma bootea → los datos se desencriptan dentro". El fringe RGB del texto
(via `text-shadow` animado) se apaga junto con el jitter, para que el descifrado
herede el look holográfico.

**Acento por estado:** el materializar usa las CSS vars `--accent` existentes, así
el color del split/glow queda ligado al estado de Otto sin lógica extra.

## 7. Accesibilidad y performance

- **Reduced-motion:** el bloque `@media (prefers-reduced-motion: reduce)` existente
  se extiende para anular `widget-materialize`; `DecryptText` detecta `matchMedia`
  y pinta el valor final al instante. Resultado: cero movimiento, dato visible.
- **Performance:** un `rAF` por texto visible (pocas tarjetas × pocos textos), que
  se autocancela al terminar. Nada corriendo en reposo.

## 8. Testing

- `DecryptText.test.tsx`:
  - (a) con `prefers-reduced-motion` mockeado → muestra el texto final inmediato.
  - (b) con timers/`rAF` avanzados → termina exactamente en el `text` real.
  - (c) se desmonta sin dejar el `rAF` vivo (sin warnings).
- Tests existentes (`Canvas.test.tsx`, `registry.test.tsx`) siguen verdes: el
  descifrado no cambia el DOM final, solo los frames intermedios.

## 9. Fuera de scope (explícito)

- Animación de **salida** de banners.
- **Vida en reposo** (respiración/parpadeo continuo de las tarjetas ya posadas).
- Cambios en la escena WebGL (`glengine.ts`, `OttoScene.tsx`).
- Nuevas dependencias / librerías de animación.
