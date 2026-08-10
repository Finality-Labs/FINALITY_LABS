/**
 * ERC-8004 Agent Registration Types and Utilities
 * Following the official ERC-8004 specification for agent registration metadata
 * Reference: https://eips.ethereum.org/EIPS/eip-8004
 * Reference: https://best-practices.8004scan.io/docs/01-agent-metadata-standard.html
 */

import { z } from 'zod';

// ============================================
// Core ERC-8004 Types
// ============================================

/** Agent registration file schema (agentURI JSON) */
export const AgentRegistrationSchema = z.object({
  /** Schema identifier - MUST match EIP-8004 */
  type: z.string().url().default('https://eips.ethereum.org/EIPS/eip-8004#registration-v1'),
  
  /** Human-readable agent name */
  name: z.string().min(1).max(100),
  
  /** Natural language description of the agent */
  description: z.string().min(1).max(2000),
  
  /** Agent avatar/logo image URL */
  image: z.string().url().optional(),
  
  /** Services/endpoints the agent exposes */
  services: z.array(z.object({
    /** Service name (e.g., 'A2A', 'MCP', 'OASF', 'ENS', 'DID', 'email', 'web') */
    name: z.string().min(1).max(50),
    /** Service endpoint URL or identifier */
    endpoint: z.string().min(1).max(500),
    /** Service version (optional but recommended) */
    version: z.string().max(50).optional(),
    /** OASF-specific fields */
    skills: z.array(z.string()).optional(),
    domains: z.array(z.string()).optional(),
  })).default([]),
  
  /** Whether the agent supports x402 payments */
  x402Support: z.boolean().default(false),
  
  /** Whether the agent is currently active */
  active: z.boolean().default(true),
  
  /** On-chain registration references */
  registrations: z.array(z.object({
    /** ERC-721 tokenId assigned by the Identity Registry */
    agentId: z.number().int().positive(),
    /** Namespace:chainId:identityRegistry (e.g., 'eip155:48816:0x5560...') */
    agentRegistry: z.string().regex(/^eip155:\d+:0x[a-fA-F0-9]{40}$/),
  })).default([]),
  
  /** Trust models supported by this agent */
  supportedTrust: z.array(z.enum(['reputation', 'crypto-economic', 'tee-attestation'])).default([]),
});

/** Input form data for agent registration */
export const AgentRegistrationFormSchema = z.object({
  name: z.string().min(1, 'Agent name is required').max(100, 'Name too long (max 100 chars)'),
  description: z.string().min(1, 'Description is required').max(2000, 'Description too long (max 2000 chars)'),
  image: z.string().url('Invalid image URL').optional().or(z.literal('')),
  services: z.array(z.object({
    name: z.string().min(1, 'Service name required'),
    endpoint: z.string().min(1, 'Service endpoint required'),
    version: z.string().optional(),
    skills: z.array(z.string()).optional(),
    domains: z.array(z.string()).optional(),
  })).default([]),
  x402Support: z.boolean().default(false),
  active: z.boolean().default(true),
  supportedTrust: z.array(z.enum(['reputation', 'crypto-economic', 'tee-attestation'])).default([]),
});

/** Predefined service types following ERC-8004 conventions */
export const SERVICE_TYPES = [
  { value: 'A2A', label: 'A2A (Agent2Agent)', description: 'Agent-to-Agent protocol endpoint' },
  { value: 'MCP', label: 'MCP (Model Context Protocol)', description: 'Model Context Protocol server' },
  { value: 'OASF', label: 'OASF (Open Agent Schema Framework)', description: 'OASF manifest/taxonomy' },
  { value: 'ENS', label: 'ENS (Ethereum Name Service)', description: 'ENS name for the agent' },
  { value: 'DID', label: 'DID (Decentralized Identifier)', description: 'DID for the agent' },
  { value: 'email', label: 'Email', description: 'Contact email address' },
  { value: 'web', label: 'Web Interface', description: 'Web-based agent interface' },
  { value: 'x402', label: 'x402 Payment', description: 'x402 payment endpoint' },
] as const;

/** GOAT Testnet3 Identity Registry configuration */
export const GOAT_TESTNET3_IDENTITY_REGISTRY = {
  address: '0x556089008Fc0a60cD09390Eca93477ca254A5522' as const,
  chainId: 48816,
  network: 'goat-testnet',
  explorer: 'https://explorer.testnet3.goat.network',
  rpcUrl: 'https://rpc.testnet3.goat.network',
  backupRpcUrl: 'https://rpc.ankr.com/goat_testnet',
} as const;

/** ERC-8004 Identity Registry ABI (minimal for registration) */
export const IDENTITY_REGISTRY_ABI = [
  'function register(string agentURI) returns (uint256 agentId)',
  'function register(string agentURI, tuple(string metadataKey, bytes metadataValue)[] metadata) returns (uint256 agentId)',
  'function register() returns (uint256 agentId)',
  'function setAgentURI(uint256 agentId, string newURI) external',
  'function getAgentWallet(uint256 agentId) view returns (address)',
  'function ownerOf(uint256 agentId) view returns (address)',
  'function tokenURI(uint256 agentId) view returns (string)',
  'event AgentRegistered(uint256 indexed agentId, address indexed owner, string agentURI)',
  'event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy)',
] as const;

/** Agent ID format: eip155:{chainId}:{registryAddress}:{agentId} */
export function formatAgentRegistry(chainId: number, registryAddress: string): string {
  return `eip155:${chainId}:${registryAddress.toLowerCase()}`;
}

/** Parse agent registry string */
export function parseAgentRegistry(registry: string): { chainId: number; registryAddress: string } | null {
  const match = registry.match(/^eip155:(\d+):(0x[a-fA-F0-9]{40})$/);
  if (!match) return null;
  return { chainId: parseInt(match[1], 10), registryAddress: match[2] };
}

/** Generate agent registration JSON from form data */
export function generateAgentRegistration(
  formData: z.infer<typeof AgentRegistrationFormSchema>,
  options: {
    chainId: number;
    registryAddress: string;
    agentId?: number;
  }
): z.infer<typeof AgentRegistrationSchema> {
  const agentRegistry = formatAgentRegistry(options.chainId, options.registryAddress);
  
  return {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: formData.name,
    description: formData.description,
    image: formData.image || undefined,
    services: formData.services.map(s => ({
      name: s.name,
      endpoint: s.endpoint,
      version: s.version,
      skills: s.skills,
      domains: s.domains,
    })),
    x402Support: formData.x402Support,
    active: formData.active,
    registrations: options.agentId ? [{
      agentId: options.agentId,
      agentRegistry,
    }] : [],
    supportedTrust: formData.supportedTrust,
  };
}

/** Validate agent registration JSON */
export function validateAgentRegistration(data: unknown): z.infer<typeof AgentRegistrationSchema> {
  return AgentRegistrationSchema.parse(data);
}

// Type exports
export type AgentRegistration = z.infer<typeof AgentRegistrationSchema>;
export type AgentRegistrationForm = z.infer<typeof AgentRegistrationFormSchema>;
export type ServiceType = typeof SERVICE_TYPES[number]['value'];