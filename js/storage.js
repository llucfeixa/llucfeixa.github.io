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

firebase.auth().onAuthStateChanged(async user => {
  const loading = document.getElementById('loadingOverlay');
  const loginOverlay = document.getElementById('loginOverlay');
  const openLoginBtn = document.getElementById('openLoginBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  if (user) {
    currentUser = user;
    if (openLoginBtn) openLoginBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'block';
    if (loginOverlay) loginOverlay.classList.remove('open');
    
    // Migration logic
    const localData = localStorage.getItem(SK);
    const fireData = await fetchFromFirestore(user.uid);
    
    if (!fireData && localData) {
      console.log("Migrating local data to new account...");
      DB = JSON.parse(localData);
      await saveDB(); // Save to Firestore
    } else {
      DB = fireData || { active: [], waiting: [], pending: [], done: [] };
    }
    
    await init();
  } else {
    currentUser = null;
    if (openLoginBtn) openLoginBtn.style.display = 'block';
    if (logoutBtn) logoutBtn.style.display = 'none';
    
    const localData = localStorage.getItem(SK);
    DB = localData ? JSON.parse(localData) : { active: [], waiting: [], pending: [], done: [] };
    
    await init();
  }
  
  if (loading) {
    loading.classList.remove('open');
    setTimeout(() => { loading.style.display = 'none'; }, 300);
  }
});

async function fetchFromFirestore(uid) {
  try {
    const docRef = dbFirestore.collection("users").doc(uid);
    const docSnap = await docRef.get();
    if (docSnap.exists) return docSnap.data().DB;
  } catch (e) {
    console.error("Firestore fetch error:", e);
  }
  return null;
}

async function loadDB() {
  // DB is already loaded in onAuthStateChanged and assigned to the global DB variable
  return DB;
}

async function saveDB() {
  const dbStr = JSON.stringify(DB);
  if (currentUser) {
    try {
      await dbFirestore.collection("users").doc(currentUser.uid).set({ DB: DB });
    } catch (e) {
      console.error("Firebase save error:", e);
    }
  }
  // Always save locally as well for guest mode or offline backup
  localStorage.setItem(SK, dbStr);
}

function openLogin() {
  const overlay = document.getElementById('loginOverlay');
  if (overlay) {
    overlay.style.display = 'flex';
    setTimeout(() => overlay.classList.add('open'), 10);
  }
}

function closeLogin() {
  const overlay = document.getElementById('loginOverlay');
  if (overlay) {
    overlay.classList.remove('open');
    setTimeout(() => overlay.style.display = 'none', 300);
  }
}


