# Spec: Persistence Layer

## Purpose

Deliver the on-device persistence layer for the user profile, conversations, messages, and recorded audio. The layer uses `op-sqlite` with FTS5 enabled for full-text search and SQLCipher optionally engaged for at-rest encryption. Audio files live under `FileSystem.documentDirectory + 'audio/chat/'` with a TTL-based pruning policy. This spec covers the `db` and `audio` sub-components of `chat-mvp`, plus the schema authored under `bootstrap-toolchain-and-skeleton`.

## Requirements

### REQ-1: op-sqlite schema with migrations and FTS5

The system SHALL use `op-sqlite` (JSI-backed SQLite for Expo/RN, MIT) as the database engine. The system SHALL enable FTS5 at build time. The system SHALL run all migrations inside a single transaction via a `runMigrations(db)` helper. The schema SHALL include `user_profile`, `conversation`, `message`, and `message_fts` (FTS5 virtual table over `message.text`). On migration failure, the system SHALL show a blocking "Storage error — reinstall required" screen and refuse to continue.

#### Scenario: Fresh install seeds the schema

- **Given** the app launches on a device with no prior database
- **When** `runMigrations(db)` runs
- **Then** tables `user_profile`, `conversation`, `message`, and virtual table `message_fts` exist
- **And** the singleton `user_profile` row (id = 1) is seeded with defaults

#### Scenario: Migration failure halts boot with error screen

- **Given** `001_init.sql` throws during migration (e.g. corrupted prior DB)
- **When** the migration transaction rolls back
- **Then** the boot sequence shows a blocking error screen with copy "Storage error — reinstall required"
- **And** no chat screen renders until the user reinstalls

### REQ-2: Optional SQLCipher encryption

The system SHALL accept a `user_profile.preferences_json.encryptionEnabled` toggle (default `false`). When the toggle is enabled, the system SHALL re-open the database with a SQLCipher key derived from a user passphrase prompt and SHALL refuse to read any rows until the passphrase is provided. When disabled, the database SHALL be readable in plain SQLite.

#### Scenario: Encryption toggle on — data encrypted

- **Given** the user toggles encryption on in Settings and supplies a passphrase
- **When** the database is reopened with the SQLCipher key
- **Then** reads succeed for the user after passphrase entry
- **And** the on-disk DB file is unreadable as plain SQLite

#### Scenario: Encryption toggle off — plain SQLite readable

- **Given** encryption has never been enabled
- **When** the database is opened at app start
- **Then** all rows are readable without any passphrase prompt
- **And** the on-disk DB file is a valid plain SQLite file

### REQ-3: Audio file storage with TTL pruning

The system SHALL write TTS and STT WAV files to `FileSystem.documentDirectory + 'audio/chat/<conversationId>/<messageId>.wav'`. The system SHALL prune any audio file older than 24 hours that is not referenced by an extant `message.stt_audio_path` or `message.tts_audio_path` on app foreground. The pruning SHALL run inside a `useEffect` on the chat screen mount.

#### Scenario: Orphan audio file older than 24 h is pruned

- **Given** a WAV exists in `audio/chat/` with mtime > 24 h ago and no `message` row references it
- **When** the chat screen mounts
- **Then** the file is deleted
- **And** the database is not modified

#### Scenario: Referenced audio is preserved

- **Given** a WAV is referenced by a `message` row regardless of age
- **When** the chat screen mounts and pruning runs
- **Then** the referenced file is NOT deleted
- **And** the corresponding `message` row continues to resolve the audio path

## Constraints

- **op-sqlite** is the only allowed SQLite binding for v1 (MIT). No `react-native-sqlite-storage`, no `expo-sqlite` (lacks FTS5/SQLCipher out of the box).
- `op-sqlite` config flags: `sqlcipher: true`, `fts5: true`, `performanceMode: true`.
- Schema is versioned via `001_init.sql` inside `app/services/db.ts`. Subsequent migrations are additive only.
- Encryption is **optional, default OFF**; toggle lives in Settings → Privacy.
- The 5 product defaults (8 topics, no cap with auto-summarize every 10 turns, bundle both EN+ES upfront) are reflected in the persistence layer via the `conversation.summary`, `message.stt_audio_path` / `tts_audio_path`, and per-language topic tagging.
- Implemented by sub-change `bootstrap-toolchain-and-skeleton` (db init + migrations) and `chat-mvp` (audio paths, TTL pruning, encryption wiring).