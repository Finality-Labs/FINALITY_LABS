/**
 * Finality Labs - Reputation Page
 * View and manage agent reputation scores and history
 */

'use client';

import * as React from 'react';
import { useState } from 'react';
import { Search, Filter, TrendingUp, TrendingDown, Shield, Award, Star, History, Download, ExternalLink, Loader2, X } from 'lucide-react';
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
  Avatar,
  EmptyState,
  Progress,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui';
import { PageContainer, Section } from '@/components/layout';
import { formatCurrency, formatRelativeTime, formatTimestamp, truncate, cn } from '@/lib/utils';

// ============================================
// Types
// ============================================

interface ReputationEntry {
  agentId: string;
  agentRegistry: string;
  wallet: string;
  count: number;
  summaryValue: number;
  summaryValueDecimals: number;
  mode: 'offchain' | 'live';
  score: number; // normalized 0-1
  feedbackHistory: FeedbackEntry[];
  lastUpdated: number;
}

interface FeedbackEntry {
  id: string;
  value: number;
  decimals: number;
  tag1: string;
  tag2: string;
  endpoint: string;
  feedbackHash: string;
  proofOfPayment: {
    fromAddress: string;
    toAddress: string;
    chainId: number;
    txHash: string;
  };
  timestamp: number;
}

// Mock reputation data
const mockReputations: ReputationEntry[] = [
  {
    agentId: '1',
    agentRegistry: 'eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e',
    wallet: "0x27EB14742Ec8Fe485492a5b553EC9d13DB5f0aF4",
    count: 47,
    summaryValue: 47,
    summaryValueDecimals: 0,
    mode: 'offchain',
    score: 0.92,
    feedbackHistory: [
      { id: 'fb_1', value: 1, decimals: 0, tag1: 'deal', tag2: 'paid', endpoint: '/deals', feedbackHash: '0xabc...', proofOfPayment: { fromAddress: '0x27EB14742Ec8Fe485492a5b553EC9d13DB5f0aF4',  toAddress: '0xB5668A4934A16416A3848F50775f71b6528EACF8', chainId: 84532, txHash: '0x123...' }, timestamp: Date.now() - 1000 * 60 * 60 * 2 },
      { id: 'fb_2', value: 1, decimals: 0, tag1: 'deal', tag2: 'paid', endpoint: '/deals', feedbackHash: '0xdef...', proofOfPayment: { fromAddress: '0x27EB14742Ec8Fe485492a5b553EC9d13DB5f0aF4', toAddress: '0x3333333333333333333333333333333333333333', chainId: 84532, txHash: '0x456...' }, timestamp: Date.now() - 1000 * 60 * 60 * 24 },
    ],
    lastUpdated: Date.now() - 1000 * 60 * 30,
  },
  {
    agentId: '2',
    agentRegistry: 'eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e',
    wallet: '0xB5668A4934A16416A3848F50775f71b6528EACF8',
    count: 32,
    summaryValue: 32,
    summaryValueDecimals: 0,
    mode: 'offchain',
    score: 0.88,
    feedbackHistory: [
      { id: 'fb_3', value: 1, decimals: 0, tag1: 'deal', tag2: 'fulfilled', endpoint: '/deals', feedbackHash: '0xghi...', proofOfPayment: { fromAddress: '0x27EB14742Ec8Fe485492a5b553EC9d13DB5f0aF4',  toAddress: '0xB5668A4934A16416A3848F50775f71b6528EACF8', chainId: 84532, txHash: '0x123...' }, timestamp: Date.now() - 1000 * 60 * 60 * 3 },
      { id: 'fb_4', value: 1, decimals: 0, tag1: 'deal', tag2: 'fulfilled', endpoint: '/deals', feedbackHash: '0xjkl...', proofOfPayment: { fromAddress: '0x4444444444444444444444444444444444444444', toAddress: '0xB5668A4934A16416A3848F50775f71b6528EACF8', chainId: 84532, txHash: '0x789...' }, timestamp: Date.now() - 1000 * 60 * 60 * 48 },
    ],
    lastUpdated: Date.now() - 1000 * 60 * 60 * 2,
  },
  {
    agentId: 'CloudProviderBeta',
    agentRegistry: 'eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e',
    wallet: '0x3333333333333333333333333333333333333333',
    count: 28,
    summaryValue: 27,
    summaryValueDecimals: 0,
    mode: 'offchain',
    score: 0.85,
    feedbackHistory: [
      { id: 'fb_5', value: 1, decimals: 0, tag1: 'deal', tag2: 'fulfilled', endpoint: '/deals', feedbackHash: '0xmno...', proofOfPayment: { fromAddress: '0x5555555555555555555555555555555555555555', toAddress: '0x3333333333333333333333333333333333333333', chainId: 84532, txHash: '0xabc...' }, timestamp: Date.now() - 1000 * 60 * 60 * 5 },
    ],
    lastUpdated: Date.now() - 1000 * 60 * 60 * 24,
  },
  {
    agentId: 'AIStartupGamma',
    agentRegistry: 'eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e',
    wallet: '0x4444444444444444444444444444444444444444',
    count: 15,
    summaryValue: 14,
    summaryValueDecimals: 0,
    mode: 'offchain',
    score: 0.78,
    feedbackHistory: [
      { id: 'fb_6', value: 1, decimals: 0, tag1: 'deal', tag2: 'fulfilled', endpoint: '/deals', feedbackHash: '0xpqr...', proofOfPayment: { fromAddress: '0x6666666666666666666666666666666666666666', toAddress: '0x4444444444444444444444444444444444444444', chainId: 84532, txHash: '0xdef...' }, timestamp: Date.now() - 1000 * 60 * 60 * 72 },
    ],
    lastUpdated: Date.now() - 1000 * 60 * 60 * 72,
  },
  {
    agentId: 'DataCenterDelta',
    agentRegistry: 'eip155:84532:0x8004A818BFB912233c491871b3d84c89A494BD9e',
    wallet: '0x5555555555555555555555555555555555555555',
    count: 22,
    summaryValue: 22,
    summaryValueDecimals: 0,
    mode: 'live',
    score: 0.95,
    feedbackHistory: [
      { id: 'fb_7', value: 1, decimals: 0, tag1: 'deal', tag2: 'fulfilled', endpoint: '/deals', feedbackHash: '0xstu...', proofOfPayment: { fromAddress: '0x7777777777777777777777777777777777777777', toAddress: '0x5555555555555555555555555555555555555555', chainId: 84532, txHash: '0xghi...' }, timestamp: Date.now() - 1000 * 60 * 60 * 12 },
      { id: 'fb_8', value: 1, decimals: 0, tag1: 'deal', tag2: 'paid', endpoint: '/deals', feedbackHash: '0xvwx...', proofOfPayment: { fromAddress: '0x5555555555555555555555555555555555555555', toAddress: '0x8888888888888888888888888888888888888888', chainId: 84532, txHash: '0xjkl...' }, timestamp: Date.now() - 1000 * 60 * 60 * 24 },
    ],
    lastUpdated: Date.now() - 1000 * 60 * 60 * 6,
  },
];

const getScoreColor = (score: number) => {
  if (score >= 0.9) return 'bg-[#3fb950]';
  if (score >= 0.7) return 'bg-[#f5a623]';
  if (score >= 0.5) return 'bg-[#e03e3e]';
  return 'bg-[#e03e3e]';
};

const getScoreLabel = (score: number) => {
  if (score >= 0.9) return 'Excellent';
  if (score >= 0.7) return 'Good';
  if (score >= 0.5) return 'Fair';
  return 'Poor';
};

// ============================================
// Components
// ============================================

const ReputationCard = ({ reputation, onClick }: { reputation: ReputationEntry; onClick: () => void }) => (
  <div
    onClick={onClick}
    className="p-5 border border-[#333333]/14 bg-white/70 hover:bg-white hover:border-black/30 transition-all duration-200 cursor-pointer group"
  >
    <div className="flex items-start justify-between mb-4">
      <div className="flex items-center gap-3">
        <Avatar className="h-12 w-12">
          {reputation.agentId.charAt(0)}
        </Avatar>
        <div>
          <h3 className="font-medium text-black">{reputation.agentId}</h3>
          <p className="text-sm text-[#5d5d5d] font-mono">{truncate(reputation.wallet, 10)}</p>
        </div>
      </div>
      <Badge variant={reputation.mode === 'live' ? 'success' : 'default'}>
        {reputation.mode === 'live' ? 'Live' : 'Off-chain'}
      </Badge>
    </div>

    <div className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[#5d5d5d]">Reputation Score</span>
        <span className="font-medium text-black">{(reputation.score * 100).toFixed(0)}%</span>
      </div>
      <Progress value={reputation.score * 100} className="h-2" />
      <p className="text-xs text-[#5d5d5d] mt-1">{getScoreLabel(reputation.score)} • {reputation.count} feedback entries</p>
    </div>

    <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[#333333]/14">
      <div className="text-center">
        <p className="text-2xl font-medium text-black">{reputation.count}</p>
        <p className="text-xs text-[#5d5d5d]">Total Feedback</p>
      </div>
      <div className="text-center">
        <p className="text-2xl font-medium text-black">{reputation.summaryValue}</p>
        <p className="text-xs text-[#5d5d5d]">Summary Value</p>
      </div>
      <div className="text-center">
        <p className="text-2xl font-medium text-[#3fb950]">{(reputation.score * 100).toFixed(0)}%</p>
        <p className="text-xs text-[#5d5d5d]">Trust Score</p>
      </div>
    </div>
  </div>
);

const ReputationDetail = ({ reputation, onClose }: { reputation: ReputationEntry | null; onClose: () => void }) => {
  if (!reputation) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-none w-full max-w-3xl max-h-[90vh] overflow-hidden animate-scale-in" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#333333]/14">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              {reputation.agentId.charAt(0)}
            </Avatar>
            <div>
              <h2 className="font-serif text-xl font-medium text-black">{reputation.agentId}</h2>
              <p className="text-sm text-[#5d5d5d]">{reputation.agentRegistry}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-black/5 rounded transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* Score Overview */}
          <div className="mb-6 p-4 bg-white/50 border border-[#333333]/14">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">Reputation Score</h3>
              <Badge variant={reputation.mode === 'live' ? 'success' : 'default'}>
                {reputation.mode === 'live' ? 'Live (On-chain)' : 'Off-chain'}
              </Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className={cn('w-24 h-24 mx-auto rounded-full flex items-center justify-center text-3xl font-bold', getScoreColor(reputation.score), 'text-white')}>
                  {(reputation.score * 100).toFixed(0)}%
                </div>
                <p className="text-sm text-[#5d5d5d] mt-2">{getScoreLabel(reputation.score)}</p>
              </div>
              <div className="text-center md:col-span-3">
                <Progress value={reputation.score * 100} className="h-3" />
                <p className="text-xs text-[#5d5d5d] mt-1">Trust Score: {(reputation.score * 100).toFixed(1)}%</p>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatItem label="Total Feedback" value={reputation.count} icon={<History className="h-4 w-4" />} />
            <StatItem label="Summary Value" value={reputation.summaryValue} icon={<Award className="h-4 w-4" />} />
            <StatItem label="Decimals" value={reputation.summaryValueDecimals} icon={<Star className="h-4 w-4" />} />
            <StatItem label="Last Updated" value={formatRelativeTime(reputation.lastUpdated)} icon={<History className="h-4 w-4" />} />
          </div>

          {/* Identity */}
          <div className="mb-6 p-4 bg-white/50 border border-[#333333]/14">
            <h3 className="font-medium mb-3">Identity</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[#5d5d5d]">Agent Registry</p>
                <p className="font-mono text-xs break-all">{reputation.agentRegistry}</p>
              </div>
              <div>
                <p className="text-[#5d5d5d]">Wallet</p>
                <p className="font-mono text-xs">{reputation.wallet}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-[#5d5d5d]">Mode</p>
                <p className="font-medium capitalize">{reputation.mode}</p>
              </div>
            </div>
          </div>

          {/* Feedback History */}
          <h3 className="font-medium mb-3">Feedback History ({reputation.feedbackHistory.length})</h3>
          <div className="space-y-3">
            {reputation.feedbackHistory.length === 0 ? (
              <div className="py-8 text-center text-[#5d5d5d]">No feedback history available</div>
            ) : (
              reputation.feedbackHistory.map((feedback) => (
                <div key={feedback.id} className="p-4 bg-white/50 border border-[#333333]/14">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <Badge variant={feedback.tag2 === 'paid' ? 'success' : 'default'}>
                        {feedback.tag1}:{feedback.tag2}
                      </Badge>
                      <span className="text-sm font-medium">Value: {feedback.value}</span>
                    </div>
                    <span className="text-xs text-[#5d5d5d]">{formatRelativeTime(feedback.timestamp)}</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div>
                      <p className="text-[#5d5d5d]">Feedback Hash</p>
                      <p className="font-mono">{truncate(feedback.feedbackHash, 16)}</p>
                    </div>
                    <div>
                      <p className="text-[#5d5d5d]">TX Hash</p>
                      <p className="font-mono">{truncate(feedback.proofOfPayment.txHash, 16)}</p>
                    </div>
                    <div>
                      <p className="text-[#5d5d5d]">From</p>
                      <p className="font-mono">{truncate(feedback.proofOfPayment.fromAddress, 10)}</p>
                    </div>
                    <div>
                      <p className="text-[#5d5d5d]">To</p>
                      <p className="font-mono">{truncate(feedback.proofOfPayment.toAddress, 10)}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-[#333333]/14">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export History
          </Button>
        </div>
      </div>
    </div>
  );
};

const StatItem = ({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) => (
  <div className="p-3 bg-white/50 border border-[#333333]/14 text-center">
    <div className="flex items-center justify-center gap-1 text-[#5d5d5d] mb-1">
      {icon}
      <span className="text-xs">{label}</span>
    </div>
    <p className="font-medium text-black">{value}</p>
  </div>
);

// ============================================
// Reputation Page
// ============================================

export default function ReputationPage() {
  const [reputations] = React.useState<ReputationEntry[]>(mockReputations);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [modeFilter, setModeFilter] = React.useState<string>('all');
  const [sortConfig, setSortConfig] = React.useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'score', direction: 'desc' });
  const [selectedReputation, setSelectedReputation] = React.useState<ReputationEntry | null>(null);
  const [activeTab, setActiveTab] = React.useState<'overview' | 'leaderboard'>('overview');

  const filteredReputations = React.useMemo(() => {
    let result = reputations.filter((r) => {
      const matchesSearch = r.agentId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.wallet.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesMode = modeFilter === 'all' || r.mode === modeFilter;
      return matchesSearch && matchesMode;
    });

    result.sort((a, b) => {
      const aVal = a[sortConfig.key as keyof ReputationEntry];
      const bVal = b[sortConfig.key as keyof ReputationEntry];
      if (aVal === undefined || bVal === undefined) return 0;
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [reputations, searchQuery, modeFilter, sortConfig]);

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
              {sortConfig.direction === 'asc' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            </span>
          )}
        </div>
      </Table.Head>
    );
  };

  const modeOptions = [
    { value: 'all', label: 'All Modes' },
    { value: 'offchain', label: 'Off-chain' },
    { value: 'live', label: 'Live (On-chain)' },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageContainer
        title="Reputation"
        description="View and manage agent reputation scores across the network"
        action={
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        }
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(value: string) =>
  setActiveTab(value as 'overview' | 'leaderboard')
} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          {/* Summary Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-[#5d5d5d]">Total Agents</p>
                    <p className="text-2xl font-medium text-black">{reputations.length}</p>
                  </div>
                  <Shield className="h-8 w-8 text-[#3fb950]" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-[#5d5d5d]">Avg Reputation</p>
                    <p className="text-2xl font-medium text-black">{(reputations.reduce((sum, r) => sum + r.score, 0) / reputations.length * 100).toFixed(0)}%</p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-[#3fb950]" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-[#5d5d5d]">Live Agents</p>
                    <p className="text-2xl font-medium text-black">{reputations.filter(r => r.mode === 'live').length}</p>
                  </div>
                  <Shield className="h-8 w-8 text-[#f5a623]" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-[#5d5d5d]">Total Feedback</p>
                    <p className="text-2xl font-medium text-black">{reputations.reduce((sum, r) => sum + r.count, 0)}</p>
                  </div>
                  <History className="h-8 w-8 text-[#5d5d5d]" />
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
                    placeholder="Search agents..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select options={modeOptions} placeholder="Mode" value={modeFilter} onChange={setModeFilter} className="w-full sm:w-48" />
              </div>
            </CardContent>
          </Card>

          {/* Reputation Cards */}
          <Section title={`Agents (${filteredReputations.length})`}>
            {filteredReputations.length === 0 ? (
              <EmptyState
                icon={<Shield className="h-12 w-12" />}
                title="No agents found"
                description="Try adjusting your filters"
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredReputations.map((rep) => (
                  <ReputationCard
                    key={rep.agentId}
                    reputation={rep}
                    onClick={() => setSelectedReputation(rep)}
                  />
                ))}
              </div>
            )}
          </Section>
        </TabsContent>

        <TabsContent value="leaderboard">
          <Section title="Reputation Leaderboard">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <SortableHeader key="rank" label="Rank" />
                      <SortableHeader key="agentId" label="Agent" />
                      <SortableHeader key="score" label="Score" />
                      <SortableHeader key="count" label="Feedback" />
                      <SortableHeader key="summaryValue" label="Summary" />
                      <SortableHeader key="mode" label="Mode" />
                      <SortableHeader key="lastUpdated" label="Updated" />
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {filteredReputations
                      .sort((a, b) => b.score - a.score)
                      .map((rep, index) => (
                        <Table.Row key={rep.agentId} onClick={() => setSelectedReputation(rep)} className="cursor-pointer hover:bg-black/[0.02]">
                          <Table.Cell className="font-medium">#{index + 1}</Table.Cell>
                          <Table.Cell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                {rep.agentId.charAt(0)}
                              </Avatar>
                              <span className="font-medium">{rep.agentId}</span>
                            </div>
                          </Table.Cell>
                          <Table.Cell>
                            <div className="flex items-center gap-2">
                              <Progress value={rep.score * 100} className="flex-1 h-2" />
                              <span className="text-sm font-medium text-black w-16 text-right">
                                {(rep.score * 100).toFixed(0)}%
                              </span>
                            </div>
                          </Table.Cell>
                          <Table.Cell className="font-mono">{rep.count}</Table.Cell>
                          <Table.Cell className="font-mono">{rep.summaryValue}</Table.Cell>
                          <Table.Cell>
                            <Badge variant={rep.mode === 'live' ? 'success' : 'default'}>
                              {rep.mode === 'live' ? 'Live' : 'Off-chain'}
                            </Badge>
                          </Table.Cell>
                          <Table.Cell className="text-[#5d5d5d] text-sm">{formatRelativeTime(rep.lastUpdated)}</Table.Cell>
                        </Table.Row>
                      ))}
                  </Table.Body>
                </Table>
              </CardContent>
            </Card>
          </Section>
        </TabsContent>
      </Tabs>

      {/* Detail Modal */}
      <ReputationDetail
        reputation={selectedReputation}
        onClose={() => setSelectedReputation(null)}
      />
    </div>
  );
}