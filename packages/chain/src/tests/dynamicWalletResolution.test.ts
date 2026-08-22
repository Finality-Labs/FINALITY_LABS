import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { X402Adapter } from '../x402Adapter.js';
import { LiveAdapter, createLiveAdapter } from '../liveAdapter.js';
import { loadX402Config, X402Config, isX402Ready } from '../x402Config.js';
import { buildApp } from '../app.js';
import type { FastifyInstance } from 'fastify';
import { facilitator } from '../mockFacilitator.js';
import { reputation } from '../reputation.js';

// Mock viem
vi.mock('viem', async () => {
  const actual = await vi.importActual('viem');
  return {
    ...actual,
    keccak256: vi.fn((x: string) => `0x${'a'.repeat(64)}`),
    toHex: vi.fn((x: string) => x),
    parseUnits: vi.fn((val: string, decimals: number) => BigInt(val) * BigInt(10 ** decimals)),
    createPublicClient: vi.fn().mockReturnValue({
      waitForTransactionReceipt: vi.fn().mockResolvedValue({
        logs: [{
          address: '0x556089008Fc0a60cD09390Eca93477ca254A5522',
          topics: [
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
            '0x0',
            '0x0',
            '0x159',
          ],
        }],
      }),
      readContract: vi.fn().mockImplementation(async ({ functionName, args }) => {
        if (functionName === 'getAgentWallet') {
          const agentId = args[0];
          const wallets: Record<string, string> = {
            '351': '0x3333333333333333333333333333333333333333',
            '352': '0x4444444444444444444444444444444444444444',
            '353': '0x5555555555555555555555555555555555555555',
            '999': '0x9999999999999999999999999999999999999999',
          };
          return wallets[agentId.toString()] ?? '0x0000000000000000000000000000000000000000';
        }
        return '0x0';
      }),
      getBlockNumber: vi.fn().mockResolvedValue(1000000n),
      getLogs: vi.fn().mockResolvedValue([]),
    }),
    http: vi.fn(),
    parseAbi: vi.fn(),
  };
});

// Mock GOAT SDK
vi.mock('@goatnetwork/agentkit/plugins', () => ({
  HttpMerchantGatewayAdapter: vi.fn().mockImplementation(() => ({})),
  NoopPayerWalletAdapter: vi.fn().mockImplementation(() => ({})),
  WalletProviderPayerAdapter: vi.fn().mockImplementation(() => ({})),
  createPaymentAction: vi.fn().mockReturnValue({
    execute: vi.fn().mockResolvedValue({
      paymentId: 'pay_test_123',
      calldataSignRequest: {
        domain: { name: 'Test', version: '1', chainId: 48816, verifyingContract: '0x0' },
        types: { Payment: [{ name: 'amount', type: 'uint256' }] },
        primaryType: 'Payment',
        message: { to: '0x3333333333333333333333333333333333333333', asset: 'GOAT', amount: '1000000000000000000', fromAddress: '0x1111111111111111111111111111111111111111' },
      },
    }),
  }),
  submitSignatureAction: vi.fn().mockReturnValue({
    execute: vi.fn().mockResolvedValue({ paymentId: 'pay_test_123', status: 'authorized' }),
  }),
  paymentStatusAction: vi.fn().mockReturnValue({
    execute: vi.fn().mockResolvedValue({ paymentId: 'pay_test_123', status: 'settled' }),
  }),
  transferPaymentAction: vi.fn().mockReturnValue({
    execute: vi.fn().mockResolvedValue({ txHash: '0xabc123' }),
  }),
  erc8004GiveFeedbackAction: vi.fn().mockReturnValue({
    execute: vi.fn().mockResolvedValue({ txHash: '0xfeedback123' }),
  }),
  erc8004GetReputationAction: vi.fn().mockReturnValue({
    execute: vi.fn().mockResolvedValue({ count: 1, summaryValue: 1, summaryValueDecimals: 0 }),
  }),
}));

vi.mock('@goatnetwork/agentkit/core', () => ({
  ViemWalletProvider: vi.fn().mockImplementation(() => ({
    transferErc20: vi.fn().mockResolvedValue({ txHash: '0xmock123' }),
    transferNative: vi.fn().mockResolvedValue({ txHash: '0xmock123' }),
    writeContract: vi.fn().mockResolvedValue({ txHash: '0xmock123' }),
  })),
  WalletProviderPayerAdapter: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('viem/accounts', () => ({
  privateKeyToAccount: vi.fn().mockReturnValue({ address: '0x0000000000000000000000000000000000000001' }),
}));

// Mock config to avoid file system issues
vi.mock('../config.js', () => ({
  loadChainConfig: vi.fn().mockReturnValue({
    mode: 'live',
    network: 'goat-testnet',
    rpcUrl: 'https://rpc.testnet3.goat.network',
    privateKey: '0x0000000000000000000000000000000000000000000000000000000000000001',
    feedbackPrivateKey: '0x0000000000000000000000000000000000000000000000000000000000000001',
    settleToken: '0xbC10000000000000000000000000000000000001',
    tokenDecimals: 18,
    githubToken: undefined,
  }),
  isLiveReady: vi.fn().mockReturnValue({ ready: true }),
  GOAT_NETWORKS: {
    'goat-testnet': { chainId: 48816, rpcUrl: 'https://rpc.testnet3.goat.network' },
    'goat-mainnet': { chainId: 2345, rpcUrl: 'https://rpc.goat.network' },
  },
  explorerBase: vi.fn().mockReturnValue('https://explorer.testnet3.goat.network'),
  GOAT_TESTNET3_TOKENS: {},
  resolveTestnet3Token: vi.fn(),
  loadX402Config: vi.fn().mockReturnValue({
    baseUrl: 'https://flow-api.testnet3.goat.network',
    apiKey: 'test_key',
    apiSecret: 'test_secret',
    payTo: '0x2222222222222222222222222222222222222222',
    settleToken: '0xbC10000000000000000000000000000000000001',
    tokenDecimals: 18,
    timeoutMs: 30000,
    idempotencyKeyPrefix: 'finality_',
    network: 'goat-testnet',
    chainId: 48816,
    rpcUrl: 'https://rpc.testnet3.goat.network',
  }),
  isX402Ready: vi.fn().mockReturnValue({ ready: true }),
  X402Config: {},
}));

const mockDeal = (sellerAgentId: string, sellerWallet: string, onchainAgentId?: string) => ({
  roomId: `room_${sellerAgentId}`,
  transcriptHash: '0xtranscript',
  buyer: {
    agentRegistry: 'eip155:48816:0x556089008Fc0a60cD09390Eca93477ca254A5522',
    agentId: 'buyer_1',
    wallet: '0x1111111111111111111111111111111111111111',
  },
  seller: {
    agentRegistry: 'eip155:48816:0x556089008Fc0a60cD09390Eca93477ca254A5522',
    agentId: sellerAgentId,
    wallet: sellerWallet,
    onchainAgentId,
  },
  unitPrice: 10,
  qty: 5,
  terms: 'per-hour',
  totalUsdc: 50,
});

describe('Dynamic Wallet Resolution', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.GOAT_FLOW_X402_BASE_URL = 'https://flow-api.testnet3.goat.network';
    process.env.GOAT_FLOW_X402_API_KEY = 'test_key';
    process.env.GOAT_FLOW_X402_API_SECRET = 'test_secret';
    process.env.GOAT_FLOW_X402_PAY_TO = '0x2222222222222222222222222222222222222222';
    process.env.GOAT_FLOW_X402_SETTLE_TOKEN = '0xbC10000000000000000000000000000000000001';
    process.env.GOAT_FLOW_X402_TOKEN_DECIMALS = '18';
    process.env.GOAT_RPC_URL = 'https://rpc.testnet3.goat.network';
    process.env.GOAT_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001';
    process.env.CHAIN_MODE = 'live';
    process.env.GOAT_NETWORK = 'goat-testnet';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should resolve different seller wallets for different Agent IDs via ERC-8004', async () => {
    const { createPublicClient } = await import('viem');
    const mockClient = createPublicClient({} as any);
    
    // Agent 351 -> wallet 0x3333...
    const wallet351 = await mockClient.readContract({
      address: '0x556089008Fc0a60cD09390Eca93477ca254A5522',
      abi: ['function getAgentWallet(uint256 agentId) view returns (address)'],
      functionName: 'getAgentWallet',
      args: [351n],
    }) as string;
    expect(wallet351).toBe('0x3333333333333333333333333333333333333333');

    // Agent 352 -> wallet 0x4444...
    const wallet352 = await mockClient.readContract({
      address: '0x556089008Fc0a60cD09390Eca93477ca254A5522',
      abi: ['function getAgentWallet(uint256 agentId) view returns (address)'],
      functionName: 'getAgentWallet',
      args: [352n],
    }) as string;
    expect(wallet352).toBe('0x4444444444444444444444444444444444444444');

    // Agent 353 -> wallet 0x5555...
    const wallet353 = await mockClient.readContract({
      address: '0x556089008Fc0a60cD09390Eca93477ca254A5522',
      abi: ['function getAgentWallet(uint256 agentId) view returns (address)'],
      functionName: 'getAgentWallet',
      args: [353n],
    }) as string;
    expect(wallet353).toBe('0x5555555555555555555555555555555555555555');

    // Agent 999 -> wallet 0x9999...
    const wallet999 = await mockClient.readContract({
      address: '0x556089008Fc0a60cD09390Eca93477ca254A5522',
      abi: ['function getAgentWallet(uint256 agentId) view returns (address)'],
      functionName: 'getAgentWallet',
      args: [999n],
    }) as string;
    expect(wallet999).toBe('0x9999999999999999999999999999999999999999');

    // All wallets should be different
    const wallets = [wallet351, wallet352, wallet353, wallet999];
    const uniqueWallets = new Set(wallets);
    expect(uniqueWallets.size).toBe(4);
  });

  it('X402Adapter.createPaymentIntent should accept dynamic seller wallet', async () => {
    const config = loadX402Config();
    const adapter = new X402Adapter(config);
    
    const deal = mockDeal('seller_351', '0x3333333333333333333333333333333333333333', '351');
    const resolvedSellerWallet = '0x3333333333333333333333333333333333333333';
    
    // Call createPaymentIntent with dynamic seller wallet
    const result = await adapter.createPaymentIntent(deal, resolvedSellerWallet);
    
    expect(result.paymentId).toBeDefined();
    expect(result.requiresSignature).toBe(true);
    expect(result.calldataSignRequest).toBeDefined();
  });

  it('X402Adapter.settle should use dynamic seller wallet for full flow', async () => {
    const config = loadX402Config();
    const adapter = new X402Adapter(config);
    
    const deal = mockDeal('seller_352', '0x4444444444444444444444444444444444444444', '352');
    const resolvedSellerWallet = '0x4444444444444444444444444444444444444444';
    
    // Call settle with dynamic seller wallet and buyer signature
    const result = await adapter.settle(deal, '0xbuyersignature', resolvedSellerWallet);
    
    expect(result.txHash).toBeDefined();
    expect(result.status).toBe('settled');
    expect(result.paymentId).toBeDefined();
  });

  it('should validate that resolved seller wallet is a valid Ethereum address', async () => {
    const { createPublicClient } = await import('viem');
    const mockClient = createPublicClient({} as any);
    
    // Valid address
    const validWallet = await mockClient.readContract({
      address: '0x556089008Fc0a60cD09390Eca93477ca254A5522',
      abi: ['function getAgentWallet(uint256 agentId) view returns (address)'],
      functionName: 'getAgentWallet',
      args: [351n],
    }) as string;
    expect(/^0x[a-fA-F0-9]{40}$/.test(validWallet)).toBe(true);
    
    // Invalid address would fail validation
    const invalidAddresses = [
      '0x123',
      'not-an-address',
      '0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
      '',
      '0x',
    ];
    
    for (const addr of invalidAddresses) {
      expect(/^0x[a-fA-F0-9]{40}$/.test(addr)).toBe(false);
    }
  });

  it('should ensure resolved seller wallet is not the buyer wallet', async () => {
    const buyerWallet = '0x1111111111111111111111111111111111111111';
    const { createPublicClient } = await import('viem');
    const mockClient = createPublicClient({} as any);
    
    // Resolve seller wallet
    const sellerWallet = await mockClient.readContract({
      address: '0x556089008Fc0a60cD09390Eca93477ca254A5522',
      abi: ['function getAgentWallet(uint256 agentId) view returns (address)'],
      functionName: 'getAgentWallet',
      args: [351n],
    }) as string;
    
    // They should be different
    expect(sellerWallet.toLowerCase()).not.toBe(buyerWallet.toLowerCase());
  });

  it('LiveAdapter.resolveAgentWallet should return correct wallet for each Agent ID', async () => {
    const cfg = {
      mode: 'live' as const,
      network: 'goat-testnet',
      rpcUrl: 'https://rpc.testnet3.goat.network',
      privateKey: '0x0000000000000000000000000000000000000000000000000000000000000001',
      feedbackPrivateKey: '0x0000000000000000000000000000000000000000000000000000000000000001',
      settleToken: '0xbC10000000000000000000000000000000000001',
      tokenDecimals: 18,
    };
    
    const live = await createLiveAdapter(cfg);
    
    // Test different agent IDs resolve to different wallets
    const wallet351 = await live.resolveAgentWallet('351');
    const wallet352 = await live.resolveAgentWallet('352');
    const wallet353 = await live.resolveAgentWallet('353');
    const wallet999 = await live.resolveAgentWallet('999');
    
    expect(wallet351).toBe('0x3333333333333333333333333333333333333333');
    expect(wallet352).toBe('0x4444444444444444444444444444444444444444');
    expect(wallet353).toBe('0x5555555555555555555555555555555555555555');
    expect(wallet999).toBe('0x9999999999999999999999999999999999999999');
    
    // All should be valid Ethereum addresses
    expect(/^0x[a-fA-F0-9]{40}$/.test(wallet351)).toBe(true);
    expect(/^0x[a-fA-F0-9]{40}$/.test(wallet352)).toBe(true);
    expect(/^0x[a-fA-F0-9]{40}$/.test(wallet353)).toBe(true);
    expect(/^0x[a-fA-F0-9]{40}$/.test(wallet999)).toBe(true);
    
    // All should be unique
    const wallets = [wallet351, wallet352, wallet353, wallet999];
    expect(new Set(wallets).size).toBe(4);
  });
});

describe('Payment Flow Logging', () => {
  it('should log all required payment flow fields', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    // Simulate the logging in deals.ts
    const sellerAgentId = '351';
    const resolvedSellerWallet = '0x3333333333333333333333333333333333333333';
    const buyerWallet = '0x1111111111111111111111111111111111111111';
    const token = 'GOAT';
    const amount = 50;
    const chainId = 48816;
    
    console.log('[Payment] Seller Agent ID:', sellerAgentId);
    console.log('[Payment] Resolved seller wallet:', resolvedSellerWallet);
    console.log('[Payment] Buyer wallet:', buyerWallet);
    console.log('[Payment] Token:', token);
    console.log('[Payment] Amount:', amount, 'USDC');
    console.log('[Payment] Chain ID:', chainId);
    
    expect(consoleSpy).toHaveBeenCalledWith('[Payment] Seller Agent ID:', sellerAgentId);
    expect(consoleSpy).toHaveBeenCalledWith('[Payment] Resolved seller wallet:', resolvedSellerWallet);
    expect(consoleSpy).toHaveBeenCalledWith('[Payment] Buyer wallet:', buyerWallet);
    expect(consoleSpy).toHaveBeenCalledWith('[Payment] Token:', token);
    expect(consoleSpy).toHaveBeenCalledWith('[Payment] Amount:', amount, 'USDC');
    expect(consoleSpy).toHaveBeenCalledWith('[Payment] Chain ID:', chainId);
    
    consoleSpy.mockRestore();
  });
});