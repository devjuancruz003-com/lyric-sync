import { generateId, type Line, type Word } from "./project";

function parseWord(text: string): Word {
  return { id: generateId(), text, startTime: null, endTime: null };
}

function parseLine(text: string): Line {
  const words = text.split(/\s+/).filter((word) => word !== "").map(parseWord);
  return { id: generateId(), text, startTime: null, endTime: null, words };
}

/**
 * Convierte letra en texto plano a líneas del modelo de datos.
 * Las líneas en blanco (separadores de estrofa) no generan un Line.
 */
export function parseLyrics(rawText: string): Line[] {
  return rawText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map(parseLine);
}
