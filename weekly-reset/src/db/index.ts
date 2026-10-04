import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

export type DB = LibSQLDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __obsaClient?: Client; __obsaDb?: DB };

/**
 * DATABASE_URL wins (a Turso/libSQL URL in production). Without it we use a local SQLite file —
 * on Vercel that has to live in /tmp, which is writable but NOT persistent (preview/demo only).
 */
export function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  return process.env.VERCEL ? "file:/tmp/obsa.db" : "file:./data/obsa.db";
}

function makeClient() {
  const url = databaseUrl();
  return createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN || undefined });
}

export const client = globalForDb.__obsaClient ?? makeClient();
export const db: DB = globalForDb.__obsaDb ?? drizzle(client, { schema });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__obsaClient = client;
  globalForDb.__obsaDb = db;
}

export { schema };
