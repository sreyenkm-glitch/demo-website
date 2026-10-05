import type { RatingCategory } from "@/db/schema";

export type RatingMap = Record<string, number>;
type ScoringCategory = Pick<RatingCategory, "key" | "weight" | "inverted">;

/** Normalize a 1–10 rating so higher always means better. */
export function effectiveScore(score: number, inverted: boolean) {
  return inverted ? 11 - score : score;
}

/**
 * Weighted overall score on a 1–10 scale.
 * Uses admin-configured weights; inverted metrics (e.g. Incompetence) are flipped first.
 * Metrics without a rating are skipped rather than counted as zero.
 */
export function overallScore(ratings: RatingMap, categories: ScoringCategory[]): number | null {
  let total = 0;
  let weightSum = 0;
  for (const c of categories) {
    const v = ratings[c.key];
    if (typeof v !== "number" || c.weight <= 0) continue;
    total += effectiveScore(v, c.inverted) * c.weight;
    weightSum += c.weight;
  }
  if (weightSum === 0) return null;
  return Math.round((total / weightSum) * 10) / 10;
}

export function scoreTone(score: number | null | undefined): "high" | "mid" | "low" | "none" {
  if (score == null) return "none";
  if (score >= 8) return "high";
  if (score >= 6) return "mid";
  return "low";
}

export const fmtScore = (s: number | null | undefined) => (s == null ? "—" : s.toFixed(1));
