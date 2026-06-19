import Anthropic from "@anthropic-ai/sdk";
import type { Usage } from "../core/types.js";
import { estimateCost } from "./pricing.js";

export interface InferenceOptions {
  model: string;
  system?: string;
  prompt: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  maxTokens?: number;
  /** Called with each streamed text delta (for live progress). */
  onDelta?: (text: string) => void;
}

export interface InferenceResult {
  content: string;
  usage?: Usage;
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  // The SDK also resolves ANTHROPIC_AUTH_TOKEN and `ant auth login` profiles —
  // only refuse when no credential source is plausibly available.
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new Error(
      "No Anthropic credentials found. Export ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN) before running inference steps, or use --mock.",
    );
  }
  // 4 retries (vs the default 2) ride out sustained 429/529 spikes during a
  // live demo instead of failing the build on the first blip.
  if (!client) client = new Anthropic({ maxRetries: 4 });
  return client;
}

// Adaptive thinking is supported on Opus 4.6+, Sonnet 4.6, and Fable 5 — but
// not Haiku, where sending it is a 400. The effort parameter has its own,
// narrower support matrix; sending an unsupported level is also a 400.
function supportsAdaptiveThinking(model: string): boolean {
  return /^claude-(opus-4-[6-9]|sonnet-4-[6-9]|fable-5|mythos-5)/.test(model);
}
function clampEffort(model: string, effort?: string): string | undefined {
  if (!effort) return undefined;
  if (/^claude-haiku/.test(model)) return undefined; // no effort support at all
  if (/^claude-sonnet/.test(model) && effort === "xhigh") return "high"; // xhigh is Opus 4.7+/Fable only
  return effort;
}

/**
 * Run a single Claude chat-model inference. Streams (so large outputs don't hit
 * request timeouts) and uses adaptive thinking — the recommended setup for the
 * 4.x models.
 */
export async function runInference(opts: InferenceOptions): Promise<InferenceResult> {
  const c = getClient();
  const params: Record<string, unknown> = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 16000,
    messages: [{ role: "user", content: opts.prompt }],
  };
  if (supportsAdaptiveThinking(opts.model)) params.thinking = { type: "adaptive" };
  if (opts.system) params.system = opts.system;
  const effort = clampEffort(opts.model, opts.effort);
  if (effort) params.output_config = { effort };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = c.messages.stream(params as any);
  if (opts.onDelta) {
    stream.on("text", (t: string) => opts.onDelta!(t));
    // Thinking can run for a while before the first text token — surface a
    // one-time notice so the live log doesn't look frozen.
    let thinkingNoticeSent = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stream.on("streamEvent", (event: any) => {
      if (
        !thinkingNoticeSent &&
        event?.type === "content_block_start" &&
        event.content_block?.type === "thinking"
      ) {
        thinkingNoticeSent = true;
        opts.onDelta!("(thinking…)\n");
      }
    });
  }

  let message;
  try {
    message = await stream.finalMessage();
  } catch (err) {
    throw friendlyApiError(err);
  }

  // A non-end_turn stop means the output is truncated, refused, or otherwise
  // incomplete — it must NEVER be cached as a successful artifact, or every
  // later build serves the broken output as a cache hit.
  if (message.stop_reason && message.stop_reason !== "end_turn" && message.stop_reason !== "stop_sequence") {
    throw new Error(stopReasonMessage(message.stop_reason));
  }

  const content = message.content
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((b: any) => b.type === "text")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((b: any) => b.text)
    .join("");
  if (!content.trim()) {
    throw new Error("Model returned no output for this step.");
  }

  const inputTokens = message.usage?.input_tokens ?? 0;
  const outputTokens = message.usage?.output_tokens ?? 0;
  return {
    content,
    usage: {
      inputTokens,
      outputTokens,
      costUsd: estimateCost(opts.model, inputTokens, outputTokens),
    },
  };
}

function stopReasonMessage(stopReason: string): string {
  switch (stopReason) {
    case "max_tokens":
      return "Output was truncated at the max_tokens limit — raise `maxTokens` on this step and rebuild.";
    case "model_context_window_exceeded":
      return "The step's prompt exceeded the model's context window — trim its inputs.";
    case "refusal":
      return "The model declined this request.";
    default:
      return `Model stopped unexpectedly (stop_reason: ${stopReason}).`;
  }
}

function friendlyApiError(err: unknown): Error {
  if (err instanceof Anthropic.AuthenticationError) {
    return new Error("Anthropic API authentication failed — check your API key.");
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new Error("Anthropic API rate limit reached — wait a moment and rebuild (cached steps are free).");
  }
  if (err instanceof Anthropic.APIError && (err.status ?? 0) >= 500) {
    return new Error("The Anthropic API is temporarily overloaded — rebuild in a moment (cached steps are free).");
  }
  return err instanceof Error ? err : new Error(String(err));
}
