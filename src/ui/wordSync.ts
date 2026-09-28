import type { AudioPlayer, Unsubscribe } from "../audio/player";
import type { Line } from "../core/project";
import { getWordCaptureStartTime, isInWordCapturePreroll, WordSyncSession } from "../sync/wordSync";
import { refreshCaptureButton, setTargetWord } from "./linesPreview";

/** Misma clase que usa la captura de líneas (Fase 6): así el guard de espacio en
 * playerControls.ts funciona para las dos sin tocarlo, y además evita que ambas
 * capturas (línea y palabra) puedan estar activas a la vez. */
const CAPTURE_ACTIVE_CLASS = "tap-sync-active";

export interface WordSyncOptions {
  linesOutput: HTMLElement;
  player: AudioPlayer;
  getLines: () => Line[];
  getLatencyOffsetMs: () => number;
  /** Aplica la marca de una palabra al estado real (historial, Project, autosave). */
  onWordTap: (lineId: string, wordId: string, startTime: number) => void;
  /** Texto de estado (role="status") donde se avisa del pre-roll. */
  statusElement: HTMLElement;
}

export interface WordSyncControls {
  /** Reaplica el resaltado de la palabra objetivo y el label de la línea activa — llamar
   * tras cualquier re-render de linesOutput mientras se captura. */
  refresh(): void;
  /** Sale del modo captura de palabras si está activo, sin pausar el audio. Seguro de
   * llamar siempre (ej. cuando el Project cambia entero). */
  exitCapture(): void;
  /** Arranca la captura de palabras de una línea (flujo compartido con el botón "Capturar
   * palabras" de la lista): seek al pre-roll y reproducción. `button` es el botón de la lista
   * que la disparó, si lo hay. Devuelve false si no pudo arrancar. */
  startCapture(lineId: string, button?: HTMLButtonElement): boolean;
}

const PREROLL_MESSAGE = "Escuchá el inicio…";

export function setupWordSync({
  linesOutput,
  player,
  getLines,
  getLatencyOffsetMs,
  onWordTap,
  statusElement,
}: WordSyncOptions): WordSyncControls {
  let activeLineId: string | null = null;
  let session: WordSyncSession | null = null;
  let unsubscribeTimeUpdate: Unsubscribe | null = null;

  function getActiveLine(): Line | undefined {
    return activeLineId ? getLines().find((line) => line.id === activeLineId) : undefined;
  }

  function highlightCurrentWord(): void {
    const line = getActiveLine();
    const wordId = line && session && !session.isDone() ? (line.words[session.getCurrentIndex()]?.id ?? null) : null;
    setTargetWord(linesOutput, wordId);
  }

  function applyActiveButtonLabel(): void {
    if (!activeLineId) return;
    const button = linesOutput.querySelector<HTMLButtonElement>(
      `.capture-words-button[data-line-id="${activeLineId}"]`,
    );
    if (!button) return;
    button.disabled = false;
    button.textContent = "Detener captura";
  }

  function setPrerollStatus(visible: boolean): void {
    const text = visible ? PREROLL_MESSAGE : "";
    if (statusElement.textContent !== text) statusElement.textContent = text;
  }

  function stopCapture(pause: boolean): void {
    if (!session) return;
    const lineId = activeLineId;
    session = null;
    activeLineId = null;
    document.body.classList.remove(CAPTURE_ACTIVE_CLASS);
    document.removeEventListener("keydown", handleKeydown);
    unsubscribeTimeUpdate?.();
    unsubscribeTimeUpdate = null;
    setTargetWord(linesOutput, null);
    setPrerollStatus(false);
    // El botón quedó con el label "Detener captura" pisado mientras estuvo activo — sacarlo
    // sin esperar a que algo más re-renderice toda la lista (ej. al salir con Escape).
    const line = lineId ? getLines().find((candidate) => candidate.id === lineId) : undefined;
    if (line) refreshCaptureButton(linesOutput, line);
    if (pause) player.pause();
  }

  // Al llegar al final del tramo de la línea se pausa y se sale de la captura. Los endTime de
  // las palabras ya no se asignan acá: se derivan en cada marca (ver computeWordTap()).
  function handleTimeUpdate(currentTime: number): void {
    const line = getActiveLine();
    if (!line || line.startTime === null || line.endTime === null) return;
    if (currentTime >= line.endTime) {
      stopCapture(true);
      return;
    }
    // Pre-roll: el aviso dura hasta llegar al startTime de la línea (y reaparece si se vuelve atrás).
    setPrerollStatus(isInWordCapturePreroll(currentTime, line.startTime));
  }

  function handleKeydown(event: KeyboardEvent): void {
    // Un modal (ej. calibración) también puede estar escuchando el teclado; no pisarlo.
    if (document.querySelector('[role="dialog"]')) return;

    if (event.key === "Escape") {
      event.preventDefault();
      stopCapture(true);
      return;
    }

    if (event.key !== " " || event.repeat) return;
    // Mismo criterio que en el resto de la app: no interceptar si el foco está en un
    // campo de texto u otro control — ahí gana el comportamiento normal del elemento.
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, button, [contenteditable]")) return;
    event.preventDefault();

    if (!session || !activeLineId) return;
    const line = getActiveLine();
    if (!line) return;
    // Pre-roll: el audio todavía no llegó a la línea. Espacio se consume (arriba) para que
    // tampoco haga play/pause, pero no marca ninguna palabra.
    if (line.startTime !== null && isInWordCapturePreroll(player.getCurrentTime(), line.startTime)) return;
    const result = session.markCurrentWord(line.words, player.getCurrentTime(), getLatencyOffsetMs());
    if (!result) return; // ya se marcaron todas; se sigue escuchando hasta el endTime de la línea

    onWordTap(activeLineId, result.wordId, result.startTime);
    highlightCurrentWord();
  }

  function startCaptureForLine(lineId: string, button?: HTMLButtonElement): boolean {
    // La captura de líneas (Fase 6) usa la misma clase; no arrancar las dos a la vez.
    if (session || document.body.classList.contains(CAPTURE_ACTIVE_CLASS)) return false;
    const line = getLines().find((candidate) => candidate.id === lineId);
    if (!line || line.startTime === null || line.endTime === null) return false;

    const newSession = new WordSyncSession(line.words);
    if (newSession.isDone()) return false; // no queda ninguna palabra por marcar

    session = newSession;
    activeLineId = lineId;
    document.body.classList.add(CAPTURE_ACTIVE_CLASS);
    document.addEventListener("keydown", handleKeydown);
    unsubscribeTimeUpdate = player.onTimeUpdate(handleTimeUpdate);
    if (button) {
      button.textContent = "Detener captura";
      // Evita que la espaciadora reactive el propio botón (foco tras el click).
      button.blur();
    }
    highlightCurrentWord();

    // Pre-roll: arrancar unos segundos antes de la línea para agarrar el ritmo. Hasta llegar a
    // su startTime, Espacio no marca (ver handleKeydown) y se avisa con el texto de estado.
    const seekTime = getWordCaptureStartTime(line.startTime);
    setPrerollStatus(isInWordCapturePreroll(seekTime, line.startTime));
    player.seek(seekTime);
    player.play().catch(() => {});
    return true;
  }

  linesOutput.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(".capture-words-button");
    if (!button || button.disabled) return;
    const lineId = button.dataset.lineId;
    if (!lineId) return;

    if (activeLineId === lineId) {
      stopCapture(true);
      return;
    }
    if (activeLineId) stopCapture(true); // cambiar de línea: cerrar la captura anterior primero
    startCaptureForLine(lineId, button);
  });

  return {
    refresh() {
      highlightCurrentWord();
      applyActiveButtonLabel();
    },
    exitCapture: () => stopCapture(false),
    startCapture: startCaptureForLine,
  };
}
