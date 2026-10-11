import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { CATEGORY_LABELS, EQUIPMENT_LABELS, EXERCISES } from '../data/exercises';
import { availableExercises } from '../domain/plan/library';
import { allowsWeightFeatures, isBlockedAge, isMinor } from '../domain/safety';
import type { AgeRange, BodyArea, Equipment, Experience, Gender, Goal, Intensity, Profile, Weekday, WeightGoal } from '../domain/types';
import { colors, spacing } from '../theme';
import { WEEKDAY_SHORT } from '../utils';
import { AText } from './AText';
import { Banner, ChipGroup, Field, OptionCard, Segmented, Stepper } from './Controls';

export type Draft = Omit<Profile, 'createdAt'>;

export const EMPTY_DRAFT: Draft = {
  name: '',
  ageRange: '25-34',
  gender: 'prefer-not',
  genderSelfDescribe: '',
  heightCm: undefined,
  experience: 'beginner',
  previousTraining: '',
  goal: 'general',
  weightGoal: 'none',
  location: 'gym',
  equipment: [],
  trainingDays: [0, 2, 4],
  sessionMinutes: 45,
  preferredExercises: [],
  limitations: [],
  limitationNotes: '',
  intensity: 'moderate',
  units: 'kg',
  coachLanguage: 'auto',
};

type Props = { d: Draft; set: (p: Partial<Draft>) => void; errors?: Record<string, string | null> };

const Q = ({ title, hint }: { title: string; hint?: string }) => (
  <View style={{ gap: 4, marginBottom: spacing.xs }}>
    <AText variant="h2">{title}</AText>
    {hint && (
      <AText variant="small" muted>
        {hint}
      </AText>
    )}
  </View>
);

export const AGE_OPTIONS: { value: AgeRange; label: string }[] = [
  { value: 'under13', label: 'Under 13' },
  { value: '13-15', label: '13–15' },
  { value: '16-17', label: '16–17' },
  { value: '18-24', label: '18–24' },
  { value: '25-34', label: '25–34' },
  { value: '35-44', label: '35–44' },
  { value: '45-54', label: '45–54' },
  { value: '55-64', label: '55–64' },
  { value: '65+', label: '65+' },
];

export function IdentitySection({ d, set, errors }: Props) {
  return (
    <View style={{ gap: spacing.lg }}>
      <Q title="What should we call you?" hint="A name or nickname for your player. It is shown only to you." />
      <Field label="Player name" value={d.name} onChangeText={(name) => set({ name })} placeholder="e.g. Kai" maxLength={24} autoCapitalize="words" error={errors?.name} returnKeyType="done" />
      <Q title="Your age range" hint="Used only to keep your training age-appropriate." />
      <ChipGroup options={AGE_OPTIONS} value={d.ageRange} onChange={(v) => set({ ageRange: v as AgeRange, ...(isMinor(v as AgeRange) ? { weightGoal: 'none' } : {}) })} />
      {isBlockedAge(d.ageRange) && (
        <Banner tone="warning">ASCEND is designed for players aged 13 and older. Please ask a parent, PE teacher or coach about fun ways to stay active.</Banner>
      )}
      {isMinor(d.ageRange) && !isBlockedAge(d.ageRange) && (
        <Banner tone="info">Your program will focus on technique, strength, recovery and enjoying training — never on weight loss or appearance.</Banner>
      )}
    </View>
  );
}

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'female', label: 'Woman' },
  { value: 'male', label: 'Man' },
  { value: 'non-binary', label: 'Non-binary' },
  { value: 'self-describe', label: 'Self-describe' },
  { value: 'prefer-not', label: 'Prefer not to say' },
];

export function BodySection({ d, set }: Props) {
  const [showHeight, setShowHeight] = useState(d.heightCm !== undefined);
  return (
    <View style={{ gap: spacing.lg }}>
      <Q title="Gender (optional)" hint="Optional. It does not change your program." />
      <ChipGroup options={GENDERS} value={d.gender} onChange={(v) => set({ gender: v as Gender })} />
      {d.gender === 'self-describe' && <Field label="How do you describe yourself?" value={d.genderSelfDescribe} onChangeText={(t) => set({ genderSelfDescribe: t })} maxLength={40} />}
      <Q title="Height (optional)" />
      <ChipGroup
        options={[
          { value: 'skip', label: 'Skip' },
          { value: 'add', label: 'Add height' },
        ]}
        value={showHeight ? 'add' : 'skip'}
        onChange={(v) => {
          const on = v === 'add';
          setShowHeight(on);
          set({ heightCm: on ? (d.heightCm ?? 170) : undefined });
        }}
      />
      {showHeight && <Stepper label="Height" value={d.heightCm ?? 170} onChange={(heightCm) => set({ heightCm })} min={120} max={230} suffix="cm" />}
      <Q title="Units" />
      <Segmented
        options={[
          { value: 'kg', label: 'Kilograms (kg)' },
          { value: 'lb', label: 'Pounds (lb)' },
        ]}
        value={d.units}
        onChange={(units) => set({ units })}
      />
    </View>
  );
}

const EXPERIENCE: { value: Experience; title: string; desc: string }[] = [
  { value: 'new', title: 'Brand new', desc: 'I have never trained regularly.' },
  { value: 'beginner', title: 'Beginner', desc: 'Less than a year of regular training.' },
  { value: 'intermediate', title: 'Intermediate', desc: '1–3 years, comfortable with main lifts.' },
  { value: 'advanced', title: 'Advanced', desc: '3+ years of structured training.' },
];

export function ExperienceSection({ d, set }: Props) {
  return (
    <View style={{ gap: spacing.md }}>
      <Q title="Training experience" />
      {EXPERIENCE.map((e) => (
        <OptionCard key={e.value} title={e.title} description={e.desc} selected={d.experience === e.value} onPress={() => set({ experience: e.value })} />
      ))}
      <Field
        label="Previous training (optional)"
        value={d.previousTraining}
        onChangeText={(t) => set({ previousTraining: t })}
        placeholder="e.g. football for 5 years, some gym classes"
        multiline
        maxLength={300}
      />
    </View>
  );
}

const GOALS: { value: Goal; title: string; desc: string; icon: React.ComponentProps<typeof OptionCard>['icon'] }[] = [
  { value: 'muscle', title: 'Build muscle', desc: 'Hypertrophy-focused volume and rep ranges.', icon: 'body' },
  { value: 'strength', title: 'Improve strength', desc: 'Heavier main lifts, longer rests.', icon: 'barbell' },
  { value: 'athletic', title: 'Athletic performance', desc: 'Power, strength and conditioning.', icon: 'flash' },
  { value: 'general', title: 'General fitness', desc: 'A balanced foundation.', icon: 'fitness' },
  { value: 'endurance', title: 'Improve endurance', desc: 'Higher reps plus cardio work.', icon: 'pulse' },
  { value: 'active', title: 'Active lifestyle', desc: 'Feel good, move well, stay consistent.', icon: 'walk' },
];

export function GoalSection({ d, set }: Props) {
  const adult = allowsWeightFeatures(d);
  return (
    <View style={{ gap: spacing.md }}>
      <Q title="Your main goal" />
      {GOALS.map((g) => (
        <OptionCard key={g.value} icon={g.icon} title={g.title} description={g.desc} selected={d.goal === g.value} onPress={() => set({ goal: g.value })} />
      ))}
      {adult && (
        <>
          <Q title="Body-weight support (optional)" hint="Gradual, sustainable changes only. You can change this any time." />
          <ChipGroup
            options={[
              { value: 'none', label: 'Not a focus' },
              { value: 'gain', label: 'Gradual weight gain' },
              { value: 'manage', label: 'Weight management' },
            ]}
            value={d.weightGoal}
            onChange={(v) => set({ weightGoal: v as WeightGoal })}
          />
        </>
      )}
    </View>
  );
}

const HOME_EQUIPMENT: Equipment[] = ['dumbbells', 'bench', 'pullup-bar', 'bands', 'kettlebell', 'barbell', 'rack', 'cardio-machine'];

export function EquipmentSection({ d, set }: Props) {
  return (
    <View style={{ gap: spacing.md }}>
      <Q title="Where do you train?" />
      <OptionCard icon="business" title="Gym" description="Full access to free weights, cables and machines." selected={d.location === 'gym'} onPress={() => set({ location: 'gym' })} />
      <OptionCard icon="home" title="Home" description="Tell us what you have available." selected={d.location === 'home'} onPress={() => set({ location: 'home' })} />
      {d.location === 'home' && (
        <>
          <AText variant="label" muted style={{ marginTop: spacing.sm }}>
            Available equipment (bodyweight is always included)
          </AText>
          <ChipGroup multi options={HOME_EQUIPMENT.map((e) => ({ value: e, label: EQUIPMENT_LABELS[e] }))} value={d.equipment} onChange={(v) => set({ equipment: v as Equipment[] })} />
        </>
      )}
    </View>
  );
}

export function ScheduleSection({ d, set, errors }: Props) {
  return (
    <View style={{ gap: spacing.lg }}>
      <Q title="Preferred training days" hint="Rest days are part of the plan. We may space days out to protect recovery." />
      <ChipGroup multi options={WEEKDAY_SHORT.map((label, i) => ({ value: i as Weekday, label }))} value={d.trainingDays} onChange={(v) => set({ trainingDays: (v as Weekday[]).sort() })} />
      {errors?.trainingDays && <AText color={colors.danger} variant="small">{errors.trainingDays}</AText>}
      <Q title="Time per session" />
      <ChipGroup
        options={[20, 30, 45, 60, 75, 90].map((m) => ({ value: m, label: `${m} min` }))}
        value={d.sessionMinutes}
        onChange={(v) => set({ sessionMinutes: v as number })}
      />
    </View>
  );
}

export function PreferencesSection({ d, set }: Props) {
  const [cat, setCat] = useState<string>('all');
  const pool = useMemo(() => availableExercises({ ...d }), [d]);
  const list = pool.filter((e) => (cat === 'all' ? e.compound : e.category === cat)).slice(0, 24);
  return (
    <View style={{ gap: spacing.md }}>
      <Q title="Exercises you enjoy (optional)" hint="We will include them where they fit your program." />
      <ChipGroup
        options={[{ value: 'all', label: 'Popular' }, ...(['chest', 'back', 'shoulders', 'arms', 'legs', 'core'] as const).map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))]}
        value={cat}
        onChange={(v) => setCat(v as string)}
      />
      <ChipGroup multi options={list.map((e) => ({ value: e.id, label: e.name }))} value={d.preferredExercises} onChange={(v) => set({ preferredExercises: v as string[] })} />
      {d.preferredExercises.length > 0 && (
        <AText variant="small" muted>
          Selected: {d.preferredExercises.map((id) => EXERCISES.find((e) => e.id === id)?.name).join(', ')}
        </AText>
      )}
    </View>
  );
}

const AREAS: { value: BodyArea; label: string }[] = [
  { value: 'shoulder', label: 'Shoulder' },
  { value: 'knee', label: 'Knee' },
  { value: 'lower-back', label: 'Lower back' },
  { value: 'wrist', label: 'Wrist' },
  { value: 'elbow', label: 'Elbow' },
  { value: 'hip', label: 'Hip' },
  { value: 'neck', label: 'Neck' },
  { value: 'ankle', label: 'Ankle' },
];

export function LimitsSection({ d, set }: Props) {
  const minor = isMinor(d.ageRange);
  return (
    <View style={{ gap: spacing.lg }}>
      <Q title="Areas to protect (optional)" hint="We will avoid exercises that heavily load these areas. This is not a diagnosis — please see a professional for any injury." />
      <ChipGroup multi options={AREAS} value={d.limitations} onChange={(v) => set({ limitations: v as BodyArea[] })} />
      <Field label="Notes for your coach (optional)" value={d.limitationNotes} onChangeText={(t) => set({ limitationNotes: t })} placeholder="e.g. old ankle sprain, avoid jumping" multiline maxLength={300} />
      <Q title="Preferred intensity" />
      <Segmented
        options={[
          { value: 'easy', label: 'Easy' },
          { value: 'moderate', label: 'Moderate' },
          { value: 'hard', label: 'Hard' },
        ]}
        value={d.intensity}
        onChange={(v) => set({ intensity: v as Intensity })}
      />
      {(minor || d.experience === 'new') && d.intensity === 'hard' && (
        <Banner tone="info">{minor ? 'For younger players we keep sets comfortably away from failure.' : 'We will start a little gentler while you learn the movements, then build up.'}</Banner>
      )}
    </View>
  );
}

export function validateDraft(step: number, d: Draft): Record<string, string | null> {
  const e: Record<string, string | null> = {};
  if (step === 0) {
    if (!d.name.trim()) e.name = 'Please enter a name or nickname.';
    if (isBlockedAge(d.ageRange)) e.age = 'blocked';
  }
  if (step === 5 && d.trainingDays.length === 0) e.trainingDays = 'Pick at least one day.';
  return e;
}
