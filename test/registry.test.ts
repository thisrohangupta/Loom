import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Point the registry at a throwaway home BEFORE importing the module under test.
process.env.LOOM_HOME = mkdtempSync(join(tmpdir(), "loom-home-"));
const { listWorkspaces, addWorkspace, removeWorkspace, resolveWorkspaceRoot, workspaceId } = await import(
  "../src/core/registry.js"
);
const { scaffoldWorkspace } = await import("../src/core/scaffold.js");

function makeWs(name: string): string {
  const root = mkdtempSync(join(tmpdir(), "loom-reg-"));
  scaffoldWorkspace(root, name);
  return root;
}

test("registry starts empty", () => {
  assert.deepEqual(listWorkspaces(), []);
});

test("add registers a workspace and resolves its root", () => {
  const root = makeWs("alpha");
  // The registry canonicalizes through symlinks (so a path reached via /tmp and
  // /private/tmp mints one id), so the stored root is the realpath of `root`.
  const canonical = realpathSync(root);
  try {
    const entry = addWorkspace(root);
    assert.equal(entry.name, "alpha");
    assert.equal(entry.root, canonical);
    assert.equal(resolveWorkspaceRoot(entry.id), canonical);
    assert.ok(listWorkspaces().some((w) => w.id === entry.id));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("re-adding the same root keeps a stable id and de-dupes", () => {
  const root = makeWs("beta");
  try {
    const a = addWorkspace(root);
    const before = listWorkspaces().length;
    const b = addWorkspace(root);
    assert.equal(a.id, b.id, "id is stable across re-add");
    assert.equal(listWorkspaces().length, before, "no duplicate entry");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ids are deterministic from name + root and unique across roots", () => {
  const r1 = makeWs("dup");
  const r2 = makeWs("dup");
  try {
    assert.equal(workspaceId("dup", r1), workspaceId("dup", r1));
    assert.notEqual(workspaceId("dup", r1), workspaceId("dup", r2), "same name, different root → different id");
  } finally {
    rmSync(r1, { recursive: true, force: true });
    rmSync(r2, { recursive: true, force: true });
  }
});

test("remove drops a workspace; removing an unknown id is a no-op", () => {
  const root = makeWs("gamma");
  try {
    const entry = addWorkspace(root);
    assert.equal(removeWorkspace(entry.id), true);
    assert.equal(resolveWorkspaceRoot(entry.id), null);
    assert.equal(removeWorkspace(entry.id), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("addWorkspace rejects a directory with no loom workspace", async () => {
  const { findWorkspaceRoot } = await import("../src/core/workspace.js");
  const empty = mkdtempSync(join(tmpdir(), "loom-empty-"));
  try {
    // findWorkspaceRoot walks up to ancestors; only assert when tmp is clean
    // (it always is in CI — this just keeps the test honest on a dev box that
    // happens to have a loom.yaml somewhere above the temp dir).
    if (findWorkspaceRoot(empty)) return;
    assert.throws(() => addWorkspace(empty), /workspace/i);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});
