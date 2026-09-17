# Change: english-practice-mobile-offline-mvp

## Why

The user wants a 24/7 English-practice buddy that runs **fully local on phone**, with **no online API calls ever** — including no remote analytics, no CDN-served assets, no telemetry, no push. The app must be free and open-source, ship on a single Android+iOS codebase, and stay lightweight (bundled topic images + on-device waveform). All conversation history, user profile state (level, topics, preferences, progress), and audio recordings persist locally with no cloud sync. Primary audience: Spanish-speaking learners practicing English (and reverse) who distrust always-listening apps, lack reliable connectivity, or want full data ownership.

## What Changes

**In scope (v1 MVP):**

- STT pipeline: `whisper.rn` with multilingual `ggml-tiny.bin` (~78 MB), bilingual EN+ES auto-detect, built-in Silero VAD via `initWhisperVad`.
- TTS pipeline: `expo-speech` wrapping native Android `TextToSpeech` / iOS `AVSpeechSynthesizer`; locales en-US, en-GB, es-ES, es-MX.
- LLM conversation agent: `llama.rn` running `Llama-3.2-1B-Instruct-Q4_K_M.gguf` (~870 MB); `Qwen2.5-1.5B-Instruct-Q4_K_M.gguf` (~1.1 GB) as auto-fallback on devices with <4 GB free RAM.
- Audio capture + waveform: `expo-audio` (`useAudioRecorder`, `useAudioSampleListener`) + `react-native-svg` `Waveform` component with 4 modes (idle / listening / processing / speaking) and barge-in via VAD.
- Persistence: `op-sqlite` with FTS5 enabled and SQLCipher optional; schema for `user_profile`, `conversation`, `message`, `message_fts`.
- User profile: CEFR level (A1–C2), primary locale, practice locale, topics JSON, preferences JSON (TTS voice id, rate, STT sensitivity), progress JSON (streak days, total minutes, words learned).
- 8 topic cards (bundled PNGs in `assets/topics/`): travel, food, work, hobbies, weather, shopping, health, daily-life.
- Settings screen: persona name, voice locale override, encryption toggle, model swap, low-memory mode.
- First-launch auto-capability detection (RAM / disk / GPU) → pick model variant; warn if under-spec.
- Single-PR delivery; 800-line review budget (`size:exception` required if exceeded).

**Out of scope (deferred — see `## Out of scope` for rationale):**

- iPad / watchOS / Android Auto / desktop targets.
- Cloud sync, multi-device handoff, account system.
- Voice cloning, custom persona authoring UI.
- Multi-speaker / group sessions.
- Voice activity logs, analytics dashboards, A/B testing.
- Achievements / gamification beyond the basic streak counter.
- Formal accessibility audit beyond Expo defaults.
- Piper VITS high-quality TTS (architecture preserves the upgrade path; not shipped in v1).

## Impact

| Area | Impact | Description |
|------|--------|-------------|
| `app/services/{stt,tts,llm,audio,db}.ts` | New | Wrapper services over native modules; single-function interfaces so each can be swapped (e.g. Piper TTS in v2). |
| `app/state/profile.ts` | New | Zustand store bound to the singleton `user_profile` row. |
| `app/components/Waveform.tsx` | New | 64-bar SVG, 4 modes, driven by `useAudioSampleListener` at 30 fps. |
| `app/(tabs)/chat.tsx`, `app/(tabs)/settings.tsx` | New | Chat host screen + settings screen. |
| `assets/models/stt/ggml-tiny.bin` | New | Bundled whisper multilingual model, ~78 MB (MIT). |
| `assets/models/llm/Llama-3.2-1B-Instruct-Q4_K_M.gguf` | New | Primary LLM, ~870 MB (Llama 3.2 Community License). |
| `assets/models/llm/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf` | New | Fallback LLM, ~1.1 GB (Apache-2.0). |
| `assets/topics/*.png` (×8) | New | 1024×1024 topic illustrations, ~16 MB total. |
| `openspec/changes/english-practice-mobile-offline-mvp/` | New | This proposal + later specs / design / tasks / verify reports. |
| `eas.json`, `app.json`, `package.json`, `tsconfig.json` | New | Expo SDK 54 + EAS `preview` / `production` profiles; TypeScript strict; ESLint + Prettier + Husky. |

## Decomposition

**Expected execution order: `bootstrap-toolchain-and-skeleton` → `model-assets` → `chat-mvp`** (strictly sequential; each gates the next).

### 1. `bootstrap-toolchain-and-skeleton` — size **M**, no deps

**Scope:**

- `npx create-expo-app` with TypeScript template, Expo SDK 54, New Architecture default.
- Install `whisper.rn`, `llama.rn`, `expo-audio`, `expo-speech`, `op-sqlite`, `zustand`, `react-native-svg`, `react-native-reanimated`.
- Author `eas.json` with `preview` + `production` profiles; pin SDK version in `app.json`; wire config plugins for native modules.
- Create folder skeleton: `app/services/`, `app/state/`, `app/components/`, `app/(tabs)/`, `assets/models/{stt,llm}/`, `assets/topics/`.
- Wire ESLint + Prettier + TypeScript strict + Husky pre-commit hook.

**Completion criteria:**

- `eas build --profile preview --platform android` produces a bootable APK on EAS.
- `tsc --noEmit` and `eslint .` both pass clean.
- App launches to a placeholder chat screen on a fresh `expo-dev-client`.

**Dependencies:** none. **Effort:** M (~2 days).

### 2. `model-assets` — size **M**, depends on `bootstrap-toolchain-and-skeleton`

**Scope:**

- Vendor `ggml-tiny.bin` into `assets/models/stt/` (MIT).
- Vendor `Llama-3.2-1B-Instruct-Q4_K_M.gguf` and `Qwen2.5-1.5B-Instruct-Q4_K_M.gguf` into `assets/models/llm/` (respective licenses; documented in `assets/models/LICENSE.md`).
- Auto-capability detection module: probe `totalMemory`, `freeDiskStorage`, GPU on first launch → choose primary or fallback model; warn if under-spec.
- SHA-256 verification step in CI / on first install; download-progress UI scaffolded (lazy-loading path preserved for v2 split-bundle).

**Completion criteria:**

- All 3 model files present, checksum-verified on build.
- Capability detector returns correct model selection for simulated low-end (2 GB RAM) and flagship (8 GB RAM) device profiles.
- Settings → Models screen reports status and selected variant correctly.

**Dependencies:** `bootstrap-toolchain-and-skeleton`. **Effort:** M (~2 days).

### 3. `chat-mvp` — size **L**, depends on `bootstrap-toolchain-and-skeleton` and `model-assets`

**Scope:**

- Wire STT → LLM → TTS pipeline end-to-end using services from `app/services/`.
- Bind `user_profile` to Zustand store + op-sqlite migrations (`001_init.sql`).
- Implement `Waveform` component (4 modes) with barge-in via `RealtimeVadContext` from whisper.rn.
- Conversation screen: hold-to-talk, transcription preview, assistant text, auto-TTS playback, audio paths persisted on `message` rows.
- Auto-summarize conversation every 10 turns into `profile.progress_json.summary`.
- Settings → Conversation: persona name, voice locale, encryption toggle, model swap, low-memory mode toggle.

**Completion criteria:**

- 5-minute bilingual EN↔ES conversation runs end-to-end on a physical Android device.
- Profile state and conversation history persist across app restart; SQLCipher encryption engages on toggle without data loss.
- Lint + typecheck + manual smoke checklist pass.

**Dependencies:** `bootstrap-toolchain-and-skeleton`, `model-assets`. **Effort:** L (~5 days).

## Product decisions (adopted as defaults)

The orchestrator preflight is `auto`, so the five product questions surfaced by explore are resolved with these defaults. Each is **user-overridable via Settings → Conversation** unless noted otherwise.

1. **TTS default voice locale** — auto-detect from device locale on first launch. (Defaults to en-US if device locale is unsupported.)
2. **Topic list scope for v1** — 8 generic topics seeded in the LLM system prompt: travel, food, work, hobbies, weather, shopping, health, daily-life.
3. **LLM persona name** — "Coach" by default; changeable in Settings.
4. **Session length** — no hard cap; auto-summarize the conversation every 10 turns into the user profile to keep the LLM context window bounded.
5. **v1 bundle scope** — bundle BOTH English + Spanish upfront; multilingual Whisper (`ggml-tiny.bin`) covers both STT directions; system TTS locales are downloaded lazily by the OS once the user picks ES.

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Llama 3.2 1B + RN runtime OOMs on 3 GB-RAM Android 10 devices during long conversations | HIGH | Capability detection at first launch; auto-switch to Qwen on <4 GB free RAM; low-memory stub mode under 2 GB. |
| Whisper tiny WER 8–15% on accented English / regional Spanish | MED | Ship `ggml-tiny.en.bin` as optional English-only upgrade; document `ggml-base.bin` swap path. |
| Native TTS voice quality varies by device + OS (robotic on Pixel 4a / Android 12) | MED | Detect neural-voice availability on first launch; documented Piper VITS upgrade path via `react-native-sherpa-onnx` — single-file refactor in `app/services/tts.ts`. |
| Total install ~50 MB base + ~1.3 GB model assets may exceed user patience | MED | Lazy-load models on first launch with progress UI; per-language opt-in for ES add-on. |
| EAS Build free tier capped at 30 builds / month | LOW | Prefer local `expo run:android --device` for inner-loop iteration; reserve EAS for release builds. |
| whisper.rn VAD adds ~30 MB RAM during recording | LOW | Accepted; tracked in design notes. |

**New risks identified at proposal time:**

| Risk | Severity | Mitigation |
|------|----------|------------|
| **VAD model fails to load on first launch** (corrupted asset, ABI mismatch) | MED | Wrap `initWhisperVad` in try/catch; fall back to energy-based amplitude threshold on `useAudioSampleListener`; surface a non-blocking warning toast. |
| **Schema migration sequencing failure** — `001_init.sql` runs before profile bind; if it crashes, app boots with no DB and reads throw on first interaction | MED | Wrap migrations in a `runMigrations(db)` helper executed inside a single transaction; on failure show a blocking "Storage error — reinstall required" screen and refuse to continue. |
| **32-bit Android dropped** — llama.rn requires arm64-v8a, excluding Android <7.0 (<2% market in 2026) | LOW | Document in README; `app.json` / Play Console targetSdk filter excludes armv7 automatically. |
| **iOS signing requires Apple Developer account** ($99 / yr) | LOW | Accepted; out of scope for this change; documented in repo `CONTRIBUTING.md`. |

## Out of scope (v1 deferrals)

- **iPad-specific layouts** — phone layouts scale; tablet polish is a v2 follow-up.
- **watchOS / Android Auto / desktop targets** — extra surfaces + navigation systems; deferred.
- **Cloud sync, multi-device handoff, account system** — contradicts offline-only; opt-in local-network sync is the v2 path.
- **Voice cloning / custom persona authoring UI** — high complexity; persona name + system prompt override is the v1 escape hatch.
- **Multi-speaker / group sessions** — turn-taking arbitration needs research; deferred.
- **Voice activity logs / analytics dashboards / A/B testing** — no online analytics is a locked constraint.
- **Achievements / gamification beyond basic streak counter** — `progress_json` carries the fields; richer systems deferred.
- **Formal accessibility audit beyond Expo defaults** — RN accessibility primitives in place; formal audit is a separate engagement.
- **Piper VITS high-quality TTS** — architecture preserves the upgrade path (single function in `tts.ts`); not shipped to keep bundle small.
- **Per-user custom topic authoring** — 8 curated topics cover the MVP; authoring UI is a v2 problem.
