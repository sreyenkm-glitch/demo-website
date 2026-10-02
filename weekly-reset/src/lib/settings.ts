import { asc, eq } from "drizzle-orm";
import { cache } from "react";
import { db, schema } from "@/db";
import type { RatingCategory } from "@/db/schema";

export type SectionKey = "week" | "wins" | "misses" | "learned" | "rate" | "own" | "reset";

export const SECTION_ORDER: SectionKey[] = ["week", "wins", "misses", "learned", "rate", "own", "reset"];

export type CustomQuestion = { id: string; section: SectionKey; prompt: string };

export type QuestionSet = {
  prompts: Record<SectionKey, string>;
  custom: CustomQuestion[];
};

export type AppSettings = {
  brand: { name: string; tagline: string; shortName: string };
  schedule: {
    weekStartDay: number; // 0 = Sunday … 6 = Saturday
    deadlineOffsetDays: number; // days after week start
    deadlineTime: string; // HH:mm in schedule.timezone
    timezone: string;
  };
  theme: { accent: AccentKey; mode: "dark" | "light" | "system" };
  departments: string[];
  questions: QuestionSet;
};

export const ACCENTS = {
  lime: { label: "Volt", value: "#c8ff2e", ink: "#0b0b0c" },
  coral: { label: "Coral", value: "#ff6b4a", ink: "#0b0b0c" },
  violet: { label: "Ultra", value: "#9b7bff", ink: "#0b0b0c" },
  cyan: { label: "Ice", value: "#3de0ff", ink: "#0b0b0c" },
  pink: { label: "Bubble", value: "#ff5fc8", ink: "#0b0b0c" },
} as const;
export type AccentKey = keyof typeof ACCENTS;

export const DEFAULT_QUESTIONS: QuestionSet = {
  prompts: {
    week: "What did you actually work on this week?",
    wins: "What went well this week?",
    misses: "What didn't go as planned? Be honest.",
    learned: "What did this week teach you?",
    rate: "How did this week actually feel?",
    own: "What did you commit to last week?",
    reset: "If you could reset this week and do it again, what would you change?",
  },
  custom: [],
};

export const DEFAULT_SETTINGS: AppSettings = {
  brand: { name: "OBSA Weekly Reset", tagline: "Obsessed with resetting every week.", shortName: "OBSA" },
  schedule: { weekStartDay: 1, deadlineOffsetDays: 6, deadlineTime: "21:00", timezone: "UTC" },
  theme: { accent: "lime", mode: "dark" },
  departments: ["Leadership", "Growth", "Product", "Engineering", "Design", "Content", "Ops"],
  questions: DEFAULT_QUESTIONS,
};

export const LEARNING_CATEGORIES = [
  { key: "process", label: "Process" },
  { key: "customer", label: "Customer" },
  { key: "team", label: "Team" },
  { key: "execution", label: "Personal execution" },
  { key: "product", label: "Product" },
] as const;

export const DEFAULT_RATING_CATEGORIES: Omit<RatingCategory, "active">[] = [
  { key: "work", label: "Work", description: "Quality and volume of what you shipped.", weight: 1.5, inverted: false, lowLabel: "Barely moved", highLabel: "Shipped hard", sortOrder: 1 },
  { key: "vibe", label: "Vibe", description: "Your energy and how you showed up for the team.", weight: 0.75, inverted: false, lowLabel: "Off", highLabel: "Electric", sortOrder: 2 },
  { key: "efficiency", label: "Efficiency", description: "Did your time go to the things that mattered?", weight: 1, inverted: false, lowLabel: "Scattered", highLabel: "Laser", sortOrder: 3 },
  { key: "morale", label: "Morale", description: "How you actually feel about work right now.", weight: 0.75, inverted: false, lowLabel: "Drained", highLabel: "Fired up", sortOrder: 4 },
  { key: "ownership", label: "Ownership", description: "Did you own outcomes, not just tasks?", weight: 1.25, inverted: false, lowLabel: "Passenger", highLabel: "Driver", sortOrder: 5 },
  { key: "communication", label: "Communication", description: "Did people know what you were doing and why?", weight: 1, inverted: false, lowLabel: "Dark", highLabel: "Crystal", sortOrder: 6 },
  { key: "execution", label: "Execution", description: "Turning plans into done.", weight: 1.25, inverted: false, lowLabel: "Stalled", highLabel: "Unstoppable", sortOrder: 7 },
  { key: "incompetence", label: "Incompetence", description: "Where did you feel you lacked knowledge, execution ability, preparation, or clarity this week? Higher = you felt more out of depth. Honest > flattering.", weight: 0.5, inverted: true, lowLabel: "Felt sharp", highLabel: "Out of depth", sortOrder: 8 },
];

async function readKey<T>(key: string, fallback: T): Promise<T> {
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, key) });
  if (!row) return fallback;
  try {
    const parsed = JSON.parse(row.value);
    if (fallback && typeof fallback === "object" && !Array.isArray(fallback)) return { ...fallback, ...parsed };
    return parsed as T;
  } catch {
    return fallback;
  }
}

export const getSettings = cache(async (): Promise<AppSettings> => {
  const [brand, schedule, theme, departments, questions] = await Promise.all([
    readKey("brand", DEFAULT_SETTINGS.brand),
    readKey("schedule", DEFAULT_SETTINGS.schedule),
    readKey("theme", DEFAULT_SETTINGS.theme),
    readKey("departments", DEFAULT_SETTINGS.departments),
    readKey("questions", DEFAULT_SETTINGS.questions),
  ]);
  return {
    brand,
    schedule,
    theme,
    departments,
    questions: { prompts: { ...DEFAULT_QUESTIONS.prompts, ...questions.prompts }, custom: questions.custom ?? [] },
  };
});

export async function writeSetting(key: keyof AppSettings, value: unknown) {
  const json = JSON.stringify(value);
  await db
    .insert(schema.settings)
    .values({ key, value: json })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: json } });
}

export const getRatingCategories = cache(async (includeInactive = false) => {
  const rows = await db.query.ratingCategories.findMany({ orderBy: asc(schema.ratingCategories.sortOrder) });
  return includeInactive ? rows : rows.filter((r) => r.active);
});
