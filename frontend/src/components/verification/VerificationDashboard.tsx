/**
 * Finality Labs - Verification Dashboard Component
 * Main dashboard component for managing and monitoring verifications
 */

'use client';

import * as React from 'react';
import {
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Download,
  Eye,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn, formatRelativeTime, truncate } from '@/lib/utils';
import {
  useVerifications,
  useVerification,
} from '@/lib/queries';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  Input,
  Select,
  Badge,
  Table,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Separator,
  Skeleton,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  VerificationStatusBadge,
} from '@/components/ui';
import {
  VerificationCard,
  VerificationTimeline,
  VerificationActionButtons,
} from '@/components/verification';
import type { VerificationStatus, VerificationDashboardView, VerificationListResponse } from '@/types/api';

const statusOptions: { value: string; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'seller_completed', label: 'Seller Completed' },
  { value: 'waiting_for_buyer', label: 'Waiting for Buyer' },
  { value: 'verified', label: 'Verified' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'disputed', label: 'Disputed' },
  { value: 'error', label: 'Error' },
];

const sortOptions = [
  { value: 'createdAt-desc', label: 'Newest First' },
  { value: 'createdAt-asc', label: 'Oldest First' },
  { value: 'totalUsdc-desc', label: 'Highest Value' },
  { value: 'totalUsdc-asc', label: 'Lowest Value' },
  { value: 'status-asc', label: 'Status (A-Z)' },
];

interface VerificationDashboardProps {
  currentUserRole?: 'buyer' | 'seller' | 'admin';
  currentUserAgentId?: string;
}

// Convert VerificationDashboardView to VerificationResult format for components
function convertToVerificationResult(v: VerificationDashboardView) {
  // Map API status format (underscores) to frontend format (hyphens)
  const mapStatus = (status: string) => status.replace('_', '-');
  
  return {
    request: {
      requestId: v.requestId,
      roomId: v.roomId,
      transcriptHash: v.transcriptHash,
      deal: v.deal,
      context: {},
      createdAt: v.createdAt,
    },
    verdicts: v.verdicts.map(verdict => ({
      ...verdict,
      status: mapStatus(verdict.status) as any,
    })),
    finalStatus: mapStatus(v.currentStatus) as any,
    passed: v.currentStatus === 'verified',
    startedAt: v.createdAt,
    completedAt: v.finalVerdictAt || v.createdAt,
  };
}

export function VerificationDashboard({
  currentUserRole = 'buyer',
  currentUserAgentId = 'current-agent',
}: VerificationDashboardProps) {
  const [page, setPage] = React.useState(1);
  const pageSize = 20;
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [sortBy, setSortBy] = React.useState('createdAt-desc');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedRequestId, setSelectedRequestId] = React.useState<string | null>(null);
  const [detailView, setDetailView] = React.useState<'card' | 'timeline'>('card');

  const { data: listData, isLoading: listLoading, refetch: refetchList } = useVerifications(
    page,
    pageSize,
    statusFilter === 'all' ? undefined : statusFilter as VerificationStatus,
    currentUserAgentId
  );

  const { data: detailData, isLoading: detailLoading } = useVerification(
    selectedRequestId || '',
    { enabled: !!selectedRequestId }
  );

  const verifications = listData?.verifications || [];
  const total = listData?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  const convertedDetailData = detailData ? convertToVerificationResult(detailData) : null;

  const filteredVerifications = React.useMemo(() => {
    let result = verifications;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((v) =>
        v.requestId.toLowerCase().includes(query) ||
        v.roomId.toLowerCase().includes(query) ||
        v.deal.buyer.agentId.toLowerCase().includes(query) ||
        v.deal.seller.agentId.toLowerCase().includes(query) ||
        v.transcriptHash.toLowerCase().includes(query)
      );
    }

    // Sort
    const [field, direction] = sortBy.split('-') as ['createdAt' | 'totalUsdc' | 'status', 'asc' | 'desc'];
    result = [...result].sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (field) {
        case 'createdAt':
          aVal = new Date(a.createdAt).getTime();
          bVal = new Date(b.createdAt).getTime();
          break;
        case 'totalUsdc':
          aVal = a.deal.totalUsdc;
          bVal = b.deal.totalUsdc;
          break;
        case 'status':
          aVal = a.currentStatus;
          bVal = b.currentStatus;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return direction === 'asc' ? 1 : -1;
      return 0;
    });

    // Convert to VerificationResult format for components
    return result.map(convertToVerificationResult);
  }, [verifications, searchQuery, sortBy]);

  const handleSelectVerification = (requestId: string) => {
    setSelectedRequestId(requestId);
  };

  const handleCloseDetail = () => {
    setSelectedRequestId(null);
  };

  const handleStatusChange = () => {
    refetchList();
  };

  const statusCounts = React.useMemo(() => {
    return verifications.reduce((acc, v) => {
      acc[v.currentStatus] = (acc[v.currentStatus] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [verifications]);

  return (
    <div className="space-y-6">
      {/* Header with Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-normal text-black">Verification Dashboard</h1>
          <p className="text-[#5d5d5d] mt-1">
            Monitor and manage verification requests across all deals
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5d5d5d]" />
            <Input
              placeholder="Search verifications..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 pl-10"
            />
          </div>

          <Select
            value={statusFilter}
            onValueChange={setStatusFilter}
            options={statusOptions}
            placeholder="Filter by status"
            className="w-48"
          />

          <Select
            value={sortBy}
            onValueChange={setSortBy}
            options={sortOptions}
            placeholder="Sort by"
            className="w-40"
          />

          <Button
            variant="outline"
            onClick={() => refetchList()}
            disabled={listLoading}
            className="gap-2"
          >
            <RefreshCw className={cn('h-4 w-4', listLoading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Status Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {([
          { key: 'all', label: 'Total', count: total, color: 'text-black' },
          { key: 'pending', label: 'Pending', count: statusCounts.pending || 0, color: 'text-[#f5a623]' },
          { key: 'seller_completed', label: 'Seller Done', count: statusCounts.seller_completed || 0, color: 'text-[#3fb950]' },
          { key: 'waiting_for_buyer', label: 'Awaiting Buyer', count: statusCounts.waiting_for_buyer || 0, color: 'text-[#0070f3]' },
          { key: 'verified', label: 'Verified', count: statusCounts.verified || 0, color: 'text-[#3fb950]' },
          { key: 'rejected', label: 'Rejected', count: statusCounts.rejected || 0, color: 'text-[#e03e3e]' },
          { key: 'disputed', label: 'Disputed', count: statusCounts.disputed || 0, color: 'text-[#e03e3e]' },
          { key: 'error', label: 'Error', count: statusCounts.error || 0, color: 'text-[#5d5d5d]' },
        ]).map((stat) => (
          <Card key={stat.key} className="text-center py-3">
            <CardContent className="pt-4 pb-3">
              <p className="text-2xl font-medium" style={{ color: stat.color }}>{stat.count}</p>
              <p className="text-xs text-[#5d5d5d] uppercase tracking-wider mt-1">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* List View */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Verification Requests</CardTitle>
              <CardDescription>
                {filteredVerifications.length} of {total} verifications
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {listLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <VerificationCard key={i} verification={null as any} compact loading />
                  ))}
                </div>
              ) : filteredVerifications.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="h-12 w-12 mx-auto text-[#5d5d5d]/50 mb-3" />
                  <p className="text-[#5d5d5d]">No verifications found</p>
                  <p className="text-xs text-[#5d5d5d]/70 mt-1">
                    {searchQuery || statusFilter !== 'all'
                      ? 'Try adjusting your filters'
                      : 'No verification requests yet'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredVerifications.map((verification) => (
                    <VerificationCard
                      key={verification.request.requestId}
                      verification={verification}
                      onClick={() => handleSelectVerification(verification.request.requestId)}
                      compact
                      role={currentUserRole}
                    />
                  ))}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-[#333333]/14">
                  <p className="text-sm text-[#5d5d5d]">
                    Page {page} of {totalPages} • {total} total
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Detail View / Sidebar */}
        <div className="lg:col-span-1">
          {selectedRequestId && convertedDetailData ? (
            <div className="space-y-4">
              {/* Detail Header */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="font-mono text-lg truncate">{convertedDetailData.request.requestId}</CardTitle>
                      <CardDescription>
                        Room: <span className="font-mono text-sm">{truncate(convertedDetailData.request.roomId, 20)}</span>
                      </CardDescription>
                    </div>
                    <VerificationStatusBadge status={convertedDetailData.finalStatus} size="md" />
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    <div className="flex items-center gap-4 text-sm text-[#5d5d5d]">
                      <span className="flex items-center gap-1">
                        <span className="font-mono text-black">{convertedDetailData.request.deal.totalUsdc.toFixed(6)}</span>
                        USDC
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-[#5d5d5d]">Buyer</p>
                        <p className="font-mono truncate">{convertedDetailData.request.deal.buyer.agentId}</p>
                      </div>
                      <div>
                        <p className="text-[#5d5d5d]">Seller</p>
                        <p className="font-mono truncate">{convertedDetailData.request.deal.seller.agentId}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Tabs for Detail Views */}
              <Tabs defaultValue="card" onValueChange={(v) => setDetailView(v as 'card' | 'timeline')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="card">Overview</TabsTrigger>
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                </TabsList>

                <TabsContent value="card">
                  <VerificationCard
                    verification={convertedDetailData}
                    role={currentUserRole}
                  />
                  <VerificationActionButtons
                    verification={convertedDetailData}
                    currentUserRole={currentUserRole}
                    currentUserAgentId={currentUserAgentId}
                    onStatusChange={handleStatusChange}
                  />
                </TabsContent>

                <TabsContent value="timeline">
                  <VerificationTimeline
                    verification={convertedDetailData}
                    currentUserRole={currentUserRole}
                    currentUserAgentId={currentUserAgentId}
                  />
                  <VerificationActionButtons
                    verification={convertedDetailData}
                    currentUserRole={currentUserRole}
                    currentUserAgentId={currentUserAgentId}
                    onStatusChange={handleStatusChange}
                  />
                </TabsContent>
              </Tabs>

              {/* Close Button */}
              <Button
                variant="ghost"
                className="w-full"
                onClick={handleCloseDetail}
              >
                Back to List
              </Button>
            </div>
          ) : selectedRequestId && detailLoading ? (
            <Card>
              <CardContent className="py-12">
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-4 w-full" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <div className="h-16 w-16 mx-auto text-[#5d5d5d]/50 mb-4" />
                <h3 className="font-medium text-black mb-1">Select a Verification</h3>
                <p className="text-sm text-[#5d5d5d]">
                  Click on a verification request to view details and take actions
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}