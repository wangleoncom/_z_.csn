// 🌟 攔截 Twitch 回傳的 Token 存入暫存區
const hash = window.location.hash;
if (hash.includes('access_token=')) {
    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get('access_token');
    if (accessToken) {
        sessionStorage.setItem('twitch_pending_token', accessToken);
        // 清除網址列上的 Token 確保安全
        window.history.replaceState(null, null, window.location.pathname);
    }
}

// --- 更新日誌 ---
const APP_VERSION = '24.1.7';
let globalSupportUnsubscribe = null;

const customStyle = document.createElement('style');
customStyle.innerHTML = `
    @keyframes ultraAura {
        0% { box-shadow: 0 0 20px #bae6fd, inset 0 0 15px #38bdf8; border-color: #bae6fd; }
        33% { box-shadow: 0 0 40px #e879f9, inset 0 0 25px #c084fc; border-color: #e879f9; }
        66% { box-shadow: 0 0 40px #67e8f9, inset 0 0 25px #2dd4bf; border-color: #67e8f9; }
        100% { box-shadow: 0 0 20px #bae6fd, inset 0 0 15px #38bdf8; border-color: #bae6fd; }
    }
    .aura-effect {
        background: linear-gradient(135deg, rgba(186,230,253,0.15), rgba(232,121,249,0.15), rgba(103,232,249,0.15)) !important;
        background-size: 200% 200% !important;
        animation: ultraAura 2.5s infinite linear !important;
        border-width: 2px !important;
        transform: scale(1.02);
        z-index: 10;
    }
`;
document.head.appendChild(customStyle);

// --- 系統全域防呆與美化變數 ---
window.playClickSound = window.playClickSound || function() {};
window.playSuccessSound = window.playSuccessSound || function() {};
window.preloadedImages = window.preloadedImages || {};
window.isLoggedIn = window.isLoggedIn || false;
window.userRole = window.userRole || 'user'; 

const PremiumSwal = Swal.mixin({
    customClass: {
        popup: 'premium-card border border-sky-400/30 shadow-[0_20px_50px_rgba(0,0,0,0.8)]',
        confirmButton: 'bg-gradient-to-r from-sky-400 to-blue-500 text-sky-950 font-black rounded-xl px-8 py-3 shadow-[0_0_15px_rgba(56,189,248,0.4)] hover:scale-105 transition-transform tracking-widest',
        cancelButton: 'bg-[#060e1a] border border-sky-500/30 text-sky-300 font-bold rounded-xl px-8 py-3 hover:bg-sky-900/50 transition-colors tracking-widest'
    },
    background: 'rgba(6, 14, 26, 0.95)',
    color: '#e0f2fe',
    buttonsStyling: false,
    scrollbarPadding: false
});

const CHANGELOG = [
    { ver: '24.1.7', date: '2026-03-15', items: [
        '修復：排行榜不再顯示「尚未登入」，解決渲染同步延遲問題。',
        '修復：首頁版面結構錯誤，各分頁內容不再互相干擾重疊。',
        '優化：官方客服中心即使被工程師結案，依舊可發送新訊息。',
        '新增：顯示 Twitch 乾爹專屬認證徽章。',
        '新增：讀取信箱後，未讀小紅點將自動消失。'
    ]}
];

(function enforceAppVersion(){
    try{
        const k = 'wangAppVersion';
        const prev = localStorage.getItem(k);
        if(prev !== APP_VERSION){
            const preserveKeys = ['wangAppConfig_V24', k];
            for (let key in localStorage) {
                if (!preserveKeys.includes(key)) localStorage.removeItem(key);
            }
            localStorage.setItem(k, APP_VERSION);
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                    for(let registration of registrations) registration.unregister();
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
    }catch(e){}
})();

// ==========================================================================
// 系統變數與初始化
// ==========================================================================
let dynamicApiKeys = { gemini: [], groq: [] };
let systemFeatures = { imageGeneration: false, fileUploads: true, chainOfThought: false }; 
const qaData = window.QA_DB || window.wangQuiz_DB || []; 
const quizData = window.QUIZ_DB || window.wangQuiz_DB || [];
const STORAGE_KEY = 'wangAppConfig_V24';

window.appSettings = Object.assign({ 
    exp: 0, 
    qaPerPage: 6, 
    soundOn: true, 
    perfMode: false, 
    lastCheckIn: "",
    streakCount: 0,
    voiceReply: false, 
    aiLimitDate: "", 
    aiUsageCount: 0,
    checkInCount: 0,  
    gachaCount: 0,    
    quizPerfect: 0,   
    aiVisionCount: 0, 
    hasAura: false,   
    customTitle: "",
    isTwitchSub: false
}, window.appSettings || {});

try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) window.appSettings = Object.assign(window.appSettings, JSON.parse(saved));
} catch(e) {}

window.saveSettings = window.saveSettings || function() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(window.appSettings)); } catch(e) {}
    if (window.firebaseApp && window.firebaseApp.auth && window.firebaseApp.auth.currentUser && !window.firebaseApp.auth.currentUser.isAnonymous) {
        try {
            window.firebaseApp.updateDoc(window.firebaseApp.doc(window.firebaseApp.db, "users", window.firebaseApp.auth.currentUser.uid), {
                checkInCount: window.appSettings.checkInCount || 0,
                streakCount: window.appSettings.streakCount || 0,
                gachaCount: window.appSettings.gachaCount || 0,
                quizPerfect: window.appSettings.quizPerfect || 0,
                aiVisionCount: window.appSettings.aiVisionCount || 0,
                aiUsageCount: window.appSettings.aiUsageCount || 0
            });
        } catch(e){}
    }
};

window.hideSplashScreen = function() {
    const splash = document.getElementById('splash');
    if (splash && !splash.classList.contains('hidden')) {
        splash.style.opacity = '0';
        setTimeout(() => { splash.style.display = 'none'; splash.classList.add('hidden'); }, 700);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    syncSystemConfig();
    if(typeof fetchAnnouncements === 'function') fetchAnnouncements();
    if(typeof initQA === 'function') initQA();
    initPromoListener(); 
    setTimeout(window.hideSplashScreen, 1500); 
    if (window.appSettings && window.appSettings.perfMode) {
        document.body.classList.add('perf-mode');
        const perfToggle = document.getElementById('setting-perf-mode');
        if (perfToggle) perfToggle.checked = true;
    }
});
window.addEventListener('load', () => { setTimeout(window.hideSplashScreen, 800); setTimeout(window.renderBadges, 1500); });

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

// ==========================================================================
// UI 與設定模組
// ==========================================================================
window.openChangelog = function(){
    const md = CHANGELOG.map(v => `### v${v.ver} · ${v.date}\n` + v.items.map(i => `- ${i}`).join('\n')).join('\n\n');
    PremiumSwal.fire({
        title: '系統更新日誌',
        html: `<div class="markdown-body" style="text-align:left;max-height:60vh;overflow:auto;">${marked.parse(md)}</div>`,
        confirmButtonText: '已了解',
    });
};

window.setQaPerPage = function(value){
    const n = parseInt(value, 10);
    if(!Number.isFinite(n) || n<=0) return;
    window.appSettings.qaPerPage = n;
    window.saveSettings();
    currentPage = 1; 
    if(typeof window.renderQA === 'function') window.renderQA(currentPage);
};

window.togglePerfMode = function(isPerf) {
    window.appSettings.perfMode = isPerf;
    if (isPerf) document.body.classList.add('perf-mode');
    else document.body.classList.remove('perf-mode');
    window.saveSettings();
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
        icon.className = "fa-solid fa-compact-disc text-lg animate-spin";
        btn.classList.add('text-sky-400', 'border-sky-500/50', 'shadow-[0_0_15px_rgba(56,189,248,0.3)]');
        btn.classList.remove('text-zinc-400');
    }
    isBgmPlaying = !isBgmPlaying;
};

// 🌟 修正第四點：開啟信箱時強制隱藏小紅點，並將未讀標記設為已讀
window.openInbox = async function() {
    if(isUserBanned()) return;
    const user = window.firebaseApp?.auth?.currentUser;
    if(!user || user.isAnonymous) return;
    
    // 強制即刻隱藏紅點
    const badge = document.getElementById('inbox-badge');
    if(badge) badge.classList.add('hidden');

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
                // 非同步標記已讀 (避免前端畫面卡住)
                if(!data.read) {
                    try { window.firebaseApp.updateDoc(doc.ref, { read: true }); } catch(e){}
                }
            });
        }
        html += '</div>';
        
        PremiumSwal.fire({
            title: '<i class="fa-solid fa-envelope-open-text text-sky-400 mr-2"></i> 基地專屬信箱',
            html: html, confirmButtonText: '關閉'
        });
    } catch(e) { PremiumSwal.fire('錯誤', '無法讀取信箱', 'error'); }
};

window.toggleUserMenu = function () {
    const user = window.firebaseApp && window.firebaseApp.auth ? window.firebaseApp.auth.currentUser : null;
    if (!user) return;
    const isGuest = user.isAnonymous;
    const email = isGuest ? "未綁定 (訪客模式)" : (user.email || "使用 Google 授權登入");
    const uid = user.uid;
    
    // 🌟 加入 Twitch 乾爹顯示
    const twitchSubHtml = window.appSettings.isTwitchSub ? 
        `<span class="text-purple-400 text-[10px] font-black border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 rounded tracking-widest"><i class="fa-brands fa-twitch mr-1"></i>乾爹認證</span>` : 
        `<span class="text-zinc-600 text-[10px] font-bold">未認證</span>`;

    PremiumSwal.fire({
        title: '<i class="fa-solid fa-crown text-sky-400 mr-2"></i> 個人帳號中心',
        html: `
            <div class="text-left space-y-4 mt-6">
                <div class="bg-white/5 border border-white/10 p-4 rounded-2xl space-y-3">
                    <div class="flex items-center justify-between border-b border-white/5 pb-2"><span class="text-zinc-400 text-xs font-bold">綁定信箱</span><span class="text-sky-300 text-xs font-medium">${email}</span></div>
                    <div class="flex items-center justify-between border-b border-white/5 pb-2"><span class="text-zinc-400 text-xs font-bold">粉絲編號</span><span class="text-zinc-300 text-xs font-mono font-bold tracking-widest">UID-${uid.substring(0, 8).toUpperCase()}</span></div>
                    <div class="flex items-center justify-between"><span class="text-zinc-400 text-xs font-bold">Twitch 身分</span>${twitchSubHtml}</div>
                </div>
                ${!isGuest ? `<button onclick="window.updateUserAvatar()" class="w-full bg-sky-500/10 border border-sky-500/30 text-sky-400 py-3 rounded-2xl font-black tracking-widest hover:bg-sky-500 hover:text-[#020617] transition-all shadow-md"><i class="fa-solid fa-camera mr-2"></i>更換專屬頭像</button>` : ''}
                <button onclick="window.logoutUser()" class="w-full bg-red-500/10 border border-red-500/30 text-red-400 py-4 rounded-2xl font-black tracking-widest hover:bg-red-500 hover:text-white transition-all mt-4">登出帳號</button>
            </div>
        `,
        showConfirmButton: false, showCloseButton: true
    });
};

window.updateUserAvatar = async function() {
    const { value: url } = await Swal.fire({
        title: '更換專屬頭像',
        input: 'url',
        inputLabel: '請輸入圖片的公開網址 (URL)',
        placeholder: 'https://...',
        showCancelButton: true,
        background: 'rgba(10, 20, 35, 0.95)',
        color: '#fff'
    });

    if (url) {
        Swal.fire({ title: '更新中...', didOpen: () => Swal.showLoading() });
        try {
            const user = window.firebaseApp.auth.currentUser;
            await window.firebaseApp.updateProfile(user, { photoURL: url });
            await window.firebaseApp.updateDoc(window.firebaseApp.doc(window.firebaseApp.db, "users", user.uid), { photoURL: url });
            
            document.getElementById('header-user-avatar').src = url;
            Swal.fire({ toast: true, position: 'top', title: '頭像更新成功', icon: 'success', timer: 1500, showConfirmButton: false });
            window.toggleUserMenu(); 
        } catch(e) { Swal.fire('更新失敗', e.message, 'error'); }
    }
};

function isUserBanned() {
    if (window.userRole === 'banned') {
        if(typeof window.playErrorSound === 'function') window.playErrorSound();
        PremiumSwal.fire({
            title: '存取被拒 🚨',
            html: '<p class="text-sm text-sky-100">您的帳號已被系統管理員封鎖，無法使用基地內部的互動功能。<br>如有疑慮請聯絡 <span class="text-sky-400 font-bold">wangleon26@gmail.com</span></p>',
            icon: 'error',
            confirmButtonColor: '#ef4444',
            confirmButtonText: '關閉'
        });
        return true;
    }
    return false;
}

window.escapeForInlineHandler = function(str) {
    if (!str) return "";
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '\\n').replace(/\r/g, '');
};

// ==========================================================================
// 系統登入與 Auth 模組
// ==========================================================================
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
            
            if (userDoc.exists()) {
                if (userDoc.data().customTitle) window.appSettings.customTitle = userDoc.data().customTitle;
                if (userDoc.data().hasAura) window.appSettings.hasAura = true;
                if (userDoc.data().isTwitchSub) window.appSettings.isTwitchSub = true;
            }

            PremiumSwal.fire({ title: '登入成功', text: `歡迎回來，${displayName}！`, icon: 'success', timer: 1500, showConfirmButton: false }).then(() => {
                window.isLoggedIn = true; window.closeAuthModal(); window.updateHeaderToLoggedIn(displayName);
            });
        } else {
            const result = await window.firebaseApp.createUserWithEmailAndPassword(window.firebaseApp.auth, email, password);
            const finalName = name.trim() || "新粉絲";
            await window.firebaseApp.setDoc(window.firebaseApp.doc(window.firebaseApp.db, "users", result.user.uid), { name: finalName, email: email, exp: 0, role: 'user', createdAt: new Date().toISOString() });
            PremiumSwal.fire({ title: '註冊成功 🎉', text: `歡迎加入基地，${finalName}！`, icon: 'success', timer: 2000, showConfirmButton: false }).then(() => {
                window.isLoggedIn = true; window.closeAuthModal(); window.updateHeaderToLoggedIn(finalName);
            });
        }
    } catch (error) { PremiumSwal.fire({ title: '驗證失敗', text: error.message, icon: 'error' }); }
};
window.loginWithGoogle = async function () {
    if (!window.firebaseApp) return alert("系統載入中，請稍候...");
    try {
        const provider = new window.firebaseApp.GoogleAuthProvider();
        await window.firebaseApp.signInWithPopup(window.firebaseApp.auth, provider);
        window.closeAuthModal();
    } catch (error) {
        if (error.code === 'auth/popup-closed-by-user' || error.message.includes('Cross-Origin')) {
            PremiumSwal.fire({ title: '本地環境限制', html: '<p class="text-sm text-zinc-300">本機端無法使用 Google 登入，上線後即可正常運作。</p>', icon: 'warning' });
        } else {
            PremiumSwal.fire({ title: '登入失敗', text: error.message, icon: 'error' });
        }
    }
};
window.loginAsGuest = async function() {
    PremiumSwal.fire({ title: '進入基地', text: '訪客無積分紀錄。', icon: 'info', timer: 1500, showConfirmButton: false }).then(() => {
        window.isLoggedIn = true; window.closeAuthModal(); 
    });
};
window.updateHeaderToLoggedIn = function (username) {
    document.getElementById('btn-login-trigger').classList.add('hidden');
    const userProfileBtn = document.getElementById('btn-user-profile');
    if(userProfileBtn) { 
        userProfileBtn.classList.remove('hidden'); 
        userProfileBtn.classList.add('flex'); 
        const currentUser = window.firebaseApp?.auth?.currentUser;
        if(currentUser && currentUser.photoURL) {
            document.getElementById('header-user-avatar').src = currentUser.photoURL;
        }
    }
    // 移除了呼叫 loadLeaderboard()，改由 onAuthStateChanged 完成全部資料載入後呼叫，解決同步問題
};
window.logoutUser = async function () {
    try {
        await window.firebaseApp.signOut(window.firebaseApp.auth);
        window.isLoggedIn = false;
        PremiumSwal.fire({ title: '已登出', icon: 'success', timer: 1500, showConfirmButton: false }).then(() => location.reload());
    } catch (error) {}
};
window.handleForgotPassword = function() {
    PremiumSwal.fire({
        title: '<i class="fa-solid fa-key text-sky-400 mb-2 block text-3xl"></i>忘記密碼？',
        html: '<p class="text-sky-100 text-sm mt-2">請聯絡工程師並提供您的<b class="text-sky-400">粉絲編號 (UID)</b> 以核對身分！</p>',
        confirmButtonText: '<i class="fa-solid fa-envelope mr-2"></i>Email 工程師',
        showCancelButton: true, cancelButtonText: '取消'
    }).then((result) => {
        if(result.isConfirmed) window.open('mailto:wangleon26@gmail.com?subject=老王秘密基地 - 密碼重置申請', '_blank');
    });
};

// ==========================================================================
// 🚀 核心同步引擎 (動態搬移與推播版)
// ==========================================================================
window.lastKnownLiveStatus = null; 

async function syncSystemConfig() {
    if (!window.firebaseApp || !window.firebaseApp.db || typeof window.firebaseApp.onSnapshot !== 'function') { 
        setTimeout(syncSystemConfig, 1000); 
        return; 
    }
    
    try {
        const keySnap = await window.firebaseApp.getDoc(window.firebaseApp.doc(window.firebaseApp.db, "system_config", "api_keys"));
        if (keySnap.exists()) {
            const data = keySnap.data();
            dynamicApiKeys.gemini = data.gemini || [];
            dynamicApiKeys.groq = data.groq || [];
        }
        
        const featSnap = await window.firebaseApp.getDoc(window.firebaseApp.doc(window.firebaseApp.db, "system_config", "features"));
        if (featSnap.exists()) systemFeatures = Object.assign(systemFeatures, featSnap.data());

        window.firebaseApp.onSnapshot(
            window.firebaseApp.doc(window.firebaseApp.db, "system_config", "master"),
            (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    
                    const liveBadge = document.getElementById('live-status');
                    if (liveBadge) {
                        if (data.liveStatus) {
                            liveBadge.classList.remove('hidden'); liveBadge.classList.add('flex');
                            if (data.liveUrl) liveBadge.onclick = () => window.open(data.liveUrl, '_blank');
                        } else {
                            liveBadge.classList.add('hidden'); liveBadge.classList.remove('flex');
                        }
                    }

                    // --- 🔴 Twitch 面板渲染邏輯 ---
                    const twBanner = document.getElementById('twitch-live-banner');
                    const twCard = document.getElementById('tw-card-container');
                    const twGlow = document.getElementById('tw-glow');
                    const twOfflineUI = document.getElementById('tw-offline-ui');
                    const twStatusTag = document.getElementById('tw-status-tag');
                    const twTitle = document.getElementById('tw-title');
                    const twAvatarBox = document.getElementById('tw-avatar-box');
                    const twChatPanel = document.getElementById('tw-chat-panel');
                    
                    const topAnchor = document.getElementById('tw-anchor-top');
                    const bottomAnchor = document.getElementById('tw-anchor-bottom');

                    if (twBanner) {
                        if (data.liveStatus && data.twitchData) {
                            // 🔴 【開播狀態】
                            window.currentLiveUrl = data.liveUrl || 'https://twitch.tv/z_knc';

                            if (topAnchor && twBanner.parentElement !== topAnchor) topAnchor.appendChild(twBanner);

                            if (window.lastKnownLiveStatus === false) {
                                if ('Notification' in window && Notification.permission === 'granted') {
                                    new Notification('🔴 老王開播啦！', { body: data.twitchData.title || '點擊馬上進入秘密基地看直播！', icon: 'avatar-main.jpg' });
                                }
                            }
                            window.lastKnownLiveStatus = true;

                            if(twGlow) twGlow.classList.replace('opacity-0', 'opacity-100');
                            if(twCard) {
                                twCard.classList.replace('border-white/10', 'border-purple-500/50');
                                twCard.classList.replace('bg-[#020617]/60', 'bg-[#020617]/90');
                            }
                            if(twOfflineUI) twOfflineUI.classList.add('hidden');
                            if(twAvatarBox) {
                                twAvatarBox.classList.remove('grayscale');
                                twAvatarBox.classList.add('border-purple-500', 'shadow-[0_0_15px_rgba(168,85,247,0.5)]');
                                if(data.twitchData.profileImageUrl) document.getElementById('tw-avatar').src = data.twitchData.profileImageUrl;
                            }
                            if(twStatusTag) {
                                twStatusTag.innerHTML = '<i class="fa-solid fa-tower-broadcast mr-1"></i>LIVE';
                                twStatusTag.className = 'bg-red-500 text-white text-[9px] font-black tracking-widest px-3 py-1.5 rounded-xl animate-pulse';
                            }
                            if(twTitle) {
                                twTitle.innerText = data.twitchData.title || '老王正在直播';
                                twTitle.classList.replace('text-zinc-500', 'text-white');
                            }
                            document.getElementById('tw-viewers-box')?.classList.remove('hidden');
                            if(document.getElementById('tw-viewers')) document.getElementById('tw-viewers').innerText = data.twitchData.viewers || '0';
                            
                            const thumb = document.getElementById('tw-thumbnail');
                            if(thumb) {
                                thumb.classList.remove('opacity-0');
                                thumb.src = data.twitchData.thumbnail.replace('{width}', '800').replace('{height}', '450') + `?t=${Date.now()}`;
                            }
                            
                            if(twChatPanel) twChatPanel.classList.remove('hidden');
                            const chatContainer = document.getElementById('tw-chat-container');
                            if (chatContainer && !chatContainer.innerHTML.includes('iframe')) {
                                const domain = window.location.hostname || 'localhost';
                                chatContainer.innerHTML = `<iframe src="https://www.twitch.tv/embed/z_knc/chat?parent=${domain}&darkpopout" height="100%" width="100%" frameborder="0"></iframe>`;
                            }
                        } else {
                            // ⚪ 【待機狀態】
                            if (bottomAnchor && twBanner.parentElement !== bottomAnchor) bottomAnchor.appendChild(twBanner);
                            if (window.lastKnownLiveStatus === null) window.lastKnownLiveStatus = false;
                            else window.lastKnownLiveStatus = false;

                            if(twGlow) twGlow.classList.replace('opacity-100', 'opacity-0');
                            if(twCard) {
                                twCard.classList.replace('border-purple-500/50', 'border-white/10');
                                twCard.classList.replace('bg-[#020617]/90', 'bg-[#020617]/60');
                            }
                            if(twOfflineUI) twOfflineUI.classList.remove('hidden');
                            if(twAvatarBox) {
                                twAvatarBox.classList.add('grayscale');
                                twAvatarBox.classList.remove('border-purple-500', 'shadow-[0_0_15px_rgba(168,85,247,0.5)]');
                            }
                            if(twStatusTag) {
                                twStatusTag.innerHTML = '<i class="fa-solid fa-moon mr-1"></i>STANDBY';
                                twStatusTag.className = 'bg-zinc-800 text-zinc-400 text-[9px] font-black tracking-widest px-3 py-1.5 rounded-xl border border-white/5';
                            }
                            // 🌟 修正第二點：待機文字不要顯示雷達就緒，明確告知不在線上
                            if(twTitle) {
                                twTitle.innerText = '老王目前不在線上';
                                twTitle.classList.replace('text-white', 'text-zinc-500');
                            }
                            document.getElementById('tw-viewers-box')?.classList.add('hidden');
                            if(document.getElementById('tw-thumbnail')) document.getElementById('tw-thumbnail').classList.add('opacity-0');
                            if(twChatPanel) twChatPanel.classList.add('hidden');
                            if(document.getElementById('tw-chat-container')) document.getElementById('tw-chat-container').innerHTML = '';
                        }
                    }

                    if (data.resetAllLimits && data.resetAllLimits.toString() !== localStorage.getItem('last_limit_reset')) {
                        window.appSettings.aiUsageCount = 0;
                        localStorage.setItem('last_limit_reset', data.resetAllLimits.toString());
                        window.saveSettings();
                    }
                }
            }
        );
    } catch (e) {
        console.error("系統參數同步異常:", e);
    }
}

let announcementsData = [];
async function fetchAnnouncements() {
    if (!window.firebaseApp || !window.firebaseApp.db) { setTimeout(fetchAnnouncements, 500); return; }
    let loadedAnnouncements = [];
    
    try {
        const announceRef = window.firebaseApp.collection(window.firebaseApp.db, "announcements");
        const q = window.firebaseApp.query(announceRef, window.firebaseApp.orderBy("timestamp", "desc"));
        const snapshot = await window.firebaseApp.getDocs(q);
        snapshot.forEach((doc) => {
            const data = doc.data();
            const dateStr = new Date(data.timestamp).toISOString().split('T')[0];
            loadedAnnouncements.push({
                id: doc.id, title: "基地系統通報", date: dateStr, type: "info", isPinned: false, 
                summary: data.content.length > 25 ? data.content.substring(0, 25) + '...' : data.content, image: null,
                content: `<div class="text-left space-y-4 text-sm text-sky-100 mt-2"><p>${data.content.replace(/\n/g, '<br>')}</p><div class="text-xs text-sky-500 mt-4 pt-3 border-t border-sky-500/20 font-mono">發布者: ${data.author}</div></div>`
            });
        });
    } catch(e) {}

    loadedAnnouncements.unshift({
        id: 'anti-theft-warning-001', 
        title: "‼️ 重要公告：TikTok 盜片宣導", 
        date: new Date().toISOString().split('T')[0], 
        type: "warning", 
        isPinned: true, 
        summary: "近期 TikTok 出現盜用老王影片的假帳號，請各位成員認明唯一認證帳號，並協助檢舉！", 
        image: "fake-account.jpg", 
        content: `
            <div class="text-left space-y-4 text-sm text-sky-100 mt-2">
                <p class="text-red-400 font-bold text-base border-b border-red-500/30 pb-2">⚠️ 請各位粉絲注意！</p>
                <p>近期我們發現，在 TikTok 出現<b class="text-white">假冒「老王」的帳號</b>。這支帳號惡意盜用原創影片，試圖進行詐騙。</p>
                <p>老王專屬秘密基地鄭重聲明：</p>
                <ul class="list-disc pl-5 space-y-2 text-sky-200 bg-black/20 p-3 rounded-lg border border-sky-500/20">
                    <li>老王的<b class="text-white">唯一真實帳號</b>僅有主頁連結標示的帳號。</li>
                    <li>老王<b class="text-red-400">絕對不會</b>主動私訊要求粉絲匯款或投資。</li>
                </ul>
                <p>若看到可疑帳號，請<b class="text-red-400">動動手指點擊檢舉</b>。如果不確定，請透過基地客服私訊或是在影片留言！</p>
                <div class="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-center">
                    <span class="text-red-400 font-black tracking-widest text-lg">打擊盜版，守護基地！</span>
                </div>
            </div>`
    });
    announcementsData = loadedAnnouncements; 
    renderAnnouncements(); 
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
            <div class="premium-card p-5 md:p-6 border-l-4 border-l-${colorClass} relative overflow-hidden group cursor-pointer hover:bg-sky-900/20 transition-all duration-300" onclick="window.openAnnouncement('${item.id}')">
                <div class="absolute top-0 right-0 w-32 h-32 bg-${colorClass}/10 rounded-full blur-3xl group-hover:bg-${colorClass}/20 transition-all duration-500"></div>
                <div class="flex flex-col md:flex-row items-start gap-4 relative z-10">
                    <div class="w-12 h-12 rounded-full bg-${colorClass}/10 flex items-center justify-center flex-shrink-0 border border-${colorClass}/30 shadow-[0_0_15px_rgba(${isWarning ? '239,68,68' : '56,189,248'},0.2)] group-hover:scale-110 transition-transform">
                        <i class="fa-solid ${iconClass} text-${colorClass} text-lg"></i>
                    </div>
                    <div class="flex-1 w-full">
                        <div class="flex items-center gap-3 mb-2 flex-wrap">
                            <span class="bg-${colorClass} text-${isWarning ? 'white' : 'sky-950'} text-[10px] font-black px-2 py-1 rounded tracking-widest">${tagText}</span>
                            ${item.isPinned ? `<span class="text-[10px] text-sky-300 font-mono bg-[#040d1a] px-2 py-1 rounded border border-sky-500/30"><i class="fa-solid fa-thumbtack mr-1"></i>置頂</span>` : ''}
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

    if (homeHTML) { homeContainer.innerHTML = `<h3 class="text-sm font-bold text-sky-300 mb-4 tracking-widest pl-2 flex items-center"><i class="fa-solid fa-bullhorn text-red-500 mr-2 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse"></i> 基地最新通報</h3><div class="space-y-4">${homeHTML}</div>`; }
    if (pageHTML) { pageContainer.innerHTML = pageHTML; } else { pageContainer.innerHTML = `<div class="text-center text-sky-200/50 py-12 text-sm bg-black/40 rounded-2xl border border-sky-500/20">目前無任何基地公告</div>`; }
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
            html: `<div class="mt-2 mb-4 text-xs text-sky-200/60 font-mono tracking-widest">${data.date} 發布</div>${imageHTML}<div class="border-t border-sky-500/20 pt-4 text-sky-100 text-left">${data.content}</div>`, 
            showCloseButton: true, confirmButtonText: '已了解狀況', 
            confirmButtonColor: isWarning ? '#ef4444' : '#38bdf8',
            customClass: { confirmButton: isWarning ? 'text-white font-black' : 'text-sky-950 font-black' }
        });
    };

    if (data.image && !window.preloadedImages[data.id]) {
        Swal.fire({ html: `<div class="flex flex-col items-center justify-center p-4"><div class="text-sky-300 font-bold tracking-widest text-sm">影像訊號解密中...</div></div>`, allowOutsideClick: false, showConfirmButton: false, background: 'rgba(6, 14, 26, 0.95)'});
        const img = new Image();
        img.onload = () => { window.preloadedImages[data.id] = img; Swal.close(); setTimeout(showModal, 150); };
        img.onerror = () => { Swal.close(); setTimeout(showModal, 150); };
        img.src = data.image;
    } else { showModal(); }
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
    if (filteredQA.length === 0) { list.innerHTML = '<div class="col-span-1 md:col-span-2 text-center text-sky-200/50 py-12 text-sm bg-black/40 rounded-2xl border border-sky-500/20">找不到相關紀錄...換個關鍵字吧？</div>'; controls.innerHTML = ''; return; }
    
    const perPage = window.appSettings.qaPerPage || 6; const totalPages = Math.ceil(filteredQA.length / perPage); const start = (page - 1) * perPage; const currentItems = filteredQA.slice(start, start + perPage);
    
    currentItems.forEach((item, index) => {
        const delay = index * 0.05;
        const safeA = window.escapeForInlineHandler(item.a);
        list.innerHTML += `
            <div class="premium-card p-6 cursor-pointer flex flex-col justify-between group hover:bg-sky-900/30 transition-all duration-300" style="animation: cinematicReveal 0.5s ease backwards; animation-delay: ${delay}s;" onclick="showAnswer(event, '${safeA}')">
                <div class="flex items-center gap-3 mb-4"><div class="w-7 h-7 rounded-full bg-[#040d1a] border border-sky-500/40 text-sky-400 flex items-center justify-center font-black text-[11px] shadow-[0_0_10px_rgba(56,189,248,0.3)] group-hover:scale-110 transition-transform">Q</div></div>
                <h3 class="font-bold text-sky-100 text-sm pr-8 leading-relaxed group-hover:text-sky-300 transition-colors">${item.q}</h3>
            </div>`;
    });
    
    controls.innerHTML = `
        <button onclick="window.changePageTo(1)" class="w-10 h-10 rounded-xl bg-black/40 border border-sky-500/30 text-sky-300 disabled:opacity-30 hover:bg-sky-500/20 flex items-center justify-center" ${page === 1 ? 'disabled' : ''}><i class="fa-solid fa-angles-left"></i></button>
        <button onclick="window.changePageTo(${page - 1})" class="w-10 h-10 rounded-xl bg-black/40 border border-sky-500/30 text-sky-300 disabled:opacity-30 hover:bg-sky-500/20 flex items-center justify-center" ${page === 1 ? 'disabled' : ''}><i class="fa-solid fa-angle-left"></i></button>
        <span class="text-sky-200 font-bold text-xs px-4 py-2">第 ${page} 頁 / 共 ${totalPages} 頁</span>
        <button onclick="window.changePageTo(${page + 1})" class="w-10 h-10 rounded-xl bg-black/40 border border-sky-500/30 text-sky-300 disabled:opacity-30 hover:bg-sky-500/20 flex items-center justify-center" ${page === totalPages ? 'disabled' : ''}><i class="fa-solid fa-angle-right"></i></button>
        <button onclick="window.changePageTo(${totalPages})" class="w-10 h-10 rounded-xl bg-black/40 border border-sky-500/30 text-sky-300 disabled:opacity-30 hover:bg-sky-500/20 flex items-center justify-center" ${page === totalPages ? 'disabled' : ''}><i class="fa-solid fa-angles-right"></i></button>`;
};

window.changePageTo = function(p) { window.playClickSound(); currentPage = p; window.renderQA(p); window.scrollTo({top: document.getElementById('qa-search').offsetTop - 20, behavior: 'smooth'}); };

window.showAnswer = function(e, ans) { 
    if(e.target.closest('button')) return; 
    window.playClickSound(); window.gainExp(2, true); 
    PremiumSwal.fire({ 
        html: `<div class="text-left"><div class="text-xs text-sky-400 font-black mb-4 flex items-center gap-2 border-b border-sky-500/30 pb-2"><i class="fa-solid fa-comment-dots"></i> 系統解析結果</div><div class="text-base text-sky-100 leading-relaxed font-medium">${ans}</div></div>`, 
        showConfirmButton: false, timer: 5000, timerProgressBar: true 
    }); 
};

window.dailyCheckIn = async function() {
    if(isUserBanned()) return;
    if (!window.isLoggedIn) return PremiumSwal.fire('請先登入', '必須登入正式帳號才能簽到喔！', 'warning');
    
    const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
    if (window.appSettings.lastCheckIn === today) return PremiumSwal.fire('今日已簽到', '明天再來吧！', 'info');

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });

    if (window.appSettings.lastCheckIn === yesterdayStr) {
        window.appSettings.streakCount = (window.appSettings.streakCount || 0) + 1;
    } else {
        window.appSettings.streakCount = 1;
    }

    window.appSettings.lastCheckIn = today;
    window.appSettings.checkInCount = (window.appSettings.checkInCount || 0) + 1;
    
    const bonus = window.appSettings.streakCount >= 7 ? 100 : 30;
    const reason = window.appSettings.streakCount >= 7 ? "🔥 達成連續簽到 7 天獎勵！" : `每日簽到獎勵 (連簽第 ${window.appSettings.streakCount} 天)`;
    
    window.gainExp(bonus, false, reason);
    window.saveSettings();
};

window.gachaQuote = window.gachaQuote || function() {
    if(isUserBanned()) return;
    if (!window.isLoggedIn) return PremiumSwal.fire('請先登入', '必須登入正式帳號才能抽卡喔！', 'warning');
    if ((window.appSettings.exp || 0) < 20) return PremiumSwal.fire('EXP 不足', '抽卡需要 20 EXP 喔！去跟 AI 聊天或簽到賺取積分吧！', 'warning');
    
    window.gainExp(-20, true, "消耗積分解密檔案");
    window.appSettings.gachaCount = (window.appSettings.gachaCount || 0) + 1;
    window.saveSettings();

    PremiumSwal.fire({ title: '信號解密中...', didOpen: () => Swal.showLoading(), timer: 1000, showConfirmButton: false, background: 'rgba(10,16,28,0.95)', color: '#fff' }).then(() => {
        const db = typeof qaData !== 'undefined' ? qaData : [];
        const randomQA = (db && db.length > 0) ? db[Math.floor(Math.random() * db.length)] : {q: "神秘彩蛋", a: "目前題庫尚未載入"};
        PremiumSwal.fire({
            title: '✨ 獲得專屬檔案 ✨',
            html: `<div class="text-left bg-white/5 p-4 rounded-xl border border-white/10"><p class="text-sky-400 font-bold mb-2 border-b border-white/10 pb-2"><i class="fa-solid fa-q"></i> ${randomQA.q}</p><p class="text-white text-sm leading-relaxed">${randomQA.a}</p></div>`,
            confirmButtonText: '收下檔案'
        });
    });
};

window.generateIDCard = function() {
    if(isUserBanned()) return;
    const nameInput = document.getElementById('id-name').value.trim() || "老王的粉絲";
    window.playClickSound();
    
    let userIdStr = "GUEST";
    let userSince = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
    const currentUser = window.firebaseApp?.auth?.currentUser;
    const userAvatar = currentUser?.photoURL || "avatar-main.jpg";

    if (currentUser && !currentUser.isAnonymous) userIdStr = currentUser.uid.slice(0, 8).toUpperCase();
    else userSince = "訪客 (GUEST)";

    const cardHtml = `
        <div class="relative w-full max-w-[340px] mx-auto rounded-[36px] overflow-hidden p-6 border border-sky-400/50 shadow-[0_0_40px_rgba(56,189,248,0.5)]" style="background: radial-gradient(circle at 50% 10%, rgba(14,165,233,0.4) 0%, #020617 70%);">
            <div class="absolute top-6 left-6 w-8 h-8 border-t-4 border-l-4 border-sky-400"></div>
            <div class="absolute bottom-6 right-6 w-8 h-8 border-b-4 border-r-4 border-amber-400"></div>
            <div class="relative z-10 flex flex-col items-center pt-4">
                <h3 class="text-sky-200/80 font-black tracking-[0.4em] text-[10px] mb-1 uppercase">Lao Wang Secret Base</h3>
                <h4 class="text-sky-400 font-black tracking-widest text-lg mb-8 drop-shadow-md">老王專屬秘密基地 核心粉絲認證</h4>
                <div class="w-32 h-32 rounded-full border-4 border-[#bae6fd] p-1 mb-6 shadow-[0_0_30px_rgba(56,189,248,0.6)] relative">
                    <img src="${userAvatar}" onerror="this.src='https://ui-avatars.com/api/?name=王&background=020617&color=38bdf8'" class="w-full h-full rounded-full object-cover">
                    <div class="absolute bottom-1 right-1 w-8 h-8 bg-gradient-to-br from-sky-400 to-blue-500 rounded-full border-2 border-[#020617] flex items-center justify-center text-[#020617]"><i class="fa-solid fa-check text-xs"></i></div>
                </div>
                <h2 class="text-3xl font-black text-white tracking-widest drop-shadow-[0_0_15px_rgba(56,189,248,0.8)] mb-8 truncate w-full px-2">${nameInput}</h2>
                <div class="w-full bg-sky-950/40 rounded-2xl p-4 text-left border border-sky-500/30 backdrop-blur-sm relative overflow-hidden">
                    <p class="text-[10px] text-sky-300 font-bold mb-1 tracking-widest uppercase">粉絲編號 (UID)</p>
                    <p class="text-sm text-white font-mono font-black mb-3 tracking-wider">WANG-${userIdStr}</p>
                    <p class="text-[10px] text-sky-300 font-bold mb-1 tracking-widest uppercase">核發日期 (DATE)</p>
                    <p class="text-sm text-white font-mono font-black tracking-wider">${userSince}</p>
                </div>
            </div>
        </div>`;

    PremiumSwal.fire({
        html: cardHtml, showCloseButton: true, confirmButtonText: '完成認證',
        footer: '<p class="text-xs text-sky-200/60 tracking-wider">💡 手機用戶可直接長按上方卡片或截圖來儲存您的專屬身分卡</p>'
    });
    
    setTimeout(() => { if(typeof window.gainExp === 'function') window.gainExp(15, true, "生成專屬粉絲認證"); }, 500);
};

// ==========================================================================
// 🏆 基地傳奇成就與徽章系統
// ==========================================================================
window.ACHIEVEMENTS_DB = [
    { id: 'new_blood', name: '初來乍到', desc: '成功註冊並進入秘密基地', icon: 'fa-seedling', colorClass: 'text-emerald-400', bgClass: 'badge-tier-bronze', borderClass: 'border-emerald-500/30', condition: () => window.isLoggedIn },
    { id: 'exp_hunter', name: '積分獵人', desc: '累積獲得超過 100 EXP', icon: 'fa-star', colorClass: 'text-amber-400', bgClass: 'badge-tier-silver', borderClass: 'border-amber-500/30', condition: () => (window.appSettings && window.appSettings.exp >= 100) },
    { id: 'streak_master', name: '鐵粉之魂', desc: '連續簽到達到 7 天', icon: 'fa-fire-flame-curved', colorClass: 'text-rose-400', bgClass: 'badge-tier-gold', borderClass: 'border-rose-500/50', condition: () => (window.appSettings && window.appSettings.streakCount >= 7) },
    { id: 'rich_member', name: '基地大老', desc: '累積獲得超過 500 EXP', icon: 'fa-crown', colorClass: 'text-yellow-400', bgClass: 'badge-tier-gold', borderClass: 'border-yellow-500/50', condition: () => (window.appSettings && window.appSettings.exp >= 500) },
    { id: 'guardian', name: '基地守護者', desc: '累積獲得超過 1000 EXP，尊榮無限特權', icon: 'fa-shield-halved', colorClass: 'text-red-400', bgClass: 'badge-tier-legendary', borderClass: 'border-red-500/50', condition: () => (window.appSettings && window.appSettings.exp >= 1000) },
    { id: 'ai_talker', name: 'AI 溝通大師', desc: '曾使用 AI 助手進行對話', icon: 'fa-microchip', colorClass: 'text-purple-400', bgClass: 'bg-purple-500/10', borderClass: 'border-purple-500/30', condition: () => (window.appSettings && window.appSettings.aiUsageCount > 0) },
    { id: 'night_owl', name: '夜貓子', desc: '在凌晨 1 點到 4 點間活躍', icon: 'fa-moon', colorClass: 'text-indigo-400', bgClass: 'bg-indigo-500/10', borderClass: 'border-indigo-500/30', condition: () => { const h = new Date().getHours(); return h >= 1 && h <= 4; } },
    { id: 'checkin_master', name: '簽到達人', desc: '在基地累積簽到 7 次', icon: 'fa-calendar-check', colorClass: 'text-teal-400', bgClass: 'bg-teal-500/10', borderClass: 'border-teal-500/30', condition: () => (window.appSettings && window.appSettings.checkInCount >= 7) },
    { id: 'gacha_luck', name: '幸運解密者', desc: '使用過神秘檔案庫抽卡解密', icon: 'fa-ticket', colorClass: 'text-pink-400', bgClass: 'bg-pink-500/10', borderClass: 'border-pink-500/30', condition: () => (window.appSettings && window.appSettings.gachaCount > 0) },
    { id: 'quiz_god', name: '學霸鐵粉', desc: '在鐵粉測驗中獲得完美滿分 (100分)', icon: 'fa-graduation-cap', colorClass: 'text-orange-400', bgClass: 'badge-tier-gold', borderClass: 'border-orange-500/50', condition: () => (window.appSettings && window.appSettings.quizPerfect > 0) },
    { id: 'tech_pioneer', name: '視覺先驅', desc: '曾傳送圖片給 AI 視覺神經進行分析', icon: 'fa-eye', colorClass: 'text-cyan-400', bgClass: 'bg-cyan-500/10', borderClass: 'border-cyan-500/30', condition: () => (window.appSettings && window.appSettings.aiVisionCount > 0) }
];

window.renderBadges = function() {
    const container = document.getElementById('badges-container');
    if (!container) return;
    if (!window.isLoggedIn) {
        container.innerHTML = '<div class="text-xs text-zinc-500 font-mono w-full text-center border border-white/5 rounded-xl py-3 bg-black/40">登入後解鎖成就徽章</div>';
        return;
    }

    let html = ''; let unlockedCount = 0;
    window.ACHIEVEMENTS_DB.forEach(badge => {
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
    if (unlockedCount === 0) html = '<div class="text-xs text-zinc-500 font-mono w-full text-center border border-white/5 rounded-xl py-3 bg-black/40">持續探索基地來解鎖徽章</div>';
    container.innerHTML = html;
};

window.showBadgeDetail = function(name, desc, icon, colorClass, isUnlocked) {
    if(typeof window.playClickSound === 'function') window.playClickSound();
    let actionHtml = isUnlocked ? `<button onclick="window.generateAchievementCard('${name}', '${desc}')" class="w-full mt-5 bg-gradient-to-r from-sky-400 to-blue-500 text-sky-950 font-black py-3 rounded-xl shadow-[0_0_15px_rgba(56,189,248,0.4)] hover:scale-105 transition-transform tracking-widest"><i class="fa-solid fa-download mr-2"></i>生成專屬成就卡</button>` : `<div class="mt-5 text-xs text-red-400 font-mono bg-red-500/10 py-2.5 rounded-xl border border-red-500/20 tracking-widest"><i class="fa-solid fa-lock mr-1"></i>尚未達成解鎖條件</div>`;
    PremiumSwal.fire({
        title: `<div class="w-20 h-20 mx-auto rounded-full flex items-center justify-center border-4 border-current ${colorClass} bg-current/10 mb-4 shadow-[0_0_30px_currentColor]"><i class="fa-solid ${icon} text-3xl"></i></div>`,
        html: `<h3 class="text-xl font-black text-white tracking-widest mb-2">${name}</h3><p class="text-sky-200/70 text-sm font-mono tracking-wider">${desc}</p>${actionHtml}`,
        showConfirmButton: false, showCloseButton: true
    });
};

window.generateAchievementCard = function(badgeName, badgeDesc) {
    if(typeof window.playClickSound === 'function') window.playClickSound();
    Swal.fire({ title: '成就卡片生成中...', didOpen: () => Swal.showLoading(), background: 'rgba(10,20,35,0.95)' });
    const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1080; const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#020617'; ctx.fillRect(0, 0, 1080, 1080);
    const grad = ctx.createRadialGradient(540, 540, 100, 540, 540, 800);
    grad.addColorStop(0, 'rgba(56, 189, 248, 0.3)'); grad.addColorStop(1, '#020617'); ctx.fillStyle = grad; ctx.fillRect(0, 0, 1080, 1080);
    ctx.strokeStyle = 'rgba(56,189,248,0.5)'; ctx.lineWidth = 8; ctx.strokeRect(50, 50, 980, 980); ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 4; ctx.strokeRect(80, 80, 60, 60);
    ctx.textAlign = "center"; ctx.fillStyle = '#bae6fd'; ctx.font = '900 50px "SF Pro Display", sans-serif'; ctx.letterSpacing = "15px"; ctx.fillText('老王秘密基地 · 粉絲認證', 540, 250);
    ctx.fillStyle = '#FFFFFF'; ctx.font = '900 130px "SF Pro Display", sans-serif'; ctx.shadowColor = 'rgba(56, 189, 248, 0.8)'; ctx.shadowBlur = 30; ctx.fillText(badgeName, 540, 540); ctx.shadowBlur = 0;
    ctx.fillStyle = '#7dd3fc'; ctx.font = 'bold 45px monospace'; ctx.fillText(`任務達成：${badgeDesc}`, 540, 680);
    const currentUser = window.firebaseApp?.auth?.currentUser; let userIdStr = currentUser && !currentUser.isAnonymous ? currentUser.uid.slice(0, 6).toUpperCase() : "訪客";
    const dateStr = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Taipei' }).replace(/\//g, '.');
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = 'bold 35px monospace'; ctx.fillText(`UNLOCKED BY: WANG-${userIdStr}`, 540, 880); ctx.fillText(`DATE: ${dateStr}`, 540, 950);
    setTimeout(() => { PremiumSwal.fire({ title: '成就卡片已核發 🎉', html: '<p class="text-sm text-sky-200 mb-2">專屬榮耀已生成，請長按或右鍵儲存圖片！</p>', imageUrl: canvas.toDataURL('image/jpeg', 0.95), imageWidth: '90%', customClass: { image: 'rounded-3xl shadow-[0_0_40px_rgba(56,189,248,0.5)] border-2 border-sky-400' }, confirmButtonText: '收下榮耀' }); }, 500);
};

// ==========================================================================
// 🌟 積分商城與 UI 渲染
// ==========================================================================
window.updateExpUI = function() {
    const exp = window.appSettings?.exp || 0;
    const customTitle = window.appSettings?.customTitle || "";
    const expText = document.getElementById('exp-text');
    const expBar = document.getElementById('exp-bar');
    const levelTitle = document.getElementById('level-title');

    if (expText) expText.innerText = `${exp} EXP`;

    let title = "訪客"; let progress = 0;
    if (exp >= 100000) { title = "傳奇守護神"; progress = 100; } 
    else if (exp >= 10000) { title = "守護元老"; progress = ((exp - 10000) / 90000) * 100; } 
    else if (exp >= 1000) { title = "鐵粉大老"; progress = ((exp - 1000) / 9000) * 100; } 
    else if (exp >= 100) { title = "正式粉絲"; progress = ((exp - 100) / 900) * 100; } 
    else if (window.isLoggedIn) { title = "新粉"; progress = (exp / 100) * 100; }

    if (customTitle) {
        title = `<span class="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-orange-500 drop-shadow-[0_0_10px_rgba(251,191,36,0.6)] font-black tracking-widest text-2xl flex items-center gap-2"><i class="fa-solid fa-crown text-amber-400 text-lg"></i> ${customTitle}</span>`;
    }

    if (levelTitle) levelTitle.innerHTML = title;
    if (expBar) expBar.style.width = `${progress}%`;
    if (typeof window.renderBadges === 'function') window.renderBadges();
};

window.openExpStore = function() {
    if(isUserBanned()) return;
    if (!window.isLoggedIn) return PremiumSwal.fire('未授權', '請先登入正式帳號以存取兌換所。', 'warning');
    const currentExp = window.appSettings.exp || 0;
    
    PremiumSwal.fire({
        title: '<div class="w-20 h-20 mx-auto bg-amber-500/10 border-4 border-amber-500/30 rounded-3xl flex items-center justify-center shadow-[0_0_30px_rgba(251,191,36,0.3)] mb-4"><i class="fa-solid fa-store text-amber-400 text-4xl"></i></div>基地積分兌換所',
        html: `
            <p class="text-sky-200/80 text-sm mb-5 font-mono tracking-widest">目前擁有: <b class="text-sky-400 text-lg">${currentExp}</b> EXP</p>
            <div class="text-left space-y-4">
                <div class="bg-black/40 border border-sky-500/30 p-4 rounded-2xl flex justify-between items-center group hover:border-sky-400 transition-colors">
                    <div>
                        <div class="text-white font-bold tracking-widest text-sm mb-1"><i class="fa-solid fa-bolt text-sky-400 mr-2"></i>排行榜專屬流光</div>
                        <div class="text-xs text-zinc-400 font-mono">讓你的名字在排行榜上發光</div>
                    </div>
                    <button onclick="window.buyAura()" class="bg-sky-500/10 text-sky-400 font-black px-4 py-2.5 rounded-xl border border-sky-500/30 hover:bg-sky-500 hover:text-white transition-all text-xs flex-shrink-0 shadow-md">500 EXP</button>
                </div>
                <div class="bg-black/40 border border-amber-500/30 p-4 rounded-2xl flex justify-between items-center group hover:border-amber-400 transition-colors">
                    <div>
                        <div class="text-white font-bold tracking-widest text-sm mb-1"><i class="fa-solid fa-tag text-amber-400 mr-2"></i>自訂專屬稱號</div>
                        <div class="text-xs text-zinc-400 font-mono">設定你專屬的粉絲名牌</div>
                    </div>
                    <button onclick="window.buyCustomTitle()" class="bg-amber-500/10 text-amber-400 font-black px-4 py-2.5 rounded-xl border border-amber-500/30 hover:bg-amber-500 hover:text-white transition-all text-xs flex-shrink-0 shadow-md">300 EXP</button>
                </div>
                <div class="bg-black/40 border border-purple-500/30 p-4 rounded-2xl flex justify-between items-center group hover:border-purple-400 transition-colors">
                    <div>
                        <div class="text-white font-bold tracking-widest text-sm mb-1"><i class="fa-solid fa-dice text-purple-400 mr-2"></i>命運盲盒轉盤</div>
                        <div class="text-xs text-zinc-400 font-mono">試試手氣，最高贏得 500 EXP</div>
                    </div>
                    <button onclick="window.playExpGamble()" class="bg-purple-500/10 text-purple-400 font-black px-4 py-2.5 rounded-xl border border-purple-500/30 hover:bg-purple-500 hover:text-white transition-all text-xs flex-shrink-0 shadow-md">100 EXP</button>
                </div>
            </div>
        `,
        showConfirmButton: true, confirmButtonText: '離開兌換所'
    });
};

window.buyAura = async function() {
    if (window.appSettings.hasAura) return Swal.fire('已經擁有', '你已經解鎖過流光特效囉！', 'info');
    if ((window.appSettings.exp || 0) < 500) return Swal.fire('餘額不足', '你的 EXP 不夠兌換這個項目喔，快去解任務吧！', 'warning');
    
    const res = await Swal.fire({ title: '確認兌換?', text: '將從你的帳戶扣除 500 EXP。', icon: 'question', showCancelButton: true, confirmButtonText: '確認購買', customClass: { confirmButton: 'bg-gradient-to-r from-sky-400 to-blue-500 text-sky-950 font-black px-6 py-2 rounded-xl' } });
    if(res.isConfirmed) {
        window.appSettings.hasAura = true; window.gainExp(-500, true, "兌換：排行榜流光特效");
        if (window.firebaseApp?.auth?.currentUser) await window.firebaseApp.updateDoc(window.firebaseApp.doc(window.firebaseApp.db, "users", window.firebaseApp.auth.currentUser.uid), { hasAura: true });
        Swal.fire('兌換成功', '去看看你在排行榜上的專屬特效吧！', 'success');
        if(typeof window.loadLeaderboard === 'function') window.loadLeaderboard();
    }
};

window.buyCustomTitle = async function() {
    if ((window.appSettings.exp || 0) < 300) return Swal.fire('餘額不足', '你的 EXP 不夠兌換這個項目喔！', 'warning');
    const { value: title } = await Swal.fire({ title: '輸入你的專屬稱號', input: 'text', inputPlaceholder: '例如：基地守護大將', inputAttributes: { maxlength: 10 }, showCancelButton: true, confirmButtonText: '花費 300 EXP 購買', customClass: { confirmButton: 'bg-gradient-to-r from-amber-400 to-orange-500 text-black font-black px-6 py-2 rounded-xl' } });
    if (title) {
        const blacklist = ['老王', '工程師', '管理員', '官方', 'WANG', 'ADMIN'];
        if (blacklist.some(word => title.toUpperCase().includes(word))) {
            return Swal.fire('非法稱號', '這個稱號被系統禁用了喔！請換一個吧。', 'error');
        }
        window.appSettings.customTitle = title; window.gainExp(-300, true, "兌換：自訂專屬稱號");
        if (window.firebaseApp?.auth?.currentUser) await window.firebaseApp.updateDoc(window.firebaseApp.doc(window.firebaseApp.db, "users", window.firebaseApp.auth.currentUser.uid), { customTitle: title });
        Swal.fire('設定成功', `你現在的稱號是「${title}」了！`, 'success');
        if(typeof window.updateExpUI === 'function') window.updateExpUI();
    }
};

window.playExpGamble = async function() {
    if ((window.appSettings.exp || 0) < 100) return Swal.fire('餘額不足', '連買盲盒的 100 EXP 都沒有了嗎 😢', 'warning');
    const res = await Swal.fire({ title: '放手一搏？', text: '將扣除 100 EXP，你準備好了嗎？', icon: 'warning', showCancelButton: true, confirmButtonText: '轉動命運', confirmButtonColor: '#a855f7' });
    if(res.isConfirmed) {
        window.gainExp(-100, true, "消耗：命運盲盒轉盤");
        Swal.fire({ title: '轉盤啟動中...', html: '<i class="fa-solid fa-dice text-6xl text-purple-400 animate-spin my-6"></i>', showConfirmButton: false, allowOutsideClick: false });
        setTimeout(() => {
            const rand = Math.random(); let prize = 0; let msg = ""; let icon = 'error';
            if (rand < 0.1) { prize = 500; msg = "太神啦！抽中 500 EXP 超級大獎！"; icon = 'success'; }
            else if (rand < 0.3) { prize = 200; msg = "運氣不錯，獲得 200 EXP！回本啦！"; icon = 'success'; }
            else if (rand < 0.6) { prize = 50; msg = "只抽到了 50 EXP... 小虧一點。"; icon = 'info'; }
            else { prize = 0; msg = "槓龜！什麼都沒有，再接再厲吧 😂"; icon = 'error'; }
            if(prize > 0) window.gainExp(prize, true, "獲得：轉盤獎金");
            Swal.fire({ title: prize > 0 ? '恭喜中獎！' : '好可惜...', text: msg, icon: icon, confirmButtonText: '確定' });
        }, 1500);
    }
};

window.loadLeaderboard = async function () {
    if (!window.firebaseApp || !window.firebaseApp.auth.currentUser) return;
    const currentUser = window.firebaseApp.auth.currentUser;
    let currentExp = window.appSettings ? (window.appSettings.exp || 0) : 0;
    
    const lockElement = document.getElementById('leaderboard-lock');
    const listElement = document.getElementById('leaderboard-list');
    const myRankPos = document.getElementById('my-rank-position');

    const myRankName = document.getElementById('my-rank-name');
    const myRankExp = document.getElementById('my-rank-exp');
    const myRankAvatar = document.getElementById('my-rank-avatar');
    
    if (myRankName) {
        // 🌟 處理自己的 Twitch 乾爹狀態
        let myTwitchBadge = window.appSettings.isTwitchSub ? `<i class="fa-brands fa-twitch text-purple-400 ml-1.5 text-xs drop-shadow-[0_0_5px_rgba(168,85,247,0.6)]" title="Twitch 乾爹"></i>` : '';
        let baseName = window.appSettings.customTitle ? `<span class="text-amber-400 font-black"><i class="fa-solid fa-crown mr-1"></i>${window.appSettings.customTitle}</span>` : (currentUser.displayName || "老王鐵粉");
        myRankName.innerHTML = baseName + myTwitchBadge;
    }
    if (myRankExp) myRankExp.innerText = `${currentExp} EXP`;
    if (myRankAvatar) myRankAvatar.src = currentUser.photoURL || `https://ui-avatars.com/api/?name=${currentUser.displayName || 'Me'}&background=111&color=38bdf8`;

    if (currentUser.isAnonymous || currentExp < 300) {
        if (lockElement) lockElement.style.display = 'flex';
        if (listElement) listElement.innerHTML = '';
    } else {
        if (lockElement) lockElement.style.display = 'none';
        if (listElement) {
            listElement.innerHTML = `
                <div class="text-center py-8 animate-pulse">
                    <div class="relative w-16 h-16 mx-auto mb-4">
                        <div class="absolute inset-0 border-4 border-sky-500/30 border-t-sky-400 rounded-full animate-spin"></div>
                        <i class="fa-solid fa-satellite-dish text-sky-400 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-xl"></i>
                    </div>
                    <span class="text-sky-400 font-bold tracking-widest text-sm">V-CORE 引擎同步中...</span>
                </div>`;
        }

        try {
            const usersRef = window.firebaseApp.collection(window.firebaseApp.db, "users");
            const q = window.firebaseApp.query(usersRef, window.firebaseApp.orderBy("exp", "desc"), window.firebaseApp.limit(10));
            const querySnapshot = await window.firebaseApp.getDocs(q);

            let html = ''; let rank = 1; let foundMe = false;

            if (querySnapshot.empty) {
                html = '<div class="text-center text-sky-200/50 py-8 bg-black/40 rounded-2xl border border-sky-500/20">目前基地尚無排名資料</div>';
            } else {
                querySnapshot.forEach((docSnap) => {
                    const data = docSnap.data();
                    const isMe = docSnap.id === currentUser.uid;
                    if (isMe) { foundMe = true; if (myRankPos) myRankPos.innerText = `第 ${rank} 名`; }
                    
                    let rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : '';
                    let avatarUrl = data.photoURL || `https://ui-avatars.com/api/?name=${data.name || 'User'}&background=111&color=38bdf8`;
                    
                    // 🌟 顯示 Twitch 乾爹認證標章
                    let twitchBadge = data.isTwitchSub ? `<i class="fa-brands fa-twitch text-purple-400 ml-1.5 text-[11px] drop-shadow-[0_0_5px_rgba(168,85,247,0.6)]" title="Twitch 乾爹"></i>` : '';
                    let nameHtml = (data.name || "未命名") + twitchBadge;
                    
                    let cardClass = rankClass;

                    if (data.customTitle) nameHtml += ` <span class="inline-block text-[9px] bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-400 px-2 py-0.5 rounded font-black ml-2 border border-amber-500/40 shadow-sm align-middle tracking-widest"><i class="fa-solid fa-crown mr-1"></i>${data.customTitle}</span>`;
                    if (data.hasAura) cardClass += ` aura-effect`; 

                    html += `
                    <div class="glass-element rank-card ${cardClass} p-4 rounded-2xl flex items-center justify-between mb-3 ${isMe ? 'border-sky-400 shadow-[0_0_15px_rgba(56,189,248,0.5)] scale-105' : ''} animate-[smoothReveal_0.5s_ease_backwards]" style="animation-delay: ${rank * 0.05}s;">
                        <div class="flex items-center gap-4">
                            <div class="w-8 text-center text-xl font-black ${rank <= 3 ? 'text-white drop-shadow-md' : 'text-sky-200/50'}">${rank}</div>
                            <div class="w-10 h-10 rounded-full border-2 border-sky-500/30 overflow-hidden bg-black flex-shrink-0"><img src="${avatarUrl}" class="w-full h-full object-cover"></div>
                            <div class="font-bold ${isMe ? 'text-sky-400' : 'text-white'} leading-tight">${nameHtml}</div>
                        </div>
                        <div class="text-right flex-shrink-0 ml-2"><div class="text-[12px] font-black ${rank <= 3 ? 'text-white' : 'text-sky-400'}">${data.exp || 0} EXP</div></div>
                    </div>`;
                    rank++;
                });
            }
            
            if (!foundMe && myRankPos) myRankPos.innerText = "10名外";
            if (listElement) listElement.innerHTML = html;

            if (!window.hasShownRankFixToast) {
                Swal.fire({ toast: true, position: 'top', icon: 'success', title: '排行榜訊號已重新連線', showConfirmButton: false, timer: 2000, background: 'rgba(10,20,35,0.95)', color: '#fff' });
                window.hasShownRankFixToast = true;
            }

        } catch (error) {
            console.error("排行榜讀取失敗:", error);
            if (listElement) {
                listElement.innerHTML = `
                    <div class="text-center text-amber-400 py-8 bg-amber-500/10 rounded-2xl border border-amber-500/30 shadow-[0_0_15px_rgba(251,191,36,0.2)]">
                        <i class="fa-solid fa-triangle-exclamation text-3xl mb-3 block animate-pulse"></i>
                        <span class="font-black tracking-widest block mb-1">訊號干擾，無法載入名次</span>
                        <span class="text-xs text-amber-400/70">請聯絡管理員確認資料庫狀態。<br><span class="opacity-50">${error.message.substring(0, 20)}...</span></span>
                    </div>`;
            }
        }
    }
}

// ==========================================================================
// 💡 時間軸動畫 (v24.1.7: IntersectionObserver)
// ==========================================================================
window.initTimelineAnimation = function() {
    const timelineData = [
        { date: "2024.06.02", title: "初次亮相", desc: "在 TikTok 上發佈了第 1 則貼文，夢想啟航。", icon: "fa-rocket", color: "#7dd3fc", shadow: "rgba(125,211,252,0.5)" },
        { date: "2024.06.07", title: "萬粉達成", desc: "發佈了 4 則貼文，每則平均 18.3 萬次觀看。", icon: "fa-users", color: "#38bdf8", shadow: "rgba(56,189,248,0.5)" },
        { date: "2024.12.04", title: "十萬里程碑", desc: "32 則貼文，平均 28.5 萬次觀看。人氣急升！", icon: "fa-fire", color: "#0ea5e9", shadow: "rgba(14,165,233,0.5)" },
        { date: "2026.03.01", title: "秘密基地落成", desc: "專屬網站完成測試，正式上線，有了屬於老王的個人網頁。", icon: "fa-globe", color: "#0284c7", shadow: "rgba(2,132,199,0.5)" }
    ];

    const wrapper = document.getElementById('timeline-wrapper');
    const container = document.getElementById('timeline-nodes-container');
    if(!wrapper || !container) return;

    container.innerHTML = timelineData.map((item, index) => `
        <div class="timeline-item flex items-center w-full group relative" id="tl-item-${index}">
            <div class="timeline-dot z-10" id="tl-dot-${index}"></div>
            <div class="timeline-node-card w-[calc(100%-50px)] ml-[50px] relative z-10 opacity-0 scale-90 translate-x-6 transition-all duration-[600ms] ease-out" id="tl-card-${index}">
                <div class="flex items-center gap-4 mb-4">
                    <div class="w-10 h-10 md:w-12 md:h-12 rounded-2xl flex items-center justify-center border text-lg md:text-xl shadow-lg" style="background-color:${item.color}15;border-color:${item.color}40;color:${item.color};box-shadow:0 0 15px ${item.shadow}"><i class="fa-solid ${item.icon}"></i></div>
                    <span class="text-xs font-mono font-bold tracking-[0.15em] bg-[#020617]/80 px-3 py-1.5 rounded-xl border" style="color:${item.color};border-color:${item.color}40;">${item.date}</span>
                </div>
                <h3 class="text-xl sm:text-2xl font-black text-white mb-2 tracking-wide" style="text-shadow:0 0 10px ${item.shadow}">${item.title}</h3>
                <p class="text-[14px] sm:text-[15px] text-sky-100/80 leading-relaxed font-medium">${item.desc}</p>
            </div>
        </div>
    `).join('');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const idx = entry.target.id.split('-').pop();
                const dot = document.getElementById(`tl-dot-${idx}`); 
                const card = document.getElementById(`tl-card-${idx}`); 
                const data = timelineData[idx];
                
                entry.target.classList.add('lit');
                
                if(dot){
                    dot.style.transition = 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
                    dot.style.background = '#fff'; dot.style.borderColor = data.color;
                    dot.style.boxShadow = `0 0 20px 4px ${data.shadow}, 0 0 40px ${data.color}`;
                    dot.style.transform = 'translate(-50%, -50%) scale(1.6)';
                    setTimeout(() => { dot.style.transform = 'translate(-50%, -50%) scale(1)'; }, 300);
                }
                if(card){
                    card.classList.remove('opacity-0', 'scale-90', 'translate-x-6');
                    card.classList.add('opacity-100', 'scale-100', 'translate-x-0'); 
                    card.style.borderColor = `${data.color}60`;
                    card.style.boxShadow = `0 20px 40px -10px rgba(0,0,0,0.6), inset 0 0 15px ${data.color}20`;
                }
                if (typeof window.playSuccessSound === 'function') window.playSuccessSound();
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.3 });

    document.querySelectorAll('.timeline-item').forEach(item => observer.observe(item));

    window.addEventListener('scroll', () => {
        const beam = document.querySelector('.timeline-beam');
        if(!beam) return;
        const scrollPercent = (window.scrollY - wrapper.offsetTop + (window.innerHeight / 2)) / wrapper.offsetHeight;
        beam.style.setProperty('--beam-progress', Math.max(0, Math.min(100, scrollPercent * 100)) + '%');
    });
};
window.triggerTimelineAnimation = window.initTimelineAnimation;

// ==========================================================================
// 💡 AI 聊天室與 API 核心模組
// ==========================================================================
async function checkRateLimit() {
    const today = new Date().toDateString();
    const exp = window.appSettings.exp || 0;
    let dailyLimit = 20; 
    if (exp >= 1000) dailyLimit = 999; 
    else if (exp >= 300) dailyLimit = 100; 
    else if (exp >= 100) dailyLimit = 50;  

    if (window.appSettings.aiLimitDate !== today) {
        window.appSettings.aiLimitDate = today;
        window.appSettings.aiUsageCount = 0;
    }
    
    if (window.appSettings.aiUsageCount >= dailyLimit) {
        PremiumSwal.fire({ title: '能量耗盡 💤', text: `你目前的等級每日 AI 呼叫上限為 ${dailyLimit} 次。快去解鎖成就提升 EXP 吧！`, icon: 'warning', confirmButtonText: '明天再來' });
        return false;
    }
    
    window.appSettings.aiUsageCount++;
    window.saveSettings();

    if (window.firebaseApp && window.firebaseApp.auth.currentUser) {
        try {
            await window.firebaseApp.updateDoc(
                window.firebaseApp.doc(window.firebaseApp.db, "users", window.firebaseApp.auth.currentUser.uid), 
                { aiUsageCount: window.appSettings.aiUsageCount, aiLimitDate: today }
            );
        } catch(e) {}
    }
    return true;
}

// 🌟 補上 Web Speech API 初始化
let speechRecognition = null;
let isRecording = false;
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    speechRecognition = new SpeechRecognition();
    speechRecognition.continuous = false;
    speechRecognition.interimResults = false;
    speechRecognition.lang = 'zh-TW';
    
    speechRecognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        const inputEl = document.getElementById('ai-input');
        if (inputEl) {
            inputEl.value += transcript;
            inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
        }
    };
    speechRecognition.onend = () => { stopRecordingUI(); };
    speechRecognition.onerror = (e) => { console.warn("語音辨識錯誤:", e); stopRecordingUI(); };
}

window.toggleVoiceInput = function() {
    if(isUserBanned()) return;
    if (!speechRecognition) return PremiumSwal.fire({ title: '不支援語音輸入', text: '您的瀏覽器不支援語音功能。', icon: 'error' });
    const micBtn = document.getElementById('mic-btn');
    if (isRecording) { speechRecognition.stop(); stopRecordingUI(); } 
    else { try { speechRecognition.start(); isRecording = true; micBtn.classList.add('recording'); setAiStatus('正在聆聽中...', 'red-500'); } catch(e) {} }
};

function stopRecordingUI() {
    isRecording = false;
    const micBtn = document.getElementById('mic-btn');
    if(micBtn) micBtn.classList.remove('recording');
    setAiStatus('系統連線中', 'green-500');
}

window.toggleVoiceReply = function() {
    window.appSettings.voiceReply = !window.appSettings.voiceReply;
    window.saveSettings();
    updateVoiceReplyUI();
    window.playClickSound();
    if(window.appSettings.voiceReply) PremiumSwal.fire({ title: '語音回覆開啟', icon: 'success', timer: 1500, showConfirmButton: false });
    else if ('speechSynthesis' in window) window.speechSynthesis.cancel();
};

function updateVoiceReplyUI() {
    const icon = document.getElementById('voice-reply-icon');
    const btn = document.getElementById('voice-reply-btn');
    if(!icon || !btn) return;
    if(window.appSettings.voiceReply) { icon.className = "fa-solid fa-volume-high text-sky-400"; btn.classList.add('shadow-[0_0_10px_rgba(56,189,248,0.3)]'); } 
    else { icon.className = "fa-solid fa-volume-xmark text-zinc-500"; btn.classList.remove('shadow-[0_0_10px_rgba(56,189,248,0.3)]'); }
}

function speakAIText(text) {
    if (!window.appSettings.voiceReply || !('speechSynthesis' in window)) return;
    let cleanText = text.replace(/[*_#`>~]/g, '').replace(/\[系統提示：.*?\]/g, ''); 
    if(cleanText.length > 250) cleanText = cleanText.substring(0, 250) + "。後面的部分太長了，請直接看畫面上的文字喔！";
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'zh-TW'; utterance.rate = 1.1; utterance.pitch = 1.0; 
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance);
}

window.toggleAIDropdown = function(e) {
    e.stopPropagation();
    const menu = document.getElementById('ai-dropdown-menu'); const arrow = document.getElementById('ai-dropdown-arrow');
    if (!menu) return;
    window.playClickSound();
    if (menu.classList.contains('hidden')) { menu.classList.remove('hidden'); setTimeout(() => { menu.classList.remove('scale-95', 'opacity-0'); if(arrow) arrow.classList.add('rotate-180'); }, 10); } 
    else { closeAIDropdown(); }
};

function closeAIDropdown() {
    const menu = document.getElementById('ai-dropdown-menu'); const arrow = document.getElementById('ai-dropdown-arrow');
    if(menu && !menu.classList.contains('hidden')) { menu.classList.add('scale-95', 'opacity-0'); if(arrow) arrow.classList.remove('rotate-180'); setTimeout(() => menu.classList.add('hidden'), 200); }
}
document.addEventListener('click', closeAIDropdown); 

window.selectAIEngine = function(value, text, btnElement) {
    currentAIEngine = value; 
    const display = document.getElementById('ai-dropdown-display');
    if(display) display.innerText = text;
    closeAIDropdown(); window.playClickSound();
    PremiumSwal.fire({ title: '<i class="fa-solid fa-robot text-sky-500"></i> 模組切換', html: `<div class="text-sky-200/80 text-sm mt-2">量子核心已切換至：<br><b class="text-sky-400 text-base block mt-2">${text}</b></div>`, showConfirmButton: false, timer: 1200 });
};

function renderAISuggestions() {
    const container = document.getElementById('chat-ai-chips') || document.getElementById('home-ai-chips');
    if (!container || !qaData || qaData.length === 0) return;
    const shuffledQA = [...qaData].sort(() => 0.5 - Math.random()); const selectedQA = shuffledQA.slice(0, 4); const icons = ['💡', '💭', '✨', '💬'];
    container.innerHTML = selectedQA.map((item, index) => {
        const randomIcon = icons[index]; const safeQ = window.escapeForInlineHandler(item.q);
        return `<button onclick="document.getElementById('ai-input').value='${safeQ}'; document.getElementById('ai-input').focus();" class="text-left bg-black/40 hover:bg-sky-900/30 border border-sky-500/30 hover:border-sky-400 p-4 rounded-2xl transition-all group overflow-hidden shadow-lg hover:shadow-[0_0_15px_rgba(56,189,248,0.3)] hover:-translate-y-1"><div class="text-sky-100 text-sm font-bold mb-1 group-hover:text-sky-300 transition-colors">${randomIcon} 問問老王的專屬AI助手</div><div class="text-sky-200/50 text-xs truncate w-full tracking-wide" title="${item.q}">${item.q}</div></button>`;
    }).join('');
}

function updateUIState(isGenerating) {
    const sendBtn = document.getElementById('ai-send-btn'); const stopBtn = document.getElementById('ai-stop-btn');
    if (sendBtn) { sendBtn.disabled = isGenerating; if(isGenerating) sendBtn.classList.add('hidden'); else sendBtn.classList.remove('hidden'); }
    if (stopBtn) { if(isGenerating) stopBtn.classList.remove('hidden'); else stopBtn.classList.add('hidden'); }
}

window.handleAIKeyPress = function(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault(); 
        const sendBtn = document.getElementById('ai-send-btn');
        if (sendBtn && !sendBtn.disabled) window.sendAIMessage();
    }
};

function setAiStatus(text, colorClass) {
    const statusText = document.getElementById('ai-status-text');
    if (statusText) statusText.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-${colorClass} shadow-[0_0_8px_currentColor] animate-pulse"></span> ${text}`;
}

window.stopAIGeneration = function() {
    if (currentAbortController) {
        currentAbortController.abort(); currentAbortController = null;
        updateUIState(false); setAiStatus('連線中斷', 'yellow-500');
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }
};

window.editUserMessage = function(text) {
    window.playClickSound(); const inputEl = document.getElementById('ai-input');
    if(inputEl) { inputEl.value = text; inputEl.focus(); inputEl.style.height = 'auto'; inputEl.style.height = Math.min(inputEl.scrollHeight, 200) + 'px'; }
};

window.handleAIFileUpload = function(event) {
    const file = event.target.files[0]; if (!file) return;
    if(file.size > 5 * 1024 * 1024) return PremiumSwal.fire('檔案太大囉', '請上傳小於 5MB 的檔案。', 'warning');
    const reader = new FileReader();
    reader.onload = function(e) {
        window.currentAttachedImageBase64 = e.target.result;
        const preview = document.getElementById('ai-image-preview'); const container = document.getElementById('ai-image-preview-container');
        if(preview) preview.src = window.currentAttachedImageBase64;
        if(container) container.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
};

window.removeAIAttachment = function() {
    window.currentAttachedImageBase64 = null;
    const input = document.getElementById('ai-file-input'); const container = document.getElementById('ai-image-preview-container');
    if(input) input.value = "";
    if(container) container.classList.add('hidden');
};

let aiMemory = [];
try {
    const arc = localStorage.getItem('ai_memory_archive');
    if(arc) aiMemory = JSON.parse(arc);
} catch(e) {}

async function summarizeMemory() {
    if (aiMemory.length > 10) {
        // 🌟 修正：存入硬碟前，將肥大的 Base64 圖片資料過濾掉，只保留文字對話紀錄
        const cleanArchive = aiMemory.slice(0, -4).map(msg => ({
            role: msg.role, 
            content: msg.content, 
            image: null // 強制清空圖片資料
        }));
        
        try {
            localStorage.setItem('ai_memory_archive', JSON.stringify(cleanArchive));
        } catch (e) {
            console.warn("本機儲存空間已滿，清除舊有 AI 記憶");
            localStorage.removeItem('ai_memory_archive');
        }
        
        aiMemory = aiMemory.slice(-4);
    }
}

let currentAIEngine = 'auto';
let currentAbortController = null;

class AIEngine {
    static async getKeys(type) {
        if (dynamicApiKeys[type] && dynamicApiKeys[type].length > 0) return dynamicApiKeys[type];
        try {
            const docSnap = await window.firebaseApp.getDoc(window.firebaseApp.doc(window.firebaseApp.db, "system_config", "api_keys"));
            if (docSnap.exists()) {
                const data = docSnap.data();
                dynamicApiKeys.gemini = data.gemini || [];
                dynamicApiKeys.groq = data.groq || [];
            }
        } catch (e) {}
        return dynamicApiKeys[type];
    }

    static getSystemPrompt(engineName) {
        const contextData = qaData.map(item => `Q: ${item.q}\nA: ${item.a}`).join("\n\n");
        return `你是「${engineName}」，隸屬於「老王專屬秘密基地」的專屬AI助手。\n\n${contextData}`;
    }

    static async callWithKeyRotation(keysArray, apiCallFunction) {
        let lastError = null;
        for (let i = 0; i < keysArray.length; i++) {
            const key = keysArray[i];
            if (!key || key.startsWith("請在此填入")) continue; 
            try { return await apiCallFunction(key); } catch (error) { if (error.name === 'AbortError') throw error; lastError = error; }
        }
        throw new Error(`API Keys failed.`);
    }

    static async analyze(text, signal) {
        let messagePayload = text;
        if (window.currentAttachedImageBase64) messagePayload += "\n[系統提示：上傳了一張圖片]"; 

        aiMemory.push({ role: "user", content: messagePayload, image: window.currentAttachedImageBase64 });
        
        let activeEngine = currentAIEngine;
        if (activeEngine === 'auto' || (window.currentAttachedImageBase64 && activeEngine !== 'gemini')) activeEngine = window.currentAttachedImageBase64 ? 'gemini' : 'groq';

        let reply = "";
        try {
            if (activeEngine === 'gemini') reply = await this.callGemini(signal);
            else if (activeEngine === 'groq') reply = await this.callGroq(signal);
            else reply = this.callLocal(text);
        } catch (error) {
            if (error.name === 'AbortError') throw error;
            reply = this.callLocal(text) + `\n\n*(連線異常，切換至離線大腦)*`;
        }
        
        aiMemory.push({ role: "assistant", content: reply });
        await summarizeMemory();
        return reply;
    }

    static async callGroq(signal) {
        const keys = await this.getKeys('groq');
        if (!keys || keys.length === 0) throw new Error("No Groq Keys");

        return await this.callWithKeyRotation(keys, async (key) => {
            const prompt = this.getSystemPrompt("Groq");
            let messages = [{ role: "system", content: prompt }];
            aiMemory.forEach(msg => { messages.push({ role: msg.role, content: msg.content }); });

            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', { 
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key.trim()}` }, 
                signal: signal, body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: messages, temperature: 0.6, max_tokens: 400 }) 
            });
            
            if (!response.ok) throw new Error(`Groq API Error`);
            const data = await response.json(); 
            return data.choices[0].message.content;
        });
    }

    static async callGemini(signal) {
        const keys = await this.getKeys('gemini');
        if (!keys || keys.length === 0) throw new Error("No Gemini Keys");

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
                } else parts.push({ text: msg.content });
                return { role: msg.role === 'assistant' ? 'model' : 'user', parts: parts };
            });

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key.trim()}`, { 
                method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: signal, 
                body: JSON.stringify({ system_instruction: { parts: [{ text: prompt }] }, contents: contents, generationConfig: { temperature: 0.6, maxOutputTokens: 400 } }) 
            });
            
            if (!response.ok) throw new Error(`Gemini Error`);
            const data = await response.json(); 
            return data.candidates[0].content.parts[0].text;
        });
    }

    static callLocal(input) {
        return "本地引擎暫時無法回答此問題。";
    }
}

function streamMarkdown(elementId, markdownString, onComplete) {
    const el = document.getElementById(elementId); 
    if (!el) { if(onComplete) onComplete(); return; }

    let i = 0; let currentText = "";
    function typeChar() {
        if (i >= markdownString.length) { 
            let finalHtml = marked.parse(markdownString);
            el.innerHTML = finalHtml;
            if (onComplete) onComplete(); return; 
        }
        let chunkSize = Math.floor(Math.random() * 4) + 2; 
        currentText += markdownString.substring(i, i + chunkSize);
        i += chunkSize;
        el.innerHTML = marked.parse(currentText + " ▌"); 
        setTimeout(typeChar, 15);
    }
    typeChar();
}

let isAIGenerating = false;
window.toggleAIAction = function () {
    if(isUserBanned()) return;
    if (!isAIGenerating) {
        if (typeof window.sendAIMessage === 'function') window.sendAIMessage();
    } else {
        if (typeof window.stopAIGeneration === 'function') window.stopAIGeneration();
    }
};

window.sendAIMessage = async function() {
    if(isUserBanned()) return;

    const firebaseUser = window.firebaseApp?.auth?.currentUser;
    if(!firebaseUser || firebaseUser.isAnonymous || !window.isLoggedIn){
        return PremiumSwal.fire({ title: '需要正式帳號', icon: 'warning', confirmButtonText: '前往登入' }).then(res => { if(res.isConfirmed) window.openAuthModal('login'); });
    }

    const inputEl = document.getElementById('ai-input'); if (!inputEl) return;
    const text = inputEl.value.trim(); 
    if (!text && !window.currentAttachedImageBase64) return;
    if(!await checkRateLimit()) return; 
    
    const chat = document.getElementById('chat-window'); if (!chat) return;
    window.playClickSound(); window.gainExp(5, true);
    
    updateUIState(true); setAiStatus('系統運算中...', 'sky-400'); inputEl.style.height = '60px'; 
    currentAbortController = new AbortController(); const signal = currentAbortController.signal;

    let imgHTML = window.currentAttachedImageBase64 ? `<img src="${window.currentAttachedImageBase64}" class="w-32 h-32 object-cover rounded-xl mb-2 border border-white/20 shadow-lg">` : "";
    
    if (window.currentAttachedImageBase64) {
        window.appSettings.aiVisionCount = (window.appSettings.aiVisionCount || 0) + 1;
    }
    window.saveSettings();
    if(typeof window.renderBadges === 'function') window.renderBadges();

    const safeTextForEdit = window.escapeForInlineHandler(text);
    
    chat.innerHTML += `
        <div class="flex justify-end w-full animate-[smoothReveal_0.4s_ease] mb-6 group">
            <div class="flex items-center gap-2 max-w-[90%]">
                <button onclick="window.editUserMessage('${safeTextForEdit}')" class="opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8 flex-shrink-0 rounded-full bg-white/5 text-zinc-400 hover:text-white hover:bg-sky-500 flex items-center justify-center shadow-lg" title="編輯並重新發送"><i class="fa-solid fa-pen text-[10px]"></i></button>
                <div class="bg-[#020617] text-white font-medium text-[15px] leading-relaxed px-5 py-3 rounded-3xl rounded-tr-md shadow-md border border-sky-500/40 break-words">${imgHTML}${text.replace(/\n/g, '<br>')}</div>
            </div>
        </div>`;
    
    inputEl.value = ''; 
    const capturedImage = window.currentAttachedImageBase64; 
    window.removeAIAttachment(); chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });

    const thinkingId = 'thinking-' + Date.now();
    chat.innerHTML += `<div id="${thinkingId}" class="flex gap-4 w-full mb-6"><div class="w-9 h-9 rounded-full bg-black border border-sky-500/40"></div></div>`;
    chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });
    
    window.currentAttachedImageBase64 = capturedImage;

    try {
        const rawMarkdownResponse = await AIEngine.analyze(text, signal);
        window.currentAttachedImageBase64 = null; 
        document.getElementById(thinkingId)?.remove();

        const msgId = 'ai-msg-' + Date.now();
        chat.innerHTML += `
            <div class="flex gap-4 w-full animate-[smoothReveal_0.5s_ease] mb-8">
                <div class="w-9 h-9 rounded-full bg-[#020617] border border-sky-500/50 p-[1px] shadow-[0_0_10px_rgba(56,189,248,0.3)] shrink-0 overflow-hidden">
                    <img src="avatar-main.jpg" onerror="this.src='https://ui-avatars.com/api/?name=AI&background=020617&color=38bdf8'" class="w-full h-full rounded-full object-cover">
                </div>
                <div id="${msgId}" class="markdown-body w-full max-w-[calc(100%-3rem)] bg-transparent"></div>
            </div>`;
        chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });
        speakAIText(rawMarkdownResponse);
        streamMarkdown(msgId, rawMarkdownResponse, () => { updateUIState(false); setAiStatus('系統連線中', 'green-500'); currentAbortController = null; });
    } catch(err) { 
        updateUIState(false); setAiStatus('系統待命中', 'green-500'); currentAbortController = null; 
    }
};

// ==========================================================================
// 💡 Apple 支援風格雙向客服系統
// ==========================================================================
let currentSupportAttachmentBase64 = null;

window.handleSupportKeyPress = function(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault(); 
        const sendBtn = document.getElementById('support-input').nextElementSibling;
        if (sendBtn && !sendBtn.disabled) window.sendSupportTicket();
    }
};

window.previewSupportImage = function(src) {
    if(typeof window.playClickSound === 'function') window.playClickSound();
    Swal.fire({
        imageUrl: src, imageAlt: '截圖預覽', showConfirmButton: false, showCloseButton: true,
        background: 'rgba(10, 20, 35, 0.95)',
        customClass: { image: 'rounded-2xl max-h-[80vh] object-contain shadow-[0_0_30px_rgba(56,189,248,0.4)]' }
    });
};

window.handleSupportFileUpload = function(event) {
    const file = event.target.files[0];
    if (!file) return;

    PremiumSwal.fire({ title: '處理圖片中...', text: '正在啟動壓縮引擎', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            let width = img.width; let height = img.height; const MAX_SIZE = 800;
            if (width > height && width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; } 
            else if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
            canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height);
            currentSupportAttachmentBase64 = canvas.toDataURL('image/jpeg', 0.8);
            
            document.getElementById('support-image-preview').src = currentSupportAttachmentBase64;
            document.getElementById('support-image-preview-container').classList.remove('hidden');
            Swal.close();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
};

window.removeSupportAttachment = function() {
    currentSupportAttachmentBase64 = null;
    const input = document.getElementById('support-file-input');
    const container = document.getElementById('support-image-preview-container');
    if(input) input.value = "";
    if(container) container.classList.add('hidden');
};

window.sendSupportTicket = async function() {
    const input = document.getElementById('support-input');
    if(!input) return;
    const msg = input.value.trim();
    
    if (!msg && !currentSupportAttachmentBase64) { 
        if(typeof window.playErrorSound === 'function') window.playErrorSound(); return; 
    }
    
    const user = window.firebaseApp.auth.currentUser;
    if (!user) return;

    let finalMessage = msg;
    if (currentSupportAttachmentBase64) {
        finalMessage += `\n<br><img src="${currentSupportAttachmentBase64}" class="max-w-[200px] rounded-lg border border-sky-500/30 cursor-zoom-in mt-2 shadow-md hover:opacity-80 transition-opacity" onclick="window.previewSupportImage(this.src)">`;
    }

    input.value = ''; input.style.height = 'auto'; input.disabled = true;
    window.removeSupportAttachment();
    
    try {
        await window.firebaseApp.addDoc(window.firebaseApp.collection(window.firebaseApp.db, "support_tickets"), {
            uid: user.uid,
            name: window.appSettings.customTitle ? `[${window.appSettings.customTitle}] ` + (window.appSettings.name || user.displayName || "老王鐵粉") : (window.appSettings.name || user.displayName || "老王鐵粉"),
            email: user.email,
            message: finalMessage,
            status: 'pending',
            timestamp: Date.now()
        });
        if(typeof window.playSuccessSound === 'function') window.playSuccessSound();
    } catch (e) {
        PremiumSwal.fire('傳送失敗', e.message, 'error');
    } finally {
        input.disabled = false; input.focus();
    }
};

window.openSupportModal = function() {
    if(isUserBanned()) return;
    const user = window.firebaseApp?.auth?.currentUser;
    if (!user || user.isAnonymous || !window.isLoggedIn) { return PremiumSwal.fire('存取拒絕', '請先登入正式會員，才能開啟與工程師的加密通訊頻道。', 'warning'); }
    
    const modal = document.getElementById('support-modal');
    const content = document.getElementById('support-content');
    if(modal && content) {
        modal.classList.remove('hidden'); modal.classList.add('flex');
        setTimeout(() => { modal.classList.remove('opacity-0'); content.classList.remove('scale-95'); }, 10);
        window.loadSupportHistory(user.uid);
    }
};

window.closeSupportModal = function() {
    const modal = document.getElementById('support-modal');
    const content = document.getElementById('support-content');
    if(modal && content) {
        modal.classList.add('opacity-0'); content.classList.add('scale-95');
        setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); }, 300);
    }
    if (globalSupportUnsubscribe) { globalSupportUnsubscribe(); globalSupportUnsubscribe = null; }
};

window.loadSupportHistory = function(uid) {
    const list = document.getElementById('support-history-list');
    if(!list) return;
    if (globalSupportUnsubscribe) globalSupportUnsubscribe();

    const q = window.firebaseApp.query(
        window.firebaseApp.collection(window.firebaseApp.db, "support_tickets"), 
        window.firebaseApp.where("uid", "==", uid), 
        window.firebaseApp.orderBy("timestamp", "asc")
    );

    globalSupportUnsubscribe = window.firebaseApp.onSnapshot(q, (snapshot) => {
        let html = ''; 
        let latestStatus = 'pending';

        html += `
            <div class="flex flex-col items-center justify-center my-4">
                <span class="text-[10px] text-sky-400/60 font-mono tracking-widest bg-sky-900/20 px-3 py-1 rounded-full border border-sky-500/20"><i class="fa-solid fa-shield-halved mr-1"></i>通訊連線已加密</span>
            </div>
            <div class="flex flex-col items-start mb-6 animate-[fadeIn_0.4s_ease]">
                <div class="flex items-center gap-2 mb-1 pl-1">
                    <span class="bg-sky-500/20 border border-sky-500/30 text-sky-400 text-[9px] font-black px-2 py-0.5 rounded tracking-widest"><i class="fa-solid fa-robot mr-1"></i>系統自動回覆</span>
                </div>
                <div class="bg-[#020617] text-sky-100 px-5 py-3 rounded-2xl rounded-tl-sm text-[14px] max-w-[85%] shadow-lg break-words border border-white/10 leading-relaxed">
                    您好！這裡是老王基地的工程部支援中心 🛠️<br>請問遇到了什麼系統問題或 Bug 呢？您可以直接傳送文字或附上截圖給我們！
                </div>
            </div>
        `;

        snapshot.forEach(doc => {
            const data = doc.data();
            latestStatus = data.status; // 追蹤最新一筆的狀態
            const timeStr = new Date(data.timestamp).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
            
            if (data.message && data.message !== "*(通訊串接延續)*" && data.message !== "*(工程師主動聯繫)*") {
                const msgContent = data.message.startsWith('data:image') 
                    ? `<img src="${data.message}" class="max-w-[200px] rounded-lg border border-sky-500/30 cursor-zoom-in mt-1 shadow-md hover:opacity-80 transition-opacity" onclick="window.previewSupportImage(this.src)">` 
                    : data.message.replace(/\n/g, '<br>');
                html += `<div class="flex flex-col items-end mb-4 animate-[fadeIn_0.3s_ease]"><span class="text-[10px] text-zinc-500 font-mono mb-1 pr-1">${timeStr}</span><div class="bg-gradient-to-br from-sky-500 to-blue-600 text-white px-5 py-3 rounded-2xl rounded-tr-sm text-[14px] max-w-[85%] shadow-[0_5px_15px_rgba(56,189,248,0.2)] break-words border border-sky-400/50 leading-relaxed">${msgContent}</div></div>`;
            }
            
            if (data.status === 'replied' || data.status === 'closed' || data.status === 'in_progress') {
                if (data.replyContent) {
                    const repTimeStr = new Date(data.replyTime).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
                    const repContent = data.replyContent.startsWith('data:image') 
                        ? `<img src="${data.replyContent}" class="max-w-[200px] rounded-lg border border-emerald-500/30 cursor-zoom-in mt-1 shadow-md hover:opacity-80 transition-opacity" onclick="window.previewSupportImage(this.src)">` 
                        : data.replyContent.replace(/\n/g, '<br>');
                    html += `<div class="flex flex-col items-start mb-6 animate-[fadeIn_0.4s_ease]"><div class="flex items-center gap-2 mb-1 pl-1"><span class="bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[9px] font-black px-2 py-0.5 rounded tracking-widest"><i class="fa-solid fa-wrench mr-1"></i>基地工程部</span><span class="text-[10px] text-zinc-500 font-mono">${repTimeStr}</span></div><div class="bg-[#020617] text-sky-100 px-5 py-3 rounded-2xl rounded-tl-sm text-[14px] max-w-[85%] shadow-[0_0_15px_rgba(52,211,153,0.1)] break-words border border-emerald-500/30 leading-relaxed">${repContent}</div></div>`;
                }
            }
        });
        
        // 🌟 修正第五點：解鎖輸入框
        const inputArea = document.getElementById('support-input');
        if (latestStatus === 'closed') {
            html += `<div class="w-full text-center mt-6 mb-2"><span class="bg-zinc-800/80 text-zinc-400 border border-zinc-700 text-xs font-mono px-4 py-2 rounded-full tracking-widest"><i class="fa-solid fa-lock mr-1"></i>上一次對談已結案，發送訊息將重啟新對談</span></div>`;
            if (inputArea) inputArea.placeholder = "輸入新訊息以重新開啟對談...";
        } else {
            if (inputArea) inputArea.placeholder = "輸入訊息或附上截圖 (按 Enter 發送)...";
        }
        
        list.innerHTML = html;
        setTimeout(() => list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' }), 50);
        
        // 保證永遠可以輸入
        if (inputArea) {
            inputArea.disabled = false;
            inputArea.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    });
};

window.initGlobalTicketNotifications = function(uid) {
    if (globalSupportUnsubscribe) globalSupportUnsubscribe();

    const q = window.firebaseApp.query(
        window.firebaseApp.collection(window.firebaseApp.db, "support_tickets"),
        window.firebaseApp.where("uid", "==", uid),
        window.firebaseApp.where("status", "==", "replied") // 這個條件現在相容 in_progress 狀態嗎? 根據後台邏輯，回覆時會標為 in_progress，建議同步更改。但因為這邊只做通知，先保留。
    );

    globalSupportUnsubscribe = window.firebaseApp.onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "modified" || change.type === "added") {
                const data = change.doc.data();
                const lastNotified = localStorage.getItem('last_notified_ticket_' + change.doc.id) || 0;

                if (data.replyTime > lastNotified) {
                    localStorage.setItem('last_notified_ticket_' + change.doc.id, data.replyTime);

                    if(typeof playSuccessSound === 'function') playSuccessSound();
                    PremiumSwal.fire({
                        title: '<i class="fa-solid fa-envelope-open-text text-sky-400"></i> 收到工程師新訊息！',
                        html: `<div class="text-left bg-sky-900/20 p-4 rounded-xl border border-sky-500/30 mt-3 text-sm text-sky-100">${data.replyContent.replace(/\n/g, '<br>')}</div>`,
                        confirmButtonText: '前往客服中心查看',
                    }).then((result) => {
                        if (result.isConfirmed && typeof window.openSupportModal === 'function') {
                            window.openSupportModal();
                        }
                    });
                }
            }
        });
    });
};

window.endSupportTicket = async function() {
    const res = await PremiumSwal.fire({
        title: '結束對談？',
        text: '確認結束後，您可選擇將目前的對話紀錄下載備份。',
        icon: 'question',
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: '<i class="fa-solid fa-download mr-2"></i>結束並下載',
        denyButtonText: '僅結束對談',
        cancelButtonText: '取消',
        customClass: { 
            confirmButton: 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-black px-4 py-2 rounded-xl',
            denyButton: 'bg-red-500/20 text-red-400 border border-red-500/50 font-bold px-4 py-2 rounded-xl hover:bg-red-500 hover:text-white transition-all',
            cancelButton: 'bg-transparent text-zinc-400 hover:text-white px-4 py-2'
        }
    });

    if (res.isConfirmed || res.isDenied) {
        if (res.isConfirmed) {
            const chatLog = document.getElementById('support-history-list').innerText;
            const blob = new Blob([`【老王秘密基地 客服對話紀錄】\n\n${chatLog}`], { type: "text/plain;charset=utf-8" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `老王秘密基地_客服紀錄_${Date.now()}.txt`;
            link.click();
        }
        window.closeSupportModal();
        PremiumSwal.fire({ title: '對談已結束', text: '感謝您的聯繫，我們下次見！', icon: 'success', timer: 1500, showConfirmButton: false});
    }
};

// ==========================================================================
// 🚀 開團宣傳模組 V2 核心邏輯
// ==========================================================================
let promoUnsubscribe = null;
let currentPromoData = null;

function initPromoListener() {
    if (!window.firebaseApp || !window.firebaseApp.db) { setTimeout(initPromoListener, 1000); return; }
    
    promoUnsubscribe = window.firebaseApp.onSnapshot(
        window.firebaseApp.doc(window.firebaseApp.db, "system_config", "promotion"),
        (docSnap) => {
            if (docSnap.exists()) {
                currentPromoData = docSnap.data();
                checkAndShowPromo();
            }
        },
        (error) => { console.warn("Promo Listener Error:", error); }
    );
}

function checkAndShowPromo() {
    if (!currentPromoData || !currentPromoData.active) return; 

    const now = Date.now();
    if (currentPromoData.startTime && now < currentPromoData.startTime) return;
    if (currentPromoData.endTime && now > currentPromoData.endTime) return;

    const closedTimestamp = localStorage.getItem('promo_closed_update_time');
    if (closedTimestamp && parseInt(closedTimestamp) === currentPromoData.updatedAt) {
        return; 
    }

    renderPromoUI();
}

function renderPromoUI() {
    document.getElementById('promo-display-title').innerText = currentPromoData.title || '特別活動';
    document.getElementById('promo-display-content').innerHTML = (currentPromoData.content || '').replace(/\n/g, '<br>');
    
    const ecomInfo = document.getElementById('promo-ecommerce-info');
    if (currentPromoData.salePrice || currentPromoData.price || currentPromoData.stockStatus) {
        ecomInfo.classList.remove('hidden');
        
        document.getElementById('promo-sale-price').innerText = currentPromoData.salePrice ? `NT$ ${currentPromoData.salePrice}` : '';
        document.getElementById('promo-original-price').innerText = currentPromoData.price ? `NT$ ${currentPromoData.price}` : '';
        
        const stockBadge = document.getElementById('promo-stock-badge');
        if (currentPromoData.stockStatus === 'low_stock') {
            stockBadge.className = 'px-3 py-1.5 rounded-lg text-xs font-black bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse';
            stockBadge.innerHTML = '<i class="fa-solid fa-fire mr-1"></i>即將完售';
        } else if (currentPromoData.stockStatus === 'preorder') {
            stockBadge.className = 'px-3 py-1.5 rounded-lg text-xs font-black bg-purple-500/20 text-purple-400 border border-purple-500/30';
            stockBadge.innerHTML = '<i class="fa-solid fa-clock mr-1"></i>預購中';
        } else if (currentPromoData.stockStatus === 'out_of_stock') {
            stockBadge.className = 'px-3 py-1.5 rounded-lg text-xs font-black bg-zinc-800 text-zinc-400 border border-zinc-600';
            stockBadge.innerHTML = '<i class="fa-solid fa-ban mr-1"></i>已售完';
        } else {
            stockBadge.className = 'px-3 py-1.5 rounded-lg text-xs font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
            stockBadge.innerHTML = '<i class="fa-solid fa-check mr-1"></i>現貨供應';
        }

        const discContainer = document.getElementById('promo-discount-container');
        if (currentPromoData.discountCode) {
            discContainer.classList.remove('hidden'); discContainer.classList.add('flex');
            document.getElementById('promo-discount-code').innerText = currentPromoData.discountCode;
        } else {
            discContainer.classList.add('hidden'); discContainer.classList.remove('flex');
        }
    } else {
        ecomInfo.classList.add('hidden');
    }

    const actionBtn = document.getElementById('promo-action-btn');
    if(currentPromoData.link) actionBtn.href = currentPromoData.link;

    const track = document.getElementById('promo-image-track');
    const dotsContainer = document.getElementById('promo-slider-dots');
    track.innerHTML = ''; dotsContainer.innerHTML = '';

    if (currentPromoData.images && currentPromoData.images.length > 0) {
        document.getElementById('promo-slider-container').classList.remove('hidden');
        currentPromoData.images.forEach((imgSrc, index) => {
            track.innerHTML += `
                <div class="promo-slide-item relative">
                    <img src="${imgSrc}" class="w-full h-full object-cover">
                    <div class="absolute inset-0 bg-gradient-to-t from-[#020617] via-transparent to-transparent"></div>
                </div>`;
            dotsContainer.innerHTML += `<button onclick="window.scrollToPromoImage(${index})" class="promo-dot ${index === 0 ? 'active' : ''}" id="promo-dot-${index}"></button>`;
        });

        track.addEventListener('scroll', () => {
            const index = Math.round(track.scrollLeft / track.clientWidth);
            document.querySelectorAll('.promo-dot').forEach((dot, i) => {
                dot.classList.toggle('active', i === index);
            });
        });
    } else {
        document.getElementById('promo-slider-container').classList.add('hidden');
    }

    const qaContainer = document.getElementById('promo-qa-container');
    qaContainer.innerHTML = '';
    if (currentPromoData.qaList && currentPromoData.qaList.length > 0) {
        qaContainer.innerHTML = `<h3 class="text-xs font-black text-amber-400 tracking-widest mb-3 uppercase flex items-center"><i class="fa-solid fa-circle-question mr-2"></i>常見問題 Q&A</h3>`;
        currentPromoData.qaList.forEach((qa, index) => {
            qaContainer.innerHTML += `
                <div class="promo-qa-item cursor-pointer" onclick="window.togglePromoQA(${index})" id="promo-qa-box-${index}">
                    <div class="p-4 flex justify-between items-center">
                        <span class="font-bold text-sm text-sky-100">${qa.q}</span>
                        <i class="fa-solid fa-chevron-down promo-qa-icon text-zinc-500 text-xs"></i>
                    </div>
                    <div class="promo-qa-content text-sm text-sky-300/80 leading-relaxed">${qa.a.replace(/\n/g, '<br>')}</div>
                </div>
            `;
        });
    }

    const modal = document.getElementById('promo-modal');
    const content = document.getElementById('promo-content-box');
    modal.classList.remove('hidden'); modal.classList.add('flex');
    
    const closeBtn = document.getElementById('promo-close-btn');
    const countdownEl = document.getElementById('promo-countdown');
    const closeIcon = document.getElementById('promo-close-icon');
    
    closeBtn.disabled = true;
    closeBtn.classList.add('opacity-50', 'cursor-not-allowed');
    closeBtn.classList.remove('hover:bg-red-500/80');
    countdownEl.classList.remove('hidden');
    closeIcon.classList.add('hidden');
    
    let timeLeft = 5;
    countdownEl.innerText = timeLeft;
    
    const timer = setInterval(() => {
        timeLeft--;
        if(timeLeft > 0) {
            countdownEl.innerText = timeLeft;
        } else {
            clearInterval(timer);
            countdownEl.classList.add('hidden');
            closeIcon.classList.remove('hidden');
            closeBtn.disabled = false;
            closeBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            closeBtn.classList.add('hover:bg-red-500/80');
        }
    }, 1000);

    setTimeout(() => { 
        modal.classList.remove('opacity-0'); 
        content.classList.remove('scale-95'); 
        if(typeof window.playSuccessSound === 'function') window.playSuccessSound();
    }, 10);
}

window.scrollToPromoImage = function(index) {
    const track = document.getElementById('promo-image-track');
    track.scrollTo({ left: track.clientWidth * index, behavior: 'smooth' });
};

window.togglePromoQA = function(index) {
    if(typeof window.playClickSound === 'function') window.playClickSound();
    const box = document.getElementById(`promo-qa-box-${index}`);
    box.classList.toggle('active');
};

window.closePromoModal = function() {
    if(typeof window.playClickSound === 'function') window.playClickSound();
    const modal = document.getElementById('promo-modal');
    const content = document.getElementById('promo-content-box');
    
    if (currentPromoData && currentPromoData.updatedAt) {
        localStorage.setItem('promo_closed_update_time', currentPromoData.updatedAt.toString());
    }

    modal.classList.add('opacity-0'); content.classList.add('scale-95');
    setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); }, 500);
};

// ==========================================================================
// 鐵粉測驗核心引擎 
// ==========================================================================
let currentQuizQuestions = [];
let currentQuizIndex = 0;
let currentQuizScore = 0;

window.startQuiz = function() {
    const playerName = document.getElementById('quiz-player-name')?.value.trim();
    if(!playerName) return Swal.fire('請輸入大名', '要挑戰測驗請先輸入名字喔！', 'warning');
    
    if (!window.QUIZ_DB || window.QUIZ_DB.length === 0) {
        return Swal.fire('系統提示', '題庫尚未載入，請確認 zcsn_quiz.js 是否正確掛載！', 'info');
    }

    currentQuizQuestions = [...window.QUIZ_DB].sort(() => 0.5 - Math.random()).slice(0, 10);
    currentQuizIndex = 0;
    currentQuizScore = 0;

    document.getElementById('quiz-intro').classList.add('hidden');
    document.getElementById('quiz-area').classList.remove('hidden');
    document.getElementById('quiz-area').classList.add('flex');
    
    window.renderQuizQuestion();
};

window.renderQuizQuestion = function() {
    if (currentQuizIndex >= currentQuizQuestions.length) {
        window.finishQuiz();
        return;
    }

    const qData = currentQuizQuestions[currentQuizIndex];
    document.getElementById('quiz-progress').innerText = `第 ${currentQuizIndex + 1} / 共 10 題`;
    document.getElementById('quiz-score').innerText = `目前積分: ${currentQuizScore}`;
    document.getElementById('quiz-question').innerText = qData.q;

    const options = [...qData.options].sort(() => 0.5 - Math.random());
    const optionsContainer = document.getElementById('quiz-options');
    
    optionsContainer.innerHTML = options.map((opt, i) => `
        <button onclick="window.answerQuiz('${window.escapeForInlineHandler(opt)}', '${window.escapeForInlineHandler(qData.a)}')" class="w-full text-left bg-[#0f172a] border border-sky-500/30 p-5 rounded-2xl hover:bg-sky-900/40 hover:border-sky-400 transition-all font-bold text-sky-100 group">
            <span class="inline-block w-8 h-8 rounded-full bg-sky-500/10 text-sky-400 text-center leading-8 mr-3 border border-sky-500/30 group-hover:bg-sky-400 group-hover:text-black transition-all">${String.fromCharCode(65 + i)}</span>
            ${opt}
        </button>
    `).join('');
};

window.answerQuiz = function(selected, correct) {
    if (selected === correct) {
        if(typeof window.playSuccessSound === 'function') window.playSuccessSound();
        currentQuizScore += 10;
        Swal.fire({ toast: true, position: 'top', icon: 'success', title: '答對了！+10分', showConfirmButton: false, timer: 1000, background: 'rgba(10,20,35,0.95)', color: '#fff' });
    } else {
        if(typeof window.playErrorSound === 'function') window.playErrorSound();
        Swal.fire({ toast: true, position: 'top', icon: 'error', title: '答錯囉！', showConfirmButton: false, timer: 1000, background: 'rgba(10,20,35,0.95)', color: '#fff' });
    }
    
    currentQuizIndex++;
    setTimeout(window.renderQuizQuestion, 1000);
};

window.finishQuiz = function() {
    document.getElementById('quiz-area').classList.add('hidden');
    document.getElementById('quiz-area').classList.remove('flex');
    document.getElementById('quiz-intro').classList.remove('hidden');
    
    if (currentQuizScore === 100) {
        window.appSettings.quizPerfect = (window.appSettings.quizPerfect || 0) + 1;
        window.saveSettings();
        if(typeof window.renderBadges === 'function') window.renderBadges(); 
    }

    const expReward = Math.floor(currentQuizScore / 2); 
    const today = new Date().toDateString();
    let rewardMsgHtml = "";

    // 🌟 防刷分機制：一天只能領一次測驗獎勵
    if (window.appSettings.lastQuizDate !== today) {
        window.appSettings.lastQuizDate = today;
        if(expReward > 0) {
            window.gainExp(expReward, false, "每日測驗獎勵");
            rewardMsgHtml = `獲得了 ${expReward} EXP 獎勵！`;
        }
    } else {
        rewardMsgHtml = '今日測驗獎勵已達上限，明天再來挑戰吧！';
        Swal.fire({ toast: true, position: 'top', icon: 'info', title: '今日已領取過獎勵囉', showConfirmButton: false, timer: 2000, background: 'rgba(10,20,35,0.95)', color: '#fff' });
    }

    Swal.fire({
        title: currentQuizScore === 100 ? '完美通關！學霸鐵粉🎉' : '測驗結束！',
        html: `<div class="text-4xl font-black text-amber-400 my-5">${currentQuizScore} 分</div><p class="text-sky-200 text-sm font-bold">${rewardMsgHtml}</p>`,
        confirmButtonText: '返回'
    });
};

// ==========================================================================
// 🌟 版本更新迎新彈窗與推播權限請求
// ==========================================================================
window.showUpdateWelcome = function() {
    const currentVersionData = CHANGELOG.find(c => c.ver === APP_VERSION);
    if (!currentVersionData) return;
    
    const md = `### 🚀 v${currentVersionData.ver} 更新內容\n` + currentVersionData.items.map(i => `- ${i}`).join('\n');

    PremiumSwal.fire({
        title: '系統升級完成',
        html: `<div class="markdown-body" style="text-align:left;max-height:50vh;overflow:auto;padding:10px;">${marked.parse(md)}</div>`,
        showCancelButton: true,
        confirmButtonText: '開始體驗',
        cancelButtonText: '此次版本不再顯示',
        cancelButtonColor: '#3f3f46',
        reverseButtons: true
    }).then((result) => {
        if (result.dismiss === Swal.DismissReason.cancel) {
            localStorage.setItem('hide_update_' + APP_VERSION, 'true');
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: '已隱藏此版本通知', showConfirmButton: false, timer: 1500, background: 'rgba(10,20,35,0.95)', color: '#fff' });
        }
        
        // 詢問瀏覽器推播權限 (用於開播通知)
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    });
};

// 監聽網頁載入，決定是否顯示彈窗
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (localStorage.getItem('hide_update_' + APP_VERSION) !== 'true') {
            if (typeof window.showUpdateWelcome === 'function') window.showUpdateWelcome();
        }
    }, 2000);
});

// ==========================================================================
// 🌟 Twitch 自動驗證引擎
// ==========================================================================
const TWITCH_CLIENT_ID = '7pbbwifpvcy7gijroxdnqo8nqkcuya'; // 你的 Client ID
const BROADCASTER_LOGIN = 'z_knc'; // 老王的頻道帳號

window.bindTwitchAccount = function() {
    if(isUserBanned()) return;
    const redirectUri = window.location.origin + window.location.pathname;
    // 請求 user:read:subscriptions 權限，這樣才能檢查他有沒有訂閱老王
    const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=user:read:subscriptions`;
    window.location.href = authUrl;
};

window.verifyTwitchSubStatus = async function(uid, accessToken) {
    PremiumSwal.fire({ title: '驗證 Twitch 數據中...', html: '正在與 Twitch 伺服器建立加密連線', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    
    try {
        // 1. 取得粉絲的 Twitch ID
        const userRes = await fetch('https://api.twitch.tv/helix/users', { headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${accessToken}` } });
        const userData = await userRes.json();
        if (!userData.data || userData.data.length === 0) throw new Error("無法取得 Twitch 帳號資料");
        const twitchUserId = userData.data[0].id;
        const twitchUserName = userData.data[0].login;

        // 2. 取得老王頻道的 ID
        const bcRes = await fetch(`https://api.twitch.tv/helix/users?login=${BROADCASTER_LOGIN}`, { headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${accessToken}` } });
        const bcData = await bcRes.json();
        const broadcasterId = bcData.data[0].id;

        // 3. 檢查該粉絲是否有訂閱老王
        let isSub = false;
        try {
            const subRes = await fetch(`https://api.twitch.tv/helix/subscriptions/user?broadcaster_id=${broadcasterId}&user_id=${twitchUserId}`, { headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${accessToken}` } });
            if (subRes.status === 200) isSub = true; // 回傳 200 代表有訂閱
        } catch(e) { console.log('未訂閱或檢查失敗'); }

        // 4. 寫入 Firebase 資料庫
        await window.firebaseApp.updateDoc(window.firebaseApp.doc(window.firebaseApp.db, "users", uid), {
            twitchId: twitchUserId,
            twitchName: twitchUserName,
            isTwitchSub: isSub
        });

        window.appSettings.isTwitchSub = isSub;
        window.appSettings.twitchName = twitchUserName; // 🌟 補上：同步更新暫存的 Twitch 名稱
        window.saveSettings();
        
        if (isSub) {
            window.gainExp(100, true, "乾爹驗證成功空投");
            PremiumSwal.fire({ title: '乾爹降臨 👑', text: `感謝訂閱！已為您掛上專屬徽章，並發送 100 EXP 獎勵！`, icon: 'success' });
        } else {
            PremiumSwal.fire({ title: '綁定成功', text: `已綁定帳號 ${twitchUserName}。目前系統未偵測到訂閱狀態，若您剛訂閱，請稍後重新驗證。`, icon: 'info' });
        }
        
    } catch(error) {
        PremiumSwal.fire('驗證失敗', '連線逾時或授權無效，請重試。', 'error');
    }
};

// 🌟 覆蓋原本的個人中心，加入綁定按鈕
window.toggleUserMenu = function () {
    const user = window.firebaseApp && window.firebaseApp.auth ? window.firebaseApp.auth.currentUser : null;
    if (!user) return;
    const isGuest = user.isAnonymous;
    const email = isGuest ? "未綁定 (訪客模式)" : (user.email || "使用 Google 授權登入");
    const uid = user.uid;

            let twitchAreaHtml = "";
            if (window.appSettings.isTwitchSub) {
                twitchAreaHtml = `
                    <div class="flex items-center gap-2">
                        <span class="text-zinc-300 text-xs font-medium">${window.appSettings.twitchName}</span>
                        <span class="text-purple-400 text-[10px] font-black border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 rounded tracking-widest"><i class="fa-brands fa-twitch mr-1"></i>乾爹認證</span>
                    </div>`;
            } else if (window.appSettings.twitchName) {
                twitchAreaHtml = `
                    <div class="flex items-center gap-2">
                        <span class="text-zinc-300 text-xs font-medium">${window.appSettings.twitchName}</span>
                        <button onclick="window.bindTwitchAccount()" class="bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-[10px] font-bold px-2 py-0.5 rounded transition-colors" title="重新檢查訂閱狀態"><i class="fa-solid fa-rotate mr-1"></i>重整狀態</button>
                    </div>`;
            } else {
                twitchAreaHtml = `<button onclick="window.bindTwitchAccount()" class="bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-bold px-3 py-1 rounded-lg transition-colors shadow-[0_0_10px_rgba(168,85,247,0.4)]"><i class="fa-brands fa-twitch mr-1"></i>前往綁定驗證</button>`;
            }

    PremiumSwal.fire({
        title: '<i class="fa-solid fa-crown text-sky-400 mr-2"></i> 個人帳號中心',
        html: `
            <div class="text-left space-y-4 mt-6">
                <div class="bg-white/5 border border-white/10 p-4 rounded-2xl space-y-3">
                    <div class="flex items-center justify-between border-b border-white/5 pb-2"><span class="text-zinc-400 text-xs font-bold">綁定信箱</span><span class="text-sky-300 text-xs font-medium">${email}</span></div>
                    <div class="flex items-center justify-between border-b border-white/5 pb-2"><span class="text-zinc-400 text-xs font-bold">粉絲編號</span><span class="text-zinc-300 text-xs font-mono font-bold tracking-widest">UID-${uid.substring(0, 8).toUpperCase()}</span></div>
                    <div class="flex items-center justify-between min-h-[30px]"><span class="text-zinc-400 text-xs font-bold">Twitch 身分</span>${isGuest ? '<span class="text-zinc-600 text-[10px]">訪客無法綁定</span>' : twitchAreaHtml}</div>
                </div>
                ${!isGuest ? `<button onclick="window.updateUserAvatar()" class="w-full bg-sky-500/10 border border-sky-500/30 text-sky-400 py-3 rounded-2xl font-black tracking-widest hover:bg-sky-500 hover:text-[#020617] transition-all shadow-md"><i class="fa-solid fa-camera mr-2"></i>更換專屬頭像</button>` : ''}
                <button onclick="window.logoutUser()" class="w-full bg-red-500/10 border border-red-500/30 text-red-400 py-4 rounded-2xl font-black tracking-widest hover:bg-red-500 hover:text-white transition-all mt-4">登出帳號</button>
            </div>
        `,
        showConfirmButton: false, showCloseButton: true
    });
};