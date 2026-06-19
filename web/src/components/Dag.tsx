import { useApp } from "@/lib/store";
import { initials } from "@/lib/markdown";

const NODE_W = 188, NODE_H = 56, COL_GAP = 64, ROW_GAP = 28, PAD = 16;

function layout(wf: any) {
  const deps: Record<string, string[]> = {};
  wf.steps.forEach((s: any) => (deps[s.id] = []));
  wf.edges.forEach((e: any) => { if (deps[e.to]) deps[e.to].push(e.from); });
  const rank: Record<string, number> = {};
  const rk = (id: string, seen = new Set<string>()): number => {
    if (rank[id] != null) return rank[id];
    if (seen.has(id)) return 0;
    seen.add(id);
    let r = 0;
    for (const d of deps[id] || []) r = Math.max(r, rk(d, seen) + 1);
    return (rank[id] = r);
  };
  wf.steps.forEach((s: any) => rk(s.id));
  const cols: Record<number, any[]> = {};
  wf.steps.forEach((s: any) => { const r = rank[s.id]; (cols[r] = cols[r] || []).push(s); });
  const ranks = Object.keys(cols).map(Number);
  const maxRank = ranks.length ? Math.max(...ranks) : 0;
  const maxCol = Math.max(1, ...Object.values(cols).map((c) => c.length));
  const pos: Record<string, { x: number; y: number }> = {};
  for (let r = 0; r <= maxRank; r++) {
    const col = cols[r] || [];
    const offsetY = ((maxCol - col.length) * (NODE_H + ROW_GAP)) / 2;
    col.forEach((s, idx) => { pos[s.id] = { x: PAD + r * (NODE_W + COL_GAP), y: PAD + offsetY + idx * (NODE_H + ROW_GAP) }; });
  }
  return { pos, width: PAD * 2 + (maxRank + 1) * NODE_W + maxRank * COL_GAP, height: PAD * 2 + maxCol * NODE_H + (maxCol - 1) * ROW_GAP };
}

const fit = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + "…" : s);

const COLORS: Record<string, { box: string; dot: string }> = {
  fresh: { box: "hsl(var(--ok)/0.5)", dot: "hsl(var(--ok))" },
  stale: { box: "hsl(var(--warn)/0.5)", dot: "hsl(var(--warn))" },
  unbuilt: { box: "hsl(var(--border))", dot: "#a1a1aa" },
  error: { box: "hsl(var(--destructive)/0.5)", dot: "hsl(var(--destructive))" },
  building: { box: "hsl(var(--ring))", dot: "hsl(var(--ring))" },
  selected: { box: "hsl(var(--ring))", dot: "" },
};

export function Dag({ wf, selected, onSelect }: { wf: any; selected: string | null; onSelect: (id: string) => void }) {
  const dagState = useApp((s) => s.dagState);
  const focusList = useApp((s) => s.focusList);
  const clientId = useApp((s) => s.clientId);
  const { pos, width, height } = layout(wf);

  const viewersFor = (key: string) =>
    focusList.filter((u) => u.key === key && u.id !== clientId);

  return (
    <div className="overflow-auto py-2">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
        {wf.edges.map((e: any, i: number) => {
          const a = pos[e.from], b = pos[e.to];
          if (!a || !b) return null;
          const sx = a.x + NODE_W, sy = a.y + NODE_H / 2, tx = b.x, ty = b.y + NODE_H / 2;
          const dx = Math.max(28, (tx - sx) / 2);
          return <path key={i} d={`M${sx},${sy} C${sx + dx},${sy} ${tx - dx},${ty} ${tx},${ty}`} fill="none" stroke="hsl(var(--border))" strokeWidth={1.6} />;
        })}
        {wf.steps.map((step: any) => {
          const key = `${wf.id}::${step.id}`;
          const state = dagState[key] || "unbuilt";
          const isSel = key === selected;
          const c = COLORS[state] || COLORS.unbuilt;
          const p = pos[step.id];
          const viewers = viewersFor(key);
          return (
            <g key={step.id} transform={`translate(${p.x},${p.y})`} className="cursor-pointer" onClick={() => onSelect(step.id)}>
              <rect width={NODE_W} height={NODE_H} rx={12}
                fill={isSel ? "hsl(var(--muted))" : "hsl(var(--card))"}
                stroke={isSel ? COLORS.selected.box : c.box}
                strokeWidth={isSel ? 2.5 : 1.5} />
              <circle cx={NODE_W - 16} cy={16} r={5} fill={c.dot}
                style={state === "building" ? { animation: "node-pulse 1s ease-in-out infinite" } : undefined} />
              <text x={14} y={24} fontSize={13} fontWeight={600} fill="hsl(var(--foreground))">{fit(step.id, 20)}</text>
              <text x={14} y={42} fontSize={11} className="font-mono" fill="hsl(var(--muted-foreground))">{fit(`${step.type} → ${step.output}`, 23)}</text>
              {viewers.slice(0, 4).map((u, i) => (
                <g key={u.id} transform={`translate(${16 + i * 15},-1)`} style={{ animation: "navatar-pop .18s ease-out" }}>
                  <title>{u.name} is viewing this step</title>
                  <circle r={9} fill={u.color} stroke="hsl(var(--card))" strokeWidth={2} />
                  <text x={0} y={3} fontSize={8.5} fontWeight={700} textAnchor="middle" fill="#fff" className="font-mono">{initials(u.name)}</text>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
