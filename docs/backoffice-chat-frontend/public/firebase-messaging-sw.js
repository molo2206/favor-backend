/* public/firebase-messaging-sw.js — service worker FCM du back-office Favor Group */
/* global importScripts, firebase, self, clients */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

// La config est passée en paramètres d'URL lors de l'enregistrement du SW
const params = new URL(self.location.href).searchParams;
firebase.initializeApp({
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  storageBucket: params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
});

const messaging = firebase.messaging();

// Les messages contenant "notification" sont affichés automatiquement par FCM.
// Ce handler couvre les messages "data only".
messaging.onBackgroundMessage((payload) => {
  if (payload.notification) return;
  const data = payload.data || {};
  self.registration.showNotification(data.title || 'Nouveau message', {
    body: data.body || '',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    tag: data.conversationId ? `chat-${data.conversationId}` : 'chat',
    renotify: true,
    data: { link: data.link || (data.conversationId ? `/chat/${data.conversationId}` : '/chat') },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link =
    (event.notification.data && (event.notification.data.link || event.notification.data.FCM_MSG?.data?.link)) ||
    '/chat';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) {
          w.navigate(link);
          return w.focus();
        }
      }
      return clients.openWindow(link);
    }),
  );
});
