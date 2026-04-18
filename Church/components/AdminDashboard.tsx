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
import type { AnalyticsSummary, WebAnalyticsRange, WebAnalyticsSummary, WebAnalyticsRankedItem } from '../data';
import { useLocalization } from '../hooks/useLocalization';
import { Language } from '../types';
import { navigateTo } from '../utils/routes';
import { APP_VERSION } from '../constants/appVersion';
import { geoEqualEarth, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import worldCountries from 'world-atlas/countries-110m.json';

type Section = 'overview' | 'homepage' | 'text' | 'sermons' | 'manna' | 'inbox' | 'prayer' | 'giving' | 'users' | 'analytics' | 'account';

const sectionLabelKeys: Record<Section, string> = {
  overview: 'admin.overview',
  homepage: 'admin.homepage',
  text: 'admin.text',
  sermons: 'admin.sermons',
  manna: 'admin.manna',
  inbox: 'admin.inbox',
  prayer: 'admin.prayerRequest',
  giving: 'admin.givingTab',
  users: 'admin.users',
  analytics: 'admin.webAnalytics',
  account: 'admin.myAccount',
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

function formatDate(isoString: string, locale: string) {
  return new Date(isoString).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatShortDate(isoString: string, locale: string) {
  const dateOnlyMatch = isoString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateOnlyMatch
    ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
    : new Date(isoString);

  return date.toLocaleDateString(locale, {
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

function formatMetric(value: number | null) {
  return value === null ? 'N/A' : value.toLocaleString();
}

function formatMs(value: number | null) {
  return value === null ? 'N/A' : `${value.toLocaleString()} ms`;
}

type CountryInfo = {
  name: string;
  code?: string;
  numericId?: string;
};

const countryByCode: Record<string, CountryInfo> = {
  AU: { name: 'Australia', code: 'AU', numericId: '036' },
  BR: { name: 'Brazil', code: 'BR', numericId: '076' },
  CA: { name: 'Canada', code: 'CA', numericId: '124' },
  CN: { name: 'China', code: 'CN', numericId: '156' },
  DE: { name: 'Germany', code: 'DE', numericId: '276' },
  DZ: { name: 'Algeria', code: 'DZ', numericId: '012' },
  FR: { name: 'France', code: 'FR', numericId: '250' },
  GB: { name: 'United Kingdom', code: 'GB', numericId: '826' },
  HK: { name: 'Hong Kong', code: 'HK', numericId: '344' },
  ID: { name: 'Indonesia', code: 'ID', numericId: '360' },
  IN: { name: 'India', code: 'IN', numericId: '356' },
  JP: { name: 'Japan', code: 'JP', numericId: '392' },
  KE: { name: 'Kenya', code: 'KE', numericId: '404' },
  MX: { name: 'Mexico', code: 'MX', numericId: '484' },
  MY: { name: 'Malaysia', code: 'MY', numericId: '458' },
  PH: { name: 'Philippines', code: 'PH', numericId: '608' },
  PK: { name: 'Pakistan', code: 'PK', numericId: '586' },
  SG: { name: 'Singapore', code: 'SG', numericId: '702' },
  TN: { name: 'Tunisia', code: 'TN', numericId: '788' },
  TW: { name: 'Taiwan', code: 'TW', numericId: '158' },
  US: { name: 'United States', code: 'US', numericId: '840' },
  UZ: { name: 'Uzbekistan', code: 'UZ', numericId: '860' },
  VN: { name: 'Vietnam', code: 'VN', numericId: '704' },
};

const countryCodeByName = Object.fromEntries(
  Object.values(countryByCode).map(info => [info.name.toLowerCase(), info.code])
) as Record<string, string>;

countryCodeByName['united states of america'] = 'US';

const countryMapPoints: Record<string, { x: number; y: number }> = {
  Algeria: { x: 364, y: 124 },
  Australia: { x: 594, y: 254 },
  Brazil: { x: 256, y: 200 },
  Canada: { x: 148, y: 68 },
  China: { x: 568, y: 110 },
  France: { x: 358, y: 104 },
  Germany: { x: 374, y: 96 },
  'Hong Kong': { x: 588, y: 136 },
  India: { x: 516, y: 138 },
  Indonesia: { x: 574, y: 188 },
  Japan: { x: 636, y: 106 },
  Kenya: { x: 436, y: 182 },
  Malaysia: { x: 564, y: 172 },
  Mexico: { x: 142, y: 130 },
  Pakistan: { x: 500, y: 126 },
  Philippines: { x: 604, y: 156 },
  Singapore: { x: 568, y: 176 },
  Taiwan: { x: 602, y: 132 },
  Tunisia: { x: 374, y: 114 },
  'United Kingdom': { x: 350, y: 88 },
  'United States': { x: 164, y: 102 },
  Uzbekistan: { x: 486, y: 110 },
  Vietnam: { x: 576, y: 152 },
};

const worldCountryFeatures = (
  feature((worldCountries as any), (worldCountries as any).objects.countries) as any
).features.filter((item: any) => item.id !== '010');
const worldCountryById = new Map<string, any>(
  worldCountryFeatures.map((item: any) => [String(item.id).padStart(3, '0'), item])
);
const worldProjection = geoEqualEarth().fitExtent(
  [[18, 18], [702, 318]],
  { type: 'Sphere' } as any
);
const worldPath = geoPath(worldProjection);

function countryInfoForLabel(label: string): CountryInfo {
  const normalized = label.trim();
  const upper = normalized.toUpperCase();
  if (countryByCode[upper]) {
    return countryByCode[upper];
  }

  const code = countryCodeByName[normalized.toLowerCase()];
  if (code && countryByCode[code]) {
    return countryByCode[code];
  }

  return { name: normalized || 'Unknown', code: normalized.length <= 3 ? upper : undefined };
}

function countryDisplayLabel(label: string) {
  const info = countryInfoForLabel(label);
  return info.code ? `${info.name} (${info.code})` : info.name;
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
  const { t, language, toggleLanguage } = useLocalization();
  const [activeSection, setActiveSection] = useState<Section>('overview');
  const [accountMode, setAccountMode] = useState<'profile' | 'password'>('profile');
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [webAnalytics, setWebAnalytics] = useState<WebAnalyticsSummary | null>(null);
  const [webAnalyticsRange, setWebAnalyticsRange] = useState<WebAnalyticsRange>('72h');
  const [webAnalyticsExcludeBots, setWebAnalyticsExcludeBots] = useState(true);
  const [webAnalyticsLoading, setWebAnalyticsLoading] = useState(false);
  const [webAnalyticsError, setWebAnalyticsError] = useState<string | null>(null);
  const [countryPage, setCountryPage] = useState(0);
  const [sourceItemCount, setSourceItemCount] = useState<5 | 10 | 15>(5);

  const unreadMessages = messages.filter(message => !message.read).length;
  const newPrayerRequests = prayerRequests.filter(item => item.status === 'new').length;
  const totalGiven = donations.reduce((sum, donation) => sum + donation.amount, 0);
  const sermonCount = sermons.length;
  const mannaCount = dailyManna.length;
  const dateLocale = language === Language.ZH ? 'zh-TW' : 'en-US';
  const sectionLabel = (section: Section) => t(sectionLabelKeys[section]);
  const roleLabel = currentUser?.role === 'owner' ? t('admin.owner') : t('admin.adminRole');
  const primarySections: Section[] = ['overview', 'homepage', 'text', 'sermons', 'manna', 'users'];
  const activitySections: Section[] = ['inbox', 'prayer', 'giving'];
  const insightSections: Section[] = ['analytics'];
  const visiblePrimarySections = primarySections.filter(canAccessSection);
  const visibleMobileSections = [...primarySections, ...activitySections, ...insightSections].filter(canAccessSection);

  useEffect(() => {
    if (isAdminMode && !canAccessSection(activeSection)) {
      setActiveSection('overview');
    }
  }, [activeSection, canAccessSection, isAdminMode]);

  const recentActivity = useMemo(() => {
    const messageItems = messages.slice(0, 3).map(item => ({
      id: item.id,
      type: t('admin.messagesTab'),
      section: 'inbox' as const,
      summary: `${item.firstName} ${item.lastName}`.trim() || item.email,
      date: item.date,
      state: item.read ? t('admin.markRead') : t('admin.unreadMessages'),
    }));
    const prayerItems = prayerRequests.slice(0, 3).map(item => ({
      id: item.id,
      type: t('admin.prayerTab'),
      section: 'prayer' as const,
      summary: `${item.firstName} ${item.lastName}`.trim() || t('admin.anonymous'),
      date: item.date,
      state: item.status === 'new' ? t('admin.prayerWaiting') : t('admin.prayed'),
    }));
    const sermonItems = sermons.slice(0, 3).map(item => ({
      id: item.id,
      type: t('admin.sundayMessage'),
      section: 'sermons' as const,
      summary: item.title.en || item.title.zh,
      date: item.date,
      state: t('admin.sundayMessage'),
    }));
    const mannaItems = dailyManna.slice(0, 3).map(item => ({
      id: item.id,
      type: t('admin.dailyManna'),
      section: 'manna' as const,
      summary: item.title.en || item.title.zh,
      date: item.date,
      state: t('admin.dailyManna'),
    }));

    return [...messageItems, ...prayerItems, ...sermonItems, ...mannaItems]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 8);
  }, [dailyManna, messages, prayerRequests, sermons, t]);

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
        setAnalyticsError(error instanceof Error ? error.message : t('admin.loadingAnalytics'));
      })
      .finally(() => {
        if (!cancelled) {
          setAnalyticsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAdminMode, language]);

  useEffect(() => {
    if (!isAdminMode || activeSection !== 'analytics') {
      return;
    }

    let cancelled = false;
    setWebAnalyticsLoading(true);
    setWebAnalyticsError(null);

    api.webAnalytics(webAnalyticsRange, webAnalyticsExcludeBots)
      .then(result => {
        if (cancelled) return;
        setWebAnalytics(result);
        setWebAnalyticsError(result.error ?? null);
      })
      .catch(error => {
        if (cancelled) return;
        setWebAnalyticsError(error instanceof Error ? error.message : 'Failed to load Web Analytics.');
      })
      .finally(() => {
        if (!cancelled) {
          setWebAnalyticsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, isAdminMode, webAnalyticsExcludeBots, webAnalyticsRange]);

  useEffect(() => {
    setCountryPage(0);
  }, [webAnalyticsRange, webAnalyticsExcludeBots]);

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
          <div className="text-sm font-medium text-gray-500">{t('admin.unreadMessages')}</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{unreadMessages}</div>
        </div>
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-gray-500">{t('admin.prayerWaiting')}</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{newPrayerRequests}</div>
        </div>
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-gray-500">{t('admin.publishedSermons')}</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{sermonCount}</div>
        </div>
        <div className="rounded-lg bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-gray-500">{t('admin.recordedDonations')}</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">${totalGiven.toLocaleString()}</div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{t('admin.websiteAnalytics')}</h2>
              <p className="text-sm text-gray-500">{t('admin.analyticsSubtitle')}</p>
            </div>
            <div className="text-xs text-gray-400">
              {analytics?.lastUpdated ? `${t('admin.updated')} ${formatDate(analytics.lastUpdated, dateLocale)}` : ''}
            </div>
          </div>

          {analyticsLoading ? (
            <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
              {t('admin.loadingAnalytics')}
            </div>
          ) : analyticsError ? (
            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              {analyticsError}
            </div>
          ) : analytics && analytics.configured ? (
            <div className="mt-6 space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('admin.pageviews')}</div>
                  <div className="mt-2 text-3xl font-bold text-gray-900">{analytics.pageviews.toLocaleString()}</div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('admin.visitors')}</div>
                  <div className="mt-2 text-3xl font-bold text-gray-900">{analytics.visitors.toLocaleString()}</div>
                </div>
              </div>

              <div>
                <div className="mb-3 text-sm font-semibold text-gray-900">{t('admin.sevenDayTrend')}</div>
                <div className="space-y-3">
                  {analytics.timeseries.map(point => {
                    const maxValue = Math.max(...analytics.timeseries.map(item => item.pageviews), 1);
                    const width = `${Math.max((point.pageviews / maxValue) * 100, 6)}%`;

                    return (
                      <div key={point.date} className="grid grid-cols-[70px_1fr_78px_78px] items-center gap-3 text-sm">
                        <div className="text-gray-500">{formatShortDate(point.date, dateLocale)}</div>
                        <div className="h-2 rounded-full bg-gray-100">
                          <div className="h-2 rounded-full bg-blue-600" style={{ width }} />
                        </div>
                        <div className="text-right font-semibold text-gray-900">{point.pageviews}</div>
                        <div className="text-right text-gray-500">{point.visitors} {t('admin.visitorsLower')}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
              {t('admin.analyticsNotConfigured')}
            </div>
          )}
        </div>

        <div className="rounded-lg bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900">{t('admin.topRegions')}</h2>
          <p className="mt-1 text-sm text-gray-500">{t('admin.topRegionsSubtitle')}</p>
          <div className="mt-6 space-y-3">
            {analyticsLoading ? (
              <div className="text-sm text-gray-500">{t('admin.loadingRegions')}</div>
            ) : analytics && analytics.configured && analytics.countries.length > 0 ? (
              analytics.countries.map(country => (
                <div key={country.country} className="flex items-center justify-between rounded-md border border-gray-200 px-4 py-3">
                  <div className="text-sm font-semibold text-gray-900">{country.country}</div>
                  <div className="text-sm text-gray-500">{country.requests.toLocaleString()} {t('admin.requestsLower')}</div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
                {t('admin.regionsEmpty')}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.9fr]">
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{t('admin.recentActivity')}</h2>
              <p className="text-sm text-gray-500">{t('admin.recentActivitySubtitle')}</p>
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
                  <div className="mt-1 text-xs text-gray-400">{formatDate(item.date, dateLocale)}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900">{t('admin.editorialStatus')}</h2>
          <p className="mt-1 text-sm text-gray-500">{t('admin.editorialSubtitle')}</p>
          <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className={`text-sm font-semibold ${hasUnsavedContent ? 'text-amber-700' : 'text-emerald-700'}`}>
              {hasUnsavedContent ? t('admin.unsavedTextEdits') : t('admin.savedToD1')}
            </div>
            <button
              onClick={() => void saveChanges()}
              className="mt-4 w-full rounded-md bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800"
            >
              {t('admin.saveTextChanges')}
            </button>
          </div>
          <div className="mt-6 space-y-3 text-sm text-gray-600">
            {canAccessSection('homepage') && (
              <div className="flex items-center justify-between">
                <span>{t('admin.homepageHero')}</span>
                <button onClick={() => setActiveSection('homepage')} className="font-semibold text-blue-600 hover:text-blue-700">
                  {t('admin.open')}
                </button>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span>{t('admin.sermonManager')}</span>
              <button onClick={() => setActiveSection('sermons')} className="font-semibold text-blue-600 hover:text-blue-700">
                {t('admin.open')}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span>{t('admin.mannaManager')}</span>
              <button onClick={() => setActiveSection('manna')} className="font-semibold text-blue-600 hover:text-blue-700">
                {t('admin.open')}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span>{t('admin.inbox')}</span>
              <button onClick={() => setActiveSection('inbox')} className="font-semibold text-blue-600 hover:text-blue-700">
                {t('admin.open')}
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
          <h2 className="text-2xl font-bold text-gray-900">{t('admin.homepageHeroTitle')}</h2>
          <p className="text-sm text-gray-600">{t('admin.homepageHeroSubtitle')}</p>
        </div>
        <button
          onClick={() => void saveChanges()}
          className="self-start rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 lg:self-auto"
        >
          {t('admin.saveTextChanges')}
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-lg bg-white p-5 shadow-sm xl:col-span-2">
          <h3 className="text-lg font-bold text-gray-900">{t('admin.heroText')}</h3>
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
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('admin.english')}</span>
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
                          aria-label={t('admin.english')}
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                        />
                      )}
                    </label>
                    <label className="space-y-2">
                      {showLanguageLabels && (
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('admin.chinese')}</span>
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
                          aria-label={t('admin.chinese')}
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
          <h3 className="text-lg font-bold text-gray-900">{t('admin.buttons')}</h3>
          <div className="mt-4 space-y-4">
            {heroButtonFields.map((field, fieldIndex) => {
              const value = getNestedValue(content, field.key) as { en: string; zh: string } | undefined;
              const showLanguageLabels = fieldIndex === 0;

              return (
                <div key={field.key}>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <label className="space-y-2">
                      {showLanguageLabels && (
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('admin.english')}</span>
                      )}
                      <input
                        value={value?.en ?? ''}
                        onChange={event => updateContent(`${field.key}.en`, event.target.value)}
                        aria-label={t('admin.english')}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                      />
                    </label>
                    <label className="space-y-2">
                      {showLanguageLabels && (
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('admin.chinese')}</span>
                      )}
                      <input
                        value={value?.zh ?? ''}
                        onChange={event => updateContent(`${field.key}.zh`, event.target.value)}
                        aria-label={t('admin.chinese')}
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
            <div className="text-xs font-semibold uppercase tracking-wide text-white/60">{t('admin.livePreview')}</div>
            <div className="mt-4 whitespace-pre-line text-3xl font-bold leading-tight">
              {formatPreviewText(getNestedValue(content, 'hero.title.en'), t('admin.heroTitle'))}
            </div>
            <div className="mt-3 whitespace-pre-line text-sm leading-6 text-white/80">
              {formatPreviewText(getNestedValue(content, 'hero.subtitle.en'), t('admin.heroSubtitle'))}
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
        <h3 className="text-lg font-bold text-gray-800">{t('admin.messagesTab')} ({messages.length})</h3>
      </div>
      {messages.length === 0 ? (
        <div className="p-6 text-center text-gray-500">{t('admin.noMessages')}</div>
      ) : (
        <div className="divide-y divide-gray-200">
          {messages.map(msg => (
            <div key={msg.id} className={`p-6 ${!msg.read ? 'bg-blue-50' : ''}`}>
              <div className="mb-2 flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-md font-bold text-gray-900">{msg.firstName} {msg.lastName}</h4>
                  <div className="text-sm text-gray-500">{msg.email} {msg.phone ? `• ${msg.phone}` : ''}</div>
                </div>
                <div className="text-xs text-gray-400">{formatDate(msg.date, dateLocale)}</div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-gray-700">{msg.message}</p>
              <div className="mt-4 flex gap-3">
                {!msg.read && (
                  <button onClick={() => void markMessageRead(msg.id)} className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-200">
                    {t('admin.markRead')}
                  </button>
                )}
                <button onClick={() => void deleteMessage(msg.id)} className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-200">
                  {t('admin.delete')}
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
        <h3 className="text-lg font-bold text-gray-800">{t('admin.prayerTab')} ({prayerRequests.length})</h3>
      </div>
      {prayerRequests.length === 0 ? (
        <div className="p-6 text-center text-gray-500">{t('admin.noPrayers')}</div>
      ) : (
        <div className="divide-y divide-gray-200">
          {prayerRequests.map(req => (
            <div key={req.id} className={`p-6 ${req.status === 'new' ? 'bg-yellow-50' : ''}`}>
              <div className="mb-2 flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-md font-bold text-gray-900">{`${req.firstName || t('admin.anonymous')} ${req.lastName}`.trim()}</h4>
                  <div className="text-sm text-gray-500">
                    {req.email && <span>{req.email}</span>}
                    {req.email && req.phone && <span> • </span>}
                    {req.phone && <span>{req.phone}</span>}
                  </div>
                </div>
                <div className="text-xs text-gray-400">{formatDate(req.date, dateLocale)}</div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-gray-700">{req.message}</p>
              <div className="mt-4 flex gap-3">
                {req.status === 'new' ? (
                  <button onClick={() => void markPrayerPrayed(req.id)} className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 hover:bg-green-200">
                    {t('admin.markPrayed')}
                  </button>
                ) : (
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">{t('admin.prayed')}</span>
                )}
                <button onClick={() => void deletePrayerRequest(req.id)} className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-200">
                  {t('admin.delete')}
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
          <h4 className="text-sm font-semibold uppercase text-gray-500">{t('admin.totalDonations')}</h4>
          <div className="mt-2 text-3xl font-bold text-gray-900">${totalGiven.toLocaleString()}</div>
        </div>
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <h4 className="text-sm font-semibold uppercase text-gray-500">{t('admin.transactions')}</h4>
          <div className="mt-2 text-3xl font-bold text-gray-900">{donations.length}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-bold text-gray-800">{t('admin.donationRecords')}</h3>
        </div>
        {donations.length === 0 ? (
          <div className="p-6 text-center text-gray-500">{t('admin.noDonations')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">{t('admin.tableDate')}</th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">{t('admin.tableAmount')}</th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">{t('admin.tableType')}</th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">{t('admin.tableStatus')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {donations.map(donation => (
                  <tr key={donation.id}>
                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(donation.date, dateLocale)}</td>
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

  const renderRankedList = (title: string, items: WebAnalyticsRankedItem[]) => {
    const maxValue = Math.max(...items.map(item => item.pageviews), 1);

    return (
      <div className="rounded-lg bg-white p-5 shadow-sm">
        <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        <div className="mt-4 space-y-3">
          {items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
              {t('admin.noAnalyticsData')}
            </div>
          ) : items.map(item => {
            const width = `${Math.max((item.pageviews / maxValue) * 100, 5)}%`;
            return (
              <div key={item.label} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium text-gray-800">{item.label}</span>
                  <span className="flex-shrink-0 font-semibold text-gray-900">{item.pageviews.toLocaleString()}</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100">
                  <div className="h-2 rounded-full bg-blue-600" style={{ width }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderVisitsLineChart = (data: WebAnalyticsSummary['timeseries']) => {
    const width = 880;
    const height = 310;
    const padding = { top: 18, right: 18, bottom: 38, left: 46 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const maxValue = Math.max(...data.map(point => point.visits || point.pageviews), 1);
    const points = data.map((point, index) => {
      const x = padding.left + (data.length <= 1 ? 0 : (index / (data.length - 1)) * chartWidth);
      const value = point.visits || point.pageviews;
      const y = padding.top + chartHeight - (value / maxValue) * chartHeight;
      return { ...point, x, y, value };
    });
    const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
    const yTicks = Array.from({ length: 6 }, (_, index) => Math.round((maxValue / 5) * index));
    const xTicks = points.filter((_, index) => index === 0 || index === points.length - 1 || index % Math.max(1, Math.ceil(points.length / 6)) === 0);

    return (
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-gray-900">{t('admin.visitsSummary')}</h3>
            <p className="mt-1 text-sm text-gray-500">{t('admin.visitsSummaryHelp')}</p>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-2 text-xs text-gray-600">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              {t('admin.totalVisits')}
            </div>
            <div className="mt-1 text-3xl font-bold text-gray-900">{webAnalytics?.visits.toLocaleString()}</div>
          </div>
        </div>
        <div className="mt-6 overflow-x-auto">
          {data.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
              {t('admin.noAnalyticsData')}
            </div>
          ) : (
            <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[760px]">
              <rect x={padding.left} y={padding.top} width={chartWidth} height={chartHeight} fill="#fff" />
              {yTicks.map(value => {
                const y = padding.top + chartHeight - (value / maxValue) * chartHeight;
                return (
                  <g key={value}>
                    <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#e5e7eb" strokeWidth="1" />
                    <text x={padding.left - 12} y={y + 4} textAnchor="end" className="fill-gray-500 text-[11px]">{value}</text>
                  </g>
                );
              })}
              {xTicks.map(point => (
                <g key={point.datetime}>
                  <line x1={point.x} x2={point.x} y1={padding.top} y2={padding.top + chartHeight} stroke="#f1f5f9" strokeWidth="1" />
                  <text x={point.x} y={height - 12} textAnchor="middle" className="fill-gray-500 text-[11px]">
                    {new Date(point.datetime).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' })}
                  </text>
                </g>
              ))}
              <text x="14" y={padding.top + chartHeight / 2} transform={`rotate(-90 14 ${padding.top + chartHeight / 2})`} textAnchor="middle" className="fill-gray-700 text-[12px]">
                {t('admin.visits')}
              </text>
              <path d={path} fill="none" stroke="#3b82f6" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
              {points.map(point => (
                <circle key={point.datetime} cx={point.x} cy={point.y} r="2.6" fill="#3b82f6" />
              ))}
            </svg>
          )}
        </div>
      </div>
    );
  };

  const renderMiniRankList = (title: string, items: WebAnalyticsRankedItem[]) => {
    const visibleItems = items.slice(0, sourceItemCount);
    const maxValue = Math.max(...visibleItems.map(item => item.visits || item.pageviews), 1);

    return (
      <div className="border-t border-gray-200 p-5 first:border-t-0 xl:[&:nth-child(2)]:border-t-0 xl:[&:nth-child(even)]:border-l">
        <h4 className="mb-3 flex items-center gap-1 text-sm font-bold text-gray-900">
          {title}
          <span className="text-xs font-normal text-gray-400">ⓘ</span>
        </h4>
        <div className="space-y-2">
          {visibleItems.length === 0 ? (
            <div className="text-sm text-gray-500">{t('admin.noAnalyticsData')}</div>
          ) : visibleItems.map(item => {
            const value = item.visits || item.pageviews;
            return (
              <div key={item.label} className="grid grid-cols-[minmax(0,1fr)_52px_86px] items-center gap-2 text-sm">
                <div className="truncate text-gray-700">{item.label}</div>
                <div className="text-right text-gray-700">{value.toLocaleString()}</div>
                <div className="h-2 bg-gray-200">
                  <div className="h-2 bg-blue-600" style={{ width: `${Math.max((value / maxValue) * 100, 4)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderRegionChart = (items: WebAnalyticsRankedItem[]) => {
    const pageSize = 10;
    const totalPages = Math.max(Math.ceil(items.length / pageSize), 1);
    const normalizedPage = Math.min(countryPage, totalPages - 1);
    const visibleItems = items.slice(normalizedPage * pageSize, normalizedPage * pageSize + pageSize);
    const maxValue = Math.max(...items.map(item => item.visits || item.pageviews), 1);
    const startItem = items.length === 0 ? 0 : normalizedPage * pageSize + 1;
    const endItem = Math.min((normalizedPage + 1) * pageSize, items.length);
    const countryValues = new Map<string, { label: string; value: number }>();
    items.forEach(item => {
      const info = countryInfoForLabel(item.label);
      const value = item.visits || item.pageviews;
      if (info.numericId) {
        countryValues.set(info.numericId, { label: countryDisplayLabel(item.label), value });
      }
    });

    return (
      <div className="overflow-hidden rounded-lg bg-white shadow-sm">
        <h3 className="border-b border-gray-200 px-6 py-4 text-xl font-bold text-gray-900">{t('admin.visitsByCountry')}</h3>
        <div className="grid gap-0 xl:grid-cols-[1.08fr_0.92fr]">
          <div className="border-b border-gray-200 p-5 xl:border-b-0 xl:border-r">
            <svg viewBox="0 0 720 360" className="h-auto w-full" role="img" aria-label={t('admin.visitsByCountry')}>
              <rect width="720" height="336" fill="#f8fafc" />
              <g stroke="#ffffff" strokeLinejoin="round" strokeWidth="0.7">
                {worldCountryFeatures.map((country: any) => {
                  const id = String(country.id).padStart(3, '0');
                  const countryValue = countryValues.get(id);
                  const value = countryValue?.value ?? 0;
                  const activeOpacity = 0.32 + (value / maxValue) * 0.58;

                  return (
                    <path
                      key={id}
                      d={worldPath(country) || ''}
                      fill={countryValue ? '#2563eb' : '#d1d5db'}
                      fillOpacity={countryValue ? activeOpacity : 1}
                    >
                      {countryValue && <title>{`${countryValue.label}: ${value.toLocaleString()}`}</title>}
                    </path>
                  );
                })}
              </g>
              {items.map(item => {
                const info = countryInfoForLabel(item.label);
                const countryShape = info.numericId ? worldCountryById.get(info.numericId) : null;
                const centroid = countryShape ? worldPath.centroid(countryShape) : null;
                const point = centroid && Number.isFinite(centroid[0]) && Number.isFinite(centroid[1])
                  ? { x: centroid[0], y: centroid[1] }
                  : countryMapPoints[info.name];
                if (!point) return null;
                const value = item.visits || item.pageviews;
                const radius = 5 + (value / maxValue) * 22;
                return (
                  <g key={item.label}>
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={radius}
                      fill="#2563eb"
                      fillOpacity={0.2 + (value / maxValue) * 0.36}
                    />
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r="3.8"
                      fill="#1d4ed8"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                    <title>{`${countryDisplayLabel(item.label)}: ${value.toLocaleString()}`}</title>
                  </g>
                );
              })}
              <defs>
                <linearGradient id="mapLegend" x1="0" x2="1">
                  <stop offset="0%" stopColor="#dbeafe" />
                  <stop offset="100%" stopColor="#1d4ed8" />
                </linearGradient>
              </defs>
              <rect x="24" y="310" width="170" height="12" fill="url(#mapLegend)" />
              <text x="24" y="342" className="fill-gray-500 text-[14px]">0</text>
              <text x="194" y="342" textAnchor="end" className="fill-gray-500 text-[14px]">{maxValue.toLocaleString()}</text>
            </svg>
          </div>
          <div className="flex min-h-[300px] flex-col p-5">
            <div className="min-h-[236px] space-y-1">
              {visibleItems.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
                  {t('admin.noAnalyticsData')}
                </div>
              ) : visibleItems.map(item => {
                const value = item.visits || item.pageviews;
                return (
                  <div key={item.label} className="grid grid-cols-[minmax(0,1fr)_58px_86px] items-center gap-2 px-1 py-1 text-sm hover:bg-gray-50">
                    <div className="truncate text-gray-800">{countryDisplayLabel(item.label)}</div>
                    <div className="text-right text-gray-800">{value.toLocaleString()}</div>
                    <div className="h-2 bg-gray-200">
                      <div className="h-2 bg-blue-600" style={{ width: `${Math.max((value / maxValue) * 100, 4)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-5 flex items-center gap-2 text-sm text-gray-700">
              <button
                type="button"
                onClick={() => setCountryPage(page => Math.max(page - 1, 0))}
                disabled={normalizedPage === 0}
                className="flex h-8 w-8 items-center justify-center rounded border border-gray-300 text-blue-600 disabled:text-gray-300"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => setCountryPage(page => Math.min(page + 1, totalPages - 1))}
                disabled={normalizedPage >= totalPages - 1}
                className="flex h-8 w-8 items-center justify-center rounded border border-gray-300 text-blue-600 disabled:text-gray-300"
              >
                ›
              </button>
              <span className="ml-2 font-semibold">
                {startItem} to {endItem} of {items.length} {t('admin.itemsRange')}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderWebAnalytics = () => {
    const ranges: WebAnalyticsRange[] = ['24h', '72h', '7d', '30d'];

    return (
      <div className="space-y-6">
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{t('admin.webAnalytics')}</h2>
              <p className="mt-1 text-sm text-gray-600">{t('admin.webAnalyticsSubtitle')}</p>
              {webAnalytics?.lastUpdated && (
                <div className="mt-2 text-xs text-gray-400">
                  {t('admin.updated')} {formatDate(webAnalytics.lastUpdated, dateLocale)}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {ranges.map(range => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setWebAnalyticsRange(range)}
                  className={`rounded-md px-3 py-2 text-sm font-semibold ${
                    webAnalyticsRange === range ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {t(`admin.range${range === '24h' ? '24h' : range === '72h' ? '72h' : range === '7d' ? '7d' : '30d'}`)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setWebAnalyticsExcludeBots(value => !value)}
                className={`rounded-md px-3 py-2 text-sm font-semibold ${
                  webAnalyticsExcludeBots ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {t('admin.excludeBots')}
              </button>
            </div>
          </div>

          {webAnalyticsLoading ? (
            <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
              {t('admin.loadingAnalytics')}
            </div>
          ) : webAnalyticsError ? (
            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              {webAnalyticsError}
            </div>
          ) : null}
        </div>

        {webAnalytics && !webAnalyticsError && (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg bg-white p-5 shadow-sm">
                <div className="text-sm font-medium text-gray-500">{t('admin.pageviews')}</div>
                <div className="mt-2 text-3xl font-bold text-gray-900">{webAnalytics.pageviews.toLocaleString()}</div>
              </div>
              <div className="rounded-lg bg-white p-5 shadow-sm">
                <div className="text-sm font-medium text-gray-500">{t('admin.visits')}</div>
                <div className="mt-2 text-3xl font-bold text-gray-900">{webAnalytics.visits.toLocaleString()}</div>
              </div>
              <div className="rounded-lg bg-white p-5 shadow-sm">
                <div className="text-sm font-medium text-gray-500">P75 {t('admin.pageLoad')}</div>
                <div className="mt-2 text-3xl font-bold text-gray-900">{formatMs(webAnalytics.performance.pageLoadP75Ms)}</div>
              </div>
              <div className="rounded-lg bg-white p-5 shadow-sm">
                <div className="text-sm font-medium text-gray-500">P75 LCP</div>
                <div className="mt-2 text-3xl font-bold text-gray-900">{formatMs(webAnalytics.performance.lcpP75Ms)}</div>
              </div>
            </div>

            {renderVisitsLineChart(webAnalytics.timeseries)}

            {renderRegionChart(webAnalytics.countries)}

            <div className="grid gap-6 xl:grid-cols-2">
              <div className="overflow-hidden rounded-lg bg-white shadow-sm xl:col-span-2">
                <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
                  <h3 className="text-xl font-bold text-gray-900">{t('admin.visitsBySource')}</h3>
                  <select
                    value={sourceItemCount}
                    onChange={event => setSourceItemCount(Number(event.target.value) as 5 | 10 | 15)}
                    className="rounded border border-gray-400 bg-white px-3 py-1.5 text-sm text-gray-800"
                    aria-label={t('admin.items')}
                  >
                    <option value={5}>5 {t('admin.items')}</option>
                    <option value={10}>10 {t('admin.items')}</option>
                    <option value={15}>15 {t('admin.items')}</option>
                  </select>
                </div>
                <div className="grid xl:grid-cols-2">
                  {renderMiniRankList(t('admin.referrers'), webAnalytics.referrers)}
                  {renderMiniRankList(t('admin.paths'), webAnalytics.paths)}
                  {renderMiniRankList(t('admin.hosts'), webAnalytics.hosts)}
                  {renderMiniRankList(t('admin.browsers'), webAnalytics.browsers)}
                  {renderMiniRankList(t('admin.operatingSystems'), webAnalytics.operatingSystems)}
                  {renderMiniRankList(t('admin.deviceTypes'), webAnalytics.deviceTypes)}
                </div>
              </div>
              <div className="rounded-lg bg-white p-5 shadow-sm">
                <h3 className="text-lg font-bold text-gray-900">{t('admin.performance')}</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {[
                    ['P50 page load', formatMs(webAnalytics.performance.pageLoadP50Ms)],
                    ['P75 page load', formatMs(webAnalytics.performance.pageLoadP75Ms)],
                    ['P90 page load', formatMs(webAnalytics.performance.pageLoadP90Ms)],
                    ['P75 FCP', formatMs(webAnalytics.performance.fcpP75Ms)],
                    ['P75 LCP', formatMs(webAnalytics.performance.lcpP75Ms)],
                    ['P75 INP', formatMs(webAnalytics.performance.inpP75Ms)],
                    ['P75 CLS', formatMetric(webAnalytics.performance.clsP75)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</div>
                      <div className="mt-1 text-xl font-bold text-gray-900">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderSection = () => {
    if (loading) {
      return <div className="rounded-lg bg-white p-8 text-sm text-gray-500 shadow-sm">{t('admin.loadingAdminData')}</div>;
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
              <h2 className="text-2xl font-bold text-gray-900">{t('admin.sermons')}</h2>
              <p className="text-sm text-gray-600">{t('admin.sermonSubtitle')}</p>
            </div>
            <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              {sermonCount} {t('admin.sermonCountStatus')}
            </div>
            <SermonManager entryType="sermon" />
          </div>
        );
      case 'manna':
        return (
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="text-2xl font-bold text-gray-900">{t('admin.manna')}</h2>
              <p className="text-sm text-gray-600">{t('admin.mannaSubtitle')}</p>
            </div>
            <div className="mb-4 rounded-lg border border-purple-100 bg-purple-50 px-4 py-3 text-sm text-purple-800">
              {mannaCount} {t('admin.mannaCountStatus')}
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
      case 'analytics':
        return renderWebAnalytics();
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
          <div className="text-xl font-bold">{t('admin.dashboardTitle')}</div>
          <div className="mt-1 text-sm text-white/60">{t('admin.churchName')}</div>
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
                <span>{sectionLabel(section)}</span>
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
                <span>{sectionLabel(section)}</span>
                {badge > 0 && (
                  <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs text-white">{badge}</span>
                )}
              </button>
            );
          })}
          <div className="my-4 border-t border-white/25" />
          {insightSections.filter(canAccessSection).map(section => (
            <button
              key={section}
              onClick={() => setActiveSection(section)}
              className={`flex w-full items-center justify-between rounded-md px-4 py-3 text-left text-sm font-medium transition-colors ${
                activeSection === section ? 'bg-blue-600 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span>{sectionLabel(section)}</span>
            </button>
          ))}
          <a href="/" className="block rounded-md px-4 py-3 text-sm font-medium text-white/75 hover:bg-white/10 hover:text-white">
            {t('admin.backToWebsite')}
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
                  {roleLabel}
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
                      {t('admin.profileSetting')}
                    </button>
                    <button
                      onClick={() => {
                        setAccountMode('password');
                        setActiveSection('account');
                      }}
                      className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-white/75 hover:bg-white/10 hover:text-white"
                    >
                      {t('admin.changePassword')}
                    </button>
                    <button
                      onClick={toggleLanguage}
                      className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-white/75 hover:bg-white/10 hover:text-white"
                    >
                      {language === Language.EN ? t('admin.switchToChinese') : t('admin.switchToEnglish')}
                    </button>
                    <button
                      onClick={() => void logout()}
                      className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-white/75 hover:bg-red-900 hover:text-white"
                    >
                      {t('admin.signOut')}
                    </button>
                  </div>
                </details>
              </div>
              <div className="mt-2 px-3 text-center text-xs font-semibold text-white/45">
                Version: V{APP_VERSION}
              </div>
            </div>
          )}
        </div>
      </aside>

      <main className="min-h-screen flex-1">
        <div className="border-b border-gray-200 bg-white px-5 py-4 shadow-sm sm:px-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{sectionLabel(activeSection)}</h1>
              <p className="text-sm text-gray-500">{t('admin.dashboardSubtitle')}</p>
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
                  {sectionLabel(section)}
                </button>
              ))}
              <button
                onClick={toggleLanguage}
                className="rounded-md bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700"
              >
                {language === Language.EN ? t('admin.switchToChinese') : t('admin.switchToEnglish')}
              </button>
              <a href="/" className="rounded-md bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700">{t('admin.website')}</a>
              <button
                onClick={() => void logout()}
                className="rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white"
              >
                {t('admin.signOut')}
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
