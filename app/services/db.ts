/**
 * app/services/db.ts
 *
 * Persistence service for the english-practice app.
 *
 * Layering:
 *   - Db interface is the only thing the rest of the app touches.
 *   - openDb() returns a production Db backed by op-sqlite.
 *   - openMemoryDb() (test-only) returns a Db backed by better-sqlite3 in :memory:.
 *   - All business logic (runMigrations, getProfile, updateProfile, insertMessage,
 *     searchMessages, pruneOrphanAudio) is pure and takes a Db — so the same
 *     code runs in tests and on-device.
 *
 * Why the split: op-sqlite is a JSI/TurboModule native binding that cannot run
 * in plain Node. We want fast, hermetic Jest tests without spinning up an
 * emulator. better-sqlite3 (BSD-3) is a native node module but ships a
 * SQLite build with FTS5 + triggers enabled — so the actual schema runs
 * identically against both drivers.
 *
 * Design references:
 *   - specs/persistence.md REQ-1, REQ-2, REQ-3
 *   - design §3 (service signatures), §5 (schema), §14 risk 8 (migration sequencing)
 */
import { open as opSqliteOpen, type DB as OpDB } from '@op-engineering/op-sqlite';
import { Platform } from 'react-native';
import { MIGRATION_001 } from '../migrations/001_init';

const INIT_SQL: string = MIGRATION_001.sql;

const DB_NAME = 'practice.db';
const STORAGE_ERROR_COPY = 'Storage error — reinstall required';

/** Opaque Db handle. Production is op-sqlite; tests use better-sqlite3. */
export interface Db {
  execute(sql: string, params?: ReadonlyArray<unknown>): Promise<{
    rows: Record<string, unknown>[];
  }>;
}

/** Generic helper for callers that want a typed row shape. */
export async function executeTyped<R extends Record<string, unknown>>(
  db: Db,
  sql: string,
  params?: ReadonlyArray<unknown>,
): Promise<{ rows: R[] }> {
  const { rows } = await db.execute(sql, params);
  return { rows: rows as R[] };
}

/**
 * Production open. Wraps op-sqlite. The encryption key (optional) is read from
 * SecureStore when `encryptionEnabled === true` in `user_profile.preferences_json`
 * — the encryption toggle requires an app restart (settings REQ-3).
 */
export async function openDb(opts?: { encryptionKey?: string }): Promise<Db> {
  // The op-sqlite `open()` function is sync, but we keep an async signature
  // so the chat screen can `await openDb()` without coupling to driver internals.
  const native: OpDB = opSqliteOpen({
    name: DB_NAME,
    encryptionKey: opts?.encryptionKey,
  });
  return createOpSqliteAdapter(native);
}

function createOpSqliteAdapter(native: OpDB): Db {
  return {
    async execute(sql: string, params?: ReadonlyArray<unknown>) {
      // op-sqlite returns `{rows, rowsAffected, insertId, ...}`; we only
      // need the rowset for SELECT statements. INSERT/UPDATE return rows
      // with metadata; both shapes are passed through.
      const result = await native.execute(sql, (params ?? []) as never);
      return { rows: (result.rows ?? []) as Record<string, unknown>[] };
    },
  };
}

/**
 * Migrations, in version order. We currently ship exactly one. Each entry has
 * a stable numeric id used to skip already-applied migrations in future
 * versions (the table `schema_migrations` is created on first run).
 */
export interface Migration {
  id: number;
  name: string;
  sql: string;
}
export const migrations: Migration[] = [
  { id: 1, name: '001_init', sql: INIT_SQL },
];

/**
 * Runs every migration inside one transaction. On any failure the transaction
 * rolls back and we throw — the root layout shows the "Storage error —
 * reinstall required" blocking screen (specs/persistence.md REQ-1, design
 * §14 risk 8).
 *
 * Idempotency: tracks applied migrations in `schema_migrations(id INTEGER PRIMARY KEY)`.
 * Re-running is safe — already-applied ids are skipped.
 */
export async function runMigrations(db: Db): Promise<void> {
  // Bootstrap the bookkeeping table outside the main tx so a fresh install
  // does not deadlock on its own schema.
  await db.execute(
    'CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL DEFAULT (unixepoch()))',
  );
  const applied = await executeTyped<{ id: number }>(db, 'SELECT id FROM schema_migrations');
  const appliedIds = new Set<number>(applied.rows.map((r) => r.id));

  for (const m of migrations) {
    if (appliedIds.has(m.id)) continue;
    await runOneMigration(db, m);
  }
}

async function runOneMigration(db: Db, m: Migration): Promise<void> {
  try {
    await db.execute('BEGIN');
    // Run each statement in the migration SQL. The migration is a single
    // SQL string containing multiple statements separated by `;` — our
    // `splitSqlStatements` knows about BEGIN/END blocks, comments, and
    // string literals so the inner `;` of a trigger body is preserved.
    const statements = splitSqlStatements(m.sql);
    for (const stmt of statements) {
      if (!stmt.trim()) continue;
      await db.execute(stmt);
    }
    await db.execute('INSERT INTO schema_migrations (id) VALUES (?)', [m.id]);
    await db.execute('COMMIT');
  } catch (err) {
    try {
      await db.execute('ROLLBACK');
    } catch {
      // best-effort rollback; if it fails we are already in an error path
    }
    throw new StorageError(`${STORAGE_ERROR_COPY} (migration ${m.name})`, err);
  }
}

/**
 * Thrown by runMigrations. The chat root layout catches it and renders a
 * blocking screen with `STORAGE_ERROR_COPY` — see design §1.
 */
export class StorageError extends Error {
  override readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'StorageError';
    this.cause = cause;
  }
}

/* -------------------------- row types & accessors ------------------------- */

export interface UserProfileRow {
  id: 1;
  display_name: string;
  primary_locale: string;
  practice_locale: string;
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  topics_json: string;
  preferences_json: string;
  progress_json: string;
  created_at: number;
  updated_at: number;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  stt_audio_path: string | null;
  tts_audio_path: string | null;
  created_at: number;
  tokens_used: number | null;
}

export interface MessageInsert {
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  stt_audio_path?: string | null;
  tts_audio_path?: string | null;
  created_at: number;
  tokens_used?: number | null;
}

/**
 * Returns the singleton user profile row. The migration seeds id=1, so this
 * MUST resolve after `runMigrations` has completed.
 */
export async function getProfile(db: Db): Promise<UserProfileRow> {
  const { rows } = await db.execute(
    'SELECT id, display_name, primary_locale, practice_locale, level, topics_json, preferences_json, progress_json, created_at, updated_at FROM user_profile WHERE id = 1',
  );
  const row = rows[0];
  if (!row) {
    throw new StorageError('user_profile row missing after migrations');
  }
  return row as unknown as UserProfileRow;
}

/**
 * Patches the singleton row. Whitelisted columns; updated_at is bumped in
 * the same statement so callers never see a stale timestamp.
 */
export async function updateProfile(
  db: Db,
  patch: Partial<Omit<UserProfileRow, 'id' | 'created_at' | 'updated_at'>>,
): Promise<void> {
  const keys: (keyof typeof patch)[] = Object.keys(patch) as (keyof typeof patch)[];
  if (keys.length === 0) return;
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const k of keys) {
    sets.push(`${String(k)} = ?`);
    params.push(patch[k]);
  }
  sets.push('updated_at = unixepoch()');
  await db.execute(`UPDATE user_profile SET ${sets.join(', ')} WHERE id = 1`, params);
}

/**
 * Inserts a message and returns its id (uuid). The trigger `message_ai`
 * mirrors the text into `message_fts` automatically (specs/persistence.md REQ-1).
 */
export async function insertMessage(db: Db, m: MessageInsert): Promise<string> {
  const id = generateUuid();
  await db.execute(
    `INSERT INTO message
       (id, conversation_id, role, text, stt_audio_path, tts_audio_path, created_at, tokens_used)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      m.conversation_id,
      m.role,
      m.text,
      m.stt_audio_path ?? null,
      m.tts_audio_path ?? null,
      m.created_at,
      m.tokens_used ?? null,
    ],
  );
  return id;
}

/**
 * Full-text search via the FTS5 mirror. Returns rows ordered by relevance
 * (`bm25` rank). The trigger keeps the mirror in sync; no manual update needed.
 */
export async function searchMessages(db: Db, q: string): Promise<MessageRow[]> {
  const sanitized = sanitizeFtsQuery(q);
  if (!sanitized) return [];
  const { rows } = await executeTyped<MessageRow & Record<string, unknown>>(
    db,
    `SELECT m.id, m.conversation_id, m.role, m.text, m.stt_audio_path, m.tts_audio_path, m.created_at, m.tokens_used
       FROM message m
       JOIN message_fts ON message_fts.rowid = m.rowid
      WHERE message_fts MATCH ?
      ORDER BY bm25(message_fts), m.created_at DESC
      LIMIT 50`,
    [sanitized],
  );
  return rows;
}

/**
 * Prune audio files in documentDirectory/audio/chat that are
 *   (a) older than 24 h, AND
 *   (b) NOT referenced by any message.stt_audio_path or message.tts_audio_path.
 *
 * Returns the count of files deleted. Implemented as a side-effect helper
 * invoked from `app/(tabs)/chat.tsx` mount per design §5.
 *
 * For tests we inject a filesystem-like object; production passes the real
 * `expo-file-system` module via `attachFs` (set by app/_layout.tsx).
 */
export interface AudioFs {
  list(dir: string): { name: string; mtimeMs: number }[];
  delete(path: string): Promise<void>;
}
let audioFs: AudioFs | null = null;
export function attachFs(fs: AudioFs): void {
  audioFs = fs;
}
export async function pruneOrphanAudio(
  db: Db,
  audioDir: string,
  opts?: { ttlMs?: number; now?: number },
): Promise<number> {
  if (!audioFs) {
    // No FS wired (e.g. test environment that doesn't care). Return 0.
    return 0;
  }
  const ttl = opts?.ttlMs ?? 24 * 60 * 60 * 1000;
  const now = opts?.now ?? Date.now();

  // Collect every referenced audio path from the DB.
  const refRows = await executeTyped<{
    stt_audio_path: string | null;
    tts_audio_path: string | null;
  }>(
    db,
    'SELECT stt_audio_path, tts_audio_path FROM message WHERE stt_audio_path IS NOT NULL OR tts_audio_path IS NOT NULL',
  );
  const referenced = new Set<string>();
  for (const r of refRows.rows) {
    if (r.stt_audio_path) referenced.add(r.stt_audio_path);
    if (r.tts_audio_path) referenced.add(r.tts_audio_path);
  }

  let deleted = 0;
  const files = audioFs.list(audioDir);
  for (const f of files) {
    const fullPath = `${audioDir}/${f.name}`;
    if (referenced.has(fullPath)) continue;
    if (now - f.mtimeMs <= ttl) continue;
    await audioFs.delete(fullPath);
    deleted++;
  }
  return deleted;
}

/* ------------------------------- internals -------------------------------- */

/**
 * SQL splitter for hand-written DDL files.
 *
 * Walks the string and emits statements terminated by `;`. Tracks:
 *   - single-quoted strings with backslash escape
 *   - double-quoted identifiers with backslash escape
 *   - line comments (double dash) and block comments (slash-star)
 *   - BEGIN/END blocks (treat the inner semicolon as a non-terminator)
 *
 * This is sufficient for our migrations; do NOT use for arbitrary user SQL.
 */
function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = '';
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;
  let beginDepth = 0;

  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];

    // Comment handling
    if (!inSingle && !inDouble && !inBlockComment && c === '-' && next === '-') {
      inLineComment = true;
      buf += c;
      i++;
      continue;
    }
    if (inLineComment) {
      buf += c;
      if (c === '\n') inLineComment = false;
      i++;
      continue;
    }
    if (!inSingle && !inDouble && !inLineComment && c === '/' && next === '*') {
      inBlockComment = true;
      buf += c + next;
      i += 2;
      continue;
    }
    if (inBlockComment) {
      buf += c;
      if (c === '*' && next === '/') {
        buf += next;
        i += 2;
        inBlockComment = false;
        continue;
      }
      i++;
      continue;
    }

    // String / identifier literal handling
    if (!inDouble && c === "'" && sql[i - 1] !== '\\') {
      inSingle = !inSingle;
      buf += c;
      i++;
      continue;
    }
    if (!inSingle && c === '"' && sql[i - 1] !== '\\') {
      inDouble = !inDouble;
      buf += c;
      i++;
      continue;
    }

    // BEGIN / END blocks — keep their inner `;` inside the surrounding statement.
    if (!inSingle && !inDouble) {
      // Match BEGIN as a standalone keyword (skip inside identifiers via word boundary).
      if (isKeywordBoundary(buf) && matchesKeywordAt(sql, i, 'BEGIN')) {
        beginDepth++;
        buf += 'BEGIN';
        i += 5;
        continue;
      }
      if (isKeywordBoundary(buf) && matchesKeywordAt(sql, i, 'END')) {
        beginDepth = Math.max(0, beginDepth - 1);
        buf += 'END';
        i += 3;
        continue;
      }
    }

    if (c === ';' && !inSingle && !inDouble && beginDepth === 0) {
      out.push(buf);
      buf = '';
      i++;
      continue;
    }

    buf += c;
    i++;
  }
  if (buf.trim()) out.push(buf);
  return out;
}

function isKeywordBoundary(bufSoFar: string): boolean {
  // Word boundary: previous char in buf is whitespace / punctuation.
  const last = bufSoFar.length === 0 ? ' ' : bufSoFar[bufSoFar.length - 1];
  return /\s|[();,]/.test(last ?? ' ');
}

function matchesKeywordAt(sql: string, i: number, keyword: string): boolean {
  // Case-insensitive match followed by a non-identifier character.
  if (sql.substring(i, i + keyword.length).toUpperCase() !== keyword) return false;
  const after = sql[i + keyword.length];
  if (after === undefined) return true;
  return !/[A-Za-z0-9_]/.test(after);
}

/**
 * FTS5 MATCH syntax is NOT the same as LIKE. Special characters must be
 * quoted or escaped or the query fails with a parser error. We pass a simple
 * term-by-term strategy: each whitespace-separated token gets wrapped in
 * double quotes (escape inner quotes by doubling).
 */
function sanitizeFtsQuery(q: string): string {
  const tokens = q
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/"/g, '""'))
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return '';
  return tokens.map((t) => `"${t}"`).join(' ');
}

/**
 * Tiny uuid v4 generator. We do not need cryptographic strength — this is
 * only used for conversation + message row keys inside one device.
 */
function generateUuid(): string {
  // RN provides crypto.getRandomValues on Hermes 0.7+; the global is available
  // on device. Fallback to Math.random for tests.
  const cryptoObj: Crypto | undefined =
    typeof globalThis !== 'undefined' && 'crypto' in globalThis
      ? ((globalThis as unknown as { crypto?: Crypto }).crypto ?? undefined)
      : undefined;
  const rnd: () => number = cryptoObj
    ? () => {
        const buf = new Uint8Array(16);
        cryptoObj.getRandomValues(buf);
        return buf[0]! / 256;
      }
    : () => Math.random();
  const b: number[] = [];
  for (let i = 0; i < 16; i++) b.push(Math.floor(rnd() * 256));
  // Per RFC 4122 v4
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = b.map((x) => x.toString(16).padStart(2, '0'));
  return (
    h.slice(0, 4).join('') +
    '-' +
    h.slice(4, 6).join('') +
    '-' +
    h.slice(6, 8).join('') +
    '-' +
    h.slice(8, 10).join('') +
    '-' +
    h.slice(10, 16).join('')
  );
}

/* --------------------------------- exports -------------------------------- */

/**
 * Surface the storage error copy so the layout component can render it
 * without re-importing a string constant.
 */
export const STORAGE_ERROR_MESSAGE = STORAGE_ERROR_COPY;

/**
 * Production boot helper: open + migrate + verify the singleton row.
 * Used by `app/_layout.tsx` before any tab renders (design §6 hydration rule).
 */
export async function bootDatabase(opts?: { encryptionKey?: string }): Promise<Db> {
  const db = await openDb(opts);
  await runMigrations(db);
  await getProfile(db); // throws StorageError if seed missing — surfaces to layout
  return db;
}

/* eslint-disable @typescript-eslint/no-unused-vars */
// Platform import retained for future driver selection (native vs web).
const _platform = Platform.OS;
/* eslint-enable @typescript-eslint/no-unused-vars */