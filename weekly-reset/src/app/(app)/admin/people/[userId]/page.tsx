import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { PersonHistory } from "@/components/person-history";
import { BackLink } from "@/components/ui";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PersonPage({ params }: { params: Promise<{ userId: string }> }) {
  await requireAdmin();
  const { userId } = await params;
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user) notFound();
  return (
    <main className="container page">
      <BackLink href="/admin">Team</BackLink>
      <PersonHistory user={user} viewer="admin" />
    </main>
  );
}
