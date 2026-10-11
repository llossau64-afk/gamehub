import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { AText } from '../../components/AText';
import { LineChart } from '../../components/Charts';
import { Banner, Chip, EmptyState } from '../../components/Controls';
import { Panel } from '../../components/Panel';
import { formatTarget } from '../../components/PlanView';
import { Screen } from '../../components/Screen';
import { CATEGORY_LABELS, EQUIPMENT_LABELS, EXERCISE_BY_ID, MUSCLE_LABELS } from '../../data/exercises';
import { strengthHistory } from '../../domain/analytics';
import { exerciseAvailability } from '../../domain/plan/library';
import { useAppStore } from '../../store/useAppStore';
import { colors, spacing } from '../../theme';
import { toDisplayWeight } from '../../utils';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Panel title={title}>
      <View style={{ gap: spacing.sm }}>{children}</View>
    </Panel>
  );
}

export default function ExerciseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const ex = EXERCISE_BY_ID[id ?? ''];
  const { profile, plan, sessions, markTechniqueViewed } = useAppStore(
    useShallow((s) => ({ profile: s.profile, plan: s.plan, sessions: s.sessions, markTechniqueViewed: s.markTechniqueViewed })),
  );
  const units = profile?.units ?? 'kg';

  useEffect(() => {
    if (ex) markTechniqueViewed(ex.id);
  }, [ex, markTechniqueViewed]);

  const history = useMemo(() => (ex ? strengthHistory(ex.id, sessions) : []), [ex, sessions]);
  const inPlan = plan?.days.flatMap((d) => d.exercises.filter((e) => e.exerciseId === ex?.id).map((e) => ({ day: d, pe: e }))) ?? [];

  if (!ex)
    return (
      <Screen back title="Exercise">
        <EmptyState icon="help-circle" title="Exercise not found" body="It may have been removed from the library." />
      </Screen>
    );

  const availability = profile ? exerciseAvailability(ex.id, profile) : 'ok';
  const best = history.length ? Math.max(...history.map((h) => (ex.loadType === 'weighted' ? h.bestWeight : h.bestReps))) : null;

  return (
    <Screen back title={ex.name} subtitle={`${CATEGORY_LABELS[ex.category]} · ${ex.difficulty}`}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {ex.equipment.map((e) => (
          <Chip key={e} label={EQUIPMENT_LABELS[e]} icon="construct-outline" />
        ))}
        {ex.compound && <Chip label="Compound" icon="git-merge-outline" />}
      </View>
      {availability === 'limitation' && <Banner tone="warning">This exercise loads an area you asked us to protect. Consider an alternative below.</Banner>}
      {availability === 'equipment' && <Banner tone="info">You do not have the equipment for this exercise in your profile.</Banner>}

      <Panel>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="videocam-off-outline" size={20} color={colors.silverDim} />
          </View>
          <View style={{ flex: 1 }}>
            <AText variant="bodyStrong">No demonstration available</AText>
            <AText variant="small" muted>
              ASCEND only shows licensed, verified technique videos. Follow the written guide below.
            </AText>
          </View>
        </View>
      </Panel>

      <Section title="Muscles">
        <AText variant="small">
          <AText variant="smallStrong" color={colors.violetBright}>
            Primary:{' '}
          </AText>
          {ex.primary.map((m) => MUSCLE_LABELS[m]).join(', ')}
        </AText>
        {ex.secondary.length > 0 && (
          <AText variant="small" muted>
            Secondary: {ex.secondary.map((m) => MUSCLE_LABELS[m]).join(', ')}
          </AText>
        )}
      </Section>

      {inPlan.length > 0 && (
        <Section title="In your program">
          {inPlan.map(({ day, pe }) => (
            <AText key={day.id} variant="small">
              {day.title}: {formatTarget(pe)} · rest {pe.restSec}s · {pe.rir} reps in reserve
            </AText>
          ))}
        </Section>
      )}

      <Section title="Starting position">
        <AText variant="small">{ex.startingPosition}</AText>
      </Section>

      <Section title="Step by step">
        {ex.steps.map((s, i) => (
          <View key={s} style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.violetWash, alignItems: 'center', justifyContent: 'center' }}>
              <AText variant="tiny" color={colors.violetBright}>
                {i + 1}
              </AText>
            </View>
            <AText variant="small" style={{ flex: 1 }}>
              {s}
            </AText>
          </View>
        ))}
      </Section>

      <Section title="Movement">
        <AText variant="small">{ex.movement}</AText>
      </Section>

      <Section title="Breathing">
        <AText variant="small">{ex.breathing}</AText>
      </Section>

      <Section title="Common mistakes">
        {ex.mistakes.map((m) => (
          <View key={m} style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Ionicons name="close-circle" size={16} color={colors.danger} style={{ marginTop: 1 }} />
            <AText variant="small" style={{ flex: 1 }}>
              {m}
            </AText>
          </View>
        ))}
      </Section>

      <Section title="Safety">
        {ex.safety.map((m) => (
          <View key={m} style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Ionicons name="shield-checkmark" size={16} color={colors.success} style={{ marginTop: 1 }} />
            <AText variant="small" style={{ flex: 1 }}>
              {m}
            </AText>
          </View>
        ))}
      </Section>

      <Section title="Easier variation">
        <AText variant="small">{ex.easier}</AText>
        {ex.easierId && EXERCISE_BY_ID[ex.easierId] && (
          <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: ex.easierId! } })}>
            <AText variant="smallStrong" color={colors.violetBright}>
              Open {EXERCISE_BY_ID[ex.easierId].name} →
            </AText>
          </Pressable>
        )}
      </Section>

      <Section title="Alternatives">
        {ex.alternatives.map((a) => (
          <Pressable
            key={a}
            accessibilityRole="link"
            onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: a } })}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}
          >
            <AText variant="small">{EXERCISE_BY_ID[a]?.name}</AText>
            <Ionicons name="chevron-forward" size={16} color={colors.silverDim} />
          </Pressable>
        ))}
      </Section>

      <Section title="Your history">
        {history.length === 0 ? (
          <AText variant="small" muted>
            No sets logged yet.
          </AText>
        ) : (
          <>
            <AText variant="small">
              Logged in {history.length} session{history.length > 1 ? 's' : ''}. Best: {ex.loadType === 'weighted' ? `${toDisplayWeight(best ?? 0, units)} ${units}` : `${best} ${ex.loadType === 'timed' ? 's' : 'reps'}`}
            </AText>
            {history.length >= 2 && (
              <LineChart
                accessibilityLabel={ex.loadType === 'weighted' ? 'Estimated one-rep max over time' : 'Best reps over time'}
                unit={ex.loadType === 'weighted' ? units : 'reps'}
                data={history.map((h) => ({
                  label: new Date(h.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                  value: ex.loadType === 'weighted' ? toDisplayWeight(h.e1rm, units) : h.bestReps,
                }))}
              />
            )}
          </>
        )}
      </Section>
    </Screen>
  );
}
