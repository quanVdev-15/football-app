const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const PAY_PER_PLAY = 35000;
const PAY_MONTHLY = 150000;

function isGoing(data) {
  return !!data && ['in', 'going'].includes(data.status || data.vote);
}

function monthFromDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function fmtVND(amount) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
}

function buildPayment({ rsvp, existing = {}, subscription = null, debts = [] }) {
  const monthlyPaid = !!subscription;
  const validGuests = (rsvp.guests || []).filter(guest => guest.name?.trim());
  const guestAmount = validGuests.length * PAY_PER_PLAY;
  const debt = debts.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const paid = monthlyPaid ? true : (existing.type === 'per-match' ? !!existing.paid : false);

  return {
    playerId: rsvp.playerId,
    playerName: rsvp.playerName || existing.playerName || '',
    type: monthlyPaid ? 'monthly' : 'per-match',
    amount: monthlyPaid ? 0 : PAY_PER_PLAY,
    paid,
    paidMethod: paid ? (existing.paidMethod || subscription?.paidMethod || null) : null,
    selfReported: existing.selfReported || false,
    guestCount: validGuests.length,
    guestAmount,
    guestPaid: guestAmount > 0 ? !!existing.guestPaid : false,
    debt
  };
}

function outstandingAmount(payment) {
  const own = payment.type === 'per-match' && !payment.paid ? payment.amount : 0;
  const guest = payment.guestAmount > 0 && !payment.guestPaid ? payment.guestAmount : 0;
  const debt = payment.debt > 0 ? payment.debt : 0;
  return own + guest + debt;
}

function debtCloseAmount(payment) {
  if (payment.type !== 'per-match') return 0;
  return (!payment.paid ? payment.amount : 0) + (!payment.guestPaid ? payment.guestAmount : 0);
}

function playerState({ subscriptionExists, subscriptionPaid, subscriptionSelfReported, paymentPaid, paymentSelfReported }) {
  const monthlyPaid = subscriptionExists && subscriptionPaid;
  const monthlyPending = subscriptionExists && !subscriptionPaid && subscriptionSelfReported;
  const monthlyUnpaid = subscriptionExists && !subscriptionPaid;
  const perMatchPending = paymentSelfReported && !paymentPaid;

  if (monthlyPaid) return 'monthly-paid';
  if (monthlyPending) return 'monthly-pending';
  if (monthlyUnpaid) return 'monthly-unpaid';
  if (paymentPaid) return 'per-match-paid';
  if (perMatchPending) return 'per-match-pending';
  return 'per-match-unpaid';
}

function adminSections(rows) {
  const pending = rows.filter(payment => payment.selfReported && !payment.paid);
  const unpaid = rows.filter(payment => outstandingAmount(payment) > 0 && !pending.includes(payment))
    .sort((a, b) => (b.debt || 0) - (a.debt || 0) || a.playerName.localeCompare(b.playerName, 'vi'));
  const monthly = rows.filter(payment => payment.type === 'monthly' && payment.paid);
  const paid = rows.filter(payment => payment.type === 'per-match' && outstandingAmount(payment) === 0 && payment.paid);
  return { unpaid, pending, monthly, paid };
}

function summary(rows) {
  const expected = rows.reduce((sum, payment) => sum + payment.amount + payment.guestAmount + payment.debt, 0);
  const collected = rows.reduce((sum, payment) => {
    const ownPaid = payment.paid ? payment.amount : 0;
    const guestPaid = payment.guestPaid ? payment.guestAmount : 0;
    const debtPaid = payment.debt > 0 && payment.paid ? payment.debt : 0;
    return sum + ownPaid + guestPaid + debtPaid;
  }, 0);
  return { expected, collected, outstanding: Math.max(0, expected - collected) };
}

function closeDebtors(rows) {
  return rows.filter(payment => debtCloseAmount(payment) > 0);
}

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

const baseRsvp = { playerId: 'ph_0900000001', playerName: 'An', status: 'in', guests: [] };

test('01 status in counts as going', () => {
  assert.strictEqual(isGoing({ status: 'in' }), true);
});

test('02 vote going counts as going', () => {
  assert.strictEqual(isGoing({ vote: 'going' }), true);
});

test('03 out does not count as going', () => {
  assert.strictEqual(isGoing({ status: 'out' }), false);
});

test('04 month key uses YYYY-MM', () => {
  assert.strictEqual(monthFromDate(new Date(2026, 5, 7)), '2026-06');
});

test('05 per-match unpaid payment is 35k', () => {
  const payment = buildPayment({ rsvp: baseRsvp });
  assert.strictEqual(payment.type, 'per-match');
  assert.strictEqual(payment.amount, PAY_PER_PLAY);
  assert.strictEqual(payment.paid, false);
});

test('06 paid monthly subscription makes session free', () => {
  const payment = buildPayment({ rsvp: baseRsvp, subscription: { paidMethod: 'cash' } });
  assert.strictEqual(payment.type, 'monthly');
  assert.strictEqual(payment.amount, 0);
  assert.strictEqual(payment.paid, true);
});

test('07 guests are counted only when named', () => {
  const payment = buildPayment({
    rsvp: { ...baseRsvp, guests: [{ name: 'Binh' }, { name: '   ' }, {}] }
  });
  assert.strictEqual(payment.guestCount, 1);
  assert.strictEqual(payment.guestAmount, PAY_PER_PLAY);
});

test('08 carried debts are summed into payment debt', () => {
  const payment = buildPayment({ rsvp: baseRsvp, debts: [{ amount: 35000 }, { amount: 70000 }] });
  assert.strictEqual(payment.debt, 105000);
});

test('09 outstanding for unpaid per-match includes own fee', () => {
  const payment = buildPayment({ rsvp: baseRsvp });
  assert.strictEqual(outstandingAmount(payment), PAY_PER_PLAY);
});

test('10 outstanding includes unpaid guests', () => {
  const payment = buildPayment({ rsvp: { ...baseRsvp, guests: [{ name: 'Binh' }] } });
  assert.strictEqual(outstandingAmount(payment), PAY_PER_PLAY * 2);
});

test('11 paid own fee still owes unpaid guest fee', () => {
  const payment = buildPayment({
    rsvp: { ...baseRsvp, guests: [{ name: 'Binh' }] },
    existing: { type: 'per-match', paid: true, guestPaid: false }
  });
  assert.strictEqual(outstandingAmount(payment), PAY_PER_PLAY);
});

test('12 paid own fee and paid guests has zero outstanding', () => {
  const payment = buildPayment({
    rsvp: { ...baseRsvp, guests: [{ name: 'Binh' }] },
    existing: { type: 'per-match', paid: true, guestPaid: true }
  });
  assert.strictEqual(outstandingAmount(payment), 0);
});

test('13 monthly paid with unpaid guest still owes guest amount', () => {
  const payment = buildPayment({
    rsvp: { ...baseRsvp, guests: [{ name: 'Binh' }] },
    subscription: { paidMethod: 'cash' }
  });
  assert.strictEqual(outstandingAmount(payment), PAY_PER_PLAY);
});

test('14 self-reported per-match goes to pending section', () => {
  const payment = buildPayment({ rsvp: baseRsvp, existing: { selfReported: true } });
  const sections = adminSections([payment]);
  assert.strictEqual(sections.pending.length, 1);
  assert.strictEqual(sections.unpaid.length, 0);
});

test('15 unpaid debtors sort before normal unpaid players', () => {
  const debtPlayer = buildPayment({ rsvp: { ...baseRsvp, playerId: 'a', playerName: 'A' }, debts: [{ amount: 35000 }] });
  const normalPlayer = buildPayment({ rsvp: { ...baseRsvp, playerId: 'b', playerName: 'B' } });
  const sections = adminSections([normalPlayer, debtPlayer]);
  assert.strictEqual(sections.unpaid[0].playerId, 'a');
});

test('16 paid monthly users go to monthly section', () => {
  const payment = buildPayment({ rsvp: baseRsvp, subscription: { paidMethod: 'transfer' } });
  const sections = adminSections([payment]);
  assert.strictEqual(sections.monthly.length, 1);
});

test('17 paid per-match users go to paid section', () => {
  const payment = buildPayment({ rsvp: baseRsvp, existing: { type: 'per-match', paid: true } });
  const sections = adminSections([payment]);
  assert.strictEqual(sections.paid.length, 1);
});

test('18 summary expected collected outstanding matches mixed rows', () => {
  const unpaid = buildPayment({ rsvp: { ...baseRsvp, playerId: 'u' } });
  const paid = buildPayment({ rsvp: { ...baseRsvp, playerId: 'p' }, existing: { type: 'per-match', paid: true } });
  const monthly = buildPayment({ rsvp: { ...baseRsvp, playerId: 'm' }, subscription: { paidMethod: 'cash' } });
  const result = summary([unpaid, paid, monthly]);
  assert.deepStrictEqual(result, { expected: 70000, collected: 35000, outstanding: 35000 });
});

test('19 close debt records only per-match unpaid own and guests', () => {
  const unpaid = buildPayment({ rsvp: { ...baseRsvp, playerId: 'u' } });
  const monthlyGuest = buildPayment({
    rsvp: { ...baseRsvp, playerId: 'm', guests: [{ name: 'Binh' }] },
    subscription: { paidMethod: 'cash' }
  });
  const debtors = closeDebtors([unpaid, monthlyGuest]);
  assert.strictEqual(debtors.length, 1);
  assert.strictEqual(debtCloseAmount(debtors[0]), PAY_PER_PLAY);
});

test('20 monthly unpaid player state shows monthly QR flow', () => {
  assert.strictEqual(playerState({
    subscriptionExists: true,
    subscriptionPaid: false,
    subscriptionSelfReported: false,
    paymentPaid: false,
    paymentSelfReported: false
  }), 'monthly-unpaid');
});

test('21 monthly self-report state waits for admin', () => {
  assert.strictEqual(playerState({
    subscriptionExists: true,
    subscriptionPaid: false,
    subscriptionSelfReported: true,
    paymentPaid: false,
    paymentSelfReported: false
  }), 'monthly-pending');
});

test('22 per-match confirmed state wins after admin confirm', () => {
  assert.strictEqual(playerState({
    subscriptionExists: false,
    subscriptionPaid: false,
    subscriptionSelfReported: false,
    paymentPaid: true,
    paymentSelfReported: false
  }), 'per-match-paid');
});

test('23 VND formatting uses Vietnamese currency', () => {
  assert.ok(fmtVND(PAY_MONTHLY).includes('150.000'));
});

test('24 inline scripts still parse', () => {
  for (const file of ['payment.html', 'admin/payment.html', 'admin/monthly.html', 'admin/index.html']) {
    const html = fs.readFileSync(file, 'utf8');
    let index = 0;
    for (const match of html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi)) {
      index += 1;
      new vm.Script(match[1], { filename: `${file}:script${index}` });
    }
  }
});

console.log('All payment flow tests passed.');
