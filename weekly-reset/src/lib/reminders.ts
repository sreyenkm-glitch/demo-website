/**
 * Reminders architecture.
 *
 * Every reminder is first written as an in-app notification row (the source of truth). Delivery
 * channels fan out from that row. Only `inApp` ships today; add email (Resend/Postmark), Slack or
 * Web Push by implementing `ReminderChannel` and registering it in `channels`.
 *
 * Scheduling: call `runScheduledReminders()` from a cron (see /api/cron/reminders) every hour.
 */
import { and, eq, gt, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { dueIn } from "./dates";
import { newId } from "./ids";
import { getCurrentWeek } from "./resets";

export type ReminderMessage = { userId: string; email: string; name: string; title: string; body: string; href: string; kind: "reminder" | "nudge" };

export interface ReminderChannel {
  name: string;
  send(msg: ReminderMessage): Promise<void>;
}

const inApp: ReminderChannel = {
  name: "in_app",
  async send(m) {
    await db.insert(schema.notifications).values({ id: newId(), userId: m.userId, kind: m.kind, title: m.title, body: m.body, href: m.href, channel: "in_app" });
  },
};

// Register additional channels here, e.g. `email` when RESEND_API_KEY is set.
export const channels: ReminderChannel[] = [inApp];

async function deliver(msg: ReminderMessage) {
  for (const c of channels) {
    try {
      await c.send(msg);
    } catch (e) {
      console.error(`[reminders] ${c.name} failed`, e);
    }
  }
}

/** Notify everyone in a week who hasn't submitted. Returns how many people were notified. */
export async function notifyPending(weekId: string, kind: "reminder" | "nudge") {
  const week = await db.query.weeks.findFirst({ where: eq(schema.weeks.id, weekId) });
  if (!week || week.status === "locked") return 0;
  const pending = await db
    .select({ userId: schema.users.id, email: schema.users.email, name: schema.users.name, status: schema.weeklyResets.status })
    .from(schema.weeklyResets)
    .innerJoin(schema.users, eq(schema.users.id, schema.weeklyResets.userId))
    .where(and(eq(schema.weeklyResets.weekId, weekId), inArray(schema.weeklyResets.status, ["not_started", "in_progress"]), eq(schema.users.active, true)));
  const due = dueIn(week.deadline);
  for (const p of pending) {
    await deliver({
      ...p,
      kind,
      title: kind === "nudge" ? `Gentle nudge: W${week.weekNumber} reset is ${due.label}` : `Your reset is ${due.label}`,
      body: p.status === "in_progress" ? "You're partway in. Finish the loop." : "Takes ~7 minutes. Look back, own it, reset.",
      href: "/reset",
    });
  }
  return pending.length;
}

/** Hourly job: remind pending people at ~48h and ~6h before the deadline (once per window). */
export async function runScheduledReminders(now = new Date()) {
  const week = await getCurrentWeek();
  if (!week || week.status === "locked") return { sent: 0 };
  const hoursLeft = (new Date(week.deadline).getTime() - now.getTime()) / 36e5;
  const window = hoursLeft <= 48 && hoursLeft > 47 ? 48 : hoursLeft <= 6 && hoursLeft > 5 ? 6 : null;
  if (!window) return { sent: 0, hoursLeft: Math.round(hoursLeft) };
  // Dedupe: skip if a reminder already went out in this window.
  const since = new Date(now.getTime() - 2 * 36e5).toISOString();
  const recent = await db.$count(schema.notifications, and(eq(schema.notifications.kind, "reminder"), gt(schema.notifications.createdAt, since)));
  if (recent > 0) return { sent: 0, deduped: true };
  return { sent: await notifyPending(week.id, "reminder"), window };
}
