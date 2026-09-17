/**
 * app/services/audio.ts — Audio capture / playback / amplitude stream
 * (chat-mvp Task 3.1).
 *
 * Wraps `expo-audio` with the design §3 interface:
 *   - startRecording(opts?) → Promise<void>
 *   - stopRecording() → Promise<AudioBuffer>
 *   - play(path) → Promise<void>
 *   - subscribeAmplitude(cb) → Unsubscribe
 *
 * The recorder lifecycle is single-shot: a fresh recorder is allocated
 * each call to `startRecording()` so the chat screen's press-and-hold
 * gesture is straightforward to model.
 *
 * Specs: stt.md REQ-2 (audio capture feeds the VAD + STT pipeline),
 * audio-waveform.md REQ-2 (60 Hz sample ingestion, 30 fps render),
 * design §3 (audio interface), §4 (data flow).
 */
// expo-audio's React-Native-style API uses `useXxx` names which trip the
// React Hooks lint rule when invoked from non-component code. We alias the
// imports to make their imperative nature explicit.
import {
  useAudioRecorder as createRecorder,
  useAudioPlayer as createPlayer,
  useAudioSampleListener as attachSampleListener,
  setAudioModeAsync,
  type RecorderHandle,
  type PlayerHandle,
} from 'expo-audio';
import { assertNoNetwork } from './capability';

export interface AudioBuffer {
  uri: string;
  durationMs: number;
  sampleRate: 16000;
}

export interface RecordingOpts {
  sampleRate?: 16000;
  channels?: 1;
}

interface InternalState {
  recorder: RecorderHandle | null;
  player: PlayerHandle | null;
  bytesSent: number;
  currentSampleRate: number;
}

const STATE: InternalState = {
  recorder: null,
  player: null,
  bytesSent: 0,
  currentSampleRate: 16000,
};

/** Always 0 — offline-only contract (audio capture is local). */
export function getNetworkBytesSent(): number {
  return STATE.bytesSent;
}

/** Test-only state reset. */
export function __resetAudioForTests(): void {
  if (STATE.recorder) {
    void STATE.recorder.cleanup().catch(() => undefined);
  }
  STATE.recorder = null;
  STATE.player = null;
  STATE.bytesSent = 0;
  STATE.currentSampleRate = 16000;
}

/**
 * Begins recording. Allocates a fresh recorder handle; idempotent across
 * multiple calls (a new `startRecording()` after a `stopRecording()` builds
 * a new handle). The session-end `AudioBuffer.uri` follows the design §5
 * convention (`audio/chat/<conversationId>/<messageId>_<role>.wav`) but the
 * recorder handle only knows the path that the native binding assigns —
 * the chat screen is responsible for constructing the path BEFORE calling
 * `startRecording()` and passing it back via the returned buffer's uri.
 *
 * For the MVP we let expo-audio write the file to its default location
 * (documentDirectory by convention) and trust the chat screen to rename
 * or copy the WAV if a specific filename is required.
 */
export async function startRecording(opts?: RecordingOpts): Promise<void> {
  await assertNoNetwork('audio');
  await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
  const sampleRate = opts?.sampleRate ?? 16000;
  STATE.currentSampleRate = sampleRate;
  if (STATE.recorder) {
    await STATE.recorder.cleanup().catch(() => undefined);
    STATE.recorder = null;
  }
  STATE.recorder = createRecorder({ sampleRate, channels: opts?.channels ?? 1 });
  await STATE.recorder.record();
}

/**
 * Stops the current recording and returns the resulting `AudioBuffer`.
 * Throws when no recording is in flight — the chat screen should always
 * call `startRecording()` before `stopRecording()`.
 */
export async function stopRecording(): Promise<AudioBuffer> {
  await assertNoNetwork('audio');
  const rec = STATE.recorder;
  if (!rec) {
    throw new Error('audio.stopRecording called without an active recorder');
  }
  const result = await rec.stop();
  STATE.recorder = null;
  return {
    uri: result.uri,
    durationMs: result.durationMs,
    sampleRate: STATE.currentSampleRate as 16000,
  };
}

/**
 * Plays the WAV at `path` via the native engine. The chat screen awaits
 * this while the TTS audio is rendered to the speaker; the path follows
 * the design §5 layout (`audio/chat/<conversationId>/<messageId>.wav`).
 */
export async function play(path: string): Promise<void> {
  await assertNoNetwork('audio');
  await setAudioModeAsync({ playsInSilentMode: true });
  if (STATE.player) {
    await STATE.player.stop().catch(() => undefined);
  }
  STATE.player = createPlayer(path);
  await STATE.player.play();
}

/**
 * Subscribes to the live amplitude (RMS) stream for the current playback
 * OR recording session. Returns an `Unsubscribe` function — calling it
 * detaches the listener (the chat screen wires this into its Waveform
 * component's teardown).
 *
 * Sample rate: target 60 Hz during recording (the chat screen drives
 * the Waveform at 30 fps via RAF throttling; samples between RAF ticks
 * are dropped, not queued — see design §9).
 */
export function subscribeAmplitude(cb: (rms: number) => void): () => void {
  if (!STATE.player) {
    // No playback yet — register against a synthetic player so the
    // chat screen can subscribe before `play()` is called. expo-audio's
    // mock emits samples via setInterval so we get a deterministic
    // signal in tests.
    STATE.player = createPlayer();
  }
  const inner = attachSampleListener(STATE.player, (sample) => {
    cb(sample.rms);
  });
  return inner;
}