<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sign in | sl-Dubbing</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<script src="https://accounts.google.com/gsi/client" async defer></script>
<style>
:root { --bg-color: #ffffff; --text-main: #111827; --text-muted: #6b7280; --border-color: #e5e7eb; --border-focus: #111827; --btn-grey: #a1a1aa; --btn-grey-hover: #71717a; --radius: 10px; }
* { margin: 0; padding: 0; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
body { background-color: var(--bg-color); color: var(--text-main); display: flex; justify-content: center; min-height: 100vh; }
.login-container { width: 100%; max-width: 400px; padding: 40px 20px; display: flex; flex-direction: column; margin-top: 4vh; }
.logo { text-align: center; font-size: 1.25rem; font-weight: 800; letter-spacing: -0.03em; margin-bottom: 60px; color: var(--text-main); text-decoration: none; }
.logo span { font-weight: 900; margin-right: 2px; }
.title { text-align: center; font-size: 1.75rem; font-weight: 700; margin-bottom: 40px; letter-spacing: -0.02em; }
.oauth-group { display: flex; flex-direction: column; gap: 12px; margin-bottom: 30px; }
.divider { height: 1px; background-color: var(--border-color); margin-bottom: 30px; }
.form-group { margin-bottom: 20px; }
.label-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
label { font-size: 0.85rem; font-weight: 600; color: var(--text-main); }
.input-wrap { position: relative; }
input[type="email"], input[type="password"] { width: 100%; height: 48px; padding: 0 16px; border: 1px solid var(--border-color); border-radius: var(--radius); font-size: 1rem; outline: none; transition: border-color 0.2s; }
input:focus { border-color: var(--border-focus); }
.toggle-pwd { position: absolute; right: 16px; top: 50%; transform: translateY(-50%); color: var(--text-muted); cursor: pointer; font-size: 1.1rem; }
.submit-btn { width: 100%; height: 48px; background-color: var(--btn-grey); color: #fff; border: none; border-radius: var(--radius); font-size: 1rem; font-weight: 600; cursor: pointer; margin-top: 10px; transition: background 0.2s; }
.submit-btn:hover { background-color: var(--btn-grey-hover); }
.footer-text { text-align: center; margin-top: 24px; font-size: 0.9rem; color: var(--text-main); }
.footer-text a { color: var(--text-main); font-weight: 600; text-decoration: none; cursor: pointer; }
.google-btn-wrapper { width: 100%; display: flex; justify-content: center; }
</style>
</head>
<body>

<div class="login-container">
  <a href="index.html" class="logo"><span>||</span>sl-Dubbing</a>
  <h1 class="title" id="pageTitle">Welcome back</h1>

  <div class="oauth-group">
    <div class="google-btn-wrapper" id="googleBtn"></div>
  </div>

  <div class="divider"></div>

  <form id="authForm">
    <div class="form-group">
      <div class="label-row"><label for="email">Email</label></div>
      <input type="email" id="email" required>
    </div>
    <div class="form-group">
      <div class="label-row">
        <label for="password">Password (Min 6 chars)</label>
      </div>
      <div class="input-wrap">
        <input type="password" id="password" required minlength="6">
        <i class="fas fa-eye toggle-pwd" onclick="togglePassword()"></i>
      </div>
    </div>
    <button type="submit" class="submit-btn" id="submitBtn">Sign in</button>
  </form>

  <p class="footer-text">
    <span id="toggleText">Don't have an account?</span> 
    <a onclick="toggleMode()">Sign up</a>
  </p>
  
  <p class="footer-text" style="margin-top:10px; font-size:0.8rem; color:var(--text-muted)">
    Need a new Google account? <a href="https://accounts.google.com/signup" target="_blank">Create one</a>
  </p>
</div>

<script>
const GOOGLE_CLIENT_ID = "497619073475-6vjelufub8gci231ettdhmk5pv0cdde3.apps.googleusercontent.com";
const API_BASE = "https://sl-dubbing-backend-production.up.railway.app";
let isLoginMode = true; // نتحكم بالواجهة إما "دخول" أو "تسجيل"

window.onload = function () {
  google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleGoogleResponse });
  google.accounts.id.renderButton(document.getElementById("googleBtn"), { theme: "outline", size: "large", width: document.getElementById("googleBtn").offsetWidth });
};

function toggleMode() {
    isLoginMode = !isLoginMode;
    document.getElementById('pageTitle').innerText = isLoginMode ? "Welcome back" : "Create an account";
    document.getElementById('submitBtn').innerText = isLoginMode ? "Sign in" : "Sign up";
    document.getElementById('toggleText').innerText = isLoginMode ? "Don't have an account?" : "Already have an account?";
    document.querySelector('.footer-text a').innerText = isLoginMode ? "Sign up" : "Sign in";
}

async function handleGoogleResponse(response) {
  try {
    const res = await fetch(`${API_BASE}/api/auth/google`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: response.credential })
    });
    const data = await res.json();
    if (data.success) finishAuth(data.user); else alert("Error: " + data.error);
  } catch (err) { alert("Server connection failed."); }
}

document.getElementById('authForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const btn = document.getElementById('submitBtn');
  btn.disabled = true; btn.innerText = "Processing...";
  
  const endpoint = isLoginMode ? '/api/auth/login' : '/api/auth/register';
  try {
      const res = await fetch(API_BASE + endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include', // مهم جداً لاستلام الكوكي
          body: JSON.stringify({
              email: document.getElementById('email').value,
              password: document.getElementById('password').value
          })
      });
      const data = await res.json();
      if (data.success) finishAuth(data.user);
      else alert("Error: " + data.error);
  } catch (err) { alert("Server connection failed."); }
  finally { btn.disabled = false; btn.innerText = isLoginMode ? "Sign in" : "Sign up"; }
});

function finishAuth(user) {
    let avatarHtml = user.auth_method === 'google' 
        ? `<img src="${user.avatar}" style="width:100%; height:100%; object-fit:cover;">` 
        : user.name.charAt(0).toUpperCase();
        
    localStorage.setItem('sl_user', JSON.stringify({
        email: user.email, name: user.name, avatar: avatarHtml, credits: user.credits
    }));
    
    const returnUrl = sessionStorage.getItem('returnUrl') || 'index.html';
    sessionStorage.removeItem('returnUrl');
    window.location.href = returnUrl;
}

function togglePassword() {
  const pwd = document.getElementById('password');
  const icon = document.querySelector('.toggle-pwd');
  if (pwd.type === 'password') { pwd.type = 'text'; icon.classList.replace('fa-eye', 'fa-eye-slash'); } 
  else { pwd.type = 'password'; icon.classList.replace('fa-eye-slash', 'fa-eye'); }
}
</script>
</body>
</html>
