const firebaseConfig = {
  apiKey: "AIzaSyAciGWtEvo8pd_Y-GNfUq9cea0j67rSHbQ",
  authDomain: "football7-a553e.firebaseapp.com",
  projectId: "football7-a553e",
  storageBucket: "football7-a553e.firebasestorage.app",
  messagingSenderId: "135775800951",
  appId: "1:135775800951:web:da31dad2557e2b86894072"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Enable offline persistence
db.enablePersistence({ synchronizeTabs: true }).catch(err => {
  if (err.code === 'failed-precondition') console.warn('Persistence failed: multiple tabs open');
  else if (err.code === 'unimplemented') console.warn('Persistence not available in this browser');
});
