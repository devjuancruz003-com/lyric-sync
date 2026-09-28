import type { Project } from "../core/project";

/** Variantes de Word/Line sin `null`: ya filtradas, seguras de mostrar y de exportar. */
export interface RenderableWord {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
}

export interface RenderableLine {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  /** Vacío = sin desglose por palabra (fallback a resaltado de línea completa). */
  words: RenderableWord[];
}

export interface ActiveState {
  /** Índice dentro del array de RenderableLine recibido (no dentro del Project), o -1. */
  lineIndex: number;
  /** Índice dentro de `lines[lineIndex].words`, o -1. */
  wordIndex: number;
}

/**
 * Qué líneas y palabras tienen timing completo y son seguras de mostrar/exportar. Es la única
 * fuente de verdad compartida por el preview (Fase 10) y los exportadores (Fase 11), para que
 * lo que se ve y lo que se exporta nunca diverjan. Pura — no guarda nada en el Project.
 *
 * - Solo entran las líneas con startTime y endTime.
 * - `words` va completo solo si TODAS las palabras tienen startTime y endTime; si falta
 *   cualquiera, la línea entra igual pero con `words: []` (nunca un desglose a medias).
 */
export function getRenderableLines(project: Project): RenderableLine[] {
  const result: RenderableLine[] = [];

  for (const line of project.lines) {
    if (line.startTime === null || line.endTime === null) continue;

    const wordsComplete =
      line.words.length > 0 && line.words.every((word) => word.startTime !== null && word.endTime !== null);
    const words: RenderableWord[] = wordsComplete
      ? line.words.map((word) => ({
          id: word.id,
          text: word.text,
          startTime: word.startTime as number,
          endTime: word.endTime as number,
        }))
      : [];

    result.push({ id: line.id, text: line.text, startTime: line.startTime, endTime: line.endTime, words });
  }

  return result;
}

/**
 * Qué línea/palabra está sonando en `currentTimeSec` (startTime <= t < endTime). Solo lo usa el
 * preview en vivo — los exportadores escriben rangos y no necesitan el tiempo de reproducción.
 * Pura; se recalcula en cada tick.
 */
export function getActiveState(lines: RenderableLine[], currentTimeSec: number): ActiveState {
  const isActive = (item: { startTime: number; endTime: number }) =>
    item.startTime <= currentTimeSec && currentTimeSec < item.endTime;

  const lineIndex = lines.findIndex(isActive);
  if (lineIndex === -1) return { lineIndex: -1, wordIndex: -1 };

  return { lineIndex, wordIndex: lines[lineIndex].words.findIndex(isActive) };
}
