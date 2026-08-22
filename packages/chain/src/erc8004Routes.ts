/**
 * ERC-8004 Agent Registration API Routes
 * Complete registration flow: generate registration.json -> upload to Gist -> register on-chain
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { loadChainConfig, isLiveReady, explorerBase, GOAT_NETWORKS } from './config.js';
import { getLiveAdapter } from './deals.js';
import { 
  AgentRegistrationFormSchema, 
  generateAgentRegistration, 
  validateAgentRegistration,
  GOAT_TESTNET3_IDENTITY_REGISTRY,
  formatAgentRegistry,
} from './erc8004.js';
import { 
  uploadRegistrationToGist, 
  updateRegistrationGist,
  isGistConfigured,
  GistUploadResult,
} from './gist.js';

const registrationRequestSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(2000),
  image: z.string().url().optional().or(z.literal('')),
  services: z.array(z.object({
    name: z.string().min(1),
    endpoint: z.string().min(1),
    version: z.string().optional(),
    skills: z.array(z.string()).optional(),
    domains: z.array(z.string()).optional(),
  })).default([]),
  x402Support: z.boolean().default(false),
  active: z.boolean().default(true),
  supportedTrust: z.array(z.enum(['reputation', 'crypto-economic', 'tee-attestation'])).default([]),
  // Optional: override the agentURI if already hosted elsewhere.
  // Empty string is allowed and falls through to the Gist-upload path.
  agentURI: z.string().url().optional().or(z.literal('')),
  // Optional: Gist ID to update existing gist
  gistId: z.string().optional(),
});

export interface RegistrationResponse {
  ok: boolean;
  mode: 'mock' | 'live';
  agentId?: string;
  txHash?: string;
  explorerUrl?: string;
  agentURI?: string;
  gist?: GistUploadResult;
  error?: string;
  details?: unknown;
}

// ============================================
// Agent Discovery (read-only, no transactions)
// ============================================

/** AgentRegistered(uint256 indexed agentId, address indexed owner, string agentURI) */
const AGENT_REGISTERED_TOPIC = '0xca52e62c367d81bb2e328eb795f7c7ba24afb478408a26c0e201d155c449bc4a';

/** How far back to scan for AgentRegistered logs (matches the GOAT dashboard server). */
const DISCOVERY_LOOKBACK_BLOCKS = BigInt(process.env.GOAT_DISCOVERY_LOOKBACK_BLOCKS ?? '500000');

export interface DiscoveredAgent {
  agentId: string;
  wallet: string;
  owner: string;
  agentURI: string;
  txHash: string;
  explorerUrl: string;
  metadata?: {
    name?: string;
    description?: string;
    image?: string;
    services?: Array<Record<string, unknown>>;
    x402Support?: boolean;
    active?: boolean;
    supportedTrust?: string[];
  };
}

export interface AgentsByWalletResponse {
  ok: boolean;
  wallet?: string;
  network?: {
    chainId: number;
    network: string;
    identityRegistry: string;
    rpcUrl: string;
    explorer: string;
  };
  agents: DiscoveredAgent[];
  error?: string;
}

/**
 * Discover ERC-8004 agents owned by a wallet on GOAT Testnet3 (READ-ONLY).
 *
 * The Identity Registry is NOT ERC-721 enumerable, so instead of
 * tokenOfOwnerByIndex we scan AgentRegistered events filtered by owner and
 * re-verify current ownership with ownerOf() at read time. The authoritative
 * agentURI comes from tokenURI(agentId). Reuses handleValidateAgentURI to
 * enrich the result with the agent's registration metadata (best effort).
 *
 * No transaction is ever created — this only proves an existing registration.
 */
export async function handleDiscoverAgentsByWallet(
  wallet: string
): Promise<AgentsByWalletResponse> {
  const { createPublicClient, http, parseAbi } = await import('viem');

  const normalized = wallet.toLowerCase();
  const cfg = loadChainConfig();
  const net = GOAT_NETWORKS[cfg.network] ?? GOAT_NETWORKS['goat-testnet'];
  const rpcUrl = cfg.rpcUrl ?? net.rpcUrl;

  const pc = createPublicClient({
    chain: {
      id: net.chainId,
      name: cfg.network,
      nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    },
    transport: http(rpcUrl),
  });

  const registry = GOAT_TESTNET3_IDENTITY_REGISTRY.address;
  const abi = parseAbi([
    'function ownerOf(uint256 agentId) view returns (address)',
    'function getAgentWallet(uint256 agentId) view returns (address)',
    'function tokenURI(uint256 agentId) view returns (string)',
  ]);
  const network = {
    chainId: GOAT_TESTNET3_IDENTITY_REGISTRY.chainId,
    network: GOAT_TESTNET3_IDENTITY_REGISTRY.network,
    identityRegistry: registry,
    rpcUrl: GOAT_TESTNET3_IDENTITY_REGISTRY.rpcUrl,
    explorer: GOAT_TESTNET3_IDENTITY_REGISTRY.explorer,
  };

  try {
    const block = await pc.getBlockNumber();
    const fromBlock = block > DISCOVERY_LOOKBACK_BLOCKS ? block - DISCOVERY_LOOKBACK_BLOCKS : 0n;
    const ownerTopic = `0x${'0'.repeat(24)}${normalized.slice(2)}`;

    const logs = await pc.getLogs({
      address: registry as `0x${string}`,
      topics: [AGENT_REGISTERED_TOPIC, null, ownerTopic] as any,
      fromBlock,
      toBlock: 'latest',
    } as any);

    const agents: DiscoveredAgent[] = [];
    for (const log of logs) {
      // Defensively verify the owner topic matches (some RPCs ignore topic filters).
      const t2 = (log.topics[2] ?? '').toLowerCase();
      if (t2 !== ownerTopic) continue;

      const tokenId = BigInt(log.topics[1] ?? '0x0');
      if (tokenId === 0n) continue; // skip malformed/mint-ish entries
      const agentId = tokenId.toString();

      // Re-verify the wallet still owns the token (transfer-safe).
      let owner = '';
      try {
        owner = (await pc.readContract({
          address: registry as `0x${string}`,
          abi,
          functionName: 'ownerOf',
          args: [tokenId],
        })) as string;
      } catch {
        // ignore; ownership unknown
      }
      if (owner && owner.toLowerCase() !== normalized) continue;

      // Authoritative agentURI from the registry (updated after registration).
      let agentURI = '';
      try {
        agentURI = (await pc.readContract({
          address: registry as `0x${string}`,
          abi,
          functionName: 'tokenURI',
          args: [tokenId],
        })) as string;
      } catch {
        // ignore
      }
      if (!agentURI) continue;

      const agent: DiscoveredAgent = {
        agentId,
        wallet: normalized,
        owner: owner || normalized,
        agentURI,
        txHash: log.transactionHash,
        explorerUrl: `${GOAT_TESTNET3_IDENTITY_REGISTRY.explorer}/token/${registry}/${agentId}`,
      };

      // Enrich with the agent's registration.json (best effort; never fails discovery).
      try {
        const check = await handleValidateAgentURI(agentURI);
        if (check.ok && check.valid && check.registration) {
          const reg = check.registration as Record<string, unknown>;
          agent.metadata = {
            name: typeof reg.name === 'string' ? reg.name : undefined,
            description: typeof reg.description === 'string' ? reg.description : undefined,
            image: typeof reg.image === 'string' ? reg.image : undefined,
            services: Array.isArray(reg.services) ? (reg.services as Array<Record<string, unknown>>) : undefined,
            x402Support: typeof reg.x402Support === 'boolean' ? reg.x402Support : undefined,
            active: typeof reg.active === 'boolean' ? reg.active : undefined,
            supportedTrust: Array.isArray(reg.supportedTrust) ? (reg.supportedTrust as string[]) : undefined,
          };
        }
      } catch {
        // metadata is optional
      }

      agents.push(agent);
    }

    // Newest tokenId first so clients can pick a deterministic primary agent.
    agents.sort((a, b) => (BigInt(b.agentId) > BigInt(a.agentId) ? 1 : BigInt(b.agentId) < BigInt(a.agentId) ? -1 : 0));

    return { ok: true, wallet: normalized, network, agents };
  } catch (err) {
    return { ok: false, wallet: normalized, network, agents: [], error: (err as Error).message };
  }
}

/**
 * Complete agent registration flow:
 * 1. Validate input
 * 2. Generate registration.json
 * 3. Upload to GitHub Gist (get raw URL as agentURI)
 * 4. Register on ERC-8004 Identity Registry (live mode only)
 * 5. Return agentId, txHash, agentURI
 */
export async function handleAgentRegistration(
  body: unknown
): Promise<RegistrationResponse> {
  const cfg = loadChainConfig();
  const check = isLiveReady(cfg);
  const mode = check.ready ? 'live' : 'mock';

  // 1. Validate input
  const parsed = registrationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      mode,
      error: 'Invalid registration data',
      details: parsed.error.issues,
    };
  }
  const input = parsed.data;

  try {
    // 2. Generate registration.json
    const agentRegistry = formatAgentRegistry(
      GOAT_TESTNET3_IDENTITY_REGISTRY.chainId,
      GOAT_TESTNET3_IDENTITY_REGISTRY.address
    );

    let registrationJson = generateAgentRegistration(input, {
      chainId: GOAT_TESTNET3_IDENTITY_REGISTRY.chainId,
      registryAddress: GOAT_TESTNET3_IDENTITY_REGISTRY.address,
      // agentId will be added after on-chain registration
    });

    let agentURI = input.agentURI;
    let gistResult: GistUploadResult | undefined;

    // 3. Upload to GitHub Gist if no agentURI provided and GITHUB_TOKEN configured
    if (!agentURI) {
      if (!isGistConfigured()) {
        return {
          ok: false,
          mode,
          error: 'GITHUB_TOKEN not configured. Set GITHUB_TOKEN env var with gist scope, or provide agentURI manually.',
        };
      }

      try {
        if (input.gistId) {
          // Update existing gist
          gistResult = await updateRegistrationGist(input.gistId, registrationJson, cfg.githubToken!);
        } else {
          // Create new gist
          gistResult = await uploadRegistrationToGist(registrationJson, cfg.githubToken!);
        }
        agentURI = gistResult.rawUrl;
      } catch (err) {
        console.error('[erc8004] Gist upload failed:', (err as Error).message);
        return {
          ok: false,
          mode,
          error: `Gist upload failed: ${(err as Error).message}`,
        };
      }
    }

    // 4. Register on-chain (live mode only)
    let agentId: string | undefined;
    let txHash: string | undefined;
    let explorerUrl: string | undefined;

    if (mode === 'live') {
      const live = await getLiveAdapter();
      if (!live) {
        return {
          ok: false,
          mode: 'mock',
          error: 'Live adapter unavailable',
        };
      }

      try {
        const result = await live.register(agentURI!);
        txHash = result.txHash;
        agentId = result.agentId;
        explorerUrl = `${explorerBase(cfg.network)}/tx/${txHash}`;

        // 5. Update registration.json with the on-chain agentId and re-upload to Gist
        if (agentId && gistResult) {
          registrationJson = generateAgentRegistration(input, {
            chainId: GOAT_TESTNET3_IDENTITY_REGISTRY.chainId,
            registryAddress: GOAT_TESTNET3_IDENTITY_REGISTRY.address,
            agentId: parseInt(agentId, 10),
          });
          
          try {
            await updateRegistrationGist(gistResult.id, registrationJson, cfg.githubToken!);
            // agentURI remains the same (raw URL doesn't change on update)
          } catch (err) {
            console.warn('[erc8004] Failed to update Gist with agentId:', (err as Error).message);
            // Non-fatal, registration still succeeded on-chain
          }
        }
      } catch (err) {
        console.error('[erc8004] On-chain registration failed:', (err as Error).message);
        return {
          ok: false,
          mode: 'live',
          error: `On-chain registration failed: ${(err as Error).message}`,
          agentURI,
          gist: gistResult,
        };
      }
    } else {
      // Mock mode: return success with agentURI but no on-chain registration
      return {
        ok: true,
        mode: 'mock',
        agentURI,
        gist: gistResult,
        error: 'Mock mode: agentURI generated but not registered on-chain. Set CHAIN_MODE=live with GOAT_PRIVATE_KEY to register on GOAT Testnet3.',
      };
    }

    return {
      ok: true,
      mode: 'live',
      agentId,
      txHash,
      explorerUrl,
      agentURI,
      gist: gistResult,
    };
  } catch (err) {
    console.error('[erc8004] Registration failed:', (err as Error).message);
    return {
      ok: false,
      mode,
      error: `Registration failed: ${(err as Error).message}`,
    };
  }
}

/**
 * Validate an existing agentURI (fetch and validate registration.json)
 */
export async function handleValidateAgentURI(
  agentURI: string
): Promise<{ ok: boolean; valid: boolean; registration?: object; error?: string }> {
  try {
    const response = await fetch(agentURI, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Finality-Agent-Registration',
      },
    });

    if (!response.ok) {
      return { ok: true, valid: false, error: `Failed to fetch: ${response.status}` };
    }

    const data = await response.json();
    const validated = validateAgentRegistration(data);
    return { ok: true, valid: true, registration: validated };
  } catch (err) {
    return { ok: true, valid: false, error: (err as Error).message };
  }
}

/**
 * Register agent registration routes
 */
export function registerErc8004Routes(app: FastifyInstance): void {
  // POST /erc8004/register - Complete agent registration flow
  app.post('/erc8004/register', async (request, reply) => {
    const result = await handleAgentRegistration(request.body);
    const status = result.ok ? 200 : (result.mode === 'mock' ? 422 : 500);
    return reply.code(status).send(result);
  });

  // POST /erc8004/validate-uri - Validate an agentURI
  const validateUriSchema = z.object({ agentURI: z.string().url() });
  app.post('/erc8004/validate-uri', async (request, reply) => {
    const parsed = validateUriSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'agentURI (URL) required' });
    }
    const result = await handleValidateAgentURI(parsed.data.agentURI);
    return reply.code(200).send(result);
  });

  // GET /erc8004/agents-by-wallet?wallet=0x... - Discover a wallet's registered agents (READ-ONLY)
  const walletParamSchema = z.object({ wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/) });
  app.get('/erc8004/agents-by-wallet', async (request, reply) => {
    const parsed = walletParamSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, agents: [], error: 'wallet (0x-prefixed address) query param required' });
    }
    return handleDiscoverAgentsByWallet(parsed.data.wallet);
  });

  // GET /erc8004/config - Get registration configuration
  app.get('/erc8004/config', async () => {
    const cfg = loadChainConfig();
    const check = isLiveReady(cfg);
    return {
      network: cfg.network,
      chainId: GOAT_TESTNET3_IDENTITY_REGISTRY.chainId,
      identityRegistry: GOAT_TESTNET3_IDENTITY_REGISTRY.address,
      explorer: GOAT_TESTNET3_IDENTITY_REGISTRY.explorer,
      rpcUrl: GOAT_TESTNET3_IDENTITY_REGISTRY.rpcUrl,
      backupRpcUrl: GOAT_TESTNET3_IDENTITY_REGISTRY.backupRpcUrl,
      gistConfigured: isGistConfigured(),
      mode: check.ready ? 'live' : 'mock',
      liveReady: check.ready,
      reason: check.reason,
      serviceTypes: [
        { value: 'A2A', label: 'A2A (Agent2Agent)' },
        { value: 'MCP', label: 'MCP (Model Context Protocol)' },
        { value: 'OASF', label: 'OASF (Open Agent Schema Framework)' },
        { value: 'ENS', label: 'ENS (Ethereum Name Service)' },
        { value: 'DID', label: 'DID (Decentralized Identifier)' },
        { value: 'email', label: 'Email' },
        { value: 'web', label: 'Web Interface' },
        { value: 'x402', label: 'x402 Payment' },
      ],
      trustModels: ['reputation', 'crypto-economic', 'tee-attestation'],
    };
  });
}