# Third-party model licenses

The bundled model binaries under `assets/models/` are downloaded from
canonical upstream repositories and redistributed under their original
licenses. This file documents the attribution required by each license.

**Lookup date:** 2026-09-15 (Sub-change 2 vendor pass; hashes recorded
in `SHA256SUMS`).

---

## `assets/models/stt/ggml-tiny.bin` — MIT

The whisper.cpp multilingual tiny speech-recognition model is part of the
[ggerganov/whisper.cpp](https://github.com/ggerganov/whisper.cpp) project.

```
MIT License

Copyright (c) 2023-2024 Georgi Gerganov and the whisper.cpp contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Source URL (canonical):
`https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin`

---

## `assets/models/llm/Llama-3.2-1B-Instruct-Q4_K_M.gguf` — Llama 3.2 Community License

The Llama 3.2 1B Instruct model, quantized to Q4_K_M by the
[lmstudio-community](https://huggingface.co/lmstudio-community/Llama-3.2-1B-Instruct-GGUF)
mirror, is redistributed under the **Llama 3.2 Community License** published
by Meta Platforms, Inc.

This is a permissive license for apps with **fewer than 700 million monthly
active users (MAU)**. Our `practice` app is single-user, offline-only — well
under the 700M threshold. Should the MAU ever cross that line, the upstream
license requires a separate commercial agreement with Meta.

The full license text is bundled with the model on HuggingFace:
<https://huggingface.co/lmstudio-community/Llama-3.2-1B-Instruct-GGUF/blob/main/LICENSE>
and the original Meta-published text lives at
<https://llama.com/llama3_2/license/>.

Key obligations (paraphrased; the canonical text governs):

1. **Attribution** — keep this `LICENSE.md` and the model's `LICENSE` file
   in the redistribution.
2. **Acceptable Use Policy** — comply with Meta's published AUP at
   <https://llama.com/llama3_2/aup/>.
3. **No model improvement** — do not use the outputs of this model to train
   any other LLM without separate permission.
4. **700M MAU threshold** — large-scale commercial redistribution requires
   a separate agreement.

Source URL (canonical):
`https://huggingface.co/lmstudio-community/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf`

---

## `assets/models/llm/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf` — Apache License 2.0

The Qwen2.5 1.5B Instruct model, redistributed from the
[Qwen/Qwen2.5-1.5B-Instruct-GGUF](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF)
official HuggingFace mirror, is licensed under the **Apache License, Version
2.0**. A copy of the license text is bundled with the model and at:
<https://www.apache.org/licenses/LICENSE-2.0>

Source URL (canonical):
`https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf`

---

## How to verify

Run `sha256sum -c SHA256SUMS` from this directory after `git lfs pull`. The
expected hashes are embedded in `SHA256SUMS`. Any mismatch indicates the
files were corrupted in transit or modified after release — in that case
`capability.verifyModelAssets` (Task 2.5) will refuse to load the model and
the chat root layout surfaces the "Model files are corrupted — reinstall
required" screen.

See `app/services/capability.ts` for the verification implementation.