import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { AText } from '../../components/AText';
import { Button } from '../../components/Button';
import {
  BodySection,
  EMPTY_DRAFT,
  EquipmentSection,
  ExperienceSection,
  GoalSection,
  IdentitySection,
  LimitsSection,
  PreferencesSection,
  ScheduleSection,
  validateDraft,
  type Draft,
} from '../../components/ProfileSections';
import { Screen } from '../../components/Screen';
import { XPBar } from '../../components/XPBar';
import { isMinor } from '../../domain/safety';
import { useReduceMotion } from '../../hooks/useMotion';
import { useAppStore } from '../../store/useAppStore';
import { spacing } from '../../theme';

const STEPS = [IdentitySection, BodySection, ExperienceSection, GoalSection, EquipmentSection, ScheduleSection, PreferencesSection, LimitsSection];
const TITLES = ['Identity', 'Body', 'Experience', 'Goal', 'Equipment', 'Schedule', 'Preferences', 'Safety'];

export default function CreatePlayer() {
  const existing = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const reduce = useReduceMotion();
  const [d, setD] = useState<Draft>(existing ? { ...EMPTY_DRAFT, ...existing } : EMPTY_DRAFT);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const Section = STEPS[step];
  const last = step === STEPS.length - 1;

  const set = (p: Partial<Draft>) => {
    setD((x) => ({ ...x, ...p }));
    setErrors({});
  };

  const next = () => {
    const e = validateDraft(step, d);
    if (Object.keys(e).length) return setErrors(e);
    if (!last) return setStep(step + 1);
    setProfile({
      ...d,
      name: d.name.trim(),
      weightGoal: isMinor(d.ageRange) ? 'none' : d.weightGoal,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    });
    router.replace('/onboarding/analyzing');
  };

  return (
    <Screen
      keyboard
      back={() => (step === 0 ? (router.canGoBack() ? router.back() : router.replace('/onboarding')) : setStep(step - 1))}
      title="Player creation"
      subtitle={`Step ${step + 1} of ${STEPS.length} · ${TITLES[step]}`}
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button label={last ? 'Generate my program' : 'Continue'} iconRight={last ? 'sparkles' : 'arrow-forward'} size="lg" full onPress={next} disabled={errors.age === 'blocked'} />
          {step >= 6 && !last && <Button label="Skip" variant="ghost" onPress={() => setStep(step + 1)} />}
        </View>
      }
    >
      <XPBar progress={(step + 1) / STEPS.length} />
      <Animated.View key={step} entering={reduce ? undefined : FadeInRight.duration(260)} exiting={reduce ? undefined : FadeOutLeft.duration(160)}>
        <Section d={d} set={set} errors={errors} />
      </Animated.View>
      {last && (
        <AText variant="tiny" faint>
          By continuing you confirm ASCEND offers general fitness guidance, not medical advice. Your answers stay on your device unless you create an account.
        </AText>
      )}
    </Screen>
  );
}
