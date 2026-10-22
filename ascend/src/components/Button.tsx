import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { haptic, playSound } from '../services/feedback';
import { colors, fonts, radius, spacing } from '../theme';
import { AText } from './AText';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  icon?: ComponentProps<typeof Ionicons>['name'];
  iconRight?: ComponentProps<typeof Ionicons>['name'];
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  sound?: boolean;
  children?: ReactNode;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading,
  disabled,
  full,
  style,
  accessibilityHint,
  sound = true,
}: ButtonProps) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const inactive = disabled || loading;
  const v = VARIANTS[variant];
  const height = size === 'lg' ? 56 : size === 'sm' ? 38 : 48;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPressIn={() => scale.set(withSpring(0.97, { damping: 20, stiffness: 400 }))}
      onPressOut={() => scale.set(withSpring(1, { damping: 15, stiffness: 300 }))}
      onPress={() => {
        if (sound) playSound('tap');
        haptic(variant === 'primary' ? 'medium' : 'light');
        onPress?.();
      }}
      style={[
        styles.base,
        { height, backgroundColor: v.bg, borderColor: v.border, opacity: inactive && !loading ? 0.45 : 1 },
        full && styles.full,
        size === 'sm' && styles.sm,
        anim,
        style,
      ]}
    >
      {variant === 'primary' && <View pointerEvents="none" style={styles.sheen} />}
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <View style={styles.row}>
          {icon && <Ionicons name={icon} size={size === 'sm' ? 16 : 18} color={v.fg} style={{ marginRight: 8 }} />}
          <AText
            variant="bodyStrong"
            style={{ fontFamily: fonts.display, fontSize: size === 'lg' ? 19 : size === 'sm' ? 14 : 16, letterSpacing: 1.6, textTransform: 'uppercase' }}
            color={v.fg}
            numberOfLines={1}
          >
            {label}
          </AText>
          {iconRight && <Ionicons name={iconRight} size={size === 'sm' ? 16 : 18} color={v.fg} style={{ marginLeft: 8 }} />}
        </View>
      )}
    </AnimatedPressable>
  );
}

const VARIANTS: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.violet, fg: '#FFFFFF', border: colors.violetBright },
  secondary: { bg: 'transparent', fg: colors.text, border: colors.borderStrong },
  ghost: { bg: 'transparent', fg: colors.violetBright, border: 'transparent' },
  danger: { bg: colors.dangerWash, fg: colors.danger, border: 'rgba(248,113,113,0.35)' },
  subtle: { bg: colors.surfaceAlt, fg: colors.text, border: colors.border },
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    overflow: 'hidden',
  },
  sm: { paddingHorizontal: spacing.md },
  full: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center' },
  sheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
});
