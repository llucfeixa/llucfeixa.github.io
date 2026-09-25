// ── SOCIAL: FRIENDS, SETTINGS & SHARING ──────────
// Following/followers, user search, profile settings, and the "share my
// library" link modal.

function openShareModal() {
  if (!currentUser) return;
  const url = `${window.location.origin}${window.location.pathname}?u=${currentUser.uid}`;
  document.getElementById('shareUrl').value = url;
  const overlay = document.getElementById('shareOverlay');
  overlay.style.display = 'flex';
  setTimeout(() => overlay.classList.add('open'), 10);
}

function closeShareModal() {
  const overlay = document.getElementById('shareOverlay');
  overlay.classList.remove('open');
  setTimeout(() => overlay.style.display = 'none', 300);
}

function copyShareLink() {
  const input = document.getElementById('shareUrl');
  input.select();
  document.execCommand('copy');
  showToast('📋 ¡Enlace copiado al portapapeles!');
}

// ── FRIENDS & SETTINGS ────────────────────────────
async function toggleFollow(uid) {
  if (!currentUser) { openLogin(); return; }
  if (userFollowing.includes(uid)) {
    await unfollowUser(uid);
    showToast("Dejaste de seguir a este usuario");
  } else {
    await followUser(uid);
    showToast("¡Ahora sigues a este usuario!");
  }
  updateStats();
}

async function renderFriendsList() {
  const grid = document.getElementById('friendsGrid');
  if (!grid) return;

  // Update counter/header
  const searchBox = document.querySelector('.user-search-box');
  if (isPublicView) {
    if (searchBox) searchBox.style.display = 'none';
  } else {
    if (searchBox) searchBox.style.display = 'block';
  }

  if (!userFollowing.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:5rem 2rem;">
        <div style="font-size:3rem;margin-bottom:1.5rem;opacity:0.5">👥</div>
        <h3 style="color:var(--text);margin-bottom:0.5rem">Tu red está vacía</h3>
        <p style="color:var(--muted);max-width:300px;margin:0 auto 2rem;font-size:0.9rem">
          ¡Usa el buscador de arriba para encontrar a tus amigos y ver qué están viendo!
        </p>
      </div>`;
    return;
  }

  let headerHtml = `<div style="grid-column:1/-1;margin-bottom:1rem;font-size:0.85rem;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:0.05em">
    Sigues a ${userFollowing.length} persona${userFollowing.length > 1 ? 's' : ''}
  </div>`;

  const friendsData = [];
  for (const uid of userFollowing) {
    const data = await getFriendProfile(uid);
    if (data) friendsData.push({ uid, ...data });
  }

  if (!friendsData.length) {
    grid.innerHTML = headerHtml + '<div style="grid-column:1/-1;text-align:center;padding:4rem 2rem;color:var(--muted)">No se pudo cargar la información de los usuarios que sigues.</div>';
    return;
  }

  const cardsHtml = friendsData.map(f => {
    const stats = f.DB ? `${f.DB.active.length} viendo · ${f.DB.done.length} terminadas` : 'Biblioteca privada';
    const initial = (f.displayName || 'U').charAt(0).toUpperCase();
    const avatarColor = getAvatarColor(f.uid);
    return `
      <div class="friend-card" onclick="window.location.href='?u=${f.uid}'">
        <div class="friend-avatar" style="background:${avatarColor};border-color:transparent;color:white">${initial}</div>
        <div class="friend-info">
          <div class="friend-name">${f.displayName || 'Usuario'}</div>
          <div class="friend-status">${stats}</div>
        </div>
        <div class="friend-unfollow" onclick="event.stopPropagation(); removeFriend('${f.uid}')" title="Dejar de seguir">✕</div>
      </div>`;
  }).join('');

  grid.innerHTML = headerHtml + cardsHtml;
}

function getAvatarColor(uid) {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = uid.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 45%, 55%)`;
}

function removeFriend(uid) {
  openConfirm(
    "¿Dejar de seguir?",
    "¿Estás seguro de que quieres dejar de seguir a este usuario?",
    async () => {
      await unfollowUser(uid);
      renderFriendsList();
      showToast("Has dejado de seguir a este usuario");
    },
    "Dejar de seguir"
  );
}

function openSettings() {
  if (!currentUser) return;
  document.getElementById('settingsUserName').value = currentUser.customDisplayName || currentUser.displayName || "";
  const overlay = document.getElementById('settingsOverlay');
  overlay.style.display = 'flex';
  setTimeout(() => overlay.classList.add('open'), 10);
}

function closeSettings() {
  const overlay = document.getElementById('settingsOverlay');
  overlay.classList.remove('open');
  setTimeout(() => overlay.style.display = 'none', 300);
}

async function saveSettings() {
  const newName = document.getElementById('settingsUserName').value.trim();
  if (!newName) { showToast("El nombre no puede estar vacío", "var(--red)"); return; }

  if (newName !== (currentUser.customDisplayName || currentUser.displayName)) {
    const available = await isNameAvailable(newName);
    if (!available) {
      showToast("Ese nombre ya está en uso por otro usuario", "var(--red)");
      return;
    }
  }

  await updateProfile(newName);
  closeSettings();
  showToast("✅ Perfil actualizado");
}


// ── USER SEARCH ───────────────────────────────────
let userSearchTimer = null;
async function handleUserSearch() {
  const input = document.getElementById('userSearchInput');
  const resultsBox = document.getElementById('userSearchResults');
  const query = input.value.trim();

  clearTimeout(userSearchTimer);
  if (query.length < 2) {
    resultsBox.style.display = 'none';
    return;
  }

  userSearchTimer = setTimeout(async () => {
    resultsBox.innerHTML = '<div style="padding:1rem;text-align:center"><div class="spinner" style="margin:0 auto"></div></div>';
    resultsBox.style.display = 'block';

    const users = await searchUsers(query);
    if (!users.length) {
      resultsBox.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--muted)">No se encontraron usuarios</div>';
      return;
    }

    resultsBox.innerHTML = users.map(u => {
      const isFollowing = userFollowing.includes(u.uid);
      const initial = (u.displayName || 'U').charAt(0).toUpperCase();
      const avatarColor = getAvatarColor(u.uid);
      const sub = u.DB ? `${u.DB.active.length + u.DB.done.length} series` : 'Ver perfil';
      return `
        <div class="search-result-item" onclick="window.location.href='?u=${u.uid}'">
          <div class="friend-avatar" style="width:32px;height:32px;font-size:0.8rem;background:${avatarColor};border-color:transparent;color:white">${initial}</div>
          <div style="flex:1">
            <div style="font-weight:600;font-size:0.9rem">${u.displayName}</div>
            <div style="font-size:0.75rem;color:var(--muted)">${sub}</div>
          </div>
          <button class="btn ${isFollowing ? 'btn-ghost' : 'btn-primary'}" 
                  style="font-size:0.7rem;padding:0.3rem 0.6rem" 
                  onclick="event.stopPropagation(); toggleFollowFromSearch('${u.uid}')">
            ${isFollowing ? 'Siguiendo' : '+ Seguir'}
          </button>
        </div>
      `;
    }).join('');
  }, 400);
}

async function toggleFollowFromSearch(uid) {
  const isFollowing = userFollowing.includes(uid);
  if (isFollowing) await unfollowUser(uid);
  else await followUser(uid);

  handleUserSearch(); // Refresh results
  renderFriendsList(); // Refresh main list
  showToast(isFollowing ? "Dejado de seguir" : "Siguiendo a usuario");
}

// Close search results when clicking outside
document.addEventListener('click', (e) => {
  const box = document.getElementById('userSearchResults');
  const input = document.getElementById('userSearchInput');
  if (box && !box.contains(e.target) && e.target !== input) {
    box.style.display = 'none';
  }
});

