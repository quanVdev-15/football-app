# ⚽ Bóng Đá Thứ 7 — Saturday 7v7 Football PWA

A mobile-first Progressive Web App for organising a weekly Saturday 7v7 football group. Built with vanilla JS + Firebase Firestore. Vietnamese UI with English admin panel.

**Live site:** https://football7-a553e.web.app

---

## Features

### Player-facing
- **Login** — player name/phone auth with animated welcome screen
- **RSVP** — players sign up as Going / Not Going each week
- **Live squad list** — see who's in, real-time updates
- **Team reveal** — teams shown once admin unlocks the draw
- **Payment** — players self-report session fee payment (35,000đ) with QR code display
- **Schedule** — view upcoming sessions and friendly matches with RSVP buttons

### Admin panel (`/admin`)
- PIN-protected (set in Firestore `config/admin`)
- **Open / Lock poll** — create a new session with date, time, location
- **Team draft** — randomise and assign players into 3 balanced teams with GK selection
- **Payment tracking** — confirm who's paid per session, guest fees, debt tracking
- **Monthly subscriptions** — track 150,000đ/month fees with debt reconciliation
- **Friendly events** — schedule one-off matches with live badges and event controls

### Notifications
- **Poll open alert** — when admin opens a new RSVP session, players with notifications enabled get pinged
- **Match timer** — in-game rotation timer with vibration alert

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Vanilla JS (ES modules), HTML, CSS |
| Database | Firebase Firestore (real-time) |
| Hosting | Firebase Hosting |
| Offline | Service Worker (cache-first) |
| Auth | PIN-based admin auth (localStorage) |
| Tests | Playwright (E2E) + Node.js unit tests |

---

## Project Structure

```
/
├── index.html              # Home — RSVP, squad list & team reveal
├── login.html              # Player login (name + phone)
├── payment.html            # Player payment page with QR code
├── schedule.html           # Group schedule — sessions & friendlies
├── test-seed.html          # Dev utility — seed 21 test players & session
├── sw.js                   # Service worker (PWA offline + notifications)
├── manifest.json           # PWA manifest
│
├── admin/
│   ├── index.html          # Admin hub — session control + quick actions
│   ├── teams.html          # Team draft — randomise & assign players
│   ├── payment.html        # Per-session payment management
│   ├── monthly.html        # Monthly subscription tracking (150k/month)
│   └── events.html         # Friendly match event management
│
├── js/
│   ├── firebase-config.js  # Firebase init + offline persistence
│   ├── app.js              # Player-facing core — real-time listeners, RSVP, teams
│   ├── admin.js            # Admin logic — session CRUD, team randomisation
│   ├── admin-auth.js       # PIN auth, 24hr session, logout redirect
│   ├── rsvp.js             # RSVP interaction + local identity caching
│   ├── utils.js            # Shared constants, i18n (VI/EN), helpers
│   └── core/
│       ├── payment-core.js # Payment engine — fees, guests, debts (UMD)
│       └── session-core.js # Session state machine — capacity, RSVP, teams
│
├── css/
│   └── style.css           # Global design system (green #1b4332, 480px mobile)
│
├── tests/
│   ├── payment-core.test.js    # Unit tests — payment calculations
│   ├── session-core.test.js    # Unit tests — session state, name normalisation
│   └── browser-smoke.spec.js   # Playwright E2E smoke tests
│
└── n/                      # Firebase Hosting default pages (unused)
```

---

## Firebase Collections

| Collection | Purpose |
|---|---|
| `config/admin` | Admin PIN |
| `config/settings` | Current session ID |
| `config/app` | Current event ID, bank details |
| `sessions/{date}` | Weekly session doc with `votes`, `teams`, `payments` subcollections |
| `players/{id}` | Player roster |
| `subscriptions/{id}` | Monthly fee records |
| `debts/{id}` | Outstanding debts |
| `events/{id}` | Friendly match events |

---

## Getting Started

### 1. Install Firebase CLI
```bash
npm install -g firebase-tools
firebase login
```

### 2. Set admin PIN
In Firebase Console → Firestore, create:
```
config/admin  →  { pin: "YOUR_PIN" }
```

### 3. Add players
In Firestore, add documents to the `players` collection:
```
players/{id}  →  { name: "Player Name" }
```

### 4. Run locally
```bash
firebase serve --only hosting --port 5000
```

### 5. Deploy
```bash
firebase deploy --only hosting
```

### 6. Run tests
```bash
npm test
```

---

## Weekly Flow

1. **Admin** opens poll → brothers get notified → RSVP opens
2. **Players** log in and tap Going / Not Going on home screen
3. **Admin** locks poll when squad is full
4. **Admin** runs team draft → 3 balanced teams revealed to players
5. **Match day** — admin uses rotation timer, tracks scores
6. **Admin** ends session → payment collection begins
7. **Players** mark themselves as paid (35,000đ per session)

---

## Payment Model

| Type | Amount |
|---|---|
| Session fee | 35,000đ per player |
| Guest fee | Configurable per session |
| Monthly subscription | 150,000đ per month |

---

## Session States

| Status | Meaning |
|---|---|
| `open` | Poll is live, players can RSVP |
| `locked` | Squad locked, no more RSVPs |
| `teamsReady` | Teams drawn and visible to players |
| `done` | Session ended, payment collection phase |

---

## Notes

- Max-width 480px — designed for mobile only
- Firestore security rules are currently open (PIN enforced client-side). Tighten with Firebase Auth when phone auth is added.
- Service worker cache version: `football-v9` — bump when deploying breaking changes to force cache refresh
