/**
 * Tests for app/(tabs)/index.tsx (chat-mvp Task 3.4).
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { createMemoryDb } from '../services/__tests__/memoryDb';
import { INIT_SQL } from '../migrations/001_init';
import { attachDb, useProfileStore } from '../state/profile';
import { useConversationStore, attachConversationDb, _resetConversationForTests } from '../state/conversation';

import TopicsScreen from '../(tabs)/index';

// Mock expo-router's useRouter so we don't need a real navigation stack.
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

describe('TopicsScreen', () => {
  afterEach(async () => {
    await act(async () => undefined);
    _resetConversationForTests();
    useProfileStore.setState(useProfileStore.getInitialState(), true);
  });

  test('topics_screen_renders_8_cards', async () => {
    const mem = boot();
    try {
      await useProfileStore.getState().hydrate();
      const { getByText } = await render(<TopicsScreen />);
      expect(getByText('Travel')).toBeTruthy();
      expect(getByText('Food')).toBeTruthy();
      expect(getByText('Work')).toBeTruthy();
      expect(getByText('Hobbies')).toBeTruthy();
      expect(getByText('Weather')).toBeTruthy();
      expect(getByText('Shopping')).toBeTruthy();
      expect(getByText('Health')).toBeTruthy();
      expect(getByText('Daily life')).toBeTruthy();
    } finally {
      mem.close();
    }
  });

  test('topics_screen_header_shows_persona_and_level', async () => {
    const mem = boot();
    try {
      await useProfileStore.getState().hydrate();
      const { getByText } = await render(<TopicsScreen />);
      expect(getByText(/Coach · Level A2/)).toBeTruthy();
    } finally {
      mem.close();
    }
  });

  test('topics_screen_tap_creates_conversation', async () => {
    const mem = boot();
    try {
      await useProfileStore.getState().hydrate();
      const { getByTestId } = await render(<TopicsScreen />);
      await act(async () => {
        fireEvent.press(getByTestId('topic-card-travel'));
      });
      // Conversation row was inserted with topic='travel'.
      const { rows } = await mem.db.execute(
        'SELECT topic FROM conversation ORDER BY started_at DESC LIMIT 1',
      );
      expect((rows[0] as { topic: string }).topic).toBe('travel');
      // Conversation store reflects the new active id.
      expect(useConversationStore.getState().activeId).not.toBeNull();
    } finally {
      mem.close();
    }
  });
});