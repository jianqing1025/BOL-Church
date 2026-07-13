import React, { useEffect, useState } from 'react';
import { MapPin, Send, Trash2, ChevronLeft, Check, AlertTriangle } from 'lucide-react';
import { useLocalization } from '../../hooks/useLocalization';
import type { MailboxReply, Message, PrayerRequest } from '../../data';

type Item = Message | PrayerRequest;

interface MailboxProps {
  kind: 'inbox' | 'prayer';
  items: Item[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onReply: (id: string, body: string) => Promise<MailboxReply>;
  loadReplies: (id: string) => Promise<MailboxReply[]>;
  onMarkPrayed?: (id: string) => Promise<void>;
}

const fullName = (i: Item) => `${i.firstName ?? ''} ${i.lastName ?? ''}`.trim() || i.email || 'Anonymous';
const locationText = (i: Item) => [i.city, i.region, i.country].filter(Boolean).join(', ');
const fmt = (d: string | number) => { try { return new Date(d).toLocaleString(); } catch { return String(d); } };
const unread = (i: Item, kind: 'inbox' | 'prayer') =>
  kind === 'inbox' ? !(i as Message).read : (i as PrayerRequest).status === 'new';

export const Mailbox: React.FC<MailboxProps> = ({ kind, items, onOpen, onDelete, onReply, loadReplies, onMarkPrayed }) => {
  const { t } = useLocalization();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replies, setReplies] = useState<MailboxReply[]>([]);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const selected = items.find((i) => i.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedId && !items.some((i) => i.id === selectedId)) setSelectedId(null);
  }, [items, selectedId]);

  const open = (item: Item) => {
    setSelectedId(item.id);
    setReplyText('');
    setError('');
    setReplies([]);
    if (kind === 'inbox' && !(item as Message).read) onOpen(item.id);
    loadReplies(item.id).then(setReplies).catch(() => setReplies([]));
  };

  const send = async () => {
    const body = replyText.trim();
    if (!selected || !body || sending) return;
    setSending(true);
    setError('');
    try {
      const reply = await onReply(selected.id, body);
      setReplies((prev) => [...prev, reply]);
      setReplyText('');
      if (reply.status === 'failed') setError(reply.error || t('admin.mailboxFailed'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const del = async () => {
    if (!selected) return;
    await onDelete(selected.id);
    setSelectedId(null);
  };

  return (
    <div className="flex h-[70vh] overflow-hidden rounded-xl border border-gray-200 bg-white">
      {/* List pane */}
      <div className={`w-full overflow-y-auto border-r border-gray-200 md:block md:w-80 md:shrink-0 ${selected ? 'hidden' : 'block'}`}>
        {items.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">{t('admin.noMessages')}</div>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => open(item)}
              className={`w-full border-b border-gray-100 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${selectedId === item.id ? 'bg-blue-50' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`truncate ${unread(item, kind) ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'}`}>{fullName(item)}</span>
                {unread(item, kind) && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />}
              </div>
              <div className="truncate text-sm text-gray-500">{item.message}</div>
              <div className="mt-0.5 text-xs text-gray-400">{fmt(item.date)}</div>
            </button>
          ))
        )}
      </div>

      {/* Reading pane */}
      <div className={`min-w-0 flex-1 flex-col ${selected ? 'flex' : 'hidden md:flex'}`}>
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-sm text-gray-400">{t('admin.mailboxNoSelection')}</div>
        ) : (
          <>
            <div className="border-b border-gray-200 px-5 py-4">
              <button type="button" onClick={() => setSelectedId(null)} className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 md:hidden">
                <ChevronLeft size={16} /> {t('admin.mailboxBack')}
              </button>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-gray-900">{fullName(selected)}</h3>
                  <div className="truncate text-sm text-gray-500">
                    {selected.email || '—'}{selected.phone ? ` · ${selected.phone}` : ''}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
                    <span>{fmt(selected.date)}</span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={12} /> {locationText(selected) || t('admin.mailboxUnknownLocation')}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {kind === 'prayer' && onMarkPrayed && (selected as PrayerRequest).status === 'new' && (
                    <button type="button" onClick={() => onMarkPrayed(selected.id)} className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 hover:bg-green-200">
                      {t('admin.markPrayed')}
                    </button>
                  )}
                  <button type="button" onClick={() => void del()} className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-100">
                    <Trash2 size={13} /> {t('admin.delete')}
                  </button>
                </div>
              </div>
            </div>

            {/* 微信式對話流：對方（原始來信+回信）靠左白泡，我方靠右藍泡 */}
            <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50/70 px-5 py-4">
              <div className="space-y-3">
                <div className="flex justify-start">
                  <div className="max-w-[75%]">
                    <div className="mb-0.5 text-xs text-gray-400">{fullName(selected)} · {fmt(selected.date)}</div>
                    <div className="whitespace-pre-wrap break-words rounded-2xl rounded-tl-sm border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-800 shadow-sm">
                      {selected.message}
                    </div>
                  </div>
                </div>
                {replies.map((r) => (
                  r.direction === 'in' ? (
                    <div key={r.id} className="flex justify-start">
                      <div className="max-w-[75%]">
                        <div className="mb-0.5 truncate text-xs text-gray-400">
                          {r.fromEmail || t('admin.mailboxInboundLabel')} · {fmt(r.createdAt)}
                        </div>
                        <div className="whitespace-pre-wrap break-words rounded-2xl rounded-tl-sm border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-800 shadow-sm">
                          {r.body}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div key={r.id} className="flex justify-end">
                      <div className="max-w-[75%] text-right">
                        <div className="mb-0.5 text-xs text-gray-400">
                          {r.sentBy || 'Lingling'} · {fmt(r.createdAt)} ·{' '}
                          {r.status === 'sent' ? (
                            <span className="inline-flex items-center gap-0.5 text-green-600"><Check size={11} /> {t('admin.mailboxSent')}</span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 text-red-600" title={r.error || ''}><AlertTriangle size={11} /> {t('admin.mailboxFailed')}</span>
                          )}
                        </div>
                        <div className="inline-block whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-blue-600 px-3.5 py-2.5 text-left text-sm text-white shadow-sm">
                          {r.body}
                        </div>
                      </div>
                    </div>
                  )
                ))}
              </div>
            </div>

            <div className="border-t border-gray-200 px-5 py-3">
              {!selected.email ? (
                <div className="text-sm text-amber-600">{t('admin.mailboxNoEmail')}</div>
              ) : (
                <>
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={t('admin.mailboxReplyPlaceholder')}
                    rows={3}
                    className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  {error && <div className="mt-1 text-xs font-medium text-red-600">{error}</div>}
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => void send()}
                      disabled={sending || !replyText.trim()}
                      className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      <Send size={14} /> {sending ? t('admin.mailboxSending') : t('admin.mailboxReply')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Mailbox;
