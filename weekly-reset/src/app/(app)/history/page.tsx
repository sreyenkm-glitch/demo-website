import { PersonHistory } from "@/components/person-history";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "My history" };

export default async function HistoryPage() {
  const user = await requireUser();
  return (
    <main className="container page">
      <PersonHistory user={user} viewer="self" />
    </main>
  );
}
