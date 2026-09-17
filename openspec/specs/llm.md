# Spec: LLM Conversation Agent — promoted from change english-practice-mobile-offline-mvp on 2026-09-15
# Spec: LLM Conversation Agent

## Purpose

Deliver the on-device LLM conversation agent that drives the practice loop: maintain a profile-aware persona, hold a sliding conversation context, and emit bilingual assistant replies for TTS playback. The pipeline uses `llama.rn` running `Llama-3.2-1B-Instruct-Q4_K_M.gguf` as the primary model, with `Qwen2.5-1.5B-Instruct-Q4_K_M.gguf` as the documented auto-fallback on under-spec devices. This spec covers the `llm` sub-component of the `chat-mvp` change.

## Requirements

### REQ-1: Primary + fallback model selection

The system SHALL load `Llama-3.2-1B-Instruct-Q4_K_M.gguf` (Llama 3.2 Community License, ~870 MB) on devices that pass capability detection. On devices where free RAM < 4 GB at first launch, the system SHALL auto-select `Qwen2.5-1.5B-Instruct-Q4_K_M.gguf` (Apache-2.0, ~1.1 GB) as fallback. The selected model variant SHALL be persisted to `user_profile.preferences_json.modelVariant`. The system MUST NOT download any model at runtime — all variants are bundled.

#### Scenario: Flagship device picks primary model

- **Given** a device with 8 GB free RAM, 5 GB free disk, and arm64-v8a CPU
- **When** first launch runs the capability probe and loads the LLM
- **Then** `modelVariant` resolves to `llama-3.2-1b`
- **And** `Llama-3.2-1B-Instruct-Q4_K_M.gguf` is the loaded context

#### Scenario: 3 GB-RAM device picks Qwen fallback

- **Given** a device with 3 GB free RAM, 3 GB free disk, arm64-v8a
- **When** the capability probe runs at first launch
- **Then** `modelVariant` resolves to `qwen2.5-1.5b`
- **And** an in-app warning is shown recommending the Qwen variant

### REQ-2: Persona + system prompt injection

The system SHALL prepend a system prompt to every LLM call. The system prompt MUST include: (a) the persona name (default `"Coach"`, **user-overridable in Settings**), (b) the user's CEFR level, (c) the active topic from the 8 topic cards, and (d) the practice locale. The system SHALL reload the system prompt when any of these inputs change in the Zustand store. The persona name SHALL be persisted in `user_profile.preferences_json.personaName`.

#### Scenario: Default "Coach" persona used on first launch

- **Given** the user has not changed persona settings and the active topic is `travel`
- **When** the LLM is invoked with the first user turn
- **Then** the system prompt contains `"You are Coach"`, `level = "A2"`, `topic = "travel"`, and `practice_locale = "en-US"`

#### Scenario: User-rename of persona reflected immediately

- **Given** the user has renamed the persona to `"Sam"` in Settings and saves
- **When** the next LLM turn is invoked
- **Then** the system prompt contains `"You are Sam"` instead of `"You are Coach"`
- **And** `user_profile.preferences_json.personaName` persists as `"Sam"`

### REQ-3: Sliding context window with per-10-turn summary

The system SHALL maintain a 4096-token context window for the LLM. Every 10 assistant turns (counted from conversation start), the system SHALL generate a rolling summary of the conversation, write it to `conversation.summary`, and prepend it to subsequent system prompts as context. There SHALL be no hard session-length cap. The summary SHALL use the same LLM loaded in the active context.

#### Scenario: Turn 10 triggers summary write

- **Given** an active conversation with 9 prior assistant turns
- **When** the 10th assistant turn completes successfully
- **Then** a single summary call is made to the LLM
- **And** the resulting summary is written to `conversation.summary` for the active session
- **And** the next system prompt includes that summary as context

#### Scenario: Turn 9 does not trigger summary

- **Given** an active conversation with 8 prior assistant turns
- **When** the 9th assistant turn completes
- **Then** `conversation.summary` is unchanged
- **And** no extra LLM call is made for summarization

### REQ-4: Offline-only operation

The system MUST NOT make any network call during model load, inference, or summarization. The system SHALL expose a `networkBytesSent` counter on the LLM service that returns `0` after every call. The system SHALL reject any attempt to load a remote model URL.

#### Scenario: Airplane-mode inference succeeds

- **Given** the device is in airplane mode and the LLM is loaded
- **When** the user sends a 20-word message
- **Then** the assistant reply is generated within the latency budget (TTFT ≤ 3 s for primary model)
- **And** `networkBytesSent` equals `0`

## Constraints

- **llama.rn** is the only allowed LLM binding for v1 (MIT). No remote API, no cloud-hosted LLM, no telemetry.
- **Llama-3.2-1B-Instruct-Q4_K_M.gguf** is primary (Llama 3.2 Community License, ~870 MB).
- **Qwen2.5-1.5B-Instruct-Q4_K_M.gguf** is fallback (Apache-2.0, ~1.1 GB).
- Context window: **4096 tokens**. Sliding window + summary header; no hard session cap (default #4 from product decisions).
- Auto-summarize every 10 turns is the v1 default from product decisions; **user-overridable in Settings**.
- Persona name default is `"Coach"` (default #3 from product decisions); **user-overridable in Settings**.
- Implemented by sub-change `bootstrap-toolchain-and-skeleton` (binding install), `model-assets` (asset vendor), `chat-mvp` (service wiring + summarization).