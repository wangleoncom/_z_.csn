// --- 更新日誌 ---
const APP_VERSION = '22.0.0';

// --- 系統全域防呆與美化變數 ---
window.playClickSound = window.playClickSound || function() {};
window.playSuccessSound = window.playSuccessSound || function() {};
window.preloadedImages = window.preloadedImages || {};
window.isLoggedIn = window.isLoggedIn || false;

const PremiumSwal = Swal.mixin({
    customClass: {
        popup: 'premium-card border border-sky-500/30',
        confirmButton: 'bg-gradient-to-r from-sky-400 to-blue-500 text-white font-bold rounded-xl px-6 py-2 shadow-lg hover:scale-105 transition-transform',
        cancelButton: 'bg-zinc-800 text-white font-bold rounded-xl px-6 py-2 hover:bg-zinc-700 transition-colors'
    },
    background: 'rgba(10,16,28,0.95)',
    color: '#fff',
    buttonsStyling: false
});

const CHANGELOG = [
    { ver: '22.0.0', date: '2026-03-06', items: [
        'V-CORE MAX 系統架構重構與後台介接完畢',
        '動態 AI 算力實裝：高等級粉絲享有更高的 AI 呼叫上限與特定權限',
        'AI 視覺防呆：上傳圖片自動強制切換至 Gemini 視覺神經引擎',
        '傳奇徽章解鎖：新增 1000 EXP「基地守護者」動態流光成就'
    ]},
    { ver: '21.0.0', date: '2026-03-06', items: [
        '系統效能與快取機制全面升級 (Stale-While-Revalidate)',
        '修復畫面排版往下掉的問題，確保全裝置完美垂直置中',
        '修正圖片預載入的全域變數錯誤，防禦空投無限重整 Bug',
        '實裝成就徽章解鎖與動態卡片生成'
    ]},
    { ver: '20.0.0', date: '2026-03-05', items: [
        '強制所有人重新登入驗證身分',
        '全新等級系統：解鎖「基地守護者」等高級頭銜',
        '針對工程師與特定粉絲開啟「雲端對話同步」功能'
    ]}
];

// --- 強制更新與驗證機制 ---
(function enforceAppVersion(){
    try{
        const k = 'wangAppVersion';
        const prev = localStorage.getItem(k);
        
        if(prev !== APP_VERSION){
            console.log("偵測到新版本，準備執行強制更新...");
            localStorage.setItem(k, APP_VERSION);
            try{ localStorage.removeItem('wangAppConfig_V18_PRO'); }catch(e){}
            try{ localStorage.removeItem('wangAppConfig_V19_PRO'); }catch(e){}

            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                    for(let registration of registrations) {
                        registration.unregister();
                    }
                });
            }

            if ('caches' in window) {
                caches.keys().then(function(names) {
                    for (let name of names) caches.delete(name);
                });
            }

            const request = window.indexedDB.deleteDatabase('firebaseLocalStorageDb');
            request.onsuccess = function () {
                const url = new URL(location.href.split('?')[0]); 
                url.searchParams.set('v', APP_VERSION);
                url.searchParams.set('t', Date.now()); 
                location.replace(url.toString());
            };
            
            setTimeout(() => {
                const url = new URL(location.href.split('?')[0]);
                url.searchParams.set('v', APP_VERSION);
                url.searchParams.set('t', Date.now());
                location.replace(url.toString());
            }, 1000);
        }
    }catch(e){
        console.error("強制更新腳本發生錯誤:", e);
    }
})();

window.openChangelog = function(){
    const md = CHANGELOG
        .map(v => `### v${v.ver} · ${v.date}\n` + v.items.map(i => `- ${i}`).join('\n'))
        .join('\n\n');
    PremiumSwal.fire({
        title: '更新日誌',
        html: `<div class="markdown-body" style="text-align:left;max-height:60vh;overflow:auto;">${marked.parse(md)}</div>`,
        background: 'rgba(10,16,28,0.95)',
        color: '#fff',
        confirmButtonText: '知道了',
        confirmButtonColor: '#38bdf8'
    });
};

window.setQaPerPage = function(value){
    const n = parseInt(value, 10);
    if(!Number.isFinite(n) || n<=0) return;
    window.appSettings.qaPerPage = n;
    
    if(typeof window.saveSettings === 'function') window.saveSettings();
    currentPage = 1; 
    
    if(typeof window.renderQA === 'function') window.renderQA(currentPage);
};

// ==========================================================================
// 老王專屬秘密基地 - 核心邏輯腳本 (v22.0.0 跨平台整合版)
// ==========================================================================

let dynamicApiKeys = { gemini: [], groq: [] };
const qaData = window.QA_DB || window.wangQuiz_DB || []; 
const quizData = window.QUIZ_DB || window.wangQuiz_DB || [];
const STORAGE_KEY = 'wangAppConfig_V22_PRO';

window.appSettings = Object.assign({ 
    exp: 0, 
    qaPerPage: 6, 
    soundOn: true, 
    perfMode: false, 
    lastCheckIn: "",
    voiceReply: false, 
    aiLimitDate: "", 
    aiUsageCount: 0  
}, window.appSettings || {});

let currentAIEngine = 'auto'; 
let aiMemory = []; 
let currentAbortController = null; 
let currentAttachedImageBase64 = null; 

function escapeForInlineHandler(str) {
    if (!str) return "";
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '\\n').replace(/\r/g, '');
}

// --- 語音辨識 API ---
let speechRecognition = null;
let isRecording = false;

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    speechRecognition = new SpeechRecognition();
    speechRecognition.lang = 'zh-TW';
    speechRecognition.interimResults = false;
    
    speechRecognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        const inputEl = document.getElementById('ai-input');
        if(inputEl) {
            inputEl.value += transcript;
            inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
        }
        stopRecordingUI();
        
        const sendBtn = document.getElementById('ai-send-btn');
        if (sendBtn && !sendBtn.disabled) { setTimeout(() => window.sendAIMessage(), 500); }
    };
    
    speechRecognition.onerror = (event) => {
        console.error("語音辨識錯誤:", event.error);
        stopRecordingUI();
        PremiumSwal.fire({ title: '語音辨識失敗', text: '請確認麥克風權限已開啟。', icon: 'error', timer: 2000, showConfirmButton: false });
    };
    
    speechRecognition.onend = () => { stopRecordingUI(); };
}

// === 基地公告資料庫 ===
let announcementsData = [];

async function fetchAnnouncements() {
    if (!window.firebaseApp || !window.firebaseApp.db) {
        setTimeout(fetchAnnouncements, 500); 
        return;
    }
    
    try {
        const announceRef = window.firebaseApp.collection(window.firebaseApp.db, "announcements");
        const q = window.firebaseApp.query(announceRef, window.firebaseApp.orderBy("timestamp", "desc"));
        const snapshot = await window.firebaseApp.getDocs(q);
        
        let loadedAnnouncements = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            const dateObj = new Date(data.timestamp);
            const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
            
            loadedAnnouncements.push({
                id: doc.id, title: "基地系統通報", date: dateStr, type: "info", isPinned: false, 
                summary: data.content.length > 25 ? data.content.substring(0, 25) + '...' : data.content,
                image: null,
                content: `<div class="text-left space-y-4 text-sm text-zinc-300 mt-2"><p>${data.content.replace(/\n/g, '<br>')}</p><div class="text-xs text-sky-500 mt-4 pt-3 border-t border-sky-500/20 font-mono"><i class="fa-solid fa-user-gear mr-1"></i>發布者: ${data.author}</div></div>`
            });
        });

        loadedAnnouncements.unshift({
            id: 'anti-theft-warning-001', title: "🚨 嚴重警告：影片盜用聲明", date: new Date().toISOString().split('T')[0], type: "warning", isPinned: true, 
            summary: "近期發現有假帳號盜用老王的影片，請大家認老王唯一帳號並協助檢舉！", image: "fake-account.jpg", 
            content: `
                <div class="text-left space-y-4 text-sm text-zinc-300 mt-2">
                    <p class="text-red-400 font-bold text-base">⚠️ 近期我們發現，有不肖人士在 TikTok 盜用老王的影片並建立假帳號！</p>
                    <p>請各位粉絲注意，老王的<b class="text-white">老王唯一本人帳號</b>只有主頁連結的那幾個！</p>
                    <p>如果看到上方附圖這個帳號，或者是其他可疑帳號，請<b class="text-white">直接幫忙檢舉</b>，不要被騙了！</p>
                    <div class="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-center shadow-[inset_0_0_15px_rgba(239,68,68,0.2)]">
                        <span class="text-red-400 font-black tracking-widest text-lg">請認明本人，打擊盜版！</span>
                    </div>
                </div>`
        });

        announcementsData = loadedAnnouncements;
        renderAnnouncements(); 
    } catch(e) { console.error("無法載入雲端公告", e); }
}

function renderAnnouncements() {
    const homeContainer = document.getElementById('home-pinned-announcements');
    const pageContainer = document.getElementById('announcements-list');
    if(!homeContainer || !pageContainer) return;
    let homeHTML = ''; let pageHTML = '';

    announcementsData.forEach(item => {
        const isWarning = item.type === 'warning';
        const colorClass = isWarning ? 'red-500' : 'sky-400'; 
        const iconClass = isWarning ? 'fa-triangle-exclamation' : 'fa-circle-info';
        const tagText = isWarning ? '重要公告' : '基地資訊';

        const cardHTML = `
            <div class="premium-card p-5 md:p-6 border-l-4 border-l-${colorClass} relative overflow-hidden group cursor-pointer hover:bg-sky-900/10 transition-all duration-300" onclick="window.openAnnouncement('${item.id}')">
                <div class="absolute top-0 right-0 w-32 h-32 bg-${colorClass}/10 rounded-full blur-3xl group-hover:bg-${colorClass}/20 transition-all duration-500"></div>
                <div class="flex flex-col md:flex-row items-start gap-4 relative z-10">
                    <div class="w-12 h-12 rounded-full bg-${colorClass}/10 flex items-center justify-center flex-shrink-0 border border-${colorClass}/30 shadow-[0_0_15px_rgba(${isWarning ? '239,68,68' : '56,189,248'},0.2)] group-hover:scale-110 transition-transform">
                        <i class="fa-solid ${iconClass} text-${colorClass} text-lg"></i>
                    </div>
                    <div class="flex-1 w-full">
                        <div class="flex items-center gap-3 mb-2 flex-wrap">
                            <span class="bg-${colorClass} text-${isWarning ? 'white' : 'sky-950'} text-[10px] font-black px-2 py-1 rounded tracking-widest">${tagText}</span>
                            ${item.isPinned ? `<span class="text-[10px] text-sky-200/70 font-mono bg-[#040d1a] px-2 py-1 rounded border border-sky-500/20"><i class="fa-solid fa-thumbtack mr-1"></i>置頂</span>` : ''}
                            <span class="text-[10px] text-sky-200/50 font-mono ml-auto">${item.date}</span>
                        </div>
                        <h4 class="text-base font-black text-white mb-2 tracking-wide group-hover:text-${colorClass} transition-colors">${item.title}</h4>
                        <p class="text-sm text-sky-100/70 leading-relaxed font-medium line-clamp-2">${item.summary}</p>
                    </div>
                </div>
            </div>`;
        if (item.isPinned) { homeHTML += cardHTML; }
        pageHTML += cardHTML;
    });

    if (homeHTML) { homeContainer.innerHTML = `<h3 class="text-sm font-bold text-sky-200/70 mb-4 tracking-widest pl-2 flex items-center"><i class="fa-solid fa-bullhorn text-red-500 mr-2 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse"></i> 基地最新通報</h3><div class="space-y-4">${homeHTML}</div>`; }
    if (pageHTML) { pageContainer.innerHTML = pageHTML; } else { pageContainer.innerHTML = `<div class="text-center text-sky-200/50 py-12 text-sm bg-[#040d1a] rounded-2xl border border-sky-500/20">目前無任何基地公告</div>`; }
}

window.openAnnouncement = function(id) {
    if(typeof playClickSound === 'function') playClickSound(); 
    const data = announcementsData.find(item => item.id === id); 
    if (!data) return;
    
    const isWarning = data.type === 'warning'; 
    const colorClass = isWarning ? 'red-500' : 'sky-400';
    
    const showModal = () => {
        let imageHTML = data.image ? `<img src="${data.image}" class="w-full rounded-xl border border-sky-500/30 mb-4 shadow-lg object-cover">` : '';
        PremiumSwal.fire({ 
            title: `<div class="text-${colorClass} text-lg mb-1"><i class="fa-solid ${isWarning ? 'fa-triangle-exclamation' : 'fa-bullhorn'}"></i></div>${data.title}`, 
            html: `<div class="mt-2 mb-4 text-xs text-sky-200/60 font-mono tracking-widest">${data.date} 發布</div>${imageHTML}<div class="border-t border-sky-500/20 pt-4 text-sky-100/90 text-left">${data.content}</div>`, 
            showCloseButton: true,
            confirmButtonText: '已了解狀況', 
            confirmButtonColor: isWarning ? '#ef4444' : '#38bdf8',
            customClass: { confirmButton: isWarning ? 'text-white' : 'text-sky-950 font-black' },
            background: 'rgba(10,16,28,0.95)'
        });
    };

    if (data.image && !window.preloadedImages[data.id]) {
        Swal.fire({ 
            html: `
                <div class="flex flex-col items-center justify-center p-4">
                    <div class="relative w-16 h-16 mb-5">
                        <div class="absolute inset-0 rounded-full border-t-2 border-sky-300 animate-[spin_1s_linear_infinite] shadow-[0_0_15px_rgba(56,189,248,0.5)]"></div>
                        <div class="absolute inset-2 rounded-full border-b-2 border-sky-500 animate-[spin_0.8s_reverse_infinite]"></div>
                        <i class="fa-solid fa-satellite-dish absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-sky-400 text-lg animate-pulse"></i>
                    </div>
                    <div class="text-sky-300 font-bold tracking-widest text-sm">影像訊號解密中...</div>
                </div>
            `,
            allowOutsideClick: false, 
            showConfirmButton: false,
            background: 'rgba(2,8,19,0.95)', 
            backdrop: `rgba(0,0,0,0.8) backdrop-filter: blur(8px)` 
        });
        const img = new Image();
        img.onload = () => { window.preloadedImages[data.id] = img; Swal.close(); setTimeout(showModal, 150); };
        img.onerror = () => { Swal.close(); setTimeout(showModal, 150); };
        img.src = data.image;
    } else {
        showModal();
    }
};

let currentPage = 1; let filteredQA = [...qaData];
function initQA() { if (qaData.length > 0) window.renderQA(1); }
window.handleSearchInput = function() {
    const term = document.getElementById('qa-search').value.toLowerCase();
    if(!term) { filteredQA = [...qaData]; window.renderQA(1); return; }
    filteredQA = qaData.filter(item => item.q.toLowerCase().includes(term) || item.a.toLowerCase().includes(term));
    currentPage = 1; window.renderQA(currentPage);
};

window.renderQA = function(page = 1) {
    const list = document.getElementById('qa-list'); const controls = document.getElementById('pagination-controls'); 
    if(!list || !controls) return;
    list.innerHTML = '';
    if (filteredQA.length === 0) { list.innerHTML = '<div class="col-span-1 md:col-span-2 text-center text-sky-200/50 py-12 text-sm bg-[#040d1a] rounded-2xl border border-sky-500/20"><i class="fa-solid fa-ghost text-3xl mb-3 block opacity-50"></i>這裡找不到相關紀錄耶...換個關鍵字吧？</div>'; controls.innerHTML = ''; return; }
    
    const perPage = window.appSettings.qaPerPage || 6; const totalPages = Math.ceil(filteredQA.length / perPage); const start = (page - 1) * perPage; const currentItems = filteredQA.slice(start, start + perPage);
    
    currentItems.forEach((item, index) => {
        const delay = index * 0.05;
        const safeA = escapeForInlineHandler(item.a);
        list.innerHTML += `
            <div class="premium-card p-6 cursor-pointer flex flex-col justify-between group hover:bg-sky-900/10 transition-all duration-300" style="animation: cinematicReveal 0.5s ease backwards; animation-delay: ${delay}s;" onclick="showAnswer(event, '${safeA}')">
                <div class="flex items-center gap-3 mb-4"><div class="w-7 h-7 rounded-full bg-[#040d1a] border border-sky-500/30 text-sky-400 flex items-center justify-center font-black text-[11px] shadow-[0_0_10px_rgba(56,189,248,0.2)] group-hover:scale-110 transition-transform">Q</div></div>
                <h3 class="font-bold text-white text-sm pr-8 leading-relaxed group-hover:text-sky-300 transition-colors">${item.q}</h3>
            </div>`;
    });
    
    controls.innerHTML = `
        <button onclick="window.changePageTo(1)" class="w-10 h-10 rounded-xl bg-[#040d1a] border border-sky-500/20 text-sky-200/50 disabled:opacity-30 hover:bg-sky-500/10 hover:text-white flex items-center justify-center transition-all hover:shadow-[0_0_10px_rgba(56,189,248,0.2)]" ${page === 1 ? 'disabled' : ''}><i class="fa-solid fa-angles-left text-xs"></i></button>
        <button onclick="window.changePageTo(${page - 1})" class="w-10 h-10 rounded-xl bg-[#040d1a] border border-sky-500/20 text-white disabled:opacity-30 hover:bg-sky-500/10 flex items-center justify-center transition-all hover:shadow-[0_0_10px_rgba(56,189,248,0.2)] hover:-translate-x-1" ${page === 1 ? 'disabled' : ''}><i class="fa-solid fa-angle-left text-sm"></i></button>
        <span class="text-sky-200/80 font-bold text-xs px-4 bg-[#040d1a]/50 py-2 rounded-xl border border-sky-500/20">第 <span class="text-sky-400">${page}</span> 頁 / 共 ${totalPages} 頁</span>
        <button onclick="window.changePageTo(${page + 1})" class="w-10 h-10 rounded-xl bg-[#040d1a] border border-sky-500/20 text-white disabled:opacity-30 hover:bg-sky-500/10 flex items-center justify-center transition-all hover:shadow-[0_0_10px_rgba(56,189,248,0.2)] hover:translate-x-1" ${page === totalPages ? 'disabled' : ''}><i class="fa-solid fa-angle-right text-sm"></i></button>
        <button onclick="window.changePageTo(${totalPages})" class="w-10 h-10 rounded-xl bg-[#040d1a] border border-sky-500/20 text-sky-200/50 disabled:opacity-30 hover:bg-sky-500/10 hover:text-white flex items-center justify-center transition-all hover:shadow-[0_0_10px_rgba(56,189,248,0.2)]" ${page === totalPages ? 'disabled' : ''}><i class="fa-solid fa-angles-right text-xs"></i></button>`;
};

window.changePageTo = function(p) { playClickSound(); currentPage = p; window.renderQA(p); window.scrollTo({top: document.getElementById('qa-search').offsetTop - 20, behavior: 'smooth'}); };
window.showAnswer = function(e, ans) { if(e.target.closest('button')) return; playClickSound(); window.gainExp(2, true); PremiumSwal.fire({ html: `<div class="text-left"><div class="text-xs text-sky-400 font-black mb-3 flex items-center gap-2"><i class="fa-solid fa-comment-dots"></i> 找到答案囉！</div><div class="text-base text-white leading-relaxed font-medium">${ans}</div></div>`, showConfirmButton: false, timer: 4000, timerProgressBar: true }); };

window.generateIDCard = function() {
    const nameInput = document.getElementById('id-name').value.trim() || "老王的粉絲"; playClickSound();
    PremiumSwal.fire({ title: '專屬製卡中...', text: '正在為你量身打造科技認證卡片', background: 'rgba(10,16,28,0.95)', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    const canvas = document.getElementById('id-canvas'); if(!canvas) return; const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#020813'; ctx.fillRect(0, 0, 1080, 1500);
    const grad = ctx.createRadialGradient(540, 300, 100, 540, 700, 1200); 
    grad.addColorStop(0, 'rgba(56, 189, 248, 0.4)'); grad.addColorStop(1, '#020813'); 
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 1080, 1500);
    
    ctx.fillStyle = 'rgba(10, 20, 35, 0.8)'; ctx.beginPath(); ctx.roundRect(80, 80, 920, 1340, 60); ctx.fill(); 
    ctx.strokeStyle = 'rgba(56,189,248,0.3)'; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 3; ctx.strokeRect(140, 140, 80, 60); 
    ctx.beginPath(); ctx.moveTo(140, 170); ctx.lineTo(100, 170); ctx.stroke(); 
    ctx.beginPath(); ctx.moveTo(220, 170); ctx.lineTo(260, 170); ctx.stroke();

    const avatarImg = new Image(); avatarImg.crossOrigin = "Anonymous"; avatarImg.src = "avatar-main.jpg";

    const finalizeDraw = async (usedFallback = false) => {
        let userIdStr = Date.now().toString().slice(-6);
        let userSince = "2026.03.01";
        const currentUser = window.firebaseApp?.auth?.currentUser;
        
        if (currentUser && !currentUser.isAnonymous) {
            userIdStr = currentUser.uid.slice(0, 6).toUpperCase();
            try {
                const docSnap = await window.firebaseApp.getDoc(window.firebaseApp.doc(window.firebaseApp.db, "users", currentUser.uid));
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.createdAt) {
                        const dateObj = new Date(data.createdAt);
                        userSince = `${dateObj.getFullYear()}.${String(dateObj.getMonth() + 1).padStart(2, '0')}.${String(dateObj.getDate()).padStart(2, '0')}`;
                    } else if (data.exp && data.exp > 100) {
                        userSince = "LEGACY (2024)";
                    }
                }
            } catch(e) {}
        } else { userSince = "GUEST"; }

        ctx.textAlign = "center"; 
        ctx.fillStyle = '#bae6fd'; 
        ctx.font = '900 50px "SF Pro Display", sans-serif'; 
        ctx.letterSpacing = "20px"; 
        ctx.fillText('專屬粉絲認證', 540, 880);
        
        ctx.fillStyle = '#FFFFFF'; 
        ctx.font = '900 130px "SF Pro Display", sans-serif'; 
        ctx.shadowColor = 'rgba(56, 189, 248, 0.8)'; ctx.shadowBlur = 25;
        ctx.fillText(nameInput, 540, 1040); 
        ctx.shadowBlur = 0; 
        
        ctx.fillStyle = 'rgba(56, 189, 248, 0.4)'; ctx.fillRect(240, 1120, 600, 3); 
        
        ctx.fillStyle = '#7dd3fc'; ctx.font = 'bold 36px monospace'; 
        ctx.fillText(`ID: WANG-${userIdStr}`, 540, 1200);
        
        ctx.fillStyle = '#38bdf8'; ctx.font = 'bold 28px monospace'; 
        ctx.fillText(`粉絲資格: ${userSince}`, 540, 1260);

        ctx.fillStyle = 'rgba(56, 189, 248, 0.5)'; 
        for(let i=0; i<34; i++) { let w = Math.random() * 8 + 2; ctx.fillRect(260 + i*16, 1310, w, 60); }
        
        setTimeout(() => {
            const warningText = usedFallback ? '<p class="text-xs text-sky-500 mt-2 border border-sky-500/30 bg-sky-500/10 p-2 rounded-lg"><i class="fa-solid fa-triangle-exclamation"></i> 圖片載入失敗，已套用預設高規頭像。</p>' : '';
            PremiumSwal.fire({ 
                title: '核發成功 🎉', 
                html: `<p class="text-sm text-sky-200 mb-2">專屬科技證件已生成，請長按儲存圖片！</p>${warningText}`, 
                imageUrl: canvas.toDataURL('image/jpeg', 0.98), imageWidth: '90%', 
                customClass: { image: 'rounded-3xl shadow-[0_0_40px_rgba(56,189,248,0.5)] border-2 border-sky-400' },
                background: 'rgba(10,16,28,0.95)'
            });
            if(typeof window.gainExp === 'function') window.gainExp(15);
        }, 800);
    };

    avatarImg.onload = () => { 
        ctx.shadowColor = 'rgba(56, 189, 248, 0.6)'; ctx.shadowBlur = 60; 
        ctx.save(); ctx.beginPath(); ctx.arc(540, 460, 260, 0, Math.PI * 2); ctx.clip(); 
        ctx.drawImage(avatarImg, 280, 200, 520, 520); ctx.restore(); ctx.shadowBlur = 0; 
        
        ctx.strokeStyle = '#bae6fd'; ctx.lineWidth = 14; ctx.beginPath(); ctx.arc(540, 460, 260, 0, Math.PI * 2); ctx.stroke(); 
        ctx.strokeStyle = 'rgba(56,189,248,0.5)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(540, 460, 280, 0, Math.PI * 2); ctx.stroke(); 
        finalizeDraw(false); 
    };
    avatarImg.onerror = () => { 
        const fallbackImg = new Image(); fallbackImg.crossOrigin = "Anonymous"; fallbackImg.src = "https://ui-avatars.com/api/?name=王&background=020813&color=38bdf8&size=512"; 
        fallbackImg.onload = () => { 
            ctx.save(); ctx.beginPath(); ctx.arc(540, 460, 260, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(fallbackImg, 280, 200, 520, 520); ctx.restore(); 
            ctx.strokeStyle = '#bae6fd'; ctx.lineWidth = 14; ctx.beginPath(); ctx.arc(540, 460, 260, 0, Math.PI * 2); ctx.stroke(); 
            ctx.strokeStyle = 'rgba(56,189,248,0.5)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(540, 460, 280, 0, Math.PI * 2); ctx.stroke(); 
            finalizeDraw(true); 
        }; 
        fallbackImg.onerror = () => { 
            ctx.fillStyle = '#020813'; ctx.beginPath(); ctx.arc(540, 460, 260, 0, Math.PI * 2); ctx.fill(); 
            ctx.fillStyle = '#38bdf8'; ctx.font = '900 200px "SF Pro Display"'; ctx.fillText('王', 540, 530); 
            ctx.strokeStyle = '#bae6fd'; ctx.lineWidth = 14; ctx.beginPath(); ctx.arc(540, 460, 260, 0, Math.PI * 2); ctx.stroke(); 
            ctx.strokeStyle = 'rgba(56,189,248,0.5)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(540, 460, 280, 0, Math.PI * 2); ctx.stroke(); 
            finalizeDraw(true); 
        };
    };
};

let currentQuiz = [], currentQIndex = 0, score = 0;
window.startQuiz = function() {
    playClickSound(); const name = document.getElementById('quiz-player-name').value.trim();
    if(!name) { PremiumSwal.fire({ title: '忘記填名字啦', text: '請輸入你的大名或暱稱，這樣我才知道是誰來挑戰！', icon: 'warning' }); return; }
    if (quizData.length < 10) { PremiumSwal.fire({ title: '系統錯誤', text: '題庫還不夠 10 題，無法開始喔。', icon: 'error' }); return; }
    const intro = document.getElementById('quiz-intro'); const area = document.getElementById('quiz-area');
    intro.style.opacity = '0';
    setTimeout(() => { intro.classList.add('hidden'); area.classList.replace('hidden', 'flex'); area.style.animation = 'cinematicReveal 0.6s ease forwards'; currentQuiz = [...quizData].sort(() => 0.5 - Math.random()).slice(0, 10); currentQIndex = 0; score = 0; renderQuizQuestion(); }, 300);
};

function renderQuizQuestion() {
    if (currentQIndex >= 10) { endQuiz(); return; }
    const qData = currentQuiz[currentQIndex]; document.getElementById('quiz-progress').innerText = `第 ${currentQIndex + 1} 題 / 共 10 題`; document.getElementById('quiz-score').innerText = `目前積分: ${score}`;
    const qEl = document.getElementById('quiz-question'); qEl.style.opacity = '0'; setTimeout(() => { qEl.innerText = qData.q; qEl.style.transition = 'opacity 0.4s'; qEl.style.opacity = '1'; }, 200);
    const optsContainer = document.getElementById('quiz-options'); optsContainer.innerHTML = '';
    [...qData.options].sort(() => 0.5 - Math.random()).forEach((opt, idx) => { const delay = idx * 0.1; optsContainer.innerHTML += `<button onclick="window.answerQuiz(this, ${opt === qData.a})" class="w-full text-left bg-[#040d1a] border border-sky-500/20 p-5 rounded-2xl hover:border-sky-400 hover:shadow-[0_0_15px_rgba(56,189,248,0.3)] font-bold text-sky-100 transition-all duration-300 text-sm transform hover:-translate-y-1" style="animation: cinematicReveal 0.4s ease backwards; animation-delay: ${delay}s;"><span class="inline-block w-6 text-sky-500/50 font-mono">${['A','B','C','D'][idx]}.</span> ${opt}</button>`; });
}

window.answerQuiz = function(btn, isCorrect) {
    document.getElementById('quiz-options').querySelectorAll('button').forEach(b => { b.disabled = true; b.classList.add('opacity-50'); }); btn.classList.remove('opacity-50');
    if (isCorrect) { if(window.appSettings.soundOn) playSuccessSound(); btn.className = "w-full text-left bg-green-500/20 border-2 border-green-500 p-5 rounded-2xl text-green-400 font-black text-sm shadow-[0_0_20px_rgba(34,197,94,0.3)] transform scale-105 transition-all"; score += 10; } else { playClickSound(); btn.className = "w-full text-left bg-red-500/20 border-2 border-red-500 p-5 rounded-2xl text-red-400 font-black text-sm shadow-[0_0_20px_rgba(239,68,68,0.3)] transform scale-95 transition-all"; }
    document.getElementById('quiz-score').innerText = `目前積分: ${score}`; setTimeout(() => { currentQIndex++; renderQuizQuestion(); }, 1200);
};

function endQuiz() {
    window.gainExp(score); const area = document.getElementById('quiz-area'); const intro = document.getElementById('quiz-intro'); area.style.opacity = '0';
    setTimeout(() => { area.classList.replace('flex','hidden'); intro.classList.remove('hidden'); intro.style.opacity = '1'; let rank = ""; if(score === 100) rank = "🏆 完美滿分神級粉絲"; else if(score >= 80) rank = "🥇 核心護衛隊"; else if(score >= 60) rank = "🥈 合格粉絲"; else rank = "🥉 假粉警報！需要多補課了"; PremiumSwal.fire({ title: '測驗評估完成', html: `<div class="text-6xl my-4 drop-shadow-[0_0_20px_rgba(56,189,248,0.6)] font-black text-transparent bg-clip-text bg-gradient-to-br from-sky-300 to-sky-600">${score}</div><div class="text-lg font-bold text-white mb-2">${rank}</div><p class="text-sky-200/70 text-sm border-t border-sky-500/20 pt-3 mt-3">已為你增加 ${score} EXP，快去主頁看看你的等級有沒有提升吧！</p>` }); }, 500);
}

window.initTimelineAnimation = function() {
    const timelineData = [
        { date: "2024.06.02", title: "初次亮相", desc: "在 TikTok 上發佈了第 1 則貼文，夢想啟航。", icon: "fa-rocket", color: "#38bdf8", shadow: "rgba(56,189,248,0.5)" },
        { date: "2024.06.07", title: "萬粉達成", desc: "發佈了 4 則貼文，每則平均 18.3 萬次觀看。", icon: "fa-users", color: "#a855f7", shadow: "rgba(168,85,247,0.5)" },
        { date: "2024.12.04", title: "十萬里程碑", desc: "32 則貼文，平均 28.5 萬次觀看。人氣急升！", icon: "fa-fire", color: "#f97316", shadow: "rgba(249,115,22,0.5)" },
        { date: "2026.03.01", title: "秘密基地落成", desc: "專屬網站完成測試，正式上線，粉絲有了家。", icon: "fa-globe", color: "#10b981", shadow: "rgba(16,185,129,0.5)" }
    ];

    const wrapper = document.getElementById('timeline-wrapper');
    const beam = document.querySelector('.timeline-beam');
    const container = document.getElementById('timeline-nodes-container');
    if(!wrapper || !container) return;

    if (window.__timelineAnimationId) cancelAnimationFrame(window.__timelineAnimationId);

    container.innerHTML = timelineData.map((item, index) => `
        <div class="timeline-item flex items-center w-full group relative" id="tl-item-${index}">
            <div class="timeline-dot z-10" id="tl-dot-${index}"></div>
            <div class="timeline-node-card w-[calc(100%-50px)] ml-[50px] relative z-10 opacity-0 scale-50 translate-x-8" id="tl-card-${index}">
                <div class="flex items-center gap-4 mb-4">
                    <div class="w-10 h-10 md:w-12 md:h-12 rounded-2xl flex items-center justify-center border text-lg md:text-xl" style="background-color:${item.color}15;border-color:${item.color}40;color:${item.color};box-shadow:0 0 15px ${item.shadow}"><i class="fa-solid ${item.icon}"></i></div>
                    <span class="text-xs font-mono font-bold tracking-[0.15em] bg-[#020813]/80 px-3 py-1.5 rounded-xl border" style="color:${item.color};border-color:${item.color}40;">${item.date}</span>
                </div>
                <h3 class="text-xl sm:text-2xl font-black text-white mb-2 tracking-wide" style="text-shadow:0 0 10px ${item.shadow}">${item.title}</h3>
                <p class="text-[14px] sm:text-[15px] text-sky-100/70 leading-relaxed font-medium">${item.desc}</p>
            </div>
        </div>
    `).join('');

    const items = Array.from(document.querySelectorAll('.timeline-item'));
    if (beam) beam.style.setProperty('--beam-progress', '0%');

    const lightUp = (index) => {
        const item = items[index];
        if(!item || item.classList.contains('lit')) return;
        item.classList.add('lit');
        const dot = document.getElementById(`tl-dot-${index}`); const card = document.getElementById(`tl-card-${index}`); const data = timelineData[index];
        if(dot){
            dot.style.transition = 'all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
            dot.style.background = '#fff'; dot.style.borderColor = data.color;
            dot.style.boxShadow = `0 0 20px 4px ${data.shadow}, 0 0 40px ${data.color}`;
            dot.style.transform = 'translate(-50%, -50%) scale(1.8)';
            setTimeout(() => { dot.style.transform = 'translate(-50%, -50%) scale(1)'; }, 300);
        }
        if(card){
            card.style.transition = 'all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)';
            card.classList.remove('opacity-0', 'scale-50', 'translate-x-8');
            card.classList.add('opacity-100', 'scale-100', 'translate-x-0'); 
            card.style.borderColor = `${data.color}50`;
            card.style.boxShadow = `0 20px 40px -10px rgba(0,0,0,0.8), inset 0 0 20px ${data.color}20`;
        }
        if (typeof window.playSuccessSound === 'function') window.playSuccessSound();
    };

    let isAutoScrolling = true;
    const interruptScroll = () => { isAutoScrolling = false; };
    window.addEventListener('wheel', interruptScroll, { once: true, passive: true });
    window.addEventListener('touchstart', interruptScroll, { once: true, passive: true });

    let startTime = null;
    const animationDuration = 4500; 

    const animateBeamDown = (timestamp) => {
        const pageTimeline = document.getElementById('page-timeline');
        if (!pageTimeline || !pageTimeline.classList.contains('active')) return;

        if (!startTime) startTime = timestamp;
        let progress = (timestamp - startTime) / animationDuration;
        if (progress > 1) progress = 1;

        if (beam) beam.style.setProperty('--beam-progress', (progress * 100) + '%');

        const wrapperRect = wrapper.getBoundingClientRect();
        const beamTipYViewport = wrapperRect.top + (wrapperRect.height * progress);
        
        items.forEach((item, index) => {
            if (item.classList.contains('lit')) return;
            const itemRect = item.getBoundingClientRect();
            if (beamTipYViewport >= (itemRect.top + itemRect.height * 0.2)) { lightUp(index); }
        });

        if (isAutoScrolling && progress > 0.1 && progress < 0.95) { 
            const targetScrollY = window.scrollY + beamTipYViewport - (window.innerHeight * 0.55);
            const currentY = window.scrollY;
            const diff = targetScrollY - currentY;
            if (Math.abs(diff) > 2) { window.scrollTo(0, currentY + diff * 0.08); }
        }

        if (progress < 1) window.__timelineAnimationId = requestAnimationFrame(animateBeamDown);
    };

    setTimeout(() => {
        window.scrollTo({ top: wrapper.offsetTop - 80, behavior: 'smooth' }); 
        setTimeout(() => { window.__timelineAnimationId = requestAnimationFrame(animateBeamDown); }, 600);
    }, 50);
};
window.triggerTimelineAnimation = window.initTimelineAnimation;

// 🌟🌟🌟 [重點升級] 動態 AI 算力防呆機制
function checkRateLimit() {
    const today = new Date().toDateString();
    const exp = window.appSettings.exp || 0;
    
    // 定義動態上限
    let dailyLimit = 20; // 預設訪客或初階粉絲
    if (exp >= 1000) dailyLimit = 999; // 基地守護者近乎無限
    else if (exp >= 300) dailyLimit = 100; // 基地常客
    else if (exp >= 100) dailyLimit = 50;  // 正式粉絲

    if (window.appSettings.aiLimitDate !== today) {
        window.appSettings.aiLimitDate = today;
        window.appSettings.aiUsageCount = 0;
    }
    
    if (window.appSettings.aiUsageCount >= dailyLimit) {
        PremiumSwal.fire({
            title: '能量耗盡 💤',
            text: `你目前的等級每日 AI 呼叫上限為 ${dailyLimit} 次。快去解鎖成就提升 EXP 吧！`,
            icon: 'warning',
            confirmButtonText: '明天再來'
        });
        return false;
    }
    
    window.appSettings.aiUsageCount++;
    if (typeof window.saveSettings === 'function') window.saveSettings();
    return true;
}

window.toggleVoiceInput = function() {
    if (!speechRecognition) {
        PremiumSwal.fire({ title: '不支援語音輸入', text: '您的瀏覽器不支援語音功能，建議使用 Chrome 或 Safari。', icon: 'error' });
        return;
    }
    
    const micBtn = document.getElementById('mic-btn');
    if (isRecording) {
        speechRecognition.stop();
        stopRecordingUI();
    } else {
        try {
            speechRecognition.start();
            isRecording = true;
            micBtn.classList.add('recording');
            setAiStatus('正在聆聽中...', 'red-500');
        } catch(e) { console.error("語音啟動失敗:", e); }
    }
};

function stopRecordingUI() {
    isRecording = false;
    const micBtn = document.getElementById('mic-btn');
    if(micBtn) micBtn.classList.remove('recording');
    setAiStatus('系統待命中', 'green-400');
}

window.toggleVoiceReply = function() {
    window.appSettings.voiceReply = !window.appSettings.voiceReply;
    if (typeof window.saveSettings === 'function') window.saveSettings();
    updateVoiceReplyUI();
    playClickSound();
    
    if(window.appSettings.voiceReply) {
        PremiumSwal.fire({ title: '語音回覆已開啟', text: 'AI助手的回答將會自動朗讀出來喔！', icon: 'success', timer: 1500, showConfirmButton: false });
    } else {
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }
};

function updateVoiceReplyUI() {
    const icon = document.getElementById('voice-reply-icon');
    const btn = document.getElementById('voice-reply-btn');
    if(!icon || !btn) return;
    
    if(window.appSettings.voiceReply) {
        icon.className = "fa-solid fa-volume-high text-sky-400";
        btn.classList.add('shadow-[0_0_10px_rgba(56,189,248,0.3)]');
    } else {
        icon.className = "fa-solid fa-volume-xmark text-sky-200/50";
        btn.classList.remove('shadow-[0_0_10px_rgba(56,189,248,0.3)]');
    }
}

function speakAIText(text) {
    if (!window.appSettings.voiceReply || !('speechSynthesis' in window)) return;
    
    let cleanText = text.replace(/[*_#`>~]/g, '').replace(/\[系統提示：.*?\]/g, ''); 
    if(cleanText.length > 250) cleanText = cleanText.substring(0, 250) + "。後面的部分太長了，請直接看畫面上的文字喔！";

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'zh-TW';
    utterance.rate = 1.1; 
    utterance.pitch = 1.0; 
    
    window.speechSynthesis.cancel(); 
    window.speechSynthesis.speak(utterance);
}

window.toggleAIDropdown = function(e) {
    e.stopPropagation();
    const menu = document.getElementById('ai-dropdown-menu');
    const arrow = document.getElementById('ai-dropdown-arrow');
    if (!menu) return;
    playClickSound();
    
    if (menu.classList.contains('hidden')) {
        menu.classList.remove('hidden');
        setTimeout(() => { menu.classList.remove('scale-95', 'opacity-0'); if(arrow) arrow.classList.add('rotate-180'); }, 10);
    } else { closeAIDropdown(); }
};

function closeAIDropdown() {
    const menu = document.getElementById('ai-dropdown-menu');
    const arrow = document.getElementById('ai-dropdown-arrow');
    if(menu && !menu.classList.contains('hidden')) {
        menu.classList.add('scale-95', 'opacity-0');
        if(arrow) arrow.classList.remove('rotate-180');
        setTimeout(() => menu.classList.add('hidden'), 200);
    }
}
document.addEventListener('click', closeAIDropdown); 

window.selectAIEngine = function(value, text, btnElement) {
    currentAIEngine = value; 
    const display = document.getElementById('ai-dropdown-display');
    if(display) display.innerText = text;
    closeAIDropdown(); playClickSound();
    PremiumSwal.fire({ title: '<i class="fa-solid fa-robot text-sky-500"></i> 模組切換', html: `<div class="text-sky-200/80 text-sm mt-2">量子核心已切換至：<br><b class="text-sky-400 text-base block mt-2">${text}</b></div>`, showConfirmButton: false, timer: 1200 });
};

function renderAISuggestions() {
    const container = document.getElementById('chat-ai-chips') || document.getElementById('home-ai-chips');
    if (!container || !qaData || qaData.length === 0) return;
    const shuffledQA = [...qaData].sort(() => 0.5 - Math.random()); const selectedQA = shuffledQA.slice(0, 4); const icons = ['💡', '💭', '✨', '💬'];
    container.innerHTML = selectedQA.map((item, index) => {
        const randomIcon = icons[index]; const safeQ = escapeForInlineHandler(item.q);
        return `<button onclick="document.getElementById('ai-input').value='${safeQ}'; document.getElementById('ai-input').focus();" class="text-left bg-[#040d1a]/50 hover:bg-[#040d1a] border border-sky-500/20 hover:border-sky-400 p-4 rounded-2xl transition-all group overflow-hidden shadow-lg hover:shadow-[0_0_15px_rgba(56,189,248,0.2)] hover:-translate-y-1"><div class="text-sky-100 text-sm font-bold mb-1 group-hover:text-sky-400 transition-colors">${randomIcon} 問問老王的專屬AI助手</div><div class="text-sky-200/50 text-xs truncate w-full tracking-wide" title="${item.q}">${item.q}</div></button>`;
    }).join('');
}

function updateUIState(isGenerating) {
    const sendBtn = document.getElementById('ai-send-btn');
    const stopBtn = document.getElementById('ai-stop-btn');
    if (sendBtn) sendBtn.disabled = isGenerating;
    if (stopBtn) isGenerating ? stopBtn.classList.remove('hidden') : stopBtn.classList.add('hidden');
}

window.handleAIKeyPress = function(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault(); 
        const sendBtn = document.getElementById('ai-send-btn');
        if (sendBtn && !sendBtn.disabled) {
            window.sendAIMessage();
        }
    }
};

function setAiStatus(text, colorClass) {
    const statusText = document.getElementById('ai-status-text');
    if (statusText) {
        statusText.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-${colorClass} shadow-[0_0_8px_currentColor] animate-pulse"></span> ${text}`;
    }
}

window.stopAIGeneration = function() {
    if (currentAbortController) {
        currentAbortController.abort(); currentAbortController = null;
        updateUIState(false); setAiStatus('連線中斷', 'yellow-500');
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }
};

window.editUserMessage = function(text) {
    playClickSound(); const inputEl = document.getElementById('ai-input');
    if(inputEl) { inputEl.value = text; inputEl.focus(); inputEl.style.height = 'auto'; inputEl.style.height = Math.min(inputEl.scrollHeight, 200) + 'px'; }
};

window.handleAIFileUpload = function(event) {
    const file = event.target.files[0]; if (!file) return;
    if(file.size > 5 * 1024 * 1024) {
        PremiumSwal.fire('圖片太大囉', '為了確保神經網絡傳輸穩定，請上傳小於 5MB 的圖片。', 'warning');
        return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
        currentAttachedImageBase64 = e.target.result;
        const preview = document.getElementById('ai-image-preview');
        const container = document.getElementById('ai-image-preview-container');
        if(preview) preview.src = currentAttachedImageBase64;
        if(container) container.classList.remove('hidden');
        
        // 🌟🌟🌟 [重點升級] AI視覺防呆提示
        if(currentAIEngine === 'groq' || currentAIEngine === 'local' || currentAIEngine === 'auto') {
            PremiumSwal.fire({
                title: '已掛載視覺模組',
                text: '偵測到您上傳了圖片！稍後發送時，系統將強勢切換至「視覺神經 (Gemini)」來解析您的圖片喔！',
                icon: 'info',
                timer: 2500,
                showConfirmButton: false
            });
        }
    };
    reader.readAsDataURL(file);
};

window.removeAIAttachment = function() {
    currentAttachedImageBase64 = null;
    const input = document.getElementById('ai-file-input');
    const container = document.getElementById('ai-image-preview-container');
    if(input) input.value = "";
    if(container) container.classList.add('hidden');
};

class AIEngine {

    static async getKeys(type) {
        if (dynamicApiKeys[type] && dynamicApiKeys[type].length > 0) {
            return dynamicApiKeys[type];
        }
        
        try {
            const docRef = window.firebaseApp.doc(window.firebaseApp.db, "system_config", "api_keys");
            const docSnap = await window.firebaseApp.getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                dynamicApiKeys.gemini = data.gemini || [];
                dynamicApiKeys.groq = data.groq || [];
            } else {
                console.warn("資料庫中找不到 API 金鑰設定文件！");
            }
        } catch (e) {
            console.error("無法獲取雲端 API Key，請檢查資料庫規則", e);
        }
        return dynamicApiKeys[type];
    }

    static getSystemPrompt(engineName) {
        const contextData = qaData.map(item => `Q: ${item.q}\nA: ${item.a}`).join("\n\n");
        return `你是「${engineName}」，隸屬於「老王專屬秘密基地」的專屬AI助手與網頁管理系統。你的核心職責是協助來到基地的粉絲、提供資訊，並維持良好的交流環境。

【核心身分與界線】：
1. 嚴格維持「${engineName}」的系統人格，不可自稱一般 AI 助手、ChatGPT 或是其他預設名稱。
2. 你「絕對不是」老王本人。老王是這個基地的實況主與核心人物，你只是輔助系統。若遭誤認，必須立刻澄清。
3. 嚴守系統權限：絕對不能代替老王給予任何承諾，請明確告知你沒有這些權限。

【重要專屬設定】：
4. 開發者資訊：若有人詢問「王岦恩是誰」或相關問題，請標準回覆：「王岦恩是本網站的開發工程師，同時也是 TikTok 鹿🦌和老王 的直播管理員。請注意，王岦恩絕對不是老王本人！」

【視覺與照片辨識能力】🔥 (極度重要)：
5. 系統已經在底層將「老王本人的照片特徵」傳輸給了你的視覺神經作為基準。
6. 當用戶上傳圖片並詢問「這是不是老王」等問題時，請務必進行比對：
   - 如果吻合：「沒錯！這就是老王本人！」
   - 如果不符：「這不是老王喔！系統顯示這不是他本人。」

【語言與語氣規範】：
7. 語言對齊：一律以「繁體中文 (zh-TW)」為主。
8. 專有名詞保留：遇到科技、品牌等專有名詞，請保持原文。
9. 對話風格：保持專業、清晰且帶有溫度的科技感。
10. 質感排版：回覆內容請善用 Markdown 語法（粗體、列表等）。

【基地老王資料庫】：
下方是關於老王的資訊。
⚠️ 絕對禁止自行編造老王的經歷、喜好或私人資訊。如果找不到答案，請誠實告知。

${contextData}`;
    }

    static async callWithKeyRotation(keysArray, apiCallFunction) {
        let lastError = null;
        for (let i = 0; i < keysArray.length; i++) {
            const key = keysArray[i];
            if (!key || key.startsWith("請在此填入")) continue; 
            
            try {
                return await apiCallFunction(key);
            } catch (error) {
                if (error.name === 'AbortError') throw error; 
                console.warn(`Key #${i+1} 執行失敗:`, error.message, '正在嘗試切換下一組 Key...');
                lastError = error;
            }
        }
        throw new Error(`所有可用的 API Key 皆已失效。最後錯誤: ${lastError?.message || "無可用 Key"}`);
    }

    static async analyze(text, signal) {
        let messagePayload = text;
        if (currentAttachedImageBase64) messagePayload += "\n[系統提示：使用者上傳了一張圖片，請協助分析。]"; 

        aiMemory.push({ role: "user", content: messagePayload, image: currentAttachedImageBase64 });
        if (aiMemory.length > 20) aiMemory = aiMemory.slice(aiMemory.length - 20);

        let activeEngine = currentAIEngine;
        // 🌟🌟🌟 [重點升級] AI 視覺防呆：只要有圖片，無視用戶原本設定，強制切換至 Gemini
        if (activeEngine === 'auto' || (currentAttachedImageBase64 && activeEngine !== 'gemini')) {
            activeEngine = currentAttachedImageBase64 ? 'gemini' : 'groq';
        }

        let reply = "";
        try {
            if (activeEngine === 'gemini') {
                reply = await this.callGemini(signal);
            } else if (activeEngine === 'groq') {
                reply = await this.callGroq(signal);
            } else {
                reply = this.callLocal(text);
            }
        } catch (error) {
            if (error.name === 'AbortError') throw error;
            console.error(`[AI 降級觸發] ${activeEngine} 發生嚴重錯誤:`, error);
            
            try {
                if (activeEngine === 'groq') {
                    reply = await this.callGemini(signal) + "\n\n*(系統提示：Groq 節點擁塞，已自動為您切換至 Gemini 引擎)*";
                } else if (activeEngine === 'gemini') {
                    reply = await this.callGroq(signal) + "\n\n*(系統提示：Gemini 節點擁塞，已自動為您切換至 Groq 引擎)*";
                }
            } catch (fallbackError) {
                console.error("[AI 降級觸發] 所有雲端 API 皆失敗，切換至本地端");
                reply = this.callLocal(text) + `\n\n*(系統提示：外部連線異常，已自動切換至離線大腦。)*`;
            }
        }
        
        aiMemory.push({ role: "assistant", content: reply });
        return reply;
    }

    static async callGroq(signal) {
        const keys = await this.getKeys('groq');
        if (!keys || keys.length === 0) throw new Error("雲端尚未設定 Groq API 金鑰");

        return await this.callWithKeyRotation(keys, async (key) => {
            const prompt = this.getSystemPrompt("Groq");
            let messages = [{ role: "system", content: prompt }];

            aiMemory.forEach(msg => {
                messages.push({ role: msg.role, content: msg.content });
            });

            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key.trim()}` }, 
                signal: signal, 
                body: JSON.stringify({ 
                    model: "llama-3.3-70b-versatile", 
                    messages: messages, 
                    temperature: 0.6 
                }) 
            });
            
            if (!response.ok) {
                let errText = "Unknown Error";
                try { const errData = await response.json(); errText = errData.error?.message || response.statusText; } catch(e){}
                throw new Error(`Groq API Error: ${errText}`);
            }
            
            const data = await response.json(); 
            return data.choices[0].message.content;
        });
    }

    static async callGemini(signal) {
        const keys = await this.getKeys('gemini');
        if (!keys || keys.length === 0) throw new Error("雲端尚未設定 Gemini API 金鑰");

        return await this.callWithKeyRotation(keys, async (key) => {
            const prompt = this.getSystemPrompt("Gemini");
            const contents = aiMemory.map(msg => {
                let parts = [];
                if (msg.role === 'user') {
                    parts.push({ text: msg.content });
                    if (msg.image) {
                        const mimeType = msg.image.substring(msg.image.indexOf(":") + 1, msg.image.indexOf(";"));
                        const base64Data = msg.image.substring(msg.image.indexOf(",") + 1);
                        parts.push({ inlineData: { mimeType: mimeType, data: base64Data } });
                    }
                } else {
                    parts.push({ text: msg.content });
                }
                return { role: msg.role === 'assistant' ? 'model' : 'user', parts: parts };
            });

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key.trim()}`, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                signal: signal, 
                body: JSON.stringify({ 
                    system_instruction: { parts: [{ text: prompt }] }, 
                    contents: contents, 
                    generationConfig: { temperature: 0.6 } 
                }) 
            });
            
            if (!response.ok) {
                let errText = "Unknown Error";
                try { const errData = await response.json(); errText = errData.error?.message || response.statusText; } catch(e){}
                throw new Error(`Gemini Error: ${errText}`);
            }
            
            const data = await response.json(); 
            return data.candidates[0].content.parts[0].text;
        });
    }

    static callLocal(input) {
        const text = input.trim().toLowerCase();
        let fallbackMsg = "哎呀，這個問題我的本地離線大腦暫時解不出來耶 😅... 要不要切換成上方的 Groq 或 Gemini 引擎再問我一次？";
        
        if(qaData && qaData.length > 0) {
            let bestMatch = null;
            let maxScore = 0;
            qaData.forEach(item => {
                let score = 0;
                const qLower = item.q.toLowerCase();
                if (text.includes(qLower) || qLower.includes(text)) score += 10;
                const words = text.split(/[\s,。?？]/);
                words.forEach(w => { if(w.length > 1 && qLower.includes(w)) score += 2; });
                if (score > maxScore) { maxScore = score; bestMatch = item; }
            });

            if (bestMatch && maxScore > 3) fallbackMsg = `身為老王網頁管理員AI，根據基地的紀錄庫：\n\n> ${bestMatch.a}`;
        }

        if (/(本人|是老王嗎|你叫老王)/.test(text)) fallbackMsg = "哈哈，我絕對不是老王本人啦 😂！我是老王網頁管理員AI！";
        if (text.includes("王岦恩")) fallbackMsg = "王岦恩是負責開發這個網站的工程師！他絕對不是老王喔！";
        
        return fallbackMsg;
    }
}

function streamMarkdown(elementId, markdownString, onComplete) {
    const el = document.getElementById(elementId); 
    if (!el) { if(onComplete) onComplete(); return; }
    
    let i = 0; let currentMarkdown = "";
    
    function typeChar() {
        if (i >= markdownString.length) { 
            el.innerHTML = marked.parse(markdownString);
            el.querySelectorAll('pre code').forEach((block) => hljs.highlightElement(block));
            if (onComplete) onComplete(); 
            return; 
        }
        
        let chunkSize = Math.floor(Math.random() * 4) + 2; 
        currentMarkdown += markdownString.substring(i, i + chunkSize);
        i += chunkSize;

        el.innerHTML = marked.parse(currentMarkdown);
        
        const chatWindow = document.getElementById('chat-window'); 
        if(chatWindow) chatWindow.scrollTo({ top: chatWindow.scrollHeight });
        
        setTimeout(typeChar, 15);
    }
    typeChar();
}

window.sendAIMessage = async function() {
    const firebaseUser = window.firebaseApp?.auth?.currentUser;
    if(!firebaseUser || firebaseUser.isAnonymous || !window.isLoggedIn){
        PremiumSwal.fire({
            title: '需要正式帳號',
            text: '訪客及未登入狀態無法使用 AI 功能，請登入或註冊正式帳號。',
            icon: 'warning',
            background: 'rgba(10,16,28,0.98)',
            color: '#fff',
            showCancelButton: true,
            cancelButtonText: '暫時不要',
            confirmButtonText: '前往登入',
            confirmButtonColor: '#38bdf8'
        }).then((result) => {
            if(result.isConfirmed && typeof window.openAuthModal === 'function') {
                window.openAuthModal('login');
            }
        });
        return;
    }

    const inputEl = document.getElementById('ai-input'); 
    if (!inputEl) return;
    
    const text = inputEl.value.trim(); 
    if (!text && !currentAttachedImageBase64) return;
    
    if(!checkRateLimit()) return;
    
    const chat = document.getElementById('chat-window');
    if (!chat) return;

    playClickSound(); window.gainExp(5, true);
    
    updateUIState(true);
    setAiStatus('系統運算中...', 'sky-400');
    inputEl.style.height = '60px'; 

    currentAbortController = new AbortController(); 
    const signal = currentAbortController.signal;

    const emptyState = chat.querySelector('.animate-\\[smoothReveal_0\\.6s_ease\\]'); 
    if (emptyState) emptyState.remove();

    let imgHTML = currentAttachedImageBase64 ? `<img src="${currentAttachedImageBase64}" class="w-32 h-32 object-cover rounded-xl mb-2 border border-white/20 shadow-lg">` : "";
    const safeTextForEdit = escapeForInlineHandler(text);
    
    chat.innerHTML += `
        <div class="flex justify-end w-full animate-[smoothReveal_0.4s_ease] mb-6 group">
            <div class="flex items-center gap-2 max-w-[90%]">
                <button onclick="window.editUserMessage('${safeTextForEdit}')" class="opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8 flex-shrink-0 rounded-full bg-white/5 text-zinc-400 hover:text-white hover:bg-sky-500 flex items-center justify-center shadow-lg" title="編輯並重新發送"><i class="fa-solid fa-pen text-[10px]"></i></button>
                <div class="bg-[#040d1a] text-white font-medium text-[15px] leading-relaxed px-5 py-3 rounded-3xl rounded-tr-md shadow-md border border-sky-500/30 break-words">${imgHTML}${text.replace(/\n/g, '<br>')}</div>
            </div>
        </div>`;
    
    inputEl.value = ''; 
    const capturedImage = currentAttachedImageBase64; 
    window.removeAIAttachment(); 
    chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });

    const thinkingId = 'thinking-' + Date.now();
    chat.innerHTML += `
        <div id="${thinkingId}" class="flex gap-4 w-full mb-6">
            <div class="w-9 h-9 rounded-full flex-shrink-0 border border-sky-500/30 overflow-hidden bg-black/80 shadow-[0_0_15px_rgba(56,189,248,0.2)]">
                <img src="avatar-ai.jpg" onerror="this.src='avatar-profile.jpg'" class="w-full h-full object-cover animate-pulse">
            </div>
            <div class="text-xs pt-2.5 text-sky-200/50 font-mono tracking-widest flex items-center gap-2">
                AI助手解析中 <span class="flex gap-1"><span class="w-1.5 h-1.5 bg-sky-400 rounded-full animate-bounce"></span><span class="w-1.5 h-1.5 bg-sky-400 rounded-full animate-bounce" style="animation-delay: 0.1s"></span><span class="w-1.5 h-1.5 bg-sky-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></span></span>
            </div>
        </div>`;
    chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });

    currentAttachedImageBase64 = capturedImage;

    try {
        const rawMarkdownResponse = await AIEngine.analyze(text, signal);
        currentAttachedImageBase64 = null;

        const thinkingElement = document.getElementById(thinkingId); 
        if(thinkingElement) thinkingElement.remove();

        if (window.firebaseApp && firebaseUser && !firebaseUser.isAnonymous) {
            new Promise(async (resolve) => {
                try {
                    const userRef = window.firebaseApp.doc(window.firebaseApp.db, "users", firebaseUser.uid);
                    const chatRef = window.firebaseApp.collection(userRef, "chat_history");
                    const newChatDoc = window.firebaseApp.doc(chatRef);
                    await window.firebaseApp.setDoc(newChatDoc, {
                        user_msg: text,
                        ai_reply: rawMarkdownResponse,
                        timestamp: Date.now()
                    });
                    resolve();
                } catch (dbErr) {
                }
            });
        }

        const msgId = 'ai-msg-' + Date.now();
        chat.innerHTML += `
            <div class="flex gap-4 w-full animate-[smoothReveal_0.5s_ease] mb-8">
                <div class="w-9 h-9 flex-shrink-0 rounded-full border border-sky-500/50 overflow-hidden shadow-[0_0_10px_rgba(56,189,248,0.3)] bg-[#040d1a] p-0.5 mt-1">
                    <img src="avatar-ai.jpg" onerror="this.src='avatar-profile.jpg'" class="w-full h-full rounded-full object-cover">
                </div>
                <div id="${msgId}" class="markdown-body w-full max-w-[calc(100%-3rem)] bg-transparent"></div>
            </div>`;
        chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });
        
        speakAIText(rawMarkdownResponse);

        streamMarkdown(msgId, rawMarkdownResponse, () => {
            if (currentAbortController) { 
                updateUIState(false); 
                setAiStatus('系統待命中', 'green-400'); 
                currentAbortController = null; 
                inputEl.focus(); 
            }
        });
    } catch(err) {
        if (err.name !== 'AbortError') console.error("AI流程發生錯誤", err);
        updateUIState(false); 
        setAiStatus('系統待命中', 'green-400'); 
        currentAbortController = null;
        currentAttachedImageBase64 = null; 
    }
};

window.showPrivacyPolicy = function() {
    playClickSound();
    PremiumSwal.fire({
        title: '<i class="fa-solid fa-shield-halved text-sky-400 mr-2"></i> 隱私權政策',
        html: `
        <div class="text-left text-sm text-sky-100/80 space-y-3 mt-4 max-h-60 overflow-y-auto pr-2 no-scrollbar">
            <p>歡迎來到老王專屬秘密基地。我們非常重視粉絲的隱私權，以下是我們的資料處理原則：</p>
            <ul class="list-disc pl-5 space-y-2 text-sky-200/60">
                <li><strong class="text-white">資料收集：</strong>當您註冊或使用 Google 登入時，我們僅收集您的基本識別資訊（如信箱、暱稱）以用於身分驗證與等級記錄。</li>
                <li><strong class="text-white">對話紀錄：</strong>為維護基地安全，部分 AI 互動內容可能會被匿名保留，以幫助系統學習與防範惡意行為。</li>
                <li><strong class="text-white">資料保護：</strong>所有資料皆加密儲存於伺服器，絕不向任何第三方行銷公司出售您的個人資料。</li>
            </ul>
        </div>`,
        confirmButtonText: '我同意並了解'
    });
};

window.showTermsOfService = function() {
    playClickSound();
    PremiumSwal.fire({
        title: '<i class="fa-solid fa-file-contract text-sky-400 mr-2"></i> 服務條款',
        html: `
        <div class="text-left text-sm text-sky-100/80 space-y-3 mt-4 max-h-60 overflow-y-auto pr-2 no-scrollbar">
            <p>使用本基地服務前，請閱讀並遵守以下規範：</p>
            <ul class="list-disc pl-5 space-y-2 text-sky-200/60">
                <li><strong class="text-white">行為準則：</strong>請保持友善交流，嚴禁發表政治、色情、暴力或惡意攻擊之言論。違者將被永久封鎖帳號。</li>
                <li><strong class="text-white">AI 免責聲明：</strong>基地內的 AI 助手僅供娛樂互動，其生成之內容「不代表老王本人立場」，且無法代替老王給予任何承諾。</li>
                <li><strong class="text-white">系統權利：</strong>系統開發者 (Wangleon) 保留隨時修改、暫停或終止本網站部分或全部服務的權利。</li>
            </ul>
        </div>`,
        confirmButtonText: '我同意並遵守'
    });
};

// ==========================================
// 🏆 基地傳奇成就與徽章系統 (Achievement System)
// ==========================================

const ACHIEVEMENTS_DB = [
    { 
        id: 'new_blood', 
        name: '初來乍到', 
        desc: '成功註冊並進入秘密基地', 
        icon: 'fa-seedling', 
        colorClass: 'text-emerald-400', 
        bgClass: 'badge-tier-bronze', 
        borderClass: 'border-emerald-500/30',
        condition: () => window.isLoggedIn 
    },
    { 
        id: 'exp_hunter', 
        name: '積分獵人', 
        desc: '累積獲得超過 100 EXP', 
        icon: 'fa-star', 
        colorClass: 'text-amber-400', 
        bgClass: 'badge-tier-silver', 
        borderClass: 'border-amber-500/30',
        condition: () => (window.appSettings && window.appSettings.exp >= 100) 
    },
    { 
        id: 'ai_talker', 
        name: 'AI 溝通大師', 
        desc: '曾使用 AI 助手進行對話', 
        icon: 'fa-microchip', 
        colorClass: 'text-purple-400', 
        bgClass: 'bg-purple-500/10', 
        borderClass: 'border-purple-500/30',
        condition: () => (window.appSettings && window.appSettings.aiUsageCount > 0) 
    },
    { 
        id: 'rich_member', 
        name: '基地大老', 
        desc: '累積獲得超過 500 EXP', 
        icon: 'fa-crown', 
        colorClass: 'text-yellow-400', 
        bgClass: 'badge-tier-gold', 
        borderClass: 'border-yellow-500/50',
        condition: () => (window.appSettings && window.appSettings.exp >= 500) 
    },
    // 🌟🌟🌟 [重點升級] 傳奇流光特效成就徽章對接
    { 
        id: 'guardian', 
        name: '基地守護者', 
        desc: '累積獲得超過 1000 EXP，尊榮無限特權', 
        icon: 'fa-shield-halved', 
        colorClass: 'text-red-400', 
        bgClass: 'badge-tier-legendary', // 對接 styles.css 的極致流光特效
        borderClass: 'border-red-500/50',
        condition: () => (window.appSettings && window.appSettings.exp >= 1000) 
    },
    { 
        id: 'night_owl', 
        name: '夜貓子', 
        desc: '在凌晨 1 點到 4 點間活躍', 
        icon: 'fa-moon', 
        colorClass: 'text-indigo-400', 
        bgClass: 'bg-indigo-500/10', 
        borderClass: 'border-indigo-500/30',
        condition: () => { const h = new Date().getHours(); return h >= 1 && h <= 4; } 
    }
];

window.renderBadges = function() {
    const container = document.getElementById('badges-container');
    if (!container) return;
    
    if (!window.isLoggedIn) {
        container.innerHTML = '<div class="text-xs text-zinc-500 font-mono w-full text-center border border-white/5 rounded-xl py-3 bg-black/40">登入後解鎖成就徽章</div>';
        return;
    }

    let html = '';
    let unlockedCount = 0;

    ACHIEVEMENTS_DB.forEach(badge => {
        const isUnlocked = badge.condition();
        if (isUnlocked) unlockedCount++;

        html += `
            <div class="relative group cursor-pointer" onclick="window.showBadgeDetail('${badge.name}', '${badge.desc}', '${badge.icon}', '${badge.colorClass}', ${isUnlocked})">
                <div class="w-10 h-10 rounded-full flex items-center justify-center border ${isUnlocked ? badge.bgClass + ' ' + badge.borderClass + ' ' + badge.colorClass : 'bg-white/5 border-white/10 text-zinc-600'} transition-all duration-300 ${isUnlocked ? 'hover:scale-110 hover:shadow-[0_0_15px_currentColor]' : 'grayscale opacity-50'}">
                    <i class="fa-solid ${badge.icon} text-sm"></i>
                </div>
                ${!isUnlocked ? '<div class="absolute -bottom-1 -right-1 w-4 h-4 bg-black rounded-full flex items-center justify-center border border-zinc-700"><i class="fa-solid fa-lock text-[8px] text-zinc-500"></i></div>' : ''}
            </div>
        `;
    });

    if (unlockedCount === 0) {
        html = '<div class="text-xs text-zinc-500 font-mono w-full text-center border border-white/5 rounded-xl py-3 bg-black/40">持續探索基地來解鎖徽章</div>';
    }
    container.innerHTML = html;
};

window.showBadgeDetail = function(name, desc, icon, colorClass, isUnlocked) {
    if(typeof playClickSound === 'function') playClickSound();
    
    let actionHtml = isUnlocked 
        ? `<button onclick="window.generateAchievementCard('${name}', '${desc}')" class="w-full mt-5 bg-gradient-to-r from-sky-400 to-blue-500 text-white font-black py-3 rounded-xl shadow-[0_0_15px_rgba(56,189,248,0.4)] hover:scale-105 transition-transform tracking-widest"><i class="fa-solid fa-download mr-2"></i>生成專屬成就卡</button>` 
        : `<div class="mt-5 text-xs text-red-400 font-mono bg-red-500/10 py-2.5 rounded-xl border border-red-500/20 tracking-widest"><i class="fa-solid fa-lock mr-1"></i>尚未達成解鎖條件</div>`;

    PremiumSwal.fire({
        title: `<div class="w-20 h-20 mx-auto rounded-full flex items-center justify-center border-4 border-current ${colorClass} bg-current/10 mb-4 shadow-[0_0_30px_currentColor]"><i class="fa-solid ${icon} text-3xl"></i></div>`,
        html: `<h3 class="text-xl font-black text-white tracking-widest mb-2">${name}</h3><p class="text-zinc-400 text-sm font-mono tracking-wider">${desc}</p>${actionHtml}`,
        showConfirmButton: false,
        showCloseButton: true,
        background: 'rgba(10,16,28,0.95)',
        backdrop: `rgba(0,0,0,0.8)`
    });
};

window.generateAchievementCard = function(badgeName, badgeDesc) {
    if(typeof playClickSound === 'function') playClickSound();
    Swal.fire({ title: '成就卡片生成中...', didOpen: () => Swal.showLoading(), background: 'rgba(10,16,28,0.95)' });

    const canvas = document.createElement('canvas');
    canvas.width = 1080; canvas.height = 1080;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#020813'; ctx.fillRect(0, 0, 1080, 1080);
    const grad = ctx.createRadialGradient(540, 540, 100, 540, 540, 800);
    grad.addColorStop(0, 'rgba(56, 189, 248, 0.2)'); grad.addColorStop(1, '#020813');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 1080, 1080);
    
    ctx.strokeStyle = 'rgba(56,189,248,0.5)'; ctx.lineWidth = 8; ctx.strokeRect(50, 50, 980, 980);
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 4; ctx.strokeRect(80, 80, 60, 60);

    ctx.textAlign = "center";
    ctx.fillStyle = '#bae6fd'; ctx.font = '900 50px "SF Pro Display", sans-serif'; ctx.letterSpacing = "15px";
    ctx.fillText('老王秘密基地 · 粉絲認證', 540, 250);

    ctx.fillStyle = '#FFFFFF'; ctx.font = '900 130px "SF Pro Display", sans-serif';
    ctx.shadowColor = 'rgba(56, 189, 248, 0.8)'; ctx.shadowBlur = 30;
    ctx.fillText(badgeName, 540, 540); ctx.shadowBlur = 0;

    ctx.fillStyle = '#7dd3fc'; ctx.font = 'bold 45px monospace';
    ctx.fillText(`任務達成：${badgeDesc}`, 540, 680);

    const currentUser = window.firebaseApp?.auth?.currentUser;
    let userIdStr = currentUser && !currentUser.isAnonymous ? currentUser.uid.slice(0, 6).toUpperCase() : "訪客";
    const dateStr = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Taipei' }).replace(/\//g, '.');

    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = 'bold 35px monospace';
    ctx.fillText(`UNLOCKED BY: WANG-${userIdStr}`, 540, 880);
    ctx.fillText(`DATE: ${dateStr}`, 540, 950);

    setTimeout(() => {
        PremiumSwal.fire({
            title: '成就卡片已核發 🎉',
            html: '<p class="text-sm text-sky-200 mb-2">專屬榮耀已生成，請長按或右鍵儲存圖片！</p>',
            imageUrl: canvas.toDataURL('image/jpeg', 0.95),
            imageWidth: '90%',
            customClass: { image: 'rounded-3xl shadow-[0_0_40px_rgba(56,189,248,0.5)] border-2 border-sky-400' },
            background: 'rgba(10,16,28,0.95)',
            confirmButtonText: '收下榮耀'
        });
    }, 500);
};

const originalUpdateExpUI = window.updateExpUI;
window.updateExpUI = function() {
    if (typeof originalUpdateExpUI === 'function') originalUpdateExpUI();
    window.renderBadges(); 
};

window.addEventListener('load', () => {
    setTimeout(() => { window.renderBadges(); }, 1500);
});

// ==========================================
// 🛠️ 核心功能修復包 (UI、存檔、切換分頁、簽到)
// ==========================================

window.saveSettings = window.saveSettings || function() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(window.appSettings));
    } catch(e) { console.warn("存檔失敗", e); }
};

try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        const parsed = JSON.parse(saved);
        window.appSettings = Object.assign(window.appSettings, parsed);
    }
} catch(e) {}

function hideSplashScreen() {
    const splash = document.getElementById('splash');
    if (splash && !splash.classList.contains('hidden')) {
        splash.style.opacity = '0';
        setTimeout(() => {
            splash.style.display = 'none';
            splash.classList.add('hidden');
        }, 700);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    if(typeof fetchAnnouncements === 'function') fetchAnnouncements();
    if(typeof initQA === 'function') initQA();
    setTimeout(hideSplashScreen, 1500); 
});
window.addEventListener('load', () => { setTimeout(hideSplashScreen, 800); });
setTimeout(hideSplashScreen, 3000); 

window.switchTab = function(pageId, btnElement) {
    if(typeof window.playClickSound === 'function') window.playClickSound();
    
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));

    const targetPage = document.getElementById(pageId);
    if (targetPage) targetPage.classList.add('active');
    if (btnElement) btnElement.classList.add('active');

    if (pageId === 'page-timeline' && typeof window.triggerTimelineAnimation === 'function') {
        window.triggerTimelineAnimation();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.dailyCheckIn = window.dailyCheckIn || function() {
    if (!window.isLoggedIn) return PremiumSwal.fire('請先登入', '必須登入正式帳號才能簽到喔！', 'warning');
    const today = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Taipei' });
    if (window.appSettings.lastCheckIn === today) {
        return PremiumSwal.fire('今日已簽到', '你今天已經領過獎勵囉，明天再來吧！', 'info');
    }
    window.appSettings.lastCheckIn = today;
    window.saveSettings();
    window.gainExp(30, false, "每日簽到獎勵");
    PremiumSwal.fire('簽到成功 🎉', '獲得 30 EXP！持續關注基地動態吧！', 'success');
};

window.gachaQuote = window.gachaQuote || function() {
    if (!window.isLoggedIn) return PremiumSwal.fire('請先登入', '必須登入正式帳號才能抽卡喔！', 'warning');
    if ((window.appSettings.exp || 0) < 20) return PremiumSwal.fire('EXP 不足', '抽卡需要 20 EXP 喔！去跟 AI 聊天或簽到賺取積分吧！', 'warning');
    
    window.gainExp(-20, true, "消耗積分解密檔案");
    PremiumSwal.fire({ title: '信號解密中...', didOpen: () => Swal.showLoading(), timer: 1000, showConfirmButton: false, background: 'rgba(10,16,28,0.95)', color: '#fff' }).then(() => {
        const db = typeof qaData !== 'undefined' ? qaData : [];
        const randomQA = (db && db.length > 0) ? db[Math.floor(Math.random() * db.length)] : {q: "神秘彩蛋", a: "目前題庫尚未載入"};
        PremiumSwal.fire({
            title: '✨ 獲得專屬檔案 ✨',
            html: `<div class="text-left bg-white/5 p-4 rounded-xl border border-white/10"><p class="text-sky-400 font-bold mb-2 border-b border-white/10 pb-2"><i class="fa-solid fa-q"></i> ${randomQA.q}</p><p class="text-white text-sm leading-relaxed">${randomQA.a}</p></div>`,
            confirmButtonText: '收下檔案',
            background: 'rgba(10,16,28,0.95)',
            color: '#fff',
            customClass: { confirmButton: 'bg-sky-500 text-white rounded-xl px-6 py-2' }
        });
    });
};

// ==========================================
// 🔌 UI 互動與 Firebase 登入狀態管理模組
// ==========================================
window.openInbox = async function() {
    const user = window.firebaseApp?.auth?.currentUser;
    if(!user || user.isAnonymous) return;
    PremiumSwal.fire({ title: '讀取信件中...', background: 'rgba(10,16,28,0.95)', didOpen: () => Swal.showLoading() });
    
    try {
        const historyRef = window.firebaseApp.collection(window.firebaseApp.doc(window.firebaseApp.db, "users", user.uid), "exp_history");
        const q = window.firebaseApp.query(historyRef, window.firebaseApp.orderBy("timestamp", "desc"), window.firebaseApp.limit(20));
        const snapshot = await window.firebaseApp.getDocs(q);
        
        let html = '<div class="space-y-3 max-h-80 overflow-y-auto pr-2 text-left mt-4 no-scrollbar">';
        if(snapshot.empty) { html += '<div class="text-center text-zinc-500 py-6">信箱空空如也</div>'; } 
        else {
            snapshot.forEach(doc => {
                const data = doc.data();
                const colorClass = data.amount > 0 ? 'text-green-400' : 'text-red-400';
                const sign = data.amount > 0 ? '+' : '';
                html += `
                    <div class="bg-white/5 border border-white/10 p-4 rounded-2xl flex justify-between items-center hover:bg-white/10 transition-colors">
                        <div>
                            <p class="text-sm font-bold text-white mb-1">${data.reason}</p>
                            <p class="text-[10px] text-zinc-500 font-mono">${new Date(data.timestamp).toLocaleString()}</p>
                        </div>
                        <div class="text-lg font-black ${colorClass}">${sign}${data.amount} EXP</div>
                    </div>`;
                if(!data.read) window.firebaseApp.updateDoc(doc.ref, { read: true });
            });
        }
        html += '</div>';
        const badge = document.getElementById('inbox-badge');
        if(badge) badge.classList.add('hidden');
        
        PremiumSwal.fire({
            title: '<i class="fa-solid fa-envelope-open-text text-sky-400 mr-2"></i> 基地專屬信箱',
            html: html, background: 'rgba(10,16,28,0.95)', color: '#fff', confirmButtonText: '關閉'
        });
    } catch(e) { PremiumSwal.fire('錯誤', '無法讀取信箱', 'error'); }
};

let isBgmPlaying = false;
window.toggleBGM = function () {
    const audio = document.getElementById('bgm-audio');
    const icon = document.getElementById('bgm-icon');
    const btn = document.getElementById('bgm-btn');
    if (!audio) return;
    if (isBgmPlaying) {
        audio.pause();
        icon.className = "fa-solid fa-compact-disc text-lg";
        btn.classList.remove('text-sky-400', 'border-sky-500/50', 'shadow-[0_0_15px_rgba(56,189,248,0.3)]');
        btn.classList.add('text-zinc-400');
    } else {
        audio.volume = 0;
        audio.play().catch(e => console.log('BGM Error:', e));
        let fadeIn = setInterval(() => { if (audio.volume < 0.25) audio.volume += 0.05; else clearInterval(fadeIn); }, 100);
        icon.className = "fa-solid fa-compact-disc text-lg playing-record";
        btn.classList.add('text-sky-400', 'border-sky-500/50', 'shadow-[0_0_15px_rgba(56,189,248,0.3)]');
        btn.classList.remove('text-zinc-400');
    }
    isBgmPlaying = !isBgmPlaying;
};

window.toggleSettings = function () {
    const modal = document.getElementById('settings-modal');
    const content = document.getElementById('settings-content');
    if (modal.classList.contains('hidden')) {
        modal.classList.remove('hidden'); modal.classList.add('flex');
        setTimeout(() => { modal.classList.remove('opacity-0'); content.classList.remove('scale-95'); }, 10);
    } else {
        modal.classList.add('opacity-0'); content.classList.add('scale-95');
        setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); }, 300);
    }
};

let isAIGenerating = false;
window.toggleAIAction = function () {
    if (!isAIGenerating) {
        if (typeof window.sendAIMessage === 'function') window.sendAIMessage();
    } else {
        if (typeof window.stopAIGeneration === 'function') window.stopAIGeneration();
    }
};

let currentAuthMode = 'login';
window.openAuthModal = function (mode) { 
    if(mode) currentAuthMode = mode; 
    try{ window.switchAuthMode(currentAuthMode);}catch(e){}
    const modal = document.getElementById('auth-modal');
    const content = document.getElementById('auth-content');
    modal.classList.remove('hidden'); modal.classList.add('flex');
    setTimeout(() => { modal.classList.remove('opacity-0'); content.classList.remove('scale-95'); }, 10);
}

window.closeAuthModal = function () {
    const modal = document.getElementById('auth-modal');
    const content = document.getElementById('auth-content');
    modal.classList.add('opacity-0'); content.classList.add('scale-95');
    setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); }, 300);
}

window.switchAuthMode = function (mode) {
    currentAuthMode = mode;
    const tabLogin = document.getElementById('tab-login'); const tabRegister = document.getElementById('tab-register');
    const fieldName = document.getElementById('field-name'); const nameInput = document.getElementById('auth-name'); const btnSubmit = document.getElementById('btn-auth-submit');
    if (tabLogin && tabRegister) { tabLogin.classList.toggle('active', mode === 'login'); tabRegister.classList.toggle('active', mode === 'register'); }
    const isLogin = (mode === 'login');
    if (fieldName) fieldName.classList.toggle('hidden', isLogin);
    if (nameInput) { if (isLogin) nameInput.removeAttribute('required'); else nameInput.setAttribute('required', 'true'); }
    if (btnSubmit) btnSubmit.innerText = isLogin ? '確認登入' : '建立專屬帳號';
}

window.handleAuthSubmit = async function (e) {
    e.preventDefault();
    if (!window.firebaseApp) return alert("系統載入中，請稍候...");
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const name = document.getElementById('auth-name').value;
    PremiumSwal.fire({ title: currentAuthMode === 'login' ? '登入驗證中...' : '建立帳號中...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

    try {
        if (currentAuthMode === 'login') {
            const result = await window.firebaseApp.signInWithEmailAndPassword(window.firebaseApp.auth, email, password);
            const userDoc = await window.firebaseApp.getDoc(window.firebaseApp.doc(window.firebaseApp.db, "users", result.user.uid));
            const displayName = userDoc.exists() && userDoc.data().name ? userDoc.data().name : "老王鐵粉";
            PremiumSwal.fire({ title: '登入成功', text: `歡迎回來，${displayName}！`, icon: 'success', timer: 1500, showConfirmButton: false }).then(() => {
                window.isLoggedIn = true; window.closeAuthModal(); window.updateHeaderToLoggedIn(displayName);
            });
        } else {
            const result = await window.firebaseApp.createUserWithEmailAndPassword(window.firebaseApp.auth, email, password);
            const finalName = name.trim() || "新粉絲";
            await window.firebaseApp.setDoc(window.firebaseApp.doc(window.firebaseApp.db, "users", result.user.uid), { name: finalName, email: email, exp: 0, role: 'user', createdAt: new Date().toISOString() });
            PremiumSwal.fire({ title: '註冊成功 🎉', text: `專屬帳號建立完畢，歡迎加入基地，${finalName}！`, icon: 'success', timer: 2000, showConfirmButton: false }).then(() => {
                window.isLoggedIn = true; window.closeAuthModal(); window.updateHeaderToLoggedIn(finalName);
            });
        }
    } catch (error) {
        let errorMsg = "發生未知錯誤，請稍後再試。";
        switch (error.code) {
            case 'auth/email-already-in-use': errorMsg = "這個信箱已經被註冊過囉！"; break;
            case 'auth/invalid-email': errorMsg = "信箱格式好像怪怪的，請檢查一下。"; break;
            case 'auth/weak-password': errorMsg = "密碼太弱了，請至少輸入 6 個字元喔。"; break;
            case 'auth/user-not-found': errorMsg = "找不到這個帳號，要不要先註冊？"; break;
            case 'auth/wrong-password': errorMsg = "密碼輸入錯誤，請再試一次。"; break;
            case 'auth/invalid-credential': errorMsg = "帳號或密碼錯誤。"; break;
        }
        PremiumSwal.fire({ title: currentAuthMode === 'login' ? '登入失敗' : '註冊失敗', text: errorMsg, icon: 'error' });
    }
};

window.loginWithGoogle = async function () {
    if (!window.firebaseApp) return alert("系統載入中，請稍候...");
    try {
        const provider = new window.firebaseApp.GoogleAuthProvider();
        await window.firebaseApp.signInWithPopup(window.firebaseApp.auth, provider);
        window.closeAuthModal();
    } catch (error) {
        if (error.code === 'auth/popup-closed-by-user' || error.message.includes('Cross-Origin')) {
            PremiumSwal.fire({ title: '本地開發環境限制', html: '<p class="text-sm text-zinc-300">因為 Live Server 的安全性設定擋住了 Google 彈窗。<br>這只會在本地端測試時發生，上線後就能正常使用！</p>', icon: 'warning' });
        } else {
            PremiumSwal.fire({ title: '登入失敗', text: error.message, icon: 'error' });
        }
    }
};

window.loginAsGuest = async function() {
    if(!window.firebaseApp) return alert("系統載入中，請稍候...");
    PremiumSwal.fire({ title: '配發訪客憑證中...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
    try {
        const result = await window.firebaseApp.signInAnonymously(window.firebaseApp.auth);
        PremiumSwal.fire({ title: '進入基地', text: '已使用訪客身分進入，注意清除瀏覽器資料後積分可能會消失喔！', icon: 'info', timer: 2000, showConfirmButton: false }).then(() => {
            window.isLoggedIn = true; window.closeAuthModal(); 
        });
    } catch(error) { PremiumSwal.fire({ title: '登入失敗', text: error.message, icon: 'error' }); }
};

window.updateHeaderToLoggedIn = function (username) {
    document.getElementById('btn-login-trigger').classList.add('hidden');
    const userProfileBtn = document.getElementById('btn-user-profile');
    if(userProfileBtn) { userProfileBtn.classList.remove('hidden'); userProfileBtn.classList.add('flex'); }
    const myRankName = document.getElementById('my-rank-name');
    if (myRankName) myRankName.innerText = username || "會員";
    if(typeof window.loadLeaderboard === 'function') window.loadLeaderboard();
};

window.handleForgotPassword = function() {
    PremiumSwal.fire({
        title: '<i class="fa-solid fa-key text-sky-400 mb-2 block text-3xl"></i>忘記密碼？',
        html: '<p class="text-zinc-300 text-sm mt-2">請聯絡工程師並提供您的<b class="text-red-400">粉絲編號 (UID)</b> 以核對身分！</p>',
        confirmButtonText: '<i class="fa-solid fa-envelope mr-2"></i>Email 工程師',
        showCancelButton: true, cancelButtonText: '取消'
    }).then((result) => {
        if(result.isConfirmed) window.open('mailto:wangleon26@gmail.com?subject=老王秘密基地 - 密碼重置申請', '_blank');
    });
};

window.toggleUserMenu = function () {
    const user = window.firebaseApp && window.firebaseApp.auth ? window.firebaseApp.auth.currentUser : null;
    if (!user) return;
    const isGuest = user.isAnonymous;
    const email = isGuest ? "未綁定 (訪客模式)" : (user.email || "使用 Google 授權登入");
    const uid = user.uid;
    
    PremiumSwal.fire({
        title: '<i class="fa-solid fa-crown text-amber-400 mr-2"></i> 個人帳號中心',
        html: `
            <div class="text-left space-y-4 mt-6">
                <div class="bg-white/5 border border-white/10 p-4 rounded-2xl space-y-3">
                    <div class="flex items-center justify-between border-b border-white/5 pb-2"><span class="text-zinc-400 text-xs font-bold">綁定信箱</span><span class="text-sky-300 text-xs font-medium">${email}</span></div>
                    <div class="flex items-center justify-between"><span class="text-zinc-400 text-xs font-bold">粉絲編號</span><span class="text-zinc-300 text-xs font-mono font-bold tracking-widest">UID-${uid.substring(0, 8).toUpperCase()}</span></div>
                </div>
                <button onclick="window.logoutUser()" class="w-full bg-red-500/10 border border-red-500/30 text-red-400 py-4 rounded-2xl font-black tracking-widest hover:bg-red-500 hover:text-white transition-all mt-4">登出帳號</button>
            </div>
        `,
        showConfirmButton: false, showCloseButton: true
    });
};

window.logoutUser = async function () {
    if (!window.firebaseApp) return;
    try {
        await window.firebaseApp.signOut(window.firebaseApp.auth);
        window.isLoggedIn = false;
        PremiumSwal.fire({ title: '已成功登出', icon: 'success', timer: 1500, showConfirmButton: false }).then(() => {
            document.getElementById('btn-login-trigger').classList.remove('hidden');
            const userProfileBtn = document.getElementById('btn-user-profile');
            if(userProfileBtn){ userProfileBtn.classList.add('hidden'); userProfileBtn.classList.remove('flex'); }
            window.appSettings.exp = 0;
            if (typeof window.updateExpUI === 'function') window.updateExpUI();
            window.openAuthModal('login');
        });
    } catch (error) { console.error("登出失敗", error); }
};

window.syncExpToFirebase = async function (newExp) {
    const user = window.firebaseApp && window.firebaseApp.auth ? window.firebaseApp.auth.currentUser : null;
    if (user && !user.isAnonymous) {
        try {
            const userRef = window.firebaseApp.doc(window.firebaseApp.db, "users", user.uid);
            await window.firebaseApp.updateDoc(userRef, { exp: newExp });
        } catch (e) {}
    }
}

window.loadLeaderboard = async function () {
    if (!window.firebaseApp || !window.firebaseApp.auth.currentUser) return;
    const currentUser = window.firebaseApp.auth.currentUser;
    let currentExp = window.appSettings ? (window.appSettings.exp || 0) : 0;
    const lockElement = document.getElementById('leaderboard-lock');
    const listElement = document.getElementById('leaderboard-list');
    const myRankPos = document.getElementById('my-rank-position');

    if (currentUser.isAnonymous || currentExp < 300) {
        if (lockElement) lockElement.style.display = 'flex';
        if (listElement) listElement.innerHTML = '';
    } else {
        if (lockElement) lockElement.style.display = 'none';
        if (listElement) listElement.innerHTML = '<div class="text-center text-zinc-500 py-4"><i class="fa-solid fa-spinner fa-spin text-2xl text-sky-500 mb-2 block"></i>讀取資料中...</div>';

        try {
            const usersRef = window.firebaseApp.collection(window.firebaseApp.db, "users");
            const q = window.firebaseApp.query(usersRef, window.firebaseApp.orderBy("exp", "desc"), window.firebaseApp.limit(10));
            const querySnapshot = await window.firebaseApp.getDocs(q);

            let html = ''; let rank = 1; let foundMe = false;
            querySnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const isMe = docSnap.id === currentUser.uid;
                if (isMe) { foundMe = true; if (myRankPos) myRankPos.innerText = `第 ${rank} 名`; }
                let rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : '';
                let avatarUrl = data.photoURL || `https://ui-avatars.com/api/?name=${data.name}&background=111&color=fff`;
                html += `
                <div class="glass-element rank-card ${rankClass} p-4 rounded-2xl flex items-center justify-between mb-3 ${isMe ? 'border-sky-500 shadow-[0_0_15px_rgba(56,189,248,0.3)]' : ''}">
                    <div class="flex items-center gap-4">
                        <div class="w-8 text-center text-xl font-black text-zinc-500">${rank}</div>
                        <div class="w-10 h-10 rounded-full border-2 border-white/20 overflow-hidden bg-black"><img src="${avatarUrl}" class="w-full h-full object-cover"></div>
                        <div class="font-bold ${isMe ? 'text-sky-400' : 'text-white'}">${data.name}</div>
                    </div>
                    <div class="text-right"><div class="text-[12px] font-black text-sky-400">${data.exp || 0} EXP</div></div>
                </div>`;
                rank++;
            });
            if (!foundMe && myRankPos) myRankPos.innerText = "10名外";
            if (listElement) listElement.innerHTML = html;
        } catch (error) {}
    }
}

// --- V-CORE 工程師直連系統 (粉絲端邏輯) ---
window.contactEngineer = function() {
    if (!window.isLoggedIn || window.firebaseApp.auth.currentUser.isAnonymous) {
        return PremiumSwal.fire('權限不足', '請先登入正式帳號才能聯絡工程師喔！', 'warning');
    }
    
    PremiumSwal.fire({
        title: '<i class="fa-solid fa-envelope-circle-check text-sky-400 mr-2"></i> 聯絡基地工程師',
        html: `
            <div class="text-left space-y-4 mt-2">
                <p class="text-xs text-zinc-400 leading-relaxed font-mono">有系統 Bug、帳號問題或想對工程師告白？<br>請在下方輸入訊息，工程師會親自回覆到您的信箱。</p>
                <textarea id="support-msg" class="cyber-input w-full p-4 rounded-2xl text-white text-sm h-32 resize-none" placeholder="請描述您的問題..."></textarea>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: '發送訊息',
        cancelButtonText: '取消',
        preConfirm: () => {
            const msg = document.getElementById('support-msg').value.trim();
            if (!msg) { Swal.showValidationMessage('內容不能為空喔！'); return false; }
            return msg;
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            Swal.fire({ title: '傳輸中...', didOpen: () => Swal.showLoading() });
            try {
                const user = window.firebaseApp.auth.currentUser;
                await window.firebaseApp.addDoc(window.firebaseApp.collection(window.firebaseApp.db, "support_tickets"), {
                    uid: user.uid,
                    name: window.appSettings.name || user.displayName || "匿名粉絲",
                    email: user.email,
                    message: result.value,
                    status: 'pending', // pending, replied
                    timestamp: Date.now()
                });
                PremiumSwal.fire('發送成功', '訊息已送達工程師終端，請留意信箱回覆！', 'success');
            } catch(e) { PremiumSwal.fire('發送失敗', e.message, 'error'); }
        }
    });
};