/**
 * Finality Labs - Transaction History Page
 * Complete transaction history with filtering and export
 */

'use client';

import * as React from 'react';
import { useState } from 'react';
import { Search, Filter, Download, ChevronDown, ChevronUp, ExternalLink, Loader2, Calendar, DollarSign, Hash, Users, X } from 'lucide-react';
import { intakeApi, chainApi } from '@/lib/api';
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
  Avatar,
  EmptyState,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui';
import { PageContainer, Section } from '@/components/layout';
import { formatCurrency, formatRelativeTime, formatTimestamp, truncate, cn } from '@/lib/utils';

// ============================================
// Types
// ============================================

interface Transaction {
  id: string;
  roomId: string;
  role: 'buyer' | 'seller';
  counterparty: string;
  counterpartyWallet: string;
  resource: string;
  qty: number;
  unitPrice: number;
  totalUsdc: number;
  terms: string;
  status: 'completed' | 'failed' | 'pending' | 'settling';
  txHash?: string;
  explorerUrl?: string;
  transcriptHash?: string;
  settledAt?: number;
  createdAt: number;
  settlementMode: 'mock' | 'live';
  reputationChange?: {
    buyer: number;
    seller: number;
  };
}

// Mock transaction data
const mockTransactions: Transaction[] = [
  {
    id: 'tx_abc123',
    roomId: 'room_abc123def456',
    role: 'buyer',
    counterparty: '2',
    counterpartyWallet: '0x2222222222222222222222222222222222222222',
    resource: 'GPU H100',
    qty: 10,
    unitPrice: 0.00018,
    totalUsdc: 0.0018,
    terms: 'per-hour billing',
    status: 'completed',
    txHash: '0xabc123def456789abcdef123456789abcdef123456789abcdef123456789abcdef',
    explorerUrl: 'https://explorer.testnet3.goat.network/tx/0xabc123def456789abcdef123456789abcdef123456789abcdef123456789abcdef',
    transcriptHash: '0xabc123def456789...',
    settledAt: Date.now() - 1000 * 60 * 60 * 2,
    createdAt: Date.now() - 1000 * 60 * 60 * 3,
    settlementMode: 'mock',
    reputationChange: { buyer: 1, seller: 1 },
  },
  {
    id: 'tx_def456',
    roomId: 'room_def456ghi789',
    role: 'seller',
    counterparty: '1',
    counterpartyWallet: '0x1111111111111111111111111111111111111111',
    resource: 'GPU A100',
    qty: 5,
    unitPrice: 0.00015,
    totalUsdc: 0.00075,
    terms: 'per-hour billing',
    status: 'completed',
    txHash: '0xdef456ghi789abcdef123456789abcdef123456789abcdef123456789abcdef1234',
    explorerUrl: 'https://explorer.testnet3.goat.network/tx/0xdef456ghi789abcdef123456789abcdef123456789abcdef123456789abcdef1234',
    transcriptHash: '0xdef456ghi789abc...',
    settledAt: Date.now() - 1000 * 60 * 60 * 24,
    createdAt: Date.now() - 1000 * 60 * 60 * 25,
    settlementMode: 'mock',
    reputationChange: { buyer: 1, seller: 1 },
  },
  {
    id: 'tx_ghi789',
    roomId: 'room_ghi789jkl012',
    role: 'buyer',
    counterparty: 'CloudProviderBeta',
    counterpartyWallet: '0x3333333333333333333333333333333333333333',
    resource: 'GPU H100',
    qty: 20,
    unitPrice: 0.00018,
    totalUsdc: 0.0036,
    terms: 'per-hour billing',
    status: 'failed',
    transcriptHash: '0xghi789jkl012345...',
    createdAt: Date.now() - 1000 * 60 * 60 * 48,
    settlementMode: 'mock',
  },
  {
    id: 'tx_jkl012',
    roomId: 'room_jkl012mno345',
    role: 'seller',
    counterparty: 'AIStartupGamma',
    counterpartyWallet: '0x4444444444444444444444444444444444444444',
    resource: 'GPU V100',
    qty: 8,
    unitPrice: 0.00012,
    totalUsdc: 0.00096,
    terms: 'per-hour billing with maintenance',
    status: 'pending',
    transcriptHash: '0xjkl012mno345678...',
    createdAt: Date.now() - 1000 * 60 * 60 * 72,
    settlementMode: 'mock',
  },
  {
    id: 'tx_mno345',
    roomId: 'room_mno345pqr678',
    role: 'buyer',
    counterparty: 'DataCenterDelta',
    counterpartyWallet: '0x5555555555555555555555555555555555555555',
    resource: 'GPU A100',
    qty: 15,
    unitPrice: 0.00016,
    totalUsdc: 0.0024,
    terms: 'per-hour billing',
    status: 'completed',
    txHash: '0xmno345pqr678abcdef123456789abcdef123456789abcdef123456789abcdef1234',
    explorerUrl: 'https://explorer.testnet3.goat.network/tx/0xmno345pqr678abcdef123456789abcdef123456789abcdef123456789abcdef1234',
    transcriptHash: '0xmno345pqr678abc...',
    settledAt: Date.now() - 1000 * 60 * 60 * 24 * 7,
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 8,
    settlementMode: 'live',
    reputationChange: { buyer: 1, seller: 1 },
  },
];

const STATUS_COLORS = {
  completed: 'success',
  failed: 'error',
  pending: 'warning',
  settling: 'default',
} as const;

const STATUS_LABELS = {
  completed: 'Completed',
  failed: 'Failed',
  pending: 'Pending',
  settling: 'Settling',
} as const;

// ============================================
// Transaction Detail Modal
// ============================================

const TransactionDetail = ({ transaction, onClose }: { transaction: Transaction | null; onClose: () => void }) => {
  if (!transaction) return null;

  const statusConfig = {
    completed: { label: 'Completed', variant: 'success' as const },
    failed: { label: 'Failed', variant: 'error' as const },
    pending: { label: 'Pending', variant: 'warning' as const },
    settling: { label: 'Settling', variant: 'default' as const },
  };

  const config = statusConfig[transaction.status];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-none w-full max-w-2xl max-h-[90vh] overflow-hidden animate-scale-in" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#333333]/14">
          <div>
            <h2 className="font-serif text-xl font-medium text-black">{transaction.resource} Transaction</h2>
            <p className="text-sm text-[#5d5d5d]">TX: {truncate(transaction.id, 20)}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-black/5 rounded transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* Status Badge */}
          <div className="flex items-center gap-3 mb-6">
            <StatusBadge status={transaction.status === 'completed' ? 'success' : transaction.status === 'failed' ? 'error' : transaction.status === 'pending' ? 'warning' : 'connecting'} label={config.label} />
            <Badge variant={transaction.settlementMode === 'live' ? 'success' : 'default'}>
              {transaction.settlementMode === 'live' ? 'Live Settlement' : 'Mock Settlement'}
            </Badge>
          </div>

          {/* Main Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <DetailField label="Role" value={transaction.role.charAt(0).toUpperCase() + transaction.role.slice(1)} icon={<Users className="h-4 w-4" />} />
            <DetailField label="Counterparty" value={transaction.counterparty} icon={<Users className="h-4 w-4" />} />
            <DetailField label="Resource" value={transaction.resource} icon={<Hash className="h-4 w-4" />} />
            <DetailField label="Quantity" value={transaction.qty.toString()} icon={<Hash className="h-4 w-4" />} />
            <DetailField label="Unit Price" value={formatCurrency(transaction.unitPrice, 6)} icon={<DollarSign className="h-4 w-4" />} />
            <DetailField label="Total USDC" value={formatCurrency(transaction.totalUsdc, 6)} icon={<DollarSign className="h-4 w-4" />} />
          </div>

          {/* Terms */}
          <div className="mb-4 p-3 bg-white/50 border border-[#333333]/14">
            <p className="text-xs text-[#5d5d5d] mb-1">Terms</p>
            <p className="font-mono text-sm">{transaction.terms}</p>
          </div>

          {/* Settlement Info */}
          {transaction.status === 'completed' && transaction.txHash && (
            <div className="mb-4 p-4 bg-[#3fb950]/10 border border-[#3fb950]">
              <h3 className="font-medium text-[#3fb950] mb-3 flex items-center gap-2">
                <ExternalLink className="h-4 w-4" />
                Settlement Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <DetailField label="Transaction Hash" value={transaction.txHash} copyable />
                {transaction.explorerUrl && (
                  <div className="sm:col-span-2">
                    <p className="text-xs text-[#5d5d5d] mb-1">Explorer</p>
                    <a href={transaction.explorerUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-[#3fb950] hover:underline flex items-center gap-1">
                      View on Explorer
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
                <DetailField label="Settled At" value={transaction.settledAt ? formatTimestamp(transaction.settledAt) : 'N/A'} icon={<Calendar className="h-4 w-4" />} />
                <DetailField label="Mode" value={transaction.settlementMode} icon={<Hash className="h-4 w-4" />} />
              </div>
            </div>
          )}

          {/* Transcript Hash */}
          {transaction.transcriptHash && (
            <div className="mb-4 p-3 bg-white/50 border border-[#333333]/14">
              <p className="text-xs text-[#5d5d5d] mb-1">Transcript Hash</p>
              <p className="font-mono text-xs break-all">{transaction.transcriptHash}</p>
            </div>
          )}

          {/* Reputation Change */}
          {transaction.reputationChange && (
            <div className="mb-4 p-4 bg-[#f5a623]/10 border border-[#f5a623]">
              <h3 className="font-medium text-[#f5a623] mb-3 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Reputation Change
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-white/50 rounded">
                  <p className="text-xs text-[#5d5d5d]">Buyer</p>
                  <p className="text-2xl font-medium text-[#3fb950]">+{transaction.reputationChange.buyer}</p>
                </div>
                <div className="text-center p-3 bg-white/50 rounded">
                  <p className="text-xs text-[#5d5d5d]">Seller</p>
                  <p className="text-2xl font-medium text-[#3fb950]">+{transaction.reputationChange.seller}</p>
                </div>
              </div>
            </div>
          )}

          {/* Timeline */}
          <h3 className="font-medium mb-3">Timeline</h3>
          <div className="space-y-3">
            <TimelineEvent
              label="Transaction Created"
              time={formatRelativeTime(transaction.createdAt)}
              timestamp={formatTimestamp(transaction.createdAt)}
              icon={<Hash className="h-4 w-4" />}
              color="bg-black"
            />
            {transaction.status !== 'pending' && (
              <TimelineEvent
                label="Negotiation Completed"
                time={formatRelativeTime(transaction.createdAt + 1000 * 60 * 10)}
                timestamp={formatTimestamp(transaction.createdAt + 1000 * 60 * 10)}
                icon={<Users className="h-4 w-4" />}
                color="bg-[#3fb950]"
              />
            )}
            {transaction.status === 'completed' && transaction.settledAt && (
              <TimelineEvent
                label="Settlement Confirmed"
                time={formatRelativeTime(transaction.settledAt)}
                timestamp={formatTimestamp(transaction.settledAt)}
                icon={<DollarSign className="h-4 w-4" />}
                color="bg-[#3fb950]"
              />
            )}
            {transaction.status === 'failed' && (
              <TimelineEvent
                label="Transaction Failed"
                time={formatRelativeTime(transaction.createdAt + 1000 * 60 * 30)}
                timestamp={formatTimestamp(transaction.createdAt + 1000 * 60 * 30)}
                icon={<X className="h-4 w-4" />}
                color="bg-[#e03e3e]"
              />
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-[#333333]/14">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          {transaction.txHash && transaction.explorerUrl && (
            <a href={transaction.explorerUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline">
                <ExternalLink className="h-4 w-4 mr-2" />
                View on Explorer
              </Button>
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

const DetailField = ({ label, value, icon, copyable }: { label: string; value: string; icon?: React.ReactNode; copyable?: boolean }) => (
  <div className="p-3 bg-white/50 border border-[#333333]/14">
    <div className="flex items-center gap-2 text-xs text-[#5d5d5d] mb-1">
      {icon}
      {label}
    </div>
    <div className="flex items-center gap-2">
      <p className="font-mono text-sm break-all flex-1">{value}</p>
      {copyable && (
        <button className="p-1 hover:bg-black/5 rounded transition-colors" aria-label="Copy to clipboard">
          <ExternalLink className="h-4 w-4" />
        </button>
      )}
    </div>
  </div>
);

const TimelineEvent = ({ label, time, timestamp, icon, color }: { label: string; time: string; timestamp: string; icon: React.ReactNode; color: string }) => (
  <div className="flex items-start gap-3 p-3 bg-white/50 border border-[#333333]/14">
    <div className={cn('w-2 h-2 mt-1.5 rounded-full flex-shrink-0', color)} />
    <div className="flex-1">
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-[#5d5d5d]">{time}</p>
      <p className="text-xs text-[#5d5d5d]/70 font-mono mt-0.5">{timestamp}</p>
    </div>
  </div>
);

// ============================================
// Transaction Row Component
// ============================================

const TransactionRow = ({ transaction, onClick }: { transaction: Transaction; onClick: () => void }) => (
  <Table.Row onClick={onClick} className="cursor-pointer hover:bg-black/[0.02]">
    <Table.Cell className="font-mono text-xs">{truncate(transaction.id, 14)}</Table.Cell>
    <Table.Cell>
      <Badge variant={transaction.role === 'buyer' ? 'default' : 'success'}>
        {transaction.role.charAt(0).toUpperCase() + transaction.role.slice(1)}
      </Badge>
    </Table.Cell>
    <Table.Cell>
      <div>
        <p className="font-medium text-black">{transaction.counterparty}</p>
        <p className="text-xs text-[#5d5d5d] font-mono">{truncate(transaction.counterpartyWallet, 10)}</p>
      </div>
    </Table.Cell>
    <Table.Cell>{transaction.resource}</Table.Cell>
    <Table.Cell className="text-right font-mono">{transaction.qty}</Table.Cell>
    <Table.Cell className="text-right font-mono">{formatCurrency(transaction.unitPrice, 6)}</Table.Cell>
    <Table.Cell className="text-right font-mono font-medium">{formatCurrency(transaction.totalUsdc, 6)}</Table.Cell>
    <Table.Cell>
      <StatusBadge
        status={transaction.status === 'completed' ? 'success' : transaction.status === 'failed' ? 'error' : transaction.status === 'pending' ? 'warning' : 'connecting'}
        label={STATUS_LABELS[transaction.status]}
      />
    </Table.Cell>
    <Table.Cell className="text-[#5d5d5d] text-sm">{formatRelativeTime(transaction.createdAt)}</Table.Cell>
    <Table.Cell>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={onClick}>
            View Details
          </DropdownMenuItem>
          {transaction.txHash && transaction.explorerUrl && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => window.open(transaction.explorerUrl!, '_blank')}>
                <ExternalLink className="h-4 w-4 mr-2" />
                View on Explorer
              </DropdownMenuItem>
            </>
          )}
          {transaction.transcriptHash && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigator.clipboard.writeText(transaction.transcriptHash!)}>
                Copy Transcript Hash
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </Table.Cell>
  </Table.Row>
);

// ============================================
// Transaction History Page
// ============================================

export default function HistoryPage() {
  const [transactions] = React.useState<Transaction[]>(mockTransactions);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [roleFilter, setRoleFilter] = React.useState<string>('all');
  const [modeFilter, setModeFilter] = React.useState<string>('all');
  const [selectedTransaction, setSelectedTransaction] = React.useState<Transaction | null>(null);
  const [sortConfig, setSortConfig] = React.useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'createdAt', direction: 'desc' });

  // Filter and sort transactions
  const filteredTransactions = React.useMemo(() => {
    let result = transactions.filter((t) => {
      const matchesSearch = t.resource.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.counterparty.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.txHash?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
      const matchesRole = roleFilter === 'all' || t.role === roleFilter;
      const matchesMode = modeFilter === 'all' || t.settlementMode === modeFilter;
      return matchesSearch && matchesStatus && matchesRole && matchesMode;
    });

    // Sort
    result.sort((a, b) => {
      const aVal = a[sortConfig.key as keyof Transaction];
      const bVal = b[sortConfig.key as keyof Transaction];
      if (aVal === undefined || bVal === undefined) return 0;
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [transactions, searchQuery, statusFilter, roleFilter, modeFilter, sortConfig]);

  // Calculate totals
  const completedTxs = transactions.filter(t => t.status === 'completed');
  const totalVolume = completedTxs.reduce((sum, t) => sum + t.totalUsdc, 0);
  const totalCount = completedTxs.length;

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const SortableHeader = ({ key, label }: { key: string; label: string }) => {
    const isSorted = sortConfig.key === key;
    return (
      <Table.Head onClick={() => handleSort(key)} className="cursor-pointer select-none">
        <div className="flex items-center gap-1">
          {label}
          {isSorted && (
            <span className="text-xs">
              {sortConfig.direction === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </span>
          )}
        </div>
      </Table.Head>
    );
  };

  const statusOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'completed', label: 'Completed' },
    { value: 'pending', label: 'Pending' },
    { value: 'failed', label: 'Failed' },
    { value: 'settling', label: 'Settling' },
  ];

  const roleOptions = [
    { value: 'all', label: 'All Roles' },
    { value: 'buyer', label: 'Buyer' },
    { value: 'seller', label: 'Seller' },
  ];

  const modeOptions = [
    { value: 'all', label: 'All Modes' },
    { value: 'mock', label: 'Mock' },
    { value: 'live', label: 'Live' },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageContainer
        title="Transaction History"
        description="Complete history of all your settlements and transactions"
        action={
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        }
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[#5d5d5d]">Total Volume</p>
                <p className="text-2xl font-medium text-black">{formatCurrency(totalVolume, 2)} USDC</p>
              </div>
              <DollarSign className="h-8 w-8 text-[#3fb950]" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[#5d5d5d]">Completed Transactions</p>
                <p className="text-2xl font-medium text-black">{totalCount}</p>
              </div>
              <Hash className="h-8 w-8 text-black" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-[#5d5d5d]">Avg Transaction</p>
                <p className="text-2xl font-medium text-black">{totalCount > 0 ? formatCurrency(totalVolume / totalCount, 4) : '0'} USDC</p>
              </div>
              <Users className="h-8 w-8 text-[#f5a623]" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#5d5d5d]" />
              <Input
                placeholder="Search transactions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select options={statusOptions} placeholder="Status" value={statusFilter} onValueChange={(value: string) => setStatusFilter(value)} className="w-full sm:w-40" />
            <Select options={roleOptions} placeholder="Role" value={roleFilter} onValueChange={(value: string) => setRoleFilter(value)} className="w-full sm:w-40" />
            <Select options={modeOptions} placeholder="Mode" value={modeFilter} onValueChange={(value: string) => setModeFilter(value)} className="w-full sm:w-40" />
          </div>
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Section title={`Transactions (${filteredTransactions.length})`}>
        {filteredTransactions.length === 0 ? (
          <EmptyState
            icon={<Search className="h-12 w-12" />}
            title="No transactions found"
            description="Try adjusting your filters or complete a negotiation to see transactions here"
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <SortableHeader key="id" label="TX ID" />
                  <SortableHeader key="role" label="Role" />
                  <SortableHeader key="counterparty" label="Counterparty" />
                  <SortableHeader key="resource" label="Resource" />
                  <SortableHeader key="qty" label="Qty" />
                  <SortableHeader key="unitPrice" label="Unit Price" />
                  <SortableHeader key="totalUsdc" label="Total" />
                  <SortableHeader key="status" label="Status" />
                  <SortableHeader key="createdAt" label="Date" />
                  <Table.Head className="w-12">Actions</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {filteredTransactions.map((tx) => (
                  <TransactionRow
                    key={tx.id}
                    transaction={tx}
                    onClick={() => setSelectedTransaction(tx)}
                  />
                ))}
              </Table.Body>
            </Table>
          </div>
        )}
      </Section>

      {/* Detail Modal */}
      <TransactionDetail
        transaction={selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
      />
    </div>
  );
}