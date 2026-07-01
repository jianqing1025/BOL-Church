/// <reference types="@cloudflare/workers-types" />
import {
  sanitizeText,
  trimHistory,
  type ChatMessage,
  type ServerMessage,
} from './chatProtocol';

interface Session { id: string; name: string; }

/**
 * One instance per room (addressed via idFromName(roomId)). Password and roomId
 * are validated by the Worker before the socket is forwarded here, so the DO
 * trusts the connection. History is kept in memory (last 100); persistence /
 * hibernation is future work.
 */
export class ChatRoom {
  private sessions = new Map<WebSocket, Session>();
  private messages: ChatMessage[] = [];

  constructor(_state: DurableObjectState, _env: unknown) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected websocket', { status: 426 });
    }
    const url = new URL(request.url);
    const roomId = url.searchParams.get('roomId') || 'lobby';
    const id = url.searchParams.get('uid') || crypto.randomUUID();
    const name = url.searchParams.get('name') || 'Guest';

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    this.sessions.set(server, { id, name });

    this.sendTo(server, { type: 'welcome', roomId, userId: id, messages: this.messages });
    this.broadcast({ type: 'system', text: `${name} 加入了房间`, createdAt: Date.now() });
    this.broadcastPresence();

    server.addEventListener('message', (event: MessageEvent) => {
      let parsed: unknown;
      try { parsed = JSON.parse(typeof event.data === 'string' ? event.data : ''); } catch { return; }
      if (!parsed || (parsed as { type?: string }).type !== 'message') return;
      const text = sanitizeText((parsed as { text?: unknown }).text);
      if (!text) return;
      const msg: ChatMessage = { type: 'message', id: crypto.randomUUID(), userId: id, name, text, createdAt: Date.now() };
      this.messages.push(msg);
      this.messages = trimHistory(this.messages);
      this.broadcast(msg);
    });

    const cleanup = () => {
      if (!this.sessions.has(server)) return;
      this.sessions.delete(server);
      this.broadcast({ type: 'system', text: `${name} 离开了房间`, createdAt: Date.now() });
      this.broadcastPresence();
    };
    server.addEventListener('close', cleanup);
    server.addEventListener('error', cleanup);

    return new Response(null, { status: 101, webSocket: client });
  }

  private sendTo(ws: WebSocket, message: ServerMessage): void {
    try { ws.send(JSON.stringify(message)); } catch { this.sessions.delete(ws); }
  }

  private broadcast(message: ServerMessage): void {
    const payload = JSON.stringify(message);
    for (const ws of this.sessions.keys()) {
      try { ws.send(payload); } catch { this.sessions.delete(ws); }
    }
  }

  private broadcastPresence(): void {
    const users = [...this.sessions.values()].map((s) => ({ id: s.id, name: s.name }));
    this.broadcast({ type: 'presence', users });
  }
}
