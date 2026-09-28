import type { AudioPlayer } from "../audio/player";
import type { Project } from "../core/project";
import { getActiveState, getRenderableLines, type RenderableLine } from "../render/highlighter";

export interface PreviewOptions {
  output: HTMLElement;
  player: AudioPlayer;
  /** Se llama en cada tick: el Project se reemplaza en cada edición, no se guarda una referencia. */
  getProject: () => Project | null;
}

export interface PreviewControls {
  /** Re-renderiza con el tiempo actual del player. Llamar tras cualquier cambio del Project:
   * con el audio en pausa no hay ticks, y el preview quedaría mostrando el estado viejo. */
  refresh(): void;
}

type WordState = "sung" | "active" | "upcoming";

/** Estado de cada palabra de la línea activa. Con una palabra activa se compara por índice;
 * en un hueco entre palabras (wordIndex -1) se compara por tiempo, para que las ya cantadas
 * no vuelvan a verse como "por venir" hasta que arranque la siguiente. */
function getWordStates(line: RenderableLine, wordIndex: number, currentTimeSec: number): WordState[] {
  return line.words.map((word, index) => {
    if (wordIndex >= 0) return index < wordIndex ? "sung" : index === wordIndex ? "active" : "upcoming";
    return word.endTime <= currentTimeSec ? "sung" : "upcoming";
  });
}

export function setupPreview({ output, player, getProject }: PreviewOptions): PreviewControls {
  // Los ticks llegan ~60 veces por segundo; solo se toca el DOM cuando cambia lo que se ve.
  let lastKey: string | null = null;

  function render(force: boolean): void {
    const project = getProject();
    const lines = project ? getRenderableLines(project) : [];
    const currentTimeSec = player.getCurrentTime();
    const { lineIndex, wordIndex } = getActiveState(lines, currentTimeSec);
    const line = lineIndex >= 0 ? lines[lineIndex] : null;
    const wordStates = line && line.words.length > 0 ? getWordStates(line, wordIndex, currentTimeSec) : [];

    const key = line ? `${line.id}|${wordStates.join(",")}` : "";
    if (!force && key === lastKey) return;
    lastKey = key;

    output.replaceChildren();
    output.classList.toggle("preview-idle", !line);

    if (!line) {
      output.textContent = "—";
      return;
    }

    if (wordStates.length === 0) {
      const span = document.createElement("span");
      span.className = "preview-line-active";
      span.textContent = line.text;
      output.append(span);
      return;
    }

    line.words.forEach((word, index) => {
      const span = document.createElement("span");
      span.className = `preview-word preview-word-${wordStates[index]}`;
      span.textContent = word.text;
      output.append(span, " ");
    });
  }

  player.onTimeUpdate(() => render(false));
  render(true);

  return { refresh: () => render(true) };
}
