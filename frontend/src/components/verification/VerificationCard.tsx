/**
 * Finality Labs - Verification Card Component
 * Displays a summary card for a verification request
 */

'use client';

import * as React from 'react';
import {
  User,
  Building2,
  DollarSign,
  Hash,
  Clock,
  FileText,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import { cn, formatCurrency, formatRelativeTime, truncate } from '@/lib/utils';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  Button,
  Separator,
  VerificationStatusBadge,
  Skeleton,
} from '@/components/ui';
import type { VerificationResult } from '@/types/verification';

interface VerificationCardProps {
  verification: VerificationResult | null;
  onClick?: () => void;
  compact?: boolean;
  role?: 'buyer' | 'seller' | 'admin';
  loading?: boolean;
}

const roleLabels = {
  buyer: 'Buyer',
  seller: 'Seller',
  admin: 'Admin',
};

const roleIcons = {
  buyer: User,
  seller: Building2,
  admin: FileText,
};

export function VerificationCard({
  verification,
  onClick,
  compact = false,
  role,
  loading = false,
}: VerificationCardProps) {
  // Loading skeleton
 
  if (loading || !verification) {
    if (compact) {
      return (
        <Card className="animate-pulse">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap mb-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-28" />
                </div>
              </div>
              {onClick && <Skeleton className="h-5 w-5" />}
            </div>
          </CardContent>
        </Card>
      );
    }
    return (
      <Card className="animate-pulse">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <Skeleton className="h-6 w-48 mb-2" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-8 w-24" />
          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          <Skeleton className="h-4 w-full" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
          <Skeleton className="h-20 w-full" />
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // TypeScript narrowing - verification is now VerificationResult
  const { request, finalStatus, verdicts, startedAt, completedAt, passed } = verification;
  const { deal, requestId, roomId, transcriptHash, createdAt } = request;

  const isInteractive = onClick && role !== undefined;
  const hasVerdicts = verdicts.length > 0;
  const latestVerdict = verdicts[verdicts.length - 1];

  if (compact) {
    return (
      <Card
        className={cn('transition-all duration-200', isInteractive && 'hover:border-black/30 hover:shadow-md cursor-pointer')}
        onClick={onClick}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap mb-2">
                <span className="font-mono text-xs text-[#5d5d5d]">{truncate(requestId, 16)}</span>
                <VerificationStatusBadge status={finalStatus} size="sm" />
                {role && (
                  <Badge variant="default" className="text-xs">
                    {roleLabels[role]}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-[#5d5d5d] flex-wrap">
                <span className="flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  {formatCurrency(deal.totalUsdc, 6)}
                </span>
                <span className="flex items-center gap-1">
                  <Hash className="h-3 w-3" />
                  {truncate(transcriptHash, 12)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatRelativeTime(new Date(createdAt).getTime())}
                </span>
              </div>
            </div>
            {isInteractive && (
              <ChevronRight className="h-5 w-5 text-[#5d5d5d] flex-shrink-0" />
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn('transition-all duration-200', isInteractive && 'hover:border-black/30 hover:shadow-md cursor-pointer')}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <CardTitle className="font-mono text-lg truncate">{requestId}</CardTitle>
              <VerificationStatusBadge status={finalStatus} size="md" />
              {role && (
                <Badge variant="default">
                  {roleLabels[role]}
                </Badge>
              )}
            </div>
            <CardDescription className="text-[#5d5d5d]">
              Room: <span className="font-mono text-sm">{truncate(roomId, 20)}</span>
            </CardDescription>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-2xl font-medium text-black">{formatCurrency(deal.totalUsdc, 6)}</p>
            <p className="text-xs text-[#5d5d5d]">USDC Total</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <Separator className="my-3" />

        {/* Deal Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <div className="space-y-1">
            <p className="text-xs text-[#5d5d5d] uppercase tracking-wider">Buyer</p>
            <p className="font-mono text-sm truncate">{deal.buyer.agentId}</p>
            <p className="text-xs text-[#5d5d5d] truncate">{deal.buyer.wallet}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-[#5d5d5d] uppercase tracking-wider">Seller</p>
            <p className="font-mono text-sm truncate">{deal.seller.agentId}</p>
            <p className="text-xs text-[#5d5d5d] truncate">{deal.seller.wallet}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-[#5d5d5d] uppercase tracking-wider">Unit Price</p>
            <p className="font-mono text-sm">{formatCurrency(deal.unitPrice, 6)} USDC</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-[#5d5d5d] uppercase tracking-wider">Quantity</p>
            <p className="font-mono text-sm">{deal.qty}</p>
          </div>
        </div>

        {/* Terms */}
        <div className="mb-4">
          <p className="text-xs text-[#5d5d5d] uppercase tracking-wider mb-1">Terms</p>
          <p className="text-sm text-[#151515] bg-white/50 p-3 rounded-lg border border-[#333333]/14">
            {deal.terms}
          </p>
        </div>

        {/* Verification Progress */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-[#5d5d5d] uppercase tracking-wider">Verification Progress</p>
            {hasVerdicts && (
              <p className="text-xs font-medium text-black">
                {verdicts.length} verifier(s) completed
              </p>
            )}
          </div>
          <div className="space-y-2">
            {verdicts.map((verdict, index) => (
              <div key={verdict.verdictId} className="flex items-center gap-3 p-3 bg-white/50 rounded-lg border border-[#333333]/14">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-black/5 flex items-center justify-center">
                  <span className="text-xs font-medium text-black">{index + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-black">{verdict.verifierName}</p>
                  <p className="text-xs text-[#5d5d5d] truncate">{verdict.verifierId}</p>
                </div>
                <VerificationStatusBadge
                  status={verdict.status === 'verified' ? 'verified' : verdict.status === 'rejected' ? 'rejected' : 'error'}
                  size="sm"
                />
              </div>
            ))}
            {verdicts.length === 0 && (
              <div className="text-center py-4 text-[#5d5d5d]">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No verifiers have completed yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Final Verdict */}
        {hasVerdicts && latestVerdict && (
          <div className="p-3 rounded-lg bg-white/50 border border-[#333333]/14">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-[#5d5d5d] uppercase tracking-wider">Final Verdict</p>
              <span className="text-xs text-[#5d5d5d]">
                {formatRelativeTime(new Date(latestVerdict.timestamp).getTime())}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <VerificationStatusBadge
                status={passed ? 'verified' : 'rejected'}
                size="md"
              />
              <div className="flex-1">
                {latestVerdict.proof && (
                  <p className="text-sm text-[#5d5d5d]">
                    Proof: <span className="font-mono text-black">{truncate(latestVerdict.proof, 40)}</span>
                  </p>
                )}
                {latestVerdict.rejectionReason && (
                  <p className="text-sm text-[#e03e3e]">
                    Rejection: {latestVerdict.rejectionReason}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Timestamps */}
        <div className="grid grid-cols-2 gap-4 pt-3 border-t border-[#333333]/14">
          <div>
            <p className="text-xs text-[#5d5d5d] uppercase tracking-wider">Started</p>
            <p className="font-mono text-sm text-black">{formatRelativeTime(new Date(startedAt).getTime())}</p>
          </div>
          <div>
            <p className="text-xs text-[#5d5d5d] uppercase tracking-wider">
              {completedAt ? 'Completed' : 'In Progress'}
            </p>
            <p className="font-mono text-sm text-black">
              {completedAt ? formatRelativeTime(new Date(completedAt).getTime()) : '—'}
            </p>
          </div>
        </div>
      </CardContent>

      {isInteractive && (
        <CardFooter className="pt-0 border-t border-[#333333]/14">
          <Button variant="outline" className="w-full" onClick={(e) => { e.stopPropagation(); onClick(); }}>
            View Details
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}