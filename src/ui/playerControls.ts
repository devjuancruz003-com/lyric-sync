import type { AudioPlayer } from "../audio/player";
import { formatTime } from "./format";

const KEYBOARD_SEEK_STEP = 5;

interface PlayerControlsOptions {
  player: AudioPlayer;
  playButton: HTMLButtonElement;
  speedSelect: HTMLSelectElement;
  zoomInButton: HTMLButtonElement;
  zoomOutButton: HTMLButtonElement;
  timeDisplay: HTMLElement;
  waveform: HTMLElement;
}

export interface PlayerControls {
  setEnabled(enabled: boolean): void;
}

export function setupPlayerControls({
  player,
  playButton,
  speedSelect,
  zoomInButton,
  zoomOutButton,
  timeDisplay,
  waveform,
}: PlayerControlsOptions): PlayerControls {
  let enabled = false;

  const renderZoom = () => {
    zoomInButton.disabled = !enabled || !player.canZoomIn();
    zoomOutButton.disabled = !enabled || !player.canZoomOut();
  };

  const renderTime = (time: number) => {
    timeDisplay.textContent = `${formatTime(time)} / ${formatTime(player.getDuration())}`;
  };

  const renderPlayState = (playing: boolean) => {
    playButton.textContent = playing ? "Pause" : "Play";
    playButton.setAttribute("aria-pressed", String(playing));
  };

  const togglePlay = () => {
    if (!enabled) return;
    player.togglePlay().catch(() => renderPlayState(false));
  };

  playButton.addEventListener("click", togglePlay);

  speedSelect.addEventListener("change", () => {
    player.setPlaybackRate(Number(speedSelect.value));
  });

  zoomInButton.addEventListener("click", () => {
    player.zoomIn();
    renderZoom();
  });

  zoomOutButton.addEventListener("click", () => {
    player.zoomOut();
    renderZoom();
  });

  // El nivel "ajustado" depende del ancho del contenedor.
  new ResizeObserver(renderZoom).observe(waveform);

  player.onTimeUpdate(renderTime);
  player.onPlayStateChange(renderPlayState);

  // El click en la waveform lo maneja wavesurfer; esto cubre el seek por teclado.
  waveform.addEventListener("keydown", (event) => {
    if (!enabled) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const delta = event.key === "ArrowLeft" ? -KEYBOARD_SEEK_STEP : KEYBOARD_SEEK_STEP;
      player.seek(player.getCurrentTime() + delta);
    }
  });

  // Espacio = play/pause global, salvo que el foco esté en un control que use la tecla.
  document.addEventListener("keydown", (event) => {
    if (event.key !== " " || event.repeat) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, button, [contenteditable]")) return;
    // El modal de calibración y el modo captura también escuchan la espaciadora; no pisarlos.
    if (document.querySelector('[role="dialog"]')) return;
    if (document.body.classList.contains("tap-sync-active")) return;
    event.preventDefault();
    togglePlay();
  });

  return {
    setEnabled(value) {
      enabled = value;
      playButton.disabled = !value;
      speedSelect.disabled = !value;
      if (!value) renderPlayState(false);
      renderTime(value ? player.getCurrentTime() : 0);
      renderZoom();
    },
  };
}
