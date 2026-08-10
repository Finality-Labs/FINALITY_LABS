/**
 * Finality Labs - Verification Timeline Component
 * Displays the complete verification lifecycle with timestamps and state transitions
 */

'use client';

import * as React from 'react';
import {
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  HelpCircle,
  Loader2,
  User,
  Building2,
  FileText,
  Shield,
  ArrowRight,
} from 'lucide-react';
import { cn, formatRelativeTime, formatDateTime } from '@/lib/utils';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Separator,
  VerificationStatusBadge,
} from '@/components/ui';
import type { VerificationResult, VerificationVerdict, VerificationStatus } from '@/types/verification';

interface VerificationTimelineProps {
  verification: VerificationResult;
  currentUserRole?: 'buyer' | 'seller' | 'admin';
  currentUserAgentId?: string;
}

const statusOrder: VerificationStatus[] = [
  'pending',
  'seller-completed',
  'waiting-for-buyer',
  'verified',
  'rejected',
  'disputed',
  'error',
];

const statusConfig = {
  'pending': {
    label: 'Pending',
    icon: Loader2,
    description: 'Verification request created, awaiting seller completion',
    color: 'text-[#f5a623]',
    bg: 'bg-[#f5a623]/10',
    border: 'border-[#f5a623]',
  },
  'seller-completed': {
    label: 'Seller Completed',
    icon: CheckCircle,
    description: 'Seller has submitted completion proof/notes',
    color: 'text-[#3fb950]',
    bg: 'bg-[#3fb950]/10',
    border: 'border-[#3fb950]',
  },
  'waiting-for-buyer': {
    label: 'Waiting for Buyer',
    icon: Clock,
    description: 'Awaiting buyer approval or rejection',
    color: 'text-[#0070f3]',
    bg: 'bg-[#0070f3]/10',
    border: 'border-[#0070f3]',
  },
  'verified': {
    label: 'Verified',
    icon: CheckCircle,
    description: 'Verification passed - settlement can proceed',
    color: 'text-[#3fb950]',
    bg: 'bg-[#3fb950]/10',
    border: 'border-[#3fb950]',
  },
  'rejected': {
    label: 'Rejected',
    icon: XCircle,
    description: 'Verification failed - settlement blocked',
    color: 'text-[#e03e3e]',
    bg: 'bg-[#e03e3e]/10',
    border: 'border-[#e03e3e]',
  },
  'disputed': {
    label: 'Disputed',
    icon: AlertCircle,
    description: 'Dispute raised - requires admin intervention',
    color: 'text-[#e03e3e]',
    bg: 'bg-[#e03e3e]/10',
    border: 'border-[#e03e3e]',
  },
  'error': {
    label: 'Error',
    icon: HelpCircle,
    description: 'Verification encountered an error',
    color: 'text-[#5d5d5d]',
    bg: 'bg-[#5d5d5d]/10',
    border: 'border-[#5d5d5d]',
  },
};

const getActorIcon = (actor: string) => {
    switch (actor) {
      case 'buyer': return User;
      case 'seller': return Building2;
      case 'admin': return Shield;
      case 'verifier': return FileText;
      default: return User;
    }
  };

export function VerificationTimeline({
  verification,
  currentUserRole,
  currentUserAgentId,
}: VerificationTimelineProps) {
  const { request, verdicts, finalStatus, startedAt, completedAt } = verification;

  // Build timeline events from verification data
  const events = React.useMemo(() => {
    const timelineEvents: Array<{
      status: VerificationStatus;
      timestamp: string;
      actor?: 'buyer' | 'seller' | 'admin' | 'verifier' | 'system';
      actorId?: string;
      details?: string;
      proof?: string;
      rejectionReason?: string;
      isCurrent: boolean;
      isCompleted: boolean;
    }> = [];

    // 1. Request Created (Pending)
    timelineEvents.push({
      status: 'pending',
      timestamp: startedAt,
      actor: 'system',
      details: 'Verification request created',
      isCurrent: finalStatus === 'pending',
      isCompleted: finalStatus !== 'pending',
    });

    // 2. Seller Completion (if exists)
    const sellerVerdict = verdicts.find(v => v.verifierId.includes('seller') || v.metadata?.submittedBy === 'seller');
    if (sellerVerdict) {
      timelineEvents.push({
        status: 'seller-completed',
        timestamp: sellerVerdict.timestamp,
        actor: 'seller',
        actorId: sellerVerdict.verifierId,
        details: 'Seller marked completion',
        proof: sellerVerdict.proof,
        isCurrent: finalStatus === 'seller-completed',
        isCompleted: finalStatus !== 'pending' && finalStatus !== 'seller-completed',
      });
    }

    // 3. Buyer Decision (if exists)
    const buyerVerdict = verdicts.find(v => v.verifierId.includes('buyer') || v.metadata?.submittedBy === 'buyer');
    if (buyerVerdict) {
      timelineEvents.push({
        status: buyerVerdict.status === 'verified' ? 'verified' : 'rejected',
        timestamp: buyerVerdict.timestamp,
        actor: 'buyer',
        actorId: buyerVerdict.verifierId,
        details: buyerVerdict.status === 'verified' ? 'Buyer approved' : 'Buyer rejected',
        proof: buyerVerdict.proof,
        rejectionReason: buyerVerdict.rejectionReason,
        isCurrent: finalStatus === 'waiting-for-buyer' || finalStatus === buyerVerdict.status as VerificationStatus,
        isCompleted: ['verified', 'rejected', 'disputed'].includes(finalStatus),
      });
    }

    // 4. Other verifiers
    const otherVerdicts = verdicts.filter(
      v => !v.verifierId.includes('seller') && !v.verifierId.includes('buyer')
    );
    otherVerdicts.forEach((verdict) => {
      timelineEvents.push({
        status: verdict.status === 'verified' ? 'verified' : 'rejected',
        timestamp: verdict.timestamp,
        actor: 'verifier',
        actorId: verdict.verifierId,
        details: `Verifier ${verdict.verifierName} completed`,
        proof: verdict.proof,
        rejectionReason: verdict.rejectionReason,
        isCurrent: false,
        isCompleted: true,
      });
    });

    // 5. Final status if terminal
    if (['verified', 'rejected', 'disputed', 'error'].includes(finalStatus)) {
      const lastEvent = timelineEvents[timelineEvents.length - 1];
      if (!lastEvent || lastEvent.status !== finalStatus) {
        timelineEvents.push({
          status: finalStatus,
          timestamp: completedAt || startedAt,
          actor: 'system',
          details: `Verification ${finalStatus}`,
          isCurrent: true,
          isCompleted: true,
        });
      } else {
        lastEvent.isCurrent = true;
      }
    }

    // Sort by timestamp
    return timelineEvents.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [verification]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Verification Timeline</CardTitle>
            <CardDescription>
              Complete lifecycle of verification request <span className="font-mono">{verification.request.requestId.slice(0, 16)}...</span>
            </CardDescription>
          </div>
          <VerificationStatusBadge status={finalStatus} size="md" />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="relative">
          {/* Timeline Line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-[#333333]/14" aria-hidden="true" />

          <div className="space-y-6 pl-12">
            {events.map((event, index) => {
              const config = statusConfig[event.status];
              const Icon = config.icon;
              const ActorIcon = event.actor ? getActorIcon(event.actor) : null;
              const isLast = index === events.length - 1;

              return (
                <div
                  key={`${event.status}-${event.timestamp}`}
                  className="relative"
                >
                  {/* Timeline Dot */}
                  <div
                    className={cn(
                      'absolute -left-12 w-8 h-8 rounded-full border-2 flex items-center justify-center z-10 transition-all duration-300',
                      event.isCurrent
                        ? 'bg-white border-2 animate-pulse shadow-[0_0_0_4px_' + config.color.replace('text-', '') + ']'
                        : event.isCompleted
                        ? `bg-white border-2 ${config.border}`
                        : 'bg-white border-2 border-[#333333]/30'
                    )}
                    style={{
                      boxShadow: event.isCurrent
                        ? `0 0 0 4px ${config.color.replace('text-', '')}40`
                        : 'none',
                    }}
                  >
                    <Icon
                      className={cn(
                        'h-4 w-4',
                        event.isCurrent ? config.color : event.isCompleted ? config.color : 'text-[#5d5d5d]'
                      )}
                      aria-hidden="true"
                    />
                  </div>

                  {/* Timeline Content */}
                  <div
                    className={cn(
                      'p-4 rounded-lg border transition-all duration-300',
                      event.isCurrent
                        ? `${config.bg} ${config.border} shadow-[0_0_0_1px_${config.color.replace('text-', '')}]`
                        : event.isCompleted
                        ? 'bg-white/50 border-[#333333]/14'
                        : 'bg-white/30 border-[#333333]/14 opacity-60'
                    )}
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap mb-2">
                          <VerificationStatusBadge
                            status={event.status}
                            size="sm"
                            showIcon={false}
                          />
                          <span className="text-sm font-medium text-black">
                            {config.label}
                          </span>
                          {event.actor && (
                            <Badge variant="default" className="text-xs capitalize">
                              {event.actor}
                            </Badge>
                          )}
                        </div>

                        <p className="text-sm text-[#5d5d5d] mb-2">{config.description}</p>

                        {event.details && (
                          <p className="text-sm text-[#151515] mb-2">{event.details}</p>
                        )}

                        <div className="flex items-center gap-4 text-xs text-[#5d5d5d] flex-wrap">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDateTime(event.timestamp)}
                          </span>
                          {event.actorId && event.actor && (
                            <span className="flex items-center gap-1 font-mono">
                              {(() => {
                                const ActorIcon = getActorIcon(event.actor);
                                return <ActorIcon className="h-3 w-3" />;
                              })()}
                              {event.actorId}
                            </span>
                          )}
                        </div>

                        {event.proof && (
                          <div className="mt-3 p-3 bg-white/50 rounded-lg border border-[#333333]/14">
                            <p className="text-xs text-[#5d5d5d] uppercase tracking-wider mb-1">Proof Submitted</p>
                            <p className="font-mono text-sm text-black break-all">{event.proof}</p>
                          </div>
                        )}

                        {event.rejectionReason && (
                          <div className="mt-3 p-3 bg-[#e03e3e]/5 rounded-lg border border-[#e03e3e]/20">
                            <p className="text-xs text-[#e03e3e] uppercase tracking-wider mb-1">Rejection Reason</p>
                            <p className="text-sm text-[#e03e3e]">{event.rejectionReason}</p>
                          </div>
                        )}
                      </div>

                      {/* Current Indicator */}
                      {event.isCurrent && (
                        <div className="flex-shrink-0">
                          <Badge variant="default" className="text-xs">
                            Current
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Connector line (except last) */}
                  {!isLast && (
                    <div
                      className="absolute left-[-10px] top-[36px] bottom-0 w-0.5"
                      style={{
                        background: event.isCompleted
                          ? `linear-gradient(to bottom, ${config.color.replace('text-', '')} 0%, ${config.color.replace('text-', '')} 100%)`
                          : 'linear-gradient(to bottom, #33333320 0%, #33333320 100%)',
                      }}
                      aria-hidden="true"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Summary Stats */}
        <Separator className="my-6" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-3 bg-white/50 rounded-lg border border-[#333333]/14">
            <p className="text-xs text-[#5d5d5d] uppercase tracking-wider">Total Verifiers</p>
            <p className="text-2xl font-medium text-black">{verdicts.length}</p>
          </div>
          <div className="p-3 bg-white/50 rounded-lg border border-[#333333]/14">
            <p className="text-xs text-[#5d5d5d] uppercase tracking-wider">Passed</p>
            <p className="text-2xl font-medium text-[#3fb950]">
              {verdicts.filter(v => v.status === 'verified').length}
            </p>
          </div>
          <div className="p-3 bg-white/50 rounded-lg border border-[#333333]/14">
            <p className="text-xs text-[#5d5d5d] uppercase tracking-wider">Rejected</p>
            <p className="text-2xl font-medium text-[#e03e3e]">
              {verdicts.filter(v => v.status === 'rejected').length}
            </p>
          </div>
          <div className="p-3 bg-white/50 rounded-lg border border-[#333333]/14">
            <p className="text-xs text-[#5d5d5d] uppercase tracking-wider">Duration</p>
            <p className="text-2xl font-medium text-black">
              {completedAt
                ? Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 60000) + 'm'
                : 'In progress'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}