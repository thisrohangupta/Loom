/**
 * A small text CRDT (causal tree / RGA) for conflict-free concurrent editing.
 *
 * Each character is a node with a unique id `{c: clock, s: site}` attached to an
 * `origin` (the character it was inserted after, or null for the start). The
 * document is a pre-order traversal of the tree; among siblings sharing an
 * origin, order is deterministic (by id, descending). Because every operation
 * just attaches a node to an existing parent (or tombstones one), applying the
 * same set of ops in any order yields an identical document — i.e. concurrent
 * edits converge without a central arbiter.
 *
 * NOTE: the browser keeps an identical implementation in web/public/crdt.js
 * (no build step there) — keep the two algorithms in sync.
 */

export interface OpId {
  c: number; // logical clock
  s: number; // site id
}

export type Op =
  | { t: "ins"; id: OpId; origin: OpId | null; ch: string }
  | { t: "del"; id: OpId };

export interface SnapshotNode {
  id: OpId;
  origin: OpId | null;
  ch: string;
  del: boolean;
}

interface Node {
  id: OpId | null; // null = root sentinel
  origin: OpId | null;
  ch: string;
  del: boolean;
  children: Node[];
}

const ROOT = "root";
function keyOf(id: OpId | null): string {
  return id ? `${id.c}:${id.s}` : ROOT;
}
function cmpId(a: OpId, b: OpId): number {
  return a.c !== b.c ? a.c - b.c : a.s - b.s;
}

export class CRDT {
  private root: Node = { id: null, origin: null, ch: "", del: true, children: [] };
  private byKey = new Map<string, Node>();
  private pending: Array<{ id: OpId; origin: OpId | null; ch: string }> = [];
  private deleted = new Set<string>(); // tombstones, so deletes converge regardless of order
  private clock = 0;

  constructor(private site: number) {
    this.byKey.set(ROOT, this.root);
  }

  /** Current document text. */
  value(): string {
    let out = "";
    const walk = (n: Node) => {
      if (n.id && !n.del) out += n.ch;
      for (const c of n.children) walk(c);
    };
    for (const c of this.root.children) walk(c);
    return out;
  }

  /** Visible (non-tombstoned) nodes in document order. */
  private visible(): Node[] {
    const out: Node[] = [];
    const walk = (n: Node) => {
      if (n.id && !n.del) out.push(n);
      for (const c of n.children) walk(c);
    };
    for (const c of this.root.children) walk(c);
    return out;
  }

  /** All nodes (including tombstones) in document order — a transferable snapshot. */
  snapshot(): SnapshotNode[] {
    const out: SnapshotNode[] = [];
    const walk = (n: Node) => {
      if (n.id) out.push({ id: n.id, origin: n.origin, ch: n.ch, del: n.del });
      for (const c of n.children) walk(c);
    };
    for (const c of this.root.children) walk(c);
    return out;
  }

  /** Rebuild from a snapshot (parents always precede children in document order). */
  loadSnapshot(nodes: SnapshotNode[]): void {
    for (const n of nodes) this.rawInsert(n.id, n.origin, n.ch);
    this.drainPending();
    for (const n of nodes) if (n.del) this.applyDelete(n.id);
  }

  // --- local edits (return the op to broadcast) ---

  localInsert(index: number, ch: string): Op {
    const vis = this.visible();
    const origin = index <= 0 ? null : vis[index - 1].id;
    const id: OpId = { c: ++this.clock, s: this.site };
    this.rawInsert(id, origin, ch);
    this.drainPending();
    return { t: "ins", id, origin, ch };
  }

  localDelete(index: number): Op | null {
    const vis = this.visible();
    const node = vis[index];
    if (!node || !node.id) return null;
    node.del = true;
    return { t: "del", id: node.id };
  }

  // --- remote ops ---

  apply(op: Op): void {
    if (op.t === "del") {
      this.applyDelete(op.id);
      return;
    }
    this.rawInsert(op.id, op.origin, op.ch);
    this.drainPending();
  }

  applyMany(ops: Op[]): void {
    for (const op of ops) this.apply(op);
  }

  private applyDelete(id: OpId): void {
    const key = keyOf(id);
    this.deleted.add(key); // remember even if the insert hasn't arrived yet
    const n = this.byKey.get(key);
    if (n) n.del = true;
  }

  /** Insert a node, or buffer it if its origin hasn't arrived. Never drains. */
  private rawInsert(id: OpId, origin: OpId | null, ch: string): void {
    const key = keyOf(id);
    if (this.byKey.has(key)) return; // idempotent
    const parent = this.byKey.get(keyOf(origin));
    if (!parent) {
      // origin not yet known — buffer until it arrives (out-of-order delivery)
      this.pending.push({ id, origin, ch });
      return;
    }
    const node: Node = { id, origin, ch, del: this.deleted.has(key), children: [] };
    // siblings ordered by id descending (deterministic across replicas)
    let i = 0;
    while (i < parent.children.length && cmpId(parent.children[i].id as OpId, id) > 0) i++;
    parent.children.splice(i, 0, node);
    this.byKey.set(key, node);
    if (id.c > this.clock) this.clock = id.c;
  }

  /** Apply any buffered inserts whose origin is now present. Non-recursive. */
  private drainPending(): void {
    let progress = true;
    while (progress) {
      progress = false;
      for (let i = this.pending.length - 1; i >= 0; i--) {
        const p = this.pending[i];
        if (this.byKey.has(keyOf(p.origin))) {
          this.pending.splice(i, 1);
          this.rawInsert(p.id, p.origin, p.ch);
          progress = true;
        }
      }
    }
  }
}
