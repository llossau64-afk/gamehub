import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { AText } from '../components/AText';
import { Button } from '../components/Button';
import { Ring } from '../components/Charts';
import { Panel } from '../components/Panel';
import { Screen } from '../components/Screen';
import { XPBar } from '../components/XPBar';
import { EXERCISE_BY_ID, MOBILITY_ROUTINE } from '../data/exercises';
import { haptic, playSound } from '../services/feedback';
import { useAppStore } from '../store/useAppStore';
import { colors, spacing } from '../theme';
import { formatDuration } from '../utils';

/** Guided 5-minute mobility flow used for the rest-day quest. */
export default function Mobility() {
  const completeMobility = useAppStore((s) => s.completeMobility);
  const [pos, setPos] = useState({ i: 0, left: MOBILITY_ROUTINE[0].seconds, finished: false });
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const { i, left } = pos;
  const step = MOBILITY_ROUTINE[i];
  const ex = EXERCISE_BY_ID[step.exerciseId];
  const total = MOBILITY_ROUTINE.reduce((a, s) => a + s.seconds, 0);

  const finish = () => {
    setRunning(false);
    const ev = completeMobility();
    setDone(ev?.amount ?? 0);
    playSound('complete');
  };

  const posRef = useRef(pos);
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      const p = posRef.current;
      if (p.finished) return;
      let next: typeof p;
      if (p.left > 1) next = { ...p, left: p.left - 1 };
      else {
        playSound('restEnd');
        haptic('medium');
        next = p.i < MOBILITY_ROUTINE.length - 1 ? { i: p.i + 1, left: MOBILITY_ROUTINE[p.i + 1].seconds, finished: false } : { ...p, left: 0, finished: true };
      }
      posRef.current = next;
      setPos(next);
      if (next.finished) finishRef.current();
    }, 1000);
    return () => clearInterval(t);
  }, [running]);

  const go = (n: number) => {
    const next = { i: n, left: MOBILITY_ROUTINE[n].seconds, finished: false };
    posRef.current = next;
    setPos(next);
  };

  if (done !== null)
    return (
      <Screen back title="Mobility complete" particles>
        <Panel framed>
          <AText variant="h2">Routine finished</AText>
          <AText variant="body" muted>
            {done > 0 ? `+${done} XP earned.` : 'Already rewarded today — the movement still counts.'} Your joints thank you.
          </AText>
        </Panel>
        <Button label="Done" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} />
      </Screen>
    );

  const elapsed = MOBILITY_ROUTINE.slice(0, i).reduce((a, s) => a + s.seconds, 0) + (step.seconds - left);

  return (
    <Screen
      back
      title="Mobility routine"
      subtitle={`${MOBILITY_ROUTINE.length} movements · ${Math.round(total / 60)} min`}
      footer={
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button label="Back" variant="secondary" icon="play-back" disabled={i === 0} onPress={() => go(i - 1)} style={{ flex: 1 }} />
          <Button label={running ? 'Pause' : elapsed > 0 ? 'Resume' : 'Start'} icon={running ? 'pause' : 'play'} onPress={() => setRunning(!running)} style={{ flex: 1.4 }} />
          <Button label="Next" variant="secondary" iconRight="play-forward" onPress={() => (i < MOBILITY_ROUTINE.length - 1 ? go(i + 1) : finish())} style={{ flex: 1 }} />
        </View>
      }
    >
      <XPBar progress={elapsed / total} label={`Movement ${i + 1} of ${MOBILITY_ROUTINE.length}`} valueText={formatDuration(total - elapsed)} />
      <View style={{ alignItems: 'center', marginVertical: spacing.lg }}>
        <Ring progress={left / step.seconds} size={170} stroke={8}>
          <AText style={{ fontFamily: 'Rajdhani_700Bold', fontSize: 48, color: colors.text }} accessibilityLiveRegion="polite">
            {formatDuration(left)}
          </AText>
        </Ring>
      </View>
      <Panel framed title={step.cue}>
        <AText variant="h2" style={{ marginBottom: spacing.sm }}>
          {ex?.name}
        </AText>
        {ex?.steps.map((s, n) => (
          <AText key={s} variant="small" muted>
            {n + 1}. {s}
          </AText>
        ))}
        <AText variant="tiny" faint style={{ marginTop: spacing.sm }}>
          Move gently within a pain-free range. No demonstration video available.
        </AText>
      </Panel>
    </Screen>
  );
}
