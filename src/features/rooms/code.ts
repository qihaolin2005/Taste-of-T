// Owner: P3 - Group Mode & App Shell (see TEAM.md)
// Room join codes: 4 letters, e.g. "BHSG". No I or O, so nobody mixes them up with 1 and 0
// when reading a code out loud or off a phone. 24^4 = 331,776 codes; rooms expire, so codes recycle.
import { randomInt } from "node:crypto";

export const CODE_LENGTH = 4;
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** "  bhsg " -> "BHSG". Returns null if it can't be a room code. */
export function normalizeCode(input: string): string | null {
  const code = input.replace(/[\s-]/g, "").toUpperCase();
  return CODE_RE.test(code) ? code : null;
}
