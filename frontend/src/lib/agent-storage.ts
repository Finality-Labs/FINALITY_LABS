/**
 * ERC-8004 Agent Identity Storage
 * localStorage-based persistence with migration support
 */

import {
  StoredAgentIdentity,
  WalletAgentMap,
  STORAGE_KEY,
  DEFAULT_AGENT_MODE_CONFIG,
  AgentModeConfig,
  validateStoredIdentity,
  isIdentityValid,
  GOAT_TESTNET3_NETWORK,
} from '@/types/agent-identity';

// Re-export AgentModeConfig for consumers
export type { AgentModeConfig } from '@/types/agent-identity';

// ============================================
// Storage Version for Migrations
// ============================================

const STORAGE_VERSION = 1;
const VERSION_KEY = 'finality:erc8004:version';
const CONFIG_KEY = 'finality:erc8004:config';

// ============================================
// Configuration Storage
// ============================================

export function getAgentModeConfig(): AgentModeConfig {
  if (typeof window === 'undefined') return DEFAULT_AGENT_MODE_CONFIG;
  
  try {
    const stored = localStorage.getItem(CONFIG_KEY);
    if (stored) {
      const config = JSON.parse(stored);
      return { ...DEFAULT_AGENT_MODE_CONFIG, ...config };
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_AGENT_MODE_CONFIG;
}

export function setAgentModeConfig(config: Partial<AgentModeConfig>): void {
  if (typeof window === 'undefined') return;
  
  try {
    const current = getAgentModeConfig();
    const updated = { ...current, ...config };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to save agent mode config:', error);
  }
}

// ============================================
// Identity Storage
// ============================================

export function getAllStoredIdentities(): WalletAgentMap {
  if (typeof window === 'undefined') return {};
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      // Validate each identity
      const result: WalletAgentMap = {};
      for (const [wallet, agents] of Object.entries(data)) {
        if (Array.isArray(agents)) {
          result[wallet] = agents
            .map(validateStoredIdentity)
            .filter((a): a is StoredAgentIdentity => a !== null);
        }
      }
      return result;
    }
  } catch (error) {
    console.error('Failed to load agent identities:', error);
  }
  return {};
}

export function getStoredIdentities(wallet: string): StoredAgentIdentity[] {
  const all = getAllStoredIdentities();
  const normalizedWallet = wallet.toLowerCase();
  return all[normalizedWallet] || [];
}

export function getPrimaryIdentity(wallet: string): StoredAgentIdentity | null {
  const identities = getStoredIdentities(wallet);
  if (identities.length === 0) return null;
  
  // Return the most recently registered valid identity
  const validIdentities = identities
    .filter(id => isIdentityValid(id, GOAT_TESTNET3_NETWORK))
    .sort((a, b) => new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime());
  
  return validIdentities[0] || null;
}

export function saveIdentity(identity: StoredAgentIdentity): void {
  if (typeof window === 'undefined') return;
  
  try {
    const all = getAllStoredIdentities();
    const wallet = identity.wallet.toLowerCase();
    
    if (!all[wallet]) {
      all[wallet] = [];
    }
    
    // Remove any existing identity with same agentRegistry + agentId
    all[wallet] = all[wallet].filter(
      existing => !(existing.agentRegistry === identity.agentRegistry && existing.agentId === identity.agentId)
    );
    
    // Add new identity at the beginning
    all[wallet].unshift(identity);
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch (error) {
    console.error('Failed to save agent identity:', error);
    throw new Error('Failed to persist agent identity');
  }
}

export function removeIdentity(wallet: string, agentRegistry: string, agentId: string): void {
  if (typeof window === 'undefined') return;
  
  try {
    const all = getAllStoredIdentities();
    const normalizedWallet = wallet.toLowerCase();
    
    if (all[normalizedWallet]) {
      all[normalizedWallet] = all[normalizedWallet].filter(
        id => !(id.agentRegistry === agentRegistry && id.agentId === agentId)
      );
      
      if (all[normalizedWallet].length === 0) {
        delete all[normalizedWallet];
      }
      
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    }
  } catch (error) {
    console.error('Failed to remove agent identity:', error);
  }
}

export function updateIdentityStatus(
  wallet: string,
  agentRegistry: string,
  agentId: string,
  updates: Partial<Pick<StoredAgentIdentity, 'status' | 'lastVerifiedAt' | 'txHash'>>
): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const all = getAllStoredIdentities();
    const normalizedWallet = wallet.toLowerCase();
    
    if (!all[normalizedWallet]) return false;
    
    const index = all[normalizedWallet].findIndex(
      id => id.agentRegistry === agentRegistry && id.agentId === agentId
    );
    
    if (index === -1) return false;
    
    all[normalizedWallet][index] = {
      ...all[normalizedWallet][index],
      ...updates,
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    return true;
  } catch (error) {
    console.error('Failed to update agent identity:', error);
    return false;
  }
}

export function clearAllIdentities(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

// ============================================
// Migration
// ============================================

export function migrateStorage(): void {
  if (typeof window === 'undefined') return;
  
  try {
    const version = parseInt(localStorage.getItem(VERSION_KEY) || '0', 10);
    
    if (version < STORAGE_VERSION) {
      // Future migrations would go here
      console.log(`Migrating agent identity storage from v${version} to v${STORAGE_VERSION}`);
      localStorage.setItem(VERSION_KEY, STORAGE_VERSION.toString());
    }
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

// Run migration on import
if (typeof window !== 'undefined') {
  migrateStorage();
}

// ============================================
// Export helpers for create page
// ============================================

/** Get agent identity for use in create intent/offer forms */
export function getAgentIdentityForForm(
  wallet: string,
  role: 'buyer' | 'seller'
): { agentRegistry: string; agentId: string; wallet: string } | null {
  const config = getAgentModeConfig();
  
  if (!config.useErc8004Agents) {
    // Return mock agent
    return config.defaultMockAgents[role];
  }
  
  const identity = getPrimaryIdentity(wallet);
  if (identity) {
    return {
      agentRegistry: identity.agentRegistry,
      agentId: identity.agentId,
      wallet: identity.wallet,
    };
  }
  
  if (config.fallbackToMock) {
    return config.defaultMockAgents[role];
  }
  
  return null;
}

/** Check if wallet has any registered ERC-8004 agents */
export function hasRegisteredAgent(wallet: string): boolean {
  const identity = getPrimaryIdentity(wallet);
  return identity !== null && identity.status === 'registered';
}

/** Get display name for an agent identity */
export function getAgentDisplayName(identity: StoredAgentIdentity): string {
  return `${identity.metadata.name} (${identity.agentId.slice(0, 8)}...)`;
}

/** Get formatted registration date */
export function getFormattedRegistrationDate(identity: StoredAgentIdentity): string {
  return new Date(identity.registeredAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}