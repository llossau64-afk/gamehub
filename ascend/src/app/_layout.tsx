import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Rajdhani_600SemiBold } from '@expo-google-fonts/rajdhani/600SemiBold';
import { Rajdhani_700Bold } from '@expo-google-fonts/rajdhani/700Bold';
import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CelebrationOverlay } from '../components/CelebrationOverlay';
import { LoadingScreen } from '../components/LoadingScreen';
import { restoreSession } from '../services/auth';
import { initAudio, setMusic } from '../services/feedback';
import { rescheduleAll } from '../services/notifications';
import { startAutoSync } from '../services/sync';
import { useAppStore } from '../store/useAppStore';
import { colors } from '../theme';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
void SystemUI.setBackgroundColorAsync(colors.bg).catch(() => undefined);

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bgElevated, primary: colors.violet, text: colors.text, border: colors.border },
};

function AppEffects() {
  const hydrated = useAppStore((s) => s.hydrated);
  const music = useAppStore((s) => s.settings.music);
  const notif = useAppStore((s) => s.settings.notifications);
  const plan = useAppStore((s) => s.plan);
  const name = useAppStore((s) => s.profile?.name ?? '');

  useEffect(() => {
    if (!hydrated) return;
    void initAudio();
    void restoreSession();
    return startAutoSync();
  }, [hydrated]);

  useEffect(() => {
    if (hydrated) setMusic(music);
  }, [hydrated, music]);

  useEffect(() => {
    if (hydrated) void rescheduleAll(notif, plan, name);
  }, [hydrated, notif, plan, name]);

  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Rajdhani_600SemiBold, Rajdhani_700Bold });
  const hydrated = useAppStore((s) => s.hydrated);
  const ready = (fontsLoaded || !!fontError) && hydrated;

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsLoaded, fontError]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider value={theme}>
          <StatusBar style="light" />
          {!ready ? (
            <LoadingScreen />
          ) : (
            <View style={styles.root}>
              <AppEffects />
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'fade_from_bottom' }}>
                <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
                <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
                <Stack.Screen name="workout" options={{ presentation: 'fullScreenModal', gestureEnabled: false, animation: 'slide_from_bottom' }} />
                <Stack.Screen name="complete" options={{ presentation: 'fullScreenModal', gestureEnabled: false, animation: 'fade' }} />
                <Stack.Screen name="checkin" options={{ presentation: 'modal' }} />
                <Stack.Screen name="auth" options={{ presentation: 'modal' }} />
                <Stack.Screen name="coach-chat" options={{ presentation: 'modal' }} />
              </Stack>
              <CelebrationOverlay />
            </View>
          )}
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.bg } });
