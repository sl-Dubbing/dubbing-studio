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

    // ---------------- التفاعل البصري لرفع الملفات والروابط ----------------
    const mediaFile = document.getElementById('mediaFile');
    const mediaZone = document.getElementById('mediaZone');
    const ytUrlInput = document.getElementById('ytUrl');

    if (mediaFile && mediaZone) {
        mediaFile.addEventListener('change', () => {
            if (mediaFile.files.length > 0) {
                const file = mediaFile.files[0];
                const iconClass = file.type.startsWith('video') ? 'fa-file-video' : 'fa-file-audio';
                
                mediaZone.innerHTML = `
                    <i class="fas ${iconClass} fa-beat" style="font-size:2.5rem; margin-bottom:10px; color:#065f2c; display:block;"></i>
                    <span style="font-weight:bold; color:#065f2c;">تم تجهيز الملف:</span><br>
                    <span style="font-size:0.9rem; color:#111827;">${file.name}</span>
                `;
                mediaZone.style.borderColor = '#065f2c';
                mediaZone.style.background = '#f0fdf4';

                if (ytUrlInput) {
                    ytUrlInput.value = '';
                    ytUrlInput.style.borderColor = 'var(--border)';
                    ytUrlInput.style.boxShadow = 'none';
                }
            }
        });
    }

    if (ytUrlInput) {
        ytUrlInput.addEventListener('input', () => {
            const url = ytUrlInput.value.trim();
            const ytRegex = /^(https?\:\/\/)?(www\.youtube\.com|youtu\.?be)\/.+$/;

            if (ytRegex.test(url)) {
                ytUrlInput.style.borderColor = '#065f2c';
                ytUrlInput.style.boxShadow = '0 0 0 2px rgba(6, 95, 44, 0.2)';
                showToast("✅ تم التعرف على رابط يوتيوب!", "#065f2c");

                if (mediaFile) mediaFile.value = '';
                if (mediaZone) {
                    mediaZone.innerHTML = `
                        <i class="fas fa-cloud-upload-alt" style="font-size:2rem; margin-bottom:10px; color:#9ca3af; display:block;"></i>
                        انقر هنا لرفع ملف فيديو أو صوت من جهازك
                    `;
                    mediaZone.style.borderColor = 'var(--border)';
                    mediaZone.style.background = 'transparent';
                }
            } else if (url.length > 0) {
                ytUrlInput.style.borderColor = '#b91c1c';
                ytUrlInput.style.boxShadow = 'none';
            } else {
                ytUrlInput.style.borderColor = 'var(--border)';
                ytUrlInput.style.boxShadow = 'none';
            }
        });
    }
});

async function loadVoicesFromGithub() {
    const spkGrid = document.getElementById('spkGrid');
    if (!spkGrid) return;
    spkGrid.innerHTML = '';

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

// ---------------- الدبلجة التلقائية بالكامل ----------------
window.startDubbing = async function() {
    const btn = document.getElementById('startBtn');
    const ytUrlInput = document.getElementById('ytUrl');
    const ytUrl = ytUrlInput ? ytUrlInput.value.trim() : '';
    const mediaInput = document.getElementById('mediaFile');
    const mediaFile = mediaInput && mediaInput.files.length ? mediaInput.files[0] : null;
    
    if (!ytUrl && !mediaFile) {
        showToast("يرجى وضع رابط يوتيوب أو رفع ملف", "#b91c1c");
        return;
    }

    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> جاري الإرسال للسيرفر...`;
    
    const voiceUrl = selectedVoice === 'source' ? '' : `https://raw.githubusercontent.com/${GITHUB_USER}/${REPO_NAME}/main/samples/${selectedVoice}.mp3`;

    // استخدام FormData لإرسال البيانات
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
            // السيرفر الآن سيقوم بكل شيء (تفريغ، تصحيح ذكي، ودبلجة)
            if (statusTxt) statusTxt.innerText = 'تم الاستلام! جاري المعالجة الآلية بالكامل...';
            
            const progBar = document.getElementById('progBar');
            if (progBar) progBar.style.width = '5%';
            
            pollInterval = setInterval(() => pollJob(currentJobId), 2000);
        } else { 
            showToast("خطأ: " + data.error, "#b91c1c"); 
            btn.disabled = false; 
            btn.innerHTML = `<i class="fas fa-bolt"></i> ابدأ معالجة الدبلجة الآن`;
        }
    } catch (e) { 
        showToast("فشل الاتصال بالسيرفر", "#b91c1c"); 
        btn.disabled = false; 
        btn.innerHTML = `<i class="fas fa-bolt"></i> ابدأ معالجة الدبلجة الآن`;
    }
};

async function pollJob(jobId) {
    try {
        const res = await fetch(API_BASE + '/api/job/' + jobId, { credentials: 'include' });
        const data = await res.json();
        
        if (data.status === 'processing') {
            const statusTxt = document.getElementById('statusTxt');
            // رسالة تطمئن المستخدم أن الذكاء الاصطناعي يعمل بالخفاء
            if (statusTxt) statusTxt.innerText = 'جاري استخراج الصوت، التصحيح الذكي، والدبلجة...';
            
            const bar = document.getElementById('progBar');
            const pct = document.getElementById('pctTxt');
            if (bar) {
                let cur = parseInt(bar.style.width) || 10;
                cur = Math.min(90, cur + 1); // التقدم بطيء قليلاً ليعكس العمليات المعقدة
                bar.style.width = cur + '%';
                if (pct) pct.innerText = cur + '%';
            }
        } else if (data.status === 'completed') {
            clearInterval(pollInterval);
            const statusTxt = document.getElementById('statusTxt');
            if (statusTxt) statusTxt.innerText = 'اكتملت المعالجة السحرية!';
            
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
                btn.innerHTML = `<i class="fas fa-bolt"></i> ابدأ معالجة الدبلجة الآن`;
            }
            showToast("تمت الدبلجة بنجاح!", "#065f2c");
            checkAuth();
            
        } else if (data.status === 'failed') {
            clearInterval(pollInterval);
            const statusTxt = document.getElementById('statusTxt');
            if (statusTxt) statusTxt.innerText = 'فشلت المعالجة';
            showToast("فشلت عملية الدبلجة. تم استرجاع الرصيد.", "#b91c1c");
            
            const btn = document.getElementById('startBtn');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<i class="fas fa-bolt"></i> ابدأ معالجة الدبلجة الآن`;
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
