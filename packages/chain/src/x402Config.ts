/**
 * GOAT Flow x402 Configuration
 *
 * Externalized configuration for GOAT Flow x402 (formerly GoatX402) settlement.
 * All values are driven by environment variables — no hardcoded addresses, credentials,
 * or network defaults. This module is the single source of truth for x402 settings.
 *
 * Environment Variables:
 *   GOAT_FLOW_X402_BASE_URL        Base URL for GOAT Flow API
 *   GOAT_FLOW_X402_API_KEY         Merchant API key
 *   GOAT_FLOW_X402_API_SECRET      Merchant API secret
 *   GOAT_FLOW_X402_PAY_TO          Receiving wallet address (merchant/payee)
 *   GOAT_FLOW_X402_SETTLE_TOKEN    ERC-20 token contract address to settle in (optional; omit for native)
 *   GOAT_FLOW_X402_TOKEN_DECIMALS  Decimals for settle token (default: 18)
 *   GOAT_FLOW_X402_TIMEOUT_MS      Request timeout in milliseconds (default: 30000)
 *   GOAT_FLOW_X402_IDEMPOTENCY_KEY_PREFIX  Prefix for idempotency keys (default: "finality_")
 *
 * GOAT Testnet3 (chainId 48816) is the only supported network for Stage 1.
 */

export interface X402Config {
  /** Base URL for the GOAT Flow x402 API (e.g., https://flow-api.testnet3.goat.network) */
  baseUrl: string;

  /** Merchant API key from GOAT Flow dashboard */
  apiKey: string;

  /** Merchant API secret from GOAT Flow dashboard */
  apiSecret: string;

  /** Receiving wallet address (payTo) — where settlements are sent */
  payTo: string;

  /** ERC-20 token contract address for settlement (omit for native GOAT token) */
  settleToken?: string;

  /** Decimals for the settle token (default: 18 for native GOAT, 6 for USDC, etc.) */
  tokenDecimals: number;

  /** Request timeout in milliseconds (default: 30000) */
  timeoutMs: number;

  /** Prefix for idempotency keys to avoid collisions (default: "finality_") */
  idempotencyKeyPrefix: string;

  /** Network identifier — only "goat-testnet" supported in Stage 1 */
  network: 'goat-testnet';

  /** Chain ID for GOAT Testnet3 */
  chainId: 48816;

  /** RPC URL for the network (inherited from main chain config) */
  rpcUrl: string;
}

/**
 * Load x402 configuration from environment variables.
 * All values are required except settleToken (native token fallback).
 */
export function loadX402Config(env: NodeJS.ProcessEnv = process.env): X402Config {
  const baseUrl = env.GOAT_FLOW_X402_BASE_URL;
  const apiKey = env.GOAT_FLOW_X402_API_KEY;
  const apiSecret = env.GOAT_FLOW_X402_API_SECRET;
  const payTo = env.GOAT_FLOW_X402_PAY_TO;

  if (!baseUrl) {
    throw new Error('GOAT_FLOW_X402_BASE_URL is required (e.g., https://flow-api.testnet3.goat.network)');
  }
  if (!apiKey) {
    throw new Error('GOAT_FLOW_X402_API_KEY is required (merchant API key from GOAT Flow dashboard)');
  }
  if (!apiSecret) {
    throw new Error('GOAT_FLOW_X402_API_SECRET is required (merchant API secret from GOAT Flow dashboard)');
  }
  if (!payTo) {
    throw new Error('GOAT_FLOW_X402_PAY_TO is required (receiving wallet address for settlements)');
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(payTo)) {
    throw new Error('GOAT_FLOW_X402_PAY_TO must be a valid 0x-prefixed Ethereum address');
  }

  const settleToken = env.GOAT_FLOW_X402_SETTLE_TOKEN;
  if (settleToken && !/^0x[a-fA-F0-9]{40}$/.test(settleToken)) {
    throw new Error('GOAT_FLOW_X402_SETTLE_TOKEN must be a valid 0x-prefixed Ethereum address');
  }

  const tokenDecimals = env.GOAT_FLOW_X402_TOKEN_DECIMALS
    ? Number(env.GOAT_FLOW_X402_TOKEN_DECIMALS)
    : 18;

  if (!Number.isInteger(tokenDecimals) || tokenDecimals < 0 || tokenDecimals > 38) {
    throw new Error('GOAT_FLOW_X402_TOKEN_DECIMALS must be an integer between 0 and 38');
  }

  const timeoutMs = env.GOAT_FLOW_X402_TIMEOUT_MS
    ? Number(env.GOAT_FLOW_X402_TIMEOUT_MS)
    : 30_000;

  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000) {
    throw new Error('GOAT_FLOW_X402_TIMEOUT_MS must be an integer >= 1000');
  }

  const idempotencyKeyPrefix = env.GOAT_FLOW_X402_IDEMPOTENCY_KEY_PREFIX ?? 'finality_';

  // RPC URL is inherited from the main chain config
  const { GOAT_NETWORKS, loadChainConfig } = require('./config.js');
  const chainCfg = loadChainConfig(env);
  const rpcUrl = chainCfg.rpcUrl ?? GOAT_NETWORKS['goat-testnet']?.rpcUrl;

  return {
    baseUrl: baseUrl.replace(/\/+$/, ''), // strip trailing slashes
    apiKey,
    apiSecret,
    payTo,
    settleToken,
    tokenDecimals,
    timeoutMs,
    idempotencyKeyPrefix,
    network: 'goat-testnet',
    chainId: 48816,
    rpcUrl,
  };
}

/**
 * Validate that x402 configuration is complete for live settlement.
 * Returns { ready: true } if all required vars are set, or { ready: false, reason }.
 */
export function isX402Ready(env: NodeJS.ProcessEnv = process.env): { ready: boolean; reason?: string } {
  try {
    loadX402Config(env);
    return { ready: true };
  } catch (e) {
    return { ready: false, reason: (e as Error).message };
  }
}

/**
 * Supported ERC-20 tokens on GOAT Testnet3 (from GOAT SDK tokens.ts).
 * These are the canonical token addresses — DO NOT override via env.
 * Use GOAT_FLOW_X402_SETTLE_TOKEN to select one of these by address.
 */
export const GOAT_TESTNET3_TOKENS = {
  WGBTC: {
    symbol: 'WGBTC',
    address: '0xBC10000000000000000000000000000000000000',
    name: 'Wrapped GOAT BTC',
    decimals: 8,
  },
  GOAT: {
    symbol: 'GOAT',
    address: '0xbC10000000000000000000000000000000000001',
    name: 'Goat Token',
    decimals: 18,
  },
  BRIDGE: {
    symbol: 'BRIDGE',
    address: '0xBC10000000000000000000000000000000000003',
    name: 'Bridge',
    decimals: 18,
  },
  BITCOIN: {
    symbol: 'BITCOIN',
    address: '0xbC10000000000000000000000000000000000005',
    name: 'Bitcoin Oracle',
    decimals: 18,
  },
  OKU_SWAP_ROUTER: {
    symbol: 'OKU_SWAP_ROUTER',
    address: '0xaa52bB8110fE38D0d2d2AF0B85C3A3eE622CA455',
    name: 'OKU SwapRouter02',
    decimals: 18,
  },
  OKU_QUOTER: {
    symbol: 'OKU_QUOTER',
    address: '0x5911cB3633e764939edc2d92b7e1ad375Bb57649',
    name: 'OKU QuoterV2',
    decimals: 18,
  },
  OKU_POSITION_MANAGER: {
    symbol: 'OKU_POSITION_MANAGER',
    address: '0x743E03cceB4af2efA3CC76838f6E8B50B63F184c',
    name: 'OKU PositionManager',
    decimals: 18,
  },
  OKU_FACTORY: {
    symbol: 'OKU_FACTORY',
    address: '0xcb2436774C3e191c85056d248EF4260ce5f27A9D',
    name: 'OKU V3Factory',
    decimals: 18,
  },
  LZ_ENDPOINT: {
    symbol: 'LZ_ENDPOINT',
    address: '0x6F475642a6e85809B1c36Fa62763669b1b48DD5B',
    name: 'LayerZero Endpoint V2',
    decimals: 18,
  },
} as const;

export type GoatTestnet3TokenSymbol = keyof typeof GOAT_TESTNET3_TOKENS;

/**
 * Resolve token metadata by symbol or address.
 * Returns undefined if not a known GOAT Testnet3 token.
 */
export function resolveTestnet3Token(symbolOrAddress: string): (typeof GOAT_TESTNET3_TOKENS)[GoatTestnet3TokenSymbol] | undefined {
  // Try by symbol first
  const upper = symbolOrAddress.toUpperCase();
  if (upper in GOAT_TESTNET3_TOKENS) {
    return GOAT_TESTNET3_TOKENS[upper as GoatTestnet3TokenSymbol];
  }

  // Try by address (case-insensitive)
  const normalizedAddr = symbolOrAddress.toLowerCase();
  for (const token of Object.values(GOAT_TESTNET3_TOKENS)) {
    if (token.address.toLowerCase() === normalizedAddr) {
      return token;
    }
  }

  return undefined;
}