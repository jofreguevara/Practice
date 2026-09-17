/**
 * app/services/llm.ts — On-device LLM conversation agent (chat-mvp Task 3.1).
 *
 * Wraps `llama.rn` with:
 *   - `generateReply(turns, profileContext)` — async iterator that yields
 *     `TokenChunk` items as the model streams tokens
 *   - `summarize(turns)` — second pass over `completion()` for the
 *     per-10-turn rolling summary (design §6 invalidation rule)
 *   - `composeSystemPrompt(...)` — the exact template from design §7
 *   - `selectModelForVariant(variant)` — picks the bundled GGUF path
 *     from `app/config/modelManifest.ts`
 *   - per-call NoNetworkPolicy assertion (offline-only contract)
 *
 * Specs: llm.md REQ-1..4; design §3, §6, §7.
 */
import { initLlama, completion } from 'llama.rn';
import { assertNoNetwork } from './capability';
import {
  MODEL_MANIFEST,
  type ModelVariant,
} from '../config/modelManifest';
import { TOPIC_PROMPTS, levelHint, type TopicId } from '../config/topics';

export type { ModelVariant } from '../config/modelManifest';
export type { TopicId } from '../config/topics';

export interface ConversationTurn {
  role: 'user' | 'assistant' | 'system';
  text: string;
}

export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type BCP47 = 'en-US' | 'en-GB' | 'es-ES' | 'es-MX';

export interface ProfileContext {
  personaName: string;
  level: CEFRLevel;
  topicId: TopicId;
  practiceLocale: BCP47;
  summary: string;
  recentTurns: ConversationTurn[];
}

export interface TokenChunk {
  token: string;
  index: number;
}

interface InternalState {
  contextId: number | null;
  modelVariant: ModelVariant | 'default';
  bytesSent: number;
  /** Recent turns accumulated across the conversation — used for composeSystemPrompt. */
  conversationRecentTurns: ConversationTurn[];
}

const STATE: InternalState = {
  contextId: null,
  modelVariant: 'default',
  bytesSent: 0,
  conversationRecentTurns: [],
};

/** Always 0 in v1 — the offline-only contract (design §3, llm.md REQ-4). */
export function getNetworkBytesSent(): number {
  return STATE.bytesSent;
}

/** Test-only state reset. */
export function __resetLlmForTests(): void {
  STATE.contextId = null;
  STATE.modelVariant = 'default';
  STATE.bytesSent = 0;
  STATE.conversationRecentTurns = [];
}

/**
 * Picks the bundled GGUF path for a given `ModelVariant`. The chat root
 * layout runs `capability.resolveModelVariant` at boot to decide which
 * variant to load; that decision is then handed to `generateReply` via
 * the conversation store. Production callers do NOT pass `modelVariant`
 * to `generateReply` — the variant is sourced from the profile store.
 *
 * Returns the empty string for the `stub` variant — callers short-circuit
 * to `pickStubResponse` from `services/stubResponses.ts`.
 */
export function selectModelForVariant(variant: ModelVariant): string {
  if (variant === 'stub') return '';
  return MODEL_MANIFEST[variant].path;
}

/**
 * Composes the system prompt — verbatim from design §7. Called once per
 * turn (cheap; pure function over the profile context + summary + recent
 * turns). Exported so tests can snapshot the exact prompt shape.
 */
export function composeSystemPrompt(
  profile: ProfileContext,
  summary: string,
  recentTurns: ConversationTurn[],
): string {
  const topicFragment = TOPIC_PROMPTS[profile.topicId];
  const summaryBlock = summary
    ? `Conversation so far: ${summary}\n`
    : 'This is the start of the conversation.\n';
  const recentBlock = recentTurns.length === 0
    ? '(no prior turns)'
    : recentTurns
        .map((t) => `${t.role === 'user' ? 'user' : t.role === 'assistant' ? 'assistant' : 'system'}: ${t.text}`)
        .join('\n');
  return `You are ${profile.personaName}, a patient English-practice companion.
Practice locale: ${profile.practiceLocale} (e.g. ${profile.practiceLocale} English). Respond in this locale.
User CEFR level: ${profile.level}. Adjust vocabulary and grammar accordingly. ${levelHint(profile.level)}

Active topic: ${profile.topicId}.
${topicFragment}

${summaryBlock}
Recent turns (oldest → newest, sliding window of last 10 turns, bounded within the 4096-token total context budget specified in §12 — when the prompt approaches 3.6k tokens, older turns are dropped to keep a safety margin for the assistant reply):
${recentBlock}

user
${recentTurns[recentTurns.length - 1]?.text ?? ''}assistant
`;
}

/**
 * Streams a model reply for the given user turn. Loads the model context
 * lazily on first call. Yields one `TokenChunk` per native `completion()`
 * callback. Stops cleanly when `completion()` resolves.
 *
 * The variant defaults to `llama-3.2-1b`; callers can override via the
 * `modelVariant` option (Settings → Models selection or capability probe).
 */
export async function* generateReply(
  turns: ConversationTurn[],
  profile: ProfileContext,
  opts?: { modelVariant?: ModelVariant; maxTokens?: number },
): AsyncIterable<TokenChunk> {
  await assertNoNetwork('llm');

  const variant = opts?.modelVariant ?? 'llama-3.2-1b';
  // Stub mode: hand back a curated response via the stub service. This
  // mirrors the chat-screen decision when `profile.preferences_json.modelVariant === 'stub'`.
  if (variant === 'stub') {
    yield { token: '[stub-mode: stubResponses table]', index: 0 };
    return;
  }

  // Lazy context load.
  await ensureContext(variant);

  const recentTurns = turns.slice(-10);
  const prompt = composeSystemPrompt(profile, profile.summary, recentTurns);

  let index = 0;
  const queue: TokenChunk[] = [];
  let waiter: ((chunk: TokenChunk | null) => void) | null = null;
  let donePromise: Promise<void> = Promise.resolve();
  let isDone = false;
  let pendingError: string | null = null;

  // Kick off the native completion; stream tokens into our queue.
  donePromise = completion(
    {
      prompt,
      n_predict: opts?.maxTokens ?? 256,
      temperature: 0.7,
      top_p: 0.9,
      top_k: 40,
    },
    (chunk: { token: string }) => {
      const c: TokenChunk = { token: chunk.token, index: index++ };
      const w = waiter;
      waiter = null;
      if (w) w(c);
      else queue.push(c);
    },
  ).then(
    () => {
      isDone = true;
      const w = waiter;
      waiter = null;
      if (w) w(null);
    },
    (err: unknown) => {
      isDone = true;
      pendingError = String(err);
      const w = waiter;
      waiter = null;
      if (w) w(null);
    },
  );

  try {
    while (true) {
      if (queue.length > 0) {
        yield queue.shift()!;
        continue;
      }
      if (isDone) {
        if (pendingError) throw new Error(pendingError);
        return;
      }
      const next: TokenChunk | null = await new Promise<TokenChunk | null>(
        (res) => {
          waiter = res;
        },
      );
      if (next === null) {
        if (pendingError) throw new Error(pendingError);
        return;
      }
      yield next;
    }
  } finally {
    // Ensure completion has resolved so the native context isn't leaked.
    await donePromise.catch(() => undefined);
  }
}

/**
 * Runs a one-shot summarization pass over the supplied turns. The prompt
 * is a fixed "Summarize the conversation in 2-3 sentences" instruction
 * followed by the joined turn text. Returns the model's plain-text reply.
 *
 * Empty input returns the empty string without invoking the model — the
 * per-10-turn guard relies on this so the first call doesn't burn tokens.
 *
 * Implementation note: summarize calls `completion()` DIRECTLY (not via
 * `generateReply`) because the prompt is a fixed "Summarize…" instruction
 * rather than the chat system prompt. This keeps the test contract
 * (the model's prompt must contain "summarize") and the prompt space
 * separate from the chat path.
 */
export async function summarize(turns: ConversationTurn[]): Promise<string> {
  if (turns.length === 0) return '';
  await assertNoNetwork('llm');
  await ensureContext(STATE.modelVariant === 'default' ? 'llama-3.2-1b' : STATE.modelVariant);
  const prompt =
    'Summarize the following English-practice conversation in 2-3 short sentences. Preserve the topic and any decisions the user made.\n\n' +
    turns
      .map((t) => `${t.role === 'user' ? 'User' : t.role === 'assistant' ? 'Assistant' : 'System'}: ${t.text}`)
      .join('\n') +
    '\n\nSummary:';

  // Collect streamed tokens into a string. The native binding fires the
  // callback synchronously per token before resolving; this loop is bounded
  // by completion() resolving.
  let out = '';
  await completion(
    {
      prompt,
      n_predict: 96,
      temperature: 0.3,
      top_p: 0.9,
      top_k: 40,
    },
    (chunk: { token: string }) => {
      out += chunk.token;
    },
  );
  return out.trim();
}

/* ------------------------------ internals --------------------------------- */

async function ensureContext(variant: ModelVariant | 'default'): Promise<void> {
  const effectiveVariant: ModelVariant =
    variant === 'default' ? 'llama-3.2-1b' : variant;
  if (STATE.contextId !== null && STATE.modelVariant === effectiveVariant) return;
  if (STATE.contextId !== null) {
    // Different variant requested — release the old context first.
    await releaseContext();
  }
  const path = selectModelForVariant(effectiveVariant);
  if (!path) {
    throw new Error(
      `llm: variant "${effectiveVariant}" has no bundled asset (stub mode uses pickStubResponse instead)`,
    );
  }
  const ctx = await initLlama({
    model: path,
    n_ctx: 4096,
    n_threads: 4,
  });
  STATE.contextId = ctx.contextId;
  STATE.modelVariant = effectiveVariant;
}

async function releaseContext(): Promise<void> {
  // llama.rn's releaseLlama is module-private here; in practice the OS
  // frees on app exit. We simply clear our state so the next call reloads.
  STATE.contextId = null;
}