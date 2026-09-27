import "./style.css";
import { AudioPlayer } from "./audio/player";
import { renderLayout } from "./ui/layout";
import { setupAudioLoader } from "./ui/audioLoader";
import { setupPlayerControls } from "./ui/playerControls";
import { setupLyricsInput } from "./ui/lyricsInput";

const app = document.querySelector<HTMLDivElement>("#app")!;
const els = renderLayout(app);

const player = new AudioPlayer(els.waveform);

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
  onLoaded: () => controls.setEnabled(true),
});

player.onError((error) => {
  els.audioStatus.textContent = `Error de audio: ${error.message}`;
  controls.setEnabled(false);
});

setupLyricsInput({ input: els.lyricsInput });
