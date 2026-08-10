/**
 * ERC-8004 Persistent Agent Identity Types
 * Complete identity storage for registered agents across sessions
 */

import { z } from 'zod';

// ============================================
// Core Types
// ============================================

/** Status of agent registration */
export type RegistrationStatus = 'pending' | 'registered' | 'failed' | 'mock';

/** Network configuration for the agent */
export interface AgentNetwork {
  chainId: number;
  network: string;
  identityRegistry: string;
  rpcUrl: string;
  explorer: string;
}

/** Complete stored agent identity */
export interface StoredAgentIdentity {
  /** ERC-721 tokenId from Identity Registry */
  agentId: string;
  /** eip155:chainId:registryAddress */
  agentRegistry: string;
  /** Wallet address that owns this agent */
  wallet: string;
  /** Raw GitHub Gist URL (or custom) */
  agentURI: string;
  /** Transaction hash of registration */
  txHash: string;
  /** Network details */
  network: AgentNetwork;
  /** Registration status */
  status: RegistrationStatus;
  /** When this identity was registered */
  registeredAt: string; // ISO timestamp
  /** Last time this identity was verified */
  lastVerifiedAt?: string;
  /** Original registration form data */
  metadata: AgentRegistrationMetadata;
}

/** Registration form metadata stored with identity */
export interface AgentRegistrationMetadata {
  name: string;
  description: string;
  image?: string;
  services: AgentService[];
  x402Support: boolean;
  active: boolean;
  supportedTrust: ('reputation' | 'crypto-economic' | 'tee-attestation')[];
  agentURI?: string;
  gistId?: string;
}

/** Individual service/endpoint */
export interface AgentService {
  name: string;
  endpoint: string;
  version?: string;
  skills?: string[];
  domains?: string[];
}

/** Multiple agents per wallet (wallet can own multiple agents across registries) */
export interface WalletAgentMap {
  [walletAddress: string]: StoredAgentIdentity[];
}

/** Storage schema */
export const STORAGE_KEY = 'finality:erc8004:agents';

/** Feature flags */
export interface AgentModeConfig {
  /** Use ERC-8004 registered agents instead of hardcoded ones */
  useErc8004Agents: boolean;
  /** Auto-detect and load agent on wallet connect */
  autoDetectAgent: boolean;
  /** Fallback to mock agents if no ERC-8004 agent found */
  fallbackToMock: boolean;
  /** Default mock agents (for backward compatibility) */
  defaultMockAgents: {
    buyer: { agentRegistry: string; agentId: string; wallet: string };
    seller: { agentRegistry: string; agentId: string; wallet: string };
  };
}

// ============================================
// Validation Schemas
// ============================================

const agentServiceSchema = z.object({
  name: z.string().min(1),
  endpoint: z.string().min(1),
  version: z.string().optional(),
  skills: z.array(z.string()).optional(),
  domains: z.array(z.string()).optional(),
});

const agentMetadataSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  image: z.string().url().optional(),
  services: z.array(agentServiceSchema).default([]),
  x402Support: z.boolean().default(false),
  active: z.boolean().default(true),
  supportedTrust: z.array(z.enum(['reputation', 'crypto-economic', 'tee-attestation'])).default([]),
  agentURI: z.string().url().optional(),
  gistId: z.string().optional(),
});

const agentNetworkSchema = z.object({
  chainId: z.number(),
  network: z.string(),
  identityRegistry: z.string(),
  rpcUrl: z.string(),
  explorer: z.string(),
});

const storedAgentIdentitySchema = z.object({
  agentId: z.string(),
  agentRegistry: z.string().regex(/^eip155:\d+:0x[a-fA-F0-9]{40}$/),
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  agentURI: z.string().url(),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  network: agentNetworkSchema,
  status: z.enum(['pending', 'registered', 'failed', 'mock']),
  registeredAt: z.string().datetime(),
  lastVerifiedAt: z.string().datetime().optional(),
  metadata: agentMetadataSchema,
});

export type StoredAgentIdentitySchema = z.infer<typeof storedAgentIdentitySchema>;

// ============================================
// Utility Functions
// ============================================

/** Default GOAT Testnet3 network config */
export const GOAT_TESTNET3_NETWORK: AgentNetwork = {
  chainId: 48816,
  network: 'goat-testnet',
  identityRegistry: '0x556089008Fc0a60cD09390Eca93477ca254A5522',
  rpcUrl: 'https://rpc.testnet3.goat.network',
  explorer: 'https://explorer.testnet3.goat.network',
};

/** Default mock agents (from existing MVP) */
export const DEFAULT_MOCK_AGENTS = {
  buyer: {
    agentRegistry: 'eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e',
    agentId: '1',
    wallet: '0x27EB14742Ec8Fe485492a5b553EC9d13DB5f0aF4',
  },
  seller: {
    agentRegistry: 'eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e',
    agentId: '2',
    wallet: '0xB5668A4934A16416A3848F50775f71b6528EACF8',
  },
};

/** Default feature flag config */
export const DEFAULT_AGENT_MODE_CONFIG: AgentModeConfig = {
  useErc8004Agents: false, // OFF by default for backward compatibility
  autoDetectAgent: true,
  fallbackToMock: true,
  defaultMockAgents: DEFAULT_MOCK_AGENTS,
};

/** Format agent registry string */
export function formatAgentRegistry(chainId: number, registryAddress: string): string {
  return `eip155:${chainId}:${registryAddress.toLowerCase()}`;
}

/** Parse agent registry string */
export function parseAgentRegistry(registry: string): { chainId: number; registryAddress: string } | null {
  const match = registry.match(/^eip155:(\d+):(0x[a-fA-F0-9]{40})$/);
  if (!match) return null;
  return { chainId: parseInt(match[1], 10), registryAddress: match[2] };
}

/** Validate stored identity */
export function validateStoredIdentity(data: unknown): StoredAgentIdentity | null {
  const result = storedAgentIdentitySchema.safeParse(data);
  return result.success ? result.data : null;
}

/** Create identity from registration response */
export function createIdentityFromRegistration(
  wallet: string,
  registrationResponse: {
    agentId: string;
    txHash: string;
    agentURI: string;
    mode: 'mock' | 'live';
  },
  metadata: AgentRegistrationMetadata,
  network: AgentNetwork = GOAT_TESTNET3_NETWORK
): StoredAgentIdentity {
  return {
    agentId: registrationResponse.agentId,
    agentRegistry: formatAgentRegistry(network.chainId, network.identityRegistry),
    wallet: wallet.toLowerCase(),
    agentURI: registrationResponse.agentURI,
    txHash: registrationResponse.txHash,
    network,
    status: registrationResponse.mode === 'live' ? 'registered' : 'mock',
    registeredAt: new Date().toISOString(),
    metadata,
  };
}

/** Generate a unique key for an agent (wallet + agentRegistry + agentId) */
export function getAgentKey(identity: StoredAgentIdentity): string {
  return `${identity.wallet}:${identity.agentRegistry}:${identity.agentId}`;
}

/** Check if identity is valid (not expired, correct network) */
export function isIdentityValid(
  identity: StoredAgentIdentity,
  expectedNetwork?: AgentNetwork
): boolean {
  // Check status
  if (identity.status === 'failed') return false;
  
  // Check network matches if expected
  if (expectedNetwork && identity.network.chainId !== expectedNetwork.chainId) {
    return false;
  }
  
  // Check wallet format
  if (!/^0x[a-fA-F0-9]{40}$/.test(identity.wallet)) return false;
  
  // Check agentId is numeric (ERC-721 tokenId)
  if (!/^\d+$/.test(identity.agentId)) return false;
  
  return true;
}