/**
 * Tests for app/components/HoldToTalk.tsx (chat-mvp Task 3.3).
 *
 * Covers Jest ids from tasks.md:
 *   - hold_to_talk.onPressIn_starts_recording
 *   - hold_to_talk.onPressOut_stops_recording
 *   - hold_to_talk.disable_when_busy
 */
import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react-native';
import { HoldToTalk } from '../HoldToTalk';

describe('HoldToTalk', () => {
  afterEach(async () => {
    await act(async () => undefined);
    cleanup();
  });

  test('hold_to_talk.onPressIn_starts_recording: gesture fires onRecordingStart', async () => {
    const onRecordingStart = jest.fn();
    const { getByTestId } = await render(
      <HoldToTalk
        mode="idle"
        onRecordingStart={onRecordingStart}
        onRecordingStop={async () => undefined}
        onTranscribed={async () => undefined}
      />,
    );
    await act(async () => {
      fireEvent(getByTestId('hold-to-talk'), 'pressIn');
    });
    expect(onRecordingStart).toHaveBeenCalledTimes(1);
  });

  test('hold_to_talk.onPressOut_stops_recording: gesture fires onRecordingStop', async () => {
    const onRecordingStop = jest.fn();
    const { getByTestId } = await render(
      <HoldToTalk
        mode="listening"
        onRecordingStart={() => undefined}
        onRecordingStop={onRecordingStop}
        onTranscribed={async () => undefined}
      />,
    );
    await act(async () => {
      fireEvent(getByTestId('hold-to-talk'), 'pressIn');
    });
    await act(async () => {
      fireEvent(getByTestId('hold-to-talk'), 'pressOut');
    });
    expect(onRecordingStop).toHaveBeenCalledTimes(1);
  });

  test('hold_to_talk.disable_when_busy: pressed while busy → no double-start', async () => {
    const onRecordingStart = jest.fn();
    const { getByTestId } = await render(
      <HoldToTalk
        mode="processing"
        onRecordingStart={onRecordingStart}
        onRecordingStop={async () => undefined}
        onTranscribed={async () => undefined}
      />,
    );
    await act(async () => {
      fireEvent(getByTestId('hold-to-talk'), 'pressIn');
    });
    expect(onRecordingStart).not.toHaveBeenCalled();
  });

  test('hold_to_talk.renders_inner_waveform_with_mode', async () => {
    const { getByLabelText } = await render(
      <HoldToTalk
        mode="speaking"
        onRecordingStart={() => undefined}
        onRecordingStop={async () => undefined}
        onTranscribed={async () => undefined}
      />,
    );
    expect(getByLabelText(/Coach is speaking/i)).toBeTruthy();
  });
});