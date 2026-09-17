/**
 * Tests for app/(tabs)/chat.tsx (chat-mvp Task 3.4 + Task 3.6).
 *
 * Smoke coverage: the chat screen renders, wires the persona + level,
 * and the End session button writes `ended_at` on the active row.
 * The full STT → LLM → TTS round-trip is exercised by the per-service
 * unit tests (stt.test.ts, tts.test.ts, llm.test.ts, audio.test.ts)
 * — this test only proves the integration wiring is sound.
 */
import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react-native';
import { createMemoryDb } from '../services/__tests__/memoryDb';
import { INIT_SQL } from '../migrations/001_init';
import { useProfileStore, attachDb } from '../state/profile';
import {
  useConversationStore,
  attachConversationDb,
  _resetConversationForTests,
} from '../state/conversation';
import ChatScreen from '../(tabs)/chat';

jest.mock('expo-router', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => children,
  Stack: ({ children }: { children: React.ReactNode }) => children,
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  Slot: () => null,
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

function boot() {
  const mem = createMemoryDb({ bootstrap: INIT_SQL });
  attachDb(mem.db);
  attachConversationDb(mem.db);
  return mem;
}

describe('ChatScreen', () => {
  afterEach(async () => {
    await act(async () => undefined);
    cleanup();
    _resetConversationForTests();
    useProfileStore.setState(useProfileStore.getInitialState(), true);
  });

  test('chat_screen_renders_title_and_subtitle', async () => {
    const mem = boot();
    try {
      await useProfileStore.getState().hydrate();
      const { getByText } = await render(<ChatScreen />);
      expect(getByText('Chat')).toBeTruthy();
      expect(getByText(/Coach · es-ES · Level A2/)).toBeTruthy();
    } finally {
      mem.close();
    }
  });

  test('chat_screen_renders_end_session_button', async () => {
    const mem = boot();
    try {
      await useProfileStore.getState().hydrate();
      const { getByText, getByTestId } = await render(<ChatScreen />);
      expect(getByText('End session')).toBeTruthy();
      expect(getByTestId('end-session-button')).toBeTruthy();
    } finally {
      mem.close();
    }
  });

  test('chat_screen_end_session_writes_ended_at', async () => {
    const mem = boot();
    try {
      await useProfileStore.getState().hydrate();
      await useConversationStore.getState().startNew('food');
      const { getByTestId } = await render(<ChatScreen />);
      await act(async () => {
        fireEvent.press(getByTestId('end-session-button'));
      });
      const { rows } = await mem.db.execute(
        'SELECT ended_at FROM conversation ORDER BY started_at DESC LIMIT 1',
      );
      const endedAt = (rows[0] as { ended_at: number | null }).ended_at;
      expect(endedAt).not.toBeNull();
    } finally {
      mem.close();
    }
  });

  test('chat_screen_renders_hold_to_talk', async () => {
    const mem = boot();
    try {
      await useProfileStore.getState().hydrate();
      const { getByTestId } = await render(<ChatScreen />);
      expect(getByTestId('hold-to-talk')).toBeTruthy();
    } finally {
      mem.close();
    }
  });
});