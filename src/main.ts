import "./style.css";
import { AudioPlayer } from "./audio/player";
import { History } from "./core/history";
import { createProject, type HistoryEntry, type Project } from "./core/project";
import { parseLyrics } from "./core/parser";
import {
  dismissCalibrationSuggestion,
  exportProject,
  hasUnsavedChanges,
  hasUserSettings,
  importProject,
  isCalibrationSuggestionDismissed,
  loadProject,
  loadUserSettings,
  markSaved,
  markUnsaved,
  saveProject,
  saveUserSettings,
} from "./core/storage";
import { renderLayout } from "./ui/layout";
import { setupAudioLoader } from "./ui/audioLoader";
import { setupPlayerControls } from "./ui/playerControls";
import { setupLyricsInput } from "./ui/lyricsInput";
import { renderLines } from "./ui/linesPreview";
import { calibrationButtonLabel, openCalibrationModal } from "./ui/calibration";
import { setupTapSync } from "./ui/tapSync";

const app = document.querySelector<HTMLDivElement>("#app")!;
const els = renderLayout(app);

const player = new AudioPlayer(els.waveform);
const history = new History<HistoryEntry>();

// Estado simple, sin reducer: cada acción reasigna `project` a un objeto nuevo
// (nunca lo muta), así los `before`/`after` guardados en el historial quedan
// intactos.
let project: Project | null = null;
let loadedAudio: { fileName: string; duration: number } | null = null;

const controls = setupPlayerControls({
  player,
  playButton: els.playButton,
  speedSelect: els.speedSelect,
  zoomInButton: els.zoomInButton,
  zoomOutButton: els.zoomOutButton,
  timeDisplay: els.timeDisplay,
  waveform: els.waveform,
});

const tapSyncControls = setupTapSync({
  startButton: els.tapSyncButton,
  player,
  linesOutput: els.linesOutput,
  getLines: () => project?.lines ?? [],
  getLatencyOffsetMs: () => userSettings.latencyOffsetMs,
  onTap: (lineId, startTime) => {
    history.push({
      type: "setTimestamp",
      before: { lineId, startTime: null },
      after: { lineId, startTime },
      timestamp: Date.now(),
    });
    setLineStartTime(lineId, startTime);
  },
});

function updateTapSyncButton(): void {
  tapSyncControls.setEnabled(!!project && project.lines.length > 0 && !!loadedAudio);
}

setupAudioLoader({
  input: els.audioInput,
  status: els.audioStatus,
  player,
  onLoadStart: () => controls.setEnabled(false),
  onLoaded: (file, duration) => {
    controls.setEnabled(true);
    loadedAudio = { fileName: file.name, duration };
    updateTapSyncButton();
  },
});

player.onError((error) => {
  els.audioStatus.textContent = `Error de audio: ${error.message}`;
  controls.setEnabled(false);
});

function updateProjectButton(): void {
  els.exportButton.disabled = !project;
}

/** Reemplaza el Project entero y refleja el resultado en la UI. Cualquier captura en curso
 * queda invalidada (los índices ya no corresponden a las mismas líneas). */
function applyProject(next: Project | null): void {
  tapSyncControls.exitCapture();
  project = next;
  renderLines(els.linesOutput, project?.lines ?? []);
  updateProjectButton();
  updateTapSyncButton();
}

/** Actualiza el startTime de una sola línea sin tocar el resto (usado por la captura en
 * vivo y por undo/redo de "setTimestamp") — no interrumpe una captura en curso. */
function setLineStartTime(lineId: string, startTime: number | null): void {
  if (!project) return;
  project = {
    ...project,
    lines: project.lines.map((line) => (line.id === lineId ? { ...line, startTime } : line)),
  };
  renderLines(els.linesOutput, project.lines);
  tapSyncControls.refreshHighlight();
  updateProjectButton();
  saveProject(project);
  markUnsaved();
}

const lyricsControls = setupLyricsInput({
  input: els.lyricsInput,
  analyzeButton: els.analyzeButton,
  onAnalyze: (text) => {
    const lines = parseLyrics(text);
    const before = project;
    const after = createProject(
      loadedAudio?.fileName ?? project?.audioFileName ?? "",
      loadedAudio?.duration ?? project?.duration ?? 0,
      lines,
    );
    history.push({ type: "createProject", before, after, timestamp: Date.now() });
    applyProject(after);
    saveProject(after);
    markUnsaved();
  },
});

// --- Undo/redo ---

function applyHistoryEntry(entry: HistoryEntry, side: "before" | "after"): void {
  if (entry.type === "setTimestamp") {
    const { lineId, startTime } = entry[side] as { lineId: string; startTime: number | null };
    setLineStartTime(lineId, startTime);
    return;
  }

  const state = entry[side] as Project | null;
  applyProject(state);
  if (state) saveProject(state);
  markUnsaved();
}

document.addEventListener("keydown", (event) => {
  // El textarea de letra usa el undo/redo nativo del navegador, no el del historial de la app.
  if (event.target === els.lyricsInput) return;

  const isCtrlOrCmd = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (!isCtrlOrCmd || (key !== "z" && key !== "y")) return;

  const isRedo = key === "y" || (key === "z" && event.shiftKey);
  const isUndo = key === "z" && !event.shiftKey;

  if (isUndo) {
    event.preventDefault();
    const entry = history.undo();
    if (entry) applyHistoryEntry(entry, "before");
  } else if (isRedo) {
    event.preventDefault();
    const entry = history.redo();
    if (entry) applyHistoryEntry(entry, "after");
  }
});

// --- Exportar / importar proyecto ---

els.exportButton.addEventListener("click", () => {
  if (!project) return;
  exportProject(project);
  markSaved();
  els.projectStatus.textContent = "Proyecto exportado.";
});

els.importInput.addEventListener("change", async () => {
  const file = els.importInput.files?.[0];
  els.importInput.value = ""; // permite reimportar el mismo archivo dos veces seguidas
  if (!file) return;

  try {
    const imported = await importProject(file);
    const before = project;
    history.push({ type: "createProject", before, after: imported, timestamp: Date.now() });
    applyProject(imported);
    lyricsControls.setText(imported.lines.map((line) => line.text).join("\n"));
    saveProject(imported);
    // El estado importado coincide con un .json real; recién se vuelve "sin guardar"
    // si se lo modifica después.
    markSaved();
    els.projectStatus.textContent = `Proyecto importado desde ${file.name}.`;
  } catch (error) {
    els.projectStatus.textContent = `No se pudo importar el proyecto: ${(error as Error).message}.`;
  }
});

// --- Restaurar autosave al iniciar ---

const restored = loadProject();
if (restored) {
  applyProject(restored);
  lyricsControls.setText(restored.lines.map((line) => line.text).join("\n"));
  els.audioStatus.textContent =
    "Se restauró tu letra sincronizada — volvé a cargar el archivo de audio para continuar.";
}

// --- Advertencia nativa al cerrar/recargar con cambios sin exportar ---

window.addEventListener("beforeunload", (event) => {
  if (!hasUnsavedChanges()) return;
  event.preventDefault();
  event.returnValue = "";
});

// --- Calibración de latencia ---

let userSettings = loadUserSettings();

function updateCalibrateButton(): void {
  els.calibrateButton.textContent = calibrationButtonLabel(hasUserSettings() ? userSettings.latencyOffsetMs : null);
}
updateCalibrateButton();

function openCalibration(): void {
  openCalibrationModal({
    onSave: (latencyOffsetMs) => {
      userSettings = { latencyOffsetMs };
      saveUserSettings(userSettings);
      updateCalibrateButton();
    },
  });
}

els.calibrateButton.addEventListener("click", openCalibration);

// Sugerencia no bloqueante la primera vez que nunca se calibró. Si se descarta, no insiste
// en cada carga (el botón "Calibrar" de arriba sigue disponible siempre).
if (!hasUserSettings() && !isCalibrationSuggestionDismissed()) {
  els.suggestionBanner.hidden = false;
}

els.suggestionCalibrateButton.addEventListener("click", () => {
  dismissCalibrationSuggestion();
  els.suggestionBanner.hidden = true;
  openCalibration();
});

els.suggestionDismissButton.addEventListener("click", () => {
  dismissCalibrationSuggestion();
  els.suggestionBanner.hidden = true;
});
