// Seeds the artifact's example cast: Agent #1 (buyer, 5h H100 @ max $20)
// and Agent #2 (seller, H100 @ $18/hr). These match per contract §2,
// so on boot an intent+offer pair exists and a room can be created on POST.
// agentId values are ERC-8004 numeric tokenIds (decimal strings) per ERC-721.
export function seed(store) {
    const buyer = store.addIntent({
        resource: "gpu",
        qty: 5,
        unit: "hour",
        maxUnitPrice: 20,
        requirements: { cuda: "12.1", gpu: "H100" },
        agentRegistry: "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e",
        agentId: "1",
        wallet: "0xBUYER_DEMO",
    });
    const seller = store.addOffer({
        resource: "gpu",
        unit: "hour",
        unitPrice: 18,
        terms: "per-hour billing, cancel anytime",
        requirements: { cuda: "12.1", gpu: "H100" },
        agentRegistry: "eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e",
        agentId: "2",
        wallet: "0xSELLER_DEMO",
    });
    // Note: seed does NOT auto-create a room; a POST /intents or /offers will.
    // The pair is stored so a later POST triggers the Matchmaker.
    void buyer;
    void seller;
}
