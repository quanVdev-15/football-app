// app.js — Player-facing core logic
// Depends on: firebase-config.js (global `db`), utils.js

import {
  TEAM_COLORS, TEAM_NAMES, TEAMS_COUNT, MAX_CAP_DEFAULT,
  t, formatDate, showToast, initials,
} from './utils.js';

// ─── Real-time listeners ───────────────────────────────────────────────────────

/**
 * Subscribe to the current session document.
 * Reads currentSessionId from /config/settings, then listens to that session.
 * Calls `callback(session | null)` on every change.
 * @param {function(Object|null): void} callback
 * @returns {function(): void} unsubscribe function
 */
export function listenCurrentSession(callback) {
  let sessionUnsub = () => {};

  const configUnsub = db.collection('config').doc('settings')
    .onSnapshot(snap => {
      sessionUnsub(); // clean up previous session listener
      const sessionId = snap.exists ? snap.data().currentSessionId : null;
      if (!sessionId) { callback(null); return; }

      sessionUnsub = db.collection('sessions').doc(sessionId)
        .onSnapshot(sessSnap => {
          callback(sessSnap.exists ? { id: sessSnap.id, ...sessSnap.data() } : null);
        }, err => { console.error('[app] session listener:', err); callback(null); });
    }, err => { console.error('[app] config listener:', err); callback(null); });

  return () => { configUnsub(); sessionUnsub(); };
}

/**
 * Subscribe to the votes subcollection of a session.
 * Calls `callback(votes)` where votes is an object keyed by playerName.
 * @param {string} sessionId
 * @param {function(Object): void} callback
 * @returns {function(): void} unsubscribe function
 */
export function listenVotes(sessionId, callback) {
  return db.collection('sessions').doc(sessionId).collection('votes')
    .onSnapshot(snap => {
      const votes = {};
      snap.forEach(doc => { votes[doc.id] = doc.data(); });
      callback(votes);
    }, err => console.error('[app] votes listener:', err));
}

/**
 * Subscribe to the teams subcollection of a session.
 * Calls `callback(teams)` where teams is an object keyed by teamId ("A"|"B"|"C").
 * @param {string} sessionId
 * @param {function(Object): void} callback
 * @returns {function(): void} unsubscribe function
 */
export function listenTeams(sessionId, callback) {
  return db.collection('sessions').doc(sessionId).collection('teams')
    .onSnapshot(snap => {
      const teams = {};
      snap.forEach(doc => { teams[doc.id] = doc.data(); });
      callback(teams);
    }, err => console.error('[app] teams listener:', err));
}

// ─── Voting ────────────────────────────────────────────────────────────────────

/**
 * Record a vote for a player.
 * Blocks "going" votes when the session cap has already been reached.
 * @param {string} sessionId
 * @param {string} playerName
 * @param {'going'|'not_going'} status
 * @param {Object} session  — current session doc data (needs maxCap)
 * @param {Object} votes    — current votes snapshot (keyed by playerName)
 * @returns {Promise<void>}
 */
export async function vote(sessionId, playerName, status, session, votes) {
  if (session.status === 'locked' || session.status === 'teamsReady') {
    showToast(t('sessionLocked'), 'error');
    return;
  }

  if (status === 'going') {
    const cap = session.maxCap ?? MAX_CAP_DEFAULT;
    const goingCount = getGoingPlayers(votes).length;
    const alreadyGoing = votes[playerName]?.status === 'going';
    if (!alreadyGoing && goingCount >= cap) {
      showToast(t('capReached'), 'error');
      return;
    }
  }

  try {
    await db.collection('sessions').doc(sessionId)
      .collection('votes').doc(playerName)
      .set({
        playerName,
        status,
        isGK: votes[playerName]?.isGK ?? false,
        votedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    showToast(status === 'going' ? t('going') : t('notGoing'), 'success');
  } catch (err) {
    console.error('[app] vote error:', err);
    showToast(t('error'), 'error');
  }
}

// ─── Derived data ──────────────────────────────────────────────────────────────

/**
 * Return the array of playerName strings who are currently "going".
 * @param {Object} votes — votes snapshot keyed by playerName
 * @returns {string[]}
 */
export function getGoingPlayers(votes) {
  return Object.values(votes)
    .filter(v => v.status === 'going')
    .map(v => v.playerName);
}

// ─── Render helpers ────────────────────────────────────────────────────────────

/**
 * Render the player list into `container`.
 * Each card shows the player name, going/not_going state, and a toggle button.
 * @param {HTMLElement} container
 * @param {string[]} players      — ordered list of player names
 * @param {Object}   votes        — votes snapshot
 * @param {Object}   session      — current session doc
 * @param {function(string, 'going'|'not_going'): void} onVote
 */
export function renderPlayerList(container, players, votes, session, onVote) {
  if (!container) return;
  const cap      = session?.maxCap ?? MAX_CAP_DEFAULT;
  const going    = getGoingPlayers(votes);
  const capFull  = going.length >= cap;
  const locked   = session?.status !== 'open';

  container.innerHTML = players.map(name => {
    const v       = votes[name];
    const status  = v?.status ?? 'not_going';
    const isGoing = status === 'going';
    const isGK    = v?.isGK ?? false;
    const canGo   = isGoing || (!capFull && !locked);

    return `
      <div class="player-card ${isGoing ? 'going' : 'not-going'}" data-name="${name}">
        <div class="player-avatar">${initials(name)}</div>
        <div class="player-name">${name}${isGK ? ' <span class="gk-badge">GK</span>' : ''}</div>
        <button
          class="vote-btn ${isGoing ? 'btn-out' : 'btn-in'}"
          ${locked && !isGoing ? 'disabled' : ''}
          ${!canGo && !isGoing ? 'disabled title="' + t('capReached') + '"' : ''}
          data-action="${isGoing ? 'not_going' : 'going'}"
          data-player="${name}">
          ${isGoing ? t('notGoing') : t('going')}
        </button>
      </div>`;
  }).join('');

  // Attach click handlers via delegation
  container.querySelectorAll('.vote-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      onVote(btn.dataset.player, btn.dataset.action);
    });
  });
}

/**
 * Render team cards into `container`.
 * @param {HTMLElement} container
 * @param {Object} teams  — teams snapshot keyed by teamId ("A"|"B"|"C")
 */
export function renderTeams(container, teams) {
  if (!container) return;
  const ids = Object.keys(TEAM_NAMES);
  if (!ids.some(id => teams[id])) {
    container.innerHTML = '<p class="no-teams">' + t('noSession') + '</p>';
    return;
  }

  container.innerHTML = ids.map(id => {
    const team    = teams[id];
    if (!team) return '';
    const color   = TEAM_COLORS[id];
    const players = (team.players ?? []).map(p =>
      `<li class="${p.isGK ? 'is-gk' : ''}">
        <span class="avatar" style="background:${color}20;color:${color}">${initials(p.playerName)}</span>
        ${p.playerName}${p.isGK ? ' <span class="gk-badge">GK</span>' : ''}
       </li>`
    ).join('');

    return `
      <div class="team-card" style="border-left: 4px solid ${color}">
        <h3 style="color:${color}">${team.name ?? TEAM_NAMES[id]}</h3>
        <ul class="team-players">${players}</ul>
      </div>`;
  }).join('');
}
