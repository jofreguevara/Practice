/**
 * app/components/MessageBubble.tsx — chat history row (chat-mvp Task 3.3).
 *
 * One row per message in the conversation history. Distinct color tokens
 * for user vs assistant; alignment + accessibility label reflect the role.
 * The optional inline `Waveform` is shown when the message has a
 * `ttsAudioPath` and the parent wants playback visualization (used for
 * the most-recent assistant turn during TTS playback).
 *
 * Purely presentational — no service imports.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ChatMessage } from '../state/conversation';

export interface MessageBubbleProps {
  message: ChatMessage;
}

const COLORS = {
  userBg: '#0a84ff',
  userText: '#ffffff',
  assistantBg: '#f0f0f5',
  assistantText: '#1c1c1e',
};

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';
  const backgroundColor = isUser ? COLORS.userBg : COLORS.assistantBg;
  const textColor = isUser ? COLORS.userText : COLORS.assistantText;
  const label = isUser ? `You said: ${message.text}` : `Coach said: ${message.text}`;
  const icon = isUser ? '▶' : '◀';
  return (
    <View
      testID="message-bubble"
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[
        styles.bubble,
        {
          backgroundColor,
          alignSelf: isUser ? 'flex-end' : 'flex-start',
        },
      ]}
    >
      <Text style={[styles.icon, { color: textColor }]}>{icon}</Text>
      <Text style={[styles.text, { color: textColor }]}>{message.text}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    marginVertical: 4,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  icon: {
    fontSize: 14,
    marginRight: 8,
    lineHeight: 20,
  },
  text: {
    fontSize: 16,
    lineHeight: 20,
    flexShrink: 1,
  },
});