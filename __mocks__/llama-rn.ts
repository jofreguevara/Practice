/**
 * llama.rn mock for Jest — the native binding is unavailable in Node.
 *
 * Surface used by llm.ts (chat-mvp Task 3.1):
 *   - initLlama({model, use_mlock?, n_threads?, n_ctx?}) → { contextId, gpu }
 *   - completion({prompt, n_predict?, stop?, temperature?, top_p?, top_k?}, callback?)
 *       callback fires with { token } for each streamed chunk; resolves to { text }
 *   - releaseLlama({id}) → void
 *
 * Tests override the per-export jest.fn defaults to drive streaming behaviour.
 */

interface InitLlamaOpts {
  model: string;
  use_mlock?: boolean;
  n_threads?: number;
  n_ctx?: number;
}
interface CompletionOpts {
  prompt: string;
  n_predict?: number;
  stop?: string[];
  temperature?: number;
  top_p?: number;
  top_k?: number;
}
interface CompletionResult {
  text: string;
  tokens_predicted: number;
  tokens_evaluated: number;
  stopped_eos: boolean;
  stopped_limit: boolean;
  stopped_word: boolean;
}

export const initLlama = jest.fn(
  (_opts: InitLlamaOpts): Promise<{ contextId: number; gpu: boolean }> =>
    Promise.resolve({ contextId: 1, gpu: false }),
);

export const completion = jest.fn(
  (
    opts: CompletionOpts,
    cb?: (chunk: { token: string }) => void,
  ): Promise<CompletionResult> => {
    void opts;
    if (_scriptedTokens) {
      for (const token of _scriptedTokens) {
        cb?.({ token });
      }
      return Promise.resolve({
        text: _scriptedTokens.join(''),
        tokens_predicted: _scriptedTokens.length,
        tokens_evaluated: 0,
        stopped_eos: true,
        stopped_limit: false,
        stopped_word: false,
      });
    }
    if (cb) {
      cb({ token: 'Hello' });
      cb({ token: ' world' });
    }
    return Promise.resolve({
      text: 'Hello world',
      tokens_predicted: 2,
      tokens_evaluated: 0,
      stopped_eos: true,
      stopped_limit: false,
      stopped_word: false,
    });
  },
);

export const releaseLlama = jest.fn((_opts: { id: number }): Promise<void> => Promise.resolve());

/**
 * Test-only knob: when set to a string array, `completion` will stream those
 * tokens verbatim via the callback. Cleared by default — production tests
 * should explicitly opt in.
 */
export let _scriptedTokens: string[] | null = null;
export function _setScriptedTokens(tokens: string[] | null): void {
  _scriptedTokens = tokens;
}