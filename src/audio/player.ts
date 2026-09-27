import WaveSurfer from "wavesurfer.js";

export type Unsubscribe = () => void;

/** Tope de zoom: 1 px = 1 ms, suficiente para ajustar palabra por palabra. */
export const MAX_PX_PER_SEC = 1000;
const ZOOM_STEP = 2;

/**
 * Wrapper sobre wavesurfer.js. El resto de la app habla con esta clase y no
 * con wavesurfer directamente, para poder cambiar/extender el backend de audio
 * (calibración de latencia, regions, etc.) sin tocar la UI.
 */
export class AudioPlayer {
  private readonly ws: WaveSurfer;
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

  destroy(): void {
    this.ws.destroy();
  }
}
