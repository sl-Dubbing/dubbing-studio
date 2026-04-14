// ============================================================
// script.js — sl-Dubbing Frontend (Enterprise Routing)
// ============================================================

const CONFIG = {
  API_BASE: 'https://sl-dubbing-backend-production.up.railway.app', 
  
  // قائمة اللغات مع تحديد المحركات التي تدعمها (نظام التوجيه الذكي)
  LANGS: [
    {c:'ar', n:'العربية', f:'🇸🇦', engines: ['xtts', 'gtts']},
    {c:'en', n:'English', f:'🇺🇸', engines: ['cosy', 'xtts', 'gtts']},
    {c:'es', n:'Español', f:'🇪🇸', engines: ['xtts', 'gtts']},
    {c:'fr', n:'Français', f:'🇫🇷', engines: ['xtts', 'gtts']},
    {c:'de', n:'Deutsch', f:'🇩🇪', engines: ['xtts', 'gtts']},
    {c:'it', n:'Italiano', f:'🇮🇹', engines: ['xtts', 'gtts']},
    {c:'pt', n:'Português', f:'🇵🇹', engines: ['xtts', 'gtts']},
    {c:'tr', n:'Türkçe', f:'🇹🇷', engines: ['xtts', 'gtts']},
    {c:'ru', n:'Русский', f:'🇷🇺', engines: ['xtts', 'gtts']},
    {c:'zh', n:'中文 (Chinese)', f:'🇨🇳', engines: ['cosy', 'xtts', 'gtts']},
    {c:'ja', n:'日本語 (Japanese)', f:'🇯🇵', engines: ['cosy', 'xtts', 'gtts']},
    {c:'ko', n:'한국어 (Korean)', f:'🇰🇷', engines: ['cosy', 'xtts', 'gtts']},
    {c:'yue', n:'粵語 (Cantonese)', f:'🇭🇰', engines: ['cosy', 'gtts']},
    {c:'hi', n:'हिन्दी (Hindi)', f:'🇮🇳', engines: ['xtts', 'gtts']},
    {c:'ur', n:'اردو (Pakistani)', f:'🇵🇰', engines: ['gtts']}, // مثال: لغة تدعمها منصات الأساس فقط
  ]
};

const STATE = {
  lang: 'ar',
  quality: 'high', // 'medium' (XTTS) or 'high' (CosyVoice)
  srtData: [],
  selectedVoice: null,
};

// ── الأصوات المخصصة (أرقام العينات) ──
const _VOICES = {
  muhamed:    { voice_id: 'muhammad_ar',   voice_url: 'https://res.cloudinary.com/dxbmvzsiz/video/upload/v1773776198/Muhammad_ar.mp3' },
  dmitry:     { voice_id: 'dmitry_ru',     voice_url: 'https://res.cloudinary.com/dxbmvzsiz/video/upload/v1773776793/Dmitry_ru.mp3' },
  baris:      { voice_id: 'baris_tr',      voice_url: 'https://res.cloudinary.com/dxbmvzsiz/video/upload/v1773776793/Barış_tr.mp3' },
  maximilian: { voice_id: 'maximilian_de', voice_url: 'https://res.cloudinary.com/dxbmvzsiz/video/upload/v1773776975/Maximilian_ge.mp3' },
};

const VOICE_MAP = {
  'source': { voice_id: 'source', voice_url: null },
  'muhamed': _VOICES.muhamed,
  'dmitry': _VOICES.dmitry,
  'baris': _VOICES.baris,
  'maximilian': _VOICES.maximilian,
};

// ═══════════════════════════════════════════
// Smart Engine Router (العقل المدبر للتوجيه)
// ═══════════════════════════════════════════
function resolveEngine(selectedLang, selectedQuality) {
  const langObj = CONFIG.LANGS.find(l => l.c === selectedLang);
  if (!langObj) return 'gtts'; // حماية إضافية

  const available = langObj.engines;

  if (selectedQuality === 'high') {
    // إذا طلب عالي الدقة، نجرب Cosy أولاً، إن لم يكن مدعوماً ننتقل لـ XTTS، ثم gTTS
    if (available.includes('cosy')) return 'cosy';
    if (available.includes('xtts')) return 'xtts';
    return 'gtts';
  } else {
    // إذا طلب متوسط الدقة، نجرب XTTS أولاً، إن لم يكن مدعوماً ننتقل لـ Cosy، ثم gTTS
    if (available.includes('xtts')) return 'xtts';
    if (available.includes('cosy')) return 'cosy';
    return 'gtts';
  }
}

// ═══════════════════════════════════════════
// Dynamic UI Injection (إضافة أزرار الجودة للواجهة)
// ═══════════════════════════════════════════
function injectQualitySelector() {
  const langGrid = document.getElementById('langGrid');
  if (!langGrid) return;

  const qualityDiv = document.createElement('div');
  qualityDiv.innerHTML = `
    <div style="margin-bottom: 20px; display: flex; gap: 15px; justify-content: center; background: var(--bg-page); padding: 12px; border-radius: 12px; border: 1px solid var(--border-color);">
        <label style="cursor:pointer; display:flex; align-items:center; gap:8px; font-weight:600; font-size: 0.9rem;">
            <input type="radio" name="dub_quality" value="medium" onchange="STATE.quality='medium'" ${STATE.quality === 'medium' ? 'checked' : ''}>
            <span>متوسط الدقة (XTTS)</span>
        </label>
        <label style="cursor:pointer; display:flex; align-items:center; gap:8px; font-weight:700; font-size: 0.9rem; color: #8b5cf6;">
            <input type="radio" name="dub_quality" value="high" onchange="STATE.quality='high'" ${STATE.quality === 'high' ? 'checked' : ''}>
            <span>عالي الدقة السينمائية (CosyVoice) <i class="fas fa-crown"></i></span>
        </label>
    </div>
  `;
  // إدخال الأزرار فوق شبكة اللغات مباشرة
  langGrid.parentNode.insertBefore(qualityDiv, langGrid);
}

// ═══════════════════════════════════════════
// Network Helpers
// ═══════════════════════════════════════════
function apiGet(path, timeout) {
  return fetch(CONFIG.API_BASE + path, { 
    credentials: 'include', 
    signal: AbortSignal.timeout(timeout || 10000) 
  });
}

function apiPost(path, data, timeout) {
  return fetch(CONFIG.API_BASE + path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(timeout || 600000)
  });
}

// ═══════════════════════════════════════════
// UI & Toasts
// ═══════════════════════════════════════════
function showToast(msg, duration = 3000) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div'); t.id = 'toast'; t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), duration);
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
  } catch(e) { hdr.innerHTML = '<a href="login.html" class="btn-login">تسجيل الدخول</a>'; }
}

function logout() { localStorage.removeItem('sl_user'); location.href = 'index.html'; }

async function checkServer() {
  const dot = document.getElementById('dot');
  const lbl = document.getElementById('dotLbl');
  if (!dot) return;
  try {
    const r = await apiGet('/api/health', 6000);
    if (r.ok) { dot.classList.add('on'); if (lbl) lbl.textContent = 'النظام متصل ✓'; } 
    else throw new Error("Server not OK");
  } catch(e) {
    dot.classList.remove('on'); dot.style.background = '#ef4444';
    if (lbl) lbl.textContent = 'النظام غير متاح';
  }
}

function initLangs() {
  const el = document.getElementById('langGrid'); 
  if (!el) return;
  // عرض جميع اللغات للمستخدم (نظام التوجيه سيتكفل بالباقي)
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

function updateVoiceSelection(mode) {
  STATE.selectedVoice = VOICE_MAP[mode] || VOICE_MAP['muhamed'];
  console.log('🎤 Voice selected:', mode);
}

const originalSelectVoice = window.selectVoice;
window.selectVoice = function(id, el) {
    if(originalSelectVoice) originalSelectVoice(id, el);
    updateVoiceSelection(id);
};

// ═══════════════════════════════════════════
// SRT Parsing
// ═══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    const srtFileInput = document.getElementById('srtFile');
    if(srtFileInput) srtFileInput.addEventListener('change', loadSRTFile);
});

function loadSRTFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    STATE.rawSRT = e.target.result;
    parseSRT(STATE.rawSRT);
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
    if (!line) { if (cur) STATE.srtData.push(cur); cur = null; continue; }
    if (/^\d+$/.test(line)) { if (cur) STATE.srtData.push(cur); cur = {i: parseInt(line), t: '', x: ''}; }
    else if (line.includes('-->')) { if (cur) cur.t = line; }
    else if (cur) { cur.x += line + ' '; }
  }
  if (cur) STATE.srtData.push(cur);
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
  
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري المعالجة...';
  progArea.style.display = 'block';
  progBar.style.width = '0%';
  statusTxt.innerText = 'تهيئة المحرك الصوتي...';
  
  const fullText = STATE.srtData.map(item => item.x.trim()).join('\n');
  
  let p = 0;
  const iv = setInterval(() => {
    p = Math.min(p + 1.5, 85); 
    progBar.style.width = p + '%'; pctTxt.innerText = Math.floor(p) + '%';
    if(p > 30) statusTxt.innerText = 'الذكاء الاصطناعي يولد الصوت الآن...';
    if(p > 60) statusTxt.innerText = 'جاري دمج الصوت مع التوقيت الزمني...';
  }, 800);

  try {
    const voiceData = STATE.selectedVoice || VOICE_MAP['muhamed'];
    const ytInput = document.getElementById('ytUrl');
    const mediaUrl = ytInput ? ytInput.value.trim() : null;

    // ✨ هنا يحدث السحر: السكريبت يحدد المحرك الأنسب بناءً على لغة المستخدم والجودة المطلوبة
    let selectedMode = 'source';
    if (voiceData.voice_id !== 'source') {
        selectedMode = resolveEngine(STATE.lang, STATE.quality);
        console.log(`🧠 Smart Router: Selected [${STATE.lang}] + [${STATE.quality} Quality] -> Assigned to [${selectedMode.toUpperCase()}] Engine`);
    }

    const payload = {
      text: fullText,
      srt: STATE.rawSRT,
      lang: STATE.lang,
      email: user.email || '',
      voice_mode: selectedMode, // المحرك الذي تم اختياره بذكاء
      voice_id: voiceData.voice_id,
      voice_url: voiceData.voice_url,
      media_url: mediaUrl 
    };

    const res = await apiPost('/api/dub', payload);
    clearInterval(iv);
    
    progBar.style.width = '100%'; pctTxt.innerText = '100%'; statusTxt.innerText = 'اكتملت المعالجة بنجاح!';
    const d = await res.json();

    if (d.success && d.audio_url) {
      setTimeout(() => {
          progArea.style.display = 'none';
          document.getElementById('resCard').style.display = 'block';
          document.getElementById('dubAud').src = d.audio_url;
          document.getElementById('dlBtn').href = d.audio_url;
          
          showToast(`🎉 الدبلجة جاهزة! (بواسطة: ${d.method.toUpperCase()})`, 5000);
      }, 1000);
    } else { throw new Error(d.error || 'فشل التوليد من السيرفر'); }
  } catch(e) {
    clearInterval(iv);
    progBar.style.backgroundColor = '#ef4444'; statusTxt.innerText = 'حدث خطأ!';
    showToast('❌ عذراً، ' + e.message, 5000);
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-bolt"></i> ابدأ معالجة الدبلجة';
  }
}

// ═══════════════════════════════════════════
// Initialization on Load
// ═══════════════════════════════════════════
window.onload = function() {
  initHeader();
  injectQualitySelector(); // سيقوم بإضافة أزرار الجودة (XTTS / Cosy) تلقائياً
  initLangs();
  checkServer();
  updateVoiceSelection('muhamed');
};
