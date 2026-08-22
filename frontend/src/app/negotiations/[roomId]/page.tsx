/**
 * Finality Labs - Negotiation Room Page
 * Real-time negotiation interface with WebSocket connection
 */

'use client';

import * as React from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from "next/navigation";
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
  ShieldCheck,
  ShieldAlert,
  CreditCard,
  Wallet,
  RotateCw,
} from 'lucide-react';
import { createNegotiationClient, NegotiationClient } from '@/lib/ws'
import { intakeApi, negotiateApi, chainApi } from '@/lib/api'
import type { RoomSettlementRecord, ClosedDeal, PaymentVerificationRequest, PaymentVerificationResponse, DealPaymentInfo, PaymentState } from '@/types/api'
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
  type: string;
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
  transcript?: NegotiationMessage[];
  turn?: 'buyer' | 'seller' | null;
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

interface PaymentReceipt {
  verified: boolean;
  paymentState: string;
  txHash: string;
  explorerUrl?: string;
  amount: string;
  token: string;
  tokenSymbol: string;
  buyer: string;
  seller: string;
  chainId: number;
  network: string;
  blockNumber?: string;
  timestamp?: number;
}

// Fresh-room state. Spread everywhere (never mutate) so the shared object is
// safe to use as the initial value for useState.
const ROOM_STATE_INITIAL: RoomState = {
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
};

// Automatic reconnect attempts after an unexpected socket close before we give
// up and surface a CONNECTION ERROR with a manual Retry action.
const MAX_RECONNECT_ATTEMPTS = 5;

// ============================================
// Negotiation Room Page
// ============================================

export default function NegotiationRoomPage() {
  
  const params = useParams();
  const searchParams = useSearchParams();
  const { account: wallet, isConnecting, connect, signTypedData, chainId, transferErc20, transferNative } = useWallet();
  
  // Role is authoritative from the URL (`?role=buyer|seller`). It stays null
  // until the query param is available (useSearchParams is empty during the
  // first server-side render and fills in after hydration) — we NEVER default
  // to a role, because auto-connecting under a guessed role would register the
  // wrong actor on the server and corrupt the room's turn.
  const urlRole = searchParams.get('role');
  const role: 'buyer' | 'seller' | null = urlRole === 'buyer' || urlRole === 'seller' ? urlRole : null;

  // Resource type carried into the join identity (set by the create-flow link,
  // e.g. /negotiations/:roomId?role=buyer&resource=gpu). The negotiation server
  // records it on the closed deal so verification validates the real resource.
  const urlResource = searchParams.get('resource');
  const resource: string | undefined = urlResource && urlResource.trim().length > 0 ? urlResource.trim() : undefined;

  const currentAgent = useCurrentAgent(role ?? 'buyer');

  const [roomId, setRoomId] = React.useState('');

  // Imperative connection guards. `clientRef` mirrors `client` state so socket
  // callbacks always act on the current client; the refs below prevent
  // StrictMode double-effects from creating duplicate sockets / join frames.
  const clientRef = React.useRef<NegotiationClient | null>(null);
  const connectingRef = React.useRef(false);
  const intentionalDisconnectRef = React.useRef(false);
  const reconnectAttemptsRef = React.useRef(0);

  // Latest callbacks held in refs so reconnect timers / socket handlers never
  // act on a stale render closure.
  const handleAutoConnectRef = React.useRef<() => void>(() => {});
  const handleIncomingMessageRef = React.useRef<(m: NegotiationMessage) => void>(() => {});

  // Tear down the current connection and reset every guard. Used when the room
  // id changes and on explicit disconnect.
  const resetConnection = React.useCallback(() => {
    intentionalDisconnectRef.current = true;
    clientRef.current?.disconnect();
    clientRef.current = null;
    connectingRef.current = false;
    reconnectAttemptsRef.current = 0;
    setClient(null);
    setRoomState(ROOM_STATE_INITIAL);
  }, []);

  const roomIdParam = typeof params?.roomId === 'string' ? (params.roomId as string) : null;

  React.useEffect(() => {
    if (roomIdParam) {
      resetConnection();
      setRoomId(roomIdParam);
    }
  }, [roomIdParam, resetConnection]);

  const [client, setClient] = React.useState<NegotiationClient | null>(null);
  const [roomState, setRoomState] = React.useState<RoomState>(ROOM_STATE_INITIAL);
  const [messageInput, setMessageInput] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);
  const [showTranscript, setShowTranscript] = React.useState(true);
  const [counterofferPrice, setCounterofferPrice] = React.useState('');
  const [counterofferQty, setCounterofferQty] = React.useState(1);
  const [counterofferTerms, setCounterofferTerms] = React.useState('per-hour billing');
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const scrollAreaRef = React.useRef<HTMLDivElement>(null);

  // Deal → Verification transition state. The verification itself is computed
  // by the EXISTING verification layer in the negotiate server when the real
  // `deal-closed` fires; we poll the read endpoint for the REAL result.
  const [verificationRecord, setVerificationRecord] = React.useState<RoomSettlementRecord | null>(null);

  // Approval-workflow action forms (seller completion / buyer decision).
  const [showSellerForm, setShowSellerForm] = React.useState(false);
  const [sellerProof, setSellerProof] = React.useState('');
  const [sellerNotes, setSellerNotes] = React.useState('');
  const [showBuyerForm, setShowBuyerForm] = React.useState(false);
  const [buyerDecisionValue, setBuyerDecisionValue] = React.useState<'approve' | 'reject'>('approve');
  const [buyerRejectionReason, setBuyerRejectionReason] = React.useState('');
  const [buyerNotes, setBuyerNotes] = React.useState('');
  const [actionSubmitting, setActionSubmitting] = React.useState(false);

  // Direct on-chain ERC-20 payment flow state
  const [paymentInfo, setPaymentInfo] = React.useState<DealPaymentInfo | null>(null);
  const [paymentState, setPaymentState] = React.useState<PaymentState>('payment_pending');
  const [paymentSubmitting, setPaymentSubmitting] = React.useState(false);
  const [paymentTxHash, setPaymentTxHash] = React.useState<string | null>(null);
  const [paymentError, setPaymentError] = React.useState<string | null>(null);
  const [verificationResult, setVerificationResult] = React.useState<PaymentVerificationResponse | null>(null);
  const [paymentReceipt, setPaymentReceipt] = React.useState<PaymentReceipt | null>(null);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [roomState.transcript, scrollToBottom]);

  // Auto-connect to the room using the current agent identity: the wallet's
  // registered ERC-8004 agent when available, otherwise the project's existing
  // mock-agent fallback. The real WebSocket always connects and a real `join`
  // frame is always sent — we never fake a connection, and we never silently
  // stall the UI: if no identity exists the Connect Wallet state takes over.
  const handleAutoConnect = React.useCallback(async () => {
    const room = roomId.trim();
    if (!room || !role) return;
    // Guard against StrictMode double-effects / reconnect timers firing while
    // a socket already exists or a connect attempt is in flight.
    if (connectingRef.current) return;

    // The connection's role is authoritative. If the live client holds a
    // DIFFERENT role than the page's resolved role (URL role changed, or
    // hydration resolved after an eager connect), tear it down and reconnect
    // under the correct role — never act under a stale role.
    const existing = clientRef.current;
    if (existing && existing.getRole() !== role) {
      intentionalDisconnectRef.current = true;
      existing.disconnect();
      clientRef.current = null;
      setClient(null);
    } else if (existing && roomState.connected) {
      return; // already connected under the current role
    }

    const agent = currentAgent;
    if (!agent) {
      setRoomState(prev => ({ ...prev, status: 'connecting', error: undefined }));
      return; // wallet required — the Connect Wallet card drives the next step
    }

    connectingRef.current = true;
    intentionalDisconnectRef.current = false;
    reconnectAttemptsRef.current = 0;
    setRoomState(prev => ({ ...prev, connected: false, status: 'connecting', error: undefined }));

    const identity = {
      agentRegistry: agent.agentRegistry,
      agentId: agent.agentId,
      wallet: agent.wallet,
      ...(resource ? { resource } : {}),
      ...(role === 'buyer'
        ? { maxUnitPrice: 0.0002 }
        : { floorUnitPrice: 0.0001 }),
    };

    const negotiationClient = createNegotiationClient({
      roomId: room,
      role,
      identity,
      wsUrl: 'ws://localhost:3002',
      onMessage: (message) => {
        handleIncomingMessageRef.current(message);
      },
      onConnect: (connected) => {
        // Ignore stale callbacks from a superseded client (StrictMode remount).
        if (!connected || clientRef.current !== negotiationClient) return;
        reconnectAttemptsRef.current = 0;
        setRoomState(prev => ({ ...prev, connected: true, status: 'waiting', error: undefined }));
      },
      onError: (error) => {
        if (clientRef.current !== negotiationClient) return;
        setRoomState(prev => ({ ...prev, error: error.message, status: 'error' }));
        toast.error('Connection error', { description: error.message });
      },
      onClose: () => {
        if (clientRef.current !== negotiationClient) return;
        clientRef.current = null;
        setClient(null);
        if (intentionalDisconnectRef.current) {
          setRoomState(prev => ({ ...prev, connected: false, status: 'connecting' }));
          return;
        }
        // Unexpected close: reconnect automatically (backoff) so a dropped
        // socket / server restart resumes the session. The server releases the
        // role slot on disconnect, so the rejoin is clean.
        if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          setRoomState(prev => ({ ...prev, connected: false, status: 'error', error: 'Connection lost — please retry.' }));
          return;
        }
        const attempt = reconnectAttemptsRef.current;
        reconnectAttemptsRef.current += 1;
        const delay = Math.min(500 * 2 ** attempt, 5000);
        setTimeout(() => {
          handleAutoConnectRef.current();
        }, delay);
      },
    });

    clientRef.current = negotiationClient;
    setClient(negotiationClient);
    try {
      await negotiationClient.connect();
    } catch {
      // connection failure is surfaced through onError/onClose
    } finally {
      connectingRef.current = false;
    }
  }, [roomId, role, currentAgent, roomState.connected]);

  // Keep the reconnect / retry paths on the latest handler.
  handleAutoConnectRef.current = handleAutoConnect;

  // Trigger auto-connect once the room id and an agent identity are available.
  // StrictMode-safe: handleAutoConnect's refs prevent duplicate sockets/joins.
  // A role change (URL hydration resolving, or the `?role=` param changing on
  // the same route without a remount) re-runs this: if the live client's role
  // mismatches, handleAutoConnect tears it down and rejoins under the correct
  // role instead of silently acting under a stale one.
  useEffect(() => {
    if (!roomId || !role || !currentAgent) return;
    const current = clientRef.current;
    const roleMismatch = !!current && current.getRole() !== role;
    if (roomState.connected && !roleMismatch) return;
    handleAutoConnectRef.current();
  }, [roomId, role, currentAgent, roomState.connected, wallet]);

  // Tear the socket down on unmount and reset guards so StrictMode's simulated
  // remount (and any real navigation away) never leaves a live socket behind.
  useEffect(() => {
    return () => {
      intentionalDisconnectRef.current = true;
      clientRef.current?.disconnect();
      clientRef.current = null;
      connectingRef.current = false;
      reconnectAttemptsRef.current = 0;
    };
  }, []);

  // Persist the closed deal so the next payment task can consume the REAL values.
  const persistDeal = useCallback((deal: ClosedDeal, transcriptHash?: string) => {
    try {
      sessionStorage.setItem(
        `finality:deal:${roomId}`,
        JSON.stringify({ roomId, deal, transcriptHash, closedAt: new Date().toISOString() })
      );
    } catch {
      // storage may be unavailable — retention is best-effort
    }
  }, [roomId]);

  // Persist the full verification record (real deal + real verdicts) for downstream tasks.
  const persistSettlement = useCallback((record: RoomSettlementRecord) => {
    try {
      sessionStorage.setItem(`finality:settlement:${roomId}`, JSON.stringify(record));
    } catch {
      // storage may be unavailable — retention is best-effort
    }
  }, [roomId]);

  // Once the deal closes the EXISTING verification layer runs in the negotiate
  // server. Poll the real read endpoint until the record (with its real
  // verdicts) is available, then CONTINUE polling until a truly final
  // verification status is reached. A "rejected" status is NOT final if any
  // verifier indicates it's actionable (metadata.requiresAction), meaning the
  // workflow is waiting for seller completion or buyer approval. Only stop
  // polling when: verified, disputed, error, OR rejected with no actionable
  // verdicts (truly final rejection). This ensures both buyer and seller
  // converge to the same final state as the approval workflow progresses.
  useEffect(() => {
    if (!roomId || roomState.status !== 'closed' || !roomState.deal) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const MAX_ATTEMPTS = 180; // ~6 minutes max (2s intervals)

    const hasActionableVerdict = (verdicts: Array<{ metadata?: Record<string, unknown> }>) =>
      verdicts.some((v) => v.metadata?.requiresAction);

    const isTrulyFinal = (record: { verification?: { status: string; verdicts?: Array<{ metadata?: Record<string, unknown> }> } }) => {
      const status = record.verification?.status;
      if (status === 'verified' || status === 'disputed' || status === 'error') return true;
      if (status === 'rejected') {
        // Rejected is only truly final if NO verifier indicates an action is required
        const verdicts = record.verification?.verdicts ?? [];
        return !hasActionableVerdict(verdicts);
      }
      return false;
    };

    const poll = async () => {
      if (cancelled) return;
      if (attempts >= MAX_ATTEMPTS) {
        console.warn('[poll] Max verification polling attempts reached');
        return;
      }
      attempts += 1;
      try {
        const record = await negotiateApi.getSettlement(roomId);
        if (cancelled) return;
        if (record?.verification) {
          setVerificationRecord(record);
          persistSettlement(record);
          // Continue polling until truly final status
          if (!isTrulyFinal(record)) {
            timer = setTimeout(poll, 2000);
          }
        } else {
          timer = setTimeout(poll, 1000);
        }
      } catch {
        if (!cancelled) timer = setTimeout(poll, 1000);
      }
    };

    timer = setTimeout(poll, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [roomId, roomState.status, roomState.deal, persistSettlement]);

  // Handle incoming messages
  const handleIncomingMessage = (message: NegotiationMessage) => {
    setRoomState(prev => {
      // Reconnect snapshot from the server: restore the transcript + turn so a
      // rejoining party resumes the negotiation instead of restarting it.
      if (message.type === 'system' && message.kind === 'resume') {
        return {
          ...prev,
          transcript: Array.isArray(message.transcript) ? message.transcript : prev.transcript,
          round: typeof message.round === 'number' ? message.round : prev.round,
          lastTerms: message.lastTerms ?? prev.lastTerms,
          status: 'active',
          counterpartyIdentity: {
            agentRegistry: '',
            agentId: role === 'buyer' ? 'Seller' : 'Buyer',
            wallet: '',
          },
        };
      }

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
            } else if (message.message?.includes('left')) {
              // Counterparty disconnected — back to waiting; the role slot is
              // released server-side so they can reconnect cleanly.
              newState.counterpartyIdentity = null;
              newState.status = 'waiting';
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
            persistDeal(message.deal, message.transcriptHash);
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

  // Keep the socket handler on the latest render's message handler.
  handleIncomingMessageRef.current = handleIncomingMessage;

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

// Proceed to Payment — fetch payment info and initiate on-chain payment (native or ERC-20)
  const handleProceedToPayment = async () => {
    console.log('[PAYMENT FLOW] Proceed clicked', { roomId, role, wallet });
    if (!verificationRecord || !roomState.deal || !wallet) return;
    if (role !== 'buyer') {
      toast.error('Only the buyer can initiate payment');
      return;
    }

    // Prevent double-submission
    if (paymentSubmitting) {
      console.log('[PAYMENT FLOW] Already submitting, ignoring duplicate click');
      return;
    }

    setPaymentSubmitting(true);
    setPaymentError(null);
    setPaymentState('payment_submitted');
    setPaymentTxHash(null);
    setVerificationResult(null);

    try {
      // Fetch payment info from backend (token, amount, recipient, etc.)
      const info = await chainApi.getDealPaymentInfo(roomId);
      console.log('[PAYMENT FLOW] Payment info received', { 
        isNative: info.isNative, 
        tokenSymbol: info.tokenSymbol, 
        amount: info.amount, 
        sellerAddress: info.sellerAddress,
        chainId: info.chainId,
      });
      setPaymentInfo(info);

      // Use amount from payment info (already converted to base units by backend)
      const amountInBaseUnits = info.amount ?? Math.round(info.totalUsdc * Math.pow(10, info.tokenDecimals)).toString();

      const isNative = info.isNative ?? (info.tokenAddress === 'native' || !info.tokenAddress || info.tokenAddress === '0x0000000000000000000000000000000000000000');
      const tokenLabel = isNative ? 'TBTC (native)' : `${info.tokenSymbol} (ERC-20)`;

      toast.info('Initiating payment...', {
        description: `Preparing to transfer ${info.totalUsdc} ${info.tokenSymbol} (${amountInBaseUnits} base units) to ${truncate(info.sellerAddress, 10)} via ${tokenLabel}`,
      });

      let txHash: string;
      if (isNative) {
        // Execute native GOAT transfer via connected buyer wallet
        txHash = await transferNative(info.sellerAddress, amountInBaseUnits);
      } else {
        // Execute REAL ERC-20 transfer via connected buyer wallet
        txHash = await transferErc20(info.tokenAddress, info.sellerAddress, amountInBaseUnits);
      }
      
      setPaymentTxHash(txHash);
      setPaymentState('payment_confirming');
      toast.success('Transaction submitted', { description: `Tx: ${truncate(txHash, 12)} — confirming on-chain...` });

      // Verify payment on-chain via backend
      console.log('[PAYMENT_RUNTIME_VERIFY]', { txHash, roomId });
      const verification = await chainApi.verifyPayment(roomId, { txHash });
      console.log('[PAYMENT_RUNTIME_VERIFY_RESULT]', { 
        status: verification.verified ? 'success' : 'failed',
        verified: verification.verified, 
        ok: verification.ok, 
        paymentState: verification.paymentState,
        error: verification.error,
      });
      setVerificationResult(verification);
      
      if (verification.verified === true) {
        // Create payment receipt from verified response
        const receipt: PaymentReceipt = {
          verified: verification.verified,
          paymentState: verification.paymentState,
          txHash: verification.txHash,
          explorerUrl: verification.explorerUrl,
          amount: verification.amount,
          token: verification.token,
          tokenSymbol: verification.tokenSymbol,
          buyer: verification.buyer,
          seller: verification.seller,
          chainId: verification.chainId,
          network: verification.network,
          blockNumber: undefined, // Backend doesn't return block number currently
          timestamp: Date.now(),
        };
        setPaymentReceipt(receipt);
        console.log('[handleProceedToPayment] Payment receipt created:', receipt);
        
        setPaymentState('payment_verified');
        toast.success('Payment verified on-chain', { description: `${verification.amount} ${verification.tokenSymbol} transferred successfully` });
      } else {
        setPaymentState('payment_failed');
        setPaymentError(verification.error || 'Payment verification failed');
        toast.error('Payment verification failed', { description: verification.error || 'Unknown error' });
      }
    } catch (error) {
      const err = error as Error & { code?: number; data?: unknown };
      console.error('[handleProceedToPayment] CATCH BLOCK - Payment error:', {
        message: err.message,
        code: err.code,
        data: err.data,
        stack: err.stack,
        name: err.name,
      });
      
      // Wallet rejection (4001) is NOT a payment failure - user cancelled
      if (err.code === 4001) {
        console.log('[handleProceedToPayment] User cancelled transaction, returning to awaiting signature');
        setPaymentState('payment_submitted'); // Allow retry
        setPaymentError('Transaction cancelled. Click Pay to retry.');
        toast.info('Transaction cancelled', { description: 'Click Pay to try again.' });
      } else {
        const message = err.message || 'Payment failed';
        const details = err.code !== undefined ? ` (code: ${err.code})` : '';
        const fullMessage = `${message}${details}`;
        setPaymentError(fullMessage);
        setPaymentState('payment_failed');
        toast.error('Payment failed', { description: fullMessage });
      }
    } finally {
      setPaymentSubmitting(false);
    }
  };

  // Re-fetch the live settlement record after a verification action so the
  // card reflects the REAL re-run result from the negotiate server.
  const refreshVerificationRecord = useCallback(async () => {
    if (!roomId) return;
    try {
      const record = await negotiateApi.getSettlement(roomId);
      if (record?.verification) {
        setVerificationRecord(record);
        persistSettlement(record);
      }
    } catch {
      // the record may not be served yet — keep the last known state
    }
  }, [roomId, persistSettlement]);

  // Seller marks the work as complete → re-verify (real result via refresh).
  const handleSubmitCompletion = async () => {
    if (!verification?.requestId || !currentAgent || !sellerProof.trim()) return;
    setActionSubmitting(true);
    try {
      await chainApi.verifications.submitSellerCompletion({
        requestId: verification.requestId,
        sellerAgentId: currentAgent.agentId,
        proof: sellerProof.trim(),
        notes: sellerNotes.trim() || undefined,
      });
      toast.success('Completion submitted — re-running verification');
      setSellerProof('');
      setSellerNotes('');
      setShowSellerForm(false);
      await refreshVerificationRecord();
    } catch (error) {
      toast.error(`Failed to submit completion: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setActionSubmitting(false);
    }
  };

  // Buyer approves/rejects delivery → re-verify (real result via refresh).
  const handleBuyerDecision = async (decision: 'approve' | 'reject') => {
    if (!verification?.requestId || !currentAgent) return;
    if (decision === 'reject' && !buyerRejectionReason.trim()) return;
    setActionSubmitting(true);
    try {
      await chainApi.verifications.submitBuyerDecision({
        requestId: verification.requestId,
        buyerAgentId: currentAgent.agentId,
        decision,
        rejectionReason: decision === 'reject' ? buyerRejectionReason.trim() : undefined,
        notes: buyerNotes.trim() || undefined,
      });
      toast.success(decision === 'approve' ? 'Delivery approved — re-running verification' : 'Delivery rejected');
      setBuyerRejectionReason('');
      setBuyerNotes('');
      setShowBuyerForm(false);
      await refreshVerificationRecord();
    } catch (error) {
      toast.error(`Failed to submit decision: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setActionSubmitting(false);
    }
  };

  // Disconnect
  const handleDisconnect = () => {
    resetConnection();
    setRoomState(ROOM_STATE_INITIAL);
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

  // Derived deal→verification state (REAL record from the negotiate server).
  const verification = verificationRecord?.verification ?? null;
  const resultPhase = verification
    ? verification.passed && verification.status === 'verified'
      ? 'verified'
      : 'rejected'
    : null;
  const rejectionReasons =
    verification?.verdicts
      ?.filter((v) => v.rejectionReason)
      .map((v) => ({ verifier: v.verifierName, reason: v.rejectionReason })) ?? [];

  // Which approval-workflow actions are still outstanding (from the real
  // verdict metadata emitted by the seller-completion / buyer-approval
  // verifiers). These gate the action buttons below.
  const requiresSellerCompletion =
    verification?.verdicts?.some((v) => v.metadata?.requiresAction === 'seller-submit') ?? false;
  const requiresBuyerDecision =
    verification?.verdicts?.some((v) => v.metadata?.requiresAction === 'buyer-decide') ?? false;

  const FlowStep = ({ label, state }: { label: string; state: 'done' | 'active' | 'pending' }) => (
    <div className="flex items-center gap-2">
      {state === 'done' ? (
        <CheckCircle className="h-4 w-4 text-[#3fb950]" />
      ) : state === 'active' ? (
        <Loader2 className="h-4 w-4 text-[#3fb950] animate-spin" />
      ) : (
        <AlertCircle className="h-4 w-4 text-[#5d5d5d]" />
      )}
      <span className={`text-sm ${state === 'done' ? 'text-[#3fb950]' : state === 'active' ? 'text-[#3fb950]' : 'text-[#5d5d5d]'}`}>{label}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageContainer
        title="Negotiation Room"
        description="Real-time negotiation with counterparty"
        action={
          !roomState.connected ? (
            roomState.status === 'error' ? (
              <Button variant="secondary" onClick={() => handleAutoConnectRef.current()}>
                <RotateCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            ) : !role ? null : currentAgent ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-[#5d5d5d]">Auto-connecting to room <code className="font-mono">{truncate(roomId, 20)}</code> as <span className="font-medium capitalize">{role}</span>...</span>
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : (
              <Button onClick={() => connect()} loading={isConnecting}>
                <Wallet className="h-4 w-4 mr-2" />
                Connect Wallet
              </Button>
            )
          ) : (
            <Button variant="secondary" onClick={handleDisconnect}>
              Disconnect
            </Button>
          )}
      />

      {/* Connect Wallet (only when a role is resolved and no agent identity is available to join with) */}
      {role && !currentAgent && (
        <Card className="mb-4 border-[#f5a623]/50 bg-[#f5a623]/5">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-3">
                <Wallet className="h-5 w-5 text-[#f5a623]" />
                <div>
                  <p className="font-medium">Wallet connection required</p>
                  <p className="text-sm text-[#5d5d5d]">
                    No agent identity is available to join this room. Connect your wallet to use your ERC-8004 agent — the room connection resumes automatically.
                  </p>
                </div>
              </div>
              <Button onClick={() => connect()} loading={isConnecting} className="ml-auto">
                <Wallet className="h-4 w-4 mr-2" />
                Connect Wallet
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
                  roomState.status === 'error' ? 'Connection Error' : 'Connecting'
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
                <span>Min Δ: {Math.round(roomState.minDelta * 100)}% of price</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {roomState.error && (
        <Card className="border-[#e03e3e]/50 bg-[#e03e3e]/5">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <AlertCircle className="h-5 w-5 text-[#e03e3e]" />
              <span className="text-[#e03e3e]">{roomState.error}</span>
              <Button
                variant="secondary"
                size="sm"
                className="ml-auto"
                onClick={() => handleAutoConnectRef.current()}
              >
                <RotateCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deal → Verification flow (real record from the negotiate server) */}
      {roomState.status === 'closed' && roomState.deal && (
        <Card className="border-[#3fb950]/40 bg-[#0d1117]/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#3fb950]" />
              Deal Verification
            </CardTitle>
            <CardDescription>
              {resultPhase
                ? `Real verification record for closed deal ${truncate(roomId, 16)} — request ${verification?.requestId ? truncate(verification.requestId, 12) : 'n/a'}`
                : 'The negotiation server is running its verification layer on the closed deal...'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Pipeline */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <FlowStep label="Deal Closed" state="done" />
              <FlowStep label="Verification" state={verification ? 'done' : 'active'} />
              <FlowStep label="Verifying" state={verification ? 'done' : 'active'} />
              <FlowStep
                label={resultPhase === 'verified' ? 'Verified' : resultPhase === 'rejected' ? 'Rejected' : 'Pending'}
                state={resultPhase ? 'done' : 'pending'}
              />
            </div>

            {/* Real deal data */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-black/20 rounded">
              <div>
                <p className="text-xs text-[#5d5d5d]">Unit Price</p>
                <p className="font-mono font-medium">{formatCurrency(roomState.deal.unitPrice, 6)}</p>
              </div>
              <div>
                <p className="text-xs text-[#5d5d5d]">Quantity</p>
                <p className="font-mono font-medium">{roomState.deal.qty}</p>
              </div>
              <div>
                <p className="text-xs text-[#5d5d5d]">Total</p>
                <p className="font-mono font-medium">{formatCurrency(roomState.deal.totalUsdc, 6)} USDC</p>
              </div>
              <div>
                <p className="text-xs text-[#5d5d5d]">Transcript Hash</p>
                <p className="font-mono text-sm break-all">{roomState.transcriptHash ? truncate(roomState.transcriptHash, 16) : 'Pending'}</p>
              </div>
            </div>

            {/* Result */}
            {resultPhase === 'verified' && (
              <div className="space-y-4">
                {/* Payment Info & Submitted - show payment details and status */}
                {paymentInfo && (
                  <div className="p-4 bg-[#f5a623]/10 border border-[#f5a623]/40 rounded space-y-4">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5 text-[#f5a623]" />
                      <p className="font-medium text-[#f5a623]">On-Chain Payment</p>
                    </div>
                    <p className="text-sm text-[#5d5d5d]">
                      {paymentInfo.isNative
                        ? 'Direct native TBTC transfer on GOAT Testnet3 (chainId 48816). No merchant API required.'
                        : 'Direct ERC-20 GOAT token transfer on GOAT Testnet3 (chainId 48816). No merchant API required.'}
                    </p>
                    
                    {/* Payment Details */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-3 bg-black/20 rounded">
                      <div>
                        <p className="text-xs text-[#5d5d5d]">Amount</p>
                        <p className="font-mono font-medium">{paymentInfo.totalUsdc} {paymentInfo.tokenSymbol}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[#5d5d5d]">Token</p>
                        <p className="font-mono text-sm">{paymentInfo.tokenSymbol} ({truncate(paymentInfo.tokenAddress, 10)})</p>
                      </div>
                      <div>
                        <p className="text-xs text-[#5d5d5d]">Recipient</p>
                        <p className="font-mono text-sm break-all">{truncate(paymentInfo.sellerAddress, 16)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[#5d5d5d]">Buyer</p>
                        <p className="font-mono text-sm break-all">{truncate(paymentInfo.buyerAddress, 16)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[#5d5d5d]">Network</p>
                        <p className="font-medium">GOAT Testnet3 (Chain ID: {paymentInfo.chainId})</p>
                      </div>
                    </div>

                    {/* Network check */}
                    <div className="p-3 bg-black/20 rounded">
                      <p className="text-xs text-[#5d5d5d]">Wallet Network: <span className="font-mono">
                        {wallet && chainId === 48816 ? 'GOAT Testnet3 ✓' : chainId ? `Chain ID ${chainId} — Will auto-switch` : 'Not connected'}
                      </span></p>
                    </div>

                    {/* Payment status progression */}
                    <div className="space-y-2 p-3 bg-black/20 rounded">
                      <div className="flex items-center gap-2 text-xs">
                        <span className={`w-2 h-2 rounded-full ${paymentState !== 'payment_pending' ? 'bg-[#3fb950]' : 'bg-[#5d5d5d]'}`} />
                        <span className={paymentState !== 'payment_pending' ? 'text-[#3fb950]' : 'text-[#5d5d5d]'}>, Initiated</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className={`w-2 h-2 rounded-full ${['payment_submitted', 'payment_confirming', 'payment_verified'].includes(paymentState) ? 'bg-[#3fb950]' : 'bg-[#5d5d5d]'}`} />
                        <span className={['payment_submitted', 'payment_confirming', 'payment_verified'].includes(paymentState) ? 'text-[#3fb950]' : 'text-[#5d5d5d]'}>{paymentState === 'payment_submitted' ? 'Awaiting signature' : 'Submitted to wallet'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className={`w-2 h-2 rounded-full ${['payment_confirming', 'payment_verified'].includes(paymentState) ? 'bg-[#3fb950]' : 'bg-[#5d5d5d]'}`} />
                        <span className={['payment_confirming', 'payment_verified'].includes(paymentState) ? 'text-[#3fb950]' : 'text-[#5d5d5d]'}>, Confirming on-chain</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className={`w-2 h-2 rounded-full ${paymentState === 'payment_verified' ? 'bg-[#3fb950]' : 'bg-[#5d5d5d]'}`} />
                        <span className={paymentState === 'payment_verified' ? 'text-[#3fb950]' : 'text-[#5d5d5d]'}>, Verified</span>
                      </div>
                    </div>

                    {/* Error display */}
                    {paymentError && paymentState === 'payment_failed' && (
                      <p className="text-sm text-[#e03e3e]">{paymentError}</p>
                    )}
                  </div>
                )}

                {/* Payment Receipt - shown after successful verification */}
                {paymentReceipt && (
                  <div className="p-4 bg-[#3fb950]/10 border border-[#3fb950]/40 rounded space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-[#3fb950]" />
                        <p className="font-medium text-[#3fb950]">PAYMENT RECEIPT</p>
                      </div>
                      <span className="px-2 py-1 bg-[#3fb950]/20 text-[#3fb950] text-xs font-mono rounded">VERIFIED ✓</span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-black/20 rounded">
                      <div>
                        <p className="text-xs text-[#5d5d5d]">Transaction Hash</p>
                        <div className="flex items-center gap-2">
                          <p className="font-mono text-xs break-all">{paymentReceipt.txHash}</p>
                          <button
                            onClick={() => navigator.clipboard.writeText(paymentReceipt.txHash)}
                            className="px-2 py-1 text-xs bg-[#5d5d5d]/50 hover:bg-[#5d5d5d] rounded border border-[#5d5d5d]/30 transition-colors"
                            title="Copy TX Hash"
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-[#5d5d5d]">Amount</p>
                        <p className="font-mono">
                          {(Number(BigInt(paymentReceipt.amount) / BigInt(1e18))).toFixed(6)} {paymentReceipt.tokenSymbol}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-[#5d5d5d]">Token</p>
                        <p className="font-mono text-xs">{paymentReceipt.tokenSymbol} ({paymentReceipt.token === 'native' ? 'native' : truncate(paymentReceipt.token, 10)})</p>
                      </div>
                      <div>
                        <p className="text-xs text-[#5d5d5d]">Network</p>
                        <p className="font-medium">{paymentReceipt.network} (Chain ID: {paymentReceipt.chainId})</p>
                      </div>
                      <div>
                        <p className="text-xs text-[#5d5d5d]">Buyer</p>
                        <p className="font-mono text-xs break-all">{truncate(paymentReceipt.buyer, 16)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[#5d5d5d]">Seller</p>
                        <p className="font-mono text-xs break-all">{truncate(paymentReceipt.seller, 16)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[#5d5d5d]">Status</p>
                        <p className="font-mono text-xs text-[#3fb950]">{paymentReceipt.paymentState}</p>
                      </div>
                      <div>
                        <p className="text-xs text-[#5d5d5d]">Timestamp</p>
                        <p className="font-mono text-xs">
                          {paymentReceipt.timestamp ? new Date(paymentReceipt.timestamp).toLocaleString() : 'N/A'}
                        </p>
                      </div>
                    </div>
                    
                    {paymentReceipt.explorerUrl && (
                      <a href={paymentReceipt.explorerUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#3fb950] hover:underline inline-flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" />
                        View transaction on explorer
                      </a>
                    )}
                  </div>
                )}

                {/* Payment Failed Result */}
                {verificationResult && !verificationResult.verified && (
                  <div className="p-4 bg-[#e03e3e]/10 border border-[#e03e3e]/40 rounded space-y-2">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-5 w-5 text-[#e03e3e]" />
                      <p className="font-medium text-[#e03e3e]">Payment Verification Failed</p>
                    </div>
                    <p className="text-sm text-[#e03e3e]">{verificationResult.error || 'Unknown verification error'}</p>
                    {verificationResult.details && (
                      <p className="text-xs text-[#5d5d5d] font-mono">{verificationResult.details}</p>
                    )}
                  </div>
                )}

                {/* Initial Proceed to Payment Button */}
                {!paymentInfo && !verificationResult && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[#3fb950]/10 border border-[#3fb950]/40 rounded">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-[#3fb950]" />
                      <div>
                        <p className="font-medium text-[#3fb950]">Verification passed</p>
                        <p className="text-xs text-[#5d5d5d]">All real verifiers approved the deal — settlement is unblocked.</p>
                      </div>
                    </div>
                    <Button onClick={handleProceedToPayment} loading={paymentSubmitting} className="w-full sm:w-auto">
                      <CreditCard className="h-4 w-4 mr-2" />
                      Proceed to Payment
                    </Button>
                  </div>
                )}
              </div>
            )}

            {resultPhase === 'rejected' && (
              <div className="p-3 bg-[#e03e3e]/10 border border-[#e03e3e]/40 rounded space-y-2">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-[#e03e3e]" />
                  <p className="font-medium text-[#e03e3e]">Verification rejected — settlement blocked</p>
                </div>
                <p className="text-sm text-[#5d5d5d]">The real verification layer reported the following rejection reasons:</p>
                <ul className="text-sm space-y-1">
                  {rejectionReasons.map((r, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <XCircle className="h-4 w-4 text-[#e03e3e] mt-0.5 shrink-0" />
                      <span><span className="font-medium">{r.verifier}:</span> {r.reason}</span>
                    </li>
                  ))}
                </ul>
                {verification?.requestId && (
                  <p className="text-xs text-[#5d5d5d] font-mono">Request ID: {verification.requestId}</p>
                )}

                {/* Approval-workflow actions — the seller/buyer submit their
                    part and the server re-verifies; the card then refreshes
                    with the real re-run result. */}
                {role === 'seller' && verification && requiresSellerCompletion && !verification.passed && (
                  <div className="space-y-3 border-t border-[#e03e3e]/30 pt-3">
                    {!showSellerForm ? (
                      <Button
                        onClick={() => setShowSellerForm(true)}
                        className="w-full"
                        size="lg"
                        disabled={actionSubmitting}
                      >
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Mark as Completed
                      </Button>
                    ) : (
                      <div className="space-y-3 p-3 bg-black/20 rounded">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm">Submit Completion Proof</p>
                          <Button variant="ghost" size="sm" onClick={() => setShowSellerForm(false)} disabled={actionSubmitting}>
                            Cancel
                          </Button>
                        </div>
                        <Input
                          label="Proof (Required)"
                          placeholder="Transaction hash, delivery confirmation, API response, etc."
                          value={sellerProof}
                          onChange={(e) => setSellerProof(e.target.value)}
                          disabled={actionSubmitting}
                        />
                        <Textarea
                          label="Notes (Optional)"
                          placeholder="Additional context about completion..."
                          value={sellerNotes}
                          onChange={(e) => setSellerNotes(e.target.value)}
                          rows={3}
                          disabled={actionSubmitting}
                        />
                        <Button
                          onClick={handleSubmitCompletion}
                          disabled={actionSubmitting || !sellerProof.trim()}
                          className="w-full"
                        >
                          {actionSubmitting ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...</>
                          ) : (
                            'Submit Completion'
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {role === 'buyer' && verification && requiresBuyerDecision && !verification.passed && (
                  <div className="space-y-3 border-t border-[#e03e3e]/30 pt-3">
                    {!showBuyerForm ? (
                      <div className="flex gap-2">
                        <Button
                          onClick={() => { setBuyerDecisionValue('approve'); setShowBuyerForm(true); }}
                          className="flex-1"
                          size="lg"
                          disabled={actionSubmitting}
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Approve Delivery
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => { setBuyerDecisionValue('reject'); setShowBuyerForm(true); }}
                          className="flex-1"
                          size="lg"
                          disabled={actionSubmitting}
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3 p-3 bg-black/20 rounded">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm">
                            {buyerDecisionValue === 'approve' ? 'Approve Delivery' : 'Reject Delivery'}
                          </p>
                          <Button variant="ghost" size="sm" onClick={() => setShowBuyerForm(false)} disabled={actionSubmitting}>
                            Cancel
                          </Button>
                        </div>
                        {buyerDecisionValue === 'reject' && (
                          <Input
                            label="Rejection Reason (Required)"
                            placeholder="Why are you rejecting the delivery?"
                            value={buyerRejectionReason}
                            onChange={(e) => setBuyerRejectionReason(e.target.value)}
                            disabled={actionSubmitting}
                          />
                        )}
                        <Textarea
                          label="Notes (Optional)"
                          placeholder="Additional context..."
                          value={buyerNotes}
                          onChange={(e) => setBuyerNotes(e.target.value)}
                          rows={3}
                          disabled={actionSubmitting}
                        />
                        <Button
                          onClick={() => handleBuyerDecision(buyerDecisionValue)}
                          disabled={actionSubmitting || (buyerDecisionValue === 'reject' && !buyerRejectionReason.trim())}
                          className="w-full"
                          variant={buyerDecisionValue === 'approve' ? 'default' : 'danger'}
                        >
                          {actionSubmitting ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...</>
                          ) : (
                            buyerDecisionValue === 'approve' ? 'Approve' : 'Reject'
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
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
                          {(role ?? 'buyer').charAt(0).toUpperCase()}
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