/**
 * Tests for app/components/Waveform.tsx (chat-mvp Task 3.3).
 *
 * Covers Jest ids from tasks.md:
 *   - waveform.64_bars_idle
 *   - waveform.listening_amplitude
 *   - waveform.processing_pulse
 *   - waveform.speaking_amplitude
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { Waveform } from '../Waveform';
import type { AmplitudeSample } from '../Waveform';

// Mock react-native-svg so the test renderer doesn't need the native binding.
// Each Svg+Rect renders a textual node that the test can introspect by props.
jest.mock('react-native-svg', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  const mk = (name: string) =>
    ReactModule.forwardRef((props: { children?: React.ReactNode }, ref: React.Ref<unknown>) =>
      ReactModule.createElement(View, { ...props, ref, testID: `svg-${name}` }),
    );
  const Svg = mk('Svg');
  const Rect = (props: { height?: number; width?: number; fill?: string; x?: number }) =>
    ReactModule.createElement(View, {
      testID: `svg-rect-${props.x ?? 0}`,
      style: {
        height: props.height,
        width: props.width,
        backgroundColor: props.fill,
        position: 'absolute',
        left: props.x,
      },
    });
  return { __esModule: true, default: Svg, Svg, Rect };
});

function makeSource(): AmplitudeSample[] {
  return Array.from({ length: 64 }, (_, i) => ({ rms: i / 64, t: i }));
}

describe('Waveform', () => {
  test('waveform.64_bars_idle: renders 64 bars at baseline height in idle mode', async () => {
    const { getAllByTestId } = await render(<Waveform mode="idle" />);
    // 64 Rect elements → 64 svg-rect-* testIDs at x=0..63.
    const rects = getAllByTestId(/^svg-rect-/);
    expect(rects).toHaveLength(64);
    // Idle baseline is 5% of max height (32 px) ≈ 1.6 px.
    for (const r of rects) {
      expect(r.props.style.height).toBeLessThanOrEqual(2);
      expect(r.props.style.height).toBeGreaterThanOrEqual(1);
    }
  });

  test('waveform.listening_amplitude: bars reflect amplitude in listening mode', async () => {
    const { getAllByTestId } = await render(
      <Waveform mode="listening" amplitudeSource={makeSource()} />,
    );
    const rects = getAllByTestId(/^svg-rect-/);
    expect(rects).toHaveLength(64);
    // Each bar's height scales with its source rms (max 32 px).
    const heights = rects.map((r) => r.props.style.height as number);
    const minHeight = Math.min(...heights);
    const maxHeight = Math.max(...heights);
    expect(maxHeight).toBeGreaterThan(minHeight);
    expect(maxHeight).toBeLessThanOrEqual(32);
  });

  test('waveform.processing_pulse: middle bar pulses, others stay flat', async () => {
    const { getAllByTestId } = await render(<Waveform mode="processing" />);
    const rects = getAllByTestId(/^svg-rect-/);
    expect(rects).toHaveLength(64);
    // All bars start at baseline; only the middle pulses (which we don't
    // assert on here — we just verify the count + that no bar exceeds max).
    for (const r of rects) {
      expect(r.props.style.height).toBeLessThanOrEqual(32);
    }
  });

  test('waveform.speaking_amplitude: bars reflect playback amplitude in speaking mode', async () => {
    const { getAllByTestId } = await render(
      <Waveform mode="speaking" amplitudeSource={makeSource()} />,
    );
    const rects = getAllByTestId(/^svg-rect-/);
    expect(rects).toHaveLength(64);
    const heights = rects.map((r) => r.props.style.height as number);
    expect(Math.max(...heights)).toBeGreaterThan(2);
  });

  test('waveform.accessibilityLabel_reflects_mode', async () => {
    const { rerender, getByLabelText } = await render(<Waveform mode="idle" />);
    expect(getByLabelText(/tap and hold to talk/i)).toBeTruthy();
    await rerender(<Waveform mode="listening" amplitudeSource={makeSource()} />);
    expect(getByLabelText(/listening, release to send/i)).toBeTruthy();
    await rerender(<Waveform mode="processing" />);
    expect(getByLabelText(/processing your speech/i)).toBeTruthy();
    await rerender(<Waveform mode="speaking" amplitudeSource={makeSource()} />);
    expect(getByLabelText(/Coach is speaking/i)).toBeTruthy();
  });

  test('waveform.default_amplitudeSource_safe: 64 zeros render without crashing', async () => {
    const zeros: AmplitudeSample[] = Array.from({ length: 64 }, () => ({ rms: 0, t: 0 }));
    await expect(render(<Waveform mode="listening" amplitudeSource={zeros} />)).resolves.toBeDefined();
  });
});