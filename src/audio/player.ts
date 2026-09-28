import WaveSurfer from "wavesurfer.js";
import RegionsPlugin, { type Region } from "wavesurfer.js/plugins/regions";
import type { Line } from "../core/project";
import { getLineColorIndex, getLineColorVar } from "../core/lineColors";
import type { LineEdge } from "../sync/timeline";
import { WORD_MIN_LENGTH_SEC } from "../sync/wordTimeline";

export type Unsubscribe = () => void;

/** Tope de zoom: 1 px = 1 ms, suficiente para ajustar palabra por palabra. */
export const MAX_PX_PER_SEC = 1000;
const ZOOM_STEP = 2;
/** Debe coincidir con MIN_LINE_LENGTH_SEC en src/sync/timeline.ts. */
const MIN_REGION_LENGTH_SEC = 0.05;

/**
 * Contenido de una region: el número de línea o palabra (1-based, igual al que muestra la
 * lista/el panel — `label`, si viene, agrega el texto de la palabra), con un fondo oscuro
 * translúcido fijo (no la paleta) para leerse igual sobre cualquiera de los 6 colores y en los
 * dos temas — el color nunca es la única forma de identificar la línea/palabra. Estilos en línea
 * (no una clase de style.css): wavesurfer.js v8 renderiza dentro de un shadow root propio, que
 * una hoja de estilos externa no puede atravesar con selectores de clase/atributo (una custom
 * property como `var(--accent)` sí cruza el shadow boundary, un `.region-number {}` no) — mismo
 * enfoque para las regions de palabra de la Fase 10d-2, no uno nuevo.
 */
function createRegionNumber(position: number, label?: string): HTMLElement {
  const span = document.createElement("span");
  span.textContent = label ? `${position + 1} ${label}` : String(position + 1);
  Object.assign(span.style, {
    display: "inline-block",
    margin: "2px",
    padding: "1px 5px",
    background: "rgba(0, 0, 0, 0.55)",
    color: "#fff",
    fontSize: "11px",
    fontVariantNumeric: "tabular-nums",
    lineHeight: "1.4",
    borderRadius: "3px",
    whiteSpace: "nowrap",
  });
  return span;
}

export interface RegionUpdate {
  lineId: string;
  start: number;
  end: number;
}

/**
 * Wrapper sobre wavesurfer.js. El resto de la app habla con esta clase y no
 * con wavesurfer directamente, para poder cambiar/extender el backend de audio
 * (calibración de latencia, regions, etc.) sin tocar la UI.
 */
export class AudioPlayer {
  private readonly ws: WaveSurfer;
  private readonly regions: ReturnType<typeof RegionsPlugin.create>;
  private readonly container: HTMLElement;
  private playbackRate = 1;
  /** 0 = ajustado al ancho del contenedor (toda la onda visible, sin scroll). */
  private pxPerSec = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.ws = WaveSurfer.create({
      container,
      height: 128,
      waveColor: "#8a8fa3",
      progressColor: "#5b6cff",
      cursorColor: "#ff4f79",
      cursorWidth: 2,
      normalize: true,
      dragToSeek: true,
    });
    this.regions = this.ws.registerPlugin(RegionsPlugin.create());
  }

  /** Carga un archivo de audio local. Resuelve con la duración en segundos. */
  async load(file: Blob): Promise<number> {
    // Cada archivo nuevo arranca ajustado al ancho.
    this.pxPerSec = 0;
    this.ws.setOptions({ minPxPerSec: 0 });
    await this.ws.loadBlob(file);
    return this.ws.getDuration();
  }

  play(): Promise<void> {
    return this.ws.play();
  }

  pause(): void {
    this.ws.pause();
  }

  togglePlay(): Promise<void> {
    return this.ws.playPause();
  }

  /** Salta a `time` (segundos), acotado a [0, duración]. */
  seek(time: number): void {
    const duration = this.ws.getDuration();
    if (!duration) return;
    this.ws.setTime(Math.min(Math.max(time, 0), duration));
  }

  setPlaybackRate(rate: number): void {
    this.playbackRate = rate;
    this.ws.setPlaybackRate(rate);
    // Cargar un src nuevo resetea playbackRate a defaultPlaybackRate; fijarlo
    // hace que la velocidad elegida sobreviva al cambio de archivo.
    const media = this.ws.getMediaElement();
    if (media) media.defaultPlaybackRate = rate;
  }

  getPlaybackRate(): number {
    return this.playbackRate;
  }

  /** px/s con los que la onda completa entra justo en el contenedor. */
  private getFitPxPerSec(): number {
    const duration = this.ws.getDuration();
    return duration ? this.container.clientWidth / duration : 0;
  }

  /**
   * Fija el zoom en px/s, acotado a [ajustado, MAX_PX_PER_SEC]. Cualquier valor
   * igual o menor al ajustado vuelve al modo "toda la onda visible".
   */
  setZoom(pxPerSec: number): void {
    if (!this.ws.getDuration()) return;
    const fit = this.getFitPxPerSec();
    this.pxPerSec = pxPerSec <= fit ? 0 : Math.min(pxPerSec, MAX_PX_PER_SEC);
    this.ws.zoom(this.pxPerSec);
    // Mantener el cursor centrado en la vista tras cambiar la escala.
    if (this.pxPerSec > 0) {
      const visibleSeconds = this.container.clientWidth / this.pxPerSec;
      this.ws.setScrollTime(Math.max(0, this.ws.getCurrentTime() - visibleSeconds / 2));
    }
  }

  /**
   * Nivel de zoom y posición de scroll actuales (el tiempo que queda al borde izquierdo de lo
   * visible), para guardarlos antes de entrar a la vista de palabras (Fase 10d-2) y
   * restaurarlos con restoreViewState() al salir — no solo el zoom: sin el scroll, volver a un
   * nivel de zoom acotado pero con el scroll donde lo dejó el rango de la línea (mucho más
   * angosto) puede dejar la waveform mirando un tramo sin nada dibujado.
   */
  getViewState(): { pxPerSec: number; scrollTime: number } {
    const effectivePxPerSec = this.pxPerSec || this.getFitPxPerSec();
    return { pxPerSec: this.pxPerSec, scrollTime: effectivePxPerSec ? this.ws.getScroll() / effectivePxPerSec : 0 };
  }

  /** Vuelve al zoom y scroll guardados con getViewState() — a diferencia de setZoom(), que
   * centra el scroll en el cursor de reproducción, acá se restaura la posición exacta de antes. */
  restoreViewState(state: { pxPerSec: number; scrollTime: number }): void {
    if (!this.ws.getDuration()) return;
    const fit = this.getFitPxPerSec();
    this.pxPerSec = state.pxPerSec <= fit ? 0 : Math.min(state.pxPerSec, MAX_PX_PER_SEC);
    this.ws.zoom(this.pxPerSec);
    this.ws.setScrollTime(state.scrollTime);
  }

  /**
   * Zoom para que `[start, end]` ocupe la mayor parte del ancho visible con un margen chico a
   * los costados (10% del ancho, repartido a ambos lados), y centra el scroll en ese rango — a
   * diferencia de setZoom(), que centra en el cursor de reproducción. La usa la vista de
   * palabras (Fase 10d-2) al seleccionar una línea con todas sus palabras capturadas.
   */
  zoomToRange(start: number, end: number): void {
    const duration = this.ws.getDuration();
    if (!duration) return;
    const span = Math.max(end - start, 0.001);
    const targetPxPerSec = (this.container.clientWidth * 0.9) / span;
    this.pxPerSec = Math.max(this.getFitPxPerSec(), Math.min(targetPxPerSec, MAX_PX_PER_SEC));
    this.ws.zoom(this.pxPerSec);
    if (this.pxPerSec > 0) {
      const visibleSeconds = this.container.clientWidth / this.pxPerSec;
      const center = (start + end) / 2;
      this.ws.setScrollTime(Math.max(0, center - visibleSeconds / 2));
    }
  }

  zoomIn(): void {
    const current = Math.max(this.pxPerSec, this.getFitPxPerSec());
    this.setZoom(current * ZOOM_STEP);
  }

  zoomOut(): void {
    this.setZoom(this.pxPerSec / ZOOM_STEP);
  }

  canZoomIn(): boolean {
    return this.ws.getDuration() > 0 && this.pxPerSec < MAX_PX_PER_SEC && this.getFitPxPerSec() < MAX_PX_PER_SEC;
  }

  canZoomOut(): boolean {
    return this.pxPerSec > this.getFitPxPerSec();
  }

  getCurrentTime(): number {
    return this.ws.getCurrentTime();
  }

  getDuration(): number {
    return this.ws.getDuration();
  }

  isPlaying(): boolean {
    return this.ws.isPlaying();
  }

  /** Tiempo actual de reproducción; se emite continuamente mientras suena y al hacer seek. */
  onTimeUpdate(listener: (time: number) => void): Unsubscribe {
    return this.ws.on("timeupdate", listener);
  }

  onPlayStateChange(listener: (playing: boolean) => void): Unsubscribe {
    const offs = [
      this.ws.on("play", () => listener(true)),
      this.ws.on("pause", () => listener(false)),
      this.ws.on("finish", () => listener(false)),
    ];
    return () => offs.forEach((off) => off());
  }

  onError(listener: (error: Error) => void): Unsubscribe {
    return this.ws.on("error", listener);
  }

  private findRegion(lineId: string): Region | undefined {
    return this.regions.getRegions().find((region) => region.id === lineId);
  }

  /**
   * Reemplaza todas las regions por una por cada línea con startTime Y endTime definidos. El
   * color de cada una es `paleta[posición en `lines` % 6]` — la posición cuenta TODAS las
   * líneas del proyecto, no solo las que tienen region, así el color de una línea no cambia
   * entre llamadas mientras se capturan o refinan las demás (ver src/core/lineColors.ts).
   */
  renderLineRegions(lines: Line[]): void {
    this.regions.clearRegions();
    lines.forEach((line, position) => {
      if (line.startTime === null || line.endTime === null) return;
      const region = this.regions.addRegion({
        id: line.id,
        start: line.startTime,
        end: line.endTime,
        color: getLineColorVar(getLineColorIndex(position)),
        content: createRegionNumber(position),
        drag: true,
        resize: true,
        resizeStart: true,
        resizeEnd: true,
        minLength: MIN_REGION_LENGTH_SEC,
      });
      // Recorta el número si la region es angosta, sin desbordar (mismo motivo que el número en
      // línea: una clase de style.css no llega acá, ver createRegionNumber más arriba).
      if (region.element) region.element.style.overflow = "hidden";
    });
  }

  /** Mueve la region de `lineId` a la posición dada (ej. para reflejar un nudge por teclado o un
   * undo/redo). Genérica por id: también la usa la vista de palabras (Fase 10d-2) para
   * reposicionar la region de una word tras un commit — si no hay ninguna region con ese id
   * (ej. no se está en esa vista), no hace nada. */
  updateRegion(lineId: string, start: number, end: number): void {
    this.findRegion(lineId)?.setOptions({ start, end });
  }

  /**
   * Reemplaza todas las regions por una por cada palabra de `words` (deben tener startTime y
   * endTime — la vista de palabras, Fase 10d-2, solo existe con la línea completamente
   * capturada). Mismo color que renderLineRegions() pero por posición DENTRO de la línea, y sin
   * `drag` (solo se arrastran los bordes, nunca la region completa) — reutiliza la paleta de la
   * Fase 10d-1, no define una nueva.
   */
  renderWordRegions(words: { id: string; text: string; startTime: number; endTime: number }[]): void {
    this.regions.clearRegions();
    words.forEach((word, position) => {
      const region = this.regions.addRegion({
        id: word.id,
        start: word.startTime,
        end: word.endTime,
        color: getLineColorVar(getLineColorIndex(position)),
        content: createRegionNumber(position, word.text),
        drag: false,
        resize: true,
        resizeStart: true,
        resizeEnd: true,
        minLength: WORD_MIN_LENGTH_SEC,
      });
      if (region.element) region.element.style.overflow = "hidden";
    });
  }

  /** Si `lineId` tiene una region dibujada en la waveform ahora mismo (solo las líneas ya
   * pasadas por renderLineRegions() — captura en vivo sola no crea regions nuevas, updateRegion()
   * solo mueve una existente). La usa el chip de color de la lista (ui/regionChips.ts). */
  hasRegion(lineId: string): boolean {
    return this.findRegion(lineId) !== undefined;
  }

  /**
   * Se dispara cuando cambia el CONJUNTO de líneas con region (una region nueva o eliminada —
   * no en cada drag/resize, eso es onRegionUpdateEnd). renderLineRegions() puede crear regions
   * de forma diferida (si se llama antes de que el audio termine de cargar, el plugin espera a
   * que la duración esté lista), así que esto puede dispararse más tarde que la propia llamada.
   * Lo usa el chip de color de la lista para no depender de que la lista también se re-renderice
   * en ese momento (ej. el cambio de duración al terminar de cargar audio no la re-renderiza).
   */
  onRegionsChanged(listener: () => void): Unsubscribe {
    const offs = [this.regions.on("region-created", () => listener()), this.regions.on("region-removed", () => listener())];
    return () => offs.forEach((off) => off());
  }

  /**
   * Resalta la region de `lineId` como seleccionada, con un indicador en su
   * borde activo ("start" o "end"). `lineId: null` quita cualquier resaltado.
   * Se aplica como estilo inline (no clase CSS) porque el plugin ya fija
   * estilos inline en las regions y sus handles de resize.
   */
  highlightRegion(lineId: string | null, activeEdge: LineEdge | null): void {
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#5b6cff";

    for (const region of this.regions.getRegions()) {
      if (!region.element) continue;
      region.element.style.outline = "";
      const left = region.element.querySelector<HTMLElement>('[part~="region-handle-left"]');
      const right = region.element.querySelector<HTMLElement>('[part~="region-handle-right"]');
      if (left) left.style.borderLeftColor = "";
      if (right) right.style.borderRightColor = "";
    }

    if (lineId === null) return;
    const region = this.findRegion(lineId);
    if (!region?.element) return;

    // Más marcado que un resaltado normal (2px), para distinguirse sobre cualquier color de
    // la paleta de líneas.
    region.element.style.outline = `3px solid ${accent}`;
    const selector = activeEdge === "end" ? '[part~="region-handle-right"]' : '[part~="region-handle-left"]';
    const handle = region.element.querySelector<HTMLElement>(selector);
    if (!handle) return;
    if (activeEdge === "end") handle.style.borderRightColor = accent;
    else handle.style.borderLeftColor = accent;
  }

  /** Se dispara cuando el usuario hace click en una region (para seleccionarla). */
  onRegionClick(listener: (lineId: string) => void): Unsubscribe {
    return this.regions.on("region-clicked", (region) => listener(region.id));
  }

  /**
   * Se dispara cuando el usuario termina de arrastrar o redimensionar una
   * region (no en cada frame del arrastre). Ojo: pese al nombre que uno
   * esperaría, la librería llama a este evento 'region-updated' (con "d");
   * 'region-update' (sin "d") es el que dispara en cada frame del arrastre y
   * NO es el que queremos acá.
   */
  onRegionUpdateEnd(listener: (update: RegionUpdate) => void): Unsubscribe {
    return this.regions.on("region-updated", (region) => {
      listener({ lineId: region.id, start: region.start, end: region.end });
    });
  }

  destroy(): void {
    this.ws.destroy();
  }
}
