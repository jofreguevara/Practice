# Practice — Offline AI English Practice App

Cross-platform mobile application (Android + iOS) for English language practice
through on-device AI conversation. **100% offline at runtime** — no online API
calls, no telemetry, no cloud sync.

## Status

- **Sub-change 1 — bootstrap-toolchain-and-skeleton:** in progress.
- **Sub-change 2 — model-assets:** pending.
- **Sub-change 3 — chat-mvp:** pending.

## Stack

- Expo SDK 54 (managed workflow) + React Native 0.81 + New Architecture.
- TypeScript strict + ESLint (expo config) + Prettier + Husky pre-commit.
- op-sqlite (FTS5 + SQLCipher optional) for local persistence.
- whisper.rn (STT) + llama.rn (LLM) + expo-audio + expo-speech (TTS).
- Zustand for state, react-native-svg + reanimated for the waveform UI.

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Boot Expo dev client (`expo start --dev-client`). |
| `npm test` | Run the Jest test suite in CI mode (`jest --ci`). |
| `npm run tsc` | Type-check the project (`tsc --noEmit`). |
| `npm run lint` | Lint the project (`eslint .`). |
| `npm run precommit` | Run `tsc && eslint && jest --bail` (used by Husky). |
| `eas build --profile preview --platform android` | Cloud build via EAS. |

## Architecture constraints (do not break)

1. **100% offline at runtime.** No `fetch`, no `axios`, no telemetry, no CDN.
   All assets bundle at build time. See `openspec/config.yaml:rules`.
2. **Free / open-source models and libraries only.** No paid APIs.
3. **Single codebase for Android + iOS.** Expo managed workflow + EAS Build.
4. **Local-first storage.** Everything in `op-sqlite`; no cloud sync.

## Folder layout

See `openspec/changes/english-practice-mobile-offline-mvp/design.md` §2 for
the full tree. Top-level groups:

- `app/` — Expo Router root (`_layout.tsx`, `(tabs)/`), services, state, components, migrations.
- `assets/` — bundled topic PNGs and model binaries (sub-change 2).
- `openspec/` — SDD artifacts (proposals, specs, design, tasks, verify reports).
- `eas.json`, `app.json` — Expo + EAS Build configuration.
- `.husky/` — pre-commit hook (tsc + eslint + jest).

## License

TBD — bundled model licenses will land in `assets/models/LICENSE.md` in
sub-change 2.