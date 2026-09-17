/* eslint-env node */
/**
 * Jest setup — runs once per test file before describe blocks.
 *
 * Kept intentionally minimal. We rely on `moduleNameMapper` in
 * package.json to redirect native bindings (op-sqlite, whisper.rn,
 * llama.rn, expo-secure-store, expo-file-system, react-native) to
 * pure-JS stubs in `__mocks__/`.
 *
 * Why not import @testing-library/react-native here: pulling it in adds a
 * hard dependency on react-test-renderer for every test file (including
 * pure-JS db/state tests that don't render). Test files that need it
 * should import it directly.
 */

// Force tests to opt into a DB implementation; default is the in-memory shim.
process.env.PRACTICE_DB_DRIVER = process.env.PRACTICE_DB_DRIVER || 'memory';