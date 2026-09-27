import type { Project, UserSettings } from "./project";

const STORAGE_KEY = "lyric-sync:project";
const SETTINGS_KEY = "lyric-sync:settings";
const SUGGESTION_DISMISSED_KEY = "lyric-sync:calibration-suggestion-dismissed";

function isValidProject(value: unknown): value is Project {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.audioFileName === "string" &&
    typeof candidate.duration === "number" &&
    (candidate.syncMode === "line" || candidate.syncMode === "word") &&
    Array.isArray(candidate.lines) &&
    typeof candidate.lastModified === "number"
  );
}

/** Autosave a localStorage. Esto NO cuenta como "guardado" a efectos de hasUnsavedChanges. */
export function saveProject(project: Project): void {
  const toStore: Project = { ...project, lastModified: Date.now() };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  } catch {
    // Cuota llena, modo privado, etc.: el autosave es best-effort, no debe romper la app.
  }
}

/** Lee el proyecto autoguardado. Nunca tira error: devuelve null si no hay nada o es inválido. */
export function loadProject(): Project | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidProject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Saca la extensión del nombre de archivo (p. ej. "cancion.mp3" -> "cancion"). */
function stripExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
}

/** Dispara la descarga del Project completo como .json. */
export function exportProject(project: Project): void {
  const baseName = project.audioFileName ? stripExtension(project.audioFileName) : "proyecto";
  const fileName = `${baseName}.json`;
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Lee un .json subido y lo valida con una comprobación básica de forma antes de aceptarlo. */
export async function importProject(file: File): Promise<Project> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("el archivo no es JSON válido");
  }
  if (!isValidProject(parsed)) {
    throw new Error("el archivo no tiene la forma de un proyecto de Lyric Sync");
  }
  return parsed;
}

// Cambios sin exportar a .json desde la última vez. El autosave de arriba no cuenta como
// "guardado" a estos efectos (ver decisiones de UX en CLAUDE.md).
let unsavedChanges = false;

export function markUnsaved(): void {
  unsavedChanges = true;
}

export function markSaved(): void {
  unsavedChanges = false;
}

export function hasUnsavedChanges(): boolean {
  return unsavedChanges;
}

// --- Configuración personal del usuario (latencia calibrada) ---
// Key separada de la del proyecto: es del dispositivo, no viaja al exportar/importar un proyecto.

function isValidUserSettings(value: unknown): value is UserSettings {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).latencyOffsetMs === "number"
  );
}

export function saveUserSettings(settings: UserSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // best-effort, igual que el autosave del proyecto.
  }
}

/** Nunca tira error: si no hay nada guardado (o es inválido), devuelve latencyOffsetMs: 0. */
export function loadUserSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { latencyOffsetMs: 0 };
    const parsed: unknown = JSON.parse(raw);
    return isValidUserSettings(parsed) ? parsed : { latencyOffsetMs: 0 };
  } catch {
    return { latencyOffsetMs: 0 };
  }
}

/**
 * Si nunca se guardó una configuración, loadUserSettings() igual devuelve un
 * valor por defecto — esto es lo único que distingue "nunca calibró" de
 * "calibró y le dio justo 0ms", para decidir si mostrar la sugerencia inicial.
 */
export function hasUserSettings(): boolean {
  try {
    return localStorage.getItem(SETTINGS_KEY) !== null;
  } catch {
    return false;
  }
}

// --- Sugerencia de calibración descartable ---
// No es parte de UserSettings: es solo si el usuario ya cerró el aviso, para no insistir.

export function isCalibrationSuggestionDismissed(): boolean {
  try {
    return localStorage.getItem(SUGGESTION_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissCalibrationSuggestion(): void {
  try {
    localStorage.setItem(SUGGESTION_DISMISSED_KEY, "1");
  } catch {
    // best-effort
  }
}
