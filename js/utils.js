// utils.js — Shared constants, helpers, and i18n

// ─── Team identity ─────────────────────────────────────────────────────────────

/** Hex colours keyed by team letter */
const TEAM_COLORS = {
  A: '#ef4444',
  B: '#3b82f6',
  C: '#22c55e',
};

/** Vietnamese display names keyed by team letter */
const TEAM_NAMES = {
  A: 'Đỏ',
  B: 'Xanh Dương',
  C: 'Xanh Lá',
};

// ─── Session constants ─────────────────────────────────────────────────────────

/** Default maximum number of "going" players per session */
const MAX_CAP_DEFAULT = 21;

/** Fixed number of teams */
const TEAMS_COUNT = 3;

// ─── i18n ──────────────────────────────────────────────────────────────────────

const STRINGS = {
  appTitle:        'Bóng Đá Thứ 7',
  loading:         'Đang tải...',
  noSession:       'Chưa có buổi đá. Admin hãy tạo buổi mới.',
  going:           'Đến',
  notGoing:        'Không đến',
  capReached:      'Đã đủ người! Không thể đăng ký thêm.',
  gk:              'Thủ môn',
  randomize:       'Bốc thăm đội',
  teamA:           'Đội Đỏ',
  teamB:           'Đội Xanh Dương',
  teamC:           'Đội Xanh Lá',
  adminPin:        'Nhập mã PIN',
  wrongPin:        'Sai PIN. Thử lại.',
  createSession:   'Tạo buổi đá',
  lockSession:     'Khoá đăng ký',
  saved:           'Đã lưu!',
  error:           'Có lỗi xảy ra. Thử lại.',
  sessionOpen:     'Đang mở đăng ký',
  sessionLocked:   'Đã khoá',
  sessionReady:    'Đội đã sẵn sàng',
  players:         'cầu thủ',
  maxCap:          'Tối đa',
};

/**
 * Translate a key to Vietnamese.
 * Falls back to the raw key if not found.
 * @param {string} key
 * @returns {string}
 */
function t(key) {
  return STRINGS[key] ?? key;
}

// ─── Date helpers ──────────────────────────────────────────────────────────────

/**
 * Format a Date (or Firestore Timestamp) in Vietnamese long format.
 * e.g. "Thứ Bảy, 31 tháng 5, 2025"
 * @param {Date|import('firebase/firestore').Timestamp} date
 * @returns {string}
 */
function formatDate(date) {
  const d = (date && typeof date.toDate === 'function') ? date.toDate() : date;
  return new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    year:    'numeric',
    month:   'long',
    day:     'numeric',
  }).format(d);
}

// ─── UI helpers ────────────────────────────────────────────────────────────────

/**
 * Show a brief toast notification at the bottom of the screen.
 * Creates the element on first call if absent from the DOM.
 * @param {string} msg
 * @param {'success'|'error'|''} [type='']
 */
function showToast(msg, type = '') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.style.cssText = [
      'position:fixed', 'bottom:24px', 'left:50%', 'transform:translateX(-50%)',
      'background:#1e293b', 'color:#f8fafc', 'padding:10px 20px',
      'border-radius:8px', 'font-size:0.95rem', 'z-index:9999',
      'opacity:0', 'transition:opacity 0.25s', 'pointer-events:none',
    ].join(';');
    document.body.appendChild(el);
  }
  if (type === 'error') el.style.background = '#dc2626';
  else if (type === 'success') el.style.background = '#16a34a';
  else el.style.background = '#1e293b';

  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, 2800);
}

/**
 * Return two-letter uppercase initials from a full name.
 * @param {string} name
 * @returns {string}
 */
function initials(name) {
  return (name || '?').trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}
