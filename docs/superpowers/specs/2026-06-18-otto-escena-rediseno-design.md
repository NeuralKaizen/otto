# Rediseño de la escena de Otto — "núcleo de datos + HUD circular"

**Fecha:** 2026-06-18
**Branch:** feat/voice-hud-prototype
**Estado:** aprobado por el usuario (dirección), pendiente implementación

## Problema

La escena actual (v3 "cuerpo de luz", `frontend/src/hud/scene/glengine.ts`) se
siente plácida, genérica y sin personalidad:

- Cada estado es **una forma quieta con ruido encima**, no una entidad con
  intención. Estados casi estáticos.
- `processing` es un "vórtice de anillo de polvo" que no lee como un agente de
  IA — parece un anillo orbitando sin propósito.
- El choque de color cálido/frío (naranja `listening`/`speaking` vs azul
  `idle`/`processing`) se ve incoherente.
- Los widgets de datos (`Canvas` → `kpi_card`/`table` en `App.tsx:96`) aparecen
  como un **panel rectangular flotante "cruzado"**, desconectado de la escena.
- El wordmark "OTTO" queda a ~86% hacia abajo de la pantalla y **cortado**
  (`glengine.ts:515`: `yBase = cy + R*1.85 - off.height/2`).

## Referencias

Dos imágenes en `docs/` (2026-06-18):

1. **Globo de datos** (`e31ca7dc…jpg`): esfera densa, **asimétrica**, con textura
   de circuito/ciudad, púas radiales hacia afuera y arcos concéntricos. No es una
   bola de partículas lisa y simétrica.
2. **Prologue "elementDiscover"** (`d2d878dc…jpg`): núcleo central + **anillos
   concéntricos** + telemetría/lecturas ordenadas **radialmente** alrededor del
   centro. Estética de "descubrir / buscar información".

Ambas comparten el principio rector: **todo orbita un único núcleo en un sistema
concéntrico/radial.** Nada es un panel rectangular suelto.

## Principio rector

Un solo sistema de coordenadas concéntrico alrededor de un centro. La esfera,
los anillos, la telemetría y los widgets de datos viven todos sobre anillos/arcos
de ese sistema, comparten paleta (Aurora) y trazo fino. Esto da la cohesión que
hoy falta y elimina el "dashboard cruzado".

## Pilares de diseño

### 1. El núcleo (esfera)
- Más densa, con textura de circuito (aristas del grafo más marcadas).
- **Asimétrica**: distribución en clusters ("continentes"), no fibonacci uniforme.
- Cualidad de organismo: respira (contrae/expande lento), late.
- Púas/filamentos radiales que reaccionan a la amplitud de voz.

### 2. El anillo HUD (cohesión)
- Anillos concéntricos finos alrededor del núcleo, siempre presentes, rotación lenta.
- Toda telemetría, captions y widgets se anclan a estos anillos/arcos.
- Un único lenguaje visual (paleta Aurora, líneas finas, tipografía Michroma).

### 3. Comportamiento por estado
- **idle:** esfera respira lento; anillo exterior con telemetría tildando suave.
  Wordmark "OTTO" reposicionado (centrado/anclado, sin corte).
- **listening:** los anillos se alinean hacia el input; la esfera se "abre"/inclina;
  un arco se llena con la amplitud del mic. Snap de transición más duro.
- **processing (Jarvis que busca info):** anillos aceleran; barrido de escaneo gira;
  **fragmentos de datos entran desde los bordes hacia el núcleo** (simula fetch de
  información). Reemplaza el vórtice de polvo.
- **speaking:** la esfera **erupciona** en pulsos sincronizados a la voz; las
  lecturas/KPI **se despliegan desde el núcleo** sobre los arcos (revelación
  coherente, no panel que aparece de la nada).

### 4. Paleta
- **Aurora** (teal + violeta + verde + rosa), ya prototipada en `PALETTES.aurora`
  (`glengine.ts`). Unificar también el chrome del HUD (`--accent` en `App.css`).
- Quitar el resto de mundos de preview y el panel selector (`PalettePreview` en
  `OttoScene.tsx`) una vez fijada la dirección.

## Alcance / orden de implementación

Por partes, empezando por lo más visible:

1. **Fix wordmark** + fijar paleta Aurora + remover selector de preview y mundos extra.
2. **Esfera asimétrica + densa + respiración** (núcleo organismo).
3. **Anillo HUD concéntrico** (sistema base de cohesión).
4. **processing = scan/fetch** (fragmentos hacia el núcleo).
5. **listening/speaking** afinados (alineación de anillos, erupción por voz).
6. **Integrar widgets** (`kpi_card`/`table`) anclados a los arcos en vez de panel flotante.

## Fuera de alcance

- Cambios al pipeline de voz, STT/TTS o backend.
- Nuevos tipos de widget; solo se reubica/reestiliza el render de los existentes.
- Refactors no relacionados con la escena.

## Criterios de éxito

- La escena se siente **viva** y con intención en los 4 estados (no formas quietas).
- `processing` lee claramente como "buscando/agarrando información".
- Cero elementos rectangulares flotantes desconectados: todo orbita el núcleo.
- Wordmark visible y completo en idle.
- Una sola paleta coherente (Aurora) en escena y chrome.
- 60fps en el target actual (~14k partículas, dpr ≤ 1.75).
