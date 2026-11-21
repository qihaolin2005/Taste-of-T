// Owner: P2 - Data & Integrations (see TEAM.md)
// Small helpers so every Route Handler returns errors in the same shape:
// { error: { code, message, issues? } }
import type { z } from "zod";

export type ApiErrorCode = "bad_request" | "unauthorized" | "forbidden" | "not_found";

const STATUS: Record<ApiErrorCode, number> = { bad_request: 400, unauthorized: 401, forbidden: 403, not_found: 404 };

export function apiError(code: ApiErrorCode, message: string, issues?: unknown): Response {
  return Response.json({ error: { code, message, ...(issues ? { issues } : {}) } }, { status: STATUS[code] });
}

/** Parse a JSON body against a zod schema. Returns data or a ready-to-return 400 Response. */
export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<{ data: z.infer<T> } | { response: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { response: apiError("bad_request", "Body must be valid JSON") };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return { response: apiError("bad_request", "Invalid request body", issues) };
  }
  return { data: result.data };
}
