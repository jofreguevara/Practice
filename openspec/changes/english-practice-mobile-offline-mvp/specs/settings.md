# Spec: Settings Screens

## Purpose

Deliver the settings UI where the user can override any of the v1 product defaults: persona name, voice locale, encryption toggle, model variant swap, and low-memory mode. Settings MUST persist immediately to the user profile and SHALL take effect on the next conversation turn (or, for encryption and model swap, on the next app launch). This spec covers the `app/(tabs)/settings.tsx` screen shipped by `chat-mvp`.

## Requirements

### REQ-1: Conversation settings — persona name + voice locale

The system SHALL expose `personaName` (free text) and `voice locale` (BCP-47 dropdown with the four supported locales: `en-US`, `en-GB`, `es-ES`, `es-MX`). Both fields SHALL persist to `user_profile.preferences_json` and the next LLM turn / TTS call SHALL pick up the change immediately. The default persona is `"Coach"` and the default voice locale is auto-detected from device locale on first launch — both **user-overridable here**.

#### Scenario: Renaming persona persists and propagates

- **Given** the user is on Settings → Conversation
- **When** the user changes persona name from `Coach` to `Sam` and taps Save
- **Then** `user_profile.preferences_json.personaName` equals `"Sam"`
- **And** the next LLM system prompt contains `"You are Sam"`

#### Scenario: Voice locale override applies to next TTS call

- **Given** the user changes voice locale from `en-US` (default) to `en-GB`
- **When** the next assistant reply is generated
- **Then** TTS is invoked with `locale = "en-GB"`
- **And** the synthesized audio sounds like British English

### REQ-2: Models settings — model variant swap

The system SHALL expose a model variant selector showing the primary and fallback variants. The system SHALL write the selection to `user_profile.preferences_json.modelVariant` and SHALL reload the LLM context on next app launch. The system SHALL refuse to enable a variant whose required asset is missing from `assets/models/llm/`.

#### Scenario: User selects fallback model — reloaded on next launch

- **Given** Settings → Models shows `llama-3.2-1b` (current) and `qwen2.5-1.5b` (fallback)
- **When** the user taps `qwen2.5-1.5b` and confirms
- **Then** `user_profile.preferences_json.modelVariant` equals `"qwen2.5-1.5b"`
- **And** on next app launch, `llama.rn` loads `Qwen2.5-1.5B-Instruct-Q4_K_M.gguf`

#### Scenario: Selecting a missing variant is blocked with copy

- **Given** the LLM directory does not contain `gemma-2-2b-q4.gguf`
- **When** the user tries to select `gemma-2-2b`
- **Then** the selection control is disabled with copy "Asset missing — reinstall required"
- **And** `modelVariant` is not modified

### REQ-3: Privacy settings — encryption toggle + low-memory mode

The system SHALL expose an encryption toggle (default OFF) and a low-memory mode toggle (default OFF). Encryption toggle on SHALL prompt for a passphrase and require an app restart to engage SQLCipher. Low-memory mode on SHALL force the fallback model variant on next launch and disable waveform sample buffering.

#### Scenario: Encryption toggle on — restart required to engage

- **Given** the user toggles encryption on in Settings → Privacy
- **When** they confirm and supply a passphrase
- **Then** a banner is shown "Restart required to enable encryption"
- **And** after restart, `op-sqlite` opens with the SQLCipher key
- **And** the on-disk DB file is unreadable as plain SQLite

#### Scenario: Low-memory mode on — fallback model forced

- **Given** low-memory mode is toggled on
- **When** the app restarts and the LLM loads
- **Then** `modelVariant` resolves to `qwen2.5-1.5b` regardless of free RAM
- **And** the waveform component disables sample buffering

## Constraints

- All settings live under `app/(tabs)/settings.tsx` with three sections: Conversation, Models, Privacy.
- All toggles persist immediately to `user_profile.preferences_json`. Encryption and model swap require app restart.
- The 5 product defaults are surfaced as the initial values here, so the user sees what they are overriding.
- Offline-only is preserved: Settings MUST NOT call any analytics or remote config endpoint.
- Implemented by sub-change `chat-mvp`.