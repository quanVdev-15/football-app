const LANG_KEY     = 'bdt7_lang';
const IDENTITY_KEY = 'bdt7_player';
const DEFAULT_CAP  = 21;

// Auth gate — redirect to login if no identity saved
(function guardAuth() {
  try {
    const saved = localStorage.getItem(IDENTITY_KEY);
    if (!saved) { window.location.replace('/login.html'); return; }
    const p = JSON.parse(saved);
    if (!p.name || !p.playerId) window.location.replace('/login.html');
  } catch (_) {
    window.location.replace('/login.html');
  }
})();

const txt = {
  vi: {
    thisWeek: 'Tuần này',
    loading: 'Đang tải...',
    noSessionTitle: 'Chưa có buổi đá',
    noSessionBody: 'Admin mở poll để mọi người đăng ký.',
    players: 'RSVP',
    tapToVote: 'Xem ai đi đá và chọn tên của bạn trong poll.',
    yourStatus: 'RSVP của bạn',
    teams: 'Đội hình',
    teamsReadyText: 'Đội đã được admin mở khóa.',
    seeTeams: 'Xem đội',
    goingNow: 'Danh sách đi đá',
    chooseYourStatus: 'Poll RSVP',
    chooseYourStatusText: 'Chọn tên của bạn để vào hoặc rời danh sách.',
    yourTeam: 'Đội của bạn',
    teammates: 'Đồng đội',
    playerUnit: 'cầu thủ',
    gkReady: 'GK',
    subs: 'Dự bị',
    otherTeams: 'Đội khác',
    allTeams: 'Tất cả đội',
    teamMateReady: 'Đội đã chốt. Đây là những người được chọn vào đội của bạn.',
    teamMatePending: 'Poll đã khóa. Đội đang được admin tạo.',
    you: 'Bạn',
    going: 'Đi',
    notGoing: 'Không đi',
    goingSelf: 'Hủy đăng ký',
    notGoingSelf: 'Đăng ký đi đá',
    gk: 'GK',
    open: 'Open',
    full: 'Full',
    teamsReady: 'Teams Ready',
    spotsOpen: 'Còn chỗ',
    locked: 'Locked',
    saved: 'Đã lưu',
    fullMsg: 'Danh sách đã đủ người.',
    closedMsg: 'Poll đã khóa.',
    emptyPlayers: 'Chưa có cầu thủ.',
    emptyGoing: 'Chưa ai đăng ký',
    emptyTeam: 'Chưa có cầu thủ',
  },
  en: {
    thisWeek: 'This week',
    loading: 'Loading...',
    noSessionTitle: 'No session yet',
    noSessionBody: 'Admin opens the poll for players to vote.',
    players: 'RSVP',
    tapToVote: 'See who is going and choose your name in the poll.',
    yourStatus: 'Your RSVP',
    teams: 'Teams',
    teamsReadyText: 'Teams are unlocked by admin.',
    seeTeams: 'See Teams',
    goingNow: 'Going list',
    chooseYourStatus: 'RSVP Poll',
    chooseYourStatusText: 'Tap your name to join or leave the list.',
    yourTeam: 'Your Team',
    teammates: 'Team mates',
    playerUnit: 'players',
    gkReady: 'GK',
    subs: 'Subs',
    otherTeams: 'Other Teams',
    allTeams: 'All Teams',
    teamMateReady: 'Teams are locked. These are the guys selected with you.',
    teamMatePending: 'Poll is locked. Admin is creating the teams.',
    you: 'You',
    going: 'Going',
    notGoing: 'Not Going',
    goingSelf: 'Cancel RSVP',
    notGoingSelf: 'Join session',
    gk: 'GK',
    open: 'Open',
    full: 'Full',
    teamsReady: 'Teams Ready',
    spotsOpen: 'Spots open',
    locked: 'Locked',
    saved: 'Saved',
    fullMsg: 'The list is full.',
    closedMsg: 'Poll is locked.',
    emptyPlayers: 'No players yet.',
    emptyGoing: 'Nobody is going yet.',
    emptyTeam: 'No players yet',
  }
};

const lang = 'vi';
let session = null;
let rsvps = {};
let teams = [];
let activeTeamPageId = null;
const revealedTeamIds = new Set();
let unsubSession = null;
let unsubRsvps = null;
let unsubTeams = null;

window.addEventListener('DOMContentLoaded', init);

async function init() {
  document.documentElement.lang = lang;
  applyI18n();

  try {
    const config = await db.collection('config').doc('app').get();
    const configData = config.exists ? config.data() : {};

    // Load event banner if a friendly is live (but still show the poll)
    if (configData.currentEventId) {
      db.collection('events').doc(configData.currentEventId).get().then(evDoc => {
        if (evDoc.exists) renderEventBanner(evDoc.data());
      });
    }

    session = await getActiveSession();
    hide('loadingState');

    if (!session) {
      show('emptyState');
      return;
    }

    show('pollContent');
    renderStaticSession();
    subscribeSession();
    subscribeRsvps();
    subscribeTeams();
  } catch (error) {
    console.error(error);
    hide('loadingState');
    show('emptyState');
  }
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
}

function t(key) {
  return txt[lang][key] || txt.en[key] || key;
}

function renderEventBanner(ev) {
  const banner = document.getElementById('eventBanner');
  if (!banner) return;
  const d = ev.date?.toDate ? ev.date.toDate() : new Date(ev.date);
  const dateStr = d.toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric', month: 'numeric' });
  const meta = [dateStr, ev.time, ev.location].filter(Boolean).join(' · ');
  banner.innerHTML = `
    <div class="event-banner-card">
      <span class="event-banner-dot"></span>
      <div class="event-banner-body">
        <p class="event-banner-label">Giao hữu hôm nay</p>
        <p class="event-banner-title">vs ${esc(ev.opponent || 'TBD')}</p>
        ${meta ? `<p class="event-banner-meta">${esc(meta)}</p>` : ''}
        ${ev.note ? `<p class="event-banner-meta">${esc(ev.note)}</p>` : ''}
      </div>
    </div>
  `;
  banner.hidden = false;
}

// Shares its "is this session still active" rule with the admin site's
// getAdminActiveSession() via js/session-utils.js's canReuseSession() — a
// session that's past its date (even if never explicitly closed) should stop
// showing up as an open poll here too.
async function getActiveSession() {
  const config = await db.collection('config').doc('app').get();
  const currentSessionId = config.exists ? config.data().currentSessionId : null;
  if (currentSessionId) {
    const doc = await db.collection('sessions').doc(currentSessionId).get();
    if (doc.exists) {
      const session = { id: doc.id, ...doc.data() };
      if (canReuseSession(session)) return session;
    }
  }
  return null;
}

function subscribeSession() {
  if (unsubSession) unsubSession();
  unsubSession = db.collection('sessions').doc(session.id).onSnapshot(doc => {
    if (!doc.exists) return;
    session = { id: doc.id, ...doc.data() };
    renderAll();
  });
}

function subscribeRsvps() {
  if (unsubRsvps) unsubRsvps();
  unsubRsvps = db.collection('sessions').doc(session.id).collection('rsvps').onSnapshot(snap => {
    rsvps = {};
    snap.docs.forEach(doc => {
      rsvps[doc.id] = { id: doc.id, ...doc.data() };
    });
    renderAll();
  });
}

function subscribeTeams() {
  if (unsubTeams) unsubTeams();
  unsubTeams = db.collection('sessions').doc(session.id).collection('teams').onSnapshot(snap => {
    teams = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => teamOrder(a.id) - teamOrder(b.id));
    renderAll();
  });
}

function renderAll() {
  if (!session) return;
  applyI18n();
  renderStaticSession();
  renderPageMode();
  renderCounter();
  renderMyRsvp();
  renderGoingList();
  renderTeams();
}

function renderStaticSession() {
  const date = toDate(session.date || session.saturdayDate || session.id);
  document.getElementById('sessionDate').textContent = date ? fmtDate(date) : '--';
}

function renderCounter() {
  const cap = getCap();
  const allGoing = sortedGoingByTime();
  const starterCount = Math.min(allGoing.length, cap);
  const subsCount = Math.max(0, allGoing.length - cap);
  const isReady = isTeamsReady();
  const isFull = !isReady && starterCount >= cap;

  const counterText = subsCount > 0
    ? `${starterCount} / ${cap} ${t('going')} + ${subsCount} ${t('subs').toLowerCase()}`
    : `${allGoing.length} / ${cap} ${t('going')}`;

  document.getElementById('goingCount').textContent = counterText;
  document.getElementById('lockText').textContent = isLockedStatus() ? t('locked') : (isFull ? t('full') : t('spotsOpen'));
  document.getElementById('progressFill').style.width = `${Math.min(100, Math.round((starterCount / cap) * 100))}%`;
  document.getElementById('counterCard').classList.toggle('is-full', isFull);

  const badge = document.getElementById('statusBadge');
  const status = statusLabel();
  badge.textContent = status.label;
  badge.className = `status-badge ${status.className}`;

  document.getElementById('seeTeamsBtn').hidden = true;
}

function renderPageMode() {
  const teamMateMode = isTeamMateMode();
  // In team mode hide all poll UI — only teams section + pay button show
  document.getElementById('counterCard').hidden = teamMateMode;
  document.getElementById('myRsvpBlock').hidden = teamMateMode || shouldHideMyRsvp();
  document.getElementById('goingListBlock').hidden = teamMateMode;

}

function renderMyRsvp() {
  const block = document.getElementById('myRsvpBlock');
  if (block.hidden) return;

  const identity = currentIdentity();
  const myRsvp = currentPlayerRsvp(identity);
  const going = isGoing(myRsvp);
  const btn = document.getElementById('myRsvpBtn');

  if (going) {
    btn.textContent = t('goingSelf');
  } else if (goingPlayers().length >= getCap()) {
    btn.textContent = 'Đăng ký dự bị';  // "Join as sub"
  } else {
    btn.textContent = t('notGoingSelf');
  }
  btn.classList.toggle('is-going', going);
  btn.onclick = toggleMyRsvp;
}

function renderGoingList() {
  const list = document.getElementById('goingListItems');
  if (isTeamMateMode()) {
    list.innerHTML = '';
    return;
  }

  const identity = currentIdentity();
  const allGoing = sortedGoingByTime();
  const cap = getCap();
  const starters = allGoing.slice(0, cap);
  const subs = allGoing.slice(cap);

  document.getElementById('goingListBadge').textContent = allGoing.length;

  if (!allGoing.length) {
    list.innerHTML = `<li class="going-empty">${t('emptyGoing')}</li>`;
    return;
  }

  const starterHtml = starters.map((player, index) => {
    const isMe = isCurrentPlayer(player, identity);
    const isGk = isPlayerGk(player);
    return `<li class="name-chip ${isMe ? 'is-me' : ''}" style="--stagger:${index}">
      <span class="name-chip-num">${String(index + 1).padStart(2, '0')}</span>
      <span class="name-chip-text">${esc(playerName(player) || '?')}</span>
      ${isGk ? `<span class="name-chip-gk">GK</span>` : ''}
      ${isMe ? `<span class="name-chip-you">Bạn</span>` : ''}
    </li>`;
  }).join('');

  const subsHtml = subs.length ? `
    <li class="subs-divider" style="--stagger:${starters.length}">
      <span class="subs-divider-text">${t('subs')} (${subs.length})</span>
    </li>
    ${subs.map((player, index) => {
      const isMe = isCurrentPlayer(player, identity);
      const isGk = isPlayerGk(player);
      return `<li class="name-chip is-sub ${isMe ? 'is-me' : ''}" style="--stagger:${starters.length + 1 + index}">
        <span class="name-chip-num sub-num">S${String(index + 1).padStart(1, '0')}</span>
        <span class="name-chip-text">${esc(playerName(player) || '?')}</span>
        ${isGk ? `<span class="name-chip-gk">GK</span>` : ''}
        ${isMe ? `<span class="name-chip-you">Bạn</span>` : ''}
      </li>`;
    }).join('')}
  ` : '';

  list.innerHTML = starterHtml + subsHtml;
}

function renderTeams() {
  const section = document.getElementById('teamsSection');
  const stack = document.getElementById('teamCards');
  const teamMateMode = isTeamMateMode();
  section.hidden = !teamMateMode;
  if (!teamMateMode) return;

  if (!teams.length) {
    stack.innerHTML = `
      <article class="teammate-hero reveal-stage">
        <div class="reveal-mark" aria-hidden="true"></div>
        <div class="teammate-kicker">${t('teamsReady')}</div>
        <h3>Đang chia đội</h3>
        <p>Poll đã khóa. Đội hình sẽ xuất hiện ở đây khi admin random xong.</p>
      </article>
    `;
    return;
  }

  const normalized = visibleTeams();
  const identity = currentIdentity();
  const myTeam = identity ? normalized.find(team => allTeamPlayers(team).some(player => isCurrentPlayer(player, identity))) : null;
  const preferredTeam = myTeam || normalized[0];

  if (!activeTeamPageId || !normalized.some(team => team.id === activeTeamPageId)) {
    activeTeamPageId = preferredTeam?.id || null;
  }

  const activeTeam = normalized.find(team => team.id === activeTeamPageId) || preferredTeam;
  const activeIndex = Math.max(0, normalized.findIndex(team => team.id === activeTeam.id));
  const isMine = !!myTeam && activeTeam.id === myTeam.id;

  stack.innerHTML = `
    ${renderTeamSheet(activeTeam, identity, {
      isMine,
      page: activeIndex + 1,
      total: normalized.length,
    })}
    ${normalized.length > 1 ? renderTeamPager(activeIndex + 1, normalized.length, isMine) : ''}
  `;

  stack.querySelectorAll('[data-team-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      const direction = btn.dataset.teamNav === 'next' ? 1 : -1;
      const nextIndex = (activeIndex + direction + normalized.length) % normalized.length;
      activeTeamPageId = normalized[nextIndex].id;
      renderTeams();
    });
  });
}

function renderTeamSheet(team, identity, meta) {
  const players = teamMainPlayers(team);
  const subs = teamSubs(team);
  return `
    <article class="teammate-hero team-sheet ${teamColorClass(team)}">
      <div class="team-hero-top">
        <div>
          <div class="teammate-kicker">${meta.isMine ? 'Đội của bạn tuần này' : 'Đội khác'}</div>
          <h3>${esc(team.name || `Team ${team.id}`)}</h3>
        </div>
        <span class="team-swatch" aria-hidden="true"></span>
      </div>
      <div class="team-meta-row">
        <span class="teammate-count">${players.length} ${t('playerUnit')}</span>
        ${teamGkCount(team) ? `<span class="team-gk-count">${teamGkCount(team)} ${t('gkReady')}</span>` : ''}
        <span class="team-page-pill">${meta.page} / ${meta.total}</span>
      </div>
      <ul class="team-simple-list">
        ${players.map((player, i) => {
          const isMe = isCurrentPlayer(player, identity);
          return `<li class="team-simple-row ${isMe ? 'is-me' : ''}">
            <span class="team-simple-num">${String(i + 1).padStart(2, '0')}</span>
            <span class="team-simple-name">${esc(playerName(player))}</span>
            <span class="team-simple-badges">
              ${isMe ? `<span class="you-badge">${t('you')}</span>` : ''}
              ${isPlayerGk(player) ? `<span class="gk-badge">${t('gk')}</span>` : ''}
            </span>
          </li>`;
        }).join('')}
      </ul>
      ${subs.length ? renderSubs(team, identity) : ''}
    </article>
  `;
}

function renderTeamPager(page, total, isMine) {
  return `
    <div class="team-pager" aria-label="Team navigation">
      <button class="team-page-btn" type="button" data-team-nav="prev" aria-label="Previous team">‹</button>
      <span>${isMine ? 'Đội của bạn' : 'Đội khác'} · ${page}/${total}</span>
      <button class="team-page-btn" type="button" data-team-nav="next" aria-label="Next team">›</button>
    </div>
  `;
}

function renderCompactTeam(team, teamIndex) {
  return `
    <article class="team-card showcase-team ${teamColorClass(team)}" style="--stagger: ${teamIndex}">
      <div class="compact-team-head">
        <span class="team-swatch" aria-hidden="true"></span>
        <h3>${esc(team.name || `Team ${team.id}`)}</h3>
        <span class="pill">${teamMainPlayers(team).length}</span>
      </div>
      ${teamGkCount(team) ? `<div class="compact-team-meta">${teamGkCount(team)} ${t('gkReady')}</div>` : ''}
      <ul class="showcase-list">
        ${teamMainPlayers(team).length ? teamMainPlayers(team).map((player, playerIndex) => renderTeamPlayer(player, playerIndex)).join('') : `<li>${t('emptyTeam')}</li>`}
      </ul>
      ${teamSubs(team).length ? renderSubs(team) : ''}
    </article>
  `;
}

function renderTeamPitch(team, identity, revealed = false) {
  const players = teamMainPlayers(team);
  if (!players.length) {
    return `<div class="team-pitch-empty">${t('emptyTeam')}</div>`;
  }

  const rows = pitchRows(players);
  const positions = pitchPositions(rows);
  const revealPlayers = revealOrder(players, identity);
  return `
    <div class="team-reveal-stage" style="--count: ${players.length}">
      <div class="reveal-title">Đội của bạn tuần này</div>
      <div class="reveal-shirt-line">
        ${revealPlayers.map(({ player, index }, revealIndex) => renderRevealCard(player, revealIndex, isCurrentPlayer(player, identity), players.length, positions[index], revealed)).join('')}
      </div>
      ${revealed ? '' : `<button class="reveal-team-btn" type="button" data-reveal-team>Reveal team</button>`}
    </div>
    <div class="team-pitch ${revealed ? '' : 'is-waiting'}" style="--count: ${players.length}" aria-label="${escAttr(team.name || `Team ${team.id}`)}">
      <div class="pitch-line center"></div>
      <div class="pitch-box top"></div>
      <div class="pitch-box bottom"></div>
      ${rows.map((row, rowIndex) => `
        <div class="pitch-row pitch-row-${row.length}" style="--row: ${rowIndex}">
          ${row.map(({ player, index }) => renderPitchPlayer(player, index, isCurrentPlayer(player, identity))).join('')}
        </div>
      `).join('')}
    </div>
  `;
}

function renderRevealCard(player, playerIndex, isMe = false, total = 1, position = { x: 50, y: 50 }, revealed = false) {
  return `
    <div class="reveal-card ${isMe ? 'is-me' : ''}" style="--reveal: ${playerIndex}; --fan: ${playerIndex - ((total - 1) / 2)}; --target-x: ${position.x}%; --target-y: ${position.y}%">
      <span class="shirt-icon">
        <span class="shirt-number">${revealed ? String(playerIndex + 1).padStart(2, '0') : '?'}</span>
      </span>
      <span class="reveal-player-name">${esc(playerName(player))}</span>
      <span class="reveal-player-badges">
        ${isPlayerGk(player) ? `<span class="gk-badge">${t('gk')}</span>` : ''}
        ${isMe ? `<span class="you-badge">${t('you')}</span>` : ''}
      </span>
    </div>
  `;
}

function renderPitchPlayer(player, playerIndex, isMe = false) {
  return `
    <div class="pitch-player ${isMe ? 'is-me' : ''}" style="--reveal: ${playerIndex}">
      <span class="shirt-icon pitch-shirt">
        <span class="shirt-number">${String(playerIndex + 1).padStart(2, '0')}</span>
      </span>
      <span class="pitch-name">${esc(playerName(player))}</span>
      <span class="pitch-badges">
        ${isMe ? `<span class="you-badge">${t('you')}</span>` : ''}
        ${isPlayerGk(player) ? `<span class="gk-badge">${t('gk')}</span>` : ''}
      </span>
    </div>
  `;
}

function pitchRows(players) {
  const indexed = players.map((player, index) => ({ player, index }));
  const gks = indexed.filter(item => isPlayerGk(item.player));
  const field = indexed.filter(item => !isPlayerGk(item.player));
  const firstRow = gks.length ? [gks[0]] : field.splice(0, 1);
  const rest = [...gks.slice(1), ...field];
  const rows = firstRow.length ? [firstRow] : [];

  if (rest.length <= 3) return [...rows, rest].filter(Boolean);
  if (rest.length <= 6) return [...rows, rest.slice(0, 3), rest.slice(3)].filter(row => row.length);
  return [...rows, rest.slice(0, 3), rest.slice(3, 6), rest.slice(6)].filter(row => row.length);
}

function pitchPositions(rows) {
  const rowCount = rows.length || 1;
  const positions = {};
  rows.forEach((row, rowIndex) => {
    const y = rowCount === 1 ? 50 : 15 + (rowIndex * (70 / (rowCount - 1)));
    row.forEach(({ index }, colIndex) => {
      const x = row.length === 1 ? 50 : 18 + (colIndex * (64 / (row.length - 1)));
      positions[index] = { x: Math.round(x), y: Math.round(y) };
    });
  });
  return positions;
}

function revealOrder(players, identity) {
  const indexed = players.map((player, index) => ({ player, index }));
  const me = indexed.find(item => isCurrentPlayer(item.player, identity));
  const others = indexed.filter(item => item !== me);
  const shuffled = shuffleStable(others, session?.id || '');
  return me ? [me, ...shuffled] : shuffled;
}

function shuffleStable(items, seedValue) {
  const withScores = items.map((item, index) => ({
    item,
    score: hashString(`${seedValue}:${playerId(item.player) || playerName(item.player)}:${index}`),
  }));
  return withScores.sort((a, b) => a.score - b.score).map(entry => entry.item);
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function renderSubs(team, identity = null) {
  return `
    <div class="subs-block">
      <div class="subs-label">${t('subs')}</div>
      <ul class="showcase-list subs-list">
        ${teamSubs(team).map((player, playerIndex) => renderTeamPlayer(player, playerIndex, isCurrentPlayer(player, identity), true)).join('')}
      </ul>
    </div>
  `;
}

function renderTeamPlayer(player, playerIndex, isMe = false, isSub = false) {
  return `
    <li class="showcase-player ${isMe ? 'is-me' : ''} ${isSub ? 'is-sub' : ''}" style="--stagger: ${playerIndex}">
      <span class="roster-number">${isSub ? '↩' : String(playerIndex + 1).padStart(2, '0')}</span>
      <span class="player-avatar">${initials(playerName(player))}</span>
      <span class="team-player-name">${esc(playerName(player))}</span>
      <span class="team-player-badges">
        ${isMe ? `<span class="you-badge">${t('you')}</span>` : ''}
        ${isPlayerGk(player) ? `<span class="gk-badge">${t('gk')}</span>` : ''}
      </span>
    </li>
  `;
}

async function toggleMyRsvp() {
  const identity = currentIdentity();
  const pid = identity?.playerId;
  if (!session || !identity || !pid) return;

  const current = currentPlayerRsvp(identity);
  const currentlyGoing = isGoing(current);

  if (isTeamsReady() || isLockedStatus() || (session?.status === 'full' && !currentlyGoing)) {
    toast(t('closedMsg'), 'error');
    return;
  }

  await db.collection('sessions').doc(session.id).collection('rsvps').doc(pid).set({
    playerId: pid,
    playerName: identity.name || '',
    phone: identity.phone || '',
    status: currentlyGoing ? 'out' : 'in',
    vote: currentlyGoing ? 'notGoing' : 'going',
    isGoalkeeper: !!identity.isGoalkeeper || !!current?.isGoalkeeper,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  toast(t('saved'), 'success');
}

function goingPlayers() {
  return Object.values(rsvps).filter(isGoing);
}

function sortedGoingByTime() {
  return goingPlayers().sort((a, b) => {
    const aTime = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : (a.updatedAt?.seconds || 0) * 1000;
    const bTime = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : (b.updatedAt?.seconds || 0) * 1000;
    return aTime - bTime;
  });
}

function isGoing(rsvp) {
  return !!rsvp && ['in', 'going'].includes(rsvp.status || rsvp.vote);
}

function getCap() {
  return Number(session?.rsvpCap || session?.maxCap || DEFAULT_CAP);
}

function isTeamsReady() {
  return ['teams', 'teamsReady', 'ready', 'playing'].includes(session?.status);
}

function isTeamMateMode() {
  return isTeamsReady() || session?.status === 'locked';
}

function isLockedStatus() {
  return ['locked', 'done'].includes(session?.status);
}

function isFullStatus() {
  return session?.status === 'full' || (!isTeamsReady() && goingPlayers().length >= getCap());
}

function shouldHideMyRsvp() {
  return isTeamsReady() || isLockedStatus();
}

function statusLabel() {
  if (isTeamsReady()) return { label: t('teamsReady'), className: 'is-ready' };
  if (isLockedStatus()) return { label: t('locked'), className: 'is-locked' };
  if (isFullStatus()) {
    const subsCount = Math.max(0, goingPlayers().length - getCap());
    const label = subsCount > 0 ? `${t('full')} +${subsCount} subs` : t('full');
    return { label, className: 'is-full' };
  }
  return { label: t('open'), className: 'is-open' };
}

function isPlayerGk(player) {
  const rsvp = playerRsvp(player);
  return !!player.isGoalkeeper || !!player.isGK || !!rsvp?.isGoalkeeper || !!rsvp?.isGK;
}

function teamOrder(id) {
  return { A: 1, B: 2, C: 3 }[id] || 9;
}

function visibleTeams() {
  if (!teams.length) return ['A', 'B', 'C'].map(id => ({ id, name: `Team ${id}`, players: [] }));
  return [...teams].sort((a, b) => {
    const colorOrder = { red: 1, blue: 2, green: 3, yellow: 4 };
    return (colorOrder[a.color] || teamOrder(a.id)) - (colorOrder[b.color] || teamOrder(b.id))
      || String(a.name || a.id).localeCompare(String(b.name || b.id));
  });
}

function teamMainPlayers(team) {
  return team.players || [];
}

function teamSubs(team) {
  return team.subs || [];
}

function allTeamPlayers(team) {
  return [...teamMainPlayers(team), ...teamSubs(team)];
}

function teamGkCount(team) {
  return allTeamPlayers(team).filter(isPlayerGk).length;
}

function playerName(player) {
  return player.name || player.playerName || '';
}

function playerId(player) {
  return player.id || player.playerId || '';
}

function playerRsvp(player) {
  const id = playerId(player);
  if (id && rsvps[id]) return rsvps[id];
  return Object.values(rsvps).find(rsvp => normalizeName(playerName(rsvp)) === normalizeName(playerName(player))) || null;
}

function currentIdentity() {
  try {
    return JSON.parse(localStorage.getItem(IDENTITY_KEY) || 'null');
  } catch (_) {
    return null;
  }
}

function currentPlayerRsvp(identity) {
  if (!identity) return null;
  if (identity.playerId && rsvps[identity.playerId]) return rsvps[identity.playerId];
  if (identity.phone) {
    const byPhone = Object.values(rsvps).find(rsvp => rsvp.phone && identity.phone === rsvp.phone);
    if (byPhone) return byPhone;
  }
  return Object.values(rsvps).find(rsvp =>
    normalizeName(playerName(rsvp)) === normalizeName(identity.name)
  ) || null;
}

function isCurrentPlayer(player, identity) {
  if (!identity) return false;
  const id = playerId(player);
  if (identity.playerId && id && identity.playerId === id) return true;
  return normalizeName(playerName(player)) === normalizeName(identity.name);
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function teamColorClass(team) {
  return `team-color-${escAttr(team.color || '').toLowerCase()}`;
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.slice(0, 2) || '?').toUpperCase();
}

function fmtDate(date) {
  return new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
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

function show(id) {
  document.getElementById(id).hidden = false;
}

function hide(id) {
  document.getElementById(id).hidden = true;
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
