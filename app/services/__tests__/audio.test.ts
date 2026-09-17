/**
 * Tests for app/services/audio.ts (chat-mvp Task 3.1).
 *
 * Covers Jest ids from tasks.md:
 *   - audio.records_16k_mono
 *   - audio.amplitude_stream_60hz
 *
 * RED→GREEN discipline: tests authored before audio.ts existed.
 */
import {
  startRecording,
  stopRecording,
  play,
  subscribeAmplitude,
  getNetworkBytesSent,
  __resetAudioForTests,
} from '../audio';

describe('audio.recorder lifecycle', () => {
  beforeEach(() => {
    __resetAudioForTests();
    jest.clearAllMocks();
  });

  test('audio.records_16k_mono: recorder starts and stops, returns AudioBuffer shape', async () => {
    await startRecording({ sampleRate: 16000, channels: 1 });
    const buf = await stopRecording();
    expect(buf.uri).toMatch(/\.wav$/);
    expect(typeof buf.durationMs).toBe('number');
    expect(buf.sampleRate).toBe(16000);
  });

  test('audio.recorder_uses_default_16k_when_no_opts', async () => {
    await startRecording();
    const buf = await stopRecording();
    expect(buf.sampleRate).toBe(16000);
  });

  test('audio.recorder_releases_on_stop', async () => {
    await startRecording({ sampleRate: 16000, channels: 1 });
    await stopRecording();
    // Re-calling startRecording should produce a fresh recorder instance.
    await startRecording({ sampleRate: 16000, channels: 1 });
    const buf = await stopRecording();
    expect(buf.uri).toMatch(/\.wav$/);
  });

  test('audio.stop_without_start_throws', async () => {
    // Recording never started → no buffer to return.
    await expect(stopRecording()).rejects.toThrow();
  });
});

describe('audio.amplitude stream', () => {
  beforeEach(() => {
    __resetAudioForTests();
    jest.clearAllMocks();
  });

  test('audio.amplitude_stream_60hz: subscribe emits samples, unsubscribe stops', async () => {
    await startRecording({ sampleRate: 16000, channels: 1 });
    const samples: number[] = [];
    const unsubscribe = subscribeAmplitude((rms) => {
      samples.push(rms);
    });
    // Wait long enough for several samples (~16ms intervals in the mock).
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(samples.length).toBeGreaterThan(2);
    unsubscribe();
    const snapshot = samples.length;
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(samples.length).toBe(snapshot); // no new samples after unsubscribe
    await stopRecording();
  });

  test('audio.subscribe_returns_function', () => {
    const unsub = subscribeAmplitude(() => undefined);
    expect(typeof unsub).toBe('function');
    unsub();
  });
});

describe('audio.play + NoNetworkPolicy', () => {
  beforeEach(() => {
    __resetAudioForTests();
    jest.clearAllMocks();
  });

  test('audio.play_resolves', async () => {
    await expect(play('/audio/chat/c1/m.wav')).resolves.toBeUndefined();
  });

  test('audio.network_bytes_zero: returns 0', () => {
    expect(getNetworkBytesSent()).toBe(0);
  });
});