import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * FIRESTORE SECURITY RULES (Copy and paste these into your Firebase Console > Firestore > Rules):
 * 
 * rules_version = '2';
 * service cloud.firestore {
 *   match /databases/{database}/documents {
 *     // Allow public read for settings and sermons
 *     match /settings/{document} {
 *       allow read, write: if true;
 *     }
 *     match /sermons/{document} {
 *       allow read, write: if true;
 *     }
 *     // Allow public write for forms, and read for admin (represented as true here for dev)
 *     match /messages/{document} {
 *       allow read, write: if true;
 *     }
 *     match /prayerRequests/{document} {
 *       allow read, write: if true;
 *     }
 *     match /donations/{document} {
 *       allow read, write: if true;
 *     }
 *   }
 * }
 */

const firebaseConfig = {
  apiKey: "AIzaSyBKE3JD2rsGlQ9q3MQKlNAQ1JpHR4Cqf3M",
  authDomain: "bol-church.firebaseapp.com",
  projectId: "bol-church",
  storageBucket: "bol-church.firebasestorage.app",
  messagingSenderId: "723552216634",
  appId: "1:723552216634:web:b4c5a4fd7042b1f7e2b703"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
