/**
 * app/settings/models.tsx — Settings → Models (chat-mvp Task 3.4,
 * specs/settings.md REQ-2, design §10).
 *
 * Renders the 3 LLM variants from `app/config/modelManifest.ts` as a
 * picker. Selection writes `modelVariant` to the profile via
 * `useProfileStore.setModelVariant`; the new variant is applied on the
 * next app launch (the chat root layout re-runs `capability.resolveModelVariant`).
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { listModelVariants } from '../config/modelManifest';
import { useProfileStore, selectModelVar } from '../state/profile';
import type { ModelVariant } from '../services/capability';

export default function ModelsSettingsScreen(): React.JSX.Element {
  const router = useRouter();
  const current = useProfileStore(selectModelVar);
  const setModelVariant = useProfileStore((s) => s.setModelVariant);
  const [draft, setDraft] = useState<ModelVariant | null>(current);
  const variants = listModelVariants();

  const handleApply = async (): Promise<void> => {
    if (!draft) return;
    await setModelVariant(draft);
    router.back();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Models</Text>
      <Text style={styles.subtitle}>
        Pick the on-device LLM. Selection applies on next launch.
      </Text>
      <Text style={styles.currentLabel}>
        Current: {current ?? 'auto'}
      </Text>
      {variants.map((v) => {
        const missing = v.variant !== 'stub' && v.path === '';
        const disabled = missing;
        return (
          <Pressable
            key={v.variant}
            testID={`model-variant-${v.variant}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: draft === v.variant, disabled }}
            onPress={() => {
              if (!disabled) setDraft(v.variant);
            }}
            style={[styles.row, disabled ? styles.rowDisabled : null]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{v.label}</Text>
              <Text style={styles.rowDescription}>
                {v.description} ({v.sizeMB} MB · {v.licenseName})
              </Text>
            </View>
            <Text style={styles.radio}>{draft === v.variant ? '●' : '○'}</Text>
          </Pressable>
        );
      })}
      <Pressable
        testID="models-apply"
        accessibilityRole="button"
        accessibilityLabel="Apply on next launch"
        onPress={() => {
          void handleApply();
        }}
        style={[styles.applyButton, !draft ? styles.applyDisabled : null]}
        disabled={!draft}
      >
        <Text style={styles.applyButtonText}>Apply on next launch</Text>
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
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#555',
    marginBottom: 16,
  },
  currentLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 12,
    color: '#0a84ff',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e5ea',
  },
  rowDisabled: {
    opacity: 0.4,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  rowDescription: {
    fontSize: 13,
    color: '#555',
    marginTop: 2,
  },
  radio: {
    fontSize: 20,
    color: '#0a84ff',
    marginLeft: 8,
  },
  applyButton: {
    marginTop: 24,
    backgroundColor: '#0a84ff',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  applyDisabled: {
    backgroundColor: '#aaa',
  },
  applyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});