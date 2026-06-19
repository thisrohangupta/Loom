import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/Markdown";
import { DiffOps, DiffHead } from "@/components/DiffView";
import { api } from "@/lib/api";
import { toast } from "@/lib/toast";

export function Artifacts() {
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [open, setOpen] = useState<any>(null);
  const [content, setContent] = useState("");
  const [diff, setDiff] = useState<any>(null);

  useEffect(() => { api.get("/api/artifacts").then((r) => setArtifacts(r.artifacts || [])).catch(() => {}); }, []);

  const select = async (a: any) => {
    setDiff(null);
    setOpen(a);
    const { content } = await api.get(`/api/artifact?key=${a.key}`);
    setContent(content);
  };
  const doDiff = async (a: any) => {
    const hist = await api.get(`/api/artifact-history?workflow=${encodeURIComponent(a.workflowId)}&step=${encodeURIComponent(a.stepId)}`);
    const idx = hist.versions.findIndex((v: any) => v.key === a.key);
    const prev = hist.versions[idx + 1];
    if (!prev) { toast("No earlier version to diff against."); return; }
    const d = await api.get(`/api/diff?from=${prev.key}&to=${a.key}`);
    setDiff(d);
  };

  return (
    <div>
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">Artifacts</h1>
      {artifacts.length === 0 && <p className="text-sm italic text-muted-foreground">No artifacts yet — build a workflow.</p>}
      <div className="space-y-3">
        {artifacts.map((a) => {
          const u = a.usage || {};
          return (
            <Card key={a.key} className="cursor-pointer transition-colors hover:border-foreground/20" onClick={() => select(a)}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <strong className="text-sm">{a.workflowId} / {a.stepId}</strong>
                  <Badge variant="outline">{a.stepType}</Badge>
                  <span className="flex-1" />
                  <span className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</span>
                </div>
                <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">model</dt><dd>{a.model || "—"}</dd>
                  <dt className="text-muted-foreground">size</dt><dd>{a.contentBytes} B</dd>
                  <dt className="text-muted-foreground">tokens</dt>
                  <dd>{u.inputTokens ?? "?"} in / {u.outputTokens ?? "?"} out{u.costUsd != null ? ` · ~$${u.costUsd.toFixed(4)}` : ""}</dd>
                </dl>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {open && (
        <Card className="mt-4">
          <CardContent className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <strong>{open.workflowId} / {open.stepId}</strong>
              <span className="flex-1" />
              <Button variant="outline" size="sm" onClick={() => doDiff(open)}>Diff vs previous</Button>
              <span className="font-mono text-xs text-muted-foreground">{open.key.slice(0, 12)}</span>
            </div>
            <div className="rounded-md border bg-card p-4"><Markdown content={content} /></div>
            {diff && (
              <div className="mt-3">
                <DiffHead added={diff.stats.added} removed={diff.stats.removed} label={`${diff.from.key.slice(0, 8)} → ${diff.to.key.slice(0, 8)}`} />
                <DiffOps ops={diff.ops} />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
