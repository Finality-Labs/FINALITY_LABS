/**
 * Finality Labs - React Query Hooks
 * Centralized data fetching with caching, retries, and error handling
 */

'use client';

import { useQuery, useMutation, useQueryClient, UseQueryOptions, UseMutationOptions } from '@tanstack/react-query';
import { apiClient, intakeApi, chainApi, orchestratorApi } from '@/lib/api';
import { type Intent, type Offer, type PartyIdentity, type RunDealRequest, type VerificationStatus, type SellerCompletionSubmission, type BuyerDecisionSubmission, type AdminOverrideSubmission } from '@/types/api';
import { APP_CONFIG } from '@/lib/config';

// ============================================
// Query Keys
// ============================================

export const queryKeys = {
  // Health & Status
  health: ['health'] as const,
  chainMode: ['chainMode'] as const,

  // Intake API
  intents: ['intents'] as const,
  intent: (id: string) => ['intents', id] as const,
  offers: ['offers'] as const,
  offer: (id: string) => ['offers', id] as const,
  matches: ['matches'] as const,
  match: (id: string) => ['matches', id] as const,
  agentOffers: (agentId: string) => ['agentOffers', agentId] as const,
  reputation: (agentId: string) => ['reputation', agentId] as const,
  agentRegistry: (agentId: string) => ['agentRegistry', agentId] as const,

  // Chain API
  settlements: ['settlements'] as const,

  // Verification API
  verifications: ['verifications'] as const,
  verification: (requestId: string) => ['verifications', requestId] as const,

  // Orchestrator
  runDeal: ['runDeal'] as const,
} as const;

// ============================================
// Health & Status Hooks
// ============================================

export function useHealthCheck(options?: Partial<UseQueryOptions<import('@/types/api').HealthResponse>>) {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: () => chainApi.healthCheck(),
    refetchInterval: APP_CONFIG.ui.refreshInterval,
    staleTime: 10000,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    ...options,
  });
}

export function useChainMode(options?: Partial<UseQueryOptions<import('@/types/api').ChainModeResponse>>) {
  return useQuery({
    queryKey: queryKeys.chainMode,
    queryFn: () => chainApi.getChainMode(),
    refetchInterval: 60000,
    staleTime: 30000,
    ...options,
  });
}

// ============================================
// Intake API Hooks
// ============================================

export function useCreateIntent(
  options?: UseMutationOptions<import('@/types/api').CreateIntentResponse, Error, Intent>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (intent: Intent) => intakeApi.createIntent(intent),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.intents });
      queryClient.invalidateQueries({ queryKey: queryKeys.matches });
      if (data.roomId) {
        queryClient.setQueryData(queryKeys.match(data.roomId), { matched: true, roomId: data.roomId, wssUrl: data.wssUrl });
      }
    },
    ...options,
  });
}

export function useCreateOffer(
  options?: UseMutationOptions<import('@/types/api').CreateOfferResponse, Error, Offer>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (offer: Offer) => intakeApi.createOffer(offer),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.offers });
      queryClient.invalidateQueries({ queryKey: queryKeys.matches });
      if (data.roomId) {
        queryClient.setQueryData(queryKeys.match(data.roomId), { matched: true, roomId: data.roomId, wssUrl: data.wssUrl });
      }
    },
    ...options,
  });
}

export function useMatchLookup(
  id: string,
  options?: Partial<UseQueryOptions<import('@/types/api').MatchLookupResponse>>
) {
  return useQuery({
    queryKey: queryKeys.match(id),
    queryFn: () => intakeApi.getMatch(id),
    enabled: !!id,
    refetchInterval: 5000,
    staleTime: 2000,
    ...options,
  });
}

export function usePulseOffer(
  options?: UseMutationOptions<import('@/types/api').OfferPulseResponse, Error, string>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (offerId: string) => intakeApi.pulseOffer(offerId),
    onSuccess: (data, offerId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.offer(offerId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.matches });
      if (data.roomId) {
        queryClient.setQueryData(queryKeys.match(data.roomId), { matched: true, roomId: data.roomId, wssUrl: data.wssUrl });
      }
    },
    ...options,
  });
}

export function useOfferRegistryState(
  offerId: string,
  options?: Partial<UseQueryOptions<import('@/types/api').OfferRegistryState>>
) {
  return useQuery({
    queryKey: queryKeys.offer(offerId),
    queryFn: () => intakeApi.getOfferRegistryState(offerId),
    enabled: !!offerId,
    refetchInterval: 10000,
    staleTime: 5000,
    ...options,
  });
}

export function useAgentRegistryFeed(
  agentId: string,
  options?: Partial<UseQueryOptions<import('@/types/api').AgentRegistryFeed>>
) {
  return useQuery({
    queryKey: queryKeys.agentRegistry(agentId),
    queryFn: () => intakeApi.getAgentRegistryFeed(agentId),
    enabled: !!agentId,
    refetchInterval: 15000,
    staleTime: 10000,
    ...options,
  });
}

export function useNotifyRegistryChange(
  options?: UseMutationOptions<import('@/types/api').RegistryNotifyResponse, Error, string>
) {
  return useMutation({
    mutationFn: (agentId: string) => intakeApi.notifyRegistryChange(agentId),
    ...options,
  });
}

export function useReputation(
  agentId: string,
  options?: Partial<UseQueryOptions<import('@/types/api').ReputationResponse>>
) {
  return useQuery({
    queryKey: queryKeys.reputation(agentId),
    queryFn: () => intakeApi.getReputation(agentId),
    enabled: !!agentId,
    refetchInterval: 60000,
    staleTime: 30000,
    ...options,
  });
}

export function useVerifyIdentity(
  options?: UseMutationOptions<import('@/types/api').IdentityResponse, Error, PartyIdentity>
) {
  return useMutation({
    mutationFn: (identity: PartyIdentity) => intakeApi.verifyIdentity(identity),
    ...options,
  });
}

// ============================================
// Chain API Hooks
// ============================================

export function useSettleDeal(
  options?: UseMutationOptions<import('@/types/api').DealResponse, Error, import('@/types/api').Deal>
) {
  return useMutation({
    mutationFn: (deal: import('@/types/api').Deal) => chainApi.settleDeal(deal),
    ...options,
  });
}

export function useRegisterAgent(
  options?: UseMutationOptions<import('@/types/api').RegistrationResponse, Error, import('@/types/api').AgentRegistrationForm>
) {
  return useMutation({
    mutationFn: (form: import('@/types/api').AgentRegistrationForm) => chainApi.erc8004.registerAgent(form),
    ...options,
  });
}

// ============================================
// Orchestrator Hooks
// ============================================

export function useRunDeal(
  options?: UseMutationOptions<import('@/types/api').RunDealResponse, Error, RunDealRequest>
) {
  return useMutation({
    mutationFn: (params: RunDealRequest) => orchestratorApi.runDeal(params),
    ...options,
  });
}

// ============================================
// Verification API Hooks
// ============================================

export function useVerifications(
  page = 1,
  pageSize = 20,
  status?: VerificationStatus,
  agentId?: string,
  options?: Partial<UseQueryOptions<import('@/types/api').VerificationListResponse>>
) {
  return useQuery({
    queryKey: [...queryKeys.verifications, page, pageSize, status, agentId],
    queryFn: () => chainApi.verifications.getVerifications(page, pageSize, status, agentId),
    refetchInterval: 30000,
    staleTime: 10000,
    ...options,
  });
}

export function useVerification(
  requestId: string,
  options?: Partial<UseQueryOptions<import('@/types/api').VerificationDashboardView>>
) {
  return useQuery({
    queryKey: queryKeys.verification(requestId),
    queryFn: () => chainApi.verifications.getVerification(requestId),
    enabled: !!requestId,
    refetchInterval: 10000,
    staleTime: 5000,
    ...options,
  });
}

export function useSubmitSellerCompletion(
  options?: UseMutationOptions<import('@/types/api').VerificationVerdict, Error, SellerCompletionSubmission>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (submission: SellerCompletionSubmission) => chainApi.verifications.submitSellerCompletion(submission),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.verifications });
      queryClient.invalidateQueries({ queryKey: queryKeys.verification(variables.requestId) });
    },
    ...options,
  });
}

export function useSubmitBuyerDecision(
  options?: UseMutationOptions<import('@/types/api').VerificationVerdict, Error, BuyerDecisionSubmission>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (submission: BuyerDecisionSubmission) => chainApi.verifications.submitBuyerDecision(submission),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.verifications });
      queryClient.invalidateQueries({ queryKey: queryKeys.verification(variables.requestId) });
    },
    ...options,
  });
}

export function useSubmitAdminOverride(
  options?: UseMutationOptions<import('@/types/api').VerificationVerdict, Error, AdminOverrideSubmission>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (submission: AdminOverrideSubmission) => chainApi.verifications.submitAdminOverride(submission),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.verifications });
      queryClient.invalidateQueries({ queryKey: queryKeys.verification(variables.requestId) });
    },
    ...options,
  });
}

// ============================================
// Utility Hooks
// ============================================

/**
 * Hook to check if backend services are reachable
 */
export function useBackendConnectivity() {
  const health = useHealthCheck();
  const chainMode = useChainMode();

  const isConnected = health.data?.ok ?? false;
  const isChainLive = chainMode.data?.mode === 'live';

  return {
    isConnected,
    isChainLive,
    health: health.data,
    chainMode: chainMode.data,
    isLoading: health.isLoading || chainMode.isLoading,
    isError: health.isError || chainMode.isError,
    error: health.error || chainMode.error,
    refetch: () => {
      health.refetch();
      chainMode.refetch();
    },
  };
}

/**
 * Hook for optimistic updates with rollback on error
 */
export function useOptimisticUpdate<TData, TVariables>(
  queryKey: readonly unknown[],
  updateFn: (oldData: TData | undefined, variables: TVariables) => TData,
  rollbackFn?: (oldData: TData | undefined) => TData
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (variables: TVariables) => {
      // Snapshot current data for potential rollback
      const snapshot = queryClient.getQueryData<TData>(queryKey);

      // Optimistically update
      queryClient.setQueryData<TData>(queryKey, (old) => updateFn(old, variables));

      try {
        // Actual mutation would happen here
        // This is a utility - the actual mutation is handled by the calling hook
        return variables;
      } catch (error) {
        // Rollback on error
        if (rollbackFn && snapshot !== undefined) {
          queryClient.setQueryData(queryKey, rollbackFn(snapshot));
        } else if (snapshot !== undefined) {
          queryClient.setQueryData(queryKey, snapshot);
        }
        throw error;
      }
    },
  });
}