export interface AppElements {
  audioInput: HTMLInputElement;
  audioStatus: HTMLElement;
  waveform: HTMLElement;
  playButton: HTMLButtonElement;
  speedSelect: HTMLSelectElement;
  zoomInButton: HTMLButtonElement;
  zoomOutButton: HTMLButtonElement;
  timeDisplay: HTMLElement;
  previewPanel: HTMLElement;
  previewOutput: HTMLElement;
  lyricsInput: HTMLTextAreaElement;
  analyzeButton: HTMLButtonElement;
  tapSyncButton: HTMLButtonElement;
  refineButton: HTMLButtonElement;
  refineStatus: HTMLElement;
  syncModeSelect: HTMLSelectElement;
  linesOutput: HTMLElement;
  exportButton: HTMLButtonElement;
  importInput: HTMLInputElement;
  projectStatus: HTMLElement;
  calibrateButton: HTMLButtonElement;
  suggestionBanner: HTMLElement;
  suggestionCalibrateButton: HTMLButtonElement;
  suggestionDismissButton: HTMLButtonElement;
}

export const PLAYBACK_RATES = [0.5, 0.75, 1] as const;

export function renderLayout(root: HTMLElement): AppElements {
  root.innerHTML = `
    <header class="app-header">
      <h1>Lyric Sync</h1>
    </header>

    <div id="calibration-suggestion" class="suggestion-banner" hidden>
      <span>¿Ya calibraste la latencia de tu dispositivo? Ayuda a que el tapeo en vivo quede más preciso.</span>
      <button id="calibration-suggestion-calibrate" type="button">Calibrar ahora</button>
      <button id="calibration-suggestion-dismiss" type="button" aria-label="Descartar sugerencia">✕</button>
    </div>

    <main class="app-main">
      <section class="panel" aria-labelledby="audio-heading">
        <h2 id="audio-heading">Audio</h2>
        <label class="file-field">
          <span>Archivo de audio (mp3, wav, ogg)</span>
          <input id="audio-input" type="file"
            accept=".mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/x-wav,audio/ogg" />
        </label>
        <p id="audio-status" class="status" role="status" aria-live="polite">
          Ningún audio cargado.
        </p>

        <div id="waveform" class="waveform" tabindex="0"
          aria-label="Forma de onda. Click para saltar; flechas izquierda/derecha para retroceder/avanzar 5 segundos."></div>

        <div class="controls">
          <button id="play-button" type="button" disabled>Play</button>
          <label class="speed-field">
            Velocidad
            <select id="speed-select" disabled>
              ${PLAYBACK_RATES.map(
                (rate) => `<option value="${rate}"${rate === 1 ? " selected" : ""}>${rate}x</option>`,
              ).join("")}
            </select>
          </label>
          <div class="zoom-field" role="group" aria-label="Zoom de la forma de onda">
            Zoom
            <button id="zoom-out-button" type="button" aria-label="Alejar" disabled>−</button>
            <button id="zoom-in-button" type="button" aria-label="Acercar" disabled>+</button>
          </div>
          <span id="time-display" class="time" aria-label="Tiempo de reproducción">0:00.0 / 0:00.0</span>
          <button id="calibrate-button" type="button">Calibrar</button>
        </div>
      </section>

      <section id="preview-panel" class="panel" aria-labelledby="preview-heading" hidden>
        <h2 id="preview-heading">Preview</h2>
        <div id="preview-output" class="preview-output preview-idle" aria-live="off">—</div>
      </section>

      <section class="panel" aria-labelledby="lyrics-heading">
        <h2 id="lyrics-heading">Letra</h2>
        <label class="lyrics-field">
          <span>Pegá la letra en texto plano</span>
          <textarea id="lyrics-input" rows="10" spellcheck="false"></textarea>
        </label>
        <div class="lyrics-actions">
          <button id="analyze-button" type="button" disabled>Analizar letra</button>
          <button id="tap-sync-button" type="button" disabled>Iniciar captura</button>
          <button id="refine-button" type="button" disabled>Refinar timing</button>
          <label class="sync-mode-field">
            Modo
            <select id="sync-mode-select" disabled>
              <option value="line">Línea</option>
              <option value="word">Palabra</option>
            </select>
          </label>
        </div>
        <p id="refine-status" class="status" role="status" aria-live="polite"></p>

        <ol id="lines-output" class="lines-output" aria-label="Letra analizada"></ol>
      </section>

      <section class="panel" aria-labelledby="project-heading">
        <h2 id="project-heading">Proyecto</h2>
        <div class="project-actions">
          <button id="export-button" type="button" disabled>Exportar proyecto</button>
          <label class="file-field">
            <span>Importar proyecto (.json)</span>
            <input id="import-input" type="file" accept=".json,application/json" />
          </label>
        </div>
        <p id="project-status" class="status" role="status" aria-live="polite"></p>
      </section>
    </main>
  `;

  const get = <T extends HTMLElement>(id: string): T => {
    const el = root.querySelector<T>(`#${id}`);
    if (!el) throw new Error(`Falta el elemento #${id} en el layout`);
    return el;
  };

  return {
    audioInput: get("audio-input"),
    audioStatus: get("audio-status"),
    waveform: get("waveform"),
    playButton: get("play-button"),
    speedSelect: get("speed-select"),
    zoomInButton: get("zoom-in-button"),
    zoomOutButton: get("zoom-out-button"),
    timeDisplay: get("time-display"),
    previewPanel: get("preview-panel"),
    previewOutput: get("preview-output"),
    lyricsInput: get("lyrics-input"),
    analyzeButton: get("analyze-button"),
    tapSyncButton: get("tap-sync-button"),
    refineButton: get("refine-button"),
    refineStatus: get("refine-status"),
    syncModeSelect: get("sync-mode-select"),
    linesOutput: get("lines-output"),
    exportButton: get("export-button"),
    importInput: get("import-input"),
    projectStatus: get("project-status"),
    calibrateButton: get("calibrate-button"),
    suggestionBanner: get("calibration-suggestion"),
    suggestionCalibrateButton: get("calibration-suggestion-calibrate"),
    suggestionDismissButton: get("calibration-suggestion-dismiss"),
  };
}
