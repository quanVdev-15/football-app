const ADMIN_AUTH_KEY = 'bdt7_admin_authed';
const PIN_BUFFER_MAX = 4;
const ADMIN_DEFAULT_CAP = 21;

let pinBuffer = '';
let currentSession = null;
let adminPlayers = [];
let adminRsvps = {};
let adminUnsubSession = null;
let adminUnsubRsvps = null;
let adminUnsubPlayers = null;
let adminLang = 'en';
let adminRosterMode = 'going';
let adminRosterSearch = '';
let adminRosterExpanded = false;
const ADMIN_ROSTER_LIMIT = 5;
const ADMIN_GOING_PREVIEW_LIMIT = 10;

const adminText = {
  vi: {
    sessionControls: 'Điều khiển buổi đá',
    openPoll: 'Open Poll',
    lockPoll: 'Lock Poll',
    randomizeTeams: 'Randomize Teams',
    maxCap: 'Giới hạn người chơi',
    save: 'Lưu',
    playerList: 'Danh sách cầu thủ',
    going: 'Going',
    noSession: 'Chưa có buổi đá',
    noPlayers: 'Chưa có cầu thủ.',
    gk: 'plays keeper?',
    saved: 'Đã lưu',
    opened: 'Poll đã mở',
    locked: 'Poll đã khóa',
    randomized: 'Đã chia đội',
    needPlayers: 'Cần người đăng ký trước khi chia đội.',
    pinTitle: 'Admin PIN',
    pinBody: 'Nhập mã PIN 4 số để vào trang quản lý.',
    pinSetup: 'Lần đầu sử dụng: nhập PIN 4 số mới.',
    wrongPin: 'Sai PIN. Thử lại.',
  },
  en: {
    sessionControls: 'Session controls',
    openPoll: 'Open Poll',
    lockPoll: 'Lock Poll',
    randomizeTeams: 'Randomize Teams',
    maxCap: 'Max cap',
    save: 'Save',
    playerList: 'Player list',
    going: 'Going',
    noSession: 'No session yet',
    noPlayers: 'No players yet.',
    gk: 'plays keeper?',
    saved: 'Saved',
    opened: 'Poll opened',
    locked: 'Poll locked',
    randomized: 'Teams randomized',
    needPlayers: 'Players must vote before teams can be made.',
    pinTitle: 'Admin PIN',
    pinBody: 'Enter the 4-digit PIN to manage the session.',
    pinSetup: 'First use: enter a new 4-digit PIN.',
    wrongPin: 'Wrong PIN. Try again.',
  }
};

window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.lang = adminLang;
});

function requireAuth(onSuccess) {
  if (localStorage.getItem(ADMIN_AUTH_KEY) === '1') {
    onSuccess();
    return;
  }
  renderPinOverlay(onSuccess);
}

function renderPinOverlay(onSuccess) {
  pinBuffer = '';
  const overlay = document.createElement('div');
  overlay.id = 'pinOverlay';
  overlay.innerHTML = `
    <div class="pin-box">
      <h2>${at('pinTitle')}</h2>
      <p id="pinHelp">${at('pinBody')}</p>
      <div class="pin-dots">${[0, 1, 2, 3].map(i => `<span id="pinDot${i}" class="pin-dot"></span>`).join('')}</div>
      <div id="pinError" class="pin-error"></div>
      <div class="pin-grid">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'clear', 0, 'back'].map(key => `
          <button type="button" data-key="${key}">${key === 'back' ? '⌫' : key === 'clear' ? 'C' : key}</button>
        `).join('')}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => handlePinKey(btn.dataset.key, onSuccess));
  });

  db.collection('config').doc('app').get().then(doc => {
    if (!doc.exists || !doc.data().adminPin) {
      document.getElementById('pinHelp').textContent = at('pinSetup');
    }
  });
}

async function handlePinKey(key, onSuccess) {
  if (key === 'clear') pinBuffer = '';
  else if (key === 'back') pinBuffer = pinBuffer.slice(0, -1);
  else if (pinBuffer.length < PIN_BUFFER_MAX) pinBuffer += key;

  updatePinDots();
  document.getElementById('pinError').textContent = '';

  if (pinBuffer.length === PIN_BUFFER_MAX) {
    const configRef = db.collection('config').doc('app');
    const doc = await configRef.get();
    const storedPin = doc.exists ? doc.data().adminPin : null;

    if (!storedPin) {
      await configRef.set({ adminPin: pinBuffer }, { merge: true });
      pinSuccess(onSuccess);
      return;
    }

    if (storedPin === pinBuffer) {
      pinSuccess(onSuccess);
    } else {
      pinBuffer = '';
      updatePinDots();
      document.getElementById('pinError').textContent = at('wrongPin');
    }
  }
}

function updatePinDots() {
  for (let i = 0; i < PIN_BUFFER_MAX; i++) {
    document.getElementById(`pinDot${i}`)?.classList.toggle('filled', i < pinBuffer.length);
  }
}

function pinSuccess(onSuccess) {
  localStorage.setItem(ADMIN_AUTH_KEY, '1');
  document.getElementById('pinOverlay')?.remove();
  onSuccess();
}

function logoutAdmin() {
  localStorage.removeItem(ADMIN_AUTH_KEY);
  location.href = '/';
}

async function initAdmin() {
  document.getElementById('adminContent').hidden = false;
  await ensureSessionLoaded();
  subscribeAdminPlayers();
  loadBankConfig();
}

async function ensureSessionLoaded() {
  currentSession = await getAdminActiveSession();
  if (!currentSession) {
    renderAdmin();
    return;
  }
  subscribeAdminSession(currentSession.id);
  subscribeAdminRsvps(currentSession.id);
}

/** Alias used by payment.html, teams.html, rotation.html */
async function getActiveSession() {
  return getAdminActiveSession();
}

async function getAdminActiveSession() {
  const config = await db.collection('config').doc('app').get();
  const currentSessionId = config.exists ? config.data().currentSessionId : null;
  if (currentSessionId) {
    const doc = await db.collection('sessions').doc(currentSessionId).get();
    if (doc.exists) return { id: doc.id, ...doc.data() };
  }
  return null;
}

function subscribeAdminSession(sessionId) {
  if (adminUnsubSession) adminUnsubSession();
  adminUnsubSession = db.collection('sessions').doc(sessionId).onSnapshot(doc => {
    if (!doc.exists) return;
    currentSession = { id: doc.id, ...doc.data() };
    renderAdmin();
  });
}

function subscribeAdminRsvps(sessionId) {
  if (adminUnsubRsvps) adminUnsubRsvps();
  adminUnsubRsvps = db.collection('sessions').doc(sessionId).collection('rsvps').onSnapshot(snap => {
    adminRsvps = {};
    snap.docs.forEach(doc => {
      adminRsvps[doc.id] = { id: doc.id, ...doc.data() };
    });
    renderAdmin();
  });
}

function subscribeAdminPlayers() {
  if (adminUnsubPlayers) adminUnsubPlayers();
  adminUnsubPlayers = db.collection('players').orderBy('name').onSnapshot(snap => {
    adminPlayers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderAdmin();
  });
}

function renderAdmin() {
  applyAdminI18n();
  renderAdminSession();
  renderAdminPlayers();
}

function renderAdminSession() {
  const statusLine = document.getElementById('adminStatusLine');
  const statusBadge = document.getElementById('adminStatusBadge');
  const dateEl = document.getElementById('adminSessionDate');
  const capInput = document.getElementById('capInput');
  const goingCount = goingAdminPlayers().length;

  if (!currentSession) {
    statusLine.textContent = at('noSession');
    dateEl.textContent = '--';
    statusBadge.textContent = 'Open';
    statusBadge.className = 'status-badge is-open';
    document.getElementById('adminGoingCount').textContent = '0';
    return;
  }

  const cap = Number(currentSession.rsvpCap || ADMIN_DEFAULT_CAP);
  capInput.value = cap;
  dateEl.textContent = formatAdminDate(toDate(currentSession.date || currentSession.saturdayDate || currentSession.id));
  statusLine.textContent = `${goingCount} / ${cap} ${at('going')}`;
  document.getElementById('adminGoingCount').textContent = goingCount;

  const label = adminStatusLabel(goingCount, cap);
  statusBadge.textContent = label.text;
  statusBadge.className = `status-badge ${label.className}`;
}

function renderAdminPlayers() {
  const list = document.getElementById('adminPlayers');
  const goingIds = new Set(goingAdminPlayers().map(item => item.playerId || item.id));
  const goingGks = adminPlayers.filter(player => goingIds.has(player.id) && player.isGoalkeeper).length;
  document.getElementById('gkIndicator').textContent = `GKs: ${goingGks}/3`;
  renderGoingPreview(goingIds);

  if (!adminPlayers.length) {
    list.innerHTML = `<div class="state-card">${at('noPlayers')}</div>`;
    return;
  }

  syncRosterTabs();

  const search = normalizeName(adminRosterSearch);
  let visiblePlayers = adminPlayers.filter(player => {
    const isGoing = goingIds.has(player.id);
    if (adminRosterMode === 'going' && !isGoing) return false;
    if (adminRosterMode === 'gk' && !player.isGoalkeeper) return false;
    if (search && !normalizeName(player.name || '').includes(search)) return false;
    return true;
  });

  visiblePlayers = visiblePlayers.sort((a, b) => {
    const aGoing = goingIds.has(a.id);
    const bGoing = goingIds.has(b.id);
    if (aGoing !== bGoing) return aGoing ? -1 : 1;
    return String(a.name || '').localeCompare(String(b.name || ''), adminLang === 'vi' ? 'vi' : 'en', { sensitivity: 'base' });
  });

  const total = visiblePlayers.length;
  const shown = adminRosterExpanded ? visiblePlayers : visiblePlayers.slice(0, ADMIN_ROSTER_LIMIT);

  if (!shown.length) {
    list.innerHTML = `<div class="pay-empty">Không có cầu thủ phù hợp.</div>`;
    return;
  }

  list.innerHTML = shown.map(player => {
    const isGoing = goingIds.has(player.id);
    return `
      <article class="admin-player ${isGoing ? 'is-going' : ''}">
        <div>
          <strong>${esc(player.name || '')}</strong>
          <small>${isGoing ? 'Going' : 'Not going'}</small>
        </div>
        <label class="switch">
          <input type="checkbox" data-gk-player="${escAttr(player.id)}" ${player.isGoalkeeper ? 'checked' : ''}>
          ${at('gk')}
        </label>
      </article>
    `;
  }).join('') + rosterMoreButton(total, shown.length);

  list.querySelectorAll('[data-gk-player]').forEach(input => {
    input.addEventListener('change', () => toggleGoalkeeper(input.dataset.gkPlayer, input.checked));
  });
}

function renderGoingPreview(goingIds) {
  const preview = document.getElementById('adminGoingPreview');
  if (!preview) return;

  const going = adminPlayers
    .filter(player => goingIds.has(player.id))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), adminLang === 'vi' ? 'vi' : 'en', { sensitivity: 'base' }));

  if (!going.length) {
    preview.innerHTML = `<div class="pay-empty">Chưa có ai đăng ký.</div>`;
    return;
  }

  const visible = going.slice(0, ADMIN_GOING_PREVIEW_LIMIT);
  preview.innerHTML = visible.map(player => `
    <span class="admin-going-chip ${player.isGoalkeeper ? 'is-gk' : ''}">
      ${esc(player.name || '')}${player.isGoalkeeper ? ' · GK' : ''}
    </span>
  `).join('') + (going.length > visible.length ? `<span class="admin-going-chip is-more">+${going.length - visible.length}</span>` : '');
}

function rosterMoreButton(total, shown) {
  if (total <= shown) return '';
  return `<button class="pay-more-btn" type="button" onclick="expandAdminRoster()">Xem thêm ${total - shown} người</button>`;
}

function setAdminRosterMode(mode) {
  adminRosterMode = mode;
  adminRosterExpanded = false;
  renderAdminPlayers();
}

function setAdminRosterSearch(value) {
  adminRosterSearch = value || '';
  adminRosterExpanded = false;
  renderAdminPlayers();
}

function expandAdminRoster() {
  adminRosterExpanded = true;
  renderAdminPlayers();
}

function syncRosterTabs() {
  ['going', 'gk', 'all'].forEach(mode => {
    document.getElementById(`rosterTab${mode[0].toUpperCase()}${mode.slice(1)}`)?.classList.toggle('active', adminRosterMode === mode);
  });
}

function openPoll() {
  if (!currentSession) {
    // Show date picker overlay for new session
    const d = new Date();
    const daysToSat = (6 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + daysToSat);
    const overlay = document.getElementById('sessionOverlay');
    if (overlay) {
      document.getElementById('sDate').value = d.toISOString().slice(0, 10);
      document.getElementById('sLocation').value = '';
      overlay.hidden = false;
    }
    return;
  }
  // Re-open existing session
  const cap = Number(document.getElementById('capInput').value || ADMIN_DEFAULT_CAP);
  db.collection('sessions').doc(currentSession.id).set({
    status: 'rsvp',
    rsvpCap: cap,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  }, { merge: true }).then(() => toast('Poll opened', 'success'));
}

async function openPollWithDate(dateStr, time, location) {
  const cap = Number(document.getElementById('capInput').value || ADMIN_DEFAULT_CAP);
  const dateObj = new Date(dateStr + 'T' + (time || '06:30') + ':00');
  const sid = dateStr;
  try {
    await db.collection('sessions').doc(sid).set({
      date: firebase.firestore.Timestamp.fromDate(dateObj),
      saturdayDate: sid,
      time: time || '',
      location: location || '',
      status: 'rsvp',
      rsvpCap: cap,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await db.collection('config').doc('app').set({ currentSessionId: sid }, { merge: true });
    currentSession = { id: sid, status: 'rsvp', rsvpCap: cap, date: dateObj };
    subscribeAdminSession(sid);
    subscribeAdminRsvps(sid);
    toast('Poll opened', 'success');
  } catch(e) {
    console.error(e);
    toast('Failed to open poll.', 'error');
  }
}

async function lockPoll() {
  if (!currentSession) return openPoll();
  await db.collection('sessions').doc(currentSession.id).update({
    status: 'locked',
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
  toast(at('locked'), 'success');
}

async function saveCap() {
  if (!currentSession) return openPoll();
  const cap = Number(document.getElementById('capInput').value || ADMIN_DEFAULT_CAP);
  await db.collection('sessions').doc(currentSession.id).set({ rsvpCap: cap }, { merge: true });
  toast(at('saved'), 'success');
}

async function randomizeTeams() {
  if (!currentSession) return openPoll();
  const going = goingAdminPlayers().map(rsvp => {
    const player = adminPlayers.find(item => item.id === (rsvp.playerId || rsvp.id));
    return {
      id: rsvp.playerId || rsvp.id,
      name: rsvp.playerName || player?.name || '',
      isGoalkeeper: !!(player?.isGoalkeeper || rsvp.isGoalkeeper),
    };
  }).filter(player => player.id && player.name);

  if (!going.length) {
    toast(at('needPlayers'), 'error');
    return;
  }

  const groups = [
    { id: 'A', name: 'Team A', players: [] },
    { id: 'B', name: 'Team B', players: [] },
    { id: 'C', name: 'Team C', players: [] },
  ];

  const shuffledGks = shuffle(going.filter(player => player.isGoalkeeper));
  const shuffledField = shuffle(going.filter(player => !player.isGoalkeeper));
  shuffledGks.forEach((player, index) => groups[index % groups.length].players.push(player));
  shuffledField.forEach(player => {
    groups.sort((a, b) => a.players.length - b.players.length);
    groups[0].players.push(player);
  });
  groups.sort((a, b) => a.id.localeCompare(b.id));

  const batch = db.batch();
  const sessionRef = db.collection('sessions').doc(currentSession.id);
  groups.forEach(team => {
    batch.set(sessionRef.collection('teams').doc(team.id), {
      name: team.name,
      players: team.players,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  batch.set(sessionRef, {
    status: 'teams',
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  await batch.commit();
  toast(at('randomized'), 'success');
}

async function toggleGoalkeeper(playerId, checked) {
  await db.collection('players').doc(playerId).set({ isGoalkeeper: checked }, { merge: true });
  toast(at('saved'), 'success');
}

function goingAdminPlayers() {
  return Object.values(adminRsvps).filter(rsvp => ['in', 'going'].includes(rsvp.status || rsvp.vote));
}

function adminStatusLabel(goingCount, cap) {
  if (['teams', 'ready', 'playing'].includes(currentSession?.status)) {
    return { text: 'Teams Ready', className: 'is-ready' };
  }
  if (['locked', 'full', 'done'].includes(currentSession?.status) || goingCount >= cap) {
    return { text: 'Full', className: 'is-full' };
  }
  return { text: 'Open', className: 'is-open' };
}

function toggleAdminLang() {
  adminLang = adminLang === 'vi' ? 'en' : 'vi';
  localStorage.setItem('bdt7_lang', adminLang);
  document.documentElement.lang = adminLang;
  renderAdmin();
}

function applyAdminI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = at(el.dataset.i18n);
  });
  document.getElementById('adminLangToggle').textContent = adminLang === 'vi' ? 'EN' : 'VI';
}

function at(key) {
  return adminText[adminLang][key] || adminText.en[key] || key;
}

function nextSaturday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  const diff = (6 - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + diff);
  return date;
}

function isoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toDate(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(String(value).includes('T') ? value : `${value}T00:00:00`);
}

function formatAdminDate(date) {
  if (!date) return '--';
  return new Intl.DateTimeFormat(adminLang === 'vi' ? 'vi-VN' : 'en-US', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

// ── Bank config (VietQR) ──────────────────────────────────────────────────────

async function loadBankConfig() {
  const doc = await db.collection('config').doc('payment').get();
  if (!doc.exists) return;
  const cfg = doc.data();
  const bankCodeEl     = document.getElementById('bankCode');
  const accountNumEl   = document.getElementById('accountNumber');
  const accountNameEl  = document.getElementById('accountName');
  if (bankCodeEl    && cfg.bankCode)      bankCodeEl.value    = cfg.bankCode;
  if (accountNumEl  && cfg.accountNumber) accountNumEl.value  = cfg.accountNumber;
  if (accountNameEl && cfg.accountName)   accountNameEl.value = cfg.accountName;
  const statusEl = document.getElementById('bankConfigStatus');
  if (statusEl && cfg.bankCode) statusEl.textContent = `✅ Đã cấu hình: ${cfg.bankCode} — ${cfg.accountNumber}`;
}

async function saveBankConfig() {
  const bankCode    = (document.getElementById('bankCode')?.value    || '').trim();
  const accountNum  = (document.getElementById('accountNumber')?.value || '').trim();
  const accountName = (document.getElementById('accountName')?.value  || '').trim().toUpperCase();

  if (!bankCode || !accountNum) {
    toast('Vui lòng chọn ngân hàng và nhập số tài khoản!', 'error');
    return;
  }

  await db.collection('config').doc('payment').set({
    bankCode,
    accountNumber: accountNum,
    accountName,
    amountPerPlay: 35000,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  const statusEl = document.getElementById('bankConfigStatus');
  if (statusEl) statusEl.textContent = `✅ Đã lưu: ${bankCode} — ${accountNum}`;
  toast('Đã lưu tài khoản ngân hàng!', 'success');
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function toast(message, type = '') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `toast show ${type}`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    el.className = 'toast';
  }, 2200);
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[char]));
}

function escAttr(value) {
  return esc(value).replace(/`/g, '&#096;');
}
