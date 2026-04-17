// ─── State ────────────────────────────────────────────────────────────────────
let rotDoc = null;
let teams = {};  // { teamId: teamData }
let timerInterval = null;
let unsubRotation = null;
const MATCH_DURATION = 15 * 60; // 15 minutes in seconds

// ─── Init ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  await loadBoard();
  // Auto-refresh every 30s as fallback
  setInterval(() => {
    document.getElementById('refreshInfo').textContent =
      'Updated ' + fmtTime(new Date());
  }, 30000);
});

async function loadBoard() {
  const session = await getActiveSession();
  hide('loadingState');

  if (!session || !['playing', 'done'].includes(session.status)) {
    show('idleState');
    if (session) {
      const satDate = session.date.toDate ? session.date.toDate() : new Date(session.date);
      document.getElementById('idleSession').textContent = fmtDate(satDate);
      document.getElementById('idleMsg').textContent =
        session.status === 'rsvp' ? 'RSVP đang mở · Chưa tạo đội' :
        session.status === 'locked' ? 'RSVP đã khoá · Chờ tạo đội' :
        session.status === 'teams' ? 'Đội đã sẵn sàng · Chờ bắt đầu' : '⏳';
    } else {
      document.getElementById('idleMsg').textContent = 'Chưa có buổi đá';
    }
    return;
  }

  // Load teams
  const teamsSnap = await db.collection('sessions').doc(session.id).collection('teams').get();
  teamsSnap.docs.forEach(d => { teams[d.id] = { id: d.id, ...d.data() }; });

  show('liveContent');
  subscribeRotation(session.id);
}

function subscribeRotation(sessionId) {
  if (unsubRotation) unsubRotation();
  unsubRotation = db.collection('sessions').doc(sessionId)
    .collection('state').doc('rotation')
    .onSnapshot(snap => {
      if (!snap.exists) return;
      rotDoc = snap.data();
      renderBoard();
    });
}

function renderBoard() {
  if (!rotDoc) return;
  const { format, onCourtA, onCourtB, resting, matchHistory, currentMatchStart, status, schedule, currentMatchIndex } = rotDoc;

  const teamA = teams[onCourtA];
  const teamB = teams[onCourtB];
  const teamRest = resting ? teams[resting] : null;

  // Court card
  if (teamA) {
    document.getElementById('teamA').textContent = teamA.name;
    document.getElementById('teamA').className = 'court-team ' + colorClass(teamA.color);
  }
  if (teamB) {
    document.getElementById('teamB').textContent = teamB.name;
    document.getElementById('teamB').className = 'court-team ' + colorClass(teamB.color);
  }

  // Timer
  clearInterval(timerInterval);
  if (status === 'playing' && currentMatchStart) {
    const startTs = currentMatchStart.toDate ? currentMatchStart.toDate() : new Date(currentMatchStart);
    timerInterval = setInterval(() => updateTimer(startTs), 500);
    updateTimer(startTs);
  } else {
    document.getElementById('matchTimer').textContent = '15:00';
    document.getElementById('matchTimer').className = 'board-timer';
  }

  // Next / resting
  if (format === '3team' && teamRest) {
    document.getElementById('nextTeam').textContent = teamRest.name;
    document.getElementById('nextTeam').className = 'next-team ' + colorClass(teamRest.color);
    document.getElementById('restTeam').textContent = '—';
    document.getElementById('nextLabel').textContent = 'TIẾP THEO';
    document.getElementById('restLabel').textContent = 'NGHỈ';
  }

  // History
  renderHistory(matchHistory || []);

  // 4-team schedule
  if (format === '4team' && schedule) {
    show('scheduleSection');
    renderSchedule(schedule, currentMatchIndex || 0);
  }
}

function updateTimer(startTs) {
  const elapsed = Math.floor((Date.now() - startTs.getTime()) / 1000);
  const remaining = MATCH_DURATION - elapsed;
  const timerEl = document.getElementById('matchTimer');

  if (remaining >= 0) {
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    timerEl.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    timerEl.className = 'board-timer timer-running';
  } else {
    const overtime = -remaining;
    const m = Math.floor(overtime / 60);
    const s = overtime % 60;
    timerEl.textContent = '+' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    timerEl.className = 'board-timer timer-overtime';
  }
}

function renderHistory(history) {
  const el = document.getElementById('historyList');
  if (!history.length) {
    el.innerHTML = '<div style="opacity:.4;font-size:.85rem">Chưa có trận nào</div>';
    return;
  }
  el.innerHTML = history.slice().reverse().slice(0, 6).map((m, i) => {
    const tA = teams[m.teamA];
    const tB = teams[m.teamB];
    const winner = m.winnerId ? teams[m.winnerId] : null;
    const num = history.length - i;
    return `<div class="match-history-item" style="background:rgba(255,255,255,.03);border-color:rgba(255,255,255,.08);color:#fff;margin-bottom:5px">
      <span class="history-num" style="color:rgba(255,255,255,.35)">#${num}</span>
      <span class="history-teams">${tA ? tA.name : '?'} vs ${tB ? tB.name : '?'}</span>
      ${winner ? `<span class="history-winner">🏆 ${winner.name}</span>` : '<span style="opacity:.4;font-size:.78rem">Draw</span>'}
    </div>`;
  }).join('');
}

function renderSchedule(schedule, currentIdx) {
  const el = document.getElementById('scheduleList');
  el.innerHTML = schedule.map((m, i) => {
    const tA = teams[m.teamA];
    const tB = teams[m.teamB];
    const done = m.winnerId || i < currentIdx;
    const current = i === currentIdx;
    const winner = m.winnerId ? teams[m.winnerId] : null;
    return `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.06);${current ? 'color:#95d5b2;font-weight:700' : done ? 'opacity:.45' : 'opacity:.7'}">
      <span style="font-size:.75rem;opacity:.5;width:24px">R${m.round || i+1}</span>
      <span style="flex:1">${tA ? tA.name : '?'} vs ${tB ? tB.name : '?'}</span>
      ${winner ? `<span style="color:#a5d6a7;font-size:.8rem">🏆 ${winner.name}</span>` : current ? '<span style="color:#95d5b2;font-size:.78rem">▶ NOW</span>' : ''}
    </div>`;
  }).join('');
}

function show(id) { const el = document.getElementById(id); if (el) el.style.display = ''; }
function hide(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
