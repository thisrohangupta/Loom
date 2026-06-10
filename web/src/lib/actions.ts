import { useApp } from "./store";
import { collab } from "./collab";
import { api, setCurrentWs } from "./api";
import { boot } from "@/App";

export async function switchWorkspace(id: string) {
  const app = useApp.getState();
  if (!id || id === app.currentWs) return;
  collab.closeDoc();
  collab.setFocus(null);
  app.setDagState({});
  app.setFocusList([]);
  app.setCurrentWs(id);
  setCurrentWs(id);
  collab.selectWorkspace(id);
  await boot();
}

export async function addWorkspacePrompt() {
  const root = prompt("Path to a Loom workspace (a directory with loom.yaml):");
  if (!root) return;
  const { workspace } = await api.post("/api/workspaces", { root });
  await switchWorkspace(workspace.id);
}

// Pull per-step freshness for every workflow and fold it into the DAG state.
export async function refreshStatuses(workflows: { id: string }[]) {
  const app = useApp.getState();
  const next = { ...app.dagState };
  for (const wf of workflows) {
    try {
      const { status } = await api.get(`/api/status?workflow=${encodeURIComponent(wf.id)}`);
      for (const s of status) {
        const key = `${wf.id}::${s.stepId}`;
        const state = s.fresh ? "fresh" : s.built ? "stale" : "unbuilt";
        if (next[key] !== "building") next[key] = state;
      }
    } catch {
      /* ignore */
    }
  }
  app.setDagState(next);
}
