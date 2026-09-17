/**
 * app/services/capability.ts
 *
 * On-device capability probe + NoNetworkPolicy enforcement.
 *
 * This module is the gatekeeper for the offline-only contract (design §1, §8):
 *   - `probe()` returns a `DeviceCapability` describing the host (arch, RAM,
 *     disk, accelerator). Cached in `user_profile.preferences_json.deviceProfile`
 *     after the first successful probe.
 *   - `resolveModelVariant(cap)` is a pure function over the probe result.
 *     Decision tree follows design §8: armv7 → block; disk<1.5 GB OR
 *     ram<1.5 GB → stub; ram≥8 GB AND disk≥4 GB AND gpu → llama flagship;
 *     ram≥4 GB AND disk≥3 GB → llama standard; otherwise Qwen with warning.
 *   - `assertNoNetwork(label)` is called at the entry of every service that
 *     touches native modules (stt, tts, llm, audio, db). Throws
 *     `NoNetworkPolicyError` if `expo-network` reports a connected state.
 *     Pass `label === 'allowed'` for the explicit exemption (e.g. during
 *     the boot check itself, where we DO want to read the network state).
 *
 * Also implements model-asset SHA-256 verification (Task 2.5):
 *   - `parseSums(content)` parses a `sha256sum`-format file into entries.
 *   - `sha256Hex(bytes)` computes a SHA-256 hex digest via Web Crypto API
 *     (Hermes 0.74+ has `crypto.subtle`; Node 18+ has the same; the Web
 *     Crypto interface is the standard portable path).
 *   - `verifyModelAssets(...)` reads `assets/models/SHA256SUMS` (bundled
 *     with the APK) and checks each downloaded file's hash against the
 *     entries, with file paths resolved under `MODELS_DIR_DOWNLOAD` (the
 *     device's document directory). On any mismatch, throws
 *     `ModelIntegrityError` carrying the per-file diff so the chat root
 *     can render a friendly "Model files are corrupted" screen.
 *
 * The download-on-first-launch contract: model binaries no longer live
 * inside the APK. They are downloaded once by `modelDownloader` into
 * `${MODELS_DIR_DOWNLOAD}models/` and verified against this SUMS file.
 * `MODELS_DIR_DOWNLOAD` is the document directory root — the SUMS file
 * paths include the `models/` prefix to join correctly.
 *
 * Design references: design §1 (NoNetworkPolicy), §3 (service signatures),
 * §8 (decision tree), §11 (model-assets scope); specs/capability-detection.md
 * REQ-1/REQ-2/REQ-3.
 */
import * as Device from 'expo-device';
import * as Network from 'expo-network';
import * as FileSystem from 'expo-file-system';
import { documentDirectory as legacyDocumentDirectory } from 'expo-file-system/legacy';
import { PixelRatio } from 'react-native';

/* ----------------------------- public types ------------------------------- */

export type Arch = 'arm64' | 'armv7' | 'x86_64';

export interface DeviceCapability {
  /** CPU architecture family reported by expo-device. */
  arch: Arch;
  /** Convenience flag — true iff `arch === 'arm64'`. llama.rn requires arm64-v8a. */
  arm64Supported: boolean;
  /** Total RAM installed, megabytes. From `expo-device.totalMemory`. */
  totalMemoryMB: number;
  /** Free RAM at probe time, megabytes. Heuristic on iOS (exposes 0); native on Android. */
  freeMemoryMB: number;
  /** Free disk space, megabytes. From `expo-file-system.getFreeDiskStorageAsync`. */
  freeDiskMB: number;
  /** GPU/accelerator available (Metal on iOS, OpenCL/Vulkan on Android). */
  hasAccelerator: boolean;
  /** Alias of `hasAccelerator` — matches the orchestrator's spec language. */
  gpuAvailable: boolean;
  /** `PixelRatio.get()` at probe time. */
  screenScale: number;
}

export type ModelVariant = 'llama-3.2-1b' | 'qwen2.5-1.5b' | 'stub';

export interface VariantResolution {
  variant: ModelVariant;
  /** True if the model variant is `stub` — caller should swap UI to stub mode. */
  stubMode: boolean;
  /** Soft warning surfaced in the chat header (Qwen fallback copy, etc.). */
  warning?: string;
  /** True if the device is not supported at all (armv7). Caller shows the install-blocked screen. */
  blocked?: boolean;
  /** Friendly copy for the install-blocked screen. */
  blockReason?: string;
}

export class NoNetworkPolicyError extends Error {
  override readonly name = 'NoNetworkPolicyError';
  readonly label: string;
  constructor(label: string) {
    super(`No-network policy violated by '${label}'`);
    this.label = label;
  }
}

export class ModelIntegrityError extends Error {
  override readonly name = 'ModelIntegrityError';
  readonly results: AssetVerification[];
  constructor(results: AssetVerification[]) {
    super(
      `Model integrity check failed for ${results.filter((r) => r.status !== 'ok').length} file(s)`,
    );
    this.results = results;
  }
}

export type AssetVerificationStatus = 'ok' | 'mismatch' | 'missing';

export interface AssetVerification {
  file: string;
  expected: string;
  actual: string;
  status: AssetVerificationStatus;
}

export interface ModelAssetsVerification {
  status: 'ok' | 'mismatch' | 'malformed' | 'missing';
  results: AssetVerification[];
  parseErrors: string[];
}

/* ----------------------------- constants ---------------------------------- */

/**
 * Root directory for downloaded model files. Defined as the device's
 * `documentDirectory` (terminated with a trailing slash so SUMS file
 * paths with the `models/` prefix join correctly). The actual storage
 * directory for the binaries is `${MODELS_DIR_DOWNLOAD}models/`.
 *
 * Tests override via `verifyModelAssets({ rootDir })`.
 */
export const MODELS_DIR_DOWNLOAD = `${legacyDocumentDirectory ?? ''}/`;

/** Asset root inside the bundle (used to locate the bundled SUMS file). */
export const ASSETS_ROOT = 'assets/models';
export const SUMS_FILE = `${ASSETS_ROOT}/SHA256SUMS`;

/** Stub-mode threshold for disk OR free RAM, in MB. */
const STUB_THRESHOLD_MB = 1500;

/** Flagship tier — high-end device that always picks the primary LLM. */
const FLAGSHIP_RAM_MB = 8000;
const FLAGSHIP_DISK_MB = 4000;

/** Standard tier — picks the primary LLM without the GPU requirement. */
const STANDARD_RAM_MB = 4000;
const STANDARD_DISK_MB = 3000;

/* ------------------------------ probe() ----------------------------------- */

/**
 * Probes the host and returns a `DeviceCapability` snapshot. The result is
 * pure data — callers cache it via `user_profile.preferences_json.deviceProfile`
 * (design §6). Probe MUST complete in <2 s on a flagship device.
 *
 * Source of truth per field:
 *   - `arch`          ← `Device.supportedCpuArchitectures`
 *   - `totalMemoryMB` ← `Device.totalMemory` (bytes → MB)
 *   - `freeMemoryMB`  ← best-effort: Android reads /proc/meminfo via native
 *                        module (not in scope for Sub-change 2); iOS uses a
 *                        conservative 50% heuristic until a native binding
 *                        ships. Tests inject a deterministic value via the
 *                        `Device.totalMemory` mock + the `_setFreeMemoryMb`
 *                        test-only setter.
 *   - `freeDiskMB`    ← `FileSystem.getFreeDiskStorageAsync()`
 *   - `hasAccelerator`← Metal on iOS (always true on iOS 11+); OpenCL /
 *                        Vulkan feature probe on Android via
 *                        `Device.getPlatformFeaturesAsync()`.
 *   - `screenScale`   ← `PixelRatio.get()`
 */
export async function probe(): Promise<DeviceCapability> {
  const arch = detectArch();
  const totalMemoryBytes = Device.totalMemory ?? 0;
  const totalMemoryMB = Math.max(0, Math.floor(totalMemoryBytes / (1024 * 1024)));
  const freeMemoryMB = await resolveFreeMemoryMB(totalMemoryMB);
  const freeDiskBytes = await FileSystem.getFreeDiskStorageAsync();
  const freeDiskMB = Math.max(0, Math.floor(freeDiskBytes / (1024 * 1024)));
  const hasAccelerator = await detectAccelerator();
  const screenScale = PixelRatio.get();
  return {
    arch,
    arm64Supported: arch === 'arm64',
    totalMemoryMB,
    freeMemoryMB,
    freeDiskMB,
    hasAccelerator,
    gpuAvailable: hasAccelerator,
    screenScale,
  };
}

function detectArch(): Arch {
  const archs = Device.supportedCpuArchitectures ?? [];
  const lower = archs.map((a) => a.toLowerCase());
  // Order matters: arm64 strings sometimes include "v8" which can match
  // an x86 substring via partial match. Match arm64 first.
  if (lower.some((a) => /arm64/.test(a))) return 'arm64';
  if (lower.some((a) => /armv7|armeabi/.test(a))) return 'armv7';
  if (lower.some((a) => /x86_64|x64|amd64/.test(a))) return 'x86_64';
  // Unknown — assume arm64 (modern devices dominate the 2026 install base);
  // the resolveModelVariant logic still has its own armv7-block branch that
  // will fire if the OS reports a 32-bit-only ABI elsewhere.
  return 'arm64';
}

async function detectAccelerator(): Promise<boolean> {
  // iOS: every supported device ships Metal. Treat as always-available.
  if (Device.osName === 'iOS') return true;
  // Android / others: probe via expo-device.getPlatformFeaturesAsync().
  try {
    const features = await Device.getPlatformFeaturesAsync();
    if (features.some((f) => /Metal|OpenCL|Vulkan/.test(f))) return true;
  } catch {
    /* fall through to heuristic */
  }
  // Conservative Android fallback: API ≥ 24 + Android = assume Vulkan-capable.
  if (Device.osName === 'Android' && (Device.platformApiLevel ?? 0) >= 24) {
    return true;
  }
  return false;
}

async function resolveFreeMemoryMB(totalMemoryMB: number): Promise<number> {
  // Production path on Android uses a native module to read /proc/meminfo;
  // the Sub-change 2 scope doesn't ship that binding yet. Tests inject a
  // deterministic value via `_setFreeMemoryMbForTesting`. Production callers
  // without the native module fall back to a 50%-of-total heuristic; this is
  // documented in design §14 risk 1 (RAM under-report is better than OOM).
  const injected = _injectedFreeMemoryMB;
  if (injected !== null) return injected;
  return Math.max(0, Math.floor(totalMemoryMB * 0.5));
}

let _injectedFreeMemoryMB: number | null = null;
/**
 * Test-only override for the free-memory heuristic. Pass `null` to clear.
 * Not exported via the public index; available to tests via deep import.
 */
export function _setFreeMemoryMbForTesting(mb: number | null): void {
  _injectedFreeMemoryMB = mb;
}

/* ------------------------ resolveModelVariant() --------------------------- */

/**
 * Pure decision tree over a `DeviceCapability`. No I/O. Safe to call from
 * any layer (UI, store, layout) without mocking. Mirrors the flowchart in
 * design §8 exactly — any change to the tree must also update that diagram.
 */
export function resolveModelVariant(cap: DeviceCapability): VariantResolution {
  // 32-bit armv7: hard block (llama.rn requires arm64-v8a).
  if (cap.arch === 'armv7') {
    return {
      variant: 'stub',
      stubMode: true,
      blocked: true,
      blockReason:
        "This device's processor is not supported. Llama requires arm64. Please use a newer device.",
    };
  }
  // Low-memory stub trigger: design §8 path F.
  if (cap.freeDiskMB < STUB_THRESHOLD_MB || cap.freeMemoryMB < STUB_THRESHOLD_MB) {
    return {
      variant: 'stub',
      stubMode: true,
      warning:
        'Running in low-memory stub mode — install Qwen or Llama when more storage is available',
    };
  }
  // Flagship tier (design §8 path H): no warning.
  if (
    cap.freeMemoryMB >= FLAGSHIP_RAM_MB &&
    cap.freeDiskMB >= FLAGSHIP_DISK_MB &&
    cap.hasAccelerator
  ) {
    return { variant: 'llama-3.2-1b', stubMode: false };
  }
  // Standard tier (design §8 path J): no warning.
  if (cap.freeMemoryMB >= STANDARD_RAM_MB && cap.freeDiskMB >= STANDARD_DISK_MB) {
    return { variant: 'llama-3.2-1b', stubMode: false };
  }
  // Fallback tier (design §8 path K): Qwen + warning.
  return {
    variant: 'qwen2.5-1.5b',
    stubMode: false,
    warning:
      'Your device is below the recommended specs. Falling back to a smaller model for stability.',
  };
}

/* -------------------------- assertNoNetwork() ----------------------------- */

/**
 * NoNetworkPolicy enforcement (design §1). Called at the entry of every
 * service that talks to a native module; if `expo-network` reports
 * `isConnected === true`, the call throws `NoNetworkPolicyError`.
 *
 * Pass `label === 'allowed'` to skip the check — this is the explicit
 * escape hatch used by the boot-time capability probe itself (which
 * intentionally inspects network state).
 *
 * Async by design: `expo-network.getNetworkStateAsync()` returns a Promise.
 * The original RED test (Sub-change 1, Task 1.9) wraps the call in
 * `expect(() => fn()).not.toThrow()`; that assertion does not await Promises,
 * so it stays green regardless. The proper assertion pattern is
 * `await expect(assertNoNetwork('stt')).resolves.toBeUndefined()`.
 */
export async function assertNoNetwork(label: string): Promise<void> {
  if (label === 'allowed') return;
  const state = await Network.getNetworkStateAsync();
  if (state.isConnected) {
    throw new NoNetworkPolicyError(label);
  }
}

/* ---------------------- SHA-256 verification (Task 2.5) ------------------- */

/**
 * Parses a `sha256sum`-format file. Each non-empty, non-comment line must
 * match `<64-hex>  <file>` (single space, asterisk, or double space between
 * hash and filename per `sha256sum -b` / `--tag` output). Comments start
 * with `#`. Returns parse errors for any malformed lines (without throwing)
 * so callers can surface them in a debug overlay.
 */
export interface ParseSumsResult {
  entries: { hash: string; file: string }[];
  errors: string[];
}

export function parseSums(content: string): ParseSumsResult {
  const entries: { hash: string; file: string }[] = [];
  const errors: string[] = [];
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    // sha256sum output formats:
    //   text mode  :  "<hash>  <file>"
    //   binary/tag :  "<hash> *<file>"
    // The middle separator is 1+ spaces; `*` only appears as a single
    // binary-mode indicator glued to the filename. We strip leading `*`
    // and any trailing `*` from the captured filename group to normalize.
    const match = /^([0-9a-fA-F]{64})\s+([*\s]*)(\S.*)$/.exec(line);
    if (!match) {
      errors.push(line);
      continue;
    }
    const file = match[3]!.replace(/^\*+|\*+$/g, '').trim();
    entries.push({
      hash: match[1]!.toLowerCase(),
      file,
    });
  }
  return { entries, errors };
}

/**
 * SHA-256 hex digest over a byte array. Uses the Web Crypto API
 * (`globalThis.crypto.subtle.digest`) which is available on Hermes 0.74+
 * (our SDK 54 baseline) and Node 18+ (Jest). Returns lowercase hex.
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error(
      'SHA-256 unavailable: globalThis.crypto.subtle is not supported on this platform',
    );
  }
  // Copy into a fresh ArrayBuffer so we satisfy the NodeJS.BufferSource
  // shape (Uint8Array<ArrayBuffer>) cleanly across TS lib variants.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const buf = await subtle.digest('SHA-256', copy);
  const out = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < out.length; i++) {
    hex += out[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Verifies every downloaded model file against the hashes in
 * `assets/models/SHA256SUMS`. Returns a `ModelAssetsVerification` summary;
 * throws `ModelIntegrityError` if any file is missing OR mismatched so the
 * caller can render a blocking "Model files are corrupted" screen.
 *
 * The SUMS file is still bundled at `assets/models/SHA256SUMS` (small,
 * ~few-hundred bytes), so it ships with the APK. The model paths inside
 * the SUMS file are now relative to `MODELS_DIR_DOWNLOAD` (the document
 * directory) — see `assets/models/SHA256SUMS` for the up-to-date content.
 *
 * Test seams:
 *   - `opts.sumsContent` injects the SUMS file body verbatim.
 *   - `opts.fileBytes` is a `{ [filename]: Uint8Array }` map used INSTEAD
 *     of reading from `expo-file-system`. Production callers omit both.
 *   - `opts.rootDir` overrides the default `MODELS_DIR_DOWNLOAD`.
 */
export async function verifyModelAssets(opts?: {
  sumsContent?: string;
  fileBytes?: Record<string, Uint8Array>;
  rootDir?: string;
}): Promise<ModelAssetsVerification> {
  const rootDir = opts?.rootDir ?? MODELS_DIR_DOWNLOAD;
  const sumsPath = `${rootDir}/SHA256SUMS`;

  // 1. Read the SUMS file. Test seam: sumsContent. Production: FileSystem.
  let content: string;
  if (opts?.sumsContent !== undefined) {
    content = opts.sumsContent;
  } else {
    try {
      const info = await FileSystem.getInfoAsync(sumsPath);
      if (!info.exists) {
        return { status: 'missing', results: [], parseErrors: ['SHA256SUMS not found'] };
      }
      content = await FileSystem.readAsStringAsync(sumsPath);
    } catch {
      return { status: 'missing', results: [], parseErrors: ['SHA256SUMS not readable'] };
    }
  }

  // 2. Parse.
  const parsed = parseSums(content);
  if (parsed.entries.length === 0) {
    return { status: 'malformed', results: [], parseErrors: parsed.errors };
  }

  // 3. For each entry, hash the file and compare.
  const results: AssetVerification[] = [];
  for (const entry of parsed.entries) {
    const filePath = `${rootDir}/${entry.file}`;
    let bytes: Uint8Array;
    // If the caller passed a `fileBytes` map, treat presence in the map as
    // authoritative — present → use those bytes, absent → 'missing'. We do
    // NOT fall through to FileSystem when `fileBytes` is provided because
    // tests need a deterministic "this file is not in the bundle" signal.
    if (opts?.fileBytes !== undefined) {
      if (!Object.prototype.hasOwnProperty.call(opts.fileBytes, entry.file)) {
        results.push({ file: entry.file, expected: entry.hash, actual: '', status: 'missing' });
        continue;
      }
      bytes = opts.fileBytes[entry.file]!;
    } else {
      try {
        // Production: read via expo-file-system new API (File(...).arrayBuffer()).
        // The legacy API (readAsStringAsync) does not return bytes; the new
        // File object is the documented path for binary reads.
        const file = new FileSystem.File(filePath);
        const exists = await FileSystem.getInfoAsync(filePath);
        if (!exists.exists) {
          results.push({ file: entry.file, expected: entry.hash, actual: '', status: 'missing' });
          continue;
        }
        const ab = await file.arrayBuffer();
        bytes = new Uint8Array(ab);
      } catch {
        results.push({ file: entry.file, expected: entry.hash, actual: '', status: 'missing' });
        continue;
      }
    }
    const actual = await sha256Hex(bytes);
    const status: AssetVerificationStatus = actual === entry.hash ? 'ok' : 'mismatch';
    results.push({ file: entry.file, expected: entry.hash, actual, status });
  }

  // 4. Aggregate.
  const failed = results.filter((r) => r.status !== 'ok');
  const overall: ModelAssetsVerification['status'] =
    failed.length === 0 ? 'ok' : 'mismatch';
  return { status: overall, results, parseErrors: parsed.errors };
}

/**
 * Boots with verification. Throws `ModelIntegrityError` if any file fails.
 * The chat root layout catches it and shows the blocking "Model files are
 * corrupted — reinstall required" screen.
 */
export async function probeWithAssetVerification(): Promise<{
  capability: DeviceCapability;
  assets: ModelAssetsVerification;
}> {
  const capability = await probe();
  const assets = await verifyModelAssets();
  if (assets.status === 'mismatch' || assets.status === 'malformed') {
    throw new ModelIntegrityError(assets.results);
  }
  return { capability, assets };
}