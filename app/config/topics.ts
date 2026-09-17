/**
 * app/config/topics.ts — Topic id union + system-prompt fragment map +
 * bundled PNG asset map (chat-mvp Task 3.5).
 *
 * The prompt fragment map is consumed by `app/services/llm.ts:composeSystemPrompt`
 * (design §7). The PNG asset map is consumed by the home screen
 * (app/(tabs)/index.tsx) and TopicCard — no network fetch anywhere; every
 * PNG is bundled at build time.
 */
export type TopicId =
  | 'travel'
  | 'food'
  | 'work'
  | 'hobbies'
  | 'weather'
  | 'shopping'
  | 'health'
  | 'daily-life';

export const TOPIC_IDS: ReadonlyArray<TopicId> = [
  'travel',
  'food',
  'work',
  'hobbies',
  'weather',
  'shopping',
  'health',
  'daily-life',
];

/**
 * System-prompt fragment per topic — design §7. Bilingual-friendly by
 * construction: both EN practice and ES practice pivot around the same
 * scenario vocabulary.
 */
export const TOPIC_PROMPTS: Readonly<Record<TopicId, string>> = {
  travel:
    'Scenario: airports, hotels, customs, asking for directions, currency exchange, public transit. Use travel vocabulary and phrases.',
  food: 'Scenario: restaurants, ordering, recipes, dietary preferences, grocery shopping, kitchen items. Use food vocabulary and polite request forms.',
  work: 'Scenario: meetings, emails, job interviews, workplace small talk, time management, scheduling. Use professional but friendly register.',
  hobbies:
    'Scenario: sports, music, reading, crafts, weekend activities, creative pursuits. Use leisure vocabulary and present-tense descriptions.',
  weather:
    'Scenario: forecasts, seasons, climate, what to wear, small talk about conditions. Use weather vocabulary and comparative forms.',
  shopping:
    'Scenario: stores, prices, bargaining, returns, online shopping, trying on clothes. Use transactional language and numbers.',
  health:
    'Scenario: doctor visits, symptoms, pharmacy, exercise, mental wellness. Use health vocabulary and polite clarification requests.',
  'daily-life':
    'Scenario: routines, family, home, transportation, daily schedule. Use everyday vocabulary and time expressions.',
};

/**
 * Bundled PNG asset map — every topic id maps to its built-in
 * `require()`-able asset. Used by the home screen for <Image source={...}>.
 * The PNGs are 1024×1024 placeholder graphics (see scripts/vendor-topic-pngs.py);
 * real illustrations can replace them at any time without code changes.
 *
 * Note: the require paths resolve at bundle time. Metro inlines the bytes
 * into the bundle so there's no runtime fetch.
 */
export const TOPIC_ASSETS: Readonly<Record<TopicId, number>> = {
  travel: require('../../assets/topics/travel.png'),
  food: require('../../assets/topics/food.png'),
  work: require('../../assets/topics/work.png'),
  hobbies: require('../../assets/topics/hobbies.png'),
  weather: require('../../assets/topics/weather.png'),
  shopping: require('../../assets/topics/shopping.png'),
  health: require('../../assets/topics/health.png'),
  'daily-life': require('../../assets/topics/daily-life.png'),
};

/** CEFR-aware style hint — design §7 (used in composeSystemPrompt). */
export function levelHint(level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'): string {
  switch (level) {
    case 'A1':
      return 'Use very short sentences and the most basic high-frequency vocabulary. Avoid idioms entirely.';
    case 'A2':
      return 'Use short sentences and high-frequency vocabulary. Avoid idioms.';
    case 'B1':
      return 'Use everyday vocabulary, simple compound sentences, occasional phrasal verbs.';
    case 'B2':
      return 'Use a range of vocabulary including some phrasal verbs and common collocations. Compound-complex sentences are fine.';
    case 'C1':
      return 'Use sophisticated vocabulary and complex sentences. Idiomatic language is welcome.';
    case 'C2':
      return 'Use native-level vocabulary, idioms, and complex sentence structure as appropriate.';
    default:
      return 'Use short sentences and high-frequency vocabulary.';
  }
}