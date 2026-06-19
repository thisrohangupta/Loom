import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Dag } from "@/components/Dag";
import { Markdown } from "@/components/Markdown";
import { DiffOps, DiffHead } from "@/components/DiffView";
import { api } from "@/lib/api";
import { collab } from "@/lib/collab";
import { useApp, canEdit } from "@/lib/store";
import { refreshStatuses } from "@/lib/actions";
import { initials } from "@/lib/markdown";
import { toast } from "@/lib/toast";

const LEGEND = [
  ["fresh", "hsl(var(--ok))"], ["stale", "hsl(var(--warn))"], ["unbuilt", "#a1a1aa"], ["error", "hsl(var(--destructive))"],
] as const;

function StepDetail({ wfId, step, onClose }: { wfId: string; step: any; onClose: () => void }) {
  const [tab, setTab] = useState("output");
  const [output, setOutput] = useState<string | null>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [diff, setDiff] = useState<any>(null);

  useEffect(() => {
    setOutput(null);
    api.get(`/api/step-output?workflow=${encodeURIComponent(wfId)}&step=${encodeURIComponent(step.id)}`)
      .then((r) => setOutput(r.content)).catch(() => setOutput(""));
  }, [wfId, step.id]);

  useEffect(() => {
    if (tab !== "diff") return;
    api.get(`/api/artifact-history?workflow=${encodeURIComponent(wfId)}&step=${encodeURIComponent(step.id)}`).then((h) => {
      setVersions(h.versions || []);
      if (h.versions?.length >= 2) { setFrom(h.versions[1].key); setTo(h.versions[0].key); }
    }).catch(() => {});
  }, [tab, wfId, step.id]);

  useEffect(() => {
    if (tab !== "diff" || !from || !to || from === to) { setDiff(null); return; }
    api.get(`/api/diff?from=${from}&to=${to}`).then(setDiff).catch(() => setDiff(null));
  }, [from, to, tab]);

  const vlabel = (v: any, i: number) => `v${versions.length - i}${v.current ? " (current)" : ""} · ${v.key.slice(0, 8)}`;

  return (
    <div className="mt-4 border-t pt-4">
      <div className="mb-3 flex items-center gap-2">
        <strong>{step.id}</strong>
        <Badge variant="outline">{step.type}</Badge>
        <span className="text-sm text-muted-foreground">→ {step.output}</span>
        <span className="flex-1" />
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList><TabsTrigger value="output">Output</TabsTrigger><TabsTrigger value="diff">Diff</TabsTrigger></TabsList>
        <TabsContent value="output">
          {output === null ? <p className="text-sm text-muted-foreground">Loading…</p>
            : output === "" ? <p className="text-sm italic text-muted-foreground">Not built yet — run the workflow.</p>
            : <div className="rounded-md border bg-card p-4"><Markdown content={output} /></div>}
        </TabsContent>
        <TabsContent value="diff">
          {versions.length < 2 ? <p className="text-sm italic text-muted-foreground">Need at least two versions — change an input and rebuild.</p> : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Select value={from} onValueChange={setFrom}><SelectTrigger className="h-8 w-[15rem]"><SelectValue /></SelectTrigger><SelectContent>{versions.map((v, i) => <SelectItem key={v.key} value={v.key}>{vlabel(v, i)}</SelectItem>)}</SelectContent></Select>
                <span className="text-muted-foreground">→</span>
                <Select value={to} onValueChange={setTo}><SelectTrigger className="h-8 w-[15rem]"><SelectValue /></SelectTrigger><SelectContent>{versions.map((v, i) => <SelectItem key={v.key} value={v.key}>{vlabel(v, i)}</SelectItem>)}</SelectContent></Select>
              </div>
              {diff && <><DiffHead added={diff.stats.added} removed={diff.stats.removed} /><DiffOps ops={diff.ops} /></>}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function WorkflowCard({ wf, onAddStep }: { wf: any; onAddStep: () => void }) {
  const role = useApp((s) => s.role);
  const focusList = useApp((s) => s.focusList);
  const clientId = useApp((s) => s.clientId);
  const [selected, setSelected] = useState<string | null>(null);
  const [log, setLog] = useState<{ text: string; cls?: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, [log]);

  const select = (stepId: string) => {
    if (selected === stepId) { setSelected(null); collab.setFocus(null); return; }
    setSelected(stepId);
    collab.setFocus(`${wf.id}::${stepId}`);
  };

  const build = async (force: boolean) => {
    setBusy(true);
    setLog([]);
    collab.logSink = (text, cls) => setLog((l) => [...(l || []), { text, cls }]);
    try { await api.post("/api/build", { workflow: wf.id, force }); }
    catch (err: any) { toast(err.message); }
    finally { setBusy(false); collab.logSink = null; }
  };
  const exportWf = async () => { try { const { url } = await api.post("/api/export", { workflow: wf.id }); window.open(url, "_blank"); } catch (e: any) { toast(e.message); } };

  const viewers = focusList.filter((u) => u.key.startsWith(`${wf.id}::`) && u.id !== clientId);
  const step = wf.steps.find((s: any) => s.id === selected);

  return (
    <Card className="mb-5">
      <CardContent className="p-5">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold">{wf.id}</h2>
          {viewers.length > 0 && (
            <span className="flex items-center gap-1">
              {viewers.map((u) => (
                <span key={u.id} title={`${u.name} · ${u.key.split("::")[1]}`}
                  className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-card text-[0.62rem] font-bold text-white"
                  style={{ background: u.color }}>{initials(u.name)}</span>
              ))}
            </span>
          )}
          <span className="flex-1" />
          {canEdit(role) && <><Button variant="outline" size="sm" onClick={onAddStep}>+ Step</Button>
            <Button size="sm" disabled={busy} onClick={() => build(false)}>Build</Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => build(true)}>Rebuild</Button></>}
          <Button variant="outline" size="sm" onClick={exportWf}>Export</Button>
        </div>
        {wf.description && <p className="mt-1 text-sm text-muted-foreground">{wf.description}</p>}
        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
          {LEGEND.map(([name, color]) => (
            <span key={name} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: color }} />{name}</span>
          ))}
          <span className="ml-auto">click a step to inspect its output and diffs</span>
        </div>
        <Dag wf={wf} selected={selected ? `${wf.id}::${selected}` : null} onSelect={select} />
        {log && (
          <div ref={logRef} className="max-h-[40vh] overflow-auto whitespace-pre-wrap rounded-md bg-[#18181b] p-3.5 font-mono text-xs text-[#e4e4e7]">
            {log.map((l, i) => (
              <span key={i} className={l.cls === "ok" ? "text-[#4ade80]" : l.cls === "err" ? "text-[#f87171]" : l.cls === "dim" ? "text-[#a1a1aa]" : ""}>{l.text}</span>
            ))}
          </div>
        )}
        {step && <StepDetail wfId={wf.id} step={step} onClose={() => { setSelected(null); collab.setFocus(null); }} />}
      </CardContent>
    </Card>
  );
}

function AddStepDialog({ wfId, open, onClose }: { wfId: string | null; open: boolean; onClose: (changed?: boolean) => void }) {
  const [f, setF] = useState<any>({ id: "", type: "inference", prompt: "", body: "", inputs: "", output: "", model: "", agentDir: "" });
  useEffect(() => { if (open) setF({ id: "", type: "inference", prompt: "", body: "", inputs: "", output: "", model: "", agentDir: "" }); }, [open, wfId]);
  const up = (k: string) => (e: any) => setF((s: any) => ({ ...s, [k]: e.target?.value ?? e }));

  const save = async () => {
    try {
      const config = (await api.get("/api/config")).config;
      const wf = config.workflows.find((w: any) => w.id === wfId);
      if (!wf) return;
      const step: any = { id: f.id.trim(), type: f.type, output: f.output.trim() };
      if (!step.id || !step.output) { toast("Step id and output are required."); return; }
      if (f.model.trim()) step.model = f.model.trim();
      const inps = f.inputs.split(",").map((s: string) => s.trim()).filter(Boolean);
      if (inps.length) step.inputs = inps;
      if (f.type === "inference") { if (f.prompt.trim()) step.prompt = f.prompt.trim(); else if (f.body.trim()) step.promptText = f.body; }
      else { if (f.body.trim()) step.instructions = f.body; else if (f.prompt.trim()) step.prompt = f.prompt.trim(); if (f.agentDir.trim()) step.agentDir = f.agentDir.trim(); }
      wf.steps.push(step);
      await api.put("/api/config", { config });
      toast("Step added");
      onClose(true);
    } catch (err: any) { toast(err.message); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add step to “{wfId}”</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5"><Label>Step id</Label><Input placeholder="e.g. summarize" value={f.id} onChange={up("id")} /></div>
          <div className="grid gap-1.5"><Label>Type</Label>
            <Select value={f.type} onValueChange={(v) => setF((s: any) => ({ ...s, type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="inference">inference</SelectItem><SelectItem value="agent">agent</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5"><Label>Prompt file</Label><Input placeholder="prompt file in prompts/ (optional)" value={f.prompt} onChange={up("prompt")} /><span className="text-xs text-muted-foreground">a file in prompts/ — or use the inline box below</span></div>
          <div className="grid gap-1.5"><Label>Inline prompt / instructions</Label><Textarea className="min-h-[7rem] font-mono text-sm" placeholder="inline prompt / agent instructions (optional). Use {{inputs}} and {{var}}." value={f.body} onChange={up("body")} /></div>
          <div className="grid gap-1.5"><Label>Inputs (comma-separated)</Label><Input placeholder="inputs/*.md, step:other, context:style" value={f.inputs} onChange={up("inputs")} /></div>
          <div className="grid gap-1.5"><Label>Output file</Label><Input placeholder="e.g. result.md" value={f.output} onChange={up("output")} /></div>
          <div className="grid gap-1.5"><Label>Model</Label><Input placeholder="(optional) e.g. claude-opus-4-8" value={f.model} onChange={up("model")} /></div>
          {f.type === "agent" && <div className="grid gap-1.5"><Label>Agent working dir</Label><Input placeholder="(agent) working dir, e.g. site" value={f.agentDir} onChange={up("agentDir")} /></div>}
        </div>
        <DialogFooter className="gap-2"><Button variant="outline" onClick={() => onClose()}>Cancel</Button><Button onClick={save}>Add step</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditYamlDialog({ open, onClose }: { open: boolean; onClose: (changed?: boolean) => void }) {
  const [raw, setRaw] = useState("");
  useEffect(() => { if (open) api.get("/api/config").then((r) => setRaw(r.raw)).catch(() => {}); }, [open]);
  const save = async () => { try { await api.put("/api/config", { raw }); toast("Saved"); onClose(true); } catch (err: any) { toast(err.message); } };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Edit loom.yaml</DialogTitle></DialogHeader>
        <Textarea className="min-h-[55vh] font-mono text-xs" value={raw} onChange={(e) => setRaw(e.target.value)} />
        <DialogFooter className="gap-2"><Button variant="outline" onClick={() => onClose()}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Workflows() {
  const role = useApp((s) => s.role);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [addStepFor, setAddStepFor] = useState<string | null>(null);
  const [editYaml, setEditYaml] = useState(false);

  const load = async () => {
    const w = await api.get("/api/workspace");
    setWorkflows(w.workflows || []);
    refreshStatuses(w.workflows || []);
  };
  useEffect(() => {
    load();
    collab.onInvalidate = () => load();
    return () => { collab.onInvalidate = null; };
  }, []);

  const newWorkflow = async () => {
    const id = prompt("New workflow id", "my-workflow");
    if (!id) return;
    try {
      const config = (await api.get("/api/config")).config;
      if ((config.workflows || []).some((w: any) => w.id === id)) { toast("That id already exists."); return; }
      config.workflows = config.workflows || [];
      config.workflows.push({ id: id.trim(), description: "", steps: [] });
      await api.put("/api/config", { config });
      toast("Workflow created");
      load();
    } catch (err: any) { toast(err.message); }
  };

  return (
    <div>
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">Workflows</h1>
      {canEdit(role) && (
        <div className="mb-4 flex gap-2">
          <Button size="sm" onClick={newWorkflow}>+ New workflow</Button>
          <Button variant="outline" size="sm" onClick={() => setEditYaml(true)}>Edit loom.yaml</Button>
        </div>
      )}
      {workflows.length === 0 && <p className="text-sm italic text-muted-foreground">No workflows yet — create one with “+ New workflow”.</p>}
      {workflows.map((wf) => <WorkflowCard key={wf.id} wf={wf} onAddStep={() => setAddStepFor(wf.id)} />)}
      <AddStepDialog wfId={addStepFor} open={!!addStepFor} onClose={(changed) => { setAddStepFor(null); if (changed) load(); }} />
      <EditYamlDialog open={editYaml} onClose={(changed) => { setEditYaml(false); if (changed) load(); }} />
    </div>
  );
}
