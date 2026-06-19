import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

function Stat({ label, value, sub, good }: { label: string; value: string; sub?: string; good?: boolean }) {
  return (
    <Card className={cn("p-5", good && "border-[hsl(var(--ok)/0.4)] bg-[hsl(var(--ok)/0.06)]")}>
      <div className={cn("text-3xl font-bold tracking-tight tabular-nums", good && "text-[hsl(var(--ok))]")}>{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}

export function Metrics() {
  const [m, setM] = useState<any>(null);
  const refreshKey = useApp((s) => s.activity[0]?.id ?? 0); // re-pull when something happens

  useEffect(() => {
    api.get("/api/metrics").then((r) => setM(r.metrics)).catch(() => {});
  }, [refreshKey]);

  if (!m) return <h1 className="mb-5 text-2xl font-semibold tracking-tight">Metrics</h1>;
  const usd = (n: number) => `$${n.toFixed(4)}`;
  const tokensIn = m.tokensIn ?? 0;
  const tokensOut = m.tokensOut ?? 0;

  return (
    <div>
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">Metrics</h1>
      {useApp.getState().mock && (
        <div className="mb-5 rounded-md border border-[hsl(var(--warn)/0.4)] bg-[hsl(var(--warn)/0.1)] px-4 py-2.5 text-sm text-[#92400e]">
          Mock mode — outputs are synthesized offline and costs are modeled estimates.
        </div>
      )}
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        <Stat good label="Saved by caching" value={usd(m.savedUsd)} sub={`${m.cacheHits} cache hit${m.cacheHits === 1 ? "" : "s"}`} />
        <Stat label="Spent on model calls" value={usd(m.spentUsd)} sub={`${m.modelCalls} call${m.modelCalls === 1 ? "" : "s"}`} />
        <Stat label="Cache hit rate" value={`${Math.round(m.cacheHitRate * 100)}%`} />
        <Stat label="Tokens" value={(tokensIn + tokensOut).toLocaleString()} sub={`${tokensIn.toLocaleString()} in / ${tokensOut.toLocaleString()} out`} />
        <Stat label="Artifacts" value={String(m.artifacts)} />
        <Stat label="Builds" value={String(m.builds)} sub={m.lastBuildAt ? `last ${new Date(m.lastBuildAt).toLocaleString()}` : undefined} />
      </div>
      <p className="mt-5 max-w-3xl text-sm text-muted-foreground">
        “Saved by caching” is the model spend avoided by serving unchanged steps from cache instead of recomputing them — the core of treating LLM work like a build.
      </p>
    </div>
  );
}
