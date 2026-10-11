import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { AchievementIcon } from '../../components/AchievementIcon';
import { AText } from '../../components/AText';
import { Button } from '../../components/Button';
import { SectionTitle } from '../../components/Controls';
import { Panel } from '../../components/Panel';
import { Screen } from '../../components/Screen';
import { XPBar } from '../../components/XPBar';
import { ACHIEVEMENTS, computeStats } from '../../domain/achievements';
import { dailyQuests, weeklyMissions, type Quest } from '../../domain/quests';
import { usePlayer } from '../../hooks/useData';
import { playSound } from '../../services/feedback';
import { useAppStore } from '../../store/useAppStore';
import { colors, radius, spacing } from '../../theme';
import { relativeDay } from '../../utils';

export default function Quests() {
  const st = useAppStore(
    useShallow((s) => ({
      plan: s.plan,
      xpEvents: s.xpEvents,
      sessions: s.sessions,
      checkins: s.checkins,
      techniqueViews: s.techniqueViews,
      achievements: s.achievements,
      logLightActivity: s.logLightActivity,
    })),
  );
  const { level, streak } = usePlayer();
  const quests = dailyQuests(st.plan, st.xpEvents);
  const missions = weeklyMissions({ plan: st.plan, sessions: st.sessions, events: st.xpEvents, techniqueViews: st.techniqueViews });
  const stats = useMemo(
    () => computeStats({ sessions: st.sessions, events: st.xpEvents, checkins: st.checkins, techniqueViews: st.techniqueViews, plan: st.plan, level: level.level }),
    [st, level.level],
  );
  const unlocked = new Map(st.achievements.map((a) => [a.id, a.at]));
  const recent = [...st.xpEvents].reverse().slice(0, 6);

  const act = (q: Quest) => {
    switch (q.action) {
      case 'workout':
        return router.push('/(tabs)/train');
      case 'checkin':
        return router.push('/checkin');
      case 'mobility':
        return router.push('/mobility');
      case 'progress':
        return router.push('/(tabs)/progress');
      case 'library':
        return router.push('/library');
      case 'light':
        if (st.logLightActivity()) playSound('reward');
    }
  };

  return (
    <Screen tabBarSpace title="Quests" subtitle="Show up, recover well, and your character grows.">
      <Panel framed title="Daily quests" right={<AText variant="tiny" muted>Resets at midnight</AText>}>
        <View style={{ gap: spacing.sm }}>
          {quests.map((q) => (
            <View key={q.id} style={[styles.quest, q.done && styles.questDone]}>
              <Ionicons name={q.done ? 'checkmark-circle' : 'diamond-outline'} size={22} color={q.done ? colors.success : colors.violetBright} />
              <View style={{ flex: 1 }}>
                <AText variant="bodyStrong" color={q.done ? colors.textMuted : colors.text}>
                  {q.title}
                </AText>
                <AText variant="small" muted>
                  {q.description}
                </AText>
                <AText variant="tiny" color={colors.violetBright} style={{ marginTop: 2 }}>
                  REWARD +{q.xp} XP{q.optional ? ' · optional' : ''}
                </AText>
              </View>
              {!q.done && <Button size="sm" variant="subtle" label={q.action === 'light' ? 'Done' : 'Go'} onPress={() => act(q)} />}
            </View>
          ))}
        </View>
      </Panel>

      <Panel title="Weekly missions">
        <View style={{ gap: spacing.lg }}>
          {missions.map((m) => (
            <View key={m.id} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
                <AText variant="smallStrong" style={{ flex: 1 }}>
                  {m.title}
                </AText>
                <AText variant="tiny" color={m.claimed ? colors.success : colors.violetBright}>
                  {m.claimed ? 'CLAIMED' : `+${m.xp} XP`}
                </AText>
              </View>
              <XPBar progress={m.progress / m.target} height={6} valueText={`${m.progress}/${m.target}`} />
            </View>
          ))}
        </View>
      </Panel>

      <Panel>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Ionicons name="flame" size={28} color={streak.current ? colors.warning : colors.silverFaint} />
          <View style={{ flex: 1 }}>
            <AText variant="h3">{streak.current}-day flexible streak</AText>
            <AText variant="small" muted>
              Planned rest days count. One missed day per week is forgiven automatically — and your XP is never taken away.
            </AText>
          </View>
        </View>
      </Panel>

      <SectionTitle right={<Pressable onPress={() => router.push('/avatar')}><AText variant="smallStrong" color={colors.violetBright}>Customise →</AText></Pressable>}>
        Achievements · {unlocked.size}/{ACHIEVEMENTS.length}
      </SectionTitle>
      <View style={styles.grid}>
        {ACHIEVEMENTS.map((a) => {
          const at = unlocked.get(a.id);
          const [p, t] = a.progress(stats);
          return (
            <View key={a.id} style={[styles.ach, at && styles.achOn]} accessible accessibilityLabel={`${a.name}. ${a.description} ${at ? 'Unlocked' : `${p} of ${t}`}`}>
              <AchievementIcon icon={a.icon} unlocked={!!at} size={54} />
              <AText variant="smallStrong" align="center" numberOfLines={2} color={at ? colors.text : colors.textMuted}>
                {a.name}
              </AText>
              <AText variant="tiny" faint align="center" numberOfLines={2}>
                {at ? `Unlocked ${relativeDay(at)}` : `${p}/${t}`}
              </AText>
            </View>
          );
        })}
      </View>

      {recent.length > 0 && (
        <Panel title="Recent XP">
          <View style={{ gap: 8 }}>
            {recent.map((e) => (
              <View key={e.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
                <AText variant="small" muted style={{ flex: 1 }} numberOfLines={1}>
                  {e.label}
                </AText>
                <AText variant="smallStrong" color={colors.violetBright}>
                  +{e.amount}
                </AText>
              </View>
            ))}
          </View>
        </Panel>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  quest: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  questDone: { opacity: 0.7 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  ach: { width: '31.5%', flexGrow: 1, alignItems: 'center', gap: 6, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  achOn: { borderColor: colors.violetDeep, backgroundColor: '#13111B' },
});
