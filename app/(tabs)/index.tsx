/**
 * app/(tabs)/index.tsx — Topics home screen (chat-mvp Task 3.4).
 *
 * 2-column grid of 8 TopicCard components (specs/topics.md REQ-1..2).
 * Tap a card → `useConversationStore.startNew(topicId)` → navigate to
 * the chat tab with the new conversation id as a URL param.
 *
 * The screen reads `useProfileStore` to surface the user's current
 * persona + level in the header. No service imports — just renders.
 */
import React, { useCallback } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { TopicCard } from '../components/TopicCard';
import { TOPIC_IDS, TOPIC_ASSETS } from '../config/topics';
import { useConversationStore } from '../state/conversation';
import { useProfileStore, selectPersona, selectLevel } from '../state/profile';

const LABELS: Record<string, string> = {
  travel: 'Travel',
  food: 'Food',
  work: 'Work',
  hobbies: 'Hobbies',
  weather: 'Weather',
  shopping: 'Shopping',
  health: 'Health',
  'daily-life': 'Daily life',
};

export default function TopicsScreen(): React.JSX.Element {
  const persona = useProfileStore(selectPersona);
  const level = useProfileStore(selectLevel);
  const router = useRouter();
  const startNew = useConversationStore((s) => s.startNew);

  const handlePickTopic = useCallback(
    async (topicId: string) => {
      const id = await startNew(topicId as Parameters<typeof startNew>[0]);
      router.push({ pathname: '/(tabs)/chat', params: { convId: id } });
    },
    [router, startNew],
  );

  return (
    <View style={styles.container} testID="topics-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Topics</Text>
        <Text style={styles.subtitle}>
          {persona} · Level {level} · pick a topic to start practising.
        </Text>
      </View>
      <FlatList
        data={[...TOPIC_IDS]}
        keyExtractor={(item) => item}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.gridContent}
        renderItem={({ item }) => (
          <View style={styles.gridItem}>
            <TopicCard
              topicId={item}
              label={LABELS[item] ?? item}
              imageSource={TOPIC_ASSETS[item]}
              onPress={handlePickTopic}
            />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    color: '#555',
    marginTop: 4,
  },
  gridContent: {
    paddingHorizontal: 12,
    paddingBottom: 24,
  },
  row: {
    justifyContent: 'space-between',
    marginHorizontal: 0,
  },
  gridItem: {
    width: '48%',
  },
});