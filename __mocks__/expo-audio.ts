/**
 * expo-audio mock for Jest — the native binding is unavailable in Node.
 *
 * Surface used by audio.ts (chat-mvp Task 3.1):
 *   - setAudioModeAsync({...})  → resolves when audio session is configured
 *   - useAudioRecorder()  → returns a recorder handle; pressable lifecycle via record()/stop()/cleanup()
 *   - useAudioPlayer(uri?)  → returns a player handle with play()/pause()/seek() + amplitude()
 *   - useAudioSampleListener(player, callback)  → installs a sample listener; returns unsubscribe
 *
 * Each handle is a factory of jest.fn so tests can override return values.
 */

interface AudioMode {
  allowsRecording?: boolean;
  playsInSilentMode?: boolean;
  interruptionMode?: 'mixWithOthers' | 'doNotMix' | 'duckOthers';
}

interface RecorderHandle {
  uri: string | null;
  record: jest.Mock<Promise<void>, []>;
  stop: jest.Mock<Promise<{ uri: string; durationMs: number }>, []>;
  getStatus: jest.Mock<'idle' | 'recording' | 'stopped', []>;
  cleanup: jest.Mock<Promise<void>, []>;
}

interface PlayerHandle {
  uri: string;
  play: jest.Mock<Promise<void>, []>;
  pause: jest.Mock<Promise<void>, []>;
  stop: jest.Mock<Promise<void>, []>;
  seek: (...args: unknown[]) => Promise<void>;
  amplitude: jest.Mock<Promise<number>, []>;
}

let _recorderCounter = 0;
let _playerCounter = 0;

export const setAudioModeAsync = jest.fn((_mode?: AudioMode) => Promise.resolve());

export function useAudioRecorder(_opts?: unknown): RecorderHandle {
  _recorderCounter += 1;
  const id = _recorderCounter;
  let uri: string | null = null;
  let status: 'idle' | 'recording' | 'stopped' = 'idle';
  return {
    get uri() {
      return uri;
    },
    record: jest.fn(() => {
      uri = `/tmp/practice-test/audio/${id}.wav`;
      status = 'recording';
      return Promise.resolve();
    }),
    stop: jest.fn(() => {
      const out = uri ?? `/tmp/practice-test/audio/${id}.wav`;
      uri = out;
      status = 'stopped';
      return Promise.resolve({ uri: out, durationMs: 1000 });
    }),
    getStatus: jest.fn(() => status),
    cleanup: jest.fn(() => {
      uri = null;
      status = 'idle';
      return Promise.resolve();
    }),
  };
}

export function useAudioPlayer(_uri?: string): PlayerHandle {
  _playerCounter += 1;
  return {
    uri: _uri ?? '',
    play: jest.fn(() => Promise.resolve()),
    pause: jest.fn(() => Promise.resolve()),
    stop: jest.fn(() => Promise.resolve()),
    seek: jest.fn(() => Promise.resolve()),
    amplitude: jest.fn(() => Promise.resolve(0.1)),
  };
}

export function useAudioSampleListener(
  _player: PlayerHandle,
  cb: (sample: { rms: number; t: number }) => void,
): () => void {
  let counter = 0;
  const interval = setInterval(() => {
    counter += 1;
    cb({ rms: Math.random(), t: counter });
  }, 16);
  return () => clearInterval(interval);
}

/**
 * Test-only: drives one synthetic amplitude sample to the most-recently
 * registered listener. The chat screen subscribes once via
 * `subscribeAmplitude`; tests use this helper to script events.
 */
export const _emitAmplitude = jest.fn(
  (cb: (s: { rms: number; t: number }) => void, rms = 0.5, t = 0) => {
    cb({ rms, t });
  },
);