
import React, { createContext, useState, useEffect, ReactNode, useRef } from 'react';
import { translations } from '../constants/translations';
import { produce } from 'immer';
import { db } from '../firebase';
import { 
  collection, 
  doc, 
  onSnapshot, 
  updateDoc, 
  addDoc, 
  deleteDoc, 
  setDoc,
  query,
  orderBy,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export interface Sermon {
  id: string; 
  title: { en: string; zh: string };
  speaker: { en: string; zh: string };
  date: string;
  series: { en: string; zh: string };
  passage: { en: string; zh: string };
  youtubeId: string;
  imageUrl?: string;
  type: 'sermon' | 'daily-manna';
}

export interface Message {
  id: string;
  date: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message: string;
  read: boolean;
}

export interface PrayerRequest {
  id: string;
  date: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  message: string;
  status: 'new' | 'prayed';
}

export interface Donation {
  id: string;
  date: string;
  amount: number;
  type: 'one-time' | 'recurring';
  status: 'completed';
}

interface AdminContextType {
  isAdminMode: boolean;
  loading: boolean;
  login: (password: string) => boolean;
  logout: () => void;
  content: typeof translations;
  updateContent: (path: string, value: string) => void;
  images: { [key: string]: string };
  updateImage: (key: string, dataUrl: string) => void;
  sermons: Sermon[];
  setSermons: (sermons: Sermon[]) => void;
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

const DEFAULT_SERMONS: Omit<Sermon, 'id'>[] = [
  {
    title: { en: 'Daily Manna: Walking with God', zh: '每日天言：與神同行' },
    speaker: { en: 'Pastor Andy Yu', zh: '余大器 牧師' },
    date: '2024-05-20',
    series: { en: 'Daily Devotion', zh: '每日靈修' },
    passage: { en: 'Psalm 23', zh: '詩篇 23' },
    youtubeId: 'Fj-P7o5Fv5g',
    type: 'daily-manna'
  },
  {
    title: { en: 'The Power of Forgiveness', zh: '饒恕的力量' },
    speaker: { en: 'Pastor Andy Yu', zh: '余大器 牧師' },
    date: '2024-05-19',
    series: { en: 'Gospel Living', zh: '福音生活' },
    passage: { en: 'Matthew 18:21-35', zh: '馬太福音 18:21-35' },
    youtubeId: 'kYm9S2v7Y7U',
    type: 'sermon'
  },
  {
    title: { en: 'Living a Life of Purpose', zh: '活出有目標的生命' },
    speaker: { en: 'Guest Pastor Chen', zh: '特邀講員陳牧師' },
    date: '2024-05-12',
    series: { en: 'Purpose Driven', zh: '標竿人生' },
    passage: { en: 'Ephesians 2:10', zh: '以弗所書 2:10' },
    youtubeId: '8pBq2H8yY-U',
    type: 'sermon'
  },
  {
    title: { en: 'Faith Over Fear', zh: '以信勝懼' },
    speaker: { en: 'Pastor Andy Yu', zh: '余大器 牧師' },
    date: '2024-05-05',
    series: { en: 'Faith Journey', zh: '信心之旅' },
    passage: { en: 'Isaiah 41:10', zh: '以賽亞書 41:10' },
    youtubeId: 'vV06uH9O90M',
    type: 'sermon'
  }
];

export const AdminProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [content, setContent] = useState<typeof translations>(translations);
  const [sermons, setSermons] = useState<Sermon[]>([]);
  const [images, setImages] = useState<{ [key: string]: string }>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [prayerRequests, setPrayerRequests] = useState<PrayerRequest[]>([]);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);
  const seedingRef = useRef(false);

  useEffect(() => {
    const contentDoc = doc(db, "settings", "website_content");
    const unsubscribe = onSnapshot(contentDoc, 
      (docSnap) => {
        if (docSnap.exists()) {
          setContent(docSnap.data() as typeof translations);
        } else {
          setDoc(contentDoc, translations).catch(err => console.error("Initial setDoc failed:", err));
        }
      },
      (error) => {
        console.warn("Firestore Content Listener Error:", error.message);
      }
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const q = query(collection(db, "sermons"), orderBy("date", "desc"));
    const unsubscribe = onSnapshot(q, 
      async (querySnapshot) => {
        const sermonList: Sermon[] = [];
        querySnapshot.forEach((doc) => {
          sermonList.push({ id: doc.id, ...doc.data() } as Sermon);
        });

        if (sermonList.length === 0 && !seedingRef.current) {
          seedingRef.current = true;
          for (const s of DEFAULT_SERMONS) {
            await addDoc(collection(db, "sermons"), s);
          }
        } else {
          setSermons(sermonList);
          setLoading(false);
        }
      },
      (error) => {
        console.warn("Firestore Sermons Listener Error:", error.message);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const q = query(collection(db, "messages"), orderBy("date", "desc"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const msgList: Message[] = [];
        querySnapshot.forEach((doc) => {
          msgList.push({ id: doc.id, ...doc.data() } as Message);
        });
        setMessages(msgList);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const imgDoc = doc(db, "settings", "images");
    const unsubscribe = onSnapshot(imgDoc, (docSnap) => {
        if (docSnap.exists()) {
          setImages(docSnap.data());
        }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const q = query(collection(db, "prayerRequests"), orderBy("date", "desc"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const list: PrayerRequest[] = [];
        querySnapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as PrayerRequest);
        });
        setPrayerRequests(list);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const q = query(collection(db, "donations"), orderBy("date", "desc"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const list: Donation[] = [];
        querySnapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Donation);
        });
        setDonations(list);
    });
    return unsubscribe;
  }, []);

  const login = (password: string): boolean => {
    if (password === 'bolcc2024') {
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
  };

  const updateImage = async (key: string, dataUrl: string) => {
    const newImages = { ...images, [key]: dataUrl };
    setImages(newImages);
    await setDoc(doc(db, "settings", "images"), newImages, { merge: true });
  };
  
  const saveChanges = async () => {
    try {
      await setDoc(doc(db, "settings", "website_content"), content);
      alert('所有文字更改已保存到雲端！');
    } catch (error) {
      alert('保存失敗，請確認資料庫權限。');
    }
  };
  
  const submitMessage = async (data: Omit<Message, 'id' | 'date' | 'read'>) => {
    await addDoc(collection(db, "messages"), { ...data, date: new Date().toISOString(), read: false });
  };

  const submitPrayerRequest = async (data: Omit<PrayerRequest, 'id' | 'date' | 'status'>) => {
    await addDoc(collection(db, "prayerRequests"), { ...data, date: new Date().toISOString(), status: 'new' });
  };

  const submitDonation = async (data: Omit<Donation, 'id' | 'date' | 'status'>) => {
    await addDoc(collection(db, "donations"), { ...data, date: new Date().toISOString(), status: 'completed' });
  };

  const markMessageRead = async (id: string) => {
    await updateDoc(doc(db, "messages", id), { read: true });
  };

  const deleteMessage = async (id: string) => {
    await deleteDoc(doc(db, "messages", id));
  };

  const markPrayerPrayed = async (id: string) => {
    await updateDoc(doc(db, "prayerRequests", id), { status: 'prayed' });
  };

  const deletePrayerRequest = async (id: string) => {
    await deleteDoc(doc(db, "prayerRequests", id));
  };

  return (
    <AdminContext.Provider value={{ 
        isAdminMode: isAuthenticated, loading, login, logout, content, updateContent, images, updateImage, sermons, setSermons: (s) => {}, saveChanges,
        messages, prayerRequests, donations,
        submitMessage, submitPrayerRequest, submitDonation,
        markMessageRead, deleteMessage, markPrayerPrayed, deletePrayerRequest
    }}>
      {children}
    </AdminContext.Provider>
  );
};
