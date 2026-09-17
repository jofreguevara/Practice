/**
 * app/migrations/001_init.ts
 *
 * Verbatim persistence schema from design §5.
 *
 * The original design puts this in `001_init.sql` so SQL tooling can read it
 * directly. For runtime loading we keep the content here as a TypeScript
 * string export — that way the same module is consumable from both Jest
 * (Node) and Metro (Expo) without needing a custom `.sql` transformer.
 *
 * Schema contents (do not edit without updating design §5 and the tests in
 * `app/services/__tests__/migrations.test.ts`):
 *   - user_profile  (singleton; CHECK id = 1)
 *   - conversation
 *   - message       (FK → conversation.id ON DELETE CASCADE)
 *   - message_fts   (FTS5 virtual table over message.text)
 *   - sync triggers message_ai / message_ad / message_au
 *   - seed INSERT INTO user_profile (id) VALUES (1)
 *
 * If you change the schema, also update `specs/persistence.md` REQ-1.
 */
export const INIT_SQL = `
CREATE TABLE user_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  display_name     TEXT NOT NULL DEFAULT 'Learner',
  primary_locale   TEXT NOT NULL DEFAULT 'en-US',
  practice_locale  TEXT NOT NULL DEFAULT 'es-ES',
  level            TEXT NOT NULL DEFAULT 'A2'
                     CHECK (level IN ('A1','A2','B1','B2','C1','C2')),
  topics_json      TEXT NOT NULL DEFAULT '[]',
  preferences_json TEXT NOT NULL DEFAULT '{}',
  progress_json    TEXT NOT NULL DEFAULT '{}',
  created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE conversation (
  id          TEXT PRIMARY KEY,
  topic       TEXT,
  started_at  INTEGER NOT NULL,
  ended_at    INTEGER,
  summary     TEXT
);
CREATE INDEX idx_conv_started ON conversation(started_at DESC);

CREATE TABLE message (
  id               TEXT PRIMARY KEY,
  conversation_id  TEXT NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  text             TEXT NOT NULL,
  stt_audio_path   TEXT,
  tts_audio_path   TEXT,
  created_at       INTEGER NOT NULL,
  tokens_used      INTEGER
);
CREATE INDEX idx_message_conv_time ON message(conversation_id, created_at);
CREATE INDEX idx_message_role      ON message(role);

CREATE VIRTUAL TABLE message_fts USING fts5(
  text,
  content='message',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER message_ai AFTER INSERT ON message BEGIN
  INSERT INTO message_fts(rowid, text) VALUES (new.rowid, new.text);
END;
CREATE TRIGGER message_ad AFTER DELETE ON message BEGIN
  INSERT INTO message_fts(message_fts, rowid, text) VALUES('delete', old.rowid, old.text);
END;
CREATE TRIGGER message_au AFTER UPDATE ON message BEGIN
  INSERT INTO message_fts(message_fts, rowid, text) VALUES('delete', old.rowid, old.text);
  INSERT INTO message_fts(rowid, text) VALUES (new.rowid, new.text);
END;

INSERT INTO user_profile (id) VALUES (1);
`;

/**
 * Stable migration descriptor used by `runMigrations`. Do not edit the id
 * once it has shipped — add a new migration instead.
 */
export const MIGRATION_001 = {
  id: 1,
  name: '001_init',
  sql: INIT_SQL,
} as const;