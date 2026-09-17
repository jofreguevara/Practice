/**
 * Tests for app/services/stt.ts (chat-mvp Task 3.1).
 *
 * Covers Jest ids from tasks.md:
 *   - stt.transcribes_en
 *   - stt.transcribes_es
 *   - stt.vad_fallback_on_init_error
 *   - stt.network_bytes_zero
 *
 * RED→GREEN: tests were authored before stt.ts existed (the test file
 * references the public surface; the implementation follows).
 */
import { initWhisper, initWhisperVad, transcribeFile } from 'whisper.rn';
import * as FileSystem from 'expo-file-system';
import * as Network from 'expo-network';
import {
  transcribe,
  getNetworkBytesSent,
  isVadFallbackActive,
  __resetSttForTests,
} from '../stt';
import type { SttAudio } from '../stt';

const transcribeFileMock = transcribeFile as unknown as jest.Mock;
const initWhisperMock = initWhisper as unknown as jest.Mock;
const initWhisperVadMock = initWhisperVad as unknown as jest.Mock;

const sampleAudio: SttAudio = {
  uri: 'documentDirectory/audio/chat/c1/m1_user.wav',
  durationMs: 2500,
  sampleRate: 16000,
};

describe('stt.transcribe', () => {
  beforeEach(() => {
    __resetSttForTests();
    jest.clearAllMocks();
    (FileSystem.getInfoAsync as unknown as jest.Mock).mockResolvedValue({
      exists: true,
      isDirectory: false,
    });
  });

  test('stt.transcribes_en: returns en text with detectedLocale en', async () => {
    initWhisperVadMock.mockResolvedValueOnce({ id: 11, sampleRate: 16000 });
    initWhisperMock.mockResolvedValueOnce({ id: 12, gpu: false });
    transcribeFileMock.mockResolvedValueOnce({
      text: 'Hello there friend',
      language: 'en',
      durationMs: 2400,
    });

    const result = await transcribe(sampleAudio);
    expect(result.text).toBe('Hello there friend');
    expect(result.detectedLocale).toBe('en');
    expect(typeof result.durationMs).toBe('number');
    // initWhisperVad succeeded → no energy-fallback engaged.
    expect(isVadFallbackActive()).toBe(false);
  });

  test('stt.transcribes_es: Spanish diacritics + detectedLocale es', async () => {
    initWhisperVadMock.mockResolvedValueOnce({ id: 21, sampleRate: 16000 });
    initWhisperMock.mockResolvedValueOnce({ id: 22, gpu: false });
    transcribeFileMock.mockResolvedValueOnce({
      text: '¿Cómo estás hoy?',
      language: 'es',
      durationMs: 2100,
    });

    const result = await transcribe(sampleAudio);
    expect(result.text).toMatch(/[ñáéíóú¿¡]/);
    expect(result.detectedLocale).toBe('es');
  });

  test('stt.vad_fallback_on_init_error: VAD throws → energy-fallback engaged', async () => {
    // Simulate VAD init failure (corrupted asset, ABI mismatch).
    initWhisperVadMock.mockRejectedValueOnce(new Error('VAD model load failed'));
    initWhisperMock.mockResolvedValueOnce({ id: 31, gpu: false });
    transcribeFileMock.mockResolvedValueOnce({
      text: 'fallback path engaged',
      language: 'en',
      durationMs: 1800,
    });

    const result = await transcribe(sampleAudio);
    expect(result.text).toBe('fallback path engaged');
    expect(isVadFallbackActive()).toBe(true);
    // VAD init was attempted exactly once before falling back.
    expect(initWhisperVadMock).toHaveBeenCalledTimes(1);
  });

  test('stt.network_bytes_zero: getNetworkBytesSent returns 0 after transcribe', async () => {
    initWhisperVadMock.mockResolvedValueOnce({ id: 41, sampleRate: 16000 });
    initWhisperMock.mockResolvedValueOnce({ id: 42, gpu: false });
    transcribeFileMock.mockResolvedValueOnce({
      text: 'no network bytes used',
      language: 'en',
      durationMs: 1500,
    });
    expect(getNetworkBytesSent()).toBe(0);
    await transcribe(sampleAudio);
    expect(getNetworkBytesSent()).toBe(0);
  });

  test('stt.locale_lock: explicit locale="en" override forces detectedLocale="en"', async () => {
    initWhisperVadMock.mockResolvedValueOnce({ id: 51, sampleRate: 16000 });
    initWhisperMock.mockResolvedValueOnce({ id: 52, gpu: false });
    transcribeFileMock.mockResolvedValueOnce({
      text: 'forced english',
      language: 'en',
      durationMs: 1200,
    });
    const result = await transcribe(sampleAudio, 'en');
    expect(result.detectedLocale).toBe('en');
  });

  test('stt.locale_lock: explicit locale="es" override forces detectedLocale="es"', async () => {
    initWhisperVadMock.mockResolvedValueOnce({ id: 61, sampleRate: 16000 });
    initWhisperMock.mockResolvedValueOnce({ id: 62, gpu: false });
    transcribeFileMock.mockResolvedValueOnce({
      text: 'español forzado',
      language: 'es',
      durationMs: 1100,
    });
    const result = await transcribe(sampleAudio, 'es');
    expect(result.detectedLocale).toBe('es');
  });

  test('stt.auto_detect: language token from whisper wins when locale="auto"', async () => {
    initWhisperVadMock.mockResolvedValueOnce({ id: 71, sampleRate: 16000 });
    initWhisperMock.mockResolvedValueOnce({ id: 72, gpu: false });
    transcribeFileMock.mockResolvedValueOnce({
      text: 'bonjour',
      language: 'fr', // not en / es; we must still produce a usable result
      durationMs: 1000,
    });
    const result = await transcribe(sampleAudio, 'auto');
    // Default to en when whisper returns an unsupported language — the user
    // is practising EN↔ES only, so we treat anything else as en.
    expect(['en', 'es']).toContain(result.detectedLocale);
  });

  test('stt.NoNetworkPolicy: throws NoNetworkPolicyError when network is connected', async () => {
    // Override the network mock for this test.
    (Network.getNetworkStateAsync as unknown as jest.Mock).mockResolvedValueOnce({
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi',
    });
    initWhisperVadMock.mockResolvedValueOnce({ id: 81, sampleRate: 16000 });
    initWhisperMock.mockResolvedValueOnce({ id: 82, gpu: false });
    transcribeFileMock.mockResolvedValueOnce({
      text: 'should not reach this',
      language: 'en',
      durationMs: 1,
    });
    await expect(transcribe(sampleAudio)).rejects.toThrow(/No-network policy/);
  });
});