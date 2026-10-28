export type ViewMode = "board" | "table";
export type ViewModes = Record<string, ViewMode>;
export const VIEW_MODES_KEY = "company-crm.viewModes.v1";

export function readViewModes(raw: string | null): ViewModes {
  try {
    const value: unknown = JSON.parse(raw || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([key, mode]) =>
      key.startsWith("board:") && key.length > 6 && (mode === "board" || mode === "table"))) as ViewModes;
  } catch { return {}; }
}

export function viewMode(modes: ViewModes, boardId: string): ViewMode {
  return boardId ? modes[`board:${boardId}`] || "board" : "table";
}

export function withViewMode(modes: ViewModes, boardId: string, mode: ViewMode): ViewModes {
  return boardId ? { ...modes, [`board:${boardId}`]: mode } : modes;
}
