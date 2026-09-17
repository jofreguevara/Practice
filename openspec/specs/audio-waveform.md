# Spec: Audio Waveform Component — promoted from change english-practice-mobile-offline-mvp on 2026-09-15
# Spec: Audio Waveform Component

## Purpose

Deliver the on-screen waveform visualization that doubles as the press-and-hold talk affordance. The component renders 64 vertical bars driven by real-time amplitude samples, switches visual modes based on conversation state, and exposes the hold-to-talk gesture. This spec covers the `Waveform` component authored in `chat-mvp` and consumed by `app/(tabs)/chat.tsx`.

## Requirements

### REQ-1: Four visual modes

The system SHALL render the waveform in one of four modes: `idle`, `listening`, `processing`, `speaking`. Each mode SHALL have a distinct visual contract. The system SHALL transition modes in response to the conversation state store and MUST NOT flash or jump between modes during steady state.

#### Scenario: idle mode shows a flat baseline

- **Given** the conversation is in `idle` state and the chat screen is mounted
- **When** the waveform renders
- **Then** 64 bars are visible at minimum height (5% of max) as a quiet indicator
- **And** the prompt "Tap to talk" is visible

#### Scenario: listening mode shows VAD-driven amplitude

- **Given** the user is holding the talk button and the conversation is in `listening`
- **When** the VAD pipeline emits amplitude samples
- **Then** bar heights interpolate to the most recent amplitude
- **And** bars animate smoothly without dropping frames below 30 fps

### REQ-2: 60 Hz sample ingestion, 30 fps render

The system SHALL ingest amplitude samples from `useAudioSampleListener` at the producer rate (target 60 Hz). The system SHALL throttle renders to 30 fps via `requestAnimationFrame`. The system SHALL drop, not queue, samples that arrive faster than the render budget. The system SHALL NOT use a third-party charting library.

#### Scenario: Sample flood does not stall the UI

- **Given** TTS is playing and the audio engine pushes samples at 60 Hz
- **When** the renderer consumes the sample stream
- **Then** bar updates land on the UI thread at ~30 fps
- **And** the JS thread does not block the scroll/touch handlers

#### Scenario: processing mode shows a pulsing single bar

- **Given** the conversation is in `processing` (STT or LLM in progress)
- **When** the waveform renders
- **Then** the central bar pulses at ~1 Hz
- **And** the surrounding 63 bars are at minimum height

## Constraints

- **react-native-svg** (MIT) is the rendering primitive; no chart library, no D3, no Skia for v1.
- **react-native-reanimated** (MIT) drives the height interpolation.
- The component is ~80 LOC of TSX with internal SVG; no external dependency beyond `react-native-svg` and `react-native-reanimated`.
- 64 bars, fixed width, full-bleed within the chat screen.
- Implemented by sub-change `chat-mvp`. The component is consumed by `app/(tabs)/chat.tsx`.