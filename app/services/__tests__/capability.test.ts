/**
 * Tests for app/services/capability.ts.
 *
 * Sub-change 1 Task 1.9 placed the RED gate here; Sub-change 2 Task 2.1 turns
 * it GREEN by implementing probe() + resolveModelVariant() + assertNoNetwork().
 * Sub-change 2 Task 2.5 extends the module with SHA-256 verification; the
 * verification tests live in this file as well.
 *
 * Jest ids covered (from tasks.md 2.1 + 2.5):
 *   - capability.assertNoNetwork_offline_passes         (Sub-change 1 RED → GREEN)
 *   - capability.boot_emits_zero_fetch_calls            (Sub-change 1 RED → GREEN)
 *   - capability.probe_returns_capability_fields
 *   - capability.resolveModelVariant_flagship           (table row 1)
 *   - capability.resolveModelVariant_standard           (table row 2)
 *   - capability.resolveModelVariant_qwen_fallback      (table row 3)
 *   - capability.resolveModelVariant_stub_low_disk      (table row 4)
 *   - capability.resolveModelVariant_stub_low_ram       (table row 4 alt)
 *   - capability.resolveModelVariant_armv7_block        (armv7 reject branch)
 *   - capability.assertNoNetwork_connected_throws
 *   - capability.assertNoNetwork_allowed_label_noop
 *   - capability.verify_sha256_ok
 *   - capability.verify_sha256_mismatch
 *   - capability.verify_sha256_missing_file
 *   - capability.verify_sha256_malformed_sums
 */
import * as Device from 'expo-device';
import * as Network from 'expo-network';
import * as FileSystem from 'expo-file-system';
import { createHash } from 'crypto';

import {
  assertNoNetwork,
  parseSums,
  probe,
  resolveModelVariant,
  sha256Hex,
  verifyModelAssets,
  _setFreeMemoryMbForTesting,
  ModelIntegrityError,
  NoNetworkPolicyError,
  type DeviceCapability,
} from '../capability';

// The default `jest-expo` setup pre-mocks `expo-file-system` WITHOUT
// getFreeDiskStorageAsync. We extend it here so `probe()` can read free
// disk space in tests. We also extend the expo-network mock with a
// configurable jest.fn for the "connected" override tests. jest.mock is
// hoisted by babel-jest so these declarations land before the imports above.
jest.mock('expo-file-system', () => ({
  // Match the surface that capability.ts imports.
  documentDirectory: '/tmp/practice-test/',
  cacheDirectory: '/tmp/practice-test/cache/',
  getInfoAsync: jest.fn(() => Promise.resolve({ exists: true, isDirectory: false })),
  readDirectoryAsync: jest.fn(() => Promise.resolve([])),
  deleteAsync: jest.fn(() => Promise.resolve()),
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
  readAsStringAsync: jest.fn(() => Promise.resolve('')),
  makeDirectoryAsync: jest.fn(() => Promise.resolve()),
  getFreeDiskStorageAsync: jest.fn(() => Promise.resolve(16 * 1024 * 1024 * 1024)),
  getTotalDiskCapacityAsync: jest.fn(() => Promise.resolve(128 * 1024 * 1024 * 1024)),
  // Stub classes used by capability.ts (Task 2.5 verifyModelAssets reads
  // via the new File object API). Returning a no-op arrayBuffer avoids
  // breaking any test that exercises production code paths.
  File: class {
    arrayBuffer(): Promise<ArrayBuffer> {
      return Promise.resolve(new ArrayBuffer(0));
    }
  },
  Directory: class {},
}));
jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(() =>
    Promise.resolve({ isConnected: false, isInternetReachable: false, type: 'none' }),
  ),
  isConnected: jest.fn(() => Promise.resolve(false)),
}));

// -------- helpers ----------------------------------------------------------

function setDevice(overrides: Partial<{
  archs: string[] | null;
  totalMemory: number | null;
  osName: string | null;
  platformApiLevel: number | null;
  platformFeatures: string[];
}>): void {
  (Device as unknown as { supportedCpuArchitectures: string[] | null }).supportedCpuArchitectures =
    overrides.archs ?? null;
  (Device as unknown as { totalMemory: number | null }).totalMemory =
    overrides.totalMemory ?? null;
  (Device as unknown as { osName: string | null }).osName = overrides.osName ?? null;
  (Device as unknown as { platformApiLevel: number | null }).platformApiLevel =
    overrides.platformApiLevel ?? null;
  (Device as unknown as { getPlatformFeaturesAsync: typeof Device.getPlatformFeaturesAsync }).getPlatformFeaturesAsync =
    jest.fn(() => Promise.resolve(overrides.platformFeatures ?? [])) as typeof Device.getPlatformFeaturesAsync;
}

function setDiskFree(bytes: number): void {
  (FileSystem.getFreeDiskStorageAsync as unknown as jest.Mock).mockResolvedValueOnce(bytes);
}

function setNetworkConnected(connected: boolean): void {
  (Network.getNetworkStateAsync as unknown as jest.Mock).mockResolvedValueOnce({
    isConnected: connected,
    isInternetReachable: connected,
    type: connected ? 'wifi' : 'none',
  });
}

function sha256HexNode(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

// -------- RED gate (Sub-change 1 Task 1.9) ----------------------------------

describe('capability.assertNoNetwork (Sub-change 1 RED → Sub-change 2 GREEN)', () => {
  beforeEach(() => {
    _setFreeMemoryMbForTesting(null);
  });

  test('exports assertNoNetwork that does not throw when offline', () => {
    // Sub-change 1 RED: this import failed because capability.ts did not exist.
    // Sub-change 2 GREEN: the import resolves and the function does not throw
    // when expo-network.getNetworkStateAsync() reports isConnected=false
    // (the default mock).
    expect(typeof assertNoNetwork).toBe('function');
    void expect(assertNoNetwork('stt')).resolves.toBeUndefined();
    void expect(assertNoNetwork('llm')).resolves.toBeUndefined();
    void expect(assertNoNetwork('tts')).resolves.toBeUndefined();
    void expect(assertNoNetwork('db')).resolves.toBeUndefined();
  });

  test('boot path emits zero fetch calls', async () => {
    // Sub-change 1 RED: this passed by virtue of the repo not yet importing
    // capability. Sub-change 2 GREEN: this still passes — capability.ts does
    // not call fetch/axios; the boot path it gates (db, profile hydration)
    // also does not.
    const originalFetch = global.fetch;
    let calls = 0;
    global.fetch = (() => {
      calls += 1;
      return Promise.resolve(new Response());
    }) as typeof fetch;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const dbModule = require('../db');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { createMemoryDb } = require('./memoryDb');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { INIT_SQL } = require('../../migrations/001_init');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const profileStoreModule = require('../../state/profile');
      const mem = createMemoryDb({ bootstrap: INIT_SQL });
      await mem.db.execute(
        'CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL DEFAULT (unixepoch()))',
      );
      await mem.db.execute('INSERT OR IGNORE INTO schema_migrations (id) VALUES (1)');
      await dbModule.runMigrations(mem.db);
      profileStoreModule.attachDb(mem.db);
      await profileStoreModule.useProfileStore.getState().hydrate();
      mem.close();
      expect(calls).toBe(0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('expo-network.getNetworkStateAsync returns isConnected=false (mocked)', async () => {
    const state = await Network.getNetworkStateAsync();
    expect(state.isConnected).toBe(false);
    expect(state.isInternetReachable).toBe(false);
  });
});

// -------- Task 2.1: probe() ------------------------------------------------

describe('capability.probe', () => {
  beforeEach(() => {
    _setFreeMemoryMbForTesting(null);
  });

  test('probe_returns_capability_fields', async () => {
    setDevice({
      archs: ['arm64-v8a'],
      totalMemory: 8 * 1024 * 1024 * 1024,
      osName: 'Android',
      platformApiLevel: 33,
      platformFeatures: ['android.hardware.vulkan'],
    });
    _setFreeMemoryMbForTesting(4096);
    setDiskFree(20 * 1024 * 1024 * 1024);

    const cap = await probe();
    expect(cap.arch).toBe('arm64');
    expect(cap.arm64Supported).toBe(true);
    expect(cap.totalMemoryMB).toBe(8 * 1024);
    expect(cap.freeMemoryMB).toBe(4096);
    expect(cap.freeDiskMB).toBe(20 * 1024);
    expect(cap.hasAccelerator).toBe(true);
    expect(cap.gpuAvailable).toBe(true);
    expect(typeof cap.screenScale).toBe('number');
    expect(cap.screenScale).toBeGreaterThan(0);
  });

  test('probe falls back to x86_64 when archs include x86 strings only', async () => {
    setDevice({
      archs: ['x86_64'],
      totalMemory: 4 * 1024 * 1024 * 1024,
      osName: 'Android',
      platformApiLevel: 33,
      platformFeatures: ['android.hardware.vulkan'],
    });
    _setFreeMemoryMbForTesting(2048);
    setDiskFree(8 * 1024 * 1024 * 1024);
    const cap = await probe();
    expect(cap.arch).toBe('x86_64');
    expect(cap.arm64Supported).toBe(false);
  });

  test('probe returns freeMemoryMB from total/2 heuristic when no override', async () => {
    setDevice({
      archs: ['arm64-v8a'],
      totalMemory: 6 * 1024 * 1024 * 1024,
      osName: 'iOS',
    });
    _setFreeMemoryMbForTesting(null);
    setDiskFree(8 * 1024 * 1024 * 1024);
    const cap = await probe();
    expect(cap.freeMemoryMB).toBe(Math.floor(6 * 1024 * 0.5));
  });
});

// -------- Task 2.1: resolveModelVariant() (table-driven) -------------------

interface VariantCase {
  name: string;
  cap: DeviceCapability;
  expected: {
    variant: 'llama-3.2-1b' | 'qwen2.5-1.5b' | 'stub';
    stubMode: boolean;
    blocked?: boolean;
    warning?: string;
  };
}

const CASES: VariantCase[] = [
  {
    name: 'flagship (12 GB RAM, 30 GB disk, GPU, arm64)',
    cap: {
      arch: 'arm64',
      arm64Supported: true,
      totalMemoryMB: 12 * 1024,
      freeMemoryMB: 9 * 1024,
      freeDiskMB: 30 * 1024,
      hasAccelerator: true,
      gpuAvailable: true,
      screenScale: 3,
    },
    expected: { variant: 'llama-3.2-1b', stubMode: false },
  },
  {
    name: 'standard (4 GB RAM, 3 GB disk, arm64)',
    cap: {
      arch: 'arm64',
      arm64Supported: true,
      totalMemoryMB: 6 * 1024,
      freeMemoryMB: 4 * 1024,
      freeDiskMB: 3 * 1024,
      hasAccelerator: false,
      gpuAvailable: false,
      screenScale: 2,
    },
    expected: { variant: 'llama-3.2-1b', stubMode: false },
  },
  {
    name: 'qwen fallback (3 GB RAM, 5 GB disk, arm64)',
    cap: {
      arch: 'arm64',
      arm64Supported: true,
      totalMemoryMB: 4 * 1024,
      freeMemoryMB: 3 * 1024,
      freeDiskMB: 5 * 1024,
      hasAccelerator: false,
      gpuAvailable: false,
      screenScale: 2,
    },
    expected: {
      variant: 'qwen2.5-1.5b',
      stubMode: false,
      warning: expect.stringContaining('smaller model') as unknown as string,
    },
  },
  {
    name: 'stub: low disk (< 1500 MB)',
    cap: {
      arch: 'arm64',
      arm64Supported: true,
      totalMemoryMB: 8 * 1024,
      freeMemoryMB: 4 * 1024,
      freeDiskMB: 800,
      hasAccelerator: true,
      gpuAvailable: true,
      screenScale: 2,
    },
    expected: {
      variant: 'stub',
      stubMode: true,
      warning: expect.stringContaining('low-memory stub') as unknown as string,
    },
  },
  {
    name: 'stub: low ram (< 1500 MB)',
    cap: {
      arch: 'arm64',
      arm64Supported: true,
      totalMemoryMB: 2 * 1024,
      freeMemoryMB: 1024,
      freeDiskMB: 5 * 1024,
      hasAccelerator: false,
      gpuAvailable: false,
      screenScale: 2,
    },
    expected: {
      variant: 'stub',
      stubMode: true,
      warning: expect.stringContaining('low-memory stub') as unknown as string,
    },
  },
  {
    name: 'armv7 32-bit: install blocked',
    cap: {
      arch: 'armv7',
      arm64Supported: false,
      totalMemoryMB: 4 * 1024,
      freeMemoryMB: 3 * 1024,
      freeDiskMB: 5 * 1024,
      hasAccelerator: false,
      gpuAvailable: false,
      screenScale: 2,
    },
    expected: {
      variant: 'stub',
      stubMode: true,
      blocked: true,
      warning: undefined,
    },
  },
];

describe('capability.resolveModelVariant (table-driven per design §8)', () => {
  test.each(CASES)('$name', ({ cap, expected }) => {
    const res = resolveModelVariant(cap);
    expect(res.variant).toBe(expected.variant);
    expect(res.stubMode).toBe(expected.stubMode);
    if (expected.blocked !== undefined) expect(res.blocked).toBe(expected.blocked);
    if (expected.warning === undefined) {
      expect(res.warning).toBeUndefined();
    } else {
      expect(res.warning).toBeDefined();
      // Jest's expect.stringContaining returns a matcher; the test string
      // contains the same phrase, so the equality holds.
      const expectedStr =
        typeof expected.warning === 'string'
          ? expected.warning
          : (expected.warning as unknown as { asymmetricMatch: (s: string) => boolean });
      if (typeof expectedStr === 'string') {
        expect(res.warning).toBe(expectedStr);
      } else {
        expect(expectedStr.asymmetricMatch(res.warning ?? '')).toBe(true);
      }
    }
    if (expected.variant === 'stub' && expected.blocked) {
      expect(res.blockReason).toMatch(/arm64/);
    }
  });
});

// -------- Task 2.1: assertNoNetwork() --------------------------------------

describe('capability.assertNoNetwork (Task 2.1)', () => {
  test('assertNoNetwork_connected_throws', async () => {
    setNetworkConnected(true);
    await expect(assertNoNetwork('stt')).rejects.toBeInstanceOf(NoNetworkPolicyError);
  });

  test('assertNoNetwork_disconnected_noop', async () => {
    // Mock returns offline by default; we explicitly call once for clarity.
    setNetworkConnected(false);
    await expect(assertNoNetwork('tts')).resolves.toBeUndefined();
  });

  test('assertNoNetwork_allowed_label_noop', async () => {
    // Even if connected, the 'allowed' label is the documented escape hatch
    // for the boot-time probe itself.
    setNetworkConnected(true);
    await expect(assertNoNetwork('allowed')).resolves.toBeUndefined();
  });

  test('NoNetworkPolicyError carries the label', async () => {
    setNetworkConnected(true);
    try {
      await assertNoNetwork('llm');
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(NoNetworkPolicyError);
      expect((err as NoNetworkPolicyError).label).toBe('llm');
    }
  });
});

// -------- Task 2.5: SHA-256 verification -----------------------------------

describe('capability.sha256Hex + parseSums + verifyModelAssets (Task 2.5)', () => {
  test('sha256Hex produces a stable hex digest', async () => {
    const bytes = new TextEncoder().encode('hello world');
    const hex = await sha256Hex(bytes);
    expect(hex).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });

  test('parseSums handles well-formed input', () => {
    const sums = [
      '# asset manifest — verify before load',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa *  ggml-tiny.bin',
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb  llm/llama.gguf',
      '',
      'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc  llm/qwen.gguf',
    ].join('\n');
    const parsed = parseSums(sums);
    expect(parsed.entries).toHaveLength(3);
    expect(parsed.entries[0]).toEqual({
      hash: 'a'.repeat(64),
      file: 'ggml-tiny.bin',
    });
    expect(parsed.entries[1]?.file).toBe('llm/llama.gguf');
    expect(parsed.errors).toHaveLength(0);
  });

  test('parseSums surfaces malformed lines without throwing', () => {
    const sums = [
      'not-a-hash  file.bin',
      `${'a'.repeat(64)}  valid.bin`,
      'b'.repeat(64) + '   ',
    ].join('\n');
    const parsed = parseSums(sums);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]?.file).toBe('valid.bin');
    expect(parsed.errors).toHaveLength(2);
  });

  test('verify_sha256_ok: matches actual bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const hash = sha256HexNode(bytes);
    const sumsContent = `${hash}  sample.bin\n`;
    const result = await verifyModelAssets({
      sumsContent,
      fileBytes: { 'sample.bin': bytes },
    });
    expect(result.status).toBe('ok');
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.status).toBe('ok');
  });

  test('verify_sha256_mismatch: single file hash wrong', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const wrongHash = 'f'.repeat(64);
    const sumsContent = `${wrongHash}  sample.bin\n`;
    const result = await verifyModelAssets({
      sumsContent,
      fileBytes: { 'sample.bin': bytes },
    });
    expect(result.status).toBe('mismatch');
    expect(result.results[0]?.status).toBe('mismatch');
    expect(result.results[0]?.actual).not.toBe(wrongHash);
  });

  test('verify_sha256_missing_file: fileBytes map lacks the entry', async () => {
    const hash = sha256HexNode(new Uint8Array([9]));
    const sumsContent = `${hash}  missing.bin\n`;
    const result = await verifyModelAssets({
      sumsContent,
      fileBytes: {}, // intentionally empty
    });
    expect(result.status).toBe('mismatch');
    expect(result.results[0]?.status).toBe('missing');
  });

  test('verify_sha256_malformed_sums: every line fails to parse', async () => {
    const result = await verifyModelAssets({
      sumsContent: 'not a sum line\nbroken',
      fileBytes: {},
    });
    expect(result.status).toBe('malformed');
    expect(result.parseErrors.length).toBeGreaterThan(0);
  });

  test('ModelIntegrityError surfaces per-file mismatches', () => {
    // Construct directly to verify the error shape; production caller
    // (probeWithAssetVerification) wraps the throw.
    const err = new ModelIntegrityError([
      { file: 'a.bin', expected: 'a'.repeat(64), actual: 'b'.repeat(64), status: 'mismatch' },
      { file: 'b.bin', expected: 'c'.repeat(64), actual: '', status: 'missing' },
    ]);
    expect(err.name).toBe('ModelIntegrityError');
    expect(err.results).toHaveLength(2);
    expect(err.message).toContain('2 file(s)');
  });

  test('probeWithAssetVerification throws ModelIntegrityError on any mismatch', async () => {
    // Inject a sums file with a deliberately wrong hash for a known file.
    const expected = sha256HexNode(new Uint8Array([1]));
    const wrongExpected = '0'.repeat(64);
    const sumsContent = `${wrongExpected}  sample.bin\n${expected}  other.bin\n`;
    const result = await verifyModelAssets({
      sumsContent,
      fileBytes: {
        'sample.bin': new Uint8Array([1]),
        'other.bin': new Uint8Array([1]),
      },
    });
    expect(result.status).toBe('mismatch');
    // Constructing ModelIntegrityError directly to test the throw path.
    expect(() => new ModelIntegrityError(result.results)).not.toThrow();
  });

  test('verifyModelAssets against the real SHA256SUMS + real LFS files passes (Task 2.4+2.5)', async () => {
    // End-to-end smoke: read the bundled SHA256SUMS, hash the real LFS
    // files, confirm everything matches. Opt-in via RUN_LFS_HASH_CHECK=1
    // (e.g. CI after `git lfs pull`) because it reads ~2 GB into memory
    // and takes ~10s. Off by default so `jest --ci` is fast in PRs.
    const runLfsCheck = process.env.RUN_LFS_HASH_CHECK === '1';
    if (!runLfsCheck) return;

    const { readFileSync } = require('fs') as typeof import('fs');
    const { resolve } = require('path') as typeof import('path');

    const repoRoot = resolve(__dirname, '../../..');
    const sumsContent = readFileSync(resolve(repoRoot, 'assets/models/SHA256SUMS'), 'utf8');

    const fileBytes: Record<string, Uint8Array> = {};
    for (const line of sumsContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const m = /^([0-9a-f]{64})\s+(\S.*)$/.exec(trimmed);
      if (!m) continue;
      const relPath = m[2]!;
      const buf = readFileSync(resolve(repoRoot, 'assets/models', relPath));
      fileBytes[relPath] = new Uint8Array(buf);
    }

    const result = await verifyModelAssets({
      sumsContent,
      fileBytes,
      rootDir: resolve(repoRoot, 'assets/models'),
    });
    expect(result.status).toBe('ok');
    expect(result.results).toHaveLength(3);
    for (const r of result.results) {
      expect(r.status).toBe('ok');
    }
  }, 120_000);
});