import type { Line } from "../core/project";
import { formatTime } from "./format";

/**
 * Renderiza las líneas analizadas como <li>, cada palabra en su propio <span>.
 * Nodos separados por palabra porque el motor de resaltado (Fase 5+) necesita
 * poder marcar cada uno individualmente. Las líneas con startTime muestran su
 * timestamp junto al texto; con endTime también, muestran el rango completo
 * (ej. "[0:12.4–0:15.1] Primera línea").
 */
export function renderLines(container: HTMLElement, lines: Line[]): void {
  container.innerHTML = "";

  for (const line of lines) {
    const li = document.createElement("li");
    li.dataset.lineId = line.id;

    if (line.startTime !== null) {
      const timestamp = document.createElement("span");
      timestamp.className = "line-timestamp";
      timestamp.textContent =
        line.endTime !== null
          ? `[${formatTime(line.startTime)}–${formatTime(line.endTime)}]`
          : `[${formatTime(line.startTime)}]`;
      li.appendChild(timestamp);
      li.appendChild(document.createTextNode(" "));
    }

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

/**
 * Resalta la <li> de `lineId` como línea objetivo de captura en vivo; `null`
 * quita el resaltado de todas. Se llama tras cada re-render de `container`
 * mientras una captura está activa, porque renderLines() reconstruye el DOM.
 */
export function setTargetLine(container: HTMLElement, lineId: string | null): void {
  for (const li of container.querySelectorAll<HTMLLIElement>("li")) {
    li.classList.toggle("target-line", li.dataset.lineId === lineId);
  }
}

/**
 * Marca la <li> de `lineId` como seleccionada para refinamiento (Fase 7);
 * `null` deselecciona todas. Es un estado visual distinto del resaltado de
 * línea "objetivo" de captura — no deberían confundirse, aunque en teoría
 * podrían coexistir en la misma línea.
 */
export function setSelectedLine(container: HTMLElement, lineId: string | null): void {
  for (const li of container.querySelectorAll<HTMLLIElement>("li")) {
    li.classList.toggle("selected-line", li.dataset.lineId === lineId);
  }
}
