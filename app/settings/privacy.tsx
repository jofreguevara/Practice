/**
 * app/settings/privacy.tsx — Settings → Privacy (chat-mvp Task 3.4,
 * specs/settings.md REQ-3, design §10).
 *
 * Encryption toggle + low-memory mode toggle + audio retention selector
 * + export / delete controls. All toggles flush to SQLite via
 * useProfileStore mutations; encryption requires an app restart (the
 * chat root layout reads `preferences_json.encryptionEnabled` and
 * re-opens op-sqlite with the SQLCipher key on the next boot).
 */
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useProfileStore } from '../state/profile';

export default function PrivacySettingsScreen(): React.JSX.Element {
  const router = useRouter();
  const encryptionEnabled = useProfileStore((s) => s.row.preferences.encryptionEnabled);
  const lowMemoryMode = useProfileStore((s) => s.row.preferences.lowMemoryMode);
  const setEncryptionEnabled = useProfileStore((s) => s.setEncryptionEnabled);
  const setLowMemoryMode = useProfileStore((s) => s.setLowMemoryMode);
  const [retention, setRetention] = useState<'24h' | 'keep'>('keep');

  const handleEncryptionToggle = (): void => {
    if (!encryptionEnabled) {
      // Warn the user that a restart is required.
      Alert.alert(
        'Restart required',
        'Encryption will engage after the app is rest.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Enable',
            onPress: () => {
              void setEncryptionEnabled(true);
            },
          },
        ],
      );
    } else {
      void setEncryptionEnabled(false);
    }
  };

  const handleExport = (): void => {
    Alert.alert('Export', 'Profile data would be written to cacheDirectory/profile-export.json');
  };

  const handleDelete = (): void => {
    Alert.alert(
      'Delete all data',
      'This wipes every conversation and resets the profile. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Delete', 'Not yet wired in the MVP — placeholder for v2.');
            void router.back();
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Privacy</Text>

      <ToggleRow
        testID="encryption-toggle"
        label="Encryption at rest"
        description="Engages SQLCipher on next launch (restart required)."
        value={encryptionEnabled}
        onToggle={handleEncryptionToggle}
      />

      <ToggleRow
        testID="low-memory-toggle"
        label="Low-memory mode"
        description="Forces the fallback model and disables waveform sample buffering."
        value={lowMemoryMode}
        onToggle={() => {
          void setLowMemoryMode(!lowMemoryMode);
        }}
      />

      <Text style={styles.section}>Audio retention</Text>
      <Pressable
        testID="retention-24h"
        accessibilityRole="radio"
        accessibilityState={{ selected: retention === '24h' }}
        onPress={() => setRetention('24h')}
        style={styles.radioRow}
      >
        <Text style={styles.radioLabel}>24h — prune files older than a day</Text>
        <Text style={styles.radio}>{retention === '24h' ? '●' : '○'}</Text>
      </Pressable>
      <Pressable
        testID="retention-keep"
        accessibilityRole="radio"
        accessibilityState={{ selected: retention === 'keep' }}
        onPress={() => setRetention('keep')}
        style={styles.radioRow}
      >
        <Text style={styles.radioLabel}>Keep — never auto-prune</Text>
        <Text style={styles.radio}>{retention === 'keep' ? '●' : '○'}</Text>
      </Pressable>

      <View style={styles.actionRow}>
        <Pressable
          testID="export-data"
          accessibilityRole="button"
          accessibilityLabel="Export profile data"
          onPress={handleExport}
          style={styles.actionButton}
        >
          <Text style={styles.actionButtonText}>Export profile data</Text>
        </Pressable>
        <Pressable
          testID="delete-data"
          accessibilityRole="button"
          accessibilityLabel="Delete all data"
          onPress={handleDelete}
          style={[styles.actionButton, styles.destructiveButton]}
        >
          <Text style={[styles.actionButtonText, styles.destructiveText]}>Delete all data</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

interface ToggleRowProps {
  testID: string;
  label: string;
  description: string;
  value: boolean;
  onToggle: () => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ testID, label, description, value, onToggle }) => (
  <Pressable
    testID={testID}
    accessibilityRole="switch"
    accessibilityState={{ checked: value }}
    onPress={onToggle}
    style={styles.toggleRow}
  >
    <View style={{ flex: 1 }}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Text style={styles.toggleDescription}>{description}</Text>
    </View>
    <Text style={styles.toggleSwitch}>{value ? '●' : '○'}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 16,
  },
  section: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 8,
    color: '#333',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5ea',
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  toggleDescription: {
    fontSize: 13,
    color: '#555',
    marginTop: 2,
  },
  toggleSwitch: {
    fontSize: 22,
    color: '#0a84ff',
    marginLeft: 8,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5ea',
  },
  radioLabel: {
    fontSize: 15,
    flex: 1,
  },
  radio: {
    fontSize: 20,
    color: '#0a84ff',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#f4f4f8',
    alignItems: 'center',
    marginHorizontal: 4,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  destructiveButton: {
    backgroundColor: '#ffebeb',
  },
  destructiveText: {
    color: '#ff3b30',
  },
});