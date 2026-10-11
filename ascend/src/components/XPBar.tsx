import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useReduceMotion } from '../hooks/useMotion';
import { colors, spacing } from '../theme';
import { AText } from './AText';

interface Props {
  progress: number; // 0..1
  label?: string;
  valueText?: string;
  height?: number;
  color?: string;
}

/** Segmented XP gauge with an animated fill and a leading glow. */
export function XPBar({ progress, label, valueText, height = 10, color = colors.violet }: Props) {
  const reduce = useReduceMotion();
  const w = useSharedValue(0);
  useEffect(() => {
    const target = Math.max(0, Math.min(1, progress));
    w.value = reduce ? target : withTiming(target, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [progress, reduce, w]);
  const fill = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));

  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label ?? 'Experience'} accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}>
      {(label || valueText) && (
        <View style={styles.labels}>
          {label ? (
            <AText variant="label" muted>
              {label}
            </AText>
          ) : (
            <View />
          )}
          {valueText && (
            <AText variant="tiny" color={colors.silver}>
              {valueText}
            </AText>
          )}
        </View>
      )}
      <View style={[styles.track, { height, borderRadius: height / 2 }]}>
        <Animated.View style={[styles.fill, { backgroundColor: color, borderRadius: height / 2 }, fill]}>
          <View style={[styles.glow, { backgroundColor: colors.violetBright, shadowColor: colors.violetBright, borderRadius: height / 2 }]} />
        </Animated.View>
        <View pointerEvents="none" style={styles.segments}>
          {Array.from({ length: 9 }, (_, i) => (
            <View key={i} style={styles.segment} />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labels: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs + 2 },
  track: { backgroundColor: colors.surfaceHigh, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  fill: { height: '100%', justifyContent: 'center', alignItems: 'flex-end', minWidth: 0 },
  glow: { width: 10, height: '100%', opacity: 0.9, shadowOpacity: 1, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  segments: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'space-evenly' },
  segment: { width: 1, height: '100%', backgroundColor: 'rgba(7,7,11,0.55)' },
});

