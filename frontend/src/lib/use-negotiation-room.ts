/**
 * Finality Labs - WebSocket Hook for Negotiation
 * React hook for real-time WebSocket communication with the negotiation server
 */

'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createNegotiationClient, NegotiationClient, NegotiationClientConfig } from '@/lib/ws';
import { type PartyIdentity, type NegotiationRole, type Terms, type ClosedDeal, type SystemEnvelope } from '@/types/api';
import { toast } from '@/components/ui';

export interface UseNegotiationRoomOptions {
  roomId: string;
  role: NegotiationRole;
  identity: PartyIdentity;
  wsUrl?: string;
  autoConnect?: boolean;
  onDealClosed?: (deal: ClosedDeal, transcriptHash: string) => void;
  onConstraintHit?: (reason: string, lastTerms: Terms | null) => void;
  onError?: (error: string) => void;
  onStatusChange?: (status: 'connecting' | 'waiting' | 'active' | 'closed' | 'error') => void;
}

export interface UseNegotiationRoomReturn {
  // Connection state
  connected: boolean;
  status: 'connecting' | 'waiting' | 'active' | 'closed' | 'error';
  error: string | null;

  // Room state
  round: number;
  maxRounds: number;
  minDelta: number;
  myBound: number | null;
  transcript: Array<{ type: string; from?: NegotiationRole; round: number; payload: unknown; ts: number }>;
  lastTerms: Terms | null;
  deal: ClosedDeal | null;
  transcriptHash: string | null;
  counterpartyIdentity: PartyIdentity | null;

  // Actions
  connect: () => Promise<void>;
  disconnect: () => void;
  sendCounteroffer: (terms: Terms) => boolean;
  sendAccept: (terms: Terms) => boolean;
  sendReject: (reason: string) => boolean;
  sendClose: (reason: string) => boolean;

  // Client instance (for advanced usage)
  client: NegotiationClient | null;
}

export function useNegotiationRoom(options: UseNegotiationRoomOptions): UseNegotiationRoomReturn {
  const {
    roomId,
    role,
    identity,
    wsUrl,
    autoConnect = false,
    onDealClosed,
    onConstraintHit,
    onError,
    onStatusChange,
  } = options;

  const [client, setClient] = useState<NegotiationClient | null>(null);
  const [state, setState] = useState<StateType>({
    connected: false,
    status: 'connecting',
    round: 0,
    maxRounds: 10,
    minDelta: 0.01,
    myBound: role === 'buyer' ? identity.maxUnitPrice ?? null : identity.floorUnitPrice ?? null,
    transcript: [],
    lastTerms: null,
    deal: null,
    transcriptHash: null,
    counterpartyIdentity: null,
    error: null,
  });

  const clientRef = useRef<NegotiationClient | null>(null);
  const isMountedRef = useRef(true);

  // Create client instance
  const createClient = useCallback(() => {
    const negotiationClient = createNegotiationClient({
      roomId,
      role,
      identity,
      wsUrl,
      onMessage: (message) => handleIncomingMessage(message),
      onConnect: (connected) => {
        if (!isMountedRef.current) return;
        setState(prev => ({ ...prev, connected, status: connected ? 'waiting' : 'closed' }));
        onStatusChange?.(connected ? 'waiting' : 'closed');
      },
      onError: (error) => {
        if (!isMountedRef.current) return;
        setState(prev => ({ ...prev, error: error.message, status: 'error' }));
        onError?.(error.message);
        toast.error('Connection error', { description: error.message });
      },
      onClose: () => {
        if (!isMountedRef.current) return;
        setState(prev => ({ ...prev, connected: false, status: 'closed' }));
        onStatusChange?.('closed');
      },
    });

    clientRef.current = negotiationClient;
    setClient(negotiationClient);
    return negotiationClient;
  }, [roomId, role, identity, wsUrl, onError, onStatusChange]);

  // Handle incoming messages
  const handleIncomingMessage = useCallback((message: any) => {
    if (!isMountedRef.current) return;

    setState(prev => {
      const newTranscript = [...prev.transcript, {
        type: message.type === 'system' ? 'system' : 'msg',
        from: message.from,
        round: message.round ?? 0,
        payload: message,
        ts: message.ts ?? Date.now(),
      }];

      let newState = { ...prev, transcript: newTranscript };

      if (message.type === 'system') {
        const systemMsg = message as SystemEnvelope;

        switch (systemMsg.kind) {
          case 'info':
            if (systemMsg.message?.includes('room ready')) {
              newState.status = 'active';
              newState.round = role === 'buyer' ? 1 : prev.round;
              onStatusChange?.('active');
            } else if (systemMsg.message?.includes('joined')) {
              newState.counterpartyIdentity = {
                agentRegistry: '',
                agentId: role === 'buyer' ? 'Seller' : 'Buyer',
                wallet: '',
              } as PartyIdentity;
            }
            break;

          case 'error':
            newState.error = systemMsg.message;
            newState.status = 'error';
            onError?.(systemMsg.message);
            toast.error('Negotiation error', { description: systemMsg.message });
            break;

          case 'deal-closed':
            newState.deal = systemMsg.deal;
            newState.transcriptHash = systemMsg.transcriptHash;
            newState.status = 'closed';
            onStatusChange?.('closed');
            if (onDealClosed) {
              onDealClosed(systemMsg.deal, systemMsg.transcriptHash);
            }
            toast.success('Deal closed!', {
              description: `Price: ${systemMsg.deal.unitPrice} × ${systemMsg.deal.qty} = ${systemMsg.deal.totalUsdc} USDC`,
            });
            break;

          case 'constraint-hit':
            newState.lastTerms = systemMsg.lastTerms;
            newState.status = 'closed';
            newState.error = systemMsg.reason;
            onStatusChange?.('closed');
            if (onConstraintHit) {
              onConstraintHit(systemMsg.reason, systemMsg.lastTerms);
            }
            toast.warning('Negotiation ended', { description: systemMsg.reason });
            break;
        }
      } else if (message.type === 'counteroffer' && message.payload) {
        // Counterparty's message
        newState.lastTerms = message.payload as Terms;
        newState.round = message.round;

        if (message.from && message.from !== role) {
          newState.counterpartyIdentity = {
            agentRegistry: '',
            agentId: message.from === 'buyer' ? 'Buyer' : 'Seller',
            wallet: '',
          } as PartyIdentity;
        }
      }

      return newState;
    });
  }, [role, onDealClosed, onConstraintHit, onError, onStatusChange]);

  // Connect to room
  const connect = useCallback(async () => {
    if (!clientRef.current) {
      createClient();
    }

    try {
      await clientRef.current?.connect();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to connect';
      setState(prev => ({ ...prev, error: message, status: 'error' }));
      onError?.(message);
      toast.error('Connection failed', { description: message });
      throw error;
    }
  }, [createClient, onError]);

  // Disconnect
  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
    setState(prev => ({
      ...prev,
      connected: false,
      status: 'closed',
    }));
    onStatusChange?.('closed');
  }, [onStatusChange]);

  // Send methods
  const sendCounteroffer = useCallback((terms: Terms): boolean => {
    return clientRef.current?.sendCounteroffer(terms) ?? false;
  }, []);

  const sendAccept = useCallback((terms: Terms): boolean => {
    return clientRef.current?.sendAccept(terms) ?? false;
  }, []);

  const sendReject = useCallback((reason: string): boolean => {
    return clientRef.current?.sendReject(reason) ?? false;
  }, []);

  const sendClose = useCallback((reason: string): boolean => {
    return clientRef.current?.sendClose(reason) ?? false;
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    isMountedRef.current = true;

    if (autoConnect && roomId) {
      connect().catch(() => {
        // Error handled in connect()
      });
    }

    return () => {
      isMountedRef.current = false;
      clientRef.current?.disconnect();
    };
  }, [autoConnect, roomId, connect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Memoize the return value to prevent unnecessary re-renders
  return useMemo(() => ({
    connected: state.connected,
    status: state.status,
    error: state.error,
    round: state.round,
    maxRounds: state.maxRounds,
    minDelta: state.minDelta,
    myBound: state.myBound,
    transcript: state.transcript,
    lastTerms: state.lastTerms,
    deal: state.deal,
    transcriptHash: state.transcriptHash,
    counterpartyIdentity: state.counterpartyIdentity,
    connect,
    disconnect,
    sendCounteroffer,
    sendAccept,
    sendReject,
    sendClose,
    client: clientRef.current,
  }), [
    state.connected,
    state.status,
    state.error,
    state.round,
    state.maxRounds,
    state.minDelta,
    state.myBound,
    state.transcript,
    state.lastTerms,
    state.deal,
    state.transcriptHash,
    state.counterpartyIdentity,
    connect,
    disconnect,
    sendCounteroffer,
    sendAccept,
    sendReject,
    sendClose,
  ]);
}

// Type helper for the state shape
type StateType = {
  connected: boolean;
  status: 'connecting' | 'waiting' | 'active' | 'closed' | 'error';
  error: string | null;
  round: number;
  maxRounds: number;
  minDelta: number;
  myBound: number | null;
  transcript: Array<{
    type: string;
    from?: NegotiationRole;
    round: number;
    payload: unknown;
    ts: number;
  }>;
  lastTerms: Terms | null;
  deal: ClosedDeal | null;
  transcriptHash: string | null;
  counterpartyIdentity: PartyIdentity | null;
};