/**
 * Tests for the Settings screens (chat-mvp Task 3.4).
 *   - (tabs)/settings.tsx (hub)
 *   - settings/conversation.tsx (persona + voice locale)
 *   - settings/models.tsx (variant picker)
 *   - settings/privacy.tsx (encryption + low-memory + retention + actions)
 */
import React from 'react';
import { act, cleanup, render } from '@testing-library/react-native';
import { createMemoryDb } from '../services/__tests__/memoryDb';
import { INIT_SQL } from '../migrations/001_init';
import { useProfileStore, attachDb } from '../state/profile';

import SettingsScreen from '../(tabs)/settings';
import ConversationSettingsScreen from '../settings/conversation';
import ModelsSettingsScreen from '../settings/models';
import PrivacySettingsScreen from '../settings/privacy';

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
  return mem;
}

describe('Settings hub', () => {
  afterEach(async () => {
    await act(async () => undefined);
    cleanup();
    useProfileStore.setState(useProfileStore.getInitialState(), true);
  });

  test('settings_hub_lists_three_sections', async () => {
    const mem = boot();
    try {
      await useProfileStore.getState().hydrate();
      const { getByText } = await render(<SettingsScreen />);
      expect(getByText('Conversation')).toBeTruthy();
      expect(getByText('Models')).toBeTruthy();
      expect(getByText('Privacy')).toBeTruthy();
    } finally {
      mem.close();
    }
  });
});

describe('Settings → Conversation', () => {
  afterEach(async () => {
    await act(async () => undefined);
    cleanup();
    useProfileStore.setState(useProfileStore.getInitialState(), true);
  });

  test('conversation_settings_renders_persona_input', async () => {
    const mem = boot();
    try {
      await useProfileStore.getState().hydrate();
      const { getByTestId, getByText } = await render(<ConversationSettingsScreen />);
      expect(getByTestId('conversation-persona-input')).toBeTruthy();
      expect(getByText('Voice locale')).toBeTruthy();
      expect(getByTestId('conversation-save')).toBeTruthy();
    } finally {
      mem.close();
    }
  });

  test('conversation_settings_renders_all_4_locales', async () => {
    const mem = boot();
    try {
      await useProfileStore.getState().hydrate();
      const { getByTestId } = await render(<ConversationSettingsScreen />);
      expect(getByTestId('locale-en-US')).toBeTruthy();
      expect(getByTestId('locale-en-GB')).toBeTruthy();
      expect(getByTestId('locale-es-ES')).toBeTruthy();
      expect(getByTestId('locale-es-MX')).toBeTruthy();
    } finally {
      mem.close();
    }
  });
});

describe('Settings → Models', () => {
  afterEach(async () => {
    await act(async () => undefined);
    cleanup();
    useProfileStore.setState(useProfileStore.getInitialState(), true);
  });

  test('models_settings_lists_3_variants', async () => {
    const mem = boot();
    try {
      await useProfileStore.getState().hydrate();
      const { getByTestId, getByText } = await render(<ModelsSettingsScreen />);
      expect(getByTestId('model-variant-llama-3.2-1b')).toBeTruthy();
      expect(getByTestId('model-variant-qwen2.5-1.5b')).toBeTruthy();
      expect(getByTestId('model-variant-stub')).toBeTruthy();
      expect(getByText(/Apply on next launch/)).toBeTruthy();
    } finally {
      mem.close();
    }
  });
});

describe('Settings → Privacy', () => {
  afterEach(async () => {
    await act(async () => undefined);
    cleanup();
    useProfileStore.setState(useProfileStore.getInitialState(), true);
  });

  test('privacy_settings_renders_toggles_and_actions', async () => {
    const mem = boot();
    try {
      await useProfileStore.getState().hydrate();
      const { getByTestId, getByText } = await render(<PrivacySettingsScreen />);
      expect(getByTestId('encryption-toggle')).toBeTruthy();
      expect(getByTestId('low-memory-toggle')).toBeTruthy();
      expect(getByTestId('retention-24h')).toBeTruthy();
      expect(getByTestId('retention-keep')).toBeTruthy();
      expect(getByTestId('export-data')).toBeTruthy();
      expect(getByTestId('delete-data')).toBeTruthy();
      expect(getByText('Audio retention')).toBeTruthy();
    } finally {
      mem.close();
    }
  });
});