import type { TimedWord, WordEdgeUpdate } from "../core/project";

export type WordEdge = "start" | "end";

/** Paso de nudging por teclado sobre el borde activo de una palabra (Fase 10d-2), en
 * milisegundos. Único lugar donde vive este valor. */
export const WORD_NUDGE_MS = 10;
export const WORD_NUDGE_SHIFT_MS = 50;

/** Duración mínima de una palabra al arrastrar o nudgear su borde. Debe coincidir con el
 * `minLength` que se le pasa a las regions de palabra en src/audio/player.ts. */
export const WORD_MIN_LENGTH_SEC = 0.03;

/**
 * Calcula el resultado de mover el borde `edge` de la palabra `wordId` a `candidateTime`
 * (segundos absolutos), con los límites duros de la Fase 10d-2:
 * - Nunca sale de `[lineStart, lineEnd]`.
 * - Nunca invierte ni baja de WORD_MIN_LENGTH_SEC.
 * - No cruza el límite propio de la palabra vecina (el borde puede llegar a TOCARLA, no a
 *   metérsele adentro).
 *
 * Bordes compartidos: si antes de este movimiento `word.endTime === vecina.startTime` (ya se
 * tocaban), mueve las DOS palabras al mismo valor final, acotado por los límites de ambas — el
 * resultado trae 2 entradas. Si había un hueco, solo mueve la palabra indicada — 1 entrada. Se
 * usa igual para el arrastre (evento `region-updated`, no en cada frame) y el nudging por
 * teclado. Pura — `words` debe tener startTime/endTime no nulos en todas (la vista de palabras
 * solo existe con la línea completamente capturada).
 */
export function computeWordEdgeMove(
  words: TimedWord[],
  wordId: string,
  edge: WordEdge,
  candidateTime: number,
  lineStart: number,
  lineEnd: number,
): WordEdgeUpdate[] {
  const index = words.findIndex((word) => word.id === wordId);
  if (index === -1) return [];
  const word = words[index];
  const neighbor = words[edge === "start" ? index - 1 : index + 1];
  const touching =
    !!neighbor && (edge === "start" ? word.startTime === neighbor.endTime : word.endTime === neighbor.startTime);

  if (touching) {
    // Borde compartido: un único valor válido para las dos palabras a la vez, dentro del largo
    // mínimo de CADA una (line bounds quedan garantizados: el rango va de word.start a
    // neighbor.end, o de neighbor.start a word.end, ambos ya dentro de la línea).
    const lower = (edge === "start" ? neighbor.startTime : word.startTime) + WORD_MIN_LENGTH_SEC;
    const upper = (edge === "start" ? word.endTime : neighbor.endTime) - WORD_MIN_LENGTH_SEC;
    const value = Math.min(Math.max(candidateTime, lower), upper);
    return edge === "start"
      ? [
          { wordId: word.id, startTime: value, endTime: word.endTime },
          { wordId: neighbor.id, startTime: neighbor.startTime, endTime: value },
        ]
      : [
          { wordId: word.id, startTime: word.startTime, endTime: value },
          { wordId: neighbor.id, startTime: value, endTime: neighbor.endTime },
        ];
  }

  if (edge === "start") {
    // Sin vecina (primera palabra de la línea): el límite es el de la línea. Con hueco: no
    // cruza el endTime de la vecina, aunque haya lugar de sobra hasta la línea.
    const lower = Math.max(lineStart, neighbor ? neighbor.endTime : lineStart);
    const upper = word.endTime - WORD_MIN_LENGTH_SEC;
    const value = Math.min(Math.max(candidateTime, lower), upper);
    return [{ wordId: word.id, startTime: value, endTime: word.endTime }];
  }

  const upper = Math.min(lineEnd, neighbor ? neighbor.startTime : lineEnd);
  const lower = word.startTime + WORD_MIN_LENGTH_SEC;
  const value = Math.max(Math.min(candidateTime, upper), lower);
  return [{ wordId: word.id, startTime: word.startTime, endTime: value }];
}
