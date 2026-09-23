/// <reference types="@cloudflare/workers-types" />
import type { BibleMessage } from './chatProtocol';
import {
  sanitizeBibleMessage,
  sanitizeHostMessage,
  sanitizeRoomVideoMessage,
  sanitizeText,
  trimHistory,
  type ChatMessage,
  type RoomVideoMessage,
  type ServerMessage,
} from './chatProtocol';
import { isLiveKitProjectKey, stickyProject, type StickyProject } from './livekitProject';

interface Session { id: string; name: string; isHost: boolean; }

/** Durable storage key for the room's LiveKit server (see decideLiveKitProject). */
const LIVEKIT_PROJECT_KEY = 'livekitProject';

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
  /**
   * The YouTube video the room is watching together, if any.
   *
   * Kept for the same reason as biblePosition: someone arriving late, or a
   * phone whose socket dropped, should land on the video the group is already
   * watching, at the point they are watching it.
   */
  private roomVideo: { videoId: string; playing: boolean; seconds: number } | null = null;

  constructor(private state: DurableObjectState, _env: unknown) {}

  /**
   * Which LiveKit server this room is on.
   *
   * The Worker proposes one — it holds the settings and runs the health probe —
   * but the decision belongs here, because this object is per room and its
   * answer has to outlive the request that first asked. Two people in one
   * meeting handed different servers sit in identically named but entirely
   * separate rooms, seeing and hearing nobody; stickyProject() is what stops a
   * probe that flips mid-meeting from doing that.
   *
   * Kept in durable storage rather than memory on purpose: a deploy restarts
   * this object, and a meeting must not be re-decided underneath itself.
   */
  private async decideLiveKitProject(request: Request): Promise<Response> {
    const body = await request.json().catch(() => ({})) as { proposed?: unknown; day?: unknown };
    if (!isLiveKitProjectKey(body.proposed) || typeof body.day !== 'number') {
      return Response.json({ project: null }, { status: 400 });
    }
    const now = Date.now();
    const stored = (await this.state.storage.get<StickyProject>(LIVEKIT_PROJECT_KEY)) ?? null;
    const project = stickyProject({
      stored,
      proposed: body.proposed,
      day: body.day,
      now,
      activeCount: this.sessions.size,
    });
    await this.state.storage.put(LIVEKIT_PROJECT_KEY, { project, day: body.day, lastIssuedAt: now });
    return Response.json({ project });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname.endsWith('/status')) {
      return Response.json({ activeCount: this.sessions.size });
    }

    if (request.method === 'POST' && url.pathname.endsWith('/livekit-project')) {
      return this.decideLiveKitProject(request);
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
    if (this.roomVideo) {
      const { videoId, playing, seconds } = this.roomVideo;
      // Open first so a player exists, then place it where the room is.
      this.sendTo(server, { type: 'video', action: 'open', videoId, startSeconds: seconds });
      this.sendTo(server, { type: 'video', action: 'state', playing, seconds });
    }
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

      if (kind === 'video') {
        const video = sanitizeRoomVideoMessage(parsed);
        // Same rule as the Bible: a host leads, and with no host present
        // anyone may, so a group without a designated leader still works.
        if (!video || !(isHost || !this.hasHost())) return;
        this.applyRoomVideo(video);
        this.broadcast(video);
        return;
      }

      if (kind === 'host') {
        const command = sanitizeHostMessage(parsed);
        if (!command || !isHost) return;
        this.broadcast(command);
        if (command.action === 'remove') this.removeUser(command.targetUserId);
        // The study is over: the next meeting should start from the contents,
        // not wherever this one happened to stop.
        if (command.action === 'endMeeting') { this.biblePosition = null; this.bibleExpanded = false; this.roomVideo = null; }
        // Taking the shared picture slot ends whatever was in it. Forgetting
        // the video is not enough — everyone already watching has to be told,
        // or they sit in front of a film the room has moved on from.
        if (command.action === 'claimShare' && this.roomVideo) {
          this.roomVideo = null;
          this.broadcast({ type: 'video', action: 'close' });
        }
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

  /** Keeps the remembered video in step with what the room was just told. */
  private applyRoomVideo(message: RoomVideoMessage): void {
    if (message.action === 'close') { this.roomVideo = null; return; }
    if (message.action === 'open') {
      this.roomVideo = { videoId: message.videoId, playing: true, seconds: message.startSeconds ?? 0 };
      return;
    }
    // A position with no video open is stale chatter from a client that has
    // not yet heard the video close; there is nothing for it to describe.
    if (!this.roomVideo) return;
    this.roomVideo = { ...this.roomVideo, playing: message.playing, seconds: message.seconds };
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
