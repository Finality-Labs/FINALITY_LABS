/**
 * Finality Labs - Create Intent/Offer Page (Client Component)
 * Form to create buyer intents and seller offers with ERC-8004 identity support
 */

'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Wallet, Shield, Copy } from 'lucide-react';
import { intakeApi } from '@/lib/api';
import { IntentResultPanel, type IntentFlowState } from './IntentResultPanel';
import { OfferResultPanel, type OfferFlowState } from './OfferResultPanel';
import {
  Button,
  Input,
  Textarea,
  Select,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Separator,
  toast,
} from '@/components/ui';
import { PageContainer, Section } from '@/components/layout';
import { cn } from '@/lib/utils';
import { useWallet, useHasRegisteredAgent } from '@/hooks/use-wallet';
import { useAgentIdentity, useAgentMode } from '@/context/agent-identity';
import { useSearchParams } from 'next/navigation';

// ============================================
// Validation Schemas
// ============================================

const walletSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address format');

const requirementsSchema = z.record(z.unknown()).optional().default({});

const identitySchema = z.object({
  agentRegistry: z.string().min(1, 'Agent registry is required').regex(/^eip155:/, 'Must start with eip155:'),
  agentId: z.string().min(1, 'Agent ID is required'),
  wallet: walletSchema,
});

const intentSchema = identitySchema.extend({
  resource: z.string().min(1, 'Resource is required'),
  qty: z.number().min(1, 'Quantity must be at least 1'),
  unit: z.string().min(1, 'Unit is required'),
  maxUnitPrice: z.number().min(0.00001, 'Max unit price must be greater than 0'),
  requirements: requirementsSchema,
});

const offerSchema = identitySchema.extend({
  resource: z.string().min(1, 'Resource is required'),
  unit: z.string().min(1, 'Unit is required'),
  unitPrice: z.number().min(0.00001, 'Unit price must be greater than 0'),
  terms: z.string().min(1, 'Terms are required'),
  requirements: requirementsSchema,
  pulseMinutes: z.number().min(0).optional(),
});

type IntentFormData = z.infer<typeof intentSchema>;
type OfferFormData = z.infer<typeof offerSchema>;

type FormType = 'intent' | 'offer';

/** GOAT Testnet3 (0xBE90) */
const GOAT_TESTNET3_CHAIN_ID = 48816;

// ============================================
// Resource Selector Component
// ============================================

const RESOURCE_OPTIONS = [
  { value: 'gpu', label: 'GPU Compute' },
  { value: 'cpu', label: 'CPU Compute' },
  { value: 'storage', label: 'Storage' },
  { value: 'bandwidth', label: 'Bandwidth' },
  { value: 'memory', label: 'Memory' },
];

const UNIT_OPTIONS: Record<string, { value: string; label: string }[]> = {
  gpu: [
    { value: 'hour', label: 'Hour' },
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
  ],
  cpu: [
    { value: 'hour', label: 'Hour' },
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
  ],
  storage: [
    { value: 'GB', label: 'GB' },
    { value: 'TB', label: 'TB' },
  ],
  bandwidth: [
    { value: 'Mbps', label: 'Mbps' },
    { value: 'Gbps', label: 'Gbps' },
    { value: 'TB/month', label: 'TB/month' },
  ],
  memory: [
    { value: 'GB', label: 'GB' },
    { value: 'TB', label: 'TB' },
  ],
};

const GPU_REQUIREMENTS = [
  { value: 'H100', label: 'NVIDIA H100' },
  { value: 'A100', label: 'NVIDIA A100' },
  { value: 'A10G', label: 'NVIDIA A10G' },
  { value: 'V100', label: 'NVIDIA V100' },
  { value: 'T4', label: 'NVIDIA T4' },
  { value: 'RTX_4090', label: 'NVIDIA RTX 4090' },
  { value: 'RTX_3090', label: 'NVIDIA RTX 3090' },
];

// ============================================
// Identity Display Component
// ============================================

interface IdentityDisplayProps {
  role: 'buyer' | 'seller';
  agent: { agentRegistry: string; agentId: string; wallet: string } | null;
  wallet: string | null;
  isConnected: boolean;
  onConnect: () => void;
}

const IdentityDisplay: React.FC<IdentityDisplayProps> = ({ role, agent, wallet, isConnected, onConnect }) => {
  const { config, setConfig, primaryIdentity, hasAgent, setWallet, wallet: contextWallet } = useAgentIdentity();
  const { useErc8004Agents, toggleMode, setMode } = useAgentMode();
  const { hasAgent: hasRegisteredAgent } = useHasRegisteredAgent();
  
  const isUsingErc8004 = useErc8004Agents;
  const displayAgent = isUsingErc8004 ? (primaryIdentity || agent) : agent;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  if (!isConnected) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 p-3 border border-[#333333]/30 rounded-lg bg-white/50">
          <Wallet className="h-5 w-5 text-[#5d5d5d]" />
          <span className="text-sm text-[#5d5d5d]">Connect wallet to use {role} identity</span>
        </div>
        <Button variant="secondary" onClick={onConnect} className="w-full sm:w-auto">
          <Wallet className="h-4 w-4 mr-2" />
          Connect Wallet
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Agent Mode Toggle */}
      <div className="flex items-center gap-3 p-3 border border-[#333333]/30 rounded-lg bg-white/50">
        <Shield className="h-5 w-5 text-[#5d5d5d]" />
        <div className="flex-1">
          <p className="text-sm font-medium text-black">Agent Identity Mode</p>
          <p className="text-xs text-[#5d5d5d]">
            {isUsingErc8004 ? 'Using ERC-8004 registered agent' : 'Using local mock agent'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={isUsingErc8004 ? 'default' : 'secondary'}
            size="sm"
            onClick={() => setMode(true)}
            disabled={!hasRegisteredAgent && isUsingErc8004}
          >
            ERC-8004
          </Button>
          <Button
            variant={!isUsingErc8004 ? 'default' : 'secondary'}
            size="sm"
            onClick={() => setMode(false)}
          >
            Local
          </Button>
        </div>
      </div>

      {/* Wallet Address */}
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-[#5d5d5d] w-24">Wallet</span>
        <code className="font-mono text-sm flex-1 bg-white/50 px-2 py-1 rounded border border-[#333333]/30">
          {wallet?.slice(0, 6)}...{wallet?.slice(-4)}
        </code>
        <Button variant="ghost" size="sm" onClick={() => copyToClipboard(wallet!, 'Wallet')}>
          <Copy className="h-3 w-3" />
        </Button>
      </div>

      {/* Agent Identity */}
      {displayAgent && (
        <div className="space-y-2 p-3 border border-[#333333]/30 rounded-lg bg-white/50">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-[#5d5d5d] w-24">{role} Agent</span>
            <Badge variant={isUsingErc8004 && primaryIdentity?.status === 'registered' ? 'success' : 'default'}>
              {isUsingErc8004 ? 'ERC-8004' : 'Local'}
            </Badge>
          </div>
          
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-[#5d5d5d]">Registry:</span>
              <code className="font-mono text-black block break-all mt-0.5">{displayAgent.agentRegistry}</code>
            </div>
            <div>
              <span className="text-[#5d5d5d]">Agent ID:</span>
              <div className="flex items-center gap-1 mt-0.5">
                <code className="font-mono text-black">{displayAgent.agentId}</code>
                {isUsingErc8004 && primaryIdentity && (
                  <Button variant="ghost" size="sm" className="p-0.5" onClick={() => copyToClipboard(displayAgent.agentId, 'Agent ID')}>
                    <Copy className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {isUsingErc8004 && primaryIdentity && (
            <div className="pt-2 border-t border-[#333333]/14">
              <p className="text-xs text-[#5d5d5d]">
                Registered: {new Date(primaryIdentity.registeredAt).toLocaleDateString()}
                {primaryIdentity.txHash && (
                  <span className="ml-2">
                    {' | '}
                    <a 
                      href={`${primaryIdentity.network.explorer}/tx/${primaryIdentity.txHash}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      View Tx
                    </a>
                  </span>
                )}
              </p>
              {primaryIdentity.agentURI && (
                <p className="text-xs text-[#5d5d5d] mt-1">
                  Agent URI: 
                  <a href={primaryIdentity.agentURI} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline break-all">
                    {primaryIdentity.agentURI.slice(0, 50)}...
                  </a>
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Show if ERC-8004 mode but no agent registered */}
      {isUsingErc8004 && !primaryIdentity && !agent && (
        <div className="p-3 border border-[#f5a623]/50 rounded-lg bg-[#f5a623]/10">
          <p className="text-sm text-[#f5a623]">
            No ERC-8004 agent found for this wallet. 
            <a href="/register-agent" className="underline hover:text-black">Register one</a> or switch to Local mode.
          </p>
        </div>
      )}
    </div>
  );
};

// ============================================
// Create Page Client Component
// ============================================

export function CreatePageClient() {
  const searchParams = useSearchParams();
  const urlType = searchParams.get('type');
  const initialFormType = (urlType === 'intent' || urlType === 'offer') ? urlType : 'intent';
  
  const [formType, setFormType] = React.useState<FormType>(initialFormType);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [identityReady, setIdentityReady] = React.useState(false);
  const [intentFlow, setIntentFlow] = React.useState<IntentFlowState>({ status: 'idle' });
  const [offerFlow, setOfferFlow] = React.useState<OfferFlowState>({ status: 'idle' });
const [isSwitching, setIsSwitching] = React.useState(false);
const [switchError, setSwitchError] = React.useState<string | null>(null);
  const matchPollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const stopMatchPoll = React.useCallback(() => {
    if (matchPollRef.current) {
      clearInterval(matchPollRef.current);
      matchPollRef.current = null;
    }
  }, []);

  // Stop polling on unmount.
  React.useEffect(() => () => stopMatchPoll(), [stopMatchPoll]);

  // Poll the existing match lookup endpoint until the matchmaker pairs the
  // intent with an arriving/active offer (or a bounded window elapses).
  const pollForMatch = React.useCallback((intentId: string) => {
    let attempts = 0;
    const maxAttempts = 20; // 20 x 3s = ~60s
    stopMatchPoll();
    matchPollRef.current = setInterval(async () => {
      attempts += 1;
      try {
        const res = await intakeApi.getMatch(intentId);
        if (res.matched && res.roomId) {
          stopMatchPoll();
          setIntentFlow({ status: 'matched', intentId, match: res.match, roomId: res.roomId, wssUrl: res.wssUrl });
          return;
        }
      } catch {
        // transient error: keep polling until max attempts
      }
      if (attempts >= maxAttempts) {
        stopMatchPoll();
        setIntentFlow((prev) => ({ ...prev, status: 'no-match' }));
      }
    }, 3000);
  }, [stopMatchPoll]);

  // Poll the existing match lookup endpoint until the matchmaker pairs the
  // offer with an arriving/active buyer intent (or a bounded window elapses).
  const pollForOfferMatch = React.useCallback((offerId: string) => {
    let attempts = 0;
    const maxAttempts = 20; // 20 x 3s = ~60s
    stopMatchPoll();
    matchPollRef.current = setInterval(async () => {
      attempts += 1;
      try {
        const res = await intakeApi.getMatch(offerId);
        if (res.matched && res.roomId) {
          stopMatchPoll();
          setOfferFlow({ status: 'matched', offerId, match: res.match, roomId: res.roomId, wssUrl: res.wssUrl });
          return;
        }
      } catch {
        // transient error: keep polling until max attempts
      }
      if (attempts >= maxAttempts) {
        stopMatchPoll();
        setOfferFlow((prev) => ({ ...prev, status: 'no-match' }));
      }
    }, 3000);
  }, [stopMatchPoll]);

// Wallet & Identity
const { account: wallet, isConnected, isConnecting, connect, chainId, switchChain, error: walletError } = useWallet();
const { config, primaryIdentity, hasAgent } = useAgentIdentity();
const { config: agentConfig } = useAgentIdentity();
const { useErc8004Agents } = useAgentMode();

const currentAgent = useErc8004Agents
  ? primaryIdentity
  : (formType === 'intent'
      ? agentConfig.defaultMockAgents.buyer
      : agentConfig.defaultMockAgents.seller);

React.useEffect(() => {
  if (!isConnected) {
    setIdentityReady(false);
    return;
  }

  if (useErc8004Agents) {
    setIdentityReady(hasAgent && primaryIdentity?.status === 'registered');
  } else {
    setIdentityReady(true);
  }
}, [isConnected, useErc8004Agents, hasAgent, primaryIdentity]);

  // Single form that works for both intent and offer
  const form = useForm<IntentFormData | OfferFormData>({
    resolver: zodResolver(formType === 'intent' ? intentSchema : offerSchema),
    defaultValues: {
      resource: 'gpu',
      unit: 'hour',
      requirements: {},
      agentRegistry: currentAgent?.agentRegistry || '',
      agentId: currentAgent?.agentId || '',
      wallet: currentAgent?.wallet || '',
      ...(formType === 'intent'
        ? { qty: 1, maxUnitPrice: 0.0002 }
        : { unitPrice: 0.0001, terms: 'per-hour billing', pulseMinutes: 145 })
    },
  });

  // Auto-fill identity fields when wallet/agent changes
  React.useEffect(() => {
    if (currentAgent && wallet) {
      form.setValue('agentRegistry', currentAgent.agentRegistry, { shouldValidate: true, shouldDirty: true });
      form.setValue('agentId', currentAgent.agentId, { shouldValidate: true, shouldDirty: true });
      form.setValue('wallet', currentAgent.wallet, { shouldValidate: true, shouldDirty: true });
    }
  }, [currentAgent, wallet, form]);

  const handleSubmit = async (data: IntentFormData | OfferFormData) => {
    // Verify wallet is connected and identity is ready
    if (!wallet || !identityReady) {
      toast.error('Identity not ready', { description: 'Please connect wallet and register ERC-8004 agent first' });
      return;
    }

    setIsSubmitting(true);

    try {
      if (formType === 'intent') {
        const result = await intakeApi.createIntent(data as IntentFormData);
        if (result.matched && result.roomId) {
          setIntentFlow({ status: 'matched', intentId: result.intentId, match: result.match, roomId: result.roomId, wssUrl: result.wssUrl });
          toast.success('Intent created — match found!', { description: `Match ID: ${result.roomId}` });
        } else {
          setIntentFlow({ status: 'searching', intentId: result.intentId });
          toast.success('Intent created', { description: 'Searching for compatible offers...' });
          pollForMatch(result.intentId);
        }
      } else {
        const result = await intakeApi.createOffer(data as OfferFormData);
        if (result.matched && result.roomId) {
          setOfferFlow({ status: 'matched', offerId: result.offerId, match: result.match, roomId: result.roomId, wssUrl: result.wssUrl });
          toast.success('Offer created — buyer found!', { description: `Match ID: ${result.roomId}` });
        } else {
          setOfferFlow({ status: 'searching', offerId: result.offerId });
          toast.success('Offer created', { description: 'Waiting for a buyer...' });
          pollForOfferMatch(result.offerId);
        }
      }
      
      // Reset form but keep identity fields
      form.reset({
        resource: 'gpu',
        unit: 'hour',
        requirements: {},
        agentRegistry: currentAgent?.agentRegistry || '',
        agentId: currentAgent?.agentId || '',
        wallet: currentAgent?.wallet || '',
        ...(formType === 'intent'
          ? { qty: 1, maxUnitPrice: 0.0002 }
          : { unitPrice: 0.0001, terms: 'per-hour billing', pulseMinutes: 145 })
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create';
      toast.error('Creation failed', { description: message });
      if (formType === 'intent') {
        setIntentFlow({ status: 'error', error: message });
      } else {
        setOfferFlow({ status: 'error', error: message });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Watch resource
  const watchedResource = form.watch('resource');
  const units = UNIT_OPTIONS[watchedResource] || UNIT_OPTIONS.gpu;
  const watchedRequirements = form.watch('requirements');

  // Reset unit when resource changes
  React.useEffect(() => {
    if (!units.find((u: { value: string }) => u.value === form.getValues('unit'))) {
      form.setValue('unit', units[0].value, { shouldValidate: true });
    }
  }, [watchedResource, units, form]);

  // Reset form when formType changes (but preserve identity)
  React.useEffect(() => {
    stopMatchPoll();
    setIntentFlow({ status: 'idle' });
    setOfferFlow({ status: 'idle' });
    form.reset({
      resource: 'gpu',
      unit: 'hour',
      requirements: {},
      agentRegistry: currentAgent?.agentRegistry || '',
      agentId: currentAgent?.agentId || '',
      wallet: currentAgent?.wallet || '',
      ...(formType === 'intent'
        ? { qty: 1, maxUnitPrice: 0.0002 }
        : { unitPrice: 0.0001, terms: 'per-hour billing', pulseMinutes: 145 })
    });
  }, [formType, form]);

  // Network indicator
  const isWrongNetwork = chainId !== null && chainId !== GOAT_TESTNET3_CHAIN_ID;

  const handleSwitchToGoat = async () => {
    if (isSwitching) return;
    setIsSwitching(true);
    setSwitchError(null);
    try {
      await switchChain(GOAT_TESTNET3_CHAIN_ID);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to switch network. Please switch manually in your wallet.';
      setSwitchError(message);
      toast.error('Network switch failed', { description: message });
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Page Header */}
      <PageContainer
        title={formType === 'intent' ? 'Create Buyer Intent' : 'Create Seller Offer'}
        description={
          formType === 'intent'
            ? 'Post a buy intent for GPU compute resources. Compatible offers will be auto-matched.'
            : 'List your GPU compute resources for sale. Compatible intents will be auto-matched.'
        }
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => setFormType('intent')}
              className={cn(formType === 'intent' && 'bg-black text-white')}
            >
              Buyer Intent
            </Button>
            <Button
              variant="secondary"
              onClick={() => setFormType('offer')}
              className={cn(formType === 'offer' && 'bg-black text-white')}
            >
              Seller Offer
            </Button>
          </div>
        }
      />

      {/* Network/Mode Status Bar */}
      <Card className={cn('animate-slide-down', isWrongNetwork && 'border-[#f5a623]/50 bg-[#f5a623]/5')}>
        <CardContent className="pt-2 pb-2">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider text-[#5d5d5d]">Network:</span>
              <Badge variant={isWrongNetwork ? 'warning' : 'success'}>
                {chainId === GOAT_TESTNET3_CHAIN_ID ? 'GOAT Testnet3 ✓' : chainId ? `Chain ${chainId} (wrong)` : 'Not connected'}
              </Badge>
              {isWrongNetwork && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSwitchToGoat}
                  disabled={isSwitching}
                  loading={isSwitching}
                >
                  {isSwitching ? 'Switching...' : 'Switch to GOAT'}
                </Button>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider text-[#5d5d5d]">Mode:</span>
              <Badge variant={config.useErc8004Agents ? 'success' : 'default'}>
                {config.useErc8004Agents ? 'ERC-8004 Agent' : 'Local Mock Agent'}
              </Badge>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs uppercase tracking-wider text-[#5d5d5d]">Wallet:</span>
              {isConnected ? (
                <>
                  <code className="font-mono text-sm">{wallet?.slice(0, 6)}...{wallet?.slice(-4)}</code>
                  <Button variant="ghost" size="sm" onClick={() => { /* disconnect */ }}>
                    Disconnect
                  </Button>
                </>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => connect()} loading={isConnecting}>
                  <Wallet className="h-3 w-3 mr-1" />
                  Connect
                </Button>
              )}
            </div>
          </div>
          {switchError && (
            <p className="text-xs text-[#e03e3e] mt-1">Switch to GOAT failed: {switchError}</p>
          )}
          {walletError && (
            <p className="text-xs text-[#e03e3e] mt-1">Wallet error: {walletError}</p>
          )}
        </CardContent>
      </Card>

      {/* Buyer Intent Result Flow */}
      {formType === 'intent' && intentFlow.status !== 'idle' && (
        <IntentResultPanel flow={intentFlow} onStopSearch={stopMatchPoll} />
      )}

      {/* Seller Offer Result Flow */}
      {formType === 'offer' && offerFlow.status !== 'idle' && (
        <OfferResultPanel flow={offerFlow} onStopSearch={stopMatchPoll} />
      )}

      {/* Form Card */}
      <Card>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          {/* Identity Section */}
          <Section title="Identity" description="Your agent identity on the network">
            <IdentityDisplay
              role={formType === 'intent' ? 'buyer' : 'seller'}
              agent={currentAgent}
              wallet={wallet}
              isConnected={isConnected}
              onConnect={() => connect()}
            />
            
            {/* Hidden fields for form submission - synced from identity display */}
            <input type="hidden" {...form.register('agentRegistry')} />
            <input type="hidden" {...form.register('agentId')} />
            <input type="hidden" {...form.register('wallet')} />
            
            {/* Show read-only identity fields for transparency */}
            {currentAgent && wallet && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-[#333333]/14">
                <Input
                  label="Agent Registry (auto)"
                  value={currentAgent.agentRegistry}
                  readOnly
                  className="bg-white/50 cursor-default"
                />
                <Input
                  label="Agent ID (auto)"
                  value={currentAgent.agentId}
                  readOnly
                  className="bg-white/50 cursor-default"
                />
                <Input
                  label="Wallet (auto)"
                  value={currentAgent.wallet}
                  readOnly
                  className="bg-white/50 cursor-default"
                />
              </div>
            )}
            
            {/* Identity not ready - show action required */}
            {!identityReady && isConnected && useErc8004Agents && (!primaryIdentity || primaryIdentity?.status !== 'registered') && (
              <div className="mt-4 p-4 bg-[#f5a623]/10 border border-[#f5a623]/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <Shield className="h-5 w-5 text-[#f5a623]" />
                  <div>
                    <p className="font-medium text-[#f5a623]">ERC-8004 Agent Required</p>
                    <p className="text-sm text-[#5d5d5d]">Register your agent identity to create intents/offers in ERC-8004 mode.</p>
                    <Button variant="secondary" size="sm" className="mt-2" onClick={() => window.location.href = '/register-agent'}>
                      Register ERC-8004 Agent
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Section>

          {identityReady && (
            <div>
              <Separator />

              {/* Resource Section */}
              <Section title="Resource" description="What are you buying or selling?">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Select
                label="Resource Type"
                {...form.register('resource', { required: true })}
                options={RESOURCE_OPTIONS}
                placeholder="Select resource"
              />
              <Input
                label="Quantity"
                type="number"
                min="1"
                step="1"
                {...form.register('qty', { required: true, valueAsNumber: true })}
                disabled={formType === 'offer'}
              />
              <Select
                label="Unit"
                {...form.register('unit', { required: true })}
                options={units}
                placeholder="Select unit"
              />
            </div>
          </Section>

          <Separator />

{/* Requirements Section */}
           <Section title="Requirements" description="Technical requirements for the resource (e.g., GPU model, CUDA version)">
             <div className="space-y-3">
               <div className="flex flex-wrap gap-2">
                 {watchedResource === 'gpu' && GPU_REQUIREMENTS.map((gpu) => (
                   <label key={gpu.value} className="flex items-center gap-1.5 cursor-pointer">
                     <input
                       type="checkbox"
                       checked={(watchedRequirements?.gpu as string[] | undefined)?.includes(gpu.value) ?? false}
                       onChange={(e) => {
                         const current = (watchedRequirements?.gpu as string[] | undefined) || [];
                         const updated = e.target.checked
                           ? [...current, gpu.value]
                           : current.filter((v) => v !== gpu.value);
                         form.setValue('requirements.gpu', updated, { shouldValidate: true, shouldDirty: true });
                       }}
                       className="rounded border-[#333333]/30 text-black focus:ring-black"
                     />
                     <span className="text-sm">{gpu.label}</span>
                   </label>
                 ))}
                 {watchedResource === 'cpu' && [
                   { value: 'x86_64', label: 'x86_64' },
                   { value: 'arm64', label: 'ARM64' },
                 ].map((cpu) => (
                   <label key={cpu.value} className="flex items-center gap-1.5 cursor-pointer">
                     <input
                       type="checkbox"
                       checked={(watchedRequirements?.cpu as string[] | undefined)?.includes(cpu.value) ?? false}
                       onChange={(e) => {
                         const current = (watchedRequirements?.cpu as string[] | undefined) || [];
                         const updated = e.target.checked
                           ? [...current, cpu.value]
                           : current.filter((v) => v !== cpu.value);
                         form.setValue('requirements.cpu', updated, { shouldValidate: true, shouldDirty: true });
                       }}
                       className="rounded border-[#333333]/30 text-black focus:ring-black"
                     />
                     <span className="text-sm">{cpu.label}</span>
                   </label>
                 ))}
                 <Input
                   label="Custom Requirement Key"
                   placeholder="e.g., cuda"
                   {...form.register('requirements.customKey')}
                 />
                 <Input
                   label="Custom Requirement Value"
                   placeholder="e.g., 12.1"
                   {...form.register('requirements.customValue')}
                 />
               </div>
               {Object.keys(watchedRequirements || {}).length > 0 && (
                 <div className="p-2 bg-white/50 rounded text-xs font-mono break-all">
                   {JSON.stringify(watchedRequirements, null, 2)}
                 </div>
               )}
             </div>
           </Section>

          <Separator />

          {/* Pricing Section */}
          <Section title={formType === 'intent' ? 'Price Bound (Max)' : 'Price (Per Unit)'} 
                   description={formType === 'intent' ? 'Maximum price you are willing to pay per unit' : 'Your asking price per unit'}>
            {formType === 'intent' ? (
              <Input
                label="Max Unit Price (USDC)"
                type="number"
                step="0.00001"
                min="0.00001"
                placeholder="0.0002"
                {...form.register('maxUnitPrice', { required: true, valueAsNumber: true })}
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Unit Price (USDC)"
                  type="number"
                  step="0.00001"
                  min="0.00001"
                  placeholder="0.0001"
                  {...form.register('unitPrice', { required: true, valueAsNumber: true })}
                />
                <Input
                  label="Terms"
                  placeholder="per-hour billing"
                  {...form.register('terms', { required: true })}
                />
              </div>
            )}
          </Section>

          {formType === 'offer' && (
                      <>
                        <Separator />
                        <Section title="Pulse" description="How often should your offer be re-asserted as active?">
                          <Input
                            label="Pulse Interval (minutes)"
                            type="number"
                            min="0"
                            step="1"
                            placeholder="145"
                            {...form.register('pulseMinutes', { valueAsNumber: true })}
                          />
                        </Section>
                      </>
                    )}

                    {identityReady && (
                      <>
                        <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-[#333333]/14">
                          <Button type="submit" className="flex-1" loading={isSubmitting} disabled={!isConnected}>
                            {isSubmitting ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Creating...
                              </>
                            ) : (
                              formType === 'intent' ? 'Create Buyer Intent' : 'Create Seller Offer'
                            )}
                          </Button>
                          <Button type="button" variant="secondary" className="flex-1" onClick={() => {
                            form.reset({
                              resource: 'gpu',
                              unit: 'hour',
                              requirements: {},
                              agentRegistry: currentAgent?.agentRegistry || '',
                              agentId: currentAgent?.agentId || '',
                              wallet: currentAgent?.wallet || '',
                              ...(formType === 'intent'
                                ? { qty: 1, maxUnitPrice: 0.0002 }
                                : { unitPrice: 0.0001, terms: 'per-hour billing', pulseMinutes: 145 })
                            });
                          }}>
                            Reset Form
                          </Button>
                                                </div>
                      </>
                    )}

                  </div>
                )}
              </form>
            </Card>

                {/* Help Section */}
      <Card className="bg-[#f8f7f2]/50">
        <CardContent className="pt-6">
          <h3 className="font-serif text-lg font-medium mb-3">How it works</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-[#5d5d5d]">
            <div className="space-y-2">
              <h4 className="font-medium text-black">1. Create</h4>
              <p>Post your intent (buyer) or offer (seller) with resource details, price bounds, and requirements.</p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-black">2. Match</h4>
              <p>Our matchmaker instantly finds compatible counterparts based on resource, price, and requirements.</p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-black">3. Negotiate</h4>
              <p>Enter a real-time negotiation room where AI agents haggle on your behalf within your bounds.</p>
            </div>
          </div>
          
          <div className="mt-6 pt-4 border-t border-[#333333]/14">
            <h4 className="font-medium text-black mb-2">Identity Modes</h4>
            <ul className="space-y-1 text-sm text-[#5d5d5d]">
              <li>• <strong>ERC-8004 Agent</strong> (default): Uses your registered on-chain agent identity from GOAT Testnet3</li>
              <li>• Agent IDs are numeric ERC-721 tokenIds (e.g., "1", "2") per ERC-8004 standard</li>
              <li>• Register agents at <a href="/register-agent" className="underline hover:text-black">/register-agent</a></li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}