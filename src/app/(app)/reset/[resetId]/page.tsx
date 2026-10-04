import { and, desc, eq, lt } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { dueIn, fmtRange } from "@/lib/dates";
import type { ResetPayload } from "@/lib/reset-types";
import { editState, getReset, getWeek, hydrateCommitments, loadResetDetail } from "@/lib/resets";
import { DEFAULT_QUESTIONS, LEARNING_CATEGORIES, type QuestionSet, getRatingCategories, getSettings } from "@/lib/settings";
import { ResetWizard } from "./wizard";

export const dynamic = "force-dynamic";
export const metadata = { title: "My reset" };

export default async function ResetPage({ params }: { params: Promise<{ resetId: string }> }) {
  const { resetId } = await params;
  const user = await requireUser();
  const reset = await getReset(resetId);
  if (!reset) notFound();
  if (reset.userId !== user.id) {
    if (user.role === "admin") redirect(`/admin/resets/${resetId}`);
    notFound();
  }
  const week = (await getWeek(reset.weekId))!;
  if (!editState(reset, week).canEdit) redirect(`/reset/${resetId}/view`);
  await hydrateCommitments(reset);

  const [detail, categories, settings] = await Promise.all([loadResetDetail(resetId), getRatingCategories(), getSettings()]);
  if (!detail) notFound();

  // Last week's ratings + corrections, for context at the right moment.
  const prev = await db.query.weeklyResets.findFirst({
    where: and(eq(schema.weeklyResets.userId, user.id), lt(schema.weeklyResets.startDate, reset.startDate)),
    orderBy: desc(schema.weeklyResets.startDate),
  });
  const [prevRatings, prevMisses, prevRefl] = prev
    ? await Promise.all([
        db.query.ratings.findMany({ where: eq(schema.ratings.resetId, prev.id) }),
        db.query.misses.findMany({ where: eq(schema.misses.resetId, prev.id) }),
        db.query.reflections.findFirst({ where: eq(schema.reflections.resetId, prev.id) }),
      ])
    : [[], [], undefined];

  let questions: QuestionSet = settings.questions;
  try {
    const snap = JSON.parse(week.questions) as Partial<QuestionSet>;
    if (snap.prompts) questions = { prompts: { ...DEFAULT_QUESTIONS.prompts, ...snap.prompts }, custom: snap.custom ?? [] };
  } catch {}

  const r = detail.reflection;
  const initial: ResetPayload = {
    workItems: detail.workItems.map(({ title, description, status, impact, link }) => ({ title, description, status, impact, link })),
    wins: detail.wins.map(({ title, description, impact, isBiggestWin }) => ({ title, description, impact, isBiggestWin })),
    misses: detail.misses.map(({ title, description, reason, controllability, correction, isBiggestMiss }) => ({ title, description, reason, controllability, correction, isBiggestMiss })),
    learnings: detail.learnings.map(({ category, content, isBiggest }) => ({ category, content, isBiggest })),
    ratings: detail.ratings,
    commitments: detail.commitments.map(({ id, status, reason, nextAction, carriedForward }) => ({ id, status, reason, nextAction, carriedForward })),
    priorities: detail.priorities.map(({ title, expectedOutcome, owner, deadline, priorityLevel, lineageId, carriedFromCommitmentId }) => ({ title, expectedOutcome, owner, deadline, priorityLevel, lineageId, carriedFromCommitmentId })),
    reflection: {
      stop: r?.stop ?? "",
      start: r?.start ?? "",
      continue: r?.continue ?? "",
      nonNegotiable: r?.nonNegotiable ?? "",
      resetReflection: r?.resetReflection ?? "",
      doDifferently: r?.doDifferently ?? "",
      customAnswers: r ? (JSON.parse(r.customAnswers) as Record<string, string>) : {},
    },
    sectionsDone: JSON.parse(reset.sectionsDone) as string[],
  };

  const due = dueIn(week.deadline);
  return (
    <ResetWizard
      resetId={reset.id}
      initial={initial}
      week={{ number: week.weekNumber, range: fmtRange(week.startDate, week.endDate), due: due.label, overdue: due.overdue, nextWeekEnd: week.endDate }}
      firstName={user.name.split(" ")[0]}
      commitments={detail.commitments.map((c) => ({ id: c.id, title: c.title, expectedOutcome: c.expectedOutcome, kind: c.kind, streak: c.streak, lineageId: c.lineageId }))}
      categories={categories.map((c) => ({ key: c.key, label: c.label, description: c.description, weight: c.weight, inverted: c.inverted, lowLabel: c.lowLabel, highLabel: c.highLabel }))}
      questions={questions}
      learningCategories={LEARNING_CATEGORIES.map((c) => ({ ...c }))}
      context={{
        prevWeekNumber: prev?.weekNumber ?? null,
        prevRatings: Object.fromEntries(prevRatings.map((x) => [x.metric, x.score])),
        prevCorrections: prevMisses.map((m) => m.correction).filter(Boolean),
        prevDoDifferently: prevRefl?.doDifferently ?? "",
        prevStop: prevRefl?.stop ?? "",
        prevStart: prevRefl?.start ?? "",
        prevContinue: prevRefl?.continue ?? "",
      }}
    />
  );
}
