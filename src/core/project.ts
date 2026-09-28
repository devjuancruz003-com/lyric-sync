export interface Word {
  id: string;
  text: string;
  startTime: number | null;
  endTime: number | null;
}

export interface Line {
  id: string;
  text: string;
  startTime: number | null;
  endTime: number | null;
  words: Word[];
}

export interface Project {
  audioFileName: string;
  duration: number;
  syncMode: "line" | "word";
  lines: Line[];
  lastModified: number;
}

export interface UserSettings {
  latencyOffsetMs: number;
}

export interface HistoryEntry {
  type:
    | "setTimestamp"
    | "addLine"
    | "deleteLine"
    | "editText"
    | "shiftOffset"
    | "createProject"
    | "setSyncMode"
    | "setWordTimestamp";
  before: unknown;
  after: unknown;
  timestamp: number;
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function createProject(audioFileName: string, duration: number, lines: Line[]): Project {
  return {
    audioFileName,
    duration,
    syncMode: "line",
    lines,
    lastModified: Date.now(),
  };
}

/**
 * Completa el endTime de las words capturadas (startTime !== null) que
 * todavía no lo tienen: el startTime de la siguiente word capturada, o
 * `lineEndTime` si es la última por posición en la línea. Una word sin
 * startTime no se toca, y una word capturada que no es la última y no tiene
 * ninguna capturada después (captura parcial) queda en null. Misma idea que
 * deriveMissingEndTimes() (Fase 7, a nivel línea) pero a nivel palabra.
 * Pura e idempotente — devuelve un array nuevo.
 */
export function deriveMissingWordEndTimes(words: Word[], lineEndTime: number | null): Word[] {
  return words.map((word, index) => {
    if (word.startTime === null || word.endTime !== null) return word;
    const next = words.slice(index + 1).find((candidate) => candidate.startTime !== null);
    if (next) return { ...word, endTime: next.startTime };
    const isLast = index === words.length - 1;
    return isLast && lineEndTime !== null ? { ...word, endTime: lineEndTime } : word;
  });
}

/** Payload de un HistoryEntry "setWordTimestamp" (`before` y `after` comparten forma). `derived`
 * lleva los endTime de OTRAS palabras que cambiaron en el mismo paso (la anterior al marcar la
 * siguiente); es opcional para que las entradas viejas, sin `derived`, sigan aplicándose igual. */
export interface WordTimingPayload {
  lineId: string;
  wordId: string;
  startTime: number | null;
  endTime: number | null;
  derived?: { wordId: string; endTime: number | null }[];
}

/**
 * Al marcar una palabra (Fase 9), calcula todo lo que cambia en la línea de un solo paso: la
 * palabra marcada y los endTime derivados (la anterior sin endTime toma este startTime; la
 * última de la línea toma line.endTime). Pura — devuelve el `before` y el `after` listos para
 * un solo HistoryEntry, así un Ctrl+Z deshace la marca y las derivaciones juntas.
 */
export function computeWordTap(
  line: Line,
  wordId: string,
  startTime: number | null,
  endTime: number | null,
): { before: WordTimingPayload; after: WordTimingPayload } | null {
  const current = line.words.find((word) => word.id === wordId);
  if (!current) return null;

  const tapped = line.words.map((word) => (word.id === wordId ? { ...word, startTime, endTime } : word));
  const derivedWords = deriveMissingWordEndTimes(tapped, line.endTime);

  const derivedChanges = derivedWords.filter(
    (word, index) => word.id !== wordId && word.endTime !== line.words[index].endTime,
  );
  const finalEndTime = derivedWords.find((word) => word.id === wordId)?.endTime ?? endTime;

  const derivedBefore = derivedChanges.map((word) => ({
    wordId: word.id,
    endTime: line.words.find((original) => original.id === word.id)?.endTime ?? null,
  }));
  const derivedAfter = derivedChanges.map((word) => ({ wordId: word.id, endTime: word.endTime }));

  return {
    before: {
      lineId: line.id,
      wordId,
      startTime: current.startTime,
      endTime: current.endTime,
      ...(derivedBefore.length > 0 && { derived: derivedBefore }),
    },
    after: {
      lineId: line.id,
      wordId,
      startTime,
      endTime: finalEndTime,
      ...(derivedAfter.length > 0 && { derived: derivedAfter }),
    },
  };
}

/**
 * Corrección silenciosa de proyectos guardados antes de la derivación incremental (words
 * capturadas con endTime en null): para cada línea con endTime, completa los endTime de sus
 * words con la misma regla que deriveMissingWordEndTimes(). Pura e idempotente; devuelve el
 * mismo objeto si no hay nada que corregir. No genera HistoryEntry.
 */
export function normalizeProject(project: Project): Project {
  let changed = false;
  const lines = project.lines.map((line) => {
    if (line.endTime === null || !Array.isArray(line.words)) return line;
    const words = deriveMissingWordEndTimes(line.words, line.endTime);
    if (words.every((word, index) => word === line.words[index])) return line;
    changed = true;
    return { ...line, words };
  });
  return changed ? { ...project, lines } : project;
}
