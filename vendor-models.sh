#!/usr/bin/env bash
# vendor-models.sh
#
# Reproducible vendor step for the three model binaries. There are two
# modes:
#
#   1. (default) Download from GitHub Releases tag `v1-models` and place
#      the binaries under assets/models/ so the SHA256SUMS smoke test
#      (Task 2.5, RUN_LFS_HASH_CHECK=1) can hash them and the next phase
#      can `gh release upload` them as release assets. Idempotent.
#
#   2. (`--source huggingface`) Download the canonical upstream mirrors
#      directly. Useful if you want to re-vendor from source before
#      publishing a new release tag.
#
# Neither mode commits anything; that is the caller's responsibility.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODELS_ROOT="${REPO_ROOT}/assets/models"
STT_DIR="${MODELS_ROOT}/stt"
LLM_DIR="${MODELS_ROOT}/llm"

mkdir -p "${STT_DIR}" "${LLM_DIR}"

# GitHub Releases — the runtime delivery channel since the
# download-on-first-launch refactor.
RELEASE_TAG="${RELEASE_TAG:-v1-models}"
RELEASE_BASE="https://github.com/jofreguevara/Practice/releases/download/${RELEASE_TAG}"

# Upstream mirrors — only used when --source huggingface is passed.
STT_HF_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin"
LLAMA_HF_URL="https://huggingface.co/lmstudio-community/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf"
QWEN_HF_URL="https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf"

# Expected hashes — must match SHA256SUMS after the downloads complete.
EXPECTED_STT="be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21"
EXPECTED_LLAMA="f7ede42862ceca07ad1c88a97b67520019c4ac7e5ced250d2e696fa62ab189af"
EXPECTED_QWEN="6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e"

SOURCE="releases"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --release)
      RELEASE_TAG="$2"; shift 2;;
    --source)
      SOURCE="$2"; shift 2;;
    -h|--help)
      echo "Usage: $0 [--release TAG] [--source releases|huggingface]"
      exit 0;;
    *)
      echo "Unknown arg: $1" >&2
      exit 2;;
  esac
done

case "${SOURCE}" in
  releases)
    STT_URL="${RELEASE_BASE}/ggml-tiny.bin"
    LLAMA_URL="${RELEASE_BASE}/Llama-3.2-1B-Instruct-Q4_K_M.gguf"
    QWEN_URL="${RELEASE_BASE}/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf"
    ;;
  huggingface)
    STT_URL="${STT_HF_URL}"
    LLAMA_URL="${LLAMA_HF_URL}"
    QWEN_URL="${QWEN_HF_URL}"
    ;;
  *)
    echo "Unknown --source value: ${SOURCE} (expected: releases | huggingface)" >&2
    exit 2;;
esac

fetch() {
  local out_path="$1"
  local url="$2"
  local expected="$3"
  local label="$4"

  echo "==> Fetching ${label} -> ${out_path}"
  # -f fails on HTTP errors, --retry 3 with backoff handles transient flakes.
  curl --fail --location --retry 3 --retry-delay 2 \
       --connect-timeout 30 --max-time 1800 \
       -o "${out_path}.partial" "${url}"
  # Atomic rename so we never observe a partial file at the canonical path.
  mv "${out_path}.partial" "${out_path}"

  echo "==> Verifying ${label}"
  local actual
  actual="$(sha256sum "${out_path}" | awk '{print $1}')"
  if [[ "${actual}" != "${expected}" ]]; then
    echo "FAIL: hash mismatch for ${label}" >&2
    echo "  expected: ${expected}" >&2
    echo "  actual:   ${actual}" >&2
    exit 1
  fi
  echo "    OK (sha256 ${actual})"
}

# Fetch the three binaries. These run sequentially; the LLM files are
# ~1 GB each so parallel downloads only save time on very fast links.
fetch "${STT_DIR}/ggml-tiny.bin" "${STT_URL}" "${EXPECTED_STT}" "ggml-tiny.bin (whisper)"
fetch "${LLM_DIR}/Llama-3.2-1B-Instruct-Q4_K_M.gguf" "${LLAMA_URL}" "${EXPECTED_LLAMA}" "Llama 3.2 1B Q4_K_M"
fetch "${LLM_DIR}/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf" "${QWEN_URL}" "${EXPECTED_QWEN}" "Qwen 2.5 1.5B Q4_K_M"

# Recompute SHA256SUMS so the manifest always matches the on-disk bytes.
# Paths are relative to `documentDirectory` (the runtime rootDir used by
# `verifyModelAssets`), so they include the `models/` prefix.
cat > "${MODELS_ROOT}/SHA256SUMS" <<EOF
# SHA-256 manifest for models/.
#
# Each line below is consumed by \`capability.verifyModelAssets\` at first
# launch. The path is relative to \`FileSystem.documentDirectory\` (the
# rootDir used by the SHA-256 verification pass), so the \`models/\`
# prefix is included — it points at the directory the downloader writes
# into on first launch.
#
# Generated: $(date -u +%Y-%m-%d) (vendor-models.sh)

${EXPECTED_STT}  models/stt/ggml-tiny.bin
${EXPECTED_LLAMA}  models/llm/Llama-3.2-1B-Instruct-Q4_K_M.gguf
${EXPECTED_QWEN}  models/llm/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf
EOF

echo ""
echo "Done. Source: ${SOURCE} (release tag: ${RELEASE_TAG})."
echo "Verify with: sha256sum -c assets/models/SHA256SUMS"