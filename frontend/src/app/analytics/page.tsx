/**
 * Finality Labs - Analytics Page
 * Comprehensive analytics dashboard with charts and metrics
 */

'use client';

import * as React from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Handshake, Shield, Clock, Users, Download, Calendar, Filter } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Select,
  Button,
  Input,
  Separator,
  Table,
  Avatar,
} from '@/components/ui';
import { PageContainer, Section } from '@/components/layout';
import { formatCurrency, formatRelativeTime, truncate, cn } from '@/lib/utils';

// ============================================
// Mock Analytics Data
// ============================================

const volumeOverTime = [
  { date: '2024-01', volume: 12.5, deals: 8, buyers: 5, sellers: 4 },
  { date: '2024-02', volume: 18.2, deals: 12, buyers: 7, sellers: 6 },
  { date: '2024-03', volume: 22.8, deals: 15, buyers: 9, sellers: 7 },
  { date: '2024-04', volume: 31.4, deals: 18, buyers: 11, sellers: 8 },
  { date: '2024-05', volume: 28.9, deals: 16, buyers: 10, sellers: 7 },
  { date: '2024-06', volume: 35.7, deals: 22, buyers: 13, sellers: 9 },
  { date: '2024-07', volume: 42.1, deals: 25, buyers: 15, sellers: 10 },
  { date: '2024-08', volume: 38.5, deals: 20, buyers: 12, sellers: 9 },
  { date: '2024-09', volume: 45.3, deals: 28, buyers: 16, sellers: 12 },
  { date: '2024-10', volume: 52.8, deals: 30, buyers: 18, sellers: 13 },
  { date: '2024-11', volume: 48.9, deals: 26, buyers: 15, sellers: 11 },
  { date: '2024-12', volume: 58.2, deals: 32, buyers: 19, sellers: 14 },
];

const volumeByResource = [
  { resource: 'GPU H100', volume: 125.4, deals: 45, percentage: 35.2 },
  { resource: 'GPU A100', volume: 89.2, deals: 32, percentage: 25.1 },
  { resource: 'GPU V100', volume: 45.7, deals: 18, percentage: 12.8 },
  { resource: 'GPU A10G', volume: 38.9, deals: 15, percentage: 10.9 },
  { resource: 'GPU T4', volume: 28.4, deals: 12, percentage: 8.0 },
  { resource: 'Other', volume: 28.6, deals: 10, percentage: 8.0 },
];

const dealsByStatus = [
  { name: 'Completed', value: 142, color: '#3fb950' },
  { name: 'Constraint Hit', value: 28, color: '#f5a623' },
  { name: 'Failed', value: 12, color: '#e03e3e' },
  { name: 'Pending', value: 8, color: '#5d5d5d' },
];

const topCounterparties = [
  { agentId: '2', volume: 45.2, deals: 28, avgPrice: 0.00018, reputation: 0.92 },
  { agentId: '3', volume: 38.7, deals: 22, avgPrice: 0.00016, reputation: 0.88 },
  { agentId: '1', volume: 32.1, deals: 18, avgPrice: 0.0002, reputation: 0.95 },
  { agentId: '4', volume: 28.9, deals: 15, avgPrice: 0.00015, reputation: 0.85 },
  { agentId: '5', volume: 24.5, deals: 12, avgPrice: 0.00017, reputation: 0.90 },
];

const reputationDistribution = [
  { range: '0.9-1.0', count: 12, color: '#3fb950' },
  { range: '0.8-0.9', count: 28, color: '#5cb85c' },
  { range: '0.7-0.8', count: 35, color: '#8bc34a' },
  { range: '0.6-0.7', count: 22, color: '#cddc39' },
  { range: '0.5-0.6', count: 15, color: '#f5a623' },
  { range: '0.4-0.5', count: 8, color: '#ff9800' },
  { range: '0.0-0.4', count: 5, color: '#e03e3e' },
];

const monthlyStats = {
  totalVolume: 58.2,
  totalDeals: 32,
  avgDealSize: 1.82,
  successRate: 94.5,
  activeBuyers: 19,
  activeSellers: 14,
  avgNegotiationRounds: 5.2,
  avgSettlementTime: '3.2 min',
};

// ============================================
// Chart Components
// ============================================

const COLORS = ['#151515', '#3fb950', '#f5a623', '#e03e3e', '#5d5d5d', '#8b8b8b'];

const VolumeChart = () => (
  <Card>
    <CardHeader>
      <CardTitle>Volume Over Time</CardTitle>
      <CardDescription>Monthly trading volume and deal count</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={volumeOverTime} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#5d5d5d' }} axisLine={false} tickLine={false} />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 11, fill: '#5d5d5d' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}M`}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11, fill: '#5d5d5d' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}`}
              domain={[0, 50]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255,255,255,0.95)',
                border: '1px solid #e5e5e5',
                borderRadius: 0,
                boxShadow: '0 18px 50px rgba(0,0,0,.06)',
              }}
              labelStyle={{ color: '#151515', fontWeight: 500 }}
              itemStyle={{ padding: '4px 8px' }}
              formatter={(value: number, name: string) => {
                if (name === 'volume') return [`${formatCurrency(value, 1)}M USDC`, 'Volume'];
                if (name === 'deals') return [`${value} deals`, 'Deals'];
                if (name === 'buyers') return [`${value}`, 'Active Buyers'];
                if (name === 'sellers') return [`${value}`, 'Active Sellers'];
                return [value, name];
              }}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey="volume"
              yAxisId="left"
              stroke="#151515"
              strokeWidth={2}
              fill="#151515"
              fillOpacity={0.1}
              name="Volume (M USDC)"
            />
            <Line
              type="monotone"
              dataKey="deals"
              yAxisId="right"
              stroke="#3fb950"
              strokeWidth={2}
              dot={{ r: 4, strokeWidth: 2 }}
              name="Deals"
            />
            <Line
              type="monotone"
              dataKey="buyers"
              yAxisId="right"
              stroke="#f5a623"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ r: 3, strokeWidth: 2 }}
              name="Active Buyers"
            />
            <Line
              type="monotone"
              dataKey="sellers"
              yAxisId="right"
              stroke="#5d5d5d"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ r: 3, strokeWidth: 2 }}
              name="Active Sellers"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </CardContent>
  </Card>
);

const ResourceDistributionChart = () => (
  <Card>
    <CardHeader>
      <CardTitle>Volume by Resource</CardTitle>
      <CardDescription>Distribution of trading volume across resource types</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={volumeByResource}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey="volume"
              nameKey="resource"
              label={({ resource, percentage }) => `${resource} ${percentage}%`}
              labelLine={false}
            >
              {volumeByResource.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255,255,255,0.95)',
                border: '1px solid #e5e5e5',
                borderRadius: 0,
                boxShadow: '0 18px 50px rgba(0,0,0,.06)',
              }}
              formatter={(value: number) => [formatCurrency(value, 1), 'Volume']}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
        {volumeByResource.map((item, index) => (
          <div key={item.resource} className="flex items-center gap-2">
            <div className={cn('w-3 h-3 rounded', COLORS[index % COLORS.length])} />
            <span className="font-medium">{item.resource}</span>
            <span className="text-[#5d5d5d]">{item.percentage}%</span>
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);

const StatusDistributionChart = () => (
  <Card>
    <CardHeader>
      <CardTitle>Deal Status Distribution</CardTitle>
      <CardDescription>Breakdown of negotiation outcomes</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={dealsByStatus}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={3}
              dataKey="value"
              nameKey="name"
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
              labelLine={false}
            >
              {dealsByStatus.map((item, index) => (
                <Cell key={`cell-${index}`} fill={item.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255,255,255,0.95)',
                border: '1px solid #e5e5e5',
                borderRadius: 0,
                boxShadow: '0 18px 50px rgba(0,0,0,.06)',
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </CardContent>
  </Card>
);

const ReputationChart = () => (
  <Card>
    <CardHeader>
      <CardTitle>Reputation Distribution</CardTitle>
      <CardDescription>Distribution of agent reputation scores</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={reputationDistribution} layout="vertical" margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: '#5d5d5d' }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="range" tick={{ fontSize: 11, fill: '#5d5d5d' }} axisLine={false} tickLine={false} width={80} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255,255,255,0.95)',
                border: '1px solid #e5e5e5',
                borderRadius: 0,
                boxShadow: '0 18px 50px rgba(0,0,0,.06)',
              }}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {reputationDistribution.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </CardContent>
  </Card>
);

// ============================================
// Stats Cards
// ============================================

const StatCard = ({ title, value, change, icon, iconColor, bgColor }: {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ReactNode;
  iconColor: string;
  bgColor: string;
}) => (
  <Card>
    <CardContent className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-[#5d5d5d] mb-1">{title}</p>
          <p className="text-2xl sm:text-3xl font-medium text-black">{value}</p>
          {change !== undefined && (
            <div className="flex items-center gap-1 mt-2">
              {change >= 0 ? <TrendingUp className="h-3 w-3 text-[#3fb950]" /> : <TrendingDown className="h-3 w-3 text-[#e03e3e]" />}
              <span className={cn('text-xs font-medium', change >= 0 ? 'text-[#3fb950]' : 'text-[#e03e3e]')}>
                {change >= 0 ? '+' : ''}{change.toFixed(1)}%
              </span>
              <span className="text-xs text-[#5d5d5d]">vs last month</span>
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

// ============================================
// Analytics Page
// ============================================

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = React.useState('30d');

  // Pre-computed stat values to avoid template literal issues
  const statValues = React.useMemo(() => ({
    totalVolume: `${formatCurrency(monthlyStats.totalVolume, 1)}M USDC`,
    totalDeals: monthlyStats.totalDeals,
    avgDealSize: `${formatCurrency(monthlyStats.avgDealSize, 4)}M`,
    successRate: `${monthlyStats.successRate}%`,
    activeBuyers: monthlyStats.activeBuyers,
    activeSellers: monthlyStats.activeSellers,
    avgRounds: monthlyStats.avgNegotiationRounds,
    avgSettlementTime: monthlyStats.avgSettlementTime,
  }), []);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageContainer
        title="Analytics"
        description="Deep insights into your trading activity and marketplace trends"
        action={
          <div className="flex items-center gap-3">
            <Select
              options={[
                { value: '7d', label: 'Last 7 Days' },
                { value: '30d', label: 'Last 30 Days' },
                { value: '90d', label: 'Last 90 Days' },
                { value: '1y', label: 'Last Year' },
                { value: 'all', label: 'All Time' },
              ]}
              value={timeRange}
              onValueChange={(value: string) => setTimeRange(value)}
              className="w-40"
            />
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </Button>
          </div>
        }
      />

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4 mb-2">
        <StatCard
          title="Total Volume"
          value={statValues.totalVolume}
          change={12.5}
          icon={<DollarSign className="h-6 w-6 text-white" />}
          iconColor="text-white"
          bgColor="bg-black text-white"
        />
        <StatCard
          title="Total Deals"
          value={statValues.totalDeals}
          change={8.2}
          icon={<Handshake className="h-6 w-6 text-white" />}
          iconColor="text-white"
          bgColor="bg-black text-white"
        />
        <StatCard
          title="Avg Deal Size"
          value={statValues.avgDealSize}
          change={-2.1}
          icon={<TrendingUp className="h-6 w-6 text-white" />}
          iconColor="text-white"
          bgColor="bg-black text-white"
        />
        <StatCard
          title="Success Rate"
          value={statValues.successRate}
          change={1.5}
          icon={<Shield className="h-6 w-6 text-white" />}
          iconColor="text-white"
          bgColor="bg-black text-white"
        />
        <StatCard
          title="Active Buyers"
          value={statValues.activeBuyers}
          change={5.8}
          icon={<Users className="h-6 w-6 text-[#3fb950]" />}
          iconColor="text-[#3fb950]"
          bgColor="bg-[#3fb950]/10"
        />
        <StatCard
          title="Active Sellers"
          value={statValues.activeSellers}
          change={3.2}
          icon={<Users className="h-6 w-6 text-[#f5a623]" />}
          iconColor="text-[#f5a623]"
          bgColor="bg-[#f5a623]/10"
        />
        <StatCard
          title="Avg Rounds"
          value={statValues.avgRounds}
          change={-4.1}
          icon={<Clock className="h-6 w-6 text-[#5d5d5d]" />}
          iconColor="text-[#5d5d5d]"
          bgColor="bg-[#5d5d5d]/10"
        />
        <StatCard
          title="Settlement Time"
          value={statValues.avgSettlementTime}
          change={-8.5}
          icon={<Calendar className="h-6 w-6 text-[#e03e3e]" />}
          iconColor="text-[#e03e3e]"
          bgColor="bg-[#e03e3e]/10"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <VolumeChart />
        <ResourceDistributionChart />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <StatusDistributionChart />
        <ReputationChart />
      </div>

      {/* Top Counterparties */}
      <Section title="Top Counterparties" description="Your most active trading partners by volume">
        <Card>
          <CardContent className="p-0">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.Head>Agent</Table.Head>
                  <Table.Head className="text-right">Volume (M)</Table.Head>
                  <Table.Head className="text-right">Deals</Table.Head>
                  <Table.Head className="text-right">Avg Price</Table.Head>
                  <Table.Head>Reputation</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {topCounterparties.map((cp) => (
                  <Table.Row key={cp.agentId}>
                    <Table.Cell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          {cp.agentId.charAt(0)}
                        </Avatar>
                        <span className="font-medium">{cp.agentId}</span>
                      </div>
                    </Table.Cell>
                    <Table.Cell className="text-right font-mono font-medium">{formatCurrency(cp.volume, 1)}</Table.Cell>
                    <Table.Cell className="text-right font-mono">{cp.deals}</Table.Cell>
                    <Table.Cell className="text-right font-mono">{formatCurrency(cp.avgPrice, 6)}</Table.Cell>
                    <Table.Cell>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-[#333333]/14 rounded-full overflow-hidden">
                          <div className="h-full bg-[#3fb950] transition-all" style={{ width: `${cp.reputation * 100}%` }} />
                        </div>
                        <span className="text-sm font-medium text-[#3fb950]">{(cp.reputation * 100).toFixed(0)}%</span>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </CardContent>
        </Card>
      </Section>

      {/* Additional Metrics */}
      <Section title="Additional Metrics">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-5">
              <h3 className="font-serif text-lg font-medium mb-4">Price Trends</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-[#5d5d5d]">GPU H100 Avg</span>
                  <span className="font-mono font-medium">{formatCurrency(0.00018, 6)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#5d5d5d]">GPU A100 Avg</span>
                  <span className="font-mono font-medium">{formatCurrency(0.00015, 6)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#5d5d5d]">GPU V100 Avg</span>
                  <span className="font-mono font-medium">{formatCurrency(0.00012, 6)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <h3 className="font-serif text-lg font-medium mb-4">Negotiation Efficiency</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-[#5d5d5d]">Avg Rounds to Deal</span>
                  <span className="font-mono font-medium">{monthlyStats.avgNegotiationRounds}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#5d5d5d]">Deal Close Rate</span>
                  <span className="font-mono font-medium text-[#3fb950]">{monthlyStats.successRate}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#5d5d5d]">Avg Settlement Time</span>
                  <span className="font-mono font-medium">{monthlyStats.avgSettlementTime}</span>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <h3 className="font-serif text-lg font-medium mb-4">Market Share</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-[#5d5d5d]">Your Buy Volume</span>
                  <span className="font-mono font-medium">{formatCurrency(32.1, 1)}M</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#5d5d5d]">Your Sell Volume</span>
                  <span className="font-mono font-medium">{formatCurrency(26.1, 1)}M</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#5d5d5d]">Market Rank</span>
                  <span className="font-mono font-medium">#3</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </Section>
    </div>
  );
}