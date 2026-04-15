// script.js
const API_BASE = 'https://sl-dubbing-backend.railway.app'; // غيّر إلى عنوانك الفعلي

let selectedVoice = 'muhamed';
let selectedLang = 'ar';
let currentJobId = null;
let pollInterval = null;

document.addEventListener('DOMContentLoaded', () => {
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

  const srtFile = document.getElementById('srtFile');
  const srtZone = document.getElementById('srtZone');
  srtFile.addEventListener('change', () => {
    if (srtFile.files && srtFile.files.length) {
      srtZone.classList.add('ok');
      srtZone.innerText = srtFile.files[0].name;
    }
  });

  document.getElementById('showLoginBtn').addEventListener('click', () => {
    document.getElementById('loginModal').style.display = 'flex';
  });
  document.getElementById('loginBtn').addEventListener('click', login);
  document.getElementById('registerBtn').addEventListener('click', register);
  document.getElementById('googleBtn').addEventListener('click', () => alert('Google login requires client setup'));

  checkAuth();
});

function selectVoice(id, el) {
  selectedVoice = id;
  document.querySelectorAll('.spk-card').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
}

function showToast(msg, color='#0f0f10') {
  const t = document.createElement('div');
  t.className = 'toast show';
  t.style.background = color;
  t.innerText = msg;
  document.getElementById('toasts').appendChild(t);
  setTimeout(()=>{ t.remove(); }, 3500);
}

function closeLogin() { document.getElementById('loginModal').style.display = 'none'; }

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
  sec.innerHTML = `<div style="display:flex;gap:10px;align-items:center"><div style="text-align:right"><div style="font-weight:700">${user.name}</div><div style="background:rgba(255,255,255,0.06);padding:6px;border-radius:8px">رصيد: ${user.credits}</div></div><button class="auth-btn" id="logoutBtn">خروج</button></div>`;
  document.getElementById('logoutBtn').addEventListener('click', logout);
}

// Dubbing flow
async function startDubbing() {
  const startBtn = document.getElementById('startBtn');
  startBtn.disabled = true;
  startBtn.innerText = 'جاري الإرسال...';

  const srtInput = document.getElementById('srtFile');
  if (!srtInput.files || !srtInput.files.length) { showToast('يرجى رفع ملف SRT أولاً', '#b91c1c'); startBtn.disabled=false; startBtn.innerText='ابدأ معالجة الدبلجة'; return; }
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
    if (!res.ok || !data.success) { showToast('خطأ: ' + (data.error || res.statusText), '#b91c1c'); startBtn.disabled=false; startBtn.innerText='ابدأ معالجة الدبلجة'; return; }
    currentJobId = data.job_id;
    showToast('تم إنشاء المهمة. جاري المعالجة...', '#065f2c');
    document.getElementById('progressArea').style.display = 'block';
    document.getElementById('statusTxt').innerText = 'قيد الانتظار...';
    document.getElementById('progBar').style.width = '5%';
    pollInterval = setInterval(() => pollJob(currentJobId), 2000);
  } catch (err) { console.error(err); showToast('فشل الاتصال بالخادم', '#b91c1c'); startBtn.disabled=false; startBtn.innerText='ابدأ معالجة الدبلجة'; }
}

async function pollJob(jobId) {
  try {
    const res = await fetch(API_BASE + '/api/job/' + encodeURIComponent(jobId), { method: 'GET', credentials: 'include' });
    const data = await res.json();
    if (!res.ok || !data.success) {
      if (res.status === 401) { clearInterval(pollInterval); showToast('الرجاء تسجيل الدخول', '#b91c1c'); document.getElementById('progressArea').style.display='none'; }
      else if (res.status === 404) { clearInterval(pollInterval); document.getElementById('statusTxt').innerText='المهمة غير موجودة'; showToast('المهمة غير موجودة', '#b91c1c'); }
      return;
    }
    const status = data.status;
    if (status === 'processing') {
      document.getElementById('statusTxt').innerText = 'قيد المعالجة...';
      const bar = document.getElementById('progBar');
      let cur = parseInt(bar.style.width) || 10;
      cur = Math.min(90, cur + Math.floor(Math.random()*10)+5);
      bar.style.width = cur + '%';
      document.getElementById('pctTxt').innerText = bar.style.width;
    } else if (status === 'completed') {
      clearInterval(pollInterval);
      document.getElementById('statusTxt').innerText = 'اكتملت المعالجة';
      document.getElementById('progBar').style.width = '100%';
      document.getElementById('pctTxt').innerText = '100%';
      showResult(data.audio_url);
      if (data.remaining_credits !== undefined) {
        const c = document.querySelector('#authSection .credits');
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
  if (audioUrl.startsWith('file://')) {
    const local = audioUrl.replace('file://', '');
    const name = local.split('/').pop();
    audioUrl = API_BASE.replace(/\/$/, '') + '/api/file/' + name;
  }
  const resCard = document.getElementById('resCard');
  const aud = document.getElementById('dubAud');
  const dl = document.getElementById('dlBtn');
  aud.src = audioUrl;
  dl.href = audioUrl;
  dl.setAttribute('download', 'dub_' + (currentJobId || 'audio') + '.mp3');
  resCard.style.display = 'block';
  document.getElementById('progressArea').style.display = 'none';
  document.getElementById('startBtn').disabled = false;
  document.getElementById('startBtn').innerText = 'ابدأ معالجة الدبلجة';
  showToast('تمت المعالجة بنجاح', '#065f2c');
}
