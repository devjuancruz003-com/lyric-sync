# Lyric Sync

Herramienta web para sincronizar letras de canciones con audio, con precisión
configurable línea por línea o palabra por palabra. El objetivo es facilitar
la creación de video lyrics permitiendo ajustar el timing exacto de cada
línea/palabra respecto al audio.

## Stack y restricciones

- TypeScript + Vite (`vanilla-ts`, sin framework de UI).
- `wavesurfer.js` para waveform, regions y timeline.
- 100% client-side: sin backend, sin base de datos, sin autenticación.
- Persistencia: `localStorage` (autosave) + import/export de proyecto como `.json`.
- Deploy: GitHub Pages vía GitHub Actions (`.github/workflows/deploy.yml`).
- Repo: `devjuancruz003/lyric-sync`. `base` en `vite.config.ts` = `/lyric-sync/`.

## Estructura de carpetas

- `src/core/` — modelo de datos, parser de letra, storage (localStorage + JSON), historial (undo/redo), validación de timing.
- `src/audio/` — wrapper de wavesurfer.js, calibración de latencia.
- `src/sync/` — captura en vivo (tap-to-sync), timeline con nudging por teclado.
- `src/render/` — motor de resaltado de letra, compartido entre preview y exportadores (deben usar exactamente el mismo motor).
- `src/export/` — generadores de `.lrc`, `.srt`, `.vtt`, `.ass`.
- `src/ui/` — componentes de interfaz.

## Modelo de datos (referencia)

```ts
interface Project { audioFileName: string; duration: number; syncMode: "line" | "word"; lines: Line[]; lastModified: number; }
interface Line { id: string; text: string; startTime: number | null; endTime: number | null; words: Word[]; }
interface Word { id: string; text: string; startTime: number | null; endTime: number | null; }
interface UserSettings { latencyOffsetMs: number; }
interface HistoryEntry { type: "setTimestamp" | "addLine" | "deleteLine" | "editText" | "shiftOffset" | "createProject"; before: unknown; after: unknown; timestamp: number; }
```

## Decisiones de UX (no cambiar sin avisar)

- Captura y refinamiento son pasos separados: al tapear en vivo no se exige
  precisión perfecta, se ajusta después con el timeline.
- Todo tap de captura resta automáticamente `latencyOffsetMs` (calibrado por
  el usuario) para compensar el tiempo de reacción humano.
- Mientras el modo captura está activo, la barra espaciadora cambia de rol:
  marca el inicio de la línea actual en vez de pausar el audio (su función
  fuera de este modo). Escape sale del modo captura y le devuelve a espacio
  su función normal.
- Cada tap de captura marca únicamente `startTime` de la línea; `endTime`
  queda en `null` hasta la Fase 7.
- Al entrar por primera vez al modo refinamiento, cada línea capturada recibe
  un `endTime` automático: el `startTime` de la línea siguiente, o la
  duración total del audio si es la última. Es un dato real del Project (no
  solo visual) — empuja un `HistoryEntry` por línea, así se puede deshacer si
  el resultado automático no sirve.
- Nudging por teclado en el refinamiento, sin línea seleccionada las flechas
  siguen siendo el seek de ±5s (Fase 2): ←/→ ajustan en pasos de 100ms el
  borde activo (inicio o fin) de la línea seleccionada (click en su region o
  en la lista), Shift+←/→ en pasos de 500ms, Tab alterna qué borde está
  activo, Escape deselecciona y devuelve las flechas al seek normal.
- Las reglas de timing (duración mínima, solapamientos) son advertencias no
  bloqueantes, nunca impiden guardar o exportar. Son derivadas: no se guardan
  en el Project ni en localStorage, se recalculan en cada render a partir de
  los `startTime`/`endTime` actuales (si se guardaran, quedarían
  desactualizadas apenas alguien ajuste un timing sin volver a validar).
- Duración mínima de línea: 300ms (no los ~833ms de subtítulos hablados tipo
  Netflix — acá son versos cantados, donde una palabra suelta en un tramo
  rápido puede durar 150-200ms legítimamente). El piso de 300ms es para
  atrapar mistaps evidentes de captura, no para exigir ritmo de lectura.
- El preview usa el mismo motor de renderizado (`src/render/highlighter.ts`)
  que los exportadores — nunca una implementación aparte.
- Toda la app debe ser operable por teclado (sin depender del mouse).
- Autosave a `localStorage` en cada cambio + warning nativo del navegador
  (`beforeunload`) si hay cambios sin exportar, porque no hay cuenta ni nube.

## Estado actual

- [x] Fase 1 — Setup del proyecto (Vite + TS + wavesurfer.js) y deploy a GitHub Pages. Completo.
- [x] Fase 2 — Carga de audio + letra, reproductor básico. Completo.
- [x] Fase 3 — Modelo de datos + parser de letra. Completo.
- [x] Fase 4 — Infraestructura de historial (undo/redo) + autosave. Completo.
- [x] Fase 5 — Calibración de latencia. Completo.
- [x] Fase 6 — Captura en vivo (tap-to-sync) a nivel línea. Completo.
- [x] Fase 7 — Refinamiento manual (regions en waveform + nudging por teclado). Completo.
- [x] Fase 8 — Validación de timing (avisos no bloqueantes). Completo.