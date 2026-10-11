import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AText } from '../components/AText';
import { ChipGroup, IconButton } from '../components/Controls';
import { CATEGORY_LABELS, CATEGORY_ORDER, EXERCISES, MUSCLE_LABELS } from '../data/exercises';
import { exerciseAvailability } from '../domain/plan/library';
import { useAppStore } from '../store/useAppStore';
import { colors, fonts, radius, spacing } from '../theme';

export default function Library() {
  const insets = useSafeAreaInsets();
  const profile = useAppStore((s) => s.profile);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('all');
  const [mine, setMine] = useState(true);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return EXERCISES.filter(
      (e) =>
        (cat === 'all' || e.category === cat) &&
        (!mine || !profile || exerciseAvailability(e.id, profile) === 'ok') &&
        (!term || e.name.toLowerCase().includes(term) || e.primary.some((m) => MUSCLE_LABELS[m].toLowerCase().includes(term))),
    );
  }, [q, cat, mine, profile]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.head}>
        <IconButton icon="chevron-back" label="Go back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/train'))} />
        <View style={{ flex: 1 }}>
          <AText variant="h1">Library</AText>
          <AText variant="small" muted>
            {EXERCISES.length} exercises with full technique guides
          </AText>
        </View>
      </View>
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={colors.silverDim} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search by name or muscle" placeholderTextColor={colors.textFaint} style={styles.input} accessibilityLabel="Search exercises" />
        </View>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[0]}
          renderItem={() => (
            <ChipGroup options={[{ value: 'all', label: 'All' }, ...CATEGORY_ORDER.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))]} value={cat} onChange={(v) => setCat(v as string)} />
          )}
        />
        <ChipGroup
          options={[
            { value: 'mine', label: 'Fits my setup' },
            { value: 'all', label: 'Show everything' },
          ]}
          value={mine ? 'mine' : 'all'}
          onChange={(v) => setMine(v === 'mine')}
        />
      </View>
      <FlatList
        data={list}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xxl, gap: spacing.sm }}
        ListEmptyComponent={<AText muted>No exercises match.</AText>}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${item.difficulty}`}
            onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: item.id } })}
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}
          >
            <View style={styles.badge}>
              <AText variant="label" color={colors.violetBright}>
                {CATEGORY_LABELS[item.category].slice(0, 2)}
              </AText>
            </View>
            <View style={{ flex: 1 }}>
              <AText variant="bodyStrong">{item.name}</AText>
              <AText variant="small" muted numberOfLines={1}>
                {item.primary.map((m) => MUSCLE_LABELS[m]).join(', ')}
              </AText>
            </View>
            <View style={[styles.diff, item.difficulty === 'advanced' && { borderColor: colors.danger }, item.difficulty === 'intermediate' && { borderColor: colors.warning }]}>
              <AText variant="tiny" muted>
                {item.difficulty}
              </AText>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 46, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md },
  input: { flex: 1, color: colors.text, fontFamily: fonts.body, fontSize: 15 },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  badge: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.violetWash, borderWidth: 1, borderColor: colors.violetDeep },
  diff: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
});
