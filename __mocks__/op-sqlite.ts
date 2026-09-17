/**
 * op-sqlite mock for Jest — the native binding is not loadable in Node.
 *
 * Production code uses `open()` from `@op-engineering/op-sqlite`; tests use
 * the better-sqlite3-backed memory adapter (`app/services/__tests__/memoryDb.ts`).
 * The factory throws a clear error so any test that accidentally exercises
 * the production adapter fails loudly instead of silently doing nothing.
 */

export class MockOpDB {
  execute(): Promise<{ rows: Record<string, unknown>[] }> {
    return Promise.reject(
      new Error(
        'op-sqlite native binding is unavailable in Jest. Use createMemoryDb() instead.',
      ),
    );
  }
  executeBatch(): Promise<void> {
    return Promise.reject(new Error('op-sqlite unavailable in Jest'));
  }
  transaction<T>(_fn: () => Promise<T>): Promise<T> {
    return Promise.reject(new Error('op-sqlite unavailable in Jest'));
  }
  close(): void {}
  closeAsync(): Promise<void> {
    return Promise.resolve();
  }
}

export function open(): MockOpDB {
  throw new Error('op-sqlite native binding is unavailable in Jest.');
}

export function openAsync(): Promise<MockOpDB> {
  return Promise.reject(new Error('op-sqlite native binding is unavailable in Jest.'));
}

export function isSQLCipher(): boolean {
  return false;
}
export function isLibsql(): boolean {
  return false;
}
export function isTurso(): boolean {
  return false;
}
export function isIOSEmbedded(): boolean {
  return false;
}