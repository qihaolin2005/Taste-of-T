# Taste of T — Team Ownership

Four owners, each with their own folders. You may freely edit files you own.
To change someone else's file, ping them first (or open a small PR they review).
Every stub file starts with an `// Owner:` line.

| Who | Area | Owns |
|-----|------|------|
| **P1** | Planner & Quests | `src/features/planner/`, `src/features/spin/`, `src/features/ml/` (user context, features, model scoring, recommenders), `src/features/squads/` (squad session flow + swipe storage), `src/features/rewards/` (reward points), `api/rewards/**`, `api/me/rewards`, `src/types/index.ts`, `src/lib/time.ts`, `api/plan`, `api/spin`, `api/me/context`, `api/me/recommendations` |
| **P2** | Data & Integrations | `src/lib/mbta/`, `src/lib/places/`, `src/lib/geo.ts`, `src/lib/db.ts`, `src/lib/session*.ts`, `src/lib/password.ts`, `src/lib/rateLimit.ts`, `src/lib/api.ts`, `src/proxy.ts`, `src/features/users/`, `src/features/auth/`, `prisma/`, `data/`, `scripts/`, `api/me/**`, `api/auth/**`, `api/restaurants`, `api/stations` |
| **P3** | Group Mode & App Shell | `src/app/page.tsx`, `spin/`, `room/**`, `login/`, `onboarding/` pages, `demo/`, `src/features/rooms/`, `api/rooms/**`, `src/components/group/`, `solo/`, `shared/` (incl. the iOS kit), `auth/`, `demo/` |
| **P4** | Game Layer & Map | `src/app/map/`, `src/app/profile/`, `src/features/gamification/`, `src/features/ratings/`, `src/lib/identity.ts`, `api/checkin`, `api/ratings`, `api/wishlist`, `src/components/game/`, `public/stamps/` |

## Rules that keep us unblocked

1. **`src/types/index.ts` is the shared contract.** P1 owns it. Agree on it in the first hour; after that, announce any change in chat before pushing.
2. **The planner does not know the mode.** `generatePlan()` takes a list of members. Solo passes one member, group passes all. No `mode` flag, no imports from `rooms/` or `spin/` inside `planner/`.
3. **Import features only through their `index.ts`** (e.g. `@/features/planner`), never deep files from another owner's folder.
4. **Offline first.** Everything must work with empty `.env` using `data/*.json`. Live MBTA/Places calls must fall back automatically.
5. **Every screen uses the iOS kit** in `@/components/shared/ios`: wrap pages in
   `<Screen title=... tab=...>`, use `ListSection`/`ListRow` for forms and lists and `Button`
   for actions, and use the color tokens (`bg-cell`, `text-label-2`, `text-tint`, …) instead of raw
   colors so light/dark mode and the iPhone look stay consistent.
6. **Mock what you depend on.** P3 and P4 can build UI against a hardcoded `Plan`/`Quest` object until P1's planner lands.

## Dependency order (who waits on whom)

```
P1 types ──► everyone
P2 stations.json + seed-restaurants.json ──► P1 planner, P4 map
P1 generatePlan ──► P3 plan page, P1 spin
P2 db.ts + schema ──► P3 rooms, P4 check-ins/ratings
```

## First-hour checklist

- [ ] P1: write the types in `src/types/index.ts`, share with team
- [ ] P2: fill `data/stations.json` and `data/seed-restaurants.json`, Prisma schema
- [ ] P3: Next.js app shell, landing page, nav, StationPicker
- [ ] P4: SVG `TMap` rendering from `stations.json`
