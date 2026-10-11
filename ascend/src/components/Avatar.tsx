import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { COSMETIC_BY_ID } from '../data/cosmetics';
import type { Cosmetics } from '../domain/types';
import { colors, rankColors } from '../theme';

interface Props {
  cosmetics: Cosmetics;
  rank: string;
  size?: number;
}

/**
 * Original RPG-style character crest. The silhouette is identical for every
 * player — cosmetics change gear, colours and frames, never body shape.
 */
export function Avatar({ cosmetics, rank, size = 88 }: Props) {
  const outfit = COSMETIC_BY_ID[cosmetics.outfit] ?? COSMETIC_BY_ID.obsidian;
  const accent = COSMETIC_BY_ID[cosmetics.accent]?.color ?? colors.violet;
  const bg = COSMETIC_BY_ID[cosmetics.background] ?? COSMETIC_BY_ID.void;
  const ring = rankColors[rank] ?? rankColors.E;
  const o1 = outfit.color ?? '#1B1B26';
  const o2 = outfit.color2 ?? '#2A2A3A';
  const style = cosmetics.style;
  const frame = cosmetics.frame;

  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" accessibilityLabel="Your character">
      <Defs>
        <RadialGradient id="bg" cx="50%" cy="40%" r="60%">
          <Stop offset="0" stopColor={bg.color2 ?? '#151522'} />
          <Stop offset="1" stopColor={bg.color ?? '#0A0A10'} />
        </RadialGradient>
        <LinearGradient id="cloth" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={o2} />
          <Stop offset="1" stopColor={o1} />
        </LinearGradient>
        <RadialGradient id="aura" cx="50%" cy="55%" r="50%">
          <Stop offset="0" stopColor={accent} stopOpacity="0.35" />
          <Stop offset="1" stopColor={accent} stopOpacity="0" />
        </RadialGradient>
      </Defs>

      <Circle cx="60" cy="60" r="56" fill="url(#bg)" />
      <Circle cx="60" cy="62" r="40" fill="url(#aura)" />

      {/* Shoulders & torso (constant silhouette) */}
      <Path d="M20 116 C22 92 36 82 60 82 C84 82 98 92 100 116 Z" fill="url(#cloth)" />
      {/* Neck */}
      <Rect x="53" y="66" width="14" height="18" rx="5" fill="#1A1A22" />
      {/* Head (shadowed) */}
      <Ellipse cx="60" cy="52" rx="16" ry="19" fill="#14141C" />

      {style === 'vanguard' && (
        <G>
          <Path d="M42 52 C42 32 78 32 78 52 L78 60 C78 66 42 66 42 60 Z" fill={o2} stroke={accent} strokeOpacity="0.5" strokeWidth="1" />
          <Rect x="46" y="51" width="28" height="4" rx="2" fill={accent} opacity="0.95" />
          <Path d="M22 104 C24 90 34 84 46 84 L40 100 Z M98 104 C96 90 86 84 74 84 L80 100 Z" fill={o2} stroke={accent} strokeOpacity="0.5" strokeWidth="1" />
          <Path d="M60 86 L60 116" stroke={accent} strokeOpacity="0.5" strokeWidth="1.5" />
        </G>
      )}
      {style === 'wanderer' && (
        <G>
          <Path d="M36 64 C34 34 50 26 60 26 C70 26 86 34 84 64 C80 72 74 74 70 70 C70 60 66 48 60 48 C54 48 50 60 50 70 C46 74 40 72 36 64 Z" fill={o2} />
          <Circle cx="54" cy="57" r="2" fill={accent} />
          <Circle cx="66" cy="57" r="2" fill={accent} />
          <Path d="M30 112 C34 92 44 84 52 82 L60 96 L68 82 C76 84 86 92 90 112" fill="none" stroke={accent} strokeOpacity="0.45" strokeWidth="1.5" />
        </G>
      )}
      {style === 'arcanist' && (
        <G>
          <Path d="M40 84 L44 70 L60 78 L76 70 L80 84 Z" fill={o2} stroke={accent} strokeOpacity="0.6" strokeWidth="1" />
          <Path d="M44 44 C46 34 74 34 76 44" fill="none" stroke={colors.silver} strokeWidth="2" />
          <Path d="M56 38 L60 32 L64 38 L60 42 Z" fill={accent} />
          <Circle cx="54" cy="55" r="1.8" fill={accent} />
          <Circle cx="66" cy="55" r="1.8" fill={accent} />
          <Circle cx="60" cy="100" r="5" fill="none" stroke={accent} strokeWidth="1.5" />
        </G>
      )}
      {style === 'sentinel' && (
        <G>
          <Path d="M42 56 C42 30 78 30 78 56 L76 66 L44 66 Z" fill={o2} stroke={colors.silver} strokeOpacity="0.6" strokeWidth="1" />
          <Path d="M60 22 C64 28 64 36 60 40 C56 36 56 28 60 22 Z" fill={accent} />
          <Path d="M58 48 L62 48 L62 64 L58 64 Z" fill="#0B0B10" />
          <Path d="M48 50 L56 52 M72 50 L64 52" stroke={accent} strokeWidth="2.5" strokeLinecap="round" />
          <Path d="M40 86 L80 86 L76 96 L44 96 Z" fill={o2} stroke={colors.silver} strokeOpacity="0.5" strokeWidth="1" />
        </G>
      )}
      {style === 'monarch' && (
        <G>
          <Path d="M44 38 L48 26 L54 34 L60 22 L66 34 L72 26 L76 38 Z" fill={colors.gold} stroke="#8A6D2C" strokeWidth="1" />
          <Circle cx="60" cy="31" r="2.2" fill={accent} />
          <Circle cx="54" cy="55" r="2" fill={accent} />
          <Circle cx="66" cy="55" r="2" fill={accent} />
          <Path d="M24 110 C28 92 40 84 60 84 C80 84 92 92 96 110" fill="none" stroke={colors.silver} strokeWidth="4" strokeOpacity="0.55" />
        </G>
      )}

      {/* Frame */}
      <Circle cx="60" cy="60" r="56" fill="none" stroke={ring} strokeWidth="3" />
      {frame === 'frame-runic' &&
        Array.from({ length: 24 }, (_, i) => {
          const a = (i / 24) * Math.PI * 2;
          const r1 = 52;
          const r2 = i % 2 ? 49 : 47;
          return <Path key={i} d={`M${60 + Math.cos(a) * r1} ${60 + Math.sin(a) * r1} L${60 + Math.cos(a) * r2} ${60 + Math.sin(a) * r2}`} stroke={ring} strokeOpacity="0.7" strokeWidth="1.5" />;
        })}
      {frame === 'frame-crown' && <Path d="M48 6 L54 0 L60 6 L66 0 L72 6 L68 12 L52 12 Z" fill={colors.gold} />}
    </Svg>
  );
}
