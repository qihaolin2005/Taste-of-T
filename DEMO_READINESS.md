# Taste of T: demo readiness report

Uncommitted on `main` · nothing pushed, merged or deployed · no secrets in the diff (scanned).
Start-up steps and the demo script: [DEMO_MORNING.md](DEMO_MORNING.md).

## 1. What was fixed

| Area | Problem (verified) | Fix |
|---|---|---|
| Restaurant names | Chinese/Korean names drew as boxes: fonts are Latin-only and no CJK font was named | CJK system fonts added to the font stacks (`globals.css`, login/onboarding/home/auth CSS). Names are unchanged. |
| Adventure budget | A $30 squad got $$$ places: the group deck never checked budget | Deck uses the squad's tightest budget; if too few fit, the cheapest others fill in and a note says so (no amounts shown, budgets stay private) |
| Adventure stops | "Activity" offered karaoke/bowling | New groups: Dinner → Dessert or boba → **Late-Night Bites** (swipes food). Old Activity groups still load. |
| Starting from / Going home to | Dropdowns only | Search box: T stations + Google addresses (Boston), keyboard support, saved as the nearest T station |
| Claim Points | Showed the wrong restaurant (spun place missing from list) | Spun/requested place listed first if eligible; clear message if not |
| Spin | Repeats; members-only clubs; unlisted prices counted as in budget | Skips recent spins; skips private clubs; prefers listed prices; "No exact matches" banner names exactly which filters were relaxed |
| Photos | Blank boxes while loading / no photo | Loading pulse, "No photo yet" fallback, errors drop to the fallback, on all 5 restaurant photo spots |
| Google Maps link | Opened a nearby store (Saks) | Sends the Google Place ID + name |
| Maps quota | Quota error | `NEXT_PUBLIC_DEMO_MODE=true` → offline MBTA map, labeled |
| Copy | Mixed wording | Start Trip, Track Your Adventure, Finish Trip, Create Adventure (+ invite code note), Group Voting Progress, Group Favorites, accurate reward rules |
| Layout | Adventure button buried; Home header corners square | Join / Create cards; rounded header |

## 2. Tested and passed

- **Checks:** TypeScript 0 errors, ESLint clean, **398/398 tests**, and the **production build** compiles and generates all 57 pages.
- **Headless iPhone browser (393 px and 375 px):** Home, Spin, Adventure, T Map, Profile, Rewards, Claim, My Trips.
  - No runtime errors, no 5xx, no horizontal scroll, nothing behind the bottom nav, no clipped text.
  - All 17 internal links resolve.
- **Two real accounts, real API:** create → bad code (404) → both join → start → 10 cards ($30 cap: no $$$) → live progress → same winner for both → winner still shown after reload → route links present.
- **Spin flows:** exact match (no banner), craving relaxed, craving + budget relaxed, unlisted price, no repeats over 6 spins including after a reload.
- **Location search:** station match, Google address → nearest station (40 College Ave → Davis), no-match message, ↓ and Escape, saved `homeStationId` checked in the DB.
- **New regression tests:** group budget, Late-Night Bites, food-only stops, station search, claim list, Spin fallback and price rules, Place ID links, members-only filter.

## 3. Not verified (needs a real device or person)

- GPS arrival and "Finish Trip" at a real restaurant, and the quest points awarded server-side.
- Receipt photo scanning (camera + Gemini). Validation logic is unit-tested (117 tests in rewards).
- Live MBTA trains/rides on the move; verified-ride travel points.
- Real iPhone Safari rendering. Headless Chrome was used, and CJK fonts named are standard on iOS.
- Google sign-in.

## 4. Files changed tonight (in this session)

- **App and UI:**
  - `src/app/globals.css`, `src/app/login/page.tsx`, `src/app/onboarding/page.tsx`, `src/app/room/new/page.tsx`, `src/app/map/page.tsx`
  - `src/components/auth/auth-intro.css`, `src/components/home/{HomeScreen.tsx,home.css}`
  - `src/components/group/{CreateRoomForm,MemberForm,RoomScreen,SquadSession,SquadPlanView}.tsx`, new `HomeLocationSearch.tsx`
  - `src/components/solo/{QuestCard,SpinScreen}.tsx`, `src/components/shared/PlacePhoto.tsx`
  - `src/components/rewards/{ClaimVisitScreen,RewardsScreen}.tsx`, `src/components/trips/{TripRecorderCard,TripMap}.tsx`
  - `src/components/game/{TMap,TrendingList}.tsx`, `src/components/game/map/{GoogleTMap,RouteCard}.tsx`
- **Logic:**
  - `src/features/ml/session.ts`, `src/features/squads/service.ts`, `src/features/rooms/schemas.ts`
  - `src/features/spin/generateQuest.ts`, `src/features/rewards/service.ts`, `src/app/api/rewards/eligible/route.ts`
  - `src/features/directions/types.ts`, `src/lib/places/googleMapping.ts`
  - New: `src/lib/places/locationSearch.ts`, `src/app/api/places/{autocomplete,resolve}/route.ts`
- **Tests:**
  - `src/features/{directions,rewards,rooms,spin,squads}/__tests__/*`, `src/lib/places/__tests__/places.test.ts`
  - New: `src/features/ml/__tests__/groupBudget.test.ts`, `src/lib/places/__tests__/locationSearch.test.ts`
- **Not touched:** schema, `.env*` (except `.env.local` demo flag, gitignored), the Adventure worktree.
- **Teammate-owned files edited:** P1 (ml, spin, rewards, squads), P2 (places), P4 (maps, trips). Tell them before merging.

## 5. Production build

**Passes** (`npm run build`). One harmless warning about a `package-lock.json` in the parent folder.

## 6. Demo risks

Phone link drops when the Mac sleeps · first Spin after start-up is slower (Google lookups) ·
indoor GPS is rough · MBTA rate limit without a key · see DEMO_MORNING.md §5 for fallbacks.

## 7. Start tomorrow

```bash
cd ~/taste-of-the-t/Taste-of-T
caffeinate -d &
npm run dev:phone
```
