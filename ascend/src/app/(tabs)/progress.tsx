import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { AText } from '../../components/AText';
import { Button } from '../../components/Button';
import { BarChart, LineChart } from '../../components/Charts';
import { Banner, ChipGroup, EmptyState, Segmented, SectionTitle, StatBlock, Stepper } from '../../components/Controls';
import { Panel } from '../../components/Panel';
import { Screen } from '../../components/Screen';
import { EXERCISE_BY_ID } from '../../data/exercises';
import { allPRs, periodComparison, seriesBy, strengthHistory, trainedExercises, weeklyConsistency, type Range } from '../../domain/analytics';
import { allowsWeightFeatures } from '../../domain/safety';
import { useTrainingData } from '../../hooks/useData';
import { playSound } from '../../services/feedback';
import { useAppStore } from '../../store/useAppStore';
import { colors, spacing } from '../../theme';
import { fromDisplayWeight, relativeDay, toDisplayWeight } from '../../utils';

type Metric = 'workouts' | 'sets' | 'volume' | 'minutes';

function Delta({ cur, prev, unit = '' }: { cur: number; prev: number; unit?: string }) {
  if (prev === 0 && cur === 0) return <AText variant="tiny" faint>—</AText>;
  const d = cur - prev;
  const up = d >= 0;
  return (
    <AText variant="tiny" color={d === 0 ? colors.textFaint : up ? colors.success : colors.textMuted}>
      {up ? '▲' : '▼'} {Math.abs(Math.round(d)).toLocaleString()}
      {unit} vs prev.
    </AText>
  );
}

export default function Progress() {
  const { profile, plan, bodyMetrics, addBodyMetric, removeBodyMetric, markProgressReviewed } = useAppStore(
    useShallow((s) => ({ profile: s.profile, plan: s.plan, bodyMetrics: s.bodyMetrics, addBodyMetric: s.addBodyMetric, removeBodyMetric: s.removeBodyMetric, markProgressReviewed: s.markProgressReviewed })),
  );
  const { sessions, checkins, demo } = useTrainingData();
  const units = profile?.units ?? 'kg';
  const [range, setRange] = useState<Range>('M');
  const [metric, setMetric] = useState<Metric>('workouts');
  const [lift, setLift] = useState<string | null>(null);
  const [bw, setBw] = useState(() => toDisplayWeight(bodyMetrics[bodyMetrics.length - 1]?.weightKg ?? 70, units));

  useFocusEffect(
    useCallback(() => {
      const t = setTimeout(() => {
        if (markProgressReviewed()) playSound('xp');
      }, 1200);
      return () => clearTimeout(t);
    }, [markProgressReviewed]),
  );

  const cmp = useMemo(() => periodComparison(sessions, range), [sessions, range]);
  const series = useMemo(
    () => seriesBy(sessions, range, metric).map((p) => ({ ...p, value: metric === 'volume' ? Math.round(toDisplayWeight(p.value, units)) : p.value })),
    [sessions, range, metric, units],
  );
  const consistency = useMemo(() => weeklyConsistency(sessions, plan, 8), [sessions, plan]);
  const lifts = useMemo(() => trainedExercises(sessions).filter((x) => EXERCISE_BY_ID[x.exerciseId]?.loadType === 'weighted').slice(0, 6), [sessions]);
  const selected = lift ?? lifts[0]?.exerciseId ?? null;
  const history = useMemo(() => (selected ? strengthHistory(selected, sessions) : []), [selected, sessions]);
  const prs = useMemo(() => allPRs(sessions).slice(0, 8), [sessions]);
  const exercises = useMemo(() => trainedExercises(sessions).slice(0, 12), [sessions]);
  const recentCheckins = checkins.slice(-7);
  const avg = (k: 'sleep' | 'energy' | 'soreness') => (recentCheckins.length ? (recentCheckins.reduce((a, c) => a + c[k], 0) / recentCheckins.length).toFixed(1) : '—');
  const adult = profile ? allowsWeightFeatures(profile) : false;
  const rangeLabel = range === 'W' ? 'last 7 days' : range === 'M' ? 'last 5 weeks' : 'last 12 months';

  if (sessions.length === 0 && !demo)
    return (
      <Screen tabBarSpace title="Progress">
        <EmptyState
          icon="stats-chart"
          title="No training data yet"
          body="Complete your first workout and your strength, volume and consistency charts will appear here — built only from your real sessions."
          action={<Button label="Go to training" onPress={() => router.push('/(tabs)/train')} />}
        />
        <AText variant="small" muted align="center">
          Want a preview? Turn on clearly labelled Demo Mode in Settings.
        </AText>
      </Screen>
    );

  return (
    <Screen tabBarSpace title="Progress" subtitle="Compare yourself only with your past self.">
      {demo && <Banner tone="demo">DEMO DATA — these charts show generated sample sessions, not your real history.</Banner>}
      <Segmented
        options={[
          { value: 'W', label: 'Week' },
          { value: 'M', label: 'Month' },
          { value: 'Y', label: 'Year' },
        ]}
        value={range}
        onChange={setRange}
      />

      <Panel framed title={`Summary · ${rangeLabel}`}>
        <View style={styles.grid}>
          <View style={{ flex: 1 }}>
            <StatBlock value={cmp.current.workouts} label="Workouts" />
            <Delta cur={cmp.current.workouts} prev={cmp.previous.workouts} />
          </View>
          <View style={{ flex: 1 }}>
            <StatBlock value={cmp.current.sets} label="Sets" />
            <Delta cur={cmp.current.sets} prev={cmp.previous.sets} />
          </View>
          <View style={{ flex: 1 }}>
            <StatBlock value={cmp.current.minutes} label="Minutes" />
            <Delta cur={cmp.current.minutes} prev={cmp.previous.minutes} />
          </View>
        </View>
        <View style={[styles.grid, { marginTop: spacing.lg }]}>
          <View style={{ flex: 2 }}>
            <StatBlock value={`${Math.round(toDisplayWeight(cmp.current.volumeKg, units)).toLocaleString()}`} label={`Volume (${units})`} />
            <Delta cur={toDisplayWeight(cmp.current.volumeKg, units)} prev={toDisplayWeight(cmp.previous.volumeKg, units)} unit={` ${units}`} />
          </View>
          <View style={{ flex: 1 }}>
            <StatBlock value={cmp.current.prs} label="Records" accent={colors.gold} />
          </View>
        </View>
      </Panel>

      <Panel title="Training trends">
        <View style={{ gap: spacing.md }}>
          <ChipGroup
            options={[
              { value: 'workouts', label: 'Workouts' },
              { value: 'sets', label: 'Sets' },
              { value: 'volume', label: 'Volume' },
              { value: 'minutes', label: 'Minutes' },
            ]}
            value={metric}
            onChange={(v) => setMetric(v as Metric)}
          />
          <BarChart data={series} unit={metric === 'volume' ? units : metric === 'minutes' ? 'min' : undefined} accessibilityLabel={`${metric} per ${range === 'W' ? 'day' : range === 'M' ? 'week' : 'month'}`} />
        </View>
      </Panel>

      <Panel title="Weekly consistency">
        <BarChart data={consistency.map((c) => ({ label: c.label, value: c.done }))} height={110} accessibilityLabel="Training days per week, last 8 weeks" />
        <AText variant="small" muted style={{ marginTop: spacing.sm }}>
          Planned: {plan?.days.length ?? 0} sessions per week. Rest weeks happen — consistency over months is what counts.
        </AText>
      </Panel>

      <Panel title="Strength progression">
        {lifts.length === 0 ? (
          <AText variant="small" muted>
            Log weighted exercises to see estimated strength trends.
          </AText>
        ) : (
          <View style={{ gap: spacing.md }}>
            <ChipGroup options={lifts.map((l) => ({ value: l.exerciseId, label: EXERCISE_BY_ID[l.exerciseId].name }))} value={selected ?? ''} onChange={(v) => setLift(v as string)} />
            {history.length >= 2 ? (
              <LineChart
                accessibilityLabel={`Estimated one-rep max for ${EXERCISE_BY_ID[selected!].name}`}
                unit={units}
                data={history.map((h) => ({ label: new Date(h.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), value: toDisplayWeight(h.e1rm, units) }))}
              />
            ) : (
              <AText variant="small" muted>
                Log this exercise in at least two sessions to see a trend.
              </AText>
            )}
            <AText variant="tiny" faint>
              Estimated 1-rep max (Epley formula) from your best set each session — an estimate, not a test.
            </AText>
          </View>
        )}
      </Panel>

      <Panel title="Personal records" accent={colors.gold}>
        {prs.length === 0 ? (
          <AText variant="small" muted>
            Records appear when you beat your own previous best.
          </AText>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {prs.map((pr, i) => (
              <View key={`${pr.exerciseId}-${pr.at}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Ionicons name="trophy" size={15} color={colors.gold} />
                <AText variant="small" style={{ flex: 1 }} numberOfLines={1}>
                  {EXERCISE_BY_ID[pr.exerciseId]?.name}
                </AText>
                <AText variant="smallStrong">{pr.kind === 'reps' ? `${pr.value} reps` : `${toDisplayWeight(pr.value, units)} ${units}${pr.kind === 'e1rm' ? '*' : ''}`}</AText>
                <AText variant="tiny" faint style={{ width: 70, textAlign: 'right' }}>
                  {relativeDay(pr.at)}
                </AText>
              </View>
            ))}
            <AText variant="tiny" faint>
              * estimated 1-rep max
            </AText>
          </View>
        )}
      </Panel>

      <Panel title="Recovery · last 7 check-ins">
        <View style={styles.grid}>
          <StatBlock value={avg('sleep')} label="Sleep /5" />
          <StatBlock value={avg('energy')} label="Energy /5" />
          <StatBlock value={avg('soreness')} label="Soreness /5" />
        </View>
      </Panel>

      <SectionTitle>Exercise history</SectionTitle>
      <View style={{ gap: spacing.sm }}>
        {exercises.map((e) => (
          <Pressable
            key={e.exerciseId}
            accessibilityRole="link"
            onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: e.exerciseId } })}
            style={({ pressed }) => [styles.histRow, pressed && { opacity: 0.8 }]}
          >
            <AText variant="small" style={{ flex: 1 }}>
              {EXERCISE_BY_ID[e.exerciseId]?.name}
            </AText>
            <AText variant="tiny" muted>
              {e.count} sessions
            </AText>
            <Ionicons name="chevron-forward" size={16} color={colors.silverDim} />
          </Pressable>
        ))}
      </View>

      {adult && !demo && (
        <Panel title="Body weight (optional)">
          <View style={{ gap: spacing.md }}>
            <AText variant="small" muted>
              Entirely optional and private. Day-to-day changes are normal — trends over weeks matter more.
            </AText>
            <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' }}>
              <Stepper label={`Today (${units})`} value={bw} onChange={setBw} step={units === 'kg' ? 0.1 : 0.2} min={25} max={400} decimals={1} />
              <Button label="Save" onPress={() => addBodyMetric(Math.round(fromDisplayWeight(bw, units) * 10) / 10)} />
            </View>
            {bodyMetrics.length >= 2 && (
              <LineChart
                accessibilityLabel="Body weight over time"
                unit={units}
                data={bodyMetrics.slice(-30).map((b) => ({ label: new Date(`${b.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), value: toDisplayWeight(b.weightKg, units) }))}
              />
            )}
            {bodyMetrics.slice(-3).reverse().map((b) => (
              <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <AText variant="small" muted style={{ flex: 1 }}>
                  {b.date}
                </AText>
                <AText variant="smallStrong">
                  {toDisplayWeight(b.weightKg, units)} {units}
                </AText>
                <Pressable accessibilityRole="button" accessibilityLabel={`Delete entry ${b.date}`} onPress={() => removeBodyMetric(b.id)} hitSlop={10}>
                  <Ionicons name="trash-outline" size={16} color={colors.silverDim} />
                </Pressable>
              </View>
            ))}
          </View>
        </Panel>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', gap: spacing.md },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
});
