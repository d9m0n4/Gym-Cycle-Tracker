export type Joint = "knees" | "elbows";
export type SplitId =
  "synergists" | "fullbody" | "pushpulllegs" | "antagonists";
export type SetEntry = { weight: string; reps: string; rir: string };
export type Exercise = {
  id: string;
  name: string;
  sets: number;
  min: number;
  max: number;
  rest: string;
  joints: Joint[];
  alternatives: string[];
};
export type Day = {
  id: string;
  title: string;
  subtitle: string;
  exercises: Exercise[];
};
export type SessionLog = {
  date: string;
  dayId: string;
  splitId: SplitId;
  week: number;
  entries: Record<string, SetEntry[]>;
  names?: Record<string, string>;
};
export type History = Record<string, SessionLog[]>;
