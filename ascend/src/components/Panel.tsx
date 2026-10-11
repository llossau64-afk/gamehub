import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { uiTap } from '../services/feedback';
import { colors, radius, spacing } from '../theme';
import { AText } from './AText';

interface PanelProps {
  children: ReactNode;
  title?: string;
  right?: ReactNode;
  /** Status-window styling: corner brackets and a label strip. */
  framed?: boolean;
  accent?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  accessibilityLabel?: string;
}

/** The core surface of ASCEND — an original "system window" with corner brackets. */
export function Panel({ children, title, right, framed, accent = colors.violet, onPress, style, padded = true, accessibilityLabel }: PanelProps) {
  const body = (
    <View style={[styles.panel, framed && { borderColor: colors.borderStrong }, padded && styles.padded, style]}>
      {framed && (
        <>
          <View style={[styles.corner, styles.tl, { borderColor: accent }]} />
          <View style={[styles.corner, styles.tr, { borderColor: accent }]} />
          <View style={[styles.corner, styles.bl, { borderColor: accent }]} />
          <View style={[styles.corner, styles.br, { borderColor: accent }]} />
        </>
      )}
      {(title || right) && (
        <View style={styles.header}>
          {title ? (
            <View style={styles.titleRow}>
              <View style={[styles.tick, { backgroundColor: accent }]} />
              <AText variant="label" muted>
                {title}
              </AText>
            </View>
          ) : (
            <View />
          )}
          {right}
        </View>
      )}
      {children}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={() => {
        uiTap();
        onPress();
      }}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      {body}
    </Pressable>
  );
}

const C = 10;
const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  padded: { padding: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  tick: { width: 3, height: 12, borderRadius: 2, marginRight: spacing.sm },
  corner: { position: 'absolute', width: C, height: C },
  tl: { top: -1, left: -1, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: radius.lg },
  tr: { top: -1, right: -1, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: radius.lg },
  bl: { bottom: -1, left: -1, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: radius.lg },
  br: { bottom: -1, right: -1, borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: radius.lg },
});
