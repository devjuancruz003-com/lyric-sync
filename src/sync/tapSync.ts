import type { Line } from "../core/project";

/**
 * Índice del primer item sin startTime, o -1 si todos ya lo tienen. Genérico
 * para poder usarse tanto con Line[] (captura de líneas, Fase 6) como con
 * Word[] (captura de palabras dentro de una línea, Fase 9) — mismo patrón de
 * generalización que ya se usó con commitLineTiming en la Fase 7.
 */
export function findNextUncaptured<T extends { startTime: number | null }>(items: T[]): number {
  return items.findIndex((item) => item.startTime === null);
}

/**
 * Tiempo (segundos) desde el que conviene arrancar al reanudar la captura: el startTime de la
 * línea capturada más cercana ANTERIOR a la objetivo (`targetIndex`), para dar el contexto de
 * la letra ya sincronizada antes de marcar la que sigue. `null` si no hay ninguna capturada
 * antes (primera captura, o la objetivo es la primera línea).
 */
export function findResumeTime(lines: Line[], targetIndex: number): number | null {
  for (let index = targetIndex - 1; index >= 0; index--) {
    const startTime = lines[index].startTime;
    if (startTime !== null) return startTime;
  }
  return null;
}

export interface TapResult {
  lineId: string;
  startTime: number;
}

/**
 * Sesión de captura en vivo (tap-to-sync) a nivel línea. Solo lleva el índice
 * de la línea objetivo actual — no conoce el Project como un todo ni lo muta,
 * así que quien la usa decide cómo aplicar cada marca al estado real
 * (historial, autosave, etc.). Esto permite resumir una captura interrumpida:
 * al crear la sesión, arranca en la primera línea sin startTime.
 */
export class TapSyncSession {
  private currentIndex: number;

  constructor(lines: Line[]) {
    this.currentIndex = findNextUncaptured(lines);
  }

  /** Índice de la línea objetivo actual, o -1 si no queda ninguna por marcar. */
  getCurrentIndex(): number {
    return this.currentIndex;
  }

  isDone(): boolean {
    return this.currentIndex === -1;
  }

  /**
   * Marca la línea objetivo actual: startTime = audioCurrentTime -
   * latencyOffsetMs/1000, nunca negativo (clamp a 0), y avanza el índice
   * interno a la siguiente línea sin startTime (buscando desde la posición
   * actual en adelante). Devuelve el id de la línea marcada y el startTime
   * calculado, o null si la sesión ya está terminada.
   */
  markCurrentLine(lines: Line[], audioCurrentTime: number, latencyOffsetMs: number): TapResult | null {
    if (this.isDone()) return null;
    const line = lines[this.currentIndex];
    const startTime = Math.max(0, audioCurrentTime - latencyOffsetMs / 1000);

    const remaining = lines.slice(this.currentIndex + 1);
    const nextOffset = findNextUncaptured(remaining);
    this.currentIndex = nextOffset === -1 ? -1 : this.currentIndex + 1 + nextOffset;

    return { lineId: line.id, startTime };
  }
}
