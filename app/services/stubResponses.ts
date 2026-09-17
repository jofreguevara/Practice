/**
 * app/services/stubResponses.ts
 *
 * Curated low-memory response table. When `capability.resolveModelVariant`
 * returns `variant === 'stub'` the chat screen swaps the Waveform to a
 * neutral "stub mode" indicator and the conversation flow returns one of
 * these responses instead of calling the LLM. This keeps the app usable
 * (greetings, single-turn pivots, generic continuations) on devices that
 * cannot load either GGUF.
 *
 * Source of truth: design §7 (low-memory stub response table). Eight
 * canonical entries — six topic pivots (travel, food, work, health) plus
 * greeting_en, greeting_es, generic_continue, generic_wrap.
 *
 * Selection rule: pick by `(topicId, lastUserLocale)`. If `topicId` is
 * null (no conversation started yet), use the locale-keyed greeting.
 * Otherwise look up the topic pivot; if not found, fall back to
 * `generic_continue`.
 *
 * All responses are bilingual ES+EN pairs so a Spanish-speaking user
 * practising English (and vice versa) gets the same pivot. Each entry
 * has the ES line first, then the EN line, separated by ' / '.
 */

export type StubKey =
  | 'greeting_en'
  | 'greeting_es'
  | 'travel'
  | 'food'
  | 'work'
  | 'health'
  | 'generic_continue'
  | 'generic_wrap';

export type StubLocale = 'en' | 'es';

export interface StubEntry {
  key: StubKey;
  /** Spanish line — first so a Spanish-speaking user reads it first. */
  es: string;
  /** English line. */
  en: string;
  /** Topics this pivot applies to (for the table-driven lookup). */
  topics?: ReadonlyArray<string>;
}

/**
 * The curated table. Do not edit without updating design §7 and the
 * acceptance criteria in tasks.md 2.2.
 */
export const STUB_RESPONSES: Readonly<Record<StubKey, StubEntry>> = {
  greeting_en: {
    key: 'greeting_en',
    es: '¡Hola! ¿Cómo te sientes hoy? Cuéntame sobre tu día.',
    en: 'Hi! How are you feeling today? Tell me about your day.',
  },
  greeting_es: {
    key: 'greeting_es',
    es: '¡Hola! ¿Cómo te sientes hoy? Cuéntame sobre tu día.',
    en: 'Hi! How are you feeling today? Tell me about your day.',
  },
  travel: {
    key: 'travel',
    es: '¿Has viajado a algún lugar interesante recientemente?',
    en: 'Have you traveled somewhere interesting recently?',
    topics: ['travel'],
  },
  food: {
    key: 'food',
    es: '¿Qué cocinaste o comiste hoy?',
    en: 'What did you cook or eat today?',
    topics: ['food'],
  },
  work: {
    key: 'work',
    es: '¿Cómo te fue en el trabajo hoy?',
    en: 'How was work today?',
    topics: ['work'],
  },
  health: {
    key: 'health',
    es: '¿Cómo te sientes físicamente hoy?',
    en: 'How do you feel physically today?',
    topics: ['health'],
  },
  generic_continue: {
    key: 'generic_continue',
    es: 'Cuéntame más sobre eso.',
    en: 'Tell me more about that.',
  },
  generic_wrap: {
    key: 'generic_wrap',
    es: 'Interesante. ¿Y qué pasó después?',
    en: 'Interesting. What happened next?',
  },
};

/**
 * Resolves a stub response. The picker prefers a topic pivot keyed by
 * `topicId`; if no pivot matches (or `topicId` is null), it falls back to
 * the locale-keyed greeting. The returned string is the ES+EN pair joined
 * by ' / ' so the UI can render both halves or pick one based on the
 * user's `practiceLocale`.
 *
 * @param topicId  Active topic id (matches `TopicId` in `app/state/profile.ts`),
 *                  or null when no conversation has started yet.
 * @param locale   Last detected user locale — 'en' or 'es'. Used only to
 *                  pick the greeting fallback when `topicId` is null.
 */
export function pickStubResponse(
  topicId: string | null,
  locale: StubLocale,
): string {
  if (!topicId) {
    const greeting = locale === 'es' ? STUB_RESPONSES.greeting_es : STUB_RESPONSES.greeting_en;
    return formatPair(greeting);
  }
  // Topic pivot — direct lookup then fall back to generic_continue.
  const pivot = Object.values(STUB_RESPONSES).find(
    (entry) => entry.topics && entry.topics.includes(topicId),
  );
  if (pivot) return formatPair(pivot);
  return formatPair(STUB_RESPONSES.generic_continue);
}

/**
 * Formats a stub entry as "ES / EN" with leading/trailing whitespace
 * stripped. The chat screen splits this on ' / ' to render the half
 * that matches `profile.practice_locale`.
 */
export function formatPair(entry: StubEntry): string {
  return `${entry.es} / ${entry.en}`.trim();
}

/**
 * Returns the matching locale half of a formatted pair. Useful when the
 * chat screen wants to render only one line instead of the full pair.
 */
export function pickHalf(formatted: string, locale: StubLocale): string {
  const [es, en] = formatted.split(' / ');
  if (locale === 'es') return (es ?? '').trim();
  return (en ?? es ?? '').trim();
}