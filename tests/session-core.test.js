const assert = require('node:assert/strict');
const test = require('node:test');
const core = require('../js/core/session-core');

[
  ['  Nguyen   Minh Quan ', 'nguyen minh quan'],
  ['', ''],
  [null, ''],
  ['AN', 'an'],
].forEach(([input, expected], index) => {
  test(`normalizeName ${index + 1}`, () => assert.equal(core.normalizeName(input), expected));
});

[
  ['Nguyen Minh Quan', 'NQ'],
  ['An', 'AN'],
  ['', '?'],
  [' le   van   a ', 'LA'],
].forEach(([input, expected], index) => {
  test(`initials ${index + 1}`, () => assert.equal(core.initials(input), expected));
});

[
  [{ name: 'An' }, 'An'],
  [{ playerName: 'Binh' }, 'Binh'],
  [{}, ''],
].forEach(([input, expected], index) => {
  test(`playerName ${index + 1}`, () => assert.equal(core.playerName(input), expected));
});

[
  [{ id: 'a' }, 'a'],
  [{ playerId: 'b' }, 'b'],
  [{}, ''],
].forEach(([input, expected], index) => {
  test(`playerId ${index + 1}`, () => assert.equal(core.playerId(input), expected));
});

[
  [{ status: 'in' }, true],
  [{ status: 'going' }, true],
  [{ vote: 'going' }, true],
  [{ status: 'out' }, false],
  [undefined, false],
].forEach(([input, expected], index) => {
  test(`session isGoing ${index + 1}`, () => assert.equal(core.isGoing(input), expected));
});

test('goingPlayers filters only active RSVPs', () => {
  const rsvps = { a: { status: 'in' }, b: { status: 'out' }, c: { vote: 'going' } };
  assert.equal(core.goingPlayers(rsvps).length, 2);
});

test('totalHeadcount includes named guests', () => {
  const rsvps = {
    a: { status: 'in', guests: [{ name: 'Guest 1' }, { name: ' ' }] },
    b: { vote: 'going', guests: [{ name: 'Guest 2' }] },
  };
  assert.equal(core.totalHeadcount(rsvps), 4);
});

[
  [{ rsvpCap: 18 }, 18],
  [{ maxCap: 24 }, 24],
  [{}, 21],
  [null, 21],
].forEach(([session, expected], index) => {
  test(`getCap ${index + 1}`, () => assert.equal(core.getCap(session), expected));
});

['teams', 'teamsReady', 'ready', 'playing'].forEach(status => {
  test(`isTeamsReady ${status}`, () => assert.equal(core.isTeamsReady({ status }), true));
});

['open', 'full', 'done', undefined].forEach(status => {
  test(`isTeamsReady false ${status}`, () => assert.equal(core.isTeamsReady({ status }), false));
});

['locked', 'done'].forEach(status => {
  test(`isLockedStatus ${status}`, () => assert.equal(core.isLockedStatus({ status }), true));
});

['open', 'full', 'teamsReady'].forEach(status => {
  test(`isLockedStatus false ${status}`, () => assert.equal(core.isLockedStatus({ status }), false));
});

test('isFullStatus respects explicit full state', () => {
  assert.equal(core.isFullStatus({ status: 'full', rsvpCap: 21 }, {}), true);
});

test('isFullStatus compares headcount to cap', () => {
  assert.equal(core.isFullStatus({ status: 'open', rsvpCap: 2 }, { a: { status: 'in' }, b: { status: 'in' } }), true);
});

test('isFullStatus ignores cap when teams are ready', () => {
  assert.equal(core.isFullStatus({ status: 'teamsReady', rsvpCap: 1 }, { a: { status: 'in' } }), false);
});

test('currentPlayerRsvp finds by playerId first', () => {
  const rsvps = { p1: { playerId: 'p1', playerName: 'An' } };
  assert.equal(core.currentPlayerRsvp({ playerId: 'p1' }, rsvps).playerName, 'An');
});

test('currentPlayerRsvp finds by phone fallback', () => {
  const rsvps = { x: { phone: '090', playerName: 'An' } };
  assert.equal(core.currentPlayerRsvp({ phone: '090' }, rsvps).playerName, 'An');
});

test('currentPlayerRsvp finds by normalized name fallback', () => {
  const rsvps = { x: { playerName: 'Nguyen Minh Quan' } };
  assert.equal(core.currentPlayerRsvp({ name: ' nguyen   minh quan ' }, rsvps).playerName, 'Nguyen Minh Quan');
});

test('isCurrentPlayer matches playerId', () => {
  assert.equal(core.isCurrentPlayer({ playerId: 'p1', playerName: 'An' }, { playerId: 'p1', name: 'Other' }), true);
});

test('isCurrentPlayer matches normalized name', () => {
  assert.equal(core.isCurrentPlayer({ playerName: 'Nguyen Minh Quan' }, { name: 'nguyen   minh quan' }), true);
});

test('sortedGoingPlayers puts current player first', () => {
  const rsvps = {
    b: { playerId: 'b', playerName: 'Binh', status: 'in' },
    a: { playerId: 'a', playerName: 'An', status: 'in' },
  };
  assert.deepEqual(core.sortedGoingPlayers(rsvps, { playerId: 'b' }).map(core.playerName), ['Binh', 'An']);
});

test('sortedGoingPlayers sorts other players by name', () => {
  const rsvps = {
    c: { playerId: 'c', playerName: 'Cuong', status: 'in' },
    a: { playerId: 'a', playerName: 'An', status: 'in' },
  };
  assert.deepEqual(core.sortedGoingPlayers(rsvps, null).map(core.playerName), ['An', 'Cuong']);
});

[
  [{ status: 'teamsReady' }, {}, { label: 'Teams Ready', className: 'is-ready' }],
  [{ status: 'locked' }, {}, { label: 'Locked', className: 'is-locked' }],
  [{ status: 'open', rsvpCap: 1 }, { a: { status: 'in' } }, { label: 'Full', className: 'is-full' }],
  [{ status: 'open', rsvpCap: 2 }, { a: { status: 'in' } }, { label: 'Open', className: 'is-open' }],
].forEach(([session, rsvps, expected], index) => {
  test(`statusLabel ${index + 1}`, () => assert.deepEqual(core.statusLabel(session, rsvps), expected));
});

test('shouldHideMyRsvp hides locked sessions', () => {
  assert.equal(core.shouldHideMyRsvp({ status: 'locked' }, {}, { playerId: 'p1' }), true);
});

test('shouldHideMyRsvp hides full session for player not already in', () => {
  assert.equal(core.shouldHideMyRsvp({ status: 'open', rsvpCap: 1 }, { a: { status: 'in' } }, { playerId: 'p1' }), true);
});

test('shouldHideMyRsvp keeps full session visible for player already in', () => {
  assert.equal(core.shouldHideMyRsvp({ status: 'open', rsvpCap: 1 }, { p1: { playerId: 'p1', status: 'in' } }, { playerId: 'p1' }), false);
});

[
  ['A', 1],
  ['B', 2],
  ['C', 3],
  ['Z', 9],
].forEach(([id, expected], index) => {
  test(`teamOrder ${index + 1}`, () => assert.equal(core.teamOrder(id), expected));
});

test('visibleTeams returns default empty teams', () => {
  assert.deepEqual(core.visibleTeams([]).map(team => team.id), ['A', 'B', 'C']);
});

test('visibleTeams sorts by known colors', () => {
  const teams = [{ id: '3', color: 'green' }, { id: '1', color: 'red' }, { id: '2', color: 'blue' }];
  assert.deepEqual(core.visibleTeams(teams).map(team => team.color), ['red', 'blue', 'green']);
});

test('visibleTeams falls back to team order', () => {
  const teams = [{ id: 'C' }, { id: 'A' }, { id: 'B' }];
  assert.deepEqual(core.visibleTeams(teams).map(team => team.id), ['A', 'B', 'C']);
});

test('isPlayerGk reads player flags', () => {
  assert.equal(core.isPlayerGk({ isGK: true }), true);
  assert.equal(core.isPlayerGk({ isGoalkeeper: true }), true);
});

test('isPlayerGk reads RSVP by id', () => {
  assert.equal(core.isPlayerGk({ playerId: 'p1' }, { p1: { isGoalkeeper: true } }), true);
});

test('isPlayerGk reads RSVP by normalized name', () => {
  assert.equal(core.isPlayerGk({ playerName: 'An' }, { x: { playerName: ' an ', isGK: true } }), true);
});

test('team player helpers split main players and subs', () => {
  const team = { players: [{ playerName: 'An' }], subs: [{ playerName: 'Binh' }] };
  assert.equal(core.teamMainPlayers(team).length, 1);
  assert.equal(core.teamSubs(team).length, 1);
  assert.equal(core.allTeamPlayers(team).length, 2);
});

test('teamGkCount counts main players and subs', () => {
  const team = { players: [{ playerName: 'An', isGK: true }], subs: [{ playerName: 'Binh', isGoalkeeper: true }] };
  assert.equal(core.teamGkCount(team), 2);
});

test('pitchRows puts goalkeeper first', () => {
  const rows = core.pitchRows([{ playerName: 'Field' }, { playerName: 'GK', isGK: true }, { playerName: 'Field 2' }]);
  assert.equal(rows[0][0].player.playerName, 'GK');
});

test('pitchRows creates compact rows for seven players', () => {
  const rows = core.pitchRows(Array.from({ length: 7 }, (_, i) => ({ playerName: `P${i + 1}` })));
  assert.deepEqual(rows.map(row => row.length), [1, 3, 3]);
});

test('pitchRows creates four rows for ten players', () => {
  const rows = core.pitchRows(Array.from({ length: 10 }, (_, i) => ({ playerName: `P${i + 1}` })));
  assert.deepEqual(rows.map(row => row.length), [1, 3, 3, 3]);
});

test('pitchPositions centers a single player', () => {
  assert.deepEqual(core.pitchPositions([[{ index: 0 }]])[0], { x: 50, y: 50 });
});

test('pitchPositions spreads three players across a row', () => {
  const positions = core.pitchPositions([[{ index: 0 }, { index: 1 }, { index: 2 }]]);
  assert.deepEqual([positions[0].x, positions[1].x, positions[2].x], [18, 50, 82]);
});

test('hashString is stable', () => {
  assert.equal(core.hashString('session:p1'), core.hashString('session:p1'));
});

test('shuffleStable returns stable order for same seed', () => {
  const items = [{ player: { playerId: 'a' } }, { player: { playerId: 'b' } }, { player: { playerId: 'c' } }];
  assert.deepEqual(core.shuffleStable(items, 's1'), core.shuffleStable(items, 's1'));
});

test('revealOrder puts current player first', () => {
  const players = [{ playerId: 'a', playerName: 'An' }, { playerId: 'b', playerName: 'Binh' }];
  assert.equal(core.revealOrder(players, { playerId: 'b' }, 's1')[0].player.playerId, 'b');
});

test('mapDisplayName extracts Google place name', () => {
  assert.equal(core.mapDisplayName('https://www.google.com/maps/place/San+Bong+Da/@10.1,106.1,17z'), 'San Bong Da');
});

test('mapDisplayName extracts q parameter', () => {
  assert.equal(core.mapDisplayName('https://www.google.com/maps?q=My%20Field'), 'My Field');
});

test('mapDisplayName returns plain text location', () => {
  assert.equal(core.mapDisplayName('Local field'), 'Local field');
});

test('buildMapSrc extracts coordinates from Google URL', () => {
  assert.equal(core.buildMapSrc('https://www.google.com/maps/place/Test/@10.123,106.456,17z'), 'https://maps.google.com/maps?q=10.123,106.456&output=embed&hl=vi&z=17');
});

test('buildMapSrc uses q parameter from Google URL', () => {
  assert.equal(core.buildMapSrc('https://www.google.com/maps?q=My Field'), 'https://maps.google.com/maps?q=My%20Field&output=embed&hl=vi&z=16');
});

test('buildMapSrc encodes plain text address', () => {
  assert.equal(core.buildMapSrc('San Bong Da'), 'https://maps.google.com/maps?q=San%20Bong%20Da&output=embed&hl=vi&z=16');
});
