import { DealResult } from "./room.js";
import {
  VerificationManager,
  VerificationRequest,
  VerificationResult,
  VerificationStatus,
  VerificationVerdict,
  VerificationDashboardView,
  SellerCompletionVerifier,
  BuyerApprovalVerifier,
  AdminVerifier,
} from "@finality/verification";

// Best-effort delivery of a closed deal to Part 3 (contract §5).
// POST { roomId, transcriptHash, buyer, seller, unitPrice, qty, terms, totalUsdc }
// If Part 3 is not running, log + continue (never crash).
//
// NEW: Verification Layer Integration
// Pipeline: deal-closed → Verification → Settlement
// - If Verification returns "verified" → proceed to settlement
// - If Verification returns "rejected" or "error" → block settlement, mark deal as rejected/failed/disputed
//
// Approval workflow (seller completion + buyer approval) is STATEFUL: the
// seller/buyer verifiers keep per-request state keyed by requestId, so the
// request ID is STABLE per room (`req_${roomId}`). When a completion / decision
// is submitted via the HTTP action endpoints we RE-RUN the same verification
// request and only settle once it actually passes — a rejected/pending deal is
// never settled, and a passed deal is settled exactly once.

const DEALS_URL_DEFAULT = "http://localhost:3003/deals";

export interface VerdictView {
  verdictId?: string;
  verifierId: string;
  verifierName: string;
  status: string;
  proof?: string;
  rejectionReason?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export interface SettlementRecord {
  roomId: string;
  response: {
    ok: boolean;
    status: number;
    body?: unknown;
    error?: string;
  };
  recordedAt: string;
  // Verification layer fields
  verification?: {
    requestId?: string;
    status: VerificationStatus;
    passed: boolean;
    finalStatus?: VerificationStatus;
    startedAt?: string;
    completedAt?: string;
    verdicts: VerdictView[];
  };
  // Full REAL deal data retained so downstream stages (e.g. the next payment
  // task) can consume the exact values that were agreed in the negotiation:
  // buyer/seller agent IDs + wallets, unit price, qty, terms, totalUsdc and
  // the transcript/agreement hash. Nothing here is fabricated.
  deal?: DealResult['deal'];
  transcriptHash?: string;
  // Settlement blocked reason
  settlementBlocked?: boolean;
  settlementBlockReason?: string;
}

const lastSettlementByRoom = new Map<string, SettlementRecord>();
// Retained per-room verification request + raw result so a later action
// submission (seller completion / buyer approval / admin override) can
// RE-VERIFY the exact same request (the action verifiers are stateful and
// keyed by requestId) and drive the deal to settlement once it passes.
const lastRequestByRoom = new Map<string, VerificationRequest>();
const lastResultByRoom = new Map<string, VerificationResult>();
// Rooms whose deal has already been pushed to settlement — guards against
// double settlement when multiple action submissions all flip verification
// to "passed" (e.g. seller completion and buyer approval arriving together).
const settledRooms = new Set<string>();

// Default verification manager instance (lazy init)
let verificationManager: VerificationManager | null = null;
let verificationManagerPromise: Promise<VerificationManager> | null = null;

async function getVerificationManager(): Promise<VerificationManager> {
  if (!verificationManagerPromise) {
    verificationManagerPromise = VerificationManager.create();
  }
  verificationManager = await verificationManagerPromise;
  return verificationManager;
}

/**
 * Create a verification request from a deal result.
 *
 * The request ID is STABLE per room (`req_${roomId}`) and the resource type
 * recorded on the deal is passed as verification context so the TermsVerifier
 * validates the closed deal against its real resource (e.g. "gpu") instead of
 * the default "unknown".
 */
function createVerificationRequest(result: DealResult): VerificationRequest {
  return VerificationManager.createRequestFromDeal(
    result,
    { resource: result.deal.resource },
    `req_${result.roomId}`,
  );
}

function mapVerdicts(verdicts: VerificationVerdict[]): VerdictView[] {
  return verdicts.map((v) => ({
    verdictId: v.verdictId,
    verifierId: v.verifierId,
    verifierName: v.verifierName,
    status: v.status,
    proof: v.proof,
    rejectionReason: v.rejectionReason,
    timestamp: v.timestamp,
    metadata: v.metadata,
  }));
}

function buildReason(result: VerificationResult): string {
  return result.verdicts
    .filter((v) => v.status === "rejected" || v.status === "error")
    .map((v) => v.rejectionReason ?? `Verifier ${v.verifierName} returned ${v.status}`)
    .join("; ");
}

function toDealResult(request: VerificationRequest): DealResult {
  return {
    roomId: request.roomId,
    transcriptHash: request.transcriptHash,
    deal: request.deal,
  };
}

/**
 * Notify Part 3 (Settlement) of a verified deal
 */
async function notifySettlement(result: DealResult): Promise<SettlementRecord["response"]> {
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
    ...(result.deal.resource ? { resource: result.deal.resource } : {}),
  };
  try {
    const res = await fetch(DEALS_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    const parsed = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      console.warn(`[settle] Part 3 returned ${res.status} for ${result.roomId}; continuing`);
    } else {
      console.log(`[settle] notified Part 3 of deal ${result.roomId} (${result.transcriptHash})`);
    }
    return { ok: res.ok, status: res.status, body: parsed };
  } catch (err) {
    console.error(`[settle] Fetch error for ${DEALS_URL}: ${String(err)}`);
    console.warn(`[settle] Part 3 unreachable at ${DEALS_URL} (${String(err)}); continuing`);
    return { ok: false, status: 0, error: String(err) };
  }
}

/**
 * Push the deal to settlement exactly once (no-op if already settled).
 */
async function settleOnce(roomId: string, result: DealResult, record: SettlementRecord): Promise<void> {
  if (settledRooms.has(roomId)) return;
  settledRooms.add(roomId);
  console.log(`[verify] Verification passed, proceeding to settlement for ${roomId}`);
  record.response = await notifySettlement(result);
  record.settlementBlocked = false;
  record.settlementBlockReason = undefined;
}

/**
 * Apply the latest verification result to a record (shared by the initial
 * deal-close run and every action-triggered re-run).
 */
function applyVerificationResult(
  record: SettlementRecord,
  request: VerificationRequest,
  result: VerificationResult,
): void {
  record.verification = {
    requestId: request.requestId,
    status: result.finalStatus,
    passed: result.passed,
    finalStatus: result.finalStatus,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    verdicts: mapVerdicts(result.verdicts),
  };
}

function getOrCreateRecord(roomId: string, request: VerificationRequest): SettlementRecord {
  const existing = lastSettlementByRoom.get(roomId);
  if (existing) return existing;
  return {
    roomId,
    response: { ok: false, status: 0, error: "pending" },
    recordedAt: new Date().toISOString(),
    deal: request.deal,
    transcriptHash: request.transcriptHash,
  };
}

/**
 * Main entry point - called when a deal closes in the negotiation room.
 * Runs verification first, then settlement only if verification passes.
 * Deal-close verification that only lacks the approval-workflow actions
 * (seller completion / buyer approval) is stored as blocked-but-actionable;
 * the action endpoints re-verify and settle when those arrive.
 */
export async function notifyDeal(result: DealResult): Promise<void> {
  console.log(`[verify] Starting verification for deal ${result.roomId}...`);

  // Step 1: Create verification request (stable ID + resource context)
  const verificationRequest = createVerificationRequest(result);
  lastRequestByRoom.set(result.roomId, verificationRequest);

  // Step 2: Run verification through the Verification Manager
  const vm = await getVerificationManager();
  const verificationResult = await vm.verify(verificationRequest);
  lastResultByRoom.set(result.roomId, verificationResult);

  console.log(`[verify] Verification completed for ${result.roomId}: ${verificationResult.finalStatus} (passed: ${verificationResult.passed})`);

  // Step 3: Build the base settlement record with verification info
  const settlementRecord = getOrCreateRecord(result.roomId, verificationRequest);
  applyVerificationResult(settlementRecord, verificationRequest, verificationResult);

  // Step 4: If verification passed, proceed to settlement
  if (verificationResult.passed && verificationResult.finalStatus === "verified") {
    await settleOnce(result.roomId, result, settlementRecord);
  } else {
    // Step 5: Verification failed - block settlement (still actionable when
    // the failure is only missing seller completion / buyer approval).
    const reason = buildReason(verificationResult);
    console.warn(`[verify] Verification incomplete for ${result.roomId}: ${reason}. Settlement blocked until the required actions are submitted.`);
    settlementRecord.settlementBlocked = true;
    settlementRecord.settlementBlockReason = reason;
    settlementRecord.response = { ok: false, status: 422, error: `Verification incomplete: ${reason}` };
  }

  // Step 6: Store the settlement record
  lastSettlementByRoom.set(result.roomId, settlementRecord);
}

// ── Approval-workflow actions ────────────────────────────────────────────────
// These register the seller/buyer/admin action with the stateful action
// verifiers (keyed by the stable requestId) and RE-RUN verification. When the
// re-run passes, the deal is pushed to settlement (exactly once).

function resolveRequest(requestId: string): { roomId: string; request: VerificationRequest } | undefined {
  const roomId = requestId.startsWith("req_") ? requestId.slice(4) : requestId;
  const request = lastRequestByRoom.get(roomId);
  if (!request) return undefined;
  return { roomId, request };
}

async function reverifyAndRecord(requestId: string, roomId: string, request: VerificationRequest): Promise<{ record: SettlementRecord; result: VerificationResult }> {
  const vm = await getVerificationManager();
  const result = await vm.verify(request);
  lastResultByRoom.set(roomId, result);

  const record = getOrCreateRecord(roomId, request);
  applyVerificationResult(record, request, result);

  if (result.passed && result.finalStatus === "verified") {
    await settleOnce(roomId, toDealResult(request), record);
  } else {
    const reason = buildReason(result);
    record.settlementBlocked = true;
    record.settlementBlockReason = reason;
    record.response = { ok: false, status: 422, error: `Verification incomplete: ${reason}` };
  }
  lastSettlementByRoom.set(roomId, record);
  return { record, result };
}

/**
 * Register the seller's completion proof and re-verify. The seller's agentId
 * is validated by the verifier against the deal's seller on the next run.
 */
export async function submitSellerCompletion(
  requestId: string,
  sellerAgentId: string,
  proof: string,
  notes?: string,
): Promise<SettlementRecord> {
  const found = resolveRequest(requestId);
  if (!found) throw new Error(`no verification request for ${requestId}`);
  const { roomId, request } = found;

  SellerCompletionVerifier.submitCompletion(requestId, sellerAgentId, proof, notes);
  const { record } = await reverifyAndRecord(requestId, roomId, request);
  console.log(`[verify] ${roomId}: seller completion registered → ${record.verification?.finalStatus}`);
  return record;
}

/**
 * Register the buyer's approve/reject decision and re-verify. The buyer's
 * agentId is validated by the verifier against the deal's buyer.
 */
export async function submitBuyerDecision(
  requestId: string,
  buyerAgentId: string,
  decision: "approve" | "reject",
  rejectionReason?: string,
  notes?: string,
): Promise<SettlementRecord> {
  const found = resolveRequest(requestId);
  if (!found) throw new Error(`no verification request for ${requestId}`);
  const { roomId, request } = found;

  BuyerApprovalVerifier.submitDecision(requestId, buyerAgentId, decision, rejectionReason, notes);
  const { record } = await reverifyAndRecord(requestId, roomId, request);
  console.log(`[verify] ${roomId}: buyer ${decision} registered → ${record.verification?.finalStatus}`);
  return record;
}

/**
 * Register an admin override and re-verify. Note: the admin verifier is
 * disabled in the default manager config, so with the default config this
 * registers state without changing the aggregate outcome.
 */
export async function submitAdminOverride(
  requestId: string,
  adminAgentId: string,
  decision: "verified" | "rejected" | "error",
  rejectionReason?: string,
  notes?: string,
): Promise<SettlementRecord> {
  const found = resolveRequest(requestId);
  if (!found) throw new Error(`no verification request for ${requestId}`);
  const { roomId, request } = found;

  AdminVerifier.applyOverride(requestId, adminAgentId, decision, rejectionReason, notes);
  const { record } = await reverifyAndRecord(requestId, roomId, request);
  console.log(`[verify] ${roomId}: admin override (${decision}) registered → ${record.verification?.finalStatus}`);
  return record;
}

// ── Read / dashboard views ──────────────────────────────────────────────────

export function getLastSettlement(roomId: string): SettlementRecord | undefined {
  return lastSettlementByRoom.get(roomId);
}

export function getRecentSettlements(): SettlementRecord[] {
  return [...lastSettlementByRoom.values()].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
}

export async function getVerificationDashboardView(requestId: string): Promise<VerificationDashboardView | undefined> {
  const found = resolveRequest(requestId);
  if (!found) return undefined;
  const result = lastResultByRoom.get(found.roomId);
  if (!result) return undefined;
  const vm = await getVerificationManager();
  return vm.getDashboardView(found.request, result.verdicts);
}

export async function getVerificationDashboardViews(opts?: {
  status?: string;
  agentId?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ verifications: VerificationDashboardView[]; total: number; page: number; pageSize: number }> {
  const vm = await getVerificationManager();
  let views: VerificationDashboardView[] = [];
  for (const [roomId, request] of lastRequestByRoom) {
    const result = lastResultByRoom.get(roomId);
    if (!result) continue;
    views.push(vm.getDashboardView(request, result.verdicts));
  }
  views.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (opts?.status) views = views.filter((v) => v.currentStatus === opts.status);
  if (opts?.agentId) {
    views = views.filter(
      (v) => v.deal.buyer.agentId === opts.agentId || v.deal.seller.agentId === opts.agentId,
    );
  }
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 20;
  const total = views.length;
  const start = (page - 1) * pageSize;
  return { verifications: views.slice(start, start + pageSize), total, page, pageSize };
}

/**
 * Reset the verification manager (useful for testing)
 */
export function resetVerificationManager(): void {
  verificationManager = null;
}

/**
 * Set a custom verification manager (useful for testing with mock verifiers)
 */
export function setVerificationManagerInstance(manager: VerificationManager): void {
  verificationManager = manager;
  verificationManagerPromise = Promise.resolve(manager);
}

/**
 * Get the verification manager instance for custom configuration
 */
export { getVerificationManager as getVerificationManagerInstance };
