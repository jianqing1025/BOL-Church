import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useLocalization } from '../hooks/useLocalization';
import type { LiveStreamAdminState, LiveStreamConfig } from '../types';

const UNCHANGED_API_KEY = '__unchanged__';

const COMMON_TIMEZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'Asia/Taipei',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'UTC',
];

const DAY_LABEL_KEYS = [
  'admin.livestreamSunday',
  'admin.livestreamMonday',
  'admin.livestreamTuesday',
  'admin.livestreamWednesday',
  'admin.livestreamThursday',
  'admin.livestreamFriday',
  'admin.livestreamSaturday',
];

function formatRelative(ts: number | null, t: (key: string) => string): string {
  if (!ts) return t('admin.livestreamNever');
  const date = new Date(ts);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const LiveStreamManager: React.FC = () => {
  const { t } = useLocalization();
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<LiveStreamConfig | null>(null);
  const [state, setState] = useState<LiveStreamAdminState | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [apiKeyEditing, setApiKeyEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.liveStreamAdminGet()
      .then(res => {
        if (cancelled) return;
        setConfig(res.config);
        setState(res.state);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !config) {
    return (
      <div className="rounded-lg bg-white p-8 text-sm text-gray-500 shadow-sm">
        {error ?? t('admin.loadingAdminData')}
      </div>
    );
  }

  const updateConfigField = <K extends keyof LiveStreamConfig>(key: K, value: LiveStreamConfig[K]) => {
    setConfig(prev => (prev ? { ...prev, [key]: value } : prev));
    setSavedMessage(null);
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setSavedMessage(null);
    setError(null);
    try {
      const payload = {
        channelId: config.channelId,
        apiKey: apiKeyEditing ? apiKeyInput : UNCHANGED_API_KEY,
        serviceDay: config.serviceDay,
        serviceStartLocal: config.serviceStartLocal,
        serviceDurationMinutes: config.serviceDurationMinutes,
        timezone: config.timezone,
        manualVideoId: config.manualVideoId,
        enabled: config.enabled,
      };
      const res = await api.liveStreamAdminSave(payload);
      setConfig(res.config);
      setApiKeyEditing(false);
      setApiKeyInput('');
      setSavedMessage(t('admin.livestreamSaved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const res = await api.liveStreamAdminTest({
        channelId: config.channelId,
        apiKey: apiKeyEditing ? apiKeyInput : UNCHANGED_API_KEY,
      });
      if (res.ok && res.channelName) {
        setTestResult(`${t('admin.livestreamTestOk')} ${res.channelName}`);
      } else {
        setError(res.error ?? 'Test failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTesting(false);
    }
  };

  const handleProbe = async () => {
    setProbing(true);
    setError(null);
    try {
      const res = await api.liveStreamAdminProbe();
      setState(res.state);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProbing(false);
    }
  };

  return (
    <div className="rounded-lg bg-white p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-gray-900">{t('admin.livestream')}</h2>
        <p className="text-sm text-gray-600">{t('admin.livestreamSubtitle')}</p>
      </div>

      <div className="space-y-5">
        <label className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={event => updateConfigField('enabled', event.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm font-semibold text-gray-900">{t('admin.livestreamEnabled')}</span>
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-semibold text-gray-700">{t('admin.livestreamChannelId')}</label>
            <input
              type="text"
              value={config.channelId}
              onChange={event => updateConfigField('channelId', event.target.value)}
              placeholder="UCxxxxxxxxxxxxxxxxxxxxxx"
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700">{t('admin.livestreamApiKey')}</label>
            <div className="mt-1 flex gap-2">
              <input
                type={apiKeyEditing ? 'text' : 'password'}
                value={apiKeyEditing ? apiKeyInput : (config.apiKeyMasked || '')}
                onChange={event => {
                  setApiKeyEditing(true);
                  setApiKeyInput(event.target.value);
                }}
                placeholder={config.apiKeyPresent ? '' : 'AIzaSy...'}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
              {apiKeyEditing && (
                <button
                  type="button"
                  onClick={() => {
                    setApiKeyEditing(false);
                    setApiKeyInput('');
                  }}
                  className="rounded border border-gray-300 px-3 text-xs text-gray-700 hover:bg-gray-50"
                >
                  ↺
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">{t('admin.livestreamApiKeyHint')}</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700">{t('admin.livestreamServiceDay')}</label>
            <select
              value={config.serviceDay}
              onChange={event => updateConfigField('serviceDay', Number(event.target.value))}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              {DAY_LABEL_KEYS.map((key, idx) => (
                <option key={idx} value={idx}>{t(key)}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700">{t('admin.livestreamServiceStart')}</label>
              <input
                type="time"
                value={config.serviceStartLocal}
                onChange={event => updateConfigField('serviceStartLocal', event.target.value)}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700">{t('admin.livestreamServiceDuration')}</label>
              <input
                type="number"
                min={5}
                max={720}
                value={config.serviceDurationMinutes}
                onChange={event => updateConfigField('serviceDurationMinutes', Number(event.target.value))}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700">{t('admin.livestreamTimezone')}</label>
            <select
              value={config.timezone}
              onChange={event => updateConfigField('timezone', event.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              {COMMON_TIMEZONES.map(tz => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
              {!COMMON_TIMEZONES.includes(config.timezone) && (
                <option value={config.timezone}>{config.timezone}</option>
              )}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700">{t('admin.livestreamManualVideo')}</label>
            <input
              type="text"
              value={config.manualVideoId}
              onChange={event => updateConfigField('manualVideoId', event.target.value)}
              placeholder="dQw4w9WgXcQ"
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">{t('admin.livestreamManualVideoHint')}</p>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
            {error}
          </div>
        )}
        {testResult && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
            {testResult}
          </div>
        )}
        {savedMessage && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
            {savedMessage}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            {testing ? t('admin.livestreamTesting') : t('admin.livestreamTestConnection')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? t('admin.livestreamSaving') : t('admin.livestreamSave')}
          </button>
        </div>
      </div>

      <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">{t('admin.livestreamCurrentStatus')}</h3>
          <button
            type="button"
            onClick={handleProbe}
            disabled={probing}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            {probing ? t('admin.livestreamProbing') : t('admin.livestreamProbeNow')}
          </button>
        </div>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-semibold text-gray-700">Status</dt>
            <dd className={state?.isLive ? 'text-red-600 font-bold' : 'text-gray-600'}>
              {state?.isLive ? `● ${t('admin.livestreamLive')}` : `○ ${t('admin.livestreamOffline')}`}
              {state?.videoId && (
                <span className="ml-2 font-mono text-xs text-gray-500">{state.videoId}</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-gray-700">{t('admin.livestreamLastChecked')}</dt>
            <dd className="text-gray-600">{formatRelative(state?.checkedAt ?? null, t)}</dd>
          </div>
          {state?.startedAt && (
            <div>
              <dt className="font-semibold text-gray-700">{t('sermonsPage.liveStartedAt')}</dt>
              <dd className="text-gray-600">{formatRelative(state.startedAt, t)}</dd>
            </div>
          )}
          {state?.lastError && (
            <div className="sm:col-span-2">
              <dt className="font-semibold text-red-700">{t('admin.livestreamLastError')}</dt>
              <dd className="text-red-600 text-xs">{state.lastError}</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
};

export default LiveStreamManager;
