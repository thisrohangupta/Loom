import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DiffOp { type: "eq" | "add" | "del"; text: string }

export function DiffOps({ ops }: { ops: DiffOp[] }) {
  const CONTEXT = 3;
  const keep = new Array(ops.length).fill(false);
  ops.forEach((o, i) => {
    if (o.type !== "eq") for (let k = i - CONTEXT; k <= i + CONTEXT; k++) if (k >= 0 && k < ops.length) keep[k] = true;
  });
  const rows: ReactNode[] = [];
  let i = 0;
  while (i < ops.length) {
    if (!keep[i]) {
      let j = i;
      while (j < ops.length && !keep[j]) j++;
      rows.push(<div key={`s${i}`} className="bg-[hsl(var(--surface))] px-2 py-0.5 text-center italic text-muted-foreground">⋯ {j - i} unchanged line{j - i === 1 ? "" : "s"}</div>);
      i = j;
      continue;
    }
    const o = ops[i];
    const sign = o.type === "add" ? "+" : o.type === "del" ? "−" : " ";
    rows.push(
      <div key={i} className={cn("flex gap-2 whitespace-pre-wrap break-words px-2 py-px",
        o.type === "add" && "bg-[hsl(var(--ok)/0.12)]", o.type === "del" && "bg-destructive/10")}>
        <span className={cn("w-3 flex-none select-none", o.type === "add" ? "text-[hsl(var(--ok))]" : o.type === "del" ? "text-destructive" : "text-muted-foreground")}>{sign}</span>
        <span className="flex-1">{o.text}</span>
      </div>
    );
    i++;
  }
  if (!ops.length) rows.push(<div key="id" className="px-2 py-0.5 text-center italic text-muted-foreground">identical</div>);
  return <div className="overflow-auto rounded-md border bg-card font-mono text-[0.82rem]">{rows}</div>;
}

export function DiffHead({ added, removed, label }: { added: number; removed: number; label?: string }) {
  return (
    <div className="mb-2 flex items-center gap-3 font-mono text-[0.82rem]">
      <span className="font-semibold text-[hsl(var(--ok))]">+{added}</span>
      <span className="font-semibold text-destructive">−{removed}</span>
      {label && <span className="text-muted-foreground">{label}</span>}
    </div>
  );
}
