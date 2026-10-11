import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Settings, TrainingPlan } from '../domain/types';

/**
 * Local, optional, guilt-free reminders. No push server, no marketing.
 * All copy is encouraging and never references missed days or lost streaks.
 */

const CHANNEL = 'ascend-reminders';
const supported = Platform.OS === 'ios' || Platform.OS === 'android';

if (supported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

export async function requestPermission(): Promise<boolean> {
  if (!supported) return false;
  try {
    if (Platform.OS === 'android')
      await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'Reminders', importance: Notifications.AndroidImportance.DEFAULT });
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const req = await Notifications.requestPermissionsAsync();
    return req.granted;
  } catch {
    return false;
  }
}

/** ASCEND weekday (0 = Monday) → expo weekday (1 = Sunday). */
const toExpoWeekday = (wd: number) => ((wd + 1) % 7) + 1;

export async function rescheduleAll(settings: Settings['notifications'], plan: TrainingPlan | null, name: string): Promise<number> {
  if (!supported) return 0;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!settings.enabled) return 0;
    let count = 0;
    const channelId = Platform.OS === 'android' ? CHANNEL : undefined;
    if (settings.workoutReminder && plan) {
      for (const day of plan.days) {
        await Notifications.scheduleNotificationAsync({
          content: { title: "Today's mission is ready", body: `${day.title} · about ${day.estMinutes} min. Train when it suits you, ${name}.` },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: toExpoWeekday(day.weekday), hour: settings.workoutHour, minute: settings.workoutMinute, channelId },
        });
        count++;
      }
    }
    if (settings.checkinReminder) {
      await Notifications.scheduleNotificationAsync({
        content: { title: 'Recovery check-in', body: 'Four quick taps — how did you sleep and how do you feel?' },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: settings.checkinHour, minute: 0, channelId },
      });
      count++;
    }
    if (settings.weeklySummary) {
      await Notifications.scheduleNotificationAsync({
        content: { title: 'Your weekly summary is ready', body: 'See what you achieved this week in Progress.' },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: 1, hour: 18, minute: 0, channelId },
      });
      count++;
    }
    return count;
  } catch {
    return 0;
  }
}

/** Immediate local notification (used for plan updates/achievements when enabled). */
export async function notifyNow(title: string, body: string) {
  if (!supported) return;
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    await Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null });
  } catch {
    // ignore
  }
}
