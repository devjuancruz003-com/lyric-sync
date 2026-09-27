import type { AudioPlayer } from "../audio/player";
import type { Line } from "../core/project";
import { TapSyncSession } from "../sync/tapSync";
import { setTargetLine } from "./linesPreview";

/** Clase en <body> mientras la captura está activa, para que otros listeners globales
 * de teclado (ej. el play/pause de la espaciadora) sepan que deben cederle el paso. */
const CAPTURE_ACTIVE_CLASS = "tap-sync-active";

export interface TapSyncOptions {
  startButton: HTMLButtonElement;
  player: AudioPlayer;
  linesOutput: HTMLElement;
  /** Las líneas del Project actual, leídas en el momento (pueden cambiar entre taps). */
  getLines: () => Line[];
  getLatencyOffsetMs: () => number;
  /** Aplica la marca al estado real (historial, Project, autosave). */
  onTap: (lineId: string, startTime: number) => void;
}

export interface TapSyncControls {
  setEnabled(enabled: boolean): void;
  /** Vuelve a resaltar la línea objetivo actual — llamar tras cualquier re-render de linesOutput mientras se captura. */
  refreshHighlight(): void;
  /** Sale del modo captura si está activa, sin pausar el audio. Seguro de llamar siempre. */
  exitCapture(): void;
}

export function setupTapSync({
  startButton,
  player,
  linesOutput,
  getLines,
  getLatencyOffsetMs,
  onTap,
}: TapSyncOptions): TapSyncControls {
  let session: TapSyncSession | null = null;

  function highlightCurrent(): void {
    const lineId = session && !session.isDone() ? (getLines()[session.getCurrentIndex()]?.id ?? null) : null;
    setTargetLine(linesOutput, lineId);
  }

  function stopCapture(pause: boolean): void {
    if (!session) return;
    session = null;
    document.body.classList.remove(CAPTURE_ACTIVE_CLASS);
    document.removeEventListener("keydown", handleKeydown);
    startButton.textContent = "Iniciar captura";
    setTargetLine(linesOutput, null);
    if (pause) player.pause();
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

    if (!session) return;
    const result = session.markCurrentLine(getLines(), player.getCurrentTime(), getLatencyOffsetMs());
    if (!result) return;

    onTap(result.lineId, result.startTime);
    highlightCurrent();
    // Llegamos a la última línea: cerrar el modo captura solo, sin pausar el audio.
    if (session.isDone()) stopCapture(false);
  }

  function startCapture(): void {
    if (session) return;
    const newSession = new TapSyncSession(getLines());
    if (newSession.isDone()) return; // no queda ninguna línea por marcar

    session = newSession;
    document.body.classList.add(CAPTURE_ACTIVE_CLASS);
    document.addEventListener("keydown", handleKeydown);
    startButton.textContent = "Detener captura";
    // Evita que la espaciadora reactive el propio botón (foco tras el click).
    startButton.blur();
    highlightCurrent();

    if (!player.isPlaying()) player.play().catch(() => {});
  }

  startButton.addEventListener("click", () => {
    if (session) {
      stopCapture(true);
    } else {
      startCapture();
    }
  });

  return {
    setEnabled(enabled) {
      startButton.disabled = !enabled;
      if (!enabled) stopCapture(true);
    },
    refreshHighlight: highlightCurrent,
    exitCapture: () => stopCapture(false),
  };
}
