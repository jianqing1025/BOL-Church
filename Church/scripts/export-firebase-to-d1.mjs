import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

for (const [key, value] of Object.entries(firebaseConfig)) {
  if (!value) {
    throw new Error(`Missing required Firebase export env var for ${key}`);
  }
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function readCollection(name, queryBuilder) {
  const snapshot = await getDocs(queryBuilder ? queryBuilder(collection(db, name)) : collection(db, name));
  return snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
}

const websiteContent = (await getDoc(doc(db, 'settings', 'website_content'))).data() ?? {};
const images = (await getDoc(doc(db, 'settings', 'images'))).data() ?? {};
const sermons = await readCollection('sermons', ref => query(ref, orderBy('date', 'desc')));
const messages = await readCollection('messages', ref => query(ref, orderBy('date', 'desc')));
const prayerRequests = await readCollection('prayerRequests', ref => query(ref, orderBy('date', 'desc')));
const donations = await readCollection('donations', ref => query(ref, orderBy('date', 'desc')));

const exportData = {
  content: websiteContent,
  images,
  sermons,
  messages,
  prayerRequests,
  donations,
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(__dirname, '../firebase-export.json');
await fs.writeFile(outputPath, JSON.stringify(exportData, null, 2), 'utf8');

console.log(`Exported Firebase data to ${outputPath}`);
