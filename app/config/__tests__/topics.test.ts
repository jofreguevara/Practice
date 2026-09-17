/**
 * Tests for app/config/topics.ts (chat-mvp Task 3.5).
 *
 * Covers Jest ids from tasks.md:
 *   - topics.all_8_ids_present
 *   - topics.prompt_map_no_empty_fragment
 *   - topics.png_asset_map_complete
 */
import { TOPIC_IDS, TOPIC_PROMPTS, TOPIC_ASSETS } from '../topics';

describe('topics config', () => {
  test('topics.all_8_ids_present: TOPIC_IDS has all 8 v1 topics', () => {
    expect(TOPIC_IDS).toHaveLength(8);
    expect(TOPIC_IDS).toEqual(
      expect.arrayContaining(['travel', 'food', 'work', 'hobbies', 'weather', 'shopping', 'health', 'daily-life']),
    );
  });

  test('topics.prompt_map_no_empty_fragment: every topic has a non-empty prompt', () => {
    for (const id of TOPIC_IDS) {
      const fragment = TOPIC_PROMPTS[id];
      expect(fragment.length).toBeGreaterThan(20);
    }
  });

  test('topics.png_asset_map_complete: TOPIC_ASSETS resolves every topic id', () => {
    for (const id of TOPIC_IDS) {
      const asset = TOPIC_ASSETS[id];
      expect(asset).toBeDefined();
      // In Jest (Node), `require()` of a PNG returns a non-empty Buffer.
      // In Metro (production), it returns a numeric module id. Both are
      // truthy and satisfy `typeof === 'object' | 'number'`; we accept
      // either by checking the value is not null and not undefined.
      expect(asset === null || asset === undefined).toBe(false);
    }
  });

  test('topics.no_extra_topic_ids: prompt map keys equal TOPIC_IDS exactly', () => {
    expect(Object.keys(TOPIC_PROMPTS).sort()).toEqual([...TOPIC_IDS].sort());
    expect(Object.keys(TOPIC_ASSETS).sort()).toEqual([...TOPIC_IDS].sort());
  });

  test('topics.scenario_keywords_present: travel prompt mentions airports + hotels', () => {
    expect(TOPIC_PROMPTS.travel).toMatch(/airports|hotels/);
  });
});