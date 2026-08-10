/**
 * Finality Labs - WebSocket Client for Negotiation
 * Handles real-time communication with the negotiation server (Port 3002)
 */

import {
  type NegotiationMessage,
  type ClientMessage,
  type ServerMessage,
  type PartyIdentity,
  type Terms,
  type ClosedDeal,
  type SystemEnvelope,
  type NegotiationRole,
  type DealResult,
} from '@/types/api';

type MessageHandler = (message: ServerMessage) => void;
type ConnectionHandler = (connected: boolean) => void;
type ErrorHandler = (error: Error) => void;

export interface NegotiationClientConfig {
  roomId: string;
  role: NegotiationRole;
  identity: PartyIdentity;
  wsUrl?: string;
  onMessage?: MessageHandler;
  onConnect?: ConnectionHandler;
  onError?: ErrorHandler;
  onClose?: () => void;
}

export interface NegotiationState {
  connected: boolean;
  role: NegotiationRole | null;
  roomId: string | null;
  round: number;
  maxRounds: number;
  minDelta: number;
  myIdentity: PartyIdentity | null;
  counterpartyIdentity: PartyIdentity | null;
  myBound: number | null;
  transcript: Array<{ type: string; from?: NegotiationRole; round: number; payload: unknown; ts: number }>;
  lastTerms: Terms | null;
  deal: ClosedDeal | null;
  transcriptHash: string | null;
  status: 'connecting' | 'waiting' | 'active' | 'closed' | 'error';
  error: string | null;
}

const DEFAULT_WS_URL = 'ws://localhost:3002';

export class NegotiationClient {
  private ws: WebSocket | null = null;
  private config: NegotiationClientConfig;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private messageQueue: ClientMessage[] = [];
  private state: NegotiationState;

  constructor(config: NegotiationClientConfig) {
    this.config = {
      wsUrl: DEFAULT_WS_URL,
      ...config,
    };

    this.state = {
      connected: false,
      role: null,
      roomId: config.roomId,
      round: 0,
      maxRounds: 10,
      minDelta: 0.01,
      myIdentity: config.identity,
      counterpartyIdentity: null,
      myBound: config.role === 'buyer' ? config.identity.maxUnitPrice ?? null : config.identity.floorUnitPrice ?? null,
      transcript: [],
      lastTerms: null,
      deal: null,
      transcriptHash: null,
      status: 'connecting',
      error: null,
    };
  }

  // ============================================
  // Connection Management
  // ============================================

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `${this.config.wsUrl}/negotiate/${this.config.roomId}`;

console.log("Opening websocket...");
console.log(url);

this.ws = new WebSocket(url);

      this.ws.onopen = () => {
  console.log("WEBSOCKET OPENED");
  console.log('[NegotiationClient] Connected to', url);
        this.state.connected = true;
        this.state.status = 'waiting';
        this.config.onConnect?.(true);
        this.sendJoin();
        this.flushQueue();
        resolve();
      };

      this.ws.onclose = (event) => {
        console.log("WEBSOCKET CLOSED", event.code);
        console.log('[NegotiationClient] Disconnected:', event.code, event.reason);
        this.state.connected = false;
        this.state.status = 'closed';
        this.config.onClose?.();
        this.config.onConnect?.(false);
      };

      this.ws.onerror = (event) => {
        console.log("WEBSOCKET ERROR");
        console.error('[NegotiationClient] WebSocket error:', event);
        this.state.error = 'WebSocket connection error';
        this.state.status = 'error';
        this.config.onError?.(new Error('WebSocket connection error'));
        if (!this.state.connected) {
          reject(new Error('Failed to connect to negotiation server'));
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as ServerMessage;
          this.handleMessage(message);
        } catch (err) {
          console.error('[NegotiationClient] Failed to parse message:', err);
        }
      };
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // ============================================
  // Message Handling
  // ============================================

  private sendJoin(): void {
    const joinMsg: ClientMessage = {
      type: 'join',
      role: this.config.role,
      identity: this.config.identity,
    };
    this.send(joinMsg);
  }

  private handleMessage(message: ServerMessage): void {
    console.log(
  '[NegotiationClient] Received:',
  message.type,
  message.type === 'system' ? message.kind : ''
);

    // Update transcript for all messages
    this.state.transcript.push({
      type: message.type === 'system' ? 'system' : 'msg',
      from: message.type === 'system' ? undefined : message.from,
      round: message.type === 'system' ? 0 : message.round,
      payload: message,
      ts: message.type === 'system' ? Date.now() : message.ts,
    });

    switch (message.type) {
      case 'system':
        this.handleSystemMessage(message);
        break;
      case 'counteroffer':
      case 'accept':
      case 'reject':
        this.handleNegotiationMessage(message);
        break;
    }

    this.config.onMessage?.(message);
  }

  private handleSystemMessage(message: SystemEnvelope): void {
    switch (message.kind) {
      case 'info':
        if (message.message.includes('room ready')) {
          this.state.status = 'active';
          if (this.config.role === 'buyer') {
            // Buyer makes the first move
            this.state.round = 1;
          }
        } else if (message.message.includes('joined')) {
          // Counterparty joined
          this.state.counterpartyIdentity = this.config.role === 'buyer' 
            ? { agentRegistry: '', agentId: 'Seller', wallet: '' } as PartyIdentity 
            : { agentRegistry: '', agentId: 'Buyer', wallet: '' } as PartyIdentity;
        }
        break;

      case 'error':
        this.state.error = message.message;
        this.state.status = 'error';
        break;

      case 'deal-closed':
        this.state.deal = message.deal;
        this.state.transcriptHash = message.transcriptHash;
        this.state.status = 'closed';
        break;

      case 'constraint-hit':
        this.state.lastTerms = message.lastTerms;
        this.state.status = 'closed';
        this.state.error = message.reason;
        break;
    }
  }

  private handleNegotiationMessage(
  message: Exclude<ServerMessage, SystemEnvelope>
): void {
    if (message.from && message.from !== this.config.role) {
      // Counterparty's message
      this.state.counterpartyIdentity = {
        agentRegistry: '',
        agentId: message.from === 'buyer' ? 'Buyer' : 'Seller',
        wallet: '',
      } as PartyIdentity;

      if (message.type === 'counteroffer') {
  this.state.lastTerms = message.terms;
  this.state.round = message.round;
}
    }
  }

  // ============================================
  // Send Methods
  // ============================================

  send(message: ClientMessage): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      return true;
    }
    // Queue for later
    this.messageQueue.push(message);
    return false;
  }

  private flushQueue(): void {
    while (this.messageQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const msg = this.messageQueue.shift();
      if (msg) this.ws.send(JSON.stringify(msg));
    }
  }

  sendCounteroffer(terms: Terms): boolean {
  return this.send({
    type: 'counteroffer',
    from: this.config.role,
    round: this.state.round || 1,
    payload: terms,
    ts: Date.now(),
  });
}


sendAccept(terms: Terms): boolean {
  return this.send({
    type: 'accept',
    from: this.config.role,
    round: this.state.round,
    payload: terms,
    ts: Date.now(),
  });
}

sendReject(reason: string): boolean {
  return this.send({
    type: 'reject',
    from: this.config.role,
    round: this.state.round,
    payload: {
      reason,
    },
    ts: Date.now(),
  });
}

  sendClose(reason: string): boolean {
  return this.send({
    type: 'close',
    from: this.config.role,
    round: this.state.round,
    payload: {
      reason,
    },
    ts: Date.now(),
  });
}

  // ============================================
  // State Access
  // ============================================

  getState(): Readonly<NegotiationState> {
    return { ...this.state };
  }

  getTranscript(): NegotiationState['transcript'] {
    return [...this.state.transcript];
  }

  isConnected(): boolean {
    return this.state.connected;
  }

  getRole(): NegotiationRole {
    return this.config.role;
  }

  getRoomId(): string {
    return this.config.roomId;
  }
}

// Singleton factory
let clientInstance: NegotiationClient | null = null;

export function createNegotiationClient(config: NegotiationClientConfig): NegotiationClient {
  if (clientInstance) {
    clientInstance.disconnect();
  }
  clientInstance = new NegotiationClient(config);
  return clientInstance;
}

export function getNegotiationClient(): NegotiationClient | null {
  return clientInstance;
}

export function destroyNegotiationClient(): void {
  if (clientInstance) {
    clientInstance.disconnect();
    clientInstance = null;
  }
}