// ─── State ────────────────────────────────────────────────────────────────────
let session = null;
let players = [];
let rsvps = {};        // { playerId: rsvpDoc }
let myPlayerId = null; // stored in localStorage
let guestCount = 0;
let showingNewName = false;
let selectedPosition = 'flex';
let unsubRsvp = null;
let unsubPayment = null;
let unsubBoardPayments = null;
let unsubDraft = null;
let unsubChat = null;
let unsubReactions = null;
// ── Match Day ──
let matchDayTeams = [];
let matchDayFormations = {};  // { teamId: formDoc }
let matchDayTrades = [];
let matchRotation = null;
let mdSelectedSlot = null;    // { teamId, type:'pitch'|'bench', key:number|string }
let mdActiveTab = 'myteam';
let tradeProposalOpen = false;
let unsubMDTeams = null;
let unsubMDFormations = null;
let unsubMDTrades = null;
let unsubRotation = null;
let timerIntervalMD = null;
let timerBuzzed = false;
let bankConfig = null;
let draftState = null;
let chatOpen = false;
let unreadCount = 0;
let spectatorNum = null;
let lastPickCount = -1;
let _lastMsgCount = 0;
const DEVICE_ID = Math.random().toString(36).slice(2);

const MY_ID_KEY = 'football_my_player_id';

// ─── Init ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  initLangToggle('langBtn');
  applyTranslations();
  myPlayerId = localStorage.getItem(MY_ID_KEY);

  await loadPlayers();
  await loadSession();
});

async function loadPlayers() {
  const snap = await db.collection('players').orderBy('name').get();
  players = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  buildPlayerSelect();
}

function buildPlayerSelect() {
  const sel = document.getElementById('playerSelect');
  const prevVal = sel.value;
  sel.innerHTML = '<option value="">-- ' + (getLang() === 'vi' ? 'Chọn tên' : 'Select name') + ' --</option>';

  // Find which names appear more than once so we can disambiguate
  const nameCounts = {};
  players.forEach(p => { nameCounts[p.name] = (nameCounts[p.name] || 0) + 1; });

  players.forEach(p => {
    const alreadyIn = rsvps[p.id] && rsvps[p.id].status === 'in';
    const isMe = p.id === myPlayerId;
    const isDuplicate = nameCounts[p.name] > 1;

    let label = p.name;
    if (p.isSubscriber) label += ' ⭐';
    if (isDuplicate) label += p.phone ? ` (${p.phone})` : ' (?)';
    if (alreadyIn && !isMe) {
      label += getLang() === 'vi' ? ' — đã đăng ký' : ' — already in';
    }

    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = label;
    if (alreadyIn && !isMe) opt.disabled = true;
    if (p.id === (prevVal || myPlayerId)) opt.selected = true;
    sel.appendChild(opt);
  });
}

async function loadSession() {
  try {
    session = await getActiveSession();
    hide('loadingState');

    if (!session) {
      show('noSession');
      document.getElementById('noSessionMsg').textContent = t('noSession');
      return;
    }

    show('mainContent');
    renderSessionInfo();
    subscribeRsvps();
    subscribeSessionStatus();
  } catch (e) {
    hide('loadingState');
    showToast(t('error'), 'error');
    console.error(e);
  }
}

function subscribeSessionStatus() {
  db.collection('sessions').doc(session.id).onSnapshot(snap => {
    if (!snap.exists) return;
    const newStatus = snap.data().status;
    if (newStatus !== session.status) {
      session = { ...session, ...snap.data() };
      renderSessionInfo();
    }
  });
}

function renderSessionInfo() {
  const satDate = session.date.toDate ? session.date.toDate() : new Date(session.date);
  const cutoff = session.rsvpCutoff.toDate ? session.rsvpCutoff.toDate() : new Date(session.rsvpCutoff);
  const now = new Date();
  const locked = now > cutoff || session.status !== 'rsvp';
  const isDone = session.status === 'done';

  // Clean up draft/chat footer when leaving draft + match day statuses
  const isMatchDay = ['teams', 'playing'].includes(session.status);
  if (session.status !== 'draft' && !isMatchDay) {
    const footer = document.getElementById('draftFooter');
    if (footer) footer.style.display = 'none';
    if (unsubChat) { unsubChat(); unsubChat = null; }
    if (unsubReactions) { unsubReactions(); unsubReactions = null; }
    const toastEl = document.getElementById('toast');
    if (toastEl) toastEl.style.bottom = '';
    const main = document.querySelector('main.container');
    if (main) main.style.paddingBottom = '';
  }
  if (!isMatchDay) cleanupMatchDay();

  document.getElementById('sessionDate').textContent = fmtDate(satDate);

  const cutoffEl = document.getElementById('cutoffInfo');
  if (!isDone) {
    cutoffEl.innerHTML = (getLang() === 'vi' ? 'Hạn đăng ký' : 'RSVP cutoff') +
      '<br><b>' + fmtDate(cutoff) + ' ' + fmtTime(cutoff) + '</b>';
  } else {
    cutoffEl.textContent = '';
  }

  const bar = document.getElementById('statusBar');
  const icon = document.getElementById('statusIcon');
  const text = document.getElementById('statusText');

  if (isDone) {
    bar.className = 'status-bar locked';
    icon.textContent = '🏁';
    text.textContent = 'Buổi đá đã kết thúc';
    hide('countDisplay');
    hide('rsvpBtn');
    hide('rsvpListCard');
    hide('draftBoard');
    show('paymentBoard');
    loadBankConfigAndStartBoard();
  } else if (session.status === 'draft') {
    bar.className = 'status-bar playing';
    icon.textContent = '⚽';
    text.textContent = 'Đang chọn đội...';
    hide('countDisplay');
    hide('rsvpBtn');
    hide('rsvpListCard');
    hide('paymentSection');
    hide('matchDayBoard');
    show('draftBoard');
    subscribeDraft();
  } else if (isMatchDay) {
    bar.className = 'status-bar playing';
    icon.textContent = '⚽';
    text.textContent = session.status === 'teams' ? 'Chuẩn bị đội hình...' : '⚡ Đang thi đấu!';
    hide('countDisplay');
    hide('rsvpBtn');
    hide('rsvpListCard');
    hide('draftBoard');
    hide('paymentSection');
    show('matchDayBoard');
    subscribeMatchDay();
    // During playing: reactions only — hide chat, players are on the field
    const chatToggle = document.getElementById('chatToggleBtn');
    const chatPanel  = document.getElementById('chatPanel');
    if (chatToggle) chatToggle.style.display = session.status === 'playing' ? 'none' : '';
    if (chatPanel && session.status === 'playing') { chatPanel.style.display = 'none'; chatOpen = false; }
  } else if (locked) {
    hide('draftBoard');
    bar.className = 'status-bar locked';
    icon.textContent = '🔒';
    text.textContent = t('rsvpLocked');
    document.getElementById('rsvpBtn').disabled = true;
    document.getElementById('rsvpBtn').style.opacity = '.5';
  } else {
    bar.className = 'status-bar open';
    icon.textContent = '🟢';
    const diff = cutoff - now;
    const hrs = Math.floor(diff / 36e5);
    const mins = Math.floor((diff % 36e5) / 6e4);
    text.textContent = t('rsvpOpen') + ': ' + (hrs > 0 ? hrs + 'h ' : '') + mins + 'm';
  }
}

async function loadBankConfigAndStartBoard() {
  if (!bankConfig) {
    const snap = await db.collection('config').doc('app').get();
    bankConfig = snap.exists ? snap.data() : {};
  }
  renderBoardQr();
  subscribePaymentBoard();
}

function renderBoardQr() {
  const el = document.getElementById('boardQr');
  if (!bankConfig || !bankConfig.bankId || !bankConfig.bankAccount) {
    el.innerHTML = `<p style="color:var(--text-muted);font-size:.88rem">Thủ quỹ chưa cài đặt QR thanh toán</p>`;
    return;
  }
  const myRsvp = myPlayerId ? rsvps[myPlayerId] : null;
  const isSub = myRsvp?.isSubscriber;
  const guestCount = (myRsvp?.guests || []).filter(g => g.name?.trim()).length;
  const amount = myRsvp ? (isSub ? 0 : PAY_PER_PLAY) + guestCount * PAY_PER_PLAY : PAY_PER_PLAY;

  const desc = encodeURIComponent('Bong da thu 7');
  const qrUrl = `https://img.vietqr.io/image/${bankConfig.bankId}-${bankConfig.bankAccount}-compact2.jpg` +
    `?amount=${amount}&addInfo=${desc}&accountName=${encodeURIComponent(bankConfig.bankAccountName || '')}`;

  el.innerHTML = `
    <img src="${qrUrl}" style="width:220px;height:220px;border-radius:10px;border:1px solid var(--border)" alt="QR">
    <div style="margin-top:10px">
      ${bankConfig.bankAccountName ? `<div style="font-weight:700">${esc(bankConfig.bankAccountName)}</div>` : ''}
      <div style="font-size:.82rem;color:var(--text-muted)">${bankConfig.bankId} · ${esc(bankConfig.bankAccount)}</div>
    </div>
    <div style="font-size:1.3rem;font-weight:800;color:var(--primary);margin-top:6px">${fmtVND(amount)}</div>
    ${isSub && guestCount === 0 ? '<div style="font-size:.78rem;color:var(--success)">⭐ Thành viên tháng — Miễn phí</div>' : ''}
  `;
}

function subscribePaymentBoard() {
  if (unsubBoardPayments) unsubBoardPayments();
  unsubBoardPayments = db.collection('sessions').doc(session.id)
    .collection('payments')
    .onSnapshot(snap => {
      const payMap = {};
      snap.docs.forEach(d => { payMap[d.id] = d.data(); });
      renderPaymentBoard(payMap);
    });
}

function renderPaymentBoard(payMap) {
  const inPlayers = Object.entries(rsvps).filter(([, r]) => r.status === 'in');
  const paidCount = inPlayers.filter(([pid]) => payMap[pid]?.paid).length;

  document.getElementById('boardPaidBadge').textContent = `${paidCount}/${inPlayers.length} đã trả`;
  document.getElementById('boardPaidBadge').className = paidCount === inPlayers.length ? 'badge badge-green' : 'badge badge-yellow';

  // Update self-report button for current player
  const myRsvp = myPlayerId ? rsvps[myPlayerId] : null;
  const myPay = myPlayerId ? payMap[myPlayerId] : null;
  const selfBtn = document.getElementById('boardSelfReportBtn');
  const selfStatus = document.getElementById('boardSelfStatus');

  if (myRsvp && myRsvp.status === 'in') {
    const isSub = myRsvp.isSubscriber;
    const guestCount = (myRsvp.guests || []).filter(g => g.name?.trim()).length;
    const myAmount = (isSub ? 0 : PAY_PER_PLAY) + guestCount * PAY_PER_PLAY;

    if (myAmount === 0 || myPay?.paid) {
      selfBtn.style.display = 'none';
      selfStatus.style.display = '';
      selfStatus.style.color = 'var(--success)';
      selfStatus.textContent = myAmount === 0 ? '⭐ Thành viên tháng — Miễn phí' : '✅ Đã xác nhận thanh toán';
    } else if (myPay?.selfReported) {
      selfBtn.style.display = 'none';
      selfStatus.style.display = '';
      selfStatus.style.color = 'var(--warning, #f9a825)';
      selfStatus.textContent = '⏳ Đang chờ admin xác nhận...';
    } else {
      selfBtn.style.display = '';
      selfStatus.style.display = 'none';
    }
  }

  // Render player list
  const list = document.getElementById('boardList');
  if (!inPlayers.length) {
    list.innerHTML = '<div style="color:var(--text-muted);font-size:.88rem;padding:8px 0">Không có ai</div>';
    return;
  }

  list.innerHTML = inPlayers
    .sort((a, b) => {
      const pa = payMap[a[0]]?.paid ? 0 : payMap[a[0]]?.selfReported ? 1 : 2;
      const pb = payMap[b[0]]?.paid ? 0 : payMap[b[0]]?.selfReported ? 1 : 2;
      return pa - pb || a[1].playerName.localeCompare(b[1].playerName);
    })
    .map(([pid, r]) => {
      const pay = payMap[pid];
      const isMe = pid === myPlayerId;
      let statusHtml;
      if (pay?.paid) {
        statusHtml = `<span class="badge badge-green">✅ Đã trả</span>`;
      } else if (pay?.selfReported) {
        statusHtml = `<span class="badge badge-yellow">⏳ Chờ</span>`;
      } else {
        statusHtml = `<span class="badge badge-grey">Chưa trả</span>`;
      }
      return `<div class="player-item" style="margin-bottom:6px${isMe ? ';background:var(--success-bg);border-radius:8px;padding:4px 8px' : ''}">
        <div class="player-avatar">${initials(r.playerName)}</div>
        <div class="player-name" style="flex:1">${esc(r.playerName)}${isMe ? ' <span style="font-size:.7rem;color:var(--primary)">(bạn)</span>' : ''}</div>
        ${statusHtml}
      </div>`;
    }).join('');
}

function subscribeRsvps() {
  if (unsubRsvp) unsubRsvp();
  unsubRsvp = db.collection('sessions').doc(session.id)
    .collection('rsvps').onSnapshot(snap => {
      rsvps = {};
      snap.docs.forEach(d => { rsvps[d.id] = d.data(); });
      buildPlayerSelect(); // refresh disabled state as RSVPs change
      renderPlayers();
      updateMyButton();
      showPaymentInfo();
    });
}

async function showPaymentInfo() {
  const section = document.getElementById('paymentSection');
  if (!section || !myPlayerId) return;

  const myRsvp = rsvps[myPlayerId];
  if (!myRsvp || myRsvp.status !== 'in') { hide('paymentSection'); return; }

  // Payment board handles 'done' state; this section covers locked/teams/playing
  if (['rsvp', 'done', 'draft'].includes(session.status)) { hide('paymentSection'); return; }

  // Load bank config once
  if (!bankConfig) {
    const configSnap = await db.collection('config').doc('app').get();
    bankConfig = configSnap.exists ? configSnap.data() : {};
  }

  // Subscribe to this player's payment record for real-time updates
  if (unsubPayment) unsubPayment();
  unsubPayment = db.collection('sessions').doc(session.id)
    .collection('payments').doc(myPlayerId)
    .onSnapshot(snap => {
      renderPaymentSection(myRsvp, snap.exists ? snap.data() : null);
    });
}

function renderPaymentSection(myRsvp, payData) {
  const isSub = myRsvp.isSubscriber;
  const guestCount = (myRsvp.guests || []).filter(g => g.name && g.name.trim()).length;
  const myAmount = (isSub ? 0 : PAY_PER_PLAY) + guestCount * PAY_PER_PLAY;

  const adminConfirmed = payData && payData.paid;
  const selfReported = payData && payData.selfReported;
  const fullyPaid = myAmount === 0 || adminConfirmed;

  const badge = document.getElementById('paymentBadge');
  const body = document.getElementById('paymentBody');

  if (fullyPaid) {
    badge.className = 'badge badge-green';
    badge.textContent = '✅ Đã thanh toán';
    body.innerHTML = `<p style="color:var(--success);text-align:center;font-weight:700;padding:12px 0">
      ${isSub ? '⭐ Thành viên tháng — Miễn phí' : '✅ Cảm ơn bạn đã thanh toán!'}
    </p>`;

  } else if (selfReported) {
    badge.className = 'badge badge-yellow';
    badge.textContent = fmtVND(myAmount);
    body.innerHTML = `
      <div style="text-align:center;padding:12px 0">
        <div style="font-size:2rem;margin-bottom:8px">⏳</div>
        <div style="font-weight:700;margin-bottom:4px">Đang chờ admin xác nhận</div>
        <div style="font-size:.82rem;color:var(--text-muted)">Admin sẽ xác nhận thanh toán của bạn sớm</div>
      </div>`;

  } else {
    badge.className = 'badge badge-yellow';
    badge.textContent = fmtVND(myAmount);

    let qrHtml = '';
    if (bankConfig && bankConfig.bankId && bankConfig.bankAccount) {
      const desc = encodeURIComponent('Bong da thu 7');
      const qrUrl = `https://img.vietqr.io/image/${bankConfig.bankId}-${bankConfig.bankAccount}-compact2.jpg` +
        `?amount=${myAmount}&addInfo=${desc}&accountName=${encodeURIComponent(bankConfig.bankAccountName || '')}`;
      qrHtml = `
        <img src="${qrUrl}" style="width:220px;height:220px;border-radius:10px;border:1px solid var(--border)" alt="QR">
        <div style="margin-top:10px">
          ${bankConfig.bankAccountName ? `<div style="font-weight:700">${esc(bankConfig.bankAccountName)}</div>` : ''}
          <div style="font-size:.82rem;color:var(--text-muted)">${bankConfig.bankId} · ${esc(bankConfig.bankAccount)}</div>
        </div>`;
    } else {
      qrHtml = `<div style="color:var(--text-muted);font-size:.88rem;padding:8px 0">Liên hệ thủ quỹ để thanh toán</div>`;
    }

    let breakdown = '';
    if (!isSub && guestCount > 0)
      breakdown = `${fmtVND(PAY_PER_PLAY)} (bạn) + ${guestCount} khách × ${fmtVND(PAY_PER_PLAY)}`;
    else if (guestCount > 0)
      breakdown = `⭐ Miễn phí + ${guestCount} khách × ${fmtVND(PAY_PER_PLAY)}`;

    body.innerHTML = `
      <div style="text-align:center">
        <div style="font-size:.88rem;color:var(--text-muted);margin-bottom:10px">Quét mã để chuyển khoản</div>
        ${qrHtml}
        <div style="font-size:1.3rem;font-weight:800;color:var(--primary);margin:10px 0 4px">${fmtVND(myAmount)}</div>
        ${breakdown ? `<div style="font-size:.78rem;color:var(--text-muted);margin-bottom:14px">${breakdown}</div>` : ''}
        <button class="btn btn-success btn-block btn-lg" onclick="selfReportPayment()">
          ✅ Tôi đã chuyển khoản
        </button>
      </div>`;
  }

  show('paymentSection');
}

async function selfReportPayment() {
  if (!myPlayerId || !session) return;
  const btn = document.querySelector('#paymentBody .btn-success');
  if (btn) btn.disabled = true;
  try {
    await db.collection('sessions').doc(session.id)
      .collection('payments').doc(myPlayerId)
      .set({ selfReported: true, selfReportedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    // UI auto-updates via onSnapshot
  } catch (e) {
    showToast(t('error'), 'error');
    if (btn) btn.disabled = false;
  }
}

function renderPlayers() {
  const list = document.getElementById('playerList');
  const inPlayers = Object.entries(rsvps).filter(([, r]) => r.status === 'in');

  let total = 0;
  inPlayers.forEach(([, r]) => { total++; total += (r.guests || []).length; });

  document.getElementById('countNum').textContent = total;
  document.getElementById('confirmedCount').textContent = inPlayers.length;

  if (inPlayers.length === 0) {
    list.innerHTML = '<li class="empty" style="text-align:center;padding:20px;color:var(--text-muted)">Chưa ai đăng ký 👋</li>';
    return;
  }

  list.innerHTML = '';
  inPlayers.sort((a, b) => {
    const ta = a[1].timestamp?.seconds || 0;
    const tb = b[1].timestamp?.seconds || 0;
    return ta - tb;
  }).forEach(([pid, r]) => {
    const li = document.createElement('li');
    li.className = 'player-item';
    const isMe = pid === myPlayerId;
    const sub = r.isSubscriber ? ' ⭐' : '';
    const pos = r.position ? posBadge(r.position) : '';
    li.innerHTML = `
      <div class="player-avatar">${initials(r.playerName)}</div>
      <div style="flex:1">
        <div class="player-name">${esc(r.playerName)}${sub}${isMe ? ' <span style="font-size:.72rem;color:var(--primary);font-weight:700">(bạn)</span>' : ''}</div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:3px;flex-wrap:wrap">
          ${pos}
          ${r.guests && r.guests.length ? `<span style="font-size:.76rem;color:var(--text-muted)">+${r.guests.length} khách</span>` : ''}
        </div>
      </div>
      <span class="player-time">${r.timestamp ? fmtTime(r.timestamp.toDate ? r.timestamp.toDate() : new Date(r.timestamp)) : ''}</span>
    `;
    list.appendChild(li);
  });
}

function updateMyButton() {
  const btn = document.getElementById('rsvpBtn');
  const cutoff = session.rsvpCutoff.toDate ? session.rsvpCutoff.toDate() : new Date(session.rsvpCutoff);
  if (new Date() > cutoff || session.status !== 'rsvp') return;

  const myRsvp = myPlayerId && rsvps[myPlayerId];
  if (myRsvp && myRsvp.status === 'in') {
    btn.textContent = t('imOut');
    btn.className = 'btn btn-cta out';
    btn.onclick = openCancelModal;
  } else {
    btn.textContent = t('imIn');
    btn.className = 'btn btn-cta';
    btn.onclick = openRsvpModal;
  }
}

// ─── Position picker ──────────────────────────────────────────────────────────
function selectPos(pos) {
  selectedPosition = pos;
  document.querySelectorAll('.pos-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.pos === pos);
  });
}

// ─── RSVP Modal ───────────────────────────────────────────────────────────────
function openRsvpModal() {
  guestCount = 0;
  document.getElementById('guestCount').textContent = '0';
  document.getElementById('guestNames').innerHTML = '';
  if (myPlayerId) document.getElementById('playerSelect').value = myPlayerId;

  // Pre-fill position from existing RSVP
  const existingPos = (myPlayerId && rsvps[myPlayerId]?.position) || 'flex';
  selectPos(existingPos);

  openModal('rsvpModal');
}

function closeModal() { closeModalEl('rsvpModal'); }
function openCancelModal() { openModal('cancelModal'); }
function closeCancelModal() { closeModalEl('cancelModal'); }

function openModal(id) {
  document.getElementById(id).classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeModalEl(id) {
  document.getElementById(id).classList.remove('active');
  document.body.style.overflow = '';
}

function toggleNewName() {
  showingNewName = !showingNewName;
  document.getElementById('newNameInput').style.display = showingNewName ? 'block' : 'none';
  document.getElementById('playerSelect').style.display = showingNewName ? 'none' : 'block';
}

function changeGuests(delta) {
  guestCount = Math.max(0, Math.min(5, guestCount + delta));
  document.getElementById('guestCount').textContent = guestCount;
  renderGuestInputs();
}

function renderGuestInputs() {
  const container = document.getElementById('guestNames');
  container.innerHTML = '';
  for (let i = 0; i < guestCount; i++) {
    const inp = document.createElement('input');
    inp.className = 'form-input';
    inp.placeholder = (getLang() === 'vi' ? 'Tên khách ' : 'Guest name ') + (i + 1) + ' (không bắt buộc)';
    inp.dataset.idx = i;
    inp.style.marginBottom = '8px';
    container.appendChild(inp);
  }
}

async function submitRsvp() {
  const btn = document.getElementById('submitBtn');
  btn.disabled = true;

  try {
    let playerId, playerName, isSubscriber = false;

    if (showingNewName) {
      const name = document.getElementById('newNameInput').value.trim();
      if (!name) { showToast('Nhập tên đi!', 'error'); btn.disabled = false; return; }
      // Create new player
      const ref = await db.collection('players').add({ name, phone: '', isSubscriber: false, subscriptionExpiry: null });
      playerId = ref.id;
      playerName = name;
      players.push({ id: playerId, name, isSubscriber: false });
      buildPlayerSelect();
    } else {
      playerId = document.getElementById('playerSelect').value;
      if (!playerId) { showToast('Chọn tên của bạn!', 'error'); btn.disabled = false; return; }
      // Guard: reject if this name was already taken by someone else
      const existing = rsvps[playerId];
      if (existing && existing.status === 'in' && playerId !== myPlayerId) {
        showToast(getLang() === 'vi' ? 'Tên này đã được đăng ký!' : 'This name is already taken!', 'error');
        btn.disabled = false;
        return;
      }
      const p = players.find(x => x.id === playerId);
      playerName = p.name;
      isSubscriber = p.isSubscriber && isSubValid(p);
    }

    // Collect guest names
    const guests = [];
    for (let i = 0; i < guestCount; i++) {
      const inp = document.querySelector(`#guestNames [data-idx="${i}"]`);
      guests.push({ name: inp ? inp.value.trim() : '' });
    }

    await db.collection('sessions').doc(session.id)
      .collection('rsvps').doc(playerId).set({
        playerId,
        playerName,
        isSubscriber,
        status: 'in',
        guests,
        position: selectedPosition,
        checkedIn: false,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });

    // Remember this player
    localStorage.setItem(MY_ID_KEY, playerId);
    myPlayerId = playerId;

    closeModal();
    showToast('✅ Đã đăng ký!', 'success');
  } catch (e) {
    console.error(e);
    showToast(t('error'), 'error');
  }
  btn.disabled = false;
}

async function cancelRsvp() {
  if (!myPlayerId) return;
  try {
    await db.collection('sessions').doc(session.id)
      .collection('rsvps').doc(myPlayerId).update({ status: 'out' });
    closeCancelModal();
    showToast('Đã huỷ đăng ký', '');
  } catch (e) {
    showToast(t('error'), 'error');
  }
}

// ─── Draft ────────────────────────────────────────────────────────────────────
function subscribeDraft() {
  if (unsubDraft) unsubDraft();
  lastPickCount = -1;
  initDraftChat();
  subscribeDraftReactions();
  unsubDraft = db.collection('sessions').doc(session.id)
    .collection('state').doc('draft')
    .onSnapshot(snap => {
      if (!snap.exists) return;
      const newState = snap.data();
      const newPickCount = (newState.picks || []).length;
      if (lastPickCount >= 0 && newPickCount > lastPickCount) {
        const pick = newState.picks[newPickCount - 1];
        const cap = newState.captains[pick.captainIdx];
        showPickAnnouncement(cap?.name || '?', pick.playerName);
      }
      lastPickCount = newPickCount;
      draftState = newState;
      renderDraftBoard(draftState);
    });
}

function renderDraftBoard(draft) {
  const board = document.getElementById('draftBoard');
  if (!board || !draft) return;

  const { captains, currentPickIdx = 0, picks = [] } = draft;
  const pickedIds = new Set(picks.map(p => p.playerId));
  const captainIds = new Set(captains.map(c => c.id));
  const currentCaptain = captains[currentPickIdx % captains.length];
  const isMyTurn = myPlayerId && currentCaptain && myPlayerId === currentCaptain.id;
  const myCaptainEntry = myPlayerId && captains.find(c => c.id === myPlayerId);

  // Available players: in RSVP (+ their guests), not yet picked, not a captain
  const available = [];
  Object.entries(rsvps).forEach(([pid, r]) => {
    if (r.status !== 'in') return;
    if (!pickedIds.has(pid) && !captainIds.has(pid))
      available.push({ id: pid, name: r.playerName, position: r.position || 'flex' });
    (r.guests || []).forEach((g, i) => {
      if (!g.name?.trim()) return;
      const gid = pid + '_g' + i;
      if (!pickedIds.has(gid))
        available.push({ id: gid, name: g.name.trim() + ' (khách)', position: 'flex' });
    });
  });

  const unpickedCount = available.length;

  // ── Turn indicator ──
  let turnHtml;
  if (unpickedCount === 0) {
    turnHtml = `<div class="draft-turn-card">
      <div class="draft-turn-label">Draft</div>
      <div class="draft-turn-name">🎉 Hoàn tất!</div>
      <div style="font-size:.85rem;opacity:.8;margin-top:6px">${picks.length} cầu thủ đã được chọn</div>
    </div>`;
  } else if (isMyTurn) {
    turnHtml = `<div class="draft-turn-card" style="background:linear-gradient(135deg,#f9a825,#e65100)">
      <div class="draft-turn-label">Đến lượt bạn!</div>
      <div class="draft-turn-name">Chọn 1 cầu thủ</div>
      <div style="font-size:.85rem;opacity:.8;margin-top:6px">${unpickedCount} người còn lại</div>
    </div>`;
  } else {
    turnHtml = `<div class="draft-turn-card">
      <div class="draft-turn-label">Đang chờ...</div>
      <div class="draft-turn-name">${esc(currentCaptain?.name || '—')} đang chọn</div>
      <div style="font-size:.85rem;opacity:.8;margin-top:6px">${unpickedCount} người còn lại</div>
    </div>`;
  }

  // ── Available pool grouped by position ──
  let poolHtml = '';
  if (unpickedCount > 0) {
    const byPos = {};
    available.forEach(p => {
      const pos = p.position || 'flex';
      if (!byPos[pos]) byPos[pos] = [];
      byPos[pos].push(p);
    });

    const posOrder = ['GK', 'DEF', 'MID', 'FWD', 'flex'];
    const groups = posOrder.filter(pos => byPos[pos]?.length).map(pos => {
      const info = POSITIONS[pos];
      return `<div class="draft-pos-group">
        <div class="draft-pos-title">
          ${info.emoji} ${info.label}
          <span class="badge badge-grey" style="font-size:.65rem">${byPos[pos].length}</span>
        </div>
        ${byPos[pos].map(p => `
          <div class="draft-player-card${isMyTurn ? ' pickable' : ''}"
            ${isMyTurn ? `onclick="pickPlayer('${p.id}')"` : ''}>
            <div class="player-avatar">${initials(p.name)}</div>
            <div class="player-name" style="flex:1">${esc(p.name)}</div>
            ${isMyTurn
              ? `<button class="btn btn-sm btn-success" onclick="event.stopPropagation();pickPlayer('${p.id}')">Chọn</button>`
              : ''}
          </div>
        `).join('')}
      </div>`;
    });

    poolHtml = `<div class="card">
      <div class="card-header">
        <span class="card-title">Chưa được chọn</span>
        <span class="badge badge-yellow">${unpickedCount}</span>
      </div>
      ${groups.join('')}
    </div>`;
  }

  // ── Teams so far ──
  const COLOR_HEX = { red: '#e53935', blue: '#1565c0', green: '#2e7d32' };
  const teamPicks = {};
  captains.forEach((c, i) => {
    teamPicks[i] = [{ id: c.id, name: c.name, position: rsvps[c.id]?.position || 'flex', isCaptain: true }];
  });
  picks.forEach(p => {
    if (teamPicks[p.captainIdx] === undefined) teamPicks[p.captainIdx] = [];
    teamPicks[p.captainIdx].push({ id: p.playerId, name: p.playerName, position: p.position || 'flex' });
  });

  const teamsHtml = `<div style="margin-top:4px">
    <div class="card-title" style="margin-bottom:8px">Đội hình</div>
    ${captains.map((c, i) => {
      const members = teamPicks[i] || [];
      const isCurrentTurn = i === (currentPickIdx % captains.length) && unpickedCount > 0;
      const isMyTeam = myPlayerId && members.some(m => m.id === myPlayerId);
      return `<div class="draft-team-slot" style="${isCurrentTurn ? 'border-color:var(--primary-light);' : ''}${isMyTeam ? 'background:var(--success-bg);' : ''}">
        <div class="draft-team-header">
          <div class="team-dot team-dot-${c.color || 'green'}"></div>
          <span style="flex:1">Team ${esc(c.name)}</span>
          ${isCurrentTurn && unpickedCount > 0 ? `<span class="badge badge-green" style="margin-right:4px">▶</span>` : ''}
          <span class="badge badge-grey">${members.length}</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:2px">
          ${members.map(m => {
            const info = POSITIONS[m.position] || POSITIONS.flex;
            const isMe = m.id === myPlayerId;
            return `<div class="draft-pick-chip" style="${isMe ? 'border-color:var(--primary);background:var(--success-bg)' : ''}">
              ${info.emoji} ${esc(m.name)}${m.isCaptain ? ' 🏆' : ''}${isMe ? ' <span style="color:var(--primary);font-size:.65rem">(bạn)</span>' : ''}
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }).join('')}
  </div>`;

  // ── Captain banner (you are captain this week) ──
  const captainBannerHtml = myCaptainEntry ? `
    <div style="background:linear-gradient(135deg,#2e7d32,#1b5e20);color:#fff;border-radius:12px;padding:14px 16px;margin-bottom:12px;text-align:center">
      <div style="font-size:1.6rem;margin-bottom:4px">🏆</div>
      <div style="font-size:1.05rem;font-weight:900">Bạn là đội trưởng tuần này!</div>
      <div style="font-size:.82rem;opacity:.85;margin-top:4px">Team ${esc(myCaptainEntry.name)}</div>
    </div>` : '';

  // ── Captain identity prompt (shown when draft active + not yet identified as captain) ──
  const identityPromptHtml = (!myCaptainEntry && unpickedCount > 0) ? `
    <div class="card" style="margin-bottom:12px;border:2px dashed var(--primary)">
      <div style="text-align:center;margin-bottom:12px">
        <div style="font-size:1rem;font-weight:800">Bạn là đội trưởng tuần này?</div>
        <div style="font-size:.82rem;color:var(--text-muted);margin-top:4px">Nhấn tên của bạn để bắt đầu chọn cầu thủ</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${captains.map((c, idx) => `
          <button class="btn btn-ghost" style="font-weight:700;font-size:.95rem" onclick="identifyAsCaptain(${idx})">
            🏆 ${esc(c.name)}
          </button>
        `).join('')}
      </div>
    </div>` : '';

  board.innerHTML = captainBannerHtml + identityPromptHtml + turnHtml + poolHtml + teamsHtml;
}

function identifyAsCaptain(idx) {
  if (!draftState) return;
  const cap = draftState.captains[idx];
  if (!cap) return;
  localStorage.setItem(MY_ID_KEY, cap.id);
  myPlayerId = cap.id;
  renderDraftBoard(draftState);
  showToast(`🏆 Xin chào đội trưởng ${cap.name}!`, 'success');
}

async function pickPlayer(playerId) {
  if (!myPlayerId || !session || !draftState) return;
  const { captains, currentPickIdx = 0 } = draftState;
  const currentCaptain = captains[currentPickIdx % captains.length];

  if (myPlayerId !== currentCaptain?.id) {
    showToast('Chưa đến lượt bạn!', 'error');
    return;
  }

  // Resolve player info — handle guests (id format: hostId_gN)
  let playerName, position;
  const guestMatch = playerId.match(/^(.+)_g(\d+)$/);
  if (guestMatch) {
    const hostRsvp = rsvps[guestMatch[1]];
    const guest = hostRsvp?.guests?.[parseInt(guestMatch[2])];
    if (!guest) return;
    playerName = guest.name.trim() + ' (khách)';
    position = 'flex';
  } else {
    const rsvp = rsvps[playerId];
    if (!rsvp) return;
    playerName = rsvp.playerName;
    position = rsvp.position || 'flex';
  }

  try {
    const captainIdx = currentPickIdx % captains.length;
    const pick = { playerId, playerName, position, captainIdx };
    const batch = db.batch();
    const sessRef = db.collection('sessions').doc(session.id);
    batch.update(sessRef.collection('state').doc('draft'), {
      picks: firebase.firestore.FieldValue.arrayUnion(pick),
      currentPickIdx: currentPickIdx + 1
    });
    batch.set(sessRef.collection('chat').doc(), {
      type: 'system',
      message: `⚽ ${currentCaptain.name} chọn ${playerName}`,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    await batch.commit();
    showToast(`✅ ${playerName}`, 'success');
  } catch (e) {
    console.error(e);
    showToast(t('error'), 'error');
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isSubValid(player) {
  if (!player.subscriptionExpiry) return false;
  const exp = player.subscriptionExpiry.toDate ? player.subscriptionExpiry.toDate() : new Date(player.subscriptionExpiry);
  return exp > new Date();
}

function show(id) { const el = document.getElementById(id); if (el) el.style.display = ''; }
function hide(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Chat & Reactions ─────────────────────────────────────────────────────────

function getChatName() {
  if (myPlayerId && rsvps[myPlayerId]) return rsvps[myPlayerId].playerName;
  if (!spectatorNum) spectatorNum = Math.floor(Math.random() * 900) + 100;
  return 'Khán giả ' + spectatorNum;
}

function nameToColor(name) {
  let hash = 0;
  for (const c of String(name)) hash = c.charCodeAt(0) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360},65%,62%)`;
}

function initDraftChat() {
  const footer = document.getElementById('draftFooter');
  if (footer) { footer.style.display = ''; updateFooterPadding(); }
  const toastEl = document.getElementById('toast');
  if (toastEl) toastEl.style.bottom = '80px';

  if (unsubChat) unsubChat();
  unsubChat = db.collection('sessions').doc(session.id)
    .collection('chat')
    .orderBy('timestamp', 'asc')
    .limitToLast(60)
    .onSnapshot(snap => {
      renderChatMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
}

function updateFooterPadding() {
  const footer = document.getElementById('draftFooter');
  const main = document.querySelector('main.container');
  if (!footer || !main) return;
  main.style.paddingBottom = (footer.offsetHeight + 16) + 'px';
}

function toggleChat() {
  chatOpen = !chatOpen;
  const panel = document.getElementById('chatPanel');
  if (!panel) return;
  panel.style.display = chatOpen ? 'flex' : 'none';
  updateFooterPadding();
  if (chatOpen) {
    unreadCount = 0;
    const badge = document.getElementById('unreadBadge');
    if (badge) badge.style.display = 'none';
    scrollChatToBottom();
    setTimeout(() => document.getElementById('chatInputField')?.focus(), 120);
  }
}

function scrollChatToBottom() {
  const el = document.getElementById('chatMessages');
  if (el) setTimeout(() => { el.scrollTop = el.scrollHeight; }, 50);
}

function renderChatMessages(messages) {
  const el = document.getElementById('chatMessages');
  if (!el) return;
  const wasAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;

  el.innerHTML = messages.map(m => {
    if (m.type === 'system') {
      return `<div class="chat-msg chat-msg-system">${esc(m.message || '')}</div>`;
    }
    const color = nameToColor(m.playerName || 'Khán giả');
    const isCaptain = draftState?.captains?.some(c => c.id === m.playerId);
    const isMe = myPlayerId && m.playerId === myPlayerId;
    return `<div class="chat-msg">
      <span class="chat-msg-name" style="color:${color}">${isCaptain ? '🏆 ' : ''}${esc(m.playerName || 'Khán giả')}</span>${isMe ? '<span style="font-size:.68rem;color:rgba(200,200,200,.35)"> (bạn)</span>' : ''}: ${esc(m.message || '')}
    </div>`;
  }).join('');

  if (!chatOpen) {
    const newCount = messages.length - _lastMsgCount;
    if (newCount > 0) {
      unreadCount += newCount;
      const badge = document.getElementById('unreadBadge');
      if (badge) { badge.textContent = unreadCount > 9 ? '9+' : unreadCount; badge.style.display = ''; }
    }
  } else {
    unreadCount = 0;
    const badge = document.getElementById('unreadBadge');
    if (badge) badge.style.display = 'none';
  }
  _lastMsgCount = messages.length;
  if (wasAtBottom || chatOpen) scrollChatToBottom();
}

async function sendChat() {
  const input = document.getElementById('chatInputField');
  const message = input?.value.trim();
  if (!message || !session) return;
  input.value = '';
  try {
    await db.collection('sessions').doc(session.id).collection('chat').add({
      type: 'user',
      playerId: myPlayerId || null,
      playerName: getChatName(),
      message,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) { console.error(e); }
}

async function sendReaction(emoji) {
  floatEmoji(emoji); // instant local feedback
  if (!session) return;
  try {
    await db.collection('sessions').doc(session.id).collection('reactions').add({
      emoji, deviceId: DEVICE_ID,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) { /* silent */ }
}

function floatEmoji(emoji) {
  const overlay = document.getElementById('reactionOverlay');
  if (!overlay) return;
  const el = document.createElement('div');
  el.className = 'floating-emoji';
  el.textContent = emoji;
  el.style.left = (8 + Math.random() * 75) + '%';
  overlay.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function subscribeDraftReactions() {
  if (unsubReactions) unsubReactions();
  const startTime = new Date();
  unsubReactions = db.collection('sessions').doc(session.id)
    .collection('reactions')
    .where('timestamp', '>', startTime)
    .onSnapshot(snap => {
      snap.docChanges().forEach(change => {
        if (change.type === 'added' && change.doc.data().deviceId !== DEVICE_ID)
          floatEmoji(change.doc.data().emoji);
      });
    });
}

function showPickAnnouncement(captainName, playerName) {
  const el = document.getElementById('pickAnnouncement');
  if (!el) return;
  document.getElementById('announceCapt').textContent = captainName;
  document.getElementById('announcePlayer').textContent = (playerName || '?').toUpperCase();
  el.classList.remove('show');
  void el.offsetWidth; // force reflow to restart animation
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) {
      overlay.classList.remove('active');
      document.body.style.overflow = '';
    }
  });
});

// ─── Timer alert (audio beep — works on iOS + Android) ───────────────────────
let _audioCtx = null;

// Warm up AudioContext + request notification permission on first user touch/click
function _warmAudio() {
  if (_audioCtx) return;
  try {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
  } catch (e) {}
  // Request notification permission (shows browser prompt once)
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}
document.addEventListener('touchstart', _warmAudio, { once: true, passive: true });
document.addEventListener('click',      _warmAudio, { once: true });

// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

function playTimerAlert() {
  // 1. Audio beep
  try {
    if (!_audioCtx) _warmAudio();
    const ctx = _audioCtx;
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      const pattern = [
        { freq: 880, start: 0,   dur: 0.35 },
        { freq: 880, start: 0.5, dur: 0.35 },
        { freq: 660, start: 1.0, dur: 0.6  },
      ];
      pattern.forEach(({ freq, start, dur }) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.45, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur + 0.05);
      });
    }
  } catch (e) { /* audio not available */ }

  // 2. Vibrate (Android)
  if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 1000]);

  // 3. System notification via Service Worker (works when tab is backgrounded)
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    const myTeam = matchDayTeams.find(t => (t.players || []).some(p => p.id === myPlayerId));
    const body = myTeam ? `Đội ${myTeam.name} — chuẩn bị vào sân!` : 'Đổi đội! Vào sân ngay!';
    navigator.serviceWorker.controller.postMessage({ type: 'TIMER_END', body });
  }
}

// ─── Formations config ────────────────────────────────────────────────────────
const FORMATIONS_7 = {
  '2-3-1': { rows: [{pos:'FWD',n:1},{pos:'MID',n:3},{pos:'DEF',n:2},{pos:'GK',n:1}] },
  '3-2-1': { rows: [{pos:'FWD',n:1},{pos:'MID',n:2},{pos:'DEF',n:3},{pos:'GK',n:1}] },
  '2-2-2': { rows: [{pos:'FWD',n:2},{pos:'MID',n:2},{pos:'DEF',n:2},{pos:'GK',n:1}] },
  '1-3-2': { rows: [{pos:'FWD',n:2},{pos:'MID',n:3},{pos:'DEF',n:1},{pos:'GK',n:1}] },
  '3-3':   { rows: [{pos:'ATK',n:3},{pos:'DEF',n:3},{pos:'GK',n:1}] },
};

function totalSlots(formation) {
  return (FORMATIONS_7[formation] || FORMATIONS_7['2-3-1']).rows.reduce((s,r) => s + r.n, 0);
}

// ─── Match Day subscriptions ──────────────────────────────────────────────────
function subscribeMatchDay() {
  if (unsubMDTeams) return; // already live

  // Keep chat footer visible (reuse draft chat)
  const footer = document.getElementById('draftFooter');
  if (footer) { footer.style.display = ''; updateFooterPadding(); }
  if (!unsubChat) initDraftChat();
  if (!unsubReactions) subscribeDraftReactions();

  unsubMDTeams = db.collection('sessions').doc(session.id)
    .collection('teams').onSnapshot(snap => {
      matchDayTeams = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderMatchDay();
    });

  unsubMDFormations = db.collection('sessions').doc(session.id)
    .collection('formations').onSnapshot(snap => {
      matchDayFormations = {};
      snap.docs.forEach(d => { matchDayFormations[d.id] = d.data(); });
      renderMatchDay();
    });

  unsubMDTrades = db.collection('sessions').doc(session.id)
    .collection('trades').orderBy('createdAt', 'asc')
    .onSnapshot(snap => {
      matchDayTrades = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderMatchDay();
    });

  unsubRotation = db.collection('sessions').doc(session.id)
    .collection('state').doc('rotation')
    .onSnapshot(snap => {
      matchRotation = snap.exists ? snap.data() : null;
      timerBuzzed = false;
      clearInterval(timerIntervalMD); timerIntervalMD = null;
      if (matchRotation?.status === 'playing' && matchRotation?.currentMatchStart) {
        timerIntervalMD = setInterval(renderTimerCard, 500);
      }
      renderTimerCard();
    });
}

function cleanupMatchDay() {
  if (unsubMDTeams)      { unsubMDTeams();      unsubMDTeams = null; }
  if (unsubMDFormations) { unsubMDFormations();  unsubMDFormations = null; }
  if (unsubMDTrades)     { unsubMDTrades();      unsubMDTrades = null; }
  if (unsubRotation)     { unsubRotation();      unsubRotation = null; }
  clearInterval(timerIntervalMD); timerIntervalMD = null;
  matchDayTeams = [];
  matchDayFormations = {};
  matchDayTrades = [];
  matchRotation = null;
  timerBuzzed = false;
  mdSelectedSlot = null;
  tradeProposalOpen = false;
  const timerEl = document.getElementById('matchTimerCard');
  if (timerEl) timerEl.style.display = 'none';
}

// ─── Match Day render ─────────────────────────────────────────────────────────
function renderMatchDay() {
  if (!matchDayTeams.length) return;

  // Update trades badge
  const pending = matchDayTrades.filter(t => t.toCaptainId === myPlayerId && t.status === 'pending').length;
  const tradeBtn = document.getElementById('mdTab-trades');
  if (tradeBtn) tradeBtn.textContent = pending ? `🤝 Đổi người 🔴` : '🤝 Đổi người';

  renderTimerCard();
  renderMDTab(mdActiveTab);
}

// ─── Live match timer ─────────────────────────────────────────────────────────
function renderTimerCard() {
  const el = document.getElementById('matchTimerCard');
  if (!el) return;

  if (!matchRotation) { el.style.display = 'none'; return; }

  const durSecs = matchRotation.matchDurationSecs || (15 * 60);
  const isPlaying = matchRotation.status === 'playing' && matchRotation.currentMatchStart;
  const tA    = matchDayTeams.find(t => t.id === matchRotation.onCourtA);
  const tB    = matchDayTeams.find(t => t.id === matchRotation.onCourtB);
  const tRest = matchRotation.resting ? matchDayTeams.find(t => t.id === matchRotation.resting) : null;

  const COLOR_HEX = { red:'#e53935', blue:'#1565c0', green:'#2e7d32', yellow:'#f9a825' };

  let timerHtml;
  if (isPlaying) {
    const start = matchRotation.currentMatchStart.toDate
      ? matchRotation.currentMatchStart.toDate() : new Date(matchRotation.currentMatchStart);
    const elapsed = Math.floor((Date.now() - start.getTime()) / 1000);
    const rem = durSecs - elapsed;
    const timeUp = rem <= 0;

    if (!timerBuzzed && timeUp) {
      timerBuzzed = true;
      clearInterval(timerIntervalMD); timerIntervalMD = null;
      if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 1000]);
      playTimerAlert();
    }

    if (timeUp) {
      timerHtml = `<div class="mtc-num mtc-timeup">⏰ HẾT GIỜ!</div>`;
    } else {
      const m = String(Math.floor(rem / 60)).padStart(2, '0');
      const s = String(rem % 60).padStart(2, '0');
      timerHtml = `<div class="mtc-num${rem < 60 ? ' mtc-warn' : ''}">${m}:${s}</div>`;
    }
  } else {
    timerHtml = `<div class="mtc-num mtc-idle">⏸ Chưa bắt đầu</div>`;
  }

  el.style.display = '';
  el.innerHTML = `<div class="match-timer-card">
    <div class="mtc-label">ĐANG ĐÁ</div>
    <div class="mtc-teams">
      <span class="mtc-team" style="color:${COLOR_HEX[tA?.color] || 'inherit'}">${esc(tA?.name || '?')}</span>
      <span class="mtc-vs">VS</span>
      <span class="mtc-team" style="color:${COLOR_HEX[tB?.color] || 'inherit'}">${esc(tB?.name || '?')}</span>
    </div>
    ${timerHtml}
    ${tRest ? `<div class="mtc-next">⏳ Chuẩn bị vào sân: <b>${esc(tRest.name)}</b></div>` : ''}
  </div>`;
}

function switchMDTab(tab) {
  mdActiveTab = tab;
  ['myteam','allteams','trades'].forEach(t => {
    const el = document.getElementById('md-' + t);
    const btn = document.getElementById('mdTab-' + t);
    if (el) el.style.display = t === tab ? '' : 'none';
    if (btn) btn.classList.toggle('active', t === tab);
  });
  renderMDTab(tab);
}

function renderMDTab(tab) {
  if (tab === 'myteam')   renderMDMyTeam();
  else if (tab === 'allteams') renderMDAllTeams();
  else if (tab === 'trades')   renderMDTrades();
}

// ─── My Team tab ──────────────────────────────────────────────────────────────
function renderMDMyTeam() {
  const el = document.getElementById('md-myteam');
  if (!el) return;

  const myTeam = matchDayTeams.find(t => (t.players||[]).some(p => p.id === myPlayerId));

  if (!myTeam) {
    el.innerHTML = `<div class="card" style="text-align:center;padding:24px;color:var(--text-muted)">
      <div style="font-size:2rem;margin-bottom:8px">👀</div>
      <div>Chưa xác định đội của bạn. Chọn tên ở trang chính.</div>
    </div>`;
    return;
  }

  const formDoc = matchDayFormations[myTeam.id];
  const isEditable = !!myPlayerId;
  const isCaptain = myTeam.captainId === myPlayerId;

  el.innerHTML = `<div class="card">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <div class="team-dot team-dot-${myTeam.color}"></div>
      <div style="font-weight:800;font-size:1rem;flex:1">${esc(myTeam.name)}</div>
      ${isCaptain ? '<span class="badge badge-green">🏆 Đội trưởng</span>' : ''}
      <span class="badge badge-grey">${(myTeam.players||[]).length} người</span>
    </div>
    ${isEditable ? buildFormationPicker(myTeam.id, formDoc?.formation || '2-3-1') : ''}
    ${buildPitch(myTeam, formDoc, isEditable)}
    ${isEditable ? '<div style="font-size:.73rem;color:var(--text-muted);margin-top:6px;text-align:center">Chạm vào cầu thủ để chọn, chạm vào vị trí khác để đổi chỗ</div>' : ''}
  </div>`;
}

// ─── All Teams tab ────────────────────────────────────────────────────────────
function renderMDAllTeams() {
  const el = document.getElementById('md-allteams');
  if (!el) return;

  if (!matchDayTeams.length) {
    el.innerHTML = '<div style="color:var(--text-muted);padding:20px;text-align:center">Chưa có đội</div>';
    return;
  }

  const myTeamId = matchDayTeams.find(t => (t.players||[]).some(p => p.id === myPlayerId))?.id;

  el.innerHTML = matchDayTeams.map(team => {
    const formDoc = matchDayFormations[team.id];
    const isMe = team.id === myTeamId;
    return `<div class="card" style="${isMe ? 'border-color:var(--primary-light)' : ''}">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <div class="team-dot team-dot-${team.color}"></div>
        <div style="font-weight:800;flex:1">${esc(team.name)}</div>
        ${isMe ? '<span class="badge badge-green">Đội bạn</span>' : ''}
        <span class="badge badge-grey">${(team.players||[]).length} người</span>
      </div>
      <div style="font-size:.75rem;color:var(--text-muted);margin-bottom:8px">
        Sơ đồ: <b>${formDoc?.formation || '2-3-1'}</b>
      </div>
      ${buildPitch(team, formDoc, false)}
    </div>`;
  }).join('');
}

// ─── Pitch builder ────────────────────────────────────────────────────────────
function buildFormationPicker(teamId, currentFormation) {
  return `<div class="formation-picker">
    ${Object.keys(FORMATIONS_7).map(f => `
      <button class="formation-btn${f === currentFormation ? ' active' : ''}"
        onclick="changeFormation('${teamId}','${f}')">${f}</button>
    `).join('')}
  </div>`;
}

function getLineup(team, formDoc) {
  if (formDoc?.lineup) return formDoc.lineup;
  return buildDefaultLineup(team, formDoc?.formation || '2-3-1');
}

function buildDefaultLineup(team, formation) {
  const cfg = FORMATIONS_7[formation] || FORMATIONS_7['2-3-1'];
  const slots = cfg.rows.reduce((s,r) => s + r.n, 0);
  const players = team.players || [];

  const posMap = {};
  players.forEach(p => { posMap[p.id] = rsvps[p.id]?.position || 'flex'; });

  const lineup = new Array(slots).fill(null);
  const used = new Set();

  // First pass: match by position
  let si = 0;
  cfg.rows.forEach(row => {
    for (let i = 0; i < row.n; i++) {
      const match = players.find(p => !used.has(p.id) && posMap[p.id] === row.pos);
      if (match) { lineup[si] = match.id; used.add(match.id); }
      si++;
    }
  });

  // Second pass: fill remaining with any unassigned
  si = 0;
  cfg.rows.forEach(row => {
    for (let i = 0; i < row.n; i++) {
      if (!lineup[si]) {
        const p = players.find(p => !used.has(p.id));
        if (p) { lineup[si] = p.id; used.add(p.id); }
      }
      si++;
    }
  });

  return lineup;
}

function buildPitch(team, formDoc, isEditable) {
  const formation = formDoc?.formation || '2-3-1';
  const cfg = FORMATIONS_7[formation] || FORMATIONS_7['2-3-1'];
  const lineup = getLineup(team, formDoc);
  const color = team.color || 'green';

  const playerMap = {};
  (team.players || []).forEach(p => { playerMap[p.id] = p; });

  let si = 0;
  const rowsHtml = cfg.rows.map(row => {
    const slotsHtml = [];
    for (let i = 0; i < row.n; i++) {
      const pid = lineup[si];
      const player = pid ? playerMap[pid] : null;
      const isSelected = mdSelectedSlot?.teamId === team.id
        && mdSelectedSlot?.type === 'pitch'
        && mdSelectedSlot?.key === si;
      const lastName = player ? player.name.split(' ').slice(-1)[0] : '';
      const clickAttr = isEditable
        ? `onclick="handleSlotTap('${team.id}',${si})"` : '';
      slotsHtml.push(`
        <div class="pitch-slot" ${clickAttr}>
          <div class="pitch-shirt shirt-${color}${isSelected ? ' selected' : ''}${!pid ? ' shirt-empty' : ''}">
            ${player ? initials(player.name) : '+'}
          </div>
          <div class="pitch-slot-name">${esc(lastName)}</div>
        </div>`);
      si++;
    }
    return `<div class="pitch-row-wrap">
      <div class="pitch-row-label">${row.pos}</div>
      <div class="pitch-row">${slotsHtml.join('')}</div>
    </div>`;
  });

  // Bench: players not in the starting lineup
  const lineupSet = new Set(lineup.filter(Boolean));
  const bench = (team.players || []).filter(p => !lineupSet.has(p.id));
  const benchHtml = bench.length ? `
    <div class="pitch-bench">
      <div class="pitch-bench-label">Dự bị · ${bench.length}</div>
      <div class="pitch-bench-row">
        ${bench.map(p => {
          const isSelected = mdSelectedSlot?.teamId === team.id
            && mdSelectedSlot?.type === 'bench'
            && mdSelectedSlot?.key === p.id;
          const clickAttr = isEditable ? `onclick="handleBenchTap('${team.id}','${p.id}')"` : '';
          return `<div class="bench-chip${isSelected ? ' selected' : ''}" ${clickAttr}>
            ${esc(p.name.split(' ').slice(-1)[0])}
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  return `<div class="pitch-outer">${rowsHtml.join('')}${benchHtml}</div>`;
}

// ─── Slot tap / swap ──────────────────────────────────────────────────────────
function handleSlotTap(teamId, slotIdx) {
  // Bench → pitch swap
  if (mdSelectedSlot?.type === 'bench' && mdSelectedSlot?.teamId === teamId) {
    const benchPid = mdSelectedSlot.key;
    const team = matchDayTeams.find(t => t.id === teamId);
    const formDoc = matchDayFormations[teamId];
    const lineup = [...getLineup(team, formDoc)];
    lineup[slotIdx] = benchPid;
    mdSelectedSlot = null;
    saveFormation(teamId, formDoc?.formation || '2-3-1', lineup);
    return;
  }

  // Pitch → pitch swap
  if (mdSelectedSlot?.type === 'pitch' && mdSelectedSlot?.teamId === teamId) {
    const prev = mdSelectedSlot.key;
    if (prev === slotIdx) { mdSelectedSlot = null; renderMDTab(mdActiveTab); return; }
    const team = matchDayTeams.find(t => t.id === teamId);
    const formDoc = matchDayFormations[teamId];
    const lineup = [...getLineup(team, formDoc)];
    [lineup[prev], lineup[slotIdx]] = [lineup[slotIdx], lineup[prev]];
    mdSelectedSlot = null;
    saveFormation(teamId, formDoc?.formation || '2-3-1', lineup);
    return;
  }

  // Start selection
  mdSelectedSlot = { teamId, type: 'pitch', key: slotIdx };
  renderMDTab(mdActiveTab);
}

function handleBenchTap(teamId, playerId) {
  // Pitch → bench swap
  if (mdSelectedSlot?.type === 'pitch' && mdSelectedSlot?.teamId === teamId) {
    const slotIdx = mdSelectedSlot.key;
    const team = matchDayTeams.find(t => t.id === teamId);
    const formDoc = matchDayFormations[teamId];
    const lineup = [...getLineup(team, formDoc)];
    lineup[slotIdx] = playerId;
    mdSelectedSlot = null;
    saveFormation(teamId, formDoc?.formation || '2-3-1', lineup);
    return;
  }

  // Deselect same bench chip
  if (mdSelectedSlot?.type === 'bench' && mdSelectedSlot?.teamId === teamId && mdSelectedSlot?.key === playerId) {
    mdSelectedSlot = null;
    renderMDTab(mdActiveTab);
    return;
  }

  mdSelectedSlot = { teamId, type: 'bench', key: playerId };
  renderMDTab(mdActiveTab);
}

async function changeFormation(teamId, formation) {
  const team = matchDayTeams.find(t => t.id === teamId);
  if (!team) return;
  const formDoc = matchDayFormations[teamId];
  const slots = totalSlots(formation);
  const oldLineup = getLineup(team, formDoc);

  // Carry over old lineup players as far as possible
  const used = new Set();
  const newLineup = new Array(slots).fill(null);
  for (let i = 0; i < Math.min(slots, oldLineup.length); i++) {
    if (oldLineup[i] && !used.has(oldLineup[i])) {
      newLineup[i] = oldLineup[i];
      used.add(oldLineup[i]);
    }
  }
  // Fill any empty slots from bench
  for (let i = 0; i < slots; i++) {
    if (!newLineup[i]) {
      const p = (team.players || []).find(p => !used.has(p.id));
      if (p) { newLineup[i] = p.id; used.add(p.id); }
    }
  }

  await saveFormation(teamId, formation, newLineup);
}

async function saveFormation(teamId, formation, lineup) {
  try {
    await db.collection('sessions').doc(session.id)
      .collection('formations').doc(teamId)
      .set({ formation, lineup, updatedBy: myPlayerId || null,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  } catch (e) {
    console.error(e);
    showToast(t('error'), 'error');
  }
}

// ─── Trades tab ───────────────────────────────────────────────────────────────
function renderMDTrades() {
  const el = document.getElementById('md-trades');
  if (!el) return;

  const myTeam = matchDayTeams.find(t => (t.players||[]).some(p => p.id === myPlayerId));
  const isCaptain = myTeam?.captainId === myPlayerId;

  if (!myPlayerId || !isCaptain) {
    el.innerHTML = `<div class="card" style="text-align:center;padding:20px;color:var(--text-muted)">
      <div style="font-size:2rem;margin-bottom:8px">🤝</div>
      <div style="font-weight:700;margin-bottom:4px">Đổi người giữa đội</div>
      <div style="font-size:.85rem">Chỉ đội trưởng mới có thể đề nghị trao đổi.</div>
    </div>`;
    return;
  }

  const tradesClosed = session.status !== 'teams';
  const tradeUsed = myTeam.tradeUsed || false;
  const incoming = matchDayTrades.filter(t => t.toCaptainId === myPlayerId && t.status === 'pending');
  const outgoing = matchDayTrades.filter(t => t.fromCaptainId === myPlayerId);
  const hasOpenProposal = outgoing.some(t => t.status === 'pending');

  const tokenHtml = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
    <div style="font-weight:700;font-size:.93rem">Lượt đổi của bạn:</div>
    <span class="badge ${tradeUsed ? 'badge-grey' : 'badge-green'}">${tradeUsed ? '❌ Đã dùng' : '✅ Còn 1 lượt'}</span>
  </div>`;

  const closedBanner = tradesClosed ? `
    <div style="background:var(--warning-bg);border:1px solid var(--border);border-radius:var(--radius-sm);
      padding:10px 12px;font-size:.83rem;color:var(--warning);font-weight:700;margin-bottom:12px">
      ⏰ Cửa sổ trao đổi đã đóng khi trận bắt đầu
    </div>` : '';

  const incomingHtml = incoming.length ? `
    <div class="card-title" style="margin-bottom:8px">📩 Đề nghị nhận được</div>
    ${incoming.map(trade => renderIncomingTrade(trade)).join('')}
  ` : '';

  const pastTrades = outgoing.filter(t => t.status !== 'pending');
  const outgoingHtml = outgoing.length ? `
    <div class="card-title" style="margin-bottom:8px;margin-top:${incoming.length ? '14px' : '0'}">
      📤 Đề nghị đã gửi
    </div>
    ${outgoing.map(trade => renderOutgoingTrade(trade)).join('')}
  ` : '';

  let proposeHtml = '';
  if (!tradesClosed && !tradeUsed && !hasOpenProposal) {
    if (tradeProposalOpen) {
      proposeHtml = `<div id="tradeProposalForm"></div>`;
    } else {
      proposeHtml = `<button class="btn btn-outline btn-block" style="margin-top:12px" onclick="openTradeProposal()">
        🤝 Đề nghị trao đổi cầu thủ
      </button>`;
    }
  }

  el.innerHTML = `<div class="card">${tokenHtml}${closedBanner}${incomingHtml}${outgoingHtml}${proposeHtml}</div>`;

  if (tradeProposalOpen) renderTradeProposalForm();
}

function renderIncomingTrade(trade) {
  const fromTeam = matchDayTeams.find(t => t.id === trade.fromTeamId);
  return `<div class="trade-card incoming">
    <div style="font-size:.82rem;color:var(--text-muted);margin-bottom:6px">
      Từ đội <b>${esc(fromTeam?.name || '?')}</b> (${esc(trade.fromCaptainName)})
    </div>
    <div class="trade-offer-row">
      <span class="trade-chip">🎁 ${esc(trade.offeredPlayerName)}</span>
      <span class="trade-arrow">⇄</span>
      <span class="trade-chip">🎯 ${esc(trade.wantedPlayerName)}</span>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-success btn-sm" style="flex:1" onclick="acceptTrade('${trade.id}')">✅ Chấp nhận</button>
      <button class="btn btn-danger btn-sm"  style="flex:1" onclick="declineTrade('${trade.id}')">❌ Từ chối</button>
    </div>
  </div>`;
}

function renderOutgoingTrade(trade) {
  const toTeam = matchDayTeams.find(t => t.id === trade.toTeamId);
  const statusBadge =
    trade.status === 'pending'  ? '<span class="badge badge-yellow">⏳ Chờ phản hồi</span>' :
    trade.status === 'accepted' ? '<span class="badge badge-green">✅ Đã chấp nhận</span>' :
    '<span class="badge badge-red">❌ Đã từ chối</span>';

  return `<div class="trade-card ${trade.status === 'accepted' ? 'accepted' : trade.status === 'declined' ? 'declined' : ''}">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <div style="font-size:.82rem;color:var(--text-muted)">Đến: <b>${esc(toTeam?.name || '?')}</b></div>
      ${statusBadge}
    </div>
    <div class="trade-offer-row">
      <span class="trade-chip">🎁 ${esc(trade.offeredPlayerName)}</span>
      <span class="trade-arrow">⇄</span>
      <span class="trade-chip">🎯 ${esc(trade.wantedPlayerName)}</span>
    </div>
    ${trade.status === 'declined' ? `
      <button class="btn btn-ghost btn-sm btn-block" style="margin-top:6px" onclick="cancelTrade('${trade.id}')">
        Xoá và đề nghị lại
      </button>` : ''}
  </div>`;
}

// ─── Trade proposal form ──────────────────────────────────────────────────────
function openTradeProposal() {
  tradeProposalOpen = true;
  renderMDTrades();
}

function closeTradeProposal() {
  tradeProposalOpen = false;
  renderMDTrades();
}

function renderTradeProposalForm() {
  const el = document.getElementById('tradeProposalForm');
  if (!el) return;

  const myTeam = matchDayTeams.find(t => (t.players||[]).some(p => p.id === myPlayerId));
  if (!myTeam) return;

  const otherTeams = matchDayTeams.filter(t => t.id !== myTeam.id);
  const myTradeable = (myTeam.players || []).filter(p => p.id !== myTeam.captainId);

  el.innerHTML = `<div style="border-top:1px solid var(--border);padding-top:14px;margin-top:12px">
    <div class="card-title" style="margin-bottom:10px">🤝 Đề nghị trao đổi mới</div>

    <div class="form-group">
      <label class="form-label">Tôi sẽ đưa đi</label>
      <div class="form-select-wrap">
        <select class="form-select" id="tradeOfferSel">
          <option value="">-- Chọn cầu thủ của bạn --</option>
          ${myTradeable.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">Từ đội</label>
      <div class="form-select-wrap">
        <select class="form-select" id="tradeTeamSel" onchange="renderTradeTargetPlayers()">
          <option value="">-- Chọn đội --</option>
          ${otherTeams.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="form-group" id="tradeWantWrap" style="display:none">
      <label class="form-label">Tôi muốn nhận</label>
      <div class="form-select-wrap">
        <select class="form-select" id="tradeWantSel">
          <option value="">-- Chọn cầu thủ --</option>
        </select>
      </div>
    </div>

    <div style="display:flex;gap:8px;margin-top:4px">
      <button class="btn btn-success" style="flex:1" onclick="submitTradeProposal()">Gửi đề nghị</button>
      <button class="btn btn-ghost" onclick="closeTradeProposal()">Huỷ</button>
    </div>
  </div>`;
}

function renderTradeTargetPlayers() {
  const teamId = document.getElementById('tradeTeamSel')?.value;
  const wrap = document.getElementById('tradeWantWrap');
  const sel = document.getElementById('tradeWantSel');
  if (!wrap || !sel) return;
  if (!teamId) { wrap.style.display = 'none'; return; }

  const targetTeam = matchDayTeams.find(t => t.id === teamId);
  const tradeable = (targetTeam?.players || []).filter(p => p.id !== targetTeam.captainId);
  sel.innerHTML = '<option value="">-- Chọn cầu thủ --</option>' +
    tradeable.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  wrap.style.display = '';
}

async function submitTradeProposal() {
  const offerPid  = document.getElementById('tradeOfferSel')?.value;
  const toTeamId  = document.getElementById('tradeTeamSel')?.value;
  const wantPid   = document.getElementById('tradeWantSel')?.value;

  if (!offerPid || !toTeamId || !wantPid) {
    showToast('Điền đầy đủ thông tin!', 'error'); return;
  }

  const myTeam     = matchDayTeams.find(t => (t.players||[]).some(p => p.id === myPlayerId));
  const targetTeam = matchDayTeams.find(t => t.id === toTeamId);
  if (!myTeam || !targetTeam) return;

  const offerPlayer = (myTeam.players || []).find(p => p.id === offerPid);
  const wantPlayer  = (targetTeam.players || []).find(p => p.id === wantPid);
  if (!offerPlayer || !wantPlayer) return;

  try {
    await db.collection('sessions').doc(session.id).collection('trades').add({
      fromTeamId:        myTeam.id,
      fromCaptainId:     myPlayerId,
      fromCaptainName:   rsvps[myPlayerId]?.playerName || myTeam.captainName,
      toTeamId,
      toCaptainId:       targetTeam.captainId,
      toCaptainName:     targetTeam.captainName,
      offeredPlayerId:   offerPid,
      offeredPlayerName: offerPlayer.name,
      wantedPlayerId:    wantPid,
      wantedPlayerName:  wantPlayer.name,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('sessions').doc(session.id).collection('chat').add({
      type: 'system',
      message: `🤝 ${myTeam.name} đề nghị trao đổi với ${targetTeam.name}`,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    tradeProposalOpen = false;
    showToast('Đã gửi đề nghị trao đổi!', 'success');
  } catch (e) {
    console.error(e);
    showToast(t('error'), 'error');
  }
}

// ─── Trade accept / decline ───────────────────────────────────────────────────
async function acceptTrade(tradeId) {
  const trade = matchDayTrades.find(t => t.id === tradeId);
  if (!trade || trade.status !== 'pending') return;

  const fromTeam = matchDayTeams.find(t => t.id === trade.fromTeamId);
  const toTeam   = matchDayTeams.find(t => t.id === trade.toTeamId);
  if (!fromTeam || !toTeam) return;

  const offeredPlayer = (fromTeam.players || []).find(p => p.id === trade.offeredPlayerId);
  const wantedPlayer  = (toTeam.players  || []).find(p => p.id === trade.wantedPlayerId);

  if (!offeredPlayer) { showToast('Cầu thủ đề nghị không còn trong đội!', 'error'); return; }
  if (!wantedPlayer)  { showToast('Cầu thủ bạn muốn không còn trong đội!', 'error'); return; }

  try {
    const batch  = db.batch();
    const sessRef = db.collection('sessions').doc(session.id);

    batch.update(sessRef.collection('trades').doc(tradeId), { status: 'accepted' });
    batch.update(sessRef.collection('teams').doc(trade.fromTeamId), { tradeUsed: true });

    // Swap players between teams
    const newFromPlayers = fromTeam.players.filter(p => p.id !== trade.offeredPlayerId);
    const newToPlayers   = toTeam.players.filter(p => p.id !== trade.wantedPlayerId);
    newFromPlayers.push({ id: wantedPlayer.id, name: wantedPlayer.name });
    newToPlayers.push({ id: offeredPlayer.id, name: offeredPlayer.name });

    batch.update(sessRef.collection('teams').doc(trade.fromTeamId), { players: newFromPlayers });
    batch.update(sessRef.collection('teams').doc(trade.toTeamId),   { players: newToPlayers });

    // Update formations if they exist
    const fromForm = matchDayFormations[trade.fromTeamId];
    if (fromForm?.lineup) {
      const lineup = fromForm.lineup.map(pid => pid === trade.offeredPlayerId ? trade.wantedPlayerId : pid);
      batch.set(sessRef.collection('formations').doc(trade.fromTeamId), { ...fromForm, lineup }, { merge: true });
    }
    const toForm = matchDayFormations[trade.toTeamId];
    if (toForm?.lineup) {
      const lineup = toForm.lineup.map(pid => pid === trade.wantedPlayerId ? trade.offeredPlayerId : pid);
      batch.set(sessRef.collection('formations').doc(trade.toTeamId), { ...toForm, lineup }, { merge: true });
    }

    await batch.commit();
    await sessRef.collection('chat').add({
      type: 'system',
      message: `🤝 Trao đổi thành công! ${trade.offeredPlayerName} ↔ ${trade.wantedPlayerName}`,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast('Trao đổi thành công!', 'success');
  } catch (e) {
    console.error(e);
    showToast(t('error'), 'error');
  }
}

async function declineTrade(tradeId) {
  try {
    await db.collection('sessions').doc(session.id)
      .collection('trades').doc(tradeId).update({ status: 'declined' });
    showToast('Đã từ chối trao đổi', '');
  } catch (e) { showToast(t('error'), 'error'); }
}

async function cancelTrade(tradeId) {
  try {
    await db.collection('sessions').doc(session.id)
      .collection('trades').doc(tradeId).delete();
  } catch (e) { showToast(t('error'), 'error'); }
}
