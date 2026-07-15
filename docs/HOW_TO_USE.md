# How to Use — Bóng Đá Thứ 7

Live site: https://football7-a553e.web.app
Admin hub: https://football7-a553e.web.app/admin/

The whole UI is in Vietnamese for players; this guide is in English just for
whoever's operating/maintaining the app.

## Weekly flow (the short version)

1. **Admin opens the poll** for next Saturday (Hub → "Open poll").
2. **Players log in and RSVP** on the main site.
3. **Admin manages the roster** (GK flags, skill points, player cap) from the Hub.
4. **Admin splits teams** once enough players are in.
5. **Players open the site again** and see their team.

---

## Admin guide

Go to `/admin/` and log in.

### Hub (`admin/index.html`)
This is home base. It shows the current session status and player count.

- **Open poll** — pick a date, time, and (optional) location for the next
  session. This creates the session players RSVP into. If you pick "Open
  poll" again after a session's date has already passed, it starts a fresh
  one — old sessions never block a new poll from opening.
- **Player cap** — set how many players can join (+/- buttons or presets
  18/21/24). This also drives how big each team is when you split teams
  later (cap ÷ number of teams). Press **Save cap** to apply.
- **Going today** — live list of who has RSVP'd.
  - The number in the top-right is the current headcount.
  - "GKs: x/3" shows how many goalkeepers have signed up.
  - Tap **Manage players / GK** to expand the full tool: search by name,
    switch between *Going / GK / All* tabs, tap the GK switch to flag a
    goalkeeper, or tap the star rating to adjust a player's skill points
    (used for balancing teams).

### Teams (`admin/teams.html`)
Splits the current "Going" list into balanced teams (goalkeepers spread out,
skill points balanced across teams). Team size is based on the player cap
you set in the Hub (e.g. cap 21 → 3 teams of 7, cap 24 → 3 teams of 8). Use
this once the roster looks right; re-run it to reshuffle before you confirm.

### Ratings (`admin/ratings.html`)
Where you set each player's skill/rating points outside of a live session —
useful for keeping ratings up to date week to week so team splits stay fair.

### Events (`admin/events.html`)
For one-off friendlies/extra matches outside the normal Saturday cadence.

### Monthly / Payment (`admin/monthly.html`, `admin/payment.html`)
Currently hidden from the main flow (not linked from the Hub) — payment
collection is paused for now. The pages still exist on disk if this gets
turned back on later.

---

## Player guide

1. Open the site, log in with **name + phone number** (check the goalkeeper
   box if that's you).
2. When a poll is open, tap to **join** — you'll show up in the admin's
   "Going" list right away.
3. Once the admin splits teams, come back to the site to see **your team**,
   shown first with a "Bạn" (You) badge.

---

## Notes for whoever maintains this later

- Deploying: `firebase deploy --only hosting` from the project root (project
  is `football7-a553e`, already set as default via `.firebaserc`).
- Tests: `npm test` (unit) and `npm run test:browser` (Playwright smoke
  test) — see `docs/PROJECT_MAP.md` for details on what each test file
  covers and where business logic lives (`js/core/*`).
- A session stops counting as "active" automatically once its date has
  passed — that rule lives in one place, `js/session-utils.js`, shared by
  both the admin site and the player site. If "active session" behavior
  ever looks wrong, that's the file to check first.
