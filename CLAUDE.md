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
interface HistoryEntry { type: "setTimestamp" | "addLine" | "deleteLine" | "editText" | "shiftOffset" | "createProject" | "setSyncMode" | "setWordTimestamp"; before: unknown; after: unknown; timestamp: number; }
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
- Al iniciar la captura de líneas, si la línea objetivo (la primera sin
  `startTime`) tiene alguna línea capturada antes, se hace seek al `startTime`
  de la más cercana anterior y se reproduce desde ahí (esté el audio pausado o
  sonando), para tener el contexto de la letra ya sincronizada. Sin ninguna
  capturada antes, no se toca la posición (como antes). La captura de palabras
  no cambia: ya arranca en el `startTime` de su línea.
- Cada tap de captura marca el `startTime` de la línea y deriva, en el MISMO
  `HistoryEntry` "setTimestamp" (campo opcional `derived`, así un Ctrl+Z
  deshace la marca y el `endTime` derivado de un solo paso): el `endTime` de
  la línea anterior MÁS CERCANA por posición que tenga `startTime` (no
  necesariamente la adyacente) se recorta al `startTime` de la recién marcada
  si es `null` o mayor que ese `startTime` (así una captura reanudada corrige
  el `endTime` provisional que dejó "Refinar timing"; el `before` guarda el
  provisional para que Ctrl+Z lo restaure). Si es menor o igual (hueco
  deliberado), o si el tap cae antes del inicio de esa línea, no se toca. Y el
  `endTime` de la última línea del proyecto (= duración del audio, si es > 0).
  Cargar un proyecto NO corrige solapamientos (`normalizeProject` no los toca):
  los avisos de la Fase 8 son informativos y pueden ser a propósito. Así las
  líneas ya tienen rango justo después de capturar, sin pasar por el
  refinamiento — `getRenderableLines()` descarta las líneas sin `endTime`, y sin
  esto el preview y "Seguir reproducción" no actuarían tras capturar. Una
  captura parcial deja la última línea capturada en `null`.
- "Refinar timing" (entrada al modo refinamiento) conserva
  `deriveMissingEndTimes()` como red de seguridad: a cada línea capturada que
  siga sin `endTime` le pone el `startTime` de la siguiente capturada, o la
  duración del audio si es la última. Es un dato real del Project (no solo
  visual) — empuja un `HistoryEntry` por línea. Con la derivación al capturar
  casi nunca tiene algo que completar.
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
- El modo palabra (Fase 9) no es un sistema paralelo: reutiliza la mecánica
  de captura de las Fases 6-7 pero anidada. Para capturar las palabras de una
  línea, esa línea ya debe tener su propio `startTime`/`endTime`. La captura
  reproduce solo ese tramo acotado (no la canción entera), con el mismo
  tap-to-sync con offset calibrado y la misma fórmula de derivación de
  `endTime`, aplicadas a `Word[]` dentro de la línea en vez de a `Line[]`
  dentro de toda la canción.
- Derivación de `endTime` de palabras, incremental: cada vez que se marca una
  palabra, en el mismo `HistoryEntry` "setWordTimestamp" (el payload lleva un
  `derived` opcional con los endTime de otras palabras, así un Ctrl+Z deshace
  la marca y las derivaciones de un solo paso): la palabra anterior sin
  `endTime` toma el `startTime` de la recién marcada, y si la marcada es la
  última de la línea (por posición) toma el `endTime` de la línea. No depende
  de que el audio llegue al final de la línea (ese chequeo solo pausa y sale de
  la captura). Una captura parcial deja la última palabra capturada en `null`.
  `normalizeProject()` aplica la misma regla a líneas y palabras (primero las
  líneas, porque el `endTime` de la última palabra depende del de su línea), en
  silencio (sin `HistoryEntry`, ni en undo/redo), a proyectos ya guardados al
  cargar de localStorage y al importar un `.json`.
- Sin refinamiento manual (regions) para palabras — no está en el roadmap
  como fase separada, y agregar drag-and-resize a nivel palabra dentro de una
  línea angosta es demasiada UI para el plan actual. El undo cubre el caso de
  "salió mal": se rehace la captura de esa línea entera. Ajuste fino por
  palabra, si hace falta, sería una fase aparte.
- El preview usa el mismo motor de renderizado (`src/render/highlighter.ts`)
  que los exportadores — nunca una implementación aparte. Ese módulo separa
  dos responsabilidades: `getRenderableLines(project)` filtra qué líneas y
  palabras tienen timing completo y son seguras de mostrar/exportar (solo
  líneas con `startTime` y `endTime`; `words` va completo solo si todas las
  palabras tienen timing, si no la línea entra con `words: []` y cae a
  resaltado de línea completa). La usan el preview y, en la Fase 11, los
  exportadores, así lo que se ve y lo que se exporta no pueden divergir.
  `getActiveState(lines, currentTime)` decide qué línea/palabra suena ahora:
  es solo para el preview en vivo, los exportadores no la usan (escriben
  rangos, no les importa el tiempo de reproducción). Ninguna de las dos se
  guarda en el Project; se recalculan en cada tick (y al cambiar el Project,
  para que el preview no quede desactualizado con el audio en pausa).
- El preview (`src/ui/preview.ts`) es un panel aparte de la lista de líneas
  (`linesPreview.ts`, que sigue siendo la vista de edición): sin botones, se
  actualiza solo mientras suena el audio y es visible siempre que haya un
  Project con audio cargado, no solo durante la captura.
- Layout tipo editor (Fase 10b): la app ocupa el viewport (100dvh, sin scroll
  de página en pantallas anchas) con barra superior y pestañas "Preparar" |
  "Sincronizar" (Exportar se agrega en la Fase 11). La región de audio (input,
  waveform, transporte, calibración) vive fuera de los tabpanels y es siempre
  visible: la instancia de wavesurfer NO se destruye ni se recrea al cambiar de
  pestaña (los paneles solo se ocultan con `hidden`), así la reproducción no se
  corta. "Preparar" = letra + Proyecto (importar/exportar); al analizar la
  letra con éxito se pasa solo a "Sincronizar". "Sincronizar" = lista de
  líneas con barra de herramientas y scroll propio (izquierda, ~60%) + preview
  (derecha, ~40%); bajo ~900px es una sola columna con el preview arriba. Al
  iniciar, se abre en "Sincronizar" si el proyecto restaurado tiene líneas. Las
  pestañas siguen el patrón ARIA tabs; ←/→ navegan entre ellas solo con el foco
  en una pestaña.
- "Seguir reproducción" (casilla, activada por defecto): la lista scrollea su
  propio contenedor (no `scrollIntoView`, que movería la página), sin
  animación y solo cuando cambia la línea objetivo de captura o la línea que
  suena; durante la captura manda la línea objetivo.
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
- [x] Fase 9 — Modo palabra por palabra. Completo.
- [ ] Fase 10 — Preview en tiempo real (motor `src/render/highlighter.ts` compartido). Provisional: pendiente verificar el preview en modo palabra.
- [x] Fase 10b — Layout tipo editor (región de audio persistente + pestañas Preparar/Sincronizar). Completo.
- [ ] Fase 10c — Re-grabar palabras por línea + panel de línea seleccionada.
- [ ] Fase 11 — Exportadores (`.lrc`, `.srt`, `.vtt`, `.ass`) sobre `getRenderableLines()`, con pestaña "Exportar".
- [ ] Fase 12 — Accesibilidad + pulido del flujo (las pestañas ya existen desde la 10b).