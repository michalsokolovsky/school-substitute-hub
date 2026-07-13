// Scoring engine for ranking substitute candidates.
// Each criterion is a function returning a score contribution.
// Add more criteria by appending to the CRITERIA array.

export interface CandidateSlot {
  teacher_id: string;
  full_name: string;
  phone: string | null;
  type: "regular" | "external";
  subject: string | null;
  class_name: string | null;
  grade_level: string | null;
  ability_group: string | null;
  lesson_number: number;
  // Number of substitute assignments this teacher already has in the last N days
  recent_assignments: number;
  // How many consecutive slots (including this one) this candidate can cover in the missed range
  consecutive_coverage: number;
}

export interface MissedLesson {
  lesson_number: number;
  subject: string | null;
  class_name: string | null;
  grade_level: string | null;
  ability_group: string | null;
}

export interface Criterion {
  name: string;
  weight: number;
  score: (candidate: CandidateSlot, missed: MissedLesson) => number; // 0..1
}

const isMathOrEnglish = (subject: string | null) =>
  !!subject && ["אנגלית", "מתמטיקה", "english", "math"].includes(subject.trim().toLowerCase());

export const CRITERIA: Criterion[] = [
  {
    name: "same_subject",
    weight: 40,
    score: (c, m) =>
      m.subject && c.subject && c.subject.trim().toLowerCase() === m.subject.trim().toLowerCase() ? 1 : 0,
  },
  {
    name: "same_ability_group",
    weight: 25,
    score: (c, m) => {
      if (!isMathOrEnglish(m.subject)) return 0;
      return m.ability_group && c.ability_group && c.ability_group === m.ability_group ? 1 : 0;
    },
  },
  {
    name: "consecutive_coverage",
    weight: 15,
    score: (c) => Math.min(c.consecutive_coverage / 3, 1),
  },
  {
    name: "same_grade",
    weight: 10,
    score: (c, m) => (m.grade_level && c.grade_level && c.grade_level === m.grade_level ? 1 : 0),
  },
  {
    name: "load_balance",
    weight: 10,
    // fewer recent assignments = higher score. Cap at 5.
    score: (c) => 1 - Math.min(c.recent_assignments, 5) / 5,
  },
];

export function scoreCandidate(candidate: CandidateSlot, missed: MissedLesson) {
  const breakdown = CRITERIA.map((cr) => ({
    name: cr.name,
    contribution: cr.score(candidate, missed) * cr.weight,
  }));
  const total = breakdown.reduce((sum, b) => sum + b.contribution, 0);
  return { total, breakdown };
}