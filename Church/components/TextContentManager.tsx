import React, { useEffect, useMemo, useState } from 'react';
import { useAdmin } from '../hooks/useAdmin';
import RichTextEditor from './RichTextEditor';

type LocalizedEntry = {
  path: string;
  en: string;
  zh: string;
};

type Section = {
  id: string;
  label: string;
  prefixes: string[];
};

type PrimarySection = {
  id: 'all' | 'navigation' | 'buttons' | 'page-titles' | 'content';
  label: string;
};

type EntryGroup = {
  title: string;
  entries: LocalizedEntry[];
};

const sections: Section[] = [
  { id: 'home', label: 'Home Sections', prefixes: ['about.', 'events.', 'sermons.', 'support.', 'contact.'] },
  { id: 'about', label: 'About Page', prefixes: ['aboutPage.'] },
  { id: 'events', label: 'Events Page', prefixes: ['eventsPage.'] },
  { id: 'sermons', label: 'Sermons Page', prefixes: ['sermonsPage.', 'sermonArchive.', 'sermonDetail.'] },
  { id: 'giving', label: 'Giving Page', prefixes: ['giving.', 'givingPage.'] },
  { id: 'contact', label: 'Contact & Prayer', prefixes: ['contactPage.', 'prayerRequestPage.'] },
  { id: 'shared', label: 'Header & Footer', prefixes: ['header.', 'footer.'] },
];

const ownerOnlyTextSectionIds = new Set(['home', 'shared']);
const hiddenTextEntryPrefixes = ['sermonArchive.', 'sermonDetail.'];
const hiddenTextEntryPaths = new Set([
  'giving.oneTime',
  'giving.recurring',
  'giving.amount',
  'giving.giveNow',
  'giving.securityNote',
]);
const hiddenContactPrimarySections = new Set<PrimarySection['id']>(['buttons', 'content']);

const primarySections: PrimarySection[] = [
  { id: 'all', label: 'All' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'buttons', label: 'Buttons' },
  { id: 'page-titles', label: 'Page Titles' },
  { id: 'content', label: 'Content' },
];

function isLocalizedLeaf(value: unknown): value is { en: string; zh: string } {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'en' in value &&
    'zh' in value &&
    typeof (value as { en?: unknown }).en === 'string' &&
    typeof (value as { zh?: unknown }).zh === 'string'
  );
}

function flattenContent(obj: Record<string, unknown>, prefix = ''): LocalizedEntry[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;

    if (isLocalizedLeaf(value)) {
      return [{ path, en: value.en, zh: value.zh }];
    }

    if (value && typeof value === 'object') {
      return flattenContent(value as Record<string, unknown>, path);
    }

    return [];
  });
}

function labelFromPath(path: string): string {
  return path
    .split('.')
    .map(part => part.replace(/([a-z])([A-Z])/g, '$1 $2'))
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' / ');
}

function compactLabelFromPath(path: string): string {
  const parts = labelFromPath(path).split(' / ');
  return parts.length > 2 ? `${parts[0]} / ${parts.slice(1).join(' ')}` : parts.join(' / ');
}

function classifyEntry(path: string): PrimarySection['id'] {
  const lowerPath = path.toLowerCase();
  const pathParts = lowerPath.split('.');
  const lastPart = pathParts[pathParts.length - 1] ?? '';

  if (
    lastPart.startsWith('nav') ||
    lowerPath.startsWith('header.nav') ||
    lowerPath.startsWith('aboutpage.nav') ||
    lowerPath.startsWith('eventspage.nav') ||
    lowerPath.startsWith('sermonspage.nav') ||
    lowerPath.startsWith('givingpage.nav') ||
    lowerPath.startsWith('contactpage.nav') ||
    lowerPath.startsWith('prayerrequestpage.nav')
  ) {
    return 'navigation';
  }

  if (
    lowerPath.includes('button') ||
    lowerPath.includes('submit') ||
    lowerPath.includes('watch') ||
    lowerPath.includes('givenow') ||
    lowerPath.includes('markread') ||
    lowerPath.includes('markprayed') ||
    lowerPath.includes('delete') ||
    lowerPath.includes('signout') ||
    lowerPath.includes('backtowebsite') ||
    lowerPath.includes('newhere')
  ) {
    return 'buttons';
  }

  if (
    lowerPath.includes('pagetitle') ||
    lowerPath.includes('pagesubtitle') ||
    lastPart === 'title' ||
    lastPart === 'subtitle' ||
    lastPart.endsWith('title') ||
    lastPart.endsWith('subtitle')
  ) {
    return 'page-titles';
  }

  return 'content';
}

function shouldUseRichEditor(path: string): boolean {
  const lastPart = path.split('.').pop()?.toLowerCase() ?? '';
  return lastPart.includes('content') || path === 'about.text' || path === 'support.text';
}

function pageHrefForEntry(path: string): string {
  const pageRoutes: Array<[string, string]> = [
    ['aboutPage.ourChurch', '/about/our-church'],
    ['aboutPage.ourBeliefs', '/about/our-beliefs'],
    ['aboutPage.jobOpportunities', '/about/job-opportunities'],
    ['aboutPage.ministryLeaders', '/about/ministry-leaders'],
    ['aboutPage.becomingAMember', '/about/becoming-a-member'],
    ['eventsPage.kids', '/events/kids'],
    ['eventsPage.men', '/events/men'],
    ['eventsPage.women', '/events/women'],
    ['eventsPage.joint', '/events/joint'],
    ['eventsPage.alpha', '/events/alpha'],
    ['eventsPage.prayer', '/events/prayer'],
    ['sermonsPage.dailyManna', '/sermons/daily-manna'],
    ['sermonsPage.sundayWorship', '/sermons/sunday-worship'],
    ['sermonsPage.recentSermons', '/sermons/recent-sermons'],
    ['sermonsPage.liveStream', '/sermons/live-stream'],
    ['givingPage.whyWeGive', '/giving/why-we-give'],
    ['givingPage.whatIsTithing', '/giving/what-is-tithing'],
    ['givingPage.waysToGive', '/giving/ways-to-give'],
    ['givingPage.otherWaysToGive', '/giving/other-ways-to-give'],
    ['contactPage', '/contact/contact-us'],
    ['prayerRequestPage', '/prayer-request/submit-request'],
    ['header', '/'],
    ['footer', '/'],
  ];

  return pageRoutes.find(([prefix]) => path.startsWith(prefix))?.[1] ?? '/';
}

function sectionLabelForPath(path: string): string {
  return sections.find(section => section.prefixes.some(prefix => path.startsWith(prefix)))?.label ?? 'Other';
}

function groupTitleForEntry(path: string, activePrimarySection: PrimarySection['id']): string {
  const sectionLabel = sectionLabelForPath(path);
  if (activePrimarySection === 'all') {
    return `${sectionLabel} / ${primarySections.find(section => section.id === classifyEntry(path))?.label ?? 'Content'}`;
  }
  return `${sectionLabel} / ${primarySections.find(section => section.id === activePrimarySection)?.label ?? 'Content'}`;
}

function groupEntries(entries: LocalizedEntry[], activePrimarySection: PrimarySection['id']): EntryGroup[] {
  const groups = new Map<string, LocalizedEntry[]>();
  for (const entry of entries) {
    const title = groupTitleForEntry(entry.path, activePrimarySection);
    groups.set(title, [...(groups.get(title) ?? []), entry]);
  }

  return Array.from(groups.entries()).map(([title, groupEntries]) => ({
    title,
    entries: groupEntries,
  }));
}

const TextContentManager: React.FC = () => {
  const { content, currentUser, updateContent, saveChanges, hasUnsavedContent, uploadImage } = useAdmin();
  const [activePrimarySection, setActivePrimarySection] = useState<PrimarySection['id']>('all');
  const [activeSection, setActiveSection] = useState(sections[0].id);
  const [query, setQuery] = useState('');

  const visibleSections = useMemo(
    () => sections.filter(section => currentUser?.role === 'owner' || !ownerOnlyTextSectionIds.has(section.id)),
    [currentUser]
  );

  useEffect(() => {
    if (!visibleSections.some(section => section.id === activeSection)) {
      setActiveSection(visibleSections[0]?.id ?? sections[0].id);
    }
  }, [activeSection, visibleSections]);

  const allEntries = useMemo(() => flattenContent(content as Record<string, unknown>), [content]);

  const visibleEntries = useMemo(() => {
    const section = visibleSections.find(item => item.id === activeSection) ?? visibleSections[0] ?? sections[0];
    const loweredQuery = query.trim().toLowerCase();

    return allEntries.filter(entry => {
      if (hiddenTextEntryPaths.has(entry.path)) {
        return false;
      }

      if (hiddenTextEntryPrefixes.some(prefix => entry.path.startsWith(prefix))) {
        return false;
      }

      const entryPrimarySection = classifyEntry(entry.path);
      if (
        (entry.path.startsWith('contactPage.') || entry.path.startsWith('prayerRequestPage.')) &&
        hiddenContactPrimarySections.has(entryPrimarySection)
      ) {
        return false;
      }

      const inSection = section.prefixes.some(prefix => entry.path.startsWith(prefix));
      if (!inSection) {
        return false;
      }

      if (activePrimarySection !== 'all' && entryPrimarySection !== activePrimarySection) {
        return false;
      }

      if (!loweredQuery) {
        return true;
      }

      return (
        entry.path.toLowerCase().includes(loweredQuery) ||
        entry.en.toLowerCase().includes(loweredQuery) ||
        entry.zh.toLowerCase().includes(loweredQuery)
      );
    });
  }, [activePrimarySection, activeSection, allEntries, query]);

  const groupedEntries = useMemo(
    () => groupEntries(visibleEntries, activePrimarySection),
    [activePrimarySection, visibleEntries]
  );

  const renderTextField = (fieldId: string, value: string) => (
    <input
      id={fieldId}
      type="text"
      value={value}
      onChange={event => updateContent(fieldId, event.target.value)}
      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
    />
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Text Changes</h2>
          <p className="text-sm text-gray-600">Edit English and Chinese content without hunting through the public pages.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-medium ${hasUnsavedContent ? 'text-amber-700' : 'text-emerald-700'}`}>
            {hasUnsavedContent ? 'Unsaved text changes' : 'All text changes saved'}
          </span>
          <button
            onClick={() => void saveChanges()}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
          >
            Save Text Changes
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {visibleSections.map(section => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              activeSection === section.id ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            {section.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {primarySections.map(section => (
          <button
            key={section.id}
            onClick={() => setActivePrimarySection(section.id)}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              activePrimarySection === section.id ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            {section.label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <input
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search by content key or text"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
      </div>

      <div className="space-y-4">
        {visibleEntries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
            No matching text fields in this section.
          </div>
        ) : (
          groupedEntries.map(group => (
            <div key={group.title} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-4 border-b border-gray-200 pb-4">
                <h3 className="text-lg font-bold text-gray-900">{group.title}</h3>
              </div>

              <div className="divide-y divide-gray-100">
                {group.entries.map(entry => {
                  const usesRichEditor = shouldUseRichEditor(entry.path);

                  return (
                    <div key={entry.path} className="py-4 first:pt-0 last:pb-0">
                      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <span className="text-sm font-semibold text-gray-900">{compactLabelFromPath(entry.path)}</span>
                          <span className="ml-2 break-all text-xs text-gray-500">[{entry.path}]</span>
                        </div>
                        <a
                          href={pageHrefForEntry(entry.path)}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                        >
                          Open Page
                        </a>
                      </div>
                      <div className="grid gap-4 lg:grid-cols-2">
                        <label className="space-y-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 lg:hidden">English</span>
                          {usesRichEditor ? (
                            <RichTextEditor
                              value={entry.en}
                              onChange={value => updateContent(`${entry.path}.en`, value)}
                              onImageUpload={(file, fileName) => uploadImage(`rich-text/${entry.path}.en.${Date.now()}`, file, fileName)}
                            />
                          ) : renderTextField(`${entry.path}.en`, entry.en)}
                        </label>
                        <label className="space-y-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 lg:hidden">Chinese</span>
                          {usesRichEditor ? (
                            <RichTextEditor
                              value={entry.zh}
                              onChange={value => updateContent(`${entry.path}.zh`, value)}
                              onImageUpload={(file, fileName) => uploadImage(`rich-text/${entry.path}.zh.${Date.now()}`, file, fileName)}
                            />
                          ) : renderTextField(`${entry.path}.zh`, entry.zh)}
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default TextContentManager;
