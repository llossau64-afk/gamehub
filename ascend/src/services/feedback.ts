import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { useAppStore } from '../store/useAppStore';

/** Sound effects & haptics, each independently switchable in Settings. */

const SOURCES = {
  tap: require('../../assets/sounds/tap.wav'),
  xp: require('../../assets/sounds/xp.wav'),
  reward: require('../../assets/sounds/reward.wav'),
  restEnd: require('../../assets/sounds/rest-end.wav'),
  complete: require('../../assets/sounds/complete.wav'),
  levelup: require('../../assets/sounds/levelup.wav'),
  rank: require('../../assets/sounds/rank.wav'),
} as const;

export type SoundName = keyof typeof SOURCES;

const VOLUME: Record<SoundName, number> = { tap: 0.25, xp: 0.5, reward: 0.6, restEnd: 0.7, complete: 0.7, levelup: 0.75, rank: 0.8 };

const players: Partial<Record<SoundName, AudioPlayer>> = {};
let music: AudioPlayer | null = null;
let initialised = false;

export async function initAudio() {
  if (initialised) return;
  initialised = true;
  try {
    // Mix with the user's own music/podcasts instead of interrupting them.
    await setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' });
  } catch {
    // Audio mode is best-effort.
  }
}

function player(name: SoundName): AudioPlayer | null {
  try {
    if (!players[name]) {
      const p = createAudioPlayer(SOURCES[name]);
      p.volume = VOLUME[name];
      players[name] = p;
    }
    return players[name]!;
  } catch {
    return null;
  }
}

export function playSound(name: SoundName) {
  if (!useAppStore.getState().settings.sound) return;
  const p = player(name);
  if (!p) return;
  try {
    void p.seekTo(0);
    p.play();
  } catch {
    // ignore playback errors (e.g. audio focus lost)
  }
}

export function setMusic(enabled: boolean) {
  try {
    if (enabled) {
      if (!music) {
        music = createAudioPlayer(require('../../assets/sounds/ambient.wav'));
        music.loop = true;
        music.volume = 0.18;
      }
      music.play();
    } else music?.pause();
  } catch {
    // ignore
  }
}

type HapticKind = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'select';

export function haptic(kind: HapticKind = 'light') {
  if (Platform.OS === 'web' || !useAppStore.getState().settings.haptics) return;
  try {
    switch (kind) {
      case 'success':
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case 'warning':
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case 'select':
        void Haptics.selectionAsync();
        break;
      default:
        void Haptics.impactAsync(
          kind === 'heavy' ? Haptics.ImpactFeedbackStyle.Heavy : kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
        );
    }
  } catch {
    // ignore
  }
}

/** Convenience: tap sound + light haptic for primary UI interactions. */
export function uiTap() {
  playSound('tap');
  haptic('light');
}
