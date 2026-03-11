/**
 * ╔══════════════════════════════════════════════════════╗
 *  sl-Dubbing — components.js
 *  مكونات مشتركة تُرسم تلقائياً في كل صفحة
 *  يعتمد على config.js — يجب تحميله أولاً
 * ╚══════════════════════════════════════════════════════╝
 */

const Components = {

  /* ─── Header المشترك ─────────────────────────────── */
  renderHeader(containerId = 'app-header') {
    const user = Auth?.getCurrentUser ? Auth.getCurrentUser() : null;
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <header>
        <a class="logo-header" href="${CONFIG.urls.pages.home}">
          <img src="${CONFIG.app.logoGif}"
               onerror="this.src='${CONFIG.app.logoPng}'"
               alt="${CONFIG.app.shortName}">
          <span>${CONFIG.app.name}</span>
        </a>
        <div class="user-info" id="headerUserZone">
          ${user ? Components._userLoggedIn(user) : Components._userGuest()}
        </div>
      </header>
    `;
  },

  _userLoggedIn(user) {
    return `
      <div class="user-avatar" title="${user.email}">${user.avatar || '👤'}</div>
      <span style="color:var(--text-muted);font-size:.9rem">${user.name || user.email}</span>
      <button class="logout-btn" onclick="Components.logout()">
        ${CONFIG.ui.logoutBtn}
      </button>
    `;
  },

  _userGuest() {
    return `
      <a href="${CONFIG.urls.pages.login}" class="login-btn">
        ${CONFIG.ui.loginBtn}
      </a>
    `;
  },

  logout() {
    if (typeof Auth !== 'undefined' && Auth.logout) Auth.logout();
    else localStorage.removeItem('sl_user');
    showToast('تم تسجيل الخروج');
    setTimeout(() => window.location.href = CONFIG.urls.pages.home, 800);
  },

  /* ─── Footer المشترك ─────────────────────────────── */
  renderFooter(containerId = 'app-footer') {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
      <footer style="text-align:center;padding:40px 0 20px;color:var(--text-dim);font-size:.85rem;border-top:1px solid var(--border)">
        <p>${CONFIG.ui.footerText(CONFIG.app.year, CONFIG.owner.name)}</p>
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

  /* ─── مؤشر حالة الخادم ──────────────────────────── */
  async renderServerStatus(containerId = 'server-status') {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="server-status" id="serverStatusBadge" onclick="Components.checkServer()">
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
      const res = await fetch(`${CONFIG.urls.backend}/api/health`, {
        signal: AbortSignal.timeout(5000)
      });
      const ok = res.ok;
      badge.className = `server-status ${ok ? 'online' : ''}`;
      text.textContent = ok ? CONFIG.ui.serverOnline : CONFIG.ui.serverOffline;
    } catch {
      badge.className = 'server-status';
      text.textContent = CONFIG.ui.serverOffline;
    }
  },

  /* ─── عرض استخدام المستخدم ───────────────────────── */
  renderUsageBars(containerId = 'usage-display') {
    const container = document.getElementById(containerId);
    if (!container) return;

    const user = Auth?.getCurrentUser ? Auth.getCurrentUser() : null;
    if (!user) { container.style.display = 'none'; return; }

    const usage   = user.usage   || { tts: 0, dub: 0, srt: 0 };
    const unlocked = user.unlocked || { tts: false, dub: false, srt: false };
    const limit   = CONFIG.limits.freeUses;

    const bar = (key, label, cls) => {
      const used  = usage[key] || 0;
      const pct   = unlocked[key] ? 100 : Math.min((used / limit) * 100, 100);
      const label2 = unlocked[key]
        ? CONFIG.ui.unlimitedLabel
        : CONFIG.ui.freeLabel(Math.max(limit - used, 0));
      return `
        <div class="usage-item">
          <div class="usage-row">
            <span>${label}</span>
            <span style="color:${unlocked[key]?'#34d399':'#a78bfa'}">${label2}</span>
          </div>
          <div class="usage-bar-bg">
            <div class="usage-bar-fill usage-${cls}" style="width:${pct}%"></div>
          </div>
        </div>
      `;
    };

    container.innerHTML = `
      <div class="usage-display">
        <div class="usage-title">الاستخدام</div>
        ${bar('tts','🎙️ نطق','tts')}
        ${bar('dub','🎬 دبلجة','dub')}
        ${bar('srt','📝 SRT','srt')}
      </div>
    `;
  },

  /* ─── زر الرجوع ──────────────────────────────────── */
  renderBackBtn(containerId, targetPage = 'home', label) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
      <a href="${CONFIG.urls.pages[targetPage]}" class="back-btn">
        ${label || CONFIG.ui.backBtn}
      </a>
    `;
  },

  /* ─── تهيئة تلقائية عند تحميل الصفحة ────────────── */
  autoInit() {
    document.addEventListener('DOMContentLoaded', () => {
      Components.renderHeader();
      Components.renderFooter();
      if (document.getElementById('server-status'))
        Components.renderServerStatus();
      if (document.getElementById('usage-display'))
        Components.renderUsageBars();
    });
  }

};

/* تهيئة تلقائية */
Components.autoInit();
