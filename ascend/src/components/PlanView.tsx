import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { EXERCISE_BY_ID } from '../data/exercises';
import type { PlanDay, PlannedExercise, TrainingPlan } from '../domain/types';
import { haptic } from '../services/feedback';
import { colors, radius, spacing } from '../theme';
import { WEEKDAY_LONG, WEEKDAY_SHORT } from '../utils';
import { AText } from './AText';
import { Panel } from './Panel';

export function formatTarget(pe: PlannedExercise): string {
  const ex = EXERCISE_BY_ID[pe.exerciseId];
  if (ex?.loadType === 'timed') {
    const f = (s: number) => (s >= 120 ? `${Math.round(s / 60)} min` : `${s} s`);
    return `${pe.sets} × ${pe.repsMin === pe.repsMax ? f(pe.repsMin) : `${pe.repsMin}–${pe.repsMax} s`}`;
  }
  return `${pe.sets} × ${pe.repsMin === pe.repsMax ? pe.repsMin : `${pe.repsMin}–${pe.repsMax}`}`;
}

export function WeekStrip({ plan, today }: { plan: TrainingPlan; today?: number }) {
  return (
    <View style={styles.week} accessibilityLabel="Weekly schedule">
      {WEEKDAY_SHORT.map((d, i) => {
        const day = plan.days.find((x) => x.weekday === i);
        const isToday = today === i;
        return (
          <View key={d} style={[styles.weekDay, day && styles.weekTrain, isToday && styles.weekToday]} accessible accessibilityLabel={`${WEEKDAY_LONG[i]}: ${day ? day.title : 'rest'}${isToday ? ', today' : ''}`}>
            <AText variant="tiny" color={isToday ? colors.text : colors.textMuted}>
              {d}
            </AText>
            <Ionicons name={day ? 'barbell' : 'moon'} size={14} color={day ? colors.violetBright : colors.silverFaint} style={{ marginTop: 4 }} />
          </View>
        );
      })}
    </View>
  );
}

export function DayCard({ day, initiallyOpen, onStart }: { day: PlanDay; initiallyOpen?: boolean; onStart?: () => void }) {
  const [open, setOpen] = useState(!!initiallyOpen);
  return (
    <Panel padded={false}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${WEEKDAY_LONG[day.weekday]}, ${day.title}, about ${day.estMinutes} minutes`}
        onPress={() => {
          haptic('select');
          setOpen(!open);
        }}
        style={styles.dayHead}
      >
        <View style={styles.dayBadge}>
          <AText variant="label" color={colors.violetBright}>
            {WEEKDAY_SHORT[day.weekday]}
          </AText>
        </View>
        <View style={{ flex: 1 }}>
          <AText variant="h3">{day.title}</AText>
          <AText variant="small" muted numberOfLines={1}>
            {day.focus} · ~{day.estMinutes} min · {day.exercises.length} exercises
          </AText>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.silverDim} />
      </Pressable>
      {open && (
        <View style={styles.dayBody}>
          <AText variant="label" muted>
            Warm-up
          </AText>
          {day.warmup.map((w) => (
            <AText key={w} variant="small" muted>
              • {w}
            </AText>
          ))}
          <View style={{ height: spacing.sm }} />
          {day.exercises.map((pe, i) => {
            const ex = EXERCISE_BY_ID[pe.exerciseId];
            return (
              <Pressable
                key={pe.exerciseId + i}
                accessibilityRole="link"
                accessibilityLabel={`${ex?.name}, ${formatTarget(pe)}, rest ${pe.restSec} seconds. Open technique guide.`}
                onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: pe.exerciseId } })}
                style={({ pressed }) => [styles.exRow, pressed && { backgroundColor: colors.surfaceAlt }]}
              >
                <AText variant="label" faint style={{ width: 20 }}>
                  {i + 1}
                </AText>
                <View style={{ flex: 1 }}>
                  <AText variant="bodyStrong">{ex?.name ?? pe.exerciseId}</AText>
                  <AText variant="small" muted>
                    {formatTarget(pe)} · rest {pe.restSec >= 120 ? `${(pe.restSec / 60).toFixed(pe.restSec % 60 ? 1 : 0)} min` : `${pe.restSec} s`} · {pe.rir} RIR
                  </AText>
                  {pe.notes ? (
                    <AText variant="tiny" faint>
                      {pe.notes}
                    </AText>
                  ) : null}
                </View>
                <Ionicons name="information-circle-outline" size={18} color={colors.silverDim} />
              </Pressable>
            );
          })}
          {day.cooldown.length > 0 && (
            <>
              <AText variant="label" muted style={{ marginTop: spacing.sm }}>
                Cool-down
              </AText>
              {day.cooldown.map((w) => (
                <AText key={w} variant="small" muted>
                  • {w}
                </AText>
              ))}
            </>
          )}
          {onStart && (
            <Pressable accessibilityRole="button" onPress={onStart} style={styles.startLink}>
              <Ionicons name="play" size={14} color={colors.violetBright} />
              <AText variant="smallStrong" color={colors.violetBright}>
                Start this session
              </AText>
            </Pressable>
          )}
        </View>
      )}
    </Panel>
  );
}

export function NotesList({ title, items, icon }: { title: string; items: string[]; icon: React.ComponentProps<typeof Ionicons>['name'] }) {
  if (!items.length) return null;
  return (
    <Panel title={title}>
      <View style={{ gap: spacing.sm }}>
        {items.map((t) => (
          <View key={t} style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Ionicons name={icon} size={14} color={colors.violetBright} style={{ marginTop: 3 }} />
            <AText variant="small" muted style={{ flex: 1 }}>
              {t}
            </AText>
          </View>
        ))}
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  week: { flexDirection: 'row', gap: 6 },
  weekDay: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  weekTrain: { backgroundColor: '#14111D', borderColor: colors.violetDeep },
  weekToday: { borderColor: colors.violetBright, borderWidth: 1.5 },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  dayBadge: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.violetWash, borderWidth: 1, borderColor: colors.violetDeep },
  dayBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.md },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 10, borderRadius: radius.sm },
  startLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md, alignSelf: 'flex-start' },
});
