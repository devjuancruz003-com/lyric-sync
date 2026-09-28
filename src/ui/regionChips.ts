import type { AudioPlayer } from "../audio/player";
import { getLineColorIndex, getLineColorVar } from "../core/lineColors";
import type { Project } from "../core/project";

export interface RegionChipsOptions {
  list: HTMLElement;
  player: AudioPlayer;
  getProject: () => Project | null;
}

/**
 * Chip de color junto al número de cada línea (Fase 10d-1), mientras "Refinar timing" está
 * activo. En esta app "activo" no es un modo persistente con su propio interruptor: las regions
 * de la waveform solo existen para las líneas que ya pasaron por renderLineRegions() (al cargar
 * o importar un proyecto, o al apretar "Refinar timing" — ver AudioPlayer.hasRegion()), así que
 * el chip usa esa presencia como criterio: aparece cuando la línea tiene region dibujada, no
 * antes. Mismo color que su region (misma posición en `project.lines`, ver src/core/lineColors.ts).
 * Se reaplica tras cada re-render de la lista (mismo patrón que ui/playingLine.ts).
 */
export function setupRegionChips({ list, player, getProject }: RegionChipsOptions): void {
  function apply(): void {
    const project = getProject();
    for (const li of list.querySelectorAll<HTMLElement>("li[data-line-id]")) {
      const chip = li.querySelector<HTMLElement>(".region-chip");
      if (!chip) continue;

      const lineId = li.dataset.lineId!;
      const visible = !!project && player.hasRegion(lineId);
      chip.classList.toggle("region-chip-visible", visible);
      if (!visible) continue;

      const position = project!.lines.findIndex((line) => line.id === lineId);
      chip.style.backgroundColor = getLineColorVar(getLineColorIndex(position));
    }
  }

  // Dos disparadores distintos, porque una region puede aparecer/desaparecer SIN que la lista se
  // re-renderice (ej. al terminar de cargar el audio) — y la lista puede re-renderizarse SIN que
  // cambie ninguna region (ej. al editar otra línea), y ahí igual hay que reaplicar la clase a
  // los <li> nuevos.
  new MutationObserver(apply).observe(list, { childList: true });
  player.onRegionsChanged(apply);
  apply();
}
