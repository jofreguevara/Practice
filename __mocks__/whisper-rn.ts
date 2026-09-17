/**
 * whisper.rn mock for Jest — the native binding is unavailable in Node.
 *
 * Production tests for whisper.rn land in chat-mvp (Task 3.1). This mock
 * exposes the surface stt.ts uses, with overridable jest.fn entries so
 * individual tests can script the VAD init throw / transcription text.
 *
 * Surface used by stt.ts (chat-mvp Task 3.1):
 *   - initWhisper({filePath, useVad?})  → { id, gpu }
 *   - initWhisperVad({filePath})       → { id, sampleRate } | throws
 *   - transcribeFile({id, filePath, language?}) → { text, language, durationMs }
 *   - releaseWhisper({id})             → void
 *   - RealtimeVadContext (event source for VAD-driven trim — simulated)
 */

interface InitWhisperOpts {
  filePath: string;
  useVad?: boolean;
}
interface InitWhisperVadOpts {
  filePath: string;
}
interface TranscribeFileOpts {
  id: number;
  filePath: string;
  language?: string;
}
interface TranscribeResult {
  text: string;
  language: string;
  durationMs: number;
}

export const initWhisper = jest.fn((_opts: InitWhisperOpts): Promise<{ id: number; gpu: boolean }> =>
  Promise.resolve({ id: 1, gpu: false }),
);
export const initWhisperVad = jest.fn(
  (_opts: InitWhisperVadOpts): Promise<{ id: number; sampleRate: number }> =>
    Promise.resolve({ id: 2, sampleRate: 16000 }),
);
export const transcribeFile = jest.fn((_opts: TranscribeFileOpts): Promise<TranscribeResult> =>
  Promise.resolve({ text: '', language: 'en', durationMs: 0 }),
);
export const releaseWhisper = jest.fn((_opts: { id: number }): Promise<void> => Promise.resolve());

/**
 * RealtimeVadContext — a tiny event emitter simulated for tests. Production
 * whisper.rn streams `speech_start` / `speech_end` events on this context;
 * tests can drive them directly via the exported helpers below.
 */
export class RealtimeVadContext {
  private listeners = new Set<(event: { type: 'speech_start' | 'speech_end'; confidence: number; t: number }) => void>();
  on(
    event: 'speech_start' | 'speech_end',
    cb: (e: { type: 'speech_start' | 'speech_end'; confidence: number; t: number }) => void,
  ): () => void {
    void event;
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  emit(event: { type: 'speech_start' | 'speech_end'; confidence: number; t: number }): void {
    for (const l of this.listeners) l(event);
  }
  close(): void {
    this.listeners.clear();
  }
}

export function createRealtimeVadContext(_opts: {
  vadId: number;
  frameSamples?: number;
  silenceTriggerMs?: number;
}): RealtimeVadContext {
  return new RealtimeVadContext();
}