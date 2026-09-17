/**
 * Tests for app/services/db.ts.
 *
 * Covers the three Jest ids in tasks.md 1.6:
 *   - db.migrations_in_transaction — runMigrations is atomic
 *   - db.searchMessages_returns_fts5_results — FTS5 search returns hits
 *   - db.pruneOrphanAudio_keeps_referenced — audio pruning is precise
 *
 * Plus getProfile / updateProfile / insertMessage happy paths.
 */
import {
  runMigrations,
  getProfile,
  updateProfile,
  insertMessage,
  searchMessages,
  pruneOrphanAudio,
  attachFs,
  StorageError,
  migrations,
  executeTyped,
} from '../db';
import { createMemoryDb } from './memoryDb';
import { INIT_SQL } from '../../migrations/001_init';
import type { AudioFs } from '../db';

async function boot() {
  const mem = createMemoryDb({ bootstrap: INIT_SQL });
  // Schema is preloaded by createMemoryDb; emulate runMigrations bookkeeping.
  await mem.db.execute('CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY)');
  await mem.db.execute('INSERT OR IGNORE INTO schema_migrations (id) VALUES (1)');
  return mem;
}

describe('db', () => {
  test('migrations_in_transaction: runMigrations is atomic', async () => {
    const { db, close } = createMemoryDb();
    try {
      // Schema NOT preloaded — runMigrations must apply 001_init.sql itself.
      await runMigrations(db);
      // After success, the schema_migrations table records id=1.
      const { rows } = await executeTyped<{ id: number }>(
        db,
        'SELECT id FROM schema_migrations ORDER BY id',
      );
      expect(rows.map((r: { id: number }) => r.id)).toEqual([1]);
    } finally {
      close();
    }
  });

  test('migrations_in_transaction: failure throws StorageError and rolls back', async () => {
    const { db, close } = createMemoryDb();
    try {
      // Inject a deliberately-broken migration by temporarily pushing one onto the
      // shared migrations array. After the test we restore it.
      const originalLen = migrations.length;
      const originalMigrations = migrations.slice();
      (migrations as { id: number; name: string; sql: string }[]).push({
        id: 99,
        name: 'broken',
        sql: 'THIS IS NOT VALID SQL',
      });
      try {
        await expect(runMigrations(db)).rejects.toBeInstanceOf(StorageError);
        // schema_migrations must NOT contain id=99 (rolled back).
        const { rows } = await executeTyped<{ id: number }>(
          db,
          'SELECT id FROM schema_migrations',
        );
        expect(rows.map((r: { id: number }) => r.id)).not.toContain(99);
      } finally {
        (migrations as unknown as { length: number }).length = originalLen;
        for (let i = 0; i < originalMigrations.length; i++) {
          (migrations as { id: number; name: string; sql: string }[])[i] = originalMigrations[i]!;
        }
      }
    } finally {
      close();
    }
  });

  test('getProfile returns singleton row', async () => {
    const mem = await boot();
    try {
      const row = await getProfile(mem.db);
      expect(row.id).toBe(1);
      expect(row.display_name).toBe('Learner');
      expect(row.level).toBe('A2');
      expect(row.practice_locale).toBe('es-ES');
    } finally {
      mem.close();
    }
  });

  test('updateProfile flushes patch + bumps updated_at', async () => {
    const mem = await boot();
    try {
      const before = await getProfile(mem.db);
      await updateProfile(mem.db, { display_name: 'Sara', level: 'B1' });
      const after = await getProfile(mem.db);
      expect(after.display_name).toBe('Sara');
      expect(after.level).toBe('B1');
      expect(after.updated_at).toBeGreaterThanOrEqual(before.updated_at);
    } finally {
      mem.close();
    }
  });

  test('insertMessage + searchMessages_returns_fts5_results', async () => {
    const mem = await boot();
    try {
      // Seed a conversation so the message FK resolves.
      await mem.db.execute(
        "INSERT INTO conversation (id, topic, started_at) VALUES ('c1', 'travel', 100)",
      );
      await insertMessage(mem.db, {
        conversation_id: 'c1',
        role: 'user',
        text: 'I want to fly to Madrid next month',
        created_at: 100,
      });
      await insertMessage(mem.db, {
        conversation_id: 'c1',
        role: 'assistant',
        text: 'Sure, here are some flights to Spain',
        created_at: 101,
      });
      await insertMessage(mem.db, {
        conversation_id: 'c1',
        role: 'user',
        text: 'What about cooking paella tonight?',
        created_at: 102,
      });

      const madridHits = await searchMessages(mem.db, 'Madrid');
      expect(madridHits.length).toBe(1);
      expect(madridHits[0]!.text).toContain('Madrid');

      const travelHits = await searchMessages(mem.db, 'Spain flights');
      // Both terms appear in the assistant message — at least one row matches.
      expect(travelHits.length).toBeGreaterThanOrEqual(1);
    } finally {
      mem.close();
    }
  });

  test('searchMessages sanitizes special characters (does not crash)', async () => {
    const mem = await boot();
    try {
      await mem.db.execute(
        "INSERT INTO conversation (id, topic, started_at) VALUES ('c1', 'travel', 100)",
      );
      await insertMessage(mem.db, {
        conversation_id: 'c1',
        role: 'user',
        text: 'normal text',
        created_at: 100,
      });
      // The bug we are protecting against: passing `"fix"` or `'auth'` to MATCH crashes
      // because FTS5 interprets `:` and quotes as operators.
      await expect(searchMessages(mem.db, 'fix: auth bug')).resolves.toEqual([]);
    } finally {
      mem.close();
    }
  });

  test('pruneOrphanAudio_keeps_referenced', async () => {
    const mem = await boot();
    try {
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;
      const files: { name: string; mtimeMs: number }[] = [
        { name: 'orphan-old.wav', mtimeMs: now - 2 * oneDay }, // old + unreferenced → delete
        { name: 'orphan-new.wav', mtimeMs: now - 1 * 60 * 1000 }, // young + unreferenced → keep
        { name: 'referenced.wav', mtimeMs: now - 7 * oneDay }, // old but referenced → keep
      ];
      const deleted: string[] = [];
      const fs: AudioFs = {
        list: () => files,
        delete: async (path: string) => {
          deleted.push(path);
        },
      };
      attachFs(fs);

      await mem.db.execute(
        "INSERT INTO conversation (id, topic, started_at) VALUES ('c1', 'travel', 100)",
      );
      await insertMessage(mem.db, {
        conversation_id: 'c1',
        role: 'assistant',
        text: 'ok',
        created_at: 100,
        tts_audio_path: '/audio/chat/referenced.wav',
      });

      const count = await pruneOrphanAudio(mem.db, '/audio/chat', { ttlMs: oneDay, now });
      expect(count).toBe(1);
      expect(deleted).toEqual(['/audio/chat/orphan-old.wav']);
    } finally {
      mem.close();
    }
  });
});