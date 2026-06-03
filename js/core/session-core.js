(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SessionCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULT_CAP = 21;

  function normalizeName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.slice(0, 2) || '?').toUpperCase();
  }

  function playerName(player) {
    return player?.name || player?.playerName || '';
  }

  function playerId(player) {
    return player?.id || player?.playerId || '';
  }

  function isGoing(rsvp) {
    return !!rsvp && ['in', 'going'].includes(rsvp.status || rsvp.vote);
  }

  function goingPlayers(rsvps) {
    return Object.values(rsvps || {}).filter(isGoing);
  }

  function totalHeadcount(rsvps) {
    return goingPlayers(rsvps).reduce((sum, p) => {
      const guests = (p.guests || []).filter(g => String(g?.name || '').trim()).length;
      return sum + 1 + guests;
    }, 0);
  }

  function getCap(session) {
    return Number(session?.rsvpCap || session?.maxCap || DEFAULT_CAP);
  }

  function isTeamsReady(session) {
    return ['teams', 'teamsReady', 'ready', 'playing'].includes(session?.status);
  }

  function isLockedStatus(session) {
    return ['locked', 'done'].includes(session?.status);
  }

  function isFullStatus(session, rsvps) {
    return session?.status === 'full' || (!isTeamsReady(session) && totalHeadcount(rsvps) >= getCap(session));
  }

  function currentPlayerRsvp(identity, rsvps) {
    if (!identity) return null;
    if (identity.playerId && rsvps?.[identity.playerId]) return rsvps[identity.playerId];
    const identityName = normalizeName(identity.name);
    return Object.values(rsvps || {}).find(rsvp => {
      if (identity.phone && rsvp.phone && identity.phone === rsvp.phone) return true;
      return identityName && normalizeName(playerName(rsvp)) === identityName;
    }) || null;
  }

  function isCurrentPlayer(player, identity) {
    if (!identity) return false;
    const id = playerId(player);
    if (identity.playerId && id && identity.playerId === id) return true;
    return normalizeName(playerName(player)) === normalizeName(identity.name);
  }

  function sortedGoingPlayers(rsvps, identity, lang = 'vi') {
    return goingPlayers(rsvps).sort((a, b) => {
      const aIsMe = isCurrentPlayer(a, identity);
      const bIsMe = isCurrentPlayer(b, identity);
      if (aIsMe !== bIsMe) return aIsMe ? -1 : 1;
      return playerName(a).localeCompare(playerName(b), lang === 'vi' ? 'vi' : 'en', { sensitivity: 'base' });
    });
  }

  function statusLabel(session, rsvps, labels = {}) {
    const text = {
      teamsReady: 'Teams Ready',
      locked: 'Locked',
      full: 'Full',
      open: 'Open',
      ...labels,
    };
    if (isTeamsReady(session)) return { label: text.teamsReady, className: 'is-ready' };
    if (isLockedStatus(session)) return { label: text.locked, className: 'is-locked' };
    if (isFullStatus(session, rsvps)) return { label: text.full, className: 'is-full' };
    return { label: text.open, className: 'is-open' };
  }

  function shouldHideMyRsvp(session, rsvps, identity) {
    if (isTeamsReady(session) || isLockedStatus(session)) return true;
    return isFullStatus(session, rsvps) && !isGoing(currentPlayerRsvp(identity, rsvps));
  }

  function teamOrder(id) {
    return { A: 1, B: 2, C: 3 }[id] || 9;
  }

  function visibleTeams(teams) {
    if (!teams?.length) return ['A', 'B', 'C'].map(id => ({ id, name: `Team ${id}`, players: [] }));
    return [...teams].sort((a, b) => {
      const colorOrder = { red: 1, blue: 2, green: 3, yellow: 4 };
      return (colorOrder[a.color] || teamOrder(a.id)) - (colorOrder[b.color] || teamOrder(b.id))
        || String(a.name || a.id).localeCompare(String(b.name || b.id));
    });
  }

  function isPlayerGk(player, rsvps = {}) {
    const id = playerId(player);
    const rsvp = id && rsvps[id]
      ? rsvps[id]
      : Object.values(rsvps).find(item => normalizeName(playerName(item)) === normalizeName(playerName(player)));
    return !!player?.isGoalkeeper || !!player?.isGK || !!rsvp?.isGoalkeeper || !!rsvp?.isGK;
  }

  function teamMainPlayers(team) {
    return team?.players || [];
  }

  function teamSubs(team) {
    return team?.subs || [];
  }

  function allTeamPlayers(team) {
    return [...teamMainPlayers(team), ...teamSubs(team)];
  }

  function teamGkCount(team, rsvps = {}) {
    return allTeamPlayers(team).filter(player => isPlayerGk(player, rsvps)).length;
  }

  function pitchRows(players) {
    const indexed = players.map((player, index) => ({ player, index }));
    const gks = indexed.filter(item => isPlayerGk(item.player));
    const field = indexed.filter(item => !isPlayerGk(item.player));
    const firstRow = gks.length ? [gks[0]] : field.splice(0, 1);
    const rest = [...gks.slice(1), ...field];
    const rows = firstRow.length ? [firstRow] : [];

    if (rest.length <= 3) return [...rows, rest].filter(row => row.length);
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

  function hashString(value) {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  function shuffleStable(items, seedValue) {
    const withScores = items.map((item, index) => ({
      item,
      score: hashString(`${seedValue}:${playerId(item.player) || playerName(item.player)}:${index}`),
    }));
    return withScores.sort((a, b) => a.score - b.score).map(entry => entry.item);
  }

  function revealOrder(players, identity, sessionId = '') {
    const indexed = players.map((player, index) => ({ player, index }));
    const me = indexed.find(item => isCurrentPlayer(item.player, identity));
    const others = indexed.filter(item => item !== me);
    const shuffled = shuffleStable(others, sessionId);
    return me ? [me, ...shuffled] : shuffled;
  }

  function mapDisplayName(location) {
    try {
      const url = new URL(location);
      if (url.hostname.includes('google.com') || url.hostname.includes('goo.gl')) {
        const placeMatch = url.pathname.match(/\/place\/([^/@]+)/);
        if (placeMatch) return decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
        return url.searchParams.get('q') || 'Google Maps';
      }
    } catch (_) {}
    return location;
  }

  function buildMapSrc(location) {
    try {
      const url = new URL(location);
      if (url.hostname.includes('google.com') || url.hostname.includes('goo.gl')) {
        const atMatch = url.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (atMatch) return `https://maps.google.com/maps?q=${atMatch[1]},${atMatch[2]}&output=embed&hl=vi&z=17`;
        const q = url.searchParams.get('q');
        if (q) return `https://maps.google.com/maps?q=${encodeURIComponent(q)}&output=embed&hl=vi&z=16`;
      }
    } catch (_) {}
    return `https://maps.google.com/maps?q=${encodeURIComponent(location)}&output=embed&hl=vi&z=16`;
  }

  return {
    allTeamPlayers,
    buildMapSrc,
    currentPlayerRsvp,
    getCap,
    goingPlayers,
    hashString,
    initials,
    isCurrentPlayer,
    isFullStatus,
    isGoing,
    isLockedStatus,
    isPlayerGk,
    isTeamsReady,
    mapDisplayName,
    normalizeName,
    pitchPositions,
    pitchRows,
    playerId,
    playerName,
    revealOrder,
    shouldHideMyRsvp,
    shuffleStable,
    sortedGoingPlayers,
    statusLabel,
    teamGkCount,
    teamMainPlayers,
    teamOrder,
    teamSubs,
    totalHeadcount,
    visibleTeams,
  };
});
