import type { Line } from "../core/project";

export type LineEdge = "start" | "end";

/** Duración mínima entre start y end de una línea. Debe coincidir con el `minLength`
 * que se le pasa a las regions en src/audio/player.ts. */
export const MIN_LINE_LENGTH_SEC = 0.05;
export const NUDGE_STEP_SEC = 0.1;
export const NUDGE_STEP_SEC_LARGE = 0.5;

/**
 * Completa el endTime de las líneas capturadas (startTime !== null) que
 * todavía no lo tienen: el startTime de la siguiente línea capturada, o la
 * duración total del audio si es la última. No toca líneas sin startTime ni
 * las que ya tenían su propio endTime. Función pura — devuelve un array nuevo.
 */
export function deriveMissingEndTimes(lines: Line[], audioDuration: number): Line[] {
  return lines.map((line, index) => {
    if (line.startTime === null || line.endTime !== null) return line;
    const next = lines.slice(index + 1).find((candidate) => candidate.startTime !== null);
    const endTime = next ? (next.startTime as number) : audioDuration;
    return { ...line, endTime };
  });
}

/** Nuevo startTime tras un nudge, acotado a [0, end - MIN_LINE_LENGTH_SEC]. */
export function clampStart(candidateStart: number, end: number): number {
  return Math.min(Math.max(candidateStart, 0), end - MIN_LINE_LENGTH_SEC);
}

/** Nuevo endTime tras un nudge, acotado a [start + MIN_LINE_LENGTH_SEC, audioDuration]. */
export function clampEnd(candidateEnd: number, start: number, audioDuration: number): number {
  return Math.max(Math.min(candidateEnd, audioDuration), start + MIN_LINE_LENGTH_SEC);
}
