importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// 替換成你原本 HTML 裡的 firebaseConfig
const firebaseConfig = {
  apiKey: "AIzaSyDdu8ag6liDwW0AXn3zccIR5a13g7WE-hM",
  authDomain: "oldwangbase.firebaseapp.com",
  databaseURL: "https://oldwangbase-default-rtdb.firebaseio.com",
  projectId: "oldwangbase",
  storageBucket: "oldwangbase.firebasestorage.app",
  messagingSenderId: "756236660652",
  appId: "1:756236660652:web:794d9649d7315b64ec1409"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// 背景收到訊息時的處理 (就算沒開網頁也會觸發)
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] 收到背景推播 ', payload);
    const notificationTitle = payload.notification.title || '系統通知';
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/avatar-main.jpg',
        badge: '/avatar-main.jpg', // 手機狀態列的小圖示
        data: payload.data // 可夾帶網址等資訊
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});

// 使用者點擊推播通知時，自動打開管理系統
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // 如果已經有開啟的視窗，就聚焦過去；否則開新視窗
            if (windowClients.length > 0) {
                return windowClients[0].focus();
            } else {
                return clients.openWindow('/');
            }
        })
    );
});