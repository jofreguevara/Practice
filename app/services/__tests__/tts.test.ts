/**
 * Tests for app/services/tts.ts (chat-mvp Task 3.1).
 *
 * Covers Jest ids from tasks.md:
 *   - tts.speaks_en_us
 *   - tts.speaks_es_es
 *   - tts.neural_voice_preferred
 *   - tts.stop_for_barge_in
 *
 * RED→GREEN discipline: tests authored before tts.ts existed.
 */
import { Speech } from 'expo-speech';
import {
  speak,
  stopSpeaking,
  getNetworkBytesSent,
  pickVoiceForLocale,
  __resetTtsForTests,
} from '../tts';

const speakMock = Speech.speak as unknown as jest.Mock;
const stopMock = Speech.stop as unknown as jest.Mock;
const voicesMock = Speech.getAvailableVoicesAsync as unknown as jest.Mock;

describe('tts.speak', () => {
  beforeEach(() => {
    __resetTtsForTests();
    jest.clearAllMocks();
    speakMock.mockResolvedValue({ uri: 'mock.wav', durationMs: 1200 });
    voicesMock.mockResolvedValue([
      { identifier: 'voice.en.default', name: 'Samantha', language: 'en-US', quality: 'default' },
      { identifier: 'voice.en.neural', name: 'Ava', language: 'en-US', quality: 'premium' },
      { identifier: 'voice.en-gb.default', name: 'Daniel', language: 'en-GB', quality: 'enhanced' },
      { identifier: 'voice.es-es.default', name: 'Monica', language: 'es-ES', quality: 'enhanced' },
      { identifier: 'voice.es-mx.default', name: 'Paulina', language: 'es-MX', quality: 'default' },
    ]);
  });

  test('tts.speaks_en_us: speaks with en-US voice', async () => {
    const result = await speak('Hello world', {
      locale: 'en-US',
      conversationId: 'c1',
      messageId: 'm1',
    });
    expect(speakMock).toHaveBeenCalledTimes(1);
    const opts = speakMock.mock.calls[0]?.[1];
    expect(opts.language).toBe('en-US');
    // Neural voice picked automatically (quality: premium).
    expect(opts.voice).toBe('voice.en.neural');
    // Path written into the design-specified layout.
    expect(result.audioPath).toMatch(/audio\/chat\/c1\/m1\.wav$/);
  });

  test('tts.speaks_es_es: speaks with es-ES voice', async () => {
    const result = await speak('¿Cómo estás?', {
      locale: 'es-ES',
      conversationId: 'c2',
      messageId: 'm9',
    });
    expect(speakMock).toHaveBeenCalledTimes(1);
    const opts = speakMock.mock.calls[0]?.[1];
    expect(opts.language).toBe('es-ES');
    // No 'premium' quality voice for es-ES → falls back to 'enhanced'.
    expect(opts.voice).toBe('voice.es-es.default');
    expect(result.audioPath).toMatch(/audio\/chat\/c2\/m9\.wav$/);
  });

  test('tts.neural_voice_preferred: highest quality voice wins', async () => {
    const voice = pickVoiceForLocale(
      [
        { identifier: 'a', name: 'low', language: 'en-US', quality: 'default' },
        { identifier: 'b', name: 'mid', language: 'en-US', quality: 'enhanced' },
        { identifier: 'c', name: 'high', language: 'en-US', quality: 'premium' },
      ],
      'en-US',
    );
    expect(voice?.identifier).toBe('c');
  });

  test('tts.fallback_to_language_family: missing exact locale → base match', async () => {
    // Pretend no en-AU voice — should fall back to en-US (base 'en').
    const voice = pickVoiceForLocale(
      [{ identifier: 'x', name: 'US', language: 'en-US', quality: 'default' }],
      'en-AU',
    );
    expect(voice?.identifier).toBe('x');
  });

  test('tts.locale_required: missing locale → throws', async () => {
    await expect(
      speak('hello', { conversationId: 'c', messageId: 'm' }),
    ).rejects.toThrow(/locale/);
  });

  test('tts.stop_for_barge_in: stopSpeaking() calls Speech.stop synchronously', () => {
    stopSpeaking();
    expect(stopMock).toHaveBeenCalledTimes(1);
  });

  test('tts.stop_is_idempotent: multiple stopSpeaking calls do not error', () => {
    expect(() => {
      stopSpeaking();
      stopSpeaking();
      stopSpeaking();
    }).not.toThrow();
  });

  test('tts.network_bytes_zero: getNetworkBytesSent returns 0 after speak', async () => {
    expect(getNetworkBytesSent()).toBe(0);
    await speak('hi', { locale: 'en-US', conversationId: 'c', messageId: 'm' });
    expect(getNetworkBytesSent()).toBe(0);
  });

  test('tts.explicit_voice_id_overrides_autopick: caller-passed voiceId wins', async () => {
    await speak('hello', {
      locale: 'en-US',
      voiceId: 'voice.en.default',
      conversationId: 'c',
      messageId: 'm',
    });
    const opts = speakMock.mock.calls[0]?.[1];
    expect(opts.voice).toBe('voice.en.default');
  });

  test('tts.rate_passthrough: TtsOptions.rate flows into speak opts', async () => {
    await speak('hello', {
      locale: 'en-US',
      rate: 1.5,
      conversationId: 'c',
      messageId: 'm',
    });
    const opts = speakMock.mock.calls[0]?.[1];
    expect(opts.rate).toBe(1.5);
  });

  test('tts.path_layout_matches_design: result.audioPath uses <convId>/<msgId>.wav', async () => {
    const r = await speak('hi', {
      locale: 'en-US',
      conversationId: 'abc-123',
      messageId: 'msg-9',
    });
    expect(r.audioPath).toBe('audio/chat/abc-123/msg-9.wav');
  });

  test('tts.durationMs_returned: result carries the synthesized duration', async () => {
    speakMock.mockResolvedValueOnce({ uri: 'x.wav', durationMs: 2400 });
    const r = await speak('hi', {
      locale: 'en-US',
      conversationId: 'c',
      messageId: 'm',
    });
    expect(r.durationMs).toBe(2400);
  });
});