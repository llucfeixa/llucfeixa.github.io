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
  const isFutureStart = isPending && show.nextEp && show.nextEp.includes('(') && parseDate(show.nextEp) > new Date();

  if (!isGridView) {
    return `<div class="list-card">
  <div class="list-thumb" onclick="openModal('${id}')">${poster ? `<img src="${poster}" alt="" loading="lazy">` : '📺'}</div>
  <div class="list-info" onclick="openModal('${id}')">
    <div class="list-title">${show.title}</div>
    <div class="list-sub">${show.nextEp ? `Pendiente: <strong>${show.nextEp}</strong>` : (show.status === 'done' ? `Visto: <strong>Completa</strong>` : `Visto: ${last || '—'}`)}</div>
  </div>
  <div class="list-right">
    <span class="badge ${cfg.badge}">${cfg.label}</span>
    <div class="list-actions">
      ${hasNext && !isPublicView ? `<button class="list-next-btn" onclick="event.stopPropagation();quickAdvance('${id}')">▶ Ya lo vi</button>` : ''}
      ${isPending && !isPublicView ? `<button class="list-next-btn" onclick="event.stopPropagation();startWatching('${id}')">▶ Empezar</button>` : ''}
      ${!isPublicView ? `
        <button class="list-action-btn" onclick="event.stopPropagation();openEdit('${id}')">✏️</button>
        <button class="list-action-btn del" onclick="event.stopPropagation();confirmDelete('${id}')">🗑</button>
      ` : ''}
    </div>
  </div>
</div>`;
  }
  const progress = calculateProgress(show);
  const backdrop = show.tmdb && show.tmdb.backdrop_path ? `${IMG}${show.tmdb.backdrop_path}` : poster;

  return `<div class="card">
<div class="card-poster" onclick="openModal('${id}')">
  ${poster ? `<img src="${poster}" alt="${show.title}" loading="lazy">` : `<div class="card-poster-placeholder"><span>📺</span><p>${show.title}</p></div>`}
  ${rating ? `<div class="card-rating">★${rating}</div>` : ''}
</div>
<div class="card-body" onclick="openModal('${id}')">
  <div class="card-title">${show.title}</div>
  <div class="card-meta"><span class="card-ep">${show.status === 'done' ? (last ? `${last}` : 'Completa') : (show.nextEp || last || 'Sin empezar')}</span><div class="card-status-dot" style="background:${cfg.dot}"></div></div>
  ${show.seasons && show.seasons.length ? `<div class="card-progress-bar"><div class="card-progress-bar-fill" style="width:${progress}%;background:var(--gold)"></div></div>` : ''}
</div>

<!-- NETFLIX HOVER POPOUT (PC ONLY) -->
<div class="card-hover-popout" onclick="openModal('${id}')">
  <div class="popout-backdrop">
    ${backdrop ? `<img src="${backdrop}" alt="" loading="lazy">` : ''}
  </div>
  <div class="popout-body">
    <div class="popout-title">${show.title}</div>
    <div class="popout-meta">
      <span style="color:var(--green); font-weight:700;">${rating ? rating * 10 + '% coincidencia' : 'Nuevo'}</span>
      <span>${show.seasons && show.seasons.length ? show.seasons.length + ' Temporadas' : 'Serie'}</span>
    </div>
    <div class="popout-tags">
      <span class="popout-tag">${cfg.label.replace(/^[^\s]+ /, '')}</span>
      ${show.nextEp ? `<span class="popout-tag" style="border-color:var(--gold); color:var(--gold)">${show.nextEp}</span>` : ''}
    </div>
  </div>
</div>

</div>`;
}

function calculateProgress(show) {
  if (show.status === 'done') return 100;
  if (!show.seasons || !show.seasons.length) return 0;
  if (!show.tmdb || !show.tmdb.number_of_episodes) return 0;

  const totalEps = show.tmdb.number_of_episodes;
  let watchedEps = 0;
  const tmdbSeasons = show.tmdb.seasons || [];

  // Agrupamos por temporada para no contar de más
  const perSeason = {};
  show.seasons.forEach(tag => {
    const p = parseEp(tag);
    if (!p) return;
    if (p.e === null) {
      perSeason[p.s] = 'all';
    } else {
      if (perSeason[p.s] !== 'all') {
        perSeason[p.s] = Math.max(perSeason[p.s] || 0, p.e);
      }
    }
  });

  Object.keys(perSeason).forEach(sNum => {
    const val = perSeason[sNum];
    const sInt = parseInt(sNum);
    const sInfo = tmdbSeasons.find(x => x.season_number === sInt);
    const count = sInfo ? sInfo.episode_count : 10;

    if (val === 'all') {
      watchedEps += count;
    } else {
      watchedEps += Math.max(0, val);
    }
  });

  let percent = (watchedEps / totalEps) * 100;
  return Math.min(98, percent);
}

let netflixCategory = null;
let savedScrollPos = 0;

function openCategoryView(cat) {
  if (cat !== null) {
    // Save scroll position before entering category
    savedScrollPos = window.scrollY;
  }

  netflixCategory = cat;
  currentFilter = cat || 'all';

  document.querySelectorAll('.filter-btn').forEach(b => {
    if (b.dataset.filter === currentFilter) b.classList.add('active');
    else b.classList.remove('active');
  });

  renderSections();

  if (cat !== null) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    window.scrollTo({ top: savedScrollPos, behavior: 'auto' });
  }
}

function updateNetflixArrows(scrollEl) {
  if (!scrollEl) return;
  const container = scrollEl.parentElement;
  const left = container.querySelector('.nav-left');
  const right = container.querySelector('.nav-right');
  if (!left || !right) return;

  const maxScroll = scrollEl.scrollWidth - scrollEl.clientWidth;
  left.style.display = scrollEl.scrollLeft > 20 ? 'flex' : 'none';
  right.style.display = (maxScroll > 30 && scrollEl.scrollLeft < maxScroll - 20) ? 'flex' : 'none';

  // Infinite Scroll Hook
  if (scrollEl.id === 'discoverTrendingGrid' && trendingHasMore && !isTrendingLoading) {
    if (scrollEl.scrollLeft + scrollEl.clientWidth > scrollEl.scrollWidth - 600) {
      loadMoreTrending();
    }
  }
  if (scrollEl.id === 'discoverTopGrid' && topRatedHasMore && !isTopRatedLoading) {
    if (scrollEl.scrollLeft + scrollEl.clientWidth > scrollEl.scrollWidth - 600) {
      loadMoreTopRated();
    }
  }

  // Genre row infinite scroll
  if (scrollEl.id.startsWith('discoverGenreGrid_')) {
    const gid = parseInt(scrollEl.id.split('_')[1]);
    const state = genreStates[gid];
    if (state && state.hasMore && !state.loading) {
      if (scrollEl.scrollLeft + scrollEl.clientWidth > scrollEl.scrollWidth - 600) {
        loadMoreGenreRow(gid);
      }
    }
  }
}

async function loadMoreGenreRow(gid) {
  const state = genreStates[gid];
  if (!state || state.loading || !state.hasMore) return;
  state.loading = true;
  state.page++;

  const res = await tmdbDiscoverByGenre(gid, state.page);
  if (res && res.length) {
    const grid = document.getElementById(`discoverGenreGrid_${gid}`);
    state.cache = [...state.cache, ...res];
    state.cache = [...new Map(state.cache.map(s => [s.id, s])).values()];
    if (grid) {
      const filtered = filterDiscoverResults(state.cache);
      grid.innerHTML = filtered.map(s => renderDiscoverCard(s)).join('');
      updateNetflixArrows(grid);
    }
  }
  state.hasMore = res && res.length >= 20;
  state.loading = false;
}

async function loadMoreTrending() {
  isTrendingLoading = true;
  trendingPage++;
  const res = await tmdbTrending(trendingPage);
  if (res && res.length) {
    const grid = document.getElementById('discoverTrendingGrid');
    trendingCache = [...trendingCache, ...res];
    trendingCache = [...new Map(trendingCache.map(s => [s.id, s])).values()];
    const filtered = filterDiscoverResults(trendingCache);
    grid.innerHTML = filtered.map(s => renderDiscoverCard(s)).join('');
    updateNetflixArrows(grid);
  }
  trendingHasMore = res && res.length >= 20;
  isTrendingLoading = false;
}

async function loadMoreTopRated() {
  isTopRatedLoading = true;
  topRatedPage++;
  const res = await tmdbTopRated(topRatedPage);
  if (res && res.length) {
    const grid = document.getElementById('discoverTopGrid');
    topRatedCache = [...topRatedCache, ...res];
    topRatedCache = [...new Map(topRatedCache.map(s => [s.id, s])).values()];
    const filtered = filterDiscoverResults(topRatedCache);
    grid.innerHTML = filtered.map(s => renderDiscoverCard(s)).join('');
    updateNetflixArrows(grid);
  }
  topRatedHasMore = res && res.length >= 20;
  isTopRatedLoading = false;
}

function scrollNetflixRow(btn, dir) {
  const scrollEl = btn.parentElement.querySelector('.netflix-scroll');
  if (!scrollEl) return;
  const amount = scrollEl.clientWidth * 0.8;
  scrollEl.scrollBy({ left: dir * amount, behavior: 'smooth' });
}

function initNetflixRows() {
  document.querySelectorAll('.rec-container .netflix-scroll').forEach(scrollEl => {
    // Re-check visibility always, but only add listener once
    if (!scrollEl.dataset.init) {
      scrollEl.dataset.init = "true";
      scrollEl.addEventListener('scroll', (e) => updateNetflixArrows(e.target));
    }
    updateNetflixArrows(scrollEl);
  });
  // Extra check after images/layout might have shifted
  setTimeout(() => {
    document.querySelectorAll('.rec-container .netflix-scroll').forEach(updateNetflixArrows);
  }, 400);
}

function renderSections() {
  const con = document.getElementById('sectionsContainer');
  if (!con) return;
  const q = (document.getElementById('searchInput') || {}).value || '';
  const searchQ = q.toLowerCase();

  const toggleBtn = document.getElementById('viewToggleBtn');
  if (toggleBtn) {
    if (!searchQ && !netflixCategory) {
      toggleBtn.style.display = 'none';
    } else {
      toggleBtn.style.display = 'inline-flex';
    }
  }

  // Apply list-view class only to the container if we are not in grid view
  if (!isGridView) con.classList.add('list-view'); else con.classList.remove('list-view');

  const ORDER = ['active', 'pending', 'waiting', 'done'];
  const cats = currentFilter === 'all' ? ORDER : [currentFilter];
  let html = '';

  if (searchQ || netflixCategory) {
    const renderCats = netflixCategory ? [netflixCategory] : cats;
    let found = false;
    for (const cat of renderCats) {
      let shows = (DB[cat] || []).filter(s => !searchQ || s.title.toLowerCase().includes(searchQ));
      if (!shows.length) continue;
      found = true;
      shows = sortedShows(cat, shows);
      const cfg = secCfg(cat);
      html += `<div class="section">
    <div class="section-header">
      ${netflixCategory ? `<button class="btn btn-ghost" style="padding:0.3rem 0.6rem; margin-right: 0.5rem;" onclick="openCategoryView(null)">← Volver</button>` : ''}
      <div class="section-dot ${cat === 'active' ? 'active-pulse' : ''}" style="background:${cfg.dot}"></div>
      <div class="section-title" style="color:${cfg.dot}">${cfg.label}</div>
      <span class="section-count">${shows.length}</span>
      <div class="section-line"></div>
    </div>
    <div class="grid">${shows.map(s => createCard(s)).join('')}</div>
  </div>`;
    }
    con.innerHTML = html || '<div class="no-results">🎬 No se encontraron series</div>';
    return;
  }

  // Netflix-style horizontal row view
  for (const cat of cats) {
    let shows = (DB[cat] || []);
    if (!shows.length) continue;
    shows = sortedShows(cat, shows);
    const cfg = secCfg(cat);

    // Save original view state to force grid cards for Netflix rows
    const wasGrid = isGridView;
    isGridView = true;
    const cardsHtml = shows.map(s => createCard(s)).join('');
    isGridView = wasGrid;

    html += `<div class="section" style="margin-bottom: 0.2rem;">
  <div class="section-header" style="cursor: pointer;" onclick="openCategoryView('${cat}')">
    <div class="section-dot ${cat === 'active' ? 'active-pulse' : ''}" style="background:${cfg.dot}"></div>
    <div class="section-title" style="color:${cfg.dot}; display: flex; align-items: center; gap: 0.3rem;">
      ${cfg.label} <span class="view-all-arrow" style="font-size: 1.2rem; color: var(--muted); margin-left: 0.2rem;">›</span>
    </div>
    <span class="section-count">${shows.length}</span>
    <div class="section-line"></div>
  </div>
  <div class="rec-container" style="margin-top: 0.5rem;">
    <button class="rec-nav nav-left" onclick="scrollNetflixRow(this, -1)" type="button" style="display:none;">‹</button>
    <div class="netflix-scroll">
      ${cardsHtml}
    </div>
    <button class="rec-nav nav-right" onclick="scrollNetflixRow(this, 1)" type="button" style="display:none;">›</button>
  </div>
</div>`;
  }

  con.innerHTML = html || '<div class="no-results">🎬 No se encontraron series</div>';
  setTimeout(initNetflixRows, 100);
}

function switchView(view) {
  if (view === 'my-series') netflixCategory = null;
  currentView = view;
  const myView = document.getElementById('mySeriesView');
  const discView = document.getElementById('discoverView');
  const calView = document.getElementById('calendarView');
  const myTab = document.getElementById('mySeriesTab');
  const discTab = document.getElementById('discoverTab');
  const calTab = document.getElementById('calendarTab');
  const friendsTab = document.getElementById('friendsTab');
  const friendsView = document.getElementById('friendsView');
  const statsTab = document.getElementById('statsTab');
  const statsView = document.getElementById('statsView');

  const views = [myView, discView, calView, friendsView, statsView];
  views.forEach(v => {
    if (v) {
      v.style.display = 'none';
      v.classList.remove('fade-in');
    }
  });

  myTab.classList.remove('active');
  discTab.classList.remove('active');
  calTab.classList.remove('active');
  if (statsTab) statsTab.classList.remove('active');
  friendsTab.classList.remove('active');

  let targetView = null;
  if (view === 'my-series') {
    targetView = myView;
    myTab.classList.add('active');
    renderSections();
    updateStats();
  } else if (view === 'discover') {
    targetView = discView;
    discTab.classList.add('active');
    renderDiscover();
  } else if (view === 'calendar') {
    targetView = calView;
    calTab.classList.add('active');
    renderCalendar();
  } else if (view === 'friends') {
    targetView = friendsView;
    friendsTab.classList.add('active');
    renderFriendsList();
  } else if (view === 'stats') {
    targetView = statsView;
    if (statsTab) statsTab.classList.add('active');
    renderStatsPage();
    updateStats();
  }

  // Always update stats/banner visibility on view switch
  updateStats();

  if (targetView) {
    targetView.style.display = 'block';
    targetView.classList.remove('fade-in');
    void targetView.offsetWidth; // Trigger reflow
    targetView.classList.add('fade-in');
  }
}

function getSkeletons(count = 6) {
  return Array(count).fill('<div class="skeleton-card"></div>').join('');
}

function filterDiscoverResults(results) {
  if (!hideInListState) return results;
  const myIds = new Set(getAllShows().filter(s => s.tmdb).map(s => String(s.tmdb.id)));
  return results.filter(s => !myIds.has(String(s.id)));
}

function toggleHideInList(checked) {
  hideInListState = checked;
  localStorage.setItem('hideInList', checked);
  renderDiscover();
}

async function renderDiscover() {
  const defContent = document.getElementById('discoverDefaultContent');
  const searchResults = document.getElementById('discoverSearchResults');
  const searchGrid = document.getElementById('discoverSearchGrid');
  const q = document.getElementById('discoverSearchInput').value.trim();
  const toggleBtn = document.getElementById('hideInListToggle');

  if (!defContent || !searchResults) return;
  if (toggleBtn) toggleBtn.checked = hideInListState;

  // 1. Handle Search Mode
  if (q) {
    defContent.style.display = 'none';
    searchResults.style.display = 'block';
    document.querySelector('#discoverSearchResults .section-title').textContent = 'Resultados de búsqueda';
    searchGrid.innerHTML = getSkeletons(12); // Use skeletons for search
    searchPage = 1;
    const results = await tmdbMulti(q, 1);
    const filtered = filterDiscoverResults(results);
    searchGrid.innerHTML = filtered.length ? filtered.map(s => renderDiscoverCard(s)).join('') : '<div style="grid-column:1/-1;text-align:center;padding:4rem 2rem;color:var(--muted)">No se encontraron series.</div>';
    searchHasMore = results.length >= 20;
    return;
  }

  // 2. Default Mode (Netflix Home Style)
  defContent.style.display = 'block';
  searchResults.style.display = 'none';

  // Render Shells for Trending/Top Rated if missing
  if (!document.getElementById('discoverTrendingGrid')) {
    defContent.innerHTML = `
      <div class="section">
        <div class="section-header">
          <div class="section-dot" style="background:var(--gold)"></div>
          <div class="section-title" style="color:var(--gold)">Tendencias de la semana</div>
          <div class="section-line"></div>
        </div>
        <div class="rec-container" style="margin-top:0.5rem">
          <button class="rec-nav nav-left" onclick="scrollNetflixRow(this, -1)" type="button" style="display:none;">‹</button>
          <div class="netflix-scroll" id="discoverTrendingGrid">${getSkeletons()}</div>
          <button class="rec-nav nav-right" onclick="scrollNetflixRow(this, 1)" type="button" style="display:none;">›</button>
        </div>
      </div>
      <div class="section" style="margin-top:2rem">
        <div class="section-header">
          <div class="section-dot" style="background:var(--purple)"></div>
          <div class="section-title" style="color:var(--purple)">Mejor valoradas</div>
          <div class="section-line"></div>
        </div>
        <div class="rec-container" style="margin-top:0.5rem">
          <button class="rec-nav nav-left" onclick="scrollNetflixRow(this, -1)" type="button" style="display:none;">‹</button>
          <div class="netflix-scroll" id="discoverTopGrid">${getSkeletons()}</div>
          <button class="rec-nav nav-right" onclick="scrollNetflixRow(this, 1)" type="button" style="display:none;">›</button>
        </div>
      </div>
    `;
  }

  // Populate Trending/Top Rated
  const trendingGrid = document.getElementById('discoverTrendingGrid');
  const topGrid = document.getElementById('discoverTopGrid');

  if (trendingGrid) {
    if (!trendingCache.length) trendingCache = await tmdbTrending(1);
    const filtered = filterDiscoverResults(trendingCache);
    trendingGrid.innerHTML = filtered.map(s => renderDiscoverCard(s)).join('');
    initNetflixRows();
  }
  if (topGrid) {
    if (!topRatedCache.length) topRatedCache = await tmdbTopRated(1);
    const filtered = filterDiscoverResults(topRatedCache);
    topGrid.innerHTML = filtered.map(s => renderDiscoverCard(s)).join('');
    initNetflixRows();
  }

  // Load Genres and setup Lazy Loading
  if (!genreCache) genreCache = await tmdbGenres();

  const colors = ['#4caf7d', '#5b9bd5', '#9b7ec8', '#f1c40f', '#e67e22', '#e74c3c'];

  // Setup Observer
  if (!rowObserver) {
    rowObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const gid = entry.target.dataset.genreId;
          if (gid) loadGenreRowData(gid);
          rowObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: '200px' });
  }

  for (const [i, g] of genreCache.entries()) {
    let grid = document.getElementById(`discoverGenreGrid_${g.id}`);
    if (!grid) {
      const color = colors[i % colors.length];
      const section = document.createElement('div');
      section.className = 'section row-lazy';
      section.style.marginTop = '2rem';
      section.dataset.genreId = g.id;
      section.innerHTML = `
        <div class="section-header">
          <div class="section-dot" style="background:${color}"></div>
          <div class="section-title" style="color:${color}">${g.name}</div>
          <div class="section-line"></div>
        </div>
        <div class="rec-container" style="margin-top:0.5rem">
          <button class="rec-nav nav-left" onclick="scrollNetflixRow(this, -1)" type="button" style="display:none;">‹</button>
          <div class="netflix-scroll" id="discoverGenreGrid_${g.id}">
            ${getSkeletons()}
          </div>
          <button class="rec-nav nav-right" onclick="scrollNetflixRow(this, 1)" type="button" style="display:none;">›</button>
        </div>
      `;
      defContent.appendChild(section);
      rowObserver.observe(section);
    } else {
      // If we have data cached, re-render it to apply filter
      const state = genreStates[g.id];
      if (state && state.cache.length) {
        const filtered = filterDiscoverResults(state.cache);
        grid.innerHTML = filtered.map(s => renderDiscoverCard(s)).join('');
        initNetflixRows();
      }
    }
  }
}

async function loadGenreRowData(gid) {
  const grid = document.getElementById(`discoverGenreGrid_${gid}`);
  if (!grid) return;

  if (!genreStates[gid]) {
    genreStates[gid] = { page: 1, cache: [], hasMore: true, loading: false };
    const res = await tmdbDiscoverByGenre(gid, 1);
    genreStates[gid].cache = res;
    genreStates[gid].hasMore = res.length >= 20;
  }

  const filtered = filterDiscoverResults(genreStates[gid].cache);
  grid.innerHTML = filtered.map(s => renderDiscoverCard(s)).join('');
  initNetflixRows();
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
  const backdrop = s.backdrop_path ? `${IMG}${s.backdrop_path}` : poster;

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
    
    <!-- NETFLIX HOVER POPOUT (PC ONLY) -->
    <div class="card-hover-popout" onclick="openModal('${s.id}', true)">
      <div class="popout-backdrop">
        ${backdrop ? `<img src="${backdrop}" alt="" loading="lazy">` : ''}
      </div>
      <div class="popout-body">
        <div class="popout-title">${s.name}</div>
        <div class="popout-meta">
          <span style="color:var(--green); font-weight:700;">${rating ? rating * 10 + '% coincidencia' : 'Nuevo'}</span>
          <span>Serie</span>
        </div>
        <div class="popout-tags">
          <span class="popout-tag">${date}</span>
          ${inList ? `<span class="popout-tag" style="border-color:var(--green); color:var(--green)">En tu lista</span>` : ''}
        </div>
      </div>
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
  if (!grid) return;

  grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:4rem 2rem;color:var(--muted)"><div class="spinner" style="margin:0 auto 1rem"></div>Calculando estrenos...</div>';

  const relevantShows = [...DB.active, ...DB.waiting];
  const releases = [];

  // Use a map to track processed IDs to avoid duplicates if a show is in multiple categories
  const processedIds = new Set();

  for (const show of relevantShows) {
    if (processedIds.has(show.id)) continue;
    processedIds.add(show.id);

    const detail = await getShowDetail(show);
    if (detail && detail.next_episode_to_air) {
      const ne = detail.next_episode_to_air;
      releases.push({
        show,
        ep: ne,
        date: new Date(ne.air_date),
        airDateStr: ne.air_date
      });
    }
  }

  // Sort by date (asc)
  releases.sort((a, b) => a.date - b.date);

  if (!releases.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:4rem 2rem;color:var(--muted)">No hay estrenos próximos programados para tus series.</div>';
    return;
  }



  grid.innerHTML = releases.map(r => {
    const d = r.date;
    const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    return `<div class="calendar-card">
      <div class="cal-date">
        <div class="cal-day">${d.getUTCDate()}</div>
        <div class="cal-month">${months[d.getUTCMonth()]}</div>
      </div>
      <div class="cal-info">
        <div class="cal-title">${r.show.title}</div>
        <div class="cal-ep">T${r.ep.season_number}E${r.ep.episode_number} · ${r.ep.name || 'Próximo episodio'}</div>
      </div>
      <button class="cal-btn" onclick="openModal('${r.show.id}')">Ver</button>
    </div>`;
  }).join('');
}

function updateStats() {
  const bar = document.getElementById('statsBar');
  if (!bar) return;

  if (isPublicView) {
    bar.style.display = ''; // Let CSS (Grid or Flex) handle it
    const urlParams = new URLSearchParams(window.location.search);
    const publicUid = urlParams.get('u');
    const isFollowing = userFollowing.includes(publicUid);
    const followBtnHtml = (currentUser && publicUid !== currentUser.uid) ?
      `<button class="btn ${isFollowing ? 'btn-ghost' : 'btn-primary'}" style="font-size:0.75rem;padding:0.4rem 0.8rem" onclick="toggleFollow('${publicUid}')">${isFollowing ? '✓ Siguiendo' : '+ Seguir'}</button>` : '';

    // Hide discover, calendar, friends and Add button in public view
    if (document.getElementById('discoverTab')) document.getElementById('discoverTab').style.display = 'none';
    if (document.getElementById('calendarTab')) document.getElementById('calendarTab').style.display = 'none';
    if (document.getElementById('friendsTab')) document.getElementById('friendsTab').style.display = 'none';
    if (document.getElementById('addBtn')) document.getElementById('addBtn').style.display = 'none';

    const viewLabel = currentView === 'stats' ? 'las stats' : 'la biblioteca';
    bar.innerHTML = `<div class="public-banner-wrap">
      <div class="public-banner-text">Estás viendo ${viewLabel} de <strong>${publicUserName}</strong></div>
      ${followBtnHtml}
      <button class="btn btn-primary" style="font-size:0.75rem;padding:0.4rem 0.8rem" onclick="window.location.href=window.location.pathname">Volver a mi lista</button>
    </div>`;

    // Hide share button in public view
    if (document.getElementById('headerShareBtn')) document.getElementById('headerShareBtn').style.display = 'none';
    return;
  }

  // Personal View: Only show stats summary in 'my-series' view
  if (currentView !== 'my-series') {
    bar.style.display = 'none';
    return;
  }
  bar.style.display = '';

  // Show Add button in my list
  if (document.getElementById('addBtn')) document.getElementById('addBtn').style.display = 'block';

  // Show all tabs and settings buttons if logged in
  if (currentUser) {
    if (document.getElementById('discoverTab')) document.getElementById('discoverTab').style.display = 'block';
    if (document.getElementById('calendarTab')) document.getElementById('calendarTab').style.display = 'block';
    if (document.getElementById('friendsTab')) document.getElementById('friendsTab').style.display = 'block';
    if (document.getElementById('settingsBtn')) document.getElementById('settingsBtn').style.display = 'block';

    const shareBtn = document.getElementById('headerShareBtn');
    if (!shareBtn) {
      const h = document.querySelector('.header');
      const btn = document.createElement('button');
      btn.id = 'headerShareBtn';
      btn.className = 'btn btn-ghost';
      btn.style = 'position:absolute;left:1.5rem;top:1.5rem;font-size:0.85rem;padding:0.5rem 1rem';
      btn.innerHTML = '🔗 Compartir';
      btn.onclick = openShareModal;
      h.appendChild(btn);
    } else {
      shareBtn.style.display = 'block';
    }
  } else {
    // Hide share button for guests
    if (document.getElementById('headerShareBtn')) document.getElementById('headerShareBtn').style.display = 'none';
    if (document.getElementById('settingsBtn')) document.getElementById('settingsBtn').style.display = 'none';
  }

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
function confirmDelete(id) {
  const show = findShow(id);
  if (!show) return;
  openConfirm(
    "¿Eliminar serie?",
    `¿Estás seguro de que quieres eliminar "${show.title}" de tu biblioteca?`,
    async () => {
      await deleteShow(id);
    },
    "Eliminar"
  );
}

function scrollRecs(dir) {
  const container = document.getElementById('modalRecommendations');
  if (container) {
    const scrollAmount = 400 * dir;
    container.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    // Visibility will be updated by the scroll listener
  }
}

function updateRecArrows() {
  const container = document.getElementById('modalRecommendations');
  const wrap = document.getElementById('modalRecommendationsWrap');
  if (!container || !wrap) return;

  const leftArrow = wrap.querySelector('.nav-left');
  const rightArrow = wrap.querySelector('.nav-right');
  if (!leftArrow || !rightArrow) return;

  const scrollLeft = container.scrollLeft;
  const scrollWidth = container.scrollWidth;
  const clientWidth = container.clientWidth;

  leftArrow.style.display = scrollLeft > 10 ? 'flex' : 'none';
  rightArrow.style.display = (scrollLeft + clientWidth < scrollWidth - 10) ? 'flex' : 'none';
}

async function fetchRecommendations(tmdbId) {
  const container = document.getElementById('modalRecommendations');
  if (!container) return;

  // Use skeletons while loading
  container.innerHTML = Array(6).fill('<div class="skeleton-card" style="width:140px; min-width:140px; height:210px"></div>').join('');

  try {
    const items = await tmdbRecs(tmdbId);

    if (!items.length) {
      container.innerHTML = '<p style="color:var(--muted);font-size:0.8rem;text-align:center;padding:1rem">No hay recomendaciones disponibles</p>';
      return;
    }

    // Apply the "Hide already added" filter if active
    const filtered = filterDiscoverResults(items);

    if (!filtered.length) {
      container.innerHTML = '<p style="color:var(--muted);font-size:0.8rem;text-align:center;padding:1rem">No hay nuevas recomendaciones</p>';
      return;
    }

    container.innerHTML = filtered.slice(0, 10).map(item => `
        <div class="rec-item" onclick="closeModal(); openModal(${item.id}, true)">
          <img src="${item.poster_path ? 'https://image.tmdb.org/t/p/w200' + item.poster_path : ''}" alt="${item.name}" loading="lazy">
          <div class="rec-title">${item.name}</div>
        </div>
      `).join('');

    container.onscroll = updateRecArrows;
    setTimeout(updateRecArrows, 100);
  } catch (e) {
    container.innerHTML = '';
  }
}

async function quickAdvance(id) {
  if (isPublicView) return; // Security: cannot advance in public view
  const show = findShow(id); if (!show) return;
  const detail = await getShowDetail(show);
  const res = await computeAdvance(show, detail);
  if (res.error) { showToast(res.error, 'var(--red)'); return; }
  const { newSeasons, newNextEp, newStatus, toastMsg } = res;
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
  const finishedSeasons = (show.seasons || []).filter(s => !s.includes('E'));
  const currentEp = show.nextEp ? show.nextEp.split(' ')[0] : null;
  let html = finishedSeasons.map(s => `<span class="season-pill done">${s}</span>`).join('');
  if (currentEp && show.status === 'active') {
    html += `<span class="season-pill current">${currentEp}</span>`;
  }
  document.getElementById('modalSeasons').innerHTML = html || '<span class="no-data">Sin progreso</span>';
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
  document.getElementById('modalPlatforms').innerHTML = '';
  document.getElementById('modalRecommendations').innerHTML = '';

  if (inList && !isPublicView) {
    document.getElementById('modalEditBtn').style.display = 'block';
    document.getElementById('modalAddBtn').style.display = 'none';
    document.getElementById('modalEditBtn').onclick = () => { closeModal(); openEdit(show.id) };
  } else if (!inList && !isPublicView) {
    document.getElementById('modalEditBtn').style.display = 'none';
    document.getElementById('modalAddBtn').style.display = 'block';
  } else {
    document.getElementById('modalEditBtn').style.display = 'none';
    document.getElementById('modalAddBtn').style.display = 'none';
  }

  renderModalSeasons(show);
  const hasNext = inList && show.status === 'active' && show.nextEp;
  const isPending = inList && show.status === 'pending';
  const nb = document.getElementById('modalNextEpBlock');
  const sb = document.getElementById('modalStartBlock');

  if (hasNext && !isPublicView) {
    nb.style.display = 'block';
    document.getElementById('modalNextEpVal').textContent = show.nextEp;
    document.getElementById('advanceBtn').onclick = () => advanceFromModal(show.id);
  } else nb.style.display = 'none';

  if (isPending && !isPublicView) {
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
        const title = detail.name;
        closeModal();
        openAdd(true);
        selectTmdb(detail.id, detail.name, detail.poster_path, detail.first_air_date, detail.backdrop_path);
        showToast(`✨ ¡${title} lista para añadir!`);
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

    // Recommendations
    fetchRecommendations(detail.id);

    // Cast with skeletons
    const castContainer = document.getElementById('modalCast');
    castContainer.innerHTML = Array(6).fill('<div class="skeleton-cast"></div>').join('');
    document.getElementById('modalCastWrap').style.display = 'block';

    tmdbCredits(detail.id).then(cast => {
      if (cast.length) {
        castContainer.innerHTML = cast.slice(0, 10).map(c => `
          <div class="cast-item">
            <img class="cast-img" src="${c.profile_path ? IMG + c.profile_path : ''}" alt="">
            <div class="cast-name">${c.name}</div>
          </div>`).join('');
      } else {
        document.getElementById('modalCastWrap').style.display = 'none';
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
  const res = await computeAdvance(show, detail);
  if (res.error) { showToast(res.error, 'var(--red)'); return; }
  const { newSeasons, newNextEp, newStatus, toastMsg } = res;
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
async function onPickerSeasonChange() {
  const sVal = document.getElementById('pickerSeason').value; if (!sVal) { resetEpSelect(); return; }
  const sNum = parseInt(sVal); const eSel = document.getElementById('pickerEp');
  eSel.innerHTML = '<option value="">⏳ Cargando episodios...</option>'; eSel.disabled = true;

  let epCount = 30;
  let seaDetail = null;
  if (editTmdbDetail) {
    const s = editTmdbDetail.seasons.find(x => x.season_number === sNum);
    if (s) epCount = s.episode_count;
    seaDetail = await tmdbSeason(editTmdbDetail.id, sNum);
  }

  eSel.innerHTML = '<option value="">— Episodio —</option><option value="all">✅ Temporada completa</option>';
  const today = new Date().toISOString().split('T')[0];

  for (let e = 1; e <= epCount; e++) {
    let isLocked = false;
    if (seaDetail && seaDetail.episodes) {
      // Regla Episodio 1: Si el primer capítulo no ha salido, no se puede seleccionar
      if (e === 1) {
        const current = seaDetail.episodes.find(x => x.episode_number === 1);
        if (current && current.air_date && current.air_date > today) isLocked = true;
      }

      const prev = seaDetail.episodes.find(x => x.episode_number === e - 1);
      if (prev && prev.air_date && prev.air_date > today) isLocked = true;

      // También bloqueamos si el propio episodio es muy lejano en el futuro
      const current = seaDetail.episodes.find(x => x.episode_number === e);
      if (current && e > 1) {
        const twoBack = seaDetail.episodes.find(x => x.episode_number === e - 2);
        if (twoBack && twoBack.air_date && twoBack.air_date > today) isLocked = true;
      }
    }
    const label = `Episodio ${e}${isLocked ? ' (No estrenado 🔒)' : ''}`;
    eSel.innerHTML += `<option value="${e}" ${isLocked ? 'disabled style="color:var(--muted)"' : ''}>${label}</option>`;
  }

  // Bloquear también "Temporada completa" si el último episodio no ha salido
  if (seaDetail && seaDetail.episodes && seaDetail.episodes.length) {
    const lastEp = seaDetail.episodes[seaDetail.episodes.length - 1];
    if (lastEp.air_date && lastEp.air_date > today) {
      const optAll = eSel.querySelector('option[value="all"]');
      if (optAll) { optAll.disabled = true; optAll.style.color = 'var(--muted)'; optAll.textContent += ' 🔒'; }
    }
  }

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

  // Escenarios basados en tus reglas:
  const tmdbStat = (editTmdbDetail && editTmdbDetail.status) ? editTmdbDetail.status.toLowerCase() : '';
  const ne = editTmdbDetail ? editTmdbDetail.next_episode_to_air : null;
  const isFutureEp1 = ne && ne.episode_number === 1 && parseDate(`T${ne.season_number}E${ne.episode_number} (${fmtDate(ne.air_date)})`) > new Date();

  const isEnded = tmdbStat.includes('end') || tmdbStat.includes('cancel');
  const isFuture = (!show.seasons || !show.seasons.length) && isFutureEp1;
  const isAiring = ne && !isFutureEp1;
  const isWaitingSeason = isFutureEp1 || (editTmdbDetail && !ne && !isEnded);

  const statusSelect = document.getElementById('editStatus');
  Array.from(statusSelect.options).forEach(opt => {
    const val = opt.value;
    let can = true;
    if (isFuture) can = (val === 'waiting');
    else if (isEnded) can = (val !== 'waiting');
    else if (isAiring) can = (val === 'active' || val === 'pending');
    else if (isWaitingSeason) can = (val !== 'done');

    opt.disabled = !can;
    opt.style.color = !can ? 'var(--muted)' : '';
  });

  if (statusSelect.selectedOptions[0].disabled) {
    if (isFuture) statusSelect.value = 'waiting';
    else if (isEnded) statusSelect.value = 'done';
    else if (isAiring) statusSelect.value = 'active';
    else statusSelect.value = 'waiting';
  }

  togglePickerGroup();
  document.getElementById('pickerLoading').style.display = 'none'; document.getElementById('pickerMain').style.display = 'block';
  await buildPickerOptions(editTmdbDetail);
  const nextToParse = show.nextEp ? show.nextEp.split(' ')[0] : null;
  const lastFromHist = editSeasons.length ? editSeasons[editSeasons.length - 1] : null;
  const p = parseEp(nextToParse || lastFromHist);
  if (p) {
    document.getElementById('pickerSeason').value = p.s;
    onPickerSeasonChange();
    if (p.e !== null) document.getElementById('pickerEp').value = p.e;
    else document.getElementById('pickerEp').value = 'all';
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
  let nextEp = null;

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
    nextEp = 'Sin empezar';
  } else if (status === 'waiting') {
    if (editSeasons.length === 0 && editTmdbDetail) {
      let maxMark = 999;
      const ne = editTmdbDetail.next_episode_to_air;
      if (ne) maxMark = ne.season_number - 1;
      const real = (editTmdbDetail.seasons || []).filter(s => s.season_number > 0 && s.episode_count > 0 && s.season_number <= maxMark);
      editSeasons = real.map(s => `T${s.season_number}`);
    }
    const ne = editTmdbDetail ? editTmdbDetail.next_episode_to_air : null;
    if (ne && ne.air_date) {
      nextEp = `T${ne.season_number} (${fmtDate(ne.air_date)})`;
    } else {
      const p = editSeasons.length ? parseEp(editSeasons[editSeasons.length - 1]) : null;
      if (!p) nextEp = 'T1';
      else nextEp = `T${p.s + 1}`;
    }
  } else if (status === 'done') {
    if (editTmdbDetail) {
      const real = (editTmdbDetail.seasons || []).filter(s => s.season_number > 0 && s.episode_count > 0);
      editSeasons = real.map(s => `T${s.season_number}`);
    }
    nextEp = null;
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

    // Añadir fecha si es hoy o futuro al guardar desde el editor
    if (nextEp && nextEp.includes('E')) {
      const p = parseEp(nextEp);
      if (p && editTmdbDetail) {
        const seaDetail = await tmdbSeason(editTmdbDetail.id, p.s);
        if (seaDetail && seaDetail.episodes) {
          const epInfo = seaDetail.episodes.find(x => x.episode_number === p.e);
          if (epInfo && epInfo.air_date) {
            const today = new Date().toISOString().split('T')[0];
            if (epInfo.air_date >= today) {
              nextEp = `T${p.s}E${p.e} (${fmtDate(epInfo.air_date)})`;
            }
          }
        }
      }
    }
  }
  if (editingId) {
    const cat = findCat(editingId);
    const idx = DB[cat].findIndex(s => s.id === editingId);
    const prev = DB[cat][idx];
    const finalSeasons = status === 'done' ? [...editSeasons] : [...editSeasons];
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
    ${r.poster_path ? `<img src="${IMG}${r.poster_path}" alt="" loading="lazy">` : '<div style="width:30px;height:45px;background:var(--surface);border-radius:3px;display:flex;align-items:center;justify-content:center">📺</div>'}
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
const searchInp = document.getElementById('searchInput');
if (searchInp) searchInp.addEventListener('input', () => renderSections());

document.querySelectorAll('.filter-btn').forEach(b => b.addEventListener('click', () => {
  const cat = b.dataset.filter === 'all' ? null : b.dataset.filter;
  openCategoryView(cat);
}));

const gridBtn = document.getElementById('gridViewBtn');
if (gridBtn) gridBtn.addEventListener('click', () => { isGridView = true; document.getElementById('gridViewBtn').classList.add('active'); document.getElementById('listViewBtn').classList.remove('active'); renderSections(); });

const listBtn = document.getElementById('listViewBtn');
if (listBtn) listBtn.addEventListener('click', () => { isGridView = false; document.getElementById('listViewBtn').classList.add('active'); document.getElementById('gridViewBtn').classList.remove('active'); renderSections(); });

const addBtn = document.getElementById('addBtn');
if (addBtn) addBtn.addEventListener('click', openAdd);
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
    const moved = (!isPublicView) ? checkAutoMove() : 0;
    if (moved) showToast(`📺 ${moved} serie${moved > 1 ? 's' : ''} pasada${moved > 1 ? 's' : ''} a "En curso"`);
    updateStats(); renderSections();

    // Sync TMDB data in background (only for own library)
    if (!isPublicView) syncTMDBData();
  } finally {
    isInitializing = false;
  }
}

function renderStatsPage() {
  const all = getAllShows();
  let totalEps = 0;
  let totalRating = 0;
  let ratedCount = 0;

  all.forEach(s => {
    const prog = calculateProgress(s);
    // Rough estimate of episodes watched based on progress
    const totalShowEps = s.tmdb ? s.tmdb.number_of_episodes : 0;
    totalEps += Math.round((prog / 100) * totalShowEps);

    if (s.rating) {
      totalRating += parseFloat(s.rating);
      ratedCount++;
    }
  });

  const totalMinutes = totalEps * 40; // Est. 40 mins per episode
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const mins = totalMinutes % 60;

  document.getElementById('statsTotalTime').textContent = `${days}d ${hours}h ${mins}m`;
  document.getElementById('statsTotalEps').textContent = totalEps;
  document.getElementById('statsAvgRating').textContent = ratedCount ? (totalRating / ratedCount).toFixed(1) : '—';
  document.getElementById('statsCompletedCount').textContent = DB.done.length;

  // Status Distribution List
  const dist = document.getElementById('statsStatusDist');
  const total = all.length || 1;

  const statusItems = [
    { label: 'En curso', count: DB.active.length, color: 'var(--blue)', icon: '📺' },
    { label: 'Esperando', count: DB.waiting.length, color: 'var(--purple)', icon: '⏳' },
    { label: 'Por ver', count: DB.pending.length, color: 'var(--muted)', icon: '🎯' },
    { label: 'Finalizadas', count: DB.done.length, color: 'var(--gold)', icon: '✅' }
  ];

  dist.innerHTML = statusItems.map(item => {
    const percent = (item.count / total) * 100;
    return `
      <div class="dist-row">
        <div class="dist-info">
          <span class="dist-icon">${item.icon}</span>
          <span class="dist-label">${item.label}</span>
          <span class="dist-count">${item.count}</span>
        </div>
        <div class="dist-bar-bg">
          <div class="dist-bar-fill" style="width:${percent}%; background:${item.color}"></div>
        </div>
      </div>
    `;
  }).join('');
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
        await saveDB(); 
        updateStats(); 
        renderSections(); 
      }
      await new Promise(res => setTimeout(res, 180));
    }
  }
}


setInterval(async () => {
  const n = checkAutoMove();
  if (n) { await saveDB(); updateStats(); renderSections(); showToast(`📺 ${n} serie${n > 1 ? 's' : ''} movida a "En curso"`); }
}, 3600000);

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

// ── CONFIRM MODAL ─────────────────────────────────
function openConfirm(title, msg, onOk, btnText = "Confirmar") {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').textContent = msg;
  const okBtn = document.getElementById('confirmOkBtn');
  okBtn.textContent = btnText;

  // Show/hide icon based on action
  const icon = document.getElementById('confirmIcon');
  if (icon) icon.style.display = (title.toLowerCase().includes('eliminar')) ? 'flex' : 'none';

  okBtn.onclick = () => {
    onOk();
    closeConfirm();
  };
  const overlay = document.getElementById('confirmOverlay');
  overlay.style.display = 'flex';
  setTimeout(() => overlay.classList.add('open'), 10);
}

function closeConfirm() {
  const overlay = document.getElementById('confirmOverlay');
  overlay.classList.remove('open');
  setTimeout(() => overlay.style.display = 'none', 300);
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

async function loadMoreSearch() {
  const q = document.getElementById('discoverSearchInput').value.trim();
  if (!q || isSearchLoading || !searchHasMore) return;

  isSearchLoading = true;
  searchPage++;
  const results = await tmdbMulti(q, searchPage);
  if (results && results.length) {
    const grid = document.getElementById('discoverSearchGrid');
    if (grid) {
      const filtered = filterDiscoverResults(results);
      const currentIds = new Set([...grid.querySelectorAll('.card-poster')].map(el => {
        const attr = el.getAttribute('onclick');
        const match = attr.match(/'(\d+)'/);
        return match ? match[1] : null;
      }));
      const newHtml = filtered.filter(s => !currentIds.has(String(s.id))).map(s => renderDiscoverCard(s)).join('');
      grid.innerHTML += newHtml;
    }
  }
  searchHasMore = results.length >= 20;
  isSearchLoading = false;
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
