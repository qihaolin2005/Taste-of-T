import { afterAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { createGuest } from "@/features/auth";
import { updatePreferences } from "@/features/users";
import {
  bostonDate,
  CODE_ALPHABET,
  createRoom,
  createRoomSchema,
  generateCode,
  getRoomView,
  joinRoom,
  leaveRoom,
  MAX_MEMBERS,
  memberInputSchema,
  normalizeCode,
  RoomFullError,
  RoomNotFoundError,
  AlreadyInRoomError,
  NotHostError,
  currentRoomCode,
  deleteRoom,
  RoomEndedError,
} from "@/features/rooms";
import { roomErrorResponse, tooManyMisses } from "@/features/rooms/http";

const db = createTestDb();
afterAll(() => db.$disconnect());

const night = createRoomSchema.parse({ name: "Friday crew", day: "tonight", startTime: 1140, slots: ["dessert", "dinner"] });
const me = (name: string, budget = 30) =>
  memberInputSchema.parse({ name, startStationId: "place-chncl", homeStationId: "place-harsq", budget });
const newUser = async () => (await createGuest(db)).id;

describe("codes", () => {
  it("are 4 letters without I or O", () => {
    for (let i = 0; i < 500; i++) {
      const c = generateCode();
      expect(c).toMatch(/^[A-Z]{4}$/);
      expect(c).not.toMatch(/[IO]/);
      for (const ch of c) expect(CODE_ALPHABET).toContain(ch);
    }
  });

  it("normalize typing: case, spaces, dashes; reject junk", () => {
    expect(normalizeCode(" bhsg ")).toBe("BHSG");
    expect(normalizeCode("BH-SG")).toBe("BHSG");
    expect(normalizeCode("BHS")).toBeNull();
    expect(normalizeCode("B0SG")).toBeNull();
    expect(normalizeCode("BIOS")).toBeNull(); // I and O aren't in the alphabet
  });
});

describe("rooms", () => {
  it("creates a room with a code and canonical stop order", async () => {
    const host = await newUser();
    const code = await createRoom(db, host, night);
    const room = await getRoomView(db, code, host);
    expect(room).toMatchObject({ code, name: "Friday crew", startTime: 1140, slots: ["dinner", "dessert"], youAreHost: true, you: null, members: [] });
    expect(room.date).toBe(bostonDate("tonight"));
  });

  it("never hands out a live room's code; reuses expired codes", async () => {
    const host = await newUser();
    const otherHost = await newUser(); // one live group per person, so a second host
    const codes = ["QQQQ", "QQQQ", "WWWW"];
    const first = await createRoom(db, host, night, new Date(), () => "QQQQ");
    const second = await createRoom(db, otherHost, night, new Date(), () => codes.shift()!);
    expect([first, second]).toEqual(["QQQQ", "WWWW"]);

    const later = new Date(Date.now() + 3 * 24 * 3600_000); // QQQQ has expired by now
    expect(await createRoom(db, host, night, later, () => "QQQQ")).toBe("QQQQ");
  });

  it("lets anyone join with the code (any case), and shows them to everyone", async () => {
    const host = await newUser();
    const friend = await newUser();
    const code = await createRoom(db, host, night);
    await joinRoom(db, code, host, me("Host"));
    const view = await joinRoom(db, code.toLowerCase(), friend, me("Sam"));
    expect(view.members.map((m) => m.name)).toEqual(["Host", "Sam"]);
    expect(view.members.find((m) => m.name === "Host")!.isHost).toBe(true);
    expect(view.members.find((m) => m.name === "Sam")!.isYou).toBe(true);
    expect(view.members[0].startStation).toEqual({ id: "place-chncl", name: "Chinatown" });
  });

  it("joining again updates your info instead of adding a duplicate", async () => {
    const host = await newUser();
    const code = await createRoom(db, host, night);
    await joinRoom(db, code, host, me("Host", 20));
    const view = await joinRoom(db, code, host, me("Host", 45));
    expect(view.members).toHaveLength(1);
    expect(view.you!.budget).toBe(45);
  });

  it("copies dietary needs and tastes from the member's profile", async () => {
    const host = await newUser();
    const veg = await newUser();
    await updatePreferences(db, veg, { dietary: ["vegetarian"], tastes: ["dumplings"], avoid: ["seafood"] });
    const code = await createRoom(db, host, night);
    const view = await joinRoom(db, code, veg, me("Veg"));
    expect(view.you).toMatchObject({ dietary: ["vegetarian"], tastes: ["dumplings"] });
    const row = await db.roomMember.findFirst({ where: { roomId: code, userId: veg } });
    expect(row!.avoid).toEqual(["seafood"]);
  });

  it("keeps other members' budget, home station, and dietary needs private", async () => {
    const host = await newUser();
    const friend = await newUser();
    await updatePreferences(db, friend, { dietary: ["halal"] });
    const code = await createRoom(db, host, night);
    await joinRoom(db, code, friend, me("Secretive", 99));
    const hostView = await getRoomView(db, code, host);
    const json = JSON.stringify(hostView);
    expect(hostView.you).toBeNull();
    // Check for the fields, not the raw text "99": ids and timestamps (e.g. "…30.799Z") can contain it.
    expect(json).not.toMatch(/"budget"|"homeStation|"dietary"|"leaveBy"/);
    expect(json).not.toContain("place-harsq");
    expect(json).not.toContain("halal");
  });

  it("rejects unknown and expired codes", async () => {
    const host = await newUser();
    await expect(getRoomView(db, "ZZZZ", host)).rejects.toBeInstanceOf(RoomNotFoundError);
    await expect(getRoomView(db, "nope!", host)).rejects.toBeInstanceOf(RoomNotFoundError);
    const code = await createRoom(db, host, night);
    const later = new Date(Date.now() + 3 * 24 * 3600_000);
    // A real code that expired says the group ended (and isn't counted as a guess).
    await expect(joinRoom(db, code, host, me("Late"), later)).rejects.toBeInstanceOf(RoomEndedError);
  });

  it(`caps a group at ${MAX_MEMBERS} people, but members can still update`, async () => {
    const host = await newUser();
    const code = await createRoom(db, host, night);
    const users = await Promise.all(Array.from({ length: MAX_MEMBERS }, newUser));
    for (const [i, u] of users.entries()) await joinRoom(db, code, u, me(`P${i}`));
    await expect(joinRoom(db, code, await newUser(), me("One too many"))).rejects.toBeInstanceOf(RoomFullError);
    await expect(joinRoom(db, code, users[0], me("P0", 50))).resolves.toBeTruthy();
  });

  it("leaving removes you from the room; once everyone has left, it's nobody's group", async () => {
    const host = await newUser();
    const friend = await newUser();
    const code = await createRoom(db, host, night);
    await joinRoom(db, code, host, me("Host"));
    await joinRoom(db, code, friend, me("Sam"));
    await leaveRoom(db, code, friend);
    expect((await getRoomView(db, code, host)).members.map((m) => m.name)).toEqual(["Host"]);
    await leaveRoom(db, code, host);
    expect((await getRoomView(db, code, host)).members).toHaveLength(0);
    expect(await currentRoomCode(db, host)).toBeNull();
    expect(await currentRoomCode(db, friend)).toBeNull();
  });

  it("validates input: unknown station, odd start time, no stops", () => {
    expect(memberInputSchema.safeParse({ name: "A", startStationId: "place-nowhere", homeStationId: "place-harsq", budget: 20 }).success).toBe(false);
    expect(createRoomSchema.safeParse({ name: "x", day: "tonight", startTime: 1145, slots: ["dinner"] }).success).toBe(false);
    expect(createRoomSchema.safeParse({ name: "x", day: "tonight", startTime: 1140, slots: [] }).success).toBe(false);
  });
});

describe("your current group (the Adventure tab brings you back to it)", () => {
  it("is the group you host (even before joining it) or are a member of", async () => {
    const host = await newUser();
    const friend = await newUser();
    expect(await currentRoomCode(db, host)).toBeNull();
    const code = await createRoom(db, host, night);
    expect(await currentRoomCode(db, host)).toBe(code);
    await joinRoom(db, code, friend, me("Sam"));
    expect(await currentRoomCode(db, friend)).toBe(code);
  });

  it("stays until you leave; an expired group doesn't count", async () => {
    const host = await newUser();
    const friend = await newUser();
    const code = await createRoom(db, host, night);
    await joinRoom(db, code, host, me("Host"));
    await joinRoom(db, code, friend, me("Sam"));
    await leaveRoom(db, code, friend);
    expect(await currentRoomCode(db, friend)).toBeNull();
    expect(await currentRoomCode(db, host, new Date(Date.now() + 3 * 24 * 3600_000))).toBeNull();
  });

  it("one group at a time: no starting or joining another while you're in one", async () => {
    const host = await newUser();
    const other = await newUser();
    const mine = await createRoom(db, host, night);
    await expect(createRoom(db, host, night)).rejects.toBeInstanceOf(AlreadyInRoomError);
    const theirs = await createRoom(db, other, night);
    await expect(joinRoom(db, theirs, host, me("Host"))).rejects.toThrow(new RegExp(`already in group ${mine}`));
    await joinRoom(db, mine, host, me("Host")); // your own group is fine
    await joinRoom(db, mine, host, me("Host again")); // and so is updating your info
  });

  it("when the host leaves, the next person who joined becomes host", async () => {
    const host = await newUser();
    const a = await newUser();
    const b = await newUser();
    const code = await createRoom(db, host, night);
    for (const [u, n] of [[host, "Host"], [a, "A"], [b, "B"]] as const) await joinRoom(db, code, u, me(n));
    await leaveRoom(db, code, host);
    expect(await currentRoomCode(db, host)).toBeNull();
    const view = await getRoomView(db, code, a);
    expect(view.youAreHost).toBe(true);
    expect(view.members.map((m) => m.name)).toEqual(["A", "B"]);
  });

  it("only the host can delete the group; then it's nobody's current group", async () => {
    const host = await newUser();
    const friend = await newUser();
    const code = await createRoom(db, host, night);
    await joinRoom(db, code, friend, me("Sam"));
    await db.plan.create({ data: { roomId: code, userId: host, request: {}, result: { picks: [] } } });
    await expect(deleteRoom(db, code, friend)).rejects.toBeInstanceOf(NotHostError);
    await deleteRoom(db, code, host);
    expect(await currentRoomCode(db, host)).toBeNull();
    expect(await currentRoomCode(db, friend)).toBeNull();
    await expect(getRoomView(db, code, friend)).rejects.toBeInstanceOf(RoomEndedError);
    // The night's plan is kept, so its top 5 can still be claimed for points.
    expect(await db.plan.count({ where: { roomId: code } })).toBe(1);
    // Free to start a new one.
    expect(await createRoom(db, friend, night)).toMatch(/^[A-Z]{4}$/);
  });
});

describe("a group that ended", () => {
  it("says it ended (not 'no such code'), and never counts toward the wrong-code lockout", async () => {
    const host = await newUser();
    const friend = await newUser();
    const code = await createRoom(db, host, night);
    await joinRoom(db, code, friend, me("Sam"));
    await deleteRoom(db, code, host);
    await expect(getRoomView(db, code, friend)).rejects.toBeInstanceOf(RoomEndedError);
    await expect(joinRoom(db, code, friend, me("Sam"))).rejects.toBeInstanceOf(RoomEndedError);

    // Friends still on the page poll it: 200 polls from one network must not lock it out.
    const ip = "203.0.113.7";
    for (let i = 0; i < 200; i++) expect(roomErrorResponse(new RoomEndedError(), ip).status).toBe(404);
    expect(tooManyMisses(ip)).toBeNull();
    // Real guessing still gets limited.
    for (let i = 0; i < 31; i++) roomErrorResponse(new RoomNotFoundError(), ip);
    expect(tooManyMisses(ip)?.status).toBe(429);
  });
});
