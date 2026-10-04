import { and, asc, desc, eq, inArray, isNotNull, like, or } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Week } from "@/db/schema";
import { commitmentStreaks } from "./resets";
import { extractThemes } from "./themes";

const DONE = ["submitted", "reviewed"] as const;
export const isDone = (s: string) => s === "submitted" || s === "reviewed";

/* ───────────────────────── Team / week overview ───────────────────────── */

export async function weekRoster(weekId: string) {
  const rows = await db
    .select({
      resetId: schema.weeklyResets.id,
      status: schema.weeklyResets.status,
      overallScore: schema.weeklyResets.overallScore,
      submittedAt: schema.weeklyResets.submittedAt,
      reviewedAt: schema.weeklyResets.reviewedAt,
      sectionsDone: schema.weeklyResets.sectionsDone,
      userId: schema.users.id,
      name: schema.users.name,
      avatar: schema.users.avatar,
      department: schema.users.department,
      title: schema.users.title,
      role: schema.users.role,
    })
    .from(schema.weeklyResets)
    .innerJoin(schema.users, eq(schema.users.id, schema.weeklyResets.userId))
    .where(eq(schema.weeklyResets.weekId, weekId))
    .orderBy(asc(schema.users.name));
  const ids = rows.map((r) => r.resetId);
  if (!ids.length) return [];
  const [ratings, wins, misses, reviews] = await Promise.all([
    db.select().from(schema.ratings).where(inArray(schema.ratings.resetId, ids)),
    db.select({ resetId: schema.wins.resetId, title: schema.wins.title, big: schema.wins.isBiggestWin }).from(schema.wins).where(inArray(schema.wins.resetId, ids)).orderBy(asc(schema.wins.sortOrder)),
    db.select({ resetId: schema.misses.resetId, title: schema.misses.title, big: schema.misses.isBiggestMiss }).from(schema.misses).where(inArray(schema.misses.resetId, ids)).orderBy(asc(schema.misses.sortOrder)),
    db.select({ resetId: schema.adminReviews.resetId, status: schema.adminReviews.reviewStatus, at: schema.adminReviews.reviewedAt }).from(schema.adminReviews).where(inArray(schema.adminReviews.resetId, ids)).orderBy(asc(schema.adminReviews.reviewedAt)),
  ]);
  const ratingMap = new Map<string, Record<string, number>>();
  for (const r of ratings) ratingMap.set(r.resetId, { ...(ratingMap.get(r.resetId) ?? {}), [r.metric]: r.score });
  const firstOf = (list: { resetId: string; title: string; big: boolean }[], id: string) => {
    const mine = list.filter((x) => x.resetId === id);
    return (mine.find((x) => x.big) ?? mine[0])?.title ?? null;
  };
  const lastReview = new Map<string, string>();
  for (const r of reviews) if (r.status !== "comment") lastReview.set(r.resetId, r.status);
  return rows.map((r) => ({
    ...r,
    ratings: ratingMap.get(r.resetId) ?? {},
    biggestWin: firstOf(wins, r.resetId),
    biggestMiss: firstOf(misses, r.resetId),
    reviewFlag: (lastReview.get(r.resetId) ?? null) as "reviewed" | "needs_attention" | "kudos" | null,
    sectionsDone: JSON.parse(r.sectionsDone) as string[],
  }));
}
export type RosterRow = Awaited<ReturnType<typeof weekRoster>>[number];

export function rosterStats(roster: RosterRow[]) {
  const total = roster.length;
  const done = roster.filter((r) => isDone(r.status)).length;
  const doneScores = roster.filter((r) => isDone(r.status) && r.overallScore != null).map((r) => r.overallScore!);
  const avg = doneScores.length ? doneScores.reduce((a, b) => a + b, 0) / doneScores.length : null;
  return {
    total,
    done,
    pending: total - done,
    inProgress: roster.filter((r) => r.status === "in_progress").length,
    notStarted: roster.filter((r) => r.status === "not_started").length,
    needsReview: roster.filter((r) => r.status === "submitted").length,
    rate: total ? done / total : 0,
    avgScore: avg == null ? null : Math.round(avg * 10) / 10,
  };
}

/* ───────────────────────── Trends ───────────────────────── */

/** Per-week team averages for each metric + completion rate, oldest → newest. */
export async function teamTrend(limit = 8) {
  const weeks = (await db.query.weeks.findMany({ orderBy: desc(schema.weeks.startDate), limit })).reverse();
  if (!weeks.length) return [];
  const resets = await db
    .select({ id: schema.weeklyResets.id, weekId: schema.weeklyResets.weekId, status: schema.weeklyResets.status, score: schema.weeklyResets.overallScore })
    .from(schema.weeklyResets)
    .where(inArray(schema.weeklyResets.weekId, weeks.map((w) => w.id)));
  const doneIds = resets.filter((r) => isDone(r.status)).map((r) => r.id);
  const ratings = doneIds.length ? await db.select().from(schema.ratings).where(inArray(schema.ratings.resetId, doneIds)) : [];
  const weekOfReset = new Map(resets.map((r) => [r.id, r.weekId]));
  return weeks.map((w) => {
    const rs = resets.filter((r) => r.weekId === w.id);
    const done = rs.filter((r) => isDone(r.status));
    const scores = done.map((r) => r.score).filter((s): s is number => s != null);
    const metrics: Record<string, number> = {};
    const sums: Record<string, [number, number]> = {};
    for (const r of ratings) {
      if (weekOfReset.get(r.resetId) !== w.id) continue;
      const s = (sums[r.metric] ??= [0, 0]);
      s[0] += r.score;
      s[1]++;
    }
    for (const [k, [t, n]] of Object.entries(sums)) metrics[k] = Math.round((t / n) * 10) / 10;
    return {
      weekId: w.id,
      weekNumber: w.weekNumber,
      startDate: w.startDate,
      endDate: w.endDate,
      status: w.status,
      total: rs.length,
      done: done.length,
      rate: rs.length ? done.length / rs.length : 0,
      avgScore: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null,
      metrics,
    };
  });
}
export type TrendPoint = Awaited<ReturnType<typeof teamTrend>>[number];

/* ───────────────────────── Personal history ───────────────────────── */

export async function userHistory(userId: string) {
  const resets = await db
    .select({
      id: schema.weeklyResets.id,
      weekId: schema.weeklyResets.weekId,
      weekNumber: schema.weeklyResets.weekNumber,
      startDate: schema.weeklyResets.startDate,
      endDate: schema.weeklyResets.endDate,
      status: schema.weeklyResets.status,
      score: schema.weeklyResets.overallScore,
      submittedAt: schema.weeklyResets.submittedAt,
    })
    .from(schema.weeklyResets)
    .where(eq(schema.weeklyResets.userId, userId))
    .orderBy(desc(schema.weeklyResets.startDate));
  const ids = resets.map((r) => r.id);
  if (!ids.length) return { resets: [], wins: [], misses: [], learnings: [], ratings: new Map<string, Record<string, number>>(), unfinished: [], reviews: [] };
  const [ratings, wins, misses, learnings, commitments, reviews] = await Promise.all([
    db.select().from(schema.ratings).where(inArray(schema.ratings.resetId, ids)),
    db.select().from(schema.wins).where(inArray(schema.wins.resetId, ids)),
    db.select().from(schema.misses).where(inArray(schema.misses.resetId, ids)),
    db.select().from(schema.learnings).where(inArray(schema.learnings.resetId, ids)),
    db.select().from(schema.commitments).where(and(inArray(schema.commitments.resetId, ids), isNotNull(schema.commitments.status))),
    db
      .select({ resetId: schema.adminReviews.resetId, comment: schema.adminReviews.comment, status: schema.adminReviews.reviewStatus, at: schema.adminReviews.reviewedAt, reviewer: schema.users.name })
      .from(schema.adminReviews)
      .innerJoin(schema.users, eq(schema.users.id, schema.adminReviews.reviewerId))
      .where(inArray(schema.adminReviews.resetId, ids))
      .orderBy(desc(schema.adminReviews.reviewedAt)),
  ]);
  const ratingMap = new Map<string, Record<string, number>>();
  for (const r of ratings) ratingMap.set(r.resetId, { ...(ratingMap.get(r.resetId) ?? {}), [r.metric]: r.score });
  const weekNo = new Map(resets.map((r) => [r.id, r.weekNumber]));
  const start = new Map(resets.map((r) => [r.id, r.startDate]));

  // Unfinished commitments: group by lineage, keep those whose latest review was not "completed".
  const byLineage = new Map<string, typeof commitments>();
  for (const c of commitments) byLineage.set(c.lineageId, [...(byLineage.get(c.lineageId) ?? []), c]);
  const unfinished = [...byLineage.values()]
    .map((list) => list.sort((a, b) => (start.get(b.resetId)! < start.get(a.resetId)! ? -1 : 1)))
    .filter((list) => list[0].status !== "completed")
    .map((list) => {
      let streak = 0;
      for (const c of list) if (c.status !== "completed") streak++; else break;
      return { title: list[0].title, lastStatus: list[0].status!, streak, weeks: list.map((c) => weekNo.get(c.resetId)!).reverse(), lastWeek: weekNo.get(list[0].resetId)! };
    })
    .sort((a, b) => b.streak - a.streak || b.lastWeek - a.lastWeek);

  const tag = <T extends { resetId: string }>(rows: T[]) => rows.map((r) => ({ ...r, weekNumber: weekNo.get(r.resetId)!, startDate: start.get(r.resetId)! })).sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  return { resets, ratings: ratingMap, wins: tag(wins), misses: tag(misses), learnings: tag(learnings), unfinished, reviews };
}

/* ───────────────────────── Insights ───────────────────────── */

export async function teamInsights(currentWeek: Week | null, lookbackWeeks = 4) {
  const weeks = await db.query.weeks.findMany({ orderBy: desc(schema.weeks.startDate), limit: lookbackWeeks });
  const weekIds = weeks.map((w) => w.id);
  if (!weekIds.length) return null;
  const resets = await db
    .select({ id: schema.weeklyResets.id, userId: schema.weeklyResets.userId, weekId: schema.weeklyResets.weekId, startDate: schema.weeklyResets.startDate, name: schema.users.name })
    .from(schema.weeklyResets)
    .innerJoin(schema.users, eq(schema.users.id, schema.weeklyResets.userId))
    .where(and(inArray(schema.weeklyResets.weekId, weekIds), inArray(schema.weeklyResets.status, [...DONE])));
  const ids = resets.map((r) => r.id);
  const nameOf = new Map(resets.map((r) => [r.id, r.name]));
  const [misses, learnings, priorities, commitments] = ids.length
    ? await Promise.all([
        db.select().from(schema.misses).where(inArray(schema.misses.resetId, ids)),
        db.select().from(schema.learnings).where(inArray(schema.learnings.resetId, ids)),
        db.select().from(schema.priorities).where(inArray(schema.priorities.resetId, ids)),
        db.select().from(schema.commitments).where(inArray(schema.commitments.resetId, ids)),
      ])
    : [[], [], [], []];

  const people = await db.select({ name: schema.users.name }).from(schema.users);
  const names = people.flatMap((p) => p.name.toLowerCase().split(/\s+/));
  const missThemes = extractThemes(misses.map((m) => ({ text: `${m.title} ${m.reason}`, label: `${nameOf.get(m.resetId)}: ${m.title}` })), 6, 2, names);
  const controllability = { yes: 0, partially: 0, no: 0 };
  for (const m of misses) controllability[m.controllability]++;

  const learningThemes = extractThemes(learnings.map((l) => ({ text: l.content, label: `${nameOf.get(l.resetId)}: ${l.content}` })), 6, 2, names);
  const learningCats: Record<string, number> = {};
  for (const l of learnings) learningCats[l.category] = (learningCats[l.category] ?? 0) + 1;

  // Priority themes: the most recent week that has submitted plans.
  const latestWithPlans = weeks.find((w) => resets.some((r) => r.weekId === w.id && priorities.some((p) => p.resetId === r.id)));
  const planResetIds = new Set(resets.filter((r) => r.weekId === latestWithPlans?.id).map((r) => r.id));
  const planPriorities = priorities.filter((p) => planResetIds.has(p.resetId));
  const priorityThemes = extractThemes(planPriorities.map((p) => ({ text: `${p.title} ${p.expectedOutcome}`, label: `${nameOf.get(p.resetId)}: ${p.title}` })), 8, 2, names);

  // Unresolved: lineages not completed in their latest review, with ≥2 misses in a row.
  const latestByUserLineage = new Map<string, { title: string; userId: string; name: string; startDate: string; status: string | null }>();
  for (const c of commitments) {
    const r = resets.find((x) => x.id === c.resetId)!;
    const key = `${r.userId}:${c.lineageId}`;
    const prev = latestByUserLineage.get(key);
    if (!prev || prev.startDate < r.startDate) latestByUserLineage.set(key, { title: c.title, userId: r.userId, name: r.name, startDate: r.startDate, status: c.status });
  }
  const unresolvedCandidates = [...latestByUserLineage.entries()].filter(([, v]) => v.status && v.status !== "completed");
  const unresolved: { title: string; name: string; userId: string; streak: number }[] = [];
  const byUser = new Map<string, { lineage: string; v: (typeof unresolvedCandidates)[number][1] }[]>();
  for (const [key, v] of unresolvedCandidates) byUser.set(v.userId, [...(byUser.get(v.userId) ?? []), { lineage: key.split(":").slice(1).join(":"), v }]);
  for (const [userId, list] of byUser) {
    const nextDay = list.reduce((m, x) => (x.v.startDate > m ? x.v.startDate : m), "");
    const streaks = await commitmentStreaks(list.map((x) => x.lineage), userId, `${nextDay}~`);
    for (const x of list) if ((streaks[x.lineage] ?? 0) >= 2) unresolved.push({ title: x.v.title, name: x.v.name, userId, streak: streaks[x.lineage] });
  }
  unresolved.sort((a, b) => b.streak - a.streak);

  return {
    lookback: weeks.length,
    priorityWeek: latestWithPlans?.weekNumber ?? currentWeek?.weekNumber ?? null,
    missThemes,
    controllability,
    missCount: misses.length,
    learningThemes,
    learningCats,
    priorityThemes,
    unresolved,
  };
}

/* ───────────────────────── Search ───────────────────────── */

export async function search(q: string) {
  const term = `%${q.trim().replace(/[%_]/g, "")}%`;
  const resetMeta = {
    resetId: schema.weeklyResets.id,
    weekNumber: schema.weeklyResets.weekNumber,
    name: schema.users.name,
    userId: schema.users.id,
  };
  const [people, weeks, work, wins, misses, learnings, commitments, priorities, reflections] = await Promise.all([
    db.select({ id: schema.users.id, name: schema.users.name, department: schema.users.department, title: schema.users.title, avatar: schema.users.avatar }).from(schema.users).where(or(like(schema.users.name, term), like(schema.users.department, term), like(schema.users.title, term), like(schema.users.email, term))),
    db.select().from(schema.weeks).where(or(like(schema.weeks.weekNumber, term), like(schema.weeks.startDate, term))),
    db.select({ ...resetMeta, text: schema.workItems.title, detail: schema.workItems.description }).from(schema.workItems).innerJoin(schema.weeklyResets, eq(schema.weeklyResets.id, schema.workItems.resetId)).innerJoin(schema.users, eq(schema.users.id, schema.weeklyResets.userId)).where(or(like(schema.workItems.title, term), like(schema.workItems.description, term), like(schema.workItems.impact, term))),
    db.select({ ...resetMeta, text: schema.wins.title, detail: schema.wins.description }).from(schema.wins).innerJoin(schema.weeklyResets, eq(schema.weeklyResets.id, schema.wins.resetId)).innerJoin(schema.users, eq(schema.users.id, schema.weeklyResets.userId)).where(or(like(schema.wins.title, term), like(schema.wins.description, term))),
    db.select({ ...resetMeta, text: schema.misses.title, detail: schema.misses.reason }).from(schema.misses).innerJoin(schema.weeklyResets, eq(schema.weeklyResets.id, schema.misses.resetId)).innerJoin(schema.users, eq(schema.users.id, schema.weeklyResets.userId)).where(or(like(schema.misses.title, term), like(schema.misses.reason, term), like(schema.misses.correction, term))),
    db.select({ ...resetMeta, text: schema.learnings.content, detail: schema.learnings.category }).from(schema.learnings).innerJoin(schema.weeklyResets, eq(schema.weeklyResets.id, schema.learnings.resetId)).innerJoin(schema.users, eq(schema.users.id, schema.weeklyResets.userId)).where(like(schema.learnings.content, term)),
    db.select({ ...resetMeta, text: schema.commitments.title, detail: schema.commitments.status }).from(schema.commitments).innerJoin(schema.weeklyResets, eq(schema.weeklyResets.id, schema.commitments.resetId)).innerJoin(schema.users, eq(schema.users.id, schema.weeklyResets.userId)).where(or(like(schema.commitments.title, term), like(schema.commitments.reason, term))),
    db.select({ ...resetMeta, text: schema.priorities.title, detail: schema.priorities.expectedOutcome }).from(schema.priorities).innerJoin(schema.weeklyResets, eq(schema.weeklyResets.id, schema.priorities.resetId)).innerJoin(schema.users, eq(schema.users.id, schema.weeklyResets.userId)).where(or(like(schema.priorities.title, term), like(schema.priorities.expectedOutcome, term))),
    db.select({ ...resetMeta, text: schema.reflections.nonNegotiable, detail: schema.reflections.resetReflection }).from(schema.reflections).innerJoin(schema.weeklyResets, eq(schema.weeklyResets.id, schema.reflections.resetId)).innerJoin(schema.users, eq(schema.users.id, schema.weeklyResets.userId)).where(or(like(schema.reflections.nonNegotiable, term), like(schema.reflections.resetReflection, term), like(schema.reflections.stop, term), like(schema.reflections.start, term), like(schema.reflections.continue, term))),
  ]);
  const sortDesc = <T extends { weekNumber: number }>(r: T[]) => r.sort((a, b) => b.weekNumber - a.weekNumber).slice(0, 25);
  return {
    people,
    weeks,
    groups: [
      { key: "work", label: "Work", rows: sortDesc(work) },
      { key: "wins", label: "Wins", rows: sortDesc(wins) },
      { key: "misses", label: "Misses", rows: sortDesc(misses) },
      { key: "learnings", label: "Learnings", rows: sortDesc(learnings) },
      { key: "commitments", label: "Commitments", rows: sortDesc(commitments) },
      { key: "priorities", label: "Priorities", rows: sortDesc(priorities) },
      { key: "reflections", label: "Resets & non-negotiables", rows: sortDesc(reflections) },
    ],
  };
}
