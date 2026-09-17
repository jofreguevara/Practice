# Spec: Capability Detection — promoted from change english-practice-mobile-offline-mvp on 2026-09-15
# Spec: Capability Detection

## Purpose

Deliver the first-launch probe of total RAM, free disk, GPU/accelerator availability, and CPU architecture, and translate the results into a model variant selection. The probe is the gate that picks `Llama 3.2 1B` (flagship), `Qwen2.5 1.5B` (mid/low RAM), a low-memory stub mode (disk < 1.5 GB), or an install block (armv7 / 32-bit). This spec covers the `capabilityDetection` module shipped by `model-assets` and consulted by `chat-mvp` at boot.

## Requirements

### REQ-1: First-launch device probe

The system SHALL probe `totalMemory`, `freeDiskStorage`, GPU/accelerator availability (Metal on iOS, OpenCL on Android), and CPU instruction set (arm64-v8a vs armv7) on first launch. The system SHALL cache the probe result in `user_profile.preferences_json.deviceProfile` so subsequent launches skip the probe. The system MUST NOT block app boot for more than 2 s on the probe.

#### Scenario: Flagship device profile captured

- **Given** a Pixel 8 Pro with 12 GB RAM, 30 GB free disk, OpenCL available, arm64-v8a
- **When** first launch runs the capability probe
- **Then** `deviceProfile` is `{ ram: "high", disk: "high", accelerator: true, arch: "arm64" }`
- **And** the probe completes in under 2 s

#### Scenario: Low-end device profile captured

- **Given** a Samsung A10 with 2 GB RAM, 500 MB free disk, no OpenCL, armv7
- **When** first launch runs the capability probe
- **Then** `deviceProfile` is `{ ram: "low", disk: "low", accelerator: false, arch: "armv7" }`
- **And** the probe completes in under 2 s

### REQ-2: Model selection rules

The system SHALL map the device profile to a model variant: `ram = high AND disk = high` → `llama-3.2-1b`; `ram = low` (free RAM < 4 GB) → `qwen2.5-1.5b` plus a warning UI; `disk = low` (free disk < 1.5 GB) → low-memory stub mode; `arch = armv7` → install block. The selection is written to `user_profile.preferences_json.modelVariant` and the user can override via Settings → Models.

#### Scenario: Flagship device picks primary model

- **Given** `deviceProfile = { ram: "high", disk: "high", accelerator: true, arch: "arm64" }`
- **When** the selector runs
- **Then** `modelVariant` resolves to `llama-3.2-1b`
- **And** no warning UI is shown

#### Scenario: 3 GB-RAM device picks Qwen fallback with warning

- **Given** `deviceProfile = { ram: "low" (3 GB free), disk: "high", arch: "arm64" }`
- **When** the selector runs
- **Then** `modelVariant` resolves to `qwen2.5-1.5b`
- **And** an in-app warning is shown recommending the Qwen variant
- **And** the user can dismiss or accept via Settings → Models

### REQ-3: Hard blocks and low-memory stub

The system SHALL refuse to boot the main app if `arch = armv7` (llama.rn requires arm64-v8a) and SHALL display a friendly install-blocked screen. The system SHALL enter low-memory stub mode if `disk < 1.5 GB`: the stub returns curated prompt responses from a static JSON table and SHALL NOT load the LLM.

#### Scenario: armv7 device shows install-blocked screen

- **Given** `deviceProfile.arch = "armv7"`
- **When** the app launches
- **Then** the main chat screen does NOT render
- **And** a friendly screen is shown with copy "This device's processor is not supported. Llama requires arm64. Please use a newer device."
- **And** the app does not crash

#### Scenario: Disk < 1.5 GB enters low-memory stub mode

- **Given** `deviceProfile.disk = "low"` (free disk < 1.5 GB)
- **When** the selector runs
- **Then** `modelVariant` resolves to `stub`
- **And** the LLM is NOT loaded into memory
- **And** the conversation flow returns curated responses from a static table
- **And** the UI surfaces a banner "Running in low-memory stub mode — install Qwen or Llama when more storage is available"

## Constraints

- The capability probe runs **once per install** and caches in `user_profile.preferences_json.deviceProfile`.
- Architecture hard-block: llama.rn requires **arm64-v8a**; 32-bit (armv7) devices are explicitly excluded (< 2% market in 2026).
- Low-memory stub responses are curated at design time and live under `app/services/stubResponses.ts`.
- Offline-only: the probe MUST NOT phone home; it relies solely on `expo-device` and platform APIs.
- Implemented by sub-change `model-assets` (probe module + selection rules) and consulted by `chat-mvp` at boot.