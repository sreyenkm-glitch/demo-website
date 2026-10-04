/**
 * Seeds OBSA demo data: 8 people, 5 past weeks + the current week, with real carry-forward lineages.
 * Safe to re-run — it wipes and rebuilds everything.  Usage: npm run db:seed  (or db:reset for a fresh file)
 */
import { db, schema } from "../src/db";
import { hashPassword } from "../src/lib/auth-hash";
import { addDays, isoWeek, startOfWeek, toYmd, zonedToIso } from "../src/lib/dates";
import { newId } from "../src/lib/ids";
import { overallScore } from "../src/lib/scoring";
import { DEFAULT_QUESTIONS, DEFAULT_RATING_CATEGORIES, DEFAULT_SETTINGS } from "../src/lib/settings";
import { PEOPLE, REVIEW_COMMENTS, type Person } from "./seed-content";

export const DEMO_PASSWORD = "reset-day";

// Deterministic PRNG so the demo looks the same every time.
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(40);
const pick = <T,>(arr: T[], i: number) => arr[((i % arr.length) + arr.length) % arr.length];
const clamp = (n: number) => Math.max(1, Math.min(10, Math.round(n)));

type CurrentStatus = "not_started" | "in_progress" | "submitted" | "reviewed";
const CURRENT_STATUS: Record<string, CurrentStatus> = {
  rhea: "in_progress",
  kabir: "submitted",
  zoe: "reviewed",
  arjun: "submitted",
  maya: "not_started",
  dev: "submitted",
  tara: "in_progress",
  leo: "not_started",
};
const REFERRAL = "Ship referral program landing page";

async function wipe() {
  for (const t of [
    schema.notifications,
    schema.adminReviews,
    schema.reflections,
    schema.priorities,
    schema.commitments,
    schema.ratings,
    schema.learnings,
    schema.misses,
    schema.wins,
    schema.workItems,
    schema.weeklyResets,
    schema.weeks,
    schema.sessions,
    schema.users,
    schema.ratingCategories,
    schema.settings,
  ])
    await db.delete(t);
}

async function main() {
  await wipe();

  // Settings + rating categories
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS))
    await db.insert(schema.settings).values({ key, value: JSON.stringify(value) });
  await db.insert(schema.ratingCategories).values(DEFAULT_RATING_CATEGORIES.map((c) => ({ ...c, active: true })));
  const categories = DEFAULT_RATING_CATEGORIES;

  // Users
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const userIds: Record<string, string> = {};
  for (const p of PEOPLE) {
    userIds[p.key] = newId();
    await db.insert(schema.users).values({
      id: userIds[p.key],
      name: p.name,
      email: p.email,
      passwordHash,
      role: p.role,
      title: p.title,
      department: p.department,
      avatar: p.avatar,
    });
  }
  const adminId = userIds.rhea;

  // Weeks: the current calendar week + 5 before it.
  const today = toYmd(new Date());
  const currentStart = startOfWeek(today, DEFAULT_SETTINGS.schedule.weekStartDay);
  const weekRows = Array.from({ length: 6 }, (_, wi) => {
    const start = addDays(currentStart, (wi - 5) * 7);
    const end = addDays(start, 6);
    const { week, year } = isoWeek(start);
    return {
      id: newId(),
      weekNumber: week,
      year,
      startDate: start,
      endDate: end,
      deadline: zonedToIso(end, DEFAULT_SETTINGS.schedule.deadlineTime, DEFAULT_SETTINGS.schedule.timezone),
      status: (wi <= 3 ? "locked" : "open") as "locked" | "open",
      lockedAt: wi <= 3 ? `${addDays(end, 2)}T10:00:00.000Z` : null,
      questions: JSON.stringify(DEFAULT_QUESTIONS),
      createdBy: adminId,
      createdAt: `${addDays(start, -1)}T18:00:00.000Z`,
    };
  });
  await db.insert(schema.weeks).values(weekRows);

  const nowIso = new Date().toISOString();

  for (const [pi, p] of PEOPLE.entries()) {
    // State carried between weeks for this person
    let lastPlan: { priorities: { id: string; title: string; expectedOutcome: string; lineageId: string }[]; nonNeg: string; resetId: string } | null = null;

    for (const [wi, week] of weekRows.entries()) {
      const isCurrent = wi === 5;
      const skipped = p.key === "leo" && wi === 2; // Leo missed one week — the loop still holds
      let status: CurrentStatus = isCurrent ? CURRENT_STATUS[p.key] : skipped ? "not_started" : wi <= 3 || (wi === 4 && pi % 2 === 0) ? "reviewed" : "submitted";
      if (p.role === "admin" && status === "reviewed") status = "submitted"; // nobody reviews the reviewer
      const resetId = newId();
      const filled = status !== "not_started";
      const partial = status === "in_progress";

      // Ratings
      const ratings: Record<string, number> = {};
      if (filled) {
        const level = p.base + p.trend * wi;
        for (const c of categories) {
          if (partial && c.sortOrder > 4) continue;
          const noise = (rand() - 0.5) * 1.6;
          const v = level + (p.offsets[c.key] ?? 0) + noise;
          ratings[c.key] = c.inverted ? clamp(11 - v + 1.5 + (rand() - 0.5)) : clamp(v);
        }
        if (p.key === "dev" && wi >= 4) ratings.morale = clamp(ratings.morale - 1.5);
      }
      const score = filled ? overallScore(ratings, categories) : null;

      const submittedAt = status === "submitted" || status === "reviewed"
        ? isCurrent
          ? new Date(Date.now() - (2 + pi * 3) * 36e5).toISOString()
          : `${addDays(week.endDate, -(pi % 2))}T${String(14 + pi).padStart(2, "0")}:2${pi}:00.000Z`
        : null;
      const reviewedAt = status === "reviewed" ? (isCurrent ? new Date(Date.now() - 36e5).toISOString() : `${addDays(week.endDate, 1)}T09:30:00.000Z`) : null;

      const sectionsDone = filled ? (partial ? ["week", "wins", "misses"] : ["week", "wins", "misses", "learned", "rate", "own", "reset"]) : [];
      await db.insert(schema.weeklyResets).values({
        id: resetId,
        userId: userIds[p.key],
        weekId: week.id,
        weekNumber: week.weekNumber,
        startDate: week.startDate,
        endDate: week.endDate,
        status,
        sectionsDone: JSON.stringify(sectionsDone),
        startedAt: filled ? (submittedAt ?? nowIso) : null,
        submittedAt,
        reviewedAt,
        overallScore: score,
        updatedAt: submittedAt ?? (filled ? nowIso : null),
        createdAt: week.createdAt,
      });

      // Commitments: last plan's priorities + non-negotiable, reviewed this week.
      const carried: { title: string; expectedOutcome: string; lineageId: string; commitmentId: string }[] = [];
      if (lastPlan) {
        const rows = [
          ...lastPlan.priorities.map((pr) => ({ ...pr, kind: "priority" as const, sourcePriorityId: pr.id })),
          ...(lastPlan.nonNeg ? [{ id: "", title: lastPlan.nonNeg, expectedOutcome: "", lineageId: `nn:${lastPlan.resetId}`, kind: "non_negotiable" as const, sourcePriorityId: null }] : []),
        ];
        for (const [ci, c] of rows.entries()) {
          const reviewed = filled && !partial;
          let st: "completed" | "partial" | "not_completed" | null = null;
          if (reviewed) {
            if (c.title === REFERRAL) st = isCurrent ? "partial" : "not_completed";
            else {
              const r = rand();
              st = r < p.reliability ? "completed" : r < p.reliability + (1 - p.reliability) / 2 ? "partial" : "not_completed";
            }
          }
          const miss = pick(p.misses, wi + ci);
          const carry = st !== null && st !== "completed" && c.kind === "priority" && (c.title === REFERRAL || rand() < 0.55);
          const commitmentId = newId();
          await db.insert(schema.commitments).values({
            id: commitmentId,
            resetId,
            title: c.title,
            expectedOutcome: c.expectedOutcome,
            kind: c.kind,
            sourcePriorityId: c.sourcePriorityId,
            lineageId: c.lineageId,
            status: st,
            reason: st && st !== "completed" ? miss[1] : "",
            nextAction: st && st !== "completed" ? miss[3] : "",
            carriedForward: carry,
            sortOrder: ci,
          });
          if (carry) carried.push({ title: c.title, expectedOutcome: c.expectedOutcome, lineageId: c.lineageId, commitmentId });
        }
      }

      if (!filled) {
        // Skipped weeks keep last plan alive so the following week reviews it.
        continue;
      }

      // Work items, wins, misses, learnings
      const workCount = partial ? 2 : 2 + Math.floor(rand() * 3);
      await db.insert(schema.workItems).values(
        Array.from({ length: workCount }, (_, k) => {
          const w = pick(p.work, wi * 2 + k);
          const r = rand();
          return {
            id: newId(),
            resetId,
            title: w[0],
            description: w[1],
            impact: w[2],
            status: (r < 0.62 ? "completed" : r < 0.85 ? "in_progress" : r < 0.95 ? "blocked" : "dropped") as "completed",
            link: k === 0 && rand() < 0.4 ? "https://www.notion.so/obsa/" + w[0].toLowerCase().replace(/[^a-z0-9]+/g, "-") : "",
            sortOrder: k,
          };
        }),
      );
      const winCount = partial ? 1 : 1 + Math.floor(rand() * 2) + 1;
      await db.insert(schema.wins).values(
        Array.from({ length: winCount }, (_, k) => {
          const w = pick(p.wins, wi + k);
          return { id: newId(), resetId, title: w[0], description: w[1], impact: w[2], isBiggestWin: k === 0, sortOrder: k };
        }),
      );
      const missCount = partial ? 1 : 1 + Math.floor(rand() * 2);
      await db.insert(schema.misses).values(
        Array.from({ length: missCount }, (_, k) => {
          const m = pick(p.misses, wi * 3 + k + pi);
          return { id: newId(), resetId, title: m[0], reason: m[1], controllability: m[2], correction: m[3], isBiggestMiss: k === 0, sortOrder: k };
        }),
      );
      if (!partial) {
        const learnCount = 1 + Math.floor(rand() * 3);
        await db.insert(schema.learnings).values(
          Array.from({ length: learnCount }, (_, k) => {
            const l = pick(p.learnings, wi + k * 2 + pi);
            return { id: newId(), resetId, category: l[0], content: l[1], isBiggest: k === 0, sortOrder: k };
          }),
        );
      }
      if (Object.keys(ratings).length)
        await db.insert(schema.ratings).values(Object.entries(ratings).map(([metric, s]) => ({ id: newId(), resetId, metric, score: s })));

      if (partial) {
        lastPlan = null; // current week, still drafting — no plan yet
        continue;
      }

      // Next-week plan: carried items first, then fresh priorities.
      const plan: { id: string; title: string; expectedOutcome: string; lineageId: string; carriedFrom: string | null }[] = [];
      for (const c of carried.slice(0, 2))
        plan.push({ id: newId(), title: c.title, expectedOutcome: c.expectedOutcome, lineageId: c.lineageId, carriedFrom: c.commitmentId });
      if (p.key === "kabir" && wi === 1 && !plan.some((x) => x.title === REFERRAL))
        plan.unshift({ id: newId(), title: REFERRAL, expectedOutcome: "Live page, tracking referrals end-to-end.", lineageId: newId(), carriedFrom: null });
      for (let k = 0; plan.length < 3 && k < p.priorities.length * 2; k++) {
        const pr = pick(p.priorities, wi * 2 + k + pi);
        if (plan.some((x) => x.title === pr[0]) || (p.key === "kabir" && pr[0] === REFERRAL)) continue;
        plan.push({ id: newId(), title: pr[0], expectedOutcome: pr[1], lineageId: newId(), carriedFrom: null });
      }
      await db.insert(schema.priorities).values(
        plan.map((pr, k) => ({
          id: pr.id,
          resetId,
          title: pr.title,
          expectedOutcome: pr.expectedOutcome,
          owner: p.name.split(" ")[0],
          deadline: addDays(week.endDate, 3 + k),
          priorityLevel: (["p0", "p1", "p2"] as const)[k],
          lineageId: pr.lineageId,
          carriedFromCommitmentId: pr.carriedFrom,
          sortOrder: k,
        })),
      );
      const nonNeg = pick(p.nonNeg, wi + pi);
      await db.insert(schema.reflections).values({
        id: newId(),
        resetId,
        stop: pick(p.stop, wi),
        start: pick(p.start, wi + 1),
        continue: pick(p.cont, wi),
        nonNegotiable: nonNeg,
        resetReflection: `I'd ${pick(p.misses, wi)[3].charAt(0).toLowerCase()}${pick(p.misses, wi)[3].slice(1)}`,
        doDifferently: pick(p.misses, wi + 1)[3],
      });
      lastPlan = { priorities: plan, nonNeg, resetId };

      // Admin reviews
      if (status === "reviewed" && p.key !== "rhea") {
        const attention = (p.key === "dev" && wi === 4) || (p.key === "kabir" && wi === 4);
        const kind = attention ? "needs_attention" : (score ?? 0) >= 8 ? "kudos" : "reviewed";
        const text = attention
          ? REVIEW_COMMENTS.needs_attention[p.key === "dev" ? 0 : 1]
          : pick(REVIEW_COMMENTS[kind as "kudos" | "reviewed"], wi + pi);
        await db.insert(schema.adminReviews).values({ id: newId(), resetId, reviewerId: adminId, comment: text, reviewStatus: kind, reviewedAt: reviewedAt! });
      }
    }
  }

  // Notifications for the current week
  const current = weekRows[5];
  for (const p of PEOPLE) {
    await db.insert(schema.notifications).values({
      id: newId(),
      userId: userIds[p.key],
      kind: "week_started",
      title: `Week ${current.weekNumber} reset is open`,
      body: "Look back, own it, reset. Takes ~7 minutes.",
      href: "/reset",
      createdAt: current.createdAt,
    });
  }
  await db.insert(schema.notifications).values({
    id: newId(),
    userId: userIds.zoe,
    kind: "review",
    title: "Rhea reviewed your reset",
    body: "“Clean reset. Priorities are sharp and realistic.”",
    href: "/history",
  });

  console.log(`✓ seeded ${PEOPLE.length} people × ${weekRows.length} weeks (current: week ${current.weekNumber}, ${current.startDate} → ${current.endDate})`);
  console.log(`  sign in as rhea@obsa.team (admin) or kabir@obsa.team (member) — password: ${DEMO_PASSWORD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export type { Person };
