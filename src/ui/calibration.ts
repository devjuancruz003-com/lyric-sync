import { type CalibrationInvalidResult, LEAD_IN_MS, runCalibration } from "../audio/calibration";

export interface CalibrationModalOptions {
  numBeeps?: number;
  intervalMs?: number;
  onSave: (latencyOffsetMs: number) => void;
}

export function calibrationButtonLabel(latencyOffsetMs: number | null): string {
  return latencyOffsetMs === null ? "Calibrar" : `Latencia: ${latencyOffsetMs}ms — Recalibrar`;
}

/** Abre el modal de calibración. Se cierra solo (Escape/click afuera) salvo mientras está sonando. */
export function openCalibrationModal({ numBeeps = 6, intervalMs = 800, onSave }: CalibrationModalOptions): void {
  let isRunning = false;

  const overlay = document.createElement("div");
  overlay.className = "calibration-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "calibration-title");

  const panel = document.createElement("div");
  panel.className = "calibration-panel";
  panel.tabIndex = -1;
  overlay.appendChild(panel);

  function close(): void {
    document.removeEventListener("keydown", handleEscape);
    overlay.remove();
  }

  function handleEscape(event: KeyboardEvent): void {
    if (event.key === "Escape" && !isRunning) close();
  }
  document.addEventListener("keydown", handleEscape);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay && !isRunning) close();
  });

  function renderIntro(): void {
    isRunning = false;
    panel.innerHTML = `
      <h2 id="calibration-title">Calibrar latencia</h2>
      <p>
        Vas a escuchar ${numBeeps} beeps, uno cada ${(intervalMs / 1000).toFixed(1)}s.
        Tocá la barra espaciadora justo en cada beep — guiándote por el sonido o por el
        destello en pantalla, lo que te resulte más fácil.
      </p>
      <div class="calibration-actions">
        <button type="button" class="calibration-start">Empezar</button>
        <button type="button" class="calibration-cancel">Cancelar</button>
      </div>
    `;
    const startButton = panel.querySelector<HTMLButtonElement>(".calibration-start")!;
    panel.querySelector<HTMLButtonElement>(".calibration-cancel")!.addEventListener("click", close);
    startButton.addEventListener("click", startRun);
    startButton.focus();
  }

  function renderRunning(): { pulse: HTMLElement; status: HTMLElement } {
    panel.innerHTML = `
      <h2 id="calibration-title">Calibrando…</h2>
      <p class="calibration-status" aria-live="polite"></p>
      <div class="calibration-pulse" aria-hidden="true"></div>
      <p>Tocá la barra espaciadora en cada beep.</p>
    `;
    panel.focus();
    return {
      pulse: panel.querySelector<HTMLElement>(".calibration-pulse")!,
      status: panel.querySelector<HTMLElement>(".calibration-status")!,
    };
  }

  function renderResult(latencyOffsetMs: number): void {
    isRunning = false;
    panel.innerHTML = `
      <h2 id="calibration-title">Listo</h2>
      <p>Tu desfase promedio es <strong>${latencyOffsetMs} ms</strong>.</p>
      <div class="calibration-actions">
        <button type="button" class="calibration-save">Guardar</button>
        <button type="button" class="calibration-repeat">Repetir</button>
      </div>
    `;
    const saveButton = panel.querySelector<HTMLButtonElement>(".calibration-save")!;
    saveButton.addEventListener("click", () => {
      onSave(latencyOffsetMs);
      close();
    });
    panel.querySelector<HTMLButtonElement>(".calibration-repeat")!.addEventListener("click", startRun);
    saveButton.focus();
  }

  function renderInvalid(result: CalibrationInvalidResult): void {
    isRunning = false;
    panel.innerHTML = `
      <h2 id="calibration-title">No se pudo calibrar</h2>
      <p>
        No se detectó un toque por cada beep (esperábamos ${result.expected}, se registraron
        ${result.received}) — probá de nuevo.
      </p>
      <div class="calibration-actions">
        <button type="button" class="calibration-repeat">Repetir</button>
      </div>
    `;
    const repeatButton = panel.querySelector<HTMLButtonElement>(".calibration-repeat")!;
    repeatButton.addEventListener("click", startRun);
    repeatButton.focus();
  }

  function startRun(): void {
    isRunning = true;
    const { pulse, status } = renderRunning();

    // Cuenta regresiva visual sincronizada con el lead-in de runCalibration.
    let remaining = Math.ceil(LEAD_IN_MS / 1000);
    status.textContent = `Preparate — empieza en ${remaining}…`;
    const countdown = setInterval(() => {
      remaining -= 1;
      status.textContent = remaining > 0 ? `Preparate — empieza en ${remaining}…` : "¡Ahora!";
      if (remaining <= 0) clearInterval(countdown);
    }, 1000);

    runCalibration(numBeeps, intervalMs, {
      onBeep: (index) => {
        status.textContent = `Beep ${index + 1} de ${numBeeps}`;
        pulse.classList.add("is-active");
        setTimeout(() => pulse.classList.remove("is-active"), 150);
      },
    }).then((result) => {
      clearInterval(countdown);
      if (typeof result === "number") {
        renderResult(result);
      } else {
        renderInvalid(result);
      }
    });
  }

  renderIntro();
  document.body.appendChild(overlay);
}
