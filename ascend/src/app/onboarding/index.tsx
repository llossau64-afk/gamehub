import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AText } from '../../components/AText';
import { Button } from '../../components/Button';
import { ParticleField } from '../../components/ParticleField';
import { GENERAL_DISCLAIMER } from '../../domain/safety';
import { useReduceMotion } from '../../hooks/useMotion';
import { colors, spacing } from '../../theme';

const LINES = ['YOUR', 'JOURNEY', 'BEGINS NOW.'];

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const pulse = useSharedValue(0);
  const scan = useSharedValue(0);

  useEffect(() => {
    if (reduce) return;
    pulse.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true);
    scan.value = withDelay(400, withRepeat(withTiming(1, { duration: 3800, easing: Easing.inOut(Easing.quad) }), -1, false));
  }, [reduce, pulse, scan]);

  const orb = useAnimatedStyle(() => ({ opacity: 0.35 + pulse.value * 0.25, transform: [{ scale: 1 + pulse.value * 0.08 }] }));
  const scanLine = useAnimatedStyle(() => ({ transform: [{ translateY: -120 + scan.value * 340 }], opacity: 1 - Math.abs(scan.value - 0.5) * 1.6 }));
  const d = (ms: number) => (reduce ? undefined : FadeInDown.delay(ms).duration(900).easing(Easing.out(Easing.cubic)));

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
      <ParticleField count={28} />
      <View style={styles.hero}>
        <Animated.View style={[styles.orb, orb]} />
        <Animated.View style={[styles.scan, scanLine]} />
        <Animated.View entering={reduce ? undefined : FadeIn.duration(1200)} style={styles.brandRow}>
          <View style={styles.diamond} />
          <AText variant="label" color={colors.silver} style={{ letterSpacing: 6 }}>
            ASCEND
          </AText>
        </Animated.View>
        <View style={{ marginTop: spacing.xxl }}>
          {LINES.map((l, i) => (
            <Animated.View key={l} entering={d(500 + i * 650)}>
              <AText style={[styles.line, i === 2 && { color: colors.violetBright }]} accessibilityRole={i === 0 ? 'header' : undefined}>
                {l}
              </AText>
            </Animated.View>
          ))}
        </View>
        <Animated.View entering={d(2600)}>
          <AText variant="body" muted style={{ marginTop: spacing.lg, maxWidth: 320 }}>
            Level up your reality. Real training plans, honest progress, and a character that grows every time you show up.
          </AText>
        </Animated.View>
      </View>

      <Animated.View entering={d(3100)} style={{ gap: spacing.md }}>
        <Button label="Create your player" size="lg" iconRight="arrow-forward" onPress={() => router.push('/onboarding/create')} full />
        <Button label="I already have an account" variant="secondary" onPress={() => router.push({ pathname: '/auth', params: { mode: 'signin' } })} full />
        <AText variant="tiny" faint align="center" style={{ marginTop: spacing.sm, paddingHorizontal: spacing.md }}>
          {GENERAL_DISCLAIMER}
        </AText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.xl, justifyContent: 'space-between' },
  hero: { flex: 1, justifyContent: 'center', maxWidth: 560, width: '100%', alignSelf: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  diamond: { width: 12, height: 12, transform: [{ rotate: '45deg' }], borderWidth: 1.5, borderColor: colors.violetBright, backgroundColor: colors.violetWash },
  line: { fontFamily: 'Rajdhani_700Bold', fontSize: 52, lineHeight: 54, letterSpacing: 3, color: colors.text },
  orb: { position: 'absolute', right: -120, top: 40, width: 320, height: 320, borderRadius: 160, backgroundColor: colors.violetDeep },
  scan: { position: 'absolute', left: -40, right: -40, top: 120, height: 1, backgroundColor: colors.violetBright },
});
