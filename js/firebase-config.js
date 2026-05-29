// firebase-config.js — Firebase initialisation + offline persistence
// Uses Firebase v9 compat SDK loaded via CDN (window.firebase global)

const firebaseConfig = {
  apiKey: "AIzaSyAciGWtEvo8pd_Y-GNfUq9cea0j67rSHbQ",
  authDomain: "football7-a553e.firebaseapp.com",
  projectId: "football7-a553e",
  storageBucket: "football7-a553e.firebasestorage.app",
  messagingSenderId: "135775800951",
  appId: "1:135775800951:web:da31dad2557e2b86894072"
};

firebase.initializeApp(firebaseConfig);

/** @type {firebase.firestore.Firestore} */
const db = firebase.firestore();

// Enable multi-tab offline persistence
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
  if (err.code === 'failed-precondition') {
    console.warn('[firebase-config] Persistence skipped: multiple tabs open');
  } else if (err.code === 'unimplemented') {
    console.warn('[firebase-config] Persistence not supported in this browser');
  }
});
