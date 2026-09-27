import type { AudioPlayer } from "../audio/player";
import { formatTime } from "./format";

const SUPPORTED_EXTENSIONS = [".mp3", ".wav", ".ogg"];

interface AudioLoaderOptions {
  input: HTMLInputElement;
  status: HTMLElement;
  player: AudioPlayer;
  onLoaded: (file: File, duration: number) => void;
  onLoadStart: () => void;
}

export function setupAudioLoader({ input, status, player, onLoaded, onLoadStart }: AudioLoaderOptions): void {
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;

    const name = file.name.toLowerCase();
    if (!SUPPORTED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
      status.textContent = `Formato no soportado: ${file.name}. Usá mp3, wav u ogg.`;
      return;
    }

    onLoadStart();
    status.textContent = `Cargando ${file.name}…`;
    try {
      const duration = await player.load(file);
      status.textContent = `${file.name} — ${formatTime(duration)}`;
      onLoaded(file, duration);
    } catch (error) {
      // Una carga reemplazada por otra más nueva rechaza con AbortError: no es un fallo.
      if (error instanceof DOMException && error.name === "AbortError") return;
      status.textContent = `No se pudo cargar ${file.name}: ${(error as Error).message}`;
    }
  });
}
