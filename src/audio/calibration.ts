/** Cuenta regresiva antes del primer beep, en ms — le da tiempo a la UI a mostrarla. */
export const LEAD_IN_MS = 3000;

const BEEP_DURATION_MS = 100;
const BEEP_FREQUENCY_HZ = 880;

export interface CalibrationCallbacks {
  /** Se dispara en el instante en que suena cada beep (índice desde 0), para sincronizar un flash visual. */
  onBeep?: (beepIndex: number) => void;
}

export interface CalibrationInvalidResult {
  success: false;
  reason: "tap-count-mismatch";
  expected: number;
  received: number;
}

/**
 * Reproduce `numBeeps` beeps espaciados `intervalMs` entre sí, programados con
 * `audioContext.currentTime` (más preciso que setTimeout/setInterval a secas).
 * Mientras suenan escucha la barra espaciadora: el tap k-ésimo (por orden
 * cronológico) se empareja con el beep k-ésimo (por orden de aparición) — sin
 * buscar el beep más cercano ni reasignar entre beeps, para no invertir el
 * signo cuando un tap se desvía mucho de lo esperado.
 *
 * Si la cantidad de taps no coincide exactamente con `numBeeps` (se salteó
 * alguno, o tocó espacio de más), los datos quedarían desalineados: en ese
 * caso no se calcula ningún promedio y se devuelve un resultado inválido.
 *
 * Si es válida, descarta el primer beep (arranque en frío, no es
 * representativo) y promedia el resto de las diferencias, en ms — puede dar
 * negativo si el usuario tiende a anticiparse.
 */
export function runCalibration(
  numBeeps = 6,
  intervalMs = 800,
  { onBeep }: CalibrationCallbacks = {},
): Promise<number | CalibrationInvalidResult> {
  const audioContext = new AudioContext();
  if (audioContext.state === "suspended") void audioContext.resume();

  const intervalSec = intervalMs / 1000;
  const beepDurationSec = BEEP_DURATION_MS / 1000;
  const startTime = audioContext.currentTime + LEAD_IN_MS / 1000;
  const beepTimes = Array.from({ length: numBeeps }, (_, i) => startTime + i * intervalSec);

  for (const time of beepTimes) {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.value = BEEP_FREQUENCY_HZ;

    // Pequeño fade in/out para evitar el "click" de prender/apagar el oscilador seco.
    const attack = 0.005;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.3, time + attack);
    gain.gain.setValueAtTime(0.3, time + beepDurationSec - attack);
    gain.gain.linearRampToValueAtTime(0, time + beepDurationSec);

    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(time);
    oscillator.stop(time + beepDurationSec);
  }

  // audioContext.currentTime no "corre" con setTimeout; para avisarle a la UI en tiempo
  // real cuándo suena cada beep (y sincronizar el flash visual) se traduce a un delay de
  // reloj de pared en el momento de programar.
  const beepTimeouts = beepTimes.map((time, index) =>
    setTimeout(() => onBeep?.(index), Math.max(0, (time - audioContext.currentTime) * 1000)),
  );

  const taps: number[] = [];

  return new Promise<number | CalibrationInvalidResult>((resolve) => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key !== " " || event.repeat) return;
      event.preventDefault();
      taps.push(audioContext.currentTime);
    };
    document.addEventListener("keydown", handleKeydown);

    // Después del último beep se sigue escuchando la barra espaciadora un intervalo más,
    // para no cortarle el tap al usuario.
    const endTime = beepTimes[beepTimes.length - 1] + intervalSec;
    const endDelayMs = Math.max(0, (endTime - audioContext.currentTime) * 1000);

    setTimeout(() => {
      document.removeEventListener("keydown", handleKeydown);
      beepTimeouts.forEach(clearTimeout);
      void audioContext.close();

      if (taps.length !== numBeeps) {
        resolve({ success: false, reason: "tap-count-mismatch", expected: numBeeps, received: taps.length });
        return;
      }

      const diffsMs = taps
        .map((tapTime, index) => (tapTime - beepTimes[index]) * 1000)
        // Descartar el primer beep: arranque en frío, no es representativo.
        .filter((_, index) => index !== 0);

      const average = diffsMs.length > 0 ? diffsMs.reduce((sum, value) => sum + value, 0) / diffsMs.length : 0;
      resolve(Math.round(average));
    }, endDelayMs);
  });
}
