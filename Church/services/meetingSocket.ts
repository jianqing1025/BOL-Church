import type { BibleMessage, HostMessage, ServerMessage } from '../meeting/chatProtocol';

export interface MeetingSocketHandlers {
  onMessage: (message: ServerMessage) => void;
  onOpen?: () => void;
  onClose?: (info: { authFailed: boolean }) => void;
  onError?: (error: unknown) => void;
}

export interface MeetingSocketParams {
  roomId: string;
  name: string;
  password: string;
  isHost: boolean;
}

/**
 * Thin WebSocket wrapper for the meeting chat. Idempotent close so React
 * StrictMode double-mount / unmount is safe.
 */
export class MeetingSocket {
  private ws: WebSocket | null = null;
  private opened = false;
  private closed = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 1000;
  private hasConnected = false;
  private pendingBible: BibleMessage | null = null;

  constructor(private handlers: MeetingSocketHandlers) {}

  connect(params: MeetingSocketParams): void {
    this.closed = false;
    this.opened = false;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = new URL(`${proto}://${window.location.host}/api/meeting/ws`);
    url.searchParams.set('roomId', params.roomId);
    url.searchParams.set('name', params.name);
    url.searchParams.set('password', params.password);
    url.searchParams.set('host', params.isHost ? '1' : '0');

    const ws = new WebSocket(url.toString());
    this.ws = ws;

    ws.addEventListener('open', () => {
      if (this.closed || this.ws !== ws) return;
      this.opened = true;
      this.hasConnected = true;
      this.retryDelay = 1000;
      if (this.pendingBible) {
        const pending = this.pendingBible;
        this.pendingBible = null;
        this.sendBible(pending);
      }
      this.handlers.onOpen?.();
    });
    ws.addEventListener('message', (event) => {
      if (this.closed || this.ws !== ws) return;
      try { this.handlers.onMessage(JSON.parse(event.data as string) as ServerMessage); } catch { /* ignore */ }
    });
    ws.addEventListener('error', (event) => this.handlers.onError?.(event));
    ws.addEventListener('close', (event) => {
      if (this.closed || this.ws !== ws) return;
      // Closing before it ever opened almost always means the Worker rejected
      // the credentials/room (it returns a 4xx instead of upgrading).
      const authFailed = !this.hasConnected;
      this.opened = false;
      this.handlers.onClose?.({ authFailed });
      if (authFailed || event.code === 1000 || this.closed) { this.closed = true; return; }
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        if (!this.closed) this.connect(params);
      }, this.retryDelay);
      this.retryDelay = Math.min(this.retryDelay * 2, 10000);
    });
  }

  send(text: string): void {
    this.post({ type: 'message', text });
  }

  /** Move the whole room to a passage (relayed only if the server allows it). */
  sendBible(message: BibleMessage): void {
    if (!this.closed && this.ws && this.ws.readyState !== WebSocket.OPEN) {
      // Keep the latest destination while connecting; scroll must not replace
      // the opening/navigation message that makes members show the panel.
      if (message.action !== 'scroll') this.pendingBible = message;
      return;
    }
    this.post(message);
  }

  sendHostCommand(message: HostMessage): void {
    this.post(message);
  }

  private post(payload: object): void {
    if (this.ws?.readyState === WebSocket.OPEN && this.opened && !this.closed) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  close(): void {
    this.closed = true;
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.pendingBible = null;
    try { this.ws?.close(); } catch { /* ignore */ }
    this.ws = null;
  }
}
