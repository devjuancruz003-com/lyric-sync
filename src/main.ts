import "./style.css";
import { AudioPlayer } from "./audio/player";
import { History } from "./core/history";
import {
  computeWordTap,
  createProject,
  normalizeProject,
  type HistoryEntry,
  type Project,
  type WordTimingPayload,
} from "./core/project";
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
import { setupTimeline } from "./ui/timeline";
import { setupWordSync } from "./ui/wordSync";
import { setupPreview } from "./ui/preview";
import { setupFollowPlayback } from "./ui/followPlayback";
import { setupTabs } from "./ui/tabs";

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
    const currentEndTime = project?.lines.find((line) => line.id === lineId)?.endTime ?? null;
    commitLineTiming(lineId, startTime, currentEndTime);
  },
});

const timelineControls = setupTimeline({
  refineButton: els.refineButton,
  refineStatus: els.refineStatus,
  player,
  linesOutput: els.linesOutput,
  getLines: () => project?.lines ?? [],
  getAudioDuration: () => player.getDuration() || project?.duration || 0,
  onLineTimingChange: commitLineTiming,
});

const wordSyncControls = setupWordSync({
  linesOutput: els.linesOutput,
  player,
  getLines: () => project?.lines ?? [],
  getLatencyOffsetMs: () => userSettings.latencyOffsetMs,
  onWordTap: (lineId, wordId, startTime) => {
    const currentEndTime =
      project?.lines.find((line) => line.id === lineId)?.words.find((word) => word.id === wordId)?.endTime ?? null;
    commitWordTiming(lineId, wordId, startTime, currentEndTime);
  },
});

const previewControls = setupPreview({
  output: els.previewOutput,
  player,
  getProject: () => project,
});

const followControls = setupFollowPlayback({
  scroller: els.linesScroll,
  list: els.linesOutput,
  checkbox: els.followCheckbox,
  player,
  getProject: () => project,
});

const tabs = setupTabs({
  tabList: els.tabList,
  // Con la pestaña oculta la lista no tiene layout: al mostrarla, llevar a la vista lo actual.
  onChange: (id) => {
    if (id === "sync") followControls.scrollToCurrent();
  },
});

els.goPrepareButton.addEventListener("click", () => tabs.select("prepare"));

/** Estado vacío de la lista de líneas (sin letra analizada todavía). */
function updateLinesEmptyState(): void {
  els.linesEmpty.hidden = !!project && project.lines.length > 0;
}

/** El preview aplica siempre que haya un Project con audio cargado (no solo durante captura). */
function updatePreview(): void {
  els.previewPanel.hidden = !(project && loadedAudio);
  previewControls.refresh();
}

function updateTapSyncButton(): void {
  tapSyncControls.setEnabled(!!project && project.lines.length > 0 && !!loadedAudio);
}

function updateTimelineButton(): void {
  timelineControls.setEnabled(!!project && project.lines.some((line) => line.startTime !== null));
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
    updatePreview();
    // Las regions creadas antes de cargar audio (ej. al restaurar un proyecto) quedan
    // registradas pero wavesurfer.js no siempre las inserta en el DOM cuando el audio
    // termina de cargar después — re-renderizarlas acá, ya con audio real, es confiable.
    player.renderLineRegions(project?.lines ?? []);
  },
});

player.onError((error) => {
  els.audioStatus.textContent = `Error de audio: ${error.message}`;
  controls.setEnabled(false);
});

function updateProjectButton(): void {
  els.exportButton.disabled = !project;
}

/** Reemplaza el Project entero y refleja el resultado en la UI (líneas + regions). Cualquier
 * captura o selección en curso queda invalidada (ya no corresponden a las mismas líneas). */
function applyProject(next: Project | null): void {
  tapSyncControls.exitCapture();
  timelineControls.exitSelection();
  wordSyncControls.exitCapture();
  project = next;
  renderLines(els.linesOutput, project?.lines ?? [], project?.syncMode ?? "line");
  player.renderLineRegions(project?.lines ?? []);
  updateProjectButton();
  updateTapSyncButton();
  updateTimelineButton();
  updateSyncModeSelect();
  updateLinesEmptyState();
  updatePreview();
}

/** Actualiza start/endTime de una sola línea sin tocar el resto (usado por la captura en
 * vivo, la derivación automática de endTime, el nudging y el arrastre de regions, y por
 * undo/redo de "setTimestamp") — no interrumpe una captura ni una selección en curso. */
function setLineTimestamps(lineId: string, startTime: number | null, endTime: number | null): void {
  if (!project) return;
  project = {
    ...project,
    lines: project.lines.map((line) => (line.id === lineId ? { ...line, startTime, endTime } : line)),
  };
  renderLines(els.linesOutput, project.lines, project.syncMode);
  tapSyncControls.refreshHighlight();
  timelineControls.refreshSelectionHighlight();
  wordSyncControls.refresh();
  if (startTime !== null && endTime !== null) player.updateRegion(lineId, startTime, endTime);
  updateProjectButton();
  updateTimelineButton();
  previewControls.refresh();
  saveProject(project);
  markUnsaved();
}

/** Empuja un HistoryEntry "setTimestamp" para una línea y aplica el cambio — usado por el tap
 * en vivo, la derivación automática de endTime, el nudging por teclado y el arrastre de regions. */
function commitLineTiming(lineId: string, startTime: number | null, endTime: number | null): void {
  if (!project) return;
  const current = project.lines.find((line) => line.id === lineId);
  if (!current) return;
  history.push({
    type: "setTimestamp",
    before: { lineId, startTime: current.startTime, endTime: current.endTime },
    after: { lineId, startTime, endTime },
    timestamp: Date.now(),
  });
  setLineTimestamps(lineId, startTime, endTime);
}

/** Análogo a setLineTimestamps() pero para una palabra dentro de una línea (Fase 9) — no
 * toca el timing de la línea misma. Además de la palabra, aplica en el mismo paso los endTime
 * derivados de otras palabras (`derived`), si los hay. */
function setWordTimestamps({ lineId, wordId, startTime, endTime, derived = [] }: WordTimingPayload): void {
  if (!project) return;
  const derivedEndTimes = new Map(derived.map((entry) => [entry.wordId, entry.endTime]));
  project = {
    ...project,
    lines: project.lines.map((line) =>
      line.id !== lineId
        ? line
        : {
            ...line,
            words: line.words.map((word) => {
              if (word.id === wordId) return { ...word, startTime, endTime };
              return derivedEndTimes.has(word.id) ? { ...word, endTime: derivedEndTimes.get(word.id) ?? null } : word;
            }),
          },
    ),
  };
  renderLines(els.linesOutput, project.lines, project.syncMode);
  wordSyncControls.refresh();
  previewControls.refresh();
  saveProject(project);
  markUnsaved();
}

/** Empuja un HistoryEntry "setWordTimestamp" para una palabra y aplica el cambio — usado por
 * el tap en vivo de palabras. Los endTime derivados (la palabra anterior, o la última de la
 * línea) viajan en el mismo entry, así un Ctrl+Z los deshace junto con la marca. */
function commitWordTiming(lineId: string, wordId: string, startTime: number | null, endTime: number | null): void {
  const line = project?.lines.find((candidate) => candidate.id === lineId);
  if (!line) return;
  const change = computeWordTap(line, wordId, startTime, endTime);
  if (!change) return;
  history.push({ type: "setWordTimestamp", before: change.before, after: change.after, timestamp: Date.now() });
  setWordTimestamps(change.after);
}

function updateSyncModeSelect(): void {
  els.syncModeSelect.disabled = !project;
  els.syncModeSelect.value = project?.syncMode ?? "line";
}

/** Cambia Project.syncMode y re-renderiza (los botones "Capturar palabras" por línea solo
 * aparecen en modo "word"). Sale de cualquier captura de palabras en curso. */
function setSyncMode(mode: Project["syncMode"]): void {
  if (!project) return;
  wordSyncControls.exitCapture();
  project = { ...project, syncMode: mode };
  renderLines(els.linesOutput, project.lines, project.syncMode);
  updateSyncModeSelect();
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
    if (after.lines.length > 0) tabs.select("sync");
  },
});

els.syncModeSelect.addEventListener("change", () => {
  if (!project) return;
  const after = els.syncModeSelect.value as Project["syncMode"];
  const before = project.syncMode;
  if (before === after) return;
  history.push({ type: "setSyncMode", before, after, timestamp: Date.now() });
  setSyncMode(after);
});

// --- Undo/redo ---

function applyHistoryEntry(entry: HistoryEntry, side: "before" | "after"): void {
  if (entry.type === "setTimestamp") {
    const { lineId, startTime, endTime } = entry[side] as {
      lineId: string;
      startTime: number | null;
      endTime: number | null;
    };
    setLineTimestamps(lineId, startTime, endTime);
    return;
  }

  if (entry.type === "setWordTimestamp") {
    setWordTimestamps(entry[side] as WordTimingPayload);
    return;
  }

  if (entry.type === "setSyncMode") {
    setSyncMode(entry[side] as Project["syncMode"]);
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
    const imported = normalizeProject(await importProject(file));
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

const stored = loadProject();
const restored = stored && normalizeProject(stored);
if (restored) {
  // Corrección silenciosa de datos (sin HistoryEntry ni markUnsaved): se persiste el resultado
  // solo si cambió algo, para no tocar lastModified en cada carga.
  if (restored !== stored) saveProject(restored);
  applyProject(restored);
  lyricsControls.setText(restored.lines.map((line) => line.text).join("\n"));
  els.audioStatus.textContent =
    "Se restauró tu letra sincronizada — volvé a cargar el archivo de audio para continuar.";
}
updateLinesEmptyState();

// Pestaña inicial: con líneas restauradas se abre directo en "Sincronizar".
tabs.select(restored && restored.lines.length > 0 ? "sync" : "prepare");

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
