import type { AudioPlayer, Unsubscribe } from "../audio/player";
import type { Project } from "../core/project";
import { getActiveState, getRenderableLines } from "../render/highlighter";

export interface PlayingLineOptions {
  list: HTMLElement;
  player: AudioPlayer;
  getProject: () => Project | null;
}

export interface PlayingLineControls {
  /** Id de la línea que suena ahora (la misma que muestra el preview), o null en intro/huecos. */
  getId(): string | null;
  /** Se llama solo cuando CAMBIA la línea que suena — no en cada tick. */
  onChange(listener: (lineId: string | null) => void): Unsubscribe;
}

/**
 * Resalta en la lista la línea que suena (clase `.playing-line` + `aria-current="true"`), en
 * paralelo al preview y con la misma fuente: getRenderableLines()/getActiveState(). Es un
 * estado independiente de "Seguir reproducción" (esa casilla solo controla el scroll) y de los
 * de captura, selección y aviso de timing, que no toca.
 *
 * Se recalcula en cada `timeupdate` (que también dispara al hacer seek) pero solo toca el DOM
 * cuando la línea cambia. renderLines() recrea todos los <li>, y cada re-render acompaña a un
 * cambio del Project (edición, nudge, undo/redo): observar la lista reaplica la clase y
 * recalcula la línea activa con el timing nuevo, sin acoplarse a quienes re-renderizan.
 */
export function setupPlayingLine({ list, player, getProject }: PlayingLineOptions): PlayingLineControls {
  let currentId: string | null = null;
  const listeners = new Set<(lineId: string | null) => void>();

  function resolve(): string | null {
    const project = getProject();
    const lines = project ? getRenderableLines(project) : [];
    const { lineIndex } = getActiveState(lines, player.getCurrentTime());
    return lineIndex >= 0 ? lines[lineIndex].id : null;
  }

  function apply(): void {
    for (const li of list.querySelectorAll<HTMLElement>("li")) {
      const playing = currentId !== null && li.dataset.lineId === currentId;
      li.classList.toggle("playing-line", playing);
      if (playing) li.setAttribute("aria-current", "true");
      else li.removeAttribute("aria-current");
    }
  }

  function update(reapply: boolean): void {
    const id = resolve();
    const changed = id !== currentId;
    currentId = id;
    if (changed || reapply) apply();
    if (changed) listeners.forEach((listener) => listener(id));
  }

  player.onTimeUpdate(() => update(false));
  // Solo childList: aplicar la clase es un cambio de atributos y no debe re-dispararse solo.
  new MutationObserver(() => update(true)).observe(list, { childList: true });

  return {
    getId: () => currentId,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
