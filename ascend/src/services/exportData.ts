import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { useAppStore } from '../store/useAppStore';

/** Export everything ASCEND stores about the player as a JSON file. */
export async function exportAllData(): Promise<{ ok: boolean; error?: string }> {
  const s = useAppStore.getState();
  const payload = {
    exportedAt: new Date().toISOString(),
    app: 'ASCEND',
    formatVersion: 1,
    account: { mode: s.auth.mode, email: s.auth.email },
    profile: s.profile,
    plan: s.plan,
    workoutSessions: s.sessions,
    xpEvents: s.xpEvents,
    checkins: s.checkins,
    bodyMetrics: s.bodyMetrics,
    achievements: s.achievements,
    cosmetics: s.cosmetics,
    settings: s.settings,
    coachChat: s.chat,
    planChanges: s.planChanges,
  };
  const json = JSON.stringify(payload, null, 2);
  const filename = `ascend-export-${new Date().toISOString().slice(0, 10)}.json`;
  try {
    if (Platform.OS === 'web') {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      return { ok: true };
    }
    const file = new File(Paths.cache, filename);
    if (file.exists) file.delete();
    file.create();
    file.write(json);
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Export ASCEND data' });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Export failed' };
  }
}
