// Single source of truth: the same CRDT the server and tests use.
export { CRDT, editsFromDiff } from "@core/crdt";
export type { Op, OpId, SnapshotNode } from "@core/crdt";
