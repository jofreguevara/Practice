/**
 * Smoke test — proves the Jest runner is wired end-to-end.
 * Task 1.4 acceptance: `npx jest smoke.test.ts` exits 0.
 *
 * Kept deliberately small: no imports from app code, no native modules,
 * no fixtures. If this fails, the harness itself is broken — not the code.
 */

describe('smoke', () => {
  test('jest runner is operational', () => {
    expect(1 + 1).toBe(2);
  });

  test('async tests resolve', async () => {
    const value = await Promise.resolve('ok');
    expect(value).toBe('ok');
  });
});