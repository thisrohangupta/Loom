import { CRDT, editsFromDiff, type Op, type OpId } from "./crdt";
import { useApp, type Role } from "./store";
import { getToken } from "./api";
import { toast } from "./toast";

const NAMES = ["Maple", "Cedar", "Wren", "Onyx", "Sage", "Rowan", "Iris", "Flint", "Lark", "Juno"];
const COLORS = ["#c2643c", "#3f8f5b", "#3b6fb0", "#9c4dcc", "#c08a2c", "#1c8a8a"];

function loadIdentity(): { name: string; color: string } {
  try {
    const saved = JSON.parse(localStorage.getItem("loom.user") || "null");
    if (saved && saved.name) return saved;
  } catch {
    /* ignore */
  }
  const me = {
    name: NAMES[Math.floor(Math.random() * NAMES.length)],
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  };
  localStorage.setItem("loom.user", JSON.stringify(me));
  return me;
}

export interface PresenceUser { id: string; name: string; color: string }
export interface RemoteCursor { id: string; name: string; color: string; anchor: OpId | null }

// Handlers a mounted editor registers for the file it has open.
export interface DocHandlers {
  path: string;
  onSnapshot: (nodes: any[]) => void;
  onOps: (ops: Op[]) => void;
  onPresence: (users: PresenceUser[]) => void;
  onCursors: (cursors: RemoteCursor[]) => void;
}

class Collab {
  ws: WebSocket | null = null;
  wsId: string | null = null;
  clientId: string | null = null;
  site = 1;
  me = loadIdentity();
  focus: string | null = null;
  doc: DocHandlers | null = null;
  logSink: ((text: string, cls?: string) => void) | null = null;
  onInvalidate: (() => void) | null = null;

  send(obj: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  connect() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const tok = getToken(this.wsId);
    const ws = new WebSocket(`${proto}://${location.host}/ws${tok ? "?token=" + encodeURIComponent(tok) : ""}`);
    this.ws = ws;
    ws.onopen = () => useApp.getState().setConn("live");
    ws.onclose = () => {
      useApp.getState().setConn("down");
      setTimeout(() => this.connect(), 1500);
    };
    ws.onmessage = (ev) => this.handle(JSON.parse(ev.data));
  }

  private handle(m: any) {
    const app = useApp.getState();
    if (m.type === "hello") {
      this.clientId = m.clientId;
      if (typeof m.site === "number") this.site = m.site;
      app.setClientId(m.clientId);
      if (!this.wsId && m.ws) this.wsId = m.ws;
      this.send({ type: "identify", name: this.me.name, color: this.me.color });
      if (this.wsId) this.send({ type: "ws.select", ws: this.wsId, token: getToken(this.wsId) });
      if (this.doc) this.send({ type: "doc.open", path: this.doc.path });
      if (this.focus) this.send({ type: "focus", focus: this.focus });
      return;
    }
    if (m.type === "ws.role") {
      if (m.data.ws === this.wsId) app.setRole(m.data.role as Role);
      return;
    }
    if (m.type === "presence.focus") {
      if (m.data.ws && m.data.ws !== this.wsId) return;
      app.setFocusList(m.data.focus || []);
      return;
    }
    if (m.type === "doc.snapshot" || m.type === "doc.ops" || m.type === "presence" || m.type === "doc.cursors") {
      if (m.data.ws && m.data.ws !== this.wsId) return;
      if (!this.doc || m.data.path !== this.doc.path) return;
      if (m.type === "doc.snapshot") this.doc.onSnapshot(m.data.nodes);
      else if (m.type === "doc.ops") { if (m.data.by !== this.clientId) this.doc.onOps(m.data.ops); }
      else if (m.type === "presence") this.doc.onPresence(m.data.users);
      else if (m.type === "doc.cursors") this.doc.onCursors(m.data.cursors);
      return;
    }
    if (m.ws && m.ws !== this.wsId) return; // build/file/export event from another workspace
    this.event(m);
  }

  // build / file / snapshot / export events
  event(e: any) {
    const app = useApp.getState();
    const key = e.data && e.data.workflowId && e.data.stepId ? `${e.data.workflowId}::${e.data.stepId}` : null;
    switch (e.type) {
      case "build.start":
        this.logSink?.(`build ${e.data.workflowId} → ${e.data.steps.join(" → ")}\n`, "dim");
        app.pushActivity(`build <b>${e.data.workflowId}</b> started`);
        break;
      case "step.start":
        if (key) app.setNodeState(key, "building");
        this.logSink?.(`▶ ${e.data.stepId}…\n`, "dim");
        break;
      case "step.delta":
        this.logSink?.(e.data.text);
        break;
      case "step.cached":
        if (key) app.setNodeState(key, "fresh");
        this.logSink?.(`◌ ${e.data.stepId} cached\n`, "dim");
        break;
      case "step.done": {
        const u = e.data.usage || {};
        const cost = u.costUsd != null ? ` ~$${u.costUsd.toFixed(4)}` : "";
        if (key) app.setNodeState(key, "fresh");
        this.logSink?.(`\n✓ ${e.data.stepId} (${e.data.bytes}B ${e.data.durationMs}ms${cost})\n`, "ok");
        break;
      }
      case "step.error":
        if (key) app.setNodeState(key, "error");
        this.logSink?.(`\n✗ ${e.data.stepId}: ${e.data.error}\n`, "err");
        app.pushActivity(`<b>${e.data.stepId}</b> failed`);
        break;
      case "build.done":
        this.logSink?.(e.data.ok ? `\nbuild complete\n` : `\nbuild failed at ${e.data.failedAt}\n`, e.data.ok ? "ok" : "err");
        app.pushActivity(`build <b>${e.data.workflowId}</b> ${e.data.ok ? "done" : "failed"}`);
        this.onInvalidate?.();
        break;
      case "file.changed":
        app.pushActivity(`edited <b>${e.data.path}</b>`);
        if (!e.data.deleted) toast(`Updated ${e.data.path}`);
        break;
      case "snapshot":
        app.pushActivity(`snapshot <b>${e.data.hash || ""}</b>`);
        break;
      case "export":
        app.pushActivity(`exported <b>${e.data.workflowId}</b>`);
        break;
    }
  }

  selectWorkspace(id: string) {
    this.closeDoc();
    this.setFocus(null);
    this.wsId = id;
    this.send({ type: "ws.select", ws: id, token: getToken(id) });
  }

  setFocus(key: string | null) {
    if (this.focus === key) return;
    this.focus = key;
    this.send({ type: "focus", focus: key });
  }

  openDoc(h: DocHandlers) {
    this.closeDoc();
    this.doc = h;
    this.send({ type: "doc.open", path: h.path });
  }
  closeDoc() {
    if (this.doc) this.send({ type: "doc.close", path: this.doc.path });
    this.doc = null;
  }
  sendOps(path: string, ops: Op[]) {
    if (ops.length) this.send({ type: "doc.ops", path, ops });
  }
  sendCursor(path: string, anchor: OpId | null) {
    this.send({ type: "cursor", path, anchor });
  }
}

export const collab = new Collab();
export { CRDT, editsFromDiff };
export type { Op, OpId };
