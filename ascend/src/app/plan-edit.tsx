import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AText } from '../components/AText';
import { Button } from '../components/Button';
import { Banner, ChipGroup, EmptyState, Stepper } from '../components/Controls';
import { ExercisePicker } from '../components/ExercisePicker';
import { Panel } from '../components/Panel';
import { Screen } from '../components/Screen';
import { EXERCISE_BY_ID } from '../data/exercises';
import { estimateMinutes } from '../domain/plan/generator';
import { validatePlan, type ValidationIssue } from '../domain/plan/validator';
import type { PlanDay, PlannedExercise, TrainingPlan, Weekday } from '../domain/types';
import { haptic } from '../services/feedback';
import { useAppStore } from '../store/useAppStore';
import { colors, spacing } from '../theme';
import { uuid, WEEKDAY_SHORT } from '../utils';

export default function PlanEdit() {
  const { target } = useLocalSearchParams<{ target?: 'draft' | 'plan' }>();
  const isDraft = target === 'draft';
  const source = useAppStore((s) => (isDraft ? s.draftPlan : s.plan));
  const profile = useAppStore((s) => s.profile);
  const setDraftPlan = useAppStore((s) => s.setDraftPlan);
  const replacePlan = useAppStore((s) => s.replacePlan);
  const [plan, setPlan] = useState<TrainingPlan | null>(source ? JSON.parse(JSON.stringify(source)) : null);
  const [picker, setPicker] = useState<{ dayId: string; index: number | null } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[] | null>(null);

  if (!plan || !profile)
    return (
      <Screen back title="Edit plan">
        <EmptyState icon="create" title="No plan to edit" body="Create a program first." />
      </Screen>
    );

  const update = (fn: (p: TrainingPlan) => void) => {
    const next: TrainingPlan = JSON.parse(JSON.stringify(plan));
    fn(next);
    next.days.forEach((d) => (d.estMinutes = estimateMinutes(d.exercises)));
    setPlan(next);
    setIssues(null);
  };
  const day = (p: TrainingPlan, id: string) => p.days.find((d) => d.id === id)!;
  const usedDays = plan.days.map((d) => d.weekday);

  const save = () => {
    const v = validatePlan({ ...plan, source: 'edited', updatedAt: new Date().toISOString() }, profile);
    if (!v.ok) return setIssues(v.issues);
    if (isDraft) setDraftPlan(v.plan);
    else replacePlan(v.plan, 'You edited your program.');
    haptic('success');
    const fixes = v.issues.filter((i) => i.level !== 'error');
    if (fixes.length) {
      setPlan(v.plan);
      setIssues(fixes);
      return;
    }
    router.back();
  };

  return (
    <Screen
      back
      title="Edit program"
      subtitle="Every change is checked by ASCEND's safety rules."
      footer={
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button label="Cancel" variant="secondary" style={{ flex: 1 }} onPress={() => router.back()} />
          <Button label={issues && issues.every((i) => i.level !== 'error') ? 'Done' : 'Save'} style={{ flex: 2 }} icon="checkmark" onPress={issues && issues.every((i) => i.level !== 'error') ? () => router.back() : save} />
        </View>
      }
    >
      {issues && (
        <Banner tone={issues.some((i) => i.level === 'error') ? 'danger' : 'info'}>
          <View style={{ gap: 4 }}>
            <AText variant="smallStrong" color={issues.some((i) => i.level === 'error') ? colors.danger : colors.blueSoft}>
              {issues.some((i) => i.level === 'error') ? 'Please fix these before saving:' : 'Saved. ASCEND adjusted a few things for safety:'}
            </AText>
            {issues.map((i) => (
              <AText key={i.message} variant="small" muted>
                • {i.message}
              </AText>
            ))}
          </View>
        </Banner>
      )}

      {plan.days.map((d) => {
        const open = expanded === d.id;
        return (
          <Panel key={d.id} padded={false}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setExpanded(open ? null : d.id)} style={styles.dayHead}>
              <View style={{ flex: 1 }}>
                <AText variant="h3">
                  {WEEKDAY_SHORT[d.weekday]} · {d.title}
                </AText>
                <AText variant="small" muted>
                  {d.exercises.length} exercises · ~{d.estMinutes} min
                </AText>
              </View>
              <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.silverDim} />
            </Pressable>
            {open && (
              <View style={styles.dayBody}>
                <AText variant="label" muted>
                  Day of the week
                </AText>
                <ChipGroup
                  options={WEEKDAY_SHORT.map((l, i) => ({ value: i, label: l, disabled: i !== d.weekday && usedDays.includes(i as Weekday) }))}
                  value={d.weekday}
                  onChange={(v) => update((p) => (day(p, d.id).weekday = v as Weekday))}
                />
                {d.exercises.map((pe, i) => (
                  <ExerciseEditor
                    key={`${pe.exerciseId}-${i}`}
                    pe={pe}
                    first={i === 0}
                    last={i === d.exercises.length - 1}
                    onChange={(n) => update((p) => (day(p, d.id).exercises[i] = n))}
                    onRemove={() => update((p) => day(p, d.id).exercises.splice(i, 1))}
                    onMove={(dir) =>
                      update((p) => {
                        const arr = day(p, d.id).exercises;
                        const [x] = arr.splice(i, 1);
                        arr.splice(i + dir, 0, x);
                      })
                    }
                    onReplace={() => setPicker({ dayId: d.id, index: i })}
                  />
                ))}
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <Button label="Add exercise" icon="add" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => setPicker({ dayId: d.id, index: null })} />
                  <Button label="Remove day" icon="trash-outline" variant="danger" size="sm" style={{ flex: 1 }} onPress={() => update((p) => (p.days = p.days.filter((x) => x.id !== d.id)))} />
                </View>
              </View>
            )}
          </Panel>
        );
      })}

      {usedDays.length < 6 && (
        <Button
          label="Add training day"
          icon="add-circle-outline"
          variant="secondary"
          onPress={() =>
            update((p) => {
              const free = ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).find((w) => !p.days.some((x) => x.weekday === w))!;
              const nd: PlanDay = { id: `day-${free}-${uuid().slice(0, 6)}`, weekday: free, title: 'Custom Session', focus: 'Your choice', warmup: ['5 min easy cardio', 'Dynamic movements for the muscles you will train'], cooldown: ['Light stretching'], exercises: [], estMinutes: 0 };
              p.days.push(nd);
              p.days.sort((a, b) => a.weekday - b.weekday);
              setExpanded(nd.id);
            })
          }
        />
      )}

      <ExercisePicker
        visible={!!picker}
        title={picker?.index == null ? 'Add exercise' : 'Replace exercise'}
        suggestions={picker?.index != null ? EXERCISE_BY_ID[day(plan, picker.dayId)?.exercises[picker.index]?.exerciseId ?? '']?.alternatives ?? [] : []}
        exclude={picker ? day(plan, picker.dayId)?.exercises.map((e) => e.exerciseId) ?? [] : []}
        onClose={() => setPicker(null)}
        onPick={(id) => {
          if (!picker) return;
          update((p) => {
            const arr = day(p, picker.dayId).exercises;
            const ex = EXERCISE_BY_ID[id];
            const base: PlannedExercise =
              ex.loadType === 'timed' ? { exerciseId: id, sets: 3, repsMin: 20, repsMax: 40, restSec: 45, rir: 2 } : { exerciseId: id, sets: 3, repsMin: 8, repsMax: 12, restSec: ex.compound ? 120 : 75, rir: 2 };
            if (picker.index == null) arr.push(base);
            else arr[picker.index] = { ...arr[picker.index], exerciseId: id, ...(ex.loadType === 'timed' ? { repsMin: 20, repsMax: 40 } : {}) };
          });
          setPicker(null);
        }}
      />
    </Screen>
  );
}

function ExerciseEditor({
  pe,
  first,
  last,
  onChange,
  onRemove,
  onMove,
  onReplace,
}: {
  pe: PlannedExercise;
  first: boolean;
  last: boolean;
  onChange: (p: PlannedExercise) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onReplace: () => void;
}) {
  const ex = EXERCISE_BY_ID[pe.exerciseId];
  const timed = ex?.loadType === 'timed';
  return (
    <View style={styles.exBox}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <AText variant="bodyStrong" style={{ flex: 1 }}>
          {ex?.name}
        </AText>
        <IconTiny icon="arrow-up" label="Move up" disabled={first} onPress={() => onMove(-1)} />
        <IconTiny icon="arrow-down" label="Move down" disabled={last} onPress={() => onMove(1)} />
        <IconTiny icon="swap-horizontal" label="Replace" onPress={onReplace} />
        <IconTiny icon="trash-outline" label="Remove" onPress={onRemove} danger />
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Stepper label="Sets" value={pe.sets} min={1} max={6} onChange={(v) => onChange({ ...pe, sets: v })} />
        <Stepper label="Rest (s)" value={pe.restSec} min={30} max={300} step={15} onChange={(v) => onChange({ ...pe, restSec: v })} />
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Stepper label={timed ? 'Min sec' : 'Min reps'} value={pe.repsMin} min={1} max={timed ? 3600 : 30} step={timed ? 5 : 1} onChange={(v) => onChange({ ...pe, repsMin: v, repsMax: Math.max(v, pe.repsMax) })} />
        <Stepper label={timed ? 'Max sec' : 'Max reps'} value={pe.repsMax} min={1} max={timed ? 3600 : 30} step={timed ? 5 : 1} onChange={(v) => onChange({ ...pe, repsMax: v, repsMin: Math.min(v, pe.repsMin) })} />
      </View>
    </View>
  );
}

function IconTiny({ icon, label, onPress, disabled, danger }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} hitSlop={8} style={{ opacity: disabled ? 0.3 : 1, padding: 4 }}>
      <Ionicons name={icon} size={18} color={danger ? colors.danger : colors.silver} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dayHead: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, gap: spacing.md },
  dayBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.md },
  exBox: { gap: spacing.sm, padding: spacing.md, borderRadius: 12, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
});
