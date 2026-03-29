// ============================================================
// script.js — العقل البرمجي لواجهة sl-Dubbing
// ============================================================

const CONFIG = {
  // ✅ فارغ - سيتم ملؤه من Cloudinary أو يدوياً
  API_BASE: '',
  GUEST_LIMIT: 6,
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
  voiceMode: 'gtts',
  srtData: [],
  isRecording: false,
  recorder: null,
  chunks: [],
  voiceBlob: null,
  voiceUploaded: false,
  selectedVoice: null,
};

const VOICE_MAP = {
  'gtts': { mode: 'gtts', voice_id: null, voice_url: null },
  'xtts_ar': { mode: 'gtts', voice_id: 'muhammad_ar', voice_url: 'https://res.cloudinary.com/dxbmvzsiz/video/upload/v1773450710/5_gtygjb.mp3' },
  'xtts_ru': { mode: 'gtts', voice_id: 'dmitry_ru', voice_url: 'https://res.cloudinary.com/dxbmvzsiz/video/upload/v1773776793/Dmitry_ru.mp3' },
  'xtts_tr': { mode: 'gtts', voice_id: 'baris_tr', voice_url: 'https://res.cloudinary.com/dxbmvzsiz/video/upload/v1773776793/Barış_tr.mp3' },
  'xtts_de': { mode: 'gtts', voice_id: 'maximilian_de', voice_url: 'https://res.cloudinary.com/dxbmvzsiz/video/upload/v1773776975/Maximilian_ge.mp3' },
  'muhammad': { mode: 'gtts', voice_id: 'muhammad_ar', voice_url: 'https://res.cloudinary.com/dxbmvzsiz/video/upload/v1773450710/5_gtygjb.mp3' },
  'dmitry': { mode: 'gtts', voice_id: 'dmitry_ru', voice_url: 'https://res.cloudinary.com/dxbmvzsiz/video/upload/v1773776793/Dmitry_ru.mp3' },
  'baris': { mode: 'gtts', voice_id: 'baris_tr', voice_url: 'https://res.cloudinary.com/dxbmvzsiz/video/upload/v1773776793/Barış_tr.mp3' },
  'maximilian': { mode: 'gtts', voice_id: 'maximilian_de', voice_url: 'https://res.cloudinary.com/dxbmvzsiz/video/upload/v1773776975/Maximilian_ge.mp3' },
};

function showToast(msg, duration) {
  duration = duration || 3000;
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText = 'position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(120px);background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff;padding:14px 28px;border-radius:12px;font-weight:600;box-shadow:0 10px 35px rgba(0,0,0,.4);transition:transform .3s;z-index:9999';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(t._t);
  t._t = setTimeout(function() { t.style.transform = 'translateX(-50%) translateY(120px)'; }, duration);
}

function initHeader() {
  const hdr = document.getElementById('hdr');
  if (!hdr) return;
  try {
    const u = JSON.parse(localStorage.getItem('sl_user'));
    if (u) {
      hdr.innerHTML = '<div class="avatar">' + (u.avatar || '👤') + '</div><span class="username">' + (u.name || u.email) + '</span><button class="btn-logout" onclick="logout()">خروج</button>';
    } else {
      hdr.innerHTML = '<a href="login.html" class="btn-login">تسجيل الدخول</a>';
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
  const badge = document.getElementById('srv');
  const txt = document.getElementById('srvTxt');
  if (!badge) return;
  if (!CONFIG.API_BASE) {
    badge.className = 'srv-badge';
    if (txt) txt.textContent = 'اضغط 🔗 تغيير الخادم';
    return;
  }
  try {
    const r = await fetch(CONFIG.API_BASE + '/api/health', {
      headers: {'ngrok-skip-browser-warning': '1'},
      signal: AbortSignal.timeout(6000)
    });
    const ok = r.ok;
    badge.className = 'srv-badge' + (ok ? ' on' : '');
    txt.textContent = ok ? 'الخادم متصل ✓' : 'الخادم غير متاح';
    console.log('✅ Server:', await r.json());
    return ok;
  } catch(e) {
    console.error('❌ Server check failed:', e);
    badge.className = 'srv-badge';
    if (txt) txt.textContent = 'الخادم غير متاح';
    return false;
  }
}

function initLangs(containerId) {
  const el = document.getElementById(containerId || 'langs');
  if (!el) return;
  el.innerHTML = CONFIG.LANGS.map(function(l) {
    return '<button class="lang-btn ' + (l.c === STATE.lang ? 'active' : '') + '" onclick="selectLang(\'' + l.c + '\', this)"><span class="lang-flag">' + l.f + '</span><span>' + l.n + '</span></button>';
  }).join('');
}

function selectLang(code, btn) {
  STATE.lang = code;
  document.querySelectorAll('.lang-btn').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  console.log('🌍 Language:', code);
}

function selectVoice(mode, el) {
  STATE.voiceMode = mode;
  STATE.selectedVoice = VOICE_MAP[mode] || null;
  
  console.log('🎤 selectVoice called');
  console.log('   mode:', mode);
  console.log('   selectedVoice:', STATE.selectedVoice);
  console.log('   voice_id:', STATE.selectedVoice ? STATE.selectedVoice.voice_id : 'null');
  console.log('   voice_url:', STATE.selectedVoice ? STATE.selectedVoice.voice_url : 'null');
  
  document.querySelectorAll('.voice-choice').forEach(function(e) {
    e.style.borderColor = 'rgba(255,255,255,.1)';
    e.style.background = 'rgba(255,255,255,.02)';
  });
  
  if (el) {
    el.style.borderColor = mode === 'xtts' ? '#a78bfa' : '#60a5fa';
    el.style.background = mode === 'xtts' ? 'rgba(124,58,237,.15)' : 'rgba(96,165,250,.12)';
  }
  
  if (STATE.selectedVoice && STATE.selectedVoice.voice_url) {
    console.log('📥 Preloading voice:', STATE.selectedVoice.voice_id);
    preloadVoice(STATE.selectedVoice.voice_id, STATE.selectedVoice.voice_url);
  }
}

async function preloadVoice(voice_id, voice_url) {
  try {
    await fetch(CONFIG.API_BASE + '/api/preload_voice', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1'},
      body: JSON.stringify({ voice_id: voice_id, voice_url: voice_url }),
      signal: AbortSignal.timeout(120000)
    });
    console.log('✅ Voice preloaded:', voice_id);
  } catch(e) {
    console.log('⚠️ preload error:', e.message);
  }
}

function loadSRTFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    document.getElementById('srtTxt').value = e.target.result;
    parseSRT();
  };
  reader.readAsText(file);
}

function parseSRT() {
  const content = document.getElementById('srtTxt') ? document.getElementById('srtTxt').value : '';
  if (!content) { showToast('الرجاء إدخال محتوى SRT'); return; }
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
    } else if (line.includes('-->')) {
      if (cur) cur.t = line;
    } else if (cur) {
      cur.x += line + ' ';
    }
  }
  if (cur) STATE.srtData.push(cur);
  const list = document.getElementById('srtList');
  if (list) {
    list.innerHTML = STATE.srtData.map(function(item) {
      return '<div class="srt-item"><span class="srt-time">' + item.t + '</span><span>' + item.x + '</span></div>';
    }).join('');
    list.style.display = 'block';
  }
  showToast('✅ تم تحليل ' + STATE.srtData.length + ' جملة');
  console.log('📝 SRT:', STATE.srtData.length, 'blocks');
}

async function genDub() {
  if (!STATE.srtData.length) { showToast('الرجاء تحميل ملف SRT أولاً'); return; }
  if (!CONFIG.API_BASE) { showToast('❌ الخادم غير متصل - اضغط 🔗'); return; }
  const user = JSON.parse(localStorage.getItem('sl_user') || '{}');
  const btn = document.getElementById('dubBtn');
  const prog = document.getElementById('prog');
  const pf = document.getElementById('pf');
  const pt = document.getElementById('pt');
  btn.disabled = true;
  prog.classList.add('on');
  pf.style.width = '0%';
  const fullText = STATE.srtData.map(function(item) { return item.x.trim(); }).join('\n');
  let p = 0;
  const iv = setInterval(function() {
    p = Math.min(p + 2, 85);
    pf.style.width = p + '%';
    if (pt) pt.textContent = 'جاري التوليد... ' + p + '%';
  }, 600);
  try {
    const srtContent = document.getElementById('srtTxt') ? document.getElementById('srtTxt').value : '';
    const voiceData = STATE.selectedVoice || VOICE_MAP[STATE.voiceMode] || {};
    
    console.log('════════════════════════════════════════');
    console.log('🎬 genDub() - Voice Data Debug:');
    console.log('   STATE.voiceMode:', STATE.voiceMode);
    console.log('   STATE.selectedVoice:', STATE.selectedVoice);
    console.log('   voiceData:', voiceData);
    console.log('   voiceData.voice_id:', voiceData ? voiceData.voice_id : 'undefined');
    console.log('   voiceData.voice_url:', voiceData ? voiceData.voice_url : 'undefined');
    console.log('   voiceData.mode:', voiceData ? voiceData.mode : 'undefined');
    console.log('════════════════════════════════════════');
    
    console.log('🎬 Sending dub to:', CONFIG.API_BASE + '/api/dub');
    
    const res = await fetch(CONFIG.API_BASE + '/api/dub', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1'},
      body: JSON.stringify({
        text: fullText,
        srt: srtContent,
        lang: STATE.lang,
        email: user.email || '',
        feature: 'dub',
        voice_mode: voiceData.mode || 'gtts',
        voice_id: voiceData.voice_id || null,
        voice_url: voiceData.voice_url || null
      }),
      signal: AbortSignal.timeout(300000)
    });
    
    clearInterval(iv);
    pf.style.width = '100%';
    const d = await res.json();
    
    console.log('📦 Server Response:');
    console.log('   success:', d.success);
    console.log('   audio_url:', d.audio_url);
    console.log('   method:', d.method);
    console.log('   voice_id:', d.voice_id);
    console.log('   synced:', d.synced);
    console.log('   time_sec:', d.time_sec);
    
    if (d.success && d.audio_url) {
      prog.classList.remove('on');
      btn.disabled = false;
      const aud = document.getElementById('dubAud');
      const dl = document.getElementById('dubDl');
      aud.src = d.audio_url;
      aud.classList.add('show');
      dl.href = d.audio_url;
      dl.classList.add('show');
      const method = (d.method && d.method.includes('xtts')) || voiceData.voice_id ? 'بصوت مخصص 🎤' : 'بصوت افتراضي';
      const synced = d.synced ? ' — متزامن ⏱️' : '';
      const timing = d.time_sec ? ' (' + d.time_sec + 's)' : '';
      showToast('✅ ' + method + synced + timing, 5000);
      return;
    }
    showToast('❌ ' + (d.error || 'فشل التوليد'));
  } catch(e) {
    clearInterval(iv);
    console.error('❌ genDub error:', e);
    showToast('❌ تعذر الاتصال بالخادم');
  }
  pf.style.width = '0%';
  prog.classList.remove('on');
  btn.disabled = false;
}

function setBackendUrl(url) {
  CONFIG.API_BASE = url.trim().replace(/\/$/, '');
  localStorage.setItem('sl_backend_url', CONFIG.API_BASE);
  showToast('✅ تم تحديث الرابط');
  console.log('🔗 New API_BASE:', CONFIG.API_BASE);
  checkServer();
}

async function fetchBackendUrl() {
  try {
    const url = 'https://res.cloudinary.com/dxbmvzsiz/raw/upload/config/backend_url.json?t=' + Date.now();
    const res = await fetch(url, {signal: AbortSignal.timeout(5000)});
    if (!res.ok) {
      console.log('⚠️ Cloudinary fetch failed:', res.status);
      console.log('💡 استخدم زر "🔗 تغيير الخادم" لتحديث الرابط يدوياً');
      return false;
    }
    const d = await res.json();
    if (d.url && d.url.trim()) {
      const newUrl = d.url.trim().replace(/\/$/, '');
      if (!CONFIG.API_BASE || CONFIG.API_BASE !== newUrl) {
        CONFIG.API_BASE = newUrl;
        localStorage.setItem('sl_backend_url', newUrl);
        console.log('✅ Backend URL from Cloudinary:', newUrl);
      }
      return true;
    }
  } catch(e) {
    console.log('⚠️ fetchBackendUrl error:', e.message);
    console.log('💡 استخدم زر "🔗 تغيير الخادم" لتحديث الرابط يدوياً');
  }
  return false;
}

function addBackendUrlInput() {
  const btn = document.createElement('button');
  btn.textContent = '🔗 تغيير الخادم';
  btn.style.cssText = 'position:fixed;top:10px;right:10px;padding:8px 14px;background:rgba(124,58,237,.3);border:1px solid rgba(124,58,237,.5);border-radius:8px;color:#fff;cursor:pointer;font-size:12px;z-index:9998;';
  btn.onclick = function() {
    const url = prompt('أدخل رابط الخادم الجديد (ngrok من Colab):', CONFIG.API_BASE);
    if (url && url.trim()) {
      setBackendUrl(url);
    }
  };
  document.body.appendChild(btn);
  console.log('🔗 API_BASE:', CONFIG.API_BASE);
  console.log('💡 Click "🔗 تغيير الخادم" to update URL from Colab');
}

document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 Page loaded');
  console.log('🔗 API_BASE:', CONFIG.API_BASE || '(empty)');
  fetchBackendUrl().then(function() {
    console.log('🔗 Final API_BASE:', CONFIG.API_BASE || '(not set)');
    addBackendUrlInput();
    initHeader();
    initLangs('langs');
    checkServer();
    console.log('✅ Initialization complete');
  });
});
