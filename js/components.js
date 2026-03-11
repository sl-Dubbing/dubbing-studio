/**
 * sl-Dubbing — components.js (نسخة مصححة نهائية)
 */

const Components = {

  renderHeader(containerId = 'app-header') {
    const container = document.getElementById(containerId);
    if (!container) return;

    let user = null;
    try { user = (typeof Auth !== 'undefined' && Auth.getCurrentUser) ? Auth.getCurrentUser() : null; } catch(e) {}

    container.innerHTML = `
      <header>
        <a class="logo-header" href="${CONFIG.urls.pages.home}">
          <img src="${CONFIG.app.logoGif}"
               onerror="this.src='${CONFIG.app.logoPng}'"
               alt="${CONFIG.app.shortName}"
               style="width:50px;height:50px;object-fit:contain;filter:drop-shadow(0 0 10px rgba(167,139,250,.5))">
          <span>${CONFIG.app.name}</span>
        </a>
        <div class="user-info">
          ${user ? `
            <div class="user-avatar" title="${user.email}">${user.avatar || '👤'}</div>
            <span style="color:var(--text-muted);font-size:.9rem">${user.name || user.email}</span>
            <button class="logout-btn" onclick="Components.logout()">خروج</button>
          ` : `
            <a href="${CONFIG.urls.pages.login}" class="login-btn">تسجيل الدخول</a>
          `}
        </div>
      </header>
    `;
  },

  logout() {
    try { if (typeof Auth !== 'undefined') Auth.logout(); } catch(e) {}
    localStorage.removeItem('sl_user');
    showToast('تم تسجيل الخروج');
    setTimeout(() => window.location.href = CONFIG.urls.pages.home, 800);
  },

  renderFooter(containerId = 'app-footer') {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
      <footer style="text-align:center;padding:40px 0 20px;color:var(--text-dim);font-size:.85rem;border-top:1px solid var(--border);margin-top:60px">
        <p>${CONFIG.owner.name} © ${CONFIG.app.year} - جميع الحقوق محفوظة</p>
        <p style="margin-top:8px">
          <a href="${CONFIG.urls.pages.privacy}" style="color:var(--text-muted);text-decoration:none">سياسة الخصوصية</a>
          &nbsp;·&nbsp;
          <a href="${CONFIG.owner.youtube}" target="_blank" style="color:var(--text-muted);text-decoration:none">YouTube</a>
          &nbsp;·&nbsp;
          <a href="${CONFIG.owner.github}" target="_blank" style="color:var(--text-muted);text-decoration:none">GitHub</a>
        </p>
      </footer>
    `;
  },

  async renderServerStatus(containerId = 'server-status') {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
      <div class="server-status" id="serverStatusBadge" onclick="Components.checkServer()" style="cursor:pointer">
        <span class="server-status-icon"></span>
        <span id="serverStatusText">جاري الفحص...</span>
      </div>
    `;
    await Components.checkServer();
  },

  async checkServer() {
    const badge = document.getElementById('serverStatusBadge');
    const text  = document.getElementById('serverStatusText');
    if (!badge || !text) return;
    try {
      const res = await fetch(`${CONFIG.urls.backend}/api/health`, { signal: AbortSignal.timeout(5000) });
      badge.className = `server-status ${res.ok ? 'online' : ''}`;
      text.textContent = res.ok ? CONFIG.ui.serverOnline : CONFIG.ui.serverOffline;
    } catch {
      badge.className = 'server-status';
      text.textContent = CONFIG.ui.serverOffline;
    }
  },

  renderUsageBars(containerId = 'usage-display') {
    const container = document.getElementById(containerId);
    if (!container) return;
    let user = null;
    try { user = (typeof Auth !== 'undefined') ? Auth.getCurrentUser() : null; } catch(e) {}
    if (!user) { container.style.display = 'none'; return; }

    const usage    = user.usage    || { tts:0, dub:0, srt:0 };
    const unlocked = user.unlocked || { tts:false, dub:false, srt:false };
    const limit    = CONFIG.limits.freeUses;

    const bar = (key, label) => {
      const used = usage[key] || 0;
      const pct  = unlocked[key] ? 100 : Math.min((used / limit) * 100, 100);
      const info = unlocked[key] ? '∞ غير محدود' : `${Math.max(limit - used, 0)} متبقٍ`;
      return `
        <div style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;font-size:.8rem;margin-bottom:4px">
            <span>${label}</span>
            <span style="color:${unlocked[key]?'#34d399':'#a78bfa'}">${info}</span>
          </div>
          <div style="height:4px;background:rgba(255,255,255,.07);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#7c3aed,#34d399);border-radius:3px"></div>
          </div>
        </div>`;
    };

    container.innerHTML = `
      <div class="usage-display">
        <div class="usage-title">الاستخدام</div>
        ${bar('tts','🎙️ نطق')}
        ${bar('dub','🎬 دبلجة')}
        ${bar('srt','📝 SRT')}
      </div>`;
  },

  // ← الإصلاح الرئيسي: نشغل مباشرة بدون انتظار DOMContentLoaded
  autoInit() {
    const run = () => {
      Components.renderHeader();
      Components.renderFooter();
      if (document.getElementById('server-status'))  Components.renderServerStatus();
      if (document.getElementById('usage-display'))  Components.renderUsageBars();
    };

    // إذا الصفحة جاهزة شغّل مباشرة، وإلا انتظر
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run);
    } else {
      run(); // الـ DOM جاهز بالفعل
    }
  }
};

Components.autoInit();
