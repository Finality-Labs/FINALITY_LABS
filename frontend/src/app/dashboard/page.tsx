/**
 * Finality Labs - Dashboard Page
 * Main dashboard showing overview of negotiations, deals, and activity with live backend integration
 */

'use client';

import * as React from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Handshake,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Users,
  Shield,
  BarChart3,
  PlusCircle,
  RefreshCw,
} from 'lucide-react';
import { useHealthCheck, useBackendConnectivity } from '@/lib/queries';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Table,
  Button,
  Skeleton,
} from '@/components/ui';
import { PageContainer, Section } from '@/components/layout';
import { formatCurrency, formatRelativeTime, truncate, cn } from '@/lib/utils';
import { StatCardSkeleton, NegotiationTableSkeleton, DashboardSkeleton } from '@/components/ui/loading-states';
import Link from "next/link";
// ============================================
// Stats Card
// ============================================

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon: React.ReactNode;
  iconColor: string;
  bgColor: string;
  loading?: boolean;
}

const StatCard = ({ title, value, change, changeLabel, icon, iconColor, bgColor, loading }: StatCardProps) => {
  if (loading) {
    return <StatCardSkeleton />;
  }

  const showChange = change !== undefined;
  const isPositive = change !== undefined && change >= 0;

  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-[#5d5d5d] mb-1">{title}</p>
            <p className="text-2xl sm:text-3xl font-medium text-black">{value}</p>
            {showChange && (
              <div className="flex items-center gap-1 mt-2">
                {isPositive ? (
                  <ArrowUpRight className="h-3 w-3 text-[#3fb950]" />
                ) : (
                  <ArrowDownRight className="h-3 w-3 text-[#e03e3e]" />
                )}
                <span className={`text-xs font-medium ${isPositive ? 'text-[#3fb950]' : 'text-[#e03e3e]'}`}>
                  {isPositive ? '+' : ''}{change!.toFixed(1)}%
                </span>
                <span className="text-xs text-[#5d5d5d]">{changeLabel || 'vs last period'}</span>
              </div>
            )}
          </div>
          <div className={cn('p-3 rounded-lg', bgColor)}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// ============================================
// Recent Negotiations Table
// ============================================

interface NegotiationRow {
  id: string;
  role: 'buyer' | 'seller';
  counterparty: string;
  resource: string;
  qty: number;
  unitPrice: number;
  totalUsdc: number;
  status: 'deal-closed' | 'active' | 'constraint-hit' | 'waiting' | 'error';
  timestamp: number;
  transcriptHash?: string;
}

const RecentNegotiations = ({ negotiations = [], loading = false, onRefresh }: {
  negotiations?: NegotiationRow[];
  loading?: boolean;
  onRefresh?: () => void;
}) => {
  if (loading) {
    return <NegotiationTableSkeleton rowCount={3} />;
  }

  const getStatusBadge = (status: NegotiationRow['status']) => {
    switch (status) {
      case 'deal-closed':
        return <Badge variant="success">Deal Closed</Badge>;
      case 'active':
        return <Badge variant="default">Active</Badge>;
      case 'waiting':
        return <Badge variant="default">Waiting</Badge>;
      case 'constraint-hit':
        return <Badge variant="warning">Constraint Hit</Badge>;
      default:
        return <Badge variant="error">Error</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Recent Negotiations</CardTitle>
            <CardDescription>Your latest negotiation rooms and outcomes</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
            View All
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {negotiations.length === 0 ? (
          <div className="py-8 text-center">
            <Handshake className="h-12 w-12 mx-auto text-[#5d5d5d]/50 mb-3" />
            <p className="text-[#5d5d5d]">No negotiations yet</p>
            <p className="text-xs text-[#5d5d5d]/70 mt-1">Create an intent or offer to start negotiating</p>
          </div>
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>Room ID</Table.Head>
                <Table.Head>Role</Table.Head>
                <Table.Head>Counterparty</Table.Head>
                <Table.Head>Resource</Table.Head>
                <Table.Head className="text-right">Qty</Table.Head>
                <Table.Head className="text-right">Unit Price</Table.Head>
                <Table.Head className="text-right">Total</Table.Head>
                <Table.Head>Status</Table.Head>
                <Table.Head>Time</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {negotiations.map((neg) => (
                <Table.Row key={neg.id}>
                  <Table.Cell className="font-mono text-xs">{truncate(neg.id, 12)}</Table.Cell>
                  <Table.Cell>
                    <Badge variant={neg.role === 'buyer' ? 'default' : 'success'}>
                      {neg.role.charAt(0).toUpperCase() + neg.role.slice(1)}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>{neg.counterparty}</Table.Cell>
                  <Table.Cell>{neg.resource}</Table.Cell>
                  <Table.Cell className="text-right font-mono">{neg.qty}</Table.Cell>
                  <Table.Cell className="text-right font-mono">{formatCurrency(neg.unitPrice, 6)}</Table.Cell>
                  <Table.Cell className="text-right font-mono font-medium">{formatCurrency(neg.totalUsdc, 6)}</Table.Cell>
                  <Table.Cell>{getStatusBadge(neg.status)}</Table.Cell>
                  <Table.Cell className="text-[#5d5d5d] text-sm">{formatRelativeTime(neg.timestamp)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

// ============================================
// Active Deals
// ============================================

interface ActiveDeal {
  id: string;
  counterparty: string;
  resource: string;
  qty: number;
  unitPrice: number;
  round: number;
  maxRounds: number;
  status: 'active' | 'waiting';
}

const ActiveDeals = ({ deals = [], loading = false }: { deals?: ActiveDeal[]; loading?: boolean }) => {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Active Negotiations</CardTitle>
          <CardDescription>Negotiations currently in progress</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="p-4 border border-[#333333]/14 bg-white/50 animate-pulse">
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-2 w-48" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active Negotiations</CardTitle>
        <CardDescription>Negotiations currently in progress</CardDescription>
      </CardHeader>
      <CardContent>
        {deals.length === 0 ? (
          <div className="py-8 text-center">
            <Handshake className="h-12 w-12 mx-auto text-[#5d5d5d]/50 mb-3" />
            <p className="text-[#5d5d5d]">No active negotiations</p>
            <p className="text-xs text-[#5d5d5d]/70 mt-1">Create an intent or offer to start negotiating</p>
          </div>
        ) : (
          <div className="space-y-4">
            {deals.map((deal) => (
              <div key={deal.id} className="p-4 border border-[#333333]/14 bg-white/50">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-black/5 rounded-lg">
                      <Activity className="h-5 w-5 text-black" />
                    </div>
                    <div>
                      <p className="font-medium text-black">{deal.resource}</p>
                      <p className="text-sm text-[#5d5d5d]">vs {deal.counterparty} • Round {deal.round}/{deal.maxRounds}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-black">{formatCurrency(deal.unitPrice, 6)} / unit</p>
                    <p className="text-sm text-[#5d5d5d]">{deal.qty} units • {formatCurrency(deal.unitPrice * deal.qty, 6)} total</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex-1 h-2 bg-[#333333]/14 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-black transition-all duration-500"
                      style={{ width: `${(deal.round / deal.maxRounds) * 100}%` }}
                    />
                  </div>
                  <Badge variant="default">Round {deal.round} of {deal.maxRounds}</Badge>
                  <Button variant="outline" size="sm">View Room</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ============================================
// Quick Actions
// ============================================

const QuickActions = () => {
  const actions = [
    {
      title: 'Create Buyer Intent',
      description: 'Post a new buy intent for GPU compute',
      icon: <TrendingUp className="h-5 w-5" />,
      href: '/create?type=intent',
      color: 'bg-[#3fb950]/10 text-[#3fb950]',
    },
    {
      title: 'Create Seller Offer',
      description: 'List your GPU resources for sale',
      icon: <TrendingDown className="h-5 w-5" />,
      href: '/create?type=offer',
      color: 'bg-[#f5a623]/10 text-[#f5a623]',
    },
    {
      title: 'View Negotiations',
      description: 'Manage active and past negotiations',
      icon: <Handshake className="h-5 w-5" />,
      href: '/negotiations',
      color: 'bg-black/10 text-black',
    },
    {
      title: 'Check Reputation',
      description: 'View your reputation score and history',
      icon: <Shield className="h-5 w-5" />,
      href: '/reputation',
      color: 'bg-[#e03e3e]/10 text-[#e03e3e]',
    },
  ];

  return (
    <Section title="Quick Actions" description="Common tasks to get started">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {actions.map((action) => (
          <a
            key={action.title}
            href={action.href}
            className="group p-5 border border-[#333333]/14 bg-white/70 hover:bg-white hover:border-black/30 transition-all duration-200"
          >
            <div className={cn('p-3 rounded-lg w-fit mb-4', action.color)}>
              {action.icon}
            </div>
            <h3 className="font-medium text-black mb-1 group-hover:text-black/80">{action.title}</h3>
            <p className="text-sm text-[#5d5d5d]">{action.description}</p>
          </a>
        ))}
      </div>
    </Section>
  );
};

// ============================================
// Service Status
// ============================================

const ServiceStatus = () => {
  const { isConnected, health, chainMode, isLoading, isError, error, refetch } = useBackendConnectivity();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Service Status</CardTitle>
          <CardDescription>Backend service health</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { name: 'Intake API', port: 3001 },
              { name: 'Negotiation WS', port: 3002 },
              { name: 'Chain/Settlement', port: 3003 },
            ].map((service) => (
              <div key={service.name} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-2 h-2 rounded-full" />
                  <span className="text-sm font-medium text-black">{service.name}</span>
                  <Badge variant="default" className="text-xs">:{service.port}</Badge>
                </div>
                <Skeleton className="h-5 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const services = health?.services ? [
    { name: 'Intake API', port: health.services.intake, status: health.ok ? 'healthy' as const : 'down' as const },
    { name: 'Negotiation WS', port: health.services.negotiate, status: health.ok ? 'healthy' as const : 'down' as const },
    { name: 'Chain/Settlement', port: health.services.chain, status: health.ok ? 'healthy' as const : 'down' as const },
  ] : [
    { name: 'Intake API', port: 3001, status: 'down' as const },
    { name: 'Negotiation WS', port: 3002, status: 'down' as const },
    { name: 'Chain/Settlement', port: 3003, status: 'down' as const },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Service Status</CardTitle>
            <CardDescription>Backend service health</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={refetch} disabled={isLoading}>
            <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {services.map((service) => (
            <div key={service.name} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn('w-2 h-2 rounded-full', service.status === 'healthy' ? 'bg-[#3fb950]' : 'bg-[#e03e3e]')} />
                <span className="text-sm font-medium text-black">{service.name}</span>
                <Badge variant="default" className="text-xs">:{service.port}</Badge>
              </div>
              <Badge variant={service.status === 'healthy' ? 'success' : 'error'}>
                {service.status}
              </Badge>
            </div>
          ))}
          {chainMode && (
            <div className="pt-3 border-t border-[#333333]/14">
              <p className="text-xs text-[#5d5d5d] mb-1">Chain Mode: <span className="font-mono capitalize">{chainMode.mode}</span> ({chainMode.network})</p>
              {chainMode.liveReady && <Badge variant="success" className="text-xs">Live Ready</Badge>}
              {!chainMode.liveReady && chainMode.reason && <Badge variant="default" className="text-xs">{chainMode.reason}</Badge>}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// ============================================
// Recent Activity
// ============================================

interface ActivityItem {
  type: string;
  message: string;
  time: string;
  variant: 'success' | 'default';
}

const RecentActivity = ({ activities = [], loading = false }: { activities?: ActivityItem[]; loading?: boolean }) => {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest marketplace events</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-white/50 rounded-lg animate-pulse">
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
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>Latest marketplace events</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {activities.length === 0 ? (
            <div className="py-8 text-center text-[#5d5d5d]">No recent activity</div>
          ) : (
            activities.map((activity, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-white/50 rounded-lg">
                <div className={cn('w-2 h-2 mt-2 rounded-full flex-shrink-0', activity.variant === 'success' ? 'bg-[#3fb950]' : 'bg-[#5d5d5d]')} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-black">{activity.message}</p>
                  <p className="text-xs text-[#5d5d5d] mt-0.5">{activity.time}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// ============================================
// Dashboard Page
// ============================================

export default function DashboardPage() {
  const { data: healthData, isLoading: healthLoading, refetch: refetchHealth } = useHealthCheck();
  const { isConnected, chainMode, isLoading: connectivityLoading, isError, refetch: refetchConnectivity } = useBackendConnectivity();

  // Fetch dashboard stats from health/chain data or use defaults
  const stats = React.useMemo(() => {
    // In a real app, this would come from a dedicated dashboard stats endpoint
    // For now, we'll derive from available data or use sensible defaults
    return {
      totalVolume: 125.45,
      totalDeals: 47,
      avgDealSize: 2.67,
      successRate: 94.2,
      activeNegotiations: healthData?.ok ? 3 : 0,
      reputationScore: 0.87,
    };
  }, [healthData]);

  const recentNegotiations = React.useMemo<NegotiationRow[]>(() => [
    {
      id: 'room_abc123def456',
      role: 'buyer',
      counterparty: '2',
      resource: 'GPU H100',
      qty: 10,
      unitPrice: 0.00018,
      totalUsdc: 0.0018,
      status: 'deal-closed' as const,
      timestamp: Date.now() - 1000 * 60 * 30,
      transcriptHash: '0xabc123def456789...',
    },
    {
      id: 'room_def456ghi789',
      role: 'seller',
      counterparty: '1',
      resource: 'GPU A100',
      qty: 5,
      unitPrice: 0.00015,
      totalUsdc: 0.00075,
      status: 'active' as const,
      timestamp: Date.now() - 1000 * 60 * 15,
    },
    {
      id: 'room_ghi789jkl012',
      role: 'buyer',
      counterparty: '3',
      resource: 'GPU H100',
      qty: 20,
      unitPrice: 0.00018,
      totalUsdc: 0.0036,
      status: 'constraint-hit' as const,
      timestamp: Date.now() - 1000 * 60 * 60 * 2,
      transcriptHash: '0xghi789jkl012345...',
    },
  ], []);

  const activeDeals = React.useMemo<ActiveDeal[]>(() => [
    {
      id: 'room_def456ghi789',
      counterparty: '1',
      resource: 'GPU A100',
      qty: 5,
      unitPrice: 0.00015,
      round: 3,
      maxRounds: 10,
      status: 'active' as const,
    },
  ], []);

  const recentActivity = React.useMemo<ActivityItem[]>(() => [
    { type: 'deal_closed', message: 'Deal closed with Agent #2', time: '5 min ago', variant: 'success' as const },
    { type: 'negotiation_started', message: 'Negotiation started for GPU H100', time: '15 min ago', variant: 'default' as const },
    { type: 'offer_created', message: 'New offer posted: GPU A100 x10', time: '1 hour ago', variant: 'default' as const },
    { type: 'reputation_updated', message: 'Reputation score increased to 87%', time: '3 hours ago', variant: 'success' as const },
  ], []);

  const handleRefresh = () => {
    refetchHealth();
    refetchConnectivity();
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageContainer
        title="Dashboard"
        description="Overview of your negotiations, deals, and marketplace activity"
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={connectivityLoading || healthLoading}>
              <RefreshCw className={cn('h-4 w-4 mr-2', (connectivityLoading || healthLoading) && 'animate-spin')} />
              Refresh
            </Button>
            <Link href="/create">
  <Button>
    <PlusCircle className="h-4 w-4 mr-2" />
    Create Intent/Offer
  </Button>
</Link>
          </div>
        }
      />

      {/* Connectivity Banner */}
      <div className="fixed bottom-4 right-4 z-50 pointer-events-none">
        {!isConnected && !connectivityLoading && (
          <div className="flex items-center gap-3 px-4 py-3 bg-[#e03e3e]/10 border border-[#e03e3e]/30 rounded-lg shadow-lg min-w-[300px] pointer-events-auto animate-slide-up">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#e03e3e] animate-pulse" />
              <span className="text-sm font-medium text-[#e03e3e]">Backend disconnected</span>
            </div>
            <span className="text-xs text-[#5d5d5d] flex-1">Some features may be unavailable</span>
            <Button size="sm" variant="outline" onClick={handleRefresh} className="border-[#e03e3e] text-[#e03e3e]">
              <RefreshCw className="h-3 w-3 mr-1" />
              Reconnect
            </Button>
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-2">
        <StatCard
          title="Total Volume (USDC)"
          value={formatCurrency(stats.totalVolume, 2)}
          change={12.5}
          changeLabel="vs last month"
          icon={<DollarSign className="h-6 w-6 text-white" />}
          iconColor="text-white"
          bgColor="bg-black text-white"
        />
        <StatCard
          title="Total Deals"
          value={stats.totalDeals}
          change={8.2}
          changeLabel="vs last month"
          icon={<Handshake className="h-6 w-6 text-white" />}
          iconColor="text-white"
          bgColor="bg-black text-white"
        />
        <StatCard
          title="Avg Deal Size"
          value={formatCurrency(stats.avgDealSize, 4)}
          change={-2.1}
          changeLabel="vs last month"
          icon={<BarChart3 className="h-6 w-6 text-white" />}
          iconColor="text-white"
          bgColor="bg-black text-white"
        />
        <StatCard
          title="Success Rate"
          value={`${stats.successRate}%`}
          change={1.5}
          changeLabel="vs last month"
          icon={<Shield className="h-6 w-6 text-white" />}
          iconColor="text-white"
          bgColor="bg-black text-white"
        />
        <StatCard
          title="Active Negotiations"
          value={stats.activeNegotiations}
          change={0}
          changeLabel="current"
          icon={<Activity className="h-6 w-6 text-[#3fb950]" />}
          iconColor="text-[#3fb950]"
          bgColor="bg-[#3fb950]/10"
        />
        <StatCard
          title="Reputation Score"
          value={`${(stats.reputationScore * 100).toFixed(0)}%`}
          change={3.2}
          changeLabel="vs last month"
          icon={<Users className="h-6 w-6 text-[#f5a623]" />}
          iconColor="text-[#f5a623]"
          bgColor="bg-[#f5a623]/10"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Active & Recent */}
        <div className="lg:col-span-2 space-y-6">
          <ActiveDeals deals={activeDeals} loading={healthLoading} />
          <RecentNegotiations
            negotiations={recentNegotiations}
            loading={healthLoading}
            onRefresh={handleRefresh}
          />
        </div>

        {/* Right Column - Quick Actions & Status */}
        <div className="space-y-6">
          <QuickActions />
          <ServiceStatus />
          <RecentActivity activities={recentActivity} loading={healthLoading} />
        </div>
      </div>
    </div>
  );
}