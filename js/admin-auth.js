// ─── Admin Auth ───────────────────────────────────────────────────────────────
// Include on every admin page. Call requireAuth(onSuccess) before showing UI.

let _pinBuffer = '';
let _onPinSuccess = null;

async function requireAuth(onSuccess) {
  if (isAdminAuthed()) {
    onSuccess();
    return;
  }
  _onPinSuccess = onSuccess;
  renderPinOverlay();
}

// ─── Overlay (sits on top of page — does NOT wipe body HTML) ──────────────────
function renderPinOverlay() {
  // Remove any existing overlay
  document.getElementById('pinOverlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'pinOverlay';
  overlay.innerHTML = `
    <div class="pin-box">
      <div style="text-align:center;margin-bottom:24px">
        <div style="font-size:2.5rem;margin-bottom:10px">🔐</div>
        <h2 style="font-size:1.3rem;font-weight:800">Admin PIN</h2>
        <p id="pinSubtitle" style="color:rgba(255,255,255,.5);font-size:.85rem;margin-top:6px">
          Nhập mã PIN để vào trang quản lý
        </p>
      </div>

      <div class="pin-display" id="pinDisplay">
        <div class="pin-dot" id="pd0"></div>
        <div class="pin-dot" id="pd1"></div>
        <div class="pin-dot" id="pd2"></div>
        <div class="pin-dot" id="pd3"></div>
      </div>

      <div class="pin-error" id="pinError"></div>

      <div class="pin-grid" id="pinGrid" style="margin:0 auto">
        ${[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(k =>
          k === '' ? '<div></div>' :
          k === '⌫' ? `<button class="pin-key del" onclick="pinKey('del')">${k}</button>` :
          `<button class="pin-key" onclick="pinKey('${k}')">${k}</button>`
        ).join('')}
      </div>

      <div style="margin-top:28px;text-align:center">
        <a href="/" style="color:rgba(255,255,255,.35);font-size:.82rem">← Về trang chính</a>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Check if this is first-time setup
  db.collection('config').doc('app').get().then(snap => {
    if (!snap.exists || !snap.data().adminPin) {
      const subtitle = document.getElementById('pinSubtitle');
      if (subtitle) subtitle.innerHTML =
        'Lần đầu sử dụng — nhập mã PIN mới<br><span style="font-size:.78rem;opacity:.6">(4–6 chữ số, sẽ được lưu lại)</span>';
    }
  });
}

function dismissPinOverlay() {
  const overlay = document.getElementById('pinOverlay');
  if (!overlay) return;
  overlay.classList.add('pin-overlay-out');
  setTimeout(() => overlay.remove(), 350);
}

// ─── PIN input ────────────────────────────────────────────────────────────────
function pinKey(key) {
  const errEl = document.getElementById('pinError');
  if (errEl) errEl.textContent = '';

  if (key === 'del') {
    _pinBuffer = _pinBuffer.slice(0, -1);
  } else if (_pinBuffer.length < 6) {
    _pinBuffer += key;
  }

  updatePinDisplay();

  if (_pinBuffer.length >= 4) {
    setTimeout(checkPin, 180);
  }
}

function updatePinDisplay() {
  const len = _pinBuffer.length;
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById('pd' + i);
    if (dot) dot.classList.toggle('filled', i < len);
  }
}

async function checkPin() {
  // Disable grid while checking
  const grid = document.getElementById('pinGrid');
  if (grid) grid.style.pointerEvents = 'none';

  try {
    const snap = await db.collection('config').doc('app').get();
    let storedPin = null;
    if (snap.exists) storedPin = snap.data().adminPin;

    // First-time: save this PIN
    if (!storedPin) {
      if (_pinBuffer.length < 4) { if (grid) grid.style.pointerEvents = ''; return; }
      await db.collection('config').doc('app').set({ adminPin: _pinBuffer }, { merge: true });
      onPinSuccess();
      return;
    }

    if (_pinBuffer === storedPin) {
      onPinSuccess();
    } else {
      // Wrong PIN
      const errEl = document.getElementById('pinError');
      if (errEl) errEl.textContent = t('wrongPin');
      const display = document.getElementById('pinDisplay');
      display?.classList.add('shake');
      setTimeout(() => display?.classList.remove('shake'), 400);
      _pinBuffer = '';
      updatePinDisplay();
      if (grid) grid.style.pointerEvents = '';
    }
  } catch (e) {
    console.error(e);
    const errEl = document.getElementById('pinError');
    if (errEl) errEl.textContent = 'Lỗi kết nối';
    _pinBuffer = '';
    updatePinDisplay();
    if (grid) grid.style.pointerEvents = '';
  }
}

function onPinSuccess() {
  setAdminAuth();
  dismissPinOverlay();
  _onPinSuccess && _onPinSuccess();
}
