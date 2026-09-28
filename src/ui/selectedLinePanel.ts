import type { Line, Project } from "../core/project";

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
}

export interface SelectedLinePanelControls {
  /** Recalcula el panel con el Project y la selección actuales. */
  refresh(): void;
}

function formatSeconds(value: number | null): string {
  return value === null ? "—" : value.toFixed(3);
}

function formatRange(start: number | null, end: number | null): string {
  return start === null && end === null ? "—" : `${formatSeconds(start)}–${formatSeconds(end)} s`;
}

/** Por qué el botón está deshabilitado, o null si se puede usar. */
function getDisabledReason(line: Line, captureActive: boolean): string | null {
  if (captureActive) return "Hay una captura activa";
  if (line.startTime === null || line.endTime === null) return "Esta línea todavía no tiene rango";
  if (line.words.length === 0) return "Esta línea no tiene palabras";
  return null;
}

/**
 * Panel "Línea seleccionada" (Fase 10c): en modo palabra y con una línea seleccionada, muestra
 * su texto, su rango, sus palabras con inicio–fin y el botón para (re)grabarlas. Oculto en
 * cualquier otro caso (sin recuadro vacío). La selección es la de ui/timeline.ts (click en la
 * lista o en la region); el panel no crea otro mecanismo.
 */
export function setupSelectedLinePanel({
  panel,
  list,
  getProject,
  getSelectedLineId,
  onRecord,
}: SelectedLinePanelOptions): SelectedLinePanelControls {
  const text = panel.querySelector<HTMLElement>(".selected-line-text")!;
  const range = panel.querySelector<HTMLElement>(".selected-line-range")!;
  const words = panel.querySelector<HTMLOListElement>(".selected-line-words")!;
  const button = panel.querySelector<HTMLButtonElement>(".selected-line-record")!;
  const hint = panel.querySelector<HTMLElement>(".selected-line-hint")!;

  function refresh(): void {
    const project = getProject();
    const lineId = getSelectedLineId();
    const line = project?.syncMode === "word" && lineId ? project.lines.find((l) => l.id === lineId) : undefined;
    panel.hidden = !line;
    if (!line) {
      panel.removeAttribute("data-line-id");
      return;
    }

    panel.dataset.lineId = line.id;
    text.textContent = line.text;
    range.textContent = `Rango: ${formatRange(line.startTime, line.endTime)}`;

    // El botón y su contenedor persisten entre refrescos (no se recrean) para no perder el foco;
    // solo la lista de palabras se reconstruye.
    words.replaceChildren(
      ...line.words.map((word) => {
        const item = document.createElement("li");
        const label = document.createElement("span");
        label.className = "selected-word-text";
        label.textContent = word.text;
        const timing = document.createElement("span");
        timing.className = "selected-word-range";
        timing.textContent = formatRange(word.startTime, word.endTime);
        item.append(label, " ", timing);
        return item;
      }),
    );

    const anyCaptured = line.words.some((word) => word.startTime !== null);
    button.textContent = anyCaptured ? "Re-grabar palabras" : "Grabar palabras";

    const reason = getDisabledReason(line, document.body.classList.contains(CAPTURE_ACTIVE_CLASS));
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

  // Mismos puntos que ya re-renderizan la lista (cambios del Project, del modo, deshacer/rehacer)
  // y el inicio/fin de cualquier captura (la clase en <body> deshabilita el botón).
  new MutationObserver(refresh).observe(list, { childList: true });
  new MutationObserver(refresh).observe(document.body, { attributes: true, attributeFilter: ["class"] });

  return { refresh };
}
