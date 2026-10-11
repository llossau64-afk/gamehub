import Ionicons from '@expo/vector-icons/Ionicons';
import type { BottomTabBarProps } from 'expo-router/tabs';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { haptic, playSound } from '../services/feedback';
import { colors, fonts, radius } from '../theme';
import { AText } from './AText';

type IconName = ComponentProps<typeof Ionicons>['name'];

const TABS: Record<string, { label: string; icon: IconName; iconOn: IconName }> = {
  index: { label: 'Home', icon: 'planet-outline', iconOn: 'planet' },
  train: { label: 'Train', icon: 'barbell-outline', iconOn: 'barbell' },
  quests: { label: 'Quests', icon: 'diamond-outline', iconOn: 'diamond' },
  progress: { label: 'Progress', icon: 'stats-chart-outline', iconOn: 'stats-chart' },
  coach: { label: 'Coach', icon: 'sparkles-outline', iconOn: 'sparkles' },
};

function Indicator({ focused }: { focused: boolean }) {
  const style = useAnimatedStyle(() => ({
    opacity: withSpring(focused ? 1 : 0),
    transform: [{ scaleX: withSpring(focused ? 1 : 0.2, { damping: 14 }) }],
  }));
  return <Animated.View style={[styles.indicator, style]} />;
}

/** Floating, glassy navigation bar with five clearly separated areas. */
export function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.bar} accessibilityRole="tablist">
        {state.routes.map((route, index) => {
          const meta = TABS[route.name];
          if (!meta) return null;
          const focused = state.index === index;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={meta.label}
              testID={`tab-${route.name}`}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) {
                  playSound('tap');
                  haptic('select');
                  navigation.navigate(route.name, route.params);
                }
              }}
              style={styles.item}
            >
              <Indicator focused={focused} />
              <Ionicons name={focused ? meta.iconOn : meta.icon} size={22} color={focused ? colors.violetBright : colors.silverDim} />
              <AText variant="tiny" style={{ fontFamily: fonts.bodySemi, marginTop: 3, letterSpacing: 0.4 }} color={focused ? colors.text : colors.textFaint}>
                {meta.label}
              </AText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12, alignItems: 'center' },
  bar: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 560,
    height: 66,
    borderRadius: radius.xl,
    backgroundColor: 'rgba(16,16,23,0.97)',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  indicator: { position: 'absolute', top: 0, width: 26, height: 3, borderRadius: 2, backgroundColor: colors.violetBright },
});
