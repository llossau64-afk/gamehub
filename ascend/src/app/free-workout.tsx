import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { AText } from '../components/AText';
import { Button } from '../components/Button';
import { EmptyState } from '../components/Controls';
import { ExercisePicker } from '../components/ExercisePicker';
import { Panel } from '../components/Panel';
import { Screen } from '../components/Screen';
import { EXERCISE_BY_ID } from '../data/exercises';
import type { PlannedExercise } from '../domain/types';
import { useAppStore } from '../store/useAppStore';
import { colors, spacing } from '../theme';

function defaults(id: string): PlannedExercise {
  const ex = EXERCISE_BY_ID[id];
  if (ex?.loadType === 'timed') return ex.category === 'cardio' ? { exerciseId: id, sets: 1, repsMin: 600, repsMax: 600, restSec: 60, rir: 3 } : { exerciseId: id, sets: 3, repsMin: 20, repsMax: 40, restSec: 45, rir: 2 };
  return { exerciseId: id, sets: 3, repsMin: 8, repsMax: 12, restSec: ex?.compound ? 120 : 75, rir: 2 };
}

/** Build an unscheduled session from any exercises in the library. */
export default function FreeWorkout() {
  const startWorkout = useAppStore((s) => s.startWorkout);
  const active = useAppStore((s) => !!s.activeWorkout);
  const [list, setList] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  return (
    <Screen
      back
      title="Free workout"
      subtitle="Unscheduled sessions earn reduced XP and never replace rest."
      footer={
        <Button
          label={active ? 'Resume current workout' : 'Start workout'}
          icon="flash"
          size="lg"
          full
          disabled={!active && list.length === 0}
          onPress={() => {
            if (!active) startWorkout(null, 'Free Training', list.map(defaults));
            router.replace('/workout');
          }}
        />
      }
    >
      {list.length === 0 ? (
        <EmptyState icon="add-circle" title="Add exercises" body="Pick from exercises that match your equipment." action={<Button label="Add exercise" icon="add" onPress={() => setOpen(true)} />} />
      ) : (
        <>
          {list.map((id, i) => (
            <Panel key={id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <AText variant="label" faint>
                  {i + 1}
                </AText>
                <View style={{ flex: 1 }}>
                  <AText variant="bodyStrong">{EXERCISE_BY_ID[id]?.name}</AText>
                  <AText variant="small" muted>
                    {defaults(id).sets} sets · adjustable while training
                  </AText>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${EXERCISE_BY_ID[id]?.name}`} onPress={() => setList(list.filter((x) => x !== id))} hitSlop={10}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              </View>
            </Panel>
          ))}
          <Button label="Add exercise" icon="add" variant="secondary" onPress={() => setOpen(true)} />
        </>
      )}
      <ExercisePicker
        visible={open}
        exclude={list}
        onClose={() => setOpen(false)}
        onPick={(id) => {
          setList([...list, id]);
          setOpen(false);
        }}
      />
    </Screen>
  );
}
