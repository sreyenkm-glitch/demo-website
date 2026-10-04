import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const id = () => text("id").primaryKey();
const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);

export const users = sqliteTable(
  "users",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
    title: text("title"),
    department: text("department"),
    avatar: text("avatar"), // emoji or color seed
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: id(), // sha256 of the cookie token
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** Key/value app settings (brand, deadline defaults, theme, departments, questions). JSON values. */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const ratingCategories = sqliteTable("rating_categories", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  description: text("description").notNull().default(""),
  weight: real("weight").notNull().default(1),
  /** Inverted metrics count "higher = worse" (e.g. Incompetence) and are flipped for scoring. */
  inverted: integer("inverted", { mode: "boolean" }).notNull().default(false),
  lowLabel: text("low_label").notNull().default("Rough"),
  highLabel: text("high_label").notNull().default("Elite"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const weeks = sqliteTable(
  "weeks",
  {
    id: id(),
    weekNumber: integer("week_number").notNull(),
    year: integer("year").notNull(),
    startDate: text("start_date").notNull(), // YYYY-MM-DD
    endDate: text("end_date").notNull(),
    deadline: text("deadline").notNull(), // ISO datetime
    status: text("status", { enum: ["open", "locked"] }).notNull().default("open"),
    /** Snapshot of prompts/custom questions at week creation. */
    questions: text("questions").notNull().default("{}"),
    lockedAt: text("locked_at"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("weeks_year_number_uq").on(t.year, t.weekNumber)],
);

export const weeklyResets = sqliteTable(
  "weekly_resets",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weekId: text("week_id")
      .notNull()
      .references(() => weeks.id, { onDelete: "cascade" }),
    weekNumber: integer("week_number").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    status: text("status", { enum: ["not_started", "in_progress", "submitted", "reviewed"] })
      .notNull()
      .default("not_started"),
    /** Which wizard sections the user has touched/completed (JSON string[]). */
    sectionsDone: text("sections_done").notNull().default("[]"),
    startedAt: text("started_at"),
    submittedAt: text("submitted_at"),
    reviewedAt: text("reviewed_at"),
    overallScore: real("overall_score"),
    updatedAt: text("updated_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("resets_user_week_uq").on(t.userId, t.weekId),
    index("resets_week_idx").on(t.weekId),
  ],
);

const resetFk = () =>
  text("reset_id")
    .notNull()
    .references(() => weeklyResets.id, { onDelete: "cascade" });

export const workItems = sqliteTable(
  "work_items",
  {
    id: id(),
    resetId: resetFk(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status", { enum: ["completed", "in_progress", "blocked", "dropped"] })
      .notNull()
      .default("completed"),
    impact: text("impact").notNull().default(""),
    link: text("link").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("work_items_reset_idx").on(t.resetId)],
);

export const wins = sqliteTable(
  "wins",
  {
    id: id(),
    resetId: resetFk(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    impact: text("impact").notNull().default(""),
    isBiggestWin: integer("is_biggest_win", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("wins_reset_idx").on(t.resetId)],
);

export const misses = sqliteTable(
  "misses",
  {
    id: id(),
    resetId: resetFk(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    reason: text("reason").notNull().default(""),
    controllability: text("controllability", { enum: ["yes", "partially", "no"] })
      .notNull()
      .default("partially"),
    correction: text("correction").notNull().default(""),
    isBiggestMiss: integer("is_biggest_miss", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("misses_reset_idx").on(t.resetId)],
);

export const learnings = sqliteTable(
  "learnings",
  {
    id: id(),
    resetId: resetFk(),
    category: text("category").notNull().default("execution"),
    content: text("content").notNull(),
    isBiggest: integer("is_biggest", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("learnings_reset_idx").on(t.resetId)],
);

export const ratings = sqliteTable(
  "ratings",
  {
    id: id(),
    resetId: resetFk(),
    metric: text("metric").notNull(),
    score: integer("score").notNull(),
  },
  (t) => [uniqueIndex("ratings_reset_metric_uq").on(t.resetId, t.metric)],
);

/**
 * A commitment is last week's promise, reviewed this week.
 * `lineageId` follows the same promise across weeks so we can spot items carried forward repeatedly.
 */
export const commitments = sqliteTable(
  "commitments",
  {
    id: id(),
    resetId: resetFk(),
    title: text("title").notNull(),
    expectedOutcome: text("expected_outcome").notNull().default(""),
    kind: text("kind", { enum: ["priority", "non_negotiable"] }).notNull().default("priority"),
    sourcePriorityId: text("source_priority_id"),
    lineageId: text("lineage_id").notNull(),
    status: text("status", { enum: ["completed", "partial", "not_completed"] }),
    reason: text("reason").notNull().default(""),
    nextAction: text("next_action").notNull().default(""),
    carriedForward: integer("carried_forward", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("commitments_reset_idx").on(t.resetId), index("commitments_lineage_idx").on(t.lineageId)],
);

export const priorities = sqliteTable(
  "priorities",
  {
    id: id(),
    resetId: resetFk(),
    title: text("title").notNull(),
    expectedOutcome: text("expected_outcome").notNull().default(""),
    owner: text("owner").notNull().default(""),
    deadline: text("deadline").notNull().default(""),
    priorityLevel: text("priority_level", { enum: ["p0", "p1", "p2"] }).notNull().default("p1"),
    lineageId: text("lineage_id").notNull(),
    carriedFromCommitmentId: text("carried_from_commitment_id"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("priorities_reset_idx").on(t.resetId)],
);

export const reflections = sqliteTable("reflections", {
  id: id(),
  resetId: resetFk().unique(),
  stop: text("stop").notNull().default(""),
  start: text("start").notNull().default(""),
  continue: text("continue").notNull().default(""),
  nonNegotiable: text("non_negotiable").notNull().default(""),
  resetReflection: text("reset_reflection").notNull().default(""),
  doDifferently: text("do_differently").notNull().default(""),
  /** Answers to admin-defined custom questions: JSON { [questionId]: answer } */
  customAnswers: text("custom_answers").notNull().default("{}"),
});

export const adminReviews = sqliteTable(
  "admin_reviews",
  {
    id: id(),
    resetId: resetFk(),
    reviewerId: text("reviewer_id")
      .notNull()
      .references(() => users.id),
    comment: text("comment").notNull().default(""),
    reviewStatus: text("review_status", { enum: ["comment", "reviewed", "needs_attention", "kudos"] })
      .notNull()
      .default("comment"),
    reviewedAt: createdAt(),
  },
  (t) => [index("admin_reviews_reset_idx").on(t.resetId)],
);

/** In-app notifications. Reminder channels (email/push) can fan out from the same records later. */
export const notifications = sqliteTable(
  "notifications",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["reminder", "review", "week_started", "nudge"] }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    href: text("href"),
    channel: text("channel").notNull().default("in_app"),
    readAt: text("read_at"),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId)],
);

export type User = typeof users.$inferSelect;
export type Week = typeof weeks.$inferSelect;
export type WeeklyReset = typeof weeklyResets.$inferSelect;
export type RatingCategory = typeof ratingCategories.$inferSelect;
export type ResetStatus = WeeklyReset["status"];
