import type { Line } from "../core/project";

/**
 * Renderiza las líneas analizadas como <li>, cada palabra en su propio <span>.
 * Nodos separados por palabra porque el motor de resaltado (Fase 5+) necesita
 * poder marcar cada uno individualmente.
 */
export function renderLines(container: HTMLElement, lines: Line[]): void {
  container.innerHTML = "";

  for (const line of lines) {
    const li = document.createElement("li");
    li.dataset.lineId = line.id;

    line.words.forEach((word, index) => {
      const span = document.createElement("span");
      span.className = "word";
      span.dataset.wordId = word.id;
      span.textContent = word.text;
      li.appendChild(span);
      if (index < line.words.length - 1) li.appendChild(document.createTextNode(" "));
    });

    container.appendChild(li);
  }
}
