# Receipt OCR: how it plugs into claiming points

Owner of the claim flow: P1 (rewards). This is the contract for the receipt reader.

## Where it goes

`src/components/rewards/ReceiptScanner.tsx` is an empty placeholder that the claim screen
(`/rewards/claim`, `ClaimVisitScreen.tsx`) already renders above the receipt fields. Replace its
body with the real scanner. Keep the props:

```ts
type ReceiptScannerProps = {
  onRead: (reading: ReceiptReading) => void; // call once you've read a photo
  disabled?: boolean;                        // true while a claim is being sent
};
```

`ReceiptReading` (`src/features/rewards/receipt.ts`). Every field is optional: **leave out what
you couldn't read; don't guess.**

| Field | Example | Notes |
|---|---|---|
| `total` | `42.5` | Grand total in dollars, tip included if printed |
| `date` | `"2026-11-21T19:42:00-05:00"` | When it was printed. Local time without an offset is OK |
| `merchantName` | `"LANTERN DUMPLING HSE #2"` | As printed |
| `receiptNumber` | `"Check 1047"` | Check / order / transaction number |
| `diners` | `3` | Guests / covers, if printed (1-12) |

After `onRead`, the screen fills the fields and says "Read from your photo. Fix anything that
looks wrong." The person can still edit before tapping Claim Points.

## What the server checks (`POST /api/rewards/visits`, `src/features/rewards/service.ts`)

The server never trusts the phone, so OCR doesn't need its own "verified" flag:

1. The place was recommended to them in the last 48 h.
2. The receipt time is within the last 36 h and not in the future.
3. If `merchantName` is sent, it must share a real word with the place's name, so a receipt
   from somewhere else is refused. **This is where OCR helps most:** send the printed name.
4. Same receipt can't be claimed twice. With `receiptNumber` it's matched exactly; without it,
   by place + total + time.
5. They were there: phone location near the place, a recorded trip past it, or a verified ride
   ending near it, within 3 h of the receipt time (`src/features/rewards/presence.ts`).
6. At most one claim per place per day, and 2 claims per day.

## Privacy

- The photo should stay on the phone (OCR in the browser), or if it has to go to a server/API,
  be discarded right after reading. Never store it; we only keep the facts above.
- Don't send the photo to `POST /api/rewards/visits`; it doesn't accept one.

## Testing it with the claim screen

1. Get a recommendation (Spin, or a squad night), then open Profile > Claim points for a meal.
2. Scan a receipt: the total, time and name fields should fill in.
3. Claim at (or near) the restaurant with location on. A receipt from a different restaurant
   should be refused with "This receipt doesn't look like it's from …".
