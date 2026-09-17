/**
 * app/config/modelManifest.ts
 *
 * Typed variant registry — maps each `ModelVariant` to its bundled asset
 * path, expected SHA-256, and license citation. Consumed by:
 *   - `capability.verifyModelAssets` (Task 2.5) to look up the expected
 *     hash for the variant the probe selected.
 *   - Settings → Models screen (chat-mvp Task 3.4) to render the
 *     available variants with their footprint + license.
 *   - `modelDownloader.ensureModelsInstalled` to know which binaries to
 *     pull from GitHub Releases on first launch, where to land them in
 *     the document directory, and the SHA-256 to verify against.
 *
 * Why a static manifest instead of reading from disk: the SUMS file is
 * the runtime authority, but the variant → URL/path mapping is a
 * build-time decision (the directory layout under `documentDirectory/`
 * is fixed). Hard-coding here keeps the manifest small, typesafe, and
 * easy to lint.
 *
 * Source of truth: design §2 (folder structure) + §11 (model-assets
 * sub-change scope) + download-on-first-launch §X. License citations
 * are documented in `assets/models/LICENSE.md` (Task 2.4).
 */

import type { ModelVariant } from '../services/capability';
// Re-export so consumers can import both the manifest and the variant type
// from a single location.
export type { ModelVariant } from '../services/capability';

/** Release tag the binaries are published under on GitHub Releases. */
export const MODEL_RELEASE_TAG = 'v1-models';
/** Repo owner/name the binaries are published from. */
export const MODEL_RELEASE_REPO = 'jofreguevara/Practice';
/** Base URL for model binary downloads — terminated with a slash. */
export const MODEL_RELEASE_BASE_URL = `https://github.com/${MODEL_RELEASE_REPO}/releases/download/${MODEL_RELEASE_TAG}/`;

export type ModelLicense =
  | 'MIT'
  | 'Apache-2.0'
  | 'Llama-3.2-Community'
  | 'CC0-1.0';

export interface ModelEntry {
  variant: ModelVariant;
  /** Variant display label for Settings UI. */
  label: string;
  /**
   * Bundle path relative to the app root, e.g. `assets/models/stt/...`.
   * Used by tooling + the LFS-hash-check smoke test (Task 2.5) to find
   * the on-disk bytes when present; runtime services use `localPath`.
   */
  path: string;
  /**
   * Relative path inside `FileSystem.documentDirectory` where the binary
   * lands after `modelDownloader` finishes downloading it. Includes the
   * leading `models/` prefix because documentDirectory does not.
   * Empty string for the stub variant.
   */
  localPath: string;
  /**
   * Remote URL the binary is downloaded from on first launch. Composed
   * via `MODEL_RELEASE_BASE_URL` + filename so all three binaries share
   * a single release tag. Empty string for the stub variant.
   */
  remoteUrl: string;
  /** Approximate footprint on disk, in MB. Shown in the Models screen. */
  sizeMB: number;
  /** Short description for the Settings → Models screen. */
  description: string;
  /**
   * Expected SHA-256 of the file at `localPath`, lowercase hex. Verified
   * at first launch by `capability.verifyModelAssets`. Empty string when
   * the asset is not part of the bundle (e.g. the stub variant).
   */
  sha256: string;
  /** SPDX-style license id used by the attribution screen. */
  license: ModelLicense;
  /** Human-readable license name. */
  licenseName: string;
  /** Upstream mirror URL — kept for attribution, not used by the downloader. */
  sourceUrl: string;
}

/**
 * The canonical three-entry manifest. Order matches the resolution
 * preference in `capability.resolveModelVariant`:
 *   - llama-3.2-1b   (primary, ~870 MB)
 *   - qwen2.5-1.5b   (fallback, ~1.1 GB)
 *   - stub           (no asset — curated responses only)
 */
export const MODEL_MANIFEST: Readonly<Record<ModelVariant, ModelEntry>> = {
  'llama-3.2-1b': {
    variant: 'llama-3.2-1b',
    label: 'Llama 3.2 1B Instruct Q4_K_M',
    // `path` still points at the bundled copy (still on disk in the working
    // tree even after `git rm --cached`; needed by the SHA256SUMS smoke test
    // and any tooling that inspects the source tree).
    path: 'assets/models/llm/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    // `localPath` is where the downloader lands the file at runtime.
    localPath: 'models/llm/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    remoteUrl: `${MODEL_RELEASE_BASE_URL}Llama-3.2-1B-Instruct-Q4_K_M.gguf`,
    sizeMB: 807,
    description:
      'Primary model. Coherent multi-turn dialogue with persona prompts; fits on 4 GB+ Android devices with OS overhead.',
    // SHA-256 from assets/models/SHA256SUMS (canonical hash). Verified at
    // first launch by `capability.verifyModelAssets`.
    sha256: 'f7ede42862ceca07ad1c88a97b67520019c4ac7e5ced250d2e696fa62ab189af',
    license: 'Llama-3.2-Community',
    licenseName: 'Llama 3.2 Community License',
    sourceUrl:
      'https://huggingface.co/lmstudio-community/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
  },
  'qwen2.5-1.5b': {
    variant: 'qwen2.5-1.5b',
    label: 'Qwen2.5 1.5B Instruct Q4_K_M',
    path: 'assets/models/llm/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
    localPath: 'models/llm/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
    remoteUrl: `${MODEL_RELEASE_BASE_URL}Qwen2.5-1.5B-Instruct-Q4_K_M.gguf`,
    sizeMB: 1117,
    description:
      'Fallback model. Stronger Spanish; slightly heavier than Llama 1B. Picked automatically on devices with <4 GB free RAM.',
    sha256: '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e',
    license: 'Apache-2.0',
    licenseName: 'Apache License 2.0',
    sourceUrl:
      'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
  },
  stub: {
    variant: 'stub',
    label: 'Stub (low-memory mode)',
    // No bundled asset — stub mode reads from app/services/stubResponses.ts.
    path: '',
    localPath: '',
    remoteUrl: '',
    sizeMB: 0,
    description:
      'No model is loaded. The conversation returns curated responses from app/services/stubResponses.ts. Triggered on devices with <1.5 GB free disk or RAM.',
    sha256: '',
    license: 'CC0-1.0',
    licenseName: 'CC0 1.0 Universal (project-original copy)',
    sourceUrl: '',
  },
};

/**
 * Looks up a manifest entry by variant. Returns `null` when the variant
 * is unknown (which should never happen — `ModelVariant` is a closed
 * union). The explicit null lets callers decide how to handle unknown
 * variants instead of throwing.
 */
export function getModelEntry(variant: ModelVariant): ModelEntry | null {
  return MODEL_MANIFEST[variant] ?? null;
}

/**
 * Iterates the manifest in resolution preference order (flagship → fallback
 * → stub). Used by Settings → Models to render the picker.
 */
export function listModelVariants(): ModelEntry[] {
  return [MODEL_MANIFEST['llama-3.2-1b'], MODEL_MANIFEST['qwen2.5-1.5b'], MODEL_MANIFEST.stub];
}

/**
 * Files outside the LLM directory also live under `documentDirectory/models/`.
 * The STT model is downloaded separately because whisper.rn reads its own
 * asset path independently from `llama.rn`. We keep the SHA-256 here so the
 * verification pass covers it.
 */
export interface AssetEntry {
  /** Path relative to app root (still useful for tooling / LFS-hash checks). */
  path: string;
  /**
   * Relative path inside `FileSystem.documentDirectory` where the
   * downloader lands the file at runtime (leading `models/` prefix).
   */
  localPath: string;
  /** Remote URL the binary is downloaded from on first launch. */
  remoteUrl: string;
  /** Approximate size, MB. */
  sizeMB: number;
  /** Expected SHA-256, lowercase hex. Empty when not yet populated. */
  sha256: string;
  /** SPDX license id. */
  license: ModelLicense;
  /** Human-readable license name. */
  licenseName: string;
  /** Upstream mirror URL — kept for attribution, not used by the downloader. */
  sourceUrl: string;
}

export const STT_ASSET: AssetEntry = {
  path: 'assets/models/stt/ggml-tiny.bin',
  localPath: 'models/stt/ggml-tiny.bin',
  remoteUrl: `${MODEL_RELEASE_BASE_URL}ggml-tiny.bin`,
  sizeMB: 78,
  sha256: 'be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21',
  license: 'MIT',
  licenseName: 'MIT License',
  sourceUrl:
    'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
};