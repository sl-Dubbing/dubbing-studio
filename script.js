// غيّر هذا الرابط إلى رابط الـ backend اللي نشرته (Render أو HuggingFace Spaces)
const API_BASE = "https://sl-dubbing-backend.onrender.com";

// تسجيل مستخدم جديد
async function registerUser() {
  const email = document.getElementById("regEmail").value;
  const password = document.getElementById("regPassword").value;

  const resp = await fetch(`${API_BASE}/api/register`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ email, password })
  });

  const data = await resp.json();
  alert(JSON.stringify(data));
}

// تسجيل الدخول
async function loginUser() {
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;

  const resp = await fetch(`${API_BASE}/api/login`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ email, password })
  });

  const data = await resp.json();
  alert(JSON.stringify(data));
}

// رفع عينة صوت
async function uploadVoice() {
  const email = document.getElementById("voiceEmail").value;
  const fileInput = document.getElementById("voiceFile");
  if (!fileInput.files.length) {
    alert("اختر ملف صوتي أولاً");
    return;
  }

  const formData = new FormData();
  formData.append("email", email);
  formData.append("voice", fileInput.files[0]);

  const resp = await fetch(`${API_BASE}/api/upload-voice`, {
    method: "POST",
    body: formData
  });

  const data = await resp.json();
  alert(JSON.stringify(data));
}

// دبلجة النص
async function dubText() {
  const text = document.getElementById("inputText").value;
  if (!text) {
    alert("أدخل نصاً أولاً");
    return;
  }

  const resp = await fetch(`${API_BASE}/api/dub`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ text, lang: "ar", voice_mode: "gtts" })
  });

  const data = await resp.json();
  if (data.success) {
    const player = document.getElementById("player");
    player.src = data.audio_url;
    player.play();
  } else {
    alert("خطأ: " + data.error);
  }
}
