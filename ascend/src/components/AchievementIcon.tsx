import Svg, { Circle, Defs, Path, Polygon, RadialGradient, Stop } from 'react-native-svg';
import type { AchievementDef } from '../domain/achievements';
import { colors } from '../theme';

const GLYPHS: Record<AchievementDef['icon'], string> = {
  spark: 'M50 24 L56 44 L76 50 L56 56 L50 76 L44 56 L24 50 L44 44 Z',
  shield: 'M50 24 L72 32 L70 56 C68 66 60 72 50 77 C40 72 32 66 30 56 L28 32 Z',
  flame: 'M50 22 C58 34 70 40 68 56 C66 70 56 76 50 76 C42 76 32 70 32 57 C32 47 40 42 42 34 C46 42 48 44 52 46 C54 38 52 30 50 22 Z',
  book: 'M28 32 L48 36 L48 74 L28 70 Z M72 32 L52 36 L52 74 L72 70 Z',
  crown: 'M28 64 L32 36 L42 50 L50 30 L58 50 L68 36 L72 64 Z M30 68 L70 68 L70 74 L30 74 Z',
  star: 'M50 22 L58 42 L78 43 L62 56 L68 76 L50 64 L32 76 L38 56 L22 43 L42 42 Z',
  leaf: 'M30 70 C30 42 48 28 72 28 C72 54 58 72 30 70 Z M32 68 L60 40',
  wave: 'M24 52 C32 40 40 40 48 52 C56 64 64 64 76 50 L76 58 C64 72 56 72 48 60 C40 48 32 48 24 60 Z',
  gem: 'M36 32 L64 32 L76 46 L50 76 L24 46 Z M24 46 L76 46 M42 32 L50 46 L58 32',
};

/** Collectible achievement crest. Locked crests are dim silver outlines. */
export function AchievementIcon({ icon, unlocked, size = 56 }: { icon: AchievementDef['icon']; unlocked: boolean; size?: number }) {
  const c = unlocked ? colors.violetBright : colors.silverFaint;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={`ag-${icon}-${unlocked}`} cx="50%" cy="45%" r="55%">
          <Stop offset="0" stopColor={unlocked ? colors.violet : '#1A1A24'} stopOpacity={unlocked ? 0.55 : 1} />
          <Stop offset="1" stopColor="#0C0C12" stopOpacity="1" />
        </RadialGradient>
      </Defs>
      <Polygon points="50,3 93,26 93,74 50,97 7,74 7,26" fill={`url(#ag-${icon}-${unlocked})`} stroke={c} strokeWidth="2.5" />
      {unlocked && <Circle cx="50" cy="50" r="34" fill="none" stroke={colors.violet} strokeOpacity="0.35" strokeWidth="1" />}
      <Path d={GLYPHS[icon]} fill={unlocked ? colors.text : 'none'} stroke={unlocked ? colors.violetBright : colors.silverFaint} strokeWidth="2" strokeLinejoin="round" />
    </Svg>
  );
}
