// ── DISCOVER TAB ──────────────────────────────────
// TMDB browsing: trending/top-rated/genre rows, search, and card rendering
// for series not yet in the user's library.

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

  return `<div class="card" data-tmdb-id="${s.id}">
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
      const currentIds = new Set([...grid.querySelectorAll('.card')].map(el => el.dataset.tmdbId));
      const newHtml = filtered.filter(s => !currentIds.has(String(s.id))).map(s => renderDiscoverCard(s)).join('');
      grid.innerHTML += newHtml;
    }
  }
  searchHasMore = results.length >= 20;
  isSearchLoading = false;
}

