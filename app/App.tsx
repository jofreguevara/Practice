/**
 * app/App.tsx — RN entry, hosts Expo Router.
 *
 * The real Expo Router entry is `expo-router/entry` (configured via
 * `package.json: "main"`); this file documents the conceptual RN root
 * the design refers to in §2. If you ever swap to a custom RN entry
 * (e.g. for a pre-router splash flow), this is where to wire providers.
 *
 * Today this file is intentionally minimal: it re-exports the router's
 * Slot so Expo Router can mount its routes underneath.
 */
import { Slot } from 'expo-router';

export default function App(): React.JSX.Element {
  return <Slot />;
}