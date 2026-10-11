import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { AText } from '../../components/AText';
import { EmptyState, StatBlock } from '../../components/Controls';
import { Panel } from '../../components/Panel';
import { Screen } from '../../components/Screen';
import { EXERCISE_BY_ID } from '../../data/exercises';
import { sessionSets, sessionVolumeKg } from '../../domain/analytics';
import { useAppStore } from '../../store/useAppStore';
import { colors, spacing } from '../../theme';
import { formatDuration, toDisplayWeight } from '../../utils';

export default function SessionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useAppStore((st) => st.sessions.find((x) => x.id === id));
  const units = useAppStore((st) => st.profile?.units ?? 'kg');
  if (!s)
    return (
      <Screen back title="Workout">
        <EmptyState icon="help-circle" title="Workout not found" body="It may have been removed." />
      </Screen>
    );
  const date = new Date(s.finishedAt);
  return (
    <Screen back title={s.title} subtitle={date.toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}>
      <Panel framed>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <StatBlock value={formatDuration(s.durationSec)} label="Duration" />
          <StatBlock value={sessionSets(s)} label="Sets" />
          <StatBlock value={`+${s.xpEarned}`} label="XP" accent={colors.violetBright} />
        </View>
        {sessionVolumeKg(s) > 0 && (
          <AText variant="small" muted style={{ marginTop: spacing.md }}>
            Volume: {Math.round(toDisplayWeight(sessionVolumeKg(s), units)).toLocaleString()} {units}
          </AText>
        )}
      </Panel>
      {s.exercises.map((e, i) => {
        const ex = EXERCISE_BY_ID[e.exerciseId];
        const pr = s.prs.find((p) => p.exerciseId === e.exerciseId);
        return (
          <Panel key={`${e.exerciseId}-${i}`} title={ex?.name ?? e.exerciseId} right={pr ? <Ionicons name="trophy" size={16} color={colors.gold} /> : undefined}>
            {e.skipped && e.sets.length === 0 ? (
              <AText variant="small" muted>
                Skipped
              </AText>
            ) : (
              e.sets.map((set, n) => (
                <View key={n} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
                  <AText variant="small" muted>
                    Set {n + 1}
                  </AText>
                  <AText variant="smallStrong">
                    {set.weight ? `${toDisplayWeight(set.weight, units)} ${units} × ` : ''}
                    {set.reps}
                    {ex?.loadType === 'timed' ? ' s' : ' reps'}
                    {set.rpe ? `  ·  RPE ${set.rpe}` : ''}
                  </AText>
                </View>
              ))
            )}
            {e.replacedFrom && (
              <AText variant="tiny" faint>
                Replaced {EXERCISE_BY_ID[e.replacedFrom]?.name}
              </AText>
            )}
          </Panel>
        );
      })}
      {s.feedback && (
        <Panel title="Your feedback">
          <AText variant="small" muted>
            Completed: {s.feedback.completed} · Difficulty {s.feedback.difficulty}/5 · Technique {s.feedback.techniqueComfortable ? 'comfortable' : 'uncomfortable'}
            {s.feedback.unusualPain ? ` · Pain reported (${s.feedback.painArea})` : ''}
          </AText>
        </Panel>
      )}
    </Screen>
  );
}
