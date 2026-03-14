/**
 * ==========================================================================
 * V-CORE MAX 系統快取核心 (Service Worker)
 * 版本：v22.0.0
 * 策略：Stale-While-Revalidate (核心程式) / Cache First (靜態資源)
 * ==========================================================================
 */

const CACHE_NAME = 'VCORE-BASE-v24.1.7'; // 升級為 v24.1.7
const CORE_ASSETS = [
    './',
    './index.html',
    './app.js',
    './styles.css',
    './avatar-main.jpg'
];

// --------------------------------------------------------------------------
// 1. 安裝階段 (Install) - 強制接管與預載入核心資源
// --------------------------------------------------------------------------
self.addEventListener('install', event => {
    // skipWaiting 強制讓新版 Service Worker 立即啟動，不等待舊版關閉
    self.skipWaiting(); 
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log(`[SW] 系統核心 V-CORE 預載入中... 版本: ${CACHE_NAME}`);
            return cache.addAll(CORE_ASSETS);
        })
    );
});

// --------------------------------------------------------------------------
// 2. 啟動階段 (Activate) - 清理舊版快取，確保強制更新
// --------------------------------------------------------------------------
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    // 只要名稱跟當前版本號不一樣，通通刪除
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] 刪除過期快取模組:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('[SW] V-CORE 已完全接管網路層');
            return self.clients.claim(); // 立即接管所有目前開啟的頁面
        })
    );
});

// --------------------------------------------------------------------------
// 3. 請求攔截階段 (Fetch) - 智慧型路由分發
// --------------------------------------------------------------------------
self.addEventListener('fetch', event => {
    const req = event.request;
    const url = new URL(req.url);

    // [防呆] 忽略非 GET 請求與 Chrome Extension 等非 HTTP 請求
    if (req.method !== 'GET' || !req.url.startsWith('http')) return;

    // [隔離] 外部 API 請求：絕對不快取 (Network Only)
    // 確保 Firebase 即時資料、Groq、Gemini 的運算不會拿到舊資料
    if (
        url.hostname.includes('firestore.googleapis.com') || 
        url.hostname.includes('firebase') ||
        url.hostname.includes('api.groq.com') ||
        url.hostname.includes('generativelanguage.googleapis.com') ||
        url.pathname.includes('/api/')
    ) {
        return; // 交給瀏覽器原生網路層處理
    }

    // [策略 A] 核心程式碼 (HTML, JS, CSS)：Stale-While-Revalidate
    // 目標：確保畫面「秒開」，同時背景偷偷更新
    const isCoreCode = url.pathname.match(/\.(html|js|css)$/) || url.pathname.endsWith('/');
    
    if (isCoreCode) {
        event.respondWith(
            caches.open(CACHE_NAME).then(cache => {
                return cache.match(req).then(cachedResponse => {
                    // 建立一個前往網路抓取最新版本的 Promise
                    const fetchPromise = fetch(req).then(networkResponse => {
                        // 確定拿到正確且有效的回覆後，更新快取
                        if (networkResponse && networkResponse.status === 200) {
                            cache.put(req, networkResponse.clone());
                        }
                        return networkResponse;
                    }).catch(err => {
                        console.warn('[SW] 背景更新失敗，維持使用快取:', err);
                    });
                    
                    // 魔法發生在這裡：
                    // 如果有快取，立刻回傳快取 (極速體驗)，背景同時執行 fetchPromise 更新快取。
                    // 如果沒快取，就乖乖等待 fetchPromise 完成。
                    return cachedResponse || fetchPromise;
                });
            })
        );
        return; // 處理完畢，提早 return
    }

    // [策略 B] 靜態資源 (圖片、音效、字體)：Cache First (快取優先)
    // 目標：節省流量，只要抓過一次就永遠從快取拿
    event.respondWith(
        caches.match(req).then(cachedResponse => {
            if (cachedResponse) {
                return cachedResponse; // 命中快取，直接回傳
            }
            // 沒命中快取，去網路抓，抓完存入快取
            return fetch(req).then(networkResponse => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(req, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(err => {
                // 如果離線且連圖片都抓不到，可以直接靜默處理或回傳預設圖
                console.warn('[SW] 靜態資源獲取失敗:', err);
            });
        })
    );
});

// --------------------------------------------------------------------------
// 4. 訊息監聽 (Message) - 允許前端手動觸發立即更新
// --------------------------------------------------------------------------
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        console.log('[SW] 收到前端強制更新指令');
        self.skipWaiting();
    }
});