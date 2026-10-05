import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';

export interface WheelData {
  id: string;
  title: string;
  options: string[];
  spinDuration: number; // in milliseconds
  createdAt?: any;
  updatedAt?: any;
}

export const DEFAULT_PRESET_WHEEL: WheelData = {
  id: 'standard',
  title: 'Standard Glücksrad',
  spinDuration: 6000,
  options: [
    '10 Punkte',
    'Popcorn (groß)',
    '5 Punkte',
    '20 Punkte',
    '5 Punkte',
    '10 Punkte',
    'Popcorn (klein)',
    '10 Punkte',
    'Niete :(',
    '20 Punkte',
    '30 Punkte',
    '5 Punkte',
    '10 Punkte',
    'Niete :(',
    '20 Punkte',
    '5 Punkte',
  ],
};

const firebaseConfig = {
  apiKey: 'AIzaSyD1-XPnOS110gaIOKw6SLjOkfUbs01ZNno',
  authDomain: 'gl-cksrad.firebaseapp.com',
  projectId: 'gl-cksrad',
  storageBucket: 'gl-cksrad.firebasestorage.app',
  messagingSenderId: '180016094432',
  appId: '1:180016094432:web:1c500d213e4dad85730485',
  measurementId: 'G-P0G7P4MX2L',
};

// Initialize Firebase safely
export const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp);

// Local storage fallback
const LOCAL_STORAGE_KEY = 'gluecksrad_saved_wheels';

export function getLocalWheels(): WheelData[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (!parsed.some((w: WheelData) => w.id === DEFAULT_PRESET_WHEEL.id)) {
          parsed.unshift(DEFAULT_PRESET_WHEEL);
        }
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Local storage read warning:', e);
  }
  return [DEFAULT_PRESET_WHEEL];
}

export function saveLocalWheels(wheels: WheelData[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(wheels));
  } catch (e) {
    console.warn('Local storage write warning:', e);
  }
}

// Fetch all wheels with instant local return and background Firebase sync
export async function fetchAllWheels(): Promise<WheelData[]> {
  const local = getLocalWheels();

  try {
    const colRef = collection(db, 'wheels');
    const snapshot = await getDocs(colRef);
    if (!snapshot.empty) {
      const wheels: WheelData[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as WheelData;
        wheels.push({
          id: d.id,
          title: data.title || d.id,
          options: Array.isArray(data.options) ? data.options : DEFAULT_PRESET_WHEEL.options,
          spinDuration: data.spinDuration || 6000,
        });
      });
      if (!wheels.some((w) => w.id === DEFAULT_PRESET_WHEEL.id)) {
        wheels.unshift(DEFAULT_PRESET_WHEEL);
      }
      saveLocalWheels(wheels);
      return wheels;
    }
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      console.warn(
        '⚠️ Firebase Hinweis: Deine Firestore-Regeln stehen aktuell noch auf "allow read, write: if false;". Bitte in der Firebase Console auf "allow read, write: if true;" für /wheels/{wheelId} ändern. Lokaler Speicher wird aktiv genutzt.'
      );
    } else {
      console.warn('Firebase Sync Info:', err?.message || err);
    }
  }

  return local;
}

// Save or update wheel
export async function saveWheelToFirebase(wheel: WheelData): Promise<void> {
  const local = getLocalWheels();
  const existingIdx = local.findIndex((w) => w.id === wheel.id);
  if (existingIdx >= 0) {
    local[existingIdx] = { ...local[existingIdx], ...wheel };
  } else {
    local.unshift(wheel);
  }
  saveLocalWheels(local);

  try {
    const docRef = doc(db, 'wheels', wheel.id);
    await setDoc(
      docRef,
      {
        id: wheel.id,
        title: wheel.title,
        options: wheel.options,
        spinDuration: wheel.spinDuration || 6000,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      console.warn('⚠️ Firebase Write blocked by security rules. Changes saved in LocalStorage.');
    }
  }
}

// Delete wheel
export async function deleteWheelFromFirebase(id: string): Promise<void> {
  const local = getLocalWheels().filter((w) => w.id !== id);
  saveLocalWheels(local);

  try {
    const docRef = doc(db, 'wheels', id);
    await deleteDoc(docRef);
  } catch (err) {}
}

// Real-time listener for wheels
export function subscribeToWheels(callback: (wheels: WheelData[]) => void): Unsubscribe {
  // Call immediately with local data so buttons and UI work with 0ms delay!
  callback(getLocalWheels());

  try {
    const colRef = collection(db, 'wheels');
    return onSnapshot(
      colRef,
      (snapshot) => {
        if (!snapshot.empty) {
          const list: WheelData[] = [];
          snapshot.forEach((d) => {
            const data = d.data() as WheelData;
            list.push({
              id: d.id,
              title: data.title || d.id,
              options: Array.isArray(data.options) ? data.options : DEFAULT_PRESET_WHEEL.options,
              spinDuration: data.spinDuration || 6000,
            });
          });
          if (!list.some((w) => w.id === DEFAULT_PRESET_WHEEL.id)) {
            list.unshift(DEFAULT_PRESET_WHEEL);
          }
          saveLocalWheels(list);
          callback(list);
        }
      },
      (err) => {
        // Fallback already called
      }
    );
  } catch (e) {
    return () => {};
  }
}
