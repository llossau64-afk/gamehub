import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { AchievementIcon } from '../components/AchievementIcon';
import { AText } from '../components/AText';
import { Avatar } from '../components/Avatar';
import { SectionTitle } from '../components/Controls';
import { Panel } from '../components/Panel';
import { Screen } from '../components/Screen';
import { COSMETICS, COSMETIC_BY_ID, isUnlocked, unlockText, type CosmeticItem } from '../data/cosmetics';
import { ACHIEVEMENT_BY_ID } from '../domain/achievements';
import type { Cosmetics } from '../domain/types';
import { usePlayer } from '../hooks/useData';
import { haptic } from '../services/feedback';
import { useAppStore } from '../store/useAppStore';
import { colors, radius, spacing } from '../theme';

const SLOTS: { slot: keyof Omit<Cosmetics, 'badges'>; label: string }[] = [
  { slot: 'style', label: 'Character style' },
  { slot: 'outfit', label: 'Outfit' },
  { slot: 'accent', label: 'Accent colour' },
  { slot: 'background', label: 'Background' },
  { slot: 'frame', label: 'Rank frame' },
  { slot: 'title', label: 'Title' },
];

export default function AvatarScreen() {
  const { cosmetics, achievements, setCosmetic, toggleBadge, name } = useAppStore(
    useShallow((s) => ({ cosmetics: s.cosmetics, achievements: s.achievements, setCosmetic: s.setCosmetic, toggleBadge: s.toggleBadge, name: s.profile?.name ?? 'Player' })),
  );
  const { level, rank } = usePlayer();
  const unlockedIds = achievements.map((a) => a.id);

  return (
    <Screen back title="Character" subtitle="Your character represents your journey — not your body.">
      <Panel framed>
        <View style={{ alignItems: 'center', gap: spacing.sm }}>
          <Avatar cosmetics={cosmetics} rank={rank.id} size={150} />
          <AText variant="h2">{name}</AText>
          <AText variant="small" color={colors.violetBright}>
            {COSMETIC_BY_ID[cosmetics.title]?.name} · Level {level.level} · {rank.name}
          </AText>
          {cosmetics.badges.length > 0 && (
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {cosmetics.badges.map((b) => (
                <AchievementIcon key={b} icon={ACHIEVEMENT_BY_ID[b]?.icon ?? 'star'} unlocked size={30} />
              ))}
            </View>
          )}
        </View>
      </Panel>

      {SLOTS.map(({ slot, label }) => (
        <View key={slot} style={{ gap: spacing.sm }}>
          <SectionTitle>{label}</SectionTitle>
          <View style={styles.grid}>
            {COSMETICS.filter((c) => c.slot === slot).map((item) => (
              <Item key={item.id} item={item} selected={cosmetics[slot] === item.id} unlocked={isUnlocked(item, level.level, unlockedIds)} onPress={() => { haptic('select'); setCosmetic(slot, item.id); }} />
            ))}
          </View>
        </View>
      ))}

      <SectionTitle>Displayed badges (up to 3)</SectionTitle>
      {achievements.length === 0 ? (
        <AText variant="small" muted>
          Unlock achievements to display their emblems.
        </AText>
      ) : (
        <View style={styles.grid}>
          {achievements.map((a) => {
            const def = ACHIEVEMENT_BY_ID[a.id];
            const on = cosmetics.badges.includes(a.id);
            return (
              <Pressable key={a.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={def?.name} onPress={() => toggleBadge(a.id)} style={[styles.item, on && styles.itemOn]}>
                <AchievementIcon icon={def?.icon ?? 'star'} unlocked size={36} />
                <AText variant="tiny" align="center" numberOfLines={2}>
                  {def?.name}
                </AText>
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

function Item({ item, selected, unlocked, onPress }: { item: CosmeticItem; selected: boolean; unlocked: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: !unlocked }}
      accessibilityLabel={`${item.name}${unlocked ? '' : `, locked: ${unlockText(item)}`}`}
      disabled={!unlocked}
      onPress={onPress}
      style={[styles.item, selected && styles.itemOn, !unlocked && { opacity: 0.45 }]}
    >
      {item.color ? (
        <View style={[styles.swatch, { backgroundColor: item.color, borderColor: item.color2 ?? item.color }]} />
      ) : (
        <Ionicons name={item.slot === 'title' ? 'ribbon' : item.slot === 'frame' ? 'ellipse-outline' : 'person'} size={22} color={selected ? colors.violetBright : colors.silver} />
      )}
      <AText variant="tiny" align="center" numberOfLines={2}>
        {item.name}
      </AText>
      {!unlocked && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Ionicons name="lock-closed" size={10} color={colors.textFaint} />
          <AText variant="tiny" faint numberOfLines={1}>
            {unlockText(item)}
          </AText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  item: { width: '31%', flexGrow: 1, minHeight: 84, alignItems: 'center', justifyContent: 'center', gap: 6, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  itemOn: { borderColor: colors.violetBright, backgroundColor: colors.violetWash },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 3 },
});
