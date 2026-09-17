# Spec: Text-to-Speech Pipeline

## Purpose

Deliver the on-device text-to-speech pipeline that turns an assistant reply into spoken audio in the user's practice locale. The pipeline uses `expo-speech` wrapping the native Android `TextToSpeech` and iOS `AVSpeechSynthesizer` engines, with a documented upgrade path to Piper VITS via `react-native-sherpa-onnx` (single-file refactor inside `tts.ts`). This spec covers the `tts` sub-component of the `chat-mvp` change.

## Requirements

### REQ-1: Locale-correct native playback

The system SHALL synthesize assistant text to audio via `expo-speech` targeting the native engine for the requested BCP-47 locale. The system SHALL support `en-US`, `en-GB`, `es-ES`, and `es-MX` in v1. The system MUST NOT make any network call during synthesis.

#### Scenario: en-US assistant reply is spoken in English

- **Given** the user's `practice_locale` is `en-US` and an assistant reply of ~30 words is ready
- **When** the TTS service is invoked with `(text, locale = "en-US")`
- **Then** the native engine produces a WAV at `FileSystem.documentDirectory + 'audio/chat/<conversationId>/<messageId>.wav'`
- **And** the resulting playback sounds like English when heard

#### Scenario: es-ES assistant reply is spoken in Spanish

- **Given** the user's `practice_locale` is `es-ES` and an assistant reply is ready
- **When** the TTS service is invoked with `(text, locale = "es-ES")`
- **Then** the native engine produces a WAV and the audio sounds like Spanish
- **And** the assistant locale override (if set in Settings) takes precedence over the profile locale

### REQ-2: Auto voice selection with neural preference

The system SHALL prefer a neural-quality voice for the active locale when one is installed on the device, and SHALL fall back to the default voice for that locale otherwise. The system SHALL detect voice availability on first launch and cache the selection in `user_profile.preferences_json.ttsVoiceId`. The default voice locale SHALL be auto-detected from the device locale on first launch; if unsupported, the system SHALL default to `en-US`. This default is **user-overridable in Settings → Conversation**.

#### Scenario: Neural voice available — used automatically

- **Given** the user's device has a neural voice installed for `en-GB` and `practice_locale = en-GB`
- **When** first launch runs the voice quality check
- **Then** the neural voice id is stored in `user_profile.preferences_json.ttsVoiceId`
- **And** all subsequent TTS calls for `en-GB` use the neural voice

#### Scenario: No neural voice — default voice used without error

- **Given** the user's device only has the stock voice for `es-MX`
- **When** the TTS service is invoked for `es-MX`
- **Then** synthesis succeeds with the default voice
- **And** the waveform visualization reflects the playback amplitude

### REQ-3: Barge-in via VAD-triggered stop

The system SHALL keep the recorder armed in low-power listening mode during TTS playback. When Silero VAD fires `speech_start` with confidence > 0.6, the system SHALL call `Speech.stop()` within 100 ms and switch the conversation into record mode. The system MUST NOT require a button release for barge-in to engage.

#### Scenario: User interrupts playback — TTS stops cleanly

- **Given** TTS is mid-sentence playing an assistant reply
- **When** the user speaks loudly enough for VAD to fire `speech_start` with confidence 0.7
- **Then** TTS playback stops within 100 ms
- **And** the conversation state transitions from `speaking` to `listening`
- **And** the new user utterance begins recording immediately

#### Scenario: Ambient noise below threshold does not interrupt

- **Given** TTS is playing and the room has steady background noise below the VAD confidence threshold
- **When** no `speech_start` event fires from VAD
- **Then** TTS playback continues uninterrupted until the utterance finishes
- **And** the conversation state remains `speaking`

## Constraints

- **expo-speech** (Expo first-party module, MIT) is the v1 TTS binding. No cloud TTS, no remote API.
- Supported locales: `en-US`, `en-GB`, `es-ES`, `es-MX` (system coverage). Piper VITS upgrade path via `react-native-sherpa-onnx` is a single-function refactor in `app/services/tts.ts` and is preserved for v2 but not shipped.
- VAD-driven barge-in adds ~5% extra battery per minute of conversation; accepted for the MVP.
- The 5 product defaults — including TTS locale auto-detect — are baked in as **user-overridable** in Settings.
- Implemented by sub-change `bootstrap-toolchain-and-skeleton` (binding install) and `chat-mvp` (service wiring + barge-in).