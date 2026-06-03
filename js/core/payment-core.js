(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PaymentCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const PAY_PER_PLAY = 35000;
  const PAY_MONTHLY = 150000;

  function isGoing(data) {
    return !!data && ['in', 'going'].includes(data.status || data.vote);
  }

  function validGuests(rsvp) {
    return (rsvp?.guests || []).filter(guest => String(guest?.name || '').trim());
  }

  function monthFromDate(date) {
    const d = toDate(date) || new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function isoDate(date) {
    const d = toDate(date) || new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function toDate(value) {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    if (value instanceof Date) return value;
    return new Date(String(value).includes('T') ? value : `${value}T00:00:00`);
  }

  function fmtVND(amount) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
  }

  function buildPaymentRecord({ playerId, rsvp, existing = {}, subscription = null, debts = [], now = null }) {
    const monthlyPaid = subscription?.paid === true || !!subscription?.paidMethod;
    const guests = validGuests(rsvp);
    const guestAmount = guests.length * PAY_PER_PLAY;
    const debt = debts
      .filter(item => !playerId || item.playerId === playerId)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const paid = monthlyPaid ? true : (existing.type === 'per-match' ? !!existing.paid : false);

    return {
      playerId: playerId || rsvp?.playerId || existing.playerId || '',
      playerName: rsvp?.playerName || existing.playerName || '',
      type: monthlyPaid ? 'monthly' : 'per-match',
      amount: monthlyPaid ? 0 : PAY_PER_PLAY,
      paid,
      paidAt: paid ? (existing.paidAt || subscription?.paidAt || now) : null,
      paidMethod: paid ? (existing.paidMethod || subscription?.paidMethod || null) : null,
      selfReported: existing.selfReported || false,
      selfReportedAt: existing.selfReportedAt || null,
      guestCount: guests.length,
      guestAmount,
      guestPaid: guestAmount > 0 ? !!existing.guestPaid : false,
      guestPaidAt: guestAmount > 0 ? (existing.guestPaidAt || null) : null,
      debt,
    };
  }

  function paymentChanged(oldData = {}, data = {}) {
    return !oldData.playerId
      || oldData.playerName !== data.playerName
      || oldData.type !== data.type
      || oldData.amount !== data.amount
      || oldData.paid !== data.paid
      || oldData.paidMethod !== data.paidMethod
      || oldData.selfReported !== data.selfReported
      || oldData.guestCount !== data.guestCount
      || oldData.guestAmount !== data.guestAmount
      || oldData.guestPaid !== data.guestPaid
      || oldData.debt !== data.debt;
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

  function playerPaymentState(state) {
    const monthlyPaid = state.subscriptionExists && state.subscriptionPaid;
    const monthlyPending = state.subscriptionExists && !state.subscriptionPaid && state.subscriptionSelfReported;
    const monthlyUnpaid = state.subscriptionExists && !state.subscriptionPaid;
    const perMatchPending = state.paymentSelfReported && !state.paymentPaid;

    if (monthlyPaid) return 'monthly-paid';
    if (monthlyPending) return 'monthly-pending';
    if (monthlyUnpaid) return 'monthly-unpaid';
    if (state.paymentPaid) return 'per-match-paid';
    if (perMatchPending) return 'per-match-pending';
    return 'per-match-unpaid';
  }

  function adminPaymentSections(rows) {
    const pendingIds = new Set(rows.filter(payment => payment.selfReported && !payment.paid).map(payment => payment.playerId));
    const pending = rows.filter(payment => pendingIds.has(payment.playerId));
    const unpaid = rows.filter(payment => outstandingAmount(payment) > 0 && !pendingIds.has(payment.playerId))
      .sort((a, b) => (b.debt || 0) - (a.debt || 0) || String(a.playerName).localeCompare(String(b.playerName), 'vi'));
    const monthly = rows.filter(payment => payment.type === 'monthly' && payment.paid)
      .sort((a, b) => String(a.playerName).localeCompare(String(b.playerName), 'vi'));
    const paid = rows.filter(payment => payment.type === 'per-match' && outstandingAmount(payment) === 0 && payment.paid)
      .sort((a, b) => String(a.playerName).localeCompare(String(b.playerName), 'vi'));
    return { unpaid, pending, monthly, paid };
  }

  function paymentSummary(rows) {
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

  function qrAddInfo({ mode, sessionDate, monthKey, playerName }) {
    const date = toDate(sessionDate);
    const ddmm = date ? `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}` : '';
    const mm = String(monthKey || '').slice(5, 7);
    return mode === 'monthly' ? `BDThu7 thang ${mm} ${playerName}` : `BDThu7 ${playerName} ${ddmm}`.trim();
  }

  function buildQrUrl({ bankCfg, amount, addInfo }) {
    if (!bankCfg?.bankCode || !bankCfg?.accountNumber) return '';
    const accountName = bankCfg.accountName ? `&accountName=${encodeURIComponent(bankCfg.accountName)}` : '';
    return `https://img.vietqr.io/image/${encodeURIComponent(bankCfg.bankCode)}-${encodeURIComponent(bankCfg.accountNumber)}-qr_only.jpg?amount=${amount}&addInfo=${encodeURIComponent(addInfo)}${accountName}`;
  }

  return {
    PAY_PER_PLAY,
    PAY_MONTHLY,
    adminPaymentSections,
    buildPaymentRecord,
    buildQrUrl,
    closeDebtors,
    debtCloseAmount,
    fmtVND,
    isGoing,
    isoDate,
    monthFromDate,
    outstandingAmount,
    paymentChanged,
    paymentSummary,
    playerPaymentState,
    qrAddInfo,
    toDate,
    validGuests,
  };
});
