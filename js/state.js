// ── STATE & DATA HELPERS ─────────────────────────
// Global app state and pure DB lookup/mutation helpers (no DOM access).

// ── STATE ─────────────────────────────────────────
let DB = { active: [], waiting: [], pending: [], done: [] };
let tmdbCache = {}, tmdbDetailCache = {};
let currentFilter = 'all', isGridView = true, currentView = 'my-series';
let editingId = null, editSeasons = [], editTmdbDetail = null, trendingCache = [], topRatedCache = [], genreCache = null;
let tmdbTimer = null, discoverTimer = null, openModalId = null, currentGenreId = null;
let trendingPage = 1, topRatedPage = 1, searchPage = 1;
let trendingHasMore = true, topRatedHasMore = true, searchHasMore = true;
let isTrendingLoading = false, isTopRatedLoading = false, isSearchLoading = false;
let genreStates = {};
let rowObserver = null;
let hideInListState = localStorage.getItem('hideInList') === 'true';

function getAllShows() { return [...DB.active, ...DB.waiting, ...DB.pending, ...DB.done] }
function findShow(id) { return getAllShows().find(s => String(s.id) === String(id)) }
function findCat(id) { for (const c of ['active', 'waiting', 'pending', 'done']) if (DB[c].find(s => String(s.id) === String(id))) return c; return null }
function removeFromDB(id) { for (const c of ['active', 'waiting', 'pending', 'done']) DB[c] = DB[c].filter(s => String(s.id) !== String(id)) }
function isDuplicate(title, excludeId = null, tmdbId = null) {
  const n = t => t.toLowerCase().trim();
  return getAllShows().some(s => {
    if (s.id === excludeId) return false;
    // Si tenemos IDs de TMDB, comparamos por ID (más preciso para remakes/versiones)
    if (tmdbId && s.tmdb && s.tmdb.id) {
      if (s.tmdb.id === tmdbId) return true;
      // Si los IDs son diferentes, NO es un duplicado aunque el título coincida
      if (n(s.title) === n(title)) return false;
    }
    // Si no hay IDs o uno no tiene ID, volvemos a comparar por título
    return n(s.title) === n(title);
  });
}

function moveTo(show, newStatus, newNextEp) {
  const old = findCat(show.id);
  if (old && DB[old]) {
    DB[old] = DB[old].filter(s => String(s.id) !== String(show.id));
  }
  show.status = newStatus;
  if (newNextEp !== undefined) show.nextEp = newNextEp;
  if (DB[newStatus]) DB[newStatus].push(show);
}

