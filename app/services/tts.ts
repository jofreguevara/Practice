/**
 * app/services/tts.ts — Text-to-speech pipeline (chat-mvp Task 3.1).
 *
 * Wraps `expo-speech` with:
 *   - locale-correct voice selection (auto-pick highest-quality voice for
 *     the BCP-47 locale; design §3, specs/tts.md REQ-2)
 *   - explicit override via `TtsOptions.voiceId`
 *   - synchronous `stopSpeaking()` for barge-in (design §3, tts.md REQ-3,
 *     chat screen calls this when VAD fires `speech_start` mid-utterance)
 *   - per-call NoNetworkPolicy assertion (offline-only contract)
 *
 * The audio-path convention follows design §5:
 *   `audio/chat/<conversationId>/<messageId>.wav`
 * expo-speech's `speak` on iOS does not return a file URI (AVSpeechSynthesizer
 * streams straight to the speaker); we still write a logical path into the
 * `message.tts_audio_path` column so the chat can reference it after playback.
 *
 * Specs: tts.md REQ-1..3; design §3, §5.
 */
import { Speech, type VoiceDescriptor } from 'expo-speech';
import { assertNoNetwork } from './capability';

export type BCP47 = 'en-US' | 'en-GB' | 'es-ES' | 'es-MX';

export interface TtsOptions {
  /** Required BCP-47 locale. Defaults to none — must be supplied. */
  locale?: BCP47;
  /** Explicit voice identifier; bypasses auto-pick. */
  voiceId?: string;
  /** Speech rate multiplier (0.5–2.0). */
  rate?: number;
  /** Conversation the utterance belongs to (drives the audio path). */
  conversationId: string;
  /** Message the utterance belongs to (drives the audio path). */
  messageId: string;
}

export interface TtsResult {
  audioPath: string;
  durationMs: number;
}

interface InternalState {
  bytesSent: number;
  /** Cached voices from `getAvailableVoicesAsync`; per-call refresh in v1. */
  cachedVoices: VoiceDescriptor[] | null;
}

const STATE: InternalState = {
  bytesSent: 0,
  cachedVoices: null,
};

/** Always 0 — the offline-only contract (design §3, tts.md REQ-3). */
export function getNetworkBytesSent(): number {
  return STATE.bytesSent;
}

/** Test-only state reset. Production callers never invoke this. */
export function __resetTtsForTests(): void {
  STATE.bytesSent = 0;
  STATE.cachedVoices = null;
}

/**
 * Synchronous stop — used by the chat screen when VAD fires `speech_start`
 * mid-utterance (barge-in). Wrapped in try/catch so a misbehaving native
 * module cannot propagate an exception into the chat render loop.
 */
export function stopSpeaking(): void {
  try {
    Speech.stop();
  } catch (err) {
    console.warn('[tts] Speech.stop() threw:', err);
  }
}

/**
 * Synthesizes `text` to audio via the native engine for the requested locale.
 * Picks the highest-quality voice available for that locale; if the caller
 * passes `voiceId`, that overrides the auto-pick.
 *
 * Returns the logical audio path plus the duration reported by the engine.
 * The path follows `audio/chat/<conversationId>/<messageId>.wav` (design §5).
 */
export async function speak(text: string, opts: TtsOptions): Promise<TtsResult> {
  if (!opts.locale) {
    throw new Error('tts.speak requires opts.locale (one of en-US, en-GB, es-ES, es-MX)');
  }
  if (!opts.conversationId || !opts.messageId) {
    throw new Error('tts.speak requires opts.conversationId and opts.messageId');
  }

  await assertNoNetwork('tts');

  // Voice selection: explicit override → auto-pick.
  const voice = opts.voiceId
    ? null
    : pickVoiceForLocale(await getVoices(), opts.locale);

  const speakOpts: Parameters<typeof Speech.speak>[1] = {
    language: opts.locale,
    ...(opts.voiceId ? { voice: opts.voiceId } : {}),
    ...(voice ? { voice: voice.identifier } : {}),
    ...(opts.rate !== undefined ? { rate: opts.rate } : {}),
    onStart: () => undefined,
    onDone: () => undefined,
    onStopped: () => undefined,
    onError: (e: unknown) => {
      console.warn('[tts] Speech.speak error callback:', e);
    },
  };

  const res = await Speech.speak(text, speakOpts);

  const audioPath = `audio/chat/${opts.conversationId}/${opts.messageId}.wav`;
  return {
    audioPath,
    durationMs: (res && typeof res === 'object' && 'durationMs' in res ? res.durationMs : 0) || 0,
  };
}

/* ------------------------------ internals --------------------------------- */

async function getVoices(): Promise<VoiceDescriptor[]> {
  if (STATE.cachedVoices !== null) return STATE.cachedVoices;
  const voices = await Speech.getAvailableVoicesAsync();
  STATE.cachedVoices = voices ?? [];
  return STATE.cachedVoices;
}

/**
 * Picks the best voice for the requested BCP-47 locale. Quality preference:
 *   `premium` > `enhanced` > `default`.
 *
 * Matching strategy (in order):
 *   1. Exact locale match (e.g. `en-US` → `en-US`).
 *   2. Base-language fallback (e.g. `en-AU` → any `en-*` voice).
 *
 * Returns `null` when no voice matches — callers fall back to the system
 * default by NOT passing the `voice` option to Speech.speak.
 */
export function pickVoiceForLocale(
  voices: ReadonlyArray<VoiceDescriptor>,
  locale: string,
): VoiceDescriptor | null {
  const exact = voices.filter((v) => v.language === locale);
  if (exact.length > 0) return bestQuality(exact);

  const base = locale.split('-')[0] ?? '';
  const family = voices.filter((v) => v.language.startsWith(`${base}-`));
  if (family.length > 0) return bestQuality(family);

  return null;
}

function bestQuality(voices: VoiceDescriptor[]): VoiceDescriptor {
  const qualityRank = { premium: 3, enhanced: 2, default: 1 } as const;
  let best = voices[0]!;
  let bestScore = qualityRank[best.quality ?? 'default'];
  for (let i = 1; i < voices.length; i++) {
    const v = voices[i]!;
    const score = qualityRank[v.quality ?? 'default'];
    if (score > bestScore) {
      best = v;
      bestScore = score;
    }
  }
  return best;
}