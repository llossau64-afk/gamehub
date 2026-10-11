import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { useReduceMotion } from '../hooks/useMotion';
import { colors, spacing } from '../theme';
import { AText } from './AText';

export interface Point {
  label: string;
  value: number;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return nice * p;
}

const fmt = (v: number) => (v >= 10000 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v * 10) / 10}`);

function Bar({ value, max, height, delay, highlight }: { value: number; max: number; height: number; delay: number; highlight: boolean }) {
  const reduce = useReduceMotion();
  const h = useSharedValue(0);
  useEffect(() => {
    const target = max > 0 ? (value / max) * height : 0;
    h.value = reduce ? target : withDelay(delay, withTiming(target, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [value, max, height, delay, reduce, h]);
  const style = useAnimatedStyle(() => ({ height: h.value }));
  return (
    <Animated.View
      style={[
        styles.bar,
        { backgroundColor: highlight ? colors.violet : colors.violetDeep, borderColor: highlight ? colors.violetBright : 'transparent' },
        style,
      ]}
    />
  );
}

/** Animated bar chart with a labelled y-axis. Values are always the player's real data. */
export function BarChart({ data, height = 150, unit, accessibilityLabel }: { data: Point[]; height?: number; unit?: string; accessibilityLabel: string }) {
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const summary = data.map((d) => `${d.label}: ${fmt(d.value)}${unit ? ` ${unit}` : ''}`).join(', ');
  return (
    <View accessible accessibilityLabel={`${accessibilityLabel}. ${summary}`}>
      <View style={{ flexDirection: 'row' }}>
        <View style={[styles.yAxis, { height }]}>
          <AText variant="tiny" faint>
            {fmt(max)}
          </AText>
          <AText variant="tiny" faint>
            {fmt(max / 2)}
          </AText>
          <AText variant="tiny" faint>
            0
          </AText>
        </View>
        <View style={{ flex: 1, height }}>
          <View style={[styles.grid, { top: 0 }]} />
          <View style={[styles.grid, { top: height / 2 }]} />
          <View style={[styles.grid, { top: height - 1 }]} />
          <View style={styles.bars}>
            {data.map((d, i) => (
              <View key={`${d.label}-${i}`} style={styles.barSlot}>
                <Bar value={d.value} max={max} height={height} delay={i * 40} highlight={i === data.length - 1} />
              </View>
            ))}
          </View>
        </View>
      </View>
      <View style={styles.xLabels}>
        {data.map((d, i) => (
          <AText key={`${d.label}-${i}`} variant="tiny" faint align="center" style={{ flex: 1 }} numberOfLines={1}>
            {data.length > 8 && i % 2 === 1 ? '' : d.label}
          </AText>
        ))}
      </View>
    </View>
  );
}

/** Line chart for strength trends (e.g. estimated 1RM). */
export function LineChart({ data, height = 160, unit, accessibilityLabel }: { data: Point[]; height?: number; unit?: string; accessibilityLabel: string }) {
  const [width, setWidth] = useState(0);
  const reduce = useReduceMotion();
  const reveal = useSharedValue(0);
  useEffect(() => {
    reveal.value = 0;
    reveal.value = reduce ? 1 : withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [data, reduce, reveal]);
  const clip = useAnimatedStyle(() => ({ width: `${reveal.value * 100}%` }));

  const values = data.map((d) => d.value);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const pad = (maxV - minV) * 0.15 || Math.max(1, maxV * 0.1);
  const lo = Math.max(0, minV - pad);
  const hi = maxV + pad;
  const x = (i: number) => (data.length === 1 ? width / 2 : (i / (data.length - 1)) * (width - 12) + 6);
  const y = (v: number) => height - 8 - ((v - lo) / (hi - lo || 1)) * (height - 16);
  const line = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(data.length - 1)} ${height} L${x(0)} ${height} Z`;
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const first = data[0];
  const last = data[data.length - 1];

  return (
    <View accessible accessibilityLabel={`${accessibilityLabel}. From ${fmt(first?.value ?? 0)} to ${fmt(last?.value ?? 0)}${unit ? ` ${unit}` : ''} across ${data.length} sessions.`}>
      <View style={{ flexDirection: 'row' }}>
        <View style={[styles.yAxis, { height }]}>
          <AText variant="tiny" faint>
            {fmt(hi)}
          </AText>
          <AText variant="tiny" faint>
            {fmt((hi + lo) / 2)}
          </AText>
          <AText variant="tiny" faint>
            {fmt(lo)}
          </AText>
        </View>
        <View style={{ flex: 1, height }} onLayout={onLayout}>
          <Animated.View style={[{ height, overflow: 'hidden' }, clip]}>
            {width > 0 && data.length > 0 && (
              <Svg width={width} height={height}>
                <Defs>
                  <LinearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={colors.violet} stopOpacity="0.35" />
                    <Stop offset="1" stopColor={colors.violet} stopOpacity="0" />
                  </LinearGradient>
                </Defs>
                <Line x1="0" x2={width} y1={height / 2} y2={height / 2} stroke={colors.border} strokeDasharray="4 6" />
                {data.length > 1 && <Path d={area} fill="url(#area)" />}
                {data.length > 1 && <Path d={line} stroke={colors.violetBright} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />}
                {data.map((d, i) => (
                  <Circle key={i} cx={x(i)} cy={y(d.value)} r={i === data.length - 1 ? 5 : 3} fill={i === data.length - 1 ? colors.violetBright : colors.surface} stroke={colors.violetBright} strokeWidth={2} />
                ))}
              </Svg>
            )}
          </Animated.View>
        </View>
      </View>
      <View style={[styles.xLabels, { justifyContent: 'space-between', paddingLeft: 36 }]}>
        <AText variant="tiny" faint>
          {first?.label}
        </AText>
        <AText variant="tiny" faint>
          {last?.label}
        </AText>
      </View>
    </View>
  );
}

/** Small circular gauge (e.g. weekly consistency). */
export function Ring({ progress, size = 64, stroke = 6, children }: { progress: number; size?: number; stroke?: number; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.surfaceHigh} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.violet}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c * p} ${c}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  yAxis: { width: 36, justifyContent: 'space-between', paddingRight: spacing.xs },
  grid: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: colors.border },
  bars: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'flex-end' },
  barSlot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  bar: { width: '58%', maxWidth: 28, borderTopLeftRadius: 4, borderTopRightRadius: 4, borderWidth: 1, borderBottomWidth: 0 },
  xLabels: { flexDirection: 'row', marginTop: 6, paddingLeft: 36 },
});
