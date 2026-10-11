import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { uiTap } from '../services/feedback';
import { colors, hitSlop, spacing } from '../theme';
import { AText } from './AText';
import { ParticleField } from './ParticleField';

interface ScreenProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  back?: boolean | (() => void);
  right?: ReactNode;
  scroll?: boolean;
  particles?: boolean;
  keyboard?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
  /** Extra bottom space so content clears the floating tab bar. */
  tabBarSpace?: boolean;
  refreshControl?: ScrollViewProps['refreshControl'];
  edges?: 'top' | 'all';
}

export function Screen({
  children,
  title,
  subtitle,
  back,
  right,
  scroll = true,
  particles,
  keyboard,
  contentStyle,
  footer,
  tabBarSpace,
  refreshControl,
  edges = 'top',
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = (tabBarSpace ? 96 : 0) + (footer ? 0 : edges === 'all' || tabBarSpace ? insets.bottom : insets.bottom) + spacing.xl;
  const header =
    title || back || right ? (
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {back && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={hitSlop}
              onPress={() => {
                uiTap();
                if (typeof back === 'function') back();
                else if (router.canGoBack()) router.back();
                else router.replace('/');
              }}
              style={styles.back}
            >
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </Pressable>
          )}
          <View style={{ flex: 1 }}>
            {title && (
              <AText variant="h1" numberOfLines={1} accessibilityRole="header">
                {title}
              </AText>
            )}
            {subtitle && (
              <AText variant="small" muted numberOfLines={2}>
                {subtitle}
              </AText>
            )}
          </View>
        </View>
        {right}
      </View>
    ) : null;

  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      {header}
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, { flex: 1, paddingBottom: footer ? 0 : bottomPad }, contentStyle]}>
      {header}
      {children}
    </View>
  );

  const body = (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {particles && <ParticleField count={14} intensity={0.7} />}
      {content}
      {footer && <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>{footer}</View>}
    </View>
  );

  if (!keyboard) return body;
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {body}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.lg, width: '100%', maxWidth: 640, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs, gap: spacing.md },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: spacing.sm },
  back: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bgElevated,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
});
