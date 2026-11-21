// Owner: P2 - Data & Integrations (see TEAM.md)
//   POST /api/auth/logout -> 204 (clears the session on this device)
import { clearSession } from "@/lib/session";

export async function POST() {
  await clearSession();
  return new Response(null, { status: 204 });
}
