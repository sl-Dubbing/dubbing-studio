const API_BASE = 'https://web-production-14a1.up.railway.app';
const GITHUB_USER = "sl-Dubbing"; 
const REPO_NAME = "sl-dubbing-frontend";

let selectedVoice = 'source';
let selectedLang = 'ar';
let currentJobId = null;
let pollInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    loadVoicesFromGithub();
    checkAuth();
    
    // إعداد اللغات
    const langGrid = document.getElementById('langGrid');
    if (langGrid) {
        const langs = ['ar','en','es','fr','de','it','pt','tr','ru','zh','ja','ko','hi'];
        langGrid.innerHTML = '';
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

    // إعداد ملف الفيديو أو الصوت من الجهاز (البديل لـ SRT)
    const mediaFile = document.getElementById('mediaFile');
    if (mediaFile) {
        mediaFile.addEventListener('change', () => {
            if (mediaFile.files.length) {
                const zone = document.getElementById('mediaZone');
                if (zone) {
                    zone.innerText = "تم اختيار: " + mediaFile.files[0].name;
                    zone.classList.add('ok');
                }
                const ytInput = document.getElementById('ytUrl');
                if (ytInput) ytInput.value = ''; // مسح رابط اليوتيوب إذا تم رفع ملف لمنع التضارب
            }
        });
    }
});

async function loadVoicesFromGithub() {
    const spkGrid = document.getElementById('spkGrid');
    if (!spkGrid) return;
    spkGrid.innerHTML = '';

    // إضافة صوت المصدر
    const sourceCard = document.createElement('div');
    sourceCard.className = 'spk-card active';
    sourceCard.innerHTML = `<i class="fas fa-check-circle chk"></i><div class="spk-av">S</div><div class="spk-nm">صوت المصدر</div>`;
    sourceCard.onclick = () => selectVoice('source', sourceCard);
    spkGrid.appendChild(sourceCard);

    try {
        const url = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/contents/samples?t=${Date.now()}`;
        const res = await fetch(url);
        const files = await res.json();
        files.filter(f => f.name.toLowerCase().endsWith('.mp3')).forEach(file => {
            const name = file.name.replace(/\.[^/.]+$/, "");
            const card = document.createElement('div');
            card.className = 'spk-card';
            card.innerHTML = `<i class="fas fa-check-circle chk"></i><div class="spk-av">${name[0].toUpperCase()}</div><div class="spk-nm">${name}</div>`;
            card.onclick = () => selectVoice(name, card);
            spkGrid.appendChild(card);
        });
    } catch (e) { console.error("Error loading voices", e); }
}

function selectVoice(id, el) {
    selectedVoice = id;
    document.querySelectorAll('.spk-card').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    if (id !== 'source') {
        const audio = new Audio("samples/" + id + ".mp3"); 
        audio.play().catch(() => console.warn("Preview not available"));
    }
}

// دالة الدبلجة الجديدة (باستخدام FormData لدعم الملفات والروابط)
window.startDubbing = async function() {
    const btn = document.getElementById('startBtn');
    const ytUrlInput = document.getElementById('ytUrl');
    const ytUrl = ytUrlInput ? ytUrlInput.value.trim() : '';
    const mediaInput = document.getElementById('mediaFile');
    const mediaFile = mediaInput && mediaInput.files.length ? mediaInput.files[0] : null;
    
    if (!ytUrl && !mediaFile) {
        showToast("يرجى وضع رابط يوتيوب أو رفع ملف من جهازك", "#b91c1c");
        return;
    }

    btn.disabled = true;
    btn.innerText = "جاري إرسال الوسائط للسيرفر...";
    
    // سحب رابط الصوت ليقوم السيرفر بتقليده (مهم جداً)
    const voiceUrl = selectedVoice === 'source' ? '' : `https://raw.githubusercontent.com/${GITHUB_USER}/${REPO_NAME}/main/samples/${selectedVoice}.mp3`;

    // استخدام FormData لإرسال الملفات أو الروابط بدلاً من JSON
    const formData = new FormData();
    formData.append('lang', selectedLang);
    formData.append('voice_mode', selectedVoice === 'source' ? 'source' : 'xtts');
    formData.append('voice_id', selectedVoice === 'source' ? '' : selectedVoice);
    formData.append('voice_url', voiceUrl);
    
    if (ytUrl) formData.append('yt_url', ytUrl);
    if (mediaFile) formData.append('media_file', mediaFile);

    try {
        const res = await fetch(API_BASE + '/api/dub', {
            method: 'POST',
            body: formData, 
            credentials: 'include'
        });
        const data = await res.json();
        
        if (data.success) {
            currentJobId = data.job_id;
            const progArea = document.getElementById('progressArea');
            if (progArea) progArea.style.display = 'block';
            
            const statusTxt = document.getElementById('statusTxt');
            if (statusTxt) statusTxt.innerText = 'تم الاستلام! جاري التفريغ والمزامنة...';
            
            const progBar = document.getElementById('progBar');
            if (progBar) progBar.style.width = '5%';
            
            pollInterval = setInterval(() => pollJob(currentJobId), 2000);
        } else { 
            showToast("خطأ: " + data.error, "#b91c1c"); 
            btn.disabled = false; 
            btn.innerText = "ابدأ معالجة الدبلجة الآن";
        }
    } catch (e) { 
        showToast("فشل الاتصال بالسيرفر", "#b91c1c"); 
        btn.disabled = false; 
        btn.innerText = "ابدأ معالجة الدبلجة الآن";
    }
};

async function pollJob(jobId) {
    try {
        const res = await fetch(API_BASE + '/api/job/' + jobId, { credentials: 'include' });
        const data = await res.json();
        
        if (data.status === 'processing') {
            const statusTxt = document.getElementById('statusTxt');
            if (statusTxt) statusTxt.innerText = 'جاري المعالجة (تفريغ، ترجمة، ودبلجة)...';
            
            const bar = document.getElementById('progBar');
            const pct = document.getElementById('pctTxt');
            if (bar) {
                let cur = parseInt(bar.style.width) || 10;
                // التقدم أبطأ لأن معالجة الفيديو تأخذ وقتاً أطول
                cur = Math.min(90, cur + 2); 
                bar.style.width = cur + '%';
                if (pct) pct.innerText = cur + '%';
            }
        } else if (data.status === 'completed') {
            clearInterval(pollInterval);
            const statusTxt = document.getElementById('statusTxt');
            if (statusTxt) statusTxt.innerText = 'اكتملت المعالجة!';
            
            const bar = document.getElementById('progBar');
            const pct = document.getElementById('pctTxt');
            if (bar) bar.style.width = '100%';
            if (pct) pct.innerText = '100%';

            const resCard = document.getElementById('resCard');
            if (resCard) resCard.style.display = 'block';
            
            const aud = document.getElementById('dubAud');
            if (aud) aud.src = data.audio_url;
            
            const dlBtn = document.getElementById('dlBtn');
            if (dlBtn) dlBtn.href = data.audio_url;

            const btn = document.getElementById('startBtn');
            if (btn) {
                btn.disabled = false;
                btn.innerText = "ابدأ معالجة الدبلجة الآن";
            }
            showToast("تمت الدبلجة بنجاح!", "#065f2c");
            checkAuth(); // تحديث الرصيد بعد الخصم
            
        } else if (data.status === 'failed') {
            clearInterval(pollInterval);
            const statusTxt = document.getElementById('statusTxt');
            if (statusTxt) statusTxt.innerText = 'فشلت المعالجة';
            showToast("فشلت عملية الدبلجة. تم استرجاع الرصيد.", "#b91c1c");
            
            const btn = document.getElementById('startBtn');
            if (btn) {
                btn.disabled = false;
                btn.innerText = "ابدأ معالجة الدبلجة الآن";
            }
            checkAuth();
        }
    } catch (e) {
        console.error("Polling error", e);
    }
}

async function checkAuth() {
    try {
        const res = await fetch(API_BASE + '/api/user', { credentials: 'include' });
        const data = await res.json();
        if (data.success) {
            const authSec = document.getElementById('authSection');
            if (authSec) {
                authSec.innerHTML = `
                <div style="display:flex;gap:10px;align-items:center">
                    <div style="text-align:right">
                        <div style="font-weight:700">${data.user.name || 'مستخدم'}</div>
                        <div style="background:rgba(255,255,255,0.06);padding:6px;border-radius:8px">رصيد: ${data.user.credits}</div>
                    </div>
                    <button class="auth-btn" onclick="location.reload()">خروج</button>
                </div>`;
            }
        }
    } catch (e) {}
}

function showToast(msg, color='#0f0f10') {
    const t = document.createElement('div');
    t.className = 'toast show';
    t.style.background = color;
    t.innerText = msg;
    const container = document.getElementById('toasts');
    if (container) { 
        container.appendChild(t); 
        setTimeout(() => { t.remove(); }, 3500); 
    } else {
        document.body.appendChild(t);
        setTimeout(() => { t.remove(); }, 3500); 
    }
}
