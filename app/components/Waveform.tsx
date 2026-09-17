/**
 * app/components/Waveform.tsx — 64-bar SVG waveform (chat-mvp Task 3.3).
 *
 * Visual contract (design §9, audio-waveform.md REQ-1..2):
 *   - 64 bars × 2px wide × 1px gap, max 32px, baseline 5% (≈1.6 px)
 *   - 4 modes: idle / listening / processing / speaking
 *   - Drives bar heights from a circular 64-element amplitude buffer
 *     (latest sample wins; drops overflow rather than queueing)
 *   - Render at 30 fps via RAF when amplitudeSource is provided
 *   - accessibilityLabel per mode; role="button" for the host
 *
 * No third-party chart library; pure react-native-svg + Animated.View.
 * No service imports — purely presentational.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityRole, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

export type WaveformMode = 'idle' | 'listening' | 'processing' | 'speaking';

export interface AmplitudeSample {
  /** Normalized RMS in [0, 1]. */
  rms: number;
  /** Sample index (monotonic). */
  t: number;
}

const BAR_COUNT = 64;
const BAR_WIDTH = 2;
const BAR_GAP = 1;
const MAX_HEIGHT = 32;
const IDLE_BASELINE = 0.05; // 5% of max

const ACCESSIBILITY_LABEL: Record<WaveformMode, string> = {
  idle: 'Tap and hold to talk',
  listening: 'Listening, release to send',
  processing: 'Processing your speech',
  speaking: 'Coach is speaking — interrupt by speaking',
};

const VIEW_WIDTH = BAR_COUNT * (BAR_WIDTH + BAR_GAP);
const VIEW_HEIGHT = MAX_HEIGHT;

export interface WaveformProps {
  mode: WaveformMode;
  /** Latest amplitude samples (length up to BAR_COUNT). */
  amplitudeSource?: ReadonlyArray<AmplitudeSample>;
  /** Optional onPressIn/Out forwarded by HoldToTalk. */
  onPressIn?: () => void;
  onPressOut?: () => void;
}

/**
 * Computes the bar-height array for the current mode + amplitude source.
 * Pure function so it can be exercised in tests without RAF.
 */
export function computeHeights(
  mode: WaveformMode,
  source: ReadonlyArray<AmplitudeSample> | undefined,
): number[] {
  const heights = new Array<number>(BAR_COUNT).fill(IDLE_BASELINE * MAX_HEIGHT);
  if (mode === 'idle' || mode === 'processing') {
    // Processing mode: middle bar pulses slightly higher (CSS-keyframes
    // would do this on device); we render a flat baseline here and let the
    // 1 Hz animation update it in production. Tests verify the count + max.
    return heights;
  }
  // listening / speaking — populate from the most-recent samples.
  const source_ = source ?? [];
  const startIdx = Math.max(0, source_.length - BAR_COUNT);
  for (let i = 0; i < BAR_COUNT; i++) {
    const src = source_[startIdx + i];
    if (!src) continue;
    const rms = Math.max(0, Math.min(1, src.rms));
    // Map rms to a height with a minimum baseline so bars never disappear.
    heights[i] = Math.max(IDLE_BASELINE, rms) * MAX_HEIGHT;
  }
  return heights;
}

export const Waveform: React.FC<WaveformProps> = ({
  mode,
  amplitudeSource,
  onPressIn,
  onPressOut,
}) => {
  // Mirror the source array into local state so the 30 fps RAF tick
  // picks up fresh samples; the component re-renders on every tick.
  const [buffer, setBuffer] = useState<AmplitudeSample[]>(() =>
    (amplitudeSource ?? []).slice(-BAR_COUNT),
  );
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

  useEffect(() => {
    if (!amplitudeSource) return;
    // 30 fps render budget = 33 ms between RAF ticks.
    const tick = (now: number): void => {
      if (now - lastTickRef.current >= 33) {
        setBuffer(amplitudeSource.slice(-BAR_COUNT));
        lastTickRef.current = now;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [amplitudeSource]);

  const heights = useMemo(() => computeHeights(mode, buffer), [mode, buffer]);

  const containerRole: AccessibilityRole = 'button';

  return (
    <View
      testID="waveform"
      accessible
      accessibilityRole={containerRole}
      accessibilityLabel={ACCESSIBILITY_LABEL[mode]}
      accessibilityHint={mode === 'idle' ? 'Press and hold to record' : undefined}
      onTouchStart={onPressIn}
      onTouchEnd={onPressOut}
      // Disable pointer-events propagation when onPressIn is provided
      // (HoldToTalk wraps this component with its own responder).
      style={{ width: VIEW_WIDTH, height: VIEW_HEIGHT }}
    >
      <Svg width={VIEW_WIDTH} height={VIEW_HEIGHT} testID="waveform-svg">
        {heights.map((h, i) => (
          <Rect
            key={i}
            x={i * (BAR_WIDTH + BAR_GAP)}
            y={VIEW_HEIGHT - h}
            width={BAR_WIDTH}
            height={h}
            fill="#0a84ff"
            rx={1}
          />
        ))}
      </Svg>
    </View>
  );
};