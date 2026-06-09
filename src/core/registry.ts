/**
 * A small registry of known Loom workspaces, so a single `loom serve` can host
 * several workspaces at once and the web UI can switch between them.
 *
 * It is just a JSON file under the Loom home directory (`$LOOM_HOME` or
 * `~/.loom/workspaces.json`) listing `{ id, name, root }` entries. Each `id` is
 * stable for a given root (a slug of the name plus a short hash of the absolute
 * path), so two workspaces named "demo" never collide.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { loadWorkspace } from "./workspace.js";

export interface WorkspaceEntry {
  id: string;
  name: string;
  root: string;
}

function loomHome(): string {
  return process.env.LOOM_HOME || join(homedir(), ".loom");
}
function registryPath(): string {
  return join(loomHome(), "workspaces.json");
}

export function listWorkspaces(): WorkspaceEntry[] {
  const p = registryPath();
  if (!existsSync(p)) return [];
  try {
    const parsed = JSON.parse(readFileSync(p, "utf8"));
    return Array.isArray(parsed) ? (parsed as WorkspaceEntry[]) : [];
  } catch {
    return [];
  }
}

function save(list: WorkspaceEntry[]): void {
  mkdirSync(loomHome(), { recursive: true });
  writeFileSync(registryPath(), JSON.stringify(list, null, 2));
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "workspace"
  );
}

export function workspaceId(name: string, root: string): string {
  const h = createHash("sha1").update(resolve(root)).digest("hex").slice(0, 6);
  return `${slug(name)}-${h}`;
}

/** Register the workspace rooted at `root` (idempotent; updates name on re-add). */
export function addWorkspace(root: string): WorkspaceEntry {
  const abs = resolve(root);
  const ws = loadWorkspace(abs); // throws if there's no workspace here
  // Keep the id stable if this root is already registered; otherwise mint one.
  const existing = listWorkspaces().find((e) => e.root === abs);
  const entry: WorkspaceEntry = {
    id: existing?.id ?? workspaceId(ws.config.name, abs),
    name: ws.config.name,
    root: abs,
  };
  const list = listWorkspaces().filter((e) => e.root !== abs);
  list.push(entry);
  save(list);
  return entry;
}

export function removeWorkspace(id: string): boolean {
  const list = listWorkspaces();
  const next = list.filter((e) => e.id !== id);
  if (next.length === list.length) return false;
  save(next);
  return true;
}

export function resolveWorkspaceRoot(id: string): string | null {
  return listWorkspaces().find((e) => e.id === id)?.root ?? null;
}

export function getWorkspace(id: string): WorkspaceEntry | null {
  return listWorkspaces().find((e) => e.id === id) ?? null;
}
