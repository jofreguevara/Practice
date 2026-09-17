# Spec: Topic Cards

## Purpose

Deliver the eight topic cards on the home screen that seed the LLM system prompt and start a conversation with a single tap. Each topic is backed by a bundled PNG in `assets/topics/` (no remote fetch, no CDN), and tapping the card opens a fresh conversation with the topic injected into the system prompt. This spec covers the `app/(tabs)/index.tsx` home screen shipped by `chat-mvp`.

## Requirements

### REQ-1: Eight bundled topic cards

The system SHALL render exactly 8 topic cards on the home screen in a 2-column grid: `travel`, `food`, `work`, `hobbies`, `weather`, `shopping`, `health`, `daily-life`. Each card SHALL display its bundled PNG from `assets/topics/<topic>.png` (1024×1024, ~2 MB each, total ~16 MB) and its label. The system MUST NOT fetch any image at runtime.

#### Scenario: All 8 topic cards render with bundled PNGs

- **Given** the home screen is mounted on a device with the bundled assets
- **When** the grid renders
- **Then** 8 cards are visible in 2 columns
- **And** each card shows the correct label and PNG
- **And** no network call is made to fetch the PNG

#### Scenario: Missing PNG falls back to placeholder

- **Given** `assets/topics/<topic>.png` is missing from the bundle (corrupted install)
- **When** the affected card renders
- **Then** the card shows a neutral placeholder graphic and the label
- **And** the card remains tappable and starts a conversation

### REQ-2: Topic → LLM system prompt injection

The system SHALL maintain a topic-to-system-prompt mapping for all 8 topics. When the user taps a topic card, the system SHALL create a new `conversation` row with `topic = <topic>` and SHALL inject the topic-specific system prompt into the active LLM context. The system prompt SHALL include the persona name, level, practice locale, and the topic-specific framing.

#### Scenario: Tap travel card opens conversation with travel prompt

- **Given** the user is on the home screen and `user_profile.level = "A2"`, `practice_locale = "en-US"`
- **When** the user taps the `travel` card
- **Then** a new conversation row is created with `topic = "travel"`
- **And** the chat screen opens with a system prompt that mentions travel scenarios (airports, hotels, asking for directions)

#### Scenario: Switching topics starts a fresh conversation

- **Given** the user is in an active `travel` conversation
- **When** the user returns to home and taps `food`
- **Then** a new conversation row is created with `topic = "food"` (not a continuation)
- **And** the previous travel conversation remains in history with `ended_at` set

## Constraints

- 8 topics is the **v1 default** (default #2 from product decisions); per-user custom topic authoring is **out of scope for v1**.
- All PNGs are bundled — no CDN, no remote fetch, no Lottie animations for v1.
- Bundle impact: ~16 MB for 8 PNGs at 1024×1024 (~2 MB each).
- Topic PNGs MAY be swapped for illustrations at design time; the spec does not constrain the illustration source as long as it is bundled.
- Implemented by sub-change `chat-mvp` (home screen + topic mapping) and `bootstrap-toolchain-and-skeleton` (asset folder skeleton).