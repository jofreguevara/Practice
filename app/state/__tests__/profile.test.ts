/**
 * Tests for app/state/profile.ts (Task 1.7).
 *
 * Covers Jest ids from tasks.md:
 *   - profile.hydrates_singleton_row
 *   - profile.update_flushes_to_sqlite
 *   - profile.bumpSystemPromptVersion_on_level_change
 */
import {
  useProfileStore,
  attachDb,
  selectPersona,
  selectLevel,
  selectTopic,
  selectModelVar,
  setConversationInvalidator,
} from '../profile';
import { createMemoryDb } from '../../services/__tests__/memoryDb';
import { INIT_SQL } from '../../migrations/001_init';

function bootProfile() {
  const mem = createMemoryDb({ bootstrap: INIT_SQL });
  attachDb(mem.db);
  return mem;
}

describe('profile store', () => {
  beforeEach(() => {
    // Reset the singleton store between tests. zustand stores are
    // module-level singletons; we re-attach the DB and re-hydrate to wipe
    // any state left by a previous test.
    useProfileStore.setState(useProfileStore.getInitialState(), true);
  });

  test('hydrates_singleton_row', async () => {
    const mem = bootProfile();
    try {
      // Pre-hydration: store is unhydrated with the default row.
      expect(useProfileStore.getState().hydrated).toBe(false);
      expect(selectPersona(useProfileStore.getState())).toBe('Coach');
      expect(selectLevel(useProfileStore.getState())).toBe('A2');

      await useProfileStore.getState().hydrate();
      expect(useProfileStore.getState().hydrated).toBe(true);
      expect(selectPersona(useProfileStore.getState())).toBe('Coach');
      expect(selectLevel(useProfileStore.getState())).toBe('A2');
      expect(selectTopic(useProfileStore.getState()).length).toBe(8);
    } finally {
      mem.close();
    }
  });

  test('update_flushes_to_sqlite', async () => {
    const mem = bootProfile();
    try {
      await useProfileStore.getState().hydrate();
      await useProfileStore.getState().setLevel('B1');
      await useProfileStore.getState().setPersonaName('Sam');

      // SQLite reflects both writes.
      const { rows } = await mem.db.execute(
        'SELECT level, preferences_json FROM user_profile WHERE id = 1',
      );
      expect((rows[0] as { level: string }).level).toBe('B1');
      const prefs = JSON.parse(
        (rows[0] as { preferences_json: string }).preferences_json,
      ) as { personaName: string };
      expect(prefs.personaName).toBe('Sam');

      // Store reflects both writes.
      expect(selectLevel(useProfileStore.getState())).toBe('B1');
      expect(selectPersona(useProfileStore.getState())).toBe('Sam');
    } finally {
      mem.close();
    }
  });

  test('bumpSystemPromptVersion_on_level_change', async () => {
    const mem = bootProfile();
    try {
      await useProfileStore.getState().hydrate();

      // The conversation store is not yet implemented in bootstrap; we
      // register a stub invalidator and verify the profile store calls it
      // when persona/level/locale/topics change.
      let calls = 0;
      setConversationInvalidator(() => {
        calls += 1;
      });

      await useProfileStore.getState().setLevel('C1');
      await useProfileStore.getState().setPracticeLocale('en-US');
      await useProfileStore.getState().setPersonaName('Alex');
      await useProfileStore.getState().setTopics(['travel']);

      expect(calls).toBeGreaterThanOrEqual(4);

      // A write that does NOT change the prompt should not bump.
      const callsBeforeModelSwap = calls;
      await useProfileStore.getState().setModelVariant('llama-3.2-1b');
      expect(calls).toBe(callsBeforeModelSwap);
    } finally {
      mem.close();
    }
  });

  test('selectors return stable typed values', async () => {
    const mem = bootProfile();
    try {
      await useProfileStore.getState().hydrate();
      const state = useProfileStore.getState();
      // Type-level smoke: every selector returns the expected shape.
      expect(typeof selectPersona(state)).toBe('string');
      expect(typeof selectLevel(state)).toBe('string');
      expect(Array.isArray(selectTopic(state))).toBe(true);
      expect(selectModelVar(state) === null || typeof selectModelVar(state) === 'string').toBe(
        true,
      );
    } finally {
      mem.close();
    }
  });
});