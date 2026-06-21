import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useLocalization } from '../hooks/useLocalization';
import { Language } from '../types';
import type { LiveChatMessage } from '../types';

interface LiveChatPanelProps {
  videoId: string | null;
  sessionId: string;
  displayName: string;
  isAdmin?: boolean;
  enabled: boolean;
}

const POLL_MS = 3000;

// Render server-stored "游客N" as "Guest N" when UI language is English
function localizeAuthorName(name: string, language: Language): string {
  if (language !== Language.ZH) {
    const m = name.match(/^游客(\d+)$/);
    if (m) return `Guest ${m[1]}`;
  }
  return name;
}

const LiveChatPanel: React.FC<LiveChatPanelProps> = ({ videoId, sessionId, displayName, isAdmin, enabled }) => {
  const { t, language } = useLocalization();
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastSinceRef = useRef<number>(0);

  useEffect(() => {
    if (!videoId) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await api.liveChatGet(videoId, lastSinceRef.current);
        if (cancelled || !res.messages || res.messages.length === 0) return;
        setMessages(prev => {
          const seen = new Set(prev.map(m => m.id));
          const fresh = res.messages.filter(m => !seen.has(m.id));
          if (fresh.length === 0) return prev;
          lastSinceRef.current = Math.max(lastSinceRef.current, ...res.messages.map(m => m.createdAt));
          return [...prev, ...fresh].slice(-200);
        });
      } catch { /* silent */ }
    };
    poll();
    const interval = window.setInterval(poll, POLL_MS);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [videoId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || !sessionId) return;
    setSending(true);
    setError(null);
    try {
      const res = await api.liveChatPost({ sessionId, message: text });
      if (res.error) {
        setError(res.error);
      } else if (res.message) {
        setMessages(prev => {
          if (prev.find(m => m.id === res.message!.id)) return prev;
          lastSinceRef.current = Math.max(lastSinceRef.current, res.message!.createdAt);
          return [...prev, res.message!];
        });
        setInput('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin) return;
    if (!window.confirm(t('liveChat.confirmDelete'))) return;
    try {
      await api.liveChatDelete(id);
      setMessages(prev => prev.filter(m => m.id !== id));
    } catch {/* ignore */}
  };

  const localizedSelf = localizeAuthorName(displayName, language as Language);
  const placeholder = enabled
    ? t('liveChat.inputPlaceholder').replace('{name}', localizedSelf)
    : t('liveChat.inputDisabled');

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
        {messages.length === 0 && (
          <div className="py-6 text-center text-xs text-gray-400">{t('liveChat.noMessages')}</div>
        )}
        {messages.map(m => {
          const author = localizeAuthorName(m.displayName, language as Language);
          const isGuestName = m.displayName.startsWith('游客');
          return (
            <div key={m.id} className="text-sm leading-relaxed group">
              <span className={`font-semibold ${m.isAdmin ? 'text-red-600' : isGuestName ? 'text-gray-500' : 'text-blue-700'}`}>
                {m.isAdmin && '👑 '}{author}
              </span>
              <span className="text-gray-400 text-xs mx-1">·</span>
              <span className="text-gray-800 break-words">{m.message}</span>
              {isAdmin && (
                <button onClick={() => handleDelete(m.id)} className="ml-1 hidden text-xs text-red-500 hover:underline group-hover:inline-block">
                  {t('liveChat.deleteLabel')}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="border-t border-gray-200 p-2">
        {error && <div className="mb-1 text-xs text-red-600">{error}</div>}
        <div className="flex gap-1.5">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !sending && enabled) send(); }}
            placeholder={placeholder}
            disabled={!enabled || sending}
            maxLength={500}
            className="flex-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100"
          />
          <button
            type="button"
            onClick={send}
            disabled={!enabled || sending || !input.trim()}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {t('liveChat.sendButton')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LiveChatPanel;
