/** Cantidad de tonos en la paleta de líneas (--region-1 … --region-N en style.css). Con módulo,
 * dos índices consecutivos nunca coinciden mientras N > 1, así que líneas consecutivas nunca
 * comparten color sin necesidad de un caso especial. */
export const LINE_COLOR_COUNT = 6;

/**
 * Índice de color (0-based) para una línea en la posición `position` de `project.lines` —
 * TODAS las líneas del proyecto, no solo las capturadas, así el color de una línea no cambia
 * mientras se capturan o refinan las demás. Única fuente de esta regla: la usan tanto las
 * regions de la waveform (`src/audio/player.ts`) como el chip de la lista (`src/ui/regionChips.ts`),
 * así siempre combinan.
 */
export function getLineColorIndex(position: number): number {
  return position % LINE_COLOR_COUNT;
}

/** Variable CSS (`var(--region-N)`) para el índice de color dado. */
export function getLineColorVar(colorIndex: number): string {
  return `var(--region-${colorIndex + 1})`;
}
