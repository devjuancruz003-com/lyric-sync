import type { Line, Project } from "../core/project";
import type { WordEdge } from "../sync/wordTimeline";

/** Misma clase que activan las capturas (de líneas y de palabras) mientras están en curso. */
const CAPTURE_ACTIVE_CLASS = "tap-sync-active";

export interface SelectedLinePanelOptions {
  panel: HTMLElement;
  /** Lista de líneas: cada re-render (cambio del Project, del modo, etc.) refresca el panel. */
  list: HTMLElement;
  getProject: () => Project | null;
  getSelectedLineId: () => string | null;
  /** Re-graba las palabras de la línea: limpiarlas (un solo paso de historial) y arrancar la captura. */
  onRecord: (lineId: string) => void;
  /** Palabra seleccionada en la vista de palabras (Fase 10d-2, ui/wordTimeline.ts), para
   * resaltar su fila y marcar el borde activo — null si esa vista no está activa o no hay
   * ninguna elegida. */
  getSelectedWord?: () => { wordId: string; edge: WordEdge } | null;
  /** Click en la fila de una palabra: la selecciona en la vista de palabras. */
  onSelectWord?: (wordId: string) => void;
}

export interface SelectedLinePanelControls {
  /** Recalcula el panel con el Project y la selección actuales. */
  refresh(): void;
}

function formatSeconds(value: number | null): string {
  return value === null ? "—" : value.toFixed(3);
}

/** Por qué el botón está deshabilitado, o null si se puede usar. */
function getDisabledReason(line: Line, captureActive: boolean): string | null {
  if (captureActive) return "Hay una captura activa";
  if (line.startTime === null || line.endTime === null) return "Esta línea todavía no tiene rango";
  if (line.words.length === 0) return "Esta línea no tiene palabras";
  return null;
}

/** Si corresponde mostrar el aviso de que faltan palabras por capturar para poder ajustarlas en
 * la vista de palabras (Fase 10d-2) — solo en modo palabra, con la línea con rango propio y
 * alguna palabra sin capturar, y sin una captura en curso (ahí ya se explica sola). */
function getWordViewHint(line: Line, syncMode: Project["syncMode"], captureActive: boolean): string | null {
  if (syncMode !== "word" || captureActive) return null;
  if (line.startTime === null || line.endTime === null || line.words.length === 0) return null;
  const allCaptured = line.words.every((word) => word.startTime !== null && word.endTime !== null);
  return allCaptured ? null : "Capturá las palabras primero para poder ajustarlas acá.";
}

/**
 * Panel "Línea seleccionada" (Fase 10c): en modo palabra y con una línea seleccionada, muestra
 * su texto, su rango, sus palabras con inicio–fin y el botón para (re)grabarlas. Oculto en
 * cualquier otro caso (sin recuadro vacío). La selección es la de ui/timeline.ts (click en la
 * lista o en la region); el panel no crea otro mecanismo. Con todas las palabras capturadas
 * (vista de palabras, Fase 10d-2), cada fila es además clickeable para seleccionar esa palabra,
 * y la fila de la seleccionada se resalta con su borde activo marcado.
 */
export function setupSelectedLinePanel({
  panel,
  list,
  getProject,
  getSelectedLineId,
  onRecord,
  getSelectedWord,
  onSelectWord,
}: SelectedLinePanelOptions): SelectedLinePanelControls {
  const text = panel.querySelector<HTMLElement>(".selected-line-text")!;
  const range = panel.querySelector<HTMLElement>(".selected-line-range")!;
  const wordViewHint = panel.querySelector<HTMLElement>(".selected-line-word-view-hint")!;
  const words = panel.querySelector<HTMLOListElement>(".selected-line-words")!;
  const button = panel.querySelector<HTMLButtonElement>(".selected-line-record")!;
  const hint = panel.querySelector<HTMLElement>(".selected-line-hint")!;

  function refresh(): void {
    const project = getProject();
    const lineId = getSelectedLineId();
    const line = project?.syncMode === "word" && lineId ? project.lines.find((l) => l.id === lineId) : undefined;
    panel.hidden = !line;
    if (!line || !project) {
      panel.removeAttribute("data-line-id");
      return;
    }

    const captureActive = document.body.classList.contains(CAPTURE_ACTIVE_CLASS);

    panel.dataset.lineId = line.id;
    text.textContent = line.text;
    range.textContent = `Rango: ${line.startTime === null && line.endTime === null ? "—" : `${formatSeconds(line.startTime)}–${formatSeconds(line.endTime)} s`}`;

    const viewHint = getWordViewHint(line, project.syncMode, captureActive);
    wordViewHint.textContent = viewHint ?? "";
    wordViewHint.hidden = viewHint === null;

    const selectedWord = getSelectedWord?.();

    // El botón y su contenedor persisten entre refrescos (no se recrean) para no perder el foco;
    // solo la lista de palabras se reconstruye.
    words.replaceChildren(
      ...line.words.map((word) => {
        const item = document.createElement("li");
        item.dataset.wordId = word.id;
        const isSelected = selectedWord?.wordId === word.id;
        item.classList.toggle("selected-word", isSelected);
        if (onSelectWord) item.classList.add("selected-word-clickable");

        const label = document.createElement("span");
        label.className = "selected-word-text";
        label.textContent = word.text;

        const startSpan = document.createElement("span");
        startSpan.className = "selected-word-edge";
        startSpan.classList.toggle("active-edge", isSelected && selectedWord?.edge === "start");
        startSpan.textContent = formatSeconds(word.startTime);

        const endSpan = document.createElement("span");
        endSpan.className = "selected-word-edge";
        endSpan.classList.toggle("active-edge", isSelected && selectedWord?.edge === "end");
        endSpan.textContent = formatSeconds(word.endTime);

        const timing = document.createElement("span");
        timing.className = "selected-word-range";
        timing.append(startSpan, "–", endSpan, " s");

        item.append(label, " ", timing);
        return item;
      }),
    );

    const anyCaptured = line.words.some((word) => word.startTime !== null);
    button.textContent = anyCaptured ? "Re-grabar palabras" : "Grabar palabras";

    const reason = getDisabledReason(line, captureActive);
    button.disabled = reason !== null;
    hint.textContent = reason ?? "";
    hint.hidden = reason === null;
    if (reason) button.setAttribute("aria-describedby", hint.id);
    else button.removeAttribute("aria-describedby");
  }

  button.addEventListener("click", () => {
    const lineId = panel.dataset.lineId;
    if (!lineId || button.disabled) return;
    // Sin foco en el botón: si no, Espacio (que marca palabras) reactivaría el botón.
    button.blur();
    onRecord(lineId);
  });

  words.addEventListener("click", (event) => {
    if (!onSelectWord) return;
    const wordId = (event.target as HTMLElement).closest<HTMLElement>("li")?.dataset.wordId;
    if (wordId) onSelectWord(wordId);
  });

  // Mismos puntos que ya re-renderizan la lista (cambios del Project, del modo, deshacer/rehacer)
  // y el inicio/fin de cualquier captura (la clase en <body> deshabilita el botón).
  new MutationObserver(refresh).observe(list, { childList: true });
  new MutationObserver(refresh).observe(document.body, { attributes: true, attributeFilter: ["class"] });

  return { refresh };
}
