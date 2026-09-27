/** Formatea segundos como m:ss.d (décimas), p. ej. 83.46 → "1:23.4". */
export function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const tenths = Math.floor(safe * 10);
  const minutes = Math.floor(tenths / 600);
  const secs = Math.floor((tenths % 600) / 10);
  return `${minutes}:${secs.toString().padStart(2, "0")}.${tenths % 10}`;
}
