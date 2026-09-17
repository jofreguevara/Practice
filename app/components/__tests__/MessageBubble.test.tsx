/**
 * Tests for app/components/MessageBubble.tsx (chat-mvp Task 3.3).
 *
 * Covers Jest ids from tasks.md:
 *   - message_bubble_role_color (user vs assistant)
 *   - message_bubble_renders_text
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { MessageBubble } from '../MessageBubble';
import type { ChatMessage } from '../../state/conversation';

const baseMessage: ChatMessage = {
  id: 'm1',
  role: 'user',
  text: 'Hello',
  sttAudioPath: null,
  ttsAudioPath: null,
  createdAt: 1,
};

describe('MessageBubble', () => {
  test('message_bubble_renders_text', async () => {
    const { getByText } = await render(
      <MessageBubble message={{ ...baseMessage, text: 'Hola amigo' }} />,
    );
    expect(getByText('Hola amigo')).toBeTruthy();
  });

  test('message_bubble_role_color: user has different background than assistant', async () => {
    const { rerender, getByTestId } = await render(
      <MessageBubble message={{ ...baseMessage, role: 'user', text: 'hi' }} />,
    );
    const userStyle = getByTestId('message-bubble').props.style as Array<Record<string, unknown>>;
    const userBg = (userStyle[1] as { backgroundColor: string }).backgroundColor;
    await rerender(<MessageBubble message={{ ...baseMessage, role: 'assistant', text: 'hi' }} />);
    const assistantStyle = getByTestId('message-bubble').props.style as Array<Record<string, unknown>>;
    const assistantBg = (assistantStyle[1] as { backgroundColor: string }).backgroundColor;
    expect(userBg).not.toBe(assistantBg);
  });

  test('message_bubble_accessibilityLabel_includes_role', async () => {
    const { getByLabelText, rerender } = await render(
      <MessageBubble message={{ ...baseMessage, role: 'user', text: 'hello' }} />,
    );
    expect(getByLabelText(/you said/i)).toBeTruthy();
    await rerender(<MessageBubble message={{ ...baseMessage, role: 'assistant', text: 'hi' }} />);
    expect(getByLabelText(/coach said/i)).toBeTruthy();
  });

  test('message_bubble_alignment: user right, assistant left', async () => {
    const { rerender, getByTestId } = await render(
      <MessageBubble message={{ ...baseMessage, role: 'user', text: 'hi' }} />,
    );
    const userStyle = getByTestId('message-bubble').props.style as Array<Record<string, unknown>>;
    const userAlign = (userStyle[1] as { alignSelf: string }).alignSelf;
    await rerender(<MessageBubble message={{ ...baseMessage, role: 'assistant', text: 'hi' }} />);
    const assistantStyle = getByTestId('message-bubble').props.style as Array<Record<string, unknown>>;
    const assistantAlign = (assistantStyle[1] as { alignSelf: string }).alignSelf;
    expect(userAlign).not.toBe(assistantAlign);
  });

  test('message_bubble_role_icon: shows ▶ for user, ◀ for assistant', async () => {
    const { getByText, rerender } = await render(
      <MessageBubble message={{ ...baseMessage, role: 'user', text: 'hi' }} />,
    );
    expect(getByText('▶')).toBeTruthy();
    await rerender(<MessageBubble message={{ ...baseMessage, role: 'assistant', text: 'hi' }} />);
    expect(getByText('◀')).toBeTruthy();
  });
});