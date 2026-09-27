interface LyricsInputOptions {
  input: HTMLTextAreaElement;
  analyzeButton: HTMLButtonElement;
  onAnalyze: (text: string) => void;
}

export interface LyricsInputControls {
  /** Reemplaza el texto del textarea de forma programática (p. ej. al restaurar o importar). */
  setText(text: string): void;
}

/** Textarea de letra en texto plano + botón para analizarla (Fase 3). */
export function setupLyricsInput({ input, analyzeButton, onAnalyze }: LyricsInputOptions): LyricsInputControls {
  const updateButtonState = () => {
    analyzeButton.disabled = input.value.trim() === "";
  };

  input.addEventListener("input", updateButtonState);
  analyzeButton.addEventListener("click", () => onAnalyze(input.value));

  updateButtonState();

  return {
    setText(text) {
      input.value = text;
      updateButtonState();
    },
  };
}
