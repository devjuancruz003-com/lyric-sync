import type { AudioPlayer, Unsubscribe } from "../audio/player";
import type { Line, Project, TimedWord, WordEdgeUpdate } from "../core/project";
import { computeWordEdgeMove, WORD_NUDGE_MS, WORD_NUDGE_SHIFT_MS, type WordEdge } from "../sync/wordTimeline";

/** Misma clase que activan las capturas (de líneas y de palabras) mientras están en curso — no
 * se puede entrar a esta vista con una captura activa, y si arranca una mientras se está acá,
 * se sale (ver evaluate()). */
const CAPTURE_ACTIVE_CLASS = "tap-sync-active";

export interface WordTimelineOptions {
  player: AudioPlayer;
  /** Lista de líneas: cada re-render (edición, undo/redo, cambio de modo) reevalúa si
   * corresponde entrar, seguir o salir de la vista. */
  list: HTMLElement;
  getProject: () => Project | null;
  /** Línea seleccionada por ui/timeline.ts (click en la lista o, fuera de esta vista, en su
   * region) — la vista de palabras reutiliza esa selección, no crea otro mecanismo. */
  getSelectedLineId: () => string | null;
  /** Aplica el resultado de mover un borde (drag o nudge): push de un HistoryEntry
   * "setWordTimestamp" (con `derived` si el borde era compartido) y aplicación al estado real. */
  commitEdgeMove: (line: Line, updates: WordEdgeUpdate[]) => void;
  /** Al salir de la vista, las regions de línea se recrean sin resaltado — se llama después de
   * renderLineRegions() para que la línea seleccionada (puede haber cambiado) vuelva a mostrar
   * su outline. */
  refreshLineHighlight: () => void;
}

export interface WordTimelineControls {
  isActive(): boolean;
  getSelectedWord(): { wordId: string; edge: WordEdge } | null;
  /** Selecciona una palabra desde afuera (fila del panel de línea seleccionada, Fase 10c) — sin
   * efecto si no se está en la vista de palabras o el id no es de la línea activa. */
  selectWord(wordId: string): void;
  /** Reevalúa si corresponde entrar/salir/actualizar la vista — llamar tras un cambio de
   * selección de línea (ui/timeline.ts no re-renderiza la lista al seleccionar). */
  refresh(): void;
  /** Sale de la vista de palabras si está activa (restaurando zoom y scroll, igual que
   * Escape) — sin efecto si no lo está. Llamar ANTES de cualquier acción que vaya a tocar las
   * regions o la selección por su cuenta (ej. "Refinar timing"), para que esa acción parta de
   * un estado limpio en vez de pisarse con esta vista o dejarla "colgada". */
  exitIfActive(): void;
  /** Se dispara al entrar, salir, o cambiar la palabra/borde seleccionado. */
  onChange(listener: () => void): Unsubscribe;
}

/** Línea con rango propio y TODAS sus palabras capturadas — único estado desde el que existe la
 * vista de palabras. */
function getReadyWords(line: Line): TimedWord[] | null {
  if (line.startTime === null || line.endTime === null || line.words.length === 0) return null;
  if (!line.words.every((word) => word.startTime !== null && word.endTime !== null)) return null;
  return line.words.map((word) => ({ id: word.id, startTime: word.startTime as number, endTime: word.endTime as number }));
}

/**
 * Refinamiento manual por palabra (Fase 10d-2), dentro de "Refinar timing" en modo Palabra:
 * arrastrar o nudgear los bordes de las palabras de la línea seleccionada, con zoom automático
 * y límites duros. Solo existe con TODAS las palabras de la línea ya capturadas — con captura
 * parcial no cambia de vista (el panel de la Fase 10c explica por qué). No permite mover la
 * region completa (drag: false en player.ts), solo sus bordes.
 */
export function setupWordTimeline({
  player,
  list,
  getProject,
  getSelectedLineId,
  commitEdgeMove,
  refreshLineHighlight,
}: WordTimelineOptions): WordTimelineControls {
  let active = false;
  let activeLineId: string | null = null;
  let selectedWordId: string | null = null;
  let activeEdge: WordEdge = "start";
  let savedViewState: { pxPerSec: number; scrollTime: number } | null = null;
  const listeners = new Set<() => void>();

  function notify(): void {
    listeners.forEach((listener) => listener());
  }

  function getActiveLine(): Line | undefined {
    return activeLineId ? getProject()?.lines.find((line) => line.id === activeLineId) : undefined;
  }

  function applySelectionHighlight(): void {
    player.highlightRegion(selectedWordId, selectedWordId ? activeEdge : null);
  }

  function renderCurrentRegions(line: Line): void {
    player.renderWordRegions(
      line.words.map((word) => ({
        id: word.id,
        text: word.text,
        startTime: word.startTime as number,
        endTime: word.endTime as number,
      })),
    );
  }

  function enterWordView(line: Line): void {
    savedViewState = player.getViewState();
    active = true;
    activeLineId = line.id;
    selectedWordId = null;
    activeEdge = "start";
    player.zoomToRange(line.startTime as number, line.endTime as number);
    renderCurrentRegions(line);
    notify();
  }

  function exitWordView(): void {
    if (!active) return;
    active = false;
    activeLineId = null;
    selectedWordId = null;
    if (savedViewState !== null) player.restoreViewState(savedViewState);
    savedViewState = null;
    player.renderLineRegions(getProject()?.lines ?? []);
    refreshLineHighlight();
    notify();
  }

  /** Único punto de decisión: entrar, seguir (refrescando regions por si cambiaron los tiempos
   * de la línea activa) o salir — según la línea seleccionada, el modo, si hay una captura
   * activa y si la línea ya tiene todas sus palabras capturadas. Se llama tras cualquier cambio
   * relevante (selección, re-render de la lista, inicio/fin de captura). */
  function evaluate(): void {
    const project = getProject();
    const lineId = getSelectedLineId();
    const captureActive = document.body.classList.contains(CAPTURE_ACTIVE_CLASS);
    const line = project?.syncMode === "word" && lineId ? project.lines.find((candidate) => candidate.id === lineId) : undefined;
    const canEnter = !!line && !captureActive && getReadyWords(line) !== null;

    if (!canEnter) {
      if (active) exitWordView();
      return;
    }

    if (!active || activeLineId !== line!.id) {
      enterWordView(line!);
      return;
    }

    // Misma línea, seguimos activos: puede haber cambiado el timing de alguna palabra (undo/redo,
    // o el propio commit que acabamos de aplicar) — refrescar regions con los valores actuales.
    renderCurrentRegions(line!);
    applySelectionHighlight();
  }

  function selectWord(wordId: string): void {
    if (!active) return;
    const line = getActiveLine();
    if (!line?.words.some((word) => word.id === wordId)) return;
    selectedWordId = wordId;
    activeEdge = "start";
    applySelectionHighlight();
    notify();
  }

  function deselectWord(): void {
    if (selectedWordId === null) return;
    selectedWordId = null;
    applySelectionHighlight();
    notify();
  }

  function toggleEdge(): void {
    if (selectedWordId === null) return;
    activeEdge = activeEdge === "start" ? "end" : "start";
    applySelectionHighlight();
    notify();
  }

  /** ↑/↓: cambia la selección a la palabra anterior/siguiente de la línea, sin tocar timings.
   * En la primera o la última, no hace nada. */
  function selectAdjacentWord(delta: -1 | 1): void {
    const line = getActiveLine();
    if (!line || selectedWordId === null) return;
    const index = line.words.findIndex((word) => word.id === selectedWordId);
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= line.words.length) return;
    selectedWordId = line.words[nextIndex].id;
    activeEdge = "start";
    applySelectionHighlight();
    notify();
  }

  function applyNudge(deltaMs: number): void {
    const line = getActiveLine();
    if (!line || selectedWordId === null) return;
    const words = getReadyWords(line);
    if (!words) return;
    const current = words.find((word) => word.id === selectedWordId);
    if (!current) return;
    const currentEdgeTime = activeEdge === "start" ? current.startTime : current.endTime;
    const candidate = currentEdgeTime + deltaMs / 1000;
    const updates = computeWordEdgeMove(words, selectedWordId, activeEdge, candidate, line.startTime as number, line.endTime as number);
    if (updates.length > 0) commitEdgeMove(line, updates);
  }

  function handleKeydown(event: KeyboardEvent): void {
    // Un modal (ej. calibración) también puede estar escuchando el teclado; no pisarlo.
    if (document.querySelector('[role="dialog"]')) return;
    if (!active) return; // fuera de esta vista, el teclado de líneas de ui/timeline.ts sigue igual

    if (event.key === "Escape") {
      event.preventDefault();
      // Con una palabra elegida, Escape solo la deselecciona; recién con nada elegido sale de
      // la vista (vuelve a las regions de línea, la línea sigue seleccionada).
      if (selectedWordId !== null) deselectWord();
      else exitWordView();
      return;
    }

    if (selectedWordId === null) return; // sin palabra elegida, no interceptar nada más acá

    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable]")) return;

    if (event.key === "Tab") {
      event.preventDefault();
      toggleEdge();
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      selectAdjacentWord(event.key === "ArrowUp" ? -1 : 1);
      return;
    }

    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const stepMs = event.shiftKey ? WORD_NUDGE_SHIFT_MS : WORD_NUDGE_MS;
    applyNudge(event.key === "ArrowLeft" ? -stepMs : stepMs);
  }

  document.addEventListener("keydown", handleKeydown);

  player.onRegionClick((id) => {
    if (active) selectWord(id);
  });

  // Arrastre de un borde (evento region-updated, no en cada frame del drag). El id de la region
  // es el de la palabra; si no estamos en esta vista o no corresponde a la línea activa, la
  // palabra no se encuentra y no hace nada (mismo resguardo natural que usa ui/timeline.ts al
  // revés con ids de línea).
  player.onRegionUpdateEnd(({ lineId: regionId, start, end }) => {
    if (!active) return;
    const line = getActiveLine();
    if (!line) return;
    const original = line.words.find((word) => word.id === regionId);
    if (!original || original.startTime === null || original.endTime === null) return;
    const words = getReadyWords(line);
    if (!words) return;

    const edge: WordEdge = start !== original.startTime ? "start" : "end";
    const candidate = edge === "start" ? start : end;
    const updates = computeWordEdgeMove(words, regionId, edge, candidate, line.startTime as number, line.endTime as number);
    if (updates.length > 0) commitEdgeMove(line, updates);
  });

  new MutationObserver(evaluate).observe(list, { childList: true });
  new MutationObserver(evaluate).observe(document.body, { attributes: true, attributeFilter: ["class"] });

  return {
    isActive: () => active,
    getSelectedWord: () => (selectedWordId ? { wordId: selectedWordId, edge: activeEdge } : null),
    selectWord,
    refresh: evaluate,
    exitIfActive: exitWordView,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
