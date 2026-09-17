/**
 * Type shim for llama.rn.
 */
declare module 'llama.rn' {
  export interface InitLlamaOpts {
    model: string;
    use_mlock?: boolean;
    n_threads?: number;
    n_ctx?: number;
    n_gpu_layers?: number;
    n_batch?: number;
  }
  export interface CompletionOpts {
    prompt: string;
    n_predict?: number;
    stop?: string[];
    temperature?: number;
    top_p?: number;
    top_k?: number;
    repeat_penalty?: number;
  }
  export interface CompletionResult {
    text: string;
    tokens_predicted: number;
    tokens_evaluated: number;
    stopped_eos: boolean;
    stopped_limit: boolean;
    stopped_word: boolean;
  }
  export function initLlama(opts: InitLlamaOpts): Promise<{ contextId: number; gpu: boolean }>;
  export function completion(
    opts: CompletionOpts,
    cb?: (chunk: { token: string }) => void,
  ): Promise<CompletionResult>;
  export function releaseLlama(opts: { id: number }): Promise<void>;

  /**
   * Test-only knob — the Jest mock in __mocks__/llama-rn.ts ships a
   * _setScriptedTokens helper that overrides the completion callback's
   * streamed output. Not present on the real native binding.
   *
   * @internal
   */
  export function _setScriptedTokens(tokens: string[] | null): void;
  /** @internal */
  export let _scriptedTokens: string[] | null;
}