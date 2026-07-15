const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const root = path.resolve(__dirname, '..');
let server;
let baseURL;

const firebaseMock = `
(() => {
  const data = {
    config: {
      app: { currentEventId: null, currentSessionId: null, adminPin: '1234' },
      payment: { bankCode: 'MB', accountNumber: '123456789', accountName: 'NGUYEN VAN A' },
    },
    sessions: {},
    players: {},
    subscriptions: {},
    debts: {},
  };

  function snapshot(id, value) {
    return {
      id,
      exists: value !== undefined && value !== null,
      data: () => value || {},
    };
  }

  function querySnapshot(values) {
    const docs = values.map(([id, value]) => snapshot(id, value));
    return {
      docs,
      empty: docs.length === 0,
      forEach: callback => docs.forEach(callback),
    };
  }

  function collection(name, parentPath = []) {
    return {
      doc(id) {
        const key = String(id);
        return docRef([...parentPath, name, key]);
      },
      where() { return this; },
      orderBy() { return this; },
      limit() { return this; },
      async get() {
        const values = Object.entries(readPath([...parentPath, name]) || {});
        return querySnapshot(values);
      },
      onSnapshot(callback) {
        const values = Object.entries(readPath([...parentPath, name]) || {});
        setTimeout(() => callback(querySnapshot(values)), 0);
        return () => {};
      },
    };
  }

  function docRef(parts) {
    return {
      async get() {
        return snapshot(parts[parts.length - 1], readPath(parts));
      },
      async set(value, options) {
        const current = readPath(parts) || {};
        writePath(parts, options && options.merge ? { ...current, ...value } : value);
      },
      async update(value) {
        const current = readPath(parts) || {};
        writePath(parts, { ...current, ...value });
      },
      async delete() {
        writePath(parts, undefined);
      },
      collection(name) {
        return collection(name, parts);
      },
      onSnapshot(callback) {
        setTimeout(() => callback(snapshot(parts[parts.length - 1], readPath(parts))), 0);
        return () => {};
      },
    };
  }

  function readPath(parts) {
    let node = data;
    for (const part of parts) {
      if (!node || !(part in node)) return undefined;
      node = node[part];
    }
    return node;
  }

  function writePath(parts, value) {
    let node = data;
    for (const part of parts.slice(0, -1)) {
      node[part] = node[part] || {};
      node = node[part];
    }
    if (value === undefined) delete node[parts[parts.length - 1]];
    else node[parts[parts.length - 1]] = value;
  }

  window.firebase = {
    initializeApp() {},
    firestore() {
      return {
        collection,
        batch() {
          const jobs = [];
          return {
            set(ref, value, options) { jobs.push(() => ref.set(value, options)); },
            update(ref, value) { jobs.push(() => ref.update(value)); },
            delete(ref) { jobs.push(() => ref.delete()); },
            async commit() { for (const job of jobs) await job(); },
          };
        },
        enablePersistence() { return Promise.resolve(); },
      };
    },
  };
  window.firebase.firestore.FieldValue = { serverTimestamp: () => new Date('2026-06-02T00:00:00Z') };
  window.firebase.firestore.Timestamp = {
    now: () => ({ toDate: () => new Date('2026-06-02T00:00:00Z') }),
    fromDate: date => ({ toDate: () => date }),
  };
})();
`;

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const filePath = path.join(root, urlPath === '/' ? 'index.html' : urlPath.slice(1));
    if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    const type = ext === '.html' ? 'text/html' : ext === '.css' ? 'text/css' : ext === '.js' ? 'text/javascript' : 'application/octet-stream';
    res.writeHead(200, { 'content-type': `${type}; charset=utf-8` });
    fs.createReadStream(filePath).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
});

test.beforeEach(async ({ page }) => {
  await page.route('https://www.gstatic.com/firebasejs/**', route => {
    route.fulfill({ status: 200, contentType: 'text/javascript', body: firebaseMock });
  });
});

test('login validates required player fields', async ({ page }) => {
  await page.goto(`${baseURL}/login.html`);
  await page.locator('#joinBtn').click();
  await expect(page.locator('#nameError')).toBeVisible();
  await expect(page.locator('#phoneError')).toBeVisible();
});

test('login saves identity and redirects to home', async ({ page }) => {
  await page.goto(`${baseURL}/login.html`);
  await page.locator('#nameInput').fill('Nguyen Minh Quan');
  await page.locator('#phoneInput').fill('0912345678');
  await page.locator('#joinBtn').click();
  await page.waitForURL('**/index.html');
  const identity = await page.evaluate(() => JSON.parse(localStorage.getItem('bdt7_player')));
  expect(identity).toMatchObject({ name: 'Nguyen Minh Quan', phone: '0912345678', playerId: 'ph_0912345678' });
});

test('home redirects anonymous players to login', async ({ page }) => {
  await page.goto(`${baseURL}/index.html`);
  await page.waitForURL('**/login.html');
});

test('home authenticated empty session renders empty state', async ({ page }) => {
  await page.goto(`${baseURL}/login.html`);
  await page.evaluate(() => {
    localStorage.setItem('bdt7_player', JSON.stringify({ name: 'An', phone: '0912345678', playerId: 'ph_0912345678' }));
  });
  await page.goto(`${baseURL}/index.html`);
  await expect(page.locator('#emptyState')).toBeVisible();
});

test('admin page shows PIN gate before dashboard', async ({ page }) => {
  await page.goto(`${baseURL}/admin/index.html`);
  await expect(page.locator('#pinOverlay')).toBeVisible();
  await expect(page.locator('#adminContent')).toBeHidden();
});
