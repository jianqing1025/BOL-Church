import React, { useState } from 'react';
import { produce } from 'immer';
import { useAdmin } from '../hooks/useAdmin';
import type { Sermon } from '../data';

const buildEmptyEntry = (entryType: Sermon['type']): Omit<Sermon, 'id'> => ({
  title: { en: '', zh: '' },
  speaker: { en: '', zh: '' },
  date: new Date().toISOString().split('T')[0],
  series: { en: '', zh: '' },
  passage: { en: '', zh: '' },
  youtubeId: '',
  imageUrl: '',
  type: entryType,
});

const SPEAKER_OPTIONS = {
  en: ['Pastor Andy Yu', 'Sister LingLing', 'Pastor Rainbow'],
  zh: ['余大器 牧師', '琳琳师母', 'Rainbow 牧師'],
};

interface SpeakerComboboxProps {
  placeholder: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

const SpeakerCombobox: React.FC<SpeakerComboboxProps> = ({ placeholder, value, options, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
    >
      <div className="relative">
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onFocus={() => setIsOpen(true)}
          onChange={(event) => {
            onChange(event.target.value);
            setIsOpen(true);
          }}
          className="w-full p-2 pr-10 border rounded"
        />
        <button
          type="button"
          onClick={() => setIsOpen(open => !open)}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-gray-600 hover:text-gray-900"
          aria-label={`Show ${placeholder} options`}
        >
          ▾
        </button>
      </div>
      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
          {options.map(option => (
            <button
              key={option}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(option);
                setIsOpen(false);
              }}
              className="block w-full px-3 py-3 text-left text-sm font-semibold text-gray-900 hover:bg-blue-50"
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

interface SermonManagerProps {
  entryType?: Sermon['type'];
}

const SermonManager: React.FC<SermonManagerProps> = ({ entryType = 'sermon' }) => {
  const normalizedEntryType = entryType as Sermon['type'];
  const {
    sermons,
    dailyManna,
    createSermon,
    updateSermonRecord,
    deleteSermonRecord,
    createDailyManna,
    updateDailyMannaRecord,
    deleteDailyMannaRecord,
  } = useAdmin();
  const [isAdding, setIsAdding] = useState(false);
  const [editingSermonId, setEditingSermonId] = useState<string | null>(null);
  const [sermonData, setSermonData] = useState<Omit<Sermon, 'id'>>(buildEmptyEntry(normalizedEntryType));

  const isManna = normalizedEntryType === 'daily-manna';
  const visibleEntries = isManna ? dailyManna : sermons;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>, lang?: 'en' | 'zh', field?: 'title' | 'speaker' | 'series' | 'passage') => {
    const { name, value } = e.target;
    if (lang && field) {
      setSermonData(produce(draft => {
        draft[field][lang] = value;
      }));
    } else {
      setSermonData(produce(draft => {
        (draft as any)[name] = value;
      }));
    }
  };

  const handleLocalizedChange = (value: string, lang: 'en' | 'zh', field: 'title' | 'speaker' | 'series' | 'passage') => {
    setSermonData(produce(draft => {
      draft[field][lang] = value;
    }));
  };

  const handleSave = async () => {
    try {
      if (isAdding) {
        if (isManna) {
          await createDailyManna({ ...sermonData, type: 'daily-manna' });
        } else {
          await createSermon({ ...sermonData, type: 'sermon' });
        }
      } else if (editingSermonId) {
        if (isManna) {
          await updateDailyMannaRecord(editingSermonId, { ...sermonData, type: 'daily-manna' });
        } else {
          await updateSermonRecord(editingSermonId, { ...sermonData, type: 'sermon' });
        }
      }
      resetForm();
    } catch (error) {
      console.error(error);
      alert('保存失敗');
    }
  };

  const handleEdit = (sermon: Sermon) => {
    setEditingSermonId(sermon.id);
    const { id, ...data } = sermon;
    setSermonData({ ...data, type: normalizedEntryType });
    setIsAdding(false);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('確定刪除此信息嗎？')) {
      return;
    }
    if (isManna) {
      await deleteDailyMannaRecord(id);
    } else {
      await deleteSermonRecord(id);
    }
  };

  const resetForm = () => {
    setIsAdding(false);
    setEditingSermonId(null);
    setSermonData(buildEmptyEntry(normalizedEntryType));
  };

  return (
    <div>
      {isAdding || editingSermonId !== null ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg mb-4 bg-gray-50">
          <input type="text" placeholder="Title (EN)" value={sermonData.title.en} onChange={(e) => handleInputChange(e, 'en', 'title')} className="p-2 border rounded" />
          <input type="text" placeholder="標題 (ZH)" value={sermonData.title.zh} onChange={(e) => handleInputChange(e, 'zh', 'title')} className="p-2 border rounded" />
          <input type="date" name="date" value={sermonData.date} onChange={handleInputChange} className="p-2 border rounded" />
          <input type="text" name="youtubeId" placeholder="YouTube ID (e.g. kYm9S2v7Y7U)" value={sermonData.youtubeId} onChange={handleInputChange} className="p-2 border rounded" />

          {!isManna && (
            <>
              <SpeakerCombobox
                placeholder="Speaker (EN)"
                value={sermonData.speaker.en}
                options={SPEAKER_OPTIONS.en}
                onChange={(value) => handleLocalizedChange(value, 'en', 'speaker')}
              />
              <SpeakerCombobox
                placeholder="講員 (ZH)"
                value={sermonData.speaker.zh}
                options={SPEAKER_OPTIONS.zh}
                onChange={(value) => handleLocalizedChange(value, 'zh', 'speaker')}
              />
            </>
          )}

          <div className="md:col-span-2 flex justify-end gap-2">
            <button onClick={handleSave} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold shadow hover:bg-blue-700 transition-colors">保存</button>
            <button onClick={resetForm} className="bg-gray-300 px-6 py-2 rounded-lg font-bold hover:bg-gray-400 transition-colors">取消</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setIsAdding(true)} className="bg-green-600 text-white px-6 py-2 rounded-lg mb-4 font-bold shadow hover:bg-green-700 transition-colors">
          {isManna ? 'Add Daily Manna' : 'Add Sunday Message'}
        </button>
      )}

      <ul className="space-y-2">
        {visibleEntries.map(sermon => (
          <li key={sermon.id} className="p-3 bg-white border rounded-md flex justify-between items-center shadow-sm">
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${isManna ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                  {isManna ? '每日天言' : '主日信息'}
                </span>
                <p className="font-bold">{sermon.title.zh || sermon.title.en}</p>
              </div>
              <p className="text-xs text-gray-500">{sermon.date}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleEdit(sermon)} className="bg-yellow-400 text-white px-3 py-1 rounded text-sm hover:bg-yellow-500 transition-colors">編輯</button>
              <button onClick={() => handleDelete(sermon.id)} className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600 transition-colors">刪除</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SermonManager;
