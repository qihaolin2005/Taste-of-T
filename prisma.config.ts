// Owner: P2 - Data & Integrations (see TEAM.md)
// Prisma 7 config. The CLI reads DATABASE_URL from .env (not .env.local).
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
