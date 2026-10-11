import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { colors } from '../theme';

/** Premium loading state used while fonts and saved data load. Uses system fonts on purpose. */
export function LoadingScreen({ label = 'Loading' }: { label?: string }) {
  const spin = useSharedValue(0);
  useEffect(() => {
    spin.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.linear }), -1);
  }, [spin]);
  const ring = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  return (
    <View style={styles.root} accessibilityLabel={label} accessibilityRole="progressbar">
      <View style={styles.mark}>
        <Animated.View style={[styles.ring, ring]} />
        <View style={styles.diamond} />
      </View>
      <Text style={styles.word}>ASCEND</Text>
      <ActivityIndicator color={colors.violetBright} style={{ marginTop: 24, opacity: 0.6 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  mark: { width: 84, height: 84, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 84, height: 84, borderRadius: 42, borderWidth: 2, borderColor: colors.violet, borderTopColor: 'transparent', borderLeftColor: colors.violetBright },
  diamond: { width: 26, height: 26, transform: [{ rotate: '45deg' }], borderWidth: 2, borderColor: colors.silver, backgroundColor: colors.violetWash },
  word: { marginTop: 20, color: colors.text, fontSize: 22, letterSpacing: 10, fontWeight: '700' },
});
