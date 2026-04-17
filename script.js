// script.js
const API_BASE = 'https://web-production-14a1.up.railway.app';
const GITHUB_USER = "sl-Dubbing"; 
const REPO_NAME = "sl-dubbing-frontend";

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

    // 3. جلب الأصوات ديناميكياً من GitHub
    loadVoicesFromGithub();

    checkAuth();
});

// --- نظام جلب الأصوات الديناميكي (تم تصحيح المسارات والمتغيرات هنا) ---
async function loadVoicesFromGithub() {
    const spkGrid = document.getElementById('spkGrid');
    if (!spkGrid) return;
    
    spkGrid.innerHTML = ''; // تنظيف القسم

    // 1. إضافة صوت المصدر دائماً
    const sourceCard = document.createElement('div');
    sourceCard.className = 'spk-card active';
    sourceCard.innerHTML = `<i class="fas fa-check-circle chk"></i><div class="spk-av">S</div><div class="spk-nm">صوت المصدر</div>`;
    sourceCard.onclick = () => selectVoice('source', sourceCard);
    spkGrid.appendChild(sourceCard);

    try {
        // تم تصحيح الرابط هنا ليكون مباشراً وصحيحاً
        const url = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/contents/samples?t=${Date.now()}`;
        const response = await fetch(url);
        
        if (!response.ok) throw new Error("فشل الاتصال بـ GitHub API");

        const files = await response.json();
        const audioFiles = files.filter(file => file.name.toLowerCase().endsWith('.mp3'));

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
        console.error("⚠️ خطأ في جلب العينات:", error);
    }
}

function selectVoice(id, el) {
    selectedVoice = id;
    document.querySelectorAll('.spk-card').forEach(c => c.classList.remove('active'));
    el.classList.add('active');

    if (id !== 'source') {
        // تشغيل معاينة الصوت من المجلد المحلي
        const audio = new Audio(`samples/${id}.mp3`);
        audio.play().catch(e => console.warn("معاينة الصوت غير متاحة"));
    }
}

// --- بقية وظائف الهوية والدبلجة تظل كما هي ---
function showToast(msg, color='#0f0f10') {
    const t = document.createElement('div');
    t.className = 'toast show';
    t.style.background = color;
    t.innerText = msg;
    const container = document.getElementById('toasts');
    if (container) { container.appendChild(t); setTimeout(()=>{ t.remove(); }, 3500); }
}

async function checkAuth() {
    try {
        const res = await fetch(API_BASE + '/api/user', {method:'GET', credentials:'include'});
        const data = await res.json();
        if (res.ok && data.success) renderProfile(data.user);
    } catch (err) { console.warn('User not logged in'); }
}

function renderProfile(user) {
    const sec = document.getElementById('authSection');
    if (!sec) return;
    sec.innerHTML = `
    <div style="display:flex;gap:10px;align-items:center">
        <div style="text-align:right">
            <div style="font-weight:700">${user.name || 'مستخدم'}</div>
            <div style="background:rgba(255,255,255,0.06);padding:6px;border-radius:8px">رصيد: ${user.credits}</div>
        </div>
        <button class="auth-btn" onclick="location.reload()">خروج</button>
    </div>`;
}

// تأكد من بقاء دوال startDubbing و pollJob في ملفك كما هي
