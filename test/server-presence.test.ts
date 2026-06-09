import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { scaffoldWorkspace } from "../src/core/scaffold.js";
import { startServer, type ServerHandle } from "../src/server/server.js";

// A tiny test client that records messages and lets a test await a predicate.
function connect(port: number, name: string) {
  const ws = new WebSocket(`ws://localhost:${port}/ws`);
  const msgs: any[] = [];
  const waiters: Array<{ pred: (m: any) => boolean; resolve: (m: any) => void }> = [];
  const client = {
    ws,
    id: null as string | null,
    send: (o: unknown) => ws.send(JSON.stringify(o)),
    // resolve as soon as a matching message has arrived (now or later)
    waitFor(pred: (m: any) => boolean, ms = 2000): Promise<any> {
      const hit = msgs.find(pred);
      if (hit) return Promise.resolve(hit);
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`${name}: timed out waiting for message`)), ms);
        waiters.push({ pred, resolve: (m) => { clearTimeout(t); resolve(m); } });
      });
    },
    close: () => ws.close(),
  };
  ws.on("message", (raw) => {
    const m = JSON.parse(raw.toString());
    msgs.push(m);
    if (m.type === "hello") {
      client.id = m.clientId;
      client.send({ type: "identify", name, color: "#3b6fb0" });
    }
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].pred(m)) { waiters[i].resolve(m); waiters.splice(i, 1); }
    }
  });
  return new Promise<typeof client>((resolve, reject) => {
    ws.on("open", () => resolve(client));
    ws.on("error", reject);
  });
}

async function withServer(fn: (port: number) => Promise<void>) {
  const root = mkdtempSync(join(tmpdir(), "loom-presence-"));
  scaffoldWorkspace(root, "presencetest");
  const cwd = process.cwd();
  process.chdir(root);
  let handle: ServerHandle | null = null;
  try {
    handle = await startServer({ port: 0, mock: true, quiet: true });
    await fn(handle.port);
  } finally {
    if (handle) await handle.close();
    process.chdir(cwd);
    rmSync(root, { recursive: true, force: true });
  }
}

test("focus presence relays which step each client is viewing", async () => {
  await withServer(async (port) => {
    const a = await connect(port, "Alice");
    const b = await connect(port, "Bob");
    await a.waitFor((m) => m.type === "hello");
    await b.waitFor((m) => m.type === "hello");

    // Alice focuses a step → Bob should see her on it
    a.send({ type: "focus", focus: "brief::outline" });
    const onBob = await b.waitFor(
      (m) => m.type === "presence.focus" && m.data.focus.some((f: any) => f.id === a.id && f.key === "brief::outline"),
    );
    const alice = onBob.data.focus.find((f: any) => f.id === a.id);
    assert.equal(alice.name, "Alice");
    assert.equal(alice.key, "brief::outline");

    // Bob focuses a different step → roster carries both, on their own keys
    b.send({ type: "focus", focus: "brief::draft" });
    const both = await a.waitFor(
      (m) => m.type === "presence.focus" && m.data.focus.length === 2,
    );
    const keyById = Object.fromEntries(both.data.focus.map((f: any) => [f.id, f.key]));
    assert.equal(keyById[a.id], "brief::outline");
    assert.equal(keyById[b.id], "brief::draft");

    a.close();
    b.close();
  });
});

test("a client clearing focus and disconnecting drops off the DAG roster", async () => {
  await withServer(async (port) => {
    const a = await connect(port, "Alice");
    const b = await connect(port, "Bob");
    await a.waitFor((m) => m.type === "hello");
    await b.waitFor((m) => m.type === "hello");

    a.send({ type: "focus", focus: "brief::draft" });
    b.send({ type: "focus", focus: "brief::draft" });
    await a.waitFor((m) => m.type === "presence.focus" && m.data.focus.length === 2);

    // Alice navigates away (focus: null) → roster drops to just Bob
    a.send({ type: "focus", focus: null });
    const afterClear = await b.waitFor(
      (m) => m.type === "presence.focus" && m.data.focus.every((f: any) => f.id !== a.id),
    );
    assert.equal(afterClear.data.focus.length, 1);
    assert.equal(afterClear.data.focus[0].id, b.id);

    // Bob disconnects → roster empties
    b.close();
    const afterLeave = await a.waitFor(
      (m) => m.type === "presence.focus" && m.data.focus.length === 0,
    );
    assert.equal(afterLeave.data.focus.length, 0);

    a.close();
  });
});
