import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

const dbPath = process.env.DATABASE_PATH || "./data/twenty-twenty.db";

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

export function tableHasColumn(tableName: string, columnName: string): boolean {
  const columns = sqlite
    .prepare(`PRAGMA table_info('${tableName.replace(/'/g, "''")}')`)
    .all() as Array<{ name?: string }>;

  return columns.some((column) => column.name === columnName);
}

export function runSqliteStatement(query: string, params: Record<string, unknown>) {
  return sqlite.prepare(query).run(params);
}

export { schema };
export * from "./schema.js";
