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

// Promise that resolves when Firebase is initialized.
// Polls for the CDN-loaded `firebase` global instead of gambling on a fixed
// delay: on a slow connection the SDK scripts can take longer than any fixed
// timeout to load, which previously left window.db/window.auth stuck null
// with no retry until the page was manually reloaded.
window.firebaseInitPromise = new Promise((resolve) => {
  const MAX_WAIT_MS = 15000;
  const POLL_INTERVAL_MS = 50;
  const startedAt = Date.now();

  function waitForSdk() {
    if (typeof firebase !== 'undefined') {
      init();
      return;
    }
    if (Date.now() - startedAt > MAX_WAIT_MS) {
      console.error('✗ Firebase SDK did not load within', MAX_WAIT_MS, 'ms (check network/CDN access).');
      resolve(); // resolve anyway so callers don't hang forever
      return;
    }
    setTimeout(waitForSdk, POLL_INTERVAL_MS);
  }

  function init() {
    try {
      if (firebase.apps && firebase.apps.length === 0) {
        firebase.initializeApp(firebaseConfig);
        window.db = firebase.firestore();
        window.auth = firebase.auth();

        // Point at local emulators when served from the Firebase Hosting emulator,
        // UNLESS ?firebase=prod-readonly is explicitly passed in the URL.
        const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
        const params = new URLSearchParams(window.location.search);
        if (params.get('firebase') === 'prod-readonly') {
          sessionStorage.setItem('firebaseMode', 'prod-readonly');
        } else if (params.get('firebase') === 'emulator') {
          sessionStorage.removeItem('firebaseMode');
        }
        // Persisted via sessionStorage so the mode survives page navigation
        // (e.g. login.js redirecting to admin/dashboard.html without the query string).
        const wantsProdReadOnly = sessionStorage.getItem('firebaseMode') === 'prod-readonly';

        if (isLocal && !wantsProdReadOnly) {
          window.db.useEmulator('localhost', 8081);
          window.auth.useEmulator('http://localhost:9099');
          console.log('Connected to Firebase EMULATORS (Firestore :8081, Auth :9099)');
        } else if (isLocal && wantsProdReadOnly) {
          // Hard-block all write operations client-side so this really is read-only,
          // even though we're pointed at the real production database.
          const blockWrite = (label) => () => {
            const msg = `Blocked: "${label}" is disabled in prod-readonly mode.`;
            console.error(msg);
            return Promise.reject(new Error(msg));
          };
          const origCollection = window.db.collection.bind(window.db);
          window.db.collection = function (...args) {
            const ref = origCollection(...args);
            ref.add = blockWrite('collection.add');
            const origDoc = ref.doc.bind(ref);
            ref.doc = function (...docArgs) {
              const docRef = origDoc(...docArgs);
              docRef.set = blockWrite('doc.set');
              docRef.update = blockWrite('doc.update');
              docRef.delete = blockWrite('doc.delete');
              return docRef;
            };
            return ref;
          };
          window.db.batch = blockWrite('batch');

          // Block account creation outright...
          window.auth.createUserWithEmailAndPassword = blockWrite('auth.createUserWithEmailAndPassword');

          // ...and patch whatever user object signInWithEmailAndPassword resolves with,
          // so admin login still works but the logged-in user can't self-mutate/delete.
          const origSignIn = window.auth.signInWithEmailAndPassword.bind(window.auth);
          window.auth.signInWithEmailAndPassword = function (...signInArgs) {
            return origSignIn(...signInArgs).then((cred) => {
              if (cred && cred.user) {
                cred.user.updatePassword = blockWrite('user.updatePassword');
                cred.user.delete = blockWrite('user.delete');
              }
              return cred;
            });
          };

          console.warn('Connected to PRODUCTION Firebase in READ-ONLY mode (all writes blocked client-side).');
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
  }

  waitForSdk();
});
