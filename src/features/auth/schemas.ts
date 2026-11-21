// Owner: P2 - Data & Integrations (see TEAM.md)
import { z } from "zod";
import { DIETARY_VOCAB } from "@/features/ml/vocab";

const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")).pipe(z.string().max(254));
const password = z.string().min(8, "Password must be at least 8 characters").max(200);

export const signUpSchema = z.object({ email, password, displayName: z.string().trim().min(1).max(40).optional() }).strict();
export type SignUpInput = z.infer<typeof signUpSchema>;

export const logInSchema = z.object({ email, password: z.string().min(1).max(200) }).strict();
export type LogInInput = z.infer<typeof logInSchema>;

/** First-run onboarding. Dietary values come from a fixed list so the planner and ML can rely on them. */
export const onboardingSchema = z
  .object({
    dietary: z.array(z.enum(DIETARY_VOCAB)).max(DIETARY_VOCAB.length).transform((d) => [...new Set(d)]),
    avoid: z
      .array(z.string().trim().toLowerCase().min(1).max(32))
      .max(20)
      .transform((a) => [...new Set(a)])
      .optional(),
    displayName: z.string().trim().min(1).max(40).optional(),
  })
  .strict();
export type OnboardingInput = z.infer<typeof onboardingSchema>;
