/**
 * Tests for app/migrations/001_init.ts.
 *
 * The migration SQL must:
 *   - create user_profile with the singleton CHECK (id = 1)
 *   - seed the singleton row via INSERT INTO user_profile (id) VALUES (1)
 *   - create conversation, message, message_fts (FTS5 virtual table)
 *   - wire the FTS5 sync triggers
 *
 * Jest id per tasks.md: migrations.001_init.creates_schema
 */
import { createMemoryDb } from './memoryDb';
import { INIT_SQL } from '../../migrations/001_init';
import { runMigrations, executeTyped } from '../db';

describe('migrations.001_init', () => {
  test('creates_schema', async () => {
    // better-sqlite3's exec() handles multi-statement SQL natively and is
    // used here purely for the verification side. The production path goes
    // through runMigrations() which uses our splitter — covered below.
    const { close, raw } = createMemoryDb();
    try {
      raw.exec(INIT_SQL);
      const tables = raw
        .prepare(
          "SELECT name FROM sqlite_master WHERE type IN ('table','view','trigger') ORDER BY name",
        )
        .all() as { name: string }[];
      const names = new Set(tables.map((t) => t.name));

      // Tables
      expect(names.has('user_profile')).toBe(true);
      expect(names.has('conversation')).toBe(true);
      expect(names.has('message')).toBe(true);
      expect(names.has('message_fts')).toBe(true);

      // Triggers
      expect(names.has('message_ai')).toBe(true);
      expect(names.has('message_ad')).toBe(true);
      expect(names.has('message_au')).toBe(true);
    } finally {
      close();
    }
  });

  test('seeds_singleton_user_profile', async () => {
    const { close, raw } = createMemoryDb();
    try {
      raw.exec(INIT_SQL);
      const row = raw.prepare('SELECT * FROM user_profile WHERE id = 1').get() as
        | { display_name: string; level: string; practice_locale: string }
        | undefined;
      expect(row).toBeDefined();
      expect(row!.display_name).toBe('Learner');
      expect(row!.level).toBe('A2');
      expect(row!.practice_locale).toBe('es-ES');
    } finally {
      close();
    }
  });

  test('singleton_invariant_rejects_extra_rows', async () => {
    const { close, raw } = createMemoryDb();
    try {
      raw.exec(INIT_SQL);
      // The CHECK (id = 1) constraint must reject id = 2.
      expect(() => raw.prepare('INSERT INTO user_profile (id) VALUES (2)').run()).toThrow(
        /CHECK constraint/i,
      );
    } finally {
      close();
    }
  });

  test('runMigrations applies the migration idempotently via Db.execute', async () => {
    const mem = createMemoryDb();
    try {
      await runMigrations(mem.db);
      // Second invocation must be a no-op (already in schema_migrations).
      await runMigrations(mem.db);
      const rows = (
        await executeTyped<{ id: number }>(mem.db, 'SELECT id FROM schema_migrations')
      ).rows;
      expect(rows.map((r: { id: number }) => r.id)).toEqual([1]);
    } finally {
      mem.close();
    }
  });
});