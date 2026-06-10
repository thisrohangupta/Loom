import { create } from "zustand";

export type Role = "owner" | "editor" | "viewer";
export type ViewName =
  | "workflows" | "metrics" | "inputs" | "context" | "prompts" | "artifacts" | "snapshots" | "share";

export interface WorkspaceEntry {
  id: string;
  name: string;
  root: string;
  default?: boolean;
}

export interface FocusUser {
  id: string;
  name: string;
  color: string;
  key: string;
}

export interface ActivityItem {
  id: number;
  html: string;
}

interface AppState {
  conn: "connecting" | "live" | "down";
  view: ViewName;
  workspaces: WorkspaceEntry[];
  currentWs: string | null;
  role: Role;
  wsName: string;
  wsDesc: string;
  mock: boolean;
  clientId: string | null;
  activity: ActivityItem[];
  dagState: Record<string, string>; // "wf::step" -> fresh|stale|unbuilt|building|error
  focusList: FocusUser[];

  setConn: (c: AppState["conn"]) => void;
  setView: (v: ViewName) => void;
  setWorkspaces: (w: WorkspaceEntry[]) => void;
  setCurrentWs: (id: string | null) => void;
  setRole: (r: Role) => void;
  setWorkspaceMeta: (m: { name: string; description?: string; mock: boolean }) => void;
  setClientId: (id: string | null) => void;
  pushActivity: (html: string) => void;
  resetActivity: () => void;
  setNodeState: (key: string, state: string) => void;
  setDagState: (next: Record<string, string>) => void;
  setFocusList: (f: FocusUser[]) => void;
}

let actId = 1;

export const useApp = create<AppState>((set) => ({
  conn: "connecting",
  view: "workflows",
  workspaces: [],
  currentWs: null,
  role: "owner",
  wsName: "Loom",
  wsDesc: "",
  mock: false,
  clientId: null,
  activity: [],
  dagState: {},
  focusList: [],

  setConn: (conn) => set({ conn }),
  setView: (view) => set({ view }),
  setWorkspaces: (workspaces) => set({ workspaces }),
  setCurrentWs: (currentWs) => set({ currentWs }),
  setRole: (role) => set({ role }),
  setWorkspaceMeta: ({ name, description, mock }) => set({ wsName: name, wsDesc: description || "", mock }),
  setClientId: (clientId) => set({ clientId }),
  pushActivity: (html) =>
    set((s) => ({ activity: [{ id: actId++, html }, ...s.activity].slice(0, 60) })),
  resetActivity: () => set({ activity: [] }),
  setNodeState: (key, state) => set((s) => ({ dagState: { ...s.dagState, [key]: state } })),
  setDagState: (next) => set({ dagState: next }),
  setFocusList: (focusList) => set({ focusList }),
}));

export const canEdit = (role: Role) => role === "editor" || role === "owner";
export const isOwner = (role: Role) => role === "owner";
