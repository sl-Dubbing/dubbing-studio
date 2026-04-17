// script.js
const API_BASE = 'https://web-production-14a1.up.railway.app';
const GITHUB_USER = "abd19"; 
const REPO_NAME = "sl-dubbing-frontend-main";

let selectedVoice = 'source';
let selectedLang = 'ar';
let currentJobId = null;
let pollInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    // 1. إنشاء شبكة اللغات
    const langs = ['ar','en','es','fr','de','it','pt','tr','ru','zh','ja','ko','hi'];
    const langGrid = document.getElementById('langGrid');
    if (langGrid) {
        langs.forEach(l => {
            const el = document.createElement('div');
            el.className = 'lang-box' + (l === selectedLang ? ' active' : '');
            el.innerText = l.toUpperCase();
            el.onclick = () => {
                document.querySelectorAll('.lang-box').forEach(n => n.classList.remove('active'));
                el.classList.add('active');
                selectedLang = l;
            };
            langGrid.appendChild(el);
        });
    }

    // 2. معالجة رفع الملف
    const srtFile = document.getElementById('srtFile');
    const srtZone = document.getElementById('srtZone');
    if (srtFile) {
        srtFile.addEventListener('change', () => {
            if (srtFile.files && srtFile.files.length) {
                srtZone.classList.add('ok');
                srtZone.innerText = srtFile.files[0].name;
            }
        });
    }

    // 3. أزرار الهوية
    const showLoginBtn = document.getElementById('showLoginBtn');
    if (showLoginBtn) {
        showLoginBtn.addEventListener('click', () => {
            document.getElementById('loginModal').style.display = 'flex';
        });
    }
    
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) loginBtn.addEventListener('click', login);
    
    const registerBtn = document.getElementById('registerBtn');
    if (registerBtn) registerBtn.addEventListener('click', register);
    
    // 4. جلب الأصوات ديناميكياً من GitHub
    loadVoicesFromGithub();

    checkAuth();
});

// --- نظام جلب الأصوات الديناميكي (تم تصحيح المسارات هنا) ---
async function loadVoicesFromGithub() {
    const spkGrid = document.getElementById('spkGrid');
    if (!spkGrid) return;
    
    spkGrid.innerHTML = '<div style="color:#6b7280; padding:10px;">جاري تحميل الأصوات...</div>';

    try {
        // تم تصحيح استدعاء المتغيرات هنا بحذف CONFIG
        const url = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/contents/samples?t=${Date.now()}`;
        const response = await fetch(url);
        
        if (!response.ok) throw new Error("فشل الاتصال بـ GitHub");

        const files = await response.json();
        const audioFiles = files.filter(file => file.name.toLowerCase().endsWith('.mp3'));

        spkGrid.innerHTML = ''; // تنظيف القسم

        // 1. إضافة صوت المصدر دائماً
        const sourceCard = document.createElement('div');
        sourceCard.className = 'spk-card active';
        sourceCard.innerHTML = `<i class="fas fa-check-circle chk"></i><div class="spk-av">S</div><div class="spk-nm">صوت المصدر</div>`;
        sourceCard.onclick = () => selectVoice('source', sourceCard);
        spkGrid.appendChild(sourceCard);

        // 2. إضافة الأصوات من GitHub
        audioFiles.forEach(file => {
            const voiceName = file.name.replace(/\.[^/.]+$/, "");
            const card = document.createElement('div');
            card.className = 'spk-card';
            card.onclick = () => selectVoice(voiceName, card);
            card.innerHTML = `
                <i class="fas fa-check-circle chk"></i>
                <div class="spk-av">${voiceName[0].toUpperCase()}</div>
                <div class="spk-nm">${voiceName}</div>
            `;
            spkGrid.appendChild(card);
        });
    } catch (error) {
        console.error("⚠️ فشل جلب عينات GitHub:", error);
        spkGrid.innerHTML = '<div style="color:#ef4444; padding:10px;">تعذر تحميل الأصوات الإضافية</div>';
    }
}

function selectVoice(id, el) {
    selectedVoice = id;
    document.querySelectorAll('.spk-card').forEach(c => c.classList.remove('active'));
    el.classList.add('active');

    // تشغيل معاينة الصوت
    if (id !== 'source') {
        // نستخدم المسار النسبي لمجلد samples في مستودعك
        const audio = new Audio(`samples/${id}.mp3`);
        audio.play().catch(e => console.log("العينة الصوتية غير متوفرة للمعاينة"));
    }
}

// --- وظائف التنبيه ---
function showToast(msg, color='#0f0f10') {
    const t = document.createElement('div');
    t.className = 'toast show';
    t.style.background = color;
    t.innerText = msg;
    const container = document.getElementById('toasts');
    if (container) {
        container.appendChild(t);
        setTimeout(()=>{ t.remove(); }, 3500);
    }
}

function closeLogin() { document.getElementById('loginModal').style.display = 'none'; }

// --- وظائف الهوية (Auth) ---
async function login() {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    if (!email || !password) { showToast('أدخل البريد وكلمة المرور', '#b91c1c'); return; }
    try {
        const res = await fetch(API_BASE + '/api/auth/login', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({email, password}),
            credentials: 'include'
        });
        const data = await res.json();
        if (!res.ok || !data.success) { showToast('فشل تسجيل الدخول: ' + (data.error || res.statusText), '#b91c1c'); return; }
        closeLogin();
        showToast('تم تسجيل الدخول', '#065f2c');
        renderProfile(data.user);
    } catch (err) { console.error(err); showToast('خطأ في الاتصال', '#b91c1c'); }
}

async function register() {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    if (!email || !password) { showToast('أدخل البريد وكلمة المرور', '#b91c1c'); return; }
    try {
        const res = await fetch(API_BASE + '/api/auth/register', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({email, password}),
            credentials: 'include'
        });
        const data = await res.json();
        if (!res.ok || !data.success) { showToast('فشل التسجيل: ' + (data.error || res.statusText), '#b91c1c'); return; }
        closeLogin();
        showToast('تم إنشاء الحساب وتسجيل الدخول', '#065f2c');
        renderProfile(data.user);
    } catch (err) { console.error(err); showToast('خطأ في الاتصال', '#b91c1c'); }
}

async function logout() {
    try { await fetch(API_BASE + '/api/auth/logout', {method:'POST', credentials:'include'}); } catch(e){}
    location.reload(); // إعادة تحميل الصفحة لتنظيف الحالة
}

async function checkAuth() {
    try {
        const res = await fetch(API_BASE + '/api/user', {method:'GET', credentials:'include'});
        const data = await res.json();
        if (res.ok && data.success) renderProfile(data.user);
    } catch (err) { console.error('auth check failed', err); }
}

function renderProfile(user) {
    const sec = document.getElementById('authSection');
    if (!sec) return;
    sec.innerHTML = `
    <div style="display:flex;gap:10px;align-items:center">
        <div style="text-align:right">
            <div style="font-weight:700">${user.name || user.email.split('@')[0]}</div>
            <div style="background:rgba(255,255,255,0.06);padding:6px;border-radius:8px" class="credits">رصيد: ${user.credits}</div>
        </div>
        <button class="auth-btn" id="logoutBtn">خروج</button>
    </div>`;
    document.getElementById('logoutBtn').addEventListener('click', logout);
}

// --- نظام الدبلجة ---
async function startDubbing() {
    const startBtn = document.getElementById('startBtn');
    startBtn.disabled = true;
    startBtn.innerText = 'جاري الإرسال...';

    const srtInput = document.getElementById('srtFile');
    if (!srtInput.files || !srtInput.files.length) { 
        showToast('يرجى رفع ملف SRT أولاً', '#b91c1c'); 
        startBtn.disabled=false; 
        startBtn.innerText='ابدأ معالجة الدبلجة'; 
        return; 
    }
    const file = srtInput.files[0];
    const srtText = await file.text();

    const payload = {
        srt: srtText,
        lang: selectedLang,
        voice_mode: selectedVoice === 'source' ? 'source' : 'xtts',
        voice_id: selectedVoice === 'source' ? '' : selectedVoice,
        voice_url: ''
    };

    try {
        const res = await fetch(API_BASE + '/api/dub', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok || !data.success) { 
            showToast('خطأ: ' + (data.error || res.statusText), '#b91c1c'); 
            startBtn.disabled=false; 
            startBtn.innerText='ابدأ معالجة الدبلجة'; 
            return; 
        }
        currentJobId = data.job_id;
        showToast('تم إنشاء المهمة. جاري المعالجة...', '#065f2c');
        document.getElementById('progressArea').style.display = 'block';
        document.getElementById('statusTxt').innerText = 'قيد الانتظار...';
        document.getElementById('progBar').style.width = '5%';
        pollInterval = setInterval(() => pollJob(currentJobId), 2000);
    } catch (err) { 
        console.error(err); 
        showToast('فشل الاتصال بالخادم', '#b91c1c'); 
        startBtn.disabled=false; 
        startBtn.innerText='ابدأ معالجة الدبلجة'; 
    }
}

async function pollJob(jobId) {
    try {
        const res = await fetch(API_BASE + '/api/job/' + encodeURIComponent(jobId), { method: 'GET', credentials: 'include' });
        const data = await res.json();
        if (!res.ok || !data.success) {
            if (res.status === 401) { 
                clearInterval(pollInterval); 
                showToast('الرجاء تسجيل الدخول', '#b91c1c'); 
                document.getElementById('progressArea').style.display='none'; 
            }
            return;
        }
        
        const status = data.status;
        if (status === 'processing') {
            document.getElementById('statusTxt').innerText = 'قيد المعالجة...';
            const bar = document.getElementById('progBar');
            let cur = parseInt(bar.style.width) || 10;
            cur = Math.min(90, cur + 5);
            bar.style.width = cur + '%';
            document.getElementById('pctTxt').innerText = bar.style.width;
        } else if (status === 'completed') {
            clearInterval(pollInterval);
            document.getElementById('statusTxt').innerText = 'اكتملت المعالجة';
            document.getElementById('progBar').style.width = '100%';
            document.getElementById('pctTxt').innerText = '100%';
            showResult(data.audio_url);
        } else if (status === 'failed') {
            clearInterval(pollInterval);
            document.getElementById('statusTxt').innerText = 'فشلت المعالجة';
            showToast('فشلت المعالجة. تم استرجاع الرصيد.', '#b91c1c');
            document.getElementById('startBtn').disabled = false;
            document.getElementById('startBtn').innerText = 'ابدأ معالجة الدبلجة';
        }
    } catch (err) { console.error('poll error', err); }
}

function showResult(audioUrl) {
    if (!audioUrl) { showToast('لم يتم العثور على ملف الصوت', '#b91c1c'); return; }
    
    if (audioUrl.startsWith('file://')) {
        const name = audioUrl.split('/').pop();
        audioUrl = API_BASE + '/api/file/' + name;
    }
    
    const resCard = document.getElementById('resCard');
    const aud = document.getElementById('dubAud');
    const dl = document.getElementById('dlBtn');
    
    aud.src = audioUrl;
    dl.href = audioUrl;
    dl.setAttribute('download', `dub_${currentJobId || 'audio'}.mp3`);
    
    resCard.style.display = 'block';
    document.getElementById('progressArea').style.display = 'none';
    document.getElementById('startBtn').disabled = false;
    document.getElementById('startBtn').innerText = 'ابدأ معالجة الدبلجة';
    showToast('تمت المعالجة بنجاح', '#065f2c');
}
