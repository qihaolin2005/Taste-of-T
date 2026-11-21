// Creates a throwaway SQLite DB from prisma/schema.prisma for integration tests,
// so tests never touch prisma/dev.db. Tests read its URL with inject("testDbUrl").
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    testDbUrl: string;
  }
}

export default function setup(project: TestProject) {
  const dir = mkdtempSync(path.join(tmpdir(), "tot-test-"));
  const url = `file:${path.join(dir, "test.db")}`;
  execSync("npx prisma db push", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  project.provide("testDbUrl", url);
  return () => rmSync(dir, { recursive: true, force: true });
}
