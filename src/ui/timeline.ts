import type { AudioPlayer } from "../audio/player";
import type { Line } from "../core/project";
import {
  clampEnd,
  clampStart,
  deriveMissingEndTimes,
  NUDGE_STEP_SEC,
  NUDGE_STEP_SEC_LARGE,
  type LineEdge,
} from "../sync/timeline";
import { setSelectedLine } from "./linesPreview";

/** Clase en <body> mientras hay una línea seleccionada, para que el seek de ±5s de la
 * waveform (Fase 2) sepa que debe cederle el paso al nudging de esta línea. */
const SELECTION_ACTIVE_CLASS = "timeline-selection-active";
const NO_LINES_MESSAGE = "Todavía no hay líneas capturadas — hacé la captura en vivo primero.";

export interface TimelineOptions {
  refineButton: HTMLButtonElement;
  refineStatus: HTMLElement;
  player: AudioPlayer;
  linesOutput: HTMLElement;
  getLines: () => Line[];
  getAudioDuration: () => number;
  /** Aplica un cambio puntual de startTime/endTime a una línea (derivación automática al
   * entrar a refinamiento, nudge por teclado o arrastre con mouse) — quien la usa decide
   * cómo empujar el HistoryEntry y persistir. */
  onLineTimingChange: (lineId: string, startTime: number | null, endTime: number | null) => void;
  /** Se llama cuando cambia la línea seleccionada (o se deselecciona: `null`). */
  onSelectionChange?: (lineId: string | null) => void;
}

export interface TimelineControls {
  setEnabled(enabled: boolean): void;
  /** Reaplica el resaltado de selección tras un re-render de linesOutput (no toca las regions). */
  refreshSelectionHighlight(): void;
  /** Deselecciona sin tocar las regions — usar cuando el Project cambia entero (la selección
   * anterior ya no corresponde a una línea válida; quien llama re-renderiza las regions). */
  exitSelection(): void;
  /** Id de la línea seleccionada (click en la lista o en su region), o null. */
  getSelectedLineId(): string | null;
  /** Mientras la vista de palabras (Fase 10d-2) está activa, el teclado de líneas (Tab/flechas/
   * Escape de ESTE módulo) cede el paso por completo — esa vista maneja el suyo. Se fija después
   * de construir ambos módulos (dependencia circular: la vista de palabras necesita
   * getSelectedLineId de acá). */
  setWordViewActiveGetter(getter: () => boolean): void;
  /** Se fija junto con setWordViewActiveGetter — cierra limpio la vista de palabras (si está
   * activa) antes de acciones que tocan las regions/la selección por su cuenta (ej. "Refinar
   * timing"), para que no quede "colgada" ni se mezcle con las regions de línea. */
  setExitWordView(fn: () => void): void;
}

export function setupTimeline({
  refineButton,
  refineStatus,
  player,
  linesOutput,
  getLines,
  getAudioDuration,
  onLineTimingChange,
  onSelectionChange,
}: TimelineOptions): TimelineControls {
  let selectedLineId: string | null = null;
  let activeEdge: LineEdge = "start";
  let isWordViewActive: () => boolean = () => false;
  let exitWordView: () => void = () => {};

  function applySelectionHighlight(): void {
    setSelectedLine(linesOutput, selectedLineId);
    player.highlightRegion(selectedLineId, selectedLineId ? activeEdge : null);
  }

  function selectLine(lineId: string): void {
    const line = getLines().find((candidate) => candidate.id === lineId);
    if (!line || line.startTime === null) return; // nada capturado todavía en esa línea
    selectedLineId = lineId;
    activeEdge = "start";
    document.body.classList.add(SELECTION_ACTIVE_CLASS);
    applySelectionHighlight();
    onSelectionChange?.(selectedLineId);
  }

  function deselect(): void {
    if (selectedLineId === null) return;
    selectedLineId = null;
    document.body.classList.remove(SELECTION_ACTIVE_CLASS);
    applySelectionHighlight();
    onSelectionChange?.(null);
  }

  function applyNudge(deltaSec: number): void {
    if (selectedLineId === null) return;
    const line = getLines().find((candidate) => candidate.id === selectedLineId);
    if (!line || line.startTime === null || line.endTime === null) return;

    if (activeEdge === "start") {
      onLineTimingChange(line.id, clampStart(line.startTime + deltaSec, line.endTime), line.endTime);
    } else {
      onLineTimingChange(line.id, line.startTime, clampEnd(line.endTime + deltaSec, line.startTime, getAudioDuration()));
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    // Un modal (ej. calibración) también puede estar escuchando el teclado; no pisarlo.
    if (document.querySelector('[role="dialog"]')) return;
    // La vista de palabras (Fase 10d-2) maneja su propio teclado mientras está activa (incluido
    // su Escape, que primero deselecciona la palabra y recién después sale de la vista).
    if (isWordViewActive()) return;

    if (event.key === "Escape") {
      if (selectedLineId !== null) {
        event.preventDefault();
        deselect();
      }
      return;
    }

    if (selectedLineId === null) return; // sin selección, no interceptar nada más acá

    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable]")) return;

    if (event.key === "Tab") {
      event.preventDefault();
      activeEdge = activeEdge === "start" ? "end" : "start";
      applySelectionHighlight();
      return;
    }

    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.shiftKey ? NUDGE_STEP_SEC_LARGE : NUDGE_STEP_SEC;
    applyNudge(event.key === "ArrowLeft" ? -step : step);
  }

  document.addEventListener("keydown", handleKeydown);

  linesOutput.addEventListener("click", (event) => {
    const li = (event.target as HTMLElement).closest("li");
    const lineId = li?.dataset.lineId;
    if (lineId) selectLine(lineId);
  });

  player.onRegionClick(selectLine);

  player.onRegionUpdateEnd(({ lineId, start, end }) => {
    onLineTimingChange(lineId, start, end);
  });

  refineButton.addEventListener("click", () => {
    // La vista de palabras (Fase 10d-2) reemplaza las regions de línea por unas de palabra y
    // guarda su propio zoom/scroll para restaurarlos al salir — si sigue activa cuando esto
    // corre, su reaplicación en el próximo re-render de la lista pisaría las regions de línea
    // que "Refinar timing" está por dibujar. Cerrarla primero deja todo en un estado limpio.
    exitWordView();
    const lines = getLines();
    if (!lines.some((line) => line.startTime !== null)) {
      refineStatus.textContent = NO_LINES_MESSAGE;
      return;
    }

    refineStatus.textContent = "";
    const withDerivedEndTimes = deriveMissingEndTimes(lines, getAudioDuration());
    withDerivedEndTimes.forEach((updated, index) => {
      if (updated.endTime !== lines[index].endTime) {
        onLineTimingChange(updated.id, updated.startTime, updated.endTime);
      }
    });

    player.renderLineRegions(getLines());
  });

  return {
    setEnabled(enabled) {
      refineButton.disabled = !enabled;
      if (!enabled) refineStatus.textContent = NO_LINES_MESSAGE;
      else if (refineStatus.textContent === NO_LINES_MESSAGE) refineStatus.textContent = "";
    },
    refreshSelectionHighlight: applySelectionHighlight,
    exitSelection: deselect,
    getSelectedLineId: () => selectedLineId,
    setWordViewActiveGetter: (getter) => {
      isWordViewActive = getter;
    },
    setExitWordView: (fn) => {
      exitWordView = fn;
    },
  };
}
