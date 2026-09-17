/**
 * Test-only Db adapter backed by Node's built-in `node:sqlite` (stable since
 * Node 22.5, available in our Node 24 toolchain). Same `execute(sql, params)`
 * shape as the production op-sqlite adapter so tests exercise the exact
 * same business logic in db.ts.
 *
 * Replaces the previous better-sqlite3 dependency, which requires a C++
 * postinstall (node-gyp rebuild) that EAS build containers don't have.
 */
import { DatabaseSync } from 'node:sqlite';

export interface MemoryDbOptions {
  /** Pre-load statements (e.g. the migration SQL). */
  bootstrap?: string;
}

interface RawRow {
  [column: string]: unknown;
}

export function createMemoryDb(opts: MemoryDbOptions = {}): {
  db: import('../db').Db;
  close: () => void;
  /** Escape hatch for tests: run raw SQL synchronously. */
  raw: DatabaseSync;
} {
  const raw = new DatabaseSync(':memory:');
  // Match production PRAGMAs as closely as node:sqlite allows.
  raw.exec('PRAGMA journal_mode = WAL');
  raw.exec('PRAGMA foreign_keys = ON');
  if (opts.bootstrap) {
    raw.exec(opts.bootstrap);
  }
  const db: import('../db').Db = {
    async execute(sql: string, params?: ReadonlyArray<unknown>) {
      const isSelect = /^\s*(SELECT|PRAGMA|WITH)\b/i.test(sql);
      // node:sqlite expects SQLInputValue (number | string | bigint | Buffer | null).
      // Map undefined → null; everything else passes through.
      const args = ((params ?? []) as Array<number | string | bigint | null>).map(
        (p) => (p === undefined ? null : p),
      );
      const stmt = raw.prepare(sql);
      const rows: RawRow[] = isSelect
        ? ((stmt.all(...args) as RawRow[]) ?? [])
        : [];
      if (!isSelect) stmt.run(...args);
      return { rows };
    },
  };
  return {
    db,
    close: () => raw.close(),
    raw,
  };
}
