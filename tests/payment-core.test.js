const assert = require('node:assert/strict');
const test = require('node:test');
const core = require('../js/core/payment-core');

const baseRsvp = { playerId: 'p1', playerName: 'An', status: 'in', guests: [] };
const paidAt = new Date('2026-06-07T06:30:00+07:00');

[
  [{ status: 'in' }, true],
  [{ status: 'going' }, true],
  [{ vote: 'going' }, true],
  [{ status: 'out' }, false],
  [{ vote: 'notGoing' }, false],
  [null, false],
].forEach(([input, expected], index) => {
  test(`payment going state ${index + 1}`, () => assert.equal(core.isGoing(input), expected));
});

[
  [{ guests: [{ name: 'Binh' }, { name: ' ' }, {}, { name: 'Cuong' }] }, 2],
  [{ guests: [] }, 0],
  [{}, 0],
  [null, 0],
].forEach(([rsvp, expected], index) => {
  test(`valid guest count ${index + 1}`, () => assert.equal(core.validGuests(rsvp).length, expected));
});

[
  [new Date(2026, 0, 1), '2026-01'],
  [new Date(2026, 5, 7), '2026-06'],
  ['2026-12-31', '2026-12'],
  [{ toDate: () => new Date(2027, 2, 9) }, '2027-03'],
].forEach(([input, expected], index) => {
  test(`monthFromDate ${index + 1}`, () => assert.equal(core.monthFromDate(input), expected));
});

[
  [new Date(2026, 0, 1), '2026-01-01'],
  [new Date(2026, 9, 12), '2026-10-12'],
  ['2026-12-31', '2026-12-31'],
  [{ toDate: () => new Date(2027, 2, 9) }, '2027-03-09'],
].forEach(([input, expected], index) => {
  test(`isoDate ${index + 1}`, () => assert.equal(core.isoDate(input), expected));
});

test('build per-match unpaid payment record', () => {
  const payment = core.buildPaymentRecord({ playerId: 'p1', rsvp: baseRsvp });
  assert.equal(payment.type, 'per-match');
  assert.equal(payment.amount, core.PAY_PER_PLAY);
  assert.equal(payment.paid, false);
});

test('build monthly paid payment record', () => {
  const payment = core.buildPaymentRecord({
    playerId: 'p1',
    rsvp: baseRsvp,
    subscription: { paid: true, paidMethod: 'cash', paidAt },
  });
  assert.equal(payment.type, 'monthly');
  assert.equal(payment.amount, 0);
  assert.equal(payment.paid, true);
  assert.equal(payment.paidMethod, 'cash');
});

test('legacy subscription paid method counts as monthly paid', () => {
  const payment = core.buildPaymentRecord({ playerId: 'p1', rsvp: baseRsvp, subscription: { paidMethod: 'transfer' } });
  assert.equal(payment.type, 'monthly');
  assert.equal(payment.paid, true);
});

test('guest amount is based on named guests only', () => {
  const payment = core.buildPaymentRecord({
    playerId: 'p1',
    rsvp: { ...baseRsvp, guests: [{ name: 'Binh' }, { name: '   ' }, { name: 'Cuong' }] },
  });
  assert.equal(payment.guestCount, 2);
  assert.equal(payment.guestAmount, core.PAY_PER_PLAY * 2);
});

test('debts are filtered by player id', () => {
  const payment = core.buildPaymentRecord({
    playerId: 'p1',
    rsvp: baseRsvp,
    debts: [{ playerId: 'p1', amount: 35000 }, { playerId: 'p2', amount: 70000 }],
  });
  assert.equal(payment.debt, 35000);
});

[
  [{}, true],
  [{ playerId: 'p1' }, true],
  [{ playerId: 'p1', playerName: 'An', type: 'per-match', amount: 35000, paid: false, paidMethod: null, selfReported: false, guestCount: 0, guestAmount: 0, guestPaid: false, debt: 0 }, false],
  [{ playerId: 'p1', playerName: 'Binh', type: 'per-match', amount: 35000, paid: false, paidMethod: null, selfReported: false, guestCount: 0, guestAmount: 0, guestPaid: false, debt: 0 }, true],
].forEach(([oldData, expected], index) => {
  test(`paymentChanged ${index + 1}`, () => {
    const data = { playerId: 'p1', playerName: 'An', type: 'per-match', amount: 35000, paid: false, paidMethod: null, selfReported: false, guestCount: 0, guestAmount: 0, guestPaid: false, debt: 0 };
    assert.equal(core.paymentChanged(oldData, data), expected);
  });
});

[
  [{ type: 'per-match', paid: false, amount: 35000, guestAmount: 0, guestPaid: false, debt: 0 }, 35000],
  [{ type: 'per-match', paid: true, amount: 35000, guestAmount: 35000, guestPaid: false, debt: 0 }, 35000],
  [{ type: 'per-match', paid: true, amount: 35000, guestAmount: 35000, guestPaid: true, debt: 0 }, 0],
  [{ type: 'monthly', paid: true, amount: 0, guestAmount: 35000, guestPaid: false, debt: 0 }, 35000],
  [{ type: 'monthly', paid: true, amount: 0, guestAmount: 0, guestPaid: false, debt: 70000 }, 70000],
].forEach(([payment, expected], index) => {
  test(`outstandingAmount ${index + 1}`, () => assert.equal(core.outstandingAmount(payment), expected));
});

[
  [{ type: 'per-match', paid: false, amount: 35000, guestAmount: 0, guestPaid: false }, 35000],
  [{ type: 'per-match', paid: true, amount: 35000, guestAmount: 35000, guestPaid: false }, 35000],
  [{ type: 'per-match', paid: true, amount: 35000, guestAmount: 35000, guestPaid: true }, 0],
  [{ type: 'monthly', paid: true, amount: 0, guestAmount: 35000, guestPaid: false }, 0],
].forEach(([payment, expected], index) => {
  test(`debtCloseAmount ${index + 1}`, () => assert.equal(core.debtCloseAmount(payment), expected));
});

[
  [{ subscriptionExists: true, subscriptionPaid: true }, 'monthly-paid'],
  [{ subscriptionExists: true, subscriptionPaid: false, subscriptionSelfReported: true }, 'monthly-pending'],
  [{ subscriptionExists: true, subscriptionPaid: false, subscriptionSelfReported: false }, 'monthly-unpaid'],
  [{ subscriptionExists: false, paymentPaid: true }, 'per-match-paid'],
  [{ subscriptionExists: false, paymentSelfReported: true, paymentPaid: false }, 'per-match-pending'],
  [{ subscriptionExists: false, paymentSelfReported: false, paymentPaid: false }, 'per-match-unpaid'],
].forEach(([state, expected], index) => {
  test(`playerPaymentState ${index + 1}`, () => assert.equal(core.playerPaymentState(state), expected));
});

test('admin sections classify pending without duplicating unpaid', () => {
  const rows = [
    { playerId: 'pending', playerName: 'Pending', type: 'per-match', amount: 35000, paid: false, selfReported: true, guestAmount: 0, guestPaid: false, debt: 0 },
    { playerId: 'unpaid', playerName: 'Unpaid', type: 'per-match', amount: 35000, paid: false, selfReported: false, guestAmount: 0, guestPaid: false, debt: 0 },
  ];
  const sections = core.adminPaymentSections(rows);
  assert.deepEqual(sections.pending.map(row => row.playerId), ['pending']);
  assert.deepEqual(sections.unpaid.map(row => row.playerId), ['unpaid']);
});

test('admin unpaid rows sort debt before normal unpaid', () => {
  const rows = [
    { playerId: 'b', playerName: 'B', type: 'per-match', amount: 35000, paid: false, guestAmount: 0, guestPaid: false, debt: 0 },
    { playerId: 'a', playerName: 'A', type: 'per-match', amount: 35000, paid: false, guestAmount: 0, guestPaid: false, debt: 70000 },
  ];
  assert.deepEqual(core.adminPaymentSections(rows).unpaid.map(row => row.playerId), ['a', 'b']);
});

test('admin sections sort monthly and paid by name', () => {
  const rows = [
    { playerId: 'z', playerName: 'Zed', type: 'monthly', paid: true, amount: 0, guestAmount: 0, guestPaid: false, debt: 0 },
    { playerId: 'a', playerName: 'An', type: 'monthly', paid: true, amount: 0, guestAmount: 0, guestPaid: false, debt: 0 },
    { playerId: 'c', playerName: 'Cuong', type: 'per-match', paid: true, amount: 35000, guestAmount: 0, guestPaid: false, debt: 0 },
    { playerId: 'b', playerName: 'Binh', type: 'per-match', paid: true, amount: 35000, guestAmount: 0, guestPaid: false, debt: 0 },
  ];
  const sections = core.adminPaymentSections(rows);
  assert.deepEqual(sections.monthly.map(row => row.playerId), ['a', 'z']);
  assert.deepEqual(sections.paid.map(row => row.playerId), ['b', 'c']);
});

test('payment summary handles mixed payment states', () => {
  const rows = [
    { amount: 35000, guestAmount: 0, debt: 0, paid: false, guestPaid: false },
    { amount: 35000, guestAmount: 35000, debt: 0, paid: true, guestPaid: false },
    { amount: 0, guestAmount: 0, debt: 70000, paid: true, guestPaid: false },
  ];
  assert.deepEqual(core.paymentSummary(rows), { expected: 175000, collected: 105000, outstanding: 70000 });
});

test('closeDebtors returns only per-match rows with closable debt', () => {
  const rows = [
    { playerId: 'a', type: 'per-match', paid: false, amount: 35000, guestAmount: 0, guestPaid: false },
    { playerId: 'b', type: 'monthly', paid: true, amount: 0, guestAmount: 35000, guestPaid: false },
    { playerId: 'c', type: 'per-match', paid: true, amount: 35000, guestAmount: 35000, guestPaid: true },
  ];
  assert.deepEqual(core.closeDebtors(rows).map(row => row.playerId), ['a']);
});

test('fmtVND formats Vietnamese dong', () => {
  assert.match(core.fmtVND(core.PAY_MONTHLY), /150\.000/);
});

test('qrAddInfo builds per-match transfer message', () => {
  assert.equal(core.qrAddInfo({ mode: 'per-match', sessionDate: '2026-06-07', monthKey: '2026-06', playerName: 'An' }), 'BDThu7 An 07/06');
});

test('qrAddInfo builds monthly transfer message', () => {
  assert.equal(core.qrAddInfo({ mode: 'monthly', sessionDate: '2026-06-07', monthKey: '2026-06', playerName: 'An' }), 'BDThu7 thang 06 An');
});

test('buildQrUrl returns blank without required bank config', () => {
  assert.equal(core.buildQrUrl({ bankCfg: {}, amount: 35000, addInfo: 'BDThu7 An' }), '');
});

test('buildQrUrl encodes bank config and addInfo', () => {
  const url = core.buildQrUrl({ bankCfg: { bankCode: 'MB', accountNumber: '123 456', accountName: 'NGUYEN VAN A' }, amount: 35000, addInfo: 'BDThu7 An 07/06' });
  assert.match(url, /^https:\/\/img\.vietqr\.io\/image\/MB-123%20456-qr_only\.jpg/);
  assert.match(url, /amount=35000/);
  assert.match(url, /addInfo=BDThu7%20An%2007%2F06/);
});
