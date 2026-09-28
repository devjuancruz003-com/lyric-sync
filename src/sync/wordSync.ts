import type { Word } from "../core/project";
import { findNextUncaptured } from "./tapSync";

/** Segundos de audio ANTES del inicio de la línea desde los que arranca la captura de palabras,
 * para agarrar el ritmo. Único lugar donde vive este valor. */
export const WORD_CAPTURE_PREROLL_SEC = 2;

/** Desde dónde arrancar la captura de palabras de una línea que empieza en `lineStartSec`: el
 * pre-roll antes del inicio, nunca antes de 0 (si la línea empieza a <= 2 s, dura lo que haya). */
export function getWordCaptureStartTime(lineStartSec: number): number {
  return Math.max(0, lineStartSec - WORD_CAPTURE_PREROLL_SEC);
}

/** Mientras el audio esté antes del inicio de la línea (pre-roll) los taps no marcan palabras. */
export function isInWordCapturePreroll(currentTimeSec: number, lineStartSec: number): boolean {
  return currentTimeSec < lineStartSec;
}

export interface WordTapResult {
  wordId: string;
  startTime: number;
}

/**
 * Sesión de captura en vivo de palabras (Fase 9), análoga a TapSyncSession
 * (Fase 6) pero acotada a los words de UNA línea en vez de a las líneas de
 * toda la canción. No conoce el Project ni lo muta — quien la usa decide
 * cómo aplicar cada marca al estado real. Resume una captura interrumpida:
 * al crear la sesión, arranca en la primera word sin startTime.
 */
export class WordSyncSession {
  private currentIndex: number;

  constructor(words: Word[]) {
    this.currentIndex = findNextUncaptured(words);
  }

  /** Índice de la word objetivo actual, o -1 si no queda ninguna por marcar. */
  getCurrentIndex(): number {
    return this.currentIndex;
  }

  isDone(): boolean {
    return this.currentIndex === -1;
  }

  /**
   * Marca la word objetivo actual: startTime = audioCurrentTime -
   * latencyOffsetMs/1000, nunca negativo (clamp a 0) — mismo cálculo que
   * TapSyncSession.markCurrentLine() (Fase 6). Avanza el índice interno a la
   * siguiente word sin startTime. Devuelve el id de la word marcada y el
   * startTime calculado, o null si la sesión ya está terminada.
   */
  markCurrentWord(words: Word[], audioCurrentTime: number, latencyOffsetMs: number): WordTapResult | null {
    if (this.isDone()) return null;
    const word = words[this.currentIndex];
    const startTime = Math.max(0, audioCurrentTime - latencyOffsetMs / 1000);

    const remaining = words.slice(this.currentIndex + 1);
    const nextOffset = findNextUncaptured(remaining);
    this.currentIndex = nextOffset === -1 ? -1 : this.currentIndex + 1 + nextOffset;

    return { wordId: word.id, startTime };
  }
}
