import path from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { db, schema } from "@/db";

/**
 * Runs once per server start (see src/instrumentation.ts): apply pending migrations, and on a
 * brand-new empty database load the demo data so a fresh deploy is usable immediately.
 * Set SEED_DEMO=0 to start with an empty database instead.
 */
export async function ensureDatabase() {
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  if (process.env.SEED_DEMO === "0") return;
  const users = await db.$count(schema.users);
  if (users > 0) return;
  const { seedDemo } = await import("./demo-seed");
  await seedDemo();
}
