import type { Line } from "./project";

export const MIN_LINE_DURATION_MS = 300;

export type LineWarningType = "too-short" | "overlap";

export interface LineWarning {
  lineId: string;
  type: LineWarningType;
  message: string;
}

/**
 * Valida el timing de las líneas y devuelve advertencias no bloqueantes.
 * Función pura y derivada: los avisos no se guardan en ningún lado (ni el
 * Project ni localStorage) — se recalculan en cada render a partir de los
 * startTime/endTime actuales, así nunca quedan desactualizados.
 */
export function validateLines(lines: Line[]): LineWarning[] {
  const warnings: LineWarning[] = [];

  lines.forEach((line, index) => {
    if (line.startTime === null || line.endTime === null) return; // todavía no capturada

    if ((line.endTime - line.startTime) * 1000 < MIN_LINE_DURATION_MS) {
      warnings.push({
        lineId: line.id,
        type: "too-short",
        message: `Esta línea dura menos de ${MIN_LINE_DURATION_MS}ms.`,
      });
    }

    const next = lines[index + 1];
    if (next && next.startTime !== null && next.startTime < line.endTime) {
      warnings.push({
        lineId: line.id,
        type: "overlap",
        message: "Se superpone con la siguiente línea.",
      });
    }
  });

  return warnings;
}
