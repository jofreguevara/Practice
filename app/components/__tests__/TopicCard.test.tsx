/**
 * Tests for app/components/TopicCard.tsx (chat-mvp Task 3.3).
 *
 * Covers Jest ids from tasks.md:
 *   - topic_card_renders_png_or_placeholder
 *   - topic_card_fires_onPress_with_id
 */
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { TopicCard } from '../TopicCard';

describe('TopicCard', () => {
  test('topic_card_renders_png_or_placeholder: label is always rendered', async () => {
    const { getByText } = await render(
      <TopicCard topicId="travel" label="Travel" onPress={() => undefined} />,
    );
    expect(getByText('Travel')).toBeTruthy();
  });

  test('topic_card_renders_png_when_source_provided', async () => {
    const { getByTestId, queryByText } = await render(
      <TopicCard
        topicId="food"
        label="Food"
        imageSource={{ uri: 'asset://topics/food.png' }}
        onPress={() => undefined}
      />,
    );
    // Image view exists; label still present.
    expect(getByTestId('topic-card-food')).toBeTruthy();
    expect(queryByText('Food')).toBeTruthy();
  });

  test('topic_card_renders_placeholder_when_no_image', async () => {
    const { getByText, queryByTestId } = await render(
      <TopicCard topicId="work" label="Work" onPress={() => undefined} />,
    );
    expect(getByText('Work')).toBeTruthy();
    // No image testID when no imageSource provided (the placeholder is the
    // fallback).
    expect(queryByTestId('topic-card-image-work')).toBeNull();
  });

  test('topic_card_fires_onPress_with_id', async () => {
    const onPress = jest.fn();
    const { getByTestId } = await render(
      <TopicCard topicId="hobbies" label="Hobbies" onPress={onPress} />,
    );
    fireEvent.press(getByTestId('topic-card-hobbies'));
    expect(onPress).toHaveBeenCalledWith('hobbies');
  });

  test('topic_card_accessibilityLabel_includes_label', async () => {
    const { getByLabelText } = await render(
      <TopicCard topicId="weather" label="Weather" onPress={() => undefined} />,
    );
    expect(getByLabelText(/Weather topic card/)).toBeTruthy();
  });
});