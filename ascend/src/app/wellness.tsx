import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';
import { AText } from '../components/AText';
import { Banner } from '../components/Controls';
import { Panel } from '../components/Panel';
import { Screen } from '../components/Screen';
import { WELLNESS } from '../data/wellness';
import { goalLabel } from '../domain/plan/generator';
import { isMinor } from '../domain/safety';
import { useAppStore } from '../store/useAppStore';
import { colors, spacing } from '../theme';

const ICONS = { nutrition: 'nutrition', water: 'water', moon: 'moon', bed: 'bed', leaf: 'leaf', time: 'time', fish: 'fish' } as const;

export default function Wellness() {
  const profile = useAppStore((s) => s.profile);
  const minor = profile ? isMinor(profile.ageRange) : false;
  const topics = WELLNESS.filter((t) => (minor ? !t.adultOnly : !t.youthOnly));

  return (
    <Screen back title="Nutrition & recovery" subtitle="Practical, balanced basics. Optional reading.">
      <Banner tone="info">General education only — not medical or dietetic advice. Speak with a doctor or registered dietitian for personal guidance.</Banner>
      {profile && !minor && profile.weightGoal !== 'none' && (
        <Panel framed title="Your focus">
          <AText variant="small">
            Goal: {goalLabel(profile.goal)}
            {profile.weightGoal === 'gain' ? ' with gradual weight gain' : ' with sustainable weight management'}. Small changes, repeated consistently, beat drastic plans. Track trends weekly in Progress if you wish — it is entirely optional.
          </AText>
        </Panel>
      )}
      {topics.map((t) => (
        <Panel key={t.id} title={t.title}>
          <View style={{ gap: spacing.sm }}>
            {t.points.map((p) => (
              <View key={p} style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Ionicons name={ICONS[t.icon]} size={14} color={colors.violetBright} style={{ marginTop: 3 }} />
                <AText variant="small" style={{ flex: 1 }}>
                  {p}
                </AText>
              </View>
            ))}
          </View>
        </Panel>
      ))}
    </Screen>
  );
}
