// ============================================================
// script.js — sl-Dubbing | نظام أصوات متعددة
// ============================================================

const CONFIG = {
  API_BASE: localStorage.getItem('sl_backend_url') || 'https://abdulselam1996-sl-dubbing-backend.hf.space',
  GUEST_LIMIT: 6,
  LANGS: [
    {c:'ar', n:'العربية',    f:'🇸🇦'},
    {c:'en', n:'English',    f:'🇺🇸'},
    {c:'es', n:'Español',    f:'🇪🇸'},
    {c:'fr', n:'Français',   f:'🇫🇷'},
    {c:'de', n:'Deutsch',    f:'🇩🇪'},
    {c:'it', n:'Italiano',   f:'🇮🇹'},
    {c:'ru', n:'Русский',    f:'🇷🇺'},
    {c:'tr', n:'Türkçe',     f:'🇹🇷'},
    {c:'zh', n:'中文',        f:'🇨🇳'},
    {c:'hi', n:'हिन्दी',     f:'🇮🇳'},
    {c:'fa', n:'فارسی',      f:'🇮🇷'},
    {c:'sv', n:'Svenska',    f:'🇸🇪'},
    {c:'nl', n:'Nederlands', f:'🇳🇱'},
  ]
};

const STATE = {
  lang:         'ar',
  voiceMode:    'xtts',
  srtData:      [],
  selectedVoice: null,   // { id, name, url }
  voices:       [],
};

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, duration = 3000) {
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
  t._t = setTimeout(() => t.style.transform = 'translateX(-50%) translateY(120px)', duration);
}

// ── Header ────────────────────────────────────────────────────
function initHeader() {
  const hdr = document.getElementById('hdr');
  if (!hdr) return;
  try {
    const u = JSON.parse(localStorage.getItem('sl_user'));
    if (u) {
      hdr.innerHTML = `
        <div class="avatar">${u.avatar || '👤'}</div>
        <span class="username">${u.name || u.email}</span>
        <button class="btn-logout" onclick="logout()">خروج</button>`;
    } else {
      hdr.innerHTML = `<a href="login.html" class="btn-login">تسجيل الدخول</a>`;
    }
  } catch(e) {
    hdr.innerHTML = `<a href="login.html" class="btn-login">تسجيل الدخول</a>`;
  }
}

function logout() {
  localStorage.removeItem('sl_user');
  location.href = 'index.html';
}

// ── فحص الخادم ───────────────────────────────────────────────
async function checkServer() {
  const badge = document.getElementById('srv');
  const txt   = document.getElementById('srvTxt');
  if (!badge) return;
  try {
    const r = await fetch(CONFIG.API_BASE + '/api/health', {
      headers: {'ngrok-skip-browser-warning': '1'},
      signal: AbortSignal.timeout(6000)
    });
    const ok = r.ok;
    badge.className = 'srv-badge' + (ok ? ' on' : '');
    if (txt) txt.textContent = ok ? 'الخادم متصل ✓' : 'الخادم غير متاح';
  } catch {
    if (badge) badge.className = 'srv-badge';
    if (txt)   txt.textContent = 'الخادم غير متاح';
  }
}

// ── اللغة ─────────────────────────────────────────────────────
function initLangs(containerId = 'langs') {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = CONFIG.LANGS.map(l => `
    <button class="lang-btn ${l.c === STATE.lang ? 'active' : ''}"
            onclick="selectLang('${l.c}', this)">
      <span class="lang-flag">${l.f}</span>
      <span>${l.n}</span>
    </button>`).join('');
}

function selectLang(code, btn) {
  STATE.lang = code;
  document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// ══════════════════════════════════════════════════════════════
// نظام الأصوات المتعددة
// ══════════════════════════════════════════════════════════════

// رابط voices.json على GitHub — يُحدَّث تلقائياً
const VOICES_JSON_URL = 'https://sl-dubbing.github.io/dubbing-studio/voices.json';

async function loadVoices() {
  const container = document.getElementById('voicePicker');
  if (!container) return;

  container.innerHTML = '<div class="voice-loading">⏳ جاري تحميل الأصوات...</div>';

  try {
    const res    = await fetch(VOICES_JSON_URL + '?t=' + Date.now(), {
      signal: AbortSignal.timeout(8000)
    });
    const voices = await res.json();
    STATE.voices = voices;

    if (!voices.length) {
      container.innerHTML = '<div class="voice-empty">لا توجد أصوات بعد</div>';
      return;
    }

    container.innerHTML = voices.map((v, i) => `
      <div class="voice-card ${i === 0 ? 'selected' : ''}"
           id="vc_${v.id}"
           onclick="selectVoice('${v.id}', '${v.url}', '${v.name}', this)">
        <div class="voice-icon">🎙️</div>
        <div class="voice-name">${v.name}</div>
        <button class="voice-play"
                onclick="event.stopPropagation(); previewVoice('${v.url}')">▶</button>
      </div>`).join('');

    // اختر الأول تلقائياً
    const first = voices[0];
    STATE.selectedVoice = first;
    STATE.voiceMode     = 'xtts';
    preloadVoice(first.id, first.url);

  } catch(e) {
    container.innerHTML = '<div class="voice-empty">⚠️ تعذر تحميل الأصوات</div>';
    console.error('loadVoices error:', e);
  }
}

function selectVoice(id, url, name, el) {
  // إزالة التحديد من الكل
  document.querySelectorAll('.voice-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');

  STATE.selectedVoice = { id, url, name };
  STATE.voiceMode     = 'xtts';
  showToast(`✅ تم اختيار: ${name}`);

  // حمّل latents مسبقاً
  preloadVoice(id, url);
}

async function preloadVoice(voice_id, voice_url) {
  try {
    await fetch(CONFIG.API_BASE + '/api/preload_voice', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': '1'
      },
      body: JSON.stringify({ voice_id, voice_url }),
      signal: AbortSignal.timeout(120000)
    });
  } catch(e) {
    console.log('preload error:', e.message);
  }
}

// مشغل المعاينة
let _previewAudio = null;
let _previewUrl   = null;

function previewVoice(url) {
  if (_previewAudio && _previewUrl === url && !_previewAudio.paused) {
    _previewAudio.pause();
    _previewAudio.currentTime = 0;
    document.querySelectorAll('.voice-play').forEach(b => b.textContent = '▶');
    return;
  }
  if (_previewAudio) {
    _previewAudio.pause();
    _previewAudio.currentTime = 0;
    document.querySelectorAll('.voice-play').forEach(b => b.textContent = '▶');
  }
  _previewAudio = new Audio(url);
  _previewUrl   = url;
  event.target.textContent = '⏹';
  _previewAudio.play().catch(() => showToast('⚠️ تعذر تشغيل المعاينة'));
  _previewAudio.onended = () => {
    document.querySelectorAll('.voice-play').forEach(b => b.textContent = '▶');
    _previewAudio = null;
    _previewUrl   = null;
  };
}

// ── دالة مساعدة للرابط الكامل ─────────────────────────────────
function toFullUrl(audioUrl) {
  if (!audioUrl) return '';
  return audioUrl.startsWith('http') ? audioUrl : CONFIG.API_BASE + audioUrl;
}

// ── SRT ───────────────────────────────────────────────────────
function loadSRTFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('srtTxt').value = e.target.result;
    parseSRT();
  };
  reader.readAsText(file);
}

function parseSRT() {
  const content = document.getElementById('srtTxt')?.value;
  if (!content) { showToast('الرجاء إدخال محتوى SRT'); return; }
  STATE.srtData = [];
  let cur = null;
  for (let line of content.split('\n')) {
    line = line.trim();
    if (!line) continue;
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
    list.innerHTML = STATE.srtData.map(i =>
      `<div class="srt-item">
        <span class="srt-time">${i.t}</span>
        <span>${i.x}</span>
      </div>`).join('');
    list.style.display = 'block';
  }
  showToast(`✅ تم تحليل ${STATE.srtData.length} جملة`);
}

// ── توليد الدبلجة ─────────────────────────────────────────────
async function genDub() {
  if (!STATE.srtData.length) { showToast('الرجاء تحميل ملف SRT أولاً'); return; }

  const user = JSON.parse(localStorage.getItem('sl_user') || '{}');
  const btn  = document.getElementById('dubBtn');
  const prog = document.getElementById('prog');
  const pf   = document.getElementById('pf');
  const pt   = document.getElementById('pt');

  btn.disabled = true;
  prog.classList.add('on');
  pf.style.width = '0%';

  let p = 0;
  const iv = setInterval(() => {
    p = Math.min(p + 1, 85);
    pf.style.width = p + '%';
    if (pt) pt.textContent = 'جاري التوليد... ' + p + '%';
  }, 800);

  try {
    const srtContent = document.getElementById('srtTxt')?.value || '';
    const fullText   = STATE.srtData.map(i => i.x.trim()).join('\n');

    const body = {
      text:       fullText,
      srt:        srtContent,
      lang:       STATE.lang,
      email:      user.email || '',
      feature:    'dub',
      voice_mode: STATE.selectedVoice ? 'xtts' : 'gtts',
      voice_id:   STATE.selectedVoice?.id  || '',
      voice_url:  STATE.selectedVoice?.url || '',
    };

    const res = await fetch(CONFIG.API_BASE + '/api/dub', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300000)
    });

    clearInterval(iv);
    pf.style.width = '100%';
    const d = await res.json();

    if (d.success && d.audio_url) {
      prog.classList.remove('on');
      btn.disabled = false;
      const aud     = document.getElementById('dubAud');
      const dl      = document.getElementById('dubDl');
      const fullUrl = toFullUrl(d.audio_url);
      aud.src = fullUrl; aud.classList.add('show');
      dl.href = fullUrl; dl.classList.add('show');
      const voiceName = STATE.selectedVoice?.name || 'افتراضي';
      const method    = d.method?.includes('xtts') ? `بصوت ${voiceName} 🎤` : 'بصوت افتراضي';
      const synced    = d.synced ? ' — متزامن ⏱️' : '';
      const timing    = d.time_sec ? ` (${d.time_sec}s)` : '';
      showToast('✅ ' + method + synced + timing, 5000);
      return;
    }
    showToast('❌ ' + (d.error || 'فشل التوليد'));
  } catch(e) {
    clearInterval(iv);
    showToast('❌ تعذر الاتصال بالخادم');
  }
  pf.style.width = '0%';
  prog.classList.remove('on');
  btn.disabled = false;
}

// ── توليد TTS ─────────────────────────────────────────────────
async function genTTS() {
  const text = document.getElementById('ttsText')?.value?.trim();
  if (!text) { showToast('الرجاء إدخال نص'); return; }

  const user = JSON.parse(localStorage.getItem('sl_user') || '{}');
  const btn  = document.getElementById('ttsBtn');
  if (btn) btn.disabled = true;

  try {
    const res = await fetch(CONFIG.API_BASE + '/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
      body: JSON.stringify({
        text,
        lang:       STATE.lang,
        email:      user.email || '',
        voice_mode: STATE.selectedVoice ? 'xtts' : 'gtts',
        voice_id:   STATE.selectedVoice?.id  || '',
        voice_url:  STATE.selectedVoice?.url || '',
      }),
      signal: AbortSignal.timeout(60000)
    });
    const d = await res.json();
    if (d.success && d.audio_url) {
      const aud     = document.getElementById('ttsAud');
      const dl      = document.getElementById('ttsDl');
      const fullUrl = toFullUrl(d.audio_url);
      if (aud) { aud.src = fullUrl; aud.classList.add('show'); }
      if (dl)  { dl.href = fullUrl; dl.classList.add('show'); }
      showToast('✅ تم توليد الصوت');
    } else {
      showToast('❌ ' + (d.error || 'فشل'));
    }
  } catch(e) {
    showToast('❌ تعذر الاتصال');
  }
  if (btn) btn.disabled = false;
}

// ── جلب الرابط من Cloudinary ─────────────────────────────────
async function fetchBackendUrl() {
  try {
    const url  = 'https://res.cloudinary.com/dxbmvzsiz/raw/upload/config/backend_url.json?t=' + Date.now();
    const res  = await fetch(url, {signal: AbortSignal.timeout(5000)});
    const text = await res.text();
    const d    = JSON.parse(text.trim());
    if (d.url) {
      CONFIG.API_BASE = d.url.trim().replace(/\/$/, '');
      localStorage.setItem('sl_backend_url', CONFIG.API_BASE);
      console.log('✅ Backend URL updated:', CONFIG.API_BASE);
      return true;
    }
  } catch(e) {
    console.log('fetchBackendUrl:', e.message);
  }
  return false;
}

function setBackendUrl(url) {
  CONFIG.API_BASE = url.trim().replace(/\/$/, '');
  localStorage.setItem('sl_backend_url', CONFIG.API_BASE);
  showToast('✅ تم تحديث رابط الخادم');
}

// ── تهيئة الصفحة ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await fetchBackendUrl();
  const saved = localStorage.getItem('sl_backend_url');
  if (saved) CONFIG.API_BASE = saved;

  initHeader();
  initLangs('langs');
  checkServer();
  loadVoices();  // تحميل الأصوات تلقائياً
});
