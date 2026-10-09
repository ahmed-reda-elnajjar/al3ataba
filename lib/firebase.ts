import { getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore, type Firestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Web config is public by design; access is enforced by firestore.rules / storage.rules.
export const firebaseConfig = {
  apiKey: "AIzaSyCPXarDZxgfjpdxa6MJ8x6o2qlDcxZ-T6A",
  authDomain: "al3ataba-c6a08.firebaseapp.com",
  projectId: "al3ataba-c6a08",
  storageBucket: "al3ataba-c6a08.firebasestorage.app",
  messagingSenderId: "526589845542",
  appId: "1:526589845542:web:5409ebfa2ea1d2146f46e7",
};

export const app = getApps()[0] ?? initializeApp(firebaseConfig);
// Lazy getters so nothing touches browser-only APIs during server rendering.
export const authI = () => getAuth(app);
// Long polling: more reliable on networks/antivirus that break streaming connections (writes were hanging).
let _db: Firestore | null = null;
export const dbI = () => {
  if (!_db) { try { _db = initializeFirestore(app, { experimentalForceLongPolling: true, ignoreUndefinedProperties: true }); } catch { _db = getFirestore(app); } }
  return _db;
};
export const storageI = () => getStorage(app);
