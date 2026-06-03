# ⚽ Bóng Đá Thứ 7 — Saturday 7v7 Football PWA

A mobile-first Progressive Web App for organising a weekly Saturday 7v7 football group. Built with vanilla JS + Firebase Firestore. Vietnamese UI with English admin panel.

**Live site:** https://football7-a553e.web.app

---

## Features

### Player-facing
- **RSVP** — players sign up as Going / Not Going each week
- **Live squad list** — see who's in, real-time updates
- **Team reveal** — teams shown once admin unlocks the draw
- **Payment** — players self-report session fee payment
- **Leaderboard** — season stats and rankings
- **Session history** — past results and attendance

### Admin panel (`/admin`)
- PIN-protected (set in Firestore `config/admin`)
- **Open / Lock poll** — create a new session with date, time, location
- **Team draft** — randomise and assign players to teams
- **Match rotation** — King of Court rotation management
- **Payment tracking** — confirm who's paid
- **Monthly subscriptions** — track 150k/month fees
- **Friendly events** — schedule one-off matches

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

---

## Project Structure

```
/
├── index.html              # Home — RSVP & team view
├── board.html              # Live scoreboard display
├── leaderboard.html        # Season leaderboard
├── history.html            # Past sessions
├── betting.html            # Match betting
├── payment.html            # Player payment page
├── login.html              # Player login
├── schedule.html           # Group schedule
├── sw.js                   # Service worker
├── manifest.json           # PWA manifest
│
├── admin/
│   ├── index.html          # Admin hub
│   ├── teams.html          # Team draft
│   ├── rotation.html       # Match rotation
│   ├── payment.html        # Payment management
│   ├── monthly.html        # Monthly subscriptions
│   └── events.html         # Friendly match events
│
├── js/
│   ├── firebase-config.js  # Firebase init
│   ├── app.js              # Player-facing logic
│   ├── admin.js            # Admin logic
│   ├── admin-auth.js       # PIN auth + logout
│   ├── rsvp.js             # RSVP flow
│   ├── utils.js            # Shared helpers, i18n
│   └── core/
│       ├── session-core.js
│       └── payment-core.js
│
└── css/
    └── style.css           # Global styles
```

---

## Firebase Collections

| Collection | Purpose |
|---|---|
| `config/admin` | Admin PIN |
| `config/settings` | Current session ID |
| `config/app` | Current event ID, bank details |
| `sessions/{date}` | Weekly session (votes, teams, payments subcollections) |
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

---

## Weekly Flow

1. **Admin** opens poll → brothers get notified → RSVP opens
2. **Players** tap Going / Not Going on home screen
3. **Admin** locks poll when squad is full
4. **Admin** runs team draft → teams revealed to players
5. **Match day** — admin uses rotation timer, tracks scores
6. **Admin** ends session → payment collection begins
7. **Players** mark themselves as paid

---

## Notes

- Max-width 480px — designed for mobile only
- Firestore rules are currently open (PIN enforced client-side). Tighten with Firebase Auth when phone auth is added.
- Service worker cache version: `football-v9` — bump when deploying breaking changes
