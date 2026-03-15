/**
 * ==========================================================================
 * V-CORE 系統快取核心 (Service Worker)
 * 系統版本：24.1.8
 * 架構設計：動態路由快取策略 (Dynamic Routing Cache Strategy)
 * 維護團隊：V-CORE 前端工程團隊
 * ==========================================================================
 */

const APP_VERSION = '24.1.8';
const CACHE_CORE = `vcore-core-v${APP_VERSION}`;
const CACHE_STATIC = `vcore-static-v${APP_VERSION}`;

// 系統核心預載入清單 (確保離線時基本架構可運作)
const PRECACHE_ASSETS = [
    './',
    './index.html',
    './app.js',
    './styles.css',
    './avatar-main.jpg'
];

// 動態路由排除清單 (嚴格禁止快取的外部 API 與敏感連線)
const BYPASS_DOMAINS = [
    'firestore.googleapis.com',
    'firebaseinstallations.googleapis.com',
    'identitytoolkit.googleapis.com',
    'generativelanguage.googleapis.com',
    'api.groq.com',
    'api.twitch.tv',
    'id.twitch.tv',
    'api-inference.huggingface.co'
];

/**
 * 1. 系統安裝階段 (Install Phase)
 * 預先載入核心靜態資源，並強制替換舊版 Service Worker
 */
self.addEventListener('install', (event) => {
    self.skipWaiting(); // 強制立即啟動新版，不等待所有客戶端分頁關閉
    event.waitUntil(
        caches.open(CACHE_CORE).then((cache) => {
            console.info(`[V-CORE 快取引擎] 正在安裝核心資源，版本：${APP_VERSION}`);
            return cache.addAll(PRECACHE_ASSETS);
        })
    );
});

/**
 * 2. 系統啟動階段 (Activate Phase)
 * 清理過期的舊版快取叢集，並立即接管所有開啟的客戶端連線
 */
self.addEventListener('activate', (event) => {
    const allowedCaches = [CACHE_CORE, CACHE_STATIC];
    
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // 移除不在白名單內的舊版快取
                    if (!allowedCaches.includes(cacheName)) {
                        console.info(`[V-CORE 快取引擎] 刪除過期快取叢集：${cacheName}`);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.info(`[V-CORE 快取引擎] 版本 ${APP_VERSION} 已上線並接管網路請求。`);
            return self.clients.claim(); // 立即取得所有分頁的控制權
        })
    );
});

/**
 * 3. 網路請求攔截與分流 (Fetch Interception)
 * 根據資源類型 (API, 靜態資源, 網頁核心) 自動套用對應的快取路由策略
 */
self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);

    // [策略 A] 繞過特定 API 與外部服務 (Network Only 網路唯一)
    // 確保即時資料庫、AI 推理與 OAuth 安全驗證絕不讀取到陳舊的快取資料
    const shouldBypass = BYPASS_DOMAINS.some(domain => url.hostname.includes(domain)) || 
                         req.method !== 'GET' ||
                         url.pathname.includes('/api/');
                         
    if (shouldBypass) {
        return; // 直接放行，交由瀏覽器原生網路層處理
    }

    // [策略 B] 靜態媒體資源 (Cache First, Network Fallback 快取優先)
    // 針對圖片、音效與字體，降低伺服器頻寬負載，大幅提升二次載入速度
    const isStaticAsset = req.destination === 'image' || req.destination === 'font' || req.destination === 'audio' || req.destination === 'video';
    
    if (isStaticAsset) {
        event.respondWith(
            caches.match(req).then((cachedResponse) => {
                if (cachedResponse) return cachedResponse; // 命中快取，光速回傳
                
                // 快取未命中，從網路請求並存入靜態快取池
                return fetch(req).then((networkResponse) => {
                    if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                        return networkResponse;
                    }
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_STATIC).then((cache) => cache.put(req, responseToCache));
                    return networkResponse;
                }).catch((err) => {
                    console.warn(`[V-CORE 快取引擎] 靜態資源獲取失敗: ${url.href}`, err);
                    // 靜默處理，避免拋出阻斷性錯誤干擾使用者體驗
                });
            })
        );
        return;
    }

    // [策略 C] 核心系統檔案 HTML/JS/CSS (Network First, Cache Fallback 網路優先)
    // 確保使用者永遠拿到最新版的系統邏輯，若偵測到斷網或伺服器異常，則無縫降級使用本地快取
    event.respondWith(
        fetch(req).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_CORE).then((cache) => cache.put(req, responseToCache));
            }
            return networkResponse;
        }).catch(() => {
            console.warn(`[V-CORE 快取引擎] 網路離線或不穩定，降級讀取本地快取: ${url.href}`);
            return caches.match(req);
        })
    );
});

/**
 * 4. 背景通訊介面 (Message Handling)
 * 提供前端主動發送指令給 Service Worker 進行強制作業的管道
 */
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        console.info('[V-CORE 快取引擎] 收到前端 SKIP_WAITING 指令，強制進入更新程序。');
        self.skipWaiting();
    }
});