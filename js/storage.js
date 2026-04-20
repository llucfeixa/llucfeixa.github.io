// ── AUTH & STORAGE ───────────────────────────────
const SK = 'cineteca_v6';
let currentUser = null;
const provider = new firebase.auth.GoogleAuthProvider();

function loginWithGoogle() {
  firebase.auth().signInWithPopup(provider).catch(e => console.error(e));
}

function logout() {
  firebase.auth().signOut();
  DB = { active: [], waiting: [], pending: [], done: [] };
  renderSections();
}

firebase.auth().onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    const overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.style.display = 'none';
    init();
  } else {
    currentUser = null;
    const overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.style.display = 'flex';
  }
});

async function loadDB() {
  if (!currentUser) return null;
  try {
    const docRef = dbFirestore.collection("users").doc(currentUser.uid);
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      return docSnap.data().DB;
    }
  } catch (e) {
    console.error("Firebase load error:", e);
  }
  return null;
}

async function saveDB() {
  if (!currentUser) return;
  try {
    await dbFirestore.collection("users").doc(currentUser.uid).set({ DB: DB });
    const dbStr = JSON.stringify(DB);
    if (window.storage && window.storage.set) {
      await window.storage.set(SK, dbStr);
    } else {
      localStorage.setItem(SK, dbStr);
    }
  } catch (e) {
    console.error("Firebase save error:", e);
  }
}
