import type { ServerMessage } from '../meeting/chatProtocol';

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
}

/**
 * Thin WebSocket wrapper for the meeting chat. Idempotent close so React
 * StrictMode double-mount / unmount is safe.
 */
export class MeetingSocket {
  private ws: WebSocket | null = null;
  private opened = false;
  private closed = false;

  constructor(private handlers: MeetingSocketHandlers) {}

  connect(params: MeetingSocketParams): void {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const url = new URL(`${proto}://${window.location.host}/api/meeting/ws`);
    url.searchParams.set('roomId', params.roomId);
    url.searchParams.set('name', params.name);
    url.searchParams.set('password', params.password);

    const ws = new WebSocket(url.toString());
    this.ws = ws;

    ws.addEventListener('open', () => { this.opened = true; this.handlers.onOpen?.(); });
    ws.addEventListener('message', (event) => {
      try { this.handlers.onMessage(JSON.parse(event.data as string) as ServerMessage); } catch { /* ignore */ }
    });
    ws.addEventListener('error', (event) => this.handlers.onError?.(event));
    ws.addEventListener('close', () => {
      if (this.closed) return;
      this.closed = true;
      // Closing before it ever opened almost always means the Worker rejected
      // the credentials/room (it returns a 4xx instead of upgrading).
      this.handlers.onClose?.({ authFailed: !this.opened });
    });
  }

  send(text: string): void {
    if (this.ws && this.opened && !this.closed) {
      this.ws.send(JSON.stringify({ type: 'message', text }));
    }
  }

  close(): void {
    this.closed = true;
    try { this.ws?.close(); } catch { /* ignore */ }
    this.ws = null;
  }
}
