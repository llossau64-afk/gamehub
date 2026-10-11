import type { Cosmetics } from '../domain/types';

export type Unlock =
  | { kind: 'default' }
  | { kind: 'level'; level: number }
  | { kind: 'achievement'; id: string };

export interface CosmeticItem {
  id: string;
  name: string;
  slot: 'style' | 'outfit' | 'accent' | 'background' | 'frame' | 'title';
  unlock: Unlock;
  /** Primary colour (outfit/accent/background) */
  color?: string;
  color2?: string;
}

const D: Unlock = { kind: 'default' };
const L = (level: number): Unlock => ({ kind: 'level', level });
const A = (id: string): Unlock => ({ kind: 'achievement', id });

export const COSMETICS: CosmeticItem[] = [
  // Character styles — silhouettes, never body shapes.
  { id: 'vanguard', name: 'Vanguard', slot: 'style', unlock: D },
  { id: 'wanderer', name: 'Wanderer', slot: 'style', unlock: D },
  { id: 'arcanist', name: 'Arcanist', slot: 'style', unlock: L(5) },
  { id: 'sentinel', name: 'Sentinel', slot: 'style', unlock: A('first-week') },
  { id: 'monarch', name: 'Monarch', slot: 'style', unlock: L(20) },

  { id: 'obsidian', name: 'Obsidian', slot: 'outfit', unlock: D, color: '#1B1B26', color2: '#2A2A3A' },
  { id: 'storm', name: 'Storm Grey', slot: 'outfit', unlock: D, color: '#2B3140', color2: '#3D4558' },
  { id: 'midnight', name: 'Midnight Blue', slot: 'outfit', unlock: L(3), color: '#14213D', color2: '#22355E' },
  { id: 'amethyst', name: 'Amethyst', slot: 'outfit', unlock: A('first-workout'), color: '#2E1A4F', color2: '#45287A' },
  { id: 'ivory', name: 'Ivory', slot: 'outfit', unlock: A('workouts-50'), color: '#C9CED8', color2: '#E5E7EE' },

  { id: 'violet', name: 'Violet', slot: 'accent', unlock: D, color: '#8B5CF6' },
  { id: 'azure', name: 'Azure', slot: 'accent', unlock: D, color: '#60A5FA' },
  { id: 'jade', name: 'Jade', slot: 'accent', unlock: A('recovery-ritual'), color: '#34D399' },
  { id: 'ember', name: 'Ember', slot: 'accent', unlock: A('personal-best'), color: '#F59E0B' },
  { id: 'aurum', name: 'Aurum', slot: 'accent', unlock: A('workouts-100'), color: '#E8C872' },

  { id: 'void', name: 'The Void', slot: 'background', unlock: D, color: '#0A0A10', color2: '#151522' },
  { id: 'nebula', name: 'Nebula', slot: 'background', unlock: L(4), color: '#1A1030', color2: '#311B5C' },
  { id: 'citadel', name: 'Citadel', slot: 'background', unlock: A('consistency-builder'), color: '#0F1726', color2: '#1E2C47' },
  { id: 'aurora', name: 'Aurora', slot: 'background', unlock: A('technique-explorer'), color: '#0B1F22', color2: '#173D46' },

  { id: 'frame-rank', name: 'Rank Frame', slot: 'frame', unlock: D },
  { id: 'frame-runic', name: 'Runic Frame', slot: 'frame', unlock: L(10) },
  { id: 'frame-crown', name: 'Crown Frame', slot: 'frame', unlock: L(35) },

  { id: 'title-awakened', name: 'The Awakened', slot: 'title', unlock: D },
  { id: 'title-steadfast', name: 'The Steadfast', slot: 'title', unlock: A('first-week') },
  { id: 'title-scholar', name: 'Form Scholar', slot: 'title', unlock: A('technique-explorer') },
  { id: 'title-recordbreaker', name: 'Record Breaker', slot: 'title', unlock: A('personal-best') },
  { id: 'title-relentless', name: 'Relentless', slot: 'title', unlock: A('workouts-50') },
  { id: 'title-centurion', name: 'Centurion', slot: 'title', unlock: A('workouts-100') },
];

export const COSMETIC_BY_ID = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));

export const DEFAULT_COSMETICS: Cosmetics = {
  style: 'vanguard',
  outfit: 'obsidian',
  accent: 'violet',
  background: 'void',
  frame: 'frame-rank',
  title: 'title-awakened',
  badges: [],
};

export function isUnlocked(item: CosmeticItem, level: number, achievements: string[]): boolean {
  switch (item.unlock.kind) {
    case 'default':
      return true;
    case 'level':
      return level >= item.unlock.level;
    case 'achievement':
      return achievements.includes(item.unlock.id);
  }
}

export function unlockText(item: CosmeticItem): string {
  switch (item.unlock.kind) {
    case 'default':
      return 'Starter item';
    case 'level':
      return `Reach level ${item.unlock.level}`;
    case 'achievement':
      return `Achievement reward`;
  }
}
