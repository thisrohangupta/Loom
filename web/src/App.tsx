import { useEffect } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Topbar } from "@/components/Topbar";
import { Sidebar } from "@/components/Sidebar";
import { Toaster } from "@/components/Toaster";
import { Workflows } from "@/views/Workflows";
import { Metrics } from "@/views/Metrics";
import { FileEditor } from "@/views/FileEditor";
import { Artifacts } from "@/views/Artifacts";
import { Snapshots } from "@/views/Snapshots";
import { Share } from "@/views/Share";
import { useApp } from "@/lib/store";
import { collab } from "@/lib/collab";
import { api, setCurrentWs, setToken } from "@/lib/api";

// An invite link carries ?ws=…&token=… — stash the token and scrub it from the
// address bar so it isn't shoulder-surfed or bookmarked.
function consumeInviteLink(): string | null {
  const p = new URLSearchParams(location.search);
  const ws = p.get("ws");
  const token = p.get("token");
  if (ws && token) {
    setToken(ws, token);
    p.delete("token");
    const qs = p.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : ""));
  }
  return ws;
}

export async function boot() {
  const app = useApp.getState();
  const ws = await api.get("/api/workspaces").catch(() => ({ workspaces: [], current: null }));
  app.setWorkspaces(ws.workspaces || []);
  const current = useApp.getState().currentWs || ws.current || (ws.workspaces?.[0]?.id ?? null);
  app.setCurrentWs(current);
  setCurrentWs(current);
  collab.wsId = current;

  const w = await api.get("/api/workspace");
  app.setRole(w.role || "viewer");
  app.setWorkspaceMeta({ name: w.name, description: w.description, mock: w.mock });

  app.resetActivity();
  const events = await api.get("/api/events?limit=20").catch(() => ({ events: [] }));
  (events.events || []).reverse().forEach((e: any) => collab.event(e));
}

export function App() {
  const view = useApp((s) => s.view);

  useEffect(() => {
    const urlWs = consumeInviteLink();
    if (urlWs) { useApp.getState().setCurrentWs(urlWs); setCurrentWs(urlWs); collab.wsId = urlWs; }
    boot().catch((err) => useApp.getState().setWorkspaceMeta({ name: "No workspace", description: String(err.message || err), mock: false }));
    collab.connect();
  }, []);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen flex-col bg-background text-foreground">
        <Topbar />
        <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: "224px 1fr" }}>
          <Sidebar />
          <main className="min-w-0 overflow-auto px-8 py-6">
            {view === "workflows" && <Workflows />}
            {view === "metrics" && <Metrics />}
            {view === "inputs" && <FileEditor key="inputs" dir="inputs" title="Inputs" />}
            {view === "context" && <FileEditor key="context" dir="context" title="Context" />}
            {view === "prompts" && <FileEditor key="prompts" dir="prompts" title="Prompts" />}
            {view === "artifacts" && <Artifacts />}
            {view === "snapshots" && <Snapshots />}
            {view === "share" && <Share />}
          </main>
        </div>
      </div>
      <Toaster />
    </TooltipProvider>
  );
}
