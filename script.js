// ============================================================
// script.js — sl-Dubbing Frontend (Final)
// ============================================================

const CONFIG = {
  API_BASE: '',  // ✅ فارغ - يُملأ من localStorage أو زر 🔗
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
  voiceMode: 'muhammad',
  srtData: [],
  selectedVoice: null,
};

// ✅ VOICE_MAP — mode = xtts لكل الأصوات المخصصة
const _VOICES = {
  muhammad:   { mode: 'xtts', voice_id: 'muhammad_ar',   voice_url: 'https://res.cloudinary.com/dxbmvzsiz/video/upload/v1773776198/Muhammad_ar.mp3' },
  dmitry:     { mode: 'xtts', voice_id: 'dmitry_ru',     voice_url: 'https://res.cloudinary.com/dxbmvzsiz/video/upload/v1773776793/Dmitry_ru.mp3' },
  baris:      { mode: 'xtts', voice_id: 'baris_tr',      voice_url: 'https://res.cloudinary.com/dxbmvzsiz/video/upload/v1773776793/Barış_tr.mp3' },
  maximilian: { mode: 'xtts', voice_id: 'maximilian_de', voice_url: 'https://res.cloudinary.com/dxbmvzsiz/video/upload/v1773776975/Maximilian_ge.mp3' },
};
const VOICE_MAP = {
  'gtts': { mode: 'gtts', voice_id: null, voice_url: null },
  'muhammad': _VOICES.muhammad,
  'dmitry': _VOICES.dmitry,
  'baris': _VOICES.baris,
  'maximilian': _VOICES.maximilian,
  'xtts_ar': _VOICES.muhammad,
  'xtts_ru': _VOICES.dmitry,
  'xtts_tr': _VOICES.baris,
  'xtts_de': _VOICES.maximilian,
};

// ═══════════════════════════════════════════
// ✅ Helper: fetch بدون headers مخصصة (يمنع CORS preflight مع ngrok)
// ═══════════════════════════════════════════
function apiGet(path, timeout) {
  var sep = path.includes('?') ? '&' : '?';
  return fetch(CONFIG.API_BASE + path + sep + 'ngrok-skip-browser-warning=1', {
    signal: AbortSignal.timeout(timeout || 10000)
  });
}

function apiPost(path, data, timeout) {
  return fetch(CONFIG.API_BASE + path + '?ngrok-skip-browser-warning=1', {
    method: 'POST',
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(timeout || 60000)
  });
}

// ═══════════════════════════════════════════
// UI
// ═══════════════════════════════════════════
function showToast(msg, duration) {
  duration = duration || 3000;
  var t = document.getElementById('toast');
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
  var hdr = document.getElementById('hdr');
  if (!hdr) return;
  try {
    var u = JSON.parse(localStorage.getItem('sl_user'));
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
  var badge = document.getElementById('srv');
  var txt = document.getElementById('srvTxt');
  if (!badge) return;
  if (!CONFIG.API_BASE) {
    badge.className = 'srv-badge';
    if (txt) txt.textContent = 'اضغط 🔗 تغيير الخادم';
    return;
  }
  try {
    var r = await apiGet('/api/health', 6000);
    badge.className = 'srv-badge' + (r.ok ? ' on' : '');
    if (txt) txt.textContent = r.ok ? 'الخادم متصل ✓' : 'الخادم غير متاح';
    if (r.ok) console.log('✅ Server:', await r.json());
    return r.ok;
  } catch(e) {
    console.error('❌ Server check failed:', e);
    badge.className = 'srv-badge';
    if (txt) txt.textContent = 'الخادم غير متاح';
    return false;
  }
}

function initLangs(containerId) {
  var el = document.getElementById(containerId || 'langs');
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
  console.log('🎤 Voice:', mode, STATE.selectedVoice ? STATE.selectedVoice.voice_id : 'gtts');

  document.querySelectorAll('.voice-choice').forEach(function(e) {
    e.style.borderColor = 'rgba(255,255,255,.1)';
    e.style.background = 'rgba(255,255,255,.02)';
  });
  if (el) {
    el.style.borderColor = '#a78bfa';
    el.style.background = 'rgba(124,58,237,.15)';
  }
  if (STATE.selectedVoice && STATE.selectedVoice.voice_url && CONFIG.API_BASE) {
    preloadVoice(STATE.selectedVoice.voice_id, STATE.selectedVoice.voice_url);
  }
}

async function preloadVoice(voice_id, voice_url) {
  try {
    await apiPost('/api/preload_voice', { voice_id: voice_id, voice_url: voice_url }, 120000);
    console.log('✅ Voice preloaded:', voice_id);
  } catch(e) {
    console.log('⚠️ preload:', e.message);
  }
}

// ═══════════════════════════════════════════
// SRT
// ═══════════════════════════════════════════
function loadSRTFile(event) {
  var file = event.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    document.getElementById('srtTxt').value = e.target.result;
    parseSRT();
  };
  reader.readAsText(file);
}

function parseSRT() {
  var content = document.getElementById('srtTxt') ? document.getElementById('srtTxt').value : '';
  if (!content) { showToast('الرجاء إدخال محتوى SRT'); return; }
  STATE.srtData = [];
  var cur = null;
  var lines = content.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) { if (cur) STATE.srtData.push(cur); cur = null; continue; }
    if (/^\d+$/.test(line)) { if (cur) STATE.srtData.push(cur); cur = {i: parseInt(line), t: '', x: ''}; }
    else if (line.includes('-->')) { if (cur) cur.t = line; }
    else if (cur) { cur.x += line + ' '; }
  }
  if (cur) STATE.srtData.push(cur);
  var list = document.getElementById('srtList');
  if (list) {
    list.innerHTML = STATE.srtData.map(function(item) {
      return '<div class="srt-item"><span class="srt-time">' + item.t + '</span><span>' + item.x + '</span></div>';
    }).join('');
    list.style.display = 'block';
  }
  showToast('✅ تم تحليل ' + STATE.srtData.length + ' جملة');
}

// ═══════════════════════════════════════════
// Dubbing
// ═══════════════════════════════════════════
async function genDub() {
  if (!STATE.srtData.length) { showToast('الرجاء تحميل ملف SRT أولاً'); return; }
  if (!CONFIG.API_BASE) { showToast('❌ الخادم غير متصل - اضغط 🔗'); return; }
  var user = JSON.parse(localStorage.getItem('sl_user') || '{}');
  var btn = document.getElementById('dubBtn');
  var prog = document.getElementById('prog');
  var pf = document.getElementById('pf');
  var pt = document.getElementById('pt');
  btn.disabled = true;
  prog.classList.add('on');
  pf.style.width = '0%';

  var fullText = STATE.srtData.map(function(item) { return item.x.trim(); }).join('\n');
  var p = 0;
  var iv = setInterval(function() {
    p = Math.min(p + 2, 85);
    pf.style.width = p + '%';
    if (pt) pt.textContent = 'جاري التوليد... ' + p + '%';
  }, 600);

  try {
    var srtContent = document.getElementById('srtTxt') ? document.getElementById('srtTxt').value : '';
    var voiceData = STATE.selectedVoice || VOICE_MAP[STATE.voiceMode] || {};
    console.log('🎬 genDub: voice=' + (voiceData.voice_id || 'gtts') + ' mode=' + (voiceData.mode || 'gtts'));

    var res = await apiPost('/api/dub', {
      text: fullText,
      srt: srtContent,
      lang: STATE.lang,
      email: user.email || '',
      feature: 'dub',
      voice_mode: voiceData.mode || 'gtts',
      voice_id: voiceData.voice_id || null,
      voice_url: voiceData.voice_url || null
    }, 600000);

    clearInterval(iv);
    pf.style.width = '100%';
    var d = await res.json();
    console.log('📦 Response:', d);

    if (d.success && d.audio_url) {
      prog.classList.remove('on');
      btn.disabled = false;
      var aud = document.getElementById('dubAud');
      var dl = document.getElementById('dubDl');
      aud.src = d.audio_url;
      aud.classList.add('show');
      dl.href = d.audio_url;
      dl.classList.add('show');
      var method = (d.method && d.method.includes('xtts')) || voiceData.voice_id ? 'بصوت مخصص 🎤' : 'بصوت افتراضي';
      var synced = d.synced ? ' — متزامن ⏱️' : '';
      var timing = d.time_sec ? ' (' + d.time_sec + 's)' : '';
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

// ═══════════════════════════════════════════
// Backend URL
// ═══════════════════════════════════════════
function setBackendUrl(url) {
  CONFIG.API_BASE = url.trim().replace(/\/$/, '');
  localStorage.setItem('sl_backend_url', CONFIG.API_BASE);
  showToast('✅ تم تحديث الرابط');
  console.log('🔗 New API_BASE:', CONFIG.API_BASE);
  checkServer();
}

function addBackendUrlInput() {
  var btn = document.createElement('button');
  btn.textContent = '🔗 تغيير الخادم';
  btn.style.cssText = 'position:fixed;top:10px;right:10px;padding:8px 14px;background:rgba(124,58,237,.3);border:1px solid rgba(124,58,237,.5);border-radius:8px;color:#fff;cursor:pointer;font-size:12px;z-index:9998;';
  btn.onclick = function() {
    var url = prompt('أدخل رابط الخادم الجديد (ngrok من Colab):', CONFIG.API_BASE);
    if (url && url.trim()) setBackendUrl(url);
  };
  document.body.appendChild(btn);
}

// ═══════════════════════════════════════════
// Init
// ═══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {
  console.log('🚀 sl-Dubbing loaded');
  var saved = localStorage.getItem('sl_backend_url');
  if (saved) {
    CONFIG.API_BASE = saved;
    console.log('🔗 Restored:', CONFIG.API_BASE);
  }
  // ✅ Muhammad افتراضياً لكل اللغات
  STATE.voiceMode = 'muhammad';
  STATE.selectedVoice = VOICE_MAP['muhammad'];
  console.log('🎤 Default voice:', STATE.selectedVoice);
  addBackendUrlInput();
  initHeader();
  initLangs('langs');
  checkServer();
});
