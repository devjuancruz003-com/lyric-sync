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
    | "setWordTimestamp"
    | "clearWords";
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
 * Completa el endTime de las líneas capturadas (startTime !== null) que todavía no lo tienen:
 * el startTime de la siguiente línea capturada, o `duration` si es la última por posición en el
 * proyecto y `duration > 0`. Una línea sin startTime no se toca, y una capturada sin ninguna
 * capturada después (captura parcial) queda en null. A diferencia de deriveMissingEndTimes()
 * (Fase 7, sync/timeline.ts, que se mantiene como red de seguridad), acá la última CAPTURADA no
 * hereda la duración salvo que además sea la última del proyecto. Pura e idempotente —
 * devuelve un array nuevo con las mismas referencias en las líneas que no cambian.
 */
export function deriveMissingLineEndTimes(lines: Line[], duration: number): Line[] {
  return lines.map((line, index) => {
    if (line.startTime === null || line.endTime !== null) return line;
    const next = lines.slice(index + 1).find((candidate) => candidate.startTime !== null);
    if (next) return { ...line, endTime: next.startTime };
    const isLast = index === lines.length - 1;
    return isLast && duration > 0 ? { ...line, endTime: duration } : line;
  });
}

/** Payload de un HistoryEntry "setTimestamp" (`before` y `after` comparten forma). `derived`
 * lleva los endTime de OTRAS líneas que cambiaron en el mismo paso (la anterior al marcar la
 * siguiente); es opcional para que las entradas viejas, sin `derived`, sigan aplicándose igual. */
export interface LineTimingPayload {
  lineId: string;
  startTime: number | null;
  endTime: number | null;
  derived?: { lineId: string; endTime: number | null }[];
}

/**
 * Al marcar una línea en la captura en vivo (Fase 6), calcula todo lo que cambia de un solo
 * paso: la línea marcada y los endTime derivados. La línea anterior MÁS CERCANA por posición
 * que tenga startTime (no necesariamente la adyacente) se recorta: si su endTime es null o
 * mayor que este startTime, pasa a valer este startTime — así una captura reanudada corrige el
 * endTime provisional que dejó "Refinar timing" (deriveMissingEndTimes() le da la duración del
 * audio a la última capturada). Si su endTime es <= este startTime (hueco deliberado) no se
 * toca, ni si este startTime cae antes de su propio inicio (evitaría invertirla; queda como
 * aviso de la Fase 8). Después, la última del proyecto toma `duration` si es > 0. Pura —
 * devuelve el `before` (con el endTime provisional incluido) y el `after` listos para un solo
 * HistoryEntry, así un Ctrl+Z deshace la marca y las derivaciones juntas.
 */
export function computeLineTap(
  lines: Line[],
  duration: number,
  lineId: string,
  startTime: number | null,
  endTime: number | null,
): { before: LineTimingPayload; after: LineTimingPayload } | null {
  const current = lines.find((line) => line.id === lineId);
  if (!current) return null;

  const tapped = lines.map((line) => (line.id === lineId ? { ...line, startTime, endTime } : line));

  if (startTime !== null) {
    const tappedIndex = lines.indexOf(current);
    const previousIndex = tapped.findLastIndex((line, index) => index < tappedIndex && line.startTime !== null);
    const previous = tapped[previousIndex];
    if (previous && previous.endTime !== null && previous.endTime > startTime && (previous.startTime as number) < startTime) {
      tapped[previousIndex] = { ...previous, endTime: startTime };
    }
  }

  const derivedLines = deriveMissingLineEndTimes(tapped, duration);

  const derivedChanges = derivedLines.filter((line, index) => line.id !== lineId && line.endTime !== lines[index].endTime);
  const finalEndTime = derivedLines.find((line) => line.id === lineId)?.endTime ?? endTime;

  const derivedBefore = derivedChanges.map((line) => ({
    lineId: line.id,
    endTime: lines.find((original) => original.id === line.id)?.endTime ?? null,
  }));
  const derivedAfter = derivedChanges.map((line) => ({ lineId: line.id, endTime: line.endTime }));

  return {
    before: {
      lineId,
      startTime: current.startTime,
      endTime: current.endTime,
      ...(derivedBefore.length > 0 && { derived: derivedBefore }),
    },
    after: {
      lineId,
      startTime,
      endTime: finalEndTime,
      ...(derivedAfter.length > 0 && { derived: derivedAfter }),
    },
  };
}

/**
 * Corrección silenciosa de proyectos guardados antes de la derivación incremental (líneas y
 * words capturadas con endTime en null). Primero las líneas (misma regla que
 * deriveMissingLineEndTimes(), con `project.duration`) y después las words de cada línea con
 * endTime, porque el endTime de la última word depende del de su línea (misma regla que
 * deriveMissingWordEndTimes()). Pura e idempotente; devuelve el mismo objeto si no hay nada que
 * corregir. No genera HistoryEntry.
 */
export function normalizeProject(project: Project): Project {
  const derivedLines = deriveMissingLineEndTimes(project.lines, project.duration);
  let changed = derivedLines.some((line, index) => line !== project.lines[index]);

  const lines = derivedLines.map((line) => {
    if (line.endTime === null || !Array.isArray(line.words)) return line;
    const words = deriveMissingWordEndTimes(line.words, line.endTime);
    if (words.every((word, index) => word === line.words[index])) return line;
    changed = true;
    return { ...line, words };
  });
  return changed ? { ...project, lines } : project;
}

/** Aplica un payload de "setWordTimestamp" (la palabra y sus `derived`) a las líneas. Pura —
 * devuelve un array nuevo; sirve igual para el before y el after, y para entradas viejas sin
 * `derived`. */
export function applyWordTiming(lines: Line[], payload: WordTimingPayload): Line[] {
  const { lineId, wordId, startTime, endTime, derived = [] } = payload;
  const derivedEndTimes = new Map(derived.map((entry) => [entry.wordId, entry.endTime]));
  return lines.map((line) =>
    line.id !== lineId
      ? line
      : {
          ...line,
          words: line.words.map((word) => {
            if (word.id === wordId) return { ...word, startTime, endTime };
            return derivedEndTimes.has(word.id) ? { ...word, endTime: derivedEndTimes.get(word.id) ?? null } : word;
          }),
        },
  );
}

/** Payload de un HistoryEntry "clearWords" (Fase 10c): el timing de varias palabras de UNA línea
 * (`before` con los valores previos, `after` con los mismos wordId en null). */
export interface WordsTimingPayload {
  lineId: string;
  words: { wordId: string; startTime: number | null; endTime: number | null }[];
}

/**
 * Re-grabar las palabras de una línea (Fase 10c): calcula, para UN solo HistoryEntry, poner el
 * startTime y endTime de TODAS las palabras de la línea en null. Pura. Devuelve null si no hay
 * nada que limpiar (línea inexistente, sin palabras, o ninguna con timing), para no ensuciar el
 * historial con un paso vacío.
 */
export function computeClearWords(
  lines: Line[],
  lineId: string,
): { before: WordsTimingPayload; after: WordsTimingPayload } | null {
  const line = lines.find((candidate) => candidate.id === lineId);
  if (!line || line.words.length === 0) return null;
  if (line.words.every((word) => word.startTime === null && word.endTime === null)) return null;

  return {
    before: {
      lineId,
      words: line.words.map((word) => ({ wordId: word.id, startTime: word.startTime, endTime: word.endTime })),
    },
    after: { lineId, words: line.words.map((word) => ({ wordId: word.id, startTime: null, endTime: null })) },
  };
}

/** Aplica un payload de "clearWords" (before o after) a las líneas. Pura. */
export function applyWordsTiming(lines: Line[], payload: WordsTimingPayload): Line[] {
  const timings = new Map(payload.words.map((entry) => [entry.wordId, entry]));
  return lines.map((line) =>
    line.id !== payload.lineId
      ? line
      : {
          ...line,
          words: line.words.map((word) => {
            const timing = timings.get(word.id);
            return timing ? { ...word, startTime: timing.startTime, endTime: timing.endTime } : word;
          }),
        },
  );
}
