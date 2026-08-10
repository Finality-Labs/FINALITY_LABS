/**
 * Finality Labs - Frontend Configuration
 * Environment variables and application constants
 */

export const APP_CONFIG = {
  // App metadata
  name: 'Finality Labs',
  description: 'Autonomous AI Commerce Protocol',
  version: '1.0.0',

  // API endpoints - configured via environment variables
  api: {
    intake: process.env.NEXT_PUBLIC_INTAKE_URL || 'http://localhost:3001',
    negotiate: process.env.NEXT_PUBLIC_NEGOTIATE_WS_URL || 'ws://localhost:3002',
    chain: process.env.NEXT_PUBLIC_CHAIN_URL || 'http://localhost:3003',
    orchestrator: process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://localhost:3000',
  },

  // Default agent identity (can be overridden in settings)
  defaults: {
    agentRegistry: 'eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e',
    agentId: '1',
    wallet: '0x1111111111111111111111111111111111111111',
  },

  // Negotiation defaults
  negotiation: {
    maxRounds: 10,
    minDelta: 0.01,
    defaultTimeoutMs: 30000,
  },

  // UI settings
  ui: {
    theme: 'light' as 'light' | 'dark' | 'system',
    animationsEnabled: true,
    compactMode: false,
    refreshInterval: 30000, // 30 seconds
    toastDuration: 5000,
  },

  // Feature flags
  features: {
    liveSettlement: process.env.NEXT_PUBLIC_LIVE_SETTLEMENT === 'true',
    telemetry: process.env.NEXT_PUBLIC_TELEMETRY === 'true',
    debugMode: process.env.NODE_ENV === 'development',
  },
} as const;

export type AppConfig = typeof APP_CONFIG;

// Helper to get API base URLs
export function getApiBaseUrl(service: keyof typeof APP_CONFIG.api): string {
  return APP_CONFIG.api[service];
}

// Helper to check if we're in development
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

// Helper to check if live settlement is enabled
export function isLiveSettlementEnabled(): boolean {
  return APP_CONFIG.features.liveSettlement;
}