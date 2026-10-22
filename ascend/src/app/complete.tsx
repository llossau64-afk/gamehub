import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { AText } from '../components/AText';
import { Button } from '../components/Button';
import { Banner, ChipGroup, RatingRow, StatBlock } from '../components/Controls';
import { Panel } from '../components/Panel';
import { Screen } from '../components/Screen';
import { XPBar } from '../components/XPBar';
import { EXERCISE_BY_ID } from '../data/exercises';
import { sessionSets, sessionVolumeKg } from '../domain/analytics';
import { PAIN_DISCLAIMER } from '../domain/safety';
import type { BodyArea, WorkoutFeedback } from '../domain/types';
import { usePlayer } from '../hooks/useData';
import { useReduceMotion } from '../hooks/useMotion';
import { haptic, playSound } from '../services/feedback';
import { notifyNow } from '../services/notifications';
import { useAppStore } from '../store/useAppStore';
import { colors, fonts, spacing } from '../theme';
import { formatDuration, toDisplayWeight } from '../utils';

function CountUp({ to }: { to: number }) {
  const reduce = useReduceMotion();
  const [v, setV] = useState(0);
  useEffect(() => {
    if (reduce || to <= 0) return;
    const start = Date.now();
    const dur = 1100;
    const t = setInterval(() => {
      const p = Math.min(1, (Date.now() - start) / dur);
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p >= 1) clearInterval(t);
    }, 30);
    const tick = setTimeout(() => playSound('xp'), 300);
    return () => {
      clearInterval(t);
      clearTimeout(tick);
    };
  }, [to, reduce]);
  return <AText style={styles.xp}>+{reduce || to <= 0 ? to : v} XP</AText>;
}

export default function Complete() {
  const { id, xp, reason } = useLocalSearchParams<{ id: string; xp?: string; reason?: string }>();
  const session = useAppStore((s) => s.sessions.find((x) => x.id === id));
  const units = useAppStore((s) => s.profile?.units ?? 'kg');
  const notifPlan = useAppStore((s) => s.settings.notifications.enabled && s.settings.notifications.planUpdates);
  const submitFeedback = useAppStore((s) => s.submitFeedback);
  const { level, rank } = usePlayer();
  const reduce = useReduceMotion();
  const [fb, setFb] = useState<Partial<WorkoutFeedback>>({ completed: 'yes', techniqueComfortable: true, unusualPain: false, adjustNext: 'keep' });
  const [changes, setChanges] = useState<string[] | null>(null);
  const scale = useSharedValue(reduce ? 1 : 0.7);
  const line = useSharedValue(reduce ? 1 : 0);

  useEffect(() => {
    if (reduce) return;
    scale.value = withSpring(1, { damping: 10, stiffness: 120 });
    line.value = withDelay(250, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [reduce, scale, line]);
  const titleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const lineStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: line.value }] }));

  if (!session)
    return (
      <Screen title="Workout saved">
        <Button label="Return home" onPress={() => router.replace('/(tabs)')} />
      </Screen>
    );

  const exercisesDone = session.exercises.filter((e) => e.sets.length > 0).length;
  const volume = sessionVolumeKg(session);
  const canSubmit = fb.difficulty !== undefined && (!fb.unusualPain || !!fb.painArea);

  const submit = () => {
    const changed = submitFeedback(session.id, fb as WorkoutFeedback);
    setChanges(changed);
    haptic('success');
    if (changed.length && notifPlan) void notifyNow('Your coach updated your plan', changed[0]);
  };

  return (
    <Screen
      particles
      footer={
        changes !== null ? (
          <Button label="Return home" size="lg" full icon="home" onPress={() => router.replace('/(tabs)')} />
        ) : (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button label="Skip" variant="secondary" style={{ flex: 1 }} onPress={() => router.replace('/(tabs)')} />
            <Button label="Save feedback" style={{ flex: 2 }} onPress={submit} disabled={!canSubmit} />
          </View>
        )
      }
    >
      <Animated.View style={[{ alignItems: 'center', marginTop: spacing.xl }, titleStyle]}>
        <AText variant="label" color={colors.violetBright} style={{ letterSpacing: 5 }}>
          {session.title}
        </AText>
        <AText style={styles.title} accessibilityRole="header">
          MISSION COMPLETE
        </AText>
        <Animated.View style={[styles.line, lineStyle]} />
      </Animated.View>

      <Animated.View entering={reduce ? undefined : FadeIn.delay(300)} style={{ alignItems: 'center' }}>
        <CountUp to={Number(xp ?? session.xpEarned)} />
        {reason ? (
          <AText variant="small" muted align="center">
            {reason}
          </AText>
        ) : null}
      </Animated.View>

      <Animated.View entering={reduce ? undefined : FadeInDown.delay(400)}>
        <Panel framed>
          <View style={styles.grid}>
            <StatBlock value={formatDuration(session.durationSec)} label="Duration" />
            <StatBlock value={exercisesDone} label="Exercises" />
            <StatBlock value={sessionSets(session)} label="Sets" />
          </View>
          {volume > 0 && (
            <AText variant="small" muted style={{ marginTop: spacing.md }}>
              Total volume: {Math.round(toDisplayWeight(volume, units)).toLocaleString()} {units}
            </AText>
          )}
          <View style={{ marginTop: spacing.lg }}>
            <XPBar progress={level.progress} label={`Level ${level.level} · ${rank.name}`} valueText={`${level.intoLevel} / ${level.needed} XP`} />
          </View>
        </Panel>
      </Animated.View>

      {session.prs.length > 0 && (
        <Panel title="Performance improvements" accent={colors.gold}>
          <View style={{ gap: spacing.sm }}>
            {session.prs.map((pr) => (
              <View key={pr.exerciseId + pr.kind} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Ionicons name="trophy" size={16} color={colors.gold} />
                <AText variant="small" style={{ flex: 1 }}>
                  {EXERCISE_BY_ID[pr.exerciseId]?.name}
                </AText>
                <AText variant="smallStrong" color={colors.gold}>
                  {pr.kind === 'reps' ? `${pr.value} reps` : `${toDisplayWeight(pr.value, units)} ${units}${pr.kind === 'e1rm' ? ' est. 1RM' : ''}`}
                </AText>
              </View>
            ))}
          </View>
        </Panel>
      )}

      {changes === null ? (
        <Panel title="How did it go?">
          <View style={{ gap: spacing.lg }}>
            <View style={{ gap: 8 }}>
              <AText variant="bodyStrong">Did you complete the workout?</AText>
              <ChipGroup
                options={[
                  { value: 'yes', label: 'Yes' },
                  { value: 'partly', label: 'Partly' },
                  { value: 'no', label: 'Not really' },
                ]}
                value={fb.completed ?? 'yes'}
                onChange={(v) => setFb({ ...fb, completed: v as WorkoutFeedback['completed'] })}
              />
            </View>
            <RatingRow label="How difficult did it feel?" value={fb.difficulty ?? null} onChange={(v) => setFb({ ...fb, difficulty: v as WorkoutFeedback['difficulty'] })} low="Very easy" high="Very hard" />
            <View style={{ gap: 8 }}>
              <AText variant="bodyStrong">Was the technique comfortable?</AText>
              <ChipGroup
                options={[
                  { value: 'yes', label: 'Yes' },
                  { value: 'no', label: 'Something felt off' },
                ]}
                value={fb.techniqueComfortable ? 'yes' : 'no'}
                onChange={(v) => setFb({ ...fb, techniqueComfortable: v === 'yes' })}
              />
            </View>
            <View style={{ gap: 8 }}>
              <AText variant="bodyStrong">Any unusual pain?</AText>
              <ChipGroup
                options={[
                  { value: 'no', label: 'No' },
                  { value: 'yes', label: 'Yes' },
                ]}
                value={fb.unusualPain ? 'yes' : 'no'}
                onChange={(v) => setFb({ ...fb, unusualPain: v === 'yes', painArea: v === 'yes' ? fb.painArea : undefined })}
              />
              {fb.unusualPain && (
                <>
                  <ChipGroup
                    options={(['shoulder', 'knee', 'lower-back', 'wrist', 'elbow', 'hip', 'neck', 'ankle'] as BodyArea[]).map((a) => ({ value: a, label: a.replace('-', ' ') }))}
                    value={fb.painArea ?? ''}
                    onChange={(v) => setFb({ ...fb, painArea: v as BodyArea })}
                  />
                  <Banner tone="warning">{PAIN_DISCLAIMER}</Banner>
                </>
              )}
            </View>
            <View style={{ gap: 8 }}>
              <AText variant="bodyStrong">Adjust the next session?</AText>
              <ChipGroup
                options={[
                  { value: 'keep', label: 'Keep it' },
                  { value: 'easier', label: 'Easier' },
                  { value: 'harder', label: 'Harder' },
                  { value: 'shorter', label: 'Shorter' },
                ]}
                value={fb.adjustNext ?? 'keep'}
                onChange={(v) => setFb({ ...fb, adjustNext: v as WorkoutFeedback['adjustNext'] })}
              />
            </View>
          </View>
        </Panel>
      ) : (
        <Panel title="Coach update" accent={colors.success}>
          {changes.length ? (
            <View style={{ gap: spacing.sm }}>
              {changes.map((c) => (
                <AText key={c} variant="small">
                  • {c}
                </AText>
              ))}
            </View>
          ) : (
            <AText variant="small" muted>
              Feedback saved. Your plan stays the same — the progression engine will adjust your targets from today&apos;s numbers.
            </AText>
          )}
        </Panel>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.display, fontSize: 42, lineHeight: 46, letterSpacing: 4, color: colors.text, textAlign: 'center', textShadowColor: colors.violet, textShadowRadius: 18 },
  line: { height: 2, width: 200, backgroundColor: colors.violetBright, marginTop: spacing.sm, borderRadius: 1 },
  xp: { fontFamily: fonts.display, fontSize: 36, color: colors.violetBright, letterSpacing: 1 },
  grid: { flexDirection: 'row', gap: spacing.md },
});
