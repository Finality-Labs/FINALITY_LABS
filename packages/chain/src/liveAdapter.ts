/**
 * Live on-chain adapter for GOAT Network (x402 settlement + ERC-8004 identity/reputation).
 *
 * Real counterpart to mockFacilitator.ts + reputation.ts. LAZY-LOADED (dynamic
 * import) only when CHAIN_MODE=live, so the default mock path never pulls in
 * @goatnetwork/agentkit / viem signing and stays keyless.
 *
 *  - register(agentURI): ERC-8004 IdentityRegistry.register -> waits for the
 *      receipt and parses the ERC-721 Transfer event to return the numeric
 *      agentId (tokenId) needed for feedback.
 *  - settle(sellerWallet, amountUsd): real token transfer (ERC-20 GOAT_SETTLE_TOKEN
 *      if set, else native gas token) from the settler wallet. Returns real txHash.
 *      (Custodial settle by the server's settler key — the simplest live model.
 *      Per-agent EIP-712 x402 signing is a follow-up; SDK x402 payer actions exist.)
 *  - giveFeedback / getReputation: real ERC-8004 giveFeedback / getSummary.
 */
import { parseUnits, type Log } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { ChainConfig } from "./config.js";
import { GOAT_NETWORKS } from "./config.js";
import { GOAT_TESTNET3_IDENTITY_REGISTRY } from "./erc8004.js";
import type { ProofOfPayment, ReputationSummary } from "./reputation.js";

export interface LiveAdapter {
  chainId: number;
  settlerAddress: string;
  /** Register an agent; returns txHash + numeric agentId (ERC-721 tokenId). */
  register(agentURI: string): Promise<{ txHash: string; agentId: string }>;
  settle(sellerWallet: string, amountUsd: number): Promise<{ txHash: string }>;
  giveFeedback(input: {
    agentId: string;
    value: number;
    decimals: number;
    tag1: string;
    tag2: string;
    endpoint: string;
    feedbackHash: string;
    proofOfPayment: ProofOfPayment;
  }): Promise<{ txHash: string }>;
  getReputation(agentId: string): Promise<ReputationSummary>;
}

// ERC-721 Transfer(address,address,uint256) — topic0; tokenId is topic3 (indexed).
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// Module-level lazy promise for the adapter
let liveAdapterPromise: Promise<LiveAdapter> | null = null;

/** Get or create the live adapter (lazy, only when CHAIN_MODE=live is ready) */
export async function getLiveAdapter(cfg: ChainConfig): Promise<LiveAdapter | null> {
  const { isLiveReady } = await import("./config.js");
  const check = isLiveReady(cfg);
  if (!check.ready) return null;
  if (!liveAdapterPromise) {
    liveAdapterPromise = createLiveAdapter(cfg);
  }
  return liveAdapterPromise;
}

export async function createLiveAdapter(cfg: ChainConfig): Promise<LiveAdapter> {
  // Dynamic imports: keep these out of the mock path entirely.
  const { ViemWalletProvider } = await import("@goatnetwork/agentkit/core");
  const {
    erc8004GiveFeedbackAction,
    erc8004GetReputationAction,
  } = await import("@goatnetwork/agentkit/plugins");
  const { http, createPublicClient } = await import("viem");

  const net = GOAT_NETWORKS[cfg.network];
  const FINALITY_IDENTITY_REGISTRY = GOAT_TESTNET3_IDENTITY_REGISTRY.address;
  const account = privateKeyToAccount(cfg.privateKey as `0x${string}`);
  const feedbackAccount = privateKeyToAccount(
    (cfg.feedbackPrivateKey ?? cfg.privateKey) as `0x${string}`
  );

  const chain = {
    id: net.chainId,
    name: cfg.network,
    nativeCurrency: { name: "GOAT", symbol: "GOAT", decimals: 18 },
    rpcUrls: { default: { http: [cfg.rpcUrl as string] } },
  } as const;

  const wallet = new ViemWalletProvider(account, chain as any, http(cfg.rpcUrl), cfg.network);
  const feedbackWallet = new ViemWalletProvider(
    feedbackAccount,
    chain as any,
    http(cfg.rpcUrl),
    cfg.network
  );
  const publicClient = createPublicClient({ chain: chain as any, transport: http(cfg.rpcUrl) });

  const ctx = () => ({ traceId: `finality-${Date.now()}`, network: cfg.network, now: Date.now() });
  const giveFeedback = erc8004GiveFeedbackAction(feedbackWallet as any);
  const getRep = erc8004GetReputationAction(feedbackWallet as any);

  // Full ABI for parsing AgentRegistered event

  return {
    chainId: net.chainId,
    settlerAddress: account.address,
    async register(agentURI) {
      const REGISTER_ABI = [
        "function register(string agentURI) returns (uint256 agentId)",
        "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
      ];

      const { txHash } = await wallet.writeContract(
        FINALITY_IDENTITY_REGISTRY,
        REGISTER_ABI,
        "register",
        [agentURI],
      );

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash as `0x${string}`,
      });

      let agentId = "";

      const mint = receipt.logs.find(
        (l: Log) =>
          l.address.toLowerCase() ===
          FINALITY_IDENTITY_REGISTRY.toLowerCase() &&
          l.topics[0] === TRANSFER_TOPIC &&
          l.topics.length === 4,
      );

      if (mint?.topics[3]) {
        agentId = BigInt(mint.topics[3]).toString();
      }

      if (!agentId) {
        throw new Error(
          `Registration succeeded but agentId could not be extracted. tx=${txHash}`,
        );
      }

      return { txHash, agentId };
    },

    async settle(sellerWallet, amountUsd) {
      if (cfg.settleToken) {
        const amount = parseUnits(amountUsd.toString(), cfg.tokenDecimals).toString();
        return wallet.transferErc20(cfg.settleToken, sellerWallet, amount);
      }
      const wei = parseUnits(amountUsd.toString(), 18).toString();
      return wallet.transferNative(sellerWallet, wei);
    },

    async giveFeedback(input) {
      const out = await giveFeedback.execute(ctx(), {
        agentId: input.agentId,
        value: input.value,
        valueDecimals: input.decimals,
        tag1: input.tag1,
        tag2: input.tag2,
        endpoint: input.endpoint,
        feedbackURI: "",
        feedbackHash: input.feedbackHash,
      });
      return { txHash: out.txHash };
    },

    async getReputation(agentId) {
      const out = await getRep.execute(ctx(), {
        agentId,
        clientAddresses: [feedbackAccount.address],
        tag1: "",
        tag2: "",
      });
      return {
        count: Number(out.count),
        summaryValue: Number(out.summaryValue),
        summaryValueDecimals: out.summaryValueDecimals,
      };
    },
  };
}
