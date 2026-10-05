import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

export type DB = LibSQLDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __obsaClient?: Client; __obsaDb?: DB };

/**
 * DATABASE_URL wins (a Turso/libSQL URL in production); TURSO_DATABASE_URL is what Vercel's Turso
 * integration sets. Without either we use a local SQLite file — on Vercel that has to live in /tmp,
 * which is per-server and NOT persistent (sign-ins and data don't survive across servers).
 */
const remoteUrl = () => process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || "";
const authToken = () => process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || undefined;

/** True when running on Vercel without a shared database — the app works, but nothing persists. */
export const isEphemeralDemo = () => !!process.env.VERCEL && !remoteUrl();

export function databaseUrl() {
  if (remoteUrl()) return remoteUrl();
  return process.env.VERCEL ? "file:/tmp/obsa.db" : "file:./data/obsa.db";
}

function makeClient() {
  const url = databaseUrl();
  return createClient({ url, authToken: authToken() });
}

export const client = globalForDb.__obsaClient ?? makeClient();
export const db: DB = globalForDb.__obsaDb ?? drizzle(client, { schema });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__obsaClient = client;
  globalForDb.__obsaDb = db;
}

export { schema };
