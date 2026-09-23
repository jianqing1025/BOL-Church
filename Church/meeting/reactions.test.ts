import { describe, it, expect } from 'vitest';
import { applyReactionToMessages, isReactionEmoji, REACTION_EMOJI, reactionSummary, toggleReaction } from './reactions';

const THUMB = '👍';
const PRAY = '🙏';

describe('isReactionEmoji', () => {
  it('accepts the five the room is offered', () => {
    expect(REACTION_EMOJI.every(isReactionEmoji)).toBe(true);
  });

  it('refuses anything else, including other emoji and plain text', () => {
    // The room object rebroadcasts this, so an unchecked value would put
    // whatever a client sent in front of everybody.
    for (const bad of ['😠', '💩', 'hello', '', ' ', '👍👍', null, undefined, 7]) {
      expect(isReactionEmoji(bad)).toBe(false);
    }
  });
});

describe('toggleReaction', () => {
  it('adds a reaction nobody has given yet', () => {
    expect(toggleReaction({}, THUMB, 'u1')).toEqual({ [THUMB]: ['u1'] });
  });

  it('adds a second person without disturbing the first', () => {
    expect(toggleReaction({ [THUMB]: ['u1'] }, THUMB, 'u2')).toEqual({ [THUMB]: ['u1', 'u2'] });
  });

  it('takes it back when the same person presses again', () => {
    expect(toggleReaction({ [THUMB]: ['u1', 'u2'] }, THUMB, 'u1')).toEqual({ [THUMB]: ['u2'] });
  });

  it('drops the emoji entirely when the last person takes it back', () => {
    // Left behind, it would draw as a pill reading zero.
    expect(toggleReaction({ [THUMB]: ['u1'] }, THUMB, 'u1')).toEqual({});
  });

  it('keeps each emoji on its own', () => {
    const after = toggleReaction({ [THUMB]: ['u1'] }, PRAY, 'u1');
    expect(after).toEqual({ [THUMB]: ['u1'], [PRAY]: ['u1'] });
  });

  it('leaves the original alone', () => {
    const before = { [THUMB]: ['u1'] };
    toggleReaction(before, THUMB, 'u2');
    expect(before).toEqual({ [THUMB]: ['u1'] });
  });
});

describe('reactionSummary', () => {
  it('is empty when nobody has reacted', () => {
    expect(reactionSummary(undefined, 'u1')).toEqual([]);
    expect(reactionSummary({}, 'u1')).toEqual([]);
  });

  it('counts each emoji and marks the ones you gave', () => {
    const summary = reactionSummary({ [THUMB]: ['u1', 'u2'], [PRAY]: ['u2'] }, 'u1');
    expect(summary).toEqual([
      { emoji: THUMB, count: 2, mine: true },
      { emoji: PRAY, count: 1, mine: false },
    ]);
  });

  it('orders them as the picker does, not as they arrived', () => {
    const summary = reactionSummary({ [PRAY]: ['u1'], [THUMB]: ['u2'] }, null);
    expect(summary.map((r) => r.emoji)).toEqual([THUMB, PRAY]);
  });

  it('leaves out an emoji nobody is left holding, and anything off the list', () => {
    const summary = reactionSummary({ [THUMB]: [], '😠': ['u1'] }, 'u1');
    expect(summary).toEqual([]);
  });
});

describe('applyReactionToMessages', () => {
  const chat = (id: string, reactions?: Record<string, string[]>) =>
    ({ type: 'message' as const, id, userId: 'u', name: 'n', text: 't', createdAt: 0, reactions });

  it('puts the room\'s new holders on the message it names', () => {
    const after = applyReactionToMessages(
      [chat('m1'), chat('m2')],
      { type: 'reaction', messageId: 'm2', emoji: THUMB, users: ['u1', 'u2'] },
    );
    expect(after[1].reactions).toEqual({ [THUMB]: ['u1', 'u2'] });
    expect(after[0].reactions).toBeUndefined();
  });

  it('removes the emoji when nobody is left holding it', () => {
    const after = applyReactionToMessages(
      [chat('m1', { [THUMB]: ['u1'], [PRAY]: ['u2'] })],
      { type: 'reaction', messageId: 'm1', emoji: THUMB, users: [] },
    );
    expect(after[0].reactions).toEqual({ [PRAY]: ['u2'] });
  });

  it('returns the same list when the message is not there', () => {
    // Older than the history the room keeps, so there is nothing to change.
    const before = [chat('m1')];
    expect(applyReactionToMessages(before, { type: 'reaction', messageId: 'gone', emoji: THUMB, users: ['u1'] }))
      .toBe(before);
  });

  it('leaves system messages alone', () => {
    const system = { type: 'system' as const, event: 'joined' as const, name: 'n', createdAt: 0 };
    const after = applyReactionToMessages([system], { type: 'reaction', messageId: 'm1', emoji: THUMB, users: ['u1'] });
    expect(after).toEqual([system]);
  });
});
