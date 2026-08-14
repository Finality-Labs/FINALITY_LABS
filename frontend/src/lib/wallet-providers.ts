/**
 * Injected EVM Provider Discovery
 * Enumerates injected EIP-1193 providers using EIP-6963 (announce/request)
 * with a legacy fallback (window.ethereum, window.phantom.ethereum).
 *
 * The app never blindly trusts window.ethereum — any wallet can inject it.
 * Instead each provider is explicitly identified as MetaMask or Phantom EVM.
 */

// ============================================
// Types
// ============================================

export type WalletId = 'metamask' | 'phantom';

export interface EIP1193RequestArgs {
  method: string;
  params?: unknown[] | Record<string, unknown>;
}

export interface EIP1193Provider {
  isMetaMask?: boolean;
  isPhantom?: boolean;
  providers?: EIP1193Provider[];
  request: (args: EIP1193RequestArgs) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeAllListeners?: (event: string) => void;
}

export interface InjectedWalletProvider {
  kind: WalletId;
  name: string;
  provider: EIP1193Provider;
  eip6963: boolean;
}

interface Eip6963Announce {
  info?: { uuid?: string; name?: string; icon?: string };
  provider?: EIP1193Provider;
}

interface WindowWithWalletInjection {
  ethereum?: EIP1193Provider;
  phantom?: { ethereum?: EIP1193Provider };
  solana?: unknown;
}

// ============================================
// Provider classification
// ============================================

/**
 * Classify an EIP-1193 provider as MetaMask or Phantom EVM.
 * Phantom is checked first because some Phantom EVM builds also flag isMetaMask.
 */
function classifyProvider(provider: EIP1193Provider, name?: string): WalletId | null {
  if (!provider?.request) return null;

  const normalizedName = (name || '').toLowerCase();

  if (normalizedName.includes('phantom') || provider.isPhantom) {
    return 'phantom';
  }

  if (normalizedName.includes('metamask') || provider.isMetaMask) {
    return 'metamask';
  }

  return null;
}

// ============================================
// EIP-6963 discovery
// ============================================

function collectEip6963(timeoutMs = 750): Promise<InjectedWalletProvider[]> {
  if (typeof window === 'undefined') return Promise.resolve([]);

  return new Promise((resolve) => {
    const providers: InjectedWalletProvider[] = [];

    const listener = (event: Event) => {
      const detail = (event as CustomEvent<Eip6963Announce>).detail;
      const provider = detail?.provider;
if (!provider) return;

const name = detail?.info?.name || '';
const kind = classifyProvider(provider, name);
if (!kind) return;

providers.push({ kind, name, provider, eip6963: true });
    };

    window.addEventListener('eip6963:announceProvider', listener);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', listener);
      resolve(providers);
    }, timeoutMs);
  });
}

// ============================================
// Legacy discovery (window.ethereum / window.phantom.ethereum)
// ============================================

function collectLegacy(): InjectedWalletProvider[] {
  if (typeof window === 'undefined') return [];

  const w = window as unknown as WindowWithWalletInjection;
  const found: InjectedWalletProvider[] = [];

  const candidates: EIP1193Provider[] = [];

  if (w.ethereum) {
    if (Array.isArray(w.ethereum.providers)) {
      candidates.push(...(w.ethereum.providers as EIP1193Provider[]));
    } else {
      candidates.push(w.ethereum);
    }
  }

  if (w.phantom?.ethereum?.request) {
    candidates.push(w.phantom.ethereum);
  }

  for (const provider of candidates) {
    const kind = classifyProvider(provider);
    if (!kind) continue;
    found.push({
      kind,
      name: kind === 'metamask' ? 'MetaMask' : 'Phantom',
      provider,
      eip6963: false,
    });
  }

  return found;
}

// ============================================
// Public API
// ============================================

/** Enumerate all identified injected EVM providers (deduped by wallet kind). */
export async function getInjectedWalletProviders(): Promise<InjectedWalletProvider[]> {
  const [eip6963, legacy] = await Promise.all([collectEip6963(), Promise.resolve(collectLegacy())]);

  const byKind = new Map<WalletId, InjectedWalletProvider>();
  for (const provider of [...eip6963, ...legacy]) {
    if (!byKind.has(provider.kind)) {
      byKind.set(provider.kind, provider);
    }
  }

  return [...byKind.values()];
}

/** Get a specific wallet's EVM provider, or null if it is not detected. */
export async function getWalletProvider(kind: WalletId): Promise<InjectedWalletProvider | null> {
  const providers = await getInjectedWalletProviders();
  return providers.find((p) => p.kind === kind) ?? null;
}

/**
 * Detect whether Phantom is installed but only exposing its Solana provider.
 * Such a Phantom build cannot support the EVM/GOAT Testnet3 flow.
 */
export function isPhantomSolanaOnly(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as WindowWithWalletInjection;
  return Boolean(w.solana) && !Boolean(w.phantom?.ethereum);
}
