import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { produce } from 'immer';
import { api } from '../api';
import { DEFAULT_SITE_BOOTSTRAP, type AdminRole, type AdminUser, type Donation, type Message, type PrayerRequest, type Sermon } from '../data';

interface AdminContextType {
  isAdminMode: boolean;
  currentUser: AdminUser | null;
  users: AdminUser[];
  loading: boolean;
  hasUnsavedContent: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  canAccessSection: (section: string) => boolean;
  canEditContent: (path: string) => boolean;
  updateCurrentUserProfile: (data: { name?: string; email?: string; currentPassword?: string; newPassword?: string }) => Promise<void>;
  content: typeof DEFAULT_SITE_BOOTSTRAP.content;
  updateContent: (path: string, value: string) => void;
  images: Record<string, string>;
  updateImage: (key: string, url: string) => Promise<void>;
  deleteImage: (key: string) => Promise<void>;
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
  createUser: (data: { name: string; email: string; password: string; role: AdminRole }) => Promise<void>;
  updateUserRecord: (id: string, data: Partial<{ name: string; email: string; password: string; role: AdminRole; active: boolean }>) => Promise<void>;
}

export const AdminContext = createContext<AdminContextType | undefined>(undefined);

const ownerOnlySections = new Set(['homepage', 'users']);

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
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);
  const [content, setContent] = useState(DEFAULT_SITE_BOOTSTRAP.content);
  const [sermons, setSermons] = useState<Sermon[]>(DEFAULT_SITE_BOOTSTRAP.sermons);
  const [dailyManna, setDailyManna] = useState<Sermon[]>(DEFAULT_SITE_BOOTSTRAP.dailyManna);
  const [images, setImages] = useState<Record<string, string>>(DEFAULT_SITE_BOOTSTRAP.images);
  const [messages, setMessages] = useState<Message[]>([]);
  const [prayerRequests, setPrayerRequests] = useState<PrayerRequest[]>([]);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasUnsavedContent, setHasUnsavedContent] = useState(false);

  const applyBootstrap = (data: typeof DEFAULT_SITE_BOOTSTRAP) => {
    setContent(data.content);
    setImages(data.images);
    setSermons(data.sermons.filter(item => item.type === 'sermon'));
    setDailyManna(data.dailyManna ?? data.sermons.filter(item => item.type === 'daily-manna'));
    setMessages(data.messages);
    setPrayerRequests(data.prayerRequests);
    setDonations(data.donations);
    setCurrentUser(data.currentUser ?? null);
    setUsers(data.users ?? []);
    setHasUnsavedContent(false);
  };

  const refreshBootstrap = async () => {
    const data = await api.bootstrap();
    applyBootstrap(data);
  };

  useEffect(() => {
    let cancelled = false;

    refreshBootstrap()
      .then(() => {
        if (cancelled) return;
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

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const result = await api.login(email, password);
      setCurrentUser(result.user);
      await refreshBootstrap();
      return true;
    } catch (error) {
      console.error('Failed to login', error);
      return false;
    }
  };

  const logout = async () => {
    await api.logout().catch(error => {
      console.error('Failed to logout cleanly', error);
    });
    setCurrentUser(null);
    setMessages([]);
    setPrayerRequests([]);
    setDonations([]);
    setUsers([]);
  };

  const canAccessSection = (section: string) => {
    if (!currentUser) {
      return false;
    }
    return currentUser.role === 'owner' || !ownerOnlySections.has(section);
  };

  const canEditContent = (path: string) => {
    if (!currentUser) {
      return false;
    }
    return currentUser.role === 'owner' || !path.startsWith('hero.');
  };

  const updateContent = (path: string, value: string) => {
    if (!canEditContent(path)) {
      return;
    }
    setContent(produce(draft => {
      setNestedValue(draft, path, value);
    }));
    setHasUnsavedContent(true);
  };

  const updateImage = async (key: string, url: string) => {
    if (!canEditContent(key)) {
      return;
    }
    const newImages = { ...images, [key]: url };
    setImages(newImages);
    await api.saveImages(newImages);
  };

  const deleteImage = async (key: string) => {
    if (!canEditContent(key)) {
      return;
    }
    const newImages = { ...images };
    delete newImages[key];
    setImages(newImages);
    await api.saveImages(newImages);
  };

  const uploadImage = async (key: string, file: Blob, fileName: string) => {
    if (!canEditContent(key)) {
      throw new Error('You do not have permission to edit this image.');
    }
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

  const createUser = async (data: { name: string; email: string; password: string; role: AdminRole }) => {
    const created = await api.createUser(data);
    setUsers(current => [...current, created]);
  };

  const updateUserRecord = async (id: string, data: Partial<{ name: string; email: string; password: string; role: AdminRole; active: boolean }>) => {
    const updated = await api.updateUser(id, data);
    setUsers(current => current.map(item => (item.id === id ? updated : item)));
    if (currentUser?.id === id) {
      setCurrentUser(updated.active ? updated : null);
    }
  };

  const updateCurrentUserProfile = async (data: { name?: string; email?: string; currentPassword?: string; newPassword?: string }) => {
    const result = await api.updateMe(data);
    setCurrentUser(result.user);
    setUsers(current => current.map(item => (item.id === result.user.id ? result.user : item)));
  };

  return (
    <AdminContext.Provider
      value={{
        isAdminMode: Boolean(currentUser),
        currentUser,
        users,
        loading,
        hasUnsavedContent,
        login,
        logout,
        canAccessSection,
        canEditContent,
        updateCurrentUserProfile,
        content,
        updateContent,
        images,
        updateImage,
        deleteImage,
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
        createUser,
        updateUserRecord,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
};
