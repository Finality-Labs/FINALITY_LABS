/**
 * Finality Labs - Negotiations Page
 * List and manage negotiation rooms
 */

'use client';

import * as React from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, Search, Filter, X, ExternalLink, Loader2 } from 'lucide-react';
import { intakeApi } from '@/lib/api';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  StatusBadge,
  Table,
  Button,
  Input,
  Select,
  Separator,
  ScrollArea,
  Avatar,
  EmptyState,
} from '@/components/ui';
import { PageContainer, Section } from '@/components/layout';
import { formatCurrency, formatRelativeTime, truncate, cn } from '@/lib/utils';

// ============================================
// Types
// ============================================

interface NegotiationRoom {
  id: string;
  role: 'buyer' | 'seller';
  counterparty: string;
  resource: string;
  qty: number;
  unitPrice: number;
  totalUsdc: number;
  status: 'waiting' | 'active' | 'deal-closed' | 'constraint-hit' | 'error';
  round: number;
  maxRounds: number;
  createdAt: number;
  updatedAt: number;
  transcriptHash?: string;
  deal?: {
    unitPrice: number;
    qty: number;
    terms: string;
    totalUsdc: number;
  };
}

// Mock data - in real app this would come from API
const mockNegotiations: NegotiationRoom[] = [
  {
    id: 'room_abc123def456',
    role: 'buyer',
    counterparty: '2',
    resource: 'GPU H100',
    qty: 10,
    unitPrice: 0.0002,
    totalUsdc: 0.002,
    status: 'deal-closed',
    round: 7,
    maxRounds: 10,
    createdAt: Date.now() - 1000 * 60 * 60 * 2,
    updatedAt: Date.now() - 1000 * 60 * 30,
    transcriptHash: '0xabc123def456789...',
    deal: { unitPrice: 0.00018, qty: 10, terms: 'per-hour billing', totalUsdc: 0.0018 },
  },
  {
    id: 'room_def456ghi789',
    role: 'seller',
    counterparty: '1',
    resource: 'GPU A100',
    qty: 5,
    unitPrice: 0.00015,
    totalUsdc: 0.00075,
    status: 'active',
    round: 3,
    maxRounds: 10,
    createdAt: Date.now() - 1000 * 60 * 15,
    updatedAt: Date.now() - 1000 * 60 * 2,
  },
  {
    id: 'room_ghi789jkl012',
    role: 'buyer',
    counterparty: '3',
    resource: 'GPU H100',
    qty: 20,
    unitPrice: 0.00018,
    totalUsdc: 0.0036,
    status: 'constraint-hit',
    round: 10,
    maxRounds: 10,
    createdAt: Date.now() - 1000 * 60 * 60 * 24,
    updatedAt: Date.now() - 1000 * 60 * 60 * 23,
    transcriptHash: '0xghi789jkl012345...',
  },
  {
    id: 'room_jkl012mno345',
    role: 'seller',
    counterparty: '4',
    resource: 'GPU V100',
    qty: 8,
    unitPrice: 0.00012,
    totalUsdc: 0.00096,
    status: 'waiting',
    round: 0,
    maxRounds: 10,
    createdAt: Date.now() - 1000 * 60 * 5,
    updatedAt: Date.now() - 1000 * 60 * 5,
  },
];

// ============================================
// Negotiation Card Component
// ============================================

const NegotiationCard = ({ negotiation, onClick }: { negotiation: NegotiationRoom; onClick: () => void }) => {
  const getStatusConfig = (status: NegotiationRoom['status']) => {
    switch (status) {
      case 'deal-closed':
        return { label: 'Deal Closed', variant: 'success' as const, dotColor: 'bg-[#3fb950]' };
      case 'active':
        return { label: 'Negotiating', variant: 'default' as const, dotColor: 'bg-black', pulsing: true };
      case 'waiting':
        return { label: 'Waiting for Match', variant: 'default' as const, dotColor: 'bg-[#f5a623]' };
      case 'constraint-hit':
        return { label: 'Constraint Hit', variant: 'warning' as const, dotColor: 'bg-[#f5a623]' };
      case 'error':
        return { label: 'Error', variant: 'error' as const, dotColor: 'bg-[#e03e3e]' };
    }
  };

  const config = getStatusConfig(negotiation.status);
  const isActive = negotiation.status === 'active';

  return (
    <div
      onClick={onClick}
      className={cn(
        'p-4 border border-[#333333]/14 bg-white/70 hover:bg-white hover:border-black/30 transition-all duration-200 cursor-pointer',
        'group'
      )}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={cn('p-2 rounded-lg flex-shrink-0', negotiation.role === 'buyer' ? 'bg-[#3fb950]/10' : 'bg-[#f5a623]/10')}>
            <span className={cn('text-xs font-medium uppercase tracking-wider', negotiation.role === 'buyer' ? 'text-[#3fb950]' : 'text-[#f5a623]')}>
              {negotiation.role.charAt(0).toUpperCase() + negotiation.role.slice(1)}
            </span>
          </div>
          <div className="min-w-0">
            <p className="font-medium text-black truncate">{negotiation.resource}</p>
            <p className="text-sm text-[#5d5d5d] truncate">vs {negotiation.counterparty}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge status={negotiation.status === 'deal-closed' ? 'success' : negotiation.status === 'active' ? 'active' : negotiation.status === 'waiting' ? 'connecting' : negotiation.status === 'constraint-hit' ? 'warning' : 'error'} label={config.label} pulsing={config.pulsing} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div>
          <p className="text-xs text-[#5d5d5d]">Qty</p>
          <p className="font-mono font-medium">{negotiation.qty}</p>
        </div>
        <div>
          <p className="text-xs text-[#5d5d5d]">Unit Price</p>
          <p className="font-mono font-medium">{formatCurrency(negotiation.unitPrice, 6)}</p>
        </div>
        <div>
          <p className="text-xs text-[#5d5d5d]">Total</p>
          <p className="font-mono font-medium">{formatCurrency(negotiation.totalUsdc, 6)}</p>
        </div>
        {negotiation.status === 'active' && (
          <div>
            <p className="text-xs text-[#5d5d5d]">Round</p>
            <p className="font-mono font-medium">{negotiation.round}/{negotiation.maxRounds}</p>
          </div>
        )}
        {negotiation.status === 'deal-closed' && negotiation.deal && (
          <div className="sm:col-span-2">
            <p className="text-xs text-[#5d5d5d]">Final Price</p>
            <p className="font-mono font-medium text-[#3fb950]">{formatCurrency(negotiation.deal.unitPrice, 6)} (saved {formatCurrency(negotiation.unitPrice - negotiation.deal.unitPrice, 6)})</p>
          </div>
        )}
      </div>

      {negotiation.status === 'active' && (
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="flex-1 h-1.5 bg-[#333333]/14 rounded-full overflow-hidden">
              <div
                className="h-full bg-black transition-all duration-500"
                style={{ width: `${(negotiation.round / negotiation.maxRounds) * 100}%` }}
              />
            </div>
            <span className="text-xs text-[#5d5d5d]">Round {negotiation.round} of {negotiation.maxRounds}</span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-[#333333]/14">
        <div className="flex items-center gap-2 text-xs text-[#5d5d5d]">
          <span>Created: {formatRelativeTime(negotiation.createdAt)}</span>
          <Separator orientation="vertical" className="h-3" />
          <span>Updated: {formatRelativeTime(negotiation.updatedAt)}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onClick(); }}>
          {isActive ? 'Enter Room' : 'View Details'}
        </Button>
      </div>
    </div>
  );
};

// ============================================
// Negotiation Detail Modal
// ============================================

const NegotiationDetail = ({ negotiation, onClose }: { negotiation: NegotiationRoom | null; onClose: () => void }) => {
  if (!negotiation) return null;

  const getStatusConfig = (status: NegotiationRoom['status']) => {
    switch (status) {
      case 'deal-closed': return { label: 'Deal Closed', variant: 'success' as const };
      case 'active': return { label: 'Negotiating', variant: 'default' as const };
      case 'waiting': return { label: 'Waiting for Match', variant: 'default' as const };
      case 'constraint-hit': return { label: 'Constraint Hit', variant: 'warning' as const };
      case 'error': return { label: 'Error', variant: 'error' as const };
    }
  };

  const config = getStatusConfig(negotiation.status);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-none w-full max-w-2xl max-h-[90vh] overflow-hidden animate-scale-in" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#333333]/14">
          <div>
            <h2 className="font-serif text-xl font-medium text-black">{negotiation.resource}</h2>
            <p className="text-sm text-[#5d5d5d]">Room: {truncate(negotiation.id, 20)}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-black/5 rounded transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="p-3 bg-white/50 border border-[#333333]/14">
              <p className="text-xs text-[#5d5d5d] mb-1">Your Role</p>
              <Badge variant={negotiation.role === 'buyer' ? 'default' : 'success'}>
                {negotiation.role.charAt(0).toUpperCase() + negotiation.role.slice(1)}
              </Badge>
            </div>
            <div className="p-3 bg-white/50 border border-[#333333]/14">
              <p className="text-xs text-[#5d5d5d] mb-1">Counterparty</p>
              <p className="font-medium">{negotiation.counterparty}</p>
            </div>
            <div className="p-3 bg-white/50 border border-[#333333]/14">
              <p className="text-xs text-[#5d5d5d] mb-1">Quantity</p>
              <p className="font-mono font-medium">{negotiation.qty}</p>
            </div>
            <div className="p-3 bg-white/50 border border-[#333333]/14">
              <p className="text-xs text-[#5d5d5d] mb-1">Your Bound</p>
              <p className="font-mono font-medium">{formatCurrency(negotiation.unitPrice, 6)}</p>
            </div>
          </div>

          <Separator />

          {/* Progress */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Progress</span>
              <StatusBadge status={negotiation.status === 'deal-closed' ? 'success' : negotiation.status === 'active' ? 'active' : negotiation.status === 'waiting' ? 'connecting' : 'warning'} label={config.label} />
            </div>
            {negotiation.status === 'active' && (
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex-1 h-2 bg-[#333333]/14 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-black transition-all duration-500"
                      style={{ width: `${(negotiation.round / negotiation.maxRounds) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm text-[#5d5d5d]">Round {negotiation.round} of {negotiation.maxRounds}</span>
                </div>
              </div>
            )}
          </div>

          {negotiation.status === 'deal-closed' && negotiation.deal && (
            <div className="p-4 bg-[#3fb950]/10 border border-[#3fb950] mb-4">
              <h3 className="font-medium text-[#3fb950] mb-2">Deal Closed</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-[#5d5d5d]">Final Unit Price</p>
                  <p className="font-mono font-medium text-[#3fb950]">{formatCurrency(negotiation.deal.unitPrice, 6)}</p>
                </div>
                <div>
                  <p className="text-[#5d5d5d]">Total USDC</p>
                  <p className="font-mono font-medium text-[#3fb950]">{formatCurrency(negotiation.deal.totalUsdc, 6)}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-[#5d5d5d]">Terms</p>
                  <p className="font-mono text-xs">{negotiation.deal.terms}</p>
                </div>
              </div>
            </div>
          )}

          {negotiation.transcriptHash && (
            <div className="mb-4">
              <p className="text-xs text-[#5d5d5d] mb-1">Transcript Hash</p>
              <p className="font-mono text-xs break-all">{negotiation.transcriptHash}</p>
            </div>
          )}

          {/* Timeline */}
          <h3 className="font-medium mb-3">Timeline</h3>
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 bg-white/50 border border-[#333333]/14">
              <div className="w-2 h-2 mt-1.5 rounded-full bg-black flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Room created</p>
                <p className="text-xs text-[#5d5d5d]">{formatRelativeTime(negotiation.createdAt)}</p>
              </div>
            </div>
            {negotiation.status !== 'waiting' && (
              <div className="flex items-start gap-3 p-3 bg-white/50 border border-[#333333]/14">
                <div className="w-2 h-2 mt-1.5 rounded-full bg-[#3fb950] flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium">Negotiation started</p>
                  <p className="text-xs text-[#5d5d5d]">{formatRelativeTime(negotiation.createdAt + 1000 * 60)}</p>
                </div>
              </div>
            )}
            {negotiation.status === 'deal-closed' && negotiation.deal && (
              <div className="flex items-start gap-3 p-3 bg-[#3fb950]/10 border border-[#3fb950]/30">
                <div className="w-2 h-2 mt-1.5 rounded-full bg-[#3fb950] flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-[#3fb950]">Deal closed successfully</p>
                  <p className="text-xs text-[#5d5d5d]">{formatRelativeTime(negotiation.updatedAt)}</p>
                </div>
              </div>
            )}
            {negotiation.status === 'constraint-hit' && (
              <div className="flex items-start gap-3 p-3 bg-[#f5a623]/10 border border-[#f5a623]/30">
                <div className="w-2 h-2 mt-1.5 rounded-full bg-[#f5a623] flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-[#f5a623]">Constraint hit - max rounds reached</p>
                  <p className="text-xs text-[#5d5d5d]">{formatRelativeTime(negotiation.updatedAt)}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-[#333333]/14">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          {negotiation.status === 'active' && (
            <Link href={`/negotiations/${negotiation.id}?role=${negotiation.role}`} onClick={onClose}>
              <Button>
                Enter Negotiation Room
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================
// Negotiations Page
// ============================================

export default function NegotiationsPage() {
  const [negotiations] = React.useState<NegotiationRoom[]>(mockNegotiations);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [roleFilter, setRoleFilter] = React.useState<string>('all');
  const [selectedNegotiation, setSelectedNegotiation] = React.useState<NegotiationRoom | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  // Filter negotiations
  const filteredNegotiations = negotiations.filter((n) => {
    const matchesSearch = n.resource.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.counterparty.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || n.status === statusFilter;
    const matchesRole = roleFilter === 'all' || n.role === roleFilter;
    return matchesSearch && matchesStatus && matchesRole;
  });

  const statusOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'active', label: 'Active' },
    { value: 'waiting', label: 'Waiting' },
    { value: 'deal-closed', label: 'Deal Closed' },
    { value: 'constraint-hit', label: 'Constraint Hit' },
  ];

  const roleOptions = [
    { value: 'all', label: 'All Roles' },
    { value: 'buyer', label: 'Buyer' },
    { value: 'seller', label: 'Seller' },
  ];

  const handleCardClick = (negotiation: NegotiationRoom) => {
    setSelectedNegotiation(negotiation);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageContainer
        title="Negotiations"
        description="View and manage your active and past negotiation rooms"
        action={
          <Button onClick={() => setIsLoading(true)}>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Refresh
          </Button>
        }
      />

      {/* Filters */}
      <Card>
        <CardContent className="p-4 pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5d5d5d]" />
              <Input
                placeholder="Search negotiations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select
              options={statusOptions}
              placeholder="Filter by status"
              value={statusFilter}
              onValueChange={(value: string) => setStatusFilter(value)}
              className="w-full sm:w-48"
            />
            <Select
              options={roleOptions}
              placeholder="Filter by role"
              value={roleFilter}
              onValueChange={(value: string) => setRoleFilter(value)}
              className="w-full sm:w-48"
            />
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Section title={`Negotiations (${filteredNegotiations.length})`}>
        {filteredNegotiations.length === 0 ? (
          <EmptyState
            icon={<Search className="h-12 w-12" />}
            title="No negotiations found"
            description="Try adjusting your filters or create a new intent/offer to start negotiating"
          />
        ) : (
          <div className="space-y-4">
            {filteredNegotiations.map((negotiation) => (
              <NegotiationCard
                key={negotiation.id}
                negotiation={negotiation}
                onClick={() => handleCardClick(negotiation)}
              />
            ))}
          </div>
        )}
      </Section>

      {/* Detail Modal */}
      <NegotiationDetail
        negotiation={selectedNegotiation}
        onClose={() => setSelectedNegotiation(null)}
      />
    </div>
  );
}