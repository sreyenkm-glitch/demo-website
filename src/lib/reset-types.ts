import { z } from "zod";

const short = (max = 200) => z.string().trim().max(max);
const long = (max = 2000) => z.string().trim().max(max);

export const workItemSchema = z.object({
  title: short().min(1, "Give it a name"),
  description: long().default(""),
  status: z.enum(["completed", "in_progress", "blocked", "dropped"]),
  impact: long(500).default(""),
  link: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https?:\/\//i.test(v), "Links need http(s)://")
    .default(""),
});

export const winSchema = z.object({
  title: short().min(1, "What happened?"),
  description: long().default(""),
  impact: short().default(""),
  isBiggestWin: z.boolean().default(false),
});

export const missSchema = z.object({
  title: short().min(1, "What went wrong?"),
  description: long().default(""),
  reason: long().default(""),
  controllability: z.enum(["yes", "partially", "no"]),
  correction: long().default(""),
  isBiggestMiss: z.boolean().default(false),
});

export const learningSchema = z.object({
  category: z.string().trim().max(40),
  content: long(1000).min(1, "What did you learn?"),
  isBiggest: z.boolean().default(false),
});

export const commitmentUpdateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["completed", "partial", "not_completed"]).nullable(),
  reason: long(1000).default(""),
  nextAction: long(1000).default(""),
  carriedForward: z.boolean().default(false),
});

export const prioritySchema = z.object({
  title: short().min(1, "Name the priority"),
  expectedOutcome: long(500).default(""),
  owner: short(100).default(""),
  deadline: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Pick a date")
    .default(""),
  priorityLevel: z.enum(["p0", "p1", "p2"]),
  lineageId: z.string().max(64).optional().nullable(),
  carriedFromCommitmentId: z.string().max(64).optional().nullable(),
});

export const reflectionSchema = z.object({
  stop: long(500).default(""),
  start: long(500).default(""),
  continue: long(500).default(""),
  nonNegotiable: long(300).default(""),
  resetReflection: long(1500).default(""),
  doDifferently: long(1500).default(""),
  customAnswers: z.record(z.string(), long(2000)).default({}),
});

export const resetPayloadSchema = z.object({
  workItems: z.array(workItemSchema).max(30),
  wins: z.array(winSchema).max(20),
  misses: z.array(missSchema).max(20),
  learnings: z.array(learningSchema).max(20),
  ratings: z.record(z.string(), z.number().int().min(1).max(10)),
  commitments: z.array(commitmentUpdateSchema).max(30),
  priorities: z.array(prioritySchema).max(3, "Top 3 means three."),
  reflection: reflectionSchema,
  sectionsDone: z.array(z.string()).max(10),
});

export type ResetPayload = z.infer<typeof resetPayloadSchema>;
export type WorkItemInput = z.infer<typeof workItemSchema>;
export type WinInput = z.infer<typeof winSchema>;
export type MissInput = z.infer<typeof missSchema>;
export type LearningInput = z.infer<typeof learningSchema>;
export type PriorityInput = z.infer<typeof prioritySchema>;

export const WORK_STATUS = {
  completed: { label: "Completed", emoji: "✅" },
  in_progress: { label: "In progress", emoji: "🔄" },
  blocked: { label: "Blocked", emoji: "🧱" },
  dropped: { label: "Dropped", emoji: "🗑️" },
} as const;

export const COMMITMENT_STATUS = {
  completed: { label: "Done", tone: "good" },
  partial: { label: "Partly", tone: "mid" },
  not_completed: { label: "Didn't happen", tone: "bad" },
} as const;

export const CONTROLLABILITY = {
  yes: "Yes, on me",
  partially: "Partially",
  no: "Out of my hands",
} as const;

export const PRIORITY_LEVELS = {
  p0: "P0 · Must",
  p1: "P1 · Should",
  p2: "P2 · Could",
} as const;

export const RESET_STATUS = {
  not_started: { label: "Not started", tone: "idle" },
  in_progress: { label: "In progress", tone: "mid" },
  submitted: { label: "Submitted", tone: "good" },
  reviewed: { label: "Reviewed", tone: "accent" },
} as const;

/** Problems that block submission (soft-saves are always allowed). */
export function submissionProblems(p: ResetPayload, ratingKeys: string[]): { section: string; message: string }[] {
  const out: { section: string; message: string }[] = [];
  if (p.workItems.length === 0) out.push({ section: "week", message: "Add at least one thing you worked on." });
  if (p.wins.length === 0) out.push({ section: "wins", message: "Every week has a win. Find one." });
  const missing = ratingKeys.filter((k) => typeof p.ratings[k] !== "number");
  if (missing.length) out.push({ section: "rate", message: `Rate ${missing.length} more metric${missing.length > 1 ? "s" : ""}.` });
  const unreviewed = p.commitments.filter((c) => !c.status);
  if (unreviewed.length) out.push({ section: "own", message: `Mark ${unreviewed.length} commitment${unreviewed.length > 1 ? "s" : ""} from last week.` });
  if (p.priorities.length === 0) out.push({ section: "reset", message: "Set at least one priority for next week." });
  if (!p.reflection.nonNegotiable.trim()) out.push({ section: "reset", message: "Name your one non-negotiable." });
  return out;
}
