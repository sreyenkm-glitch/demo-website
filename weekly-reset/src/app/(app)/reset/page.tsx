import { redirect } from "next/navigation";
import Link from "next/link";
import { Empty } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getCurrentWeek, openReset } from "@/lib/resets";

export const dynamic = "force-dynamic";

/** "My reset" — resolves this week's reset for the signed-in user (creating it + pulling commitments) and routes to it. */
export default async function MyResetPage() {
  const user = await requireUser();
  const week = await getCurrentWeek();
  const reset = week ? await openReset(user.id, week) : null;
  if (!reset) {
    return (
      <main className="container page">
        <Empty title="No open reset right now." body="When the next week opens, it shows up here." action={<Link className="btn" href="/history">See past resets</Link>} />
      </main>
    );
  }
  if (reset.status === "submitted" || reset.status === "reviewed") redirect(`/reset/${reset.id}/view`);
  redirect(`/reset/${reset.id}`);
}
