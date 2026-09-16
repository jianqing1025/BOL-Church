/// <reference types="@cloudflare/workers-types" />
import type { BibleMessage } from './chatProtocol';
import {
  sanitizeBibleMessage,
  sanitizeHostMessage,
  sanitizeText,
  trimHistory,
  type ChatMessage,
  type ServerMessage,
} from './chatProtocol';

interface Session { id: string; name: string; isHost: boolean; }

/**
 * One instance per room (addressed via idFromName(roomId)). Password and roomId
 * are validated by the Worker before the socket is forwarded here, so the DO
 * trusts the connection. History is kept in memory (last 100); persistence /
 * hibernation is future work.
 */
export class ChatRoom {
  private sessions = new Map<WebSocket, Session>();
  private messages: ChatMessage[] = [];
  /**
   * Where the room currently is in the Bible. Kept so someone joining late —
   * or a phone whose socket dropped and came back — lands on the passage the
   * group is already studying instead of waiting for the next page turn.
   */
  private biblePosition: BibleMessage | null = null;
  /** Whether the room is reading full screen, so a newcomer matches the group. */
  private bibleExpanded = false;

  constructor(_state: DurableObjectState, _env: unknown) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname.endsWith('/status')) {
      return Response.json({ activeCount: this.sessions.size });
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected websocket', { status: 426 });
    }

    const roomId = url.searchParams.get('roomId') || 'lobby';
    const id = url.searchParams.get('uid') || crypto.randomUUID();
    const name = url.searchParams.get('name') || 'Guest';
    const isHost = url.searchParams.get('host') === '1';

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    this.sessions.set(server, { id, name, isHost });

    this.sendTo(server, { type: 'welcome', roomId, userId: id, messages: this.messages });
    if (this.biblePosition) this.sendTo(server, this.biblePosition);
    // After the position, so the panel is open before it is told to enlarge.
    if (this.bibleExpanded) this.sendTo(server, { type: 'bible', action: 'expand', expanded: true });
    this.broadcast({ type: 'system', event: 'joined', name, createdAt: Date.now() });
    this.broadcastPresence();

    server.addEventListener('message', (event: MessageEvent) => {
      let parsed: unknown;
      try { parsed = JSON.parse(typeof event.data === 'string' ? event.data : ''); } catch { return; }
      const kind = (parsed as { type?: string } | null)?.type;

      if (kind === 'bible') {
        const bible = sanitizeBibleMessage(parsed);
        // A host leads the room through the text. With no host present anyone
        // may turn the page, so a group without a designated leader still works.
        if (!bible || !(isHost || !this.hasHost())) return;
        // Scrolling is a position within the passage, not the passage itself —
        // replaying it to a newcomer would scroll them before they have text.
        if (bible.action === 'expand') this.bibleExpanded = bible.expanded;
        else if (bible.action !== 'scroll') this.biblePosition = bible;
        this.broadcast(bible);
        return;
      }

      if (kind === 'host') {
        const command = sanitizeHostMessage(parsed);
        if (!command || !isHost) return;
        this.broadcast(command);
        if (command.action === 'remove') this.removeUser(command.targetUserId);
        // The study is over: the next meeting should start from the contents,
        // not wherever this one happened to stop.
        if (command.action === 'endMeeting') { this.biblePosition = null; this.bibleExpanded = false; }
        return;
      }

      if (kind !== 'message') return;
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
      this.broadcast({ type: 'system', event: 'left', name, createdAt: Date.now() });
      this.broadcastPresence();
    };
    server.addEventListener('close', cleanup);
    server.addEventListener('error', cleanup);

    return new Response(null, { status: 101, webSocket: client });
  }

  private hasHost(): boolean {
    for (const session of this.sessions.values()) if (session.isHost) return true;
    return false;
  }

  /**
   * Closes a removed participant's socket. The command was already broadcast,
   * so their client leaves the room on its own; this makes sure they are also
   * dropped from presence even if that client ignores it.
   */
  private removeUser(targetUserId: string): void {
    for (const [ws, session] of this.sessions) {
      if (session.id !== targetUserId || session.isHost) continue;
      this.sessions.delete(ws);
      try { ws.close(1000, 'removed by host'); } catch { /* already gone */ }
      this.broadcast({ type: 'system', event: 'left', name: session.name, createdAt: Date.now() });
      this.broadcastPresence();
    }
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
    const users = [...this.sessions.values()].map((s) => ({ id: s.id, name: s.name, isHost: s.isHost }));
    this.broadcast({ type: 'presence', users });
  }
}
