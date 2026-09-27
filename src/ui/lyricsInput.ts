interface LyricsInputOptions {
  input: HTMLTextAreaElement;
  onChange?: (text: string) => void;
}

/** Textarea de letra en texto plano. El parseo en líneas/palabras llega en la Fase 3. */
export function setupLyricsInput({ input, onChange }: LyricsInputOptions): void {
  input.addEventListener("input", () => onChange?.(input.value));
}
