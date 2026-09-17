/**
 * app/__tests__/app-render.test.tsx — minimal render smoke for the tabs.
 *
 * Tasks 1.8 acceptance criterion: "npx expo start --dev-client boots to a
 * placeholder chat screen". We can't drive `expo start` from Jest (no
 * Metro runtime in Node), but we CAN render the tab screens against the
 * mocked native modules + a real profile store, and assert that:
 *   - the topics placeholder lists the 8 seeded topics
 *   - the chat placeholder reflects the hydrated profile
 *   - the settings placeholder reflects the encrypted/low-memory toggles
 *
 * This is the minimum render coverage Task 1.8 asks for; richer component
 * tests land in chat-mvp (Task 3.3 / 3.4).
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { createMemoryDb } from '../services/__tests__/memoryDb';
import { INIT_SQL } from '../migrations/001_init';
import { attachDb, useProfileStore } from '../state/profile';

import TopicsScreen from '../(tabs)/index';
import ChatScreen from '../(tabs)/chat';
import SettingsScreen from '../(tabs)/settings';

// Mock expo-router hooks so the screen components think they are mounted
// inside a tab navigator.
jest.mock('expo-router', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => children,
  Stack: ({ children }: { children: React.ReactNode }) => children,
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  Slot: () => null,
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

function bootProfile() {
  const mem = createMemoryDb({ bootstrap: INIT_SQL });
  attachDb(mem.db);
  return mem;
}

describe('app screens', () => {
  beforeEach(() => {
    useProfileStore.setState(useProfileStore.getInitialState(), true);
  });

  test('topics placeholder renders 8 seeded topics', async () => {
    const mem = bootProfile();
    try {
      await useProfileStore.getState().hydrate();
      const { getByText } = await render(<TopicsScreen />);
      // 8 topic labels from the TopicsScreen (chat-mvp Task 3.4)
      for (const label of [
        'Travel',
        'Food',
        'Work',
        'Hobbies',
        'Weather',
        'Shopping',
        'Health',
        'Daily life',
      ]) {
        expect(getByText(label)).toBeTruthy();
      }
    } finally {
      mem.close();
    }
  });

  test('chat placeholder reflects hydrated profile', async () => {
    const mem = bootProfile();
    try {
      await useProfileStore.getState().hydrate();
      const { getByText } = await render(<ChatScreen />);
      // The chat screen header now shows 'Coach · es-ES · Level A2'
      // (Task 3.4: full chat host).
      expect(getByText(/Coach · es-ES · Level A2/)).toBeTruthy();
    } finally {
      mem.close();
    }
  });

  test('settings placeholder reflects profile toggles', async () => {
    const mem = bootProfile();
    try {
      await useProfileStore.getState().hydrate();
      const { getByText } = await render(<SettingsScreen />);
      // The settings hub now renders 3 row titles (Conversation / Models /
      // Privacy) — Task 3.4. The per-toggle copy lives on the Privacy
      // sub-screen, not the hub.
      expect(getByText('Conversation')).toBeTruthy();
      expect(getByText('Models')).toBeTruthy();
      expect(getByText('Privacy')).toBeTruthy();
    } finally {
      mem.close();
    }
  });
});