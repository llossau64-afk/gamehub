import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { AText } from '../components/AText';
import { Button } from '../components/Button';
import { Ring } from '../components/Charts';
import { Banner, Chip, IconButton, Stepper } from '../components/Controls';
import { ExercisePicker } from '../components/ExercisePicker';
import { Panel } from '../components/Panel';
import { formatTarget } from '../components/PlanView';
import { EXERCISE_BY_ID, MUSCLE_LABELS } from '../data/exercises';
import { findSubstitute } from '../domain/plan/library';
import { lastPerformance, suggestNext } from '../domain/plan/progression';
import { useReduceMotion } from '../hooks/useMotion';
import { haptic, playSound } from '../services/feedback';
import { useAppStore } from '../store/useAppStore';
import { colors, fonts, radius, spacing } from '../theme';
import { formatDuration, fromDisplayWeight, relativeDay, toDisplayWeight } from '../utils';

const RPE_OPTIONS = [
  { value: 6, label: 'Easy' },
  { value: 7, label: 'Steady' },
  { value: 8, label: 'Hard' },
  { value: 9, label: 'Very hard' },
  { value: 10, label: 'Max' },
];

function ask(title: string, body: string, actions: { text: string; style?: 'destructive' | 'cancel'; onPress?: () => void }[]) {
  if (Platform.OS === 'web') {
    const primary = actions.find((a) => a.style !== 'cancel');
    if (globalThis.confirm?.(`${title}\n\n${body}`)) primary?.onPress?.();
    return;
  }
  Alert.alert(title, body, actions);
}

function useNow(interval = 500) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return now;
}

export default function Workout() {
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const s = useAppStore(
    useShallow((st) => ({
      w: st.activeWorkout,
      sessions: st.sessions,
      profile: st.profile,
      autoRest: st.settings.autoRestTimer,
      logSet: st.logSet,
      removeLastSet: st.removeLastSet,
      goTo: st.goToExercise,
      replace: st.replaceExercise,
      easier: st.reduceDifficulty,
      skip: st.skipExercise,
      setPaused: st.setPaused,
      startRest: st.startRest,
      clearRest: st.clearRest,
      discard: st.discardWorkout,
      finish: st.finishWorkout,
    })),
  );
  const now = useNow();
  const w = s.w;
  const units = s.profile?.units ?? 'kg';
  const [pickerOpen, setPickerOpen] = useState(false);
  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(8);
  const [rpe, setRpe] = useState<number | null>(8);
  const [holdStart, setHoldStart] = useState<number | null>(null);
  const restDoneRef = useRef<string | null>(null);

  const idx = w?.currentIndex ?? 0;
  const log = w?.exercises[idx];
  const ex = log ? EXERCISE_BY_ID[log.exerciseId] : undefined;
  const planned = log?.planned;
  const timed = ex?.loadType === 'timed';
  const weighted = ex?.loadType === 'weighted';

  const suggestion = useMemo(() => (planned ? suggestNext(planned, s.sessions) : null), [planned, s.sessions]);
  const last = useMemo(() => (log ? lastPerformance(log.exerciseId, s.sessions) : null), [log, s.sessions]);

  // Prefill inputs when the exercise changes or a set is logged.
  const setsDone = log?.sets.length ?? 0;
  useEffect(() => {
    if (!log) return;
    const prev = log.sets[log.sets.length - 1];
    const baseW = prev?.weight ?? suggestion?.weight ?? last?.sets[0]?.weight ?? 0;
    setWeight(toDisplayWeight(baseW ?? 0, units));
    setReps(prev?.reps ?? suggestion?.reps ?? planned?.repsMin ?? 8);
    setRpe(timed ? null : 8);
    setHoldStart(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log?.exerciseId, setsDone]);

  const restLeft = w?.restEndsAt ? Math.max(0, Math.ceil((new Date(w.restEndsAt).getTime() - now) / 1000)) : 0;
  useEffect(() => {
    if (w?.restEndsAt && restLeft === 0 && restDoneRef.current !== w.restEndsAt) {
      restDoneRef.current = w.restEndsAt;
      playSound('restEnd');
      haptic('warning');
      s.clearRest();
    }
  }, [restLeft, w?.restEndsAt, s]);

  if (!w) return <Redirect href="/(tabs)" />;

  const paused = !!w.pausedAt;
  const elapsed = Math.max(0, Math.round(((paused ? new Date(w.pausedAt!).getTime() : now) - new Date(w.startedAt).getTime()) / 1000) - w.pausedTotalSec);
  const totalSets = w.exercises.reduce((a, e) => a + e.sets.length, 0);
  const targetSets = planned?.sets ?? 3;
  const exerciseDone = setsDone >= targetSets;
  const nextLog = w.exercises[idx + 1];
  const holdElapsed = holdStart ? Math.floor((now - holdStart) / 1000) : 0;

  const doLog = () => {
    if (!log) return;
    const r = timed && holdStart ? holdElapsed : reps;
    if (r <= 0) return;
    s.logSet(idx, { weight: weighted ? fromDisplayWeight(weight, units) : null, reps: r, rpe });
    playSound('xp');
    haptic('medium');
    setHoldStart(null);
    const doneNow = setsDone + 1 >= targetSets;
    if (s.autoRest && planned && !(doneNow && idx === w.exercises.length - 1)) s.startRest(planned.restSec);
    if (doneNow && idx < w.exercises.length - 1) setTimeout(() => s.goTo(idx + 1), 400);
  };

  const finish = () => {
    const doFinish = () => {
      const r = s.finish();
      if (!r) return router.replace('/(tabs)');
      playSound('complete');
      haptic('success');
      router.replace({ pathname: '/complete', params: { id: r.sessionId, xp: String(r.xp), reason: r.reason ?? '' } });
    };
    if (totalSets === 0)
      return ask('Nothing logged yet', 'Leave without saving this workout?', [
        { text: 'Keep training', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => {
            s.discard();
            router.replace('/(tabs)');
          },
        },
      ]);
    const remaining = w.exercises.filter((e) => !e.skipped && e.sets.length < (e.planned?.sets ?? 0)).length;
    if (remaining > 0)
      return ask('Finish workout?', `${remaining} exercise${remaining > 1 ? 's are' : ' is'} not complete. Your logged sets will be saved.`, [
        { text: 'Keep training', style: 'cancel' },
        { text: 'Finish', onPress: doFinish },
      ]);
    doFinish();
  };

  const menu = () =>
    ask('Workout options', 'Your progress is saved automatically — you can close the app and resume later.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard workout',
        style: 'destructive',
        onPress: () => {
          s.discard();
          router.replace('/(tabs)');
        },
      },
    ]);

  const subs = log ? [findSubstitute(log.exerciseId, s.profile!, new Set([log.exerciseId]))?.id, ...(ex?.alternatives ?? [])].filter((x): x is string => !!x) : [];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <IconButton icon="chevron-down" label="Minimise workout" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <AText variant="label" muted numberOfLines={1}>
            {w.title}
          </AText>
          <AText style={styles.clock} accessibilityLabel={`Elapsed ${formatDuration(elapsed)}`}>
            {formatDuration(elapsed)}
          </AText>
        </View>
        <IconButton icon="ellipsis-horizontal" label="Workout options" onPress={menu} />
      </View>

      {/* Exercise rail */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {w.exercises.map((e, i) => {
          const done = e.sets.length >= (e.planned?.sets ?? 1);
          return (
            <Pressable
              key={`${e.exerciseId}-${i}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: i === idx }}
              accessibilityLabel={`Exercise ${i + 1}: ${EXERCISE_BY_ID[e.exerciseId]?.name}${done ? ', done' : e.skipped ? ', skipped' : ''}`}
              onPress={() => s.goTo(i)}
              style={[styles.railItem, i === idx && styles.railOn, done && styles.railDone, e.skipped && { opacity: 0.4 }]}
            >
              {done ? <Ionicons name="checkmark" size={14} color={colors.success} /> : <AText variant="tiny">{i + 1}</AText>}
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 140 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        {paused && (
          <Banner tone="warning" icon="pause-circle" action={<Button size="sm" label="Resume" onPress={() => s.setPaused(false)} />}>
            Workout paused
          </Banner>
        )}

        {ex && log && (
          <Animated.View key={`${log.exerciseId}-${idx}`} entering={reduce ? undefined : FadeInRight.duration(250)} style={{ gap: spacing.lg }}>
            <View>
              <AText variant="label" color={colors.violetBright}>
                Exercise {idx + 1} of {w.exercises.length}
                {log.replacedFrom ? ' · replaced' : ''}
              </AText>
              <AText variant="h1">{ex.name}</AText>
              <AText variant="small" muted>
                {ex.primary.map((m) => MUSCLE_LABELS[m]).join(' · ')}
              </AText>
            </View>

            {/* Technique */}
            <Panel padded={false}>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`Open full technique guide for ${ex.name}`}
                onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: ex.id } })}
                style={{ padding: spacing.lg, gap: spacing.sm }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Ionicons name="videocam-off-outline" size={16} color={colors.silverDim} />
                  <AText variant="tiny" muted style={{ flex: 1 }}>
                    No demonstration video available — follow the written cues.
                  </AText>
                </View>
                {ex.steps.slice(0, 3).map((st, i) => (
                  <AText key={st} variant="small">
                    {i + 1}. {st}
                  </AText>
                ))}
                <AText variant="smallStrong" color={colors.violetBright}>
                  Full technique guide →
                </AText>
              </Pressable>
            </Panel>

            {/* Target, previous & suggestion */}
            <View style={styles.infoRow}>
              <View style={styles.infoCell}>
                <AText variant="tiny" muted>
                  TARGET
                </AText>
                <AText variant="h3">{planned ? formatTarget(planned) : '—'}</AText>
                <AText variant="tiny" faint>
                  {planned ? `${planned.rir} reps in reserve · rest ${planned.restSec}s` : ''}
                </AText>
              </View>
              <View style={styles.infoCell}>
                <AText variant="tiny" muted>
                  LAST TIME
                </AText>
                {last ? (
                  <>
                    <AText variant="smallStrong" numberOfLines={2}>
                      {last.sets.map((x) => (x.weight ? `${toDisplayWeight(x.weight, units)}×${x.reps}` : `${x.reps}${timed ? 's' : ''}`)).join(', ')}
                    </AText>
                    <AText variant="tiny" faint>
                      {relativeDay(last.date)}
                    </AText>
                  </>
                ) : (
                  <AText variant="small" muted>
                    First time
                  </AText>
                )}
              </View>
            </View>
            {suggestion && (
              <View style={styles.suggest}>
                <Ionicons name={suggestion.trend === 'up' ? 'trending-up' : suggestion.trend === 'down' ? 'trending-down' : 'sparkles'} size={16} color={colors.violetBright} />
                <AText variant="small" style={{ flex: 1 }}>
                  {suggestion.weight != null ? `Suggested: ${toDisplayWeight(suggestion.weight, units)} ${units} × ${suggestion.reps}. ` : ''}
                  {suggestion.reason}
                </AText>
              </View>
            )}

            {/* Completed sets */}
            <View style={{ gap: 6 }}>
              {Array.from({ length: Math.max(targetSets, setsDone) }, (_, i) => {
                const set = log.sets[i];
                return (
                  <View key={i} style={[styles.setRow, set && styles.setDone, i === setsDone && !exerciseDone && styles.setCurrent]}>
                    <AText variant="label" color={set ? colors.success : i === setsDone ? colors.violetBright : colors.textFaint} style={{ width: 52 }}>
                      Set {i + 1}
                    </AText>
                    <AText variant="bodyStrong" style={{ flex: 1 }} color={set ? colors.text : colors.textFaint}>
                      {set
                        ? `${set.weight ? `${toDisplayWeight(set.weight, units)} ${units} × ` : ''}${set.reps}${timed ? ' s' : ' reps'}`
                        : planned
                          ? formatTarget({ ...planned, sets: 1 }).replace('1 × ', '')
                          : ''}
                    </AText>
                    {set?.rpe ? (
                      <AText variant="tiny" muted>
                        RPE {set.rpe}
                      </AText>
                    ) : null}
                    {set && i === setsDone - 1 && (
                      <Pressable accessibilityRole="button" accessibilityLabel="Undo last set" onPress={() => s.removeLastSet(idx)} hitSlop={10}>
                        <Ionicons name="arrow-undo" size={18} color={colors.silverDim} />
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>

            {/* Logging */}
            <Panel framed title={exerciseDone ? 'Extra set (optional)' : `Log set ${setsDone + 1}`}>
              <View style={{ gap: spacing.lg }}>
                  <View style={{ flexDirection: 'row', gap: spacing.md }}>
                    {weighted && <Stepper label={`Weight (${units})`} value={weight} onChange={setWeight} step={units === 'kg' ? 2.5 : 5} max={1000} decimals={1} large />}
                    {timed ? (
                      <View style={{ flex: 1, gap: spacing.sm }}>
                        <Stepper label="Seconds" value={holdStart ? holdElapsed : reps} onChange={setReps} step={5} max={3600} large />
                        <Button
                          size="sm"
                          variant={holdStart ? 'danger' : 'secondary'}
                          icon={holdStart ? 'stop' : 'timer-outline'}
                          label={holdStart ? 'Stop timer' : 'Start timer'}
                          onPress={() => {
                            if (holdStart) {
                              setReps(holdElapsed);
                              setHoldStart(null);
                            } else setHoldStart(Date.now());
                          }}
                        />
                      </View>
                    ) : (
                      <Stepper label="Reps" value={reps} onChange={setReps} step={1} max={100} large />
                    )}
                  </View>
                  {!timed && (
                    <View style={{ gap: 6 }}>
                      <AText variant="label" muted>
                        How hard was it?
                      </AText>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {RPE_OPTIONS.map((o) => (
                          <Chip key={o.value} label={o.label} selected={rpe === o.value} onPress={() => setRpe(o.value)} />
                        ))}
                      </View>
                    </View>
                  )}
                  <Button label={exerciseDone ? 'Log extra set' : `Log set ${setsDone + 1} of ${targetSets}`} icon="checkmark" size="lg" full onPress={doLog} disabled={paused} variant={exerciseDone ? 'secondary' : 'primary'} />
                </View>
              </Panel>

            {/* Exercise actions */}
            <View style={styles.actions}>
              <ActionBtn icon="swap-horizontal" label="Replace" onPress={() => setPickerOpen(true)} />
              <ActionBtn icon="trending-down" label="Easier" onPress={() => s.easier(idx)} />
              <ActionBtn icon="play-skip-forward" label="Skip" onPress={() => s.skip(idx)} />
              <ActionBtn icon="sparkles" label="Coach" onPress={() => router.push('/coach-chat')} />
            </View>

            {nextLog && (
              <Pressable accessibilityRole="button" onPress={() => s.goTo(idx + 1)} style={styles.next}>
                <AText variant="tiny" muted>
                  NEXT
                </AText>
                <AText variant="bodyStrong" style={{ flex: 1 }}>
                  {EXERCISE_BY_ID[nextLog.exerciseId]?.name}
                </AText>
                <Ionicons name="chevron-forward" size={18} color={colors.silverDim} />
              </Pressable>
            )}
          </Animated.View>
        )}
      </ScrollView>

      {/* Bottom bar */}
      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <Button label={paused ? 'Resume' : 'Pause'} icon={paused ? 'play' : 'pause'} variant="secondary" style={{ flex: 1 }} onPress={() => s.setPaused(!paused)} />
        <Button label="Finish" icon="flag" style={{ flex: 1.4 }} onPress={finish} />
      </View>

      {/* Rest timer */}
      {w.restEndsAt && restLeft > 0 && (
        <Animated.View entering={reduce ? undefined : FadeIn.duration(200)} style={[styles.restWrap, { paddingBottom: insets.bottom + 96 }]} pointerEvents="box-none">
          <View style={styles.rest} accessibilityLiveRegion="polite" accessibilityLabel={`Rest, ${restLeft} seconds left`}>
            <Ring progress={planned ? restLeft / planned.restSec : 0} size={64}>
              <AText variant="h3">{formatDuration(restLeft)}</AText>
            </Ring>
            <View style={{ flex: 1 }}>
              <AText variant="label" color={colors.violetBright}>
                Rest
              </AText>
              <AText variant="small" muted>
                Breathe and recover.
              </AText>
            </View>
            <Button size="sm" variant="subtle" label="+15s" onPress={() => s.startRest(restLeft + 15)} />
            <Button size="sm" variant="ghost" label="Skip" onPress={() => s.clearRest()} />
          </View>
        </Animated.View>
      )}

      <ExercisePicker
        visible={pickerOpen}
        title="Replace exercise"
        suggestions={Array.from(new Set(subs))}
        exclude={log ? [log.exerciseId] : []}
        onClose={() => setPickerOpen(false)}
        onPick={(id) => {
          s.replace(idx, id);
          setPickerOpen(false);
        }}
      />
    </View>
  );
}

function ActionBtn({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        haptic('light');
        onPress();
      }}
      style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}
    >
      <Ionicons name={icon} size={20} color={colors.silver} />
      <AText variant="tiny" muted style={{ marginTop: 4 }}>
        {label}
      </AText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.md },
  clock: { fontFamily: fonts.display, fontSize: 26, color: colors.text, letterSpacing: 1 },
  rail: { paddingHorizontal: spacing.lg, gap: 8, paddingVertical: spacing.sm },
  railItem: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  railOn: { borderColor: colors.violetBright, borderWidth: 2 },
  railDone: { backgroundColor: colors.successWash, borderColor: 'rgba(52,211,153,0.4)' },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.lg, width: '100%', maxWidth: 640, alignSelf: 'center' },
  infoRow: { flexDirection: 'row', gap: spacing.sm },
  infoCell: { flex: 1, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 2 },
  suggest: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.violetWash, borderWidth: 1, borderColor: colors.violetDeep },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, height: 46, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  setDone: { borderColor: 'rgba(52,211,153,0.35)' },
  setCurrent: { borderColor: colors.violet },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1, alignItems: 'center', paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  next: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.bgElevated, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  restWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg },
  rest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: colors.violet,
    shadowColor: colors.violet,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
});
