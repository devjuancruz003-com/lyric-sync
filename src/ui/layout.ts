export interface AppElements {
  tabList: HTMLElement;
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
  selectedLinePanel: HTMLElement;
  wordCaptureStatus: HTMLElement;
  lyricsInput: HTMLTextAreaElement;
  analyzeButton: HTMLButtonElement;
  tapSyncButton: HTMLButtonElement;
  refineButton: HTMLButtonElement;
  refineStatus: HTMLElement;
  syncModeSelect: HTMLSelectElement;
  followCheckbox: HTMLInputElement;
  linesScroll: HTMLElement;
  linesEmpty: HTMLElement;
  goPrepareButton: HTMLButtonElement;
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

/**
 * Shell tipo editor: barra superior con pestañas, región de audio persistente (fuera de los
 * tabpanels, así la instancia de wavesurfer nunca se destruye al cambiar de pestaña) y, debajo,
 * el contenido de la pestaña activa. El estado inicial de las pestañas lo fija ui/tabs.ts.
 */
export function renderLayout(root: HTMLElement): AppElements {
  root.innerHTML = `
    <div class="app-shell">
      <header class="app-topbar">
        <h1>Lyric Sync</h1>
        <div class="tabs" role="tablist" aria-label="Secciones" id="app-tabs">
          <button id="tab-prepare" class="tab" type="button" role="tab" data-tab="prepare"
            aria-selected="true" aria-controls="panel-prepare" tabindex="0">Preparar</button>
          <button id="tab-sync" class="tab" type="button" role="tab" data-tab="sync"
            aria-selected="false" aria-controls="panel-sync" tabindex="-1">Sincronizar</button>
        </div>
      </header>

      <div id="calibration-suggestion" class="suggestion-banner" hidden>
        <span>¿Ya calibraste la latencia de tu dispositivo? Ayuda a que el tapeo en vivo quede más preciso.</span>
        <button id="calibration-suggestion-calibrate" type="button">Calibrar ahora</button>
        <button id="calibration-suggestion-dismiss" type="button" aria-label="Descartar sugerencia">✕</button>
      </div>

      <section class="panel audio-region" aria-labelledby="audio-heading">
        <h2 id="audio-heading" class="sr-only">Audio</h2>
        <div class="audio-source">
          <label class="file-field">
            <span>Archivo de audio (mp3, wav, ogg)</span>
            <input id="audio-input" type="file"
              accept=".mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/x-wav,audio/ogg" />
          </label>
          <p id="audio-status" class="status" role="status" aria-live="polite">
            Ningún audio cargado.
          </p>
        </div>

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

      <div class="tab-content">
        <div id="panel-prepare" class="tab-panel prepare-panel" role="tabpanel" aria-labelledby="tab-prepare">
          <section class="panel" aria-labelledby="lyrics-heading">
            <h2 id="lyrics-heading">Letra</h2>
            <label class="lyrics-field">
              <span>Pegá la letra en texto plano</span>
              <textarea id="lyrics-input" rows="12" spellcheck="false"></textarea>
            </label>
            <div class="lyrics-actions">
              <button id="analyze-button" type="button" disabled>Analizar letra</button>
            </div>
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
        </div>

        <div id="panel-sync" class="tab-panel sync-panel" role="tabpanel" aria-labelledby="tab-sync" hidden>
          <section class="panel sync-lines-column" aria-label="Líneas de la letra">
            <div class="sync-toolbar">
              <label class="sync-mode-field">
                Modo
                <select id="sync-mode-select" disabled>
                  <option value="line">Línea</option>
                  <option value="word">Palabra</option>
                </select>
              </label>
              <button id="tap-sync-button" type="button" disabled>Iniciar captura</button>
              <button id="refine-button" type="button" disabled>Refinar timing</button>
              <label class="follow-field">
                <input id="follow-checkbox" type="checkbox" checked />
                Seguir reproducción
              </label>
            </div>
            <p id="refine-status" class="status" role="status" aria-live="polite"></p>
            <p id="word-capture-status" class="status" role="status" aria-live="polite"></p>

            <div id="lines-scroll" class="lines-scroll">
              <div id="lines-empty" class="lines-empty">
                <p>Todavía no hay letra analizada</p>
                <button id="go-prepare-button" type="button">Ir a Preparar</button>
              </div>
              <ol id="lines-output" class="lines-output" aria-label="Letra analizada"></ol>
            </div>
          </section>

          <div class="sync-side-column">
            <section id="preview-panel" class="panel" aria-labelledby="preview-heading" hidden>
              <h2 id="preview-heading">Preview</h2>
              <div id="preview-output" class="preview-output preview-idle" aria-live="off"><span class="preview-idle-marker" aria-hidden="true">♪</span></div>
            </section>

            <section id="selected-line-panel" class="panel selected-line-panel" aria-labelledby="selected-line-heading" hidden>
              <h2 id="selected-line-heading">Línea seleccionada</h2>
              <p class="selected-line-text"></p>
              <p class="selected-line-range"></p>
              <p class="selected-line-word-view-hint status"></p>
              <ol class="selected-line-words" aria-label="Palabras de la línea"></ol>
              <button type="button" class="selected-line-record"></button>
              <p class="selected-line-hint status" id="selected-line-hint"></p>
            </section>
          </div>
        </div>
      </div>
    </div>
  `;

  const get = <T extends HTMLElement>(id: string): T => {
    const el = root.querySelector<T>(`#${id}`);
    if (!el) throw new Error(`Falta el elemento #${id} en el layout`);
    return el;
  };

  return {
    tabList: get("app-tabs"),
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
    selectedLinePanel: get("selected-line-panel"),
    wordCaptureStatus: get("word-capture-status"),
    lyricsInput: get("lyrics-input"),
    analyzeButton: get("analyze-button"),
    tapSyncButton: get("tap-sync-button"),
    refineButton: get("refine-button"),
    refineStatus: get("refine-status"),
    syncModeSelect: get("sync-mode-select"),
    followCheckbox: get("follow-checkbox"),
    linesScroll: get("lines-scroll"),
    linesEmpty: get("lines-empty"),
    goPrepareButton: get("go-prepare-button"),
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
