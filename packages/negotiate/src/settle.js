import { VerificationManager } from "@finality/verification";
// Best-effort delivery of a closed deal to Part 3 (contract §5).
// POST { roomId, transcriptHash, buyer, seller, unitPrice, qty, terms, totalUsdc }
// If Part 3 is not running, log + continue (never crash).
//
// NEW: Verification Layer Integration
// Pipeline: deal-closed → Verification → Settlement
// - If Verification returns "verified" → proceed to settlement
// - If Verification returns "rejected" or "error" → block settlement, mark deal as rejected/failed/disputed
const DEALS_URL_DEFAULT = "http://localhost:3003/deals";
const lastSettlementByRoom = new Map();
// Default verification manager instance (lazy init)
let verificationManager = null;
let verificationManagerPromise = null;
async function getVerificationManager() {
    if (!verificationManagerPromise) {
        verificationManagerPromise = VerificationManager.create();
    }
    verificationManager = await verificationManagerPromise;
    return verificationManager;
}
/**
 * Create a verification request from a deal result
 */
function createVerificationRequest(result) {
    return VerificationManager.createRequestFromDeal(result, {});
}
/**
 * Notify Part 3 (Settlement) of a verified deal
 */
async function notifySettlement(result) {
    const DEALS_URL = process.env.DEALS_URL ?? DEALS_URL_DEFAULT;
    const body = {
        roomId: result.roomId,
        transcriptHash: result.transcriptHash,
        buyer: result.deal.buyer,
        seller: result.deal.seller,
        unitPrice: result.deal.unitPrice,
        qty: result.deal.qty,
        terms: result.deal.terms,
        totalUsdc: result.deal.totalUsdc,
    };
    try {
        const res = await fetch(DEALS_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        });
        const text = await res.text();
        const parsed = text ? JSON.parse(text) : undefined;
        const record = {
            roomId: result.roomId,
            response: { ok: res.ok, status: res.status, body: parsed },
            recordedAt: new Date().toISOString(),
        };
        if (!res.ok) {
            console.warn(`[settle] Part 3 returned ${res.status} for ${result.roomId}; continuing`);
        }
        else {
            console.log(`[settle] notified Part 3 of deal ${result.roomId} (${result.transcriptHash})`);
        }
        return record;
    }
    catch (err) {
        console.error(`[settle] Fetch error for ${DEALS_URL}: ${String(err)}`);
        const record = {
            roomId: result.roomId,
            response: { ok: false, status: 0, error: String(err) },
            recordedAt: new Date().toISOString(),
        };
        console.warn(`[settle] Part 3 unreachable at ${DEALS_URL} (${String(err)}); continuing`);
        return record;
    }
}
/**
 * Main entry point - called when a deal closes in the negotiation room.
 * Runs verification first, then settlement only if verification passes.
 */
export async function notifyDeal(result) {
    console.log(`[verify] Starting verification for deal ${result.roomId}...`);
    // Step 1: Create verification request
    const verificationRequest = createVerificationRequest(result);
    // Step 2: Run verification through the Verification Manager
    const vm = await getVerificationManager();
    const verificationResult = await vm.verify(verificationRequest);
    console.log(`[verify] Verification completed for ${result.roomId}: ${verificationResult.finalStatus} (passed: ${verificationResult.passed})`);
    // Step 3: Build the base settlement record with verification info
    const settlementRecord = {
        roomId: result.roomId,
        response: { ok: false, status: 0, error: "pending" },
        recordedAt: new Date().toISOString(),
        verification: {
            status: verificationResult.finalStatus,
            passed: verificationResult.passed,
            verdicts: verificationResult.verdicts.map((v) => ({
                verifierId: v.verifierId,
                verifierName: v.verifierName,
                status: v.status,
                rejectionReason: v.rejectionReason,
            })),
        },
    };
    // Step 4: If verification passed, proceed to settlement
    if (verificationResult.passed && verificationResult.finalStatus === "verified") {
        console.log(`[verify] Verification passed, proceeding to settlement for ${result.roomId}`);
        const settlementResult = await notifySettlement(result);
        settlementRecord.response = settlementResult.response;
        settlementRecord.settlementBlocked = false;
    }
    else {
        // Step 5: Verification failed - block settlement
        const reason = verificationResult.verdicts
            .filter((v) => v.status === "rejected" || v.status === "error")
            .map((v) => v.rejectionReason ?? `Verifier ${v.verifierName} returned ${v.status}`)
            .join("; ");
        console.warn(`[verify] Verification failed for ${result.roomId}: ${reason}. Settlement blocked.`);
        settlementRecord.settlementBlocked = true;
        settlementRecord.settlementBlockReason = reason;
        settlementRecord.response = { ok: false, status: 422, error: `Verification failed: ${reason}` };
    }
    // Step 6: Store the settlement record
    lastSettlementByRoom.set(result.roomId, settlementRecord);
    // Also call the original onDeal callback if it was registered (for backward compatibility)
    // This is handled by the Room class calling onDeal directly
}
export function getLastSettlement(roomId) {
    return lastSettlementByRoom.get(roomId);
}
export function getRecentSettlements() {
    return [...lastSettlementByRoom.values()].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
}
/**
 * Reset the verification manager (useful for testing)
 */
export function resetVerificationManager() {
    verificationManager = null;
}
/**
 * Set a custom verification manager (useful for testing with mock verifiers)
 */
export function setVerificationManagerInstance(manager) {
    verificationManager = manager;
    verificationManagerPromise = Promise.resolve(manager);
}
/**
 * Get the verification manager instance for custom configuration
 */
export { getVerificationManager as getVerificationManagerInstance };
