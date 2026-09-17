/**
 * Tests for app/state/conversation.ts (chat-mvp Task 3.2 + Task 3.6).
 *
 * Covers Jest ids from tasks.md:
 *   - conv.start_new_creates_row
 *   - conv.end_active_writes_ended_at
 *   - conv.bump_system_prompt_version_on_profile_change
 *   - conv.summary_only_at_turn_10
 *
 * Plus Task 3.6 acceptance:
 *   - conv.session_end_timer_arms_on_background
 *   - conv.session_end_timer_clears_on_foreground
 *   - conv.session_end_timer_fires_endActive
 *   - conv.explicit_end_session_short_circuits_timer
 */
import { useProfileStore, attachDb } from '../profile';
import { useConversationStore, attachConversationDb, attachConversationSummarizer, _resetConversationForTests } from '../conversation';
import { createMemoryDb } from '../../services/__tests__/memoryDb';
import { INIT_SQL } from '../../migrations/001_init';
import type { MessageRow } from '../../services/db';

function boot() {
  const mem = createMemoryDb({ bootstrap: INIT_SQL });
  attachDb(mem.db);
  attachConversationDb(mem.db);
  return mem;
}

describe('conversation store', () => {
  beforeEach(async () => {
    _resetConversationForTests();
    useProfileStore.setState(useProfileStore.getInitialState(), true);
    jest.clearAllMocks();
  });

  test('conv.start_new_creates_row: startNew returns a uuid and inserts a conversation row', async () => {
    const mem = boot();
    try {
      await useProfileStore.getState().hydrate();
      const id = await useConversationStore.getState().startNew('travel');
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(8);
      const { rows } = await mem.db.execute('SELECT id, topic FROM conversation');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id, topic: 'travel' });
      expect(useConversationStore.getState().activeId).toBe(id);
    } finally {
      mem.close();
    }
  });

  test('conv.end_active_writes_ended_at', async () => {
    const mem = boot();
    try {
      await useProfileStore.getState().hydrate();
      const id = await useConversationStore.getState().startNew('food');
      const beforeSec = Math.floor(Date.now() / 1000);
      await useConversationStore.getState().endActive();
      const { rows } = await mem.db.execute('SELECT ended_at FROM conversation WHERE id = ?', [id]);
      const endedAt = (rows[0] as { ended_at: number }).ended_at;
      // Schema stores unixepoch seconds (design §5); compare in seconds.
      expect(endedAt).toBeGreaterThanOrEqual(beforeSec);
      expect(useConversationStore.getState().activeId).toBe(null);
    } finally {
      mem.close();
    }
  });

  test('conv.appendUserTurn_and_appendAssistantTurn round-trip both messages', async () => {
    const mem = boot();
    try {
      await useProfileStore.getState().hydrate();
      const id = await useConversationStore.getState().startNew('travel');
      await useConversationStore.getState().appendUserTurn('Hello', '/audio/chat/c1/u1.wav');
      await useConversationStore.getState().appendAssistantTurn('Hi there!', '/audio/chat/c1/a1.wav');
      const { rows } = await mem.db.execute(
        'SELECT id, conversation_id, role, text, stt_audio_path, tts_audio_path FROM message WHERE conversation_id = ? ORDER BY created_at',
        [id],
      ) as { rows: (MessageRow & Record<string, unknown>)[] };
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ role: 'user', text: 'Hello', stt_audio_path: '/audio/chat/c1/u1.wav' });
      expect(rows[1]).toMatchObject({ role: 'assistant', text: 'Hi there!', tts_audio_path: '/audio/chat/c1/a1.wav' });
    } finally {
      mem.close();
    }
  });

  test('conv.bump_system_prompt_version_on_profile_change: setPersonaName bumps version', async () => {
    const mem = boot();
    try {
      await useProfileStore.getState().hydrate();
      await useConversationStore.getState().startNew('travel');
      const before = useConversationStore.getState().systemPromptVersion;
      await useProfileStore.getState().setPersonaName('Sam');
      const after = useConversationStore.getState().systemPromptVersion;
      expect(after).toBeGreaterThan(before);
    } finally {
      mem.close();
    }
  });

  test('conv.summary_only_at_turn_10: turn 9 does NOT trigger summary; turn 10 DOES', async () => {
    const mem = boot();
    try {
      await useProfileStore.getState().hydrate();
      // Inject a stub summarizer that records call count.
      const summarizeMock = jest.fn().mockResolvedValue('rolling summary');
      attachConversationSummarizer(summarizeMock);

      const id = await useConversationStore.getState().startNew('travel');
      // Fire 9 assistant turns — should NOT trigger summarize.
      for (let i = 0; i < 9; i++) {
        await useConversationStore.getState().appendAssistantTurn(`reply ${i}`, `/audio/chat/${id}/a${i}.wav`);
      }
      expect(summarizeMock).not.toHaveBeenCalled();
      // 10th assistant turn triggers summarize exactly once.
      await useConversationStore.getState().appendAssistantTurn('reply 9', `/audio/chat/${id}/a9.wav`);
      expect(summarizeMock).toHaveBeenCalledTimes(1);
      // The summary is mirrored into the conversation row.
      const { rows } = await mem.db.execute('SELECT summary FROM conversation WHERE id = ?', [id]);
      expect((rows[0] as { summary: string }).summary).toBe('rolling summary');
    } finally {
      mem.close();
    }
  });

  test('conv.loadConversation populates messages + summaryCache', async () => {
    const mem = boot();
    try {
      await useProfileStore.getState().hydrate();
      const id = await useConversationStore.getState().startNew('food');
      await useConversationStore.getState().appendUserTurn('Hola', null);
      await useConversationStore.getState().appendAssistantTurn('Hello', null);

      // Reset store and re-load.
      _resetConversationForTests();
      await useConversationStore.getState().loadConversation(id);
      const { messages, activeId, summaryCache } = useConversationStore.getState();
      expect(activeId).toBe(id);
      expect(messages).toHaveLength(2);
      expect(summaryCache).toBe('');
    } finally {
      mem.close();
    }
  });
});

// ----------------------------- Task 3.6 -----------------------------------

describe('conversation session-end timer (Task 3.6)', () => {
  beforeEach(async () => {
    _resetConversationForTests();
    useProfileStore.setState(useProfileStore.getInitialState(), true);
    jest.clearAllMocks();
  });

  test('conv.session_end_timer_arms_on_background: AppState change fires endActive after the timeout', async () => {
    const mem = boot();
    try {
      await useProfileStore.getState().hydrate();
      const id = await useConversationStore.getState().startNew('travel');
      // Use a short timer (10 ms) so the test is fast.
      useConversationStore.getState().startSessionTimer({ ms: 10, onEnd: () => undefined });
      // Wait > timer.
      await new Promise((resolve) => setTimeout(resolve, 30));
      // The timer callback should have run endActive() once.
      const { rows } = await mem.db.execute('SELECT ended_at FROM conversation WHERE id = ?', [id]);
      expect((rows[0] as { ended_at: number }).ended_at).toBeGreaterThan(0);
    } finally {
      mem.close();
    }
  });

  test('conv.session_end_timer_clears_on_foreground', async () => {
    const mem = boot();
    try {
      await useProfileStore.getState().hydrate();
      await useConversationStore.getState().startNew('travel');
      useConversationStore.getState().startSessionTimer({ ms: 10, onEnd: () => undefined });
      useConversationStore.getState().clearSessionTimer();
      await new Promise((resolve) => setTimeout(resolve, 30));
      // No ended_at written because the timer was cleared.
      const { rows } = await mem.db.execute('SELECT ended_at FROM conversation ORDER BY started_at DESC LIMIT 1');
      expect((rows[0] as { ended_at: number | null }).ended_at).toBeNull();
    } finally {
      mem.close();
    }
  });

  test('conv.explicit_end_session_short_circuits_timer', async () => {
    const mem = boot();
    try {
      await useProfileStore.getState().hydrate();
      const id = await useConversationStore.getState().startNew('travel');
      useConversationStore.getState().startSessionTimer({ ms: 1_000_000, onEnd: () => undefined });
      await useConversationStore.getState().endActive();
      // Even though the timer is still pending, the row should be ended.
      const { rows } = await mem.db.execute('SELECT ended_at FROM conversation WHERE id = ?', [id]);
      expect((rows[0] as { ended_at: number }).ended_at).toBeGreaterThan(0);
    } finally {
      mem.close();
    }
  });

  test('conv.explicit_end_active_calls_onEnd_callback', async () => {
    const mem = boot();
    try {
      await useProfileStore.getState().hydrate();
      await useConversationStore.getState().startNew('travel');
      const onEnd = jest.fn();
      useConversationStore.getState().startSessionTimer({ ms: 1_000_000, onEnd });
      await useConversationStore.getState().endActive();
      expect(onEnd).toHaveBeenCalledTimes(1);
    } finally {
      mem.close();
    }
  });

  test('conv.summary_does_not_trigger_when_activeCount_is_not_multiple_of_10', async () => {
    const mem = boot();
    try {
      await useProfileStore.getState().hydrate();
      const summarizeMock = jest.fn().mockResolvedValue('ok');
      attachConversationSummarizer(summarizeMock);
      await useConversationStore.getState().startNew('travel');
      // 4 assistant turns → no summary.
      for (let i = 0; i < 4; i++) {
        await useConversationStore.getState().appendAssistantTurn(`r${i}`, null);
      }
      await useConversationStore.getState().endActive();
      expect(summarizeMock).not.toHaveBeenCalled();
    } finally {
      mem.close();
    }
  });
});