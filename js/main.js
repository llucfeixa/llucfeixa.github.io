// ── APP BOOTSTRAP & GLOBAL EVENTS ─────────────────
// init() and syncTMDBData() run once on load (called from storage.js after
// auth resolves). Everything else here wires up top-level DOM listeners,
// so this file must load AFTER every other feature file below.

// ── EVENTS ────────────────────────────────────────
const searchInp = document.getElementById('searchInput');
if (searchInp) searchInp.addEventListener('input', () => renderSections());

document.querySelectorAll('.filter-btn').forEach(b => b.addEventListener('click', () => {
  const cat = b.dataset.filter === 'all' ? null : b.dataset.filter;
  openCategoryView(cat);
}));

const addBtn = document.getElementById('addBtn');
if (addBtn) addBtn.addEventListener('click', openAdd);
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', e => { if (e.target === document.getElementById('modalOverlay')) closeModal(); });
document.getElementById('editClose').addEventListener('click', closeEdit);
document.getElementById('editCancelBtn').addEventListener('click', closeEdit);
document.getElementById('editOverlay').addEventListener('click', e => { if (e.target === document.getElementById('editOverlay')) closeEdit(); });
document.getElementById('editTitle').addEventListener('input', () => { document.getElementById('dupWarning').style.display = 'none'; });
document.getElementById('discoverSearchInput').addEventListener('input', handleDiscoverSearch);


// ── UTILS ──────────────────────────────────────────
let isInitializing = false;
async function init() {
  if (isInitializing) return;
  isInitializing = true;

  try {
    const saved = await loadDB();
    DB = saved || { active: [], waiting: [], pending: [], done: [] };
    const moved = (!isPublicView) ? checkAutoMove() : { count: 0, shows: [] };
    if (moved.count) {
      await saveDB();
      showToast(`📺 ${moved.count} serie${moved.count > 1 ? 's' : ''} pasada${moved.count > 1 ? 's' : ''} a "En curso"`);
      notifyEpisodesAvailable(moved.shows);
    }
    updateStats(); renderSections();

    // Sync TMDB data in background (only for own library)
    if (!isPublicView) syncTMDBData();
  } finally {
    isInitializing = false;
  }
}


async function syncTMDBData() {
  let changesMade = false;
  const all = getAllShows();
  
  for (const show of all) {
    let localChange = false;
    if (!show.tmdb) {
      const t = await tmdbSearch(show.title);
      if (t) { show.tmdb = t; localChange = true; }
    }
    if (show.tmdb) {
      try {
        const d = await tmdbDetail(show.tmdb.id);
        if (d) {
          // 1. Update main rating
          const r = tmdbRating(d);
          if (show.rating !== r) { show.rating = r; localChange = true; }

          // 2. Update TMDB metadata fields
          const fields = ['poster_path', 'backdrop_path', 'overview', 'first_air_date', 'number_of_seasons', 'number_of_episodes'];
          fields.forEach(f => {
            if (show.tmdb[f] !== d[f]) {
              show.tmdb[f] = d[f];
              localChange = true;
            }
          });

          // 3. Auto-correct status/progression (now including pending for nextEp dates)
          const c = await autoCorrectStatus(show, d);
          if (c) localChange = true;
        }
      } catch (e) { console.error("Sync error for", show.title, e); }
      
      if (localChange) {
        changesMade = true;
      }
      await new Promise(res => setTimeout(res, 180));
    }
  }

  if (changesMade) {
    await saveDB(); 
    updateStats(); 
    renderSections(); 
  }
}


setInterval(async () => {
  const moved = checkAutoMove();
  if (moved.count) {
    await saveDB(); updateStats(); renderSections();
    showToast(`📺 ${moved.count} serie${moved.count > 1 ? 's' : ''} movida${moved.count > 1 ? 's' : ''} a "En curso"`);
    notifyEpisodesAvailable(moved.shows);
  }
}, 3600000);


// ── NOTIFICATIONS ─────────────────────────────────
// Opt-in browser notifications for when a "waiting" show gets new episodes.
// Preference is stored locally (independent of account) and only ever
// acted on if the user has both enabled it here AND granted OS permission.
const NOTIF_PREF_KEY = 'cineteca_notif_enabled';

function notificationsEnabled() {
  return localStorage.getItem(NOTIF_PREF_KEY) === 'true'
    && typeof Notification !== 'undefined'
    && Notification.permission === 'granted';
}

async function toggleNotifications(checked) {
  if (!checked) {
    localStorage.setItem(NOTIF_PREF_KEY, 'false');
    return;
  }
  if (typeof Notification === 'undefined') {
    showToast('Tu navegador no soporta notificaciones', 'var(--red)');
    document.getElementById('settingsNotifToggle').checked = false;
    return;
  }
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (perm === 'granted') {
    localStorage.setItem(NOTIF_PREF_KEY, 'true');
    showToast('🔔 Notificaciones activadas');
  } else {
    localStorage.setItem(NOTIF_PREF_KEY, 'false');
    document.getElementById('settingsNotifToggle').checked = false;
    showToast('No se han concedido permisos de notificación', 'var(--red)');
  }
}

async function notifyEpisodesAvailable(shows) {
  if (!shows || !shows.length || !notificationsEnabled()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const body = shows.length === 1
      ? `${shows[0].title} ya tiene ${shows[0].nextEp || 'nuevo contenido'} disponible.`
      : shows.map(s => s.title).join(', ');
    await reg.showNotification(shows.length === 1 ? '📺 Nuevo episodio disponible' : '📺 Nuevos episodios disponibles', {
      body,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: 'cineteca-new-episode'
    });
  } catch (e) { console.error('Notification error:', e); }
}


window.addEventListener('resize', () => {
  document.querySelectorAll('.rec-container .netflix-scroll').forEach(updateNetflixArrows);
});

window.addEventListener('scroll', () => {
  // Back to top button
  const topBtn = document.getElementById('backToTopBtn');
  if (topBtn) {
    if (window.scrollY > 500) topBtn.classList.add('visible');
    else topBtn.classList.remove('visible');
  }

  // Infinite Vertical Search Scroll
  if (currentView === 'discover' && searchHasMore && !isSearchLoading) {
    const q = document.getElementById('discoverSearchInput')?.value.trim();
    if (q) {
      if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 1000) {
        loadMoreSearch();
      }
    }
  }
});
