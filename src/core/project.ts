export interface Word {
  id: string;
  text: string;
  startTime: number | null;
  endTime: number | null;
}

export interface Line {
  id: string;
  text: string;
  startTime: number | null;
  endTime: number | null;
  words: Word[];
}

export interface Project {
  audioFileName: string;
  duration: number;
  syncMode: "line" | "word";
  lines: Line[];
  lastModified: number;
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function createProject(audioFileName: string, duration: number, lines: Line[]): Project {
  return {
    audioFileName,
    duration,
    syncMode: "line",
    lines,
    lastModified: Date.now(),
  };
}
