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
interface HistoryEntry { type: "setTimestamp" | "addLine" | "deleteLine" | "editText" | "shiftOffset"; before: unknown; after: unknown; timestamp: number; }
```

## Decisiones de UX (no cambiar sin avisar)

- Captura y refinamiento son pasos separados: al tapear en vivo no se exige
  precisión perfecta, se ajusta después con el timeline.
- Todo tap de captura resta automáticamente `latencyOffsetMs` (calibrado por
  el usuario) para compensar el tiempo de reacción humano.
- El refinamiento manual soporta nudging por teclado (flechas = ±100ms,
  Shift+flecha = paso mayor), no solo arrastre con mouse.
- Las reglas de timing (duración mínima, solapamientos) son advertencias no
  bloqueantes, nunca impiden guardar o exportar.
- El preview usa el mismo motor de renderizado (`src/render/highlighter.ts`)
  que los exportadores — nunca una implementación aparte.
- Toda la app debe ser operable por teclado (sin depender del mouse).
- Autosave a `localStorage` en cada cambio + warning nativo del navegador
  (`beforeunload`) si hay cambios sin exportar, porque no hay cuenta ni nube.

## Estado actual

- [x] Fase 1 — Setup del proyecto (Vite + TS + wavesurfer.js) y deploy a GitHub Pages. Completo.
- [x] Fase 2 — Carga de audio + letra, reproductor básico. Completo.
- [x] Fase 3 — Modelo de datos + parser de letra. Completo.
- [ ] Fase 4 — Infraestructura de historial (undo/redo)