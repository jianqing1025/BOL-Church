/**
 * Who belongs on the big tile in speaker view.
 *
 * The server reports who is making sound, which changes constantly: a cough, a
 * chair, somebody saying "嗯". Following it directly makes the stage flicker
 * between faces and is exhausting to watch. What Zoom, Meet and Teams all do
 * instead is a dominant-speaker rule with hysteresis, and it is two rules
 * rather than one:
 *
 * 1. Taking the tile requires holding the floor — a run of speech lasting
 *    SPEAKER_PROMOTE_MS. Noises never last that long.
 * 2. Losing it requires somebody else doing the same. Silence never changes
 *    the picture, so pausing for breath or to turn a page costs nobody their
 *    place.
 *
 * The second rule is the one that gets forgotten, and without it a leader who
 * stops for a moment is dropped from the stage and has to earn their way back.
 */

/** How long somebody must hold the floor before the stage hands it to them. */
export const SPEAKER_PROMOTE_MS = 3000;

/**
 * How long a gap may be and still count as the same turn.
 *
 * Nobody produces three unbroken seconds of detected audio — ordinary speech
 * is full of small gaps. Without this tolerance the clock would reset between
 * words and nobody would ever be promoted. Beyond it, the turn is over: two
 * coughs ten seconds apart must not add up to a promotion.
 */
export const SPEAKER_GAP_MS = 1500;

/**
 * How often the stage must re-run this rule.
 *
 * The gap tolerance is measured between calls, so the caller has to ask more
 * often than SPEAKER_GAP_MS — sampling any slower would read every gap as the
 * end of a turn and nobody would ever be promoted. Asking on the server's
 * speaker events alone is not enough: they stop arriving while someone talks
 * steadily, and the promotion is due three seconds into that silence of events.
 */
export const SPEAKER_TICK_MS = 500;

export interface SpeakerFocus {
  /** Whose face is on the big tile, or null before anyone has spoken. */
  featuredId: string | null;
  /** Who is currently working towards taking it. */
  candidateId: string | null;
  /** When that run of speech began. */
  candidateSince: number;
  /** When they were last heard, so a gap can end the run. */
  candidateLastHeard: number;
}

export const emptySpeakerFocus: SpeakerFocus = {
  featuredId: null,
  candidateId: null,
  candidateSince: 0,
  candidateLastHeard: 0,
};

export interface SpeakerFocusInput {
  /** Who the server says is making sound, loudest first. */
  activeIds: string[];
  /** Who is actually in the room, so a departed speaker is not held onto. */
  presentIds: string[];
  now: number;
}

/**
 * The next state of the big tile.
 *
 * Returns the state it was given, unchanged, when nothing has moved — the
 * stage re-evaluates on a timer, and a fresh object every tick would restart
 * the fade on the main tile several times a second.
 */
export function nextSpeakerFocus(state: SpeakerFocus, { activeIds, presentIds, now }: SpeakerFocusInput): SpeakerFocus {
  const present = new Set(presentIds);
  const featuredId = state.featuredId && present.has(state.featuredId) ? state.featuredId : null;
  const speaker = activeIds.find((id) => present.has(id)) ?? null;

  const settle = (next: SpeakerFocus): SpeakerFocus => (
    next.featuredId === state.featuredId
      && next.candidateId === state.candidateId
      && next.candidateSince === state.candidateSince
      && next.candidateLastHeard === state.candidateLastHeard
      ? state
      : next
  );

  // Nobody on the tile yet: there is nothing to protect, and making the room
  // watch an empty stage for three seconds serves no one.
  if (!featuredId && speaker) {
    return settle({ featuredId: speaker, candidateId: null, candidateSince: 0, candidateLastHeard: 0 });
  }

  // Quiet, or the person already on the tile: leave the picture alone.
  if (!speaker || speaker === featuredId) {
    return settle({ ...state, featuredId, candidateId: speaker ? null : state.candidateId });
  }

  const continuing = state.candidateId === speaker && now - state.candidateLastHeard <= SPEAKER_GAP_MS;
  const since = continuing ? state.candidateSince : now;

  if (now - since >= SPEAKER_PROMOTE_MS) {
    return settle({ featuredId: speaker, candidateId: null, candidateSince: 0, candidateLastHeard: 0 });
  }
  return settle({ featuredId, candidateId: speaker, candidateSince: since, candidateLastHeard: now });
}
