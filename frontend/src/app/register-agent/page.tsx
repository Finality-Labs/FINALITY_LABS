/**
 * Finality Labs - ERC-8004 Agent Registration Page
 * Complete agent registration flow: metadata form -> GitHub Gist -> on-chain registration
 */

'use client';

import * as React from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, CheckCircle, AlertCircle, Plus, Trash2, Copy, ExternalLink, Github } from 'lucide-react';
import { chainApi } from '@/lib/api';
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
import { type AgentService, type AgentRegistrationForm, type RegistrationResponse, type Erc8004Config } from '@/types/api';

// ============================================
// Validation Schemas
// ============================================

const serviceSchema = z.object({
  name: z.string().min(1, 'Service name is required'),
  endpoint: z.string().min(1, 'Service endpoint is required').url('Invalid URL format'),
  version: z.string().optional(),
  skills: z.array(z.string()).optional(),
  domains: z.array(z.string()).optional(),
});

const registrationSchema = z.object({
  name: z.string().min(1, 'Agent name is required').max(100, 'Name too long (max 100 chars)'),
  description: z.string().min(1, 'Description is required').max(2000, 'Description too long (max 2000 chars)'),
  image: z.string().url('Invalid image URL').optional().or(z.literal('')),
  services: z.array(serviceSchema).default([]),
  x402Support: z.boolean().default(false),
  active: z.boolean().default(true),
  supportedTrust: z.array(z.enum(['reputation', 'crypto-economic', 'tee-attestation'])).default([]),
  agentURI: z.string().url().optional(),
  gistId: z.string().optional(),
});

type RegistrationFormData = z.infer<typeof registrationSchema>;
type ServiceFormData = z.infer<typeof serviceSchema>;

// ============================================
// Service Types (following ERC-8004 conventions)
// ============================================

const SERVICE_TYPES: { value: string; label: string; description: string }[] = [
  { value: 'A2A', label: 'A2A (Agent2Agent)', description: 'Agent-to-Agent protocol endpoint' },
  { value: 'MCP', label: 'MCP (Model Context Protocol)', description: 'Model Context Protocol server' },
  { value: 'OASF', label: 'OASF (Open Agent Schema Framework)', description: 'OASF manifest/taxonomy' },
  { value: 'ENS', label: 'ENS (Ethereum Name Service)', description: 'ENS name for the agent' },
  { value: 'DID', label: 'DID (Decentralized Identifier)', description: 'DID for the agent' },
  { value: 'email', label: 'Email', description: 'Contact email address' },
  { value: 'web', label: 'Web Interface', description: 'Web-based agent interface' },
  { value: 'x402', label: 'x402 Payment', description: 'x402 payment endpoint' },
];

const TRUST_MODELS: { value: 'reputation' | 'crypto-economic' | 'tee-attestation'; label: string }[] = [
  { value: 'reputation', label: 'Reputation' },
  { value: 'crypto-economic', label: 'Crypto-economic' },
  { value: 'tee-attestation', label: 'TEE Attestation' },
];

// ============================================
// Service Form Component (inline to access form)
// ============================================

interface ServiceFormProps {
  index: number;
  fields: ReturnType<typeof useFieldArray<RegistrationFormData, 'services'>>['fields'];
  remove: (index: number) => void;
  errors: Partial<Record<string, { message: string }>>;
  form: ReturnType<typeof useForm<RegistrationFormData>>;
}

const ServiceForm: React.FC<ServiceFormProps> = ({ index, fields, remove, errors, form }) => {
  const field = fields[index];
  const serviceName = form.watch(`services.${index}.name`) || '';
  const isOASF = serviceName === 'OASF';

  // Helper to get error for a specific field
  const getFieldError = (fieldName: string) => {
    const errorKey = `services.${index}.${fieldName}`;
    return errors[errorKey]?.message;
  };

  return (
    <div className="border border-[#333333]/30 rounded-lg p-4 space-y-3 bg-white/50 animate-slide-down">
      <div className="flex items-start justify-between">
        <h4 className="font-medium text-sm">Service #{index + 1}</h4>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => remove(index)}
          className="text-[#e03e3e] hover:bg-[#e03e3e]/10"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Select
          label="Service Type"
          placeholder="Select type"
          options={SERVICE_TYPES.map(s => ({ value: s.value, label: s.label }))}
          {...{
            ...field,
            name: `services.${index}.name`,
            onChange: (value: string) => {
              // @ts-ignore - form.setValue
              field.onChange?.({ target: { value, name: `services.${index}.name` } } as any);
            },
          }}
          error={getFieldError('name')}
        />

        <Input
          label="Endpoint URL"
          placeholder="https://..."
          {...{
            ...field,
            name: `services.${index}.endpoint`,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
              // @ts-ignore - form.setValue
              field.onChange?.({ target: { value: e.target.value, name: `services.${index}.endpoint` } } as any);
            },
          }}
          error={getFieldError('endpoint')}
        />

        <Input
          label="Version (optional)"
          placeholder="e.g., 0.3.0"
          {...{
            ...field,
            name: `services.${index}.version`,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
              // @ts-ignore - form.setValue
              field.onChange?.({ target: { value: e.target.value, name: `services.${index}.version` } } as any);
            },
          }}
        />
      </div>

      {/* OASF-specific fields - shown when service is OASF */}
      {isOASF && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#333333]/14">
          <Input
            label="Skills (comma-separated)"
            placeholder="skill1, skill2"
            {...{
              ...field,
              name: `services.${index}.skills`,
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                const skills = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                // @ts-ignore - form.setValue
                field.onChange?.({ target: { value: skills, name: `services.${index}.skills` } } as any);
              },
            }}
            error={getFieldError('skills')}
          />
          <Input
            label="Domains (comma-separated)"
            placeholder="domain1, domain2"
            {...{
              ...field,
              name: `services.${index}.domains`,
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                const domains = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                // @ts-ignore - form.setValue
                field.onChange?.({ target: { value: domains, name: `services.${index}.domains` } } as any);
              },
            }}
            error={getFieldError('domains')}
          />
        </div>
      )}
    </div>
  );
};

// ============================================
// Main Registration Page Component
// ============================================

export default function AgentRegistrationPage() {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [config, setConfig] = React.useState<Erc8004Config | null>(null);
  const [lastResult, setLastResult] = React.useState<RegistrationResponse | null>(null);

  const form = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      name: '',
      description: '',
      image: '',
      services: [],
      x402Support: false,
      active: true,
      supportedTrust: ['reputation'],
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'services' });
  const formErrors = form.formState.errors as Partial<Record<string, { message: string }>>;

  // Fetch config on mount
  React.useEffect(() => {
    chainApi.erc8004.getConfig()
      .then(setConfig)
      .catch(err => console.error('Failed to load ERC-8004 config:', err));
  }, []);

  const handleSubmit = async (data: RegistrationFormData) => {
    setIsSubmitting(true);
    setLastResult(null);

    try {
      const result = await chainApi.erc8004.registerAgent(data);
      
      if (result.ok) {
        toast.success('Agent registered successfully!', {
          description: result.mode === 'live' 
            ? `Agent ID: ${result.agentId} | Tx: ${result.txHash?.slice(0, 10)}...`
            : 'Agent URI generated (mock mode - not registered on-chain)',
        });
        
        // Copy agentURI to clipboard if available
        if (result.agentURI) {
          navigator.clipboard.writeText(result.agentURI).catch(() => {});
        }
      } else {
        toast.error('Registration failed', {
          description: result.error || 'Unknown error',
        });
      }
      
      setLastResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to register agent';
      toast.error('Registration failed', { description: message });
      setLastResult({ ok: false, mode: 'mock', error: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const addService = () => {
    append({ name: '', endpoint: '', version: '', skills: [], domains: [] });
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Page Header */}
      <PageContainer
        title="Register Agent (ERC-8004)"
        description="Create an ERC-8004 compliant agent identity. Your metadata will be uploaded to a public GitHub Gist and registered on the GOAT Testnet3 Identity Registry."
        action={
          config && (
            <div className="flex items-center gap-2">
              <Badge variant={config.gistConfigured ? 'success' : 'warning'}>
                {config.gistConfigured ? 'Gist Ready' : 'No GITHUB_TOKEN'}
              </Badge>
              <Badge variant={config.liveReady ? 'success' : 'default'}>
                {config.liveReady ? 'Live Mode' : 'Mock Mode'}
              </Badge>
              <Badge variant="default">{config.network}</Badge>
            </div>
          )
        }
      />

      {/* Network Info */}
      {config && (
        <Card className="bg-[#f8f7f2]/50">
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wider text-[#5d5d5d] mb-1">Identity Registry</p>
                <p className="font-mono text-black break-all">{config.identityRegistry}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-[#5d5d5d] mb-1">Chain ID</p>
                <p className="font-mono text-black">{config.chainId}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-[#5d5d5d] mb-1">RPC</p>
                <p className="font-mono text-black break-all">{config.rpcUrl}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Result Display */}
      {lastResult && (
        <div className={cn(
          'p-4 rounded-lg border animate-slide-down',
          lastResult.ok
            ? 'bg-[#3fb950]/10 border-[#3fb950] text-[#3fb950]'
            : 'bg-[#e03e3e]/10 border-[#e03e3e] text-[#e03e3e]'
        )}>
          <div className="flex items-center gap-2">
            {lastResult.ok ? (
              <CheckCircle className="h-5 w-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
            )}
            <span className="font-medium">{lastResult.ok ? 'Success' : 'Error'}</span>
            <Badge variant={lastResult.mode === 'live' ? 'success' : 'default'} className="ml-auto">
              {lastResult.mode}
            </Badge>
          </div>
          <p className="text-sm mt-1">{lastResult.error || 'Registration completed'}</p>
          
          {lastResult.agentId && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#5d5d5d] w-24">Agent ID:</span>
                <code className="font-mono text-sm flex-1">{lastResult.agentId}</code>
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(lastResult.agentId!, 'Agent ID')}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              
              {lastResult.txHash && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#5d5d5d] w-24">Tx Hash:</span>
                  <code className="font-mono text-sm flex-1">{lastResult.txHash}</code>
                  <Button variant="ghost" size="sm" onClick={() => copyToClipboard(lastResult.txHash!, 'Tx Hash')}>
                    <Copy className="h-3 w-3" />
                  </Button>
                  {lastResult.explorerUrl && (
                    <a href={lastResult.explorerUrl} target="_blank" rel="noopener noreferrer" className="ml-1">
                      <ExternalLink className="h-3 w-3 text-[#5d5d5d] hover:text-black" />
                    </a>
                  )}
                </div>
              )}
              
              {lastResult.agentURI && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#5d5d5d] w-24">Agent URI:</span>
                  <code className="font-mono text-sm flex-1 break-all">{lastResult.agentURI}</code>
                  <Button variant="ghost" size="sm" onClick={() => copyToClipboard(lastResult.agentURI!, 'Agent URI')}>
                    <Copy className="h-3 w-3" />
                  </Button>
                  <a href={lastResult.agentURI} target="_blank" rel="noopener noreferrer" className="ml-1">
                    <ExternalLink className="h-3 w-3 text-[#5d5d5d] hover:text-black" />
                  </a>
                </div>
              )}
              
              {(() => {
                const gist = lastResult.gist;
                return gist?.rawUrl ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#5d5d5d] w-24">Gist:</span>
                    <a href={gist.htmlUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-blue-600 hover:underline">
                      <Github className="h-3 w-3" />
                      View on GitHub
                    </a>
                    <Button variant="ghost" size="sm" onClick={() => copyToClipboard(gist.rawUrl, 'Raw URL')}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                ) : null;
              })()}
            </div>
          )}
        </div>
      )}

      {/* Registration Form */}
      <Card>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          {/* Basic Info Section */}
          <Section title="Agent Identity" description="Basic information about your agent">
            <div className="space-y-4">
              <Input
                label="Agent Name"
                placeholder="e.g., My GPU Compute Agent"
                {...form.register('name')}
                error={form.formState.errors.name?.message}
              />
              
              <Textarea
                label="Description"
                placeholder="Describe what your agent does, its capabilities, pricing, and interaction methods..."
                rows={4}
                {...form.register('description')}
                error={form.formState.errors.description?.message}
              />
              
              <Input
                label="Avatar/Image URL (optional)"
                placeholder="https://example.com/avatar.png"
                {...form.register('image')}
                error={form.formState.errors.image?.message}
              />
            </div>
          </Section>

          <Separator />

          {/* Services Section */}
          <Section title="Services / Endpoints" description="Advertise your agent's endpoints (A2A, MCP, OASF, etc.)">
            <div className="space-y-4">
              {fields.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-[#333333]/30 rounded-lg">
                  <p className="text-[#5d5d5d] mb-4">No services added yet</p>
                  <Button type="button" variant="secondary" onClick={addService}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add First Service
                  </Button>
                </div>
              ) : (
                <>
                  {fields.map((field, index) => (
                    <ServiceForm 
                      key={field.id} 
                      index={index} 
                      fields={fields} 
                      remove={remove} 
                      errors={formErrors}
                      form={form}
                    />
                  ))}
                  
                  <Button type="button" variant="secondary" onClick={addService} className="w-full sm:w-auto">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Another Service
                  </Button>
                </>
              )}
              
              {/* Service Type Reference */}
              <details className="group">
                <summary className="cursor-pointer text-sm text-[#5d5d5d] hover:text-black flex items-center gap-1">
                  <span>Service Type Reference</span>
                  <span className="text-xs">▼</span>
                </summary>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#5d5d5d]">
                  {SERVICE_TYPES.map(s => (
                    <div key={s.value} className="p-2 bg-white/50 rounded border border-[#333333]/14">
                      <span className="font-medium text-black">{s.value}</span>
                      <span className="ml-2">{s.label}</span>
                      <p className="mt-0.5 text-[#5d5d5d]">{s.description}</p>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </Section>

          <Separator />

          {/* Settings Section */}
          <Section title="Settings" description="Additional configuration">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-3">
                <label className="text-xs uppercase tracking-wider text-[#5d5d5d] mb-1.5 block">
                  Supported Trust Models
                </label>
                <div className="flex flex-wrap gap-2">
                  {TRUST_MODELS.map(t => (
                    <label
                      key={t.value}
                      className={cn(
                        'inline-flex items-center gap-2 px-3 py-1.5 border rounded transition-colors cursor-pointer',
                        form.watch('supportedTrust').includes(t.value)
                          ? 'bg-black text-white border-black'
                          : 'bg-white text-black hover:border-black/30 hover:bg-black/5'
                      )}
                    >
                      <input
                        type="checkbox"
                        value={t.value}
                        onChange={(e) => {
                          const current = (form.getValues('supportedTrust') || []) as ('reputation' | 'crypto-economic' | 'tee-attestation')[];
                          const next = e.target.checked
                            ? [...current, t.value]
                            : current.filter(v => v !== t.value);
                          form.setValue('supportedTrust', next, { shouldValidate: true });
                        }}
                        checked={form.watch('supportedTrust').includes(t.value)}
                        className="sr-only"
                      />
                      <span>{t.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="sm:col-span-3">
                <label className="text-xs uppercase tracking-wider text-[#5d5d5d] mb-1.5 block">
                  x402 Payment Support
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    {...form.register('x402Support')}
                    className="sr-only peer"
                  />
                  <span className="relative inline-flex items-center h-6 w-11 rounded-full bg-[#333333]/30 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-black peer-checked:bg-black peer-checked:border-black after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full">
                  </span>
                  <span className="text-sm">Enable x402 payment protocol support</span>
                </label>
              </div>

              <div className="sm:col-span-3">
                <label className="text-xs uppercase tracking-wider text-[#5d5d5d] mb-1.5 block">
                  Agent Status
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    {...form.register('active')}
                    className="sr-only peer"
                  />
                  <span className="relative inline-flex items-center h-6 w-11 rounded-full bg-[#333333]/30 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-black peer-checked:bg-black peer-checked:border-black after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-full">
                  </span>
                  <span className="text-sm">Agent is active and accepting requests</span>
                </label>
              </div>

              <div className="sm:col-span-3">
                <Input
                  label="Custom agentURI (optional)"
                  placeholder="https://your-domain.com/agent.json"
                  {...form.register('agentURI')}
                  helperText="If provided, skips GitHub Gist upload. Must be publicly accessible JSON."
                />
              </div>

              <div className="sm:col-span-3">
                <Input
                  label="Existing Gist ID (optional)"
                  placeholder="abc123..."
                  {...form.register('gistId')}
                  helperText="Update an existing Gist instead of creating a new one"
                />
              </div>
            </div>
          </Section>

          {/* Submit Actions */}
          <div className="flex items-center gap-4 pt-4 border-t border-[#333333]/14">
            <Button type="submit" size="lg" loading={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Registering...
                </>
              ) : (
                'Register Agent'
              )}
            </Button>
            
            <Button type="button" variant="secondary" onClick={() => form.reset({
              name: '',
              description: '',
              image: '',
              services: [],
              x402Support: false,
              active: true,
              supportedTrust: ['reputation'],
            })}>
              Reset Form
            </Button>
          </div>
        </form>
      </Card>

      {/* Help Section */}
      <Card className="bg-[#f8f7f2]/50">
        <CardContent className="pt-6">
          <h3 className="font-serif text-lg font-medium mb-3">How ERC-8004 Registration Works</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-sm text-[#5d5d5d]">
            <div className="space-y-2">
              <h4 className="font-medium text-black">1. Fill Form</h4>
              <p>Enter agent metadata: name, description, avatar, and services/endpoints.</p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-black">2. Generate JSON</h4>
              <p>We create a standards-compliant registration.json following EIP-8004 schema.</p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-black">3. Upload to Gist</h4>
              <p>JSON is uploaded to a public GitHub Gist. The raw URL becomes your agentURI.</p>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-black">4. Register On-Chain</h4>
              <p>In live mode, we call register(agentURI) on the GOAT Testnet3 Identity Registry.</p>
            </div>
          </div>
          
          <div className="mt-6 pt-4 border-t border-[#333333]/14">
            <h4 className="font-medium text-black mb-2">Requirements</h4>
            <ul className="space-y-1 text-sm text-[#5d5d5d]">
              <li>• <strong>GITHUB_TOKEN</strong> environment variable with 'gist' scope (set in .env)</li>
              <li>• <strong>CHAIN_MODE=live</strong> with <strong>GOAT_PRIVATE_KEY</strong> for on-chain registration</li>
              <li>• Wallet must be funded with GOAT testnet tokens from <a href="https://bridge.testnet3.goat.network/faucet" target="_blank" rel="noopener noreferrer" className="underline hover:text-black">the faucet</a></li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}