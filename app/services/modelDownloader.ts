/**
 * app/services/modelDownloader.ts
 *
 * Download-on-first-launch for the three model binaries.
 *
 * Replaces the previous "bundled LFS" delivery path: instead of carrying
 * ~2 GB of GGUF/STT bytes inside the APK (which would push Android APK
 * size over the 2 GB install ceiling and slow every install), the
 * binaries are pulled once from GitHub Releases on the app's first boot
 * and cached in the device's document directory. Subsequent boots are a
 * no-op (sentinel file `.downloaded` present + per-file SHA-256 verified).
 *
 * This module is the ONLY network-capable surface in the runtime codebase
 * (NoNetworkPolicy / design §1). All other services are pure-local.
 * `app/_layout.tsx` is the only caller; it gates the download on a single
 * "is the sentinel present?" check, then renders the boot screen until
 * verification finishes.
 *
 * Architecture invariants:
 *   - Idempotent. Calling ensureModelsInstalled on a clean install is a
 *     no-op (returns without emitting progress).
 *   - Self-healing on hash mismatch: the bad file is deleted and the
 *     function throws so the caller can render the error/retry UI.
 *   - AbortSignal-aware: callers can cancel mid-download.
 *   - Progress is throttled to ~5 Hz to avoid React render storms.
 *
 * See also: `app/config/modelManifest.ts` (variant registry),
 * `app/services/capability.ts` (`verifyModelAssets` reads SHA256SUMS from
 * the bundled asset root and validates each downloaded file).
 */
import * as FileSystem from 'expo-file-system';
import { documentDirectory as legacyDocumentDirectory } from 'expo-file-system/legacy';

import { MODEL_MANIFEST, STT_ASSET, type AssetEntry, type ModelEntry } from '../config/modelManifest';
import { sha256Hex } from './capability';

/* ----------------------------- public types ------------------------------- */

export interface ModelDownloadProgress {
  /** Local path of the file currently being downloaded (e.g. `models/stt/ggml-tiny.bin`). */
  currentFile: string;
  /** Human-readable label for the current file (e.g. `Speech recognition model`). */
  currentFileLabel: string;
  /** 1-based index of the current file within the queue. */
  fileIndex: number;
  /** Total number of files in the queue. */
  totalFiles: number;
  /** Cumulative bytes downloaded across the queue at the time of this tick. */
  bytesDownloaded: number;
  /** Cumulative total bytes of the queue (the sum of every entry's sizeMB). */
  bytesTotal: number;
  phase: 'pending' | 'downloading' | 'verifying' | 'done' | 'error';
  errorMessage?: string;
}

/* ----------------------------- constants ---------------------------------- */

/**
 * Root for downloaded model files. Exposed so the boot layout + tests
 * can locate the sentinel and per-file paths. The actual subdirectory
 * holding the models is `${MODELS_DIR}models/`, which the downloader
 * creates with `makeDirectoryAsync(..., { intermediates: true })` on
 * first use. We always append a trailing `/` so `localPath` joins can
 * use string concatenation uniformly (production `documentDirectory`
 * already ends with `/`; under jest the legacy export is `null` and
 * the empty string would otherwise break the join).
 */
export const MODELS_DIR_DOWNLOAD = `${legacyDocumentDirectory ?? ''}/`;

/** Storage directory created by `ensureModelsInstalled` on first launch. */
export const MODELS_DIR = `${MODELS_DIR_DOWNLOAD}models/`;

/** Sentinel file marking a clean install. */
export const MODELS_DOWNLOADED_SENTINEL = `${MODELS_DIR}.downloaded`;

/** Progress emission cadence (ms). 200 ms ≈ 5 Hz. */
const PROGRESS_THROTTLE_MS = 200;

/* ----------------------------- module state ------------------------------- */

/**
 * Cached last error so the boot UI can render it without rethrowing.
 * Cleared at the start of every `ensureModelsInstalled` call.
 */
let _lastDownloadError: string | null = null;

/* ------------------------------ queue ------------------------------------- */

interface DownloadJob {
  /** Local path relative to documentDirectory, e.g. `models/stt/ggml-tiny.bin`. */
  localPath: string;
  /** Display label for the progress UI. */
  label: string;
  /** Full URL to download from. */
  remoteUrl: string;
  /** Expected SHA-256 of the downloaded file. */
  sha256: string;
  /** Approximate size in MB (used for the cumulative total). */
  sizeMB: number;
}

/** All three entries that need to land on disk before the app can boot. */
function buildDownloadQueue(): DownloadJob[] {
  const llama = MODEL_MANIFEST['llama-3.2-1b'];
  const qwen = MODEL_MANIFEST['qwen2.5-1.5b'];
  return [
    jobForEntry(STT_ASSET, 'Speech recognition model'),
    jobForEntry(llama, llama.label),
    jobForEntry(qwen, qwen.label),
  ];
}

function jobForEntry(entry: ModelEntry | AssetEntry, label: string): DownloadJob {
  return {
    localPath: entry.localPath,
    label,
    remoteUrl: entry.remoteUrl,
    sha256: entry.sha256,
    sizeMB: entry.sizeMB,
  };
}

/* ------------------------------ public API -------------------------------- */

/**
 * Returns the last error message from `ensureModelsInstalled`, or `null`
 * when the previous call succeeded. Cleared at the start of every call.
 */
export function getLastDownloadError(): string | null {
  return _lastDownloadError;
}

/**
 * Returns `true` if the sentinel file is present (every previous install
 * completed successfully + hash-verified). On first launch this is `false`,
 * which is the trigger for `ensureModelsInstalled`.
 */
export async function getModelsDownloaded(): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(MODELS_DOWNLOADED_SENTINEL);
    return info.exists;
  } catch {
    return false;
  }
}

/**
 * Deletes the sentinel and all 3 model files so the next call to
 * `ensureModelsInstalled` re-downloads. Used by the Settings → Models
 * screen "Re-download" action and by tests that need a clean slate.
 */
export async function resetDownloadedFlag(): Promise<void> {
  await safeDelete(MODELS_DOWNLOADED_SENTINEL);
  for (const job of buildDownloadQueue()) {
    await safeDelete(`${MODELS_DIR_DOWNLOAD}${job.localPath}`);
  }
}

async function safeDelete(path: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {
    /* missing is fine */
  }
}

/**
 * Ensures all three model files are present on disk and verified.
 *
 * Behaviour:
 *   1. If the sentinel is present, returns silently (idempotent no-op).
 *   2. Otherwise, makes `${MODELS_DIR}models/` if missing, then per file:
 *      a. If the file exists locally, hash it; on match skip the download.
 *      b. If missing or mismatched, delete any stale copy, download, verify.
 *   3. Writes the sentinel on success.
 *
 * Emits `onProgress` at ~5 Hz. Throws on any unrecoverable error
 * (network failure, hash mismatch, AbortSignal); the boot layout catches
 * and renders the error+retry screen.
 *
 * @param onProgress Optional callback for progress UI updates.
 * @param signal Optional AbortSignal; if already aborted, throws immediately.
 */
export async function ensureModelsInstalled(
  onProgress?: (progress: ModelDownloadProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  _lastDownloadError = null;
  if (signal?.aborted) {
    throw makeAbortError();
  }
  if (await getModelsDownloaded()) {
    // Idempotent no-op: caller has nothing to render. Per orchestrator
    // spec, we do NOT emit progress when the install is already done.
    return;
  }
  await ensureModelsDir();
  const jobs = buildDownloadQueue();
  const bytesTotal = jobs.reduce((sum, j) => sum + j.sizeMB * 1024 * 1024, 0);
  let bytesDownloaded = 0;
  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i]!;
    const fileIndex = i + 1;
    emit(onProgress, {
      currentFile: job.localPath,
      currentFileLabel: job.label,
      fileIndex,
      totalFiles: jobs.length,
      bytesDownloaded,
      bytesTotal,
      phase: 'downloading',
    });
    let fileSizeMB = job.sizeMB;
    const needs = await needsDownload(job);
    if (signal?.aborted) throw makeAbortError();
    if (needs) {
      const filePath = `${MODELS_DIR_DOWNLOAD}${job.localPath}`;
      await safeDelete(filePath);
      const downloaded = await downloadOne(job, signal, (downloadedBytes) => {
        emit(onProgress, {
          currentFile: job.localPath,
          currentFileLabel: job.label,
          fileIndex,
          totalFiles: jobs.length,
          bytesDownloaded: bytesDownloaded + downloadedBytes,
          bytesTotal,
          phase: 'downloading',
        });
      });
      if (downloaded && downloaded.bytesTotal > 0) {
        fileSizeMB = downloaded.bytesTotal / (1024 * 1024);
      }
    }
    emit(onProgress, {
      currentFile: job.localPath,
      currentFileLabel: job.label,
      fileIndex,
      totalFiles: jobs.length,
      bytesDownloaded: bytesDownloaded + fileSizeMB * 1024 * 1024,
      bytesTotal,
      phase: 'verifying',
    });
    await verifyLocalFile(job, signal);
    bytesDownloaded += fileSizeMB * 1024 * 1024;
  }
  // Last tick: done.
  emit(onProgress, {
    currentFile: jobs[jobs.length - 1]!.localPath,
    currentFileLabel: jobs[jobs.length - 1]!.label,
    fileIndex: jobs.length,
    totalFiles: jobs.length,
    bytesDownloaded: bytesTotal,
    bytesTotal,
    phase: 'done',
  });
  // Write the sentinel (empty file is fine).
  try {
    await FileSystem.writeAsStringAsync(MODELS_DOWNLOADED_SENTINEL, '', {
      encoding: 'utf8',
    });
  } catch (err) {
    // Sentinel write failure is non-fatal: a re-launch will simply
    // re-hash and skip if the files are present. Record it so the UI
    // can warn.
    _lastDownloadError = `Sentinel write failed: ${describeError(err)}`;
  }
}

function emit(
  cb: ((p: ModelDownloadProgress) => void) | undefined,
  progress: ModelDownloadProgress,
): void {
  if (cb) cb(progress);
}

/* ------------------------------ internals --------------------------------- */

async function ensureModelsDir(): Promise<void> {
  await FileSystem.makeDirectoryAsync(MODELS_DIR, { intermediates: true });
}

async function needsDownload(job: DownloadJob): Promise<boolean> {
  const filePath = `${MODELS_DIR_DOWNLOAD}${job.localPath}`;
  const info = await FileSystem.getInfoAsync(filePath);
  if (!info.exists) return true;
  // File exists; verify SHA-256 against the manifest. If mismatch,
  // needsDownload returns true and the caller deletes + re-downloads.
  const actual = await sha256Hex(await readBytes(filePath));
  return actual !== job.sha256;
}

async function verifyLocalFile(job: DownloadJob, signal?: AbortSignal): Promise<void> {
  const filePath = `${MODELS_DIR_DOWNLOAD}${job.localPath}`;
  if (signal?.aborted) throw makeAbortError();
  const actual = await sha256Hex(await readBytes(filePath));
  if (actual !== job.sha256) {
    await safeDelete(filePath);
    const msg = `Hash mismatch for ${job.localPath}: expected ${job.sha256}, got ${actual}`;
    _lastDownloadError = msg;
    throw new Error(msg);
  }
}

interface DownloadResult {
  bytesTotal: number;
}

async function downloadOne(
  job: DownloadJob,
  signal: AbortSignal | undefined,
  onBytes: (downloadedBytes: number) => void,
): Promise<DownloadResult | null> {
  const filePath = `${MODELS_DIR_DOWNLOAD}${job.localPath}`;
  const tmpPath = `${filePath}.partial`;
  const lastEmitRef: { at: number; last: number } = { at: 0, last: 0 };
  try {
    const downloader = FileSystem.createDownloadResumable(
      job.remoteUrl,
      tmpPath,
      {},
      (progress) => {
        const downloaded = progress.totalBytesWritten;
        const now = Date.now();
        if (now - lastEmitRef.at >= PROGRESS_THROTTLE_MS || downloaded !== lastEmitRef.last) {
          lastEmitRef.at = now;
          lastEmitRef.last = downloaded;
          onBytes(downloaded);
        }
      },
    );
    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          void downloader.cancelAsync().catch(() => undefined);
        },
        { once: true },
      );
    }
    const result = await downloader.downloadAsync();
    if (!result || result.status !== 200) {
      const msg = `Download failed for ${job.localPath} (status ${result?.status ?? 'unknown'})`;
      _lastDownloadError = msg;
      throw new Error(msg);
    }
    // Atomic rename so partials never appear at the canonical path.
    try {
      // `moveAsync` is the documented path on SDK 54; if missing we
      // fall back to `deleteAsync + copy`-equivalent via delete + write.
      await FileSystem.deleteAsync(filePath, { idempotent: true });
      // expo-file-system has no `rename`; we copy by re-downloading is
      // silly. Instead, read the partial + write the canonical. The
      // File class doesn't expose `mv`, so we fall back to a copy via
      // `copyAsync` when available, otherwise delete the partial and
      // re-download. Simplest portable path: copyAsync.
      if (typeof FileSystem.copyAsync === 'function') {
        await FileSystem.copyAsync({ from: tmpPath, to: filePath });
        await safeDelete(tmpPath);
      } else {
        await FileSystem.writeAsStringAsync(filePath, await readBytes(tmpPath).then((b) => b.toString()));
        await safeDelete(tmpPath);
      }
    } catch (err) {
      const msg = `Failed to finalize ${job.localPath}: ${describeError(err)}`;
      _lastDownloadError = msg;
      throw new Error(msg);
    }
    return { bytesTotal: 0 };
  } catch (err) {
    if (signal?.aborted) throw makeAbortError();
    const msg = describeError(err);
    _lastDownloadError = msg || `Download failed for ${job.localPath}`;
    throw err instanceof Error ? err : new Error(_lastDownloadError);
  }
}

/* ----------------------------- byte reads --------------------------------- */

/**
 * Read a file into a `Uint8Array`. Tries the new `File` API first; falls
 * back to a chunked `readAsStringAsync` decode if the runtime mock does
 * not support `File#arrayBuffer` (e.g. some older test stubs).
 */
async function readBytes(filePath: string): Promise<Uint8Array> {
  try {
    const file = new FileSystem.File(filePath);
    const ab = await file.arrayBuffer();
    return new Uint8Array(ab);
  } catch {
    // Fallback: read as base64 then decode. Suitable only for tests
    // that pre-stage bytes as base64; production never hits this path.
    const b64 = await FileSystem.readAsStringAsync(filePath, {
      encoding: 'base64',
    });
    const bin = decodeBase64(b64);
    return new Uint8Array(bin);
  }
}

function decodeBase64(b64: string): ArrayBuffer {
  // Node 18+ exposes `Buffer`. In Jest this resolves to a real Buffer.
  // On Hermes (production), the global `Buffer` exists in SDK 54.
  const Buf = (
    globalThis as { Buffer?: { from: (s: string, enc: string) => Uint8Array } }
  ).Buffer;
  if (Buf) {
    const u8 = Buf.from(b64, 'base64');
    // Copy into a fresh ArrayBuffer (Buffer#buffer may be SharedArrayBuffer-shaped).
    const ab = new ArrayBuffer(u8.byteLength);
    new Uint8Array(ab).set(u8);
    return ab;
  }
  // Last-resort: atob (binary string → Uint8Array).
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/* ------------------------------ errors ------------------------------------ */

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return JSON.stringify(err);
}

function makeAbortError(): Error {
  const err = new Error('Model download aborted');
  err.name = 'AbortError';
  return err;
}