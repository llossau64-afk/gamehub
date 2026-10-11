import { EXERCISES, EXERCISE_BY_ID } from '../data/exercises';
import { addDays, dayKey, weekdayOf, WEEKDAY_LONG } from '../utils';
import { findSubstitute } from './plan/library';
import { goalLabel } from './plan/generator';
import { isMinor, PAIN_DISCLAIMER } from './safety';
import type { Checkin, Exercise, Profile, TrainingPlan, WorkoutSession } from './types';

export interface CoachContext {
  profile: Profile;
  plan: TrainingPlan | null;
  sessions: WorkoutSession[];
  checkins: Checkin[];
  now?: Date;
}

export type Lang = 'en' | 'de';

const DE_HINTS = /\b(wie|was|warum|wieso|ich|heute|übung|uebung|trainieren|training|kann|soll|meine|meinen|mein|ersetzen|kürzer|kuerzer|woche|erholung|schmerz|schmerzen|bitte|danke|nicht|und|mache|machen|wann)\b/i;

export function detectLang(text: string, pref: Profile['coachLanguage']): Lang {
  if (pref === 'en' || pref === 'de') return pref;
  return DE_HINTS.test(text) ? 'de' : 'en';
}

type Intent = 'pain' | 'replace' | 'technique' | 'shorten' | 'today' | 'decrease' | 'week' | 'recovery' | 'nutrition' | 'motivation' | 'help';

export function detectIntent(text: string): Intent {
  const t = text.toLowerCase();
  if (/(pain|hurt|injur|sharp|ache|schmerz|verletz|tut weh)/.test(t)) return 'pain';
  if (/(replace|swap|substitut|alternative|instead of|ersetz|austausch|statt)/.test(t)) return 'replace';
  if (/(shorten|short on time|less time|quick|kürzer|kuerzer|wenig zeit|schneller)/.test(t)) return 'shorten';
  if (/(decreas|weaker|plateau|stuck|regress|schwächer|schwaecher|stagn|weniger kraft|nachgelassen)/.test(t)) return 'decrease';
  if (/(how (do|to|should) i (do|perform)|technique|form|perform|ausführ|ausfuehr|technik|wie mache|wie geht)/.test(t)) return 'technique';
  if (/(structure|my week|schedule|split|woche|wochenplan|aufteil)/.test(t)) return 'week';
  if (/(recover|rest day|sleep|sore|erhol|schlaf|muskelkater|ruhetag|pause)/.test(t)) return 'recovery';
  if (/(protein|eat|food|diet|nutrition|calorie|ernähr|ernaehr|essen|eiweiß|eiweiss|kalorien)/.test(t)) return 'nutrition';
  if (/(today|train today|what should i|heute|was soll ich)/.test(t)) return 'today';
  if (/(motivat|tired|lazy|keine lust|müde|muede)/.test(t)) return 'motivation';
  return 'help';
}

export function findExerciseInText(text: string): Exercise | undefined {
  const t = text.toLowerCase();
  let best: { ex: Exercise; score: number } | undefined;
  for (const ex of EXERCISES) {
    const name = ex.name.toLowerCase();
    if (t.includes(name)) return ex;
    const words = name.split(/[\s-]+/).filter((w) => w.length > 3);
    const score = words.filter((w) => t.includes(w)).length / Math.max(1, words.length);
    if (score > 0 && (!best || score > best.score)) best = { ex, score };
  }
  const synonyms: Record<string, string> = {
    bench: 'barbell-bench-press',
    bankdrücken: 'barbell-bench-press',
    bankdruecken: 'barbell-bench-press',
    squat: 'back-squat',
    kniebeuge: 'goblet-squat',
    deadlift: 'deadlift',
    kreuzheben: 'deadlift',
    klimmzug: 'pull-up',
    'pull up': 'pull-up',
    liegestütz: 'push-up',
    liegestuetz: 'push-up',
    pushup: 'push-up',
    rudern: 'seated-cable-row',
    row: 'seated-cable-row',
    latzug: 'lat-pulldown',
    schulterdrücken: 'seated-dumbbell-shoulder-press',
    plank: 'plank',
    unterarmstütz: 'plank',
    ausfallschritt: 'walking-lunge',
    lunge: 'walking-lunge',
    curl: 'dumbbell-curl',
  };
  for (const [k, id] of Object.entries(synonyms)) if (t.includes(k)) return EXERCISE_BY_ID[id];
  return best && best.score >= 0.5 ? best.ex : undefined;
}

function todayDay(ctx: CoachContext) {
  const now = ctx.now ?? new Date();
  return ctx.plan?.days.find((d) => d.weekday === weekdayOf(now)) ?? null;
}

function nextDay(ctx: CoachContext) {
  const now = ctx.now ?? new Date();
  for (let i = 1; i <= 7; i++) {
    const d = ctx.plan?.days.find((x) => x.weekday === weekdayOf(addDays(now, i)));
    if (d) return { day: d, inDays: i };
  }
  return null;
}

const fmtReps = (min: number, max: number, timed: boolean) => {
  if (timed) return min === max ? `${Math.round(min / 60) >= 2 ? `${Math.round(min / 60)} min` : `${min} s`}` : `${min}–${max} s`;
  return min === max ? `${min}` : `${min}–${max}`;
};

/**
 * Rule-based coach used when the AI service is unavailable (offline, not
 * configured, or failing). Grounded entirely in the player's own plan and
 * history — it never invents facts.
 */
export function offlineCoachReply(text: string, ctx: CoachContext): string {
  const lang = detectLang(text, ctx.profile.coachLanguage);
  const de = lang === 'de';
  const intent = detectIntent(text);
  const name = ctx.profile.name || (de ? 'Spieler' : 'Player');
  const minor = isMinor(ctx.profile.ageRange);

  switch (intent) {
    case 'pain':
      return de
        ? `Danke, dass du das sagst, ${name}. Bei ungewöhnlichen, stechenden oder anhaltenden Schmerzen: Übung sofort beenden. Ich kann keine Verletzungen diagnostizieren — bitte lass das von einer Ärztin, einem Arzt oder Physiotherapie abklären. Bis dahin: Bewegungen vermeiden, die schmerzen, und nach dem Training im Feedback den Bereich markieren — ASCEND tauscht dann belastende Übungen automatisch aus.`
        : `Thanks for telling me, ${name}. ${PAIN_DISCLAIMER} Until then, skip movements that hurt. After your next session, mark the area in the feedback step and ASCEND will automatically swap exercises that load it.`;

    case 'replace': {
      const ex = findExerciseInText(text);
      if (!ex)
        return de
          ? 'Welche Übung möchtest du ersetzen? Nenne den Namen, z. B. „Ersetze Kniebeugen“.'
          : 'Which exercise would you like to replace? Name it, for example "replace back squat".';
      const subs: Exercise[] = [];
      const used = new Set<string>([ex.id]);
      for (let i = 0; i < 3; i++) {
        const s = findSubstitute(ex.id, ctx.profile, used);
        if (!s) break;
        subs.push(s);
        used.add(s.id);
      }
      if (!subs.length)
        return de
          ? `Mit deiner Ausrüstung habe ich keine passende Alternative zu ${ex.name} gefunden. Prüfe in den Einstellungen deine Ausrüstung.`
          : `I couldn't find a suitable alternative to ${ex.name} with your equipment. Check your equipment in Settings.`;
      const list = subs.map((s) => `• ${s.name} — ${s.primary.join(', ')}`).join('\n');
      return de
        ? `Gute Alternativen zu ${ex.name}, die zu deiner Ausrüstung passen:\n${list}\n\nIm Trainingsmodus kannst du mit „Ersetzen“ direkt wechseln — dein Fortschritt bleibt erhalten.`
        : `Good alternatives to ${ex.name} that match your equipment:\n${list}\n\nDuring a workout, tap "Replace" to switch instantly — your progress is kept.`;
    }

    case 'technique': {
      const ex = findExerciseInText(text);
      if (!ex)
        return de
          ? 'Für welche Übung? Frag z. B. „Wie mache ich Kreuzheben?“. Alle Anleitungen findest du auch in der Übungsbibliothek.'
          : 'Which exercise? Ask e.g. "How do I perform a Romanian deadlift?". Every guide is also in the exercise library.';
      const steps = ex.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
      return de
        ? `${ex.name} (Anleitung auf Englisch aus der Bibliothek):\nStart: ${ex.startingPosition}\n${steps}\nAtmung: ${ex.breathing}\nHäufiger Fehler: ${ex.mistakes[0]}.\nLeichtere Variante: ${ex.easier}`
        : `${ex.name}\nStart: ${ex.startingPosition}\n${steps}\nBreathing: ${ex.breathing}\nWatch out for: ${ex.mistakes.slice(0, 2).join('; ')}.\nEasier option: ${ex.easier}`;
    }

    case 'today': {
      const day = todayDay(ctx);
      if (!day) {
        const nx = nextDay(ctx);
        const when = nx ? (de ? `in ${nx.inDays} Tag(en): ${nx.day.title}` : `in ${nx.inDays} day(s): ${nx.day.title}`) : '';
        return de
          ? `Heute ist ein geplanter Ruhetag. Erholung ist Teil des Fortschritts. Optional: die 5-Minuten-Mobilitätsroutine oder ein lockerer Spaziergang. Nächste Einheit ${when}.`
          : `Today is a planned rest day — recovery is part of progress. Optional: the 5-minute mobility routine or an easy walk. Next session ${when}.`;
      }
      const lines = day.exercises
        .map((pe) => {
          const ex = EXERCISE_BY_ID[pe.exerciseId];
          return `• ${ex?.name}: ${pe.sets} × ${fmtReps(pe.repsMin, pe.repsMax, ex?.loadType === 'timed')}`;
        })
        .join('\n');
      return de
        ? `Heute steht ${day.title} an (~${day.estMinutes} Min):\n${lines}\n\nStarte mit dem Aufwärmen und lass bei jedem Satz etwa ${day.exercises[0]?.rir ?? 2} Wiederholungen im Tank.`
        : `Today is ${day.title} (~${day.estMinutes} min):\n${lines}\n\nStart with the warm-up and leave about ${day.exercises[0]?.rir ?? 2} reps in reserve on each set.`;
    }

    case 'shorten': {
      const day = todayDay(ctx) ?? nextDay(ctx)?.day;
      if (!day) return de ? 'Heute ist kein Training geplant.' : 'There is no session planned today.';
      const core = day.exercises.slice(0, 3);
      const lines = core
        .map((pe) => `• ${EXERCISE_BY_ID[pe.exerciseId]?.name}: ${Math.max(2, pe.sets - 1)} × ${fmtReps(pe.repsMin, pe.repsMax, EXERCISE_BY_ID[pe.exerciseId]?.loadType === 'timed')}`)
        .join('\n');
      return de
        ? `Kurzversion von ${day.title} (~20–25 Min): die drei wichtigsten Übungen mit einem Satz weniger:\n${lines}\n\nEine kurze Einheit ist viel besser als keine.`
        : `Short version of ${day.title} (~20–25 min): the three most important exercises with one fewer set:\n${lines}\n\nA short session beats no session.`;
    }

    case 'decrease': {
      const recent = ctx.checkins.slice(-7);
      const avg = (k: 'sleep' | 'energy' | 'soreness') => (recent.length ? recent.reduce((a, c) => a + c[k], 0) / recent.length : null);
      const sleep = avg('sleep');
      const sore = avg('soreness');
      const energy = avg('energy');
      const reasons: string[] = [];
      if (sleep != null && sleep < 3) reasons.push(de ? 'dein Schlaf war zuletzt eher schlecht' : 'your recent sleep scores are low');
      if (sore != null && sore >= 4) reasons.push(de ? 'du meldest viel Muskelkater' : 'you have reported high soreness');
      if (energy != null && energy < 3) reasons.push(de ? 'deine Energie war niedrig' : 'your energy has been low');
      const lastWeek = ctx.sessions.filter((s) => new Date(s.finishedAt) > addDays(ctx.now ?? new Date(), -7)).length;
      if (lastWeek > (ctx.plan?.days.length ?? 3) + 1) reasons.push(de ? 'du hast mehr trainiert als geplant' : 'you trained more often than planned');
      const intro = reasons.length
        ? de
          ? `Mögliche Gründe aus deinen Daten: ${reasons.join(', ')}.`
          : `Possible reasons from your own data: ${reasons.join(', ')}.`
        : de
          ? 'Schwankungen von Einheit zu Einheit sind völlig normal.'
          : 'Session-to-session dips are completely normal.';
      return de
        ? `${intro}\nWas hilft: ausreichend Schlaf, regelmäßige Mahlzeiten, Ruhetage einhalten und das Gewicht 1–2 Einheiten halten. Wenn die Leistung über 2–3 Wochen sinkt, plane eine leichtere Woche ein.`
        : `${intro}\nWhat helps: consistent sleep, regular meals, respecting rest days, and holding the weight steady for 1–2 sessions. If performance drops for 2–3 weeks, take a lighter week.`;
    }

    case 'week': {
      if (!ctx.plan) return de ? 'Du hast noch keinen Plan.' : 'You do not have a plan yet.';
      const lines = ([0, 1, 2, 3, 4, 5, 6] as const)
        .map((wd) => {
          const d = ctx.plan!.days.find((x) => x.weekday === wd);
          return `• ${WEEKDAY_LONG[wd]}: ${d ? d.title : de ? 'Ruhe / Mobilität' : 'Rest / mobility'}`;
        })
        .join('\n');
      return de
        ? `Deine Woche (${ctx.plan.split}):\n${lines}\n\nZwischen harten Einheiten für dieselben Muskeln sollten etwa 48 Stunden liegen.`
        : `Your week (${ctx.plan.split}):\n${lines}\n\nAim for about 48 hours between hard sessions for the same muscles.`;
    }

    case 'recovery':
      return de
        ? 'Erholung zwischen Einheiten: 7–9 Stunden Schlaf (Jugendliche eher mehr), regelmäßig essen und trinken, an Ruhetagen leichte Bewegung wie Spazierengehen oder die Mobilitätsroutine. Leichter Muskelkater ist normal — Gelenkschmerzen nicht.'
        : 'Recovering between sessions: 7–9 hours of sleep (teens often need more), regular meals and fluids, and light movement on rest days such as walking or the mobility routine. Mild muscle soreness is normal — joint pain is not.';

    case 'nutrition':
      if (minor)
        return de
          ? 'Für junge Athletinnen und Athleten: regelmäßige, abwechslungsreiche Mahlzeiten mit Obst, Gemüse, Vollkorn und eiweißreichen Lebensmitteln, genug trinken. Kein Kalorienzählen und keine Diäten — dein Körper braucht Energie zum Wachsen. Bei Fragen hilft eine Kinderärztin oder ein Ernährungsprofi.'
          : "For young athletes: regular, varied meals with fruit, vegetables, whole grains and protein-rich foods, and plenty of fluids. No calorie counting or dieting — your body needs energy to grow. A doctor or registered dietitian can help with specific questions.";
      return de
        ? `Allgemeine Orientierung für ${goalLabel(ctx.profile.goal)}: eiweißreiche Lebensmittel über den Tag verteilt (viele Fachgesellschaften nennen ~1,2–2,0 g Protein pro kg Körpergewicht für Trainierende), viel Gemüse und Obst, ausreichend Kohlenhydrate rund ums Training und genug trinken. Für individuelle Pläne: Ernährungsfachkraft.`
        : `General guidance for ${goalLabel(ctx.profile.goal).toLowerCase()}: spread protein-rich foods across the day (many sports-nutrition bodies cite roughly 1.2–2.0 g of protein per kg of body weight for people who train), plenty of fruit and vegetables, enough carbohydrates around training, and good hydration. For an individual plan, see a registered dietitian.`;

    case 'motivation':
      return de
        ? `Kleine Schritte zählen, ${name}. Mach heute die Kurzversion oder nur das Aufwärmen plus eine Übung — oft kommt die Motivation beim Machen. Und wenn dein Körper Ruhe braucht, ist ein Ruhetag die richtige Entscheidung.`
        : `Small steps count, ${name}. Try the short version today, or just the warm-up plus one exercise — motivation often shows up once you start. And if your body needs rest, a rest day is the right call.`;

    default:
      return de
        ? 'Ich kann dir helfen mit: „Was soll ich heute trainieren?“, „Wie mache ich Kniebeugen?“, „Ersetze Bankdrücken“, „Mach das Training kürzer“, „Wie sieht meine Woche aus?“, „Warum bin ich schwächer geworden?“ und Fragen zur Erholung.'
        : 'I can help with: "What should I train today?", "How do I perform a squat?", "Replace bench press", "Shorten today\'s workout", "How should I structure my week?", "Why did my performance decrease?" and recovery questions.';
  }
}

/** Short daily tip for the dashboard. */
export function dailyTip(ctx: CoachContext): string {
  const now = ctx.now ?? new Date();
  const day = todayDay(ctx);
  const todayCheckin = ctx.checkins.find((c) => c.date === dayKey(now));
  if (todayCheckin?.pain) return 'You flagged pain today. Skip anything that hurts and consider asking a physiotherapist before your next hard session.';
  if (todayCheckin && todayCheckin.sleep <= 2 && day)
    return 'Short on sleep? Keep today\'s weights the same as last time and stop sets a rep earlier. Consistency beats intensity.';
  if (todayCheckin && todayCheckin.soreness >= 4 && day)
    return 'Feeling sore — extend your warm-up by a few minutes and start with lighter ramp-up sets.';
  if (day) {
    const first = EXERCISE_BY_ID[day.exercises[0]?.exerciseId];
    return first
      ? `${day.title} today. Open with ${first.name}: ${first.mistakes[0].toLowerCase()} is the most common mistake — stay mindful of it.`
      : `${day.title} today. Warm up well and own every rep.`;
  }
  return 'Rest day. Light movement and good sleep turn yesterday\'s training into tomorrow\'s progress.';
}
