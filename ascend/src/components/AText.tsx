import { Text, type TextProps, type TextStyle } from 'react-native';
import { colors, type, type TypeVariant } from '../theme';

export interface ATextProps extends TextProps {
  variant?: TypeVariant;
  color?: string;
  align?: TextStyle['textAlign'];
  muted?: boolean;
  faint?: boolean;
}

export function AText({ variant = 'body', color, align, muted, faint, style, ...rest }: ATextProps) {
  const c = color ?? (faint ? colors.textFaint : muted ? colors.textMuted : colors.text);
  return <Text maxFontSizeMultiplier={1.6} {...rest} style={[type[variant], { color: c, textAlign: align }, style]} />;
}
