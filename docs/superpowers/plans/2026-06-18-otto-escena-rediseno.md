# Rediseño de la escena de Otto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar la escena WebGL de Otto de "formas quietas con ruido" a un núcleo de datos vivo rodeado de un HUD circular coherente, con paleta Aurora.

**Architecture:** Un solo motor de partículas (`OttoGLEngine`) sigue siendo el corazón. Se le suma un sistema de anillos HUD (geometría de líneas, ya existe `lnProg`/`fillEdges` reusable) y se reescriben los "targets" por estado para dar intención. Los widgets React (`Canvas`) se reanclan a arcos del mismo sistema en vez de un panel flotante.

**Tech Stack:** TypeScript, React 18, Vite, WebGL2 (shaders inline en `glengine.ts`), Web Speech / Web Audio para amplitud.

## Global Constraints

- Target de performance: ~14k partículas (`N = 14000`), `dpr ≤ 1.75`, 60fps. No subir N sin medir.
- No tocar el pipeline de voz, STT/TTS, ni el backend.
- No agregar dependencias nuevas de runtime.
- Una sola paleta: **Aurora** (`PALETTES.aurora` ya en `glengine.ts`). El chrome (`--accent` en `App.css`) debe usar los mismos tonos.
- Respetar `prefers-reduced-motion` (ya hay `this.reducedMotion`): toda animación nueva se atenúa cuando está activo.
- Tipografía del wordmark: Michroma (ya cargada).
- "Test" en este plan = `cd frontend && npx tsc --noEmit` verde + checkpoint visual en `http://localhost:5173` (tecla **espacio** cicla estados; `?hud=<estado>` arranca en uno) + commit.

---

### Task 1: Fijar Aurora, arreglar el wordmark y quitar el selector de preview

**Files:**
- Modify: `frontend/src/hud/scene/glengine.ts` (paleta por defecto + `sampleWord` posición)
- Modify: `frontend/src/hud/scene/OttoScene.tsx` (quitar `PalettePreview`)
- Modify: `frontend/src/App.css` (sincronizar `--accent` con Aurora)

**Interfaces:**
- Consumes: `PALETTES` (registro de mundos ya creado en `glengine.ts`).
- Produces: escena estable en Aurora, sin UI de preview. `OttoScene` vuelve a exportar solo el canvas.

- [ ] **Step 1: Default a Aurora y limpiar mundos de preview.** En `glengine.ts`, dejar `let PALETTE: World = PALETTES.aurora;`. Conservar `neon`/`plasma`/`holo` no aporta — borrar las 3 entradas extra de `PALETTES`, borrar `PALETTE_WORLDS` y el método `setPaletteWorld`. `PALETTES` queda con una sola clave `aurora` (o reemplazar por un único `const PALETTE: World = {…aurora…}` const — preferido, restaura el diseño original más simple).

- [ ] **Step 2: Arreglar la posición del wordmark.** En `glengine.ts:515`, `yBase = cy + this.R * 1.85 - off.height / 2` ubica "OTTO" a ~86% de la pantalla (cortado). Cambiar a anclarlo **debajo del núcleo pero dentro de viewport**: `const yBase = cy + this.R * 1.35 - off.height / 2;` y además recortar el alto del canvas offscreen a lo necesario. Verificar contra `this.h`: si `yBase + off.height > this.h`, clampear. Objetivo: el wordmark completo y visible en idle, centrado horizontalmente.

- [ ] **Step 3: Quitar el panel de preview.** En `OttoScene.tsx`, borrar el componente `PalettePreview`, su render, y los imports `useState`/`PALETTE_WORLDS`. El `return` vuelve a ser solo `<canvas … />`.

- [ ] **Step 4: Sincronizar el chrome.** En `App.css:13-35`, reemplazar los `--accent`/`--accent-soft`/`--accent-line` de cada `data-state` por tonos Aurora: idle teal `#28C8B4`, listening verde `#50E696`, processing violeta `#8C78FF`, speaking aurora `#46E0A0`. Ajustar las variantes rgba acordes. Quitar el glow naranja de `index.css:39`.

- [ ] **Step 5: Typecheck.** Run: `cd frontend && npx tsc --noEmit` — Expected: sin errores.

- [ ] **Step 6: Checkpoint visual.** `npm run dev`, abrir `localhost:5173`. Verificar: escena en tonos Aurora, wordmark "OTTO" completo y bien ubicado, sin panel de preview. Ciclar estados con espacio — todos en familia Aurora.

- [ ] **Step 7: Commit.** `git add -A && git commit -m "feat(escena): fija paleta Aurora, arregla wordmark, quita selector de preview"`

---

### Task 2: Núcleo asimétrico, denso y que respira

**Files:**
- Modify: `frontend/src/hud/scene/glengine.ts` (generación de `this.dir`/`this.sphR`, y la respiración en `simulate`)

**Interfaces:**
- Consumes: distribución de partículas en esfera (hoy fibonacci uniforme en el constructor / build de la esfera).
- Produces: campo `this.breath` (number, 0..1 envolvente lenta) usado por `simulate` y por el fondo.

- [ ] **Step 1: Distribución asimétrica.** Donde se generan las direcciones de la esfera (`this.dir[i3..]`, búsqueda: `acos(2*…-1)` patrón fibonacci), perturbar con ruido de baja frecuencia para crear clusters ("continentes"): multiplicar el radio base `this.sphR[i]` por `1 + 0.35*noise(dir)` usando un value-noise barato (hash de la dirección redondeada). Resultado: superficie irregular, no una bola perfecta.

- [ ] **Step 2: Densificar la cáscara.** Subir `SHELL` de `0.82` a `~0.9` y marcar más las aristas del grafo (en `fillEdges`, subir alpha base de edges y el umbral de grado para que haya más conexiones → textura de circuito). No subir `MAX_EDGES` sin medir fps.

- [ ] **Step 3: Respiración.** Agregar `private breath = 0;` y en `frame`/`simulate` actualizar `this.breath = 0.5 + 0.5*Math.sin(t*0.6)` (más lento si `reducedMotion`). Aplicar al radio del cuerpo: `ampR *= 1 + this.breath*0.04` y a la luz central del fondo. El núcleo se contrae/expande lento.

- [ ] **Step 4: Púas radiales por voz.** En `simulate`, para partículas de cáscara (`shell`), sumar un empuje radial proporcional a `amp`: `rad += amp * R * 0.12 * spikeMask[i]` donde `spikeMask` es un patrón fijo por partícula (subset ~8%). Da "erizado" reactivo al hablar.

- [ ] **Step 5: Typecheck.** Run: `cd frontend && npx tsc --noEmit` — Expected: sin errores.

- [ ] **Step 6: Checkpoint visual.** Verificar en listening/speaking: esfera densa, asimétrica (clusters), respirando, con púas que saltan al hablar frente al mic. Confirmar 60fps (DevTools > Rendering > FPS).

- [ ] **Step 7: Commit.** `git add -A && git commit -m "feat(escena): núcleo asimétrico, denso y con respiración"`

---

### Task 3: Anillo HUD concéntrico (sistema base de cohesión)

**Files:**
- Modify: `frontend/src/hud/scene/glengine.ts` (nuevo draw de anillos en `frame`)

**Interfaces:**
- Consumes: `this.center`, `this.R`, `lnProg`/línea VAO (reusar el programa de líneas existente) o un nuevo draw de líneas en screen-space.
- Produces: método privado `drawRings(t, intensity)` que dibuja N anillos concéntricos finos alrededor del centro, con rotación y ticks.

- [ ] **Step 1: Geometría de anillos.** Agregar `drawRings(t, intensity)` que genera 2-3 anillos concéntricos (radios `R*1.15`, `R*1.45`, `R*1.8`) como line-loops en screen-space alrededor de `this.center`. Cada anillo rota a velocidad distinta (`t*0.1`, `-t*0.07`, `t*0.04`). Color = Aurora `idle.hi` con alpha bajo (`0.25`).

- [ ] **Step 2: Ticks/marcas.** A cada anillo, agregar marcas radiales cortas (como gauge): cada 12° un segmento corto. Algunas marcas más brillantes ("activas") que se mueven lento. Esto da la lectura "telemetría".

- [ ] **Step 3: Llamar desde `frame`.** Dibujar los anillos después del fondo y antes/después de las partículas (probar cuál lee mejor). `intensity` sube en listening/processing/speaking, baja en idle.

- [ ] **Step 4: Typecheck.** Run: `cd frontend && npx tsc --noEmit` — Expected: sin errores.

- [ ] **Step 5: Checkpoint visual.** Verificar: anillos concéntricos finos siempre presentes rodeando el núcleo, rotando lento, con ticks. Se siente "un sistema", no una bola suelta.

- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat(escena): anillo HUD concéntrico alrededor del núcleo"`

---

### Task 4: processing = escaneo / fetch de información (el Jarvis)

**Files:**
- Modify: `frontend/src/hud/scene/glengine.ts` (forma/targets de processing + barrido en `drawRings`)

**Interfaces:**
- Consumes: `FORM`/`MODE` para `processing`, `drawRings`.
- Produces: comportamiento de processing que lee como "buscando info".

- [ ] **Step 1: Reemplazar el vórtice.** En `simulate`, para `processing` (hoy `form === 2`, anillo de polvo), cambiar el target: las partículas convergen al núcleo desde afuera. Un subconjunto arranca lejos (`rad` grande) y es atraído hacia la esfera con offset temporal por partícula (`phase[i]`), de modo que fluyen **hacia adentro** en oleadas — "fragmentos de datos entrando".

- [ ] **Step 2: Barrido de escaneo.** En `drawRings`, cuando el modo es processing, agregar una línea de barrido radial que gira rápido (`t*3`) como radar, dejando un trail corto. Acelerar la rotación de los anillos.

- [ ] **Step 3: Pulsos de "lock".** Cada ~0.8s en processing, un flash breve en el anillo interior (reusar `this.flash`/`spawnWaves`) cuando una "oleada" llega al núcleo.

- [ ] **Step 4: Typecheck.** Run: `cd frontend && npx tsc --noEmit` — Expected: sin errores.

- [ ] **Step 5: Checkpoint visual.** `?hud=processing`. Verificar: se ve como Otto **buscando/agarrando información** (datos entrando al núcleo, radar girando, pulsos de lock). Cero "vórtice raro".

- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat(escena): processing como escaneo/fetch de info estilo Jarvis"`

---

### Task 5: listening y speaking con intención

**Files:**
- Modify: `frontend/src/hud/scene/glengine.ts` (targets listening/speaking + anillos)

**Interfaces:**
- Consumes: `getAmplitude` (ya enchufado vía `frame(dt,t,amp)`), `drawRings`.
- Produces: comportamiento afinado de los dos estados de voz.

- [ ] **Step 1: listening = "te escucha".** Alinear los anillos hacia un eje (dejar de rotar libremente y converger a una orientación), inclinar levemente la esfera hacia el frente, y llenar un arco del anillo exterior proporcional a `amp` (medidor de mic). Snap de transición más duro (subir el kick en `setMode` para listening).

- [ ] **Step 2: speaking = erupción.** Reforzar las ondas que recorren el cuerpo (ya existe el término `sin(lat*7 - t*11)*amp`): subir amplitud y sumar pulsos radiales sincronizados a picos de `amp` (cuando `amp` cruza umbral, `spawnWaves`). La esfera "late y erupciona" al hablar.

- [ ] **Step 3: Typecheck.** Run: `cd frontend && npx tsc --noEmit` — Expected: sin errores.

- [ ] **Step 4: Checkpoint visual.** Hablar frente al mic en listening y speaking. Verificar: en listening el arco-medidor sube con la voz y los anillos se alinean; en speaking la esfera erupciona con los picos. Personalidad clara.

- [ ] **Step 5: Commit.** `git add -A && git commit -m "feat(escena): listening y speaking con intención y reacción a la voz"`

---

### Task 6: Integrar los widgets en el sistema circular

**Files:**
- Modify: `frontend/src/hud/Canvas.tsx` (layout de widgets)
- Modify: `frontend/src/App.css` (estilos de las cards/tablas ancladas a arcos)
- Read for context: `frontend/src/hud/Captions.tsx`, `frontend/src/voice/types.ts` (tipos `RenderedWidget`)

**Interfaces:**
- Consumes: `widgets: RenderedWidget[]` (de `App.tsx`), tipos `kpi_card`/`table`.
- Produces: render de widgets posicionados radialmente alrededor del núcleo, no en un `<main>` flotante centrado.

- [ ] **Step 1: Reubicar el contenedor.** En `Canvas.tsx`/`App.css`, sacar el panel rectangular centrado. Posicionar las KPI cards en arco alrededor del núcleo (ej. esquina/lateral siguiendo la curva del anillo exterior) con `position: absolute` y transform por índice. Las cards comparten el trazo fino y paleta Aurora del HUD.

- [ ] **Step 2: Revelación coherente.** Las cards entran con una animación que sugiere "salir del núcleo" (fade + translate desde el centro hacia su arco), disparada al entrar en speaking. Sin librería: CSS keyframes + `data-state`.

- [ ] **Step 3: Tabla como lectura.** Reestilizar `table` como una lectura de telemetría (líneas finas, monoespaciado para números, alineada a un arco) en vez de una tabla de dashboard.

- [ ] **Step 4: Typecheck.** Run: `cd frontend && npx tsc --noEmit` — Expected: sin errores.

- [ ] **Step 5: Checkpoint visual.** `?hud=speaking`. Verificar: los KPI/tabla se sienten parte del HUD circular (ancladas a los arcos, mismo lenguaje visual), entran desde el núcleo. Cero panel rectangular "cruzado".

- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat(escena): widgets de datos integrados al HUD circular"`

---

## Notas de ejecución

- Las tareas 2-5 son todas sobre `glengine.ts` y se tocan zonas vecinas: ejecutar **en orden**, recompilando el checkpoint visual entre cada una, porque el "se siente bien" es el verdadero criterio de aceptación y depende del acumulado.
- Si una tarea baja de 60fps, frenar y perfilar antes de seguir (probable culpa: edges o partículas extra). Preferir reusar buffers existentes.
- El usuario es el revisor visual de cada checkpoint. No marcar una tarea como completa sin su OK visual.
