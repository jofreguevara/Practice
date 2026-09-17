/**
 * app/state/profile.ts — Zustand store for the singleton user profile.
 *
 * Hydration contract (design §6):
 *   - On boot, `app/_layout.tsx` calls `hydrate()` once before any tab renders.
 *   - `hydrate()` reads the singleton row via `db.getProfile()` and seeds the store.
 *   - Every mutation flushes to SQLite via `db.updateProfile(patch)` in the same tick.
 *   - The chat tab is gated on `hydrated === true`.
 *
 * Selectors exposed for cheap re-render bindings (selectors are pure, no DB hit).
 *
 * Invalidations on write (per design §6):
 *   - personaName / level / practiceLocale / topics / progress.summary changes
 *     bump `useConversationStore.bumpSystemPromptVersion()`. The conversation
 *     store is not in this sub-change (chat-mvp Task 3.2), so we expose a
 *     `setConversationInvalidator` hook the chat-mvp store registers on boot.
 */
import { create } from 'zustand';
import {
  getProfile,
  updateProfile,
  type UserProfileRow,
  type Db,
} from '../services/db';

export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type BCP47 = 'en-US' | 'en-GB' | 'es-ES' | 'es-MX' | 'auto';
export type TopicId =
  | 'travel'
  | 'food'
  | 'work'
  | 'hobbies'
  | 'weather'
  | 'shopping'
  | 'health'
  | 'daily-life';

export interface ProfilePreferences {
  personaName: string;
  ttsVoiceId: string | null;
  ttsRate: number;
  sttSensitivity: number;
  modelVariant: 'llama-3.2-1b' | 'qwen2.5-1.5b' | 'stub' | null;
  encryptionEnabled: boolean;
  lowMemoryMode: boolean;
  [key: string]: unknown;
}

export interface ProfileProgress {
  turnCount: number;
  sessionsCompleted: number;
  totalMinutes: number;
  wordsLearned: number;
  streakDays: number;
  summary: string;
  [key: string]: unknown;
}

/** JSON-decoded view of the singleton row. */
export interface Profile {
  id: 1;
  display_name: string;
  primary_locale: BCP47;
  practice_locale: BCP47;
  level: CEFRLevel;
  topics: TopicId[];
  preferences: ProfilePreferences;
  progress: ProfileProgress;
}

const DEFAULT_TOPICS: TopicId[] = [
  'travel',
  'food',
  'work',
  'hobbies',
  'weather',
  'shopping',
  'health',
  'daily-life',
];

const DEFAULT_PREFERENCES: ProfilePreferences = {
  personaName: 'Coach',
  ttsVoiceId: null,
  ttsRate: 1.0,
  sttSensitivity: 0.5,
  modelVariant: null,
  encryptionEnabled: false,
  lowMemoryMode: false,
};

const DEFAULT_PROGRESS: ProfileProgress = {
  turnCount: 0,
  sessionsCompleted: 0,
  totalMinutes: 0,
  wordsLearned: 0,
  streakDays: 0,
  summary: '',
};

function rowToProfile(row: UserProfileRow): Profile {
  let topics: TopicId[] = DEFAULT_TOPICS;
  let preferences: ProfilePreferences = DEFAULT_PREFERENCES;
  let progress: ProfileProgress = DEFAULT_PROGRESS;
  try {
    const parsed = JSON.parse(row.topics_json);
    // Fresh installs have `topics_json = '[]'`; treat that as "all 8 seeded".
    if (Array.isArray(parsed) && parsed.length > 0) topics = parsed as TopicId[];
  } catch {
    /* leave defaults */
  }
  try {
    const parsed = JSON.parse(row.preferences_json);
    if (parsed && typeof parsed === 'object') {
      preferences = { ...DEFAULT_PREFERENCES, ...(parsed as object) } as ProfilePreferences;
    }
  } catch {
    /* leave defaults */
  }
  try {
    const parsed = JSON.parse(row.progress_json);
    if (parsed && typeof parsed === 'object') {
      progress = { ...DEFAULT_PROGRESS, ...(parsed as object) } as ProfileProgress;
    }
  } catch {
    /* leave defaults */
  }
  return {
    id: 1,
    display_name: row.display_name,
    primary_locale: row.primary_locale as BCP47,
    practice_locale: row.practice_locale as BCP47,
    level: row.level,
    topics,
    preferences,
    progress,
  };
}

export interface ProfileState {
  row: Profile;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setLevel: (l: CEFRLevel) => Promise<void>;
  setPracticeLocale: (l: BCP47) => Promise<void>;
  setPersonaName: (n: string) => Promise<void>;
  setModelVariant: (v: NonNullable<ProfilePreferences['modelVariant']>) => Promise<void>;
  setEncryptionEnabled: (on: boolean) => Promise<void>;
  setLowMemoryMode: (on: boolean) => Promise<void>;
  setTopics: (topics: TopicId[]) => Promise<void>;
  bumpProgress: (patch: Partial<ProfileProgress>) => Promise<void>;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  row: rowToProfile({
    id: 1,
    display_name: 'Learner',
    primary_locale: 'en-US',
    practice_locale: 'es-ES',
    level: 'A2',
    topics_json: '[]',
    preferences_json: JSON.stringify({ personaName: 'Coach' }),
    progress_json: '{}',
    created_at: 0,
    updated_at: 0,
  }),
  hydrated: false,
  async hydrate() {
    if (get().hydrated) return;
    const db = ensureDb();
    const row = await getProfile(db);
    set({ row: rowToProfile(row), hydrated: true });
  },
  async setLevel(l) {
    const db = ensureDb();
    await updateProfile(db, { level: l });
    set((s) => ({ row: { ...s.row, level: l } }));
    invalidateConversationSystem();
  },
  async setPracticeLocale(l) {
    const db = ensureDb();
    await updateProfile(db, { practice_locale: l });
    set((s) => ({ row: { ...s.row, practice_locale: l } }));
    invalidateConversationSystem();
  },
  async setPersonaName(n) {
    const db = ensureDb();
    const prev = get().row.preferences;
    const next: ProfilePreferences = { ...prev, personaName: n };
    await updateProfile(db, { preferences_json: JSON.stringify(next) });
    set((s) => ({ row: { ...s.row, preferences: next } }));
    invalidateConversationSystem();
  },
  async setModelVariant(v) {
    const db = ensureDb();
    const prev = get().row.preferences;
    const next: ProfilePreferences = { ...prev, modelVariant: v };
    await updateProfile(db, { preferences_json: JSON.stringify(next) });
    set((s) => ({ row: { ...s.row, preferences: next } }));
  },
  async setEncryptionEnabled(on) {
    const db = ensureDb();
    const prev = get().row.preferences;
    const next: ProfilePreferences = { ...prev, encryptionEnabled: on };
    await updateProfile(db, { preferences_json: JSON.stringify(next) });
    set((s) => ({ row: { ...s.row, preferences: next } }));
  },
  async setLowMemoryMode(on) {
    const db = ensureDb();
    const prev = get().row.preferences;
    const next: ProfilePreferences = { ...prev, lowMemoryMode: on };
    await updateProfile(db, { preferences_json: JSON.stringify(next) });
    set((s) => ({ row: { ...s.row, preferences: next } }));
  },
  async setTopics(topics) {
    const db = ensureDb();
    await updateProfile(db, { topics_json: JSON.stringify(topics) });
    set((s) => ({ row: { ...s.row, topics } }));
    invalidateConversationSystem();
  },
  async bumpProgress(patch) {
    const db = ensureDb();
    const merged: ProfileProgress = { ...get().row.progress, ...patch };
    await updateProfile(db, { progress_json: JSON.stringify(merged) });
    set((s) => ({ row: { ...s.row, progress: merged } }));
    if (patch.summary !== undefined) invalidateConversationSystem();
  },
}));

/* --------------------------- select / wire Db ----------------------------- */

export const selectPersona = (s: ProfileState): string => s.row.preferences.personaName;
export const selectLevel = (s: ProfileState): CEFRLevel => s.row.level;
export const selectTopic = (s: ProfileState): TopicId[] => s.row.topics;
export const selectModelVar = (
  s: ProfileState,
): NonNullable<ProfilePreferences['modelVariant']> | null =>
  s.row.preferences.modelVariant;
export const selectPracticeLocale = (s: ProfileState): BCP47 => s.row.practice_locale;
export const selectHydrated = (s: ProfileState): boolean => s.hydrated;

/**
 * The Db instance used by the profile store. `_layout.tsx` calls
 * `attachDb(db)` once at boot. Until then, the store is in pre-hydration
 * state — mutations should not be invoked from boot code paths.
 */
let _db: Db | null = null;
export function attachDb(db: Db): void {
  _db = db;
}
function ensureDb(): Db {
  if (!_db) {
    throw new Error(
      'profile store used before attachDb(db). Wire attachDb(db) in app/_layout.tsx.',
    );
  }
  return _db;
}

/**
 * The conversation store lives in chat-mvp (Task 3.2) but profile writes
 * already need to invalidate it. We expose a tiny hook the conversation
 * store can register so profile mutations propagate without circular imports.
 */
let _invalidateConversation: (() => void) | null = null;
export function setConversationInvalidator(fn: () => void): void {
  _invalidateConversation = fn;
}
function invalidateConversationSystem(): void {
  if (_invalidateConversation) _invalidateConversation();
}