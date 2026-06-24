import React, { useEffect, useState } from 'react';
import { api, type SyncChannelAdmin, type SyncTargetClient, type SyncResultClient } from '../api';
import { useLocalization } from '../hooks/useLocalization';
import { useAdmin } from '../hooks/useAdmin';

interface ChannelSyncManagerProps {
  open: boolean;
  onClose: () => void;
}

const SYNC_TARGETS: { target: SyncTargetClient; key: string }[] = [
  { target: 'all', key: 'admin.channelSyncTargetAll' },
  { target: 'sunday-worship', key: 'admin.channelSyncTargetSundayWorship' },
  { target: 'worship-praise', key: 'admin.channelSyncTargetWorshipPraise' },
  { target: 'healing-prayer', key: 'admin.channelSyncTargetHealingPrayer' },
  { target: 'testimony', key: 'admin.channelSyncTargetTestimony' },
  { target: 'daily-manna', key: 'admin.channelSyncTargetDailyManna' },
];

const emptyForm = { name: '', channelId: '', apiKey: '' };

const ChannelSyncManager: React.FC<ChannelSyncManagerProps> = ({ open, onClose }) => {
  const { t } = useLocalization();
  const { refreshBootstrap } = useAdmin();
  const [channels, setChannels] = useState<SyncChannelAdmin[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null); // null = not editing; 'new' = creating
  const [form, setForm] = useState(emptyForm);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [rowMsg, setRowMsg] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.syncChannelsList();
      setChannels(res.channels);
    } catch (err) {
      setRowMsg({ _global: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open) load(); }, [open]);

  if (!open) return null;

  const startCreate = () => { setEditingId('new'); setForm(emptyForm); };
  const startEdit = (ch: SyncChannelAdmin) => {
    setEditingId(ch.id);
    setForm({ name: ch.name, channelId: ch.channelId, apiKey: '' });
  };

  const saveForm = async () => {
    try {
      if (editingId === 'new') {
        await api.syncChannelCreate({ name: form.name, channelId: form.channelId, apiKey: form.apiKey });
      } else if (editingId) {
        const payload: Partial<{ name: string; channelId: string; apiKey: string }> = { name: form.name, channelId: form.channelId };
        if (form.apiKey.trim()) payload.apiKey = form.apiKey.trim();
        await api.syncChannelUpdate(editingId, payload);
      }
      setEditingId(null);
      await load();
    } catch (err) {
      setRowMsg({ _form: err instanceof Error ? err.message : String(err) });
    }
  };

  const toggleEnabled = async (ch: SyncChannelAdmin) => {
    await api.syncChannelUpdate(ch.id, { enabled: !ch.enabled });
    await load();
  };

  const remove = async (ch: SyncChannelAdmin) => {
    await api.syncChannelDelete(ch.id);
    await load();
  };

  const test = async (ch: SyncChannelAdmin) => {
    const res = await api.syncChannelTest(ch.id);
    setRowMsg(prev => ({
      ...prev,
      [ch.id]: res.ok ? t('admin.channelSyncTestOk').replace('{name}', res.channelName || '') : (res.error || 'error'),
    }));
  };

  const runSync = async (ch: SyncChannelAdmin, target: SyncTargetClient) => {
    setOpenMenuId(null);
    setSyncingId(ch.id);
    setRowMsg(prev => ({ ...prev, [ch.id]: t('admin.channelSyncSyncing') }));
    try {
      const r: SyncResultClient = await api.syncChannelSync(ch.id, target);
      const msg = t('admin.channelSyncResult')
        .replace('{inserted}', String(r.inserted))
        .replace('{skipped}', String(r.skipped))
        .replace('{pages}', String(r.pages));
      setRowMsg(prev => ({ ...prev, [ch.id]: r.errors.length ? `${msg} · ${r.errors.slice(0, 2).join('; ')}` : msg }));
      if (r.inserted > 0) { try { await refreshBootstrap(); } catch { /* ignore */ } }
    } catch (err) {
      setRowMsg(prev => ({ ...prev, [ch.id]: err instanceof Error ? err.message : String(err) }));
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 p-4 pt-24" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-lg bg-white text-gray-900 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-lg font-semibold">{t('admin.channelSyncTitle')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="close">✕</button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-3">
          {rowMsg._global && <div className="text-sm text-red-600">{rowMsg._global}</div>}

          {!loading && channels.length === 0 && editingId !== 'new' && (
            <p className="text-sm text-gray-500">{t('admin.channelSyncEmpty')}</p>
          )}

          {channels.map(ch => (
            <div key={ch.id} className="rounded border border-gray-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{ch.name}</span>
                <span className="text-xs text-gray-500">{ch.channelId}</span>
                <button
                  onClick={() => toggleEnabled(ch)}
                  className={`rounded px-2 py-0.5 text-xs ${ch.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}
                >
                  {ch.enabled ? t('admin.channelSyncEnabled') : t('admin.channelSyncDisabled')}
                </button>
                <span className="text-xs text-gray-400">{ch.apiKeyMasked}</span>
                <div className="ml-auto flex items-center gap-1">
                  <button onClick={() => test(ch)} className="rounded border px-2 py-1 text-xs hover:bg-gray-50">{t('admin.channelSyncTest')}</button>
                  <button onClick={() => startEdit(ch)} className="rounded border px-2 py-1 text-xs hover:bg-gray-50">{t('admin.channelSyncEdit')}</button>
                  <button onClick={() => remove(ch)} className="rounded border px-2 py-1 text-xs text-red-600 hover:bg-red-50">{t('admin.channelSyncDelete')}</button>
                  <div className="relative">
                    <button
                      disabled={syncingId === ch.id}
                      onClick={() => setOpenMenuId(openMenuId === ch.id ? null : ch.id)}
                      className="rounded bg-gray-900 px-2 py-1 text-xs text-white disabled:opacity-50"
                    >
                      {syncingId === ch.id ? t('admin.channelSyncSyncing') : t('admin.channelSyncMenu')}
                    </button>
                    {openMenuId === ch.id && (
                      <div className="absolute right-0 z-10 mt-1 w-36 rounded border bg-white py-1 shadow-lg">
                        {SYNC_TARGETS.map(item => (
                          <button
                            key={item.target}
                            onClick={() => runSync(ch, item.target)}
                            className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100"
                          >
                            {t(item.key)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {rowMsg[ch.id] && <div className="mt-2 text-xs text-gray-600">{rowMsg[ch.id]}</div>}
            </div>
          ))}

          {editingId && (
            <div className="rounded border border-blue-200 bg-blue-50 p-3 space-y-2">
              <input
                className="w-full rounded border px-2 py-1 text-sm"
                placeholder={t('admin.channelSyncName')}
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
              <input
                className="w-full rounded border px-2 py-1 text-sm"
                placeholder={t('admin.channelSyncChannelId')}
                value={form.channelId}
                onChange={e => setForm({ ...form, channelId: e.target.value })}
              />
              <input
                className="w-full rounded border px-2 py-1 text-sm"
                placeholder={editingId === 'new' ? t('admin.channelSyncApiKey') : t('admin.channelSyncApiKeyKeep')}
                value={form.apiKey}
                onChange={e => setForm({ ...form, apiKey: e.target.value })}
              />
              {rowMsg._form && <div className="text-xs text-red-600">{rowMsg._form}</div>}
              <div className="flex gap-2">
                <button onClick={saveForm} className="rounded bg-gray-900 px-3 py-1 text-sm text-white">{t('admin.channelSyncSave')}</button>
                <button onClick={() => setEditingId(null)} className="rounded border px-3 py-1 text-sm">{t('admin.channelSyncCancel')}</button>
              </div>
            </div>
          )}

          {editingId !== 'new' && (
            <button onClick={startCreate} className="rounded border border-dashed px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
              {t('admin.channelSyncAdd')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChannelSyncManager;
