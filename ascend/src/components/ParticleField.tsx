import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import { useReduceMotion } from '../hooks/useMotion';
import { colors } from '../theme';

interface Props {
  count?: number;
  color?: string;
  intensity?: number;
}

function Particle({ x, size, delay, duration, height, color, drift }: { x: number; size: number; delay: number; duration: number; height: number; color: string; drift: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false));
  }, [t, delay, duration]);
  const style = useAnimatedStyle(() => {
    const p = t.value;
    return {
      opacity: p < 0.15 ? p / 0.15 : p > 0.75 ? Math.max(0, (1 - p) / 0.25) : 1,
      transform: [{ translateY: height - p * (height + 40) }, { translateX: Math.sin(p * Math.PI * 2) * drift }],
    };
  });
  return (
    <Animated.View
      style={[
        styles.p,
        { left: x, width: size, height: size, borderRadius: size / 2, backgroundColor: color, shadowColor: color },
        style,
      ]}
    />
  );
}

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** Slow rising motes of light. Static (no animation) when reduced motion is on. */
export const ParticleField = memo(function ParticleField({ count = 18, color = colors.violetBright, intensity = 1 }: Props) {
  const { width, height } = useWindowDimensions();
  const reduce = useReduceMotion();
  const particles = useMemo(() => {
    const r = seededRandom(11);
    return Array.from({ length: count }, () => ({
      x: r() * width,
      y: r() * height,
      size: 1.5 + r() * 2.5,
      delay: r() * 6000,
      duration: 9000 + r() * 9000,
      drift: 6 + r() * 14,
      alpha: 0.25 + r() * 0.5 * intensity,
    }));
  }, [count, width, height, intensity]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {particles.map((p, i) =>
        reduce ? (
          <View key={i} style={[styles.p, { left: p.x, top: p.y, width: p.size, height: p.size, borderRadius: p.size, backgroundColor: color, opacity: p.alpha * 0.6 }]} />
        ) : (
          <View key={i} style={{ position: 'absolute', left: 0, top: 0, opacity: p.alpha }}>
            <Particle x={p.x} size={p.size} delay={p.delay} duration={p.duration} height={height} color={color} drift={p.drift} />
          </View>
        ),
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  p: { position: 'absolute', top: 0, shadowOpacity: 0.9, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
});
