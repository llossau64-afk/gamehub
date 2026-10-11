import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { AText } from '../components/AText';
import { Button } from '../components/Button';
import { Banner, ChipGroup, Field, RatingRow } from '../components/Controls';
import { Screen } from '../components/Screen';
import { PAIN_DISCLAIMER } from '../domain/safety';
import type { Checkin } from '../domain/types';
import { haptic, playSound } from '../services/feedback';
import { useAppStore } from '../store/useAppStore';
import { colors, spacing } from '../theme';
import { dayKey } from '../utils';

type R = Checkin['sleep'];

/** A meaningful daily check-in that takes under a minute. */
export default function CheckinScreen() {
  const today = dayKey();
  const existing = useAppStore((s) => s.checkins.find((c) => c.date === today));
  const addCheckin = useAppStore((s) => s.addCheckin);
  const [sleep, setSleep] = useState<number | null>(existing?.sleep ?? null);
  const [energy, setEnergy] = useState<number | null>(existing?.energy ?? null);
  const [soreness, setSoreness] = useState<number | null>(existing?.soreness ?? null);
  const [mood, setMood] = useState<number | null>(existing?.mood ?? null);
  const [pain, setPain] = useState(existing?.pain ?? false);
  const [note, setNote] = useState(existing?.note ?? '');
  const [earned, setEarned] = useState<number | null>(null);
  const ready = sleep && energy && soreness && mood;

  const save = () => {
    if (!ready) return;
    const ev = addCheckin({ date: today, sleep: sleep as R, energy: energy as R, soreness: soreness as R, mood: mood as R, pain, note: note.trim() || undefined });
    playSound(ev ? 'reward' : 'tap');
    haptic('success');
    setEarned(ev?.amount ?? 0);
    setTimeout(() => (router.canGoBack() ? router.back() : router.replace('/(tabs)')), 900);
  };

  const advice =
    sleep && sleep <= 2
      ? 'Short on sleep — keep today’s weights steady and finish a little earlier if needed.'
      : soreness && soreness >= 4
        ? 'High soreness — a longer warm-up and lighter first sets will help. Rest if it is sharp or in a joint.'
        : energy && energy >= 4 && sleep && sleep >= 4
          ? 'Well recovered. A great day to focus on quality reps.'
          : null;

  return (
    <Screen
      keyboard
      back
      title="Recovery check-in"
      subtitle="Under a minute. Helps your coach tailor today."
      footer={<Button label={existing ? 'Update check-in' : 'Complete check-in'} size="lg" full disabled={!ready} onPress={save} icon="checkmark" />}
    >
      <RatingRow label="Sleep quality" value={sleep} onChange={setSleep} low="Poor" high="Great" />
      <RatingRow label="Energy" value={energy} onChange={setEnergy} low="Drained" high="Energised" />
      <RatingRow label="Muscle soreness" value={soreness} onChange={setSoreness} low="None" high="Very sore" />
      <RatingRow label="Mood" value={mood} onChange={setMood} low="Low" high="Great" />
      <View style={{ gap: spacing.sm }}>
        <AText variant="bodyStrong">Any pain (not normal soreness)?</AText>
        <ChipGroup
          options={[
            { value: 'no', label: 'No' },
            { value: 'yes', label: 'Yes' },
          ]}
          value={pain ? 'yes' : 'no'}
          onChange={(v) => setPain(v === 'yes')}
        />
        {pain && <Banner tone="warning">{PAIN_DISCLAIMER}</Banner>}
      </View>
      <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="Anything worth remembering?" maxLength={200} />
      {advice && <Banner tone="info">{advice}</Banner>}
      {earned !== null && (
        <AText variant="h3" align="center" color={colors.violetBright}>
          {earned > 0 ? `+${earned} XP · Check-in complete` : 'Check-in updated'}
        </AText>
      )}
    </Screen>
  );
}
