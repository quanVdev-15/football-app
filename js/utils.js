// ─── Constants ───────────────────────────────────────────────────────────────
const PAY_PER_PLAY = 35000;
const MONTHLY_SUB = 150000;
const ADMIN_AUTH_KEY = 'football_admin_auth';
const ADMIN_AUTH_TTL = 24 * 60 * 60 * 1000; // 24h
const LANG_KEY = 'football_lang';

// ─── Language ─────────────────────────────────────────────────────────────────
const T = {
  vi: {
    appTitle: 'Bóng Đá Thứ 7',
    loading: 'Đang tải...',
    imIn: '⚽ Tôi sẽ đến!',
    imOut: '✕ Huỷ đăng ký',
    playerCount: 'người đã đăng ký',
    rsvpOpen: 'Đăng ký mở đến',
    rsvpLocked: 'Đăng ký đã khoá',
    selectName: 'Chọn tên của bạn',
    addGuest: 'Mang theo khách?',
    guestName: 'Tên khách (không bắt buộc)',
    submit: 'Xác nhận',
    cancel: 'Huỷ',
    onCourt: 'ĐANG ĐÁ',
    nextUp: 'TIẾP THEO',
    onDeck: 'CHỜ SẴN',
    resting: 'NGHỈ',
    matchTime: 'Thời gian trận',
    adminPin: 'Nhập mã PIN',
    wrongPin: 'Sai PIN. Thử lại.',
    payment: 'Thanh toán',
    teams: 'Đội bóng',
    rotation: 'Lịch trận',
    subscribers: 'Thành viên tháng',
    payPerPlay: 'Trả theo buổi',
    guests: 'Khách',
    totalCollect: 'TỔNG THU',
    paid: 'Đã thanh toán',
    unpaid: 'Chưa trả',
    startMatch: 'Bắt đầu trận',
    endMatch: 'Kết thúc trận',
    winner: 'Đội thắng',
    draw: 'Hoà',
    noSession: 'Chưa có buổi đá. Admin hãy tạo buổi mới.',
    createSession: 'Tạo buổi đá',
    today: 'Hôm nay',
    saturday: 'Thứ Bảy',
    pickCaptains: 'Chọn đội trưởng',
    assignPlayers: 'Phân chia cầu thủ',
    subs: 'Dự bị',
    manualOverride: 'Sắp xếp lại',
    saved: 'Đã lưu!',
    error: 'Có lỗi xảy ra',
    consecutive: 'trận liên tiếp',
    mustRest: 'Phải nghỉ!',
    noSessionYet: 'Chưa có buổi đá nào được tạo',
  },
  en: {
    appTitle: 'Saturday Football',
    loading: 'Loading...',
    imIn: '⚽ I\'m In!',
    imOut: '✕ Cancel RSVP',
    playerCount: 'players confirmed',
    rsvpOpen: 'RSVP open until',
    rsvpLocked: 'RSVP locked',
    selectName: 'Select your name',
    addGuest: 'Bringing a guest?',
    guestName: 'Guest name (optional)',
    submit: 'Confirm',
    cancel: 'Cancel',
    onCourt: 'ON COURT',
    nextUp: 'NEXT UP',
    onDeck: 'ON DECK',
    resting: 'RESTING',
    matchTime: 'Match time',
    adminPin: 'Enter PIN',
    wrongPin: 'Wrong PIN. Try again.',
    payment: 'Payments',
    teams: 'Teams',
    rotation: 'Rotation',
    subscribers: 'Monthly members',
    payPerPlay: 'Pay-per-play',
    guests: 'Guests',
    totalCollect: 'TOTAL TO COLLECT',
    paid: 'Paid',
    unpaid: 'Unpaid',
    startMatch: 'Start Match',
    endMatch: 'End Match',
    winner: 'Winner',
    draw: 'Draw',
    noSession: 'No session yet. Admin should create one.',
    createSession: 'Create Session',
    today: 'Today',
    saturday: 'Saturday',
    pickCaptains: 'Pick Captains',
    assignPlayers: 'Assign Players',
    subs: 'Subs',
    manualOverride: 'Override',
    saved: 'Saved!',
    error: 'Something went wrong',
    consecutive: 'consecutive',
    mustRest: 'Must rest!',
    noSessionYet: 'No session has been created yet',
  }
};

function getLang() { return localStorage.getItem(LANG_KEY) || 'vi'; }
function setLang(l) { localStorage.setItem(LANG_KEY, l); location.reload(); }
function t(key) { return (T[getLang()] || T.vi)[key] || key; }

// ─── Admin Auth ───────────────────────────────────────────────────────────────
function setAdminAuth() { localStorage.setItem(ADMIN_AUTH_KEY, Date.now().toString()); }
function isAdminAuthed() {
  const v = localStorage.getItem(ADMIN_AUTH_KEY);
  return v && (Date.now() - parseInt(v)) < ADMIN_AUTH_TTL;
}
function clearAdminAuth() { localStorage.removeItem(ADMIN_AUTH_KEY); }

// ─── Date helpers ─────────────────────────────────────────────────────────────
function getNextSaturday(from = new Date()) {
  const d = new Date(from);
  const dow = d.getDay();
  const diff = dow === 6 ? 0 : 6 - dow;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getCutoff(satDate) {
  const d = new Date(satDate);
  d.setDate(d.getDate() - 1); // Friday
  d.setHours(20, 0, 0, 0);
  return d;
}

function sessionId(date) {
  return date.toISOString().split('T')[0];
}

function fmtDate(date, lang = getLang()) {
  return new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  }).format(date instanceof Date ? date : date.toDate());
}

function fmtTime(date) {
  return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' })
    .format(date instanceof Date ? date : date.toDate());
}

function fmtVND(n) {
  return new Intl.NumberFormat('vi-VN').format(n) + '₫';
}

// ─── UI helpers ───────────────────────────────────────────────────────────────
function showToast(msg, type = '') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = 'toast ' + type;
  requestAnimationFrame(() => { el.classList.add('show'); });
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 2800);
}

function initLangToggle(btnId = 'langBtn') {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  const lang = getLang();
  btn.textContent = lang === 'vi' ? 'EN' : 'VI';
  btn.onclick = () => setLang(lang === 'vi' ? 'en' : 'vi');
}

function applyTranslations() {
  document.querySelectorAll('[data-t]').forEach(el => {
    const key = el.getAttribute('data-t');
    el.textContent = t(key);
  });
  document.querySelectorAll('[data-t-placeholder]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-t-placeholder'));
  });
}

// ─── Positions ────────────────────────────────────────────────────────────────
const POSITIONS = {
  GK:   { emoji: '🧤', label: 'GK',   bg: '#fef3c7', color: '#b45309' },
  DEF:  { emoji: '🛡️', label: 'DEF',  bg: '#dbeafe', color: '#1d4ed8' },
  MID:  { emoji: '⚙️', label: 'MID',  bg: '#d1fae5', color: '#065f46' },
  FWD:  { emoji: '⚡', label: 'FWD',  bg: '#fee2e2', color: '#b91c1c' },
  flex: { emoji: '🔄', label: 'Flex', bg: '#f1f5f9', color: '#64748b' },
};

function posBadge(pos) {
  const p = POSITIONS[pos] || POSITIONS.flex;
  return `<span class="pos-badge" style="background:${p.bg};color:${p.color}">${p.emoji} ${p.label}</span>`;
}

// ─── Team colors ──────────────────────────────────────────────────────────────
const TEAM_COLORS = [
  { id: 'red',    label: 'Đỏ / Red',    hex: '#e53935', light: '#ffcdd2' },
  { id: 'blue',   label: 'Xanh dương / Blue', hex: '#1565c0', light: '#bbdefb' },
  { id: 'green',  label: 'Xanh lá / Green', hex: '#2e7d32', light: '#c8e6c9' },
  { id: 'yellow', label: 'Vàng / Yellow', hex: '#f9a825', light: '#fff9c4' },
];

function colorClass(colorId) { return 'team-' + colorId; }

// ─── Session helpers ──────────────────────────────────────────────────────────
async function getActiveSession() {
  const snap = await db.collection('config').doc('app').get();
  if (!snap.exists) return null;
  const { currentSessionId } = snap.data();
  if (!currentSessionId) return null;
  const sess = await db.collection('sessions').doc(currentSessionId).get();
  return sess.exists ? { id: sess.id, ...sess.data() } : null;
}

// ─── Avatar initial ───────────────────────────────────────────────────────────
function initials(name) {
  return (name || '?').trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ─── Register service worker ──────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
