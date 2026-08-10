/**
 * Finality Labs - Negotiation Room Page
 * Real-time negotiation interface with WebSocket connection
 */

'use client';

import * as React from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from "next/navigation";
import {
  Send,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  MessageSquare,
  Clock,
  DollarSign,
  Hash,
  Copy,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ArrowRightLeft,
} from 'lucide-react';
import { createNegotiationClient, NegotiationClient } from '@/lib/ws'
import { intakeApi } from '@/lib/api'
import { useWallet, useCurrentAgent } from '@/hooks/use-wallet'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Input,
  Textarea,
  Select,
  Badge,
  StatusBadge,
  Avatar,
  Separator,
  ScrollArea,
  Toaster,
  toast,
  Progress,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui';
import { PageContainer, Section } from '@/components/layout';
import { formatCurrency, formatRelativeTime, formatTimestamp, truncate, cn, generateId } from '@/lib/utils';

// ============================================
// Types
// ============================================

interface NegotiationMessage {
  type: 'counteroffer' | 'accept' | 'reject' | 'close' | 'system' | 'join';
  from?: 'buyer' | 'seller';
  round?: number;
  payload?: any;
  ts?: number;
  kind?: string;
  message?: string;
  deal?: any;
  transcriptHash?: string;
  lastTerms?: any;
  reason?: string;
}

interface RoomState {
  connected: boolean;
  status: 'connecting' | 'waiting' | 'active' | 'closed' | 'error';
  round: number;
  maxRounds: number;
  minDelta: number;
  myIdentity: any;
  counterpartyIdentity: any;
  myBound: number | null;
  transcript: NegotiationMessage[];
  lastTerms: any;
  deal: any;
  transcriptHash: string | undefined;
  error: string | undefined;
}

// ============================================
// Negotiation Room Page
// ============================================

export default function NegotiationRoomPage() {
  
  const params = useParams();
  const { account: wallet, isConnected } = useWallet();
  const [role, setRole] = React.useState<'buyer' | 'seller'>('buyer');
  const currentAgent = useCurrentAgent(role);

  const [roomId, setRoomId] = React.useState('');

  React.useEffect(() => {
  if (params?.roomId) {
    setRoomId(params.roomId as string);
  }
}, [params]);


  const [client, setClient] = React.useState<NegotiationClient | null>(null);
  const [roomState, setRoomState] = React.useState<RoomState>({
      connected: false,
      status: 'connecting',
      round: 0,
      maxRounds: 10,
      minDelta: 0.01,
      myIdentity: null,
      counterpartyIdentity: null,
      myBound: null,
      transcript: [],
      lastTerms: null,
      deal: null,
      transcriptHash: undefined,
      error: undefined,
    });
  const [messageInput, setMessageInput] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);
  const [showTranscript, setShowTranscript] = React.useState(true);
  const [counterofferPrice, setCounterofferPrice] = React.useState('');
  const [counterofferQty, setCounterofferQty] = React.useState(1);
  const [counterofferTerms, setCounterofferTerms] = React.useState('per-hour billing');
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const scrollAreaRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [roomState.transcript, scrollToBottom]);

  // Connect to room
  const handleConnect = async () => {
    console.log("=== HANDLE CONNECT CALLED ===");
    console.log("roomId =", roomId);
    console.log("role =", role);
    if (!roomId.trim()) {
      toast.error('Please enter a room ID');
      return;
    }
    
    // Use ERC-8004 identity if available, otherwise fallback to mock
    const agent = currentAgent;
    if (!agent || !wallet) {
      toast.error('Wallet not connected or agent not available');
      return;
    }

    const identity = {
      agentRegistry: agent.agentRegistry,
      agentId: agent.agentId,
      wallet: agent.wallet,
      ...(role === 'buyer'
        ? { maxUnitPrice: 0.0002 }
        : { floorUnitPrice: 0.0001 }),
    };

    const negotiationClient = createNegotiationClient({
      roomId: roomId.trim(),
      role,
      identity,
      wsUrl: 'ws://localhost:3002',
      onMessage: (message) => {
        handleIncomingMessage(message);
      },
      onConnect: (connected) => {
        setRoomState(prev => ({ ...prev, connected, status: connected ? 'waiting' : 'closed' }));
      },
      onError: (error) => {
        setRoomState(prev => ({ ...prev, error: error.message, status: 'error' }));
        toast.error('Connection error', { description: error.message });
      },
      onClose: () => {
        setRoomState(prev => ({ ...prev, connected: false, status: 'closed' }));
      },
    });

    setClient(negotiationClient);
    await negotiationClient.connect();
  };

  // Handle incoming messages
  const handleIncomingMessage = (message: NegotiationMessage) => {
    setRoomState(prev => {
      const newTranscript = [...prev.transcript, message];
      let newState = { ...prev, transcript: newTranscript };

      if (message.type === 'system') {
        switch (message.kind) {
          case 'info':
            if (message.message?.includes('room ready')) {
              newState.status = 'active';
              newState.round = 1;
            } else if (message.message?.includes('joined')) {
              newState.counterpartyIdentity = {
                agentRegistry: '',
                agentId: role === 'buyer' ? 'Seller' : 'Buyer',
                wallet: '',
              };
            }
            break;
          case 'error':
            newState.error = message.message;
            newState.status = 'error';
            toast.error('Negotiation error', { description: message.message });
            break;
          case 'deal-closed':
            newState.deal = message.deal;
            newState.transcriptHash = message.transcriptHash;
            newState.status = 'closed';
            toast.success('Deal closed!', { 
              description: `Price: ${formatCurrency(message.deal.unitPrice, 6)} × ${message.deal.qty} = ${formatCurrency(message.deal.totalUsdc, 6)} USDC` 
            });
            break;
          case 'constraint-hit':
            newState.lastTerms = message.lastTerms;
            newState.status = 'closed';
            newState.error = message.reason;
            toast.warning('Negotiation ended', { description: message.reason });
            break;
        }
      } else if (message.type === 'counteroffer' && message.payload) {
        newState.lastTerms = message.payload;
        newState.round = message.round || prev.round + 1;
      }

      return newState;
    });
  };

  // Send counteroffer
  const handleCounteroffer = async () => {
    console.log("COUNTEROFFER CLICKED");
console.log("client =", client);
console.log("status =", roomState.status);
console.log("price =", counterofferPrice);
    if (!client || !counterofferPrice) return;
    
    setIsSending(true);
    try {
      const terms = {
        unitPrice: parseFloat(counterofferPrice),
        qty: counterofferQty,
        terms: counterofferTerms,
        requirements: {},
      };
      client.sendCounteroffer(terms);
      setCounterofferPrice('');
    } catch (error) {
      toast.error('Failed to send counteroffer');
    } finally {
      setIsSending(false);
    }
  };

  // Send accept
  const handleAccept = async () => {
    if (!client || !roomState.lastTerms) return;
    
    setIsSending(true);
    try {
      client.sendAccept(roomState.lastTerms);
    } catch (error) {
      toast.error('Failed to accept');
    } finally {
      setIsSending(false);
    }
  };

  // Send reject
  const handleReject = async () => {
    if (!client) return;
    
    setIsSending(true);
    try {
      client.sendReject('Proposing new terms');
    } catch (error) {
      toast.error('Failed to reject');
    } finally {
      setIsSending(false);
    }
  };

  // Send close
  const handleClose = async () => {
    if (!client) return;
    
    setIsSending(true);
    try {
      client.sendClose('Walking away');
    } catch (error) {
      toast.error('Failed to close');
    } finally {
      setIsSending(false);
    }
  };

  // Disconnect
  const handleDisconnect = () => {
    client?.disconnect();
    setClient(null);
    setRoomState({
      connected: false,
      status: 'connecting',
      round: 0,
      maxRounds: 10,
      minDelta: 0.01,
      myIdentity: null,
      counterpartyIdentity: null,
      myBound: null,
      transcript: [],
      lastTerms: null,
      deal: null,
      transcriptHash: undefined,
      error: undefined,
    });
  };

  // Get message component
  const renderMessage = (msg: NegotiationMessage, index: number) => {
    const isSystem = msg.type === 'system';
    const isOwn = msg.from === role;
    const isCounterparty = msg.from && msg.from !== role;

    if (isSystem) {
      const severityColors = {
        info: 'bg-black/5 border-black/10 text-black',
        success: 'bg-[#3fb950]/10 border-[#3fb950]/30 text-[#3fb950]',
        warning: 'bg-[#f5a623]/10 border-[#f5a623]/30 text-[#f5a623]',
        error: 'bg-[#e03e3e]/10 border-[#e03e3e]/30 text-[#e03e3e]',
      };

      const getSeverity = () => {
        if (msg.kind === 'error') return 'error';
        if (msg.kind === 'deal-closed') return 'success';
        if (msg.kind === 'constraint-hit') return 'warning';
        return 'info';
      };

      return (
        <div key={index} className={cn('p-3 rounded-lg text-sm', severityColors[getSeverity()])}>
          <div className="flex items-center gap-2">
            {getSeverity() === 'success' && <CheckCircle className="h-4 w-4" />}
            {getSeverity() === 'error' && <XCircle className="h-4 w-4" />}
            {getSeverity() === 'warning' && <AlertCircle className="h-4 w-4" />}
            {getSeverity() === 'info' && <MessageSquare className="h-4 w-4" />}
            <span className="font-medium">{msg.kind?.replace('-', ' ')}</span>
          </div>
          <p className="mt-1">{msg.message}</p>
          {msg.deal && (
            <div className="mt-2 p-2 bg-white/50 rounded text-xs font-mono">
              Deal: {formatCurrency(msg.deal.unitPrice, 6)} × {msg.deal.qty} = {formatCurrency(msg.deal.totalUsdc, 6)} USDC
            </div>
          )}
          {msg.transcriptHash && (
            <p className="mt-1 text-xs font-mono">Hash: {truncate(msg.transcriptHash, 20)}</p>
          )}
        </div>
      );
    }

    const bubbleClass = cn(
      'p-3 rounded-lg max-w-[70%]',
      isOwn ? 'ml-auto bg-black text-white' : 'mr-auto bg-white border border-[#333333]/14'
    );

    const payload = msg.payload;
    const price = payload?.unitPrice;
    const qty = payload?.qty;
    const terms = payload?.terms;
    const argument = payload?.argument;

    return (
      <div key={index} className={cn('flex gap-2', isOwn ? 'justify-end' : 'justify-start')}>
        <div className={bubbleClass}>
          <div className="flex items-center gap-2 mb-1">
            <Avatar className="h-5 w-5">
              {msg.from?.charAt(0).toUpperCase()}
            </Avatar>
            <span className="text-xs font-medium">{msg.from === 'buyer' ? 'Buyer' : 'Seller'}</span>
            <span className="text-xs text-[#5d5d5d]">Round {msg.round}</span>
            <span className="text-xs text-[#5d5d5d]">{formatRelativeTime(msg.ts || Date.now())}</span>
          </div>
          {price !== undefined && (
            <div className="flex items-center gap-2 text-sm">
              <DollarSign className="h-3 w-3" />
              <span className="font-mono font-medium">{formatCurrency(price, 6)}</span>
              {qty && <span className="text-[#5d5d5d]">× {qty}</span>}
              {price && qty && <span className="text-[#5d5d5d]">= {formatCurrency(price * qty, 6)} USDC</span>}
            </div>
          )}
          {terms && <p className="text-xs text-[#5d5d5d] mt-1">{terms}</p>}
          {argument && <p className="text-xs mt-1 italic">"{argument}"</p>}
        </div>
      </div>
    );
  };
  console.log("status =", roomState.status);
console.log("counterofferPrice =", counterofferPrice);
console.log(
  "buttonDisabled =",
  roomState.status !== "active" || !counterofferPrice
);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageContainer
        title="Negotiation Room"
        description="Real-time negotiation with counterparty"
        action={
          !roomState.connected ? (
            <div className="flex items-center gap-2">
              <Input
                placeholder="Room ID (e.g., room_abc123)"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="w-64"
              />
              <Select
                value={role}
                onValueChange={(value: string) => setRole(value as 'buyer' | 'seller')}
                options={[
                  { value: 'buyer', label: 'Buyer' },
                  { value: 'seller', label: 'Seller' },
                ]}
                className="w-36"
              />
              <Button onClick={handleConnect}>
                <Loader2 className="h-4 w-4 mr-2" />
                Connect
              </Button>
            </div>
          ) : (
            <Button variant="secondary" onClick={handleDisconnect}>
              Disconnect
            </Button>
          )}
      />

      {/* Connection Status */}
      <Card className={cn(
        'mb-4',
        roomState.status === 'active' && 'border-[#3fb950]/50',
        roomState.status === 'error' && 'border-[#e03e3e]/50',
        roomState.status === 'closed' && 'border-[#5d5d5d]/50',
      )}>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <StatusBadge 
                status={
                  roomState.status === 'active' ? 'active' :
                  roomState.status === 'waiting' ? 'connecting' :
                  roomState.status === 'closed' ? 'closed' :
                  roomState.status === 'error' ? 'error' : 'idle'
                }
                label={
                  roomState.status === 'active' ? 'Negotiating' :
                  roomState.status === 'waiting' ? 'Waiting for counterparty' :
                  roomState.status === 'closed' ? 'Closed' :
                  roomState.status === 'error' ? 'Error' : 'Connecting'
                }
                pulsing={roomState.status === 'active'}
              />
              {roomState.connected && (
                <span className="text-sm text-[#5d5d5d]">Connected to room: <code className="font-mono">{truncate(roomId, 20)}</code></span>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4 text-[#5d5d5d]" />
                <span>Round {roomState.round}/{roomState.maxRounds}</span>
              </div>
              <Separator orientation="vertical" className="h-5" />
              <div className="flex items-center gap-1">
                <DollarSign className="h-4 w-4 text-[#5d5d5d]" />
                <span>Min Δ: {roomState.minDelta}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {roomState.error && (
        <Card className="border-[#e03e3e]/50 bg-[#e03e3e]/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-[#e03e3e]" />
              <span className="text-[#e03e3e]">{roomState.error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Transcript Panel */}
        <div className="lg:col-span-2">
          <Tabs value={showTranscript ? 'transcript' : 'details'} onValueChange={(v) => setShowTranscript(v === 'transcript')}>
            <TabsList>
              <TabsTrigger value="transcript">
                <MessageSquare className="h-4 w-4 mr-2" />
                Transcript
              </TabsTrigger>
              <TabsTrigger value="details">
                <Hash className="h-4 w-4 mr-2" />
                Details
              </TabsTrigger>
            </TabsList>

            <TabsContent value="transcript">
              <Card>
                <CardContent className="p-0">
                  <ScrollArea className="h-[500px]" ref={scrollAreaRef}>
                    <div className="p-4 space-y-3">
                      {roomState.transcript.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-[#5d5d5d]">
                          <MessageSquare className="h-12 w-12 mb-3 opacity-30" />
                          <p>No messages yet. Waiting for negotiation to start...</p>
                        </div>
                      ) : (
                        roomState.transcript.map((msg, index) => renderMessage(msg, index))
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="details">
              <div className="space-y-4">
                {/* Room Info */}
                <Card>
                  <CardHeader>
                    <CardTitle>Room Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-[#5d5d5d]">Room ID</p>
                        <p className="font-mono text-sm break-all">{roomId}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[#5d5d5d]">Transcript Hash</p>
                        <p className="font-mono text-sm break-all">{roomState.transcriptHash ? truncate(roomState.transcriptHash, 30) : 'Pending'}</p>
                      </div>
                    </div>
                    {roomState.deal && (
                      <div className="p-3 bg-[#3fb950]/10 border border-[#3fb950]/30 rounded">
                        <p className="font-medium text-[#3fb950] mb-2">Deal Closed</p>
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div>
                            <p className="text-[#5d5d5d]">Unit Price</p>
                            <p className="font-mono font-medium">{formatCurrency(roomState.deal.unitPrice, 6)}</p>
                          </div>
                          <div>
                            <p className="text-[#5d5d5d]">Quantity</p>
                            <p className="font-mono font-medium">{roomState.deal.qty}</p>
                          </div>
                          <div>
                            <p className="text-[#5d5d5d]">Total</p>
                            <p className="font-mono font-medium">{formatCurrency(roomState.deal.totalUsdc, 6)} USDC</p>
                          </div>
                          <div className="col-span-3">
                            <p className="text-[#5d5d5d]">Terms</p>
                            <p className="font-mono text-xs">{roomState.deal.terms}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Party Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>You ({role === 'buyer' ? 'Buyer' : 'Seller'})</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          {role.charAt(0).toUpperCase()}
                        </Avatar>
                        <span className="font-medium">{role === 'buyer' ? 'Agent #1' : 'Agent #2'}</span>
                      </div>
                      <div className="text-sm text-[#5d5d5d] font-mono">{role === 'buyer' ? '0x1111...1111' : '0x2222...2222'}</div>
                      {roomState.myBound && (
                        <div className="p-2 bg-black/5 rounded">
                          <p className="text-xs text-[#5d5d5d]">Your {role === 'buyer' ? 'Max Price' : 'Floor Price'}</p>
                          <p className="font-mono font-medium">{formatCurrency(roomState.myBound, 6)}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Counterparty ({role === 'buyer' ? 'Seller' : 'Buyer'})</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          {role === 'buyer' ? 'S' : 'B'}
                        </Avatar>
                        <span className="font-medium">{role === 'buyer' ? 'Agent #2' : 'Agent #1'}</span>
                      </div>
                      <div className="text-sm text-[#5d5d5d] font-mono">{role === 'buyer' ? '0x2222...2222' : '0x1111...1111'}</div>
                      {roomState.lastTerms && (
                        <div className="p-2 bg-[#5d5d5d]/5 rounded">
                          <p className="text-xs text-[#5d5d5d]">Their Last Offer</p>
                          <p className="font-mono font-medium">{formatCurrency(roomState.lastTerms.unitPrice, 6)}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Action Panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
              <CardDescription>Make your move in the negotiation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Counter Offer Form */}
              <div className="space-y-3 p-3 bg-white/50 border border-[#333333]/14 rounded">
                <h4 className="font-medium">Counteroffer</h4>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    label="Price"
                    type="number"
                    step="0.00001"
                    min="0.00001"
                    value={counterofferPrice}
                    onChange={(e) => setCounterofferPrice(e.target.value)}
                    placeholder="0.00015"
                  />
                  <Input
                    label="Qty"
                    type="number"
                    min="1"
                    step="1"
                    value={counterofferQty}
                    onChange={(e) => setCounterofferQty(parseInt(e.target.value) || 1)}
                  />
                </div>
                <Input
                  label="Terms"
                  value={counterofferTerms}
                  onChange={(e) => setCounterofferTerms(e.target.value)}
                  placeholder="per-hour billing"
                />
                <Button 
                  onClick={handleCounteroffer} 
                  loading={isSending}
                  disabled={roomState.status !== 'active' || !counterofferPrice}
                  className="w-full"
                >
                  <ArrowRightLeft className="h-4 w-4 mr-2" />
                  Send Counteroffer
                </Button>
              </div>

              {/* Accept Button */}
              <Button 
                onClick={handleAccept} 
                loading={isSending}
                disabled={!roomState.lastTerms || roomState.status !== 'active'}
                className="w-full"
                variant="default"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Accept Offer ({formatCurrency(roomState.lastTerms?.unitPrice || 0, 6)})
              </Button>

              {/* Reject Button */}
              <Button 
                onClick={handleReject} 
                loading={isSending}
                disabled={roomState.status !== 'active'}
                className="w-full"
                variant="secondary"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Reject & Propose New
              </Button>

              {/* Close Button */}
              <Button 
                onClick={handleClose} 
                loading={isSending}
                disabled={roomState.status !== 'active'}
                className="w-full"
                variant="danger"
              >
                <AlertCircle className="h-4 w-4 mr-2" />
                Walk Away
              </Button>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-[#5d5d5d]">Messages</span>
                <span className="font-mono font-medium">{roomState.transcript.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5d5d5d]">Your Offers</span>
                <span className="font-mono font-medium">
                  {roomState.transcript.filter(m => m.from === role && m.type === 'counteroffer').length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5d5d5d]">Counterparty Offers</span>
                <span className="font-mono font-medium">
                  {roomState.transcript.filter(m => m.from && m.from !== role && m.type === 'counteroffer').length}
                </span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-[#5d5d5d]">Status</span>
                <span className="font-medium capitalize">{roomState.status}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Toast Container */}
      <Toaster position="top-right" richColors />
    </div>
  );
}