/**
 * Type aliases + the tag glossary, shared between server and client.
 * (Real data now lives in SQLite — see db/seed.ts)
 */

export type ScoreStatus = "Pass" | "Warn" | "Fail" | "—";
export type EvalStatus = "Evaluated" | "Not Evaluated" | "Disputed";
export type IssueTag = "NC" | "WG" | "ID" | "WP" | "NI" | "IM" | "CI";

export const TAG_GLOSSARY: Record<IssueTag, string> = {
  NC: "Not Cooked",
  WG: "Wrong Garnish",
  ID: "Incorrect Dish",
  WP: "Wrong Portion",
  NI: "Not Identified",
  IM: "Incorrect Mix",
  CI: "Cleanliness Issue",
};

export type OrderRow = {
  id: string;
  time: string;
  restaurant: string;
  dish: string;
  score: ScoreStatus;
  status: EvalStatus;
  manager: string;
};

export type EvaluationRow = {
  id: string;
  time: string;
  dish: string;
  score: number;
  tags: string[];
  manager: string;
};
