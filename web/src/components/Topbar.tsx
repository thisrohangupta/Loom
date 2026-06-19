import { Plus, Layers } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useApp, isOwner } from "@/lib/store";
import { switchWorkspace, addWorkspacePrompt } from "@/lib/actions";
import { toast } from "@/lib/toast";

export function Topbar() {
  const { wsName, wsDesc, mock, workspaces, currentWs, role, conn } = useApp();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-5">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Layers className="h-4 w-4" />
        </div>
        <div className="flex items-baseline gap-2">
          <strong className="text-[0.95rem] font-semibold tracking-tight">{wsName}</strong>
          <span className="hidden max-w-[42ch] truncate text-sm text-muted-foreground md:inline">{wsDesc}</span>
          {mock && (
            <Badge className="bg-[hsl(var(--warn))] text-white" variant="default">mock</Badge>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          {workspaces.length > 0 && currentWs && (
            <Select value={currentWs} onValueChange={(v) => switchWorkspace(v).catch((e) => toast(e.message))}>
              <SelectTrigger className="h-8 w-[12rem] text-sm font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {isOwner(role) && (
            <Button variant="outline" size="icon" className="h-8 w-8" title="Add a workspace by path"
              onClick={() => addWorkspacePrompt().catch((e) => toast(e.message))}>
              <Plus className="h-4 w-4" />
            </Button>
          )}
          {role !== "owner" && (
            <Badge variant="outline" className="uppercase tracking-wide" title={`You have ${role} access`}>{role}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className={"h-2 w-2 rounded-full " + (conn === "live" ? "bg-[hsl(var(--ok))]" : conn === "down" ? "bg-destructive" : "bg-muted-foreground")} />
          {conn === "live" ? "live" : conn === "down" ? "reconnecting…" : "connecting…"}
        </div>
      </div>
    </header>
  );
}
