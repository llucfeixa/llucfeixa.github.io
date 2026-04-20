const TMDB_KEY = '__TMDB_KEY__';
const IMG = 'https://image.tmdb.org/t/p/w342';
const BG = 'https://image.tmdb.org/t/p/w780';
const LOGO_BASE = 'https://image.tmdb.org/t/p/w45';
const SK = 'cineteca_v6';

// ── helpers ──────────────────────────────────────
function genId() { return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) }
function showToast(m, color) { const t = document.getElementById('toast'); t.textContent = m; t.style.borderLeftColor = color || 'var(--gold)'; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2800) }
function parseDate(str) {
  if (!str) return null;
  const m = str.match(/\((\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\)/);
  if (!m) return null;
  const day = parseInt(m[1]), mon = parseInt(m[2]) - 1;
  const yr = m[3] ? parseInt(m[3].length === 2 ? '20' + m[3] : m[3]) : (new Date()).getFullYear();
  return new Date(yr, mon, day);
}
function fmtDate(str) {
  // Convert YYYY-MM-DD to DD/MM/YYYY
  if (!str || str.length < 10) return null;
  const [y, mo, d] = str.split('-'); return `${d}/${mo}/${y}`;
}
function parseEp(str) {
  if (!str) return null;
  const m = str.match(/T(\d+)(?:E(\d+))?/i);
  return m ? { s: parseInt(m[1]), e: m[2] ? parseInt(m[2]) : null } : null;
}
function tmdbDatePast(dateStr) {
  // Is a TMDB date string (YYYY-MM-DD) in the past/today?
  if (!dateStr) return false;
  const d = new Date(dateStr + 'T12:00:00');
  return d <= new Date();
}

// ── SORT ─────────────────────────────────────────
function sortedShows(cat, shows) {
  if (cat === 'waiting') {
    return [...shows].sort((a, b) => {
      const da = parseDate(a.nextEp), db = parseDate(b.nextEp);
      if (da && db) return da - db; if (da) return -1; if (db) return 1;
      return (b.rating || 0) - (a.rating || 0);
    });
  }
  return [...shows].sort((a, b) => (b.rating || 0) - (a.rating || 0));
}

// ── AUTH & STORAGE ───────────────────────────────
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
    document.getElementById('loginOverlay').style.display = 'none';
    init();
  } else {
    currentUser = null;
    document.getElementById('loginOverlay').style.display = 'flex';
  }
});

async function loadDB() {
  if (!currentUser) return null;
  try {
    // 1. Intentar cargar los datos específicos de este usuario
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

// ── STATE ─────────────────────────────────────────
let DB = { active: [], waiting: [], pending: [], done: [] };
let tmdbCache = {}, tmdbDetailCache = {};
let currentFilter = 'all', isGridView = true;
let editingId = null, editSeasons = [], editTmdbDetail = null;
let tmdbTimer = null, openModalId = null;

function getAllShows() { return [...DB.active, ...DB.waiting, ...DB.pending, ...DB.done] }
function findShow(id) { return getAllShows().find(s => s.id === id) }
function findCat(id) { for (const c of ['active', 'waiting', 'pending', 'done']) if (DB[c].find(s => s.id === id)) return c; return null }
function removeFromDB(id) { for (const c of ['active', 'waiting', 'pending', 'done']) DB[c] = DB[c].filter(s => s.id !== id) }
function isDuplicate(title, excludeId = null) { const n = t => t.toLowerCase().trim(); return getAllShows().some(s => n(s.title) === n(title) && s.id !== excludeId) }

function moveTo(show, newStatus, newNextEp) {
  const old = findCat(show.id);
  DB[old] = DB[old].filter(s => s.id !== show.id);
  show.status = newStatus;
  if (newNextEp !== undefined) show.nextEp = newNextEp;
  DB[newStatus].push(show);
}

function checkAutoMove() {
  const now = new Date(), ids = [];
  DB.waiting.forEach(s => { const d = parseDate(s.nextEp); if (d && d <= now) ids.push(s.id) });
  if (!ids.length) return 0;
  ids.forEach(id => { const s = DB.waiting.find(x => x.id === id); if (s) { s.status = 'active'; s._autoMoved = true; DB.waiting = DB.waiting.filter(x => x.id !== id); DB.active.push(s); } });
  return ids.length;
}

// ── TMDB ─────────────────────────────────────────
async function tmdbSearch(title) {
  if (tmdbCache[title] !== undefined) return tmdbCache[title];
  try {
    const r = await fetch(`https://api.themoviedb.org/3/search/tv?api_key=${TMDB_KEY}&query=${encodeURIComponent(title)}&language=es-ES`);
    const d = await r.json(); const res = (d.results && d.results[0]) || null;
    tmdbCache[title] = res; return res;
  } catch (e) { return null }
}
async function tmdbMulti(q) {
  try { const r = await fetch(`https://api.themoviedb.org/3/search/tv?api_key=${TMDB_KEY}&query=${encodeURIComponent(q)}&language=es-ES`); const d = await r.json(); return (d.results || []).slice(0, 6); } catch (e) { return [] }
}
async function tmdbDetail(id) {
  if (!id) return null;
  if (tmdbDetailCache[id]) return tmdbDetailCache[id];
  try {
    const r = await fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${TMDB_KEY}&language=es-ES&append_to_response=watch%2Fproviders`);
    const d = await r.json(); tmdbDetailCache[id] = d; return d;
  } catch (e) { return null }
}
async function getShowDetail(show) {
  const basic = show.tmdb || await tmdbSearch(show.title);
  if (!basic) return null; if (!show.tmdb) show.tmdb = basic;
  return await tmdbDetail(basic.id);
}
function tmdbRating(d) { if (!d) return null; const v = d.vote_average; if (!v || v === 0) return null; return parseFloat(v.toFixed(1)) }

// ── PLATFORM BADGE ────────────────────────────────
// Extracts provider from TMDB watch/providers (ES→US→GB fallback)
// Uses TMDB logo (always works, no CORS issues)
function buildPlatformBadge(detail) {
  if (!detail) return '';
  const wp = detail['watch/providers'];
  if (!wp || !wp.results) return '';
  const region = wp.results['ES'] || wp.results['US'] || wp.results['GB'] || null;
  if (!region) return '';

  const allProviders = [...(region.flatrate || []), ...(region.free || [])];
  if (!allProviders.length) return '';

  // Remove duplicates by provider_id
  const uniqueProviders = [];
  const seen = new Set();
  for (const p of allProviders) {
    if (!seen.has(p.provider_id) && p.logo_path) {
      seen.add(p.provider_id);
      uniqueProviders.push(p);
    }
  }

  if (!uniqueProviders.length) return '';

  const title = detail.name || '';

  // Allowed providers filter
  const allowedProviders = {
    'Netflix': `https://www.netflix.com/`,
    'Max': `https://www.max.com/`,
    'HBO Max': `https://play.hbomax.com/`,
    'Disney Plus': `https://www.disneyplus.com/es-es/`,
    'Disney+': `https://www.disneyplus.com/es-es/`,
    'Amazon Prime Video': `https://www.primevideo.com/`,
    'Movistar Plus+': `https://ver.movistarplus.es/`,
    'Movistar+': `https://ver.movistarplus.es/`
  };

  const filteredProviders = uniqueProviders.filter(p => allowedProviders.hasOwnProperty(p.provider_name));
  if (!filteredProviders.length) return '';

  const badges = filteredProviders.map(prov => {
    const logoUrl = `${LOGO_BASE}${prov.logo_path}`;
    const name = prov.provider_name;
    const url = allowedProviders[name];
    return `<a class="platform-badge" href="${url}" target="_blank" rel="noopener" title="Abrir ${name}">
<img src="${logoUrl}" alt="${name}">
<span>${name}</span>
</a>`;
  });

  return `<div style="display:flex;gap:0.6rem;flex-wrap:wrap;justify-content:center">${badges.join('')}</div>`;
}

// ── NEXT-EP INFO BLOCK ────────────────────────────
function buildTmdbNextEpBlock(detail, show) {
  if (!detail) return '';
  const ne = detail.next_episode_to_air, st = detail.status;
  if (show.status === 'active' && ne) {
    const d = fmtDate(ne.air_date);
    return `<div class="next-ep-tmdb">📡 Según TMDB: próximo <strong>T${ne.season_number}E${ne.episode_number}</strong>${d ? ` — <strong>${d}</strong>` : ''}${ne.name ? ` · "${ne.name}"` : ''}` + `</div>`;
  }
  if (show.status === 'waiting') {
    if (ne && ne.air_date) return `<div class="next-ep-tmdb">📅 T${ne.season_number} confirmada para <strong>${fmtDate(ne.air_date)}</strong></div>`;
    if (st === 'Ended' || st === 'Canceled') return `<div class="season-ended-info">🔚 TMDB indica que esta serie ha finalizado</div>`;
    return `<div class="season-ended-info">⏳ Sin fecha anunciada · Estado TMDB: <strong>${st || 'Desconocido'}</strong></div>`;
  }
  if (show.status === 'done') return `<div class="season-ended-info">✅ Serie finalizada · ${detail.number_of_seasons || ''} temporadas · ${detail.number_of_episodes || ''} episodios</div>`;
  return '';
}

// ── CORE ADVANCE LOGIC ────────────────────────────
//
// Rules (applied IN ORDER):
//  A) No watch history → T1E1, stay active
//  B) Mid-season (curEp < totalEps) → increment ep, stay active
//  C) End of season (curEp >= totalEps OR T marked complete):
//     C1) Next season exists in TMDB AND its E1 has already aired → start T(n+1)E1, active
//     C2) Next season exists in TMDB AND E1 NOT yet aired → waiting with date
//     C3) No next season + TMDB=Ended/Canceled → done
//     C4) No next season + ongoing → waiting (with date from TMDB ne if available)
async function computeAdvance(show, detail) {
  const seasons = [...(show.seasons || [])];
  const last = seasons.length ? seasons[seasons.length - 1] : null;
  const parsed = last ? parseEp(last) : null;

  let newSeason = 1, newEp = 1;
  let baseSeasons = [];
  if (parsed) {
    if (parsed.e === null) {
      newSeason = parsed.s + 1;
      newEp = 1;
      baseSeasons = seasons;
    } else {
      newSeason = parsed.s;
      newEp = parsed.e + 1;
      baseSeasons = seasons.slice(0, -1);
    }
  }

  const tmdbSeasons = (detail && detail.seasons || []).filter(s => s.season_number > 0 && s.episode_count > 0);
  const curSeaTmdb = tmdbSeasons.find(s => s.season_number === newSeason);
  const totalEps = curSeaTmdb ? curSeaTmdb.episode_count : null;
  const ne = detail ? detail.next_episode_to_air : null;
  const tmdbSt = detail ? detail.status : null;

  let isSeasonFinished = (totalEps !== null && newEp > totalEps);
  if (ne && ne.season_number === newSeason && ne.episode_number > newEp) isSeasonFinished = false;

  if (!isSeasonFinished) {
    let newNextEp = `T${newSeason}E${newEp}`;
    if (ne && ne.season_number === newSeason && ne.episode_number === newEp && ne.air_date) {
      newNextEp += ` (${fmtDate(ne.air_date)})`;
    }
    return {
      newSeasons: [...baseSeasons, `T${newSeason}E${newEp}`],
      newNextEp,
      newStatus: 'active',
      toastMsg: `✅ Marcado: T${newSeason}E${newEp}`
    };
  } else {
    const newSeasons = [...baseSeasons, `T${newSeason}`];
    const nextSeaNum = newSeason + 1;
    const nextSeaTmdb = tmdbSeasons.find(s => s.season_number === nextSeaNum);

    if (nextSeaTmdb) {
      let ep1Aired = true;
      let ep1Date = null;
      if (ne && ne.season_number === nextSeaNum && ne.episode_number === 1) {
        ep1Aired = false;
        ep1Date = ne.air_date ? fmtDate(ne.air_date) : null;
      }
      if (!ep1Aired) {
        const newNextEp = ep1Date ? `T${nextSeaNum} (${ep1Date})` : `T${nextSeaNum}`;
        return { newSeasons, newNextEp, newStatus: 'waiting', toastMsg: `⏳ T${newSeason} completada → esperando T${nextSeaNum}` };
      } else {
        let newNextEp = `T${nextSeaNum}E1`;
        if (ne && ne.season_number === nextSeaNum && ne.episode_number === 1 && ne.air_date) {
          newNextEp += ` (${fmtDate(ne.air_date)})`;
        }
        return { newSeasons, newNextEp, newStatus: 'active', toastMsg: `✅ T${newSeason} completada → T${nextSeaNum} disponible` };
      }
    } else {
      if (tmdbSt === 'Ended' || tmdbSt === 'Canceled') {
        return { newSeasons, newNextEp: null, newStatus: 'done', toastMsg: `✅ Serie completada` };
      }
      let newNextEp = `T${nextSeaNum}`;
      if (ne && ne.air_date) newNextEp = `T${ne.season_number} (${fmtDate(ne.air_date)})`;
      return { newSeasons, newNextEp, newStatus: 'waiting', toastMsg: `⏳ T${newSeason} completada → esperando anuncios` };
    }
  }
}

// ── inferStatus: determines correct bucket when saving ──
// Only called when editTmdbDetail is available
function inferStatus(seaList, detail, manual) {
  if (!seaList.length) return manual;
  if (!detail) return manual;
  const last = seaList[seaList.length - 1];
  const parsed = parseEp(last);
  if (!parsed) return manual;
  const { s: curSeason, e: curEp } = parsed;
  const tmdbSeasons = (detail.seasons || []).filter(s => s.season_number > 0 && s.episode_count > 0);
  const curSeaTmdb = tmdbSeasons.find(s => s.season_number === curSeason);
  const totalEps = curSeaTmdb ? curSeaTmdb.episode_count : null;
  const ne = detail.next_episode_to_air;

  let atEnd = curEp === null;
  if (ne && ne.season_number === curSeason && ne.episode_number > (curEp || 0)) atEnd = false;

  if (!atEnd) return 'active'; // mid-season → watching
  // At season end
  const nextSeaNum = curSeason + 1;
  const nextSeaTmdb = tmdbSeasons.find(s => s.season_number === nextSeaNum);
  const tmdbSt = detail.status;
  if (nextSeaTmdb) {
    // Check ep1 aired
    if (ne && ne.season_number === nextSeaNum && ne.episode_number === 1) return 'waiting';
    // Some eps of next season aired but user hasn't started → waiting to watch
    return 'waiting';
  }
  if (tmdbSt === 'Ended' || tmdbSt === 'Canceled') return 'done';
  return 'waiting';
}

// ── autoCorrectStatus: background fix ────────────
async function autoCorrectStatus(show, detail) {
  if (!detail || show.status === 'pending') return false;
  const tmdbSt = detail.status; const ne = detail.next_episode_to_air;

  if (show.status === 'done') {
    if (tmdbSt !== 'Ended' && tmdbSt !== 'Canceled') {
      // Verify if there is a new season or episode announced
      const seasons = show.seasons || [];
      const last = seasons.length ? seasons[seasons.length - 1] : null;
      const parsed = last ? parseEp(last) : null;
      const curSeason = parsed ? parsed.s : 0;

      const tmdbSeasons = (detail.seasons || []).filter(s => s.season_number > 0 && s.episode_count > 0);
      if (tmdbSeasons.some(s => s.season_number > curSeason) || (ne && ne.season_number > curSeason)) {
        const nxt = ne && ne.air_date ? `T${ne.season_number} (${fmtDate(ne.air_date)})` : `T${curSeason + 1}`;
        moveTo(show, 'waiting', nxt); return true;
      }
    }
    return false;
  }

  if (show.status === 'waiting') {
    if (tmdbSt === 'Ended' || tmdbSt === 'Canceled') {
      moveTo(show, 'done', null); return true;
    }
    if (ne && ne.air_date) {
      const newNext = `T${ne.season_number} (${fmtDate(ne.air_date)})`;
      if (show.nextEp !== newNext) {
        show.nextEp = newNext;
        return true;
      }
    }
  }

  if (show.status === 'active') {
    const seasons = show.seasons || []; if (!seasons.length) return false;
    const last = seasons[seasons.length - 1]; const parsed = parseEp(last); if (!parsed) return false;
    const { s: curSeason, e: curEp } = parsed;
    const tmdbSeasons = (detail.seasons || []).filter(s => s.season_number > 0 && s.episode_count > 0);
    const curSeaTmdb = tmdbSeasons.find(s => s.season_number === curSeason);
    const totalEps = curSeaTmdb ? curSeaTmdb.episode_count : null;
    let atEnd = curEp === null;
    if (ne && ne.season_number === curSeason && ne.episode_number > (curEp || 0)) atEnd = false;

    if (atEnd) {
      const nextSeaTmdb = tmdbSeasons.find(s => s.season_number === curSeason + 1);
      if (!nextSeaTmdb) {
        if (tmdbSt === 'Ended' || tmdbSt === 'Canceled') { moveTo(show, 'done', null); return true; }
        const nxt = ne && ne.air_date ? `T${ne.season_number} (${fmtDate(ne.air_date)})` : `T${curSeason + 1}`;
        moveTo(show, 'waiting', nxt); return true;
      }
    }
  }
  return false;
}

// ── RENDER ────────────────────────────────────────
function sc(s) { return { active: { label: 'En curso', dot: '#4caf7d', badge: 'badge-airing' }, waiting: { label: 'Esperando', dot: '#5b9bd5', badge: 'badge-waiting' }, pending: { label: 'Por ver', dot: '#9b7ec8', badge: 'badge-pending' }, done: { label: 'Finalizada', dot: '#c9a84c', badge: 'badge-done' } }[s] || { label: '', dot: '#888', badge: '' } }
function secCfg(c) { return { active: { label: '📺 En emisión ahora', dot: '#4caf7d' }, waiting: { label: '⏳ Esperando nueva temporada', dot: '#5b9bd5' }, pending: { label: '🎯 Quiero ver algún día', dot: '#9b7ec8' }, done: { label: '✅ Finalizadas', dot: '#c9a84c' } }[c] }

function createCard(show) {
  const cfg = sc(show.status);
  const poster = show.tmdb && show.tmdb.poster_path ? `${IMG}${show.tmdb.poster_path}` : '';
  const last = show.seasons && show.seasons.length ? show.seasons[show.seasons.length - 1] : '';
  const id = show.id, rating = show.rating ? Number(show.rating).toFixed(1) : '';
  const hasNext = show.status === 'active' && show.seasons && show.seasons.length > 0;
  if (!isGridView) {
    return `<div class="list-card">
  <div class="list-thumb" onclick="openModal('${id}')">${poster ? `<img src="${poster}" alt="" loading="lazy">` : '📺'}</div>
  <div class="list-info" onclick="openModal('${id}')">
    <div class="list-title">${show.title}${show._autoMoved ? ` <span style="font-size:0.65rem;color:var(--green);border:1px solid rgba(76,175,125,0.4);padding:1px 5px;border-radius:4px;background:rgba(76,175,125,0.1)">nuevo</span>` : ''}</div>
    <div class="list-sub">${show.nextEp ? `Pendiente: <strong>${show.nextEp}</strong>` : `Visto: ${last || '—'}`}</div>
  </div>
  <div class="list-right">
    ${rating ? `<span style="color:var(--gold);font-size:0.78rem;font-weight:600">★${rating}</span>` : ''}
    <span class="badge ${cfg.badge}">${cfg.label}</span>
    <div class="list-actions">
      ${hasNext ? `<button class="list-next-btn" onclick="event.stopPropagation();quickAdvance('${id}')">▶ Ya lo vi</button>` : ''}
      <button class="list-action-btn" onclick="event.stopPropagation();openEdit('${id}')">✏️</button>
      <button class="list-action-btn del" onclick="event.stopPropagation();confirmDelete('${id}')">🗑</button>
    </div>
  </div>
</div>`;
  }
  return `<div class="card${show._autoMoved ? ' auto-moved' : ''}">
<div class="card-poster" onclick="openModal('${id}')">
  ${poster ? `<img src="${poster}" alt="${show.title}" loading="lazy">` : `<div class="card-poster-placeholder"><span>📺</span><p>${show.title}</p></div>`}
  ${rating ? `<div class="card-rating">★${rating}</div>` : ''}
  <div class="card-actions">
    <button class="card-action-btn" onclick="event.stopPropagation();openEdit('${id}')">✏️</button>
    <button class="card-action-btn del" onclick="event.stopPropagation();confirmDelete('${id}')">🗑</button>
  </div>
  ${hasNext ? `<button class="card-next-btn" onclick="event.stopPropagation();quickAdvance('${id}')">▶ Marcar ${show.nextEp.split(' ')[0]}</button>` : ''}
</div>
<div class="card-body" onclick="openModal('${id}')">
  <div class="card-title">${show.title}</div>
  <div class="card-meta"><span class="card-ep">${show.nextEp || last || 'Sin empezar'}</span><div class="card-status-dot" style="background:${cfg.dot}"></div></div>
  ${show.seasons && show.seasons.length ? `<div class="card-progress-bar"><div class="card-progress-bar-fill" style="width:${Math.min(95, (show.seasons.length / (show.seasons.length + 1)) * 100)}%;background:var(--gold)"></div></div>` : ''}
</div>
</div>`;
}

function renderSections() {
  const con = document.getElementById('sectionsContainer');
  const q = document.getElementById('searchInput').value.toLowerCase();
  if (!isGridView) con.classList.add('list-view'); else con.classList.remove('list-view');
  const ORDER = ['active', 'pending', 'waiting', 'done'];
  const cats = currentFilter === 'all' ? ORDER : [currentFilter];
  let html = '';
  for (const cat of cats) {
    let shows = (DB[cat] || []).filter(s => !q || s.title.toLowerCase().includes(q));
    if (!shows.length) continue;
    shows = sortedShows(cat, shows);
    const cfg = secCfg(cat);
    html += `<div class="section">
  <div class="section-header">
    <div class="section-dot" style="background:${cfg.dot}"></div>
    <div class="section-title" style="color:${cfg.dot}">${cfg.label}</div>
    <span class="section-count">${shows.length}</span>
    <div class="section-line"></div>
  </div>
  <div class="grid">${shows.map(s => createCard(s)).join('')}</div>
</div>`;
  }
  con.innerHTML = html || '<div class="no-results">🎬 No se encontraron series</div>';
}
function updateStats() {
  document.getElementById('statsBar').innerHTML = `
<div class="stat"><div class="stat-n">${getAllShows().length}</div><div class="stat-l">Total</div></div>
<div class="stat"><div class="stat-n" style="color:var(--green)">${DB.active.length}</div><div class="stat-l">En curso</div></div>
<div class="stat"><div class="stat-n" style="color:var(--blue)">${DB.waiting.length}</div><div class="stat-l">Esperando</div></div>
<div class="stat"><div class="stat-n" style="color:var(--purple)">${DB.pending.length}</div><div class="stat-l">Por ver</div></div>
<div class="stat"><div class="stat-n" style="color:var(--gold)">${DB.done.length}</div><div class="stat-l">Finalizadas</div></div>`;
}

// ── QUICK ADVANCE ─────────────────────────────────
async function quickAdvance(id) {
  const show = findShow(id); if (!show) return;
  const detail = await getShowDetail(show);
  const { newSeasons, newNextEp, newStatus, toastMsg } = await computeAdvance(show, detail);
  show.seasons = newSeasons; show.nextEp = newNextEp;
  if (newStatus !== show.status) { const old = findCat(id); DB[old] = DB[old].filter(s => s.id !== id); show.status = newStatus; DB[newStatus].push(show); }
  await saveDB(); updateStats(); renderSections(); showToast(toastMsg);
}

// ── DETAIL MODAL ──────────────────────────────────
function renderModalSeasons(show) {
  const seasons = show.seasons || [];
  document.getElementById('modalSeasons').innerHTML = seasons.length
    ? seasons.map((s, i) => { const cur = i === seasons.length - 1 && show.status !== 'done' && show.status !== 'pending' && show.status !== 'waiting'; const done = show.status === 'done' || show.status === 'waiting' || i < seasons.length - 1; return `<span class="season-pill ${cur ? 'current' : done ? 'done' : ''}">${s}</span>` }).join('')
    : '<span style="color:var(--muted);font-size:0.8rem">Sin temporadas</span>';
}

async function openModal(id) {
  const show = findShow(id); if (!show) return;
  openModalId = id;
  const cfg = sc(show.status);
  document.getElementById('modalTitle').textContent = show.title;
  document.getElementById('modalBadge').innerHTML = `<span class="badge ${cfg.badge}" style="margin-bottom:0.4rem">${cfg.label}</span>`;
  document.getElementById('modalRating').textContent = show.rating ? `★ ${Number(show.rating).toFixed(1)}/10` : '';
  document.getElementById('modalYear').textContent = '';
  document.getElementById('modalOverview').textContent = 'Cargando...';
  document.getElementById('modalBackdrop').src = '';
  document.getElementById('modalLinkWrap').innerHTML = '';
  document.getElementById('modalTmdbNextEp').style.display = 'none';
  document.getElementById('modalTmdbNextEp').innerHTML = '';
  document.getElementById('modalEditBtn').onclick = () => { closeModal(); openEdit(id) };
  renderModalSeasons(show);
  const hasNext = show.status === 'active' && show.nextEp;
  const nb = document.getElementById('modalNextEpBlock');
  if (hasNext) {
    nb.style.display = 'block';
    document.getElementById('modalNextEpVal').textContent = show.nextEp;
    document.getElementById('advanceBtn').onclick = () => advanceFromModal(id);
  }
  else nb.style.display = 'none';
  document.getElementById('modalOverlay').classList.add('open');

  const detail = await getShowDetail(show);
  const basic = show.tmdb;
  if (basic) {
    if (basic.backdrop_path) document.getElementById('modalBackdrop').src = `${BG}${basic.backdrop_path}`;
    if (basic.overview) document.getElementById('modalOverview').textContent = basic.overview;
    if (basic.first_air_date) document.getElementById('modalYear').textContent = basic.first_air_date.slice(0, 4);
  } else document.getElementById('modalOverview').textContent = 'Sin descripción disponible.';

  if (detail) {
    if (detail.overview) document.getElementById('modalOverview').textContent = detail.overview;
    if (detail.first_air_date) document.getElementById('modalYear').textContent = detail.first_air_date.slice(0, 4);

    // Platform badge with real TMDB logo
    document.getElementById('modalLinkWrap').innerHTML = buildPlatformBadge(detail);

    // Auto-correct status
    const corrected = await autoCorrectStatus(show, detail);
    if (corrected) {
      await saveDB(); updateStats(); renderSections();
      const nc = sc(show.status);
      document.getElementById('modalBadge').innerHTML = `<span class="badge ${nc.badge}" style="margin-bottom:0.4rem">${nc.label}</span>`;
      document.getElementById('modalNextEpBlock').style.display = show.status === 'active' ? 'block' : 'none';
      showToast('🔄 Estado actualizado según TMDB');
    }

    const h = buildTmdbNextEpBlock(detail, show);
    if (h) { document.getElementById('modalTmdbNextEp').innerHTML = h; document.getElementById('modalTmdbNextEp').style.display = 'block'; }

    if (!show.rating) { const r = tmdbRating(detail); if (r) { show.rating = r; await saveDB(); document.getElementById('modalRating').textContent = `★ ${Number(r).toFixed(1)}/10`; renderSections(); } }
  }
}

async function advanceFromModal(id) {
  const show = findShow(id); if (!show) return;
  const detail = await getShowDetail(show);
  const { newSeasons, newNextEp, newStatus, toastMsg } = await computeAdvance(show, detail);
  show.seasons = newSeasons; show.nextEp = newNextEp;
  if (newStatus !== show.status) {
    const old = findCat(id); DB[old] = DB[old].filter(s => s.id !== id); show.status = newStatus; DB[newStatus].push(show);
    await saveDB(); updateStats(); renderSections(); closeModal(); showToast(toastMsg); return;
  }
  await saveDB(); updateStats(); renderSections();
  renderModalSeasons(show);
  document.getElementById('modalNextEpVal').textContent = show.nextEp || '—';
  document.getElementById('modalNextEpBlock').style.display = show.status === 'active' ? 'block' : 'none';
  showToast(toastMsg);
}
function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); openModalId = null }

// ── SEASON PICKER ─────────────────────────────────
function renderSeasonTags() {
  const list = document.getElementById('seasonsList');
  if (!editSeasons.length) { list.innerHTML = '<span style="color:var(--muted);font-size:0.76rem;font-style:italic">Nada añadido aún</span>'; return; }
  list.innerHTML = editSeasons.map((s, i) => `<span class="season-tag${i === editSeasons.length - 1 ? ' cur' : ''}">
${s}<button onclick="removeSeasonTag(${i})" title="Eliminar">×</button></span>`).join('');
}
async function buildPickerOptions(detail) {
  const sSel = document.getElementById('pickerSeason'); sSel.innerHTML = '<option value="">— Temporada —</option>'; resetEpSelect();
  if (detail && detail.seasons) {
    const real = detail.seasons.filter(s => s.season_number > 0 && s.episode_count > 0);
    if (real.length) { for (const s of real) { const nm = s.name && s.name !== `Season ${s.season_number}` && s.name !== `Temporada ${s.season_number}` ? ` · ${s.name}` : ''; sSel.innerHTML += `<option value="${s.season_number}">T${s.season_number} (${s.episode_count} ep${nm})</option>`; } return; }
  }
  for (let i = 1; i <= 15; i++)sSel.innerHTML += `<option value="${i}">Temporada ${i}</option>`;
}
function resetEpSelect() {
  const eSel = document.getElementById('pickerEp');
  eSel.innerHTML = '<option value="">— Episodio —</option><option value="all">✅ Temporada completa</option>';
  eSel.disabled = true; document.getElementById('addEpBtn').disabled = true;
}
function onPickerSeasonChange() {
  const sVal = document.getElementById('pickerSeason').value; if (!sVal) { resetEpSelect(); return; }
  const sNum = parseInt(sVal); const eSel = document.getElementById('pickerEp');
  let epCount = null;
  if (editTmdbDetail && editTmdbDetail.seasons) { const s = editTmdbDetail.seasons.find(x => x.season_number === sNum); if (s) epCount = s.episode_count; }
  eSel.innerHTML = '<option value="">— Episodio —</option><option value="all">✅ Temporada completa</option>';
  const max = epCount || 30; for (let e = 1; e <= max; e++)eSel.innerHTML += `<option value="${e}">Episodio ${e}</option>`;
  eSel.disabled = false; document.getElementById('addEpBtn').disabled = false;
}
function addPickedEp() {
  const sVal = document.getElementById('pickerSeason').value; const eVal = document.getElementById('pickerEp').value;
  if (!sVal) return; const sNum = parseInt(sVal);
  // Build complete history: T1, T2 ... T(sNum-1), T{sNum}[E{ep}]
  const ns = [];
  for (let s = 1; s < sNum; s++)ns.push(`T${s}`);
  if (eVal === 'all' || !eVal) ns.push(`T${sNum}`);
  else ns.push(`T${sNum}E${eVal}`);
  editSeasons = ns; renderSeasonTags();
  document.getElementById('pickerSeason').value = ''; resetEpSelect();
  const label = eVal && eVal !== 'all' ? `T${sNum}E${eVal}` : `T${sNum} (completa)`;
  showToast(`✅ Posición: ${label}`);
}
function removeSeasonTag(i) { editSeasons.splice(i, 1); renderSeasonTags() }

// ── EDIT MODAL ────────────────────────────────────
async function openAdd() {
  editingId = null; editSeasons = []; editTmdbDetail = null;
  document.getElementById('editModalTitle').textContent = '➕ Añadir serie';
  document.getElementById('editTitle').value = ''; document.getElementById('editRating').value = '';
  document.getElementById('editStatus').value = 'pending';
  document.getElementById('tmdbSearchInput').value = ''; document.getElementById('tmdbResults').style.display = 'none';
  document.getElementById('dupWarning').style.display = 'none'; document.getElementById('deleteBtn').style.display = 'none';
  renderSeasonTags(); await buildPickerOptions(null); document.getElementById('editOverlay').classList.add('open');
}
async function openEdit(id) {
  const show = findShow(id); if (!show) return;
  editingId = id; editSeasons = [...show.seasons || []]; editTmdbDetail = null;
  document.getElementById('editModalTitle').textContent = '✏️ Editar serie';
  document.getElementById('editTitle').value = show.title; document.getElementById('editRating').value = show.rating || '';
  document.getElementById('editStatus').value = show.status;
  document.getElementById('tmdbSearchInput').value = ''; document.getElementById('tmdbResults').style.display = 'none';
  document.getElementById('dupWarning').style.display = 'none'; document.getElementById('deleteBtn').style.display = 'block';
  renderSeasonTags(); document.getElementById('editOverlay').classList.add('open');
  document.getElementById('pickerLoading').style.display = 'flex'; document.getElementById('pickerMain').style.display = 'none';
  editTmdbDetail = await getShowDetail(show);
  document.getElementById('pickerLoading').style.display = 'none'; document.getElementById('pickerMain').style.display = 'block';
  await buildPickerOptions(editTmdbDetail);
}
function closeEdit() { document.getElementById('editOverlay').classList.remove('open'); document.getElementById('tmdbResults').style.display = 'none'; }

async function saveShow() {
  const title = document.getElementById('editTitle').value.trim();
  if (!title) { showToast('⚠️ El título no puede estar vacío'); return; }
  if (isDuplicate(title, editingId)) { showToast('⚠️ Esta serie ya está en tu lista', 'var(--red)'); document.getElementById('dupWarning').style.display = 'block'; return; }
  document.getElementById('dupWarning').style.display = 'none';

  const ratingRaw = document.getElementById('editRating').value;
  const rating = ratingRaw ? parseFloat(ratingRaw) : (editTmdbDetail ? tmdbRating(editTmdbDetail) : null);
  let status = document.getElementById('editStatus').value;

  // Auto-infer from TMDB
  if (editTmdbDetail && editSeasons.length) {
    const inf = inferStatus(editSeasons, editTmdbDetail, status);
    if (inf !== status) { status = inf; document.getElementById('editStatus').value = status; }
  }

  // Compute nextEp
  let nextEp = null;
  if (status === 'waiting' && editTmdbDetail) {
    const ne = editTmdbDetail.next_episode_to_air;
    if (ne && ne.air_date) nextEp = `T${ne.season_number} (${fmtDate(ne.air_date)})`;
    else { const p = editSeasons.length ? parseEp(editSeasons[editSeasons.length - 1]) : null; nextEp = `T${p ? (p.s + 1) : 1}`; }
  }
  if (status === 'active') {
    if (editingId) {
      const ex = findShow(editingId);
      // Only preserve nextEp if seasons haven't changed
      if (ex && ex.nextEp && JSON.stringify(ex.seasons) === JSON.stringify(editSeasons)) nextEp = ex.nextEp;
    }
    if (!nextEp && editSeasons.length) {
      const last = editSeasons[editSeasons.length - 1];
      const p = parseEp(last);
      if (p && p.e === null) nextEp = `T${p.s + 1}E1`;
      else nextEp = last;
    }
  }

  if (editingId) {
    const cat = findCat(editingId); const idx = DB[cat].findIndex(s => s.id === editingId); const prev = DB[cat][idx];
    const updated = { ...prev, title, rating, status, seasons: [...editSeasons], nextEp };
    if (status === cat) DB[cat][idx] = updated; else { DB[cat].splice(idx, 1); DB[status].push(updated); }
  } else {
    const basic = editTmdbDetail ? { id: editTmdbDetail.id, poster_path: editTmdbDetail.poster_path, backdrop_path: editTmdbDetail.backdrop_path, overview: editTmdbDetail.overview, first_air_date: editTmdbDetail.first_air_date } : null;
    const newShow = { id: genId(), title, rating, status, seasons: [...editSeasons], nextEp, tmdb: basic };
    DB[status].push(newShow);
    if (!newShow.tmdb) tmdbSearch(title).then(t => { if (t) { newShow.tmdb = t; renderSections(); } });
  }
  await saveDB(); updateStats(); renderSections(); closeEdit(); showToast(editingId ? '✅ Guardado' : '✅ Serie añadida');
}

async function deleteShow(id) { removeFromDB(id); await saveDB(); updateStats(); renderSections(); closeModal(); closeEdit(); showToast('🗑 Eliminada') }
function confirmDelete(id) { if (confirm('¿Eliminar esta serie?')) deleteShow(id) }
function deleteCurrentShow() { if (editingId) confirmDelete(editingId) }

// ── TMDB autocomplete ─────────────────────────────
document.getElementById('tmdbSearchInput').addEventListener('input', function () {
  clearTimeout(tmdbTimer); const q = this.value.trim(); const box = document.getElementById('tmdbResults');
  if (q.length < 2) { box.style.display = 'none'; return; }
  tmdbTimer = setTimeout(async () => {
    const res = await tmdbMulti(q); if (!res.length) { box.style.display = 'none'; return; }
    box.innerHTML = res.map(r => {
      const dup = isDuplicate(r.name, editingId);
      const safeN = r.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
      return `<div class="tmdb-result" onclick="${dup ? '' : 'selectTmdb(' + r.id + ',\'' + safeN + '\',\'' + r.poster_path + '\',\'' + r.first_air_date + '\',\'' + r.backdrop_path + '\')'}" style="${dup ? 'opacity:0.45;cursor:not-allowed' : ''}">
    ${r.poster_path ? `<img src="${IMG}${r.poster_path}" alt="">` : '<div style="width:30px;height:45px;background:var(--surface);border-radius:3px;display:flex;align-items:center;justify-content:center">📺</div>'}
    <div class="tmdb-result-info"><p>${r.name}${dup ? ' <span style="color:var(--red);font-size:0.65rem">(ya en lista)</span>' : ''}</p><span>${r.first_air_date ? r.first_air_date.slice(0, 4) : ''} ${r.vote_average ? '· ★' + r.vote_average.toFixed(1) : ''}</span></div>
  </div>`;
    }).join(''); box.style.display = 'block';
  }, 380);
});

async function selectTmdb(tmdbId, name, poster, date, backdrop) {
  if (isDuplicate(name, editingId)) { document.getElementById('dupWarning').style.display = 'block'; document.getElementById('editTitle').value = name; document.getElementById('tmdbResults').style.display = 'none'; document.getElementById('tmdbSearchInput').value = ''; showToast('⚠️ Esta serie ya está en tu lista', 'var(--red)'); return; }
  document.getElementById('dupWarning').style.display = 'none';
  document.getElementById('editTitle').value = name; document.getElementById('tmdbResults').style.display = 'none'; document.getElementById('tmdbSearchInput').value = '';
  document.getElementById('pickerLoading').style.display = 'flex'; document.getElementById('pickerMain').style.display = 'none'; showToast('⏳ Cargando datos...');
  try {
    const d = await tmdbDetail(tmdbId); editTmdbDetail = d;
    if (d) {
      tmdbCache[name] = { id: tmdbId, poster_path: poster, backdrop_path: backdrop, name, first_air_date: date, overview: d.overview };
      const r = tmdbRating(d); if (r) document.getElementById('editRating').value = r;
    }
    document.getElementById('pickerLoading').style.display = 'none'; document.getElementById('pickerMain').style.display = 'block';
    await buildPickerOptions(d); showToast('✅ Cargado · ★' + (d && d.vote_average ? d.vote_average.toFixed(1) : '—'));
  } catch (e) { document.getElementById('pickerLoading').style.display = 'none'; document.getElementById('pickerMain').style.display = 'block'; }
}

// ── EVENTS ────────────────────────────────────────
document.getElementById('searchInput').addEventListener('input', () => renderSections());
document.querySelectorAll('.filter-btn').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('.filter-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); currentFilter = b.dataset.filter; renderSections(); }));
document.getElementById('gridViewBtn').addEventListener('click', () => { isGridView = true; document.getElementById('gridViewBtn').classList.add('active'); document.getElementById('listViewBtn').classList.remove('active'); renderSections(); });
document.getElementById('listViewBtn').addEventListener('click', () => { isGridView = false; document.getElementById('listViewBtn').classList.add('active'); document.getElementById('gridViewBtn').classList.remove('active'); renderSections(); });
document.getElementById('addBtn').addEventListener('click', openAdd);
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', e => { if (e.target === document.getElementById('modalOverlay')) closeModal(); });
document.getElementById('editClose').addEventListener('click', closeEdit);
document.getElementById('editCancelBtn').addEventListener('click', closeEdit);
document.getElementById('editOverlay').addEventListener('click', e => { if (e.target === document.getElementById('editOverlay')) closeEdit(); });
document.getElementById('editTitle').addEventListener('input', () => { document.getElementById('dupWarning').style.display = 'none'; });

// ── DEFAULT DATA & INIT ───────────────────────────
const DEFAULT_DATA = { active: [], waiting: [], pending: [], done: [] };

async function init() {
  const saved = await loadDB();
  if (saved) DB = saved;
  else DB = JSON.parse(JSON.stringify(DEFAULT_DATA));
  const moved = checkAutoMove();
  if (moved) showToast(`📺 ${moved} serie${moved > 1 ? 's' : ''} pasada${moved > 1 ? 's' : ''} a "En curso"`);
  updateStats(); renderSections();

  // Background: fetch TMDB for all non-pending shows to detect updates, revivals or cancelations
  let changesMade = false;
  let updateMsgs = [];
  for (const show of getAllShows()) {
    if (show.status === 'pending') continue;

    if (!show.tmdb) { const t = await tmdbSearch(show.title); if (t) { show.tmdb = t; changesMade = true; } }

    if (show.tmdb) {
      const d = await tmdbDetail(show.tmdb.id);
      if (d) {
        let r = tmdbRating(d);
        if (r && !show.rating) { show.rating = r; changesMade = true; }

        const oldStatus = show.status;
        const c = await autoCorrectStatus(show, d);
        if (c) {
          changesMade = true;
          if (show.status === 'done' && oldStatus === 'waiting') updateMsgs.push(`"${show.title}" finalizada`);
          else if (show.status === 'waiting' && oldStatus === 'done') updateMsgs.push(`¡"${show.title}" regresa!`);
          else if (show.status === 'waiting') updateMsgs.push(`Novedades de "${show.title}"`);
        }
      }
      await new Promise(res => setTimeout(res, 150)); // sleep to respect API limits
    }
  }
  if (changesMade) {
    await saveDB(); updateStats(); renderSections();
    if (updateMsgs.length > 0) showToast(`🔄 Sincronizado: ${updateMsgs[0]}${updateMsgs.length > 1 ? ' y más' : ''}`);
  }
  setInterval(async () => { const n = checkAutoMove(); if (n) { await saveDB(); updateStats(); renderSections(); showToast(`📺 ${n} serie${n > 1 ? 's' : ''} movida${n > 1 ? 's' : ''} a "En curso"`); } }, 3600000);
}
