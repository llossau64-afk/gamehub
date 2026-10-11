import { detectIntent, detectLang, findExerciseInText, offlineCoachReply } from '../src/domain/coach';
import { generatePlan } from '../src/domain/plan/generator';
import { makeProfile } from './helpers/fixtures';

const profile = makeProfile();
const plan = generatePlan(profile).plan;
const ctx = { profile, plan, sessions: [], checkins: [], now: new Date(2026, 9, 12, 10) }; // Monday

describe('offline coach', () => {
  it('detects German and English', () => {
    expect(detectLang('Was soll ich heute trainieren?', 'auto')).toBe('de');
    expect(detectLang('What should I train today?', 'auto')).toBe('en');
    expect(detectLang('What should I train today?', 'de')).toBe('de');
  });

  it('routes the key questions to the right intent', () => {
    expect(detectIntent('What should I train today?')).toBe('today');
    expect(detectIntent('How do I perform a Romanian deadlift?')).toBe('technique');
    expect(detectIntent('Can you replace bench press?')).toBe('replace');
    expect(detectIntent('Why did my performance decrease?')).toBe('decrease');
    expect(detectIntent('How should I structure my week?')).toBe('week');
    expect(detectIntent("Can you shorten today's workout?")).toBe('shorten');
    expect(detectIntent('How should I recover between sessions?')).toBe('recovery');
    expect(detectIntent('My knee hurts')).toBe('pain');
  });

  it('answers from the real plan', () => {
    const r = offlineCoachReply('What should I train today?', ctx);
    expect(r).toContain(plan.days[0].title);
  });

  it('finds exercises by name and common German terms', () => {
    expect(findExerciseInText('how do i do a romanian deadlift')?.id).toBe('romanian-deadlift');
    expect(findExerciseInText('Wie mache ich Kreuzheben?')?.id).toBe('deadlift');
  });

  it('refers pain to professionals and never diagnoses', () => {
    const r = offlineCoachReply('I have sharp pain in my shoulder', ctx);
    expect(r).toMatch(/doctor|physiotherapist/i);
    expect(r).not.toMatch(/you have (a|an) /i);
  });

  it('gives no calorie or diet targets to minors', () => {
    const teen = { ...ctx, profile: makeProfile({ ageRange: '13-15' }) };
    const r = offlineCoachReply('How much protein should I eat to lose weight?', teen);
    expect(r).toMatch(/no calorie counting/i);
  });
});
