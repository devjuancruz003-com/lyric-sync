import type { HistoryEntry } from "./project";

const DEFAULT_MAX_ENTRIES = 100;

/**
 * Pila de undo/redo genérica: solo apila entradas y las devuelve, sin saber
 * nada del Project. Quien la use decide cómo aplicar `before`/`after` al
 * estado real.
 */
export class History<T = HistoryEntry> {
  private readonly maxEntries: number;
  private undoStack: T[] = [];
  private redoStack: T[] = [];

  constructor(maxEntries: number = DEFAULT_MAX_ENTRIES) {
    this.maxEntries = maxEntries;
  }

  /** Agrega una entrada nueva. Como en cualquier editor, invalida el redo pendiente. */
  push(entry: T): void {
    this.undoStack.push(entry);
    if (this.undoStack.length > this.maxEntries) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Devuelve la entrada deshecha (para aplicar su `before`), o null si no hay nada. */
  undo(): T | null {
    const entry = this.undoStack.pop();
    if (entry === undefined) return null;
    this.redoStack.push(entry);
    return entry;
  }

  /** Devuelve la entrada rehecha (para aplicar su `after`), o null si no hay nada. */
  redo(): T | null {
    const entry = this.redoStack.pop();
    if (entry === undefined) return null;
    this.undoStack.push(entry);
    return entry;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
