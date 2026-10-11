import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CATEGORY_LABELS, CATEGORY_ORDER, EXERCISES, EXERCISE_BY_ID, MUSCLE_LABELS } from '../data/exercises';
import { exerciseAvailability } from '../domain/plan/library';
import type { Exercise } from '../domain/types';
import { useAppStore } from '../store/useAppStore';
import { colors, fonts, radius, spacing } from '../theme';
import { AText } from './AText';
import { ChipGroup, IconButton } from './Controls';

interface Props {
  visible: boolean;
  title?: string;
  suggestions?: string[];
  exclude?: string[];
  onClose: () => void;
  onPick: (exerciseId: string) => void;
}

/** Bottom-sheet style picker. Only shows exercises the player's equipment and limitations allow. */
export function ExercisePicker({ visible, title = 'Choose exercise', suggestions = [], exclude = [], onClose, onPick }: Props) {
  const insets = useSafeAreaInsets();
  const profile = useAppStore((s) => s.profile);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>(suggestions.length ? 'suggested' : 'all');

  const list = useMemo(() => {
    const ok = (e: Exercise) => !exclude.includes(e.id) && (!profile || exerciseAvailability(e.id, profile) === 'ok');
    let base: Exercise[];
    if (cat === 'suggested') base = suggestions.map((id) => EXERCISE_BY_ID[id]).filter((e): e is Exercise => !!e && ok(e));
    else base = EXERCISES.filter((e) => ok(e) && (cat === 'all' || e.category === cat));
    const term = q.trim().toLowerCase();
    return term ? base.filter((e) => e.name.toLowerCase().includes(term) || e.primary.some((m) => m.includes(term))) : base;
  }, [q, cat, suggestions, exclude, profile]);

  const cats = [...(suggestions.length ? [{ value: 'suggested', label: 'Suggested' }] : []), { value: 'all', label: 'All' }, ...CATEGORY_ORDER.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md, paddingTop: spacing.lg }]}>
          <View style={styles.head}>
            <AText variant="h2" style={{ flex: 1 }}>
              {title}
            </AText>
            <IconButton icon="close" label="Close" onPress={onClose} />
          </View>
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.silverDim} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search exercises or muscles"
              placeholderTextColor={colors.textFaint}
              style={styles.input}
              accessibilityLabel="Search exercises"
              autoCorrect={false}
            />
          </View>
          <View style={{ marginBottom: spacing.sm }}>
            <FlatList horizontal showsHorizontalScrollIndicator={false} data={[0]} renderItem={() => <ChipGroup options={cats} value={cat} onChange={(v) => setCat(v as string)} />} contentContainerStyle={{ paddingRight: spacing.lg }} />
          </View>
          <FlatList
            data={list}
            keyExtractor={(e) => e.id}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<AText muted style={{ padding: spacing.lg }}>No matching exercises for your equipment.</AText>}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, ${item.primary.map((m) => MUSCLE_LABELS[m]).join(', ')}`}
                onPress={() => {
                  onPick(item.id);
                  setQ('');
                }}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceAlt }]}
              >
                <View style={{ flex: 1 }}>
                  <AText variant="bodyStrong">{item.name}</AText>
                  <AText variant="small" muted numberOfLines={1}>
                    {item.primary.map((m) => MUSCLE_LABELS[m]).join(', ')} · {item.difficulty}
                  </AText>
                </View>
                <Ionicons name="add-circle-outline" size={22} color={colors.violetBright} />
              </Pressable>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { height: '86%', backgroundColor: colors.bgElevated, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg, width: '100%', maxWidth: 640, alignSelf: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 46, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, marginBottom: spacing.md },
  input: { flex: 1, color: colors.text, fontFamily: fonts.body, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
