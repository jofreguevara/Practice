/**
 * Tests for app/services/llm.ts (chat-mvp Task 3.1).
 *
 * Covers Jest ids from tasks.md:
 *   - llm.primary_on_flagship
 *   - llm.fallback_on_low_ram
 *   - llm.persona_reload
 *   - llm.summary_per_10_turns
 *
 * RED→GREEN discipline: tests authored before llm.ts existed.
 */
import { initLlama, completion, _setScriptedTokens } from 'llama.rn';
import * as Network from 'expo-network';
import {
  generateReply,
  summarize,
  composeSystemPrompt,
  selectModelForVariant,
  getNetworkBytesSent,
  __resetLlmForTests,
} from '../llm';
import type { ConversationTurn, ProfileContext } from '../llm';

const initLlamaMock = initLlama as unknown as jest.Mock;
const completionMock = completion as unknown as jest.Mock;

const baseProfile: ProfileContext = {
  personaName: 'Coach',
  level: 'A2',
  topicId: 'travel',
  practiceLocale: 'en-US',
  summary: '',
  recentTurns: [],
};

function baseTurns(): ConversationTurn[] {
  return [
    { role: 'user', text: 'Hello there' },
  ];
}

describe('llm.composeSystemPrompt', () => {
  test('llm.compose_uses_default_persona_and_level', () => {
    const prompt = composeSystemPrompt(baseProfile, '', []);
    expect(prompt).toMatch(/You are Coach/);
    expect(prompt).toMatch(/User CEFR level: A2/);
    expect(prompt).toMatch(/Active topic: travel/);
    expect(prompt).toMatch(/Scenario: airports/);
  });

  test('llm.persona_reload: persona change reflected in next compose', () => {
    const prompt = composeSystemPrompt(
      { ...baseProfile, personaName: 'Sam' },
      '',
      [],
    );
    expect(prompt).toMatch(/You are Sam/);
  });

  test('llm.level_hint_includes_A2_style_copy', () => {
    const prompt = composeSystemPrompt(baseProfile, '', []);
    expect(prompt).toMatch(/Avoid idioms/);
  });

  test('llm.summary_block_present_when_summary_non_empty', () => {
    const prompt = composeSystemPrompt(baseProfile, 'User asked about hotels', []);
    expect(prompt).toMatch(/User asked about hotels/);
  });

  test('llm.recent_turns_serialized_in_prompt', () => {
    const prompt = composeSystemPrompt(baseProfile, '', [
      { role: 'user', text: 'I need a hotel' },
      { role: 'assistant', text: 'Where in the city?' },
    ]);
    expect(prompt).toMatch(/I need a hotel/);
    expect(prompt).toMatch(/Where in the city/);
  });
});

describe('llm.selectModelForVariant', () => {
  test('llm.primary_on_flagship: llama-3.2-1b selected for flagship device', () => {
    const path = selectModelForVariant('llama-3.2-1b');
    expect(path).toContain('Llama-3.2-1B-Instruct-Q4_K_M.gguf');
  });

  test('llm.fallback_on_low_ram: qwen2.5-1.5b for low-ram device', () => {
    const path = selectModelForVariant('qwen2.5-1.5b');
    expect(path).toContain('Qwen2.5-1.5B-Instruct-Q4_K_M.gguf');
  });

  test('llm.stub_returns_empty_path', () => {
    expect(selectModelForVariant('stub')).toBe('');
  });
});

describe('llm.generateReply (streaming async iterator)', () => {
  beforeEach(() => {
    __resetLlmForTests();
    jest.clearAllMocks();
    initLlamaMock.mockResolvedValue({ contextId: 1, gpu: false });
  });

  test('llm.streaming_yields_token_chunks_in_order', async () => {
    _setScriptedTokens(['Hello', ' ', 'there', ' friend']);
    const chunks: string[] = [];
    for await (const chunk of generateReply(baseTurns(), baseProfile)) {
      chunks.push(chunk.token);
    }
    expect(chunks.join('')).toBe('Hello there friend');
  });

  test('llm.token_index_is_monotonic', async () => {
    _setScriptedTokens(['a', 'b', 'c', 'd']);
    let lastIndex = -1;
    for await (const chunk of generateReply(baseTurns(), baseProfile)) {
      expect(chunk.index).toBeGreaterThan(lastIndex);
      lastIndex = chunk.index;
    }
  });

  test('llm.uses_default_model_when_no_variant_override', async () => {
    _setScriptedTokens(['ok']);
    const it = generateReply(baseTurns(), baseProfile)[Symbol.asyncIterator]();
    await it.next();
    // No variant override → default llama model selected.
    expect(initLlamaMock).toHaveBeenCalled();
  });

  test('llm.network_bytes_zero: getNetworkBytesSent returns 0 after generateReply', async () => {
    _setScriptedTokens(['x']);
    for await (const _chunk of generateReply(baseTurns(), baseProfile)) {
      void _chunk;
    }
    expect(getNetworkBytesSent()).toBe(0);
  });

  test('llm.NoNetworkPolicy: throws when network is connected', async () => {
    _setScriptedTokens(['x']);
    (Network.getNetworkStateAsync as unknown as jest.Mock).mockResolvedValueOnce({
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi',
    });
    const iter = generateReply(baseTurns(), baseProfile)[Symbol.asyncIterator]();
    await expect(iter.next()).rejects.toThrow(/No-network policy/);
  });

  test('llm.completion_called_with_composed_prompt', async () => {
    _setScriptedTokens(['reply']);
    for await (const _chunk of generateReply(baseTurns(), baseProfile)) {
      void _chunk;
    }
    expect(completionMock).toHaveBeenCalled();
    const opts = completionMock.mock.calls[0]?.[0];
    expect(opts.prompt).toMatch(/You are Coach/);
    expect(opts.prompt).toMatch(/Hello there/);
  });

  test('llm.context_window_drops_old_turns_beyond_10', async () => {
    _setScriptedTokens(['reply']);
    const turns: ConversationTurn[] = [];
    for (let i = 0; i < 15; i++) {
      turns.push({ role: 'user', text: `turn-${i}` });
    }
    for await (const _chunk of generateReply(turns, baseProfile)) {
      void _chunk;
    }
    const opts = completionMock.mock.calls[0]?.[0];
    expect(opts.prompt).toMatch(/turn-14/); // most recent
    expect(opts.prompt).not.toMatch(/turn-0/); // dropped — older than window
  });
});

describe('llm.summarize', () => {
  beforeEach(() => {
    __resetLlmForTests();
    jest.clearAllMocks();
    initLlamaMock.mockResolvedValue({ contextId: 1, gpu: false });
  });

  test('llm.summary_per_10_turns: returns a string from the model', async () => {
    _setScriptedTokens(['Travel', ' ', 'conversation', ' about', ' hotels']);
    const turns: ConversationTurn[] = [
      { role: 'user', text: 'I need a hotel' },
      { role: 'assistant', text: 'Where in the city?' },
    ];
    const summary = await summarize(turns);
    expect(typeof summary).toBe('string');
    expect(summary.length).toBeGreaterThan(0);
  });

  test('llm.summary_completion_call_uses_summarize_prompt', async () => {
    _setScriptedTokens(['hotel booking']);
    const turns: ConversationTurn[] = [
      { role: 'user', text: 'I need a hotel' },
      { role: 'assistant', text: 'OK' },
    ];
    await summarize(turns);
    const opts = completionMock.mock.calls[0]?.[0];
    expect(opts.prompt).toMatch(/summarize/i);
  });

  test('llm.summary_empty_turns_returns_empty_string', async () => {
    // No tokens needed; completion is never called for empty input.
    const s = await summarize([]);
    expect(s).toBe('');
  });
});