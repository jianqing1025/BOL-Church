import React, { useEffect, useMemo, useState } from 'react';
import { useAdmin } from '../hooks/useAdmin';
import AdminLogin from './AdminLogin';
import AccountManager from './AccountManager';
import HeroImageManager from './HeroImageManager';
import RichTextEditor from './RichTextEditor';
import SermonManager from './SermonManager';
import TextContentManager from './TextContentManager';
import UserManager from './UserManager';
import { api } from '../api';
import type { AnalyticsSummary } from '../data';
import { adminRoleLabel } from '../utils/adminRoles';
import { navigateTo } from '../utils/routes';

type Section = 'overview' | 'homepage' | 'text' | 'sermons' | 'manna' | 'inbox' | 'prayer' | 'giving' | 'users' | 'account';

const sectionLabels: Record<Section, string> = {
  overview: 'Overview',
  homepage: 'Homepage',
  text: 'Text',
  sermons: 'Sermons',
  manna: 'Manna',
  inbox: 'Inbox',
  prayer: 'Prayer Request',
  giving: 'Giving',
  users: 'Users',
  account: 'My Account',
};

const heroFields = [
  { key: 'hero.title', label: 'Hero title', multiline: true },
  { key: 'hero.subtitle', label: 'Hero subtitle', multiline: true },
  { key: 'hero.whoWeAre', label: 'Secondary button: About' },
  { key: 'hero.sundayService', label: 'Secondary button: Sermons' },
  { key: 'hero.button', label: 'Primary button' },
] as const;

const heroTextFields = heroFields.slice(0, 2);
const heroButtonFields = heroFields.slice(2);

function getNestedValue(obj: any, path: string) {
  return path.split('.').reduce((acc, part) => acc && acc[part], obj);
}

function formatDate(isoString: string) {
  return new Date(isoString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatShortDate(isoString: string) {
  const dateOnlyMatch = isoString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateOnlyMatch
    ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
    : new Date(isoString);

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function initialsForUser(name: string, email: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return (parts[0]?.slice(0, 2) || email.slice(0, 2)).toUpperCase();
}

function formatPreviewText(value: unknown, fallback: string) {
  if (typeof value !== 'string' || !value.trim()) {
    return fallback;
  }

  const cleaned = value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim();

  return cleaned || fallback;
}

const AdminDashboard: React.FC = () => {
  const {
    isAdminMode,
    currentUser,
    loading,
    logout,
    canAccessSection,
    content,
    updateContent,
    uploadImage,
    saveChanges,
    hasUnsavedContent,
    messages,
    deleteMessage,
    markMessageRead,
    prayerRequests,
    deletePrayerRequest,
    markPrayerPrayed,
    donations,
    sermons,
    dailyManna,
  } = useAdmin();
  const [activeSection, setActiveSection] = useState<Section>('overview');
  const [accountMode, setAccountMode] = useState<'profile' | 'password'>('profile');
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  const unreadMessages = messages.filter(message => !message.read).length;
  const newPrayerRequests = prayerRequests.filter(item => item.status === 'new').length;
  const totalGiven = donations.reduce((sum, donation) => sum + donation.amount, 0);
  const sermonCount = sermons.length;
  const mannaCount = dailyManna.length;
  const primarySections: Section[] = ['overview', 'homepage', 'text', 'sermons', 'manna', 'users'];
  const activitySections: Section[] = ['inbox', 'prayer', 'giving'];
  const visiblePrimarySections = primarySections.filter(canAccessSection);
  const visibleMobileSections = [...primarySections, ...activitySections].filter(canAccessSection);

  useEffect(() => {
    if (isAdminMode && !canAccessSection(activeSection)) {
      setActiveSection('overview');
    }
  }, [activeSection, canAccessSection, isAdminMode]);

  const recentActivity = useMemo(() => {
    const messageItems = messages.slice(0, 3).map(item => ({
      id: item.id,
      type: 'Message',
      section: 'inbox' as const,
      summary: `${item.firstName} ${item.lastName}`.trim() || item.email,
      date: item.date,
      state: item.read ? 'Read' : 'Unread',
    }));
    const prayerItems = prayerRequests.slice(0, 3).map(item => ({
      id: item.id,
      type: 'Prayer',
      section: 'prayer' as const,
      summary: `${item.firstName} ${item.lastName}`.trim() || 'Anonymous',
      date: item.date,
      state: item.status === 'new' ? 'New' : 'Prayed',
    }));
    const sermonItems = sermons.slice(0, 3).map(item => ({
      id: item.id,
      type: 'Sermon',
      section: 'sermons' as const,
      summary: item.title.en || item.title.zh,
      date: item.date,
      state: 'Sunday Worship',
    }));
    const mannaItems = dailyManna.slice(0, 3).map(item => ({
      id: item.id,
      type: 'Manna',
      section: 'manna' as const,
      summary: item.title.en || item.title.zh,
      date: item.date,
      state: 'Daily Manna',
    }));

    return [...messageItems, ...prayerItems, ...sermonItems, ...mannaItems]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 8);
  }, [messages, prayerRequests, sermons, dailyManna]);

  useEffect(() => {
    if (!isAdminMode) {
      return;
    }

    let cancelled = false;
    setAnalyticsLoading(true);

    api.analyticsSummary()
      .then(result => {
        if (cancelled) return;
        setAnalytics(result);
        setAnalyticsError(result.error ?? null);
      })
      .catch(error => {
        if (cancelled) return;
        setAnalyticsError(error instanceof Error ? error.message : 'Failed to load analytics.');
      })
      .finally(() => {
        if (!cancelled) {
          setAnalyticsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAdminMode]);

  if (!isAdminMode) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <AdminLogin
          onClose={() => navigateTo('/')}
          onSuccess={() => undefined}
        />
      </div>
    );
  }

  const renderOverview = () => (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-gray-500">Unread messages</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{unreadMessages}</div>
        </div>
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-gray-500">Prayer requests waiting</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{newPrayerRequests}</div>
        </div>
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-gray-500">Published sermons</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{sermonCount}</div>
        </div>
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-gray-500">Recorded donations</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">${totalGiven.toLocaleString()}</div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Website analytics</h2>
              <p className="text-sm text-gray-500">Cloudflare Web Analytics overview for the last 7 days.</p>
            </div>
            <div className="text-xs text-gray-400">
              {analytics?.lastUpdated ? `Updated ${formatDate(analytics.lastUpdated)}` : ''}
            </div>
          </div>

          {analyticsLoading ? (
            <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
              Loading analytics...
            </div>
          ) : analyticsError ? (
            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              {analyticsError}
            </div>
          ) : analytics && analytics.configured ? (
            <div className="mt-6 space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pageviews</div>
                  <div className="mt-2 text-3xl font-bold text-gray-900">{analytics.pageviews.toLocaleString()}</div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Visitors</div>
                  <div className="mt-2 text-3xl font-bold text-gray-900">{analytics.visitors.toLocaleString()}</div>
                </div>
              </div>

              <div>
                <div className="mb-3 text-sm font-semibold text-gray-900">7-day trend</div>
                <div className="space-y-3">
                  {analytics.timeseries.map(point => {
                    const maxValue = Math.max(...analytics.timeseries.map(item => item.pageviews), 1);
                    const width = `${Math.max((point.pageviews / maxValue) * 100, 6)}%`;

                    return (
                      <div key={point.date} className="grid grid-cols-[70px_1fr_78px_78px] items-center gap-3 text-sm">
                        <div className="text-gray-500">{formatShortDate(point.date)}</div>
                        <div className="h-2 rounded-full bg-gray-100">
                          <div className="h-2 rounded-full bg-blue-600" style={{ width }} />
                        </div>
                        <div className="text-right font-semibold text-gray-900">{point.pageviews}</div>
                        <div className="text-right text-gray-500">{point.visitors} visitors</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
              Cloudflare analytics is not configured yet. Add the Web Analytics beacon token on the frontend and the API token plus zone ID on the Worker to show dashboard traffic and regions here.
            </div>
          )}
        </div>

        <div className="rounded-lg bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900">Top regions</h2>
          <p className="mt-1 text-sm text-gray-500">Most active countries by request volume in the same 7-day window.</p>
          <div className="mt-6 space-y-3">
            {analyticsLoading ? (
              <div className="text-sm text-gray-500">Loading regions...</div>
            ) : analytics && analytics.configured && analytics.countries.length > 0 ? (
              analytics.countries.map(country => (
                <div key={country.country} className="flex items-center justify-between rounded-md border border-gray-200 px-4 py-3">
                  <div className="text-sm font-semibold text-gray-900">{country.country}</div>
                  <div className="text-sm text-gray-500">{country.requests.toLocaleString()} requests</div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
                Region data will appear here once Cloudflare analytics is configured.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.9fr]">
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Recent activity</h2>
              <p className="text-sm text-gray-500">Latest updates across sermons, inbox, and prayer requests.</p>
            </div>
          </div>
          <div className="space-y-3">
            {recentActivity.map(item => (
              <button
                key={`${item.type}-${item.id}`}
                onClick={() => setActiveSection(item.section)}
                className="flex w-full items-start justify-between rounded-md border border-gray-200 px-4 py-3 text-left transition-colors hover:border-blue-200 hover:bg-blue-50"
              >
                <div>
                  <div className="text-sm font-semibold text-gray-900">{item.summary}</div>
                  <div className="mt-1 text-xs text-gray-500">{item.type}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-semibold text-gray-700">{item.state}</div>
                  <div className="mt-1 text-xs text-gray-400">{formatDate(item.date)}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900">Editorial status</h2>
          <p className="mt-1 text-sm text-gray-500">Inline editing still works on the site, but the main save flow lives here now.</p>
          <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className={`text-sm font-semibold ${hasUnsavedContent ? 'text-amber-700' : 'text-emerald-700'}`}>
              {hasUnsavedContent ? 'There are unsaved text edits.' : 'All text edits are saved to D1.'}
            </div>
            <button
              onClick={() => void saveChanges()}
              className="mt-4 w-full rounded-md bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800"
            >
              Save Text Changes
            </button>
          </div>
          <div className="mt-6 space-y-3 text-sm text-gray-600">
            {canAccessSection('homepage') && (
              <div className="flex items-center justify-between">
                <span>Homepage hero</span>
                <button onClick={() => setActiveSection('homepage')} className="font-semibold text-blue-600 hover:text-blue-700">
                  Open
                </button>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span>Sermon manager</span>
              <button onClick={() => setActiveSection('sermons')} className="font-semibold text-blue-600 hover:text-blue-700">
                Open
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span>Daily manna manager</span>
              <button onClick={() => setActiveSection('manna')} className="font-semibold text-blue-600 hover:text-blue-700">
                Open
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span>Inbox</span>
              <button onClick={() => setActiveSection('inbox')} className="font-semibold text-blue-600 hover:text-blue-700">
                Open
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderHomepage = () => (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Homepage Hero</h2>
          <p className="text-sm text-gray-600">Manage the first impression: hero copy, calls to action, and slideshow images.</p>
        </div>
        <button
          onClick={() => void saveChanges()}
          className="self-start rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 lg:self-auto"
        >
          Save Text Changes
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-lg bg-white p-5 shadow-sm xl:col-span-2">
          <h3 className="text-lg font-bold text-gray-900">Hero Text</h3>
          <div className="mt-4 space-y-4">
            {heroTextFields.map((field, fieldIndex) => {
              const value = getNestedValue(content, field.key) as { en: string; zh: string } | undefined;
              const isMultiline = 'multiline' in field && field.multiline;
              const showLanguageLabels = fieldIndex === 0;

              return (
                <div key={field.key}>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <label className="space-y-2">
                      {showLanguageLabels && (
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">English</span>
                      )}
                      {isMultiline ? (
                        <RichTextEditor
                          value={value?.en ?? ''}
                          onChange={nextValue => updateContent(`${field.key}.en`, nextValue)}
                          minHeightClassName="min-h-[90px]"
                          onImageUpload={(file, fileName) => uploadImage(`rich-text/${field.key}.en.${Date.now()}`, file, fileName)}
                        />
                      ) : (
                        <input
                          value={value?.en ?? ''}
                          onChange={event => updateContent(`${field.key}.en`, event.target.value)}
                          aria-label="Hero Text English"
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                        />
                      )}
                    </label>
                    <label className="space-y-2">
                      {showLanguageLabels && (
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Chinese</span>
                      )}
                      {isMultiline ? (
                        <RichTextEditor
                          value={value?.zh ?? ''}
                          onChange={nextValue => updateContent(`${field.key}.zh`, nextValue)}
                          minHeightClassName="min-h-[90px]"
                          onImageUpload={(file, fileName) => uploadImage(`rich-text/${field.key}.zh.${Date.now()}`, file, fileName)}
                        />
                      ) : (
                        <input
                          value={value?.zh ?? ''}
                          onChange={event => updateContent(`${field.key}.zh`, event.target.value)}
                          aria-label="Hero Text Chinese"
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                        />
                      )}
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="h-full rounded-lg bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900">Buttons</h3>
          <div className="mt-4 space-y-4">
            {heroButtonFields.map((field, fieldIndex) => {
              const value = getNestedValue(content, field.key) as { en: string; zh: string } | undefined;
              const showLanguageLabels = fieldIndex === 0;

              return (
                <div key={field.key}>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <label className="space-y-2">
                      {showLanguageLabels && (
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">English</span>
                      )}
                      <input
                        value={value?.en ?? ''}
                        onChange={event => updateContent(`${field.key}.en`, event.target.value)}
                        aria-label="Buttons English"
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                      />
                    </label>
                    <label className="space-y-2">
                      {showLanguageLabels && (
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Chinese</span>
                      )}
                      <input
                        value={value?.zh ?? ''}
                        onChange={event => updateContent(`${field.key}.zh`, event.target.value)}
                        aria-label="Buttons Chinese"
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="h-full">
          <div className="flex h-full w-full flex-col rounded-lg bg-gray-950 p-6 text-white shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-white/60">Live Preview</div>
            <div className="mt-4 whitespace-pre-line text-3xl font-bold leading-tight">
              {formatPreviewText(getNestedValue(content, 'hero.title.en'), 'Hero title')}
            </div>
            <div className="mt-3 whitespace-pre-line text-sm leading-6 text-white/80">
              {formatPreviewText(getNestedValue(content, 'hero.subtitle.en'), 'Hero subtitle')}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <div className="rounded-md border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold">
                {getNestedValue(content, 'hero.whoWeAre.en') || 'Who We Are'}
              </div>
              <div className="rounded-md border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold">
                {getNestedValue(content, 'hero.sundayService.en') || 'Sunday Service'}
              </div>
              <div className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold">
                {getNestedValue(content, 'hero.button.en') || 'Plan Your Visit'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-white p-5 shadow-sm">
        <HeroImageManager />
      </div>
    </div>
  );

  const renderMessages = () => (
    <div className="rounded-lg bg-white shadow-sm">
      <div className="border-b border-gray-200 px-6 py-4">
        <h3 className="text-lg font-bold text-gray-800">Messages ({messages.length})</h3>
      </div>
      {messages.length === 0 ? (
        <div className="p-6 text-center text-gray-500">No messages yet.</div>
      ) : (
        <div className="divide-y divide-gray-200">
          {messages.map(msg => (
            <div key={msg.id} className={`p-6 ${!msg.read ? 'bg-blue-50' : ''}`}>
              <div className="mb-2 flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-md font-bold text-gray-900">{msg.firstName} {msg.lastName}</h4>
                  <div className="text-sm text-gray-500">{msg.email} {msg.phone ? `• ${msg.phone}` : ''}</div>
                </div>
                <div className="text-xs text-gray-400">{formatDate(msg.date)}</div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-gray-700">{msg.message}</p>
              <div className="mt-4 flex gap-3">
                {!msg.read && (
                  <button onClick={() => void markMessageRead(msg.id)} className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-200">
                    Mark as Read
                  </button>
                )}
                <button onClick={() => void deleteMessage(msg.id)} className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-200">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderPrayerRequests = () => (
    <div className="rounded-lg bg-white shadow-sm">
      <div className="border-b border-gray-200 px-6 py-4">
        <h3 className="text-lg font-bold text-gray-800">Prayer Requests ({prayerRequests.length})</h3>
      </div>
      {prayerRequests.length === 0 ? (
        <div className="p-6 text-center text-gray-500">No prayer requests yet.</div>
      ) : (
        <div className="divide-y divide-gray-200">
          {prayerRequests.map(req => (
            <div key={req.id} className={`p-6 ${req.status === 'new' ? 'bg-yellow-50' : ''}`}>
              <div className="mb-2 flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-md font-bold text-gray-900">{`${req.firstName || 'Anonymous'} ${req.lastName}`.trim()}</h4>
                  <div className="text-sm text-gray-500">
                    {req.email && <span>{req.email}</span>}
                    {req.email && req.phone && <span> • </span>}
                    {req.phone && <span>{req.phone}</span>}
                  </div>
                </div>
                <div className="text-xs text-gray-400">{formatDate(req.date)}</div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-gray-700">{req.message}</p>
              <div className="mt-4 flex gap-3">
                {req.status === 'new' ? (
                  <button onClick={() => void markPrayerPrayed(req.id)} className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 hover:bg-green-200">
                    Mark as Prayed
                  </button>
                ) : (
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">Prayed</span>
                )}
                <button onClick={() => void deletePrayerRequest(req.id)} className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-200">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderGiving = () => (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <h4 className="text-sm font-semibold uppercase text-gray-500">Total Donations</h4>
          <div className="mt-2 text-3xl font-bold text-gray-900">${totalGiven.toLocaleString()}</div>
        </div>
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <h4 className="text-sm font-semibold uppercase text-gray-500">Transactions</h4>
          <div className="mt-2 text-3xl font-bold text-gray-900">{donations.length}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-bold text-gray-800">Donation Records</h3>
        </div>
        {donations.length === 0 ? (
          <div className="p-6 text-center text-gray-500">No donations recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">Date</th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">Amount</th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">Type</th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {donations.map(donation => (
                  <tr key={donation.id}>
                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(donation.date)}</td>
                    <td className="px-6 py-4 text-sm font-bold text-gray-900">${donation.amount}</td>
                    <td className="px-6 py-4 text-sm capitalize text-gray-600">{donation.type}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800">{donation.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  const renderSection = () => {
    if (loading) {
      return <div className="rounded-lg bg-white p-8 text-sm text-gray-500 shadow-sm">Loading admin data...</div>;
    }

    switch (activeSection) {
      case 'overview':
        return renderOverview();
      case 'homepage':
        return renderHomepage();
      case 'text':
        return <TextContentManager />;
      case 'sermons':
        return (
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="text-2xl font-bold text-gray-900">Sermons</h2>
              <p className="text-sm text-gray-600">Create, update, and remove Sunday worship messages.</p>
            </div>
            <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              {sermonCount} sermon entries are currently published.
            </div>
            <SermonManager entryType="sermon" />
          </div>
        );
      case 'manna':
        return (
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="text-2xl font-bold text-gray-900">Manna</h2>
              <p className="text-sm text-gray-600">Manage daily manna content separately from Sunday worship messages.</p>
            </div>
            <div className="mb-4 rounded-lg border border-purple-100 bg-purple-50 px-4 py-3 text-sm text-purple-800">
              {mannaCount} daily manna entries are currently published.
            </div>
            <SermonManager entryType="daily-manna" />
          </div>
        );
      case 'inbox':
        return renderMessages();
      case 'prayer':
        return renderPrayerRequests();
      case 'giving':
        return renderGiving();
      case 'users':
        return <UserManager />;
      case 'account':
        return <AccountManager initialMode={accountMode} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-100">
      <aside className="sticky top-0 hidden h-screen w-72 flex-shrink-0 flex-col bg-gray-950 text-white lg:flex">
        <div className="border-b border-white/10 p-6">
          <div className="text-xl font-bold">Admin Dashboard</div>
          <div className="mt-1 text-sm text-white/60">Bread of Life Christian Church</div>
        </div>
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-4">
          {visiblePrimarySections.map(section => {
            const badge = section === 'text' && hasUnsavedContent ? 1 : 0;

            return (
              <button
                key={section}
                onClick={() => setActiveSection(section)}
                className={`flex w-full items-center justify-between rounded-md px-4 py-3 text-left text-sm font-medium transition-colors ${
                  activeSection === section ? 'bg-blue-600 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span>{sectionLabels[section]}</span>
                {badge > 0 && (
                  <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs text-white">{badge}</span>
                )}
              </button>
            );
          })}
          <div className="my-4 border-t border-white/25" />
          {activitySections.filter(canAccessSection).map(section => {
            const badge =
              section === 'inbox' ? unreadMessages :
              section === 'prayer' ? newPrayerRequests :
              0;

            return (
              <button
                key={section}
                onClick={() => setActiveSection(section)}
                className={`flex w-full items-center justify-between rounded-md px-4 py-3 text-left text-sm font-medium transition-colors ${
                  activeSection === section ? 'bg-blue-600 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span>{sectionLabels[section]}</span>
                {badge > 0 && (
                  <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs text-white">{badge}</span>
                )}
              </button>
            );
          })}
          <div className="my-4 border-t border-white/25" />
          <a href="/" className="block rounded-md px-4 py-3 text-sm font-medium text-white/75 hover:bg-white/10 hover:text-white">
            Back to Website
          </a>
        </nav>
        <div className="border-t border-white/10 p-4">
          {currentUser && (
            <div className="relative">
              <div className="flex items-center gap-3 rounded-lg bg-white/10 px-3 py-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                  {initialsForUser(currentUser.name, currentUser.email)}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-white">{currentUser.name}</div>
                    <div className="truncate text-xs text-white/60">{currentUser.email}</div>
                </div>
                <span className="rounded-md bg-white/10 px-2 py-1 text-xs font-semibold text-white/75">
                  {adminRoleLabel(currentUser.role)}
                </span>
                <details className="group">
                  <summary className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md text-xl leading-none text-white/70 hover:bg-white/10 hover:text-white">
                    ...
                  </summary>
                  <div className="absolute bottom-full right-0 z-20 mb-2 w-48 rounded-lg border border-white/15 bg-gray-900 p-2 shadow-2xl">
                    <button
                      onClick={() => {
                        setAccountMode('profile');
                        setActiveSection('account');
                      }}
                      className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-white/75 hover:bg-white/10 hover:text-white"
                    >
                      Profile Setting
                    </button>
                    <button
                      onClick={() => {
                        setAccountMode('password');
                        setActiveSection('account');
                      }}
                      className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-white/75 hover:bg-white/10 hover:text-white"
                    >
                      Change Password
                    </button>
                    <button
                      onClick={() => void logout()}
                      className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-white/75 hover:bg-red-900 hover:text-white"
                    >
                      Sign Out
                    </button>
                  </div>
                </details>
              </div>
            </div>
          )}
        </div>
      </aside>

      <main className="min-h-screen flex-1">
        <div className="border-b border-gray-200 bg-white px-5 py-4 shadow-sm sm:px-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{sectionLabels[activeSection]}</h1>
              <p className="text-sm text-gray-500">Everything that used to live in the bottom admin bar now lives here.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:hidden">
              {visibleMobileSections.map(section => (
                <button
                  key={section}
                  onClick={() => setActiveSection(section)}
                  className={`rounded-md px-3 py-2 text-sm font-semibold ${
                    activeSection === section ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {sectionLabels[section]}
                </button>
              ))}
              <a href="/" className="rounded-md bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700">Website</a>
              <button
                onClick={() => void logout()}
                className="rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-8">
          <div className="mx-auto max-w-7xl">{renderSection()}</div>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
