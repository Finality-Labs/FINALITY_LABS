/**
 * ERC-8004 Agent Identity Context
 * React context for managing agent identities across the application
 */

'use client';

import * as React from 'react';
import {
  StoredAgentIdentity,
  AgentModeConfig,
  DEFAULT_AGENT_MODE_CONFIG,
  GOAT_TESTNET3_NETWORK,
} from '@/types/agent-identity';
import {
  getAgentModeConfig,
  setAgentModeConfig,
  getPrimaryIdentity,
  getStoredIdentities,
  saveIdentity,
  removeIdentity,
  updateIdentityStatus,
  hasRegisteredAgent,
  getAgentIdentityForForm,
} from '@/lib/agent-storage';

// ============================================
// Context Types
// ============================================

interface AgentIdentityContextValue {
  // Configuration
  config: AgentModeConfig;
  setConfig: (config: Partial<AgentModeConfig>) => void;
  
  // Current wallet (connected via wagmi/ethers)
  wallet: string | null;
  setWallet: (wallet: string | null) => void;
  
  // Identity state
  primaryIdentity: StoredAgentIdentity | null;
  allIdentities: StoredAgentIdentity[];
  isLoading: boolean;
  
  // Actions
  registerIdentity: (identity: StoredAgentIdentity) => void;
  unregisterIdentity: (agentRegistry: string, agentId: string) => void;
  refreshIdentities: () => void;
  
  // Form helpers
  getFormIdentity: (role: 'buyer' | 'seller') => { agentRegistry: string; agentId: string; wallet: string } | null;
  hasAgent: boolean;
  
  // Network
  network: typeof GOAT_TESTNET3_NETWORK;
}

// ============================================
// Context Creation
// ============================================

const AgentIdentityContext = React.createContext<AgentIdentityContextValue | null>(null);

export function useAgentIdentity(): AgentIdentityContextValue {
  const context = React.useContext(AgentIdentityContext);
  if (!context) {
    throw new Error('useAgentIdentity must be used within AgentIdentityProvider');
  }
  return context;
}

// ============================================
// Provider Component
// ============================================

interface AgentIdentityProviderProps {
  children: React.ReactNode;
  initialWallet?: string | null;
}

export function AgentIdentityProvider({ children, initialWallet = null }: AgentIdentityProviderProps) {
  const [config, setConfigState] = React.useState<AgentModeConfig>(() => getAgentModeConfig());
  const [wallet, setWallet] = React.useState<string | null>(initialWallet);
  const [primaryIdentity, setPrimaryIdentity] = React.useState<StoredAgentIdentity | null>(null);
  const [allIdentities, setAllIdentities] = React.useState<StoredAgentIdentity[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  // Load identities when wallet or config changes
  const loadIdentities = React.useCallback(() => {
    if (!wallet) {
      setPrimaryIdentity(null);
      setAllIdentities([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    
    // Small timeout to allow localStorage to be ready
    setTimeout(() => {
      const identities = getStoredIdentities(wallet);
      const primary = getPrimaryIdentity(wallet);
      
      setAllIdentities(identities);
      setPrimaryIdentity(primary);
      setIsLoading(false);
    }, 0);
  }, [wallet]);

  React.useEffect(() => {
    loadIdentities();
  }, [loadIdentities]);

  // Update config
  const setConfig = React.useCallback((newConfig: Partial<AgentModeConfig>) => {
    setAgentModeConfig(newConfig);
    setConfigState(prev => ({ ...prev, ...newConfig }));
  }, []);

  // Register new identity
  const registerIdentity = React.useCallback((identity: StoredAgentIdentity) => {
    saveIdentity(identity);
    loadIdentities();
  }, [loadIdentities]);

  // Unregister identity
  const unregisterIdentity = React.useCallback((agentRegistry: string, agentId: string) => {
    if (!wallet) return;
    removeIdentity(wallet, agentRegistry, agentId);
    loadIdentities();
  }, [wallet, loadIdentities]);

  // Refresh identities
  const refreshIdentities = React.useCallback(() => {
    loadIdentities();
  }, [loadIdentities]);

  // Get form identity
  const getFormIdentity = React.useCallback((role: 'buyer' | 'seller') => {
    if (!wallet) return null;
    return getAgentIdentityForForm(wallet, role);
  }, [wallet]);

  // Check if has agent
  const hasAgent = wallet ? hasRegisteredAgent(wallet) : false;

  const value: AgentIdentityContextValue = {
    config,
    setConfig,
    wallet,
    setWallet,
    primaryIdentity,
    allIdentities,
    isLoading,
    registerIdentity,
    unregisterIdentity,
    refreshIdentities,
    getFormIdentity,
    hasAgent,
    network: GOAT_TESTNET3_NETWORK,
  };

  return (
    <AgentIdentityContext.Provider value={value}>
      {children}
    </AgentIdentityContext.Provider>
  );
}

// ============================================
// Hook for easy access to form identities
// ============================================

export function useFormIdentity(role: 'buyer' | 'seller') {
  const { getFormIdentity, config, wallet } = useAgentIdentity();
  
  return React.useMemo(() => {
    if (!wallet) return config.defaultMockAgents[role];
    return getFormIdentity(role);
  }, [wallet, role, getFormIdentity, config]);
}

// ============================================
// Hook for agent mode toggle
// ============================================

export function useAgentMode() {
  const { config, setConfig } = useAgentIdentity();
  
  const toggleMode = React.useCallback(() => {
    setConfig({ useErc8004Agents: !config.useErc8004Agents });
  }, [config.useErc8004Agents, setConfig]);
  
  return {
    useErc8004Agents: config.useErc8004Agents,
    toggleMode,
    setMode: (enabled: boolean) => setConfig({ useErc8004Agents: enabled }),
    fallbackToMock: config.fallbackToMock,
    setFallbackToMock: (enabled: boolean) => setConfig({ fallbackToMock: enabled }),
  };
}