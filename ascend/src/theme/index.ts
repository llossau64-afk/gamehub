import { Platform, TextStyle } from 'react-native';

/**
 * ASCEND design tokens. Dark-first: deep black base, charcoal surfaces,
 * electric violet as the single primary accent, soft blue for information,
 * metallic silver for frames and secondary text.
 */
export const colors = {
  bg: '#07070B',
  bgElevated: '#0C0C12',
  surface: '#121219',
  surfaceAlt: '#181822',
  surfaceHigh: '#20202C',
  border: '#262633',
  borderStrong: '#363648',

  violet: '#8B5CF6',
  violetBright: '#A78BFA',
  violetDeep: '#5B21B6',
  violetGlow: 'rgba(139, 92, 246, 0.35)',
  violetWash: 'rgba(139, 92, 246, 0.12)',

  blue: '#60A5FA',
  blueSoft: '#93C5FD',
  blueWash: 'rgba(96, 165, 250, 0.12)',

  silver: '#C9CED8',
  silverDim: '#8E94A3',
  silverFaint: '#5A5F6E',

  text: '#F5F5FA',
  textMuted: '#A3A7B5',
  textFaint: '#6B7080',

  success: '#34D399',
  successWash: 'rgba(52, 211, 153, 0.12)',
  warning: '#FBBF24',
  warningWash: 'rgba(251, 191, 36, 0.12)',
  danger: '#F87171',
  dangerWash: 'rgba(248, 113, 113, 0.12)',
  gold: '#E8C872',

  overlay: 'rgba(3, 3, 6, 0.86)',
} as const;

export const rankColors: Record<string, string> = {
  E: '#8E94A3',
  D: '#60A5FA',
  C: '#34D399',
  B: '#A78BFA',
  A: '#F472B6',
  S: '#E8C872',
  SS: '#F5F5FA',
};

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;

export const fonts = {
  display: 'Rajdhani_700Bold',
  displaySemi: 'Rajdhani_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as string,
} as const;

export const type = {
  hero: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, letterSpacing: 2 },
  h1: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, letterSpacing: 1.2 },
  h2: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26, letterSpacing: 1 },
  h3: { fontFamily: fonts.displaySemi, fontSize: 18, lineHeight: 22, letterSpacing: 0.8 },
  label: { fontFamily: fonts.bodySemi, fontSize: 11, lineHeight: 14, letterSpacing: 1.6, textTransform: 'uppercase' },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  smallStrong: { fontFamily: fonts.bodySemi, fontSize: 13, lineHeight: 18 },
  tiny: { fontFamily: fonts.bodyMedium, fontSize: 11, lineHeight: 14 },
  stat: { fontFamily: fonts.display, fontSize: 28, lineHeight: 30, letterSpacing: 0.5 },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;

export const hitSlop = { top: 10, bottom: 10, left: 10, right: 10 };
