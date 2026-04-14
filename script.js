// ============================================================
// script.js — sl-Dubbing Frontend (Production Version)
// ============================================================

const CONFIG = {
  API_BASE: 'https://sl-dubbing-backend-production.up.railway.app', 
  LANGS: [
    {c:'ar', n:'العربية', f:'🇸🇦'},
    {c:'en', n:'English', f:'🇺🇸'},
    {c:'es', n:'Español', f:'🇪🇸'},
    {c:'fr', n:'Français', f:'🇫🇷'},
    {c:'de', n:'Deutsch', f:'🇩🇪'},
    {c:'it', n:'Italiano', f:'🇮🇹'},
    {c:'ru', n:'Русский', f:'🇷🇺'},
    {c:'tr', n:'Türkçe', f:'🇹🇷'},
    {c:'zh', n:'中文', f:'🇨🇳'},
    {c:'hi', n:'हिन्दी', f:'🇮🇳'},
    {c:'fa', n:'فارسی', f:'🇮🇷'},
    {c:'sv', n:'Svenska', f:'🇸🇪'},
    {c:'nl', n:'Nederlands', f:'🇳🇱'},
  ]
};

const STATE = {
  lang: 'ar',
  voiceMode: 'muhamed',
  srtData: [],
  selectedVoice: null,
};

// الأصوات المخصصة (XTTS)
const _VOICES = {
  muhamed:    { mode: 'xtts', voice_id: 'muhammad_ar',   voice_url: 'https://res.cloudinary.com/dxbmvzsiz/video/upload/v1773776198/Muhammad_ar.mp3' },
  dmitry:     { mode: 'xtts', voice_id: 'dmitry_ru',     voice_url: 'https://res.cloudinary.com/dxbmvzsiz/video/upload/v1773776793/Dmitry_ru.mp3' },
  baris:      { mode: 'xtts', voice_id: 'baris_tr',      voice_url: 'https://res.cloudinary.com/dxbmvzsiz/video/upload/v1773776793/Barış_tr.mp3' },
  maximilian: { mode: 'xtts', voice_id: 'maximilian_de', voice_url: 'https://res.cloudinary.com/dxbmvzsiz/video/upload/v1773776975/Maximilian_ge.mp3' },
};

// خريطة جميع الأصوات (بما فيها صوت المصدر)
const VOICE_MAP = {
  'source': { mode: 'source', voice_id: 'source', voice_url: null }, // صوت المصدر (يتم استخلاصه في الباك اند)
  'gtts': { mode: 'gtts', voice_id: null, voice_url: null },
  'muhamed': _VOICES.muhamed,
  'dmitry': _VOICES.dmitry,
  'baris': _VOICES.baris,
  'maximilian': _VOICES.maximilian,
};

// ═══════════════════════════════════════════
// Network Helpers
// ═══════════════════════════════════════════
function apiGet(path, timeout) {
  return fetch(CONFIG.API_BASE + path, {
    signal: AbortSignal.timeout(timeout || 10000)
  });
}

function apiPost(path, data, timeout) {
  return fetch(CONFIG.API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(timeout || 600000) // 10 دقائق كحد أقصى للدبلجة
  });
}

// ═══════════════════════════════════════════
// UI & Toasts
// ═══════════════════════════════════════════
function showToast(msg, duration = 3000) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  
  clearTimeout(t._t);
  t._t = setTimeout(() => {
    t.classList.remove('show');
  }, duration);
}

function initHeader() {
  const hdr = document.getElementById('hdr');
  if (!hdr) return;
  try {
    const u = JSON.parse(localStorage.getItem('sl_user'));
    if (u) {
      hdr.innerHTML = `<div class="pill" style="background:var(--card); color:var(--text); border-color:var(--border);">
                          <div class="avatar" style="width:24px;height:24px;font-size:10px;">${u.avatar || '👤'}</div>
                          <span class="username" style="font-weight:600;margin:0 5px;">${u.name || u.email}</span>
                          <button class="btn-logout" onclick="logout()" style="padding:2px 8px;font-size:10px;">خروج</button>
                       </div>`;
    } else {
      hdr.innerHTML = '<a href="login.html" class="btn-login" style="padding:6px 14px;font-size:.8rem;">تسجيل الدخول</a>';
    }
  } catch(e) {
    hdr.innerHTML = '<a href="login.html" class="btn-login">تسجيل الدخول</a>';
  }
}

function logout() {
  localStorage.removeItem('sl_user');
  location.href = 'index.html';
}

async function checkServer() {
  const dot = document.getElementById('dot');
  const lbl = document.getElementById('dotLbl');
  if (!dot) return;
  
  try {
    const r = await apiGet('/api/health', 6000);
    if (r.ok) {
        dot.classList.add('on');
        if (lbl) lbl.textContent = 'النظام متصل ✓';
    } else {
        throw new Error("Server not OK");
    }
  } catch(e) {
    console.error('❌ Server check failed:', e);
    dot.classList.remove('on');
    dot.style.background = '#ef4444'; // Red dot for offline
    if (lbl) lbl.textContent = 'النظام غير متاح';
  }
}

function initLangs() {
  const el = document.getElementById('langGrid'); // تم تحديث الـ ID
  if (!el) return;
  el.innerHTML = CONFIG.LANGS.map(l => 
    `<div class="lang-box ${l.c === STATE.lang ? 'active' : ''}" onclick="selectLang('${l.c}', this)">
        <span class="lang-flag" style="font-size:1.2rem;display:block;margin-bottom:4px;">${l.f}</span>
        <span>${l.n}</span>
     </div>`
  ).join('');
}

function selectLang(code, btn) {
  STATE.lang = code;
  document.querySelectorAll('.lang-box').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  console.log('🌍 Language selected:', code);
}

// الدالة موجودة مسبقاً في ملف HTML، ولكن نضمن منطق الخلفية هنا
function updateVoiceSelection(mode) {
  STATE.voiceMode = mode;
  STATE.selectedVoice = VOICE_MAP[mode] || VOICE_MAP['muhamed'];
  console.log('🎤 Voice selected:', mode, STATE.selectedVoice.voice_id);

  if (STATE.selectedVoice && STATE.selectedVoice.voice_url && CONFIG.API_BASE) {
    preloadVoice(STATE.selectedVoice.voice_id, STATE.selectedVoice.voice_url);
  }
}

// للاستماع إلى الدالة المكتوبة في HTML
const originalSelectVoice = window.selectVoice;
window.selectVoice = function(id, el) {
    if(originalSelectVoice) originalSelectVoice(id, el);
    updateVoiceSelection(id);
};

async function preloadVoice(voice_id, voice_url) {
  try {
    await apiPost('/api/preload_voice', { voice_id: voice_id, voice_url: voice_url }, 120000);
    console.log('✅ Voice preloaded:', voice_id);
  } catch(e) {
    console.log('⚠️ preload failed or skipped:', e.message);
  }
}

// ═══════════════════════════════════════════
// SRT Parsing
// ═══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    const srtFileInput = document.getElementById('srtFile');
    if(srtFileInput) {
        srtFileInput.addEventListener('change', loadSRTFile);
    }
});

function loadSRTFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    // تخزين النص في الذاكرة ومحاكاته
    STATE.rawSRT = e.target.result;
    parseSRT(STATE.rawSRT);
    
    // تغيير شكل صندوق الرفع ليدل على النجاح
    const zone = document.getElementById('srtZone');
    if(zone) {
        zone.classList.add('ok');
        zone.innerHTML = `<i class="fas fa-check-circle" style="color:#059669; font-size:1.8rem; margin-bottom:8px;"></i>
                          <div class="srt-lbl" style="color:#059669; font-weight:700;">تم استلام: ${file.name}</div>`;
    }
  };
  reader.readAsText(file);
}

function parseSRT(content) {
  if (!content) { showToast('لا يوجد محتوى في الملف', 3000); return; }
  STATE.srtData = [];
  let cur = null;
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) { 
        if (cur) STATE.srtData.push(cur); 
        cur = null; 
        continue; 
    }
    if (/^\d+$/.test(line)) { 
        if (cur) STATE.srtData.push(cur); 
        cur = {i: parseInt(line), t: '', x: ''}; 
    }
    else if (line.includes('-->')) { 
        if (cur) cur.t = line; 
    }
    else if (cur) { 
        cur.x += line + ' '; 
    }
  }
  if (cur) STATE.srtData.push(cur);
  
  console.log(`✅ تم تحليل ${STATE.srtData.length} جملة من الـ SRT`);
}

// ═══════════════════════════════════════════
// Dubbing Execution
// ═══════════════════════════════════════════
async function startDubbing() {
  if (!STATE.srtData.length) { 
      showToast('الرجاء رفع ملف الترجمة (SRT) أولاً', 4000); 
      return; 
  }
  
  const user = JSON.parse(localStorage.getItem('sl_user') || '{}');
  const btn = document.getElementById('startBtn');
  const progArea = document.getElementById('progressArea');
  const progBar = document.getElementById('progBar');
  const pctTxt = document.getElementById('pctTxt');
  const statusTxt = document.getElementById('statusTxt');
  
  // تفعيل واجهة التحميل
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري المعالجة...';
  progArea.style.display = 'block';
  progBar.style.width = '0%';
  statusTxt.innerText = 'تهيئة المحرك الصوتي...';
  
  // تجميع النص الكامل للترجمة إذا احتاجه الباك اند
  const fullText = STATE.srtData.map(item => item.x.trim()).join('\n');
  
  // محاكاة شريط التقدم الوهمي حتى يرد السيرفر
  let p = 0;
  const iv = setInterval(() => {
    p = Math.min(p + 1.5, 85); // يتوقف عند 85% حتى يكتمل فعلياً
    progBar.style.width = p + '%';
    pctTxt.innerText = Math.floor(p) + '%';
    if(p > 30) statusTxt.innerText = 'الذكاء الاصطناعي يولد الصوت الآن...';
    if(p > 60) statusTxt.innerText = 'جاري دمج الصوت مع التوقيت الزمني...';
  }, 800);

  try {
    const voiceData = STATE.selectedVoice || VOICE_MAP['muhamed'];
    
    // جلب رابط اليوتيوب إذا وجد
    const ytInput = document.getElementById('ytUrl');
    const mediaUrl = ytInput ? ytInput.value.trim() : null;

    const payload = {
      text: fullText,
      srt: STATE.rawSRT,
      lang: STATE.lang,
      email: user.email || '',
      voice_mode: voiceData.mode,
      voice_id: voiceData.voice_id,
      voice_url: voiceData.voice_url,
      media_url: mediaUrl // نرسل الرابط في حال اختار "صوت المصدر"
    };

    console.log('🚀 Sending to Server:', payload);

    const res = await apiPost('/api/dub', payload);
    clearInterval(iv);
    
    progBar.style.width = '100%';
    pctTxt.innerText = '100%';
    statusTxt.innerText = 'اكتملت المعالجة بنجاح!';
    
    const d = await res.json();
    console.log('📦 Server Response:', d);

    if (d.success && d.audio_url) {
      setTimeout(() => {
          progArea.style.display = 'none';
          document.getElementById('resCard').style.display = 'block';
          
          const aud = document.getElementById('dubAud');
          const dl = document.getElementById('dlBtn');
          
          aud.src = d.audio_url;
          dl.href = d.audio_url;
          
          showToast('🎉 الدبلجة جاهزة للتحميل!', 5000);
      }, 1000);
    } else {
      throw new Error(d.error || 'فشل التوليد من السيرفر');
    }
  } catch(e) {
    clearInterval(iv);
    console.error('❌ Dubbing Error:', e);
    progBar.style.backgroundColor = '#ef4444'; // لون أحمر عند الخطأ
    statusTxt.innerText = 'حدث خطأ!';
    showToast('❌ عذراً، ' + e.message, 5000);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-bolt"></i> ابدأ معالجة الدبلجة';
  }
}

// ═══════════════════════════════════════════
// Initialization on Load
// ═══════════════════════════════════════════
window.onload = function() {
  console.log('🚀 sl-Dubbing Application Loaded');
  
  // تهيئة الواجهة
  initHeader();
  initLangs();
  checkServer();
  
  // تحديد الصوت الافتراضي (محمد) في البداية
  updateVoiceSelection('muhamed');
};
