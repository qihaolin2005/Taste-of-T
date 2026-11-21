// Prisma client pointed at the per-run test database (see globalSetup.ts).
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { inject } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";

export function createTestDb(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaLibSql({ url: inject("testDbUrl") }) });
}
