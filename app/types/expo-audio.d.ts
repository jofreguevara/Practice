/**
 * Type shims for expo-speech and expo-audio.
 */
declare module 'expo-speech' {
  export interface SpeakOptions {
    language?: string;
    voice?: string;
    rate?: number;
    pitch?: number;
    onStart?: () => void;
    onDone?: () => void;
    onStopped?: () => void;
    onError?: (err: unknown) => void;
  }
  export interface VoiceDescriptor {
    identifier: string;
    name: string;
    language: string;
    quality?: 'default' | 'enhanced' | 'premium';
  }
  export const Speech: {
    speak(text: string, opts?: SpeakOptions): Promise<{ uri: string; durationMs: number } | undefined>;
    stop(): void;
    getAvailableVoicesAsync(): Promise<VoiceDescriptor[]>;
    maxSpeechInputLength: number;
  };
}

declare module 'expo-audio' {
  export interface AudioMode {
    allowsRecording?: boolean;
    playsInSilentMode?: boolean;
    interruptionMode?: 'mixWithOthers' | 'doNotMix' | 'duckOthers';
  }
  export interface RecorderHandle {
    readonly uri: string | null;
    record(): Promise<void>;
    stop(): Promise<{ uri: string; durationMs: number }>;
    getStatus(): 'idle' | 'recording' | 'stopped';
    cleanup(): Promise<void>;
  }
  export interface PlayerHandle {
    readonly uri: string;
    play(): Promise<void>;
    pause(): Promise<void>;
    stop(): Promise<void>;
    seek(positionMs: number): Promise<void>;
    amplitude(): Promise<number>;
  }
  export function setAudioModeAsync(mode?: AudioMode): Promise<void>;
  export function useAudioRecorder(opts?: unknown): RecorderHandle;
  export function useAudioPlayer(uri?: string): PlayerHandle;
  export function useAudioSampleListener(
    player: PlayerHandle,
    cb: (sample: { rms: number; t: number }) => void,
  ): () => void;
}