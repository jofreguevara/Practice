# Spec: User Profile

## Purpose

Deliver the singleton user profile that holds level, topics, preferences, and progress — bound to a Zustand store so every screen can read and react to profile changes. The profile is the single source of truth for the LLM persona, the TTS voice, and the auto-summarize cadence. This spec covers the `profile` sub-component of `chat-mvp`.

## Requirements

### REQ-1: Singleton row + Zustand binding

The system SHALL persist exactly one row in `user_profile` (id = 1). The system SHALL hydrate the Zustand `profile` store from that row on app boot. The store SHALL expose typed selectors for `level`, `primaryLocale`, `practiceLocale`, `topics`, `preferences`, and `progress`. Any write to the store SHALL flush to SQLite within the same tick.

#### Scenario: First launch seeds profile and store

- **Given** the database is freshly migrated and no `user_profile` row exists
- **When** the Zustand store initializes on app boot
- **Then** a singleton row is inserted with defaults (`display_name = "Learner"`, `level = "A2"`, `topics = []`, `practice_locale = "es-ES"`, `primary_locale = "en-US"`)
- **And** the store reflects those values immediately

#### Scenario: Restart restores profile from SQLite

- **Given** the user previously changed `level` to `B1` and `topics` to `["travel","food"]`
- **When** the app restarts and hydration runs
- **Then** the Zustand store reports `level = "B1"` and `topics = ["travel","food"]`
- **And** the LLM persona prompt uses those values on the next turn

### REQ-2: CEFR level + topics + preferences schema

The system SHALL accept `level` values in `{A1, A2, B1, B2, C1, C2}` (CHECK constraint at the SQLite layer). The system SHALL accept `topics_json` as a JSON array of the 8 seed topic ids (`travel`, `food`, `work`, `hobbies`, `weather`, `shopping`, `health`, `daily-life`). The system SHALL accept `preferences_json` with at least the keys `ttsVoiceId`, `ttsRate`, `sttSensitivity`, `personaName`, `modelVariant`, `encryptionEnabled`, and `lowMemoryMode`. Invalid `level` values SHALL be rejected at the SQLite layer with a constraint error.

#### Scenario: Level update propagates to LLM prompt

- **Given** the user changes `level` from `A2` to `B1` in Settings
- **When** the store write flushes to SQLite and the next LLM turn is invoked
- **Then** the system prompt contains `level = "B1"`
- **And** the assistant reply uses B1-level vocabulary

#### Scenario: Topic add/remove updates JSON array

- **Given** the user adds `weather` to `topics` and removes `food`
- **When** the store write flushes
- **Then** `topics_json` in SQLite is `["travel","work","hobbies","shopping","weather","health","daily-life"]` (after the 8-topic default seed plus the user's edits)
- **And** the LLM system prompt reflects the current topic list

### REQ-3: Auto-summarize every 10 turns

The system SHALL increment a turn counter per conversation and trigger a profile write to `progress_json.summary` on every 10th assistant turn. The summary SHALL be the rolling conversation summary produced by the LLM (see `llm.md` REQ-3). The system SHALL expose the counter in `progress_json.turnCount` for inspection. This cadence is the default from the product decisions; **user-overridable in Settings → Conversation**.

#### Scenario: Turn 10 writes summary into profile

- **Given** an active conversation reaches its 10th assistant turn
- **When** the LLM returns the 10th reply
- **Then** a summary call writes the rolling summary into `user_profile.progress_json.summary`
- **And** `progress_json.turnCount` is `10`

#### Scenario: Turn 9 does not write summary

- **Given** an active conversation at 8 prior turns
- **When** the 9th assistant turn completes
- **Then** `progress_json.summary` is unchanged
- **And** `progress_json.turnCount` becomes `9`

## Constraints

- **Zustand** is the only allowed state store for the profile (MIT).
- Profile is a singleton SQLite row; no multi-profile, no per-conversation profile scope.
- `preferences_json` schema is additive — new keys may appear without a migration, but removing a key requires one.
- The 5 product defaults (persona `"Coach"`, 8 topics seeded, auto-summarize every 10 turns, bundle EN+ES) are baked into the initial profile state.
- Implemented by sub-change `bootstrap-toolchain-and-skeleton` (Zustand install) and `chat-mvp` (store, selectors, summarization hook).