import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DiffOps, DiffHead } from "@/components/DiffView";
import { api } from "@/lib/api";
import { useApp, canEdit } from "@/lib/store";
import { toast } from "@/lib/toast";

function Compare({ snapshots }: { snapshots: any[] }) {
  const [from, setFrom] = useState(snapshots[1].hash);
  const [to, setTo] = useState(snapshots[0].hash);
  const [files, setFiles] = useState<string[]>([]);
  const [diff, setDiff] = useState<{ d: any; path: string } | null>(null);

  useEffect(() => {
    setDiff(null);
    api.get(`/api/snapshot-changes?from=${from}&to=${to}`).then((r) => setFiles(r.files || [])).catch(() => setFiles([]));
  }, [from, to]);

  const showDiff = async (f: string) => {
    const d = await api.get(`/api/snapshot-diff?from=${from}&to=${to}&path=${encodeURIComponent(f)}`);
    setDiff({ d, path: f });
  };
  const opt = (s: any) => <SelectItem key={s.hash} value={s.hash}>{s.hash} · {s.subject.slice(0, 36)}</SelectItem>;

  return (
    <Card className="mt-4">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <strong>Compare snapshots</strong>
          <span className="flex-1" />
          <span className="text-sm text-muted-foreground">from</span>
          <Select value={from} onValueChange={setFrom}><SelectTrigger className="h-8 w-[16rem]"><SelectValue /></SelectTrigger><SelectContent>{snapshots.map(opt)}</SelectContent></Select>
          <span className="text-muted-foreground">→</span>
          <span className="text-sm text-muted-foreground">to</span>
          <Select value={to} onValueChange={setTo}><SelectTrigger className="h-8 w-[16rem]"><SelectValue /></SelectTrigger><SelectContent>{snapshots.map(opt)}</SelectContent></Select>
        </div>
        <p className="my-2 text-sm text-muted-foreground">Pick a changed file to see the diff between the two snapshots.</p>
        <div className="flex flex-wrap gap-2">
          {files.length === 0 && <span className="text-sm italic text-muted-foreground">No tracked files changed.</span>}
          {files.map((f) => <Button key={f} variant="outline" size="sm" onClick={() => showDiff(f)}>{f}</Button>)}
        </div>
        {diff && (
          <div className="mt-3">
            <DiffHead added={diff.d.stats.added} removed={diff.d.stats.removed} label={diff.path} />
            <DiffOps ops={diff.d.ops} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function Snapshots() {
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const role = useApp((s) => s.role);

  const load = () => api.get("/api/snapshots").then((r) => setSnapshots(r.snapshots || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const snapshot = async () => {
    try {
      const res = await api.post("/api/snapshot", { message: msg });
      if (res.ok) { toast(`Snapshot ${res.hash}`); setMsg(""); load(); }
      else toast(res.reason || "Nothing to snapshot");
    } catch (err: any) { toast(err.message); }
  };

  return (
    <div>
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">Snapshots</h1>
      {canEdit(role) && (
        <Card className="mb-4"><CardContent className="flex items-center gap-2 p-4">
          <Input placeholder="Snapshot message…" value={msg} onChange={(e) => setMsg(e.target.value)} className="flex-1" />
          <Button onClick={snapshot}>Snapshot</Button>
        </CardContent></Card>
      )}
      <Card><CardContent className="p-3">
        {snapshots.length === 0 && <p className="p-2 text-sm italic text-muted-foreground">No snapshots yet.</p>}
        <ul>
          {snapshots.map((s) => (
            <li key={s.hash} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-accent">
              <span className="font-mono text-sm text-foreground">{s.hash}</span>
              <span className="text-sm">{s.subject}</span>
              <span className="flex-1" />
              <span className="text-xs text-muted-foreground">{new Date(s.date).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </CardContent></Card>
      {snapshots.length >= 2 && <Compare snapshots={snapshots} />}
    </div>
  );
}
