/**
 * MoneyNote Pro — Frontend Application Controller
 * Dữ liệu thật 100% do người dùng nhập + Lịch Tháng Tương Tác cho phép bấm vào bất kỳ ngày nào để xem/sửa/thêm note thu nhập ngày cũ
 */

function loadCachedUser() {
  try {
    const raw = localStorage.getItem('moneynote_user');
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function loadLocalDataCache() {
  try {
    const raw = localStorage.getItem('moneynote_data_cache');
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function saveLocalDataCache() {
  try {
    localStorage.setItem(
      'moneynote_data_cache',
      JSON.stringify({
        incomes: state.incomes.slice(0, 150),
        expenses: (state.expenses || []).slice(0, 150),
        goals: state.goals,
        pinnedGoal: state.pinnedGoal,
        homeCalendarData: state.homeCalendarData,
        expenseCalendarData: state.expenseCalendarData,
      })
    );
  } catch (_) {}
}

function savePersistentAuth(token, user) {
  if (token) {
    state.token = token;
    localStorage.setItem('moneynote_token', token);
  }
  if (user) {
    state.user = user;
    localStorage.setItem('moneynote_user', JSON.stringify(user));
  }
}

const initialCache = loadLocalDataCache();

// ==================== STATE TOÀN CỤC ====================
const state = {
  token: localStorage.getItem('moneynote_token') || null,
  user: loadCachedUser(),
  categories: [
    { name: 'Lương', color: '#10b981' },
    { name: 'Freelance', color: '#6366f1' },
    { name: 'Bán hàng', color: '#f59e0b' },
    { name: 'Đầu tư', color: '#06b6d4' },
    { name: 'Thưởng', color: '#ec4899' },
    { name: 'Khác', color: '#8b5cf6' },
  ],
  expenseCategories: [
    { name: 'Ăn uống', color: '#f43f5e' },
    { name: 'Di chuyển', color: '#f97316' },
    { name: 'Mua sắm', color: '#ec4899' },
    { name: 'Hóa đơn & Nhà ở', color: '#8b5cf6' },
    { name: 'Giải trí & Cafe', color: '#06b6d4' },
    { name: 'Sức khỏe & Học tập', color: '#10b981' },
    { name: 'Khác', color: '#64748b' },
  ],
  announcements: [],
  incomes: initialCache.incomes || [],
  expenses: initialCache.expenses || [],
  goals: initialCache.goals || [],
  pinnedGoal: initialCache.pinnedGoal || null,
  activeTab: 'home',
  selectedDate: toInputDateValue(new Date()), // Ngày đang chọn để nhập / sửa note (YYYY-MM-DD)
  filterBySelectedDate: false, // Có đang lọc danh sách thu nhập theo ngày đã chọn hay không
  filterExpensesBySelectedDate: false, // Có đang lọc danh sách chi tiêu theo ngày đã chọn hay không
  homeCalendarData: initialCache.homeCalendarData || null, // Dữ liệu 31 ngày của Lịch Tháng trên trang chủ
  expenseCalendarData: initialCache.expenseCalendarData || null, // Dữ liệu 31 ngày của Lịch Chi tiêu
  celebratedGoalIds: new Set(),
  charts: {
    daily: null,
    yearly: null,
    category: null,
    dailyExpense: null,
    expenseCategory: null,
    adminGrowth: null,
  },
};

let incomeSearchTimer = null;
let expenseSearchTimer = null;
let adminUserSearchTimer = null;

// ==================== TIỆN ÍCH ĐỊNH DẠNG ====================
function formatVND(amount) {
  const num = Number(amount) || 0;
  return num.toLocaleString('vi-VN') + ' ₫';
}

function formatNumberDots(value) {
  const digits = String(value || '').replace(/[^\d]/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('vi-VN');
}

function parseCurrencyString(value) {
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  const digits = String(value || '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

function formatCurrencyInput(inputEl) {
  const raw = inputEl.value.replace(/[^\d]/g, '');
  inputEl.value = raw ? Number(raw).toLocaleString('vi-VN') : '';
}

function toInputDateValue(dateInput = new Date()) {
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    return dateInput.trim();
  }
  const d = new Date(dateInput);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateVN(dateInput) {
  if (!dateInput) return '—';
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    const [y, m, d] = dateInput.trim().split('-');
    return `${d}/${m}/${y}`;
  }
  const d = new Date(dateInput);
  return d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getCategoryColor(categoryName) {
  const found = state.categories.find(
    (c) => c.name.toLowerCase() === String(categoryName || '').toLowerCase()
  );
  return found ? found.color : '#6366f1';
}

function getExpenseCategoryColor(categoryName) {
  const found = (state.expenseCategories || []).find(
    (c) => c.name.toLowerCase() === String(categoryName || '').toLowerCase()
  );
  return found ? found.color : '#f43f5e';
}

// ==================== TOAST THÔNG BÁO ====================
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const colors = {
    success: 'bg-emerald-600 text-white border-emerald-500',
    error: 'bg-rose-600 text-white border-rose-500',
    info: 'bg-indigo-600 text-white border-indigo-500',
    warning: 'bg-amber-500 text-slate-950 border-amber-400',
  };

  const toast = document.createElement('div');
  toast.className = `animate-item-in pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-2xl shadow-xl border text-xs sm:text-sm font-semibold transition-all duration-300 ${
    colors[type] || colors.info
  }`;
  toast.innerHTML = `
    <span>${escapeHtml(message)}</span>
    <button class="opacity-80 hover:opacity-100 text-xs font-bold" onclick="this.parentElement.remove()">✕</button>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    if (toast.parentElement) toast.remove();
  }, 3800);
}

// ==================== PHÁO HOA (CANVAS CONFETTI) ====================
function triggerGoalConfetti() {
  if (typeof confetti !== 'function') return;
  const duration = 2200;
  const end = Date.now() + duration;

  (function frame() {
    confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 } });
    confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 } });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

// ==================== DARK / LIGHT MODE ====================
function initTheme() {
  const saved = localStorage.getItem('moneynote_theme');
  const htmlEl = document.documentElement;
  if (saved === 'dark') {
    htmlEl.classList.add('dark');
  } else {
    htmlEl.classList.remove('dark');
  }
}

function toggleTheme() {
  const htmlEl = document.documentElement;
  const isDark = htmlEl.classList.toggle('dark');
  localStorage.setItem('moneynote_theme', isDark ? 'dark' : 'light');

  if (state.activeTab === 'analytics') {
    loadMonthlyAnalytics();
  } else if (state.activeTab === 'expenses') {
    loadExpenseCalendar();
  } else if (state.activeTab === 'admin') {
    loadAdminOverview();
  }
}

// ==================== GIF LOADING INDICATOR & FETCH API WRAPPER ====================
let activeLoadingCount = 0;

function showGlobalLoader(labelText = 'Đang tải dữ liệu') {
  activeLoadingCount += 1;
  const loaderEl = document.getElementById('global-data-loader');
  const textEl = document.getElementById('global-loader-text');
  if (textEl) textEl.textContent = labelText;
  if (loaderEl) loaderEl.classList.remove('hidden');
}

function hideGlobalLoader() {
  activeLoadingCount = Math.max(0, activeLoadingCount - 1);
  if (activeLoadingCount === 0) {
    const loaderEl = document.getElementById('global-data-loader');
    if (loaderEl) loaderEl.classList.add('hidden');
  }
}

function getLoadingGifBlockHtml(labelText = 'Đang tải dữ liệu') {
  return `
    <div class="py-10 px-4 flex flex-col items-center justify-center gap-3 text-center">
      <div class="relative w-12 h-12 flex items-center justify-center">
        <div class="gif-orbit-ring absolute inset-0 rounded-full border-[3px] border-transparent border-t-emerald-500 border-r-indigo-500"></div>
        <div class="gif-coin-spin w-8 h-8 rounded-full bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 text-slate-950 font-black text-base flex items-center justify-center shadow-lg">
          ₫
        </div>
      </div>
      <div class="flex items-center gap-1 text-xs sm:text-sm font-bold text-indigo-600 dark:text-indigo-400">
        <span>${escapeHtml(labelText)}</span>
        <span class="flex items-center gap-0.5 font-black">
          <span class="loading-dot-1">.</span>
          <span class="loading-dot-2">.</span>
          <span class="loading-dot-3">.</span>
        </span>
      </div>
    </div>
  `;
}

async function apiRequest(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const loaderLabel =
    method === 'GET'
      ? 'Đang tải dữ liệu'
      : method === 'DELETE'
      ? 'Đang xóa dữ liệu'
      : 'Đang lưu dữ liệu';

  showGlobalLoader(loaderLabel);

  try {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    if (state.token) {
      headers['Authorization'] = `Bearer ${state.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const err = new Error(data.message || 'Có lỗi xảy ra khi kết nối máy chủ.');
      err.code = data.code || null;
      err.status = response.status;

      if (
        data.code === 'ACCOUNT_BANNED' ||
        data.code === 'USER_NOT_FOUND' ||
        data.code === 'INVALID_TOKEN'
      ) {
        err.isAuthInvalid = true;
        handleForceLogout(data.code === 'ACCOUNT_BANNED' ? data.message : null);
      }
      throw err;
    }

    return data;
  } finally {
    hideGlobalLoader();
  }
}

// ==================== XÁC THỰC (AUTH & PROFILE) ====================
function switchAuthTab(tab) {
  const loginForm = document.getElementById('login-form');
  const regForm = document.getElementById('register-form');
  const btnLogin = document.getElementById('tab-btn-login');
  const btnReg = document.getElementById('tab-btn-register');
  const headingTitle = document.getElementById('auth-heading-title');
  const headingSub = document.getElementById('auth-heading-sub');
  hideAuthError();

  if (tab === 'login') {
    loginForm.classList.remove('hidden');
    regForm.classList.add('hidden');
    btnLogin.className =
      'px-5 py-2 rounded-xl text-sm font-bold bg-white dark:bg-slate-900 shadow-sm text-indigo-600 dark:text-indigo-400 transition';
    btnReg.className =
      'px-5 py-2 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 transition';
    headingTitle.textContent = 'Chào mừng bạn quay lại';
    headingSub.textContent = 'Đăng nhập vào sổ tay tài chính cá nhân của bạn để tiếp tục ghi chép thu nhập.';
  } else {
    loginForm.classList.add('hidden');
    regForm.classList.remove('hidden');
    btnReg.className =
      'px-5 py-2 rounded-xl text-sm font-bold bg-white dark:bg-slate-900 shadow-sm text-indigo-600 dark:text-indigo-400 transition';
    btnLogin.className =
      'px-5 py-2 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 transition';
    headingTitle.textContent = 'Tạo tài khoản MoneyNote Pro';
    headingSub.textContent = 'Bắt đầu hành trình ghi chép thu nhập thực tế và chinh phục các mục tiêu tài chính.';
  }
}

function showAuthError(msg) {
  const box = document.getElementById('auth-error-box');
  const text = document.getElementById('auth-error-text');
  text.textContent = msg;
  box.classList.remove('hidden');
}

function hideAuthError() {
  document.getElementById('auth-error-box').classList.add('hidden');
}

async function submitLogin(email, password) {
  hideAuthError();
  try {
    const res = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    savePersistentAuth(res.token, res.user);

    showToast(`Xin chào, ${res.user.fullName}!`, 'success');
    await bootstrapAuthenticatedApp();
  } catch (error) {
    showAuthError(error.message);
    showToast(error.message, 'error');
  }
}

function handleForceLogout(reasonMessage) {
  state.token = null;
  state.user = null;
  localStorage.removeItem('moneynote_token');
  localStorage.removeItem('moneynote_user');
  localStorage.removeItem('moneynote_data_cache');
  document.getElementById('app-view').classList.add('hidden');
  document.getElementById('auth-view').classList.remove('hidden');
  if (reasonMessage) {
    showAuthError(reasonMessage);
  }
}

async function handleLogout() {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  } catch (_) {}
  handleForceLogout();
  showToast('Đã đăng xuất khỏi tài khoản.', 'info');
}

// ==================== KHỞI TẠO GIAO DIỆN SAU ĐĂNG NHẬP (HIỂN THỊ TỨC THÌ 0ms + ĐỒNG BỘ SONG SONG) ====================
async function bootstrapAuthenticatedApp() {
  document.getElementById('auth-view').classList.add('hidden');
  document.getElementById('app-view').classList.remove('hidden');

  const now = new Date();
  const todayStr = toInputDateValue(now);
  state.selectedDate = todayStr;
  state.filterBySelectedDate = false;
  state.filterExpensesBySelectedDate = false;

  document.getElementById('home-cal-month').value = String(now.getMonth() + 1);
  document.getElementById('home-cal-year').value = String(now.getFullYear());
  if (document.getElementById('exp-cal-month')) {
    document.getElementById('exp-cal-month').value = String(now.getMonth() + 1);
    document.getElementById('exp-cal-year').value = String(now.getFullYear());
  }
  document.getElementById('analytics-month').value = String(now.getMonth() + 1);
  document.getElementById('analytics-year').value = String(now.getFullYear());

  // 1. Hiển thị ngay lập tức dữ liệu đã lưu trong Cache (0ms, không cần chờ mạng)
  if (state.user) {
    renderUserHeaderAndProfile();
  }
  populateCategorySelects();
  populateExpenseCategorySelects();
  updateSelectedDateUI();
  renderHeroGoalBanner();
  renderGoalsGrid();
  if (state.homeCalendarData) {
    const s = state.homeCalendarData.summary || {};
    document.getElementById('home-cal-month-total').textContent = formatVND(s.totalMonth || 0);
    if (document.getElementById('home-cal-month-expense')) {
      document.getElementById('home-cal-month-expense').textContent = formatVND(s.totalExpenseMonth || 0);
    }
    if (document.getElementById('home-cal-month-net')) {
      document.getElementById('home-cal-month-net').textContent = formatVND(
        s.netBalanceMonth !== undefined ? s.netBalanceMonth : s.totalMonth || 0
      );
    }
    document.getElementById('home-cal-active-days').textContent = `${
      s.activeDaysCount || 0
    }/${state.homeCalendarData.period?.daysInMonth || 30} ngày có thu (${
      s.totalEntries || 0
    } thu • ${s.totalExpenseEntries || 0} chi)`;
    renderHomeCalendarGrid();
  }
  if (state.incomes && state.incomes.length > 0) {
    const totalCached = state.incomes.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const totalExpCached = (state.expenses || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
    document.getElementById('notes-count-badge').textContent = state.incomes.length;
    updateIncomeListTotalBadge(totalCached, totalExpCached);
    renderIncomeNotesList();
  }
  if (state.expenseCalendarData) {
    renderExpenseSummaryAndCalendarUI();
  }
  if (state.expenses && state.expenses.length > 0) {
    const totalExpCached = state.expenses.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    if (document.getElementById('exp-notes-count-badge')) {
      document.getElementById('exp-notes-count-badge').textContent = state.expenses.length;
      document.getElementById('exp-notes-total-badge').textContent = `-${formatVND(totalExpCached)}`;
      renderExpenseNotesList();
    }
  }
  if (window.lucide) lucide.createIcons();

  // 2. Gọi song song tất cả API cùng lúc (nhanh gấp đôi so với gọi tuần tự)
  try {
    const [meData] = await Promise.all([
      apiRequest('/api/auth/me'),
      loadGoals(),
      loadHomeCalendar(),
      loadIncomes(),
      loadExpenseCalendar(),
      loadExpenses(),
    ]);

    if (meData && meData.user) {
      savePersistentAuth(meData.token || state.token, meData.user);
      state.announcements = meData.announcements || [];
      if (Array.isArray(meData.categories) && meData.categories.length > 0) {
        state.categories = meData.categories;
      }
      if (Array.isArray(meData.expenseCategories) && meData.expenseCategories.length > 0) {
        state.expenseCategories = meData.expenseCategories;
      }
      renderUserHeaderAndProfile();
      renderBroadcastAnnouncements();
      populateCategorySelects();
      populateExpenseCategorySelects();
    }
    if (window.lucide) lucide.createIcons();
  } catch (error) {
    if (error && error.isAuthInvalid) {
      handleForceLogout(error.message);
    } else {
      console.warn('Tạm thời chưa đồng bộ được máy chủ, vẫn giữ phiên đăng nhập:', error.message);
    }
  }
}

function getSafeFlaticonAvatar(avatarUrl, role = 'user') {
  const defaultIcon =
    role === 'admin'
      ? 'https://cdn-icons-png.flaticon.com/512/2202/2202112.png'
      : 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';
  if (!avatarUrl || String(avatarUrl).includes('dicebear.com')) {
    return defaultIcon;
  }
  return avatarUrl;
}

function getAdminVerifiedBadgeHtml(sizeClass = 'w-4 h-4') {
  return `<span title="Tài khoản Quản trị viên xác thực (Admin Verified)" class="inline-flex items-center justify-center shrink-0 align-middle select-none">
    <svg class="${sizeClass} drop-shadow-[0_1px_3px_rgba(29,155,240,0.45)]" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 1.5L14.69 3.69L18.12 3.31L19.19 6.61L22.19 8.38L21.12 11.68L22.5 14.85L19.65 16.82L19.03 20.22L15.58 20.47L13.19 23L10.31 21.12L6.88 21.5L5.81 18.2L2.81 16.43L3.88 13.13L2.5 9.96L5.35 7.99L5.97 4.59L9.42 4.34L12 1.5Z" fill="#1D9BF0"/>
      <path d="M9.5 12.25L11.25 14L15 9.75" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </span>`;
}

function renderUserHeaderAndProfile() {
  if (!state.user) return;
  const u = state.user;
  const isAdmin = u.role === 'admin';
  const avatarSrc = getSafeFlaticonAvatar(u.avatar, u.role);

  const headerNameEl = document.getElementById('header-user-name');
  if (headerNameEl) {
    headerNameEl.textContent = u.fullName;
  }
  const headerVerifiedEl = document.getElementById('header-admin-verified');
  if (headerVerifiedEl) {
    if (isAdmin) {
      headerVerifiedEl.innerHTML = getAdminVerifiedBadgeHtml('w-4 h-4');
      headerVerifiedEl.classList.remove('hidden');
    } else {
      headerVerifiedEl.innerHTML = '';
      headerVerifiedEl.classList.add('hidden');
    }
  }

  document.getElementById('header-user-avatar').src = avatarSrc;
  document.getElementById('header-streak-count').textContent = u.streakCount || 0;

  const roleBadge = document.getElementById('nav-role-badge');
  if (isAdmin) {
    roleBadge.innerHTML = `<span>ADMIN</span> ${getAdminVerifiedBadgeHtml('w-3.5 h-3.5')}`;
    roleBadge.className =
      'inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-300 border border-sky-300/60 dark:border-sky-700/60';
    document.getElementById('nav-tab-admin').classList.remove('hidden');
    document.getElementById('mobile-tab-admin').classList.remove('hidden');
  } else {
    roleBadge.textContent = u.role.toUpperCase();
    roleBadge.className =
      'text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300';
    document.getElementById('nav-tab-admin').classList.add('hidden');
    document.getElementById('mobile-tab-admin').classList.add('hidden');
  }

  document.getElementById('profile-preview-avatar').src = avatarSrc;
  const profileNameEl = document.getElementById('profile-display-name');
  if (profileNameEl) {
    profileNameEl.innerHTML = isAdmin
      ? `<span class="inline-flex items-center gap-1.5">${escapeHtml(u.fullName)} ${getAdminVerifiedBadgeHtml('w-5 h-5')}</span>`
      : escapeHtml(u.fullName);
  }
  document.getElementById('profile-display-email').textContent = u.email;
  const profileRoleEl = document.getElementById('profile-display-role');
  if (profileRoleEl) {
    if (isAdmin) {
      profileRoleEl.innerHTML = `<span class="inline-flex items-center gap-1">👑 QUẢN TRỊ VIÊN (ADMIN) ${getAdminVerifiedBadgeHtml('w-3.5 h-3.5')}</span>`;
      profileRoleEl.className =
        'text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 border border-sky-300/60 dark:border-sky-700/60';
    } else {
      profileRoleEl.textContent = '👤 NGƯỜI DÙNG (USER)';
      profileRoleEl.className =
        'text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300';
    }
  }
  document.getElementById('profile-display-streak').textContent = `🔥 Chuỗi ${u.streakCount || 0} ngày liên tiếp`;
  document.getElementById('profile-fullname').value = u.fullName;
  document.getElementById('profile-avatar').value = avatarSrc;
}

function renderBroadcastAnnouncements() {
  const bar = document.getElementById('system-announcement-bar');
  const contentEl = document.getElementById('announcement-list-content');

  if (!state.announcements || state.announcements.length === 0) {
    bar.classList.add('hidden');
    return;
  }

  bar.classList.remove('hidden');
  contentEl.innerHTML = state.announcements
    .map(
      (a) => `
      <div class="flex items-center gap-2 shrink-0 pr-4">
        <span class="px-2 py-0.5 rounded-full bg-white/20 font-bold text-xs">${escapeHtml(a.title)}</span>
        <span class="text-indigo-50">${escapeHtml(a.content)}</span>
      </div>
    `
    )
    .join('<span class="text-white/40">|</span>');
}

function populateCategorySelects() {
  const detailSelect = document.getElementById('detail-category');
  const editSelect = document.getElementById('edit-income-category');
  const filterSelect = document.getElementById('filter-category');

  const optionsHtml = state.categories
    .map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`)
    .join('');

  if (detailSelect) detailSelect.innerHTML = optionsHtml;
  if (editSelect) editSelect.innerHTML = optionsHtml;
  if (filterSelect) {
    const currentFilter = filterSelect.value || 'all';
    filterSelect.innerHTML = `<option value="all">Tất cả danh mục</option>` + optionsHtml;
    filterSelect.value = currentFilter;
  }
}

function populateExpenseCategorySelects() {
  const detailSelect = document.getElementById('exp-detail-category');
  const editSelect = document.getElementById('edit-expense-category');
  const filterSelect = document.getElementById('exp-filter-category');

  const optionsHtml = (state.expenseCategories || DEFAULT_EXPENSE_CATEGORIES_FALLBACK)
    .map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`)
    .join('');

  if (detailSelect) detailSelect.innerHTML = optionsHtml;
  if (editSelect) editSelect.innerHTML = optionsHtml;
  if (filterSelect) {
    const currentFilter = filterSelect.value || 'all';
    filterSelect.innerHTML = `<option value="all">Tất cả danh mục chi</option>` + optionsHtml;
    filterSelect.value = currentFilter;
  }
}

// ==================== ĐỒNG BỘ NGÀY ĐANG CHỌN & LỊCH THÁNG TƯƠNG TÁC ====================
function updateSelectedDateUI() {
  const todayStr = toInputDateValue(new Date());
  const isToday = state.selectedDate === todayStr;
  const formatted = formatDateVN(state.selectedDate);

  const displayEl = document.getElementById('active-selected-date-display');
  if (displayEl) {
    displayEl.textContent = isToday ? `Hôm nay (${formatted})` : `Ngày ${formatted}`;
  }

  const quickLabel = document.getElementById('quick-target-date-label');
  if (quickLabel) {
    quickLabel.textContent = isToday ? `hôm nay (${formatted})` : formatted;
  }

  const detailDateInput = document.getElementById('detail-date');
  if (detailDateInput) {
    detailDateInput.value = state.selectedDate;
  }

  const filterPill = document.getElementById('active-date-filter-pill');
  const filterText = document.getElementById('active-date-filter-text');
  const btnShowAll = document.getElementById('btn-show-all-dates');
  const exactDateInput = document.getElementById('filter-exact-date');

  if (state.filterBySelectedDate) {
    if (filterPill) filterPill.classList.remove('hidden');
    if (filterText) filterText.textContent = `Đang lọc ngày ${formatted}`;
    if (btnShowAll) btnShowAll.classList.remove('hidden');
    if (exactDateInput) exactDateInput.value = state.selectedDate;
  } else {
    if (filterPill) filterPill.classList.add('hidden');
    if (btnShowAll) btnShowAll.classList.add('hidden');
    if (exactDateInput) exactDateInput.value = '';
  }

  // Đồng bộ UI ngày đang chọn cho Tab Chi Tiêu Hằng Ngày
  const expDisplayEl = document.getElementById('exp-selected-date-display');
  if (expDisplayEl) {
    expDisplayEl.textContent = isToday ? `Hôm nay (${formatted})` : `Ngày ${formatted}`;
  }

  const expQuickLabel = document.getElementById('exp-quick-target-date-label');
  if (expQuickLabel) {
    expQuickLabel.textContent = isToday ? `hôm nay (${formatted})` : formatted;
  }

  const expDetailDateInput = document.getElementById('exp-detail-date');
  if (expDetailDateInput) {
    expDetailDateInput.value = state.selectedDate;
  }

  const expFilterPill = document.getElementById('exp-active-date-filter-pill');
  const expFilterText = document.getElementById('exp-active-date-filter-text');
  const expBtnShowAll = document.getElementById('btn-exp-show-all-dates');
  const expExactDateInput = document.getElementById('exp-filter-exact-date');

  if (state.filterExpensesBySelectedDate) {
    if (expFilterPill) expFilterPill.classList.remove('hidden');
    if (expFilterText) expFilterText.textContent = `Đang lọc ngày ${formatted}`;
    if (expBtnShowAll) expBtnShowAll.classList.remove('hidden');
    if (expExactDateInput) expExactDateInput.value = state.selectedDate;
  } else {
    if (expFilterPill) expFilterPill.classList.add('hidden');
    if (expBtnShowAll) expBtnShowAll.classList.add('hidden');
    if (expExactDateInput) expExactDateInput.value = '';
  }
}

function onDetailDateChange(newDateStr) {
  if (!newDateStr) return;
  state.selectedDate = newDateStr;
  updateSelectedDateUI();
  renderHomeCalendarGrid();
  renderExpenseCalendarGrid();
}

function onExactDateFilterChange(newDateStr) {
  if (!newDateStr) {
    clearSelectedDateFilter();
    return;
  }
  state.selectedDate = newDateStr;
  state.filterBySelectedDate = true;
  updateSelectedDateUI();
  renderHomeCalendarGrid();
  loadIncomes();
}

function clearSelectedDateFilter() {
  state.filterBySelectedDate = false;
  updateSelectedDateUI();
  renderHomeCalendarGrid();
  loadIncomes();
}

function selectTodayOnCalendar() {
  const now = new Date();
  state.selectedDate = toInputDateValue(now);
  state.filterBySelectedDate = false;
  document.getElementById('home-cal-month').value = String(now.getMonth() + 1);
  document.getElementById('home-cal-year').value = String(now.getFullYear());
  updateSelectedDateUI();
  loadHomeCalendar();
  loadIncomes();
}

function changeHomeCalendarMonth(delta) {
  const monthEl = document.getElementById('home-cal-month');
  const yearEl = document.getElementById('home-cal-year');
  let m = parseInt(monthEl.value, 10) + delta;
  let y = parseInt(yearEl.value, 10);

  if (m < 1) {
    m = 12;
    y -= 1;
  } else if (m > 12) {
    m = 1;
    y += 1;
  }

  monthEl.value = String(m);
  yearEl.value = String(y);
  loadHomeCalendar();
}

async function loadHomeCalendar() {
  try {
    const month = document.getElementById('home-cal-month').value;
    const year = document.getElementById('home-cal-year').value;
    const grid = document.getElementById('home-calendar-grid');

    if (
      grid &&
      (!state.homeCalendarData ||
        String(state.homeCalendarData.period?.month) !== String(month) ||
        String(state.homeCalendarData.period?.year) !== String(year))
    ) {
      grid.innerHTML = `<div class="col-span-7">${getLoadingGifBlockHtml(`Đang tải lịch tháng ${month}/${year}`)}</div>`;
    }

    const data = await apiRequest(`/api/incomes/analytics?month=${month}&year=${year}`);
    state.homeCalendarData = data;
    saveLocalDataCache();

    const totalIncome = data.summary.totalMonth || 0;
    const totalExpense = data.summary.totalExpenseMonth || 0;
    const netBalance = data.summary.netBalanceMonth !== undefined ? data.summary.netBalanceMonth : totalIncome - totalExpense;

    const totalEl = document.getElementById('home-cal-month-total');
    if (totalEl) totalEl.textContent = formatVND(totalIncome);

    const expEl = document.getElementById('home-cal-month-expense');
    if (expEl) expEl.textContent = `-${formatVND(totalExpense)}`;

    const netEl = document.getElementById('home-cal-month-net');
    if (netEl) {
      netEl.textContent = `${netBalance >= 0 ? '+' : ''}${formatVND(netBalance)}`;
      netEl.className =
        netBalance >= 0
          ? 'font-extrabold text-indigo-600 dark:text-indigo-400 text-sm sm:text-base'
          : 'font-extrabold text-rose-600 dark:text-rose-400 text-sm sm:text-base';
    }

    const activeEl = document.getElementById('home-cal-active-days');
    if (activeEl) {
      const expEntries = data.summary.totalExpenseEntries || 0;
      activeEl.textContent = `${data.summary.activeDaysCount}/${data.period.daysInMonth} ngày có thu (${data.summary.totalEntries} thu • ${expEntries} chi)`;
    }

    renderHomeCalendarGrid();
  } catch (error) {
    console.error('Load home calendar error:', error);
  }
}

function formatShortCompactMoney(amount) {
  if (!amount || amount <= 0) return '';
  if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(1).replace('.0', '')}tr`;
  }
  if (amount >= 1000) {
    return `${Math.round(amount / 1000)}k`;
  }
  return `${amount}`;
}

function renderHomeCalendarGrid() {
  const grid = document.getElementById('home-calendar-grid');
  if (!grid || !state.homeCalendarData) return;

  const { period, dailySeries, summary } = state.homeCalendarData;
  const maxDayAmount = summary.bestDay?.total || 0;
  const todayStr = toInputDateValue(new Date());

  const cells = [];
  for (let i = 0; i < period.firstDayWeekday; i++) {
    cells.push(`<div class="h-16 sm:h-20 rounded-2xl bg-transparent"></div>`);
  }

  for (const dayItem of dailySeries) {
    const isSelected = dayItem.dateStr === state.selectedDate;
    const isToday = dayItem.dateStr === todayStr;
    const expTotal = dayItem.expenseTotal || 0;
    const expCount = dayItem.expenseCount || 0;
    const totalNotesCount = (dayItem.count || 0) + expCount;

    let level = 0;
    if (dayItem.total > 0 && maxDayAmount > 0) {
      const ratio = dayItem.total / maxDayAmount;
      if (ratio >= 0.75) level = 4;
      else if (ratio >= 0.45) level = 3;
      else if (ratio >= 0.2) level = 2;
      else level = 1;
    }

    const shortIncome = formatShortCompactMoney(dayItem.total);
    const shortExpense = formatShortCompactMoney(expTotal);

    cells.push(`
      <div onclick="onClickCalendarDay('${dayItem.dateStr}')"
           class="day-cell heatmap-lv-${level} ${
             isSelected ? 'day-cell-selected' : ''
           } h-16 sm:h-20 p-1.5 sm:p-2 rounded-2xl border flex flex-col justify-between cursor-pointer relative"
           title="Click để xem / sửa Thu nhập & Chi tiêu ngày ${formatDateVN(dayItem.dateStr)}">
        <div class="flex items-center justify-between">
          <span class="text-xs font-extrabold flex items-center gap-1">
            ${String(dayItem.day).padStart(2, '0')}
            ${
              isToday
                ? `<span class="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block" title="Hôm nay"></span>`
                : ''
            }
          </span>
          ${
            totalNotesCount > 0
              ? `<span class="text-[9px] sm:text-[10px] px-1.5 py-0.2 rounded-full bg-black/15 font-bold">${totalNotesCount} note</span>`
              : `<span class="text-[10px] opacity-35 hover:opacity-80">✏️</span>`
          }
        </div>

        <div class="text-right leading-tight space-y-0.5">
          ${
            dayItem.total > 0
              ? `<div class="text-[11px] sm:text-xs font-black tracking-tight">+${shortIncome}</div>`
              : ''
          }
          ${
            expTotal > 0
              ? `<div class="text-[10px] sm:text-[11px] font-extrabold text-rose-600 dark:text-rose-300 tracking-tight">-${shortExpense}</div>`
              : ''
          }
          ${
            dayItem.total === 0 && expTotal === 0
              ? `<span class="text-[10px] opacity-40">Trống</span>`
              : ''
          }
        </div>
      </div>
    `);
  }

  grid.innerHTML = cells.join('');
}

/**
 * Khi người dùng bấm vào BẤT KỲ NGÀY NÀO trong tháng trên Lịch:
 * 1. Chọn ngày đó làm ngày hoạt động (selectedDate)
 * 2. Lọc danh sách ghi chú bên dưới theo ngày đó
 * 3. Mở ngay hộp thoại Sổ Tay Chi Tiết Ngày (Day Inspector Modal) để sửa trực tiếp các note Thu & Chi hoặc thêm mới!
 */
async function onClickCalendarDay(dateStr) {
  state.selectedDate = dateStr;
  state.filterBySelectedDate = true;
  updateSelectedDateUI();
  renderHomeCalendarGrid();
  loadIncomes();
  openDayInspectorModal(dateStr);
}

// ==================== MODAL SỔ TAY CHI TIẾT CỦA NGÀY BẤT KỲ (#day-inspector-modal) ====================
async function openDayInspectorModal(dateStr) {
  const targetDate = dateStr || state.selectedDate;
  state.selectedDate = targetDate;
  updateSelectedDateUI();

  const modal = document.getElementById('day-inspector-modal');
  const titleEl = document.getElementById('day-modal-title');
  const subEl = document.getElementById('day-modal-subtitle');
  const addDateLabel = document.getElementById('day-modal-add-date-label');
  const container = document.getElementById('day-modal-notes-container');

  titleEl.textContent = `Sổ Tay Ngày ${formatDateVN(targetDate)}`;
  addDateLabel.textContent = formatDateVN(targetDate);
  modal.classList.remove('hidden');

  // Hiển thị tức thì (0ms) từ dữ liệu đang có trong bộ nhớ trước khi đồng bộ ngầm
  const cachedIncomes = (state.incomes || []).filter((item) => toInputDateValue(item.date) === targetDate);
  const cachedExpenses = (state.expenses || []).filter((item) => toInputDateValue(item.date) === targetDate);
  const cachedIncTotal = cachedIncomes.reduce((sum, n) => sum + (Number(n.amount) || 0), 0);
  const cachedExpTotal = cachedExpenses.reduce((sum, n) => sum + (Number(n.amount) || 0), 0);

  if (cachedIncomes.length > 0 || cachedExpenses.length > 0) {
    subEl.textContent = `Ngày ${formatDateVN(targetDate)}: Thu +${formatVND(cachedIncTotal)} (${cachedIncomes.length} khoản) • Chi -${formatVND(cachedExpTotal)} (${cachedExpenses.length} khoản)`;
    renderDayModalNotes(cachedIncomes, cachedExpenses, targetDate);
  } else {
    subEl.textContent = `Đang kiểm tra dữ liệu ngày ${formatDateVN(targetDate)}...`;
    container.innerHTML = getLoadingGifBlockHtml(`Đang tải ghi chú ngày ${formatDateVN(targetDate)}`);
  }

  try {
    const [incData, expData] = await Promise.all([
      apiRequest(`/api/incomes?date=${targetDate}`),
      apiRequest(`/api/expenses?date=${targetDate}`),
    ]);
    const incomes = incData.incomes || [];
    const expenses = expData.expenses || [];
    const totalInc = incData.totalAmount || 0;
    const totalExp = expData.totalAmount || 0;

    subEl.textContent =
      incomes.length > 0 || expenses.length > 0
        ? `Ngày ${formatDateVN(targetDate)}: Thu +${formatVND(totalInc)} (${incomes.length} khoản) • Chi -${formatVND(totalExp)} (${expenses.length} khoản)`
        : `Chưa có ghi chú Thu / Chi nào trong ngày ${formatDateVN(targetDate)}. Bạn có thể thêm nhanh bên dưới!`;

    renderDayModalNotes(incomes, expenses, targetDate);
  } catch (error) {
    if (cachedIncomes.length === 0 && cachedExpenses.length === 0) {
      container.innerHTML = `<p class="text-xs text-rose-500 p-4">${escapeHtml(error.message)}</p>`;
    }
  }
}

function renderDayModalNotes(incomes, expenses, targetDate) {
  const container = document.getElementById('day-modal-notes-container');
  if (!container) return;

  const incList = Array.isArray(incomes) ? incomes : [];
  const expList = Array.isArray(expenses) ? expenses : [];

  if (incList.length === 0 && expList.length === 0) {
    container.innerHTML = `
      <div class="p-8 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-1">
        <p class="text-sm font-bold text-slate-600 dark:text-slate-300">Ngày ${formatDateVN(targetDate)} chưa có bản ghi Thu / Chi nào</p>
        <p class="text-xs text-slate-400">Hãy gõ nhanh khoản Thu nhập hoặc Chi tiêu ở khung bên dưới để lưu cho ngày này.</p>
      </div>
    `;
    return;
  }

  const incomeCatOptions = state.categories
    .map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`)
    .join('');

  const expenseCatOptions = (state.expenseCategories || DEFAULT_EXPENSE_CATEGORIES_FALLBACK)
    .map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`)
    .join('');

  const incomeBlocks = incList.map((item) => {
    return `
      <div class="p-4 rounded-2xl bg-emerald-50/50 dark:bg-slate-800/70 border border-emerald-200/80 dark:border-slate-700/80 space-y-3">
        <div class="flex items-center justify-between text-xs text-slate-400">
          <span class="font-bold text-emerald-600 dark:text-emerald-400">💰 Khoản Thu nhập — Chỉnh sửa trực tiếp</span>
          <button type="button" onclick="deleteNoteFromDayModal('${item._id}', '${targetDate}')"
            class="text-rose-500 hover:underline font-bold flex items-center gap-1">
            <span>🗑️ Xóa khoản thu</span>
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
          <div class="sm:col-span-4">
            <label class="block text-[11px] font-bold text-slate-500 mb-1">Số tiền thu (VNĐ)</label>
            <input type="text" id="inline-amt-${item._id}" value="${formatNumberDots(item.amount)}"
              oninput="formatCurrencyInput(this)"
              class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-extrabold text-emerald-600 dark:text-emerald-400 text-xs sm:text-sm" />
          </div>

          <div class="sm:col-span-4">
            <label class="block text-[11px] font-bold text-slate-500 mb-1">Danh mục thu</label>
            <select id="inline-cat-${item._id}"
              class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-semibold">
              ${incomeCatOptions}
            </select>
          </div>

          <div class="sm:col-span-4">
            <label class="block text-[11px] font-bold text-slate-500 mb-1">Ngày ghi nhận</label>
            <input type="date" id="inline-date-${item._id}" value="${toInputDateValue(item.date)}"
              class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm" />
          </div>
        </div>

        <div class="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
          <div class="flex-1">
            <label class="block text-[11px] font-bold text-slate-500 mb-1">Nội dung ghi chú thu (Note)</label>
            <input type="text" id="inline-note-${item._id}" value="${escapeHtml(item.note)}"
              class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm" />
          </div>
          <button type="button" onclick="saveInlineDayNote('${item._id}', '${targetDate}')"
            class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shrink-0 transition">
            💾 Lưu sửa thu
          </button>
        </div>
      </div>
    `;
  });

  const expenseBlocks = expList.map((item) => {
    return `
      <div class="p-4 rounded-2xl bg-rose-50/50 dark:bg-slate-800/70 border border-rose-200/80 dark:border-slate-700/80 space-y-3">
        <div class="flex items-center justify-between text-xs text-slate-400">
          <span class="font-bold text-rose-600 dark:text-rose-400">💸 Khoản Chi tiêu — Chỉnh sửa trực tiếp</span>
          <button type="button" onclick="deleteExpenseFromDayModal('${item._id}', '${targetDate}')"
            class="text-rose-500 hover:underline font-bold flex items-center gap-1">
            <span>🗑️ Xóa khoản chi</span>
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
          <div class="sm:col-span-4">
            <label class="block text-[11px] font-bold text-slate-500 mb-1">Số tiền chi (VNĐ)</label>
            <input type="text" id="inline-exp-amt-${item._id}" value="${formatNumberDots(item.amount)}"
              oninput="formatCurrencyInput(this)"
              class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-extrabold text-rose-600 dark:text-rose-400 text-xs sm:text-sm" />
          </div>

          <div class="sm:col-span-4">
            <label class="block text-[11px] font-bold text-slate-500 mb-1">Danh mục chi</label>
            <select id="inline-exp-cat-${item._id}"
              class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-semibold">
              ${expenseCatOptions}
            </select>
          </div>

          <div class="sm:col-span-4">
            <label class="block text-[11px] font-bold text-slate-500 mb-1">Ngày chi tiêu</label>
            <input type="date" id="inline-exp-date-${item._id}" value="${toInputDateValue(item.date)}"
              class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm" />
          </div>
        </div>

        <div class="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
          <div class="flex-1">
            <label class="block text-[11px] font-bold text-slate-500 mb-1">Nội dung chi tiêu (Note)</label>
            <input type="text" id="inline-exp-note-${item._id}" value="${escapeHtml(item.note)}"
              class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm" />
          </div>
          <button type="button" onclick="saveInlineDayExpenseNote('${item._id}', '${targetDate}')"
            class="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold shrink-0 transition">
            💾 Lưu sửa chi
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = [...incomeBlocks, ...expenseBlocks].join('');

  incList.forEach((item) => {
    const sel = document.getElementById(`inline-cat-${item._id}`);
    if (sel) sel.value = item.category;
  });

  expList.forEach((item) => {
    const sel = document.getElementById(`inline-exp-cat-${item._id}`);
    if (sel) sel.value = item.category;
  });
}

async function saveInlineDayNote(noteId, currentModalDate) {
  const amount = document.getElementById(`inline-amt-${noteId}`)?.value;
  const category = document.getElementById(`inline-cat-${noteId}`)?.value;
  const date = document.getElementById(`inline-date-${noteId}`)?.value;
  const note = document.getElementById(`inline-note-${noteId}`)?.value;

  try {
    const res = await apiRequest(`/api/incomes/${noteId}`, {
      method: 'PUT',
      body: JSON.stringify({ amount, category, date, note }),
    });

    showToast('Đã lưu thay đổi khoản thu nhập thành công!', 'success');
    applyOptimisticIncomeChange('update', res.income);
    openDayInspectorModal(currentModalDate);
    if (state.activeTab === 'analytics') {
      loadMonthlyAnalytics();
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function deleteNoteFromDayModal(noteId, currentModalDate) {
  if (!confirm('Bạn có chắc chắn muốn xóa bản ghi thu nhập này?')) return;
  try {
    applyOptimisticIncomeChange('delete', null, noteId);
    openDayInspectorModal(currentModalDate);
    await apiRequest(`/api/incomes/${noteId}`, { method: 'DELETE' });
    showToast('Đã xóa ghi chú thu nhập.', 'info');
    if (state.activeTab === 'analytics') {
      loadMonthlyAnalytics();
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function saveInlineDayExpenseNote(noteId, currentModalDate) {
  const amount = document.getElementById(`inline-exp-amt-${noteId}`)?.value;
  const category = document.getElementById(`inline-exp-cat-${noteId}`)?.value;
  const date = document.getElementById(`inline-exp-date-${noteId}`)?.value;
  const note = document.getElementById(`inline-exp-note-${noteId}`)?.value;

  try {
    const res = await apiRequest(`/api/expenses/${noteId}`, {
      method: 'PUT',
      body: JSON.stringify({ amount, category, date, note }),
    });

    showToast('Đã lưu thay đổi khoản chi tiêu thành công!', 'success');
    applyOptimisticExpenseChange('update', res.expense);
    openDayInspectorModal(currentModalDate);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function deleteExpenseFromDayModal(noteId, currentModalDate) {
  if (!confirm('Bạn có chắc chắn muốn xóa khoản chi tiêu này?')) return;
  try {
    applyOptimisticExpenseChange('delete', null, noteId);
    openDayInspectorModal(currentModalDate);
    await apiRequest(`/api/expenses/${noteId}`, { method: 'DELETE' });
    showToast('Đã xóa khoản chi tiêu.', 'info');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function closeDayInspectorModal() {
  document.getElementById('day-inspector-modal').classList.add('hidden');
}

// ==================== CHUYỂN TAB CHÍNH (CÓ ANIMATION MƯỢT) ====================
function switchMainTab(tabName) {
  state.activeTab = tabName;
  const tabs = ['home', 'expenses', 'analytics', 'goals', 'profile', 'admin'];

  tabs.forEach((t) => {
    const section = document.getElementById(`main-tab-${t}`);
    const navBtn = document.getElementById(`nav-tab-${t}`);
    if (section) {
      if (t === tabName) {
        section.classList.remove('hidden', 'animate-tab-enter');
        void section.offsetWidth;
        section.classList.add('animate-tab-enter');
      } else {
        section.classList.add('hidden');
        section.classList.remove('animate-tab-enter');
      }
    }
    if (navBtn) {
      if (t === tabName) {
        navBtn.classList.add('bg-white', 'dark:bg-slate-900', 'shadow-sm', 'text-indigo-600', 'dark:text-indigo-400');
      } else {
        navBtn.classList.remove('bg-white', 'dark:bg-slate-900', 'shadow-sm', 'text-indigo-600', 'dark:text-indigo-400');
      }
    }
  });

  document.querySelectorAll('.mobile-tab-btn').forEach((btn) => {
    const isCurrent = btn.getAttribute('data-tab') === tabName;
    btn.className = isCurrent
      ? 'mobile-tab-btn px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 bg-indigo-600 text-white'
      : 'mobile-tab-btn px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 bg-slate-100 dark:bg-slate-800';
  });

  if (tabName === 'home') {
    loadHomeCalendar();
    loadIncomes();
  } else if (tabName === 'expenses') {
    loadExpenseCalendar();
    loadExpenses();
  } else if (tabName === 'analytics') {
    loadMonthlyAnalytics();
  } else if (tabName === 'goals') {
    loadGoals();
  } else if (tabName === 'admin' && state.user && state.user.role === 'admin') {
    loadAdminDashboardAll();
  }

  if (window.lucide) lucide.createIcons();
}

// ==================== SỔ TAY CHI TIÊU HẰNG NGÀY (DAILY EXPENSE TRACKER) ====================
function onExpenseDetailDateChange(newDateStr) {
  if (!newDateStr) return;
  state.selectedDate = newDateStr;
  updateSelectedDateUI();
  renderExpenseCalendarGrid();
  renderHomeCalendarGrid();
}

function onExactExpenseDateFilterChange(newDateStr) {
  if (!newDateStr) {
    clearSelectedExpenseDateFilter();
    return;
  }
  state.selectedDate = newDateStr;
  state.filterExpensesBySelectedDate = true;
  updateSelectedDateUI();
  renderExpenseCalendarGrid();
  loadExpenses();
}

function clearSelectedExpenseDateFilter() {
  state.filterExpensesBySelectedDate = false;
  updateSelectedDateUI();
  renderExpenseCalendarGrid();
  loadExpenses();
}

function selectTodayOnExpenseCalendar() {
  const now = new Date();
  state.selectedDate = toInputDateValue(now);
  state.filterExpensesBySelectedDate = false;
  const mEl = document.getElementById('exp-cal-month');
  const yEl = document.getElementById('exp-cal-year');
  if (mEl) mEl.value = String(now.getMonth() + 1);
  if (yEl) yEl.value = String(now.getFullYear());
  updateSelectedDateUI();
  loadExpenseCalendar();
  loadExpenses();
}

function changeExpenseCalendarMonth(delta) {
  const monthEl = document.getElementById('exp-cal-month');
  const yearEl = document.getElementById('exp-cal-year');
  if (!monthEl || !yearEl) return;

  let m = parseInt(monthEl.value, 10) + delta;
  let y = parseInt(yearEl.value, 10);

  if (m < 1) {
    m = 12;
    y -= 1;
  } else if (m > 12) {
    m = 1;
    y += 1;
  }

  monthEl.value = String(m);
  yearEl.value = String(y);
  loadExpenseCalendar();
}

function renderExpenseSummaryAndCalendarUI() {
  if (!state.expenseCalendarData) return;
  const { summary, period, dailySeries, categorySeries } = state.expenseCalendarData;
  if (!summary || !period) return;

  const todayTotal = summary.todayTotal ?? summary.todayExpenseTotal ?? 0;
  const todayCount = summary.todayCount ?? summary.todayExpenseCount ?? 0;
  const totalMonth = summary.totalMonth ?? summary.totalExpenseMonth ?? 0;
  const dailyAvg = summary.dailyAverage ?? 0;
  const highestDay = summary.highestDay || summary.highestExpenseDay || null;
  const totalIncomeMonth = summary.totalIncomeMonth ?? 0;
  const netBalance =
    summary.netBalanceMonth !== undefined
      ? summary.netBalanceMonth
      : summary.netBalance !== undefined
      ? summary.netBalance
      : totalIncomeMonth - totalMonth;
  const ratio =
    summary.expenseToIncomeRatio !== undefined
      ? summary.expenseToIncomeRatio
      : totalIncomeMonth > 0
      ? Number(((totalMonth / totalIncomeMonth) * 100).toFixed(1))
      : 0;

  // 1. Box 1: CHI TIÊU HÔM NAY
  const todayTotalEl = document.getElementById('exp-stat-today');
  const todayCountEl = document.getElementById('exp-stat-today-sub');
  if (todayTotalEl) todayTotalEl.textContent = todayTotal > 0 ? `-${formatVND(todayTotal)}` : '0 ₫';
  if (todayCountEl) todayCountEl.textContent = `${todayCount} khoản chi hôm nay`;

  // 2. Box 2: TỔNG CHI TIÊU THÁNG
  const monthTotalEl = document.getElementById('exp-stat-month');
  const monthCountEl = document.getElementById('exp-stat-month-sub');
  if (monthTotalEl) monthTotalEl.textContent = totalMonth > 0 ? `-${formatVND(totalMonth)}` : '0 ₫';
  if (monthCountEl) {
    monthCountEl.textContent = `${summary.totalEntries || 0} khoản chi (${summary.activeDaysCount || 0} ngày có chi)`;
  }

  // 3. Box 3: TRUNG BÌNH CHI MỖI NGÀY
  const dailyAvgEl = document.getElementById('exp-stat-daily-avg');
  const maxDayEl = document.getElementById('exp-stat-highest-day');
  if (dailyAvgEl) dailyAvgEl.textContent = dailyAvg > 0 ? `-${formatVND(dailyAvg)}` : '0 ₫';
  if (maxDayEl) {
    if (highestDay && highestDay.total > 0) {
      maxDayEl.textContent = `Ngày chi cao nhất: ${highestDay.day}/${period.month} (-${formatVND(highestDay.total)})`;
    } else {
      maxDayEl.textContent = 'Chưa phát sinh chi tiêu trong tháng';
    }
  }

  // 4. Box 4: SỐ DƯ RÒNG (THU - CHI)
  const netBalEl = document.getElementById('exp-stat-net-balance');
  const ratioEl = document.getElementById('exp-stat-net-sub');
  if (netBalEl) {
    netBalEl.textContent = `${netBalance > 0 ? '+' : ''}${formatVND(netBalance)}`;
    netBalEl.className =
      netBalance >= 0
        ? 'text-2xl font-extrabold text-emerald-600 dark:text-emerald-400'
        : 'text-2xl font-extrabold text-rose-600 dark:text-rose-400';
  }
  if (ratioEl) {
    ratioEl.textContent =
      totalIncomeMonth > 0
        ? `Tổng thu: ${formatVND(totalIncomeMonth)} • Đã chi ${ratio}%`
        : `Tổng thu: 0 ₫ • Đã trừ chi: -${formatVND(totalMonth)}`;
  }

  // Thanh tóm tắt Lịch Chi Tiêu
  const calMonthTotalEl = document.getElementById('exp-cal-month-total');
  const calActiveDaysEl = document.getElementById('exp-cal-active-days');
  if (calMonthTotalEl) calMonthTotalEl.textContent = totalMonth > 0 ? `-${formatVND(totalMonth)}` : '0 ₫';
  if (calActiveDaysEl) {
    calActiveDaysEl.textContent = `${summary.activeDaysCount || 0}/${period.daysInMonth} ngày có chi tiêu (${
      summary.totalEntries || 0
    } khoản chi)`;
  }

  renderExpenseCalendarGrid();
  renderExpenseCharts(dailySeries, categorySeries);
}

async function loadExpenseCalendar() {
  try {
    const monthEl = document.getElementById('exp-cal-month');
    const yearEl = document.getElementById('exp-cal-year');
    if (!monthEl || !yearEl) return;

    const month = monthEl.value;
    const year = yearEl.value;
    const grid = document.getElementById('expense-calendar-grid');

    if (
      grid &&
      (!state.expenseCalendarData ||
        String(state.expenseCalendarData.period?.month) !== String(month) ||
        String(state.expenseCalendarData.period?.year) !== String(year))
    ) {
      grid.innerHTML = `<div class="col-span-7">${getLoadingGifBlockHtml(`Đang tải lịch chi tiêu tháng ${month}/${year}`)}</div>`;
    }

    const data = await apiRequest(`/api/expenses/analytics?month=${month}&year=${year}`);
    state.expenseCalendarData = data;
    saveLocalDataCache();

    renderExpenseSummaryAndCalendarUI();
  } catch (error) {
    console.error('Load expense calendar error:', error);
  }
}

function renderExpenseCalendarGrid() {
  const grid = document.getElementById('expense-calendar-grid');
  if (!grid || !state.expenseCalendarData) return;

  const { period, dailySeries, summary } = state.expenseCalendarData;
  const highestDay = summary.highestDay || summary.highestExpenseDay || null;
  const maxDayExpense = highestDay?.total || 0;
  const todayStr = toInputDateValue(new Date());

  const cells = [];
  for (let i = 0; i < period.firstDayWeekday; i++) {
    cells.push(`<div class="h-16 sm:h-20 rounded-2xl bg-transparent"></div>`);
  }

  for (const dayItem of dailySeries) {
    const isSelected = dayItem.dateStr === state.selectedDate;
    const isToday = dayItem.dateStr === todayStr;

    let level = 0;
    if (dayItem.total > 0 && maxDayExpense > 0) {
      const ratio = dayItem.total / maxDayExpense;
      if (ratio >= 0.75) level = 4;
      else if (ratio >= 0.45) level = 3;
      else if (ratio >= 0.2) level = 2;
      else level = 1;
    }

    const shortExpense = formatShortCompactMoney(dayItem.total);

    cells.push(`
      <div onclick="onClickExpenseCalendarDay('${dayItem.dateStr}')"
           class="day-cell expense-heatmap-lv-${level} ${
             isSelected ? 'day-cell-selected' : ''
           } h-16 sm:h-20 p-2 rounded-2xl border flex flex-col justify-between cursor-pointer relative"
           title="Click để xem / sửa hoặc thêm khoản chi tiêu ngày ${formatDateVN(dayItem.dateStr)}">
        <div class="flex items-center justify-between">
          <span class="text-xs font-extrabold flex items-center gap-1">
            ${String(dayItem.day).padStart(2, '0')}
            ${
              isToday
                ? `<span class="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block" title="Hôm nay"></span>`
                : ''
            }
          </span>
          ${
            dayItem.count > 0
              ? `<span class="text-[10px] px-1.5 py-0.2 rounded-full bg-black/15 font-bold">${dayItem.count} chi</span>`
              : `<span class="text-[10px] opacity-35 hover:opacity-80">✏️</span>`
          }
        </div>

        <div class="text-right">
          ${
            dayItem.total > 0
              ? `<span class="text-xs font-black tracking-tight">-${shortExpense}</span>`
              : `<span class="text-[10px] opacity-40">0đ</span>`
          }
        </div>
      </div>
    `);
  }

  grid.innerHTML = cells.join('');
}

async function onClickExpenseCalendarDay(dateStr) {
  state.selectedDate = dateStr;
  state.filterExpensesBySelectedDate = true;
  updateSelectedDateUI();
  renderExpenseCalendarGrid();
  loadExpenses();
  openDayInspectorModal(dateStr);
}

function renderExpenseCharts(dailySeries, categorySeries) {
  const dailyCanvas = document.getElementById('dailyExpenseChart');
  const pieCanvas = document.getElementById('expenseCategoryPieChart');
  if (!dailyCanvas || !pieCanvas) return;

  const isDark = document.documentElement.classList.contains('dark');
  const textColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.2)';

  if (state.charts.expenseDaily) state.charts.expenseDaily.destroy();
  state.charts.expenseDaily = new Chart(dailyCanvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: (dailySeries || []).map((d) => `Ng.${d.day}`),
      datasets: [
        {
          label: 'Chi tiêu ngày (VNĐ)',
          data: (dailySeries || []).map((d) => d.total),
          backgroundColor: '#f43f5e',
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (ctx) => ` -${formatVND(ctx.raw)}` },
        },
      },
      scales: {
        x: { ticks: { color: textColor, font: { size: 10 } }, grid: { display: false } },
        y: {
          ticks: {
            color: textColor,
            font: { size: 10 },
            callback: (val) => (val >= 1000000 ? `${val / 1000000}tr` : val >= 1000 ? `${val / 1000}k` : val),
          },
          grid: { color: gridColor },
        },
      },
    },
  });

  if (state.charts.expenseCategoryPie) state.charts.expenseCategoryPie.destroy();
  const labels = (categorySeries || []).length > 0 ? categorySeries.map((c) => c.category) : ['Chưa có chi tiêu'];
  const values = (categorySeries || []).length > 0 ? categorySeries.map((c) => c.total) : [1];
  const colors =
    (categorySeries || []).length > 0 ? categorySeries.map((c) => getExpenseCategoryColor(c.category)) : ['#cbd5e1'];

  state.charts.expenseCategoryPie = new Chart(pieCanvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: isDark ? '#0f172a' : '#ffffff',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: textColor, font: { size: 11 }, padding: 12 },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ((categorySeries || []).length > 0 ? ` ${ctx.label}: -${formatVND(ctx.raw)}` : ' Chưa có dữ liệu'),
          },
        },
      },
    },
  });

  const breakdownListEl = document.getElementById('expense-category-breakdown-list');
  if (breakdownListEl) {
    if (!categorySeries || categorySeries.length === 0) {
      breakdownListEl.innerHTML = `<p class="text-xs text-slate-400 text-center">Chưa phát sinh chi tiêu trong tháng</p>`;
    } else {
      breakdownListEl.innerHTML = categorySeries
        .map((c) => {
          const color = getExpenseCategoryColor(c.category);
          return `
            <div class="flex items-center justify-between text-xs">
              <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full inline-block" style="background-color: ${color}"></span>
                <span class="font-semibold">${escapeHtml(c.category)}</span>
                <span class="text-slate-400">(${c.percentage}%)</span>
              </div>
              <span class="font-bold text-rose-600 dark:text-rose-400">-${formatVND(c.total)}</span>
            </div>
          `;
        })
        .join('');
    }
  }
}

function fillQuickExpenseTemplate(templateText) {
  const input = document.getElementById('quick-expense-input');
  if (!input) return;
  input.value = templateText;
  input.focus();
  clientPreviewSmartExpenseSyntax(templateText);
}

function clientPreviewSmartExpenseSyntax(rawLine) {
  const previewEl = document.getElementById('quick-expense-parse-preview');
  if (!previewEl) return;

  if (!rawLine || !rawLine.trim()) {
    previewEl.innerHTML = `<span class="text-slate-500 dark:text-slate-400">Hỗ trợ: <code class="font-mono-code text-rose-600 dark:text-rose-400">35k</code>, <code class="font-mono-code text-rose-600 dark:text-rose-400">150k</code>, <code class="font-mono-code text-rose-600 dark:text-rose-400">1tr2</code> + nội dung chi + <code class="font-mono-code text-amber-600">#Danh_mục</code> (tự nhận diện Ăn uống, Di chuyển, Mua sắm...)</span>`;
    return;
  }

  let text = rawLine.trim();
  let tag = null;
  const tagMatch = text.match(/#([^\s#]+)/i);
  if (tagMatch) {
    tag = tagMatch[1].replace(/_/g, ' ').trim();
    text = text.replace(tagMatch[0], '').trim();
  }

  const tokens = text.split(/\s+/);
  let amount = null;
  let amountIdx = -1;

  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i].toLowerCase();
    let val = null;

    const splitMil = tk.match(/^(\d+)(?:tr|trieu|triệu|m|cu|củ)(\d+)$/i);
    const mil = tk.match(/^(\d+(?:[.,]\d+)?)(?:tr|trieu|triệu|m|cu|củ)$/i);
    const thou = tk.match(/^(\d+(?:[.,]\d+)?)(?:k|ng|nghin|nghìn)$/i);
    const dots = /^\d{1,3}([.,]\d{3})+(?:đ|d|vnd)?$/i.test(tk);
    const plain = tk.match(/^(\d{4,12})(?:đ|d|vnd)?$/i);

    if (splitMil) {
      val = Math.round((parseInt(splitMil[1], 10) + parseInt(splitMil[2], 10) / Math.pow(10, splitMil[2].length)) * 1000000);
    } else if (mil) {
      val = Math.round(parseFloat(mil[1].replace(',', '.')) * 1000000);
    } else if (thou) {
      val = Math.round(parseFloat(thou[1].replace(',', '.')) * 1000);
    } else if (dots) {
      val = parseInt(tk.replace(/[^\d]/g, ''), 10);
    } else if (plain) {
      val = parseInt(plain[1], 10);
    }

    if (val && val > 0) {
      amount = val;
      amountIdx = i;
      break;
    }
  }

  const note = tokens.filter((_, idx) => idx !== amountIdx).join(' ').trim() || 'Chi tiêu trong ngày';
  const displayCat = tag || 'Tự động phân loại chi tiêu';

  if (!amount) {
    previewEl.innerHTML = `<span class="text-amber-600 dark:text-amber-400">⚠️ Hãy nhập số tiền chi kèm đơn vị (VD: 35k, 150k, 1tr2)...</span>`;
    return;
  }

  previewEl.innerHTML = `
    <div class="flex flex-wrap items-center gap-2">
      <span class="px-2.5 py-1 rounded-lg bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 font-extrabold">
        -${formatVND(amount)}
      </span>
      <span class="px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-semibold">
        #${escapeHtml(displayCat)}
      </span>
      <span class="text-slate-600 dark:text-slate-300 truncate max-w-xs">
        📝 "${escapeHtml(note)}" (${formatDateVN(state.selectedDate)})
      </span>
    </div>
  `;
}

function debounceLoadExpenses() {
  clearTimeout(expenseSearchTimer);
  expenseSearchTimer = setTimeout(() => {
    loadExpenses();
  }, 250);
}

function resetExpenseFilters() {
  const searchEl = document.getElementById('exp-filter-search');
  const catEl = document.getElementById('exp-filter-category');
  if (searchEl) searchEl.value = '';
  if (catEl) catEl.value = 'all';
  state.filterExpensesBySelectedDate = false;
  updateSelectedDateUI();
  loadExpenses();
}

async function loadExpenses() {
  try {
    const search = document.getElementById('exp-filter-search')?.value || '';
    const category = document.getElementById('exp-filter-category')?.value || 'all';
    const listEl = document.getElementById('expense-notes-list');

    if (listEl && (!state.expenses || state.expenses.length === 0)) {
      listEl.innerHTML = getLoadingGifBlockHtml('Đang tải danh sách ghi chú chi tiêu');
    }

    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (category && category !== 'all') params.set('category', category);
    if (state.filterExpensesBySelectedDate && state.selectedDate) {
      params.set('date', state.selectedDate);
    }

    const data = await apiRequest(`/api/expenses?${params.toString()}`);
    state.expenses = data.expenses || [];
    saveLocalDataCache();

    const countBadge = document.getElementById('exp-notes-count-badge');
    const totalBadge = document.getElementById('exp-notes-total-badge');
    if (countBadge) countBadge.textContent = data.count || 0;
    if (totalBadge) totalBadge.textContent = `-${formatVND(data.totalAmount || 0)}`;

    renderExpenseNotesList();
  } catch (error) {
    console.error('Load expenses error:', error);
  }
}

/**
 * Cập nhật giao diện tức thì (Optimistic UI Update 0ms) khi thêm/sửa/xóa khoản chi tiêu:
 * - Cập nhật ngay danh sách Chi tiêu, 4 thẻ KPI Chi tiêu, Lịch Chi Tiêu
 * - Trừ ngay lập tức vào Tổng thu nhập / Mục tiêu tài chính đang ghim và Lịch Trang Chủ
 */
function applyOptimisticExpenseChange(action, expenseObj, deletedId = null) {
  let prevItem = null;
  if (action === 'add' && expenseObj) {
    state.expenses = [expenseObj, ...(state.expenses || []).filter((e) => e._id !== expenseObj._id)];
  } else if (action === 'update' && expenseObj) {
    prevItem = (state.expenses || []).find((e) => e._id === expenseObj._id) || null;
    state.expenses = (state.expenses || []).map((e) => (e._id === expenseObj._id ? expenseObj : e));
  } else if (action === 'delete' && deletedId) {
    prevItem = (state.expenses || []).find((e) => e._id === deletedId) || null;
    state.expenses = (state.expenses || []).filter((e) => e._id !== deletedId);
  }

  const totalAmount = (state.expenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const countBadge = document.getElementById('exp-notes-count-badge');
  const totalBadge = document.getElementById('exp-notes-total-badge');
  if (countBadge) countBadge.textContent = (state.expenses || []).length;
  if (totalBadge) totalBadge.textContent = `-${formatVND(totalAmount)}`;

  renderExpenseNotesList();

  // Cập nhật tức thì (0ms) trên 4 KPI Cards & Lịch Chi Tiêu
  if (state.expenseCalendarData && Array.isArray(state.expenseCalendarData.dailySeries)) {
    const series = state.expenseCalendarData.dailySeries;
    const summary = state.expenseCalendarData.summary || {};
    const period = state.expenseCalendarData.period || {};
    const todayStr = toInputDateValue(new Date());

    if (action === 'add' && expenseObj) {
      const dStr = toInputDateValue(expenseObj.date);
      const cell = series.find((d) => d.dateStr === dStr);
      if (cell) {
        cell.total += Number(expenseObj.amount) || 0;
        cell.count += 1;
      }
      if (dStr === todayStr) {
        summary.todayTotal = (summary.todayTotal || 0) + (Number(expenseObj.amount) || 0);
        summary.todayCount = (summary.todayCount || 0) + 1;
      }
    } else if (action === 'delete' && prevItem) {
      const dStr = toInputDateValue(prevItem.date);
      const cell = series.find((d) => d.dateStr === dStr);
      if (cell) {
        cell.total = Math.max(0, cell.total - (Number(prevItem.amount) || 0));
        cell.count = Math.max(0, cell.count - 1);
      }
      if (dStr === todayStr) {
        summary.todayTotal = Math.max(0, (summary.todayTotal || 0) - (Number(prevItem.amount) || 0));
        summary.todayCount = Math.max(0, (summary.todayCount || 0) - 1);
      }
    } else if (action === 'update' && expenseObj) {
      if (prevItem) {
        const oldDStr = toInputDateValue(prevItem.date);
        const oldCell = series.find((d) => d.dateStr === oldDStr);
        if (oldCell) {
          oldCell.total = Math.max(0, oldCell.total - (Number(prevItem.amount) || 0));
          oldCell.count = Math.max(0, oldCell.count - 1);
        }
        if (oldDStr === todayStr) {
          summary.todayTotal = Math.max(0, (summary.todayTotal || 0) - (Number(prevItem.amount) || 0));
        }
      }
      const newDStr = toInputDateValue(expenseObj.date);
      const newCell = series.find((d) => d.dateStr === newDStr);
      if (newCell) {
        newCell.total += Number(expenseObj.amount) || 0;
        newCell.count += 1;
      }
      if (newDStr === todayStr) {
        summary.todayTotal = (summary.todayTotal || 0) + (Number(expenseObj.amount) || 0);
      }
    }

    const totalExpMonth = series.reduce((s, d) => s + d.total, 0);
    const totalEntries = series.reduce((s, d) => s + d.count, 0);
    const activeDaysCount = series.filter((d) => d.total > 0).length;
    const elapsedDays = Math.max(1, period.elapsedDays || 1);

    let highestDay = { day: null, dateStr: null, total: 0, count: 0 };
    for (const d of series) {
      if (d.total > highestDay.total) {
        highestDay = { day: d.day, dateStr: d.dateStr, total: d.total, count: d.count };
      }
    }

    summary.totalMonth = totalExpMonth;
    summary.totalExpenseMonth = totalExpMonth;
    summary.totalEntries = totalEntries;
    summary.activeDaysCount = activeDaysCount;
    summary.dailyAverage = Math.round(totalExpMonth / elapsedDays);
    summary.highestDay = highestDay;
    summary.highestExpenseDay = highestDay;
    summary.netBalanceMonth = (summary.totalIncomeMonth || 0) - totalExpMonth;
    summary.netBalance = summary.netBalanceMonth;
    summary.expenseToIncomeRatio =
      summary.totalIncomeMonth > 0 ? Number(((totalExpMonth / summary.totalIncomeMonth) * 100).toFixed(1)) : 0;

    renderExpenseSummaryAndCalendarUI();
  }

  // Trừ tức thì vào Tổng thu nhập & Mục tiêu tài chính đang ghim (0ms)
  let deltaExpense = 0;
  if (action === 'add' && expenseObj) {
    deltaExpense = Number(expenseObj.amount) || 0;
  } else if (action === 'delete' && prevItem) {
    deltaExpense = -(Number(prevItem.amount) || 0);
  } else if (action === 'update' && expenseObj) {
    deltaExpense = (Number(expenseObj.amount) || 0) - (Number(prevItem?.amount) || 0);
  }

  if (deltaExpense !== 0 && state.pinnedGoal && state.pinnedGoal.metrics) {
    const m = state.pinnedGoal.metrics;
    m.notepadExpenseAmount = Math.max(0, (m.notepadExpenseAmount || 0) + deltaExpense);
    m.notepadNetAmount = (m.notepadIncomeAmount || 0) - m.notepadExpenseAmount;
    m.currentAmount = Math.max(0, (m.savingsWithInterest || 0) + m.notepadNetAmount);
    m.remainingAmount = Math.max(0, (m.targetAmount || 0) - m.currentAmount);
    const rawPct = m.targetAmount > 0 ? (m.currentAmount / m.targetAmount) * 100 : 0;
    m.progressPercent = Number(Math.min(100, rawPct).toFixed(1));
    m.overAchievedPercent = Number(rawPct.toFixed(1));
    renderHeroGoalBanner();
    renderGoalsGrid();
  }

  saveLocalDataCache();

  // Đồng bộ nền toàn bộ Lịch Chi Tiêu, Lịch Trang Chủ, Tổng Thu Nhập và Mục Tiêu Tài Chính
  Promise.all([loadExpenseCalendar(), loadExpenses(), loadHomeCalendar(), loadIncomes(), loadGoals()]).catch(() => {});
}

function renderExpenseNotesList() {
  const listEl = document.getElementById('expense-notes-list');
  if (!listEl) return;

  if (!state.expenses || state.expenses.length === 0) {
    listEl.innerHTML = `
      <div class="p-10 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-400 text-sm space-y-2">
        <p class="font-semibold text-slate-600 dark:text-slate-300">Chưa có khoản chi tiêu nào được ghi nhận</p>
        <p class="text-xs">Hãy gõ nhanh chi tiêu hằng ngày (VD: <code class="font-mono-code text-rose-500">45k Ăn phở sáng</code>) ở khung bên phải!</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = state.expenses
    .map((item, idx) => {
      const catColor = getExpenseCategoryColor(item.category);
      const itemDateStr = toInputDateValue(item.date);
      const delayMs = Math.min(idx * 25, 200);
      return `
        <div style="animation-delay: ${delayMs}ms" class="animate-item-in group p-3.5 rounded-2xl bg-slate-50/90 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 transition flex items-center justify-between gap-3 shadow-sm">
          <div class="flex items-start gap-3 min-w-0">
            <div class="w-2.5 h-10 rounded-full shrink-0 mt-0.5" style="background-color: ${catColor}"></div>
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-extrabold text-rose-600 dark:text-rose-400 text-sm sm:text-base">
                  -${formatVND(item.amount)}
                </span>
                <span class="text-[11px] font-bold px-2.5 py-0.5 rounded-full text-white" style="background-color: ${catColor}">
                  #${escapeHtml(item.category)}
                </span>
                <button type="button" onclick="openDayInspectorModal('${itemDateStr}')"
                  class="text-[11px] text-rose-600 dark:text-rose-400 hover:underline font-mono-code font-bold"
                  title="Bấm để mở Sổ tay ngày ${formatDateVN(item.date)}">
                  📅 ${formatDateVN(item.date)}
                </button>
              </div>
              <p class="text-xs sm:text-sm text-slate-700 dark:text-slate-200 font-medium mt-1 break-words">
                ${escapeHtml(item.note)}
              </p>
            </div>
          </div>

          <div class="flex items-center gap-1.5 shrink-0">
            <button onclick="openEditExpenseModal('${item._id}')" title="Sửa khoản chi này"
              class="px-2.5 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/70 hover:bg-rose-100 text-rose-600 dark:text-rose-300 text-xs font-bold flex items-center gap-1 transition">
              <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
              <span class="hidden sm:inline">Sửa</span>
            </button>
            <button onclick="deleteExpenseNote('${item._id}')" title="Xóa khoản chi"
              class="p-2 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/60 text-slate-400 hover:text-rose-600 transition">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      `;
    })
    .join('');

  if (window.lucide) lucide.createIcons();
}

function openEditExpenseModal(id) {
  const item = (state.expenses || []).find((e) => e._id === id);
  if (!item) return;

  document.getElementById('edit-expense-id').value = item._id;
  document.getElementById('edit-expense-amount').value = formatNumberDots(item.amount);
  document.getElementById('edit-expense-category').value = item.category;
  document.getElementById('edit-expense-date').value = toInputDateValue(item.date);
  document.getElementById('edit-expense-note').value = item.note;

  document.getElementById('edit-expense-modal').classList.remove('hidden');
}

function closeEditExpenseModal() {
  document.getElementById('edit-expense-modal').classList.add('hidden');
}

async function deleteExpenseNote(id) {
  if (!confirm('Bạn có chắc chắn muốn xóa khoản chi tiêu này?')) return;
  try {
    applyOptimisticExpenseChange('delete', null, id);
    const res = await apiRequest(`/api/expenses/${id}`, { method: 'DELETE' });
    if (res.streak && state.user) {
      state.user.streakCount = res.streak.streakCount;
      renderUserHeaderAndProfile();
    }
    showToast('Đã xóa khoản chi tiêu.', 'info');
  } catch (error) {
    showToast(error.message, 'error');
    loadExpenses();
  }
}

function exportExpenseData(format = 'csv', onlySelectedMonth = false) {
  let url = `/api/expenses/export?format=${format}`;
  if (onlySelectedMonth) {
    const month = document.getElementById('exp-cal-month')?.value;
    const year = document.getElementById('exp-cal-year')?.value;
    if (month && year) url += `&month=${month}&year=${year}`;
  }
  window.open(url, '_blank');
}

// ==================== HERO GOAL TRACKER & PACE CALCULATOR ====================
async function loadGoals() {
  try {
    const data = await apiRequest('/api/goals');
    state.goals = data.goals || [];
    state.pinnedGoal = data.pinnedGoal || null;
    saveLocalDataCache();

    renderHeroGoalBanner();
    renderGoalsGrid();

    if (
      state.pinnedGoal &&
      state.pinnedGoal.metrics &&
      state.pinnedGoal.metrics.progressPercent >= 100 &&
      !state.celebratedGoalIds.has(state.pinnedGoal._id)
    ) {
      state.celebratedGoalIds.add(state.pinnedGoal._id);
      triggerGoalConfetti();
    }
  } catch (error) {
    console.error('Load goals error:', error);
  }
}

function renderHeroGoalBanner() {
  const container = document.getElementById('hero-goal-container');
  if (!container) return;

  if (!state.pinnedGoal) {
    container.innerHTML = `
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold mb-2">
            🎯 MỤC TIÊU TÀI CHÍNH & TIẾT KIỆM LÃI SUẤT (HERO GOAL TRACKER)
          </span>
          <h2 class="text-xl sm:text-2xl font-extrabold">Thiết lập mục tiêu & Quản lý tiền tiết kiệm sinh lời</h2>
          <p class="text-xs sm:text-sm text-slate-300 mt-1">
            Nhập số tiền bạn đã làm được (VD: Gửi 200 triệu lãi 8% trong 6 tháng = 1,3333%/tháng) kết hợp sổ tay thu nhập hàng ngày. Khi gửi thêm hoặc sửa hạn, hệ thống tự động tính tiếp lãi!
          </p>
        </div>
        <button onclick="openGoalModal()"
          class="px-5 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold text-xs sm:text-sm shadow-lg transition shrink-0">
          + Tạo Mục Tiêu & Tính Lãi
        </button>
      </div>
    `;
    return;
  }

  const g = state.pinnedGoal;
  const m = g.metrics;

  const badgeColors = {
    completed: 'bg-emerald-400 text-slate-950',
    ahead: 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/40',
    on_track: 'bg-indigo-500/25 text-indigo-200 border border-indigo-400/40',
    behind: 'bg-amber-500/25 text-amber-300 border border-amber-400/40',
    failed: 'bg-rose-500/25 text-rose-300 border border-rose-400/40',
  };

  const barGradient =
    m.progressPercent >= 100
      ? 'from-emerald-400 via-teal-400 to-cyan-400'
      : m.paceStatus === 'behind'
      ? 'from-amber-400 via-orange-500 to-rose-500'
      : 'from-indigo-400 via-emerald-400 to-teal-300';

  const hasSavings = (m.savingsPrincipal || 0) > 0;
  const rateText = String(m.monthlyInterestRateDisplay || 0).replace('.', ',');
  const scheduleRows = (m.monthlySchedule || [])
    .map(
      (row) => `
      <tr class="border-b border-white/10 last:border-none text-xs">
        <td class="py-2 px-2.5 font-bold text-indigo-200">${escapeHtml(row.label)}</td>
        <td class="py-2 px-2.5 text-slate-300">${formatDateVN(row.date)}</td>
        <td class="py-2 px-2.5 text-emerald-300 font-semibold">${String(row.ratePercent).replace('.', ',')}%</td>
        <td class="py-2 px-2.5 text-emerald-400 font-extrabold">+${formatVND(row.interestAmount)}</td>
        <td class="py-2 px-2.5 text-amber-300 font-bold">+${formatVND(row.cumulativeInterest)}</td>
        <td class="py-2 px-2.5 text-white font-extrabold text-right">${formatVND(row.totalWithPrincipal)}</td>
      </tr>
    `
    )
    .join('');

  container.innerHTML = `
    <div class="relative z-10 space-y-4">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div class="flex flex-wrap items-center gap-2 mb-1.5">
            <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/10 text-indigo-200 text-xs font-bold">
              📌 MỤC TIÊU ĐANG GHIM
            </span>
            <span class="px-3 py-1 rounded-full text-xs font-extrabold ${
              badgeColors[m.paceStatus] || badgeColors.on_track
            }">
              ${escapeHtml(m.paceBadge)}
            </span>
            <span class="text-xs text-slate-300">
              📅 ${formatDateVN(g.startDate)} → ${formatDateVN(g.endDate)} (${m.activeDurationMonths} tháng)
            </span>
          </div>
          <h2 class="text-2xl sm:text-3xl font-extrabold tracking-tight">${escapeHtml(g.title)}</h2>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          ${
            m.progressPercent >= 100
              ? `<button onclick="triggerGoalConfetti()" class="px-3.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold transition">
                   🎆 Bắn pháo hoa
                 </button>`
              : ''
          }
          <button onclick="openEditGoalModal('${g._id}')"
            class="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-extrabold shadow-md transition flex items-center gap-1.5">
            💰 Gửi thêm tiền / Gia hạn lãi
          </button>
          <button onclick="switchMainTab('goals')"
            class="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition">
            Quản lý mục tiêu (${state.goals.length})
          </button>
        </div>
      </div>

      <div class="bg-white/5 p-4 sm:p-5 rounded-2xl border border-white/10 space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <p class="text-xs uppercase tracking-wider text-indigo-200 font-semibold">
              Tổng tài sản thực tế (Tiền gốc + Lãi tiết kiệm + Thu nhập sổ tay − Chi tiêu)
            </p>
            <div class="flex items-baseline gap-2 mt-0.5">
              <span class="text-2xl sm:text-3xl font-extrabold text-emerald-400">${formatVND(m.currentAmount)}</span>
              <span class="text-sm text-slate-300">/ Mục tiêu ${formatVND(m.targetAmount)}</span>
            </div>
          </div>
          <div class="text-right">
            <span class="text-3xl font-black text-white">${m.overAchievedPercent}%</span>
            <p class="text-xs text-slate-300">Hoàn thành mục tiêu</p>
          </div>
        </div>

        <div class="w-full h-4 rounded-full bg-slate-800 overflow-hidden p-0.5">
          <div class="h-full rounded-full bg-gradient-to-r ${barGradient} progress-glow transition-all duration-700"
               style="width: ${Math.min(100, m.progressPercent)}%"></div>
        </div>

        <!-- Bóc tách 3 nguồn tiền cấu thành Mục tiêu -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-400/30">
            <div class="flex items-center justify-between">
              <p class="text-[11px] text-emerald-200 font-bold uppercase">💰 Tiền đã làm được (Tiết kiệm gốc)</p>
              <button onclick="openEditGoalModal('${g._id}')" class="text-[11px] text-emerald-300 underline hover:text-white font-bold">+Cộng thêm</button>
            </div>
            <p class="text-lg font-extrabold text-white mt-1">${formatVND(m.savingsPrincipal || 0)}</p>
            <p class="text-[11px] text-emerald-200/90 mt-0.5">
              ${
                hasSavings
                  ? `Gửi lãi ${m.interestRate}% / ${m.interestTermMonths} tháng (${rateText}%/tháng)`
                  : 'Bấm "Gửi thêm tiền" để nhập số tiền đã làm được'
              }
            </p>
          </div>

          <div class="p-3.5 rounded-xl bg-amber-500/15 border border-amber-400/30">
            <div class="flex items-center justify-between">
              <p class="text-[11px] text-amber-200 font-bold uppercase">📈 Tiền lãi tự động mỗi tháng</p>
              <span class="text-[11px] px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-200 font-bold">${rateText}% / tháng</span>
            </div>
            <p class="text-lg font-extrabold text-amber-300 mt-1">
              +${formatVND(m.monthlyInterestAmount || 0)} <span class="text-xs font-semibold text-amber-100">/ tháng</span>
            </p>
            <p class="text-[11px] text-amber-100/90 mt-0.5">
              Tổng lãi ${m.activeDurationMonths} tháng: <b class="text-white">+${formatVND(m.totalProjectedInterest || 0)}</b>
              (Đã tích lũy: +${formatVND(m.accruedInterestToDate || 0)})
            </p>
          </div>

          <div class="p-3.5 rounded-xl bg-indigo-500/15 border border-indigo-400/30">
            <div class="flex items-center justify-between">
              <p class="text-[11px] text-indigo-200 font-bold uppercase">📝 Sổ tay Thu − Chi trong kỳ</p>
              <span class="text-[11px] text-indigo-200 font-semibold">${m.entryCount || 0} thu • ${
                m.expenseEntryCount || 0
              } chi</span>
            </div>
            <p class="text-lg font-extrabold ${
              (m.notepadIncomeAmount || 0) - (m.notepadExpenseAmount || 0) >= 0 ? 'text-indigo-300' : 'text-rose-300'
            } mt-1">
              ${(m.notepadIncomeAmount || 0) - (m.notepadExpenseAmount || 0) >= 0 ? '+' : ''}${formatVND(
                (m.notepadIncomeAmount || 0) - (m.notepadExpenseAmount || 0)
              )}
            </p>
            <p class="text-[11px] text-indigo-200/90 mt-0.5">
              Thu: <b class="text-emerald-300">+${formatVND(m.notepadIncomeAmount || 0)}</b> • Chi: <b class="text-rose-300">-${formatVND(
                m.notepadExpenseAmount || 0
              )}</b>
            </p>
          </div>
        </div>

        ${
          hasSavings && (m.monthlySchedule || []).length > 0
            ? `
            <div class="pt-1">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <button type="button" onclick="toggleGoalMonthlySchedule('hero-schedule-${g._id}')"
                  class="inline-flex items-center gap-1.5 text-xs font-extrabold text-emerald-300 hover:text-emerald-200 bg-white/10 px-3 py-1.5 rounded-xl transition">
                  <span>📊 Xem bảng tính lãi chi tiết từng tháng (${m.activeDurationMonths} tháng • +${formatVND(m.monthlyInterestAmount)}/tháng)</span>
                </button>
                <span class="text-[11px] text-slate-300">
                  💡 Mẹo: Khi gửi thêm tiền hoặc sửa Ngày đáo hạn, bảng lãi dưới đây tự động nối tiếp các tháng mới!
                </span>
              </div>

              <div id="hero-schedule-${g._id}" class="mt-3 overflow-x-auto rounded-xl bg-slate-950/60 border border-white/10 p-3">
                <table class="w-full text-left border-collapse">
                  <thead>
                    <tr class="border-b border-white/15 text-[11px] uppercase text-slate-400">
                      <th class="py-1.5 px-2.5">Kỳ tháng</th>
                      <th class="py-1.5 px-2.5">Ngày nhận lãi</th>
                      <th class="py-1.5 px-2.5">Lãi suất tháng</th>
                      <th class="py-1.5 px-2.5">Tiền lãi tháng đó</th>
                      <th class="py-1.5 px-2.5">Lãi cộng dồn</th>
                      <th class="py-1.5 px-2.5 text-right">Tổng gốc + Lãi</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${scheduleRows}
                  </tbody>
                </table>
              </div>
            </div>
          `
            : ''
        }

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          <div class="p-3 rounded-xl bg-white/5 border border-white/10">
            <p class="text-[11px] text-slate-300 uppercase">Số tiền còn thiếu</p>
            <p class="text-base font-extrabold text-amber-300 mt-0.5">${formatVND(m.remainingAmount)}</p>
          </div>
          <div class="p-3 rounded-xl bg-white/5 border border-white/10">
            <p class="text-[11px] text-slate-300 uppercase">Số ngày còn lại</p>
            <p class="text-base font-extrabold text-white mt-0.5">${m.remainingDays} ngày <span class="text-xs font-normal text-slate-300">(trên ${m.totalDays} ngày)</span></p>
          </div>
          <div class="p-3 rounded-xl bg-indigo-500/20 border border-indigo-400/30 sm:col-span-2">
            <div class="flex items-center justify-between">
              <p class="text-[11px] text-indigo-200 font-bold uppercase">⚡ MÁY TÍNH TỐC ĐỘ KIẾM TIỀN (PACE CALCULATOR)</p>
              <span class="text-[11px] text-emerald-300 font-semibold">Hiện tại: ${formatVND(m.actualDailyPace)}/ngày</span>
            </div>
            <p class="text-xs sm:text-sm font-bold text-white mt-1">
              ${escapeHtml(m.paceMessage)}
            </p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function toggleGoalMonthlySchedule(elementId) {
  const el = document.getElementById(elementId);
  if (el) {
    el.classList.toggle('hidden');
  }
}

function renderGoalsGrid() {
  const grid = document.getElementById('goals-grid-list');
  if (!grid) return;

  if (!state.goals || state.goals.length === 0) {
    grid.innerHTML = `
      <div class="md:col-span-2 bg-white dark:bg-slate-900 rounded-3xl p-10 text-center border border-slate-200 dark:border-slate-800">
        <p class="text-slate-500 text-sm mb-4">Bạn chưa tạo mục tiêu tài chính nào.</p>
        <button onclick="openGoalModal()" class="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold">+ Tạo Mục Tiêu & Tính Lãi Tiết Kiệm</button>
      </div>
    `;
    return;
  }

  grid.innerHTML = state.goals
    .map((g) => {
      const m = g.metrics;
      const rateText = String(m.monthlyInterestRateDisplay || 0).replace('.', ',');
      return `
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-6 border ${
          g.isPinned
            ? 'border-2 border-indigo-500 shadow-lg shadow-indigo-500/10'
            : 'border-slate-200 dark:border-slate-800 shadow-sm'
        } flex flex-col justify-between space-y-4">
          <div>
            <div class="flex items-center justify-between gap-2 mb-2">
              <div class="flex items-center gap-2">
                ${
                  g.isPinned
                    ? `<span class="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 text-[11px] font-bold">📌 Đang ghim Trang chủ</span>`
                    : `<button onclick="pinGoal('${g._id}')" class="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 text-slate-600 dark:text-slate-300 text-[11px] font-semibold transition">Ghim lên trang chủ</button>`
                }
                <span class="px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold">
                  ${escapeHtml(m.paceBadge)}
                </span>
              </div>
              <div class="flex items-center gap-1">
                <button onclick="openEditGoalModal('${g._id}')" class="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/70 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1" title="Gửi thêm tiền hoặc sửa hạn tính lãi">
                  💰 Sửa / Gia hạn
                </button>
                <button onclick="deleteGoal('${g._id}')" class="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50 text-rose-500" title="Xóa mục tiêu">
                  <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
              </div>
            </div>

            <h3 class="font-extrabold text-lg">${escapeHtml(g.title)}</h3>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Thời hạn: ${formatDateVN(g.startDate)} → ${formatDateVN(g.endDate)} (${m.activeDurationMonths} tháng • Còn ${m.remainingDays} ngày)
            </p>

            <div class="mt-4">
              <div class="flex items-baseline justify-between text-xs mb-1.5">
                <span class="font-bold text-emerald-600 dark:text-emerald-400 text-base">${formatVND(m.currentAmount)}</span>
                <span class="text-slate-500">/ ${formatVND(m.targetAmount)} (${m.overAchievedPercent}%)</span>
              </div>
              <div class="w-full h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div class="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500" style="width: ${Math.min(
                  100,
                  m.progressPercent
                )}%"></div>
              </div>
            </div>
          </div>

          <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800 text-xs space-y-1.5">
            <div class="flex justify-between">
              <span class="text-slate-500">💰 Tiền đã làm được (Tiết kiệm gốc):</span>
              <b class="text-emerald-600 dark:text-emerald-400">${formatVND(m.savingsPrincipal || 0)}</b>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">📈 Lãi mỗi tháng (${rateText}%/tháng):</span>
              <b class="text-amber-600 dark:text-amber-400">+${formatVND(m.monthlyInterestAmount || 0)} / tháng</b>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">✨ Tổng lãi (${m.activeDurationMonths} tháng):</span>
              <b class="text-emerald-600 dark:text-emerald-400">+${formatVND(m.totalProjectedInterest || 0)}</b>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">📝 Thu nhập Sổ tay cộng thêm:</span>
              <b class="text-indigo-600 dark:text-indigo-400">+${formatVND(m.notepadIncomeAmount || 0)}</b>
            </div>
            <div class="flex justify-between">
              <span class="text-slate-500">💸 Chi tiêu Sổ tay đã trừ:</span>
              <b class="text-rose-600 dark:text-rose-400">-${formatVND(m.notepadExpenseAmount || 0)}</b>
            </div>
            <div class="border-t border-slate-200 dark:border-slate-700 pt-1.5 flex justify-between">
              <span class="text-slate-500">Còn thiếu để đạt mục tiêu:</span>
              <b class="text-rose-600 dark:text-rose-400">${formatVND(m.remainingAmount)}</b>
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  if (window.lucide) lucide.createIcons();
}

// ==================== SMART NOTEPAD & LỊCH SỬ GHI CHÚ ====================
function clientPreviewSmartSyntax(rawLine) {
  const previewEl = document.getElementById('quick-parse-preview');
  if (!rawLine || !rawLine.trim()) {
    previewEl.innerHTML = `<span class="text-slate-500 dark:text-slate-400">Hỗ trợ: <code class="font-mono-code text-indigo-600 dark:text-indigo-400">500k</code>, <code class="font-mono-code text-indigo-600 dark:text-indigo-400">1tr5</code>, <code class="font-mono-code text-indigo-600 dark:text-indigo-400">2.5tr</code> + nội dung + <code class="font-mono-code text-emerald-600">#Danh_mục</code></span>`;
    return;
  }

  let text = rawLine.trim();
  let tag = null;
  const tagMatch = text.match(/#([^\s#]+(?:\s+hàng|\s+tư)?)/i);
  if (tagMatch) {
    tag = tagMatch[1].replace(/_/g, ' ').trim();
    text = text.replace(tagMatch[0], '').trim();
  }

  const tokens = text.split(/\s+/);
  let amount = null;
  let amountIdx = -1;

  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i].toLowerCase();
    let val = null;

    const splitMil = tk.match(/^(\d+)(?:tr|trieu|triệu|m|cu|củ)(\d+)$/i);
    const mil = tk.match(/^(\d+(?:[.,]\d+)?)(?:tr|trieu|triệu|m|cu|củ)$/i);
    const thou = tk.match(/^(\d+(?:[.,]\d+)?)(?:k|ng|nghin|nghìn)$/i);
    const dots = /^\d{1,3}([.,]\d{3})+(?:đ|d|vnd)?$/i.test(tk);
    const plain = tk.match(/^(\d{4,12})(?:đ|d|vnd)?$/i);

    if (splitMil) {
      val = Math.round((parseInt(splitMil[1], 10) + parseInt(splitMil[2], 10) / Math.pow(10, splitMil[2].length)) * 1000000);
    } else if (mil) {
      val = Math.round(parseFloat(mil[1].replace(',', '.')) * 1000000);
    } else if (thou) {
      val = Math.round(parseFloat(thou[1].replace(',', '.')) * 1000);
    } else if (dots) {
      val = parseInt(tk.replace(/[^\d]/g, ''), 10);
    } else if (plain) {
      val = parseInt(plain[1], 10);
    }

    if (val && val > 0) {
      amount = val;
      amountIdx = i;
      break;
    }
  }

  const note = tokens.filter((_, idx) => idx !== amountIdx).join(' ').trim() || 'Thu nhập trong ngày';
  const displayCat = tag || 'Tự động phân loại';

  if (!amount) {
    previewEl.innerHTML = `<span class="text-amber-600 dark:text-amber-400">⚠️ Hãy nhập số tiền kèm đơn vị (VD: 500k, 1tr5, 2.5tr)...</span>`;
    return;
  }

  previewEl.innerHTML = `
    <div class="flex flex-wrap items-center gap-2">
      <span class="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-extrabold">
        +${formatVND(amount)}
      </span>
      <span class="px-2.5 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-semibold">
        #${escapeHtml(displayCat)}
      </span>
      <span class="text-slate-600 dark:text-slate-300 truncate max-w-xs">
        📝 "${escapeHtml(note)}" (${formatDateVN(state.selectedDate)})
      </span>
    </div>
  `;
}

function debounceLoadIncomes() {
  clearTimeout(incomeSearchTimer);
  incomeSearchTimer = setTimeout(() => {
    loadIncomes();
  }, 250);
}

function resetIncomeFilters() {
  document.getElementById('filter-search').value = '';
  document.getElementById('filter-category').value = 'all';
  state.filterBySelectedDate = false;
  updateSelectedDateUI();
  loadIncomes();
}

function updateIncomeListTotalBadge(grossAmount, expenseAmount) {
  const badgeEl = document.getElementById('notes-total-badge');
  if (!badgeEl) return;
  const gross = Number(grossAmount) || 0;
  const exp = Number(expenseAmount) || 0;
  const net = gross - exp;

  if (exp > 0) {
    badgeEl.innerHTML = `${formatVND(net)} <span class="text-slate-400 font-normal">(Thu: +${formatVND(
      gross
    )} • Đã trừ chi: <span class="text-rose-500 font-bold">-${formatVND(exp)}</span>)</span>`;
  } else {
    badgeEl.textContent = formatVND(gross);
  }
}

async function loadIncomes() {
  try {
    const search = document.getElementById('filter-search')?.value || '';
    const category = document.getElementById('filter-category')?.value || 'all';
    const listEl = document.getElementById('income-notes-list');

    if (listEl && (!state.incomes || state.incomes.length === 0)) {
      listEl.innerHTML = getLoadingGifBlockHtml('Đang tải danh sách ghi chú thu nhập');
    }

    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (category && category !== 'all') params.set('category', category);
    if (state.filterBySelectedDate && state.selectedDate) {
      params.set('date', state.selectedDate);
    }

    const data = await apiRequest(`/api/incomes?${params.toString()}`);
    state.incomes = data.incomes || [];
    saveLocalDataCache();

    document.getElementById('notes-count-badge').textContent = data.count || 0;
    const totalExp =
      data.totalExpenseAmount !== undefined
        ? data.totalExpenseAmount
        : (state.expenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    updateIncomeListTotalBadge(data.totalAmount || 0, totalExp);

    renderIncomeNotesList();
  } catch (error) {
    console.error('Load incomes error:', error);
  }
}

/**
 * Cập nhật giao diện tức thì (Optimistic UI Update 0ms) khi thêm/sửa/xóa khoản thu nhập
 */
function applyOptimisticIncomeChange(action, incomeObj, deletedId = null) {
  let prevItem = null;
  if (action === 'add' && incomeObj) {
    state.incomes = [incomeObj, ...state.incomes.filter((i) => i._id !== incomeObj._id)];
  } else if (action === 'update' && incomeObj) {
    prevItem = state.incomes.find((i) => i._id === incomeObj._id) || null;
    state.incomes = state.incomes.map((i) => (i._id === incomeObj._id ? incomeObj : i));
  } else if (action === 'delete' && deletedId) {
    prevItem = state.incomes.find((i) => i._id === deletedId) || null;
    state.incomes = state.incomes.filter((i) => i._id !== deletedId);
  }

  const totalAmount = state.incomes.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const totalExp = (state.expenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  document.getElementById('notes-count-badge').textContent = state.incomes.length;
  updateIncomeListTotalBadge(totalAmount, totalExp);
  renderIncomeNotesList();

  // Cập nhật tức thì ô Lịch Tháng (Home Calendar) trong bộ nhớ
  if (state.homeCalendarData && Array.isArray(state.homeCalendarData.dailySeries)) {
    const series = state.homeCalendarData.dailySeries;
    if (action === 'add' && incomeObj) {
      const dStr = toInputDateValue(incomeObj.date);
      const cell = series.find((d) => d.dateStr === dStr);
      if (cell) {
        cell.total += Number(incomeObj.amount) || 0;
        cell.count += 1;
        cell.items = cell.items || [];
        cell.items.push({
          id: incomeObj._id,
          amount: incomeObj.amount,
          category: incomeObj.category,
          note: incomeObj.note,
        });
      }
    } else if (action === 'delete' && prevItem) {
      const dStr = toInputDateValue(prevItem.date);
      const cell = series.find((d) => d.dateStr === dStr);
      if (cell) {
        cell.total = Math.max(0, cell.total - (Number(prevItem.amount) || 0));
        cell.count = Math.max(0, cell.count - 1);
      }
    } else if (action === 'update' && incomeObj) {
      if (prevItem) {
        const oldCell = series.find((d) => d.dateStr === toInputDateValue(prevItem.date));
        if (oldCell) {
          oldCell.total = Math.max(0, oldCell.total - (Number(prevItem.amount) || 0));
          oldCell.count = Math.max(0, oldCell.count - 1);
        }
      }
      const newCell = series.find((d) => d.dateStr === toInputDateValue(incomeObj.date));
      if (newCell) {
        newCell.total += Number(incomeObj.amount) || 0;
        newCell.count += 1;
      }
    }
    const totalMonth = series.reduce((s, d) => s + d.total, 0);
    const totalEntries = series.reduce((s, d) => s + d.count, 0);
    const activeDaysCount = series.filter((d) => d.total > 0).length;
    const totalExpMonth = state.homeCalendarData.summary?.totalExpenseMonth || 0;
    const netBal = totalMonth - totalExpMonth;
    state.homeCalendarData.summary.totalMonth = totalMonth;
    state.homeCalendarData.summary.netBalanceMonth = netBal;
    state.homeCalendarData.summary.totalEntries = totalEntries;
    state.homeCalendarData.summary.activeDaysCount = activeDaysCount;
    document.getElementById('home-cal-month-total').textContent = formatVND(totalMonth);
    if (document.getElementById('home-cal-month-net')) {
      document.getElementById('home-cal-month-net').textContent = `${netBal >= 0 ? '+' : ''}${formatVND(netBal)}`;
    }
    document.getElementById('home-cal-active-days').textContent = `${activeDaysCount}/${state.homeCalendarData.period.daysInMonth} ngày có thu (${totalEntries} note)`;
    renderHomeCalendarGrid();
  }

  saveLocalDataCache();

  // Đồng bộ nền không chặn thao tác của người dùng
  Promise.all([loadHomeCalendar(), loadIncomes(), loadExpenseCalendar(), loadGoals()]).catch(() => {});
}

function renderIncomeNotesList() {
  const listEl = document.getElementById('income-notes-list');
  if (!listEl) return;

  if (!state.incomes || state.incomes.length === 0) {
    listEl.innerHTML = `
      <div class="p-10 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-400 text-sm space-y-2">
        <p class="font-semibold text-slate-600 dark:text-slate-300">Chưa có ghi chú thu nhập nào được lưu</p>
        <p class="text-xs">Hãy nhập thu nhập thực tế của bạn ở khung bên phải hoặc bấm vào một ngày bất kỳ trên Lịch Tháng!</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = state.incomes
    .map((item, idx) => {
      const catColor = getCategoryColor(item.category);
      const itemDateStr = toInputDateValue(item.date);
      const delayMs = Math.min(idx * 25, 200);
      return `
        <div style="animation-delay: ${delayMs}ms" class="animate-item-in group p-3.5 rounded-2xl bg-slate-50/90 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 transition flex items-center justify-between gap-3 shadow-sm">
          <div class="flex items-start gap-3 min-w-0">
            <div class="w-2.5 h-10 rounded-full shrink-0 mt-0.5" style="background-color: ${catColor}"></div>
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-extrabold text-emerald-600 dark:text-emerald-400 text-sm sm:text-base">
                  +${formatVND(item.amount)}
                </span>
                <span class="text-[11px] font-bold px-2.5 py-0.5 rounded-full text-white" style="background-color: ${catColor}">
                  #${escapeHtml(item.category)}
                </span>
                <button type="button" onclick="openDayInspectorModal('${itemDateStr}')"
                  class="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-mono-code font-bold"
                  title="Bấm để mở Sổ tay ngày ${formatDateVN(item.date)}">
                  📅 ${formatDateVN(item.date)}
                </button>
              </div>
              <p class="text-xs sm:text-sm text-slate-700 dark:text-slate-200 font-medium mt-1 break-words">
                ${escapeHtml(item.note)}
              </p>
            </div>
          </div>

          <div class="flex items-center gap-1.5 shrink-0">
            <button onclick="openEditIncomeModal('${item._id}')" title="Sửa ghi chú này"
              class="px-2.5 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-300 text-xs font-bold flex items-center gap-1 transition">
              <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
              <span class="hidden sm:inline">Sửa</span>
            </button>
            <button onclick="deleteIncomeNote('${item._id}')" title="Xóa ghi chú"
              class="p-2 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/60 text-slate-400 hover:text-rose-600 transition">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      `;
    })
    .join('');

  if (window.lucide) lucide.createIcons();
}

function openEditIncomeModal(id) {
  const item = state.incomes.find((i) => i._id === id);
  if (!item) return;

  document.getElementById('edit-income-id').value = item._id;
  document.getElementById('edit-income-amount').value = formatNumberDots(item.amount);
  document.getElementById('edit-income-category').value = item.category;
  document.getElementById('edit-income-date').value = toInputDateValue(item.date);
  document.getElementById('edit-income-note').value = item.note;

  document.getElementById('edit-income-modal').classList.remove('hidden');
}

function closeEditIncomeModal() {
  document.getElementById('edit-income-modal').classList.add('hidden');
}

async function deleteIncomeNote(id) {
  if (!confirm('Bạn có chắc chắn muốn xóa bản ghi thu nhập này?')) return;
  try {
    // Xóa tức thì trên giao diện trước, gọi API song song
    applyOptimisticIncomeChange('delete', null, id);
    const res = await apiRequest(`/api/incomes/${id}`, { method: 'DELETE' });
    if (res.streak && state.user) {
      state.user.streakCount = res.streak.streakCount;
      renderUserHeaderAndProfile();
    }
    showToast('Đã xóa bản ghi thu nhập.', 'info');
  } catch (error) {
    showToast(error.message, 'error');
    loadIncomes();
  }
}

function exportPersonalData(format = 'csv', onlySelectedMonth = false) {
  let url = `/api/incomes/export?format=${format}`;
  if (onlySelectedMonth) {
    const month = document.getElementById('analytics-month').value;
    const year = document.getElementById('analytics-year').value;
    url += `&month=${month}&year=${year}`;
  }
  window.open(url, '_blank');
}

// ==================== THỐNG KÊ THEO THÁNG & CALENDAR HEATMAP ====================
async function loadMonthlyAnalytics() {
  try {
    const month = document.getElementById('analytics-month').value;
    const year = document.getElementById('analytics-year').value;

    const data = await apiRequest(`/api/incomes/analytics?month=${month}&year=${year}`);
    const { summary, period, dailySeries, yearlySeries, categorySeries, streak } = data;

    if (streak && state.user) {
      state.user.streakCount = streak.streakCount;
      renderUserHeaderAndProfile();
    }

    const totalExpMonth = summary.totalExpenseMonth || 0;
    const netIncomeMonth =
      summary.netBalanceMonth !== undefined ? summary.netBalanceMonth : summary.totalMonth - totalExpMonth;

    document.getElementById('stat-total-month').textContent = formatVND(netIncomeMonth);
    document.getElementById('stat-total-entries').textContent =
      totalExpMonth > 0
        ? `Tổng thu: +${formatVND(summary.totalMonth)} • Đã trừ chi: -${formatVND(totalExpMonth)}`
        : `${summary.totalEntries} khoản thu nhập (${summary.activeDaysCount} ngày có thu nhập)`;

    document.getElementById('stat-daily-avg').textContent = formatVND(summary.dailyAverage);
    document.getElementById('stat-active-days').textContent = `Trung bình trên ${period.elapsedDays} ngày trong tháng ${period.month}/${period.year}`;

    if (summary.bestDay && summary.bestDay.total > 0) {
      document.getElementById('stat-best-day-amount').textContent = formatVND(summary.bestDay.total);
      document.getElementById('stat-best-day-date').textContent = `Ngày ${summary.bestDay.day}/${period.month}/${period.year} (${summary.bestDay.count} bản ghi)`;
    } else {
      document.getElementById('stat-best-day-amount').textContent = '0 ₫';
      document.getElementById('stat-best-day-date').textContent = 'Chưa phát sinh thu nhập';
    }

    const growthEl = document.getElementById('stat-growth-percent');
    const sign = summary.growthPercent > 0 ? '+' : '';
    growthEl.textContent = `${sign}${summary.growthPercent}%`;
    growthEl.className =
      summary.growthPercent >= 0
        ? 'text-2xl font-extrabold text-emerald-600 dark:text-emerald-400'
        : 'text-2xl font-extrabold text-rose-600 dark:text-rose-400';
    document.getElementById('stat-prev-month').textContent = `Tháng trước: ${formatVND(summary.prevMonthTotal)}`;

    document.getElementById('daily-chart-subtitle').textContent = `Tháng ${period.month}/${period.year}`;
    document.getElementById('yearly-chart-subtitle').textContent = `Năm ${period.year}`;

    renderDailyAndYearlyCharts(dailySeries, yearlySeries);
    renderCategoryPieChart(categorySeries);
    renderCalendarHeatmap(period, dailySeries, summary.bestDay?.total || 0);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderDailyAndYearlyCharts(dailySeries, yearlySeries) {
  const isDark = document.documentElement.classList.contains('dark');
  const textColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.2)';

  const dailyCtx = document.getElementById('dailyIncomeChart').getContext('2d');
  if (state.charts.daily) state.charts.daily.destroy();

  state.charts.daily = new Chart(dailyCtx, {
    type: 'bar',
    data: {
      labels: dailySeries.map((d) => `Ng.${d.day}`),
      datasets: [
        {
          label: 'Thu nhập ngày (VNĐ)',
          data: dailySeries.map((d) => d.total),
          backgroundColor: '#6366f1',
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (ctx) => ` ${formatVND(ctx.raw)}` },
        },
      },
      scales: {
        x: { ticks: { color: textColor, font: { size: 10 } }, grid: { display: false } },
        y: {
          ticks: {
            color: textColor,
            font: { size: 10 },
            callback: (val) => (val >= 1000000 ? `${val / 1000000}tr` : val >= 1000 ? `${val / 1000}k` : val),
          },
          grid: { color: gridColor },
        },
      },
    },
  });

  const yearlyCtx = document.getElementById('yearlyIncomeChart').getContext('2d');
  if (state.charts.yearly) state.charts.yearly.destroy();

  state.charts.yearly = new Chart(yearlyCtx, {
    type: 'bar',
    data: {
      labels: yearlySeries.map((m) => `T${m.month}`),
      datasets: [
        {
          label: 'Tổng thu nhập tháng (VNĐ)',
          data: yearlySeries.map((m) => m.total),
          backgroundColor: '#10b981',
          borderRadius: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (ctx) => ` ${formatVND(ctx.raw)}` },
        },
      },
      scales: {
        x: { ticks: { color: textColor, font: { size: 11 } }, grid: { display: false } },
        y: {
          ticks: {
            color: textColor,
            font: { size: 10 },
            callback: (val) => (val >= 1000000 ? `${val / 1000000}tr` : val),
          },
          grid: { color: gridColor },
        },
      },
    },
  });
}

function renderCategoryPieChart(categorySeries) {
  const pieCtx = document.getElementById('categoryPieChart').getContext('2d');
  const listEl = document.getElementById('category-breakdown-list');

  if (state.charts.category) state.charts.category.destroy();

  if (!categorySeries || categorySeries.length === 0) {
    state.charts.category = new Chart(pieCtx, {
      type: 'doughnut',
      data: {
        labels: ['Chưa có dữ liệu'],
        datasets: [{ data: [1], backgroundColor: ['#cbd5e1'] }],
      },
      options: { responsive: true, maintainAspectRatio: false },
    });
    listEl.innerHTML = `<p class="text-xs text-slate-400 text-center">Chưa có thu nhập trong tháng này</p>`;
    return;
  }

  const colors = categorySeries.map((c) => getCategoryColor(c.category));

  state.charts.category = new Chart(pieCtx, {
    type: 'doughnut',
    data: {
      labels: categorySeries.map((c) => c.category),
      datasets: [
        {
          data: categorySeries.map((c) => c.total),
          backgroundColor: colors,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: { label: (ctx) => ` ${ctx.label}: ${formatVND(ctx.raw)}` },
        },
      },
    },
  });

  listEl.innerHTML = categorySeries
    .map((item) => {
      const color = getCategoryColor(item.category);
      return `
        <div class="flex items-center justify-between text-xs">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full inline-block" style="background-color: ${color}"></span>
            <span class="font-semibold">${escapeHtml(item.category)}</span>
            <span class="text-slate-400">(${item.count})</span>
          </div>
          <div class="text-right">
            <span class="font-bold">${formatVND(item.total)}</span>
            <span class="ml-1.5 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-bold text-[10px]">${item.percentage}%</span>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderCalendarHeatmap(period, dailySeries, maxDayAmount) {
  const grid = document.getElementById('calendar-heatmap-grid');
  if (!grid) return;

  const cells = [];

  for (let i = 0; i < period.firstDayWeekday; i++) {
    cells.push(`<div class="h-20 rounded-2xl bg-transparent"></div>`);
  }

  for (const dayItem of dailySeries) {
    let level = 0;
    if (dayItem.total > 0 && maxDayAmount > 0) {
      const ratio = dayItem.total / maxDayAmount;
      if (ratio >= 0.75) level = 4;
      else if (ratio >= 0.45) level = 3;
      else if (ratio >= 0.2) level = 2;
      else level = 1;
    }

    const shortMoney =
      dayItem.total >= 1000000
        ? `${(dayItem.total / 1000000).toFixed(1).replace('.0', '')}tr`
        : dayItem.total >= 1000
        ? `${Math.round(dayItem.total / 1000)}k`
        : dayItem.total > 0
        ? `${dayItem.total}`
        : '';

    const tooltipNotes = dayItem.items
      .map((n) => `• +${formatVND(n.amount)} [${n.category}]: ${n.note}`)
      .join('\n');

    cells.push(`
      <div onclick="openDayInspectorModal('${dayItem.dateStr}')"
           class="day-cell heatmap-lv-${level} h-20 p-2.5 rounded-2xl border flex flex-col justify-between cursor-pointer"
           title="${
             dayItem.total > 0
               ? `Ngày ${dayItem.day}/${period.month}: ${formatVND(dayItem.total)} (Bấm để sửa note)\n${escapeHtml(tooltipNotes)}`
               : `Ngày ${dayItem.day}/${period.month}: Bấm để thêm ghi chú thu nhập`
           }">
        <div class="flex items-center justify-between">
          <span class="text-xs font-extrabold">${String(dayItem.day).padStart(2, '0')}</span>
          ${
            dayItem.count > 0
              ? `<span class="text-[10px] px-1.5 py-0.2 rounded-full bg-black/15 font-bold">${dayItem.count} note</span>`
              : `<span class="text-[10px] opacity-35">✏️</span>`
          }
        </div>
        <div class="text-right">
          ${
            dayItem.total > 0
              ? `<span class="text-xs sm:text-sm font-black tracking-tight">+${shortMoney}</span>`
              : `<span class="text-[10px] opacity-40">—</span>`
          }
        </div>
      </div>
    `);
  }

  grid.innerHTML = cells.join('');
}

// ==================== MODAL MỤC TIÊU TÀI CHÍNH & LÃI SUẤT TIẾT KIỆM ====================
function addMonthsToDateStr(dateStr, monthsToAdd) {
  const base = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(base.getTime())) return toInputDateValue(new Date());
  const d = new Date(base.getFullYear(), base.getMonth() + Number(monthsToAdd || 0), base.getDate());
  return toInputDateValue(d);
}

function calcMonthsDiffClient(startStr, endStr) {
  if (!startStr || !endStr) return 0;
  const s = new Date(startStr);
  const e = new Date(endStr);
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e <= s) return 0;

  const yearMonthDiff = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  const dayDiff = e.getDate() - s.getDate();

  if (Math.abs(dayDiff) <= 2 && yearMonthDiff >= 1) {
    return yearMonthDiff;
  }
  const exactMonths = yearMonthDiff + dayDiff / 30;
  return Math.max(0, Number(exactMonths.toFixed(2)));
}

function openGoalModal() {
  const now = new Date();
  const todayStr = toInputDateValue(now);
  const sixMonthsLaterStr = addMonthsToDateStr(todayStr, 6);

  document.getElementById('goal-modal-title').textContent = 'Tạo Mục Tiêu Tài Chính & Tính Lãi Tiết Kiệm';
  document.getElementById('goal-id').value = '';
  document.getElementById('goal-title').value = '';
  document.getElementById('goal-target-amount').value = '';
  document.getElementById('goal-savings-principal').value = '';
  document.getElementById('goal-interest-rate').value = '8';
  document.getElementById('goal-interest-term').value = '6';
  document.getElementById('goal-additional-deposit').value = '';
  document.getElementById('goal-additional-deposit-wrap').classList.add('hidden');

  document.getElementById('goal-start-date').value = todayStr;
  document.getElementById('goal-end-date').value = sixMonthsLaterStr;
  document.getElementById('goal-is-pinned').checked = true;

  previewGoalInterestCalculator();
  document.getElementById('goal-modal').classList.remove('hidden');
}

function openEditGoalModal(goalId) {
  const goal = state.goals.find((g) => g._id === goalId);
  if (!goal) return;

  document.getElementById('goal-modal-title').textContent = 'Sửa Mục Tiêu / Gửi Thêm Tiền / Gia Hạn Lãi';
  document.getElementById('goal-id').value = goal._id;
  document.getElementById('goal-title').value = goal.title;
  document.getElementById('goal-target-amount').value = formatNumberDots(goal.targetAmount);
  document.getElementById('goal-savings-principal').value =
    goal.savingsPrincipal > 0 ? formatNumberDots(goal.savingsPrincipal) : '';
  document.getElementById('goal-interest-rate').value =
    goal.interestRate !== undefined ? goal.interestRate : 8;
  document.getElementById('goal-interest-term').value =
    goal.interestTermMonths !== undefined ? goal.interestTermMonths : 6;
  document.getElementById('goal-additional-deposit').value = '';
  document.getElementById('goal-additional-deposit-wrap').classList.remove('hidden');

  document.getElementById('goal-start-date').value = toInputDateValue(goal.startDate);
  document.getElementById('goal-end-date').value = toInputDateValue(goal.endDate);
  document.getElementById('goal-is-pinned').checked = Boolean(goal.isPinned);

  previewGoalInterestCalculator();
  document.getElementById('goal-modal').classList.remove('hidden');
}

function applySampleSavingsPreset() {
  const titleEl = document.getElementById('goal-title');
  const targetEl = document.getElementById('goal-target-amount');
  if (!titleEl.value.trim()) {
    titleEl.value = 'Tiết kiệm sinh lời & Mục tiêu tài chính';
  }
  if (!targetEl.value.trim()) {
    targetEl.value = formatNumberDots(250000000);
  }
  document.getElementById('goal-savings-principal').value = formatNumberDots(200000000);
  document.getElementById('goal-interest-rate').value = '8';
  document.getElementById('goal-interest-term').value = '6';

  const startStr = document.getElementById('goal-start-date').value || toInputDateValue(new Date());
  document.getElementById('goal-start-date').value = startStr;
  document.getElementById('goal-end-date').value = addMonthsToDateStr(startStr, 6);

  previewGoalInterestCalculator();
}

function setGoalTermFromStart(months) {
  const startStr = document.getElementById('goal-start-date').value || toInputDateValue(new Date());
  document.getElementById('goal-start-date').value = startStr;
  document.getElementById('goal-end-date').value = addMonthsToDateStr(startStr, months);
  previewGoalInterestCalculator();
}

function extendGoalEndDateByMonths(monthsToAdd) {
  const currentEndStr =
    document.getElementById('goal-end-date').value ||
    document.getElementById('goal-start-date').value ||
    toInputDateValue(new Date());
  document.getElementById('goal-end-date').value = addMonthsToDateStr(currentEndStr, monthsToAdd);
  previewGoalInterestCalculator();
}

function previewGoalInterestCalculator() {
  const previewBox = document.getElementById('goal-interest-live-preview');
  if (!previewBox) return;

  const basePrincipal = parseCurrencyString(document.getElementById('goal-savings-principal')?.value || '0');
  const additionalDeposit = parseCurrencyString(document.getElementById('goal-additional-deposit')?.value || '0');
  const totalPrincipal = basePrincipal + additionalDeposit;

  const interestRate = Math.max(0, parseFloat(document.getElementById('goal-interest-rate')?.value) || 0);
  const interestTermMonths = Math.max(1, parseFloat(document.getElementById('goal-interest-term')?.value) || 6);

  const startStr = document.getElementById('goal-start-date')?.value;
  const endStr = document.getElementById('goal-end-date')?.value;
  const activeMonths = calcMonthsDiffClient(startStr, endStr);

  const monthlyRatePercent = interestRate / interestTermMonths;
  const monthlyRateDisplay = Number(monthlyRatePercent.toFixed(4)).toString().replace('.', ',');
  const monthlyInterestAmount = Math.round(totalPrincipal * (monthlyRatePercent / 100));
  const totalProjectedInterest = Math.round(totalPrincipal * (monthlyRatePercent / 100) * activeMonths);
  const totalPrincipalAndInterest = totalPrincipal + totalProjectedInterest;

  if (totalPrincipal <= 0) {
    previewBox.innerHTML = `
      <div class="text-slate-500 dark:text-slate-400">
        💡 Hãy nhập <b>Số tiền đã làm được (Tiết kiệm gốc)</b> hoặc bấm nút <b>"Điền mẫu: Gửi 200 triệu — Lãi 8% / 6 tháng"</b> để xem bảng tính lãi tự động từng tháng.
      </div>
    `;
    return;
  }

  previewBox.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200/70 dark:border-emerald-800/60 pb-1.5">
      <span class="font-extrabold text-emerald-700 dark:text-emerald-300">
        🧮 Công thức tính lãi: ${interestRate}% / ${interestTermMonths} tháng = <span class="underline">${monthlyRateDisplay}% / tháng</span>
      </span>
      <span class="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold text-[11px]">
        Kỳ hạn đang chọn: ${activeMonths} tháng
      </span>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
      <div class="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/70">
        <p class="text-[10px] uppercase text-slate-400 font-bold">Tổng gốc tiết kiệm</p>
        <p class="font-extrabold text-slate-800 dark:text-white text-sm">${formatVND(totalPrincipal)}</p>
        ${
          additionalDeposit > 0
            ? `<p class="text-[10px] text-indigo-500 font-semibold">(Đã cộng thêm +${formatVND(additionalDeposit)})</p>`
            : ''
        }
      </div>
      <div class="p-2 rounded-lg bg-amber-50/80 dark:bg-amber-950/40">
        <p class="text-[10px] uppercase text-amber-600 dark:text-amber-400 font-bold">Tiền lãi mỗi tháng (${monthlyRateDisplay}%)</p>
        <p class="font-extrabold text-amber-600 dark:text-amber-400 text-sm">+${formatVND(monthlyInterestAmount)} / tháng</p>
      </div>
      <div class="p-2 rounded-lg bg-emerald-50/90 dark:bg-emerald-950/50">
        <p class="text-[10px] uppercase text-emerald-600 dark:text-emerald-400 font-bold">Tổng lãi sau ${activeMonths} tháng</p>
        <p class="font-extrabold text-emerald-600 dark:text-emerald-400 text-sm">+${formatVND(totalProjectedInterest)}</p>
        <p class="text-[10px] text-slate-500">Gốc + Lãi: <b>${formatVND(totalPrincipalAndInterest)}</b></p>
      </div>
    </div>
  `;
}

function closeGoalModal() {
  document.getElementById('goal-modal').classList.add('hidden');
}

async function pinGoal(goalId) {
  try {
    const res = await apiRequest(`/api/goals/${goalId}/pin`, { method: 'PATCH' });
    showToast(res.message, 'success');
    await loadGoals();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function deleteGoal(goalId) {
  if (!confirm('Bạn có chắc chắn muốn xóa mục tiêu tài chính này?')) return;
  try {
    await apiRequest(`/api/goals/${goalId}`, { method: 'DELETE' });
    showToast('Đã xóa mục tiêu tài chính.', 'info');
    await loadGoals();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ==================== HỒ SƠ CÁ NHÂN ====================
function selectPresetAvatar(flaticonUrl) {
  const url = flaticonUrl && flaticonUrl.startsWith('http')
    ? flaticonUrl
    : 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';
  document.getElementById('profile-avatar').value = url;
  document.getElementById('profile-preview-avatar').src = url;
}

// ==================== PHÂN HỆ QUẢN TRỊ VIÊN (ADMIN DASHBOARD) ====================
async function loadAdminDashboardAll() {
  await Promise.all([
    loadAdminOverview(),
    loadAdminUsers(),
    loadAdminAnnouncements(),
    loadAdminSettings(),
  ]);
}

async function loadAdminOverview() {
  try {
    const data = await apiRequest('/api/admin/overview');
    const { stats, monthlySeries } = data;

    document.getElementById('admin-kpi-users').textContent = `${stats.activeUsers} / ${stats.totalUsers}`;
    document.getElementById('admin-kpi-users-sub').textContent = `+${stats.newUsersThisMonth} User mới tháng này (${stats.bannedUsers} bị khóa)`;

    document.getElementById('admin-kpi-notes').textContent = stats.totalNotes.toLocaleString('vi-VN');
    document.getElementById('admin-kpi-notes-sub').textContent = `+${stats.notesThisMonth} bản ghi trong tháng này`;

    document.getElementById('admin-kpi-volume').textContent = formatVND(stats.totalVolume);
    document.getElementById('admin-kpi-volume-sub').textContent = `Tháng này: ${formatVND(stats.volumeThisMonth)}`;

    document.getElementById('admin-kpi-goals').textContent = stats.totalGoals;
    document.getElementById('admin-kpi-goals-sub').textContent = `${stats.completedGoals} mục tiêu đã cán đích 100%`;

    const ctx = document.getElementById('adminGrowthChart').getContext('2d');
    if (state.charts.adminGrowth) state.charts.adminGrowth.destroy();

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#94a3b8' : '#64748b';

    state.charts.adminGrowth = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: monthlySeries.map((m) => m.label),
        datasets: [
          {
            label: 'Số bản ghi Notepad được tạo',
            data: monthlySeries.map((m) => m.notesCount),
            backgroundColor: '#6366f1',
            borderRadius: 6,
          },
          {
            label: 'Người dùng đăng ký mới',
            data: monthlySeries.map((m) => m.newUsers),
            backgroundColor: '#10b981',
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: textColor } },
        },
        scales: {
          x: { ticks: { color: textColor } },
          y: { ticks: { color: textColor, precision: 0 } },
        },
      },
    });
  } catch (error) {
    console.error('Admin overview error:', error);
  }
}

function debounceLoadAdminUsers() {
  clearTimeout(adminUserSearchTimer);
  adminUserSearchTimer = setTimeout(() => {
    loadAdminUsers();
  }, 250);
}

async function loadAdminUsers() {
  try {
    const search = document.getElementById('admin-user-search')?.value || '';
    const status = document.getElementById('admin-user-status')?.value || 'all';
    const role = document.getElementById('admin-user-role')?.value || 'all';

    const params = new URLSearchParams({ search, status, role });
    const data = await apiRequest(`/api/admin/users?${params.toString()}`);
    const tbody = document.getElementById('admin-users-tbody');

    tbody.innerHTML = (data.users || [])
      .map((u) => {
        const isSelf = state.user && String(state.user._id) === String(u._id);
        const isBanned = u.status === 'banned';
        const isAdminRole = u.role === 'admin';
        const safeAvatar = getSafeFlaticonAvatar(u.avatar, u.role);

        return `
          <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
            <td class="py-3.5 px-3">
              <div class="flex items-center gap-2.5">
                <img src="${escapeHtml(safeAvatar)}" onerror="this.onerror=null;this.src='https://cdn-icons-png.flaticon.com/512/3135/3135715.png';" class="w-9 h-9 rounded-full bg-white border object-cover shrink-0" />
                <div>
                  <p class="font-bold text-slate-800 dark:text-slate-100 inline-flex items-center gap-1.5 flex-wrap">
                    <span>${escapeHtml(u.fullName)}</span>
                    ${isAdminRole ? getAdminVerifiedBadgeHtml('w-4 h-4') : ''}
                    ${isSelf ? `<span class="text-[10px] text-indigo-500 font-bold">(Bạn)</span>` : ''}
                  </p>
                  <p class="text-xs text-slate-400">${escapeHtml(u.email)}</p>
                </div>
              </div>
            </td>

            <td class="py-3.5 px-3">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                  isAdminRole
                    ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-300 border border-sky-300/60 dark:border-sky-700/60'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }">
                  <span>${u.role}</span>
                  ${isAdminRole ? getAdminVerifiedBadgeHtml('w-3 h-3') : ''}
                </span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                  isBanned
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                }">
                  ${isBanned ? '🚫 Banned' : '● Active'}
                </span>
              </div>
            </td>

            <td class="py-3.5 px-3">
              <p class="font-bold text-emerald-600 dark:text-emerald-400">${formatVND(u.totalIncome)}</p>
              <p class="text-[11px] text-slate-400">${u.notesCount} bản ghi • 🔥 ${u.streakCount || 0} ngày</p>
            </td>

            <td class="py-3.5 px-3 text-xs text-slate-500">
              ${u.lastLogin ? formatDateVN(u.lastLogin) : 'Chưa đăng nhập'}
            </td>

            <td class="py-3.5 px-3 text-right">
              <div class="inline-flex flex-wrap items-center justify-end gap-1.5">
                <button onclick="adminToggleBan('${u._id}', '${u.status}')" ${isSelf ? 'disabled' : ''}
                  class="px-2.5 py-1 rounded-lg text-xs font-semibold ${
                    isBanned
                      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                      : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                  } disabled:opacity-40 transition">
                  ${isBanned ? 'Mở khóa' : 'Khóa (Ban)'}
                </button>

                <button onclick="adminToggleRole('${u._id}', '${u.role}')" ${isSelf ? 'disabled' : ''}
                  class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 disabled:opacity-40 transition">
                  ${isAdminRole ? 'Hạ User' : 'Nâng Admin'}
                </button>

                <button onclick="adminResetPassword('${u._id}', '${escapeHtml(u.email)}')"
                  class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 transition">
                  Reset MK
                </button>

                <button onclick="adminDeleteUser('${u._id}', '${escapeHtml(u.email)}')" ${isSelf ? 'disabled' : ''}
                  class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-50 dark:bg-rose-950/60 text-rose-600 hover:bg-rose-100 disabled:opacity-40 transition">
                  Xóa
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function adminToggleBan(userId, currentStatus) {
  const nextStatus = currentStatus === 'active' ? 'banned' : 'active';
  try {
    const res = await apiRequest(`/api/admin/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus }),
    });
    showToast(res.message, nextStatus === 'banned' ? 'warning' : 'success');
    await Promise.all([loadAdminUsers(), loadAdminOverview()]);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function adminToggleRole(userId, currentRole) {
  const nextRole = currentRole === 'admin' ? 'user' : 'admin';
  try {
    const res = await apiRequest(`/api/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role: nextRole }),
    });
    showToast(res.message, 'info');
    await loadAdminUsers();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function adminResetPassword(userId, email) {
  const newPassword = prompt(`Nhập mật khẩu mới cho tài khoản "${email}" (tối thiểu 6 ký tự):`, '123456');
  if (!newPassword) return;

  try {
    const res = await apiRequest(`/api/admin/users/${userId}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    });
    showToast(res.message, 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function adminDeleteUser(userId, email) {
  if (
    !confirm(
      `CẢNH BÁO: Bạn có chắc chắn muốn XÓA VĨNH VIỄN tài khoản "${email}" cùng toàn bộ lịch sử thu nhập và mục tiêu của họ?`
    )
  ) {
    return;
  }

  try {
    const res = await apiRequest(`/api/admin/users/${userId}`, { method: 'DELETE' });
    showToast(res.message, 'info');
    await Promise.all([loadAdminUsers(), loadAdminOverview()]);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadAdminAnnouncements() {
  try {
    const data = await apiRequest('/api/admin/announcements');
    const listEl = document.getElementById('admin-announcements-list');
    const items = data.announcements || [];

    state.announcements = items.filter((a) => a.isActive);
    renderBroadcastAnnouncements();

    if (items.length === 0) {
      listEl.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">Chưa có thông báo hệ thống nào.</p>`;
      return;
    }

    listEl.innerHTML = items
      .map(
        (a) => `
        <div class="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
          <div>
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
                a.isActive
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }">
                ${a.isActive ? 'Đang hiển thị' : 'Đã tắt'}
              </span>
              <h4 class="font-bold text-xs sm:text-sm">${escapeHtml(a.title)}</h4>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">${escapeHtml(a.content)}</p>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button onclick="toggleAnnouncementActive('${a._id}', ${!a.isActive})"
              class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200">
              ${a.isActive ? 'Tắt' : 'Bật'}
            </button>
            <button onclick="editAnnouncement('${a._id}', '${escapeHtml(a.title)}', '${escapeHtml(a.content)}', ${a.isActive})"
              class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 dark:bg-indigo-950 text-indigo-600">
              Sửa
            </button>
            <button onclick="deleteAnnouncement('${a._id}')"
              class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-50 dark:bg-rose-950 text-rose-600">
              Xóa
            </button>
          </div>
        </div>
      `
      )
      .join('');
  } catch (error) {
    console.error('Load announcements error:', error);
  }
}

function editAnnouncement(id, title, content, isActive) {
  document.getElementById('ann-edit-id').value = id;
  document.getElementById('ann-title').value = title;
  document.getElementById('ann-content').value = content;
  document.getElementById('ann-active').checked = Boolean(isActive);
  document.getElementById('ann-submit-btn').textContent = 'Cập nhật thông báo';
  document.getElementById('ann-cancel-btn').classList.remove('hidden');
}

function resetAnnouncementForm() {
  document.getElementById('ann-edit-id').value = '';
  document.getElementById('ann-title').value = '';
  document.getElementById('ann-content').value = '';
  document.getElementById('ann-active').checked = true;
  document.getElementById('ann-submit-btn').textContent = 'Đăng thông báo';
  document.getElementById('ann-cancel-btn').classList.add('hidden');
}

async function toggleAnnouncementActive(id, isActive) {
  try {
    await apiRequest(`/api/admin/announcements/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ isActive }),
    });
    showToast('Đã cập nhật trạng thái thông báo.', 'info');
    await loadAdminAnnouncements();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function deleteAnnouncement(id) {
  if (!confirm('Xóa thông báo hệ thống này?')) return;
  try {
    await apiRequest(`/api/admin/announcements/${id}`, { method: 'DELETE' });
    showToast('Đã xóa thông báo hệ thống.', 'info');
    await loadAdminAnnouncements();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadAdminSettings() {
  try {
    const data = await apiRequest('/api/admin/settings');
    state.categories = data.categories || [];
    populateCategorySelects();

    const listEl = document.getElementById('admin-categories-list');
    listEl.innerHTML = state.categories
      .map(
        (c) => `
        <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800">
          <div class="flex items-center gap-2.5">
            <span class="w-4 h-4 rounded-full inline-block" style="background-color: ${c.color}"></span>
            <span class="text-xs font-bold">${escapeHtml(c.name)}</span>
          </div>
          <button onclick="deleteSystemCategory('${escapeHtml(c.name)}')"
            class="text-xs text-rose-500 hover:underline font-semibold">
            Xóa
          </button>
        </div>
      `
      )
      .join('');
  } catch (error) {
    console.error('Load admin settings error:', error);
  }
}

async function deleteSystemCategory(name) {
  try {
    const res = await apiRequest('/api/admin/settings/categories', {
      method: 'PUT',
      body: JSON.stringify({ action: 'delete', name }),
    });
    state.categories = res.categories;
    showToast(`Đã xóa danh mục "${name}".`, 'info');
    await loadAdminSettings();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function resetDefaultCategories() {
  try {
    const res = await apiRequest('/api/admin/settings/categories', {
      method: 'PUT',
      body: JSON.stringify({ action: 'reset' }),
    });
    state.categories = res.categories;
    showToast('Đã khôi phục danh mục mặc định của hệ thống!', 'success');
    await loadAdminSettings();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function exportAdminSystemReport(format = 'json') {
  window.open(`/api/admin/export?format=${format}`, '_blank');
}

// ==================== ĐĂNG KÝ SỰ KIỆN FORM (DOM READY) ====================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  if (window.lucide) lucide.createIcons();

  // 1. Form Đăng nhập
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    await submitLogin(email, password);
  });

  // 2. Form Đăng ký
  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAuthError();
    const fullName = document.getElementById('reg-fullname').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;

    try {
      const res = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ fullName, email, password }),
      });
      savePersistentAuth(res.token, res.user);
      showToast('Tạo tài khoản thành công! Hãy bắt đầu nhập thu nhập của bạn.', 'success');
      await bootstrapAuthenticatedApp();
    } catch (error) {
      showAuthError(error.message);
      showToast(error.message, 'error');
    }
  });

  // 3. Ô Gõ Nhanh Smart Notepad (Gắn trực tiếp với ngày đang chọn state.selectedDate)
  const quickInput = document.getElementById('quick-notepad-input');
  quickInput.addEventListener('input', (e) => {
    clientPreviewSmartSyntax(e.target.value);
  });

  document.getElementById('quick-notepad-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawText = quickInput.value.trim();
    if (!rawText) return;

    try {
      quickInput.value = '';
      clientPreviewSmartSyntax('');

      const res = await apiRequest('/api/incomes/quick', {
        method: 'POST',
        body: JSON.stringify({ rawText, date: state.selectedDate }),
      });

      showToast(res.message, 'success');
      applyOptimisticIncomeChange('add', res.income);
    } catch (error) {
      quickInput.value = rawText;
      clientPreviewSmartSyntax(rawText);
      showToast(error.message, 'error');
    }
  });

  // 4. Form Gõ Nhanh ngay trong Modal Sổ Tay Ngày (#day-modal-quick-form & #day-modal-quick-expense-form)
  document.getElementById('day-modal-quick-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('day-modal-quick-input');
    const rawText = input.value.trim();
    if (!rawText) return;

    try {
      input.value = '';
      const res = await apiRequest('/api/incomes/quick', {
        method: 'POST',
        body: JSON.stringify({ rawText, date: state.selectedDate }),
      });

      showToast(res.message, 'success');
      applyOptimisticIncomeChange('add', res.income);
      openDayInspectorModal(state.selectedDate);
      if (state.activeTab === 'analytics') {
        loadMonthlyAnalytics();
      }
    } catch (error) {
      input.value = rawText;
      showToast(error.message, 'error');
    }
  });

  const dayModalExpenseForm = document.getElementById('day-modal-quick-expense-form');
  if (dayModalExpenseForm) {
    dayModalExpenseForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('day-modal-quick-expense-input');
      const rawText = input.value.trim();
      if (!rawText) return;

      try {
        input.value = '';
        const res = await apiRequest('/api/expenses/quick', {
          method: 'POST',
          body: JSON.stringify({ rawText, date: state.selectedDate }),
        });

        showToast(res.message, 'success');
        applyOptimisticExpenseChange('add', res.expense);
        openDayInspectorModal(state.selectedDate);
      } catch (error) {
        input.value = rawText;
        showToast(error.message, 'error');
      }
    });
  }

  // 4b. Ô Gõ Nhanh Chi Tiêu Hằng Ngày (#quick-expense-form)
  const quickExpenseInput = document.getElementById('quick-expense-input');
  if (quickExpenseInput) {
    quickExpenseInput.addEventListener('input', (e) => {
      clientPreviewSmartExpenseSyntax(e.target.value);
    });
  }

  const quickExpenseForm = document.getElementById('quick-expense-form');
  if (quickExpenseForm) {
    quickExpenseForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const rawText = quickExpenseInput.value.trim();
      if (!rawText) return;

      try {
        quickExpenseInput.value = '';
        clientPreviewSmartExpenseSyntax('');

        const res = await apiRequest('/api/expenses/quick', {
          method: 'POST',
          body: JSON.stringify({ rawText, date: state.selectedDate }),
        });

        if (res.streak && state.user) {
          state.user.streakCount = res.streak.streakCount;
          renderUserHeaderAndProfile();
        }

        showToast(res.message, 'success');
        applyOptimisticExpenseChange('add', res.expense);
      } catch (error) {
        quickExpenseInput.value = rawText;
        clientPreviewSmartExpenseSyntax(rawText);
        showToast(error.message, 'error');
      }
    });
  }

  // 5. Form Nhập Thu nhập Chi tiết
  document.getElementById('detailed-income-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = document.getElementById('detail-amount').value;
    const category = document.getElementById('detail-category').value;
    const date = document.getElementById('detail-date').value;
    const note = document.getElementById('detail-note').value;

    try {
      document.getElementById('detail-amount').value = '';
      document.getElementById('detail-note').value = '';

      const res = await apiRequest('/api/incomes', {
        method: 'POST',
        body: JSON.stringify({ amount, category, date, note }),
      });

      state.selectedDate = date;
      updateSelectedDateUI();

      showToast(res.message, 'success');
      applyOptimisticIncomeChange('add', res.income);
    } catch (error) {
      document.getElementById('detail-amount').value = amount;
      document.getElementById('detail-note').value = note;
      showToast(error.message, 'error');
    }
  });

  // 5b. Form Nhập Chi Tiêu Chi Tiết (#detailed-expense-form)
  const detailedExpenseForm = document.getElementById('detailed-expense-form');
  if (detailedExpenseForm) {
    detailedExpenseForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = document.getElementById('exp-detail-amount').value;
      const category = document.getElementById('exp-detail-category').value;
      const date = document.getElementById('exp-detail-date').value;
      const note = document.getElementById('exp-detail-note').value;

      try {
        document.getElementById('exp-detail-amount').value = '';
        document.getElementById('exp-detail-note').value = '';

        const res = await apiRequest('/api/expenses', {
          method: 'POST',
          body: JSON.stringify({ amount, category, date, note }),
        });

        state.selectedDate = date;
        updateSelectedDateUI();

        if (res.streak && state.user) {
          state.user.streakCount = res.streak.streakCount;
          renderUserHeaderAndProfile();
        }

        showToast(res.message, 'success');
        applyOptimisticExpenseChange('add', res.expense);
      } catch (error) {
        document.getElementById('exp-detail-amount').value = amount;
        document.getElementById('exp-detail-note').value = note;
        showToast(error.message, 'error');
      }
    });
  }

  // 6. Form Chỉnh sửa Thu nhập (Modal đơn lẻ)
  document.getElementById('edit-income-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-income-id').value;
    const amount = document.getElementById('edit-income-amount').value;
    const category = document.getElementById('edit-income-category').value;
    const date = document.getElementById('edit-income-date').value;
    const note = document.getElementById('edit-income-note').value;

    try {
      closeEditIncomeModal();
      const res = await apiRequest(`/api/incomes/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ amount, category, date, note }),
      });
      showToast(res.message, 'success');
      applyOptimisticIncomeChange('update', res.income);
      if (state.activeTab === 'analytics') {
        loadMonthlyAnalytics();
      }
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  // 6b. Form Chỉnh sửa Chi tiêu (#edit-expense-form)
  const editExpenseForm = document.getElementById('edit-expense-form');
  if (editExpenseForm) {
    editExpenseForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('edit-expense-id').value;
      const amount = document.getElementById('edit-expense-amount').value;
      const category = document.getElementById('edit-expense-category').value;
      const date = document.getElementById('edit-expense-date').value;
      const note = document.getElementById('edit-expense-note').value;

      try {
        closeEditExpenseModal();
        const res = await apiRequest(`/api/expenses/${id}`, {
          method: 'PUT',
          body: JSON.stringify({ amount, category, date, note }),
        });
        showToast(res.message, 'success');
        applyOptimisticExpenseChange('update', res.expense);
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  }

  // 7. Form Tạo / Sửa Mục tiêu Tài chính & Tính lãi tiết kiệm
  document.getElementById('goal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('goal-id').value;
    const title = document.getElementById('goal-title').value;
    const targetAmount = document.getElementById('goal-target-amount').value;
    const savingsPrincipal = document.getElementById('goal-savings-principal').value;
    const additionalDeposit = document.getElementById('goal-additional-deposit').value;
    const interestRate = document.getElementById('goal-interest-rate').value;
    const interestTermMonths = document.getElementById('goal-interest-term').value;
    const startDate = document.getElementById('goal-start-date').value;
    const endDate = document.getElementById('goal-end-date').value;
    const isPinned = document.getElementById('goal-is-pinned').checked;

    const payload = {
      title,
      targetAmount,
      savingsPrincipal,
      additionalDeposit,
      interestRate,
      interestTermMonths,
      startDate,
      endDate,
      isPinned,
    };

    try {
      closeGoalModal();
      let res;
      if (id) {
        res = await apiRequest(`/api/goals/${id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showToast(res.message || 'Đã cập nhật mục tiêu & tính lại tiền lãi hàng tháng!', 'success');
      } else {
        res = await apiRequest('/api/goals', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast(res.message || 'Đã tạo mục tiêu tài chính & tính lãi tiết kiệm!', 'success');
      }
      if (res && res.goal) {
        if (id) {
          state.goals = state.goals.map((g) => (g._id === res.goal._id ? res.goal : g));
        } else {
          state.goals = [res.goal, ...state.goals];
        }
        if (res.goal.isPinned) {
          state.pinnedGoal = res.goal;
        }
        renderHeroGoalBanner();
        renderGoalsGrid();
        saveLocalDataCache();
      }
      loadGoals();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  // 8. Form Cập nhật Hồ sơ cá nhân
  document.getElementById('profile-update-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fullName = document.getElementById('profile-fullname').value;
    const avatar = document.getElementById('profile-avatar').value;

    try {
      const res = await apiRequest('/api/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ fullName, avatar }),
      });
      savePersistentAuth(state.token, res.user);
      renderUserHeaderAndProfile();
      showToast(res.message, 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  // 9. Form Đổi Mật khẩu
  document.getElementById('change-password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPassword = document.getElementById('cp-current').value;
    const newPassword = document.getElementById('cp-new').value;
    const confirmPassword = document.getElementById('cp-confirm').value;

    if (newPassword !== confirmPassword) {
      return showToast('Mật khẩu mới và xác nhận mật khẩu không khớp!', 'error');
    }

    try {
      const res = await apiRequest('/api/auth/change-password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      document.getElementById('change-password-form').reset();
      showToast(res.message, 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  // 10. Form Thông báo Hệ thống (Admin)
  document.getElementById('admin-announcement-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('ann-edit-id').value;
    const title = document.getElementById('ann-title').value;
    const content = document.getElementById('ann-content').value;
    const isActive = document.getElementById('ann-active').checked;

    try {
      if (editId) {
        await apiRequest(`/api/admin/announcements/${editId}`, {
          method: 'PUT',
          body: JSON.stringify({ title, content, isActive }),
        });
        showToast('Đã cập nhật thông báo hệ thống!', 'success');
      } else {
        await apiRequest('/api/admin/announcements', {
          method: 'POST',
          body: JSON.stringify({ title, content, isActive }),
        });
        showToast('Đã phát thông báo hệ thống mới!', 'success');
      }
      resetAnnouncementForm();
      await loadAdminAnnouncements();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  // 11. Form Thêm Danh mục Mặc định (Admin)
  document.getElementById('admin-category-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('new-cat-name').value.trim();
    const color = document.getElementById('new-cat-color').value;
    if (!name) return;

    try {
      const res = await apiRequest('/api/admin/settings/categories', {
        method: 'PUT',
        body: JSON.stringify({ action: 'add', category: { name, color } }),
      });
      state.categories = res.categories;
      document.getElementById('new-cat-name').value = '';
      showToast(`Đã thêm danh mục "${name}"!`, 'success');
      await loadAdminSettings();
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  // 12. Phím tắt Esc & Bấm vào khoảng trống bên ngoài (Backdrop) để đóng tất cả hộp thoại Modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const editModal = document.getElementById('edit-income-modal');
      const editExpenseModal = document.getElementById('edit-expense-modal');
      const goalModal = document.getElementById('goal-modal');
      const dayModal = document.getElementById('day-inspector-modal');

      if (editModal && !editModal.classList.contains('hidden')) {
        e.preventDefault();
        closeEditIncomeModal();
        return;
      }
      if (editExpenseModal && !editExpenseModal.classList.contains('hidden')) {
        e.preventDefault();
        closeEditExpenseModal();
        return;
      }
      if (goalModal && !goalModal.classList.contains('hidden')) {
        e.preventDefault();
        closeGoalModal();
        return;
      }
      if (dayModal && !dayModal.classList.contains('hidden')) {
        e.preventDefault();
        closeDayInspectorModal();
        return;
      }
    }
  });

  if (state.token) {
    bootstrapAuthenticatedApp();
  }
});
