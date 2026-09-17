/**
 * app/_layout.tsx — Expo Router root layout.
 *
 * Runs the bootstrap gate before any tab renders:
 *   1. open + migrate the SQLite database (via the better-sqlite3 shim in
 *      Jest, op-sqlite on device) — surfaced as a blocking
 *      "Storage error — reinstall required" screen on migration failure.
 *   2. Attach the Db to the profile store so hydration can read it.
 *   3. Download + SHA-256 verify the model binaries on first launch
 *      (one-shot, gated to a single invocation per install). The
 *      progress UI is rendered here; on error we surface a retry button.
 *   4. Hydrate the profile store from the singleton row.
 *   5. Render the (tabs) route group; the chat tab blocks until
 *      `useProfileStore.hydrated === true`.
 *
 * NoNetworkPolicy (design §1) gates every native-binding call. The only
 * exception is the first-launch download itself, which is performed
 * here under a documented exemption (`label === 'allowed'` in
 * `assertNoNetwork`). After step 3 the app is fully offline-capable.
 */
import { useEffect, useState, useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { bootDatabase, attachFs, STORAGE_ERROR_MESSAGE, type Db } from './services/db';
import { useProfileStore, attachDb, setConversationInvalidator } from './state/profile';
import { attachConversationDb } from './state/conversation';
import {
  ensureModelsInstalled,
  getLastDownloadError,
  getModelsDownloaded,
  type ModelDownloadProgress,
} from './services/modelDownloader';
import { ModelDownloadProgressView } from './components/ModelDownloadProgress';

// Real `expo-file-system` is wired in chat-mvp. For the bootstrap we only
// need a no-op fs so `attachFs` doesn't throw if `pruneOrphanAudio` runs
// before the real fs is wired (it currently does — see services/db.ts).
import * as FileSystem from 'expo-file-system';
attachFs({
  list: () => [],
  delete: async () => undefined,
});
// Reference the import to silence unused-lts.
void FileSystem;

type DownloadPhase =
  | { kind: 'pending' }
  | { kind: 'downloading'; progress: ModelDownloadProgress }
  | { kind: 'done' }
  | { kind: 'error'; message: string };

export default function RootLayout(): React.JSX.Element {
  const [bootError, setBootError] = useState<string | null>(null);
  const [downloadPhase, setDownloadPhase] = useState<DownloadPhase>({
    kind: 'pending',
  });
  const hydrated = useProfileStore((s) => s.hydrated);
  const hydrate = useProfileStore((s) => s.hydrate);

  const runDownload = useCallback(async (): Promise<void> => {
    setDownloadPhase({ kind: 'downloading', progress: blankProgress() });
    try {
      await ensureModelsInstalled((p) => {
        setDownloadPhase({ kind: 'downloading', progress: p });
      });
      setDownloadPhase({ kind: 'done' });
    } catch (err) {
      const message =
        getLastDownloadError() ??
        (err instanceof Error ? err.message : 'Model download failed');
      setDownloadPhase({ kind: 'error', message });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db: Db = await bootDatabase();
        attachDb(db);
        attachConversationDb(db);
        if (cancelled) return;
        const alreadyInstalled = await getModelsDownloaded();
        if (alreadyInstalled) {
          setDownloadPhase({ kind: 'done' });
        } else {
          await runDownload();
        }
        if (cancelled) return;
        await hydrate();
      } catch (err) {
        if (!cancelled) {
          setBootError(STORAGE_ERROR_MESSAGE);
          console.error('[practice] boot failed:', err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // runDownload is stable (empty dep list) — only mount the boot effect once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrate]);

  // Block the tab bar until hydration completes (design §6 hydration rule).
  if (bootError) {
    return (
      <View style={styles.center} accessibilityRole="alert">
        <Text style={styles.title}>{bootError}</Text>
        <Text style={styles.body}>
          The app could not start its local database. Please reinstall to reset
          on-device storage.
        </Text>
      </View>
    );
  }

  if (downloadPhase.kind === 'error') {
    return (
      <View style={styles.center} accessibilityRole="alert">
        <Text style={styles.title}>Couldn't download models</Text>
        <Text style={styles.body}>{downloadPhase.message}</Text>
        <Pressable
          onPress={() => {
            void runDownload();
          }}
          style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
          accessibilityRole="button"
        >
          <Text style={styles.retryLabel}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (downloadPhase.kind === 'downloading' || downloadPhase.kind === 'pending') {
    const verifying = downloadPhase.kind === 'downloading' &&
      downloadPhase.progress.phase === 'verifying';
    return (
      <View style={styles.center} accessibilityRole="progressbar">
        <ActivityIndicator size="large" />
        <Text style={styles.title}>Preparing your practice space…</Text>
        {downloadPhase.kind === 'downloading' ? (
          <View style={styles.progressWrap}>
            <ModelDownloadProgressView
              progress={downloadPhase.progress}
              verifying={verifying}
            />
          </View>
        ) : null}
      </View>
    );
  }

  if (!hydrated) {
    return (
      <View style={styles.center} accessibilityRole="progressbar">
        <ActivityIndicator size="large" />
        <Text style={styles.title}>Preparing your practice space…</Text>
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}

function blankProgress(): ModelDownloadProgress {
  return {
    currentFile: '',
    currentFileLabel: '',
    fileIndex: 0,
    totalFiles: 3,
    bytesDownloaded: 0,
    bytesTotal: 0,
    phase: 'pending',
  };
}

// Stub hookup so the conversation store can register an invalidator when it
// lands in chat-mvp. The default no-op keeps the profile store safe to call
// even if no conversation store is mounted yet.
setConversationInvalidator(() => {
  /* conversation store not yet implemented; chat-mvp will register one */
});

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    marginTop: 8,
    color: '#555',
    textAlign: 'center',
    maxWidth: 320,
  },
  progressWrap: {
    marginTop: 24,
    width: '100%',
    maxWidth: 360,
  },
  retry: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: '#3b82f6',
    borderRadius: 6,
  },
  retryPressed: {
    opacity: 0.7,
  },
  retryLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});