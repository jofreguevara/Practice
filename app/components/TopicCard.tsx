/**
 * app/components/TopicCard.tsx — 8 topic cards on the home screen
 * (chat-mvp Task 3.3, specs/topics.md REQ-1).
 *
 * Renders one bundled PNG (or a placeholder when the asset is missing)
 * plus the topic label. Tap fires `onPress(topicId)`. No network fetch —
 * images come from `assets/topics/` (bundled at build time, not fetched).
 */
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

export interface TopicCardProps {
  topicId: string;
  label: string;
  imageSource?: ImageSourcePropType;
  onPress: (topicId: string) => void;
  accessibilityHint?: string;
}

export const TopicCard: React.FC<TopicCardProps> = ({
  topicId,
  label,
  imageSource,
  onPress,
  accessibilityHint,
}) => {
  const handlePress = (): void => onPress(topicId);
  return (
    <Pressable
      testID={`topic-card-${topicId}`}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${label} topic card`}
      accessibilityHint={accessibilityHint ?? 'Double tap to start a conversation'}
      onPress={handlePress}
      style={styles.card}
    >
      {imageSource ? (
        <Image
          source={imageSource}
          style={styles.image}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={styles.placeholder} accessibilityLabel={`${label} placeholder graphic`}>
          <Text style={styles.placeholderEmoji}>{emojiFor(topicId)}</Text>
        </View>
      )}
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
};

function emojiFor(topicId: string): string {
  const map: Record<string, string> = {
    travel: '✈️',
    food: '🍽️',
    work: '💼',
    hobbies: '🎨',
    weather: '☁️',
    shopping: '🛍️',
    health: '🩺',
    'daily-life': '🏡',
  };
  return map[topicId] ?? '💬';
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#f4f4f8',
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '70%',
  },
  placeholder: {
    width: '100%',
    height: '70%',
    backgroundColor: '#e8e8ee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderEmoji: {
    fontSize: 40,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    textTransform: 'capitalize',
    marginTop: 8,
  },
});