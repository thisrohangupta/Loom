import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Usage } from "../core/types.js";

export interface AgentOptions {
  model: string;
  /** Working directory the agent reads and writes in. */
  cwd: string;
  systemPrompt?: string;
  prompt: string;
  allowedTools?: string[];
  permissionMode?: string;
  maxTurns?: number;
  /**
   * A human title for the artifact the agent produces (e.g. the product name).
   * Used only by the mock runner to title generated files; the real agent
   * ignores it and titles from the prompt.
   */
  titleHint?: string;
  /** Called with each assistant text block (for live progress). */
  onText?: (text: string) => void;
}

export interface AgentResult {
  content: string;
  usage?: Usage;
  subtype?: string;
}

// Bash is deliberately NOT a default: with `bypassPermissions` it would give
// any agent step unrestricted shell access to the host. Steps that need it
// must opt in via `allowedTools`.
const DEFAULT_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep"];
// A wandering agent must terminate, not loop forever — generous, but bounded.
const DEFAULT_MAX_TURNS = 25;

/**
 * Run a Claude *coding agent* (Claude Agent SDK) headlessly. Unlike a chat
 * completion, the agent can read/edit files and run tools inside `cwd`. We
 * accumulate its assistant text as the step's output "report"; any files it
 * writes land directly in the working directory.
 */
export async function runAgent(opts: AgentOptions): Promise<AgentResult> {
  // No hard env check here: the Agent SDK resolves ANTHROPIC_API_KEY,
  // ANTHROPIC_AUTH_TOKEN, or an existing Claude Code login on its own, and
  // surfaces a clear error when none is available.
  const options: Record<string, unknown> = {
    model: opts.model,
    cwd: opts.cwd,
    allowedTools: opts.allowedTools ?? DEFAULT_TOOLS,
    permissionMode: opts.permissionMode ?? "bypassPermissions",
    maxTurns: opts.maxTurns ?? DEFAULT_MAX_TURNS,
  };
  if (opts.systemPrompt) options.systemPrompt = opts.systemPrompt;

  let text = "";
  let subtype: string | undefined;
  let usage: Usage | undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const iterator = query({ prompt: opts.prompt, options: options as any });
  for await (const message of iterator as AsyncIterable<any>) {
    if (message.type === "assistant") {
      for (const block of message.message?.content ?? []) {
        if (block.type === "text" && block.text) {
          text += block.text;
          opts.onText?.(block.text);
        }
      }
    } else if (message.type === "result") {
      subtype = message.subtype;
      const u = message.usage ?? {};
      usage = {
        inputTokens: u.input_tokens,
        outputTokens: u.output_tokens,
        costUsd: typeof message.total_cost_usd === "number" ? message.total_cost_usd : undefined,
      };
      // The SDK's `result` message can carry a final summary text too.
      if (typeof message.result === "string" && message.result && !text.includes(message.result)) {
        text += (text ? "\n\n" : "") + message.result;
      }
    }
  }

  if (subtype && subtype !== "success") {
    throw new Error(`Agent run ended with status "${subtype}".${text ? "\n" + text : ""}`);
  }

  return { content: text.trim(), usage, subtype };
}
