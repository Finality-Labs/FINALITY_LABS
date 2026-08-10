/**
 * ERC-8004 Agent Registration API Routes
 * Complete registration flow: generate registration.json -> upload to Gist -> register on-chain
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { loadChainConfig, isLiveReady, explorerBase } from './config.js';
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
  // Optional: override the agentURI if already hosted elsewhere
  agentURI: z.string().url().optional(),
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