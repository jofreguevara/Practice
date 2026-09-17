/**
 * app/(tabs)/settings.tsx — Settings hub (chat-mvp Task 3.4).
 *
 * Three sub-screens per specs/settings.md REQ-1..3 and design §10:
 *   - Conversation: persona name + voice locale picker
 *   - Models: variant picker (Llama 3.2 1B / Qwen 2.5 1.5B / Auto)
 *   - Privacy: encryption toggle + low-memory mode + retention + export/delete
 *
 * The hub renders a vertical list with a button per sub-screen; tap
 * pushes the sub-route via expo-router.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useProfileStore } from '../state/profile';

interface SettingsEntry {
  id: string;
  title: string;
  subtitle: string;
  target: string;
}

const ENTRIES: SettingsEntry[] = [
  {
    id: 'conversation',
    title: 'Conversation',
    subtitle: 'Persona name · Voice locale',
    target: '/settings/conversation',
  },
  {
    id: 'models',
    title: 'Models',
    subtitle: 'Pick the on-device LLM variant',
    target: '/settings/models',
  },
  {
    id: 'privacy',
    title: 'Privacy',
    subtitle: 'Encryption · Low-memory · Data export',
    target: '/settings/privacy',
  },
];

export default function SettingsScreen(): React.JSX.Element {
  const router = useRouter();
  const row = useProfileStore((s) => s.row);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.subtitle}>
        Adjust persona · {row.preferences.personaName} · Level {row.level}
      </Text>

      {ENTRIES.map((entry) => (
        <Pressable
          key={entry.id}
          testID={`settings-row-${entry.id}`}
          accessibilityRole="button"
          accessibilityLabel={`${entry.title} settings`}
          accessibilityHint={`Opens ${entry.title} settings`}
          onPress={() => router.push(entry.target as never)}
          style={styles.row}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{entry.title}</Text>
            <Text style={styles.rowSubtitle}>{entry.subtitle}</Text>
          </View>
          <Text style={styles.rowChevron}>›</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#555',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    backgroundColor: '#f4f4f8',
    borderRadius: 12,
    marginBottom: 12,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  rowSubtitle: {
    fontSize: 13,
    color: '#555',
    marginTop: 2,
  },
  rowChevron: {
    fontSize: 22,
    color: '#aaa',
    marginLeft: 8,
  },
});