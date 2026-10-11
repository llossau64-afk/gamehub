import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../components/Button';
import { Banner, Divider } from '../components/Controls';
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
} from '../components/ProfileSections';
import { Screen } from '../components/Screen';
import { isMinor } from '../domain/safety';
import { useAppStore } from '../store/useAppStore';
import { spacing } from '../theme';

const SECTIONS = [IdentitySection, BodySection, ExperienceSection, GoalSection, EquipmentSection, ScheduleSection, PreferencesSection, LimitsSection];

export default function ProfileEdit() {
  const profile = useAppStore((s) => s.profile);
  const updateProfile = useAppStore((s) => s.updateProfile);
  const [d, setD] = useState<Draft>({ ...EMPTY_DRAFT, ...(profile ?? {}) });
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [saved, setSaved] = useState(false);

  const save = (): boolean => {
    const e = { ...validateDraft(0, d), ...validateDraft(5, d) };
    if (Object.keys(e).length) {
      setErrors(e);
      return false;
    }
    updateProfile({ ...d, name: d.name.trim(), weightGoal: isMinor(d.ageRange) ? 'none' : d.weightGoal });
    setSaved(true);
    return true;
  };

  return (
    <Screen
      keyboard
      back
      title="Player profile"
      subtitle="Changes to equipment and limitations update your plan automatically."
      footer={
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button label="Rebuild plan" variant="secondary" style={{ flex: 1 }} onPress={() => { if (save()) router.push('/onboarding/analyzing'); }} />
          <Button label="Save" style={{ flex: 1 }} icon="checkmark" onPress={save} disabled={errors.age === 'blocked'} />
        </View>
      }
    >
      {saved && <Banner tone="success">Profile saved. Your current plan was re-checked against your new settings.</Banner>}
      {SECTIONS.map((S, i) => (
        <View key={i} style={{ gap: spacing.xl }}>
          <S d={d} set={(p) => { setD({ ...d, ...p }); setSaved(false); setErrors({}); }} errors={errors} />
          {i < SECTIONS.length - 1 && <Divider />}
        </View>
      ))}
    </Screen>
  );
}
