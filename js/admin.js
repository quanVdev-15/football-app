// admin.js — Admin-facing logic
// Depends on: firebase-config.js (global `db`), utils.js

import {
  TEAM_COLORS, TEAM_NAMES, TEAMS_COUNT, MAX_CAP_DEFAULT,
  t, formatDate, showToast, initials,
} from './utils.js';
import { getGoingPlayers } from './app.js';

// ─── PIN Auth ──────────────────────────────────────────────────────────────────

const ADMIN_AUTH_KEY = 'football_admin_auth';
const ADMIN_AUTH_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Check PIN against /config/admin and store a 24-hour session in localStorage.
 * @param {string} pin  — 4-digit string entered by user
 * @returns {Promise<boolean>} true if PIN matched
 */
export async function checkPin(pin) {
  try {
    const snap = await db.collection('config').doc('admin').get();
    if (!snap.exists) return false;
    const stored = snap.data().pin;
    if (String(pin) !== String(stored)) return false;
    localStorage.setItem(ADMIN_AUTH_KEY, Date.now().toString());
    return true;
  } catch (err) {
    console.error('[admin] checkPin:', err);
    return false;
  }
}

/**
 * Return true if the admin session is still valid (within 24 h).
 * @returns {boolean}
 */
export function isAdminAuthed() {
  const v = localStorage.getItem(ADMIN_AUTH_KEY);
  return Boolean(v && Date.now() - parseInt(v, 10) < ADMIN_AUTH_TTL);
}

/** Clear the admin session (logout). */
export function clearAdminAuth() {
  localStorage.removeItem(ADMIN_AUTH_KEY);
}

// ─── Session management ────────────────────────────────────────────────────────

/**
 * Create a new weekly session and set it as the current session in config.
 * @param {Date}   date    — the session date (usually next Saturday)
 * @param {number} [maxCap=MAX_CAP_DEFAULT]
 * @returns {Promise<string>} the new session document ID
 */
export async function createSession(date, maxCap = MAX_CAP_DEFAULT) {
  const sessionId = date.toISOString().split('T')[0]; // "YYYY-MM-DD"
  const batch = db.batch();

  const sessRef = db.collection('sessions').doc(sessionId);
  batch.set(sessRef, {
    date:      firebase.firestore.Timestamp.fromDate(date),
    status:    'open',
    maxCap:    maxCap,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });

  const cfgRef = db.collection('config').doc('settings');
  batch.set(cfgRef, { currentSessionId: sessionId }, { merge: true });

  await batch.commit();
  showToast(t('saved'), 'success');
  return sessionId;
}

/**
 * Lock a session so no more votes can be cast.
 * @param {string} sessionId
 * @returns {Promise<void>}
 */
export async function lockSession(sessionId) {
  try {
    await db.collection('sessions').doc(sessionId).update({ status: 'locked' });
    showToast(t('saved'), 'success');
  } catch (err) {
    console.error('[admin] lockSession:', err);
    showToast(t('error'), 'error');
  }
}

// ─── GK toggle ────────────────────────────────────────────────────────────────

/**
 * Toggle (or explicitly set) the GK flag on a player's vote document.
 * @param {string}  sessionId
 * @param {string}  playerName
 * @param {boolean} isGK
 * @returns {Promise<void>}
 */
export async function setGK(sessionId, playerName, isGK) {
  try {
    await db.collection('sessions').doc(sessionId)
      .collection('votes').doc(playerName)
      .update({ isGK: Boolean(isGK) });
  } catch (err) {
    console.error('[admin] setGK:', err);
    showToast(t('error'), 'error');
  }
}

// ─── Team randomisation ────────────────────────────────────────────────────────

/**
 * Shuffle an array in-place using Fisher-Yates.
 * @template T
 * @param {T[]} arr
 * @returns {T[]}
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Shuffle going players into 3 teams (round-robin deal), ensure at most 1 GK
 * per team (first GK-flagged player on each team gets the GK role).
 * Saves each team to /sessions/{id}/teams/{A|B|C} and sets status "teamsReady".
 *
 * Algorithm:
 *  1. Separate going players into GKs and outfield players.
 *  2. Shuffle both arrays independently.
 *  3. Deal all players round-robin into 3 buckets.
 *  4. For each bucket, mark the first player whose isGK flag is true as GK;
 *     if none, the team has no designated GK.
 *  5. Write teams to Firestore in a batch.
 *
 * @param {string} sessionId
 * @param {Object} votes  — current votes snapshot keyed by playerName
 * @returns {Promise<void>}
 */
export async function randomizeTeams(sessionId, votes) {
  const teamIds = ['A', 'B', 'C'];

  // Separate GKs and field players, shuffle each group
  const gkPlayers    = shuffle(Object.values(votes).filter(v => v.status === 'going' && v.isGK));
  const fieldPlayers = shuffle(Object.values(votes).filter(v => v.status === 'going' && !v.isGK));

  // Interleave: place GKs first so they spread across teams when dealt round-robin
  const allPlayers = [...gkPlayers, ...fieldPlayers];

  if (allPlayers.length === 0) {
    showToast(t('noSession'), 'error');
    return;
  }

  // Deal round-robin into 3 buckets
  const buckets = [[], [], []];
  allPlayers.forEach((p, i) => buckets[i % TEAMS_COUNT].push(p));

  // For each bucket, assign GK role to the first GK-flagged player
  const teamDocs = buckets.map((bucket, idx) => {
    let gkAssigned = false;
    const players = bucket.map(p => {
      const asGK = p.isGK && !gkAssigned;
      if (asGK) gkAssigned = true;
      return { playerName: p.playerName, isGK: asGK };
    });
    return {
      id:      teamIds[idx],
      name:    TEAM_NAMES[teamIds[idx]],
      color:   TEAM_COLORS[teamIds[idx]],
      players,
    };
  });

  try {
    const batch = db.batch();
    const sessRef = db.collection('sessions').doc(sessionId);

    teamDocs.forEach(team => {
      const ref = sessRef.collection('teams').doc(team.id);
      batch.set(ref, { name: team.name, color: team.color, players: team.players });
    });
    batch.update(sessRef, { status: 'teamsReady' });

    await batch.commit();
    showToast(t('saved'), 'success');
  } catch (err) {
    console.error('[admin] randomizeTeams:', err);
    showToast(t('error'), 'error');
  }
}

// ─── Admin render helpers ──────────────────────────────────────────────────────

/**
 * Render the admin vote management list into `container`.
 * Shows only "going" players with a GK toggle checkbox.
 * @param {HTMLElement} container
 * @param {string[]}    players   — full ordered player name list
 * @param {Object}      votes     — votes snapshot
 * @param {string}      sessionId
 */
export function renderAdminVoteList(container, players, votes, sessionId) {
  if (!container) return;
  const going = players.filter(name => votes[name]?.status === 'going');

  if (going.length === 0) {
    container.innerHTML = `<p class="empty-state">${t('noSession')}</p>`;
    return;
  }

  container.innerHTML = going.map(name => {
    const isGK = votes[name]?.isGK ?? false;
    return `
      <div class="admin-player-row" data-name="${name}">
        <div class="player-avatar">${initials(name)}</div>
        <span class="player-name">${name}</span>
        <label class="gk-toggle">
          <input type="checkbox" class="gk-checkbox" data-player="${name}"
            ${isGK ? 'checked' : ''}>
          ${t('gk')}
        </label>
      </div>`;
  }).join('');

  container.querySelectorAll('.gk-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      setGK(sessionId, cb.dataset.player, cb.checked);
    });
  });
}
