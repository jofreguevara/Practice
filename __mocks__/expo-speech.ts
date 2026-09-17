/**
 * expo-speech mock for Jest — the native binding is unavailable in Node.
 *
 * Surface used by tts.ts (chat-mvp Task 3.1):
 *   - Speech.speak(text, options?)  → resolves when speech finishes
 *   - Speech.stop()                  → no-op (for barge-in)
 *   - Speech.getAvailableVoicesAsync() → returns voice descriptors
 *   - Speech.maxSpeechInputLength    → numeric constant
 *
 * Tests override the per-export jest.fn defaults to script voice availability
 * and barge-in behaviour.
 */

interface SpeakOptions {
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

export const Speech = {
  speak: jest.fn((_text: string, _opts?: SpeakOptions) =>
    Promise.resolve({ uri: 'mock-tts.wav', durationMs: 100 }),
  ),
  stop: jest.fn(() => undefined),
  getAvailableVoicesAsync: jest.fn<Promise<VoiceDescriptor[]>, []>(() =>
    Promise.resolve([
      { identifier: 'com.apple.ttsbundle.Samantha-compact', name: 'Samantha', language: 'en-US', quality: 'default' },
      { identifier: 'com.apple.ttsbundle.Daniel-compact', name: 'Daniel', language: 'en-GB', quality: 'enhanced' },
      { identifier: 'com.apple.ttsbundle.Monica-compact', name: 'Monica', language: 'es-ES', quality: 'enhanced' },
      { identifier: 'com.apple.ttsbundle.Paulina-compact', name: 'Paulina', language: 'es-MX', quality: 'default' },
    ]),
  ),
  maxSpeechInputLength: 2_500,
};

export function getDefaultVoiceForLocale(
  voices: VoiceDescriptor[],
  locale: string,
): VoiceDescriptor | null {
  const exact = voices.find((v) => v.language === locale);
  if (exact) return exact;
  const base = locale.split('-')[0] ?? '';
  return voices.find((v) => v.language.startsWith(base)) ?? null;
}