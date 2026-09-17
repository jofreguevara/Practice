/**
 * app/components/ModelDownloadProgress.tsx — first-launch download UI.
 *
 * Pure presentational component — receives a `ModelDownloadProgress` and
 * renders the current file label, "X of Y", an animated progress bar,
 * and the byte counters formatted in MB. Used by `app/_layout.tsx`
 * during the one-shot boot download. All UI copy is bilingual-friendly
 * (English here; es-ES is provided by the chat root after hydration).
 */
import React from 'react';
import { StyleSheet, View, Text, AccessibilityInfo } from 'react-native';

import type { ModelDownloadProgress } from '../services/modelDownloader';

export interface ModelDownloadProgressViewProps {
  progress: ModelDownloadProgress;
  /** When true, render the "Verifying hash" spinner instead of the bar. */
  verifying?: boolean;
}

function formatMB(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

function percentOf(downloaded: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((downloaded / total) * 100)));
}

export function ModelDownloadProgressView(
  props: ModelDownloadProgressViewProps,
): React.JSX.Element {
  const { progress } = props;
  const verifying = props.verifying ?? progress.phase === 'verifying';
  const pct = percentOf(progress.bytesDownloaded, progress.bytesTotal);
  const label =
    progress.phase === 'verifying'
      ? 'Verifying file…'
      : `Downloading ${progress.currentFileLabel.toLowerCase()}`;

  return (
    <View style={styles.row} accessibilityRole="progressbar">
      <Text style={styles.title} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.file} numberOfLines={1}>
        {progress.currentFile}
      </Text>
      <View style={styles.barTrack}>
        <View
          style={[styles.barFill, { width: `${pct}%` }]}
          accessibilityLabel={`${pct} percent complete`}
        />
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.meta}>
          {progress.fileIndex}/{progress.totalFiles}
        </Text>
        <Text style={styles.meta}>
          {formatMB(progress.bytesDownloaded)} / {formatMB(progress.bytesTotal)}
        </Text>
        <Text style={styles.meta}>{pct}%</Text>
      </View>
      {verifying ? <Text style={styles.subtle}>Verifying integrity…</Text> : null}
    </View>
  );
}

/**
 * Default accessibility announcement for the download state — useful in
 * tests and as a fallback if a screen reader user lands on the boot view.
 */
export function announceProgress(p: ModelDownloadProgress): void {
  const pct = percentOf(p.bytesDownloaded, p.bytesTotal);
  AccessibilityInfo.announceForAccessibility(
    `${p.currentFileLabel}: ${pct} percent complete`,
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    maxWidth: 360,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222',
    marginBottom: 4,
  },
  file: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
    fontFamily: 'monospace',
  },
  barTrack: {
    height: 8,
    backgroundColor: '#eee',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: 8,
    backgroundColor: '#3b82f6',
    borderRadius: 4,
  },
  metaRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  meta: {
    fontSize: 12,
    color: '#444',
  },
  subtle: {
    marginTop: 6,
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
  },
});