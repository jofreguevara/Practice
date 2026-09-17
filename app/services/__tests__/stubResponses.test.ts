/**
 * Tests for app/services/stubResponses.ts (Task 2.2).
 *
 * Covers Jest ids from tasks.md 2.2:
 *   - stub.returns_greeting_en_when_no_topic
 *   - stub.returns_greeting_es_when_no_topic
 *   - stub.travel_pivot_matches_topic_id
 *   - stub.food_pivot_matches_topic_id
 *   - stub.work_pivot_matches_topic_id
 *   - stub.health_pivot_matches_topic_id
 *   - stub.generic_continue_when_unknown_topic
 *   - stub.format_pair_es_first
 *   - stub.pick_half_locale_es
 *   - stub.pick_half_locale_en
 */
import {
  STUB_RESPONSES,
  pickStubResponse,
  formatPair,
  pickHalf,
  type StubLocale,
} from '../stubResponses';

describe('stubResponses.STUB_RESPONSES', () => {
  test('every locale key has both es and en halves', () => {
    for (const [key, entry] of Object.entries(STUB_RESPONSES)) {
      expect(typeof entry.es).toBe('string');
      expect(entry.es.length).toBeGreaterThan(0);
      expect(typeof entry.en).toBe('string');
      expect(entry.en.length).toBeGreaterThan(0);
      expect(entry.key).toBe(key);
    }
  });

  test('all 8 stub entries are present (design §7)', () => {
    expect(Object.keys(STUB_RESPONSES).sort()).toEqual([
      'food',
      'generic_continue',
      'generic_wrap',
      'greeting_en',
      'greeting_es',
      'health',
      'travel',
      'work',
    ]);
  });
});

describe('stubResponses.pickStubResponse', () => {
  test('returns_greeting_en_when_no_topic', () => {
    const out = pickStubResponse(null, 'en');
    expect(out).toBe(STUB_RESPONSES.greeting_en.es + ' / ' + STUB_RESPONSES.greeting_en.en);
  });

  test('returns_greeting_es_when_no_topic', () => {
    const out = pickStubResponse(null, 'es');
    expect(out).toBe(STUB_RESPONSES.greeting_es.es + ' / ' + STUB_RESPONSES.greeting_es.en);
  });

  test('travel_pivot_matches_topic_id', () => {
    const out = pickStubResponse('travel', 'en');
    expect(out).toContain(STUB_RESPONSES.travel.en);
  });

  test('food_pivot_matches_topic_id', () => {
    const out = pickStubResponse('food', 'en');
    expect(out).toContain(STUB_RESPONSES.food.en);
  });

  test('work_pivot_matches_topic_id', () => {
    const out = pickStubResponse('work', 'es');
    expect(out).toContain(STUB_RESPONSES.work.es);
  });

  test('health_pivot_matches_topic_id', () => {
    const out = pickStubResponse('health', 'en');
    expect(out).toContain(STUB_RESPONSES.health.en);
  });

  test('generic_continue_when_unknown_topic', () => {
    const out = pickStubResponse('not-a-real-topic', 'en');
    expect(out).toContain(STUB_RESPONSES.generic_continue.en);
  });

  test('topics without pivots (hobbies/weather/shopping/daily-life) also fall back to generic_continue', () => {
    for (const topic of ['hobbies', 'weather', 'shopping', 'daily-life']) {
      const out = pickStubResponse(topic, 'en');
      expect(out).toContain(STUB_RESPONSES.generic_continue.en);
    }
  });
});

describe('stubResponses.formatPair + pickHalf', () => {
  test('format_pair_es_first', () => {
    const formatted = formatPair(STUB_RESPONSES.travel);
    expect(formatted).toBe(`${STUB_RESPONSES.travel.es} / ${STUB_RESPONSES.travel.en}`);
    // ES half appears before EN half.
    expect(formatted.indexOf(STUB_RESPONSES.travel.es)).toBeLessThan(
      formatted.indexOf(STUB_RESPONSES.travel.en),
    );
  });

  test('pick_half_locale_es', () => {
    const formatted = formatPair(STUB_RESPONSES.work);
    expect(pickHalf(formatted, 'es')).toBe(STUB_RESPONSES.work.es);
  });

  test('pick_half_locale_en', () => {
    const formatted = formatPair(STUB_RESPONSES.work);
    expect(pickHalf(formatted, 'en')).toBe(STUB_RESPONSES.work.en);
  });

  test('pickHalf tolerates legacy single-locale strings', () => {
    // If a future entry forgets the ' / ' separator, the function falls
    // back to the ES half rather than crashing.
    const single = 'hola amigo';
    expect(pickHalf(single, 'en' as StubLocale)).toBe('hola amigo');
  });
});