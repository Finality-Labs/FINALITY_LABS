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
  type ValidateUriResponse,
  type VerificationStatus,
  type VerificationVerdict,
  type VerificationRequest,
  type VerificationDashboardView,
  type VerificationListResponse,
  type SellerCompletionSubmission,
  type BuyerDecisionSubmission,
  type AdminOverrideSubmission,
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
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to settle deal' }));
      throw new Error(error.error || error.reason || `HTTP ${res.status}`);
    }
    return res.json();
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
  // Verification API (Port 3004 or part of chain)
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

    const res = await fetch(`${this.config.chainBaseUrl}/verifications?${params}`);
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to get verifications' }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async getVerification(requestId: string): Promise<VerificationDashboardView> {
    const res = await fetch(`${this.config.chainBaseUrl}/verifications/${requestId}`);
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Failed to get verification' }));
      throw new Error(error.error || `HTTP ${res.status}`);
    }
    return res.json();
  }

  async submitSellerCompletion(submission: SellerCompletionSubmission): Promise<VerificationVerdict> {
    const res = await fetch(`${this.config.chainBaseUrl}/verifications/${submission.requestId}/seller-complete`, {
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

  async submitBuyerDecision(submission: BuyerDecisionSubmission): Promise<VerificationVerdict> {
    const res = await fetch(`${this.config.chainBaseUrl}/verifications/${submission.requestId}/buyer-decision`, {
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

  async submitAdminOverride(submission: AdminOverrideSubmission): Promise<VerificationVerdict> {
    const res = await fetch(`${this.config.chainBaseUrl}/verifications/${submission.requestId}/admin-override`, {
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
  getChainMode: () => apiClient.getChainMode(),
  healthCheck: () => apiClient.healthCheck(),
  // ERC-8004 Agent Registration
  erc8004: {
    registerAgent: (form: AgentRegistrationForm) => apiClient.registerAgent(form),
    validateAgentUri: (agentUri: string) => apiClient.validateAgentUri(agentUri),
    getConfig: () => apiClient.getErc8004Config(),
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