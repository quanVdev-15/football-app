# Project Map

This app is a static Firebase Hosting site backed by Firestore.

## Runtime Pages

- `index.html` - player RSVP and active event screen.
- `login.html` - player identity entry.
- `payment.html` - player payment/QR flow.
- `schedule.html` - public schedule view.
- `admin/index.html` - admin hub and active session controls.
- `admin/teams.html` - team split workflow.
- `admin/events.html` - friendly/event admin workflow.
- `admin/monthly.html` - monthly membership workflow.
- `admin/payment.html` - admin payment close/debt workflow.

## Shared App Code

- `js/firebase-config.js` - Firebase initialization.
- `js/admin-auth.js` - admin authentication and shared admin session helpers.
- `js/rsvp.js` - current player-facing RSVP runtime.
- `js/core/payment-core.js` - pure payment rules that can be unit tested.
- `js/core/session-core.js` - pure RSVP/session/team/event helper rules that can be unit tested.

Keep business rules in `js/core/*` when possible. Page scripts should mostly read/write Firestore and update the DOM.

## Tests

- `tests/payment-core.test.js` - payment, debt, QR, and admin payment grouping rules.
- `tests/session-core.test.js` - RSVP, status, team, pitch, reveal, and map helper rules.
- `tests/browser-smoke.spec.js` - browser smoke tests with a local server and mocked Firebase.
- `test-payment-flow.js` - legacy smoke tests for payment script parsing and older payment helper checks.

Run:

```powershell
npm.cmd test
npm.cmd run test:browser
node test-payment-flow.js
```

Use `npm.cmd` on Windows PowerShell if `npm` is blocked by execution policy.

## Firebase Deploy Notes

`firebase.json` ignores local-only files such as tests, agent files, and test helpers so they are not published by Hosting.
