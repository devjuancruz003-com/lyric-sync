import type { Project } from "./project";

const STORAGE_KEY = "lyric-sync:project";

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

/** Dispara la descarga del Project completo como .json. */
export function exportProject(project: Project): void {
  const fileName = `${project.audioFileName || "proyecto"}.json`;
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
