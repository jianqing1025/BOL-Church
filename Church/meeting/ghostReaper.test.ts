import { describe, expect, it, vi } from 'vitest';
import { GHOST_GRACE_MS, listLiveKitParticipants, removeLiveKitParticipant, selectGhosts } from './ghostReaper';

const MIN = 60_000;
const NOW = 1_000 * MIN;

describe('selectGhosts', () => {
  it('leaves alone everyone who is also in the chat room', () => {
    const r = selectGhosts([{ identity: 'Ann-1', uid: 'u1', joinedAt: 0 }], new Set(['u1']), { 'Ann-1': 0 }, NOW, GHOST_GRACE_MS);
    expect(r).toEqual({ ghosts: [], absentSince: {} });
  });

  it('starts the clock the first time a participant is missing from the chat room', () => {
    const r = selectGhosts([{ identity: 'Ann-1', uid: 'u1', joinedAt: 0 }], new Set(), {}, NOW, GHOST_GRACE_MS);
    expect(r).toEqual({ ghosts: [], absentSince: { 'Ann-1': NOW } });
  });

  it('removes a participant missing from the chat room for the whole grace period', () => {
    const since = NOW - GHOST_GRACE_MS;
    const r = selectGhosts([{ identity: 'Ann-1', uid: 'u1', joinedAt: 0 }], new Set(['u2']), { 'Ann-1': since }, NOW, GHOST_GRACE_MS);
    expect(r.ghosts).toEqual(['Ann-1']);
  });

  it('does not hold an earlier absence against someone who came back', () => {
    const r = selectGhosts([{ identity: 'Ann-1', uid: 'u1', joinedAt: 0 }], new Set(['u1']), { 'Ann-1': NOW - 10 * MIN }, NOW, GHOST_GRACE_MS);
    expect(r.ghosts).toEqual([]);
  });

  it('counts a participant that never said who it is from when it joined', () => {
    const fresh = selectGhosts([{ identity: 'New-1', uid: null, joinedAt: NOW - MIN }], new Set(), {}, NOW, GHOST_GRACE_MS);
    expect(fresh).toEqual({ ghosts: [], absentSince: { 'New-1': NOW - MIN } });
    const stale = selectGhosts([{ identity: 'Old-1', uid: null, joinedAt: NOW - 6 * MIN }], new Set(), {}, NOW, GHOST_GRACE_MS);
    expect(stale.ghosts).toEqual(['Old-1']);
  });

  it('forgets participants that are no longer in the room', () => {
    const r = selectGhosts([], new Set(), { 'Gone-1': NOW - MIN }, NOW, GHOST_GRACE_MS);
    expect(r.absentSince).toEqual({});
  });
});

describe('LiveKit admin calls', () => {
  const project = { url: 'wss://live.example.org', apiKey: 'key', apiSecret: 'secret' };

  it('lists participants through RoomService with a room-scoped admin token', async () => {
    const fetchImpl = vi.fn(async () => Response.json({
      participants: [
        { identity: 'Ann-1', joined_at: '120', attributes: { uid: 'u1' } },
        { identity: 'Bob-2', joined_at: '180' },
      ],
    }));
    const list = await listLiveKitParticipants(project, 'bolccop-prayer', fetchImpl);
    expect(list).toEqual([
      { identity: 'Ann-1', uid: 'u1', joinedAt: 120_000 },
      { identity: 'Bob-2', uid: null, joinedAt: 180_000 },
    ]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://live.example.org/twirp/livekit.RoomService/ListParticipants');
    expect(JSON.parse(String(init.body))).toEqual({ room: 'bolccop-prayer' });
    const token = String((init.headers as Record<string, string>).Authorization).replace('Bearer ', '');
    const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    expect(claims.video).toEqual({ room: 'bolccop-prayer', roomAdmin: true });
  });

  it('reports a room that does not exist as empty', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"code":"not_found"}', { status: 404 }));
    expect(await listLiveKitParticipants(project, 'bolccop-prayer', fetchImpl)).toEqual([]);
  });

  it('removes one participant by identity', async () => {
    const fetchImpl = vi.fn(async () => Response.json({}));
    await removeLiveKitParticipant(project, 'bolccop-prayer', 'Ann-1', fetchImpl);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://live.example.org/twirp/livekit.RoomService/RemoveParticipant');
    expect(JSON.parse(String(init.body))).toEqual({ room: 'bolccop-prayer', identity: 'Ann-1' });
  });
});
