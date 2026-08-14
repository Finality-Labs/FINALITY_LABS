import { describe, it, expect } from "vitest";
import { Store, matches } from "../store";
import type { Intent, Offer } from "../types";
import { verifyOrRegister } from "../identity";
import { Matchmaker } from "../matchmaker";

const baseIntent: Intent = {
  resource: "gpu", qty: 5, unit: "hour", maxUnitPrice: 20,
  requirements: { cuda: "12.1", gpu: "H100" },
  agentRegistry: "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e",
  agentId: "1", wallet: "0xBUYER",
};
const baseOffer: Offer = {
  resource: "gpu", unit: "hour", unitPrice: 18, terms: "t",
  requirements: { cuda: "12.1", gpu: "H100" },
  agentRegistry: "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e",
  agentId: "2", wallet: "0xSELLER",
};

describe("store.matches", () => {
  it("matches compatible intent+offer", () => {
    expect(matches(baseIntent, baseOffer)).toBe(true);
  });
  it("rejects when offer price > intent max", () => {
    expect(matches(baseIntent, { ...baseOffer, unitPrice: 25 })).toBe(false);
  });
  it("rejects when resource differs", () => {
    expect(matches({ ...baseIntent, resource: "tpu" }, baseOffer)).toBe(false);
  });
  it("rejects when requirement missing on offer", () => {
    expect(matches(baseIntent, { ...baseOffer, requirements: { cuda: "12.1" } })).toBe(false);
  });
});

describe("identity.verifyOrRegister", () => {
  it("accepts valid eip155 + 0x wallet", () => {
    expect(verifyOrRegister({ agentRegistry: "eip155:1:0xabc", agentId: "1", wallet: "0x1234" }))
      .toEqual({ ok: true, registered: false });
  });
  it("rejects bad wallet", () => {
    expect(verifyOrRegister({ agentRegistry: "eip155:1:0xabc", agentId: "1", wallet: "nothex" }).ok)
      .toBe(false);
  });
});

describe("Matchmaker", () => {
  it("opens a room when an intent matches an existing offer", () => {
    const s = new Store();
    const offerId = s.addOffer(baseOffer);
    const m = new Matchmaker(s);
    const intentId = s.addIntent(baseIntent);
    const res = m.onIntent(intentId);
    expect(res.matched).toBe(true);
    expect(res.roomId).toBeTruthy();
    expect(res.wssUrl).toContain("/negotiate/");
    // lookup by intent id returns the same room
    const look = m.lookup(intentId);
    expect(look.roomId).toBe(res.roomId);
    // offer id also resolves
    expect(m.lookup(offerId).roomId).toBe(res.roomId);
  });
  it("does not match when price too high", () => {
    const s = new Store();
    s.addOffer({ ...baseOffer, unitPrice: 25 });
    const m = new Matchmaker(s);
    const intentId = s.addIntent(baseIntent);
    expect(m.onIntent(intentId).matched).toBe(false);
  });
});

describe("Matchmaker roomId — single authoritative room per negotiation", () => {
  it("re-running the matchmaker (pulse) returns the SAME roomId, never a new one", () => {
    const s = new Store();
    const m = new Matchmaker(s);
    const offerId = s.addOffer(baseOffer);
    const intentId = s.addIntent(baseIntent);

    // Seller side opens the room on offer arrival.
    const fromOffer = m.onOffer(offerId);
    expect(fromOffer.matched).toBe(true);
    expect(fromOffer.roomId).toBeTruthy();

    // Buyer side resolves the same room via lookup.
    expect(m.lookup(intentId).roomId).toBe(fromOffer.roomId);

    // An offer pulse re-runs onOffer AFTER the match already exists. This used
    // to mint a second room for the same pair; it must return the original.
    expect(m.onOffer(offerId).roomId).toBe(fromOffer.roomId);
    expect(m.onIntent(intentId).roomId).toBe(fromOffer.roomId);
    expect(m.lookup(offerId).roomId).toBe(fromOffer.roomId);
  });

  it("both join orders (seller-first, buyer-first) resolve to one shared roomId", () => {
    // Seller-first: offer exists, buyer intent arrives → onIntent opens the room.
    const s1 = new Store();
    const m1 = new Matchmaker(s1);
    const offerId1 = s1.addOffer(baseOffer);
    const intentId1 = s1.addIntent(baseIntent);
    const room1 = m1.onIntent(intentId1);
    expect(room1.matched).toBe(true);
    // The seller, who existed before the room, still resolves the SAME room.
    expect(m1.lookup(offerId1).roomId).toBe(room1.roomId);

    // Buyer-first: intent exists, seller offer arrives → onOffer opens the room.
    const s2 = new Store();
    const m2 = new Matchmaker(s2);
    const intentId2 = s2.addIntent(baseIntent);
    const offerId2 = s2.addOffer(baseOffer);
    const room2 = m2.onOffer(offerId2);
    expect(room2.matched).toBe(true);
    // The buyer, who existed before the room, still resolves the SAME room.
    expect(m2.lookup(intentId2).roomId).toBe(room2.roomId);
  });

  it("two negotiations get two distinct rooms and never cross-connect", () => {
    const s = new Store();
    const m = new Matchmaker(s);

    // Negotiation A (buyer arrives first, seller second).
    const intentA = s.addIntent({ ...baseIntent, requirements: { gpu: "H100" } });
    const offerA = s.addOffer({ ...baseOffer, unitPrice: 10, requirements: { gpu: "H100" } });
    const roomA = m.onOffer(offerA).roomId;

    // Negotiation B (seller arrives first, buyer second) — different pair.
    const offerB = s.addOffer({ ...baseOffer, unitPrice: 12, agentId: "9", wallet: "0xSELLERB", requirements: { gpu: "A100" } });
    const intentB = s.addIntent({ ...baseIntent, qty: 3, agentId: "8", wallet: "0xBUYERB", requirements: { gpu: "A100" } });
    const roomB = m.onIntent(intentB).roomId;

    expect(roomA).toBeTruthy();
    expect(roomB).toBeTruthy();
    expect(roomA).not.toBe(roomB);

    // Each side resolves ONLY its own room, before and after re-runs.
    expect(m.lookup(intentA).roomId).toBe(roomA);
    expect(m.lookup(offerA).roomId).toBe(roomA);
    expect(m.lookup(intentB).roomId).toBe(roomB);
    expect(m.lookup(offerB).roomId).toBe(roomB);
    expect(m.onOffer(offerA).roomId).toBe(roomA);
    expect(m.onIntent(intentB).roomId).toBe(roomB);
  });
});
