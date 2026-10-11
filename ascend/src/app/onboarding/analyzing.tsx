import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AText } from '../../components/AText';
import { Button } from '../../components/Button';
import { ParticleField } from '../../components/ParticleField';
import { XPBar } from '../../components/XPBar';
import { useReduceMotion } from '../../hooks/useMotion';
import { continueAsGuest } from '../../services/auth';
import { createPersonalPlan } from '../../services/coachApi';
import { playSound } from '../../services/feedback';
import { useAppStore } from '../../store/useAppStore';
import { colors, fonts, spacing } from '../../theme';

const STAGES = [
  'Reading experience and goals',
  'Matching exercises to your equipment',
  'Protecting flagged body areas',
  'Balancing weekly volume',
  'Scheduling recovery days',
  'Running safety validation',
];

export default function Analyzing() {
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const profile = useAppStore((s) => s.profile);
  const setDraftPlan = useAppStore((s) => s.setDraftPlan);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const spin = useSharedValue(0);
  const scan = useSharedValue(0);

  useEffect(() => {
    if (reduce) return;
    spin.value = withRepeat(withTiming(1, { duration: 3000, easing: Easing.linear }), -1);
    scan.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [reduce, spin, scan]);

  const run = async () => {
    if (!profile) return router.replace('/onboarding/create');
    setError(null);
    // Guests get an anonymous backend session (when configured) so the AI coach and sync work securely.
    if (useAppStore.getState().auth.mode === 'none') await continueAsGuest();
    setStage(0);
    const timer = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 650);
    const minTime = new Promise((r) => setTimeout(r, STAGES.length * 650 + 300));
    try {
      const [result] = await Promise.all([createPersonalPlan(profile), minTime]);
      clearInterval(timer);
      setStage(STAGES.length);
      setDraftPlan({ ...result.plan, warnings: [...(result.message ? [result.message] : []), ...result.plan.warnings] });
      playSound('reward');
      router.replace('/onboarding/review');
    } catch {
      clearInterval(timer);
      setError('Something went wrong while building your program.');
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ring = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const ring2 = useAnimatedStyle(() => ({ transform: [{ rotate: `${-spin.value * 240}deg` }] }));
  const scanStyle = useAnimatedStyle(() => ({ transform: [{ translateY: scan.value * 120 - 60 }] }));

  return (
    <View style={[styles.root, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
      <ParticleField count={22} />
      <View style={styles.core}>
        <Animated.View style={[styles.ring, ring]} />
        <Animated.View style={[styles.ring2, ring2]} />
        <View style={styles.inner}>
          <Animated.View style={[styles.scan, scanStyle]} />
          <Ionicons name="sparkles" size={30} color={colors.violetBright} />
        </View>
      </View>
      <AText style={styles.title} accessibilityRole="header" accessibilityLiveRegion="polite">
        ANALYZING YOUR PROFILE...
      </AText>
      <View style={{ width: '100%', maxWidth: 420, gap: spacing.md, marginTop: spacing.xl }}>
        <XPBar progress={Math.min(1, stage / STAGES.length)} />
        {STAGES.map((s, i) =>
          i <= stage ? (
            <Animated.View key={s} entering={reduce ? undefined : FadeIn.duration(300)} style={styles.stageRow}>
              <Ionicons name={i < stage ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={i < stage ? colors.success : colors.violetBright} />
              <AText variant="small" color={i < stage ? colors.textMuted : colors.text} style={{ fontFamily: fonts.mono }}>
                {s}
              </AText>
            </Animated.View>
          ) : null,
        )}
      </View>
      {error && (
        <View style={{ marginTop: spacing.xl, gap: spacing.md, alignItems: 'center' }}>
          <AText color={colors.danger}>{error}</AText>
          <Button label="Try again" onPress={() => void run()} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', paddingHorizontal: spacing.xl },
  core: { width: 150, height: 150, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  ring: { position: 'absolute', width: 150, height: 150, borderRadius: 75, borderWidth: 2, borderColor: colors.violetDeep, borderTopColor: colors.violetBright },
  ring2: { position: 'absolute', width: 118, height: 118, borderRadius: 59, borderWidth: 1, borderColor: colors.borderStrong, borderStyle: 'dashed' },
  inner: { width: 86, height: 86, borderRadius: 43, backgroundColor: colors.violetWash, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: colors.violetDeep },
  scan: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: colors.violetBright, opacity: 0.6 },
  title: { fontFamily: 'Rajdhani_700Bold', fontSize: 26, letterSpacing: 3, color: colors.text, marginTop: spacing.xxl, textAlign: 'center' },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
