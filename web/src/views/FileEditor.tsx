import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { collab, CRDT, editsFromDiff, type RemoteCursor, type PresenceUser } from "@/lib/collab";
import { api } from "@/lib/api";
import { useApp, canEdit } from "@/lib/store";
import { initials } from "@/lib/markdown";
import { toast } from "@/lib/toast";

function Editor({ path, editable }: { path: string; editable: boolean }) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<CRDT | null>(null);
  const lastText = useRef("");
  const lastAnchor = useRef("?");
  const cursors = useRef<RemoteCursor[]>([]);
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const me = collab.me;

  const renderCursors = () => {
    const ta = taRef.current, mirror = mirrorRef.current, layer = layerRef.current, doc = docRef.current;
    if (!ta || !mirror || !layer || !doc) return;
    layer.replaceChildren();
    const others = cursors.current.filter((c) => c.id !== collab.clientId);
    if (!others.length) return;
    const cs = getComputedStyle(ta);
    for (const p of ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"] as const) (mirror.style as any)[p] = cs[p];
    mirror.style.width = `${ta.clientWidth}px`;
    const text = ta.value;
    const lineH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5 || 18;
    for (const c of others) {
      const idx = doc.indexOfAnchor((c.anchor as any) ?? null);
      if (idx < 0) continue;
      mirror.textContent = text.slice(0, Math.min(idx, text.length));
      const marker = document.createElement("span");
      marker.textContent = "​";
      mirror.append(marker);
      const top = marker.offsetTop + 1 - ta.scrollTop;
      const left = marker.offsetLeft + 1 - ta.scrollLeft;
      if (top < -lineH || top > ta.clientHeight) continue;
      const el = document.createElement("span");
      el.style.cssText = `position:absolute;width:2px;border-radius:1px;left:${left}px;top:${top}px;height:${lineH}px;background:${c.color};animation:rcursor-blink 1.1s steps(2,start) infinite`;
      const flag = document.createElement("span");
      flag.textContent = c.name;
      flag.style.cssText = `position:absolute;bottom:100%;left:-1px;background:${c.color};color:#fff;font-size:.62rem;font-weight:600;line-height:1.5;padding:0 .35em;border-radius:4px 4px 4px 0;white-space:nowrap`;
      el.append(flag);
      layer.append(el);
    }
    mirror.textContent = "";
  };

  const applyText = (content: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const atEnd = pos >= ta.value.length;
    ta.value = content;
    lastText.current = content;
    const p = atEnd ? content.length : Math.min(pos, content.length);
    ta.selectionStart = ta.selectionEnd = p;
    renderCursors();
  };

  const pushLocalEdits = () => {
    const ta = taRef.current, doc = docRef.current;
    if (!ta || !doc) return;
    const ops = editsFromDiff(doc, lastText.current, ta.value);
    lastText.current = ta.value;
    if (ops.length) { collab.sendOps(path, ops); sendCursor(); renderCursors(); }
  };

  const sendCursor = () => {
    const ta = taRef.current, doc = docRef.current;
    if (!ta || !doc) return;
    const anchor = doc.anchorAt(ta.selectionStart);
    const key = anchor ? `${(anchor as any).c}:${(anchor as any).s}` : "start";
    if (key === lastAnchor.current) return;
    lastAnchor.current = key;
    collab.sendCursor(path, anchor);
  };

  useEffect(() => {
    docRef.current = null;
    lastText.current = "";
    lastAnchor.current = "?";
    cursors.current = [];
    setPresence([]);
    collab.openDoc({
      path,
      onSnapshot: (nodes) => { const d = new CRDT(collab.site); d.loadSnapshot(nodes); docRef.current = d; applyText(d.value()); },
      onOps: (ops) => { if (!docRef.current) return; pushLocalEdits(); docRef.current.applyMany(ops); applyText(docRef.current.value()); },
      onPresence: (users) => setPresence(users),
      onCursors: (cs) => { cursors.current = cs; renderCursors(); },
    });
    return () => collab.closeDoc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  const editTimer = useRef<any>(null);
  const cursorTimer = useRef<any>(null);

  const others = presence.filter((u) => u.id !== collab.clientId);

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <strong className="font-mono text-sm">{path}</strong>
          <span className="flex-1" />
          <span className="flex items-center gap-1">
            <span title={`You (${me.name})`} className="flex h-6 w-6 items-center justify-center rounded-full text-[0.62rem] font-bold text-white ring-2 ring-ring" style={{ background: me.color }}>{initials(me.name)}</span>
            {others.map((u) => (
              <span key={u.id} title={u.name} className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-card text-[0.62rem] font-bold text-white" style={{ background: u.color }}>{initials(u.name)}</span>
            ))}
            {others.length > 0 && <span className="ml-1 text-xs text-muted-foreground">{others.length} other{others.length === 1 ? "" : "s"} here</span>}
          </span>
          {editable && <Button size="sm" onClick={async () => { try { await api.put("/api/file", { path, content: taRef.current!.value }); toast("Published"); } catch (e: any) { toast(e.message); } }}>Publish</Button>}
        </div>
        <div className="relative">
          <textarea
            ref={taRef}
            readOnly={!editable}
            spellCheck={false}
            className="block min-h-[55vh] w-full resize-y rounded-md border border-input bg-card px-3.5 py-3 font-mono text-sm leading-relaxed shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onInput={() => { clearTimeout(editTimer.current); editTimer.current = setTimeout(pushLocalEdits, 200); }}
            onKeyUp={() => { clearTimeout(cursorTimer.current); cursorTimer.current = setTimeout(sendCursor, 80); }}
            onClick={() => { clearTimeout(cursorTimer.current); cursorTimer.current = setTimeout(sendCursor, 80); }}
            onScroll={renderCursors}
          />
          <div ref={layerRef} className="pointer-events-none absolute inset-0 overflow-hidden" />
          <div ref={mirrorRef} className="pointer-events-none invisible absolute left-0 top-0 box-border overflow-hidden whitespace-pre-wrap break-words" />
        </div>
      </CardContent>
    </Card>
  );
}

export function FileEditor({ dir, title }: { dir: "inputs" | "context" | "prompts"; title: string }) {
  const role = useApp((s) => s.role);
  const editable = canEdit(role);
  const [files, setFiles] = useState<{ label: string; path: string }[]>([]);
  const [current, setCurrent] = useState<string | null>(null);

  const load = async () => {
    if (dir === "prompts") {
      const { prompts } = await api.get("/api/prompts");
      setFiles((prompts || []).map((p: any) => ({ label: p.name, path: `prompts/${p.name}` })));
    } else {
      const { files } = await api.get(`/api/${dir}`);
      setFiles((files || []).map((f: string) => ({ label: f, path: f })));
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [dir]);

  const newFile = async () => {
    let name = prompt(`New file name in ${dir}/`, "untitled.md");
    if (!name) return;
    if (!/\.[a-z0-9]+$/i.test(name)) name += ".md";
    const path = `${dir}/${name}`;
    try { await api.put("/api/file", { path, content: "" }); await load(); setCurrent(path); } catch (e: any) { toast(e.message); }
  };
  const del = async (path: string) => {
    if (!confirm(`Delete ${path}?`)) return;
    try { await api.del(`/api/file?path=${encodeURIComponent(path)}`); if (current === path) setCurrent(null); await load(); } catch (e: any) { toast(e.message); }
  };

  return (
    <div>
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">{title}</h1>
      <Card className="mb-4">
        <CardContent className="p-3">
          <div className="mb-1 flex items-center gap-2 px-2 py-1">
            <strong className="font-mono text-sm text-muted-foreground">{dir}/</strong>
            <span className="flex-1" />
            {editable && <Button size="sm" onClick={newFile}>+ New</Button>}
          </div>
          {files.length === 0 && <p className="px-2 py-2 text-sm italic text-muted-foreground">Nothing here yet{editable ? " — create one with “+ New”." : "."}</p>}
          <ul>
            {files.map((it) => (
              <li key={it.path}
                className={"flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 hover:bg-accent " + (current === it.path ? "bg-muted" : "")}
                onClick={() => setCurrent(it.path)}>
                <span className="font-mono text-sm">{it.label}</span>
                <span className="flex-1" />
                {editable && <button title="delete" className="text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); del(it.path); }}>✕</button>}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      {current && <Editor key={current} path={current} editable={editable} />}
    </div>
  );
}
