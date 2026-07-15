// Quick local test: simulate buildTeams() with the 30 seeded players
// Run: node test-teams.js

const SEED_NAMES = [
  'Bello', 'Bùi Chí Minh', 'Công Danh', 'Công Minh Lê', 'Dinh Van Duc',
  'Duy Côngg', 'Duy Nguyễn Trịnh', 'Đặng Xuân Trường', 'Đức Long', 'Đức Thịnh',
  'Lê Chiến', 'Lê Minh Hiển', 'Long Nghĩa', 'Long Tran', 'Mạnh Đức',
  'Mỹ Xuồi', 'Ngọc Phúc', 'Nguyen Hoàng Anh', 'Nguyen Hoang Huy', 'Nguyễn Công Thuận',
  'Nguyễn Hiếu', 'Nguyễn Hiển', 'Nguyễn Hoàng Longg', 'Nguyễn Minh Quân', 'Nhật Quang',
  'Phạm Xuân Duy', 'Quân Trần', 'Le Doan Anh Quan', 'Tuấn Linh', 'Trần Đức Anh',
  'Trần Hà', 'Thành Nam', 'Nam Khánhh',
];

// Simulate varied ratings (mix of 1-5) so balancing is visible
const players = SEED_NAMES.map((name, i) => ({
  id: 'p' + i,
  name,
  isGoalkeeper: i < 3, // first 3 are GKs for testing
  points: (i % 5) + 1  // cycles 1,2,3,4,5,1,2,3...
}));

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function teamPoints(team) {
  return [...team.players, ...team.subs].filter(p => !p.isGK).reduce((sum, p) => sum + (p.points || 0), 0);
}

function buildTeams(players, numTeams) {
  const gks   = shuffle(players.filter(p => p.isGoalkeeper));
  const field = shuffle(players.filter(p => !p.isGoalkeeper));

  const TEAM_NAMES = ['Red', 'Blue', 'Yellow'];
  const teams = Array.from({ length: numTeams }, (_, i) => ({
    name: 'Đội ' + TEAM_NAMES[i],
    players: [],
    subs: []
  }));

  // 1 GK per team, randomly assigned (GKs have no rating)
  gks.forEach(gk => {
    const openTeams = teams.filter(t => !t.players.some(p => p.isGK));
    const target = openTeams.length ? openTeams[0] : teams[0];
    const entry = { id: gk.id, name: gk.name, isGK: true, points: 0 };
    if (openTeams.length) target.players.push(entry);
    else target.subs.push(entry);
  });

  field.sort((a, b) => (b.points || 0) - (a.points || 0));
  field.forEach(p => {
    const entry = { id: p.id, name: p.name, points: p.points || 0 };
    const openTeams = teams.filter(t => t.players.length < 7);
    if (openTeams.length) {
      openTeams.sort((a, b) => teamPoints(a) - teamPoints(b))[0].players.push(entry);
    } else {
      teams.sort((a, b) => teamPoints(a) - teamPoints(b))[0].subs.push(entry);
    }
  });

  return teams;
}

// Run it
const teams = buildTeams([...players], 3);

console.log('='.repeat(60));
console.log('TEAM SPLIT TEST — 30 players (3 GKs), ratings 1-5');
console.log('='.repeat(60));

teams.forEach(team => {
  const pts = teamPoints(team);
  console.log(`\n${team.name} — ${team.players.length} players, ${team.subs.length} subs — ${pts} pts`);
  console.log('-'.repeat(50));
  team.players.forEach((p, i) =>
    console.log(`  ${String(i+1).padStart(2)}. ${p.name.padEnd(24)} ${'★'.repeat(p.points)}${'☆'.repeat(5-p.points)}${p.isGK ? '  [GK]' : ''}`)
  );
  if (team.subs.length) {
    console.log('  --- subs ---');
    team.subs.forEach((p, i) =>
      console.log(`  ${String(i+1).padStart(2)}. ${p.name.padEnd(24)} ${'★'.repeat(p.points)}${'☆'.repeat(5-p.points)}${p.isGK ? '  [GK]' : ''}`)
    );
  }
});

const allPts = teams.map(t => teamPoints(t));
console.log(`\n${'='.repeat(60)}`);
console.log(`Team totals: ${allPts.join(' / ')}  |  Max diff: ${Math.max(...allPts) - Math.min(...allPts)}`);
console.log('='.repeat(60));
