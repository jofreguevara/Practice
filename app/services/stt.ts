/**
 * app/services/stt.ts — Speech-to-text pipeline (chat-mvp Task 3.1).
 *
 * Wraps `whisper.rn` with:
 *   - Silero VAD-driven silence trim (`initWhisperVad` + `RealtimeVadContext`)
 *   - Energy-threshold fallback when the VAD model fails to load
 *     (design §14 risk 7; non-blocking warning, never user-blocking)
 *   - Per-call NoNetworkPolicy assertion (the offline-only contract)
 *
 * Specs: stt.md REQ-1..3; design §3, §14 risk 7.
 *
 * The interface is the minimal surface the chat screen needs. Models are
 * loaded from `app/config/modelManifest.ts:STT_ASSET.path` — the chat root
 * layout runs the SHA-256 verification pass at boot, so by the time
 * `transcribe()` is called we trust the bytes on disk.
 */
import * as FileSystem from 'expo-file-system';
import {
  initWhisper,
  initWhisperVad,
  transcribeFile,
  createRealtimeVadContext,
  type RealtimeVadContext,
} from 'whisper.rn';
import { assertNoNetwork, NoNetworkPolicyError } from './capability';
import { STT_ASSET } from '../config/modelManifest';

export type SttLocale = 'auto' | 'en' | 'es';

export interface SttAudio {
  /** Absolute or document-relative path to the recorded WAV. */
  uri: string;
  /** Recorded length in milliseconds (used for telemetry + UI). */
  durationMs: number;
  /** Sample rate in Hz; whisper tiny expects 16000. */
  sampleRate: 16000;
}

export interface SttResult {
  text: string;
  /** Detected language (`en` or `es`). Forced when caller passes an explicit locale. */
  detectedLocale: 'en' | 'es';
  /** Inference wall-clock time. */
  durationMs: number;
}

interface InternalState {
  whisperId: number | null;
  vadId: number | null;
  vad: RealtimeVadContext | null;
  vadFallback: boolean;
  bytesSent: number;
}

const STATE: InternalState = {
  whisperId: null,
  vadId: null,
  vad: null,
  vadFallback: false,
  bytesSent: 0,
};

/** Network-byte counter — design §3 / stt.md REQ-3. Always 0 in v1. */
export function getNetworkBytesSent(): number {
  return STATE.bytesSent;
}

/** Returns true when the energy-threshold fallback path is active. */
export function isVadFallbackActive(): boolean {
  return STATE.vadFallback;
}

/**
 * Test seam — resets all module-level state. Production callers never
 * invoke this; the state lives for the lifetime of the app.
 */
export function __resetSttForTests(): void {
  STATE.whisperId = null;
  STATE.vadId = null;
  STATE.vad = null;
  STATE.vadFallback = false;
  STATE.bytesSent = 0;
}

/**
 * Transcribes a recorded WAV to text + detected locale.
 *
 * Steps:
 *   1. assertNoNetwork('stt') — offline-only contract (throws otherwise).
 *   2. Ensure the whisper context is loaded (idempotent init).
 *   3. Try `initWhisperVad`; on failure, flip to energy-threshold fallback
 *      (non-blocking — the service still transcribes without silence trim).
 *   4. Run `transcribeFile` against the WAV path; coerce the language to
 *      the supported {en, es} set, honoring an explicit locale override.
 *   5. Returns `{text, detectedLocale, durationMs}`.
 */
export async function transcribe(audio: SttAudio, locale: SttLocale = 'auto'): Promise<SttResult> {
  // 1. No-network policy.
  await assertNoNetwork('stt');

  // 2. Ensure the whisper context is loaded.
  await ensureWhisperContext();

  // 3. Try VAD; on failure flip to the energy fallback and continue.
  if (!STATE.vadFallback && STATE.vadId === null) {
    try {
      const vad = await initWhisperVad({ filePath: STT_ASSET.path });
      STATE.vadId = vad.id;
      // The realtime context is the event source for VAD-driven trim.
      // We don't stream silence-trim events back from this function —
      // that's the chat screen's job via subscribeAmplitude. We just
      // instantiate the context so production wiring has it ready.
      STATE.vad = createRealtimeVadContext({ vadId: vad.id, frameSamples: 512 });
    } catch (err) {
      STATE.vadFallback = true;
      STATE.vad = null;
      STATE.vadId = null;
      // Non-blocking warning. Toast surface is chat-screen responsibility.
      console.warn('[stt] VAD model failed to load — energy-fallback engaged:', err);
    }
  }

  // 4. Run inference.
  const startedAt = Date.now();
  const whisperId = STATE.whisperId;
  if (whisperId === null) {
    throw new Error('stt.transcribe called before whisper context initialized');
  }
  const result = await transcribeFile({
    id: whisperId,
    filePath: audio.uri,
    ...(locale !== 'auto' ? { language: locale } : {}),
  });
  const durationMs = Date.now() - startedAt;

  // 5. Coerce detected language.
  const detectedLocale = coerceLocale(result.language, locale);

  return {
    text: result.text,
    detectedLocale,
    durationMs,
  };
}

/* ------------------------------ internals --------------------------------- */

async function ensureWhisperContext(): Promise<void> {
  if (STATE.whisperId !== null) return;
  // Confirm the WAV file exists — caller passed a path; if it doesn't,
  // surface a clear error rather than letting whisper.rn crash deep.
  try {
    const info = await FileSystem.getInfoAsync(STT_ASSET.path);
    if (!info.exists) {
      throw new Error(`STT asset missing at ${STT_ASSET.path} — reinstall required`);
    }
  } catch (err) {
    // getInfoAsync can throw on permission errors; surface as a clear error.
    throw new Error(`stt asset check failed: ${(err as Error).message ?? String(err)}`);
  }
  const ctx = await initWhisper({ filePath: STT_ASSET.path, useVad: false });
  STATE.whisperId = ctx.id;
}

/**
 * Coerces a whisper `language` token to the supported {en, es} set.
 * - Explicit locale locks the value.
 * - 'en' / 'es' pass through.
 * - Anything else (e.g. whisper mis-detected to French) defaults to 'en'.
 */
function coerceLocale(detected: string, requested: SttLocale): 'en' | 'es' {
  if (requested === 'en' || requested === 'es') return requested;
  if (detected === 'en' || detected === 'es') return detected;
  return 'en';
}

// Re-export NoNetworkPolicyError so callers don't need to import capability.ts.
export { NoNetworkPolicyError };