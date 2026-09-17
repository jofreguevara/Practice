/**
 * app/settings/conversation.tsx — Settings → Conversation
 * (chat-mvp Task 3.4, specs/settings.md REQ-1, design §10).
 *
 * Persona name + voice locale picker. Save calls useProfileStore
 * .setPersonaName and .setPracticeLocale; both flush to SQLite in the
 * same tick (Sub-change 1) and bump systemPromptVersion so the next
 * LLM turn re-composes the prompt with the new values.
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useProfileStore, selectPersona, selectPracticeLocale } from '../state/profile';
import type { BCP47 } from '../state/profile';

const LOCALES: { id: BCP47; label: string }[] = [
  { id: 'en-US', label: 'en-US (American English)' },
  { id: 'en-GB', label: 'en-GB (British English)' },
  { id: 'es-ES', label: 'es-ES (Castilian Spanish)' },
  { id: 'es-MX', label: 'es-MX (Latin-American Spanish)' },
];

export default function ConversationSettingsScreen(): React.JSX.Element {
  const router = useRouter();
  const persona = useProfileStore(selectPersona);
  const locale = useProfileStore(selectPracticeLocale);
  const setPersonaName = useProfileStore((s) => s.setPersonaName);
  const setPracticeLocale = useProfileStore((s) => s.setPracticeLocale);

  const [draftPersona, setDraftPersona] = useState(persona);
  const [draftLocale, setDraftLocale] = useState<BCP47>(locale);

  const handleSave = async (): Promise<void> => {
    if (draftPersona !== persona) {
      await setPersonaName(draftPersona);
    }
    if (draftLocale !== locale) {
      await setPracticeLocale(draftLocale);
    }
    router.back();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Conversation</Text>
      <Text style={styles.section}>Persona name</Text>
      <TextInput
        testID="conversation-persona-input"
        accessibilityLabel="Persona name"
        value={draftPersona}
        onChangeText={setDraftPersona}
        style={styles.input}
        autoCorrect={false}
        autoCapitalize="words"
      />
      <Text style={styles.section}>Voice locale</Text>
      {LOCALES.map((l) => (
        <Pressable
          key={l.id}
          testID={`locale-${l.id}`}
          accessibilityRole="radio"
          accessibilityState={{ selected: draftLocale === l.id }}
          onPress={() => setDraftLocale(l.id)}
          style={styles.localeRow}
        >
          <Text style={styles.localeLabel}>{l.label}</Text>
          <Text style={styles.localeRadio}>{draftLocale === l.id ? '●' : '○'}</Text>
        </Pressable>
      ))}
      <Pressable
        testID="conversation-save"
        accessibilityRole="button"
        accessibilityLabel="Save settings"
        onPress={() => {
          void handleSave();
        }}
        style={styles.saveButton}
      >
        <Text style={styles.saveButtonText}>Save</Text>
      </Pressable>
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
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
  },
  section: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
    color: '#333',
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#aaa',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
  },
  localeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5ea',
  },
  localeLabel: {
    fontSize: 15,
  },
  localeRadio: {
    fontSize: 18,
    color: '#0a84ff',
  },
  saveButton: {
    marginTop: 24,
    backgroundColor: '#0a84ff',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});