// script.js
const API_BASE = 'https://web-production-14a1.up.railway.app';
const GITHUB_USER = "Dashboard"; // اسم المستخدم الخاص بك
const REPO_NAME = "sl-dubbing-frontend-main"; // اسم المستودع

let selectedVoice = 'source';
let selectedLang = 'ar';
let currentJobId = null;
let pollInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    // 1. إنشاء شبكة اللغات
    const langs = ['ar','en','es','fr','de','it','pt','tr','ru','zh','ja','ko','hi'];
    const langGrid = document.getElementById('langGrid');
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

    // 2. معالجة رفع الملف
    const srtFile = document.getElementById('srtFile');
    const srtZone = document.getElementById('srtZone');
    srtFile.addEventListener('change', () => {
        if (srtFile.files && srtFile.files.length) {
            srtZone.classList.add('ok');
            srtZone.innerText = srtFile.files[0].name;
        }
    });

    // 3. أزرار الهوية
    document.getElementById('showLoginBtn').addEventListener('click', () => {
        document.getElementById('loginModal').style.display = 'flex';
    });
    document.getElementById('loginBtn').addEventListener('click', login);
    document.getElementById('registerBtn').addEventListener('click', register);
    
    // 4. جلب الأصوات ديناميكياً من GitHub
    loadVoicesFromGithub();

    checkAuth();
});

// --- نظام جلب الأصوات الديناميكي ---
async function loadVoicesFromGithub() {
    const spkGrid = document.getElementById('spkGrid');
    if (!spkGrid) return;
    
    spkGrid.innerHTML = ''; // تنظيف الشبكة
    
    // إضافة خيار صوت المصدر يدوياً كخيار أول
    createVoiceCard('source', 'صوت المصدر');

    try {
        const githubApiUrl = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/contents/samples`;
        const response = await fetch(githubApiUrl);
        
        if (!response.ok) throw new Error("Could not fetch samples");
        
        const files = await response.json();
        const audioFiles = files.filter(file => file.name.endsWith('.mp3'));

        audioFiles.forEach(file => {
            const voiceName = file.name.replace('.mp3', '');
            createVoiceCard(voiceName, voiceName);
        });
    } catch (error) {
        console.error("خطأ في جلب العينات:", error);
        // خيارات احتياطية في حال الفشل
        createVoiceCard('muhamed', 'Muhamed');
        createVoiceCard('dmitry', 'Dmitry');
    }
}

function createVoiceCard(id, displayName) {
    const spkGrid = document.getElementById('spkGrid');
    const card = document.createElement('div');
    card.className = 'spk-card' + (id === selectedVoice ? ' active' : '');
    card.innerText = displayName;
    card.onclick = () => selectVoice(id, card);
    spkGrid.appendChild(card);
}

function selectVoice(id, el) {
    selectedVoice = id;
    document.querySelectorAll('.spk-card').forEach(c => c.classList.remove('active'));
    el.classList.add('active');

    // تشغيل معاينة الصوت إذا لم يكن "صوت المصدر"
    if (id !== 'source') {
        const audio = new Audio(`samples/${id}.mp3`);
        audio.play().catch(e => console.log("العينة الصوتية غير متوفرة بعد"));
    }
}

// --- وظائف التنبيه ---
function showToast(msg, color='#0f0f10') {
    const t = document.createElement('div');
    t.className = 'toast show';
    t.style.background = color;
    t.innerText = msg;
    document.getElementById('toasts').appendChild(t);
    setTimeout(()=>{ t.remove(); }, 3500);
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
    document.getElementById('authSection').innerHTML = '<button class="auth-btn" id="showLoginBtn">تسجيل / دخول</button>';
    document.getElementById('showLoginBtn').addEventListener('click', () => { document.getElementById('loginModal').style.display = 'flex'; });
    showToast('تم تسجيل الخروج', '#065f2c');
}

async function checkAuth() {
    try {
        const res = await fetch(API_BASE + '/api/user', {method:'GET', credentials:'include'});
        const data = await res.json();
        if (res.ok && data.success) renderProfile(data.user);
        else {
            document.getElementById('authSection').innerHTML = '<button class="auth-btn" id="showLoginBtn">تسجيل / دخول</button>';
            document.getElementById('showLoginBtn').addEventListener('click', () => { document.getElementById('loginModal').style.display = 'flex'; });
        }
    } catch (err) { console.error('auth check failed', err); }
}

function renderProfile(user) {
    const sec = document.getElementById('authSection');
    sec.innerHTML = `
    <div style="display:flex;gap:10px;align-items:center">
        <div style="text-align:right">
            <div style="font-weight:700">${user.name}</div>
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
            else if (res.status === 404) { 
                clearInterval(pollInterval); 
                document.getElementById('statusTxt').innerText='المهمة غير موجودة'; 
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
            if (data.remaining_credits !== undefined) {
                const c = document.querySelector('.credits');
                if (c) c.innerText = 'رصيد: ' + data.remaining_credits;
            }
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
    
    // التعامل مع روابط الملفات المحلية للسيرفر
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
