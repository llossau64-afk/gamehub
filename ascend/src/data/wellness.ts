/** Educational wellness content. General information only — not medical or dietetic advice. */

export interface WellnessTopic {
  id: string;
  title: string;
  icon: 'nutrition' | 'water' | 'moon' | 'bed' | 'leaf' | 'time' | 'fish';
  points: string[];
  adultOnly?: boolean;
  youthOnly?: boolean;
}

export const WELLNESS: WellnessTopic[] = [
  {
    id: 'balanced',
    title: 'Balanced eating',
    icon: 'nutrition',
    points: [
      'Build most meals around vegetables or fruit, a protein source, a carbohydrate source and some healthy fats.',
      'Regular meals help keep energy stable for training and daily life.',
      'Food is fuel and enjoyment — it never has to be "earned" through exercise.',
      'No single food or meal makes or breaks your progress. Consistency over weeks is what matters.',
    ],
  },
  {
    id: 'protein',
    title: 'Protein basics',
    icon: 'fish',
    points: [
      'Protein supports muscle repair and growth. Good sources include eggs, dairy, fish, poultry, meat, tofu, tempeh, legumes and lentils.',
      'Spreading protein across 3–5 meals is a practical approach.',
      'Many sports-nutrition organisations cite roughly 1.2–2.0 g of protein per kg of body weight per day for people who train regularly.',
      'Supplements are optional; food can cover your needs.',
    ],
  },
  {
    id: 'hydration',
    title: 'Hydration',
    icon: 'water',
    points: [
      'Drink regularly through the day; pale-yellow urine is a simple sign of good hydration.',
      'Have water during and after training, more in hot conditions.',
      'Thirst, headaches and unusual fatigue can be signs you need more fluids.',
    ],
  },
  {
    id: 'sleep',
    title: 'Sleep',
    icon: 'bed',
    points: [
      'Most adults do best with 7–9 hours; teenagers often need 8–10 hours.',
      'A consistent bedtime and wake time help more than occasional long sleeps.',
      'Dim screens and avoid heavy caffeine late in the day.',
      'Poor sleep? Keep training lighter — it is a smart adjustment, not a failure.',
    ],
  },
  {
    id: 'rest',
    title: 'Rest days & recovery',
    icon: 'moon',
    points: [
      'Muscles get stronger between sessions, not during them. Rest days are part of the plan.',
      'Light walking, easy cycling or the mobility routine can help you feel fresher.',
      'Mild soreness is normal. Sharp, joint or lasting pain is a reason to stop and seek professional advice.',
      'Every 6–8 weeks, an easier week helps your body consolidate progress.',
    ],
  },
  {
    id: 'habits',
    title: 'Consistent habits',
    icon: 'time',
    points: [
      'Plan meals around your training times where you can — a snack 1–3 hours before training helps many people.',
      'Small, repeatable habits beat strict rules you cannot keep.',
      'Missed a day? Simply continue with the next one. There is nothing to make up.',
    ],
  },
  {
    id: 'adult-goals',
    title: 'Body-weight goals (adults)',
    icon: 'leaf',
    adultOnly: true,
    points: [
      'Gradual weight gain: a small, consistent increase in food intake combined with strength training supports muscle gain.',
      'Weight management: modest, sustainable changes work better than crash diets or cutting whole food groups.',
      'Aim for slow trends over weeks; daily scale changes are mostly water.',
      'For a personal nutrition plan, consult a registered dietitian — especially with any medical condition.',
    ],
  },
  {
    id: 'youth',
    title: 'For young athletes',
    icon: 'leaf',
    youthOnly: true,
    points: [
      'Your body needs plenty of energy to grow and train — eat regular, varied meals and snacks.',
      'No calorie counting, diets or skipping meals. Training is about getting stronger, healthier and enjoying sport.',
      'Talk to a parent, doctor or sports dietitian if you have questions about food.',
    ],
  },
];
