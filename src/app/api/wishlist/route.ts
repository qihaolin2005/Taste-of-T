// Owner: P4 - Game Layer & Map (see TEAM.md)
//   GET    /api/wishlist -> { wishlist: [{ placeId, addedAt }] }
//   POST   /api/wishlist { placeId } -> { item }
//   DELETE /api/wishlist { placeId } -> 204
import { parseBody } from "@/lib/api";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/requireUser";
import { addToWishlist, listWishlist, removeFromWishlist, wishlistSchema } from "@/features/ratings";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  return Response.json({ wishlist: await listWishlist(db, auth.userId) }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await parseBody(req, wishlistSchema);
  if ("response" in body) return body.response;
  return Response.json({ item: await addToWishlist(db, auth.userId, body.data.placeId) });
}

export async function DELETE(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await parseBody(req, wishlistSchema);
  if ("response" in body) return body.response;
  await removeFromWishlist(db, auth.userId, body.data.placeId);
  return new Response(null, { status: 204 });
}
