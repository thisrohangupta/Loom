import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { snapshot, listSnapshots, readFileAtSnapshot, changedFiles } from "../src/core/snapshot.js";

function git(root: string, args: string[]) {
  execFileSync("git", args, { cwd: root });
}

function repoWithTwoSnapshots() {
  const root = mkdtempSync(join(tmpdir(), "loom-snap-"));
  git(root, ["init"]);
  git(root, ["config", "user.email", "t@t.co"]);
  git(root, ["config", "user.name", "t"]);
  writeFileSync(join(root, "doc.md"), "line one\nline two\n");
  const a = snapshot(root, "first");
  writeFileSync(join(root, "doc.md"), "line one\nline two changed\nline three\n");
  const b = snapshot(root, "second");
  return { root, a: a.hash!, b: b.hash! };
}

test("snapshot history lists newest first", () => {
  const { root } = repoWithTwoSnapshots();
  try {
    const snaps = listSnapshots(root);
    assert.equal(snaps.length, 2);
    assert.equal(snaps[0].subject, "second");
    assert.equal(snaps[1].subject, "first");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("readFileAtSnapshot returns content at each revision", () => {
  const { root, a, b } = repoWithTwoSnapshots();
  try {
    assert.match(readFileAtSnapshot(root, a, "doc.md")!, /line two\n/);
    assert.match(readFileAtSnapshot(root, b, "doc.md")!, /line two changed/);
    assert.equal(readFileAtSnapshot(root, a, "missing.md"), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("changedFiles lists files that differ between snapshots", () => {
  const { root, a, b } = repoWithTwoSnapshots();
  try {
    assert.deepEqual(changedFiles(root, a, b), ["doc.md"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
