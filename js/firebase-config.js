// ── FIREBASE INIT ────────────────────────────────
const firebaseConfig = (window.LOCAL_CONFIG && window.LOCAL_CONFIG.FIREBASE) ? window.LOCAL_CONFIG.FIREBASE : {
  apiKey: "__FIREBASE_API_KEY__",
  authDomain: "__FIREBASE_AUTH_DOMAIN__",
  projectId: "__FIREBASE_PROJECT_ID__",
  storageBucket: "__FIREBASE_STORAGE_BUCKET__",
  messagingSenderId: "__FIREBASE_MESSAGING_SENDER_ID__",
  appId: "__FIREBASE_APP_ID__",
  measurementId: "__FIREBASE_MEASUREMENT_ID__"
};
firebase.initializeApp(firebaseConfig);
const dbFirestore = firebase.firestore();
