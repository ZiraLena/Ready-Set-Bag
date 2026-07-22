/* ============================================================================
   FIREBASE CONFIGURATION
   ============================================================================ */

// Initialize Firebase with your project credentials
// Get these values from your Firebase Console: Project Settings
const firebaseConfig = {
  apiKey: "AIzaSyASEaRXWLXJN32x0COm7RJ-FmUD64FahG0",
  authDomain: "readysetbag-da917.firebaseapp.com",
  projectId: "readysetbag-da917",
  storageBucket: "readysetbag-da917.firebasestorage.app",
  messagingSenderId: "975675266823",
  appId: "1:975675266823:web:e5a334026936e687ac57a2",
  measurementId: "G-4XVBLM5C0E"
};

// Initialize Firebase
window.db = null;
window.auth = null;
window.firebaseReady = false;

// Promise that resolves when Firebase is initialized
window.firebaseInitPromise = new Promise((resolve) => {
  // Wait a moment to ensure all Firebase scripts are loaded
  setTimeout(() => {
    try {
      if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length === 0) {
        firebase.initializeApp(firebaseConfig);
        window.db = firebase.firestore();
        window.auth = firebase.auth();

        // Point at local emulators when served from the Firebase Hosting emulator
        const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
        if (isLocal) {
          window.db.useEmulator('localhost', 8081);
          window.auth.useEmulator('http://localhost:9099');
          console.log('Connected to Firebase emulators (Firestore :8080, Auth :9099)');
        }

        // Try to enable IndexedDB persistence so clients reuse cached data
        try {
          firebase.firestore().enablePersistence().catch(function(err) {
            if (err && err.code === 'failed-precondition') {
              console.warn('Persistence failed: multiple tabs open.');
            } else if (err && err.code === 'unimplemented') {
              console.warn('Persistence is not available in this browser.');
            }
          });
        } catch (e) {
          console.warn('enablePersistence() error', e);
        }
        window.firebaseReady = true;

        resolve();
      } else if (firebase.apps && firebase.apps.length > 0) {
        window.db = firebase.firestore();
        window.auth = firebase.auth();
        window.firebaseReady = true;

        resolve();
      }
    } catch (error) {
      console.error('✗ Firebase initialization error:', error);
      resolve(); // Still resolve to avoid blocking
    }
  }, 500);
});
