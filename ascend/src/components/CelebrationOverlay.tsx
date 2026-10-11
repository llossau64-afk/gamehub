import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { ACHIEVEMENT_BY_ID } from '../domain/achievements';
import { RANKS } from '../domain/ranks';
import { useReduceMotion } from '../hooks/useMotion';
import { haptic, playSound } from '../services/feedback';
import { useAppStore, type Celebration } from '../store/useAppStore';
import { colors, rankColors, spacing } from '../theme';
import { AText } from './AText';
import { AchievementIcon } from './AchievementIcon';
import { RankEmblem } from './RankEmblem';

function Burst({ color, count = 26 }: { color: string; count?: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 1400, easing: Easing.out(Easing.cubic) });
  }, [t]);
  const parts = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2 + (i % 3) * 0.2;
        return { dx: Math.cos(a), dy: Math.sin(a), dist: 90 + (i % 5) * 26, size: 3 + (i % 4) };
      }),
    [count],
  );
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.center}>
        {parts.map((p, i) => (
          <BurstDot key={i} t={t} {...p} color={color} />
        ))}
      </View>
    </View>
  );
}

function BurstDot({ t, dx, dy, dist, size, color }: { t: { value: number }; dx: number; dy: number; dist: number; size: number; color: string }) {
  const style = useAnimatedStyle(() => ({
    opacity: 1 - t.value,
    transform: [{ translateX: dx * dist * t.value }, { translateY: dy * dist * t.value }, { scale: 1 - t.value * 0.5 }],
  }));
  return <Animated.View style={[{ position: 'absolute', width: size, height: size, borderRadius: size, backgroundColor: color, shadowColor: color, shadowOpacity: 1, shadowRadius: 6 }, style]} />;
}

function SpinRing({ color, size, duration, reverse }: { color: string; size: number; duration: number; reverse?: boolean }) {
  const r = useSharedValue(0);
  useEffect(() => {
    r.value = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1);
  }, [r, duration]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${(reverse ? -1 : 1) * r.value * 360}deg` }] }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: color, borderStyle: 'dashed', opacity: 0.6 }, style]}
    />
  );
}

function Content({ c, onDone }: { c: Celebration; onDone: () => void }) {
  const reduce = useReduceMotion();
  const name = useAppStore((s) => s.profile?.name ?? 'Player');
  const scale = useSharedValue(reduce ? 1 : 0.6);
  const glow = useSharedValue(0);

  useEffect(() => {
    if (c.kind === 'rank') {
      playSound('rank');
      haptic('heavy');
      setTimeout(() => haptic('success'), 900);
    } else if (c.kind === 'level') {
      playSound('levelup');
      haptic('success');
    } else {
      playSound('reward');
      haptic('success');
    }
    if (!reduce) {
      scale.value = withSpring(1, { damping: 11, stiffness: 140 });
      glow.value = withSequence(withTiming(1, { duration: 500 }), withRepeat(withTiming(0.5, { duration: 1200 }), -1, true));
    }
    const timer = setTimeout(onDone, c.kind === 'rank' ? 6000 : c.kind === 'level' ? 4200 : 3400);
    return () => clearTimeout(timer);
  }, [c, onDone, reduce, scale, glow]);

  const pop = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const halo = useAnimatedStyle(() => ({ opacity: 0.25 + glow.value * 0.45 }));

  if (c.kind === 'achievement') {
    const a = ACHIEVEMENT_BY_ID[c.achievementId ?? ''];
    return (
      <View style={styles.achCard}>
        <AchievementIcon icon={a?.icon ?? 'star'} unlocked size={64} />
        <View style={{ flex: 1 }}>
          <AText variant="label" color={colors.violetBright}>
            Achievement unlocked
          </AText>
          <AText variant="h2">{a?.name ?? 'Achievement'}</AText>
          <AText variant="small" muted>
            +{a?.xp ?? 0} XP{c.rewards.length ? ` · Reward: ${c.rewards.join(', ')}` : ''}
          </AText>
        </View>
      </View>
    );
  }

  if (c.kind === 'rank') {
    const rank = RANKS.find((r) => r.id === c.rankId) ?? RANKS[0];
    const col = rankColors[rank.id];
    return (
      <View style={styles.centerCol}>
        {!reduce && <Burst color={col} count={36} />}
        <AText variant="label" color={colors.silver} style={{ letterSpacing: 4 }}>
          Rank promotion
        </AText>
        <View style={styles.emblemWrap}>
          <Animated.View style={[styles.halo, { backgroundColor: col }, halo]} />
          {!reduce && <SpinRing color={col} size={210} duration={16000} />}
          {!reduce && <SpinRing color={colors.silver} size={180} duration={22000} reverse />}
          <Animated.View style={pop}>
            <RankEmblem rank={rank.id} size={140} />
          </Animated.View>
        </View>
        <Animated.View entering={reduce ? undefined : FadeIn.delay(500).duration(600)} style={{ alignItems: 'center', gap: spacing.sm }}>
          <AText variant="hero" color={col} align="center">
            {rank.name}
          </AText>
          <AText variant="h2" align="center">
            {rank.title.toUpperCase()}
          </AText>
          <AText variant="body" muted align="center" style={{ maxWidth: 300 }}>
            {name}, you reached level {c.level}. {rank.blurb}
          </AText>
          {c.rewards.length > 0 && (
            <AText variant="small" color={colors.violetBright} align="center">
              Unlocked: {c.rewards.join(', ')}
            </AText>
          )}
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={styles.centerCol}>
      {!reduce && <Burst color={colors.violetBright} />}
      <Animated.View style={[styles.levelHalo, halo]} />
      <Animated.View style={[{ alignItems: 'center' }, pop]}>
        <AText variant="label" color={colors.violetBright} style={{ letterSpacing: 5 }}>
          System notice
        </AText>
        <AText style={styles.levelUp} accessibilityRole="header">
          LEVEL UP
        </AText>
        <View style={styles.levelRow}>
          <AText variant="h2" muted>
            LV.
          </AText>
          <AText style={styles.levelNum}>{c.level}</AText>
        </View>
      </Animated.View>
      {c.rewards.length > 0 && (
        <Animated.View entering={reduce ? undefined : FadeIn.delay(400)} style={styles.rewardPill}>
          <Ionicons name="gift" size={16} color={colors.violetBright} />
          <AText variant="smallStrong">Unlocked: {c.rewards.join(', ')}</AText>
        </Animated.View>
      )}
    </View>
  );
}

/** Global overlay that plays queued level-ups, rank promotions and achievements. */
export function CelebrationOverlay() {
  const current = useAppStore((s) => s.celebrations[0]);
  const consume = useAppStore((s) => s.consumeCelebration);
  if (!current) return null;
  const small = current.kind === 'achievement';
  return (
    <Animated.View
      key={current.id}
      entering={FadeIn.duration(250)}
      exiting={FadeOut.duration(250)}
      style={[StyleSheet.absoluteFill, small ? styles.smallWrap : styles.fullWrap]}
      accessibilityViewIsModal
      accessibilityLiveRegion="assertive"
    >
      <Pressable accessibilityRole="button" accessibilityLabel="Continue" style={StyleSheet.absoluteFill} onPress={consume} />
      <View pointerEvents="box-none" style={small ? styles.smallInner : styles.fullInner}>
        <Content c={current} onDone={consume} />
        <AText variant="tiny" faint align="center" style={{ marginTop: spacing.xl }}>
          Tap to continue
        </AText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fullWrap: { backgroundColor: 'rgba(3,3,6,0.92)', zIndex: 100, elevation: 100 },
  smallWrap: { backgroundColor: 'rgba(3,3,6,0.55)', zIndex: 100, elevation: 100, justifyContent: 'flex-start' },
  fullInner: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  smallInner: { paddingTop: 90, paddingHorizontal: spacing.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerCol: { alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  levelUp: { fontFamily: 'Rajdhani_700Bold', fontSize: 64, lineHeight: 70, letterSpacing: 8, color: colors.text, textShadowColor: colors.violet, textShadowRadius: 24 },
  levelRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  levelNum: { fontFamily: 'Rajdhani_700Bold', fontSize: 56, lineHeight: 60, color: colors.violetBright },
  levelHalo: { position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: colors.violet, opacity: 0.3, transform: [{ scale: 1.2 }] },
  rewardPill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.violetWash, borderWidth: 1, borderColor: colors.violetDeep },
  emblemWrap: { width: 230, height: 230, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 170, height: 170, borderRadius: 85 },
  achCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.violet,
    shadowColor: colors.violet,
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
});

