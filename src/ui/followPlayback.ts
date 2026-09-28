import type { PlayingLineControls } from "./playingLine";

export interface FollowPlaybackOptions {
  /** Contenedor con scroll propio (overflow-y: auto) que envuelve la lista de líneas. */
  scroller: HTMLElement;
  list: HTMLElement;
  checkbox: HTMLInputElement;
  /** La línea que suena (fuente compartida con el resaltado de la lista). */
  playingLine: PlayingLineControls;
}

export interface FollowPlaybackControls {
  /** Lleva a la vista la línea objetivo de captura (o, si no hay, la que suena). Llamar al
   * mostrar la pestaña: con el panel oculto no hay layout y los scrolls anteriores no aplican. */
  scrollToCurrent(): void;
}

const CAPTURE_ACTIVE_CLASS = "tap-sync-active";

/**
 * "Seguir reproducción": mantiene visible, dentro del scroll propio de la lista (nunca
 * scrollIntoView, que arrastraría también la página), la línea objetivo durante la captura y la
 * línea que suena durante la reproducción. Solo actúa cuando la casilla está activada, y solo
 * cuando esa línea CAMBIA — no en cada tick. Sin animación.
 */
export function setupFollowPlayback({
  scroller,
  list,
  checkbox,
  playingLine,
}: FollowPlaybackOptions): FollowPlaybackControls {
  let lastTargetLineId: string | null = null;

  function findLine(lineId: string): HTMLElement | null {
    return list.querySelector<HTMLElement>(`li[data-line-id="${CSS.escape(lineId)}"]`);
  }

  function findTargetLine(): HTMLElement | null {
    return (
      list.querySelector<HTMLElement>("li.target-line") ??
      list.querySelector<HTMLElement>(".word.target-word")?.closest<HTMLElement>("li") ??
      null
    );
  }

  /** Si la línea ya se ve completa no hace nada; si no, la centra dentro del scroller. */
  function reveal(li: HTMLElement): void {
    const box = scroller.getBoundingClientRect();
    const item = li.getBoundingClientRect();
    if (box.height === 0) return; // panel oculto: sin layout, no hay nada que calcular
    if (item.top >= box.top && item.bottom <= box.bottom) return;
    scroller.scrollTop += item.top - box.top - (box.height - item.height) / 2;
  }

  // La línea que suena (la resuelve ui/playingLine.ts, con la misma fuente que el preview): solo
  // al cambiar, y no durante una captura (ahí manda la línea objetivo).
  playingLine.onChange((lineId) => {
    if (!lineId || !checkbox.checked || document.body.classList.contains(CAPTURE_ACTIVE_CLASS)) return;
    const li = findLine(lineId);
    if (li) reveal(li);
  });

  // La línea objetivo de captura la marcan ui/tapSync.ts y ui/wordSync.ts con clases CSS (y
  // renderLines() reconstruye el DOM en cada cambio): observar la lista evita acoplarse a ellos,
  // y comparar el id evita re-scrollear cuando un re-render deja el mismo objetivo.
  new MutationObserver(() => {
    const target = findTargetLine();
    const lineId = target?.dataset.lineId ?? null;
    if (lineId === lastTargetLineId) return;
    lastTargetLineId = lineId;
    if (target && checkbox.checked) reveal(target);
  }).observe(list, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });

  function scrollToCurrent(): void {
    if (!checkbox.checked) return;
    const target = findTargetLine();
    if (target) {
      reveal(target);
      return;
    }
    const lineId = playingLine.getId();
    const li = lineId ? findLine(lineId) : null;
    if (li) reveal(li);
  }

  checkbox.addEventListener("change", scrollToCurrent);

  return { scrollToCurrent };
}
