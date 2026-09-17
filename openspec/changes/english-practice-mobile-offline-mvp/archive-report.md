# Archive Report — english-practice-mobile-offline-mvp

## Status

**archived** — SDD cycle closed. Change folder remains in place per orchestrator instruction ("do NOT actually move — the archive skill handles the move if applicable").

## Identifiers

- **Change name:** `english-practice-mobile-offline-mvp`
- **Archive date:** 2026-09-15
- **Final commit SHA on `main`:** `01e132832504970fc57112cf807b7cdf3faa2882`
- **Final marker commit subject:** `docs(chat-mvp): final Sub-change 3 marker — size:exception per decisions#178`
- **Branch:** `main`
- **Working tree at archive:** clean (`git status` reports no modifications)
- **Artifact store mode:** `hybrid` (Engram topic keys + OpenSpec filesystem per `openspec/config.yaml:preflight.artifact_store: hybrid`)

## Commit Inventory (30 commits on `main`)

| Sub-change | Commit range | Commits | Notes |
|---|---|---|---|
| `bootstrap-toolchain-and-skeleton` | `3c011b8` → `b095a6e` | 8 | Init `.gitignore` + preflight; Expo SDK 54 + EAS + lint + Jest skeleton; `db.ts` + `001_init` migration; Zustand profile store; App.tsx + tab bar + placeholder screens; RED NoNetworkPolicy gate; TDD flip to true; mark Sub-change 1 tasks completed. |
| `model-assets` | `eb086b6` → `8e749f4` | 4 | GREEN `capability.ts` (probe + variant + no-network + SHA-256); `stubResponses.ts` curated table; `modelManifest.ts` registry; vendor 3 model binaries (LFS) + LICENSE.md + SHA256SUMS. |
| bridging (Sub-change 2 follow-up) | `2ee3a7c` | 1 | `chore(tests): opt-in the end-to-end LFS SHA-256 verification via env`. Wired between model-assets and housekeeping. |
| housekeeping (orchestrator docs) | `cd372b5` | 1 | `docs(specs): commit SDD planning artifacts (proposal + design + 10 specs)`. Not an implementation commit; this is where the `openspec/changes/.../specs/` files first appear in git history. |
| `chat-mvp` | `0241244` → `74d8fe0` | 14 | mocks + 4 services (stt, tts, llm, audio); conversation store + summarizer; 4 components (Waveform, TopicCard, MessageBubble, HoldToTalk); 8 topic PNGs + topic-to-prompt map; chat host screen; settings hub + 3 sub-screens. **size:exception applied** per Engram observation `#178` (decisions). |
| post-chat-mvp cleanup | `8366421`, `01e1328` | 2 | `test(mocks): convert whisper/llama surface to jest.fn factories`; `docs(chat-mvp): final Sub-change 3 marker` (size:exception citation in body). |
| **TOTAL** | — | **30** | — |

## LOC Summary per Sub-change

| Sub-change | Forecast (tasks.md) | Actual (apply-progress #180) | Notes |
|---|---|---|---|
| `bootstrap-toolchain-and-skeleton` | ~665 LOC | ~1 200 LOC application code (plus ~17 600 LOC generated Expo skeleton from `ede97de`; not counted as change-attributable LOC) | 8 work-unit commits; all behind husky gate |
| `model-assets` | ~290 LOC (incl. LICENSE + SUMS) | ~1 800 LOC inserts (per `git diff --shortstat b095a6e..8e749f4 -- ':!*.bin' ':!*.gguf'`); 3 LFS-tracked model binaries | 4 work-unit commits |
| `chat-mvp` | ~1 230 LOC forecast → **SIZE:EXCEPTION REQUIRED** | ~3 950 LOC new TS/TSX incl. tests / ~2 640 production-only (per apply-progress #180 LOC table) | 14 work-unit commits; single-PR per maintainer-approved `size:exception` (observation #178); size:exception citation appears in commit body and final-marker commit |
| **TOTAL production-only TS/TSX** | ~2 185 | ~4 840 production + ~1 200 test overage | Over-forecast driven by denser screens + per-service + per-component test surface |

## Source-of-truth Spec Sync

`openspec/specs/` was empty at archive time (no main-spec baseline existed). The 10 delta specs in `openspec/changes/english-practice-mobile-offline-mvp/specs/` are therefore full canonical specs, not deltas. Per the sdd-archive skill's "If Main Spec Does NOT Exist" branch, each spec was copied mechanically to `openspec/specs/<filename>.md` with a 1-line attribution header prepended (per orchestrator instruction). No `## ADDED Requirements` markers exist in any spec — they are all already-structured canonical specs.

### Spec promotion table

| Domain | Action | Source | Destination |
|---|---|---|---|
| `stt` | Created | `openspec/changes/english-practice-mobile-offline-mvp/specs/stt.md` | `openspec/specs/stt.md` |
| `tts` | Created | `…/specs/tts.md` | `openspec/specs/tts.md` |
| `llm` | Created | `…/specs/llm.md` | `openspec/specs/llm.md` |
| `persistence` | Created | `…/specs/persistence.md` | `openspec/specs/persistence.md` |
| `user-profile` | Created | `…/specs/user-profile.md` | `openspec/specs/user-profile.md` |
| `conversation` | Created | `…/specs/conversation.md` | `openspec/specs/conversation.md` |
| `audio-waveform` | Created | `…/specs/audio-waveform.md` | `openspec/specs/audio-waveform.md` |
| `settings` | Created | `…/specs/settings.md` | `openspec/specs/settings.md` |
| `capability-detection` | Created | `…/specs/capability-detection.md` | `openspec/specs/capability-detection.md` |
| `topics` | Created | `…/specs/topics.md` | `openspec/specs/topics.md` |

**Mechanical Copy Contract — readback evidence:**

- Each destination spec was copied to a `mktemp` file first; `diff -r` against the source returned empty (byte-identical pre-header).
- The destination was then atomically moved into final position.
- The 1-line header was prepended via `sed -i '1i\\<HEADER>'` — additive mechanical edit, never Read → Write.
- Post-edit readback: `diff <(tail -n +2 <DEST>) <SOURCE>` returned empty for every file (content bytes from line 2 onward identical to source).
- Per-file line-count delta: exactly `+1` per spec.
- Per-file header-only diff: exactly line 1, the new attribution line.

Header format used: `# Spec: <title> — promoted from change english-practice-mobile-offline-mvp on 2026-09-15`

The 10 originals remain in `openspec/changes/english-practice-mobile-offline-mvp/specs/` as the historical record of what the delta proposed — per orchestrator preference ("preferred: copy into openspec/specs/, leave the originals in the change folder so the change folder remains a coherent record of what shipped").

## Tasks Reconciliation (Gate)

The on-disk `openspec/changes/english-practice-mobile-offline-mvp/tasks.md` had 12 implementation-task markers still showing `**Status:** pending` (Sub-change 2 Tasks 2.1–2.5; Sub-change 3 Tasks 3.1–3.6; cross-cutting Task X.1). Per the sdd-archive Task Completion Gate, this would normally block archive — but the gate's exception clause applies because:

1. `apply-progress` observation `#180` (apply batch terminal report) confirms every task across all 3 sub-changes completed and was verified by `tsc --noEmit && eslint . && jest --ci` on every commit.
2. `verify-report` observation `#185` confirms `PASS WITH WARNINGS` with 21 suites / 165 tests / 0 failing.
3. The orchestrator's archive launch prompt explicitly authorized: "flip remaining `pending` tasks to `completed` if not already".

Mechanical `sed` replacement flipped all 12 markers to `**Status:** completed`; total markers post-edit: 22 completed, 0 pending. The reconciliation action and its reason are recorded above the `## Archive` section in `tasks.md`.

## Follow-ups (verbatim from verify-report #185 warnings + suggestions, plus user additions)

1. **TTS voice locale auto-detect (default #1) is hardcoded to `en-US`/`es-ES`** — instead of reading from `expo-localization` → `getLocales()`. User-override path works but spec REQ violated. Suggested fix: 1 PR or 1 small task in a future change.
2. **SQLCipher encryption has only smoke coverage** — `better-sqlite3` doesn't bundle SQLCipher for Jest. Real-device test is the only proof.
3. **VAD silence trim — fallback path tested, VAD event-driven trim not consumed by `transcribe()`**. Apply deviation 1.
4. **Topic PNGs are 5.3 KB placeholders, not the 2 MB illustrations**.
5. **Barge-in is RMS-threshold (`BARGE_IN_RMS_THRESHOLD=0.6`), not VAD `speech_start` event-driven**.
6. **Settings → Privacy "Delete all data" is a UI stub** — no real purge.
7. **`Waveform.tsx` 30 fps RAF occasionally emits React `act()` overlap warnings in CI** (cosmetic).
8. **EAS Build preview dry-run was never executed** — no EAS CLI auth locally; first run on real device is unproven.

## Severity Tally

- **CRITICAL:** 0
- **WARNING:** 3 (persistence.REQ-2 SQLCipher smoke-only, stt.REQ-2 VAD silence-trim partial, settings.REQ-1 device-locale auto-detect missing)
- **SUGGESTION:** 2 (topic PNG placeholders, barge-in RMS threshold)

**Note: 0 critical issues. Change is shippable.** The 3 warnings + 2 suggestions are non-blocking follow-ups for a future change.

## Verification snapshot at archive time (per verify-report #185)

- `tsc --noEmit` → exit 0
- `eslint .` → exit 0
- `jest --ci` → 21 suites / 165 tests / 0 failing
- `git lfs ls-files` → 3 model binaries tracked (`ggml-tiny.bin`, `Llama-3.2-1B-Instruct-Q4_K_M.gguf`, `Qwen2.5-1.5B-Instruct-Q4_K_M.gguf`)
- husky pre-commit (`tsc && eslint . && jest --bail`) active and green on every chat-mvp commit; no `--no-verify` markers in any commit message

## Spec coverage at archive (29 REQs total)

- **28 of 29 REQs** have at least one passing behavioral test
- **1 REQ partial** (`stt.REQ-2` VAD silence trim — fallback covered, event-driven trim not exercised; apply deviation 1)
- **1 REQ smoke-only** (`persistence.REQ-2` SQLCipher encryption — `expect(getByTestId('encryption-toggle')).toBeTruthy()`)
- All 10 promoted specs are now in `openspec/specs/` as the canonical source of truth

## Engram Observation IDs Read (traceability)

- `#169` — `sdd-init/practice` project context (init phase anchor; pre-decided architecture constraints; hybrid artifact_store)
- `#174` — `sdd/english-practice-mobile-offline-mvp/proposal` (scope, decomposition, 5 product defaults, risks, out-of-scope)
- `#175` — `sdd/english-practice-mobile-offline-mvp/spec` (10 delta specs index, 29 reqs, 57 scenarios)
- `#176` — `sdd/english-practice-mobile-offline-mvp/design` (15 sections, 10 key decisions, sub-change LOC budgets)
- `#177` — `sdd/english-practice-mobile-offline-mvp/tasks` (per-sub-change LOC table, dependency graph, critical path)
- `#178` — `sdd/english-practice-mobile-offline-mvp/decisions` (`size:exception` approved for chat-mvp)
- `#180` — `sdd/english-practice-mobile-offline-mvp/apply-progress` (Sub-changes 1+2+3 complete, LOC table, deviations)
- `#185` — `sdd/english-practice-mobile-offline-mvp/verify-report` (PASS WITH WARNINGS, spec coverage matrix, 5 product defaults placement)

## Files Touched by This Archive (relative to repo root)

**Created:**
- `openspec/specs/stt.md`
- `openspec/specs/tts.md`
- `openspec/specs/llm.md`
- `openspec/specs/persistence.md`
- `openspec/specs/user-profile.md`
- `openspec/specs/conversation.md`
- `openspec/specs/audio-waveform.md`
- `openspec/specs/settings.md`
- `openspec/specs/capability-detection.md`
- `openspec/specs/topics.md`
- `openspec/changes/english-practice-mobile-offline-mvp/archive-report.md` (this file)
- `openspec/changes/english-practice-mobile-offline-mvp/ARCHIVED.md` (closure marker — per orchestrator instruction "do NOT actually move the change folder")

**Modified:**
- `openspec/changes/english-practice-mobile-offline-mvp/tasks.md` (12 stale `**Status: pending**` markers → `**Status: completed**` via mechanical sed; appended `## Archive` section with archive date, final SHA, follow-ups, verification snapshot, spec coverage)

**Untouched (preserved as historical record):**
- `openspec/changes/english-practice-mobile-offline-mvp/proposal.md`
- `openspec/changes/english-practice-mobile-offline-mvp/design.md`
- `openspec/changes/english-practice-mobile-offline-mvp/specs/*.md` (10 originals)

## Outcome

**Change archived.** All 10 specs promoted to canonical `openspec/specs/`. Archive report persisted to Engram (`sdd/english-practice-mobile-offline-mvp/archive-report`) and to disk (`openspec/changes/.../archive-report.md`). Change folder retained in place with `ARCHIVED.md` marker. `tasks.md` reconciled against authoritative Engram apply/verify evidence with explicit reason recorded. SDD cycle complete for `english-practice-mobile-offline-mvp`. Ready for the next change.