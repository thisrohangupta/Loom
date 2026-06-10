import { LayoutGrid, BarChart3, FileText, Library, BookOpen, Package, GitCommit, Share2 } from "lucide-react";
import { useApp, type ViewName } from "@/lib/store";
import { collab } from "@/lib/collab";
import { cn } from "@/lib/utils";

const NAV: { id: ViewName; label: string; icon: any }[] = [
  { id: "workflows", label: "Workflows", icon: LayoutGrid },
  { id: "metrics", label: "Metrics", icon: BarChart3 },
  { id: "inputs", label: "Inputs", icon: FileText },
  { id: "context", label: "Context", icon: Library },
  { id: "prompts", label: "Prompts", icon: BookOpen },
  { id: "artifacts", label: "Artifacts", icon: Package },
  { id: "snapshots", label: "Snapshots", icon: GitCommit },
  { id: "share", label: "Share", icon: Share2 },
];

export function Sidebar() {
  const view = useApp((s) => s.view);
  const setView = useApp((s) => s.setView);
  const activity = useApp((s) => s.activity);

  const go = (id: ViewName) => {
    if (id === view) return;
    collab.closeDoc();
    collab.setFocus(null);
    setView(id);
  };

  return (
    <nav className="flex min-h-0 flex-col border-r bg-[hsl(var(--surface))] p-3">
      <div className="flex flex-col gap-0.5">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => go(id)}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
              view === id ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="mt-auto min-h-0 border-t pt-3">
        <div className="mb-2 text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">Activity</div>
        <ul className="max-h-[32vh] space-y-1 overflow-auto text-xs text-muted-foreground">
          {activity.length === 0 && <li className="italic">No activity yet.</li>}
          {activity.map((a) => (
            <li key={a.id} dangerouslySetInnerHTML={{ __html: a.html }} className="[&_b]:font-semibold [&_b]:text-foreground" />
          ))}
        </ul>
      </div>
    </nav>
  );
}
