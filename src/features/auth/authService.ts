// Owner: P2 - Data & Integrations (see TEAM.md)
// Email + password accounts, guests, and first-run onboarding.
import { Prisma } from "@/generated/prisma/client";
import { getDummyHash, hashPassword, verifyPassword } from "@/lib/password";
import { toPublicUser, type Db, type PublicUser } from "@/features/users";
import type { LogInInput, OnboardingInput, SignUpInput } from "./schemas";

export class EmailTakenError extends Error {
  constructor() {
    super("An account with that email already exists. Try signing in.");
  }
}

/**
 * Create an account. If the device is currently a guest, the guest is upgraded in place so
 * their stamps, XP, and preferences carry over. Otherwise a new user is created.
 */
export async function signUp(db: Db, input: SignUpInput, currentUserId: string | null): Promise<PublicUser> {
  if (await db.user.findUnique({ where: { email: input.email }, select: { id: true } })) throw new EmailTakenError();
  const passwordHash = await hashPassword(input.password);
  const data = { email: input.email, passwordHash, ...(input.displayName ? { displayName: input.displayName } : {}) };

  try {
    const current = currentUserId ? await db.user.findUnique({ where: { id: currentUserId }, select: { id: true, email: true } }) : null;
    const user =
      current && current.email === null
        ? await db.user.update({ where: { id: current.id }, data })
        : await db.user.create({ data: { ...data, preferences: { create: {} } } });
    return toPublicUser(user);
  } catch (err) {
    // Two sign-ups with the same email at once: the unique index wins.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new EmailTakenError();
    throw err;
  }
}

/** Returns the user, or null for a wrong email or password (deliberately indistinguishable). */
export async function logIn(db: Db, input: LogInInput): Promise<PublicUser | null> {
  const user = await db.user.findUnique({ where: { email: input.email } });
  if (!user?.passwordHash) {
    await verifyPassword(input.password, await getDummyHash()); // same timing as a real check
    return null;
  }
  return (await verifyPassword(input.password, user.passwordHash)) ? toPublicUser(user) : null;
}

export async function createGuest(db: Db): Promise<PublicUser> {
  return toPublicUser(await db.user.create({ data: { preferences: { create: {} } } }));
}

/** Save the onboarding answers and mark onboarding done. Dietary needs become hard constraints for planning. */
export async function completeOnboarding(db: Db, userId: string, input: OnboardingInput): Promise<PublicUser> {
  const prefs = { dietary: input.dietary, ...(input.avoid ? { avoid: input.avoid } : {}) };
  const [, user] = await db.$transaction([
    db.userPreferences.upsert({ where: { userId }, create: { userId, ...prefs }, update: prefs }),
    db.user.update({
      where: { id: userId },
      data: { onboardedAt: new Date(), ...(input.displayName ? { displayName: input.displayName } : {}) },
    }),
  ]);
  return toPublicUser(user);
}
