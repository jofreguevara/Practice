/**
 * expo-file-system mock — minimal surface for tests that touch audio paths
 * and disk probes used by `capability.probe()`, `modelDownloader`, etc.
 *
 * Each export is a `jest.fn` so individual tests can override return
 * values via `mockResolvedValueOnce(...)`. Defaults report "lots of
 * disk free" so the bootstrap RED test passes, and assume every
 * getInfoAsync() target exists unless a test says otherwise.
 */

export const documentDirectory = '/tmp/practice-test/';
export const cacheDirectory = '/tmp/practice-test/cache/';

// SDK 54's new `Paths` namespace is not used in the codebase yet, but
// some tests pull it in via deep imports. Keep the surface minimal so
// test code that does `import { Paths } from 'expo-file-system'` does
// not crash. Production code reads `documentDirectory` from the legacy
// sub-export (see `expo-file-system/legacy`).
export const Paths = {
  document: { uri: '/tmp/practice-test/' },
  cache: { uri: '/tmp/practice-test/cache/' },
};

export const getInfoAsync = jest.fn(() =>
  Promise.resolve({ exists: true, isDirectory: false }),
);
export const readDirectoryAsync = jest.fn(() => Promise.resolve([]));
export const deleteAsync = jest.fn(() => Promise.resolve());
export const writeAsStringAsync = jest.fn(() => Promise.resolve());
export const readAsStringAsync = jest.fn(() => Promise.resolve(''));
export const makeDirectoryAsync = jest.fn(() => Promise.resolve());
export const copyAsync = jest.fn(async ({ from, to }: { from: string; to: string }) => {
  // Honor `from → to` in the byte registry so `File(...).arrayBuffer()`
  // at the canonical path returns the staged payload.
  const bytes = _fileBytesRegistry[from];
  if (bytes) {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    _fileBytesRegistry[to] = copy;
  }
});

// Default 16 GB free; individual tests override.
export const getFreeDiskStorageAsync = jest.fn(() =>
  Promise.resolve(16 * 1024 * 1024 * 1024),
);
export const getTotalDiskCapacityAsync = jest.fn(() =>
  Promise.resolve(128 * 1024 * 1024 * 1024),
);

// New SDK 54 File/Directory classes. The capability test pre-mocks these
// at the test level, but modelDownloader tests rely on the shared stub.
// `File#arrayBuffer` reads from a per-test byte map registered via
// `__setFileBytes(path, bytes)` so SHA-256 verification has real bytes to
// hash. Production code never sees this — Hermes does.
interface FileBytesRegistry {
  [path: string]: Uint8Array;
}
const _fileBytesRegistry: FileBytesRegistry = {};

export function __setFileBytes(path: string, bytes: Uint8Array | null): void {
  if (bytes === null) {
    delete _fileBytesRegistry[path];
  } else {
    _fileBytesRegistry[path] = bytes;
  }
}

export function __resetFileBytes(): void {
  for (const k of Object.keys(_fileBytesRegistry)) delete _fileBytesRegistry[k];
}

export class File {
  constructor(public readonly uri: string) {}
  async arrayBuffer(): Promise<ArrayBuffer> {
    const bytes = _fileBytesRegistry[this.uri];
    if (bytes) {
      // Copy into a fresh ArrayBuffer so callers see the same byte length.
      const ab = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(ab).set(bytes);
      return ab;
    }
    return new ArrayBuffer(0);
  }
}

export class Directory {
  constructor(public readonly uri: string) {}
}

// `createDownloadResumable` is a factory that returns a handle with
// `downloadAsync` + `cancelAsync` + `savable` methods. The default
// implementation records calls so tests can assert on URL/destination,
// and the `__setDownloadPlan` hook lets a test stage the outcome.
interface DownloadPlan {
  status?: number;
  bytesTotal?: number;
  bytesWritten?: number;
  error?: Error;
}
const _downloadPlan: DownloadPlan = { status: 200, bytesTotal: 0, bytesWritten: 0 };
export function __setDownloadPlan(plan: Partial<DownloadPlan>): void {
  Object.assign(_downloadPlan, plan);
}
export function __resetDownloadPlan(): void {
  _downloadPlan.status = 200;
  _downloadPlan.bytesTotal = 0;
  _downloadPlan.bytesWritten = 0;
  _downloadPlan.error = undefined;
}

export interface DownloadResumableOptions {
  [key: string]: unknown;
}

export const createDownloadResumable = jest.fn(
  (
    url: string,
    fileUri: string,
    _options?: DownloadResumableOptions,
    callback?: (progress: {
      totalBytesWritten: number;
      totalBytesExpectedToWrite: number;
    }) => void,
  ): {
    downloadAsync: () => Promise<{ uri: string; status: number } | null>;
    cancelAsync: () => Promise<void>;
    savable: boolean;
    url: string;
    fileUri: string;
  } => {
    const handle = {
      url,
      fileUri,
      savable: true,
      async downloadAsync(): Promise<{ uri: string; status: number } | null> {
        if (_downloadPlan.error) throw _downloadPlan.error;
        // Fire one progress tick so tests can assert on `onProgress`.
        callback?.({
          totalBytesWritten: _downloadPlan.bytesWritten ?? 0,
          totalBytesExpectedToWrite: _downloadPlan.bytesTotal ?? 0,
        });
        if ((_downloadPlan.status ?? 200) !== 200) {
          return { uri: fileUri, status: _downloadPlan.status ?? 500 };
        }
        // Stage bytes at the destination so `getInfoAsync` reports exists.
        // Also write into the FileBytesRegistry so a follow-up `readBytes`
        // via File.arrayBuffer() returns the staged payload.
        const bytes = new Uint8Array(_downloadPlan.bytesWritten ?? 0);
        if (bytes.byteLength > 0) _fileBytesRegistry[fileUri] = bytes;
        return { uri: fileUri, status: 200 };
      },
      async cancelAsync(): Promise<void> {
        /* noop */
      },
    };
    return handle;
  },
);