// lib/firebase.ts — Firebase Messaging (notifications push web) pour le back-office
// npm i firebase
'use client';

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported, Messaging, deleteToken } from 'firebase/messaging';
import { chatApi } from './chat-api';

/** Variables à définir dans .env.local (Console Firebase > Paramètres du projet > Vos applications > Web) */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, // favor-group
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
/** Console Firebase > Cloud Messaging > Certificats Web Push (clé VAPID) */
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

const TOKEN_STORAGE_KEY = 'fg_fcm_token';

function app(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

let messagingPromise: Promise<Messaging | null> | null = null;
function messaging(): Promise<Messaging | null> {
  if (!messagingPromise) {
    messagingPromise = isSupported()
      .then((ok) => (ok ? getMessaging(app()) : null))
      .catch(() => null);
  }
  return messagingPromise;
}

/**
 * Demande la permission, enregistre le service worker et envoie le token FCM au backend.
 * À appeler après la connexion (ex. dans le layout du dashboard).
 */
export async function registerPushNotifications(): Promise<string | null> {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) return null;
  const m = await messaging();
  if (!m || !VAPID_KEY) return null;

  const permission =
    Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  if (permission !== 'granted') return null;

  // Le SW reçoit la config via l'URL (pas de clés en dur dans /public)
  const params = new URLSearchParams(firebaseConfig as Record<string, string>).toString();
  const registration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${params}`);

  const token = await getToken(m, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  if (!token) return null;

  let previous: string | null = null;
  try {
    previous = localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    /* stockage indisponible */
  }
  if (previous !== token) {
    await chatApi.registerDeviceToken(token);
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } catch {
      /* ignore */
    }
  }
  return token;
}

/** Notifications reçues quand l'onglet est au premier plan (le socket gère déjà l'affichage) */
export async function onForegroundPush(cb: (payload: any) => void): Promise<() => void> {
  const m = await messaging();
  if (!m) return () => undefined;
  return onMessage(m, cb);
}

/** À appeler au logout : supprime le token du navigateur (le backend nettoie les tokens invalides) */
export async function unregisterPushNotifications() {
  const m = await messaging();
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  if (m) await deleteToken(m).catch(() => undefined);
}
