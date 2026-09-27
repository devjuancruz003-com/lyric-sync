import "./style.css";
import { AudioPlayer } from "./audio/player";
import { createProject, type Project } from "./core/project";
import { parseLyrics } from "./core/parser";
import { renderLayout } from "./ui/layout";
import { setupAudioLoader } from "./ui/audioLoader";
import { setupPlayerControls } from "./ui/playerControls";
import { setupLyricsInput } from "./ui/lyricsInput";
import { renderLines } from "./ui/linesPreview";

const app = document.querySelector<HTMLDivElement>("#app")!;
const els = renderLayout(app);

const player = new AudioPlayer(els.waveform);

// Estado simple, sin historial todavía (eso es la Fase 4).
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

setupAudioLoader({
  input: els.audioInput,
  status: els.audioStatus,
  player,
  onLoadStart: () => controls.setEnabled(false),
  onLoaded: (file, duration) => {
    controls.setEnabled(true);
    loadedAudio = { fileName: file.name, duration };
  },
});

player.onError((error) => {
  els.audioStatus.textContent = `Error de audio: ${error.message}`;
  controls.setEnabled(false);
});

setupLyricsInput({
  input: els.lyricsInput,
  analyzeButton: els.analyzeButton,
  onAnalyze: (text) => {
    const lines = parseLyrics(text);
    project = createProject(loadedAudio?.fileName ?? "", loadedAudio?.duration ?? 0, lines);
    renderLines(els.linesOutput, project.lines);
  },
});
