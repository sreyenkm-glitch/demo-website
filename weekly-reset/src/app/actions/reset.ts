"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { assertUser } from "@/lib/auth";
import { newId } from "@/lib/ids";
import { DomainError, reopenReset, saveReset } from "@/lib/resets";
import { resetPayloadSchema } from "@/lib/reset-types";

export type SaveResult =
  | { ok: true; savedAt: string; overallScore: number | null; status: string }
  | { ok: false; error: string; problems?: { section: string; message: string }[] };

export async function saveResetAction(resetId: string, raw: unknown, submit: boolean): Promise<SaveResult> {
  try {
    const user = await assertUser();
    const parsed = resetPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return { ok: false, error: `${issue.path.join(" › ")}: ${issue.message}` };
    }
    const res = await saveReset(user.id, resetId, parsed.data, { submit });
    if (!res.ok) return { ok: false, error: "A few things before you lock it in.", problems: res.problems };
    if (submit) {
      const me = await db.query.users.findFirst({ where: eq(schema.users.id, user.id), columns: { name: true } });
      const admins = await db.query.users.findMany({ where: eq(schema.users.role, "admin"), columns: { id: true } });
      const rows = admins
        .filter((a) => a.id !== user.id)
        .map((a) => ({ id: newId(), userId: a.id, kind: "review" as const, title: `${me?.name ?? "Someone"} just reset`, body: res.overallScore != null ? `Self-score ${res.overallScore.toFixed(1)}. Ready for review.` : "Ready for review.", href: `/admin/resets/${resetId}` }));
      if (rows.length) await db.insert(schema.notifications).values(rows);
      revalidatePath("/", "layout");
    }
    return { ok: true, savedAt: new Date().toISOString(), overallScore: res.overallScore, status: res.status };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    if (e instanceof Error && "status" in e) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Couldn't save. Check your connection — your answers are still here." };
  }
}

export async function reopenResetAction(resetId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await assertUser();
    await reopenReset(user.id, resetId);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't reopen." };
  }
}
