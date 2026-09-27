interface LyricsInputOptions {
  input: HTMLTextAreaElement;
  analyzeButton: HTMLButtonElement;
  onAnalyze: (text: string) => void;
}

/** Textarea de letra en texto plano + botón para analizarla (Fase 3). */
export function setupLyricsInput({ input, analyzeButton, onAnalyze }: LyricsInputOptions): void {
  const updateButtonState = () => {
    analyzeButton.disabled = input.value.trim() === "";
  };

  input.addEventListener("input", updateButtonState);
  analyzeButton.addEventListener("click", () => onAnalyze(input.value));

  updateButtonState();
}
