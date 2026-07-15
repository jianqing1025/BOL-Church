// Message protocol shared by the ChatRoom Durable Object and the frontend.
// Pure + isomorphic (no server APIs) so both sides import the same source.

export const MAX_TEXT = 1000;
export const MAX_NAME = 30;
export const MAX_HISTORY = 100;

export interface ChatMessage {
  type: 'message';
  id: string;
  userId: string;
  name: string;
  text: string;
  createdAt: number;
}
export type SystemMessage = {
  type: 'system';
  event: 'joined' | 'left';
  name: string;
  createdAt: number;
} | {
  /** Backward compatibility for clients connected during a Worker rollout. */
  type: 'system';
  text: string;
  createdAt: number;
};
export interface PresenceMessage {
  type: 'presence';
  users: { id: string; name: string }[];
}
export interface WelcomeMessage {
  type: 'welcome';
  roomId: string;
  userId: string;
  messages: ChatMessage[];
}
export type ServerMessage = ChatMessage | SystemMessage | PresenceMessage | WelcomeMessage;

export interface ClientMessage {
  type: 'message';
  text: string;
}

// Strip C0 control chars but keep tab, LF, CR.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

export function sanitizeText(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const cleaned = input.replace(CONTROL_CHARS, '').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, MAX_TEXT);
}

export function sanitizeName(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const cleaned = input.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, MAX_NAME);
}

export function trimHistory(messages: ChatMessage[]): ChatMessage[] {
  return messages.length > MAX_HISTORY ? messages.slice(messages.length - MAX_HISTORY) : messages;
}
