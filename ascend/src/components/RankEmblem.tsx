import Svg, { Defs, LinearGradient, Path, Polygon, Stop, Text as SvgText } from 'react-native-svg';
import { rankColors } from '../theme';

/** Original hexagonal rank crest. */
export function RankEmblem({ rank, size = 44 }: { rank: string; size?: number }) {
  const c = rankColors[rank] ?? rankColors.E;
  const id = `rk${rank}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel={`${rank} rank emblem`}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c} stopOpacity="0.35" />
          <Stop offset="1" stopColor={c} stopOpacity="0.05" />
        </LinearGradient>
      </Defs>
      <Polygon points="50,4 91,27 91,73 50,96 9,73 9,27" fill="#0E0E15" stroke={c} strokeWidth="3" />
      <Polygon points="50,14 82,32 82,68 50,86 18,68 18,32" fill={`url(#${id})`} stroke={c} strokeOpacity="0.35" strokeWidth="1.5" />
      <Path d="M50 4 L50 14 M91 27 L82 32 M91 73 L82 68 M50 96 L50 86 M9 73 L18 68 M9 27 L18 32" stroke={c} strokeOpacity="0.6" strokeWidth="2" />
      <SvgText x="50" y={rank.length > 1 ? 61 : 64} fontSize={rank.length > 1 ? 30 : 38} fontWeight="700" fill={c} textAnchor="middle" fontFamily="Rajdhani_700Bold">
        {rank}
      </SvgText>
    </Svg>
  );
}
