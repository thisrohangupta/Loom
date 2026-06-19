# CLAUDE.md

Guidance for Claude Code (and cloud sessions) working in this repo. Keep it current as the project evolves.

## What Loom is

A **local-first build system for LLM workflows** — "`make` for prompts, agents, and context." A workspace of managed inputs + a prompt library + inference **workflows** (DAGs of steps) compiles into **content-addressed, cached artifacts**, with a local web UI, git-backed snapshots, and shareable HTML export. No database — everything is plain files. See `README.md` for the full product tour.

## Commands

```bash
npm ci             # install (deterministic, from lockfile) — covers CLI + web/
npm run typecheck  # tsc --noEmit over src/ AND web/ — run this after any change
npm run build      # compile server (tsc) + bundle UI (vite) -> dist/web/public
npm test           # node:test suite via tsx — NO API key needed
npm run dev -- <command>   # run the CLI from source via tsx (e.g. -- status brief)
npm run dev:web    # Vite dev server for the UI (proxies /api + /ws to a running `loom serve`)
```

**Before considering a change done, run `npm run typecheck && npm test`** — this mirrors CI. CI (`.github/workflows/ci.yml`) runs typecheck → build → test on Node **20 and 22** for every push and PR.

## Architecture

Single package, two halves, one root `package.json` (the `web/` UI has **no** package.json — it shares the hoisted root `node_modules`):

- **`src/cli/index.ts`** — CLI entry (the `loom` bin → `dist/cli/index.js`).
- **`src/core/`** — the engine. `engine.ts` (build/cache/rebuild), `graph.ts` (DAG), `resolve.ts` (input refs), `store.ts` + `hash.ts` (content-addressed cache), `crdt.ts` (collab editing), `snapshot.ts` (git), `access.ts` (roles/tokens), `workspace.ts`, `types.ts`.
- **`src/llm/`** — model integration: `inference.ts` (chat), `agent.ts` (coding agents), `mock.ts` (deterministic offline provider), `pricing.ts`, `runners.ts`.
- **`src/server/server.ts`** — local web server (REST + `ws` for live updates), serves the built UI as static assets.
- **`web/`** — React 19 + Vite + Tailwind + shadcn/ui (Radix) app. State in `zustand`.

## Conventions & invariants

- **ESM throughout** (`"type": "module"`). Use `import`, include file extensions in relative imports where required, no CommonJS.
- **Node ≥ 20** (`engines`). Don't use APIs newer than Node 20.
- **The cache key is load-bearing.** A step's key hashes its rendered prompt + resolved input hashes + model + step config. Changing what goes into that hash changes cache/freshness semantics for every user — treat `hash.ts`/`engine.ts` cache logic as a contract, not an implementation detail.
- **Tests are model-free and must stay that way.** The engine takes injectable runners — `new Engine(ws, dirs, store, { inference, agent })` — so the full build → cache → rebuild → diff flow is tested deterministically against `mock.ts`. Do **not** add tests that call a real model or require `ANTHROPIC_API_KEY`.
- **CRDT has a single source of truth:** `src/core/crdt.ts` is shared directly by server and browser. Keep collaboration logic there; don't fork a second implementation in `web/`.
- **Don't weaken the security model** in `server.ts` / `access.ts` without flagging it: loopback-by-default bind, same-origin checks on WS handshakes + state-changing requests, token-gated roles enforced on every request and edit, and file access confined to `inputs/`/`prompts/`/`context/` (no path traversal, no reads of `.loom/` or `loom.yaml`). These are deliberate guarantees described in the README's Security model section.

## Secrets & running real inference

- Tests and the `--mock` / `demo` paths need **no** API key.
- Real inference/agent steps need `ANTHROPIC_API_KEY` in the environment. **Never** hardcode it, commit it, or put it in a shared/visible env-var field — it's a secret.
- Anthropic SDKs (`@anthropic-ai/sdk`, `@anthropic-ai/claude-agent-sdk`) are pinned to `latest` and move fast; pin exact versions if you need reproducible installs.

## Generated / managed paths (don't hand-edit)

- `dist/` — build output.
- `.loom/cache/` — rebuildable, gitignored. `.loom/outputs/`, `.loom/state.json`, `.loom/events.log` are tracked workspace state, written by the engine — don't edit by hand.
