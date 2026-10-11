import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useShallow } from 'zustand/react/shallow';
import { AText } from '../../components/AText';
import { Avatar } from '../../components/Avatar';
import { Button } from '../../components/Button';
import { Ring } from '../../components/Charts';
import { Banner, IconButton, StatBlock } from '../../components/Controls';
import { Panel } from '../../components/Panel';
import { RankEmblem } from '../../components/RankEmblem';
import { Screen } from '../../components/Screen';
import { XPBar } from '../../components/XPBar';
import { COSMETIC_BY_ID } from '../../data/cosmetics';
import { EXERCISE_BY_ID } from '../../data/exercises';
import { dailyTip } from '../../domain/coach';
import { allPRs, strengthHistory, weeklyConsistency } from '../../domain/analytics';
import { dailyQuests } from '../../domain/quests';
import { usePlayer, useTrainingData } from '../../hooks/useData';
import { useReduceMotion } from '../../hooks/useMotion';
import { useAppStore } from '../../store/useAppStore';
import { colors, rankColors, spacing } from '../../theme';
import { dayKey, weekdayOf } from '../../utils';

function questRoute(action: string) {
  switch (action) {
    case 'workout':
      return '/(tabs)/train';
    case 'checkin':
      return '/checkin';
    case 'mobility':
      return '/mobility';
    case 'progress':
      return '/(tabs)/progress';
    case 'light':
      return '/(tabs)/quests';
    default:
      return '/library';
  }
}

export default function Home() {
  const reduce = useReduceMotion();
  const { profile, plan, cosmetics, xpEvents, activeWorkout, realSessions, checkinsReal, startWorkout } = useAppStore(
    useShallow((s) => ({
      profile: s.profile,
      plan: s.plan,
      cosmetics: s.cosmetics,
      xpEvents: s.xpEvents,
      activeWorkout: s.activeWorkout,
      realSessions: s.sessions,
      checkinsReal: s.checkins,
      startWorkout: s.startWorkout,
    })),
  );
  const { sessions, demo } = useTrainingData();
  const { level, rank, streak } = usePlayer();
  const today = weekdayOf();
  const todayDay = plan?.days.find((d) => d.weekday === today) ?? null;
  const doneToday = realSessions.find((s) => dayKey(new Date(s.finishedAt)) === dayKey());
  const quests = dailyQuests(plan, xpEvents);
  const questsDone = quests.filter((q) => q.done).length;
  const tip = profile ? dailyTip({ profile, plan, sessions: realSessions, checkins: checkinsReal }) : '';
  const checkedIn = checkinsReal.some((c) => c.date === dayKey());

  const stats = useMemo(() => {
    const week = weeklyConsistency(sessions, plan, 1)[0];
    const prs = allPRs(sessions).length;
    // Strength trend: estimated 1RM change on the most-trained weighted lift over its history.
    const lifts = new Map<string, number>();
    for (const s of sessions) for (const e of s.exercises) if (EXERCISE_BY_ID[e.exerciseId]?.loadType === 'weighted' && e.sets.some((x) => (x.weight ?? 0) > 0)) lifts.set(e.exerciseId, (lifts.get(e.exerciseId) ?? 0) + 1);
    const top = [...lifts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const hist = top ? strengthHistory(top, sessions) : [];
    const change = hist.length >= 2 ? Math.round(((hist[hist.length - 1].e1rm - hist[0].e1rm) / hist[0].e1rm) * 100) : null;
    return { week, prs, top, change, workouts: sessions.length };
  }, [sessions, plan]);

  const title = COSMETIC_BY_ID[cosmetics.title]?.name ?? 'The Awakened';
  const enter = (i: number) => (reduce ? undefined : FadeInDown.delay(i * 70).duration(450));

  return (
    <Screen tabBarSpace particles>
      {/* Player header */}
      <Animated.View entering={enter(0)} style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Customise character" onPress={() => router.push('/avatar')}>
          <Avatar cosmetics={cosmetics} rank={rank.id} size={64} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AText variant="h2" numberOfLines={1}>
            {profile?.name ?? 'Player'}
          </AText>
          <AText variant="small" color={colors.violetBright} numberOfLines={1}>
            {title}
          </AText>
        </View>
        <IconButton icon="settings-outline" label="Settings" onPress={() => router.push('/settings')} />
      </Animated.View>

      {/* Status window */}
      <Animated.View entering={enter(1)}>
        <Panel framed accent={rankColors[rank.id]}>
          <View style={styles.statusTop}>
            <RankEmblem rank={rank.id} size={52} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <AText variant="label" muted>
                  Level
                </AText>
                <AText style={styles.levelNum}>{level.level}</AText>
              </View>
              <AText variant="smallStrong" color={rankColors[rank.id]}>
                {rank.name} · {rank.title}
              </AText>
            </View>
            <View style={styles.streak} accessible accessibilityLabel={`${streak.current} day streak`}>
              <Ionicons name="flame" size={16} color={streak.current > 0 ? colors.warning : colors.silverFaint} />
              <AText variant="h3">{streak.current}</AText>
              <AText variant="tiny" muted>
                day streak
              </AText>
            </View>
          </View>
          <View style={{ marginTop: spacing.lg }}>
            <XPBar progress={level.progress} label="Experience" valueText={`${level.intoLevel} / ${level.needed} XP`} />
          </View>
        </Panel>
      </Animated.View>

      {streak.welcomeBack && (
        <Banner tone="success" icon="sunny">
          Welcome back, {profile?.name}. Your level and progress are exactly where you left them — start with a lighter session today.
        </Banner>
      )}
      {demo && <Banner tone="demo">DEMO MODE — statistics below use sample data. Turn it off in Settings.</Banner>}

      {/* Today's mission */}
      <Animated.View entering={enter(2)}>
        <Panel framed title="Today's mission" right={<AText variant="tiny" muted>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</AText>}>
          {activeWorkout ? (
            <View style={{ gap: spacing.md }}>
              <AText variant="h2">{activeWorkout.title}</AText>
              <AText variant="small" muted>
                Workout in progress — {activeWorkout.exercises.reduce((a, e) => a + e.sets.length, 0)} sets logged.
              </AText>
              <Button label="Resume workout" icon="play" size="lg" full onPress={() => router.push('/workout')} />
            </View>
          ) : doneToday ? (
            <View style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                <AText variant="h2">Mission complete</AText>
              </View>
              <AText variant="small" muted>
                {doneToday.title} · {Math.round(doneToday.durationSec / 60)} min · +{doneToday.xpEarned} XP. Recovery is the next quest.
              </AText>
              {!checkedIn && <Button label="Recovery check-in" variant="secondary" icon="pulse" onPress={() => router.push('/checkin')} />}
            </View>
          ) : todayDay ? (
            <View style={{ gap: spacing.md }}>
              <View>
                <AText variant="h1">{todayDay.title}</AText>
                <AText variant="small" muted>
                  {todayDay.focus} · ~{todayDay.estMinutes} min · {todayDay.exercises.length} exercises
                </AText>
              </View>
              <View style={{ gap: 6 }}>
                {todayDay.exercises.slice(0, 4).map((pe) => (
                  <View key={pe.exerciseId} style={styles.exLine}>
                    <View style={styles.dot} />
                    <AText variant="small" style={{ flex: 1 }} numberOfLines={1}>
                      {EXERCISE_BY_ID[pe.exerciseId]?.name}
                    </AText>
                    <AText variant="small" muted>
                      {pe.sets} × {pe.repsMin === pe.repsMax ? pe.repsMin : `${pe.repsMin}–${pe.repsMax}`}
                    </AText>
                  </View>
                ))}
                {todayDay.exercises.length > 4 && (
                  <AText variant="tiny" faint>
                    +{todayDay.exercises.length - 4} more
                  </AText>
                )}
              </View>
              <Button
                label="Start workout"
                icon="flash"
                size="lg"
                full
                onPress={() => {
                  startWorkout(todayDay.id);
                  router.push('/workout');
                }}
              />
            </View>
          ) : (
            <View style={{ gap: spacing.md }}>
              <AText variant="h1">Recovery day</AText>
              <AText variant="small" muted>
                Rest is when your body adapts. Optional: a 5-minute mobility routine or a relaxed walk.
              </AText>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Button label="Mobility" icon="body" style={{ flex: 1 }} onPress={() => router.push('/mobility')} />
                <Button label="Check-in" icon="pulse" variant="secondary" style={{ flex: 1 }} onPress={() => router.push('/checkin')} disabled={checkedIn} />
              </View>
            </View>
          )}
        </Panel>
      </Animated.View>

      {/* AI coach */}
      <Animated.View entering={enter(3)}>
        <Panel onPress={() => router.push('/(tabs)/coach')} accessibilityLabel="Open AI coach">
          <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
            <View style={styles.coachIcon}>
              <Ionicons name="sparkles" size={18} color={colors.violetBright} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <AText variant="label" color={colors.violetBright}>
                Coach
              </AText>
              <AText variant="small">{tip}</AText>
              <AText variant="smallStrong" color={colors.violetBright} style={{ marginTop: 4 }}>
                Ask a question →
              </AText>
            </View>
          </View>
        </Panel>
      </Animated.View>

      {/* Daily quests */}
      <Animated.View entering={enter(4)}>
        <Panel title="Daily quests" right={<AText variant="smallStrong" color={colors.violetBright}>{questsDone}/{quests.length}</AText>}>
          <View style={{ gap: 2 }}>
            {quests.map((q) => (
              <Pressable
                key={q.id}
                accessibilityRole="button"
                accessibilityLabel={`${q.title}, ${q.done ? 'completed' : `${q.xp} XP`}`}
                onPress={() => router.push(questRoute(q.action) as never)}
                style={({ pressed }) => [styles.quest, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name={q.done ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={q.done ? colors.success : colors.silverFaint} />
                <AText variant="small" style={[{ flex: 1 }, q.done && { color: colors.textFaint, textDecorationLine: 'line-through' }]}>
                  {q.title}
                </AText>
                <AText variant="tiny" color={q.done ? colors.textFaint : colors.violetBright}>
                  +{q.xp} XP
                </AText>
              </Pressable>
            ))}
          </View>
        </Panel>
      </Animated.View>

      {/* Player statistics */}
      <Animated.View entering={enter(5)}>
        <Panel title="Player statistics" onPress={() => router.push('/(tabs)/progress')}>
          <View style={styles.statsRow}>
            <StatBlock value={stats.workouts} label="Workouts" />
            <StatBlock value={stats.prs} label="Records" accent={colors.gold} />
            <View style={{ alignItems: 'center', gap: 4 }}>
              <Ring progress={stats.week && stats.week.planned ? stats.week.done / stats.week.planned : 0} size={56}>
                <AText variant="smallStrong">
                  {stats.week?.done ?? 0}/{stats.week?.planned ?? 0}
                </AText>
              </Ring>
              <AText variant="tiny" muted>
                THIS WEEK
              </AText>
            </View>
          </View>
          {stats.top && stats.change !== null && (
            <AText variant="small" muted style={{ marginTop: spacing.md }}>
              {EXERCISE_BY_ID[stats.top]?.name}: estimated strength {stats.change >= 0 ? '+' : ''}
              {stats.change}% since you started.
            </AText>
          )}
          {stats.workouts === 0 && (
            <AText variant="small" muted style={{ marginTop: spacing.md }}>
              Your statistics will appear after your first logged workout.
            </AText>
          )}
        </Panel>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statusTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  levelNum: { fontFamily: 'Rajdhani_700Bold', fontSize: 34, lineHeight: 36, color: colors.text },
  streak: { alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 12, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  exLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.violetBright },
  coachIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.violetWash, borderWidth: 1, borderColor: colors.violetDeep },
  quest: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
});
