/**
 * Type shims for native modules that ship without complete .d.ts files.
 * The Jest moduleNameMapper redirects to __mocks__/*.ts at test time;
 * production callers get the real native module at runtime.
 */
declare module 'whisper.rn' {
  export interface InitWhisperOpts {
    filePath: string;
    useVad?: boolean;
  }
  export interface InitWhisperVadOpts {
    filePath: string;
  }
  export interface TranscribeFileOpts {
    id: number;
    filePath: string;
    language?: string;
  }
  export interface TranscribeResult {
    text: string;
    language: string;
    durationMs: number;
  }

  export interface VadEvent {
    type: 'speech_start' | 'speech_end';
    confidence: number;
    t: number;
  }

  export class RealtimeVadContext {
    on(event: 'speech_start' | 'speech_end', cb: (e: VadEvent) => void): () => void;
    emit(event: VadEvent): void;
    close(): void;
  }

  export function initWhisper(opts: InitWhisperOpts): Promise<{ id: number; gpu: boolean }>;
  export function initWhisperVad(opts: InitWhisperVadOpts): Promise<{ id: number; sampleRate: number }>;
  export function transcribeFile(opts: TranscribeFileOpts): Promise<TranscribeResult>;
  export function releaseWhisper(opts: { id: number }): Promise<void>;
  export function createRealtimeVadContext(opts: {
    vadId: number;
    frameSamples?: number;
    silenceTriggerMs?: number;
  }): RealtimeVadContext;
}