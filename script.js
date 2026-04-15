// script.js
const API_BASE = window.location.origin; // or set explicit backend URL
let selectedVoice = 'muhamed';
let selectedLang = 'ar';
let currentJobId = null;
let pollInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  // populate languages grid
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

  // srt file handling
  const srtFile = document.getElementById('srtFile');
  const srtZone = document.getElementById('srtZone');
  srtFile.addEventListener('change', () => {
    if (srtFile.files && srtFile.files.length) {
      srtZone.classList.add('ok');
      srtZone.querySelector('.srt-lbl').innerText = srtFile.files[0].name;
    }
  });
});

function selectVoice(id, el) {
  selectedVoice = id;
  document.querySelectorAll('.spk-card').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
}

function showToast(msg, color='#0f0f10') {
  let t = document.createElement('div');
  t.className = 'toast show';
  t.style.background = color;
  t.innerText = msg;
  document.body.appendChild(t);
  setTimeout(()=>{ t.classList.remove('show'); t.remove(); }, 3500);
}

async function startDubbing() {
  const startBtn = document.getElementById('startBtn');
  startBtn.disabled = true;
  startBtn.innerText = 'جاري الإرسال...';

  const srtInput = document.getElementById('srtFile');
  if (!srtInput.files || !srtInput.files.length) {
    showToast('يرجى رفع ملف SRT أولاً', '#b91c1c');
    startBtn.disabled = false;
    startBtn.innerText = 'ابدأ معالجة الدبلجة';
    return;
  }

  const file = srtInput.files[0];
  const srtText = await file.text();

  const payload = {
    srt: srtText,
    lang: selectedLang,
    voice_mode: selectedVoice === 'source' ? 'source' : 'xtts',
    voice_id: selectedVoice === 'source' ? '' : selectedVoice,
    voice_url: '' // leave empty unless you have a sample URL
  };

  try {
    const res = await fetch(API_BASE + '/api/dub', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      showToast('خطأ: ' + (data.error || res.statusText), '#b91c1c');
      startBtn.disabled = false;
      startBtn.innerText = 'ابدأ معالجة الدبلجة';
      return;
    }

    currentJobId = data.job_id;
    showToast('تم إنشاء المهمة. جاري المعالجة...', '#065f2c');
    document.getElementById('progressArea').style.display = 'block';
    document.getElementById('statusTxt').innerText = 'قيد الانتظار...';
    document.getElementById('progBar').style.width = '5%';
    pollInterval = setInterval(() => pollJob(currentJobId), 2000);

  } catch (err) {
    console.error(err);
    showToast('فشل الاتصال بالخادم', '#b91c1c');
    startBtn.disabled = false;
    startBtn.innerText = 'ابدأ معالجة الدبلجة';
  }
}

async function pollJob(jobId) {
  try {
    const res = await fetch(API_BASE + '/api/job/' + encodeURIComponent(jobId), {
      method: 'GET',
      credentials: 'include'
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      if (res.status === 404) {
        clearInterval(pollInterval);
        document.getElementById('statusTxt').innerText = 'المهمة غير موجودة';
        showToast('المهمة غير موجودة', '#b91c1c');
      }
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
    } else if (status === 'failed') {
      clearInterval(pollInterval);
      document.getElementById('statusTxt').innerText = 'فشلت المعالجة';
      showToast('فشلت المعالجة. تم استرجاع الرصيد.', '#b91c1c');
      document.getElementById('startBtn').disabled = false;
      document.getElementById('startBtn').innerText = 'ابدأ معالجة الدبلجة';
    }
  } catch (err) {
    console.error('poll error', err);
  }
}

function showResult(audioUrl) {
  if (!audioUrl) {
    showToast('لم يتم العثور على ملف الصوت', '#b91c1c');
    return;
  }
  if (audioUrl.startsWith('file://')) {
    const local = audioUrl.replace('file://', '');
    const name = local.split('/').pop();
    audioUrl = window.location.origin + '/api/file/' + name;
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
