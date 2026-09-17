/**
 * Tests for app/services/modelDownloader.ts.
 *
 * Covers the five behavioural guarantees from the orchestrator's binding
 * spec for the download-on-first-launch path:
 *   1. Idempotent no-op when the sentinel + every file is already on disk
 *      with a matching SHA-256. `onProgress` is NOT called.
 *   2. Three downloadAsync() calls when the sentinel is absent (full pull).
 *      `onProgress` emits at least once.
 *   3. SHA-256 mismatch: pre-stage a file with bytes whose hash does NOT
 *      match the manifest. The function throws and the file is deleted.
 *   4. SHA-256 ok: pre-stage a file with bytes that DO match. No
 *      downloadAsync() call for that file (skip-and-verify path).
 *   5. AbortSignal: a pre-aborted signal rejects the promise quickly with
 *      an AbortError.
 *
 * jest-expo's preset auto-mocks `expo-file-system` (see
 * `node_modules/jest-expo/src/preset/setup.js:134`). Our per-file
 * factory re-declares the surface so the moduleNameMapper redirect in
 * package.json is honored (documentDirectory, cacheDirectory, Paths) and
 * every primitive the production code touches is a `jest.fn()` so
 * individual tests can override return values via `mockImplementation`.
 * The File class and `createDownloadResumable` are re-wired below to
 * consult a per-test byte registry so SHA-256 round-trips work.
 */
import { createHash } from 'crypto';

import {
  MODEL_MANIFEST,
  STT_ASSET,
} from '../../config/modelManifest';
import {
  ensureModelsInstalled,
  getModelsDownloaded,
  getLastDownloadError,
  resetDownloadedFlag,
  MODELS_DIR_DOWNLOAD,
  MODELS_DIR,
  MODELS_DOWNLOADED_SENTINEL,
  type ModelDownloadProgress,
} from '../modelDownloader';

import * as FileSystem from 'expo-file-system';

jest.mock('expo-file-system', () => {
  // Per-test byte registry, consulted by File.arrayBuffer() and by
  // copyAsync. Lives in the factory closure so it is shared across all
  // tests in this file.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fileBytesRegistry = new Map<string, Uint8Array>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const downloadPlan: any = { status: 200, bytesTotal: 0, bytesWritten: 0 };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockFile: any = function MockFile(this: any, uri: string) {
    this.uri = uri;
  };
  MockFile.prototype.arrayBuffer = async function arrayBuffer(
    this: { uri: string },
  ): Promise<ArrayBuffer> {
    const bytes = fileBytesRegistry.get(this.uri);
    if (bytes) {
      const ab = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(ab).set(bytes);
      return ab;
    }
    return new ArrayBuffer(0);
  };

  return {
    documentDirectory: '/tmp/practice-test/',
    cacheDirectory: '/tmp/practice-test/cache/',
    Paths: {
      document: { uri: '/tmp/practice-test/' },
      cache: { uri: '/tmp/practice-test/cache/' },
    },
    getInfoAsync: jest.fn(() =>
      Promise.resolve({ exists: true, isDirectory: false }),
    ),
    readDirectoryAsync: jest.fn(() => Promise.resolve([])),
    deleteAsync: jest.fn(() => Promise.resolve()),
    writeAsStringAsync: jest.fn(() => Promise.resolve()),
    readAsStringAsync: jest.fn(() => Promise.resolve('')),
    makeDirectoryAsync: jest.fn(() => Promise.resolve()),
    // copyAsync: move bytes from `from` → `to` in the registry so a
    // follow-up File.arrayBuffer() at `to` returns the staged payload.
    copyAsync: jest.fn(async ({ from, to }: { from: string; to: string }) => {
      const bytes = fileBytesRegistry.get(from);
      if (bytes) {
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        fileBytesRegistry.set(to, copy);
      }
    }),
    getFreeDiskStorageAsync: jest.fn(() =>
      Promise.resolve(16 * 1024 * 1024 * 1024),
    ),
    getTotalDiskCapacityAsync: jest.fn(() =>
      Promise.resolve(128 * 1024 * 1024 * 1024),
    ),
    downloadAsync: jest.fn(() =>
      Promise.resolve({ md5: 'md5', uri: 'uri' }),
    ),
    moveAsync: jest.fn(() => Promise.resolve()),
    File: MockFile,
    Directory: class {},
    // createDownloadResumable: returns a handle whose downloadAsync
    // stages `bytesWritten` zero-bytes at fileUri. Real tests rely on
    // pre-staged .partial bytes + copyAsync to move them.
    createDownloadResumable: jest.fn(
      (
        _url: string,
        fileUri: string,
        _options?: Record<string, unknown>,
        callback?: (progress: {
          totalBytesWritten: number;
          totalBytesExpectedToWrite: number;
        }) => void,
      ) => ({
        url: _url,
        fileUri,
        savable: true,
        async downloadAsync(): Promise<{ uri: string; status: number } | null> {
          if (downloadPlan.error) throw downloadPlan.error;
          callback?.({
            totalBytesWritten: downloadPlan.bytesWritten ?? 0,
            totalBytesExpectedToWrite: downloadPlan.bytesTotal ?? 0,
          });
          if ((downloadPlan.status ?? 200) !== 200) {
            return { uri: fileUri, status: downloadPlan.status ?? 500 };
          }
          const bytes = new Uint8Array(downloadPlan.bytesWritten ?? 0);
          if (bytes.byteLength > 0) fileBytesRegistry.set(fileUri, bytes);
          return { uri: fileUri, status: 200 };
        },
        async cancelAsync(): Promise<void> {
          /* noop */
        },
      }),
    ),
    // Test seams exposed on the namespace so the test body can wire up
    // bytes + plans without reaching into the closure.
    __setFileBytes(path: string, bytes: Uint8Array | null): void {
      if (bytes === null) fileBytesRegistry.delete(path);
      else fileBytesRegistry.set(path, bytes);
    },
    __resetFileBytes(): void {
      fileBytesRegistry.clear();
    },
    __setDownloadPlan(plan: { status?: number; bytesTotal?: number; bytesWritten?: number; error?: Error }): void {
      Object.assign(downloadPlan, plan);
    },
    __resetDownloadPlan(): void {
      downloadPlan.status = 200;
      downloadPlan.bytesTotal = 0;
      downloadPlan.bytesWritten = 0;
      downloadPlan.error = undefined;
    },
  };
});

const FileSystemMock = FileSystem as unknown as {
  getInfoAsync: jest.Mock;
  writeAsStringAsync: jest.Mock;
  deleteAsync: jest.Mock;
  makeDirectoryAsync: jest.Mock;
  copyAsync: jest.Mock;
  createDownloadResumable: jest.Mock;
  __setFileBytes: (path: string, bytes: Uint8Array | null) => void;
  __resetFileBytes: () => void;
  __setDownloadPlan: (plan: {
    status?: number;
    bytesTotal?: number;
    bytesWritten?: number;
    error?: Error;
  }) => void;
  __resetDownloadPlan: () => void;
};

/* ----------------- helpers ------------------------------------------------- */

function sha256Of(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Convenience: the path the downloader writes each entry to. */
function localFilePath(localPath: string): string {
  return `${MODELS_DIR_DOWNLOAD}${localPath}`;
}

/** Build a deterministic byte payload whose hash matches `sha256`. */
function stagedBytes(label: string, n: number): { bytes: Uint8Array; sha256: string } {
  let seed = 0;
  for (let i = 0; i < label.length; i++) seed = (seed * 31 + label.charCodeAt(i)) >>> 0;
  const bytes = new Uint8Array(n);
  let s = seed >>> 0;
  for (let i = 0; i < n; i++) {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    bytes[i] = ((t ^ (t >>> 14)) >>> 0) & 0xff;
  }
  return { bytes, sha256: sha256Of(bytes) };
}

/** Sentinel + each model entry's file path with the appropriate exists flag. */
function seedSentinelExists(): void {
  FileSystemMock.getInfoAsync.mockImplementation((path: string) => {
    if (path === MODELS_DOWNLOADED_SENTINEL) {
      return Promise.resolve({ exists: true, isDirectory: false });
    }
    return Promise.resolve({ exists: true, isDirectory: false });
  });
}

function seedSentinelAbsent(): void {
  FileSystemMock.getInfoAsync.mockImplementation((path: string) => {
    if (path === MODELS_DOWNLOADED_SENTINEL) {
      return Promise.resolve({ exists: false, isDirectory: false });
    }
    return Promise.resolve({ exists: true, isDirectory: false });
  });
}

/* ----------------- setup / teardown --------------------------------------- */

beforeEach(() => {
  FileSystemMock.__resetFileBytes();
  FileSystemMock.__resetDownloadPlan();
  FileSystemMock.getInfoAsync.mockReset();
  FileSystemMock.writeAsStringAsync.mockReset();
  FileSystemMock.writeAsStringAsync.mockResolvedValue(undefined);
  FileSystemMock.deleteAsync.mockReset();
  FileSystemMock.deleteAsync.mockResolvedValue(undefined);
  FileSystemMock.makeDirectoryAsync.mockReset();
  FileSystemMock.makeDirectoryAsync.mockResolvedValue(undefined);
  // copyAsync + createDownloadResumable keep the factory implementations
  // intact — tests that need different behaviour use mockImplementation
  // (which preserves the factory impl when cleared via mockClear, not
  // mockReset). mockReset on these would wipe the factory impl and
  // return undefined to the caller, breaking the download path.
  FileSystemMock.copyAsync.mockClear();
  FileSystemMock.createDownloadResumable.mockClear();
  // Realistic default: every file/sentinel exists unless a test overrides.
  FileSystemMock.getInfoAsync.mockResolvedValue({ exists: true, isDirectory: false });
});

/* ----------------- tests --------------------------------------------------- */

describe('modelDownloader.ensureModelsInstalled', () => {
  test('idempotent no-op when sentinel + every model file is present (hash matches)', async () => {
    seedSentinelExists();
    for (const localPath of [
      STT_ASSET.localPath,
      MODEL_MANIFEST['llama-3.2-1b'].localPath,
      MODEL_MANIFEST['qwen2.5-1.5b'].localPath,
    ]) {
      const staged = stagedBytes(localPath, 32);
      FileSystemMock.__setFileBytes(localFilePath(localPath), staged.bytes);
    }

    const onProgress = jest.fn();
    await ensureModelsInstalled(onProgress);

    expect(FileSystemMock.createDownloadResumable).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalled();
    expect(FileSystemMock.writeAsStringAsync).not.toHaveBeenCalled();
  });

  test('full pull when sentinel is absent — downloads 3 files and emits progress', async () => {
    seedSentinelAbsent();
    FileSystemMock.makeDirectoryAsync.mockResolvedValueOnce(undefined);
    // Pre-stage matching bytes at each .partial path so the post-download
    // hash verification passes (we mutate the manifest sha256 fields to
    // the hash of the staged bytes, then restore them in the finally).
    const stt = stagedBytes(STT_ASSET.localPath, 16);
    const llama = stagedBytes(MODEL_MANIFEST['llama-3.2-1b'].localPath, 16);
    const qwen = stagedBytes(MODEL_MANIFEST['qwen2.5-1.5b'].localPath, 16);
    FileSystemMock.__setFileBytes(
      `${localFilePath(STT_ASSET.localPath)}.partial`,
      stt.bytes,
    );
    FileSystemMock.__setFileBytes(
      `${localFilePath(MODEL_MANIFEST['llama-3.2-1b'].localPath)}.partial`,
      llama.bytes,
    );
    FileSystemMock.__setFileBytes(
      `${localFilePath(MODEL_MANIFEST['qwen2.5-1.5b'].localPath)}.partial`,
      qwen.bytes,
    );
    const origStt = STT_ASSET.sha256;
    const origLlama = MODEL_MANIFEST['llama-3.2-1b'].sha256;
    const origQwen = MODEL_MANIFEST['qwen2.5-1.5b'].sha256;
    (STT_ASSET as { sha256: string }).sha256 = stt.sha256;
    (MODEL_MANIFEST['llama-3.2-1b'] as { sha256: string }).sha256 = llama.sha256;
    (MODEL_MANIFEST['qwen2.5-1.5b'] as { sha256: string }).sha256 = qwen.sha256;
    try {
      FileSystemMock.__setDownloadPlan({ status: 200 });

      const progressTicks: ModelDownloadProgress[] = [];
      await ensureModelsInstalled((p) => {
        progressTicks.push(p);
      });

      expect(FileSystemMock.createDownloadResumable).toHaveBeenCalledTimes(3);
      expect(progressTicks.length).toBeGreaterThan(0);
      const last = progressTicks[progressTicks.length - 1]!;
      expect(last.phase).toBe('done');
      expect(FileSystemMock.writeAsStringAsync).toHaveBeenCalledWith(
        MODELS_DOWNLOADED_SENTINEL,
        '',
        expect.objectContaining({ encoding: 'utf8' }),
      );
    } finally {
      (STT_ASSET as { sha256: string }).sha256 = origStt;
      (MODEL_MANIFEST['llama-3.2-1b'] as { sha256: string }).sha256 = origLlama;
      (MODEL_MANIFEST['qwen2.5-1.5b'] as { sha256: string }).sha256 = origQwen;
    }
  });

  test('SHA-256 mismatch: throws and deletes the bad file', async () => {
    seedSentinelAbsent();
    FileSystemMock.makeDirectoryAsync.mockResolvedValueOnce(undefined);
    const wrongBytes = new Uint8Array([1, 2, 3, 4, 5]);
    FileSystemMock.__setFileBytes(localFilePath(STT_ASSET.localPath), wrongBytes);
    FileSystemMock.__setDownloadPlan({ status: 200, bytesTotal: wrongBytes.byteLength });

    FileSystemMock.createDownloadResumable.mockImplementation(() => ({
      downloadAsync: jest.fn().mockImplementation(async () => {
        const tmpPath = `${localFilePath(STT_ASSET.localPath)}.partial`;
        FileSystemMock.__setFileBytes(tmpPath, wrongBytes);
        return { uri: localFilePath(STT_ASSET.localPath), status: 200 };
      }),
      cancelAsync: jest.fn().mockResolvedValue(undefined),
      savable: true,
      url: 'mock',
      fileUri: 'mock',
    }));

    await expect(ensureModelsInstalled()).rejects.toThrow(/Hash mismatch/);
    expect(FileSystemMock.deleteAsync).toHaveBeenCalledWith(
      localFilePath(STT_ASSET.localPath),
      expect.objectContaining({ idempotent: true }),
    );
    expect(getLastDownloadError()).toMatch(/Hash mismatch/);
  });

  test('SHA-256 ok on existing file: skip-and-verify, no download for that file', async () => {
    seedSentinelAbsent();
    FileSystemMock.makeDirectoryAsync.mockResolvedValueOnce(undefined);
    // Stage the STT file with bytes that DO match the manifest's
    // expected SHA-256. The downloader hashes them via the File API,
    // finds a match, and skips the download for this entry.
    const n = 64;
    const staged = stagedBytes(STT_ASSET.localPath, n);
    FileSystemMock.__setFileBytes(localFilePath(STT_ASSET.localPath), staged.bytes);
    const originalSttSha = STT_ASSET.sha256;
    (STT_ASSET as { sha256: string }).sha256 = staged.sha256;
    try {
      // STT exists locally → skipped. Sentinel absent → makeDirectory.
      // The 2 other files don't exist locally → downloaded.
      FileSystemMock.getInfoAsync.mockImplementation((path: string) => {
        if (path === MODELS_DOWNLOADED_SENTINEL) {
          return Promise.resolve({ exists: false, isDirectory: false });
        }
        if (path === localFilePath(STT_ASSET.localPath)) {
          return Promise.resolve({ exists: true, isDirectory: false });
        }
        return Promise.resolve({ exists: false, isDirectory: false });
      });
      // Pre-stage .partial bytes for the 2 downloads + mutate manifest
      // sha256 fields so verification passes.
      const stagedLlama = stagedBytes(MODEL_MANIFEST['llama-3.2-1b'].localPath, 16);
      const stagedQwen = stagedBytes(MODEL_MANIFEST['qwen2.5-1.5b'].localPath, 16);
      FileSystemMock.__setFileBytes(
        `${localFilePath(MODEL_MANIFEST['llama-3.2-1b'].localPath)}.partial`,
        stagedLlama.bytes,
      );
      FileSystemMock.__setFileBytes(
        `${localFilePath(MODEL_MANIFEST['qwen2.5-1.5b'].localPath)}.partial`,
        stagedQwen.bytes,
      );
      const originalLlamaSha = MODEL_MANIFEST['llama-3.2-1b'].sha256;
      const originalQwenSha = MODEL_MANIFEST['qwen2.5-1.5b'].sha256;
      (MODEL_MANIFEST['llama-3.2-1b'] as { sha256: string }).sha256 = stagedLlama.sha256;
      (MODEL_MANIFEST['qwen2.5-1.5b'] as { sha256: string }).sha256 = stagedQwen.sha256;
      try {
        FileSystemMock.__setDownloadPlan({ status: 200 });

        await ensureModelsInstalled();
        // Exactly 2 downloads (STT skipped, llama + qwen pulled).
        expect(FileSystemMock.createDownloadResumable).toHaveBeenCalledTimes(2);
        expect(FileSystemMock.writeAsStringAsync).toHaveBeenCalledWith(
          MODELS_DOWNLOADED_SENTINEL,
          '',
          expect.objectContaining({ encoding: 'utf8' }),
        );
      } finally {
        (MODEL_MANIFEST['llama-3.2-1b'] as { sha256: string }).sha256 = originalLlamaSha;
        (MODEL_MANIFEST['qwen2.5-1.5b'] as { sha256: string }).sha256 = originalQwenSha;
      }
    } finally {
      (STT_ASSET as { sha256: string }).sha256 = originalSttSha;
    }
  });

  test('AbortSignal: pre-aborted signal rejects with an AbortError', async () => {
    seedSentinelAbsent();
    const controller = new AbortController();
    controller.abort();
    await expect(ensureModelsInstalled(undefined, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(FileSystemMock.createDownloadResumable).not.toHaveBeenCalled();
  });
});

describe('modelDownloader.getModelsDownloaded + resetDownloadedFlag', () => {
  test('getModelsDownloaded returns true when sentinel exists', async () => {
    FileSystemMock.getInfoAsync.mockResolvedValueOnce({
      exists: true,
      isDirectory: false,
    });
    await expect(getModelsDownloaded()).resolves.toBe(true);
  });

  test('getModelsDownloaded returns false when sentinel is missing', async () => {
    FileSystemMock.getInfoAsync.mockResolvedValueOnce({
      exists: false,
      isDirectory: false,
    });
    await expect(getModelsDownloaded()).resolves.toBe(false);
  });

  test('resetDownloadedFlag deletes the sentinel + every model file', async () => {
    await resetDownloadedFlag();
    const deleted = FileSystemMock.deleteAsync.mock.calls.map((c) => c[0]);
    expect(deleted).toContain(MODELS_DOWNLOADED_SENTINEL);
    expect(deleted).toContain(localFilePath(STT_ASSET.localPath));
    expect(deleted).toContain(localFilePath(MODEL_MANIFEST['llama-3.2-1b'].localPath));
    expect(deleted).toContain(localFilePath(MODEL_MANIFEST['qwen2.5-1.5b'].localPath));
  });
});

describe('modelDownloader constants', () => {
  test('MODELS_DIR_DOWNLOAD ends with a slash', () => {
    expect(MODELS_DIR_DOWNLOAD.endsWith('/')).toBe(true);
  });
  test('MODELS_DIR is MODELS_DIR_DOWNLOAD + "models/"', () => {
    expect(MODELS_DIR).toBe(`${MODELS_DIR_DOWNLOAD}models/`);
  });
});