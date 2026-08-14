/**
 * Finality Labs - Seller Offer Result Flow
 * Post-submit lifecycle for a seller offer: Offer Created → Waiting for buyer
 * → real match details + Enter Negotiation.
 *
 * Reuses the existing matchmaking response (createOffer / getMatch) and the
 * existing negotiation room route (/negotiations/:roomId?role=seller). No
 * negotiation UI/backend is implemented here.
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowDown,
  Search,
  User,
  ListChecks,
  Hash,
  FileText,
  X,
} from 'lucide-react';
import type { CreateOfferResponse } from '@/types/api';
import { Button, Badge, Separator } from '@/components/ui';
import { cn, formatCurrency, truncate } from '@/lib/utils';

export interface OfferFlowState {
  status: 'idle' | 'created' | 'searching' | 'matched' | 'no-match' | 'error';
  offerId?: string;
  match?: CreateOfferResponse['match'];
  roomId?: string;
  wssUrl?: string;
  error?: string;
}

interface OfferResultPanelProps {
  flow: OfferFlowState;
  onStopSearch?: () => void;
}

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <p className="text-xs uppercase tracking-wider text-[#5d5d5d] mb-0.5">{label}</p>
    <div className="text-sm text-black">{value}</div>
  </div>
);

const Requirement = ({ value }: { value: unknown }) => {
  const text =
    value === null || value === undefined
      ? 'null'
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono bg-white/50 border border-[#333333]/14 rounded">
      {text}
    </span>
  );
};

const Party = ({ role, party }: { role: 'buyer' | 'seller'; party: { agentRegistry: string; agentId: string; wallet: string } }) => (
  <div className="p-3 bg-white/50 border border-[#333333]/14 rounded">
    <div className="flex items-center gap-2 mb-2">
      <User className={cn('h-4 w-4', role === 'buyer' ? 'text-[#3fb950]' : 'text-[#f5a623]')} />
      <span className="text-sm font-medium capitalize">{role} Agent</span>
      <Badge variant={role === 'buyer' ? 'success' : 'default'}>{party.agentId}</Badge>
    </div>
    <p className="text-xs font-mono break-all text-[#5d5d5d]">{party.agentRegistry}</p>
    <p className="text-xs font-mono break-all text-[#5d5d5d] mt-0.5">
      {party.wallet.startsWith('0x') ? `${party.wallet.slice(0, 6)}...${party.wallet.slice(-4)}` : party.wallet}
    </p>
  </div>
);

export function OfferResultPanel({ flow, onStopSearch }: OfferResultPanelProps) {
  const showSearching = flow.status === 'created' || flow.status === 'searching';
  const match = flow.match;

  if (flow.status === 'error') {
    return (
      <div className="p-4 rounded-lg border animate-slide-down bg-[#e03e3e]/10 border-[#e03e3e] text-[#e03e3e]">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span className="font-medium">Offer creation failed</span>
        </div>
        <p className="text-sm mt-1">{flow.error}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border animate-slide-down bg-[#f5a623]/5 border-[#f5a623]/40 overflow-hidden">
      {/* Header: Offer Created ↓ */}
      <div className="p-4">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 flex-shrink-0 text-[#3fb950]" />
          <span className="font-medium text-[#3fb950]">Offer Created</span>
          {flow.offerId && (
            <code className="font-mono text-xs text-[#5d5d5d]">{truncate(flow.offerId, 20)}</code>
          )}
        </div>

        <div className="flex flex-col items-center py-3">
          <ArrowDown className="h-5 w-5 text-[#f5a623]" />
        </div>

        {showSearching ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-white/50 border border-[#f5a623]/30 rounded">
              <Loader2 className="h-5 w-5 text-[#f5a623] animate-spin flex-shrink-0" />
              <div>
                <p className="font-medium">Waiting for buyer...</p>
                <p className="text-sm text-[#5d5d5d]">
                  Your offer is live. Compatible buyer intents will be matched automatically.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={onStopSearch}>
                <X className="h-3 w-3 mr-1" />
                Stop searching
              </Button>
              <Link href="/negotiations" className="ml-auto">
                <Button variant="secondary" size="sm">Check Negotiations</Button>
              </Link>
            </div>
          </div>
        ) : null}

        {flow.status === 'no-match' && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-white/50 border border-[#f5a623]/30 rounded">
              <Search className="h-5 w-5 text-[#f5a623] flex-shrink-0" />
              <div>
                <p className="font-medium text-[#f5a623]">No compatible buyer intents found yet</p>
                <p className="text-sm text-[#5d5d5d]">
                  Your offer stays active. Intents arriving later will be matched automatically.
                </p>
              </div>
            </div>
            <Link href="/negotiations">
              <Button variant="secondary" size="sm">Check Negotiations</Button>
            </Link>
          </div>
        )}
      </div>

      {/* Match Details */}
      {flow.status === 'matched' && match && flow.roomId && (
        <>
          <Separator />
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-[#3fb950]" />
              <span className="font-medium text-[#3fb950]">Match Found!</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Party role="buyer" party={match.buyer} />
              <Party role="seller" party={match.seller} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Row
                label="Resource"
                value={<span className="capitalize">{match.resource}</span>}
              />
              <Row
                label="Quantity"
                value={`${match.qty} ${match.unit}`}
              />
              <Row
                label="Proposed Price"
                value={
                  <span>
                    {formatCurrency(match.unitPrice, 6)} / {match.unit}
                  </span>
                }
              />
              <Row
                label="Total"
                value={<span className="font-mono">{formatCurrency(match.unitPrice * match.qty, 6)} USDC</span>}
              />
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <ListChecks className="h-4 w-4 text-[#5d5d5d]" />
                <p className="text-xs uppercase tracking-wider text-[#5d5d5d]">Requirements</p>
              </div>
              {Object.keys(match.requirements || {}).length === 0 ? (
                <p className="text-sm text-[#5d5d5d]">None</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(match.requirements || {}).map(([k, v]) => (
                    <span key={k} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono bg-white/50 border border-[#333333]/14 rounded">
                      <span className="text-[#5d5d5d]">{k}:</span>
                      <Requirement value={v} />
                    </span>
                  ))}
                </div>
              )}
            </div>

            {match.terms && (
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <FileText className="h-4 w-4 text-[#5d5d5d]" />
                  <p className="text-xs uppercase tracking-wider text-[#5d5d5d]">Terms</p>
                </div>
                <p className="text-sm text-black">{match.terms}</p>
              </div>
            )}

            <div className="flex items-center gap-2 p-3 bg-white/50 border border-[#333333]/14 rounded">
              <Hash className="h-4 w-4 text-[#5d5d5d] flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wider text-[#5d5d5d]">Match ID (Room)</p>
                <code className="font-mono text-sm break-all">{flow.roomId}</code>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Actions */}
      {flow.status === 'matched' && (
        <div className="flex flex-col sm:flex-row gap-2 p-4 bg-[#3fb950]/10 border-t border-[#3fb950]/40">
          <Link href={`/negotiations/${flow.roomId}?role=seller&resource=${encodeURIComponent(match.resource)}`} className="sm:flex-1">
            <Button className="w-full">
              Enter Negotiation
            </Button>
          </Link>
          <Link href="/negotiations" className="sm:flex-1">
            <Button variant="secondary" className="w-full">View Negotiations</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
