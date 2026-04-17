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

    // إعداد ملف الـ SRT
    const srtFile = document.getElementById('srtFile');
    if (srtFile) {
        srtFile.addEventListener('change', () => {
            if (srtFile.files.length) document.getElementById('srtZone').innerText = srtFile.files[0].name;
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
    sourceCard.innerHTML = `<div class="spk-av">S</div><div class="spk-nm">صوت المصدر</div>`;
    sourceCard.onclick = () => selectVoice('source', sourceCard);
    spkGrid.appendChild(sourceCard);

    try {
        const url = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/contents/samples?t=${Date.now()}`;
        const res = await fetch(url);
        const files = await res.json();
        files.filter(f => f.name.endsWith('.mp3')).forEach(file => {
            const name = file.name.replace('.mp3', '');
            const card = document.createElement('div');
            card.className = 'spk-card';
            card.innerHTML = `<div class="spk-av">${name[0].toUpperCase()}</div><div class="spk-nm">${name}</div>`;
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
        const audio = new Audio("samples/" + id + ".mp3"); // تنظيف المسار تماماً
        audio.play().catch(() => console.warn("Preview not available"));
    }
}

// جعل الدالة Global لتعمل مع onclick في HTML
window.startDubbing = async function() {
    const btn = document.getElementById('startBtn');
    const srtInput = document.getElementById('srtFile');
    if (!srtInput.files.length) return alert("يرجى رفع ملف SRT");

    btn.disabled = true;
    btn.innerText = "جاري الإرسال...";
    
    const srtText = await srtInput.files[0].text();
    const payload = { srt: srtText, lang: selectedLang, voice_mode: (selectedVoice==='source'?'source':'xtts'), voice_id: (selectedVoice==='source'?'':selectedVoice) };

    try {
        const res = await fetch(API_BASE + '/api/dub', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            credentials: 'include'
        });
        const data = await res.json();
        if (data.success) {
            currentJobId = data.job_id;
            document.getElementById('progressArea').style.display = 'block';
            pollInterval = setInterval(() => pollJob(currentJobId), 2000);
        } else { alert("خطأ: " + data.error); btn.disabled = false; }
    } catch (e) { alert("فشل الاتصال"); btn.disabled = false; }
};

async function pollJob(jobId) {
    const res = await fetch(API_BASE + '/api/job/' + jobId, { credentials: 'include' });
    const data = await res.json();
    if (data.status === 'completed') {
        clearInterval(pollInterval);
        document.getElementById('resCard').style.display = 'block';
        document.getElementById('dubAud').src = data.audio_url;
        document.getElementById('startBtn').disabled = false;
    }
}

async function checkAuth() {
    const res = await fetch(API_BASE + '/api/user', { credentials: 'include' });
    const data = await res.json();
    if (data.success) {
        document.getElementById('authSection').innerHTML = `<span>${data.user.name}</span> (رصيد: ${data.user.credits})`;
    }
}
