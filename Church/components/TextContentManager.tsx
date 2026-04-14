import React, { useMemo, useState } from 'react';
import { useAdmin } from '../hooks/useAdmin';

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

const sections: Section[] = [
  { id: 'home', label: 'Home Sections', prefixes: ['about.', 'events.', 'sermons.', 'support.', 'contact.'] },
  { id: 'about', label: 'About Page', prefixes: ['aboutPage.'] },
  { id: 'events', label: 'Events Page', prefixes: ['eventsPage.'] },
  { id: 'sermons', label: 'Sermons Page', prefixes: ['sermonsPage.', 'sermonArchive.', 'sermonDetail.'] },
  { id: 'giving', label: 'Giving Page', prefixes: ['giving.', 'givingPage.'] },
  { id: 'contact', label: 'Contact & Prayer', prefixes: ['contactPage.', 'prayerRequestPage.'] },
  { id: 'shared', label: 'Header & Footer', prefixes: ['header.', 'footer.'] },
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

const TextContentManager: React.FC = () => {
  const { content, updateContent, saveChanges, hasUnsavedContent } = useAdmin();
  const [activeSection, setActiveSection] = useState(sections[0].id);
  const [query, setQuery] = useState('');

  const allEntries = useMemo(() => flattenContent(content as Record<string, unknown>), [content]);

  const visibleEntries = useMemo(() => {
    const section = sections.find(item => item.id === activeSection) ?? sections[0];
    const loweredQuery = query.trim().toLowerCase();

    return allEntries.filter(entry => {
      const inSection = section.prefixes.some(prefix => entry.path.startsWith(prefix));
      if (!inSection) {
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
  }, [activeSection, allEntries, query]);

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
        {sections.map(section => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              activeSection === section.id ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
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
          visibleEntries.map(entry => {
            const multiline = entry.en.length > 120 || entry.zh.length > 120 || entry.en.includes('\n') || entry.zh.includes('\n');
            const Input = multiline ? 'textarea' : 'input';

            return (
              <div key={entry.path} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-3">
                  <div className="text-sm font-semibold text-gray-900">{labelFromPath(entry.path)}</div>
                  <div className="mt-1 text-xs text-gray-500">{entry.path}</div>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">English</span>
                    <Input
                      value={entry.en}
                      onChange={event => updateContent(`${entry.path}.en`, event.target.value)}
                      className={`w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 ${
                        multiline ? 'min-h-[120px] resize-y' : ''
                      }`}
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Chinese</span>
                    <Input
                      value={entry.zh}
                      onChange={event => updateContent(`${entry.path}.zh`, event.target.value)}
                      className={`w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 ${
                        multiline ? 'min-h-[120px] resize-y' : ''
                      }`}
                    />
                  </label>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default TextContentManager;
