# Taste of T: demo morning

Everything below is **uncommitted** on `main` (nothing pushed, merged or deployed).
Full audit notes: [DEMO_READINESS.md](DEMO_READINESS.md).

## 1. Start the app (do this first, ~1 min)

```bash
cd ~/taste-of-the-t/Taste-of-T
caffeinate -d &                 # keep the Mac awake (the phone link dies if it sleeps)
npm run dev:phone               # starts the app AND an https link + QR code for the iPhone
```

- Computer: http://localhost:3000
- iPhone: scan the QR code it prints, open in Safari, tap **Allow** for location.
- The phone link changes every time you run it. If it stops loading, Ctrl+C and run it again.
- If the database looks out of date after a `git pull`: `npm run db:push && npm run db:generate` (additive only).

## 2. Environment variables (names only)

In `.env` (gitignored): `SESSION_SECRET`, `DATABASE_URL`, `PLACES_API_KEY`, `ROUTES_API_KEY`,
`GEMINI_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
Optional: `MBTA_API_KEY` (without it: 20 MBTA requests/min), `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`,
`TURSO_AUTH_TOKEN`, `ML_MODEL_URL`, `ML_MODEL_TOKEN`, `PLACES_CACHE_TTL_MIN`, `PLACES_TIMEOUT_MS`.
In `.env.local` (gitignored): `NEXT_PUBLIC_DEMO_MODE=true` (offline T map, no Google Maps quota).

## 3. 60-second walkthrough

1. **Home (5 s)**: "hi, name!", T Points, stations, missions.
2. **Spin the T (20 s)**: 1 mi, $$, Anything → **Spin** → restaurant card with photo, price, rating,
   "Why this spot" → **Route on the T Map** (real walk/T directions; "Open in Google Maps" opens that exact place).
3. **Adventure (30 s)**: show the Join card, then **Create Adventure** (Dinner → Dessert or boba →
   Late-Night Bites) → code appears → second phone joins with the code → **Start** → both swipe 10
   cards ("Group Voting Progress" updates live) → same #1 for both → route it on the T Map.
4. **Rewards (5 s)**: Profile → Rewards: how points are earned (arrive at a quest, receipt claims, achievements).

Tip: pre-make the Adventure with both phones joined before you present, then start it live.

## 4. Test right before presenting (5 min)

- [ ] Phone link loads in Safari; location allowed.
- [ ] One Spin near the venue returns a place with a photo.
- [ ] Route on the T Map draws a route; label says "Demo mode · offline map".
- [ ] Two phones: create → join by code → start → swipe → same winner on both.
- [ ] Profile and Rewards open without errors.

## 5. If something fails

| Problem | Do this |
|---|---|
| Google Maps quota / blank map | Already handled: demo mode draws the offline MBTA map. Don't remove `NEXT_PUBLIC_DEMO_MODE`. |
| Places API down / no Spin results | Try a bigger distance or "Any" budget. Spin shows a clear error, never fake places. |
| Directions fail | Route card shows the error; "Open in Google Maps" still works. |
| Phone link dead | Ctrl+C, `npm run dev:phone` again, new QR. Or demo on the laptop at localhost:3000/demo (iPhone frame). |
| GPS denied / indoors | Spin uses the saved location (says so). Don't demo "Finish Trip" arrival indoors. |
| Receipt scan (Gemini) fails | Skip it in the demo; Claim Points needs a real receipt by design. |

## 6. Known risks (not fixed tonight)

- **Trip arrival and points** need real GPS at the restaurant; not demo-able from a stage.
- **Receipt scanning** needs a real receipt + Gemini; not tested tonight with a camera.
- **Live trains** need the MBTA API; without `MBTA_API_KEY` it's rate limited (20/min).
- **Late-Night Bites** swipes regular restaurants; it doesn't yet prefer places open late.
- **Old groups** with an "Activity" stop still work and still show "Activity".
- `package-lock.json` shows as modified but isn't from tonight's work; don't commit it.
