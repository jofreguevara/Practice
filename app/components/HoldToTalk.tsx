/**
 * app/components/HoldToTalk.tsx — Press-and-hold wrapper around Waveform
 * (chat-mvp Task 3.3, specs/conversation.md REQ-1).
 *
 * Gesture contract:
 *   - onPressIn  → start recording + delegate STT after VAD fires
 *                  speech_end (the chat screen wires this)
 *   - onPressOut → stop recording + dispatch STT
 *   - When `mode` is `processing` or `speaking`, the gesture is
 *     disabled — pressing does not double-start a recording while the
 *     model is mid-turn (REQ-1 hardener).
 *
 * Purely presentational; no service imports.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Waveform, type WaveformMode, type AmplitudeSample } from './Waveform';

export interface HoldToTalkProps {
  mode: WaveformMode;
  amplitudeSource?: ReadonlyArray<AmplitudeSample>;
  onRecordingStart: () => void;
  onRecordingStop: () => Promise<void> | void;
  onTranscribed: (text: string) => Promise<void> | void;
  disabled?: boolean;
}

const BUSY_MODES: ReadonlySet<WaveformMode> = new Set<WaveformMode>(['processing', 'speaking']);

export const HoldToTalk: React.FC<HoldToTalkProps> = ({
  mode,
  amplitudeSource,
  onRecordingStart,
  onRecordingStop,
  onTranscribed: _onTranscribed,
  disabled,
}) => {
  const [recording, setRecording] = useState(false);
  const isBusy = BUSY_MODES.has(mode) || disabled;

  const handlePressIn = (): void => {
    if (isBusy) return;
    if (recording) return;
    setRecording(true);
    onRecordingStart();
  };

  const handlePressOut = (): void => {
    if (!recording) return;
    setRecording(false);
    void Promise.resolve(onRecordingStop()).catch(() => undefined);
  };

  return (
    <View testID="hold-to-talk-container" style={styles.container}>
      <Pressable
        testID="hold-to-talk"
        accessibilityRole="button"
        accessibilityLabel={isBusy ? 'Hold to talk disabled' : 'Hold to talk'}
        accessibilityHint={
          isBusy ? 'Wait for the previous turn to finish.' : 'Press and hold to record'
        }
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isBusy}
        style={[styles.pressable, isBusy ? styles.disabled : styles.enabled]}
      >
        <Waveform
          mode={mode}
          {...(amplitudeSource ? { amplitudeSource } : {})}
        />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 12,
  },
  pressable: {
    padding: 12,
    borderRadius: 24,
  },
  enabled: {
    backgroundColor: 'transparent',
  },
  disabled: {
    backgroundColor: '#e0e0e6',
    opacity: 0.6,
  },
});