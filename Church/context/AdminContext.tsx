import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { produce } from 'immer';
import { api } from '../api';
import { DEFAULT_SITE_BOOTSTRAP, type Donation, type Message, type PrayerRequest, type Sermon } from '../data';

interface AdminContextType {
  isAdminMode: boolean;
  loading: boolean;
  hasUnsavedContent: boolean;
  login: (password: string) => boolean;
  logout: () => void;
  content: typeof DEFAULT_SITE_BOOTSTRAP.content;
  updateContent: (path: string, value: string) => void;
  images: Record<string, string>;
  updateImage: (key: string, url: string) => Promise<void>;
  uploadImage: (key: string, file: Blob, fileName: string) => Promise<string>;
  sermons: Sermon[];
  setSermons: (sermons: Sermon[]) => void;
  dailyManna: Sermon[];
  setDailyManna: (sermons: Sermon[]) => void;
  saveChanges: () => Promise<void>;
  messages: Message[];
  prayerRequests: PrayerRequest[];
  donations: Donation[];
  submitMessage: (data: Omit<Message, 'id' | 'date' | 'read'>) => Promise<void>;
  submitPrayerRequest: (data: Omit<PrayerRequest, 'id' | 'date' | 'status'>) => Promise<void>;
  submitDonation: (data: Omit<Donation, 'id' | 'date' | 'status'>) => Promise<void>;
  markMessageRead: (id: string) => Promise<void>;
  deleteMessage: (id: string) => Promise<void>;
  markPrayerPrayed: (id: string) => Promise<void>;
  deletePrayerRequest: (id: string) => Promise<void>;
  createSermon: (sermon: Omit<Sermon, 'id'>) => Promise<void>;
  updateSermonRecord: (id: string, sermon: Omit<Sermon, 'id'>) => Promise<void>;
  deleteSermonRecord: (id: string) => Promise<void>;
  createDailyManna: (sermon: Omit<Sermon, 'id'>) => Promise<void>;
  updateDailyMannaRecord: (id: string, sermon: Omit<Sermon, 'id'>) => Promise<void>;
  deleteDailyMannaRecord: (id: string) => Promise<void>;
}

export const AdminContext = createContext<AdminContextType | undefined>(undefined);

const setNestedValue = (obj: any, path: string, value: string) => {
  const keys = path.split('.');
  const lastKey = keys.pop()!;
  let temp = obj;
  for (const key of keys) {
    if (!temp[key]) temp[key] = {};
    temp = temp[key];
  }
  temp[lastKey] = value;
};

export const AdminProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD ?? 'change-me';
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [content, setContent] = useState(DEFAULT_SITE_BOOTSTRAP.content);
  const [sermons, setSermons] = useState<Sermon[]>(DEFAULT_SITE_BOOTSTRAP.sermons);
  const [dailyManna, setDailyManna] = useState<Sermon[]>(DEFAULT_SITE_BOOTSTRAP.dailyManna);
  const [images, setImages] = useState<Record<string, string>>(DEFAULT_SITE_BOOTSTRAP.images);
  const [messages, setMessages] = useState<Message[]>([]);
  const [prayerRequests, setPrayerRequests] = useState<PrayerRequest[]>([]);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasUnsavedContent, setHasUnsavedContent] = useState(false);

  useEffect(() => {
    let cancelled = false;

    api.bootstrap()
      .then(data => {
        if (cancelled) return;
        setContent(data.content);
        setImages(data.images);
        setSermons(data.sermons.filter(item => item.type === 'sermon'));
        setDailyManna(data.dailyManna ?? data.sermons.filter(item => item.type === 'daily-manna'));
        setMessages(data.messages);
        setPrayerRequests(data.prayerRequests);
        setDonations(data.donations);
        setHasUnsavedContent(false);
      })
      .catch(error => {
        console.error('Failed to load site data', error);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = (password: string): boolean => {
    if (password === adminPassword) {
      setIsAuthenticated(true);
      return true;
    }
    return false;
  };

  const logout = () => setIsAuthenticated(false);

  const updateContent = (path: string, value: string) => {
    setContent(produce(draft => {
      setNestedValue(draft, path, value);
    }));
    setHasUnsavedContent(true);
  };

  const updateImage = async (key: string, url: string) => {
    const newImages = { ...images, [key]: url };
    setImages(newImages);
    await api.saveImages(newImages);
  };

  const uploadImage = async (key: string, file: Blob, fileName: string) => {
    const uploaded = await api.uploadImage(key, file, fileName);
    setImages(current => ({ ...current, [key]: uploaded.url }));
    return uploaded.url;
  };

  const saveChanges = async () => {
    await api.saveContent(content);
    setHasUnsavedContent(false);
    alert('所有文字更改已保存到 D1。');
  };

  const submitMessage = async (data: Omit<Message, 'id' | 'date' | 'read'>) => {
    const created = await api.submitMessage(data);
    setMessages(current => [created, ...current]);
  };

  const submitPrayerRequest = async (data: Omit<PrayerRequest, 'id' | 'date' | 'status'>) => {
    const created = await api.submitPrayerRequest(data);
    setPrayerRequests(current => [created, ...current]);
  };

  const submitDonation = async (data: Omit<Donation, 'id' | 'date' | 'status'>) => {
    const created = await api.submitDonation(data);
    setDonations(current => [created, ...current]);
  };

  const markMessageRead = async (id: string) => {
    const updated = await api.markMessageRead(id);
    setMessages(current => current.map(item => (item.id === id ? updated : item)));
  };

  const deleteMessage = async (id: string) => {
    await api.deleteMessage(id);
    setMessages(current => current.filter(item => item.id !== id));
  };

  const markPrayerPrayed = async (id: string) => {
    const updated = await api.markPrayerPrayed(id);
    setPrayerRequests(current => current.map(item => (item.id === id ? updated : item)));
  };

  const deletePrayerRequest = async (id: string) => {
    await api.deletePrayerRequest(id);
    setPrayerRequests(current => current.filter(item => item.id !== id));
  };

  const createSermon = async (sermon: Omit<Sermon, 'id'>) => {
    const created = await api.createSermon({ ...sermon, type: 'sermon' });
    setSermons(current => [created, ...current].sort((a, b) => b.date.localeCompare(a.date)));
  };

  const updateSermonRecord = async (id: string, sermon: Omit<Sermon, 'id'>) => {
    const updated = await api.updateSermon(id, { ...sermon, type: 'sermon' });
    setSermons(current => current.map(item => (item.id === id ? updated : item)).sort((a, b) => b.date.localeCompare(a.date)));
  };

  const deleteSermonRecord = async (id: string) => {
    await api.deleteSermon(id);
    setSermons(current => current.filter(item => item.id !== id));
  };

  const createDailyManna = async (sermon: Omit<Sermon, 'id'>) => {
    const created = await api.createDailyManna({ ...sermon, type: 'daily-manna' });
    setDailyManna(current => [created, ...current].sort((a, b) => b.date.localeCompare(a.date)));
  };

  const updateDailyMannaRecord = async (id: string, sermon: Omit<Sermon, 'id'>) => {
    const updated = await api.updateDailyManna(id, { ...sermon, type: 'daily-manna' });
    setDailyManna(current => current.map(item => (item.id === id ? updated : item)).sort((a, b) => b.date.localeCompare(a.date)));
  };

  const deleteDailyMannaRecord = async (id: string) => {
    await api.deleteDailyManna(id);
    setDailyManna(current => current.filter(item => item.id !== id));
  };

  return (
    <AdminContext.Provider
      value={{
        isAdminMode: isAuthenticated,
        loading,
        hasUnsavedContent,
        login,
        logout,
        content,
        updateContent,
        images,
        updateImage,
        uploadImage,
        sermons,
        setSermons,
        dailyManna,
        setDailyManna,
        saveChanges,
        messages,
        prayerRequests,
        donations,
        submitMessage,
        submitPrayerRequest,
        submitDonation,
        markMessageRead,
        deleteMessage,
        markPrayerPrayed,
        deletePrayerRequest,
        createSermon,
        updateSermonRecord,
        deleteSermonRecord,
        createDailyManna,
        updateDailyMannaRecord,
        deleteDailyMannaRecord,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
};
