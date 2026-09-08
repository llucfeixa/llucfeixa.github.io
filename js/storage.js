// ── AUTH & STORAGE ───────────────────────────────
const SK = 'cineteca_v6';
let currentUser = null;
let isPublicView = false;
let publicUserName = "";
let userFollowing = [];
const provider = new firebase.auth.GoogleAuthProvider();

function loginWithGoogle() {
  firebase.auth().signInWithPopup(provider).catch(e => console.error(e));
}

function logout() {
  firebase.auth().signOut();
  localStorage.removeItem(SK); 
  DB = { active: [], waiting: [], pending: [], done: [] };
  userFollowing = [];
  isPublicView = false;

  // Clear stats UI
  const statsView = document.getElementById('statsView');
  if (statsView) {
    statsView.querySelectorAll('.stats-card-val').forEach(v => v.textContent = '0');
    const dist = document.getElementById('statsStatusDist');
    if (dist) dist.innerHTML = '';
  }

  if (typeof renderSections === 'function') renderSections();
  if (typeof updateStats === 'function') updateStats();
  if (typeof switchView === 'function') switchView('my-series');
  showToast("Sesión cerrada");
}

firebase.auth().onAuthStateChanged(async user => {
  const loading = document.getElementById('loadingOverlay');
  const loginOverlay = document.getElementById('loginOverlay');
  const openLoginBtn = document.getElementById('openLoginBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  // 1. Handle Authentication State (ALWAYS)
  if (user) {
    currentUser = user;
    if (openLoginBtn) openLoginBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'block';
    if (loginOverlay) loginOverlay.classList.remove('open');
    if (document.getElementById('friendsTab')) document.getElementById('friendsTab').style.display = 'block';

    // Load following list and custom name
    try {
      const userSnap = await dbFirestore.collection("users").doc(user.uid).get();
      if (userSnap.exists) {
        const data = userSnap.data();
        userFollowing = data.following || [];
        if (data.displayName) currentUser.customDisplayName = data.displayName;
        
        // AUTO-INDEX: If old user doesn't have searchable name, or name changed, update it
        if (!data.displayNameLower || data.displayName !== (currentUser.customDisplayName || currentUser.displayName)) {
          await saveDB();
        }
      } else {
        // New user: Save initial profile to make it searchable immediately
        await saveDB();
      }
    } catch (e) { console.error("Error loading user metadata:", e); }
    
    // Auto-remove self from following if present
    if (userFollowing.includes(user.uid)) {
      userFollowing = userFollowing.filter(id => id !== user.uid);
      await saveDB();
    }
  } else {
    currentUser = null;
    userFollowing = [];
    if (openLoginBtn) openLoginBtn.style.display = 'block';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (document.getElementById('friendsTab')) document.getElementById('friendsTab').style.display = 'none';
  }

  // 2. Handle Data Loading (Public vs Private)
  const urlParams = new URLSearchParams(window.location.search);
  const publicUid = urlParams.get('u');

  if (publicUid) {
    isPublicView = true;
    const { data: fireData, error: fetchError } = await fetchFromFirestore(publicUid);
    if (fetchError) {
      showToast("Error de conexión al cargar perfil", "var(--red)");
      return;
    }
    if (fireData) {
      DB = fireData;
      publicUserName = "Usuario";
      try {
        const userSnap = await dbFirestore.collection("users").doc(publicUid).get();
        if (userSnap.exists && userSnap.data().displayName) {
          publicUserName = userSnap.data().displayName;
        }
      } catch (e) { }
    } else {
      DB = { active: [], waiting: [], pending: [], done: [] };
      showToast("No se pudo encontrar el perfil público", "var(--red)");
    }
  } else if (user) {
    isPublicView = false;
    const localData = localStorage.getItem(SK);
    const { data: fireData, error: fetchError } = await fetchFromFirestore(user.uid);

    if (fetchError) {
       // If there is an error, we do NOT load from local storage to avoid accidental overwrites later
       // and we do NOT reset the DB. We just stop.
       showToast("Error al sincronizar con la nube", "var(--red)");
       DB = safeParseJSON(localData, { active: [], waiting: [], pending: [], done: [] });
    } else if (!fireData && localData) {
      console.log("Migrating local data to new account...");
      DB = safeParseJSON(localData, { active: [], waiting: [], pending: [], done: [] });
      await saveDB();
    } else {
      DB = fireData || { active: [], waiting: [], pending: [], done: [] };
    }
  } else {
    isPublicView = false;
    const localData = localStorage.getItem(SK);
    DB = safeParseJSON(localData, { active: [], waiting: [], pending: [], done: [] });
  }

  if (typeof init === 'function') await init();

  if (loading) {
    loading.classList.remove('open');
    setTimeout(() => { loading.style.display = 'none'; }, 300);
  }
});

async function fetchFromFirestore(uid) {
  try {
    const docRef = dbFirestore.collection("users").doc(uid);
    const docSnap = await docRef.get();
    if (docSnap.exists) return { data: docSnap.data().DB, error: null };
    return { data: null, error: null };
  } catch (e) {
    console.error("Firestore fetch error:", e);
    return { data: null, error: e };
  }
}

async function loadDB() {
  return DB;
}

async function saveDB() {
  if (isPublicView) return; // CRITICAL: Never save while viewing a public profile
  
  const dbStr = JSON.stringify(DB);
  if (currentUser) {
    const dName = currentUser.customDisplayName || currentUser.displayName;
    try {
      await dbFirestore.collection("users").doc(currentUser.uid).set({
        DB: DB,
        displayName: dName,
        displayNameLower: dName ? dName.toLowerCase() : "",
        following: userFollowing,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.error("Firebase save error:", e);
    }
  }
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

async function updateProfile(newName) {
  if (!currentUser) return;
  currentUser.customDisplayName = newName;
  await saveDB();
}

async function followUser(uid) {
  if (!currentUser || !uid || uid === currentUser.uid) return;
  if (!userFollowing.includes(uid)) {
    userFollowing.push(uid);
    await saveDB();
  }
}

async function unfollowUser(uid) {
  if (!currentUser || !uid) return;
  userFollowing = userFollowing.filter(id => id !== uid);
  await saveDB();
}

async function getFriendProfile(uid) {
  try {
    const snap = await dbFirestore.collection("users").doc(uid).get();
    if (snap.exists) return snap.data();
  } catch (e) { }
  return null;
}

// ── SOCIAL SEARCH ─────────────────────────────────
async function isNameAvailable(newName) {
  try {
    const q = await dbFirestore.collection("users")
      .where("displayNameLower", "==", newName.toLowerCase())
      .limit(1)
      .get();
    
    if (q.empty) return true;
    // If it's the current user, it's available for them
    return q.docs[0].id === currentUser.uid;
  } catch (e) { return true; }
}

async function searchUsers(query) {
  if (!query || query.length < 2) return [];
  try {
    const q = query.toLowerCase();
    const snap = await dbFirestore.collection("users")
      .where("displayNameLower", ">=", q)
      .where("displayNameLower", "<=", q + "\uf8ff")
      .limit(10)
      .get();
    
    return snap.docs
      .map(doc => ({ uid: doc.id, ...doc.data() }))
      .filter(u => !currentUser || u.uid !== currentUser.uid); // Don't show self in search
  } catch (e) { 
    console.error("Search error:", e);
    return []; 
  }
}
function safeParseJSON(str, fallback) {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch (e) {
    console.error("JSON Parse Error:", e);
    return fallback;
  }
}
