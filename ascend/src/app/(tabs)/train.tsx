import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { AText } from '../../components/AText';
import { Button } from '../../components/Button';
import { Banner, EmptyState, SectionTitle } from '../../components/Controls';
import { Panel } from '../../components/Panel';
import { DayCard, NotesList, WeekStrip } from '../../components/PlanView';
import { Screen } from '../../components/Screen';
import { useAppStore } from '../../store/useAppStore';
import { colors, spacing } from '../../theme';
import { formatDuration, relativeDay, weekdayOf } from '../../utils';

function confirm(title: string, body: string, ok: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${body}`)) ok();
    return;
  }
  Alert.alert(title, body, [{ text: 'Cancel', style: 'cancel' }, { text: 'Continue', onPress: ok }]);
}

export default function Train() {
  const { plan, sessions, activeWorkout, startWorkout, planChanges, setDraftPlan } = useAppStore(
    useShallow((s) => ({ plan: s.plan, sessions: s.sessions, activeWorkout: s.activeWorkout, startWorkout: s.startWorkout, planChanges: s.planChanges, setDraftPlan: s.setDraftPlan })),
  );
  const today = weekdayOf();

  const start = (dayId: string | null) => {
    if (activeWorkout) return router.push('/workout');
    startWorkout(dayId);
    router.push('/workout');
  };

  if (!plan)
    return (
      <Screen tabBarSpace title="Train">
        <EmptyState icon="barbell" title="No program yet" body="Create your player profile and ASCEND will build a personal program." action={<Button label="Create program" onPress={() => router.push('/onboarding/create')} />} />
      </Screen>
    );

  const recentChanges = planChanges.slice(-3).reverse();

  return (
    <Screen tabBarSpace title="Train" subtitle={plan.name}>
      {activeWorkout && (
        <Banner tone="info" icon="play-circle" action={<Button size="sm" label="Resume" onPress={() => router.push('/workout')} />}>
          {`${activeWorkout.title} is in progress.`}
        </Banner>
      )}
      <WeekStrip plan={plan} today={today} />

      <View style={styles.actions}>
        <QuickAction icon="library" label="Exercise library" onPress={() => router.push('/library')} />
        <QuickAction icon="add-circle" label="Free workout" onPress={() => router.push('/free-workout')} />
        <QuickAction icon="create" label="Edit plan" onPress={() => router.push({ pathname: '/plan-edit', params: { target: 'plan' } })} />
        <QuickAction
          icon="refresh-circle"
          label="Rebuild plan"
          onPress={() =>
            confirm('Rebuild your program?', 'ASCEND will generate a fresh program from your profile. Your history and XP are kept, and you can review it before accepting.', () => {
              setDraftPlan(null);
              router.push('/onboarding/analyzing');
            })
          }
        />
      </View>

      {recentChanges.length > 0 && (
        <Panel title="Coach updates">
          <View style={{ gap: spacing.sm }}>
            {recentChanges.map((c) => (
              <View key={c.at} style={{ gap: 2 }}>
                <AText variant="tiny" faint>
                  {relativeDay(c.at)}
                </AText>
                {c.changes.map((t) => (
                  <AText key={t} variant="small" muted>
                    • {t}
                  </AText>
                ))}
              </View>
            ))}
          </View>
        </Panel>
      )}

      <SectionTitle>Weekly program</SectionTitle>
      {plan.days.map((d) => (
        <DayCard key={d.id} day={d} initiallyOpen={d.weekday === today} onStart={() => start(d.id)} />
      ))}
      {plan.restDays.length > 0 && (
        <AText variant="small" muted>
          Rest days are part of the program. Use them for the mobility routine, a walk, or simply recovering.
        </AText>
      )}

      <NotesList title="How to progress" items={plan.progression} icon="trending-up" />

      <SectionTitle>Recent workouts</SectionTitle>
      {sessions.length === 0 ? (
        <AText variant="small" muted>
          Completed workouts will appear here.
        </AText>
      ) : (
        [...sessions]
          .reverse()
          .slice(0, 8)
          .map((s) => (
            <Panel key={s.id} onPress={() => router.push({ pathname: '/session/[id]', params: { id: s.id } })} accessibilityLabel={`${s.title}, ${relativeDay(s.finishedAt)}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <AText variant="bodyStrong">{s.title}</AText>
                  <AText variant="small" muted>
                    {relativeDay(s.finishedAt)} · {formatDuration(s.durationSec)} · {s.exercises.reduce((a, e) => a + e.sets.length, 0)} sets
                  </AText>
                </View>
                {s.prs.length > 0 && (
                  <View style={styles.pr}>
                    <Ionicons name="trophy" size={12} color={colors.gold} />
                    <AText variant="tiny" color={colors.gold}>
                      {s.prs.length}
                    </AText>
                  </View>
                )}
                <AText variant="smallStrong" color={colors.violetBright}>
                  +{s.xpEarned} XP
                </AText>
              </View>
            </Panel>
          ))
      )}
    </Screen>
  );
}

function QuickAction({ icon, label, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.qa, pressed && { opacity: 0.75 }]}>
      <Ionicons name={icon} size={22} color={colors.violetBright} />
      <AText variant="tiny" align="center" style={{ marginTop: 6 }}>
        {label}
      </AText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: spacing.sm },
  qa: { flex: 1, alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: 4, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  pr: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(232,200,114,0.12)' },
});
