// Prisma client for tests. globalSetup.ts builds one template DB from the schema; each
// call here copies it to a fresh file, so test files run in parallel without SQLite
// "database is locked" (SQLITE_BUSY) errors and can't see each other's rows.
import { copyFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { inject } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";

export function createTestDb(): PrismaClient {
  const template = inject("testDbUrl").replace(/^file:/, "");
  const copy = join(dirname(template), `test-${randomUUID()}.db`);
  copyFileSync(template, copy);
  return new PrismaClient({ adapter: new PrismaLibSql({ url: `file:${copy}` }) });
}
