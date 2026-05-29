# Setup Guide — Bóng Đá Thứ 7

## 1. Create Firebase Project

1. Go to https://console.firebase.google.com
2. Create new project (any name, e.g. "football-thu7")
3. Enable **Firestore Database** (Start in test mode)
4. Enable **Hosting** (optional, for free deployment)

## 2. Get Firebase Config

1. Project Settings → Your apps → Add Web App
2. Copy the config object
3. Open `js/firebase-config.js` and replace the placeholder values

## 3. Deploy Firestore Rules

In Firebase Console → Firestore → Rules, paste the contents of `firestore.rules`

## 4. Deploy to Firebase Hosting (Free)

```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # select your project, public dir = . (current folder)
firebase deploy
```

## 5. Or Deploy to Netlify (Free)

1. Go to https://netlify.com → New site from Git (or drag-and-drop the folder)
2. That's it. Your app is live.

## 6. First-Time Setup

1. Open the app → go to `/admin/`
2. Enter a 4-6 digit PIN (first entry sets the PIN)
3. Create a session for the upcoming Saturday
4. Add your 40 players in the Players section

## 7. Weekly Workflow

**Thursday–Friday:**
- Share the app URL with players
- First time: players enter name + phone on login screen
- Players mark themselves as going

**Friday 8pm:**
- Admin: Lock RSVP
- Admin → Payment page: review who owes what

**Saturday morning:**
- Admin → Teams: pick 3 captains, assign players
- Admin → Rotation: set up king-of-court, pick first match

**During the game:**
- Admin controls rotation on their phone

## 8. PWA Icons

Create two PNG icons and place them in `/icons/`:
- `icon-192.png` (192×192px)  
- `icon-512.png` (512×512px)

Use any green football emoji or logo. Tools: https://realfavicongenerator.net

## URL Structure

| URL | Who uses it |
|-----|-------------|
| `/` | All players — RSVP |
| `/login.html` | First-time login (name + phone) |
| `/admin/` | Admin hub (PIN protected) |
| `/admin/payment.html` | Admin — mark payments |
| `/admin/teams.html` | Admin — create teams |
| `/admin/rotation.html` | Admin — run matches |
