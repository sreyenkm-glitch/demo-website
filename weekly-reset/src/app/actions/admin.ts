"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { assertAdmin, hashPassword } from "@/lib/auth";
import { newId } from "@/lib/ids";
import { notifyPending } from "@/lib/reminders";
import { getPreviousWeek, getWeek, hydrateCommitments, recalculateAllScores } from "@/lib/resets";
import { ACCENTS, type AccentKey, SECTION_ORDER, type SectionKey, getSettings, writeSetting } from "@/lib/settings";

export type ActionState = { ok?: boolean; error?: string; message?: string };

const fail = (e: unknown): ActionState => ({ error: e instanceof z.ZodError ? e.issues[0]?.message : e instanceof Error ? e.message : "Something broke." });

/* ───────── Reviews ───────── */

export async function addReview(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const admin = await assertAdmin();
    const data = z
      .object({
        resetId: z.string().min(1),
        comment: z.string().trim().max(2000),
        reviewStatus: z.enum(["comment", "reviewed", "needs_attention", "kudos"]),
      })
      .parse({ resetId: form.get("resetId"), comment: form.get("comment") ?? "", reviewStatus: form.get("reviewStatus") });
    if (data.reviewStatus === "comment" && !data.comment) return { error: "Write something first." };
    const reset = await db.query.weeklyResets.findFirst({ where: eq(schema.weeklyResets.id, data.resetId) });
    if (!reset) return { error: "Reset not found." };
    if (reset.status === "not_started" || reset.status === "in_progress") {
      if (data.reviewStatus !== "comment") return { error: "Can't mark a reset reviewed before it's submitted. Leave a comment instead." };
    }
    const now = new Date().toISOString();
    await db.insert(schema.adminReviews).values({ id: newId(), resetId: data.resetId, reviewerId: admin.id, comment: data.comment, reviewStatus: data.reviewStatus, reviewedAt: now });
    if (data.reviewStatus !== "comment") {
      await db.update(schema.weeklyResets).set({ status: "reviewed", reviewedAt: now }).where(eq(schema.weeklyResets.id, data.resetId));
    }
    if (reset.userId !== admin.id) {
      await db.insert(schema.notifications).values({
        id: newId(),
        userId: reset.userId,
        kind: "review",
        title: `${admin.name.split(" ")[0]} ${data.reviewStatus === "kudos" ? "sent kudos on" : data.reviewStatus === "comment" ? "commented on" : "reviewed"} your W${reset.weekNumber} reset`,
        body: data.comment ? `“${data.comment.slice(0, 140)}”` : "",
        href: `/reset/${reset.id}/view`,
      });
    }
    revalidatePath("/", "layout");
    return { ok: true, message: data.reviewStatus === "comment" ? "Comment sent." : "Marked reviewed." };
  } catch (e) {
    return fail(e);
  }
}

/* ───────── Weeks ───────── */

const weekSchema = z.object({
  weekNumber: z.coerce.number().int().min(1).max(53),
  year: z.coerce.number().int().min(2000).max(2100),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a start date"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick an end date"),
  deadline: z.string().min(10, "Pick a deadline"),
  memberIds: z.array(z.string()).min(1, "Include at least one person."),
  lockPrevious: z.boolean(),
});

export async function createWeek(_: ActionState, form: FormData): Promise<ActionState> {
  let weekId: string;
  try {
    const admin = await assertAdmin();
    const data = weekSchema.parse({
      weekNumber: form.get("weekNumber"),
      year: form.get("year"),
      startDate: form.get("startDate"),
      endDate: form.get("endDate"),
      deadline: form.get("deadline"),
      memberIds: form.getAll("memberIds").map(String),
      lockPrevious: form.get("lockPrevious") === "on",
    });
    if (data.endDate < data.startDate) return { error: "End date is before the start date." };
    const deadline = new Date(data.deadline);
    if (Number.isNaN(deadline.getTime())) return { error: "Deadline isn't a valid date." };
    const dupe = await db.query.weeks.findFirst({ where: and(eq(schema.weeks.year, data.year), eq(schema.weeks.weekNumber, data.weekNumber)) });
    if (dupe) return { error: `Week ${data.weekNumber} of ${data.year} already exists.` };
    const settings = await getSettings();

    weekId = newId();
    await db.insert(schema.weeks).values({
      id: weekId,
      weekNumber: data.weekNumber,
      year: data.year,
      startDate: data.startDate,
      endDate: data.endDate,
      deadline: deadline.toISOString(),
      questions: JSON.stringify(settings.questions),
      createdBy: admin.id,
    });
    const week = (await getWeek(weekId))!;

    if (data.lockPrevious) {
      const prev = await getPreviousWeek(week);
      if (prev && prev.status === "open") await db.update(schema.weeks).set({ status: "locked", lockedAt: new Date().toISOString() }).where(eq(schema.weeks.id, prev.id));
    }

    // Create every included member's reset and carry their last plan forward right away.
    const members = await db.query.users.findMany({ where: and(inArray(schema.users.id, data.memberIds), eq(schema.users.active, true)) });
    for (const m of members) {
      const id = newId();
      await db.insert(schema.weeklyResets).values({ id, userId: m.id, weekId, weekNumber: week.weekNumber, startDate: week.startDate, endDate: week.endDate });
      const reset = (await db.query.weeklyResets.findFirst({ where: eq(schema.weeklyResets.id, id) }))!;
      await hydrateCommitments(reset);
    }
    if (members.length)
      await db.insert(schema.notifications).values(
        members.map((m) => ({ id: newId(), userId: m.id, kind: "week_started" as const, title: `Week ${week.weekNumber} reset is open`, body: "Your last plan is waiting for review. Own it.", href: "/reset" })),
      );
    revalidatePath("/", "layout");
  } catch (e) {
    return fail(e);
  }
  redirect(`/admin?week=${weekId}&started=1`);
}

export async function setWeekLock(weekId: string, locked: boolean): Promise<ActionState> {
  try {
    await assertAdmin();
    await db.update(schema.weeks).set({ status: locked ? "locked" : "open", lockedAt: locked ? new Date().toISOString() : null }).where(eq(schema.weeks.id, weekId));
    revalidatePath("/", "layout");
    return { ok: true, message: locked ? "Week locked. It's in the books." : "Week reopened." };
  } catch (e) {
    return fail(e);
  }
}

export async function updateWeekDeadline(weekId: string, deadlineIso: string): Promise<ActionState> {
  try {
    await assertAdmin();
    const d = new Date(deadlineIso);
    if (Number.isNaN(d.getTime())) return { error: "Invalid deadline." };
    await db.update(schema.weeks).set({ deadline: d.toISOString() }).where(eq(schema.weeks.id, weekId));
    revalidatePath("/", "layout");
    return { ok: true, message: "Deadline updated." };
  } catch (e) {
    return fail(e);
  }
}

export async function addMemberToWeek(weekId: string, userId: string): Promise<ActionState> {
  try {
    await assertAdmin();
    const week = await getWeek(weekId);
    if (!week || week.status === "locked") return { error: "Week is locked." };
    const exists = await db.query.weeklyResets.findFirst({ where: and(eq(schema.weeklyResets.weekId, weekId), eq(schema.weeklyResets.userId, userId)) });
    if (exists) return { ok: true };
    const id = newId();
    await db.insert(schema.weeklyResets).values({ id, userId, weekId, weekNumber: week.weekNumber, startDate: week.startDate, endDate: week.endDate });
    await hydrateCommitments((await db.query.weeklyResets.findFirst({ where: eq(schema.weeklyResets.id, id) }))!);
    revalidatePath("/", "layout");
    return { ok: true, message: "Added to this week." };
  } catch (e) {
    return fail(e);
  }
}

export async function nudgePending(weekId: string): Promise<ActionState> {
  try {
    await assertAdmin();
    const n = await notifyPending(weekId, "nudge");
    revalidatePath("/", "layout");
    return { ok: true, message: n ? `Nudged ${n} ${n === 1 ? "person" : "people"}. 👀` : "Nobody to nudge — everyone's reset." };
  } catch (e) {
    return fail(e);
  }
}

/* ───────── Team ───────── */

const memberSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Name is too short").max(80),
  email: z.string().trim().toLowerCase().email("That email looks off"),
  role: z.enum(["admin", "member"]),
  title: z.string().trim().max(80),
  department: z.string().trim().max(60),
  avatar: z.string().trim().max(8),
  password: z.string().max(200),
});

export async function saveMember(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const admin = await assertAdmin();
    const data = memberSchema.parse(Object.fromEntries(["id", "name", "email", "role", "title", "department", "avatar", "password"].map((k) => [k, form.get(k) ?? (k === "id" ? undefined : "")])));
    const clash = await db.query.users.findFirst({ where: and(eq(schema.users.email, data.email), data.id ? ne(schema.users.id, data.id) : undefined) });
    if (clash) return { error: "Someone already uses that email." };
    if (data.id) {
      if (data.id === admin.id && data.role !== "admin") return { error: "You can't demote yourself. Ask another admin." };
      const patch: Partial<typeof schema.users.$inferInsert> = { name: data.name, email: data.email, role: data.role, title: data.title || null, department: data.department || null, avatar: data.avatar || null };
      if (data.password) {
        if (data.password.length < 8) return { error: "Passwords need 8+ characters." };
        patch.passwordHash = await hashPassword(data.password);
        await db.delete(schema.sessions).where(eq(schema.sessions.userId, data.id));
      }
      await db.update(schema.users).set(patch).where(eq(schema.users.id, data.id));
    } else {
      if (data.password.length < 8) return { error: "Set a starting password (8+ characters)." };
      await db.insert(schema.users).values({ id: newId(), name: data.name, email: data.email, role: data.role, title: data.title || null, department: data.department || null, avatar: data.avatar || null, passwordHash: await hashPassword(data.password) });
    }
    revalidatePath("/admin/team");
    return { ok: true, message: data.id ? "Saved." : `${data.name.split(" ")[0]} is in. 🎉` };
  } catch (e) {
    return fail(e);
  }
}

export async function setMemberActive(userId: string, active: boolean): Promise<ActionState> {
  try {
    const admin = await assertAdmin();
    if (userId === admin.id) return { error: "You can't deactivate yourself." };
    await db.update(schema.users).set({ active }).where(eq(schema.users.id, userId));
    if (!active) await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
    revalidatePath("/admin/team");
    return { ok: true, message: active ? "Reactivated." : "Deactivated. History is kept." };
  } catch (e) {
    return fail(e);
  }
}

/* ───────── Settings ───────── */

export async function saveBrandAndSchedule(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await assertAdmin();
    const brand = z
      .object({ name: z.string().trim().min(2).max(60), tagline: z.string().trim().max(120), shortName: z.string().trim().min(1).max(16) })
      .parse({ name: form.get("brandName"), tagline: form.get("tagline"), shortName: form.get("shortName") });
    const tz = String(form.get("timezone") ?? "UTC");
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
    } catch {
      return { error: `Unknown timezone “${tz}”. Try something like Asia/Kolkata or America/New_York.` };
    }
    const schedule = z
      .object({
        weekStartDay: z.coerce.number().int().min(0).max(6),
        deadlineOffsetDays: z.coerce.number().int().min(0).max(13),
        deadlineTime: z.string().regex(/^\d{2}:\d{2}$/),
        timezone: z.string(),
      })
      .parse({ weekStartDay: form.get("weekStartDay"), deadlineOffsetDays: form.get("deadlineOffsetDays"), deadlineTime: form.get("deadlineTime"), timezone: tz });
    const accent = String(form.get("accent")) as AccentKey;
    const mode = String(form.get("mode"));
    const theme = { accent: accent in ACCENTS ? accent : "lime", mode: ["dark", "light", "system"].includes(mode) ? mode : "dark" };
    const departments = String(form.get("departments") ?? "")
      .split(/[\n,]/)
      .map((d) => d.trim())
      .filter(Boolean)
      .slice(0, 30);
    await writeSetting("brand", brand);
    await writeSetting("schedule", schedule);
    await writeSetting("theme", theme);
    await writeSetting("departments", departments);
    revalidatePath("/", "layout");
    return { ok: true, message: "Settings saved." };
  } catch (e) {
    return fail(e);
  }
}

const categorySchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9_]{2,30}$/, "Keys are lowercase letters/numbers"),
  label: z.string().trim().min(1).max(30),
  description: z.string().trim().max(300),
  weight: z.coerce.number().min(0).max(10),
  inverted: z.boolean(),
  lowLabel: z.string().trim().max(24),
  highLabel: z.string().trim().max(24),
  active: z.boolean(),
});

export async function saveRatingCategories(raw: unknown): Promise<ActionState> {
  try {
    await assertAdmin();
    const list = z.array(categorySchema).min(1).max(15).parse(raw);
    if (new Set(list.map((c) => c.key)).size !== list.length) return { error: "Two categories share a key." };
    if (!list.some((c) => c.active && c.weight > 0)) return { error: "At least one active category needs weight." };
    await db.transaction(async (tx) => {
      await tx.delete(schema.ratingCategories);
      await tx.insert(schema.ratingCategories).values(list.map((c, i) => ({ ...c, lowLabel: c.lowLabel || "Low", highLabel: c.highLabel || "High", sortOrder: i + 1 })));
    });
    const n = await recalculateAllScores();
    revalidatePath("/", "layout");
    return { ok: true, message: `Saved. Recalculated ${n} scores with the new weights.` };
  } catch (e) {
    return fail(e);
  }
}

export async function saveQuestions(raw: unknown): Promise<ActionState> {
  try {
    await assertAdmin();
    const sectionEnum = z.enum(SECTION_ORDER as [SectionKey, ...SectionKey[]]);
    const data = z
      .object({
        prompts: z.record(sectionEnum, z.string().trim().min(3).max(200)),
        custom: z.array(z.object({ id: z.string().min(1).max(40), section: sectionEnum, prompt: z.string().trim().min(3).max(200) })).max(12),
      })
      .parse(raw);
    await writeSetting("questions", data);
    revalidatePath("/", "layout");
    return { ok: true, message: "Questions saved. They apply to the next week you start." };
  } catch (e) {
    return fail(e);
  }
}

/** Apply the current question set to an open week (snapshot), e.g. right after editing. */
export async function applyQuestionsToWeek(weekId: string): Promise<ActionState> {
  try {
    await assertAdmin();
    const s = await getSettings();
    await db.update(schema.weeks).set({ questions: JSON.stringify(s.questions) }).where(and(eq(schema.weeks.id, weekId), eq(schema.weeks.status, "open")));
    revalidatePath("/", "layout");
    return { ok: true, message: "Current week now uses these questions." };
  } catch (e) {
    return fail(e);
  }
}
