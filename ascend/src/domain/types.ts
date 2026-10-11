// ─── Exercise library ────────────────────────────────────────────────────────

export type MuscleCategory =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'arms'
  | 'legs'
  | 'core'
  | 'fullbody'
  | 'mobility'
  | 'cardio';

export type Muscle =
  | 'chest'
  | 'upper-back'
  | 'lats'
  | 'lower-back'
  | 'front-delts'
  | 'side-delts'
  | 'rear-delts'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'adductors'
  | 'abs'
  | 'obliques'
  | 'hip-flexors'
  | 'traps'
  | 'cardio';

export type Equipment =
  | 'bodyweight'
  | 'dumbbells'
  | 'barbell'
  | 'bench'
  | 'rack'
  | 'cable'
  | 'machine'
  | 'pullup-bar'
  | 'kettlebell'
  | 'bands'
  | 'cardio-machine';

export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

/** Movement pattern drives balanced programming in the generator & validator. */
export type Pattern =
  | 'horizontal-push'
  | 'vertical-push'
  | 'horizontal-pull'
  | 'vertical-pull'
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'isolation-upper'
  | 'isolation-lower'
  | 'core'
  | 'carry'
  | 'mobility'
  | 'conditioning';

export type LoadType = 'weighted' | 'bodyweight' | 'timed';

export type BodyArea = 'shoulder' | 'knee' | 'lower-back' | 'wrist' | 'elbow' | 'hip' | 'neck' | 'ankle';

export interface Exercise {
  id: string;
  name: string;
  category: MuscleCategory;
  pattern: Pattern;
  primary: Muscle[];
  secondary: Muscle[];
  equipment: Equipment[]; // all items required
  difficulty: Difficulty;
  loadType: LoadType;
  compound: boolean;
  startingPosition: string;
  steps: string[];
  movement: string;
  breathing: string;
  mistakes: string[];
  safety: string[];
  easier: string; // easier variation description
  easierId?: string;
  alternatives: string[]; // exercise ids
  /** Body areas this exercise loads significantly — used for limitation filtering. */
  stresses: BodyArea[];
  /** Licensed demonstration media. Undefined = no demonstration available. */
  demo?: { kind: 'video' | 'animation'; uri: string; credit: string };
}

// ─── Player profile ──────────────────────────────────────────────────────────

export type AgeRange = 'under13' | '13-15' | '16-17' | '18-24' | '25-34' | '35-44' | '45-54' | '55-64' | '65+';
export type Gender = 'female' | 'male' | 'non-binary' | 'self-describe' | 'prefer-not';
export type Experience = 'new' | 'beginner' | 'intermediate' | 'advanced';
export type Goal = 'muscle' | 'strength' | 'athletic' | 'general' | 'endurance' | 'active';
export type WeightGoal = 'none' | 'gain' | 'manage';
export type TrainingLocation = 'gym' | 'home';
export type Intensity = 'easy' | 'moderate' | 'hard';
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Monday

export interface Profile {
  name: string;
  ageRange: AgeRange;
  gender: Gender;
  genderSelfDescribe?: string;
  heightCm?: number;
  experience: Experience;
  previousTraining: string;
  goal: Goal;
  weightGoal: WeightGoal; // adults only, always 'none' for minors
  location: TrainingLocation;
  equipment: Equipment[];
  trainingDays: Weekday[];
  sessionMinutes: number;
  preferredExercises: string[]; // exercise ids
  limitations: BodyArea[];
  limitationNotes: string;
  intensity: Intensity;
  units: 'kg' | 'lb';
  coachLanguage: 'auto' | 'en' | 'de';
  createdAt: string;
}

// ─── Training plan ───────────────────────────────────────────────────────────

export interface PlannedExercise {
  exerciseId: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  /** For timed exercises reps are seconds. */
  restSec: number;
  rir: number; // target reps in reserve
  notes?: string;
}

export interface PlanDay {
  id: string;
  weekday: Weekday;
  title: string;
  focus: string;
  warmup: string[];
  exercises: PlannedExercise[];
  cooldown: string[];
  estMinutes: number;
}

export interface TrainingPlan {
  id: string;
  name: string;
  split: string;
  createdAt: string;
  updatedAt: string;
  source: 'ai' | 'fallback' | 'edited';
  days: PlanDay[];
  restDays: Weekday[];
  progression: string[];
  recoveryNotes: string[];
  techniqueNotes: string[];
  rationale: string;
  warnings: string[];
}

// ─── Logged training ─────────────────────────────────────────────────────────

export interface SetLog {
  weight: number | null; // in kg internally
  reps: number;
  rpe: number | null; // perceived difficulty 1–10
  completedAt: string;
}

export interface ExerciseLog {
  exerciseId: string;
  planned?: PlannedExercise;
  sets: SetLog[];
  skipped?: boolean;
  replacedFrom?: string;
}

export type Difficulty5 = 1 | 2 | 3 | 4 | 5;

export interface WorkoutFeedback {
  completed: 'yes' | 'partly' | 'no';
  difficulty: Difficulty5; // 1 very easy … 5 very hard
  techniqueComfortable: boolean;
  unusualPain: boolean;
  painArea?: BodyArea;
  adjustNext: 'keep' | 'easier' | 'harder' | 'shorter';
}

export interface WorkoutSession {
  id: string;
  planDayId: string | null;
  title: string;
  startedAt: string;
  finishedAt: string;
  durationSec: number;
  exercises: ExerciseLog[];
  scheduled: boolean;
  feedback?: WorkoutFeedback;
  xpEarned: number;
  prs: PersonalRecord[];
  updatedAt: string;
}

export interface ActiveWorkout {
  id: string;
  planDayId: string | null;
  title: string;
  startedAt: string;
  pausedAt: string | null;
  pausedTotalSec: number;
  exercises: ExerciseLog[];
  currentIndex: number;
  restEndsAt: string | null;
  scheduled: boolean;
}

export interface PersonalRecord {
  exerciseId: string;
  kind: 'weight' | 'reps' | 'e1rm';
  value: number;
  previous: number | null;
  at: string;
}

// ─── Progression & game ──────────────────────────────────────────────────────

export type XPSource =
  | 'scheduled-workout'
  | 'extra-workout'
  | 'personal-record'
  | 'technique'
  | 'checkin'
  | 'mobility'
  | 'progress-review'
  | 'light-activity'
  | 'weekly-mission'
  | 'achievement';

export interface XPEvent {
  id: string;
  source: XPSource;
  amount: number;
  at: string;
  ref?: string;
  label: string;
}

export interface Checkin {
  id: string;
  date: string; // YYYY-MM-DD
  sleep: 1 | 2 | 3 | 4 | 5;
  energy: 1 | 2 | 3 | 4 | 5;
  soreness: 1 | 2 | 3 | 4 | 5;
  mood: 1 | 2 | 3 | 4 | 5;
  pain: boolean;
  note?: string;
  updatedAt: string;
}

export interface BodyMetric {
  id: string;
  date: string;
  weightKg: number;
  updatedAt: string;
}

export interface Cosmetics {
  style: string;
  outfit: string;
  accent: string;
  background: string;
  frame: string;
  title: string;
  badges: string[];
}

export interface Settings {
  sound: boolean;
  music: boolean;
  haptics: boolean;
  reduceMotion: 'system' | 'on' | 'off';
  autoRestTimer: boolean;
  notifications: {
    enabled: boolean;
    workoutReminder: boolean;
    workoutHour: number;
    workoutMinute: number;
    checkinReminder: boolean;
    checkinHour: number;
    weeklySummary: boolean;
    achievements: boolean;
    planUpdates: boolean;
  };
  demoMode: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'coach';
  text: string;
  at: string;
  source?: 'ai' | 'offline';
}
