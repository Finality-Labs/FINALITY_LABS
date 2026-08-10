/**
 * Finality Labs - Loading Skeletons & Error States
 * Reusable components for loading, error, and empty states
 */

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Skeleton,
  Button,
  Badge,
  Separator,
  Avatar,
  Table,
} from '@/components/ui';
import {
  Search,
  Package,
  DollarSign,
  Handshake,
  Shield,
  Users,
  Activity,
  ExternalLink,
  AlertCircle,
  RefreshCw,
  PlusCircle,
} from 'lucide-react';

// ============================================
// Skeleton Components
// ============================================

export function StatCardSkeleton() {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <Skeleton className="h-3 w-24 mb-1" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-3 w-40 mt-2" />
          </div>
          <Skeleton className="h-12 w-12 rounded-lg" />
        </div>
      </CardContent>
    </Card>
  );
}

export function NegotiationCardSkeleton() {
  return (
    <div className="p-4 border border-[#333333]/14 bg-white/70 animate-pulse">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Skeleton className="h-8 w-24 rounded-lg" />
          <div className="min-w-0">
            <Skeleton className="h-4 w-40 mb-1" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
        <Skeleton className="h-6 w-28 rounded" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div>
          <Skeleton className="h-2 w-12 mb-1" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div>
          <Skeleton className="h-2 w-18 mb-1" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div>
          <Skeleton className="h-2 w-10 mb-1" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div>
          <Skeleton className="h-2 w-12 mb-1" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>

      <div className="mb-3">
        <div className="flex-1 h-1.5 bg-[#333333]/14 rounded-full overflow-hidden">
          <Skeleton className="h-full w-1/3 bg-black" />
        </div>
        <Skeleton className="h-3 w-32 mt-1" />
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-[#333333]/14">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-8 w-24 rounded" />
      </div>
    </div>
  );
}

export function NegotiationTableSkeleton({ rowCount = 5 }: { rowCount?: number } = {}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-48 mt-1" />
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#333333]/14">
                <th className="text-left px-3 py-2.5 font-medium text-xs uppercase tracking-wider text-[#5d5d5d]">
                  <Skeleton className="h-4 w-20" />
                </th>
                <th className="text-left px-3 py-2.5 font-medium text-xs uppercase tracking-wider text-[#5d5d5d]">
                  <Skeleton className="h-4 w-16" />
                </th>
                <th className="text-left px-3 py-2.5 font-medium text-xs uppercase tracking-wider text-[#5d5d5d]">
                  <Skeleton className="h-4 w-24" />
                </th>
                <th className="text-left px-3 py-2.5 font-medium text-xs uppercase tracking-wider text-[#5d5d5d]">
                  <Skeleton className="h-4 w-20" />
                </th>
                <th className="text-right px-3 py-2.5 font-medium text-xs uppercase tracking-wider text-[#5d5d5d]">
                  <Skeleton className="h-4 w-12" />
                </th>
                <th className="text-right px-3 py-2.5 font-medium text-xs uppercase tracking-wider text-[#5d5d5d]">
                  <Skeleton className="h-4 w-24" />
                </th>
                <th className="text-right px-3 py-2.5 font-medium text-xs uppercase tracking-wider text-[#5d5d5d]">
                  <Skeleton className="h-4 w-20" />
                </th>
                <th className="text-left px-3 py-2.5 font-medium text-xs uppercase tracking-wider text-[#5d5d5d]">
                  <Skeleton className="h-4 w-16" />
                </th>
                <th className="text-left px-3 py-2.5 font-medium text-xs uppercase tracking-wider text-[#5d5d5d]">
                  <Skeleton className="h-4 w-18" />
                </th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rowCount }).map((_, i) => (
                <tr key={i} className="border-b border-[#333333]/14 hover:bg-black/[0.02] transition-colors animate-pulse">
                  <td className="px-3 py-2.5 text-[#151515]"><Skeleton className="h-4 w-24 font-mono text-xs" /></td>
                  <td className="px-3 py-2.5 text-[#151515]"><Skeleton className="h-4 w-16" /></td>
                  <td className="px-3 py-2.5 text-[#151515]"><Skeleton className="h-4 w-28" /></td>
                  <td className="px-3 py-2.5 text-[#151515]"><Skeleton className="h-4 w-24" /></td>
                  <td className="px-3 py-2.5 text-[#151515] text-right"><Skeleton className="h-4 w-10 font-mono" /></td>
                  <td className="px-3 py-2.5 text-[#151515] text-right"><Skeleton className="h-4 w-24 font-mono" /></td>
                  <td className="px-3 py-2.5 text-[#151515] text-right"><Skeleton className="h-4 w-20 font-mono font-medium" /></td>
                  <td className="px-3 py-2.5 text-[#151515]"><Skeleton className="h-4 w-20" /></td>
                  <td className="px-3 py-2.5 text-[#5d5d5d] text-sm"><Skeleton className="h-4 w-24" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export function ReputationCardSkeleton() {
  return (
    <div className="p-5 border border-[#333333]/14 bg-white/70 animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div>
            <Skeleton className="h-4 w-32 mb-1" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <Skeleton className="h-5 w-20 rounded" />
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <Skeleton className="h-2 w-32" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-2 w-40 mt-1" />
      </div>

      <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[#333333]/14">
        <div className="text-center">
          <Skeleton className="h-6 w-16 mx-auto mb-1" />
          <Skeleton className="h-2 w-24 mx-auto" />
        </div>
        <div className="text-center">
          <Skeleton className="h-6 w-16 mx-auto mb-1" />
          <Skeleton className="h-2 w-24 mx-auto" />
        </div>
        <div className="text-center">
          <Skeleton className="h-6 w-16 mx-auto mb-1" />
          <Skeleton className="h-2 w-24 mx-auto" />
        </div>
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in animate-slide-up">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3 w-48 mt-1" />
            </CardHeader>
            <CardContent className="p-0">
              <NegotiationTableSkeleton rowCount={3} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-48 mt-1" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <NegotiationCardSkeleton key={i} />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-3 w-48 mt-1" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="p-5 border border-[#333333]/14 bg-white/70 h-32" />
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-3 w-48 mt-1" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-white/50 rounded-lg">
                    <Skeleton className="w-2 h-2 mt-2 rounded-full flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <Skeleton className="h-4 w-48 mb-1" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Error State Components
// ============================================

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ message, onRetry, className }: ErrorStateProps) {
  return (
    <div className={cn('flex items-center gap-3 p-4 bg-[#e03e3e]/5 border border-[#e03e3e]/20 rounded-lg', className)}>
      <AlertCircle className="h-5 w-5 text-[#e03e3e] flex-shrink-0" />
      <p className="text-sm text-[#e03e3e] flex-1">{message}</p>
      {onRetry && (
        <Button variant="ghost" size="sm" onClick={onRetry} className="text-[#e03e3e] hover:bg-[#e03e3e]/10">
          <RefreshCw className="h-4 w-4 mr-1" />
          Retry
        </Button>
      )}
    </div>
  );
}

interface InlineErrorProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function InlineError({ message, onRetry, className }: InlineErrorProps) {
  return (
    <div className={cn('flex items-center gap-3 p-4 bg-[#e03e3e]/5 border border-[#e03e3e]/20 rounded-lg', className)}>
      <AlertCircle className="h-5 w-5 text-[#e03e3e] flex-shrink-0" />
      <p className="text-sm text-[#e03e3e] flex-1">{message}</p>
      {onRetry && (
        <Button variant="ghost" size="sm" onClick={onRetry} className="text-[#e03e3e] hover:bg-[#e03e3e]/10">
          <RefreshCw className="h-4 w-4 mr-1" />
          Retry
        </Button>
      )}
    </div>
  );
}

// ============================================
// Empty State Components
// ============================================

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 px-4 text-center', className)}>
      {icon && <div className="mb-4 text-[#5d5d5d]/50">{icon}</div>}
      <h3 className="text-lg font-medium text-[#151515] mb-2">{title}</h3>
      {description && <p className="text-[#5d5d5d] text-sm max-w-sm mb-4">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function EmptyNegotiations() {
  return (
    <EmptyState
      icon={<Search className="h-12 w-12" />}
      title="No negotiations found"
      description="Try adjusting your filters or create a new intent/offer to start negotiating"
      action={
        <Button>
          <PlusCircle className="h-4 w-4 mr-2" />
          Create Intent/Offer
        </Button>
      }
    />
  );
}

export function EmptyTransactions() {
  return (
    <EmptyState
      icon={<Package className="h-12 w-12" />}
      title="No transactions yet"
      description="Your transaction history will appear here once you complete negotiations"
      action={
        <Button>
          <PlusCircle className="h-4 w-4 mr-2" />
          Create Intent/Offer
        </Button>
      }
    />
  );
}

export function EmptyReputation() {
  return (
    <EmptyState
      icon={<Shield className="h-12 w-12" />}
      title="No reputation data"
      description="Agent reputation scores will appear here after completed deals"
    />
  );
}

export function EmptyActivity() {
  return (
    <EmptyState
      icon={<Activity className="h-12 w-12" />}
      title="No recent activity"
      description="Marketplace activity will appear here as deals are made"
    />
  );
}

// ============================================
// Loading State Components
// ============================================

interface LoadingStateProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LoadingState({ message = 'Loading...', size = 'md', className }: LoadingStateProps) {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  return (
    <div className={cn('flex flex-col items-center justify-center py-8 px-4', className)}>
      <div className="relative">
        <svg className={`${sizes[size]} text-black animate-spin`} viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
      {message && <p className="text-sm text-[#5d5d5d] mt-3">{message}</p>}
    </div>
  );
}

export function InlineLoading({ size = 'sm', className }: { size?: 'sm' | 'md'; className?: string }) {
  const sizes = { sm: 'h-4 w-4', md: 'h-6 w-6' };
  return (
    <svg className={cn(sizes[size], 'animate-spin text-black', className)} viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ============================================
// Service Status Indicator
// ============================================

interface ServiceStatusProps {
  name: string;
  port: number;
  status: 'healthy' | 'degraded' | 'down' | 'checking';
  onRefresh?: () => void;
}

export function ServiceStatus({ name, port, status, onRefresh }: ServiceStatusProps) {
  const statusConfig = {
    healthy: { dotColor: 'bg-[#3fb950]', label: 'Healthy', variant: 'success' as const },
    degraded: { dotColor: 'bg-[#f5a623]', label: 'Degraded', variant: 'warning' as const },
    down: { dotColor: 'bg-[#e03e3e]', label: 'Down', variant: 'error' as const },
    checking: { dotColor: 'bg-[#5d5d5d] animate-pulse', label: 'Checking...', variant: 'default' as const },
  };

  const config = statusConfig[status];

  return (
    <div className="flex items-center justify-between p-3 bg-white/50 border border-[#333333]/14">
      <div className="flex items-center gap-3">
        <div className={cn('w-2 h-2 rounded-full', config.dotColor)} />
        <div>
          <p className="font-medium text-black">{name}</p>
          <p className="text-xs text-[#5d5d5d] font-mono">Port {port}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={config.variant}>{config.label}</Badge>
        {onRefresh && status !== 'checking' && (
          <Button variant="ghost" size="sm" onClick={onRefresh} className="h-8 w-8 p-0" aria-label="Refresh status">
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ============================================
// Connectivity Banner
// ============================================

export function ConnectivityBanner({ isConnected, onRetry }: { isConnected: boolean; onRetry?: () => void }) {
  if (isConnected) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
      <div className="flex items-center gap-3 px-4 py-3 bg-[#e03e3e]/10 border border-[#e03e3e]/30 rounded-lg shadow-lg min-w-[300px]">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#e03e3e] animate-pulse" />
          <span className="text-sm font-medium text-[#e03e3e]">Backend disconnected</span>
        </div>
        <span className="text-xs text-[#5d5d5d] flex-1">Some features may be unavailable</span>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry} className="border-[#e03e3e] text-[#e03e3e]">
            <RefreshCw className="h-3 w-3 mr-1" />
            Reconnect
          </Button>
        )}
      </div>
    </div>
  );
}