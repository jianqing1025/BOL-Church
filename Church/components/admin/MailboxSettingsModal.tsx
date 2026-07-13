import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../../api';
import { useLocalization } from '../../hooks/useLocalization';
import type { MailboxSettings } from '../../data';

interface MailboxSettingsModalProps {
  onClose: () => void;
}

/**
 * 信箱寄信設定：發信名稱、發信郵箱（from）、回覆郵箱（reply-to）。
 * 設定存 D1，訊息與代禱的回覆郵件共用。
 */
const MailboxSettingsModal: React.FC<MailboxSettingsModalProps> = ({ onClose }) => {
  const { t } = useLocalization();
  const [settings, setSettings] = useState<MailboxSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.getMailboxSettings()
      .then((s) => { if (!cancelled) setSettings(s); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); });
    return () => { cancelled = true; };
  }, []);

  const save = async () => {
    if (!settings || saving) return;
    setSaving(true);
    setError('');
    try {
      await api.saveMailboxSettings(settings);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof MailboxSettings, type: 'text' | 'email') => (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-gray-600">{label}</span>
      <input
        type={type}
        value={settings?.[key] ?? ''}
        onChange={(e) => setSettings((prev) => (prev ? { ...prev, [key]: e.target.value } : prev))}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{t('admin.mailboxSettings')}</h2>
          <button type="button" onClick={onClose} aria-label={t('admin.mailboxSettingsCancel')} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {!settings && !error ? (
          <div className="py-6 text-center text-sm text-gray-500">{t('admin.mailboxSettingsLoading')}</div>
        ) : (
          <div className="space-y-3">
            {field(t('admin.mailboxFromName'), 'fromName', 'text')}
            {field(t('admin.mailboxFromEmail'), 'fromEmail', 'email')}
            {field(t('admin.mailboxReplyTo'), 'replyTo', 'email')}
            <p className="text-xs leading-5 text-gray-500">{t('admin.mailboxSettingsHint')}</p>
          </div>
        )}

        {error && <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            {t('admin.mailboxSettingsCancel')}
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !settings}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? t('admin.mailboxSending') : t('admin.mailboxSettingsSave')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MailboxSettingsModal;
