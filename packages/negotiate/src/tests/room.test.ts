import { describe, it, expect } from "vitest";
import { Room, PartyIdentity } from "../room.js";

function buyer(): PartyIdentity {
  return {
    agentRegistry: "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e",
    agentId: "1",
    wallet: "0xBUYER",
    maxUnitPrice: 20,
  };
}
function seller(floor = 18): PartyIdentity {
  return {
    agentRegistry: "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e",
    agentId: "2",
    wallet: "0xSELLER",
    floorUnitPrice: floor,
  };
}

// A mock "send" that records frames per party.
function makeParty() {
  const frames: any[] = [];
  const send = (d: string) => frames.push(JSON.parse(d));
  return { frames, send };
}

const co = (role: "buyer" | "seller", round: number, unitPrice: number, qty = 5, terms = "ok", ts?: number) => ({
  type: "counteroffer",
  from: role,
  round,
  payload: { unitPrice, qty, terms },
  ts,
});
const accept = (role: "buyer" | "seller", round: number, ts?: number) => ({
  type: "accept",
  from: role,
  round,
  ts,
});

describe("Room protocol", () => {
  it("rejects a 3rd connection to a full room", () => {
    const r = new Room("r1");
    expect(r.join("buyer", buyer(), () => {})).toBe(true);
    expect(r.join("seller", seller(), () => {})).toBe(true);
    expect(r.join("buyer", buyer(), () => {})).toBe(false); // role taken
    expect(r.join("seller", seller(), () => {})).toBe(false); // room full
    expect(r.isFull).toBe(true);
  });

  it("deal-closed on accept with agreed unitPrice + deterministic hash", () => {
    const b = makeParty();
    const s = makeParty();
    let notified: any = null;
    const r = new Room("r2", {}, (res) => (notified = res));
    r.join("buyer", buyer(), b.send);
    r.join("seller", seller(), s.send);

    r.handle("buyer", co("buyer", 1, 20, 5, "ok", 1));
    r.handle("seller", co("seller", 2, 19, 5, "ok", 2));
    r.handle("buyer", accept("buyer", 3, 3));

    // both parties see deal-closed
    const bClosed = b.frames.find((f: any) => f.kind === "deal-closed");
    const sClosed = s.frames.find((f: any) => f.kind === "deal-closed");
    expect(bClosed).toBeTruthy();
    expect(sClosed).toBeTruthy();
    expect(bClosed.deal.unitPrice).toBe(19);
    expect(bClosed.deal.totalUsdc).toBe(95); // 19 * 5
    expect(bClosed.transcriptHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(notified.roomId).toBe("r2");

    // determinism: same sequence → same hash
    const b2 = makeParty();
    const s2 = makeParty();
    const r2 = new Room("r3");
    r2.join("buyer", buyer(), b2.send);
    r2.join("seller", seller(), s2.send);
    r2.handle("buyer", co("buyer", 1, 20, 5, "ok", 1));
    r2.handle("seller", co("seller", 2, 19, 5, "ok", 2));
    r2.handle("buyer", accept("buyer", 3, 3));
    const closed2 = b2.frames.find((f: any) => f.kind === "deal-closed") as any;
    expect(closed2.transcriptHash).toBe(bClosed.transcriptHash);
  });

  it("out-of-turn message is rejected with system: error and ignored", () => {
    const b = makeParty();
    const s = makeParty();
    const r = new Room("r4");
    r.join("buyer", buyer(), b.send);
    r.join("seller", seller(), s.send);
    // seller sends before buyer (turn is buyer)
    r.handle("seller", co("seller", 1, 19));
    const err = s.frames.find((f: any) => f.kind === "error");
    expect(err).toBeTruthy();
    expect(err.message).toMatch(/out of turn/);
    // turn unchanged → still buyer
    r.handle("buyer", co("buyer", 1, 20));
    expect(b.frames.some((f: any) => f.type === "counteroffer")).toBe(true);
  });

  it("maxRounds=2 → constraint-hit after two rounds with no accept", () => {
    const b = makeParty();
    const s = makeParty();
    const r = new Room("r5", { maxRounds: 2, minDelta: 0.01 });
    r.join("buyer", buyer(), b.send);
    r.join("seller", seller(), s.send);
    r.handle("buyer", co("buyer", 1, 20, 5, "a", 1));
    r.handle("seller", co("seller", 2, 19, 5, "b", 2));
    r.handle("buyer", co("buyer", 3, 18, 5, "c", 3));
    r.handle("seller", co("seller", 4, 17, 5, "d", 4));
    const hit = b.frames.find((f: any) => f.kind === "constraint-hit");
    expect(hit).toBeTruthy();
    expect(hit.reason).toMatch(/maxRounds/);
  });

  it("minDelta violation is rejected", () => {
    const b = makeParty();
    const s = makeParty();
    const r = new Room("r6", { minDelta: 1 });
    r.join("buyer", buyer(), b.send);
    r.join("seller", seller(), s.send);
    r.handle("buyer", co("buyer", 1, 20, 5, "a", 1));
    // seller moves only 0.5 (< minDelta 1) from 20
    r.handle("seller", co("seller", 2, 19.5, 5, "b", 2));
    const err = s.frames.find((f: any) => f.kind === "error");
    expect(err).toBeTruthy();
    expect(err.message).toMatch(/minDelta/);
  });

  it("buyer may not accept above its maxUnitPrice", () => {
    const b = makeParty();
    const s = makeParty();
    const r = new Room("r7");
    r.join("buyer", buyer(), b.send);
    r.join("seller", seller(25), s.send); // seller floor 25, above buyer ceiling 20
    r.handle("buyer", co("buyer", 1, 20, 5, "a", 1));
    r.handle("seller", co("seller", 2, 25, 5, "b", 2));
    r.handle("buyer", accept("buyer", 3, 3));
    const err = b.frames.find((f: any) => f.kind === "error");
    expect(err).toBeTruthy();
    expect(err.message).toMatch(/ceiling/);
  });

  it("notifyDeal called with contract §5 shape on close", async () => {
    let received: any = null;
    const b = makeParty();
    const s = makeParty();
    const r = new Room("r8", {}, (res) => (received = res));
    r.join("buyer", buyer(), b.send);
    r.join("seller", seller(), s.send);
    r.handle("buyer", co("buyer", 1, 20, 5, "a", 1));
    r.handle("seller", co("seller", 2, 19, 5, "b", 2));
    r.handle("buyer", accept("buyer", 3, 3));
    expect(received).toBeTruthy();
    expect(received.roomId).toBe("r8");
    expect(received.deal.buyer.agentId).toBe("1");
    expect(received.deal.seller.agentId).toBe("2");
    expect(received.deal.totalUsdc).toBe(95);
  });
});

describe("Room lifecycle — join orders and disconnect/reconnect", () => {
  const ready = (frames: any[]) => frames.find((f: any) => f.message?.includes("room ready"));

  it("buyer-first and seller-first both produce a ready room", () => {
    // buyer opens the room first, seller second
    const b1 = makeParty();
    const s1 = makeParty();
    const r1 = new Room("r_order_1");
    r1.join("buyer", buyer(), b1.send);
    expect(r1.isFull).toBe(false);
    r1.join("seller", seller(), s1.send);
    expect(r1.isFull).toBe(true);
    expect(ready(b1.frames)).toBeTruthy();
    expect(ready(s1.frames)).toBeTruthy();

    // seller opens the room first, buyer second
    const b2 = makeParty();
    const s2 = makeParty();
    const r2 = new Room("r_order_2");
    r2.join("seller", seller(), s2.send);
    expect(r2.isFull).toBe(false);
    r2.join("buyer", buyer(), b2.send);
    expect(r2.isFull).toBe(true);
    expect(ready(b2.frames)).toBeTruthy();
    expect(ready(s2.frames)).toBeTruthy();
  });

  it("leave() releases the role slot so the same role can rejoin (no ghost occupant)", () => {
    const b = makeParty();
    const s = makeParty();
    const r = new Room("r_leave_1");
    expect(r.join("buyer", buyer(), b.send)).toBe(true);
    expect(r.join("seller", seller(), s.send)).toBe(true);
    expect(r.isFull).toBe(true);

    // seller socket drops → slot released, remaining party notified
    r.leave("seller");
    expect(r.isFull).toBe(false);
    expect(b.frames.some((f: any) => f.message === "seller left")).toBe(true);

    // a new seller socket can join the same role again
    const s2 = makeParty();
    expect(r.join("seller", seller(), s2.send)).toBe(true);
    expect(r.isFull).toBe(true);
    expect(ready(b.frames)).toBeTruthy();
    expect(ready(s2.frames)).toBeTruthy();

    // duplicate role still rejected while the slot is occupied
    expect(r.join("seller", seller(), makeParty().send)).toBe(false);
  });

  it("leave() clears the turn until the counterparty rejoins; rejoining RESUMES the correct turn", () => {
    const b = makeParty();
    const s = makeParty();
    const r = new Room("r_rejoin");
    r.join("buyer", buyer(), b.send);
    r.join("seller", seller(), s.send);
    r.handle("buyer", co("buyer", 1, 20, 5, "a", 1)); // turn → seller

    // buyer drops mid-negotiation: turn is cleared, seller cannot move alone
    r.leave("buyer");
    r.handle("seller", co("seller", 2, 19, 5, "b", 2));
    expect(s.frames.some((f: any) => f.kind === "error")).toBe(true);

    // buyer rejoins → room ready again, but the turn RESUMES as seller (the
    // opposite of the last action) — never resets to buyer, so the buyer cannot
    // move twice in a row after a reconnect. A snapshot restores the room.
    expect(r.join("buyer", buyer(), b.send)).toBe(true);
    const readyFrames = b.frames.filter((f: any) => f.message?.includes("room ready"));
    const lastReady = readyFrames[readyFrames.length - 1];
    expect(lastReady).toBeTruthy();
    expect(lastReady.message).toContain("seller to move");
    const resume = b.frames.find((f: any) => f.kind === "resume");
    expect(resume).toBeTruthy();
    expect(resume.turn).toBe("seller");
    expect(resume.transcript).toHaveLength(1);

    // buyer must NOT move again — still the seller's turn
    r.handle("buyer", co("buyer", 3, 18, 5, "c", 3));
    expect(b.frames.some((f: any) => f.kind === "error")).toBe(true);

    // seller responds → negotiation continues correctly
    r.handle("seller", co("seller", 2, 19, 5, "b", 2));
    expect(s.frames.filter((f: any) => f.type === "counteroffer").length).toBeGreaterThan(0);
  });
});

describe("Room turn/role correctness (regression)", () => {
  // The last "room ready — X to move" frame (a room emits one per join).
  const lastReady = (frames: any[]) =>
    frames.filter((f: any) => f.message?.includes("room ready")).pop();
  const lastError = (frames: any[]) => frames.filter((f: any) => f.kind === "error").pop();

  it("1. buyer moves first -> seller can respond", () => {
    const b = makeParty();
    const s = makeParty();
    const r = new Room("turn_1");
    r.join("buyer", buyer(), b.send);
    r.join("seller", seller(), s.send);
    r.handle("buyer", co("buyer", 1, 20, 5, "a", 1)); // turn → seller
    r.handle("seller", co("seller", 2, 19, 5, "b", 2)); // seller's valid response
    expect(s.frames.some((f: any) => f.type === "counteroffer" && f.from === "seller")).toBe(true);
    expect(s.frames.some((f: any) => f.kind === "error")).toBe(false);
  });

  it("2. seller response -> buyer can respond", () => {
    const b = makeParty();
    const s = makeParty();
    const r = new Room("turn_2");
    r.join("buyer", buyer(), b.send);
    r.join("seller", seller(), s.send);
    r.handle("buyer", co("buyer", 1, 20, 5, "a", 1)); // turn → seller
    r.handle("seller", co("seller", 2, 19, 5, "b", 2)); // turn → buyer
    r.handle("buyer", co("buyer", 3, 18, 5, "c", 3)); // buyer can move again
    expect(b.frames.filter((f: any) => f.type === "counteroffer" && f.from === "buyer").length).toBeGreaterThan(1);
    expect(b.frames.some((f: any) => f.kind === "error")).toBe(false);
  });

  it("3. invalid seller price is rejected but seller remains able to make a valid response", () => {
    const b = makeParty();
    const s = makeParty();
    const r = new Room("turn_3", { minDelta: 1 });
    r.join("buyer", buyer(), b.send);
    r.join("seller", seller(), s.send);
    r.handle("buyer", co("buyer", 1, 20, 5, "a", 1)); // turn → seller
    // invalid move: price moved < minDelta → rejected, turn NOT advanced
    r.handle("seller", co("seller", 2, 19.5, 5, "b", 2));
    const err = lastError(s.frames);
    expect(err).toBeTruthy();
    expect(err.message).toMatch(/minDelta/);
    expect(s.frames.some((f: any) => f.type === "counteroffer" && f.from === "seller")).toBe(false);
    // the seller can still respond with a valid price on the same turn
    r.handle("seller", co("seller", 2, 19, 5, "b", 2));
    expect(s.frames.some((f: any) => f.type === "counteroffer" && f.from === "seller")).toBe(true);
    // turn advanced ONLY after the valid move → now buyer
    r.handle("buyer", co("buyer", 3, 18, 5, "c", 3));
    expect(b.frames.some((f: any) => f.type === "counteroffer" && f.from === "buyer")).toBe(true);
  });

  it("4. accept is allowed when it is the seller's turn", () => {
    const b = makeParty();
    const s = makeParty();
    const r = new Room("turn_4");
    r.join("buyer", buyer(), b.send);
    r.join("seller", seller(), s.send);
    r.handle("buyer", co("buyer", 1, 20, 5, "a", 1)); // turn → seller
    r.handle("seller", accept("seller", 2, 2)); // seller accepts buyer's offer
    const closed = s.frames.find((f: any) => f.kind === "deal-closed");
    expect(closed).toBeTruthy();
    expect(closed.deal.unitPrice).toBe(20);
    expect(s.frames.some((f: any) => f.kind === "error")).toBe(false);
  });

  it("price-floor rejection does NOT advance or corrupt the turn", () => {
    const b = makeParty();
    const s = makeParty();
    const r = new Room("turn_floor");
    r.join("buyer", buyer(), b.send);
    r.join("seller", seller(25), s.send); // seller floor 25 > buyer's offer 20
    r.handle("buyer", co("buyer", 1, 20, 5, "a", 1)); // turn → seller
    // seller accepts a price below its floor → rejected, turn left untouched
    r.handle("seller", accept("seller", 2, 2));
    const err = lastError(s.frames);
    expect(err).toBeTruthy();
    expect(err.message).toMatch(/floor/);
    expect(s.frames.some((f: any) => f.kind === "deal-closed")).toBe(false);
    // seller is still on its turn and can make a valid counteroffer
    r.handle("seller", co("seller", 2, 25, 5, "b", 2));
    expect(s.frames.some((f: any) => f.type === "counteroffer" && f.from === "seller")).toBe(true);
  });

  it("5. out-of-turn buyer action is rejected", () => {
    const b = makeParty();
    const s = makeParty();
    const r = new Room("turn_5");
    r.join("buyer", buyer(), b.send);
    r.join("seller", seller(), s.send);
    r.handle("buyer", co("buyer", 1, 20, 5, "a", 1)); // turn → seller
    r.handle("buyer", co("buyer", 2, 19, 5, "b", 2)); // buyer again → out of turn
    const err = lastError(b.frames);
    expect(err).toBeTruthy();
    expect(err.message).toBe("out of turn (expected seller)");
    // turn is NOT corrupted — the seller can still respond
    r.handle("seller", co("seller", 2, 19, 5, "b", 2));
    expect(s.frames.some((f: any) => f.type === "counteroffer" && f.from === "seller")).toBe(true);
  });

  it("6. reconnect preserves the correct role and resumes the turn", () => {
    const b = makeParty();
    const s = makeParty();
    const r = new Room("turn_6");
    r.join("buyer", buyer(), b.send);
    r.join("seller", seller(), s.send);
    r.handle("buyer", co("buyer", 1, 20, 5, "a", 1)); // turn → seller

    // buyer's socket drops and rejoins with the SAME role
    r.leave("buyer");
    const b2 = makeParty();
    expect(r.join("buyer", buyer(), b2.send)).toBe(true);

    // snapshot restores the room: buyer is still the buyer, turn is still seller
    const resume = b2.frames.find((f: any) => f.kind === "resume");
    expect(resume).toBeTruthy();
    expect(resume.turn).toBe("seller");
    expect(resume.transcript).toHaveLength(1);
    const readyFrame = lastReady(b2.frames);
    expect(readyFrame).toBeTruthy();
    expect(readyFrame.message).toContain("seller to move");

    // buyer must NOT move again (still seller's turn after the reconnect)
    r.handle("buyer", co("buyer", 3, 18, 5, "c", 3));
    expect(b2.frames.some((f: any) => f.kind === "error")).toBe(true);
    // seller can respond on the resumed turn
    r.handle("seller", co("seller", 2, 19, 5, "b", 2));
    expect(s.frames.some((f: any) => f.type === "counteroffer" && f.from === "seller")).toBe(true);
  });

  it("7. two rooms cannot affect each other's turns", () => {
    const aB = makeParty();
    const aS = makeParty();
    const bB = makeParty();
    const bS = makeParty();
    const roomA = new Room("turn_a");
    const roomB = new Room("turn_b");
    roomA.join("buyer", buyer(), aB.send);
    roomA.join("seller", seller(), aS.send);
    roomB.join("buyer", buyer(), bB.send);
    roomB.join("seller", seller(), bS.send);

    // buyer moves in room A only → room B is untouched (its buyer can still move)
    roomA.handle("buyer", co("buyer", 1, 20, 5, "a", 1));
    roomB.handle("buyer", co("buyer", 1, 20, 5, "a", 1));
    expect(bB.frames.some((f: any) => f.type === "counteroffer" && f.from === "buyer")).toBe(true);

    // seller in room B moves → room A's turn is NOT consumed
    roomB.handle("seller", co("seller", 2, 19, 5, "b", 2));
    roomA.handle("seller", co("seller", 2, 19, 5, "b", 2));
    expect(aS.frames.some((f: any) => f.type === "counteroffer" && f.from === "seller")).toBe(true);

    // room B's buyer moves again — no cross-room state leaked into either side
    roomB.handle("buyer", co("buyer", 3, 18, 5, "c", 3));
    expect(bB.frames.filter((f: any) => f.type === "counteroffer" && f.from === "buyer").length).toBeGreaterThan(1);
    expect(bS.frames.some((f: any) => f.kind === "error")).toBe(false);
  });
});

describe("minDelta is price-scale adaptive (regression)", () => {
  // Realistic micro USDC scale (0.000090–0.000200) for the bound checks; the
  // counteroffer-only tests reuse the default identities because minDelta does
  // not consult identity bounds.
  const microBuyer = (): PartyIdentity => ({
    agentRegistry: "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e",
    agentId: "1",
    wallet: "0xBUYER",
    maxUnitPrice: 0.0002,
  });
  const microSeller = (floor = 0.0001): PartyIdentity => ({
    agentRegistry: "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e",
    agentId: "2",
    wallet: "0xSELLER",
    floorUnitPrice: floor,
  });
  const lastError = (frames: any[]) => frames.filter((f: any) => f.kind === "error").pop();

  it("1. micro scale: 0.000090 -> 0.000100 is a valid move under the adaptive default", () => {
    const b = makeParty();
    const s = makeParty();
    const r = new Room("md_micro_valid"); // DEFAULT config — no explicit minDelta
    r.join("buyer", buyer(), b.send);
    r.join("seller", seller(), s.send);
    r.handle("buyer", co("buyer", 1, 0.00009, 1, "a", 1));
    // 0.000100 is ~11% above the opposing 0.00009 -> well above the 1% default
    r.handle("seller", co("seller", 2, 0.0001, 1, "b", 2));
    expect(s.frames.some((f: any) => f.type === "counteroffer" && f.from === "seller")).toBe(true);
    expect(s.frames.some((f: any) => f.kind === "error")).toBe(false);
  });

  it("2. micro scale: movement below the adaptive minDelta is rejected, turn preserved", () => {
    const b = makeParty();
    const s = makeParty();
    const r = new Room("md_micro_below");
    r.join("buyer", buyer(), b.send);
    r.join("seller", seller(), s.send);
    r.handle("buyer", co("buyer", 1, 0.00009, 1, "a", 1));
    // +0.0000005 is ~0.6% of 0.00009 -> below the 1% default
    r.handle("seller", co("seller", 2, 0.0000905, 1, "b", 2));
    const err = lastError(s.frames);
    expect(err).toBeTruthy();
    expect(err.message).toMatch(/minDelta/);
    expect(s.frames.some((f: any) => f.type === "counteroffer" && f.from === "seller")).toBe(false);
    // the seller can still move on the same turn with a valid (>= 1%) move
    r.handle("seller", co("seller", 2, 0.0001, 1, "b", 2));
    expect(s.frames.some((f: any) => f.type === "counteroffer" && f.from === "seller")).toBe(true);
  });

  it("3. micro scale: movement above the adaptive minDelta is accepted", () => {
    const b = makeParty();
    const s = makeParty();
    const r = new Room("md_micro_above");
    r.join("buyer", buyer(), b.send);
    r.join("seller", seller(), s.send);
    r.handle("buyer", co("buyer", 1, 0.0002, 1, "a", 1));
    // seller drops ~25% to 0.00015 — large relative move, accepted
    r.handle("seller", co("seller", 2, 0.00015, 1, "b", 2));
    expect(s.frames.some((f: any) => f.type === "counteroffer" && f.from === "seller")).toBe(true);
    expect(s.frames.some((f: any) => f.kind === "error")).toBe(false);
  });

  it("4. micro scale: seller floor is still enforced on accept", () => {
    const b = makeParty();
    const s = makeParty();
    const r = new Room("md_micro_floor");
    r.join("buyer", microBuyer(), b.send);
    r.join("seller", microSeller(0.0001), s.send);
    r.handle("buyer", co("buyer", 1, 0.00009, 1, "a", 1)); // below the seller floor
    r.handle("seller", accept("seller", 2, 2));
    const err = lastError(s.frames);
    expect(err).toBeTruthy();
    expect(err.message).toMatch(/floor/);
    expect(s.frames.some((f: any) => f.kind === "deal-closed")).toBe(false);
  });

  it("5. micro scale: buyer max is still enforced on accept", () => {
    const b = makeParty();
    const s = makeParty();
    const r = new Room("md_micro_max");
    r.join("buyer", microBuyer(), b.send); // buyer max 0.0002
    r.join("seller", microSeller(0.0001), s.send);
    r.handle("buyer", co("buyer", 1, 0.0001, 1, "a", 1));
    r.handle("seller", co("seller", 2, 0.0003, 1, "b", 2)); // above buyer's 0.0002
    r.handle("buyer", accept("buyer", 3, 3));
    const err = lastError(b.frames);
    expect(err).toBeTruthy();
    expect(err.message).toMatch(/ceiling/);
    expect(b.frames.some((f: any) => f.kind === "deal-closed")).toBe(false);
  });

  it("6. large scale: 1% moves pass and sub-1% moves are rejected with the same default config", () => {
    const b = makeParty();
    const s = makeParty();
    const r = new Room("md_large");
    r.join("buyer", buyer(), b.send);
    r.join("seller", seller(), s.send);
    r.handle("buyer", co("buyer", 1, 1000, 1, "a", 1));
    // exactly 1% below 1000 → 990 (float-boundary, handled by tolerance)
    r.handle("seller", co("seller", 2, 990, 1, "b", 2));
    expect(s.frames.some((f: any) => f.type === "counteroffer" && f.from === "seller")).toBe(true);
    expect(s.frames.some((f: any) => f.kind === "error")).toBe(false);
    // next: buyer moves from opposing 990 by 5 (< 1% of 990) → rejected
    r.handle("buyer", co("buyer", 3, 995, 1, "c", 3));
    const err = lastError(b.frames);
    expect(err).toBeTruthy();
    expect(err.message).toMatch(/minDelta/);
  });

  it("7. explicit absolute minDelta is still honored verbatim (old semantics preserved)", () => {
    // large scale with an explicit absolute floor
    const b = makeParty();
    const s = makeParty();
    const r = new Room("md_abs_large", { minDelta: 1 });
    r.join("buyer", buyer(), b.send);
    r.join("seller", seller(), s.send);
    r.handle("buyer", co("buyer", 1, 1000, 1, "a", 1));
    r.handle("seller", co("seller", 2, 999.5, 1, "b", 2)); // 0.5 < 1 → rejected
    expect(lastError(s.frames)?.message).toMatch(/minDelta/);
    r.handle("seller", co("seller", 2, 999, 1, "b", 2)); // 1.0 >= 1 → accepted
    expect(s.frames.some((f: any) => f.type === "counteroffer" && f.from === "seller")).toBe(true);

    // micro scale with an explicit absolute floor (the ui-server scenario)
    const b2 = makeParty();
    const s2 = makeParty();
    const r2 = new Room("md_abs_micro", { minDelta: 0.00001 });
    r2.join("buyer", buyer(), b2.send);
    r2.join("seller", seller(), s2.send);
    r2.handle("buyer", co("buyer", 1, 0.00009, 1, "a", 1));
    r2.handle("seller", co("seller", 2, 0.000095, 1, "b", 2)); // 5e-6 < 1e-5 → rejected
    expect(lastError(s2.frames)?.message).toMatch(/minDelta/);
    r2.handle("seller", co("seller", 2, 0.0001, 1, "b", 2)); // 1e-5 >= 1e-5 → accepted
    expect(s2.frames.some((f: any) => f.type === "counteroffer" && f.from === "seller")).toBe(true);
  });
});
