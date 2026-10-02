import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

export type DB = LibSQLDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __obsaClient?: Client; __obsaDb?: DB };

function makeClient() {
  const url = process.env.DATABASE_URL || "file:./data/obsa.db";
  return createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN || undefined });
}

export const client = globalForDb.__obsaClient ?? makeClient();
export const db: DB = globalForDb.__obsaDb ?? drizzle(client, { schema });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__obsaClient = client;
  globalForDb.__obsaDb = db;
}

export { schema };
