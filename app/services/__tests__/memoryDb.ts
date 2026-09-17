/**
 * Test-only Db adapter backed by better-sqlite3.
 * Exposes the same `execute(sql, params)` shape as the op-sqlite adapter so
 * tests exercise the exact same business logic in db.ts.
 */
import Database from 'better-sqlite3';

export interface MemoryDbOptions {
  /** Pre-load statements (e.g. the migration SQL). */
  bootstrap?: string;
}

export function createMemoryDb(opts: MemoryDbOptions = {}): {
  db: import('../db').Db;
  close: () => void;
  /** Escape hatch for tests: run raw SQL synchronously. */
  raw: Database.Database;
} {
  const raw = new Database(':memory:');
  // Match production PRAGMAs as closely as better-sqlite3 allows.
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');
  if (opts.bootstrap) {
    raw.exec(opts.bootstrap);
  }
  const db: import('../db').Db = {
    async execute(sql: string, params?: ReadonlyArray<unknown>) {
      const stmt = raw.prepare(sql);
      const isSelect = /^\s*(SELECT|PRAGMA|WITH)\b/i.test(sql);
      const rows = isSelect
        ? (stmt.all(...((params ?? []) as unknown[])) as Record<string, unknown>[])
        : [];
      if (!isSelect) stmt.run(...((params ?? []) as unknown[]));
      return { rows };
    },
  };
  return {
    db,
    close: () => raw.close(),
    raw,
  };
}