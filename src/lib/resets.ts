import { and, asc, desc, eq, inArray, lt, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Week, WeeklyReset } from "@/db/schema";
import { newId } from "./ids";
import { overallScore } from "./scoring";
import { getRatingCategories } from "./settings";
import { type ResetPayload, submissionProblems } from "./reset-types";

export class DomainError extends Error {}

/* ───────────────────────── Weeks ───────────────────────── */

/** The current week is the most recently started week that is still open (or the latest week if all are locked). */
export async function getCurrentWeek(): Promise<Week | null> {
  const open = await db.query.weeks.findFirst({
    where: eq(schema.weeks.status, "open"),
    orderBy: [desc(schema.weeks.startDate)],
  });
  if (open) return open;
  return (await db.query.weeks.findFirst({ orderBy: [desc(schema.weeks.startDate)] })) ?? null;
}

export async function getWeek(id: string) {
  return (await db.query.weeks.findFirst({ where: eq(schema.weeks.id, id) })) ?? null;
}

export async function listWeeks() {
  return db.query.weeks.findMany({ orderBy: [desc(schema.weeks.startDate)] });
}

export async function getPreviousWeek(week: Week) {
  return (
    (await db.query.weeks.findFirst({
      where: lt(schema.weeks.startDate, week.startDate),
      orderBy: [desc(schema.weeks.startDate)],
    })) ?? null
  );
}

/* ───────────────────────── Loading ───────────────────────── */

export async function getReset(id: string) {
  return (await db.query.weeklyResets.findFirst({ where: eq(schema.weeklyResets.id, id) })) ?? null;
}

export async function getResetFor(userId: string, weekId: string) {
  return (
    (await db.query.weeklyResets.findFirst({
      where: and(eq(schema.weeklyResets.userId, userId), eq(schema.weeklyResets.weekId, weekId)),
    })) ?? null
  );
}

export async function loadResetDetail(resetId: string) {
  const reset = await getReset(resetId);
  if (!reset) return null;
  const [workItems, wins, misses, learnings, ratings, commitments, priorities, reflection, reviews, user, week] =
    await Promise.all([
      db.query.workItems.findMany({ where: eq(schema.workItems.resetId, resetId), orderBy: asc(schema.workItems.sortOrder) }),
      db.query.wins.findMany({ where: eq(schema.wins.resetId, resetId), orderBy: asc(schema.wins.sortOrder) }),
      db.query.misses.findMany({ where: eq(schema.misses.resetId, resetId), orderBy: asc(schema.misses.sortOrder) }),
      db.query.learnings.findMany({ where: eq(schema.learnings.resetId, resetId), orderBy: asc(schema.learnings.sortOrder) }),
      db.query.ratings.findMany({ where: eq(schema.ratings.resetId, resetId) }),
      db.query.commitments.findMany({ where: eq(schema.commitments.resetId, resetId), orderBy: asc(schema.commitments.sortOrder) }),
      db.query.priorities.findMany({ where: eq(schema.priorities.resetId, resetId), orderBy: asc(schema.priorities.sortOrder) }),
      db.query.reflections.findFirst({ where: eq(schema.reflections.resetId, resetId) }),
      db
        .select({
          id: schema.adminReviews.id,
          comment: schema.adminReviews.comment,
          reviewStatus: schema.adminReviews.reviewStatus,
          reviewedAt: schema.adminReviews.reviewedAt,
          reviewerName: schema.users.name,
          reviewerId: schema.adminReviews.reviewerId,
        })
        .from(schema.adminReviews)
        .innerJoin(schema.users, eq(schema.users.id, schema.adminReviews.reviewerId))
        .where(eq(schema.adminReviews.resetId, resetId))
        .orderBy(asc(schema.adminReviews.reviewedAt)),
      db.query.users.findFirst({
        where: eq(schema.users.id, reset.userId),
        columns: { id: true, name: true, email: true, department: true, title: true, avatar: true, role: true },
      }),
      getWeek(reset.weekId),
    ]);
  const streaks = await commitmentStreaks(commitments.map((c) => c.lineageId), reset.userId, reset.startDate);
  return {
    reset,
    user: user!,
    week: week!,
    workItems,
    wins,
    misses,
    learnings,
    ratings: Object.fromEntries(ratings.map((r) => [r.metric, r.score])) as Record<string, number>,
    commitments: commitments.map((c) => ({ ...c, streak: streaks[c.lineageId] ?? 0 })),
    priorities,
    reflection: reflection ?? null,
    reviews,
  };
}
export type ResetDetail = NonNullable<Awaited<ReturnType<typeof loadResetDetail>>>;

/**
 * For each lineage, how many consecutive earlier weeks (before `beforeDate`) the same promise was
 * reviewed and NOT completed. Used for "incomplete for 3 consecutive weeks" callouts.
 */
export async function commitmentStreaks(lineageIds: string[], userId: string, beforeDate: string) {
  if (lineageIds.length === 0) return {} as Record<string, number>;
  const rows = await db
    .select({ lineageId: schema.commitments.lineageId, status: schema.commitments.status, startDate: schema.weeklyResets.startDate })
    .from(schema.commitments)
    .innerJoin(schema.weeklyResets, eq(schema.weeklyResets.id, schema.commitments.resetId))
    .where(
      and(
        inArray(schema.commitments.lineageId, lineageIds),
        eq(schema.weeklyResets.userId, userId),
        lt(schema.weeklyResets.startDate, beforeDate),
      ),
    )
    .orderBy(desc(schema.weeklyResets.startDate));
  const out: Record<string, number> = {};
  const closed = new Set<string>();
  for (const r of rows) {
    if (closed.has(r.lineageId) || r.status === null) continue; // unreviewed (skipped week) neither extends nor breaks a streak
    if (r.status && r.status !== "completed") out[r.lineageId] = (out[r.lineageId] ?? 0) + 1;
    else closed.add(r.lineageId);
  }
  return out;
}

/* ───────────────────────── Carry-forward ───────────────────────── */

/** The most recent reset (before this one) that actually set priorities — the source of this week's commitments. */
async function previousResetWithPlan(reset: WeeklyReset) {
  const prev = await db
    .select({ id: schema.weeklyResets.id })
    .from(schema.weeklyResets)
    .where(
      and(
        eq(schema.weeklyResets.userId, reset.userId),
        lt(schema.weeklyResets.startDate, reset.startDate),
        ne(schema.weeklyResets.status, "not_started"),
      ),
    )
    .orderBy(desc(schema.weeklyResets.startDate))
    .limit(3);
  for (const p of prev) {
    const count = await db.$count(schema.priorities, eq(schema.priorities.resetId, p.id));
    if (count > 0) return p.id;
  }
  return null;
}

/**
 * Previous commitments → current review. Pull last week's priorities (and non-negotiable)
 * into this reset as commitments to be marked done / partly / not done.
 * Idempotent: only runs while the reset has no commitments yet.
 */
export async function hydrateCommitments(reset: WeeklyReset) {
  if (reset.status === "submitted" || reset.status === "reviewed") return 0;
  const existing = await db.$count(schema.commitments, eq(schema.commitments.resetId, reset.id));
  if (existing > 0) return 0;
  const prevId = await previousResetWithPlan(reset);
  if (!prevId) return 0;
  const [prios, refl] = await Promise.all([
    db.query.priorities.findMany({ where: eq(schema.priorities.resetId, prevId), orderBy: asc(schema.priorities.sortOrder) }),
    db.query.reflections.findFirst({ where: eq(schema.reflections.resetId, prevId) }),
  ]);
  const rows: (typeof schema.commitments.$inferInsert)[] = prios.map((p, i) => ({
    id: newId(),
    resetId: reset.id,
    title: p.title,
    expectedOutcome: p.expectedOutcome,
    kind: "priority",
    sourcePriorityId: p.id,
    lineageId: p.lineageId,
    sortOrder: i,
  }));
  if (refl?.nonNegotiable.trim()) {
    rows.push({
      id: newId(),
      resetId: reset.id,
      title: refl.nonNegotiable.trim(),
      kind: "non_negotiable",
      lineageId: `nn:${prevId}`,
      sortOrder: rows.length,
    });
  }
  if (rows.length) await db.insert(schema.commitments).values(rows);
  return rows.length;
}

/** Called when a member opens their reset: create it if needed, mark it in progress, pull commitments. */
export async function openReset(userId: string, week: Week) {
  let reset = await getResetFor(userId, week.id);
  if (!reset) {
    if (week.status === "locked") return null;
    const id = newId();
    await db.insert(schema.weeklyResets).values({
      id,
      userId,
      weekId: week.id,
      weekNumber: week.weekNumber,
      startDate: week.startDate,
      endDate: week.endDate,
    });
    reset = (await getReset(id))!;
  }
  await hydrateCommitments(reset);
  return reset;
}

/* ───────────────────────── Editing rules ───────────────────────── */

export function editState(reset: WeeklyReset, week: Week, now = new Date()) {
  const pastDeadline = now.getTime() > new Date(week.deadline).getTime();
  if (week.status === "locked") return { canEdit: false, canReopen: false, reason: "This week is locked." };
  if (reset.status === "reviewed") return { canEdit: false, canReopen: false, reason: "Already reviewed — it's in the books." };
  if (reset.status === "submitted")
    return pastDeadline
      ? { canEdit: false, canReopen: false, reason: "Submitted and past the deadline." }
      : { canEdit: false, canReopen: true, reason: "Submitted. You can still edit until the deadline." };
  return { canEdit: true, canReopen: false, reason: pastDeadline ? "Past the deadline — submit late, it still counts." : null };
}

/* ───────────────────────── Save / submit ───────────────────────── */

export async function saveReset(
  userId: string,
  resetId: string,
  payload: ResetPayload,
  opts: { submit: boolean },
): Promise<{ ok: true; overallScore: number | null; status: WeeklyReset["status"] } | { ok: false; problems: { section: string; message: string }[] }> {
  const reset = await getReset(resetId);
  if (!reset || reset.userId !== userId) throw new DomainError("That reset isn't yours.");
  const week = await getWeek(reset.weekId);
  if (!week) throw new DomainError("Week not found.");
  const state = editState(reset, week);
  if (!state.canEdit) throw new DomainError(state.reason ?? "Can't edit this reset.");

  const categories = await getRatingCategories();
  const activeKeys = new Set(categories.map((c) => c.key));
  const ratings = Object.fromEntries(Object.entries(payload.ratings).filter(([k]) => activeKeys.has(k)));

  if (opts.submit) {
    const problems = submissionProblems({ ...payload, ratings }, [...activeKeys]);
    if (problems.length) return { ok: false, problems };
  }

  // Only commitments that already belong to this reset can be updated; their lineages are the only ones a priority may continue.
  const ownCommitments = await db.query.commitments.findMany({ where: eq(schema.commitments.resetId, resetId) });
  const ownIds = new Set(ownCommitments.map((c) => c.id));
  const lineageByCommitment = new Map(ownCommitments.map((c) => [c.id, c.lineageId]));
  const allowedLineages = new Set(ownCommitments.map((c) => c.lineageId));

  const existingPriorities = await db.query.priorities.findMany({ where: eq(schema.priorities.resetId, resetId) });
  for (const p of existingPriorities) allowedLineages.add(p.lineageId);

  const score = overallScore(ratings, categories);
  const now = new Date().toISOString();
  const status = opts.submit ? "submitted" : "in_progress";
  const oneBiggest = <T extends Record<K, boolean>, K extends keyof T>(items: T[], key: K) => {
    let seen = false;
    return items.map((it) => {
      const v = it[key] && !seen;
      if (v) seen = true;
      return { ...it, [key]: v };
    });
  };

  await db.transaction(async (tx) => {
    await Promise.all([
      tx.delete(schema.workItems).where(eq(schema.workItems.resetId, resetId)),
      tx.delete(schema.wins).where(eq(schema.wins.resetId, resetId)),
      tx.delete(schema.misses).where(eq(schema.misses.resetId, resetId)),
      tx.delete(schema.learnings).where(eq(schema.learnings.resetId, resetId)),
      tx.delete(schema.ratings).where(eq(schema.ratings.resetId, resetId)),
      tx.delete(schema.priorities).where(eq(schema.priorities.resetId, resetId)),
    ]);
    if (payload.workItems.length)
      await tx.insert(schema.workItems).values(payload.workItems.map((w, i) => ({ ...w, id: newId(), resetId, sortOrder: i })));
    if (payload.wins.length)
      await tx.insert(schema.wins).values(oneBiggest(payload.wins, "isBiggestWin").map((w, i) => ({ ...w, id: newId(), resetId, sortOrder: i })));
    if (payload.misses.length)
      await tx.insert(schema.misses).values(oneBiggest(payload.misses, "isBiggestMiss").map((m, i) => ({ ...m, id: newId(), resetId, sortOrder: i })));
    if (payload.learnings.length)
      await tx.insert(schema.learnings).values(oneBiggest(payload.learnings, "isBiggest").map((l, i) => ({ ...l, id: newId(), resetId, sortOrder: i })));
    const ratingRows = Object.entries(ratings).map(([metric, s]) => ({ id: newId(), resetId, metric, score: s }));
    if (ratingRows.length) await tx.insert(schema.ratings).values(ratingRows);

    for (const c of payload.commitments) {
      if (!ownIds.has(c.id)) continue;
      await tx
        .update(schema.commitments)
        .set({ status: c.status, reason: c.reason, nextAction: c.nextAction, carriedForward: c.carriedForward })
        .where(eq(schema.commitments.id, c.id));
    }

    if (payload.priorities.length)
      await tx.insert(schema.priorities).values(
        payload.priorities.map((p, i) => {
          const fromCommitment = p.carriedFromCommitmentId && ownIds.has(p.carriedFromCommitmentId) ? p.carriedFromCommitmentId : null;
          const lineageId = fromCommitment
            ? lineageByCommitment.get(fromCommitment)!
            : p.lineageId && allowedLineages.has(p.lineageId)
              ? p.lineageId
              : newId();
          return {
            id: newId(),
            resetId,
            title: p.title,
            expectedOutcome: p.expectedOutcome,
            owner: p.owner,
            deadline: p.deadline,
            priorityLevel: p.priorityLevel,
            lineageId,
            carriedFromCommitmentId: fromCommitment,
            sortOrder: i,
          };
        }),
      );

    const refl = { ...payload.reflection, customAnswers: JSON.stringify(payload.reflection.customAnswers ?? {}) };
    await tx
      .insert(schema.reflections)
      .values({ id: newId(), resetId, ...refl })
      .onConflictDoUpdate({ target: schema.reflections.resetId, set: refl });

    await tx
      .update(schema.weeklyResets)
      .set({
        status,
        sectionsDone: JSON.stringify(payload.sectionsDone),
        overallScore: score,
        updatedAt: now,
        startedAt: reset.startedAt ?? now,
        submittedAt: opts.submit ? now : reset.submittedAt,
      })
      .where(eq(schema.weeklyResets.id, resetId));
  });

  return { ok: true, overallScore: score, status };
}

/** Pull a submitted reset back into draft (before deadline, not reviewed, week open). */
export async function reopenReset(userId: string, resetId: string) {
  const reset = await getReset(resetId);
  if (!reset || reset.userId !== userId) throw new DomainError("That reset isn't yours.");
  const week = await getWeek(reset.weekId);
  if (!week || !editState(reset, week).canReopen) throw new DomainError("This reset can't be reopened.");
  await db.update(schema.weeklyResets).set({ status: "in_progress", updatedAt: new Date().toISOString() }).where(eq(schema.weeklyResets.id, resetId));
}

/** Recompute stored overall scores after an admin changes rating weights. */
export async function recalculateAllScores() {
  const categories = await getRatingCategories();
  const all = await db.select({ resetId: schema.ratings.resetId, metric: schema.ratings.metric, score: schema.ratings.score }).from(schema.ratings);
  const byReset = new Map<string, Record<string, number>>();
  for (const r of all) {
    const m = byReset.get(r.resetId) ?? {};
    m[r.metric] = r.score;
    byReset.set(r.resetId, m);
  }
  for (const [resetId, ratings] of byReset) {
    await db.update(schema.weeklyResets).set({ overallScore: overallScore(ratings, categories) }).where(eq(schema.weeklyResets.id, resetId));
  }
  return byReset.size;
}
