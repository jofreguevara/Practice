/**
 * Tests for app/config/modelManifest.ts (Task 2.3 + Task 2.4 + Task 2.5).
 *
 * Covers Jest ids from tasks.md 2.3 + the SHA-256 hash coupling from 2.4/2.5:
 *   - modelManifest.three_entries_present
 *   - modelManifest.each_entry_has_path_and_license
 *   - modelManifest.getModelEntry_known_returns_entry
 *   - modelManifest.getModelEntry_unknown_returns_null
 *   - modelManifest.listModelVariants_returns_three
 *   - modelManifest.listModelVariants_order_matches_resolution
 *   - modelManifest.stt_asset_present
 *   - modelManifest.sha256_matches_SHA256SUMS
 *   - modelManifest.sha256_manifest_matches_actual_files
 */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import {
  MODEL_MANIFEST,
  STT_ASSET,
  getModelEntry,
  listModelVariants,
  type ModelVariant,
} from '../modelManifest';

const KNOWN_VARIANTS: ModelVariant[] = ['llama-3.2-1b', 'qwen2.5-1.5b', 'stub'];

describe('modelManifest.MODEL_MANIFEST', () => {
  test('three_entries_present', () => {
    expect(Object.keys(MODEL_MANIFEST).sort()).toEqual(
      ['llama-3.2-1b', 'qwen2.5-1.5b', 'stub'].sort(),
    );
  });

  test.each(KNOWN_VARIANTS)('each_entry_has_path_and_license (%s)', (variant) => {
    const entry = MODEL_MANIFEST[variant];
    expect(entry.variant).toBe(variant);
    expect(entry.label.length).toBeGreaterThan(0);
    expect(entry.license.length).toBeGreaterThan(0);
    expect(entry.licenseName.length).toBeGreaterThan(0);
    expect(entry.description.length).toBeGreaterThan(0);
    expect(entry.sizeMB).toBeGreaterThanOrEqual(0);
    // stub has no asset path; others must point at a non-empty relative path.
    if (variant !== 'stub') {
      expect(entry.path.length).toBeGreaterThan(0);
      expect(entry.path.startsWith('assets/models/')).toBe(true);
      // Real GGUF / ggml binaries carry a 64-hex sha256 in the manifest.
      expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe('modelManifest.getModelEntry', () => {
  test('getModelEntry_known_returns_entry', () => {
    expect(getModelEntry('llama-3.2-1b')?.label).toBe('Llama 3.2 1B Instruct Q4_K_M');
    expect(getModelEntry('qwen2.5-1.5b')?.label).toBe('Qwen2.5 1.5B Instruct Q4_K_M');
    expect(getModelEntry('stub')?.label).toBe('Stub (low-memory mode)');
  });

  test('getModelEntry_unknown_returns_null', () => {
    const unknown = 'not-a-variant' as unknown as ModelVariant;
    expect(getModelEntry(unknown)).toBeNull();
  });
});

describe('modelManifest.listModelVariants', () => {
  test('listModelVariants_returns_three', () => {
    expect(listModelVariants()).toHaveLength(3);
  });

  test('listModelVariants_order_matches_resolution', () => {
    const order = listModelVariants().map((e) => e.variant);
    expect(order).toEqual(['llama-3.2-1b', 'qwen2.5-1.5b', 'stub']);
  });
});

describe('modelManifest.STT_ASSET', () => {
  test('stt_asset_present', () => {
    expect(STT_ASSET.path).toBe('assets/models/stt/ggml-tiny.bin');
    expect(STT_ASSET.license).toBe('MIT');
    expect(STT_ASSET.sizeMB).toBeGreaterThan(0);
    expect(STT_ASSET.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('modelManifest SHA-256 wiring (Task 2.4 + 2.5)', () => {
  // End-to-end verification reads ~2 GB of bundled binaries into memory
  // and takes ~10s. Off by default; opt-in via `RUN_LFS_HASH_CHECK=1`
  // (e.g. CI smoke after `git lfs pull`). The default skip also covers
  // fresh clones where the LFS files are still pointer stubs.
  const runLfsCheck = process.env.RUN_LFS_HASH_CHECK === '1';
  const skipLfsCheck = !runLfsCheck;

  function sha256OfFile(absPath: string): string {
    const buf = readFileSync(absPath);
    return createHash('sha256').update(buf).digest('hex');
  }

  test('sha256_manifest_matches_actual_files', () => {
    if (skipLfsCheck) return;
    const repoRoot = resolve(__dirname, '../../..');
    const cases: { path: string; expected: string }[] = [
      {
        path: resolve(repoRoot, STT_ASSET.path),
        expected: STT_ASSET.sha256,
      },
      {
        path: resolve(repoRoot, MODEL_MANIFEST['llama-3.2-1b'].path),
        expected: MODEL_MANIFEST['llama-3.2-1b'].sha256,
      },
      {
        path: resolve(repoRoot, MODEL_MANIFEST['qwen2.5-1.5b'].path),
        expected: MODEL_MANIFEST['qwen2.5-1.5b'].sha256,
      },
    ];
    for (const c of cases) {
      const actual = sha256OfFile(c.path);
      expect(actual).toBe(c.expected);
    }
  });

  test('sha256_matches_SHA256SUMS', () => {
    if (skipLfsCheck) return;
    const repoRoot = resolve(__dirname, '../../..');
    const sumsPath = resolve(repoRoot, 'assets/models/SHA256SUMS');
    const sumsContent = readFileSync(sumsPath, 'utf8');
    // Extract non-comment, non-empty lines and parse `<hash>  <path>`.
    const lines = sumsContent
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    expect(lines.length).toBe(3);
    for (const line of lines) {
      const match = /^([0-9a-f]{64})\s+(\S.*)$/.exec(line);
      expect(match).not.toBeNull();
      const hash = match![1]!;
      const relPath = match![2]!;
      const actual = sha256OfFile(resolve(repoRoot, 'assets/models', relPath));
      expect(actual).toBe(hash);
    }
  });
});