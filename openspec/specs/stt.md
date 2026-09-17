# Spec: Speech-to-Text Pipeline — promoted from change english-practice-mobile-offline-mvp on 2026-09-15
# Spec: Speech-to-Text Pipeline

## Purpose

Deliver the on-device speech-to-text pipeline that turns a recorded user utterance into a transcribed string with detected language (English or Spanish). The pipeline uses `whisper.rn` with the multilingual `ggml-tiny.bin` model and the bundled Silero VAD, so a single bundled model covers both practice directions with silence trimming before inference. This spec covers the `stt` sub-change feeding the `chat-mvp` change.

## Requirements

### REQ-1: Bilingual auto-detect transcription

The system SHALL transcribe user utterances to text in English or Spanish using the `whisper.rn` binding loaded with `ggml-tiny.bin` (multilingual, MIT-licensed). The system SHALL emit a `(text, language, confidence)` result object for every accepted utterance. The system MUST NOT make any network call during transcription.

#### Scenario: English utterance transcribed as English

- **Given** the STT model is loaded and the user presses-and-holds the talk button while speaking English for ~3 seconds
- **When** the user releases the button and the utterance is dispatched to the STT service
- **Then** the service returns a non-empty ASCII/Latin text string
- **And** the detected `language` field equals `en`

#### Scenario: Spanish utterance transcribed as Spanish

- **Given** the STT model is loaded and the user speaks Spanish for ~3 seconds
- **When** the recorded WAV is dispatched to the STT service
- **Then** the returned `text` contains Spanish diacritics (e.g. `ñ`, `á`, `é`)
- **And** the detected `language` field equals `es`

### REQ-2: Silero VAD-driven silence trimming

The system SHALL initialize the bundled Silero VAD via `whisper.rn`'s `initWhisperVad` (v6.2.0, MIT, ships inside the whisper.rn distribution). The system SHALL trim leading and trailing silence from each push-to-talk recording before dispatching it to the STT model. If the VAD model fails to load, the system SHALL fall back to an energy-based amplitude threshold on the `expo-audio` sample stream.

#### Scenario: Silence trimmed at start and end

- **Given** the user holds the talk button and pauses for 800 ms before speaking for 2 s then pauses 600 ms before release
- **When** the recorded buffer is processed by the VAD pipeline
- **Then** the dispatched audio is no more than the 2 s of voiced content ± 100 ms
- **And** the transcribed text reflects the spoken content only

#### Scenario: VAD model fails to load — energy fallback

- **Given** `initWhisperVad` throws on first launch (corrupted asset, ABI mismatch)
- **When** the STT service is requested for a recording
- **Then** the service catches the error and switches to an energy-threshold trim path
- **And** a non-blocking warning toast is surfaced to the user

### REQ-3: Offline-only operation

The system MUST NOT open any TCP, UDP, TLS, or HTTP socket during STT inference, model load, or asset verification. The system SHALL function identically when the device is in airplane mode. The system SHALL expose a `networkBytesSent` counter on the STT service that returns `0` after every transcription.

#### Scenario: Airplane-mode transcription succeeds

- **Given** the device is in airplane mode and the STT model is loaded
- **When** the user records and dispatches a 3 s English utterance
- **Then** a valid transcription is returned within the latency budget
- **And** `networkBytesSent` for the call equals `0`

#### Scenario: STT rejects any outbound call attempt

- **Given** a misconfigured debug build attempts to fetch a model update over HTTPS during STT init
- **When** the STT service starts up
- **Then** the outbound call is blocked by the offline-only guard
- **And** the service falls back to the locally bundled `ggml-tiny.bin`

## Constraints

- **whisper.rn** is the only allowed STT library for v1 (MIT). No cloud STT, no `@react-native-voice/voice` (online route on iOS), no remote API.
- **ggml-tiny.bin** (multilingual, MIT, ~78 MB on disk) is the default STT model. `ggml-tiny-q5_1.bin` (~32 MB) and `ggml-tiny.en.bin` (English-only) are documented upgrade paths but not bundled.
- Silero VAD model ships inside whisper.rn (`initWhisperVad`); no separate VAD download.
- Latency budget: **≤ 3 s for utterances up to 10 s** on Snapdragon 7-gen or newer.
- Implemented by sub-change `bootstrap-toolchain-and-skeleton` (binding install) and `model-assets` (asset vendor).