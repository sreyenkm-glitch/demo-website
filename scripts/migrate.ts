import { existsSync, rmSync } from "node:fs";
import path from "node:path";

async function main() {
  const fresh = process.argv.includes("--fresh");
  const url = process.env.DATABASE_URL || "file:./data/obsa.db";
  if (fresh && url.startsWith("file:")) {
    const file = path.resolve(url.replace(/^file:/, ""));
    for (const f of [file, `${file}-wal`, `${file}-shm`, `${file}-journal`]) if (existsSync(f)) rmSync(f);
    console.log("↺ removed local database");
  }
  const { migrate } = await import("drizzle-orm/libsql/migrator");
  const { db } = await import("../src/db");
  await migrate(db, { migrationsFolder: path.resolve("drizzle") });
  console.log("✓ migrations applied");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
