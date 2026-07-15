// Shared "is this session still usable" logic — used by BOTH the admin site
// (js/admin-auth.js) and the player-facing site (js/rsvp.js), so there is
// exactly one place that defines what "expired" means. Load this file before
// either of those scripts.
//
// Why this exists: a session used to get retired by nulling out
// config/app.currentSessionId when the old "End session" flow ran. That flow
// was removed, so sessions never get retired automatically — a session whose
// date has passed can otherwise keep looking "active" forever. Every screen
// that reads the active session (Hub, teams, ratings, the player RSVP screen,
// Save Cap, ...) must agree on staleness, or you get exactly the bug we saw:
// the Hub says "No session" while the roster below it still shows attendees
// from a session that ended over a week ago.

function toDate(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(String(value).includes('T') ? value : `${value}T00:00:00`);
}

// A session is "stale" once its date has passed — reopening/displaying it
// would keep showing an old, already-happened Saturday as if it were still
// upcoming. We compare calendar dates only (midnight to midnight), so a
// session dated *today* stays valid all day, however late — it only goes
// stale starting the next calendar day.
//
// Field priority matters here: `saturdayDate`/`id` are plain "YYYY-MM-DD"
// strings that encode the intended calendar day directly and parse as local
// midnight on whichever device reads them. The Firestore `date` Timestamp,
// by contrast, round-trips through whatever timezone the session was
// *created* in, then gets re-interpreted in the *reading* device's local
// timezone — for two devices in different timezones that could shift the
// calendar day by one. Since every session this app creates always has
// `saturdayDate` (and its doc id is that same string), prefer those and only
// fall back to `date` if neither is present.
function isSessionExpired(session) {
  const sessionDate = toDate(session?.saturdayDate || session?.id || session?.date);
  if (!sessionDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cmp = new Date(sessionDate);
  cmp.setHours(0, 0, 0, 0);
  return cmp < today;
}

// A session can be treated as "active" only if it exists, hasn't been
// explicitly closed, and its date hasn't passed yet.
function canReuseSession(session) {
  return !!session && session.status !== 'done' && !isSessionExpired(session);
}
