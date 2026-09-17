/**
 * app/state/conversation.ts — Zustand active-conversation store
 * (chat-mvp Tasks 3.2 + 3.6).
 *
 * Binds the chat screen to the `conversation` + `message` SQLite tables.
 * Owns the per-10-turn summarization hook (design §6 invalidation rule),
 * the session-end timer (specs/conversation.md REQ-3 hardener), and the
 * `systemPromptVersion` counter that the chat screen reads to know when
 * to re-compose the LLM system prompt.
 *
 * Specs: conversation.md REQ-1..3, llm.md REQ-3, user-profile.md REQ-3;
 * design §6 (state), §7 (system-prompt template).
 */
import { create } from 'zustand';
import { setConversationInvalidator } from './profile';
import type { ProfileContext, ConversationTurn } from '../services/llm';
import { summarize as defaultSummarize } from '../services/llm';
import type { Db, MessageRow, MessageInsert } from '../services/db';
import {
  insertMessage,
  executeTyped,
} from '../services/db';
import type { TopicId } from '../config/topics';

/** Lightweight in-store message shape (the DB row minus internal cols). */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  sttAudioPath: string | null;
  ttsAudioPath: string | null;
  createdAt: number;
}

export interface ConversationState {
  activeId: string | null;
  messages: ChatMessage[];
  systemPromptVersion: number;
  summaryCache: string;
  /** Timer handle for the 5-minute session-end timer (Task 3.6). */
  sessionTimer: ReturnType<typeof setTimeout> | null;
  /** Callback fired by `endActive` (used by the chat screen's AppState listener). */
  sessionEndCallback: (() => void) | null;

  loadConversation: (id: string) => Promise<void>;
  startNew: (topic: TopicId) => Promise<string>;
  endActive: () => Promise<void>;
  appendUserTurn: (text: string, audioPath: string | null) => Promise<void>;
  appendAssistantTurn: (text: string, audioPath: string | null) => Promise<void>;
  bumpSystemPromptVersion: () => void;

  /** Task 3.6 — session-end timer management. */
  startSessionTimer: (opts: { ms?: number; onEnd?: () => void }) => void;
  clearSessionTimer: () => void;
}

/* ------------------------------ internals --------------------------------- */

let _db: Db | null = null;
let _summarize: (turns: ConversationTurn[]) => Promise<string> = defaultSummarize;
let _sessionTimerMs = 5 * 60 * 1000;

export function attachConversationDb(db: Db): void {
  _db = db;
}

export function attachConversationSummarizer(
  fn: (turns: ConversationTurn[]) => Promise<string>,
): void {
  _summarize = fn;
}

export function _setSessionTimerMsForTests(ms: number): void {
  _sessionTimerMs = ms;
}

function ensureDb(): Db {
  if (!_db) {
    throw new Error(
      'conversation store used before attachConversationDb(db). Wire it in app/_layout.tsx.',
    );
  }
  return _db;
}

function uuid(): string {
  // RN/Hermes exposes globalThis.crypto; tests run in Node 20+ where the
  // same is available. Falls back to Math.random for the unlikely case
  // where neither is present.
  const cryptoObj: Crypto | undefined =
    typeof globalThis !== 'undefined' && 'crypto' in globalThis
      ? ((globalThis as unknown as { crypto?: Crypto }).crypto ?? undefined)
      : undefined;
  if (cryptoObj) {
    const buf = new Uint8Array(16);
    cryptoObj.getRandomValues(buf);
    buf[6] = (buf[6]! & 0x0f) | 0x40;
    buf[8] = (buf[8]! & 0x3f) | 0x80;
    const h = Array.from(buf).map((b) => b.toString(16).padStart(2, '0'));
    return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10, 16).join('')}`;
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function rowToMessage(r: MessageRow): ChatMessage {
  return {
    id: r.id,
    role: r.role,
    text: r.text,
    sttAudioPath: r.stt_audio_path,
    ttsAudioPath: r.tts_audio_path,
    createdAt: r.created_at,
  };
}

/* -------------------------------- store ---------------------------------- */

export const useConversationStore = create<ConversationState>((set, get) => ({
  activeId: null,
  messages: [],
  systemPromptVersion: 0,
  summaryCache: '',
  sessionTimer: null,
  sessionEndCallback: null,

  async loadConversation(id) {
    const db = ensureDb();
    const { rows } = await executeTyped<MessageRow & Record<string, unknown>>(
      db,
      'SELECT id, conversation_id, role, text, stt_audio_path, tts_audio_path, created_at, tokens_used FROM message WHERE conversation_id = ? ORDER BY created_at ASC',
      [id],
    );
    const summaryRes = await executeTyped<{ summary: string | null }>(
      db,
      'SELECT summary FROM conversation WHERE id = ?',
      [id],
    );
    set({
      activeId: id,
      messages: rows.map((r) => rowToMessage(r as unknown as MessageRow)),
      summaryCache: summaryRes.rows[0]?.summary ?? '',
      systemPromptVersion: get().systemPromptVersion + 1,
    });
  },

  async startNew(topic) {
    const db = ensureDb();
    const id = uuid();
    await db.execute(
      'INSERT INTO conversation (id, topic, started_at) VALUES (?, ?, ?)',
      [id, topic, Math.floor(Date.now() / 1000)],
    );
    set({
      activeId: id,
      messages: [],
      summaryCache: '',
      systemPromptVersion: get().systemPromptVersion + 1,
    });
    return id;
  },

  async endActive() {
    const state = get();
    if (state.activeId === null) return;
    const db = ensureDb();
    const id = state.activeId;
    const nowSec = Math.floor(Date.now() / 1000);
    await db.execute('UPDATE conversation SET ended_at = ? WHERE id = ?', [nowSec, id]);
    // Session-end summarizer hardener (specs/conversation.md REQ-3):
    //   fire only when active conversation length is a positive multiple of 10.
    const assistantCount = state.messages.filter((m) => m.role === 'assistant').length;
    if (assistantCount > 0 && assistantCount % 10 === 0) {
      try {
        const summary = await _summarize(
          state.messages.map((m) => ({ role: m.role, text: m.text })),
        );
        await db.execute('UPDATE conversation SET summary = ? WHERE id = ?', [summary, id]);
        set({ summaryCache: summary });
      } catch (err) {
        console.warn('[conversation] session-end summarizer failed:', err);
      }
    }
    // Fire the explicit end callback if one was registered via startSessionTimer.
    if (state.sessionTimer) {
      const t = state.sessionTimer;
      set({ sessionTimer: null });
      clearTimeout(t);
    }
    if (state.sessionEndCallback) {
      const cb = state.sessionEndCallback;
      set({ sessionEndCallback: null });
      try {
        cb();
      } catch (err) {
        console.warn('[conversation] sessionEndCallback threw:', err);
      }
    }
    set({ activeId: null });
  },

  async appendUserTurn(text, audioPath) {
    await appendTurn(set, get, 'user', text, audioPath, null);
  },

  async appendAssistantTurn(text, audioPath) {
    await appendTurn(set, get, 'assistant', text, null, audioPath);
  },

  bumpSystemPromptVersion() {
    set({ systemPromptVersion: get().systemPromptVersion + 1 });
  },

  startSessionTimer({ ms, onEnd }) {
    const existing = get().sessionTimer;
    if (existing) clearTimeout(existing);
    const handle = setTimeout(async () => {
      try {
        await get().endActive();
      } finally {
        if (onEnd) onEnd();
      }
    }, ms ?? _sessionTimerMs);
    set({ sessionTimer: handle, sessionEndCallback: onEnd ?? null });
  },

  clearSessionTimer() {
    const t = get().sessionTimer;
    if (t) {
      clearTimeout(t);
      set({ sessionTimer: null });
    }
  },
}));

/* --------------------------- append helper -------------------------------- */

async function appendTurn(
  set: (partial: Partial<ConversationState>) => void,
  get: () => ConversationState,
  role: 'user' | 'assistant',
  text: string,
  sttAudioPath: string | null,
  ttsAudioPath: string | null,
): Promise<void> {
  const state = get();
  if (state.activeId === null) {
    throw new Error('appendTurn called without an active conversation — call startNew() first');
  }
  const db = ensureDb();
  const message: MessageInsert = {
    conversation_id: state.activeId,
    role,
    text,
    stt_audio_path: sttAudioPath,
    tts_audio_path: ttsAudioPath,
    created_at: Math.floor(Date.now() / 1000),
  };
  const id = await insertMessage(db, message);
  const newMessages: ChatMessage[] = [
    ...state.messages,
    {
      id,
      role,
      text,
      sttAudioPath,
      ttsAudioPath,
      createdAt: message.created_at,
    },
  ];
  // Build the next-state patch.
  const patch: Partial<ConversationState> = {
    messages: newMessages,
  };
  // Per-10-turn summarizer (specs/llm.md REQ-3): fire after every 10th
  // ASSISTANT turn. We use the total assistant count from `newMessages`
  // because each assistant turn appends one new assistant message.
  if (role === 'assistant') {
    const assistantCount = newMessages.filter((m) => m.role === 'assistant').length;
    if (assistantCount > 0 && assistantCount % 10 === 0) {
      // Fire-and-forget summary write to keep the chat responsive; we
      // await the db.write inside a try/catch but don't block the turn.
      void runPerTurnSummary(newMessages, state.activeId, db);
    }
  }
  set(patch);
}

async function runPerTurnSummary(
  messages: ChatMessage[],
  conversationId: string,
  db: Db,
): Promise<void> {
  try {
    const turns: ConversationTurn[] = messages.map((m) => ({
      role: m.role,
      text: m.text,
    }));
    const summary = await _summarize(turns);
    await db.execute('UPDATE conversation SET summary = ? WHERE id = ?', [
      summary,
      conversationId,
    ]);
    useConversationStore.setState({ summaryCache: summary });
  } catch (err) {
    console.warn('[conversation] per-10-turn summarizer failed:', err);
  }
}

/* ---------------------- profile invalidation wire ------------------------- */

// The profile store already calls `_invalidateConversation` on persona /
// level / locale / topics changes (Sub-change 1). Wire our
// `bumpSystemPromptVersion` to it so the next LLM turn re-composes the
// prompt without the chat screen needing to import both stores.
setConversationInvalidator(() => {
  useConversationStore.getState().bumpSystemPromptVersion();
});

/* ------------------------------ test seam --------------------------------- */

export function _resetConversationForTests(): void {
  useConversationStore.setState({
    activeId: null,
    messages: [],
    systemPromptVersion: 0,
    summaryCache: '',
    sessionTimer: null,
    sessionEndCallback: null,
  });
  const t = useConversationStore.getState().sessionTimer;
  if (t) clearTimeout(t);
  // _db is intentionally NOT cleared — it represents the active database
  // binding wired by `_layout.tsx` / `boot()` and survives resets.
  _summarize = defaultSummarize;
  _sessionTimerMs = 5 * 60 * 1000;
}

/** Re-export the LLM ProfileContext type so the chat screen has a single import. */
export type { ProfileContext };