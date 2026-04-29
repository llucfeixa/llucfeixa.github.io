// ── STATE ─────────────────────────────────────────
let DB = { active: [], waiting: [], pending: [], done: [] };
let tmdbCache = {}, tmdbDetailCache = {};
let currentFilter = 'all', isGridView = true, currentView = 'my-series';
let editingId = null, editSeasons = [], editTmdbDetail = null, trendingCache = [], topRatedCache = [], genreCache = null;
let tmdbTimer = null, discoverTimer = null, openModalId = null, currentGenreId = null;
let trendingPage = 1, topRatedPage = 1, searchPage = 1;
let trendingHasMore = true, topRatedHasMore = true, searchHasMore = true;
let genreStates = {}; // Stores { page, cache, hasMore } per genreId

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
  DB[old] = DB[old].filter(s => s.id !== show.id);
  show.status = newStatus;
  if (newNextEp !== undefined) show.nextEp = newNextEp;
  DB[newStatus].push(show);
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
  const isPending = show.status === 'pending';

  if (!isGridView) {
    return `<div class="list-card">
  <div class="list-thumb" onclick="openModal('${id}')">${poster ? `<img src="${poster}" alt="" loading="lazy">` : '📺'}</div>
  <div class="list-info" onclick="openModal('${id}')">
    <div class="list-title">${show.title}</div>
    <div class="list-sub">${show.nextEp ? `Pendiente: <strong>${show.nextEp}</strong>` : `Visto: ${last || '—'}`}</div>
  </div>
  <div class="list-right">
    ${rating ? `<span style="color:var(--gold);font-size:0.78rem;font-weight:600">★${rating}</span>` : ''}
    <span class="badge ${cfg.badge}">${cfg.label}</span>
    <div class="list-actions">
      ${hasNext ? `<button class="list-next-btn" onclick="event.stopPropagation();quickAdvance('${id}')">▶ Ya lo vi</button>` : ''}
      ${isPending ? `<button class="list-next-btn" onclick="event.stopPropagation();startWatching('${id}')">▶ Empezar</button>` : ''}
      <button class="list-action-btn" onclick="event.stopPropagation();openEdit('${id}')">✏️</button>
      <button class="list-action-btn del" onclick="event.stopPropagation();confirmDelete('${id}')">🗑</button>
    </div>
  </div>
</div>`;
  }
  const progress = calculateProgress(show);
  return `<div class="card">
<div class="card-poster" onclick="openModal('${id}')">
  ${poster ? `<img src="${poster}" alt="${show.title}" loading="lazy">` : `<div class="card-poster-placeholder"><span>📺</span><p>${show.title}</p></div>`}
  ${rating ? `<div class="card-rating">★${rating}</div>` : ''}
  ${hasNext ? `<button class="card-next-btn" onclick="event.stopPropagation();quickAdvance('${id}')">▶ Marcar ${show.nextEp.split(' ')[0]}</button>` : ''}
  ${isPending ? `<button class="card-next-btn" onclick="event.stopPropagation();startWatching('${id}')">▶ Empezar a ver</button>` : ''}
</div>
<div class="card-actions">
  <button class="card-action-btn" onclick="event.stopPropagation();openEdit('${id}')">✏️</button>
  <button class="card-action-btn del" onclick="event.stopPropagation();confirmDelete('${id}')">🗑</button>
</div>
<div class="card-body" onclick="openModal('${id}')">
  <div class="card-title">${show.title}</div>
  <div class="card-meta"><span class="card-ep">${show.nextEp || last || 'Sin empezar'}</span><div class="card-status-dot" style="background:${cfg.dot}"></div></div>
  ${show.seasons && show.seasons.length ? `<div class="card-progress-bar"><div class="card-progress-bar-fill" style="width:${progress}%;background:var(--gold)"></div></div>` : ''}
</div>
</div>`;
}

function calculateProgress(show) {
  if (show.status === 'done') return 100;
  if (!show.seasons || !show.seasons.length) return 0;
  if (!show.tmdb || !show.tmdb.number_of_episodes) {
    // Fallback if no episode count: use seasons (rough)
    const totalSeasons = show.tmdb && show.tmdb.number_of_seasons ? show.tmdb.number_of_seasons : show.seasons.length + 1;
    return Math.min(95, (show.seasons.length / totalSeasons) * 100);
  }

  const totalEps = show.tmdb.number_of_episodes;
  let watchedEps = 0;

  // Estimate watched episodes
  show.seasons.forEach(tag => {
    const p = parseEp(tag);
    if (p) {
      if (p.e === null) {
        // We need season episode counts for accuracy, but we'll estimate 10 eps per season if missing
        watchedEps += 10;
      } else {
        watchedEps += p.e;
      }
    }
  });

  // If we have total episodes, ensure we don't exceed it but also that 
  // 'active' shows don't look 100% unless they really are (status should be done then)
  let percent = (watchedEps / totalEps) * 100;
  return Math.min(95, percent);
}

function renderSections() {
  const con = document.getElementById('sectionsContainer');
  if (!con) return;
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

function switchView(view) {
  currentView = view;
  const myView = document.getElementById('mySeriesView');
  const discView = document.getElementById('discoverView');
  const myTab = document.getElementById('mySeriesTab');
  const discTab = document.getElementById('discoverTab');

  if (view === 'my-series') {
    myView.style.display = 'block';
    discView.style.display = 'none';
    myTab.classList.add('active');
    discTab.classList.remove('active');
    renderSections();
    updateStats();
  } else {
    myView.style.display = 'none';
    discView.style.display = 'block';
    myTab.classList.remove('active');
    discTab.classList.add('active');
    renderDiscover();
  }
}

async function renderDiscover(append = false) {
  const trendingGrid = document.getElementById('discoverTrendingGrid');
  const topGrid = document.getElementById('discoverTopGrid');
  const genreDiv = document.getElementById('genreFilters');
  const defContent = document.getElementById('discoverDefaultContent');
  const searchResults = document.getElementById('discoverSearchResults');
  const searchGrid = document.getElementById('discoverSearchGrid');
  const q = document.getElementById('discoverSearchInput').value.trim();

  if (!trendingGrid || !topGrid || !genreDiv) return;

  // 1. Ensure genres are loaded
  if (!genreCache) {
    genreCache = await tmdbGenres();
    genreDiv.innerHTML = '<button class="genre-tag active" id="genreAll" onclick="filterByGenre(null)">Todos</button>' +
      genreCache.map(g => `<button class="genre-tag" data-id="${g.id}" onclick="filterByGenre(${g.id})">${g.name}</button>`).join('');
  }

  function deselectGenres() {
    document.querySelectorAll('.genre-tag').forEach(b => {
      if (b.id === 'genreAll') b.classList.add('active');
      else b.classList.remove('active');
    });
  }

  // 2. Determine state: Search > Genre > Default
  if (q) {
    defContent.style.display = 'none';
    searchResults.style.display = 'block';
    document.querySelector('#discoverSearchResults .section-title').textContent = 'Resultados de búsqueda';

    // Cleanup other buttons
    ['loadMoreTrending', 'loadMoreTop', 'loadMoreGenre'].forEach(id => { const b = document.getElementById(id); if (b) b.remove(); });

    if (!append) {
      searchGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:4rem 2rem;color:var(--muted)"><div class="spinner" style="margin:0 auto 1rem"></div>Buscando...</div>';
      searchPage = 1;
    }

    const results = await tmdbMulti(q, searchPage);
    if (!append) searchGrid.innerHTML = '';

    if (!results.length && !append) {
      searchGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:4rem 2rem;color:var(--muted)">No se encontraron series.</div>';
      searchHasMore = false;
    } else if (!results.length && append) {
      searchHasMore = false;
    } else {
      const currentIds = new Set([...searchGrid.querySelectorAll('.card-poster')].map(el => {
        const attr = el.getAttribute('onclick');
        const match = attr.match(/'(\d+)'/);
        return match ? match[1] : null;
      }));
      const newHtml = results.filter(s => !currentIds.has(String(s.id))).map(s => renderDiscoverCard(s)).join('');
      searchGrid.innerHTML += newHtml;
      searchHasMore = results.length >= 20;
    }

    updateLoadMoreBtn(searchGrid, 'loadMoreSearch', searchHasMore, () => { searchPage++; renderDiscover(true); });
    return;
  }

  if (currentGenreId) {
    defContent.style.display = 'none';
    searchResults.style.display = 'block';
    const genreName = genreCache.find(g => g.id === currentGenreId)?.name || 'Género';
    document.querySelector('#discoverSearchResults .section-title').textContent = 'Género: ' + genreName;

    // Cleanup other buttons
    ['loadMoreTrending', 'loadMoreTop', 'loadMoreSearch'].forEach(id => { const b = document.getElementById(id); if (b) b.remove(); });

    if (!genreStates[currentGenreId]) {
      genreStates[currentGenreId] = { page: 1, cache: [], hasMore: true };
    }
    const state = genreStates[currentGenreId];

    if (!state.cache.length && !append) {
      searchGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:4rem 2rem;color:var(--muted)"><div class="spinner" style="margin:0 auto 1rem"></div>Filtrando...</div>';
    }

    if (append && state.hasMore) {
      const res = await tmdbDiscoverByGenre(currentGenreId, state.page);
      state.cache = [...state.cache, ...res];
      state.hasMore = res.length >= 20;
    } else if (!state.cache.length) {
      const res = await tmdbDiscoverByGenre(currentGenreId, 1);
      state.cache = res; state.page = 1; state.hasMore = res.length >= 20;
    }

    // Deduplicate cache just in case
    state.cache = [...new Map(state.cache.map(s => [s.id, s])).values()];

    searchGrid.innerHTML = state.cache.map(s => renderDiscoverCard(s)).join('');
    updateLoadMoreBtn(searchGrid, 'loadMoreGenre', state.hasMore, () => { state.page++; renderDiscover(true); });
    return;
  }

  // 3. Default state (Trending & Top Rated)
  defContent.style.display = 'block';
  searchResults.style.display = 'none';
  if (document.getElementById('loadMoreGenre')) document.getElementById('loadMoreGenre').remove();
  if (document.getElementById('loadMoreSearch')) document.getElementById('loadMoreSearch').remove();

  // Trending
  if (!trendingCache.length) {
    trendingGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--muted)"><div class="spinner" style="margin:0 auto 1rem"></div></div>';
    const res = await tmdbTrending(1);
    trendingCache = res; trendingPage = 1; trendingHasMore = res.length >= 20;
  } else if (append && trendingHasMore) {
    const res = await tmdbTrending(trendingPage);
    trendingCache = [...trendingCache, ...res];
    trendingHasMore = res.length >= 20;
  }
  // Deduplicate
  trendingCache = [...new Map(trendingCache.map(s => [s.id, s])).values()];
  trendingGrid.innerHTML = trendingCache.map(s => renderDiscoverCard(s)).join('');
  updateLoadMoreBtn(trendingGrid, 'loadMoreTrending', trendingHasMore, () => { trendingPage++; renderDiscover(true); });

  // Top Rated
  if (!topRatedCache.length) {
    topGrid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--muted)"><div class="spinner" style="margin:0 auto 1rem"></div></div>';
    const res = await tmdbTopRated(1);
    topRatedCache = res; topRatedPage = 1; topRatedHasMore = res.length >= 20;
  } else if (append && topRatedHasMore) {
    const res = await tmdbTopRated(topRatedPage);
    topRatedCache = [...topRatedCache, ...res];
    topRatedHasMore = res.length >= 20;
  }
  // Deduplicate
  topRatedCache = [...new Map(topRatedCache.map(s => [s.id, s])).values()];
  topGrid.innerHTML = topRatedCache.map(s => renderDiscoverCard(s)).join('');
  updateLoadMoreBtn(topGrid, 'loadMoreTop', topRatedHasMore, () => { topRatedPage++; renderDiscover(true); });
}

function updateLoadMoreBtn(container, id, show, onClick) {
  let btn = document.getElementById(id);
  if (!show) { if (btn) btn.remove(); return; }

  if (!btn) {
    btn = document.createElement('button');
    btn.id = id; btn.className = 'btn btn-ghost'; btn.style = 'margin:1.5rem auto;display:block';
    container.after(btn);
  }

  btn.onclick = (e) => {
    btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;margin:0"></div>';
    onClick();
  };
  btn.innerHTML = 'Cargar más';
}

function renderDiscoverCard(s) {
  const poster = s.poster_path ? `${IMG}${s.poster_path}` : '';
  const rating = s.vote_average ? s.vote_average.toFixed(1) : '';
  const inList = getAllShows().some(x => x.tmdb && x.tmdb.id === s.id);
  const date = s.first_air_date ? s.first_air_date.slice(0, 4) : '';
  const safeTitle = s.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
  const safePoster = s.poster_path || '';
  const safeBackdrop = s.backdrop_path || '';

  return `<div class="card">
    <div class="card-poster" onclick="openModal('${s.id}', true)">
      ${poster ? `<img src="${poster}" alt="${s.name}" loading="lazy">` : `<div class="card-poster-placeholder"><span>📺</span><p>${s.name}</p></div>`}
      ${rating ? `<div class="card-rating">★${rating}</div>` : ''}
      ${inList ? `<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(76,175,125,0.9);color:#000;font-size:0.65rem;font-weight:700;padding:4px;text-align:center">EN TU LISTA</div>` : ''}
    </div>
    <div class="card-body" onclick="openModal('${s.id}', true)">
      <div class="card-title">${s.name}</div>
      <div class="card-meta"><span class="card-ep">${date}</span></div>
    </div>
  </div>`;
}

async function handleDiscoverSearch() {
  const q = document.getElementById('discoverSearchInput').value.trim();
  if (q) {
    currentGenreId = null;
    document.querySelectorAll('.genre-tag').forEach(b => {
      if (b.id === 'genreAll') b.classList.add('active');
      else b.classList.remove('active');
    });
  }

  clearTimeout(discoverTimer);
  discoverTimer = setTimeout(() => {
    searchPage = 1; // Reset page when typing new search
    renderDiscover();
  }, 450);
}

async function discoverAdd(tmdbId, name, poster, date, backdrop) {
  await openAdd();
  selectTmdb(tmdbId, name, poster, date, backdrop);
}

function filterByGenre(id) {
  currentGenreId = id;
  if (id) document.getElementById('discoverSearchInput').value = ''; // Clear search if filtering by genre

  document.querySelectorAll('.genre-tag').forEach(b => {
    if (id === null && b.id === 'genreAll') b.classList.add('active');
    else if (b.dataset.id == id) b.classList.add('active');
    else b.classList.remove('active');
  });
  renderDiscover();
}

async function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:4rem 2rem;color:var(--muted)"><div class="spinner" style="margin:0 auto 1rem"></div>Calculando estrenos...</div>';

  const activeShows = DB.active;
  const releases = [];

  for (const show of activeShows) {
    const detail = await getShowDetail(show);
    if (detail && detail.next_episode_to_air) {
      const ne = detail.next_episode_to_air;
      releases.push({ show, ep: ne, date: new Date(ne.air_date) });
    }
  }

  releases.sort((a, b) => a.date - b.date);

  if (!releases.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:4rem 2rem;color:var(--muted)">No hay estrenos próximos programados para tus series en curso.</div>';
    return;
  }

  grid.innerHTML = releases.map(r => {
    const d = r.date;
    const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    return `<div class="calendar-card">
      <div class="cal-date">
        <div class="cal-day">${d.getDate()}</div>
        <div class="cal-month">${months[d.getMonth()]}</div>
      </div>
      <div class="cal-info">
        <div class="cal-title">${r.show.title}</div>
        <div class="cal-ep">T${r.ep.season_number}E${r.ep.episode_number} · ${r.ep.name || 'Sin título'}</div>
      </div>
      <button class="btn btn-ghost" style="padding:0.3rem 0.6rem;font-size:0.7rem" onclick="openModal('${r.show.id}')">Ver</button>
    </div>`;
  }).join('');
}

function updateStats() {
  const bar = document.getElementById('statsBar');
  if (!bar) return;

  let totalEps = 0;
  getAllShows().forEach(s => {
    if (s.seasons) {
      s.seasons.forEach(tag => {
        const p = parseEp(tag);
        if (p) totalEps += p.e || 10;
      });
    }
  });
  const hours = Math.round((totalEps * 45) / 60);

  bar.innerHTML = `
<div class="stat"><div class="stat-n">${getAllShows().length}</div><div class="stat-l">Total</div></div>
<div class="stat"><div class="stat-n" style="color:var(--green)">${DB.active.length}</div><div class="stat-l">En curso</div></div>
<div class="stat"><div class="stat-n" style="color:var(--purple)">${DB.pending.length}</div><div class="stat-l">Por ver</div></div>
<div class="stat"><div class="stat-n" style="color:var(--blue)">${DB.waiting.length}</div><div class="stat-l">Esperando</div></div>
<div class="stat"><div class="stat-n" style="color:var(--gold)">${DB.done.length}</div><div class="stat-l">Finalizadas</div></div>
<div class="stat"><div class="stat-n" style="color:var(--gold)">${hours}h</div><div class="stat-l">Visto</div></div>`;
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

async function startWatching(id) {
  const show = findShow(id);
  if (!show) return;
  const old = findCat(id);
  DB[old] = DB[old].filter(s => s.id !== id);
  show.status = 'active';
  show.seasons = ['T1E1'];
  show.nextEp = 'T1E1';
  DB['active'].push(show);

  await saveDB();
  updateStats();
  renderSections();
  showToast('📺 ¡Empezamos! T1E1 añadido');
}

// ── DETAIL MODAL ──────────────────────────────────
function renderModalSeasons(show) {
  const seasons = show.seasons || [];
  document.getElementById('modalSeasons').innerHTML = seasons.length
    ? seasons.map((s, i) => { const cur = i === seasons.length - 1 && show.status !== 'done' && show.status !== 'pending' && show.status !== 'waiting'; const done = show.status === 'done' || show.status === 'waiting' || i < seasons.length - 1; return `<span class="season-pill ${cur ? 'current' : done ? 'done' : ''}">${s}</span>` }).join('')
    : '<span style="color:var(--muted);font-size:0.8rem">Sin temporadas</span>';
}

async function openModal(id, isTmdbId = false) {
  let show = null;
  if (isTmdbId) {
    const tmdbId = parseInt(id);
    show = getAllShows().find(s => s.tmdb && s.tmdb.id === tmdbId);
    if (!show) show = { tmdb: { id: tmdbId }, title: 'Cargando...', seasons: [] };
  } else {
    show = findShow(id);
  }
  if (!show) return;

  const inList = show.id !== undefined;
  openModalId = show.id || null;

  const cfg = sc(show.status || 'pending');
  document.getElementById('modalTitle').textContent = show.title;
  document.getElementById('modalBadge').innerHTML = inList ? `<span class="badge ${cfg.badge}" style="margin-bottom:0.4rem">${cfg.label}</span>` : '';
  document.getElementById('modalRating').textContent = show.rating ? `★ ${Number(show.rating).toFixed(1)}/10` : '';
  document.getElementById('modalYear').textContent = '';
  document.getElementById('modalExtraInfo').textContent = '';
  document.getElementById('modalOverview').textContent = 'Cargando...';
  document.getElementById('modalBackdrop').src = '';
  document.getElementById('modalLinkWrap').innerHTML = '';
  document.getElementById('modalTmdbNextEp').style.display = 'none';
  document.getElementById('modalTmdbNextEp').innerHTML = '';
  document.getElementById('modalTrailerBtnWrap').innerHTML = '';
  document.getElementById('modalCastWrap').style.display = 'none';
  document.getElementById('modalSimilarWrap').style.display = 'none';
  document.getElementById('modalPlatforms').innerHTML = '';

  if (inList) {
    document.getElementById('modalEditBtn').style.display = 'block';
    document.getElementById('modalAddBtn').style.display = 'none';
    document.getElementById('modalEditBtn').onclick = () => { closeModal(); openEdit(show.id) };
  } else {
    document.getElementById('modalEditBtn').style.display = 'none';
    document.getElementById('modalAddBtn').style.display = 'block';
  }

  renderModalSeasons(show);
  const hasNext = inList && show.status === 'active' && show.nextEp;
  const isPending = inList && show.status === 'pending';
  const nb = document.getElementById('modalNextEpBlock');
  const sb = document.getElementById('modalStartBlock');

  if (hasNext) {
    nb.style.display = 'block';
    document.getElementById('modalNextEpVal').textContent = show.nextEp;
    document.getElementById('advanceBtn').onclick = () => advanceFromModal(show.id);
  } else nb.style.display = 'none';

  if (isPending) {
    sb.style.display = 'block';
    document.getElementById('startBtn').onclick = async () => {
      await startWatching(show.id);
      closeModal();
    };
  } else sb.style.display = 'none';

  document.getElementById('modalOverlay').classList.add('open');

  const detail = await (isTmdbId ? tmdbDetail(id) : getShowDetail(show));
  if (detail) {
    document.getElementById('modalTitle').textContent = detail.name || detail.original_name || show.title;
    if (detail.backdrop_path) document.getElementById('modalBackdrop').src = `${BG}${detail.backdrop_path}`;
    if (detail.overview) document.getElementById('modalOverview').textContent = detail.overview;
    if (detail.first_air_date) document.getElementById('modalYear').textContent = detail.first_air_date.slice(0, 4);

    // Extra info
    document.getElementById('modalExtraInfo').textContent = `${detail.number_of_seasons} temp. · ${detail.number_of_episodes} eps.`;

    if (!inList) {
      document.getElementById('modalAddBtn').onclick = () => {
        closeModal();
        openAdd(true);
        selectTmdb(detail.id, detail.name, detail.poster_path, detail.first_air_date, detail.backdrop_path);
      };
    }

    document.getElementById('modalPlatforms').innerHTML = buildPlatformBadge(detail);

    // Trailers... (rest of the logic stays same)

    // Trailers
    tmdbVideos(detail.id).then(videos => {
      const trailer = videos.find(v => v.type === 'Trailer' && v.site === 'YouTube');
      if (trailer) {
        document.getElementById('modalTrailerBtnWrap').innerHTML = `<button class="trailer-btn" onclick="window.open('https://youtube.com/watch?v=${trailer.key}', '_blank')"><span>▶</span> Ver Tráiler</button>`;
      }
    });

    // Cast
    tmdbCredits(detail.id).then(cast => {
      if (cast.length) {
        document.getElementById('modalCastWrap').style.display = 'block';
        document.getElementById('modalCast').innerHTML = cast.slice(0, 10).map(c => `
          <div class="cast-item">
            <img class="cast-img" src="${c.profile_path ? IMG + c.profile_path : ''}" alt="">
            <div class="cast-name">${c.name}</div>
          </div>`).join('');
      }
    });

    // Similar
    tmdbSimilar(detail.id).then(similar => {
      if (similar.length) {
        document.getElementById('modalSimilarWrap').style.display = 'block';
        document.getElementById('modalSimilar').innerHTML = similar.slice(0, 4).map(s => `
          <div class="card" style="font-size:0.7rem;cursor:pointer" onclick="openModal('${s.id}', true)">
            <img src="${IMG}${s.poster_path}" style="width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:6px">
            <div style="padding:0.3rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.name}</div>
          </div>`).join('');
      }
    });

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
async function buildPickerOptions(detail) {
  const sSel = document.getElementById('pickerSeason'); sSel.innerHTML = '<option value="">— Temporada —</option>'; resetEpSelect();
  if (detail && detail.seasons) {
    const real = detail.seasons.filter(s => s.season_number > 0 && s.episode_count > 0);
    if (real.length) {
      for (const s of real) {
        const nm = s.name && s.name !== `Season ${s.season_number}` && s.name !== `Temporada ${s.season_number}` ? ` · ${s.name}` : '';
        sSel.innerHTML += `<option value="${s.season_number}">T${s.season_number} (${s.episode_count} ep${nm})</option>`;
      }
      return;
    }
  }
  for (let i = 1; i <= 15; i++)sSel.innerHTML += `<option value="${i}">Temporada ${i}</option>`;
}
function resetEpSelect() {
  const eSel = document.getElementById('pickerEp');
  eSel.innerHTML = '<option value="">— Episodio —</option><option value="all">✅ Temporada completa</option>';
  eSel.disabled = true;
}
function onPickerSeasonChange() {
  const sVal = document.getElementById('pickerSeason').value; if (!sVal) { resetEpSelect(); return; }
  const sNum = parseInt(sVal); const eSel = document.getElementById('pickerEp');
  let epCount = null;
  if (editTmdbDetail && editTmdbDetail.seasons) { const s = editTmdbDetail.seasons.find(x => x.season_number === sNum); if (s) epCount = s.episode_count; }
  eSel.innerHTML = '<option value="">— Episodio —</option><option value="all">✅ Temporada completa</option>';
  const max = epCount || 30; for (let e = 1; e <= max; e++)eSel.innerHTML += `<option value="${e}">Episodio ${e}</option>`;
  eSel.disabled = false;
}

// ── EDIT MODAL ────────────────────────────────────
async function openAdd(hideSearch) {
  const shouldHide = hideSearch === true;
  editingId = null; editSeasons = []; editTmdbDetail = null;
  document.getElementById('editModalTitle').textContent = '➕ Añadir serie';
  document.getElementById('editTitle').value = ''; document.getElementById('editRating').value = '';
  document.getElementById('editStatus').value = 'pending';
  document.getElementById('tmdbSearchGroup').style.display = shouldHide ? 'none' : 'block';
  document.getElementById('tmdbSearchInput').value = ''; document.getElementById('tmdbResults').style.display = 'none';
  document.getElementById('dupWarning').style.display = 'none'; document.getElementById('deleteBtn').style.display = 'none';
  await buildPickerOptions(null); document.getElementById('editOverlay').classList.add('open');
  togglePickerGroup();
}
async function openEdit(id) {
  const show = findShow(id); if (!show) return;
  editingId = id; editSeasons = [...show.seasons || []]; editTmdbDetail = null;
  document.getElementById('editModalTitle').textContent = '✏️ Editar serie';
  document.getElementById('editTitle').value = show.title; document.getElementById('editRating').value = show.rating || '';
  document.getElementById('editStatus').value = show.status;
  document.getElementById('tmdbSearchGroup').style.display = 'none';
  document.getElementById('tmdbSearchInput').value = ''; document.getElementById('tmdbResults').style.display = 'none';
  document.getElementById('dupWarning').style.display = 'none'; document.getElementById('deleteBtn').style.display = 'block';
  document.getElementById('editOverlay').classList.add('open');
  togglePickerGroup();
  document.getElementById('pickerLoading').style.display = 'flex'; document.getElementById('pickerMain').style.display = 'none';
  editTmdbDetail = await getShowDetail(show);
  togglePickerGroup();
  document.getElementById('pickerLoading').style.display = 'none'; document.getElementById('pickerMain').style.display = 'block';
  await buildPickerOptions(editTmdbDetail);
  if (editSeasons.length > 0) {
    const last = editSeasons[editSeasons.length - 1];
    const p = parseEp(last);
    if (p) {
      document.getElementById('pickerSeason').value = p.s;
      onPickerSeasonChange();
      if (p.e !== null) document.getElementById('pickerEp').value = p.e;
      else document.getElementById('pickerEp').value = 'all';
    }
  } else {
    document.getElementById('pickerSeason').value = '';
    resetEpSelect();
  }
}
function closeEdit() { document.getElementById('editOverlay').classList.remove('open'); document.getElementById('tmdbResults').style.display = 'none'; }

async function saveShow() {
  const title = document.getElementById('editTitle').value.trim();
  if (!title) { showToast('⚠️ El título no puede estar vacío'); return; }
  const tmdbId = editTmdbDetail ? editTmdbDetail.id : null;
  if (isDuplicate(title, editingId, tmdbId)) { showToast('⚠️ Esta serie ya está en tu lista', 'var(--red)'); document.getElementById('dupWarning').style.display = 'block'; return; }
  document.getElementById('dupWarning').style.display = 'none';
  const ratingRaw = document.getElementById('editRating').value;
  const rating = ratingRaw ? parseFloat(ratingRaw) : (editTmdbDetail ? tmdbRating(editTmdbDetail) : null);
  let status = document.getElementById('editStatus').value;
  if (status === 'active') {
    const sVal = document.getElementById('pickerSeason').value;
    const eVal = document.getElementById('pickerEp').value;
    if (sVal) {
      const sNum = parseInt(sVal);
      const ns = [];
      for (let s = 1; s < sNum; s++) ns.push(`T${s}`);
      if (eVal === 'all' || !eVal) ns.push(`T${sNum}`);
      else ns.push(`T${sNum}E${eVal}`);
      editSeasons = ns;
    } else {
      editSeasons = [];
    }
  } else if (status === 'pending') {
    editSeasons = [];
  }
  if (editTmdbDetail && editSeasons.length) { const inf = inferStatus(editSeasons, editTmdbDetail, status); if (inf !== status) { status = inf; document.getElementById('editStatus').value = status; } }
  if (status === 'done' && editTmdbDetail && editTmdbDetail.seasons) {
    const realSeasons = editTmdbDetail.seasons.filter(s => s.season_number > 0 && s.episode_count > 0);
    editSeasons = realSeasons.map(s => `T${s.season_number}`);
  }
  let nextEp = null;
  if (status === 'waiting' && editTmdbDetail) {
    if (editTmdbDetail.seasons) {
      let maxSeasonToMark = 999;
      if (editTmdbDetail.next_episode_to_air) {
        maxSeasonToMark = editTmdbDetail.next_episode_to_air.season_number - 1;
      }
      const realSeasons = editTmdbDetail.seasons.filter(s => s.season_number > 0 && s.episode_count > 0 && s.season_number <= maxSeasonToMark);
      editSeasons = realSeasons.map(s => `T${s.season_number}`);
    }
    const ne = editTmdbDetail.next_episode_to_air;
    if (ne && ne.air_date) nextEp = `T${ne.season_number} (${fmtDate(ne.air_date)})`;
    else { const p = editSeasons.length ? parseEp(editSeasons[editSeasons.length - 1]) : null; nextEp = `T${p ? (p.s + 1) : 1}`; }
  }
  if (status === 'active') {
    if (editingId) {
      const ex = findShow(editingId);
      if (ex && ex.nextEp && JSON.stringify(ex.seasons) === JSON.stringify(editSeasons)) nextEp = ex.nextEp;
    }
    if (!nextEp) {
      if (editSeasons.length) {
        const last = editSeasons[editSeasons.length - 1];
        const p = parseEp(last);
        if (p && p.e === null) nextEp = `T${p.s + 1}E1`;
        else nextEp = last;
      } else {
        nextEp = 'T1E1';
        editSeasons = ['T1E1'];
      }
    }
  }
  if (editingId) {
    const cat = findCat(editingId);
    const idx = DB[cat].findIndex(s => s.id === editingId);
    const prev = DB[cat][idx];
    const finalSeasons = status === 'done' ? [...editSeasons] : [...editSeasons]; // editSeasons is already updated above
    const updated = { ...prev, title, rating, status, seasons: finalSeasons, nextEp };
    if (status === cat) DB[cat][idx] = updated;
    else { DB[cat].splice(idx, 1); DB[status].push(updated); }
  }
  else {
    const basic = editTmdbDetail ? {
      id: editTmdbDetail.id,
      poster_path: editTmdbDetail.poster_path,
      backdrop_path: editTmdbDetail.backdrop_path,
      overview: editTmdbDetail.overview,
      first_air_date: editTmdbDetail.first_air_date,
      number_of_seasons: editTmdbDetail.number_of_seasons,
      number_of_episodes: editTmdbDetail.number_of_episodes
    } : null;
    const newShow = { id: genId(), title, rating, status, seasons: [...editSeasons], nextEp, tmdb: basic };
    DB[status].push(newShow);
    if (!newShow.tmdb) tmdbSearch(title).then(t => { if (t) { newShow.tmdb = t; renderSections(); } });
  }
  await saveDB(); updateStats();
  if (currentView === 'discover') renderDiscover();
  else renderSections();
  closeEdit(); showToast(editingId ? '✅ Guardado' : '✅ Serie añadida');
}
async function deleteShow(id) {
  try {
    removeFromDB(id);
    await saveDB();
    updateStats();
    if (currentView === 'discover') renderDiscover(); else renderSections();
    closeModal();
    closeEdit();
    showToast('🗑 Eliminada');
  } catch (e) {
    alert("Error en deleteShow: " + e.message);
  }
}
let showToDelete = null;

function closeConfirmModal() {
  const overlay = document.getElementById('confirmOverlay');
  if (overlay) {
    overlay.classList.remove('open');
    setTimeout(() => overlay.style.display = 'none', 280);
  }
  showToDelete = null;
}

function confirmDelete(id) {
  showToDelete = id;
  const overlay = document.getElementById('confirmOverlay');
  if (overlay) {
    overlay.style.display = 'flex';
    setTimeout(() => overlay.classList.add('open'), 10);

    document.getElementById('confirmDeleteBtn').onclick = () => {
      if (showToDelete) {
        deleteShow(showToDelete);
      }
      closeConfirmModal();
    };
  }
}
function deleteCurrentShow() {
  if (editingId) confirmDelete(editingId);
}

// ── TMDB autocomplete ─────────────────────────────
document.getElementById('tmdbSearchInput').addEventListener('input', function () {
  clearTimeout(tmdbTimer); const q = this.value.trim(); const box = document.getElementById('tmdbResults');
  if (q.length < 2) { box.style.display = 'none'; return; }
  tmdbTimer = setTimeout(async () => {
    const res = await tmdbMulti(q); if (!res.length) { box.style.display = 'none'; return; }
    box.innerHTML = res.map(r => {
      const dup = isDuplicate(r.name, editingId, r.id); const safeN = r.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
      return `<div class="tmdb-result" onclick="${dup ? '' : 'selectTmdb(' + r.id + ',\'' + safeN + '\',\'' + r.poster_path + '\',\'' + r.first_air_date + '\',\'' + r.backdrop_path + '\')'}" style="${dup ? 'opacity:0.45;cursor:not-allowed' : ''}">
    ${r.poster_path ? `<img src="${IMG}${r.poster_path}" alt="">` : '<div style="width:30px;height:45px;background:var(--surface);border-radius:3px;display:flex;align-items:center;justify-content:center">📺</div>'}
    <div class="tmdb-result-info"><p>${r.name}${dup ? ' <span style="color:var(--red);font-size:0.65rem">(ya en lista)</span>' : ''}</p><span>${r.first_air_date ? r.first_air_date.slice(0, 4) : ''} ${r.vote_average ? '· ★' + r.vote_average.toFixed(1) : ''}</span></div>
  </div>`;
    }).join(''); box.style.display = 'block';
  }, 380);
});

async function selectTmdb(tmdbId, name, poster, date, backdrop) {
  if (isDuplicate(name, editingId, tmdbId)) { document.getElementById('dupWarning').style.display = 'block'; document.getElementById('editTitle').value = name; document.getElementById('tmdbResults').style.display = 'none'; document.getElementById('tmdbSearchInput').value = ''; showToast('⚠️ Esta serie ya está en tu lista', 'var(--red)'); return; }
  document.getElementById('dupWarning').style.display = 'none';
  document.getElementById('editTitle').value = name; document.getElementById('tmdbResults').style.display = 'none'; document.getElementById('tmdbSearchInput').value = '';
  document.getElementById('pickerLoading').style.display = 'flex'; document.getElementById('pickerMain').style.display = 'none'; showToast('⏳ Cargando datos...');
  try {
    const d = await tmdbDetail(tmdbId); editTmdbDetail = d;
    togglePickerGroup();
    if (d) { tmdbCache[name] = { id: tmdbId, poster_path: poster, backdrop_path: backdrop, name, first_air_date: date, overview: d.overview }; const r = tmdbRating(d); if (r) document.getElementById('editRating').value = r; }
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
document.getElementById('discoverSearchInput').addEventListener('input', handleDiscoverSearch);

function togglePickerGroup() {
  const statusEl = document.getElementById('editStatus');
  const waitingOpt = statusEl.querySelector('option[value="waiting"]');
  if (editTmdbDetail) {
    const isReturning = ['Returning Series', 'In Production', 'Planned'].includes(editTmdbDetail.status);
    const ne = editTmdbDetail.next_episode_to_air;

    // Valid waiting condition:
    // 1. Returning series but no episode announced yet
    // 2. Or, the next episode to air is the first episode of a season
    const isValidWaiting = (isReturning && !ne) || (ne && ne.episode_number === 1);

    if (isValidWaiting) {
      waitingOpt.disabled = false;
    } else {
      waitingOpt.disabled = true;
      if (statusEl.value === 'waiting') {
        statusEl.value = (ne && ne.episode_number > 1) ? 'active' : 'done';
      }
    }
  } else {
    waitingOpt.disabled = false;
  }
  const status = statusEl.value;
  document.getElementById('progressGroup').style.display = (status === 'active') ? 'block' : 'none';
}
document.getElementById('editStatus').addEventListener('change', togglePickerGroup);

// ── UTILS ──────────────────────────────────────────
let isInitializing = false;
async function init() {
  if (isInitializing) return;
  isInitializing = true;

  try {
    const saved = await loadDB();
    DB = saved || { active: [], waiting: [], pending: [], done: [] };
    const moved = checkAutoMove();
    if (moved) showToast(`📺 ${moved} serie${moved > 1 ? 's' : ''} pasada${moved > 1 ? 's' : ''} a "En curso"`);
    updateStats(); renderSections();

    // Sync TMDB data in background
    syncTMDBData();
  } finally {
    isInitializing = false;
  }
}

async function syncTMDBData() {
  let changesMade = false;
  for (const show of getAllShows()) {
    if (!show.tmdb) {
      const t = await tmdbSearch(show.title);
      if (t) { show.tmdb = t; changesMade = true; }
    }
    if (show.tmdb) {
      const d = await tmdbDetail(show.tmdb.id);
      if (d) {
        // 1. Update main rating
        const r = tmdbRating(d);
        if (show.rating !== r) { show.rating = r; changesMade = true; }

        // 2. Update TMDB metadata fields
        const fields = ['poster_path', 'backdrop_path', 'overview', 'first_air_date', 'number_of_seasons', 'number_of_episodes'];
        fields.forEach(f => {
          if (show.tmdb[f] !== d[f]) {
            show.tmdb[f] = d[f];
            changesMade = true;
          }
        });

        // 3. Auto-correct status/progression (only if not pending)
        if (show.status !== 'pending') {
          const c = await autoCorrectStatus(show, d);
          if (c) changesMade = true;
        }
      }
      await new Promise(res => setTimeout(res, 150));
    }
  }
  if (changesMade) { await saveDB(); updateStats(); renderSections(); }
}

setInterval(async () => {
  const n = checkAutoMove();
  if (n) { await saveDB(); updateStats(); renderSections(); showToast(`📺 ${n} serie${n > 1 ? 's' : ''} movida a "En curso"`); }
}, 3600000);

