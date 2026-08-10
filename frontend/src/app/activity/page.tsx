/**
 * Finality Labs - Live Activity Page
 * Real-time activity feed showing marketplace events
 */

'use client';

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import {
  Filter,
  Download,
  Loader2,
  RefreshCw,
  Pause,
  Play,
  Trash2,
  Bell,
  X,
  Search,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Handshake,
  Shield,
  MessageSquare,
  ArrowRightLeft,
  CheckCircle,
  XCircle,
  AlertTriangle,
  UserPlus,
  Activity,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { intakeApi, chainApi } from '@/lib/api';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  StatusBadge,
  Button,
  Input,
  Select,
  Separator,
  Avatar,
  EmptyState,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  ScrollArea,
  Toaster,
  toast,
  Progress,
} from '@/components/ui';
import { PageContainer, Section } from '@/components/layout';
import { formatRelativeTime, formatTimestamp, truncate, cn, generateId } from '@/lib/utils';

// ============================================
// Types
// ============================================

type ActivityType = 
  | 'intent_created'
  | 'offer_created'
  | 'match_found'
  | 'negotiation_started'
  | 'counteroffer_made'
  | 'deal_closed'
  | 'deal_failed'
  | 'settlement_complete'
  | 'settlement_failed'
  | 'reputation_updated'
  | 'agent_registered'
  | 'pulse_sent';

interface ActivityEvent {
  id: string;
  type: ActivityType;
  timestamp: number;
  agentId: string;
  agentRole?: 'buyer' | 'seller';
  counterpartyId?: string;
  resource?: string;
  qty?: number;
  price?: number;
  roomId?: string;
  txHash?: string;
  details: Record<string, unknown>;
  severity: 'info' | 'success' | 'warning' | 'error';
}

const ACTIVITY_ICONS: Record<ActivityType, React.ReactNode> = {
  intent_created: <TrendingUp className="h-4 w-4 text-[#3fb950]" />,
  offer_created: <TrendingDown className="h-4 w-4 text-[#f5a623]" />,
  match_found: <Handshake className="h-4 w-4 text-black" />,
  negotiation_started: <MessageSquare className="h-4 w-4 text-black" />,
  counteroffer_made: <ArrowRightLeft className="h-4 w-4 text-[#5d5d5d]" />,
  deal_closed: <CheckCircle className="h-4 w-4 text-[#3fb950]" />,
  deal_failed: <XCircle className="h-4 w-4 text-[#e03e3e]" />,
  settlement_complete: <DollarSign className="h-4 w-4 text-[#3fb950]" />,
  settlement_failed: <AlertTriangle className="h-4 w-4 text-[#e03e3e]" />,
  reputation_updated: <Shield className="h-4 w-4 text-[#f5a623]" />,
  agent_registered: <UserPlus className="h-4 w-4 text-black" />,
  pulse_sent: <Activity className="h-4 w-4 text-[#5d5d5d]" />,
};

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  intent_created: 'Intent Created',
  offer_created: 'Offer Created',
  match_found: 'Match Found',
  negotiation_started: 'Negotiation Started',
  counteroffer_made: 'Counteroffer Made',
  deal_closed: 'Deal Closed',
  deal_failed: 'Deal Failed',
  settlement_complete: 'Settlement Complete',
  settlement_failed: 'Settlement Failed',
  reputation_updated: 'Reputation Updated',
  agent_registered: 'Agent Registered',
  pulse_sent: 'Pulse Sent',
};

const SEVERITY_COLORS = {
  info: 'bg-black',
  success: 'bg-[#3fb950]',
  warning: 'bg-[#f5a623]',
  error: 'bg-[#e03e3e]',
};

const SEVERITY_BORDERS = {
  info: 'border-black/30',
  success: 'border-[#3fb950]/30',
  warning: 'border-[#f5a623]/30',
  error: 'border-[#e03e3e]/30',
};

const SEVERITY_BG = {
  info: 'bg-black/5',
  success: 'bg-[#3fb950]/10',
  warning: 'bg-[#f5a623]/10',
  error: 'bg-[#e03e3e]/10',
};

// Mock activity events
const generateMockEvents = (count: number): ActivityEvent[] => {
  const types: ActivityType[] = [
    'intent_created', 'offer_created', 'match_found', 'negotiation_started',
    'counteroffer_made', 'deal_closed', 'deal_failed', 'settlement_complete',
    'settlement_failed', 'reputation_updated', 'agent_registered', 'pulse_sent'
  ];
  
  const agents = ['1', '2', '3', '4', '5'];
  const resources = ['GPU H100', 'GPU A100', 'GPU V100', 'GPU A10G', 'GPU T4'];
  
  return Array.from({ length: count }, (_, i) => {
          const type = types[Math.floor(Math.random() * types.length)];
          const agent = agents[Math.floor(Math.random() * agents.length)];
          const counterparty = agents[Math.floor(Math.random() * agents.length)];
          const resource = resources[Math.floor(Math.random() * resources.length)];
          const agentRole = (Math.random() > 0.5 ? 'buyer' : 'seller') as 'buyer' | 'seller';
          const severity = (type.includes('failed') ? 'error' : type.includes('closed') || type.includes('complete') ? 'success' : type.includes('match') || type.includes('started') ? 'info' : 'warning') as 'info' | 'success' | 'warning' | 'error';
 
          return {
            id: `evt_${generateId()}`,
            type,
            timestamp: Date.now() - Math.random() * 1000 * 60 * 60 * 24 * 7,
            agentId: agent,
            agentRole,
            counterpartyId: counterparty !== agent ? counterparty : undefined,
            resource,
            qty: Math.floor(Math.random() * 20) + 1,
            price: Math.random() * 0.0003 + 0.00005,
            roomId: `room_${generateId()}`,
            txHash: Math.random() > 0.5 ? `0x${generateId()}` : undefined,
            details: {},
            severity,
          };
        }).sort((a, b) => b.timestamp - a.timestamp);
      }

// ============================================
// Activity Item Component
// ============================================

const ActivityItem = ({ event, onExpand }: { event: ActivityEvent; onExpand: () => void }) => {
  const icon = ACTIVITY_ICONS[event.type];
  const label = ACTIVITY_LABELS[event.type];
  const severityColor = SEVERITY_COLORS[event.severity];
  const severityBorder = SEVERITY_BORDERS[event.severity];
  const severityBg = SEVERITY_BG[event.severity];

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'success': return 'success';
      case 'error': return 'error';
      case 'warning': return 'warning';
      default: return 'default';
    }
  };

  return (
    <div
      onClick={onExpand}
      className={cn(
        'p-4 border cursor-pointer transition-all duration-150',
        severityBorder,
        severityBg,
        'hover:bg-black/5'
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn('p-2 rounded-lg flex-shrink-0', severityColor)}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h4 className="font-medium text-black">{label}</h4>
            <span className="text-xs text-[#5d5d5d]">{formatRelativeTime(event.timestamp)}</span>
          </div>
          <p className="text-sm text-[#5d5d5d]">{event.agentId}{event.counterpartyId && ` \u2194 ${event.counterpartyId}`}</p>
          {event.resource && (
            <p className="text-xs text-[#5d5d5d] mt-1 font-mono">
              {event.resource} {event.qty ? `\u00d7 ${event.qty}` : ''} {event.price ? ` @ ${event.price.toFixed(6)}` : ''}
            </p>
          )}
          {event.roomId && (
            <p className="text-xs text-[#5d5d5d]/70 mt-0.5 font-mono">Room: {truncate(event.roomId, 20)}</p>
          )}
        </div>
        <Badge variant={getSeverityBadge(event.severity)}>
          {event.severity}
        </Badge>
      </div>
    </div>
  );
};

// ============================================
// Activity Detail Modal
// ============================================

const ActivityDetail = ({ event, onClose }: { event: ActivityEvent | null; onClose: () => void }) => {
  if (!event) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-none w-full max-w-2xl max-h-[90vh] overflow-hidden animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-[#333333]/14">
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-lg', SEVERITY_COLORS[event.severity])}>
              {ACTIVITY_ICONS[event.type]}
            </div>
            <div>
              <h2 className="font-serif text-lg font-medium text-black">{ACTIVITY_LABELS[event.type]}</h2>
              <p className="text-sm text-[#5d5d5d]">{formatTimestamp(event.timestamp)}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-black/5 rounded transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
          <div className="space-y-4">
            <DetailRow label="Event ID" value={event.id} copyable />
            <DetailRow label="Type" value={ACTIVITY_LABELS[event.type]} />
            <DetailRow label="Severity" value={event.severity} />
            <DetailRow label="Agent" value={event.agentId} />
            {event.agentRole && <DetailRow label="Role" value={event.agentRole.charAt(0).toUpperCase() + event.agentRole.slice(1)} />}
            {event.counterpartyId && <DetailRow label="Counterparty" value={event.counterpartyId} />}
            {event.resource && <DetailRow label="Resource" value={event.resource} />}
            {event.qty && <DetailRow label="Quantity" value={event.qty.toString()} />}
            {event.price && <DetailRow label="Price" value={event.price.toFixed(6)} />}
            {event.roomId && <DetailRow label="Room ID" value={event.roomId} copyable />}
            {event.txHash && <DetailRow label="Transaction Hash" value={event.txHash} copyable />}
            
            <div className="pt-4 border-t border-[#333333]/14">
              <h3 className="font-medium mb-2">Raw Details</h3>
              <pre className="p-3 bg-white/50 border border-[#333333]/14 text-xs font-mono overflow-auto max-h-48">
                {JSON.stringify(event.details, null, 2)}
              </pre>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-[#333333]/14">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          {event.txHash && (
            <Button variant="outline">
              <ExternalLink className="h-4 w-4 mr-2" />
              View on Explorer
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

const DetailRow = ({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) => (
  <div className="p-3 bg-white/50 border border-[#333333]/14">
    <p className="text-xs text-[#5d5d5d] mb-1">{label}</p>
    <div className="flex items-center justify-between">
      <p className="font-mono text-sm break-all">{value}</p>
      {copyable && (
        <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(value)}>
          <Copy className="h-4 w-4" />
        </Button>
      )}
    </div>
  </div>
);

// ============================================
// Activity Page
// ============================================

export default function ActivityPage() {
  const [events, setEvents] = React.useState<ActivityEvent[]>(generateMockEvents(50));
  const [filteredEvents, setFilteredEvents] = React.useState<ActivityEvent[]>(generateMockEvents(50));
  const [searchQuery, setSearchQuery] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState<string>('all');
  const [severityFilter, setSeverityFilter] = React.useState<string>('all');
  const [agentFilter, setAgentFilter] = React.useState<string>('all');
  const [isPaused, setIsPaused] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [selectedEvent, setSelectedEvent] = React.useState<ActivityEvent | null>(null);
  const [autoRefresh, setAutoRefresh] = React.useState(true);
  const [lastRefresh, setLastRefresh] = React.useState(Date.now());

  // Get unique agents for filter
  const agents = React.useMemo(() => [...new Set(events.map(e => e.agentId))].sort(), [events]);
  const types = React.useMemo(() => [...new Set(events.map(e => e.type))].sort(), [events]);

  // Filter events
  useEffect(() => {
    let result = events.filter((e) => {
      const matchesSearch = e.agentId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.counterpartyId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.resource?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.roomId?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = typeFilter === 'all' || e.type === typeFilter;
      const matchesSeverity = severityFilter === 'all' || e.severity === severityFilter;
      const matchesAgent = agentFilter === 'all' || e.agentId === agentFilter;
      return matchesSearch && matchesType && matchesSeverity && matchesAgent;
    });
    setFilteredEvents(result);
  }, [events, searchQuery, typeFilter, severityFilter, agentFilter]);

  // Auto-refresh simulation
  useEffect(() => {
    if (!autoRefresh || isPaused) return;
    
    const interval = setInterval(() => {
      // Simulate new events
      const newEvent = generateMockEvents(1)[0];
      newEvent.timestamp = Date.now();
      setEvents(prev => [newEvent, ...prev].slice(0, 100));
      setLastRefresh(Date.now());
      toast.info('New activity', { description: `${ACTIVITY_LABELS[newEvent.type]} by ${newEvent.agentId}` });
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, [autoRefresh, isPaused]);

  const handleRefresh = useCallback(async () => {
    setIsLoading(true);
    // In real app, fetch from API
    await new Promise(r => setTimeout(r, 500));
    setEvents(generateMockEvents(50));
    setLastRefresh(Date.now());
    setIsLoading(false);
    toast.success('Refreshed', { description: 'Activity feed updated' });
  }, []);

  const typeOptions = [
    { value: 'all', label: 'All Types' },
    ...types.map(t => ({ value: t, label: ACTIVITY_LABELS[t as ActivityType] })),
  ];

  const severityOptions = [
    { value: 'all', label: 'All Severities' },
    { value: 'info', label: 'Info' },
    { value: 'success', label: 'Success' },
    { value: 'warning', label: 'Warning' },
    { value: 'error', label: 'Error' },
  ];

  const agentOptions = [
    { value: 'all', label: 'All Agents' },
    ...agents.map(a => ({ value: a, label: a })),
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageContainer
        title="Live Activity"
        description="Real-time marketplace events and notifications"
        action={
          <div className="flex items-center gap-2">
            <Button
              variant={isPaused ? 'secondary' : 'default'}
              onClick={() => setIsPaused(!isPaused)}
            >
              {isPaused ? (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Resume
                </>
              ) : (
                <>
                  <Pause className="h-4 w-4 mr-2" />
                  Pause
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleRefresh}
              loading={isLoading}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        }
      />

      {/* Status Bar */}
      <Card className="bg-[#f8f7f2]/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className={cn('w-2 h-2 rounded-full', isPaused ? 'bg-[#5d5d5d]' : 'bg-[#3fb950] animate-pulse')} />
                <span className="text-sm font-medium">{isPaused ? 'Paused' : 'Live'}</span>
              </div>
              <Separator orientation="vertical" className="h-5" />
              <span className="text-sm text-[#5d5d5d]">
                {filteredEvents.length} events {searchQuery || typeFilter !== 'all' || severityFilter !== 'all' || agentFilter !== 'all' ? '(filtered)' : ''}
              </span>
              <Separator orientation="vertical" className="h-5" />
              <span className="text-sm text-[#5d5d5d]">
                Last updated: {formatRelativeTime(lastRefresh)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setAutoRefresh(!autoRefresh)}>
                {autoRefresh ? (
                  <>
                    <Bell className="h-4 w-4 mr-1" />
                    Auto-refresh On
                  </>
                ) : (
                  <>
                    <Bell className="h-4 w-4 mr-1" />
                    Auto-refresh Off
                  </>
                )}
              </Button>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5d5d5d]" />
              <Input
                placeholder="Search events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select options={typeOptions} placeholder="Event Type" value={typeFilter} onValueChange={(value: string) => setTypeFilter(value)} className="w-full sm:w-40" />
            <Select options={severityOptions} placeholder="Severity" value={severityFilter} onValueChange={(value: string) => setSeverityFilter(value)} className="w-full sm:w-40" />
            <Select options={agentOptions} placeholder="Agent" value={agentFilter} onValueChange={(value: string) => setAgentFilter(value)} className="w-full sm:w-40" />
          </div>
        </CardContent>
      </Card>

      {/* Activity Feed */}
      <Section title={`Activity Feed (${filteredEvents.length})`}>
        {filteredEvents.length === 0 ? (
          <EmptyState
            icon={<Bell className="h-12 w-12" />}
            title="No activity found"
            description="Try adjusting your filters or wait for new events"
          />
        ) : (
          <ScrollArea className="h-[600px]">
            <div className="space-y-3 p-1 pr-4">
              {filteredEvents.map((event) => (
                <ActivityItem
                  key={event.id}
                  event={event}
                  onExpand={() => setSelectedEvent(event)}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </Section>

      {/* Detail Modal */}
      <ActivityDetail
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />

      {/* Toast Container */}
      <Toaster position="top-right" richColors />
    </div>
  );
}