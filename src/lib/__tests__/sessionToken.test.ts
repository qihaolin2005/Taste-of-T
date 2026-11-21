import { describe, expect, it } from "vitest";
import { signUserId, verifyToken } from "@/lib/sessionToken";

const SECRET = "test-secret";

describe("session token", () => {
  it("round-trips a user id", () => {
    expect(verifyToken(signUserId("user_123", SECRET), SECRET)).toBe("user_123");
  });

  it("rejects a token whose user id was edited", () => {
    const [, sig] = signUserId("user_123", SECRET).split(".");
    expect(verifyToken(`user_999.${sig}`, SECRET)).toBeNull();
  });

  it("rejects tokens signed with another secret, and junk", () => {
    expect(verifyToken(signUserId("user_123", "other"), SECRET)).toBeNull();
    expect(verifyToken("no-dot", SECRET)).toBeNull();
    expect(verifyToken(undefined, SECRET)).toBeNull();
  });
});
