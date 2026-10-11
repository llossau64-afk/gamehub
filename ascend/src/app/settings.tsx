import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { AText } from '../components/AText';
import { Button } from '../components/Button';
import { Banner, ChipGroup, Segmented } from '../components/Controls';
import { Panel } from '../components/Panel';
import { Screen } from '../components/Screen';
import { GENERAL_DISCLAIMER } from '../domain/safety';
import { deleteAccount, signOut } from '../services/auth';
import { exportAllData } from '../services/exportData';
import { requestPermission } from '../services/notifications';
import { backendConfigured } from '../services/supabase';
import { syncNow } from '../services/sync';
import { useAppStore } from '../store/useAppStore';
import { colors, spacing } from '../theme';
import { relativeDay } from '../utils';

function Row({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <AText variant="bodyStrong">{label}</AText>
        {hint && (
          <AText variant="small" muted>
            {hint}
          </AText>
        )}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.violet, false: colors.surfaceHigh }}
        thumbColor={Platform.OS === 'android' ? (value ? colors.violetBright : colors.silverDim) : undefined}
      />
    </View>
  );
}

function Link({ icon, label, onPress, danger }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.link, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.silver} />
      <AText variant="bodyStrong" style={{ flex: 1 }} color={danger ? colors.danger : colors.text}>
        {label}
      </AText>
      <Ionicons name="chevron-forward" size={18} color={colors.silverDim} />
    </Pressable>
  );
}

function confirmAction(title: string, body: string, label: string, fn: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${body}`)) fn();
    return;
  }
  Alert.alert(title, body, [{ text: 'Cancel', style: 'cancel' }, { text: label, style: 'destructive', onPress: fn }]);
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <Panel title={title}>
    <View style={{ gap: spacing.md }}>{children}</View>
  </Panel>
);

export default function Settings() {
  const { settings, update, updateNotif, auth, sync, profile } = useAppStore(
    useShallow((s) => ({ settings: s.settings, update: s.updateSettings, updateNotif: s.updateNotificationSettings, auth: s.auth, sync: s.sync, profile: s.profile })),
  );
  const n = settings.notifications;
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const enableNotifications = async (on: boolean) => {
    if (on && !(await requestPermission())) {
      setMsg({ tone: 'info', text: Platform.OS === 'web' ? 'Reminders are available in the iOS and Android apps.' : 'Notifications are blocked. You can allow them in your phone settings.' });
      return;
    }
    updateNotif({ enabled: on });
  };

  return (
    <Screen back title="Settings">
      {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}

      <Section title="Account">
        <View style={styles.row}>
          <Ionicons name={auth.mode === 'account' ? 'person-circle' : 'person-circle-outline'} size={32} color={colors.violetBright} />
          <View style={{ flex: 1 }}>
            <AText variant="bodyStrong">{auth.mode === 'account' ? auth.email : 'Guest player'}</AText>
            <AText variant="small" muted>
              {auth.mode === 'account'
                ? `Cloud sync on${sync.lastSyncedAt ? ` · last synced ${relativeDay(sync.lastSyncedAt)}` : ''}`
                : backendConfigured
                  ? 'Create an account to back up and sync your progress.'
                  : 'Offline mode — data is stored on this device.'}
            </AText>
          </View>
        </View>
        {sync.lastError && auth.mode === 'account' && <Banner tone="warning">Last sync failed: {sync.lastError}. Your data is safe on this device.</Banner>}
        {auth.mode === 'account' ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button
              label="Sync now"
              icon="cloud-upload-outline"
              variant="secondary"
              size="sm"
              style={{ flex: 1 }}
              loading={busy === 'sync'}
              onPress={async () => {
                setBusy('sync');
                const r = await syncNow({ pull: true });
                setBusy(null);
                setMsg(r.ok ? { tone: 'success', text: 'Everything is synced.' } : { tone: 'danger', text: r.error ?? 'Sync failed.' });
              }}
            />
            <Button label="Sign out" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => confirmAction('Sign out?', 'Your data stays on this device.', 'Sign out', () => void signOut())} />
          </View>
        ) : (
          <Button label="Create account or sign in" icon="cloud-outline" onPress={() => router.push('/auth')} />
        )}
      </Section>

      <Section title="Player">
        <Link icon="person-outline" label="Edit player profile" onPress={() => router.push('/profile')} />
        <Link icon="color-palette-outline" label="Character & cosmetics" onPress={() => router.push('/avatar')} />
        <Link icon="leaf-outline" label="Nutrition & recovery guide" onPress={() => router.push('/wellness')} />
        <View style={{ gap: 6 }}>
          <AText variant="bodyStrong">Units</AText>
          <Segmented
            options={[
              { value: 'kg', label: 'kg' },
              { value: 'lb', label: 'lb' },
            ]}
            value={profile?.units ?? 'kg'}
            onChange={(units) => useAppStore.getState().updateProfile({ units })}
          />
        </View>
        <View style={{ gap: 6 }}>
          <AText variant="bodyStrong">Coach language</AText>
          <Segmented
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'en', label: 'English' },
              { value: 'de', label: 'Deutsch' },
            ]}
            value={profile?.coachLanguage ?? 'auto'}
            onChange={(coachLanguage) => useAppStore.getState().updateProfile({ coachLanguage })}
          />
        </View>
      </Section>

      <Section title="Sound, haptics & motion">
        <Row label="Sound effects" value={settings.sound} onChange={(sound) => update({ sound })} />
        <Row label="Ambient music" hint="A calm background loop. Mixes with your own music." value={settings.music} onChange={(music) => update({ music })} />
        <Row label="Haptic feedback" value={settings.haptics} onChange={(haptics) => update({ haptics })} />
        <Row label="Automatic rest timer" hint="Starts after each logged set." value={settings.autoRestTimer} onChange={(autoRestTimer) => update({ autoRestTimer })} />
        <View style={{ gap: 6 }}>
          <AText variant="bodyStrong">Reduce motion</AText>
          <Segmented
            options={[
              { value: 'system', label: 'System' },
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ]}
            value={settings.reduceMotion}
            onChange={(reduceMotion) => update({ reduceMotion })}
          />
        </View>
      </Section>

      <Section title="Reminders">
        <Row label="Allow reminders" hint="Friendly and optional. Never guilt-based." value={n.enabled} onChange={enableNotifications} />
        {n.enabled && (
          <>
            <Row label="Workout ready" value={n.workoutReminder} onChange={(workoutReminder) => updateNotif({ workoutReminder })} />
            {n.workoutReminder && (
              <ChipGroup
                options={[7, 12, 17, 19].map((h) => ({ value: h, label: `${h}:${n.workoutMinute.toString().padStart(2, '0')}` }))}
                value={n.workoutHour}
                onChange={(v) => updateNotif({ workoutHour: v as number })}
              />
            )}
            <Row label="Recovery check-in" value={n.checkinReminder} onChange={(checkinReminder) => updateNotif({ checkinReminder })} />
            {n.checkinReminder && (
              <ChipGroup options={[7, 8, 9, 20].map((h) => ({ value: h, label: `${h}:00` }))} value={n.checkinHour} onChange={(v) => updateNotif({ checkinHour: v as number })} />
            )}
            <Row label="Weekly summary" hint="Sunday evening." value={n.weeklySummary} onChange={(weeklySummary) => updateNotif({ weeklySummary })} />
            <Row label="Plan updates" value={n.planUpdates} onChange={(planUpdates) => updateNotif({ planUpdates })} />
            <Row label="Achievements" value={n.achievements} onChange={(achievements) => updateNotif({ achievements })} />
          </>
        )}
      </Section>

      <Section title="Demo mode">
        <Row
          label="Show sample data"
          hint="Fills Progress and statistics with clearly labelled generated sessions. Your real data is untouched."
          value={settings.demoMode}
          onChange={(demoMode) => update({ demoMode })}
        />
      </Section>

      <Section title="Your data">
        <Link
          icon="download-outline"
          label="Export all data (JSON)"
          onPress={async () => {
            const r = await exportAllData();
            setMsg(r.ok ? { tone: 'success', text: 'Export ready.' } : { tone: 'danger', text: r.error ?? 'Export failed.' });
          }}
        />
        <Link
          icon="trash-outline"
          label={auth.mode === 'account' ? 'Delete account and all data' : 'Delete all data on this device'}
          danger
          onPress={() =>
            confirmAction(
              'Delete everything?',
              auth.mode === 'account' ? 'Your cloud account, training history, XP and settings will be permanently deleted. This cannot be undone.' : 'All training history, XP and settings on this device will be permanently deleted.',
              'Delete',
              async () => {
                setBusy('delete');
                const r = await deleteAccount();
                setBusy(null);
                if (r.ok) router.replace('/onboarding');
                else setMsg({ tone: 'danger', text: r.error });
              },
            )
          }
        />
        <AText variant="tiny" faint>
          ASCEND shows no ads and never sells or shares your fitness data. Only the information needed to run the app is stored.
        </AText>
      </Section>

      <AText variant="tiny" faint align="center">
        {GENERAL_DISCLAIMER}
      </AText>
      <AText variant="tiny" faint align="center">
        ASCEND 1.0.0
      </AText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  link: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 6 },
});
