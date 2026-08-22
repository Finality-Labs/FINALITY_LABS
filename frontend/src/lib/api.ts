/**
 * Finality Labs - API Client
 * Centralized API communication with backend services
 */

import {
  DEFAULT_API_CONFIG,
  type Intent,
  type Offer,
  type CreateIntentResponse,
  type CreateOfferResponse,
  type MatchLookupResponse,
  type OfferPulseResponse,
  type OfferRegistryState,
  type AgentRegistryFeed,
  type ReputationResponse,
  type IdentityResponse,
  type RegistryNotifyResponse,
  type Deal,
  type DealResponse,
  type RegisterResponse,
  type ChainModeResponse,
  type HealthResponse,
  type RunDealResponse,
  type RunDealRequest,
  type PartyIdentity,
  type AgentRegistrationForm,
  type RegistrationResponse,
  type Erc8004Config,
  type Erc8004AgentsByWalletResponse,
  type ValidateUriResponse,
  type VerificationStatus,
  type VerificationRequest,
  type VerificationDashboardView,
  type VerificationListResponse,
  type VerificationActionResponse,
  type SellerCompletionSubmission,
  type BuyerDecisionSubmission,
  type AdminOverrideSubmission,
  type RoomSettlementRecord,
  type X402AuthorizeRequest,
  type X402AuthorizeResponse,
  type PaymentVerificationRequest,
  type PaymentVerificationResponse,
  type DealPaymentInfo,
} from '@/types/api';

class ApiClient {
  private config = DEFAULT_API_CONFIG;

  // ============================================
  // Intake API (Port 3001)
  // ============================================

  async createIntent(intent: Intent): Promise<CreateIntentResponse> {
    const res = await fetch(`${this.config.intakeBaseUrl}/intents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(intent),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to create intent' }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async createOffer(offer: Offer): Promise<CreateOfferResponse> {
    const res = await fetch(`${this.config.intakeBaseUrl}/offers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(offer),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to create offer' }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async getMatch(id: string): Promise<MatchLookupResponse> {
    const res = await fetch(`${this.config.intakeBaseUrl}/matches/${id}`);
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to get match' }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async pulseOffer(offerId: string): Promise<OfferPulseResponse> {
    const res = await fetch(`${this.config.intakeBaseUrl}/offers/${offerId}/pulse`, {
      method: 'POST',
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to pulse offer' }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async getOfferRegistryState(offerId: string): Promise<OfferRegistryState> {
    const res = await fetch(`${this.config.intakeBaseUrl}/offers/${offerId}/registry`);
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to get registry state' }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async getAgentRegistryFeed(agentId: string): Promise<AgentRegistryFeed> {
    const res = await fetch(`${this.config.intakeBaseUrl}/registry/${agentId}`);
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to get registry feed' }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async notifyRegistryChange(agentId: string): Promise<RegistryNotifyResponse> {
    const res = await fetch(`${this.config.intakeBaseUrl}/registry/${agentId}/notify`, {
      method: 'POST',
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to notify registry' }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async getReputation(agentId: string): Promise<ReputationResponse> {
    const res = await fetch(`${this.config.intakeBaseUrl}/agents/${agentId}/reputation`);
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to get reputation' }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async verifyIdentity(identity: PartyIdentity): Promise<IdentityResponse> {
    const res = await fetch(`${this.config.intakeBaseUrl}/_identity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(identity),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to verify identity' }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  // ============================================
  // Chain API (Port 3003)
  // ============================================

  async settleDeal(deal: Deal): Promise<DealResponse> {
    const res = await fetch(`${this.config.chainBaseUrl}/deals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deal),
    });
    const data = await res.json().catch(() => ({ error: 'Failed to settle deal' }));
    if (!res.ok) {
      // For HTTP 402, return the challenge instead of throwing
      if (res.status === 402 && data.x402Challenge) {
        return data as DealResponse;
      }
      throw new Error(data.error || data.reason || `HTTP ${res.status}`);
    }
    return data;
  }

  async authorizeX402Payment(roomId: string, request: X402AuthorizeRequest): Promise<X402AuthorizeResponse> {
    const res = await fetch(`${this.config.chainBaseUrl}/deals/${encodeURIComponent(roomId)}/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    const data = await res.json().catch(() => ({ error: 'Failed to authorize payment' }));
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  }

  async verifyPayment(roomId: string, request: PaymentVerificationRequest): Promise<PaymentVerificationResponse> {
    const url = `${this.config.chainBaseUrl}/deals/${encodeURIComponent(roomId)}/payment/verify`;
    console.log('[api.verifyPayment] Request:', { url, txHash: request.txHash });
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180_000); // 3 min timeout (backend waits up to 60s for receipt)
    
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      const err = fetchErr as Error;
      console.error('[api.verifyPayment] Fetch failed:', { 
        name: err.name, 
        message: err.message, 
        cause: err.cause 
      });
      if (err.name === 'AbortError') {
        throw new Error('Payment verification timed out. The transaction may still be confirming on-chain.');
      }
      throw new Error(`Network error: ${err.message}`);
    } finally {
      clearTimeout(timeoutId);
    }

    console.log('[api.verifyPayment] HTTP status:', res.status, res.ok);
    console.log('[api.verifyPayment] content-type:', res.headers.get('content-type'));
    console.log('[api.verifyPayment] all headers:', Object.fromEntries(res.headers.entries()));

    const rawBody = await res.text();
    console.log('[api.verifyPayment] ACTUAL HTTP RESPONSE', {
      status: res.status,
      contentType: res.headers.get('content-type'),
      bodyLength: rawBody.length,
      body: rawBody
    });

    if (!rawBody.trim()) {
      console.error('[api.verifyPayment] Empty response body received');
      const errorResponse: PaymentVerificationResponse = { 
        ok: false, verified: false, paymentState: 'payment_failed', 
        txHash: request.txHash, amount: '', token: '', tokenSymbol: '', 
        buyer: '', seller: '', chainId: 48816, network: 'goat-testnet',
        error: 'verifyPayment returned HTTP 200 with empty body' 
      };
      throw new Error('verifyPayment returned HTTP 200 with empty body');
    }

    let data: PaymentVerificationResponse;
    try {
      data = JSON.parse(rawBody) as PaymentVerificationResponse;
    } catch (e) {
      console.error('[api.verifyPayment] JSON parse failed:', e, 'Raw:', rawBody);
      const errorResponse: PaymentVerificationResponse = { 
        ok: false, verified: false, paymentState: 'payment_failed', 
        txHash: request.txHash, amount: '', token: '', tokenSymbol: '', 
        buyer: '', seller: '', chainId: 48816, network: 'goat-testnet',
        error: 'Failed to parse payment verification response', 
        details: (e as Error).message 
      };
      throw new Error('Failed to parse payment verification response');
    }
    
    console.log('[api.verifyPayment] Parsed response:', { 
      verified: data.verified, 
      ok: data.ok, 
      paymentState: data.paymentState,
      txHash: data.txHash,
      amount: data.amount,
      tokenSymbol: data.tokenSymbol,
      error: data.error
    });

    if (!res.ok) {
      console.error('[api.verifyPayment] HTTP error:', { status: res.status, data });
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    
    return data;
  }

  async getDealPaymentInfo(roomId: string): Promise<DealPaymentInfo> {
    const res = await fetch(`${this.config.chainBaseUrl}/deals/${encodeURIComponent(roomId)}/payment/info`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json().catch(() => ({ error: 'Failed to get payment info' }));
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  }

  async getChainMode(): Promise<ChainModeResponse> {
    const res = await fetch(`${this.config.chainBaseUrl}/mode`);
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to get chain mode' }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async healthCheck(): Promise<HealthResponse> {
    try {
      const [intake, chain] = await Promise.allSettled([
        fetch(`${this.config.intakeBaseUrl}/health`),
        fetch(`${this.config.chainBaseUrl}/mode`),
      ]);

      const chainMode = chain.status === 'fulfilled' ? await chain.value.json() : { mode: 'mock' as const, network: 'unknown', liveReady: false };

      return {
        ok: intake.status === 'fulfilled' && intake.value.ok,
        services: {
          intake: 3001,
          negotiate: 3002,
          chain: 3003,
        },
        chain: chainMode,
      };
    } catch {
      return {
        ok: false,
        services: { intake: 3001, negotiate: 3002, chain: 3003 },
        chain: { mode: 'mock', network: 'unknown', liveReady: false, reason: 'Health check failed' },
      };
    }
  }

  // ============================================
  // ERC-8004 Agent Registration API (Port 3003)
  // ============================================

  async registerAgent(form: AgentRegistrationForm): Promise<RegistrationResponse> {
    const res = await fetch(`${this.config.chainBaseUrl}/erc8004/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to register agent' }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async validateAgentUri(agentUri: string): Promise<ValidateUriResponse> {
    const res = await fetch(`${this.config.chainBaseUrl}/erc8004/validate-uri`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentURI: agentUri }),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to validate agent URI' }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async getErc8004Config(): Promise<Erc8004Config> {
    const res = await fetch(`${this.config.chainBaseUrl}/erc8004/config`);
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to get ERC-8004 config' }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async getErc8004AgentsByWallet(wallet: string): Promise<Erc8004AgentsByWalletResponse> {
    const res = await fetch(`${this.config.chainBaseUrl}/erc8004/agents-by-wallet?wallet=${encodeURIComponent(wallet)}`);
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to discover ERC-8004 agents' }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  // ============================================
  // Orchestrator/UI API (Port 3000)
  // ============================================

  async runDeal(params: RunDealRequest): Promise<RunDealResponse> {
    // Use port 3000 for the orchestrator endpoint
    const orchestratorUrl = this.config.intakeBaseUrl.replace(':3001', ':3000');
    const res = await fetch(`${orchestratorUrl}/api/run-deal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to run deal' }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  // ============================================
  // Verification API (negotiate :3002)
  // The verification workflow (deal-close check, seller completion, buyer
  // approval, admin override) runs inside the negotiate server, so these call
  // the same base URL as the settlement read endpoints below.
  // ============================================

  async getVerifications(
    page = 1,
    pageSize = 20,
    status?: VerificationStatus,
    agentId?: string
  ): Promise<VerificationListResponse> {
    const params = new URLSearchParams({
      page: page.toString(),
      pageSize: pageSize.toString(),
    });
    if (status) params.append('status', status);
    if (agentId) params.append('agentId', agentId);

    const res = await fetch(`${this.negotiateBaseUrl}/verifications?${params}`);
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to get verifications' }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async getVerification(requestId: string): Promise<VerificationDashboardView> {
    const res = await fetch(`${this.negotiateBaseUrl}/verifications/${requestId}`);
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to get verification' }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async submitSellerCompletion(submission: SellerCompletionSubmission): Promise<VerificationActionResponse> {
    const res = await fetch(`${this.negotiateBaseUrl}/verifications/${submission.requestId}/seller-complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submission),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to submit seller completion' }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async submitBuyerDecision(submission: BuyerDecisionSubmission): Promise<VerificationActionResponse> {
    const res = await fetch(`${this.negotiateBaseUrl}/verifications/${submission.requestId}/buyer-decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submission),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to submit buyer decision' }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async submitAdminOverride(submission: AdminOverrideSubmission): Promise<VerificationActionResponse> {
    const res = await fetch(`${this.negotiateBaseUrl}/verifications/${submission.requestId}/admin-override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submission),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to submit admin override' }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  // ============================================
  // Room Settlement / Verification Read API (negotiate :3002)
  // Returns the in-memory SettlementRecord the EXISTING verification flow
  // already produces when a deal closes — real deal data + real verdicts.
  // ============================================

  private get negotiateBaseUrl(): string {
    return this.config.negotiateWsUrl
      .replace(/^wss:\/\//, 'https://')
      .replace(/^ws:\/\//, 'http://');
  }

  async getSettlement(roomId: string): Promise<RoomSettlementRecord | null> {
    const res = await fetch(`${this.negotiateBaseUrl}/settlements/${encodeURIComponent(roomId)}`);
    if (res.status === 404) return null;
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to get settlement' }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async getSettlements(): Promise<RoomSettlementRecord[]> {
    const res = await fetch(`${this.negotiateBaseUrl}/settlements`);
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to get settlements' }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }
    return res.json();
  }
}

// Singleton instance
export const apiClient = new ApiClient();

// Named exports for convenience
export const intakeApi = {
  createIntent: (intent: Intent) => apiClient.createIntent(intent),
  createOffer: (offer: Offer) => apiClient.createOffer(offer),
  getMatch: (id: string) => apiClient.getMatch(id),
  pulseOffer: (offerId: string) => apiClient.pulseOffer(offerId),
  getOfferRegistryState: (offerId: string) => apiClient.getOfferRegistryState(offerId),
  getAgentRegistryFeed: (agentId: string) => apiClient.getAgentRegistryFeed(agentId),
  notifyRegistryChange: (agentId: string) => apiClient.notifyRegistryChange(agentId),
  getReputation: (agentId: string) => apiClient.getReputation(agentId),
  verifyIdentity: (identity: PartyIdentity) => apiClient.verifyIdentity(identity),
};

export const chainApi = {
  settleDeal: (deal: Deal) => apiClient.settleDeal(deal),
  authorizeX402Payment: (roomId: string, request: X402AuthorizeRequest) => apiClient.authorizeX402Payment(roomId, request),
  verifyPayment: (roomId: string, request: PaymentVerificationRequest) => apiClient.verifyPayment(roomId, request),
  getDealPaymentInfo: (roomId: string) => apiClient.getDealPaymentInfo(roomId),
  getChainMode: () => apiClient.getChainMode(),
  healthCheck: () => apiClient.healthCheck(),
  // ERC-8004 Agent Registration
  erc8004: {
    registerAgent: (form: AgentRegistrationForm) => apiClient.registerAgent(form),
    validateAgentUri: (agentUri: string) => apiClient.validateAgentUri(agentUri),
    getConfig: () => apiClient.getErc8004Config(),
    getAgentsByWallet: (wallet: string) => apiClient.getErc8004AgentsByWallet(wallet),
  },
  // Verification API
  verifications: {
    getVerifications: (page?: number, pageSize?: number, status?: VerificationStatus, agentId?: string) => apiClient.getVerifications(page, pageSize, status, agentId),
    getVerification: (requestId: string) => apiClient.getVerification(requestId),
    submitSellerCompletion: (submission: SellerCompletionSubmission) => apiClient.submitSellerCompletion(submission),
    submitBuyerDecision: (submission: BuyerDecisionSubmission) => apiClient.submitBuyerDecision(submission),
    submitAdminOverride: (submission: AdminOverrideSubmission) => apiClient.submitAdminOverride(submission),
  },
};

export const orchestratorApi = {
  runDeal: (params: RunDealRequest) => apiClient.runDeal(params),
};

export const negotiateApi = {
  getSettlement: (roomId: string) => apiClient.getSettlement(roomId),
  getSettlements: () => apiClient.getSettlements(),
};