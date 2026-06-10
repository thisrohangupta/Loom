import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { useApp, canEdit, isOwner } from "@/lib/store";
import { toast } from "@/lib/toast";

function ShareLinkRow({ url }: { url: string }) {
  const full = location.origin + url;
  return (
    <div className="mt-2 flex items-center gap-2">
      <Input readOnly value={full} className="flex-1 font-mono text-xs" />
      <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(full).then(() => toast("Link copied")); }}>Copy</Button>
      <Button variant="outline" size="sm" asChild><a href={url} target="_blank" rel="noreferrer">Open</a></Button>
      <Button variant="outline" size="sm" asChild><a href={url} download="">Download</a></Button>
    </div>
  );
}

function Collaborators() {
  const [role, setRole] = useState("editor");
  const [label, setLabel] = useState("");
  const [tokens, setTokens] = useState<any[]>([]);
  const [invite, setInvite] = useState<{ link: string; role: string } | null>(null);

  const refresh = () => api.get("/api/share").then((r) => setTokens(r.tokens || [])).catch(() => {});
  useEffect(() => { refresh(); }, []);

  const create = async () => {
    try {
      const { link } = await api.post("/api/share", { role, label });
      setInvite({ link, role });
      setLabel("");
      refresh();
    } catch (err: any) { toast(err.message); }
  };
  const revoke = async (t: any) => {
    if (!confirm(`Revoke this ${t.role} link${t.label ? ` (${t.label})` : ""}?`)) return;
    try { await api.del(`/api/share?id=${encodeURIComponent(t.id)}`); refresh(); } catch (err: any) { toast(err.message); }
  };

  const inviteUrl = invite ? location.origin + location.pathname + invite.link : "";

  return (
    <Card className="mb-5">
      <CardContent className="p-5">
        <div className="flex items-center gap-2">
          <strong>Collaborators</strong>
          <span className="text-sm text-muted-foreground">share a live link — anyone with it joins with that role</span>
        </div>
        <div className="my-3 flex items-center gap-2">
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="w-[15rem]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="editor">editor — can edit &amp; build</SelectItem>
              <SelectItem value="viewer">viewer — read-only</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} className="flex-1" />
          <Button onClick={create}>Create invite link</Button>
        </div>
        {invite && (
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="muted" className="uppercase">{invite.role}</Badge>
            <Input readOnly value={inviteUrl} className="flex-1 font-mono text-xs" />
            <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(inviteUrl).then(() => toast("Invite link copied")); }}>Copy</Button>
          </div>
        )}
        <div>
          {tokens.length === 0 && <p className="text-sm italic text-muted-foreground">No invite links yet.</p>}
          {tokens.map((t) => (
            <div key={t.id} className="flex items-center gap-2 border-b py-2 last:border-0">
              <Badge variant="muted" className="uppercase">{t.role}</Badge>
              <span className="text-sm">{t.label || <span className="text-muted-foreground">—</span>}</span>
              <span className="flex-1" />
              <span className="text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleDateString()}</span>
              <Button variant="ghost" size="sm" onClick={() => revoke(t)}>✕</Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function Share() {
  const role = useApp((s) => s.role);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [allUrl, setAllUrl] = useState<string | null>(null);
  const [wfUrls, setWfUrls] = useState<Record<string, string>>({});

  useEffect(() => { api.get("/api/workspace").then((w) => setWorkflows(w.workflows || [])).catch(() => {}); }, []);

  const exportAll = async () => { try { const { indexUrl, pages } = await api.post("/api/export-all", {}); setAllUrl(indexUrl); toast(`Exported ${pages.length} workflow${pages.length === 1 ? "" : "s"}`); } catch (e: any) { toast(e.message); } };
  const exportBundle = async () => { try { const { url } = await api.post("/api/export-bundle", {}); setAllUrl(url); toast("Bundled into one self-contained file"); } catch (e: any) { toast(e.message); } };
  const exportWf = async (id: string) => { try { const { url } = await api.post("/api/export", { workflow: id }); setWfUrls((m) => ({ ...m, [id]: url })); } catch (e: any) { toast(e.message); } };

  return (
    <div>
      <h1 className="mb-5 text-2xl font-semibold tracking-tight">Share</h1>
      {isOwner(role) && <Collaborators />}
      <p className="mb-4 text-sm text-muted-foreground">
        Exports are self-contained HTML — open offline, email them, or host anywhere. The links below work while this local server runs.
      </p>
      <Card className="mb-3"><CardContent className="p-5">
        <div className="flex items-center gap-2">
          <strong>Whole workspace</strong>
          <span className="text-sm text-muted-foreground">a linked index, or one self-contained file</span>
          <span className="flex-1" />
          {canEdit(role) && <><Button variant="outline" onClick={exportBundle}>Single file</Button><Button onClick={exportAll}>Export everything</Button></>}
        </div>
        {allUrl && <ShareLinkRow url={allUrl} />}
      </CardContent></Card>
      {workflows.map((wf) => (
        <Card key={wf.id} className="mb-3"><CardContent className="p-5">
          <div className="flex items-center gap-2">
            <strong>{wf.id}</strong>
            <span className="text-sm text-muted-foreground">{wf.description}</span>
            <span className="flex-1" />
            {canEdit(role) && <Button size="sm" onClick={() => exportWf(wf.id)}>Export &amp; link</Button>}
          </div>
          {wfUrls[wf.id] && <ShareLinkRow url={wfUrls[wf.id]} />}
        </CardContent></Card>
      ))}
    </div>
  );
}
