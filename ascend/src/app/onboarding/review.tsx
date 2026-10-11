import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AText } from '../../components/AText';
import { Button } from '../../components/Button';
import { Banner } from '../../components/Controls';
import { Panel } from '../../components/Panel';
import { DayCard, NotesList, WeekStrip } from '../../components/PlanView';
import { Screen } from '../../components/Screen';
import { useReduceMotion } from '../../hooks/useMotion';
import { playSound } from '../../services/feedback';
import { useAppStore } from '../../store/useAppStore';
import { colors, spacing } from '../../theme';

export default function Review() {
  const draft = useAppStore((s) => s.draftPlan);
  const onboarded = useAppStore((s) => s.onboarded);
  const acceptPlan = useAppStore((s) => s.acceptPlan);
  const replacePlan = useAppStore((s) => s.replacePlan);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const reduce = useReduceMotion();
  const [saving, setSaving] = useState(false);

  if (!draft) return <Redirect href="/" />;

  const accept = () => {
    setSaving(true);
    if (onboarded) replacePlan({ ...draft }, `New program: ${draft.name}`);
    acceptPlan(draft);
    completeOnboarding();
    playSound('complete');
    router.replace('/(tabs)');
  };

  return (
    <Screen
      particles
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button label="Accept program" icon="checkmark" size="lg" full onPress={accept} loading={saving} />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button label="Edit" icon="create-outline" variant="secondary" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/plan-edit', params: { target: 'draft' } })} />
            <Button label="Rebuild" icon="refresh" variant="secondary" style={{ flex: 1 }} onPress={() => router.replace('/onboarding/analyzing')} />
          </View>
        </View>
      }
    >
      <Animated.View entering={reduce ? undefined : FadeInDown.duration(700)} style={{ gap: spacing.sm, marginTop: spacing.lg }}>
        <AText variant="label" color={colors.violetBright}>
          {draft.source === 'ai' ? 'AI coach · validated' : draft.source === 'edited' ? 'Edited by you · validated' : 'ASCEND program engine · validated'}
        </AText>
        <AText variant="h1" accessibilityRole="header">
          YOUR PERSONAL TRAINING PROGRAM IS READY.
        </AText>
        <AText variant="body" muted>
          Review it, adjust anything you like, then accept to begin.
        </AText>
      </Animated.View>

      <Panel framed title={draft.split}>
        <AText variant="h2" style={{ marginBottom: spacing.sm }}>
          {draft.name}
        </AText>
        <AText variant="small" muted>
          {draft.rationale}
        </AText>
        <View style={{ marginTop: spacing.lg }}>
          <WeekStrip plan={draft} />
        </View>
      </Panel>

      {draft.warnings.map((w) => (
        <Banner key={w} tone="info">
          {w}
        </Banner>
      ))}

      {draft.days.map((d, i) => (
        <DayCard key={d.id} day={d} initiallyOpen={i === 0} />
      ))}

      <NotesList title="Progression" items={draft.progression} icon="trending-up" />
      <NotesList title="Recovery" items={draft.recoveryNotes} icon="moon" />
      <NotesList title="Technique" items={draft.techniqueNotes} icon="eye" />
    </Screen>
  );
}
