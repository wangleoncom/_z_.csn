const CACHE_NAME = '老王-v22.0.0'; // 統一更新為 v21
const urlsToCache = [
  './',
  './index.html',
  './avatar-main.jpg'
]; // 移除了 .js 檔案，讓它們動態獲取

self.addEventListener('install', event => {
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('刪除舊快取:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (!event.request.url.startsWith('http') || event.request.method !== 'GET') {
    return; 
  }

  const url = new URL(event.request.url);
  const isCode = url.pathname.match(/\.(js|css)$/); // 判斷是否為程式碼

  if (isCode) {
    // 網路優先策略 (Network First)：保證拿到最新程式碼
    event.respondWith(
      fetch(event.request).then(fetchRes => {
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, fetchRes.clone());
          return fetchRes;
        });
      }).catch(() => caches.match(event.request))
    );
  } else {
    // 圖片/靜態資源：快取優先策略 (Cache First)
    event.respondWith(
      caches.match(event.request).then(response => {
        return response || fetch(event.request).then(fetchRes => {
          return caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, fetchRes.clone());
            return fetchRes;
          });
        });
      })
    );
  }
});