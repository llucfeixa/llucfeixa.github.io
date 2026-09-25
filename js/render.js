// ── MY SERIES: RENDERING ─────────────────────────
// Card rendering, section/category rendering, and view switching for the
// "Mis Series" tab.

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
    <div class="list-sub">${show.nextEp ? `Pendiente: <strong>${show.nextEp}</strong>${relativeDaysLabel(show.nextEp) ? ` <span class="next-ep-countdown">${relativeDaysLabel(show.nextEp)}</span>` : ''}` : (show.status === 'done' ? `Visto: <strong>Completa</strong>` : `Visto: ${last || '—'}`)}</div>
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
  ${show.status !== 'done' && relativeDaysLabel(show.nextEp) ? `<span class="next-ep-countdown">${relativeDaysLabel(show.nextEp)}</span>` : ''}
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

  const tmdbSeasons = (show.tmdb.seasons || []).filter(s => s.season_number > 0);
  const totalEps = tmdbSeasons.reduce((sum, s) => sum + s.episode_count, 0) || show.tmdb.number_of_episodes;
  
  let watchedEps = 0;
  const perSeason = {};

  show.seasons.forEach(tag => {
    const p = parseEp(tag);
    if (!p || p.s === 0) return; // Ignore specials (Season 0)
    if (p.e === null) {
      perSeason[p.s] = 'all';
    } else {
      if (perSeason[p.s] !== 'all') {
        perSeason[p.s] = Math.max(perSeason[p.s] || 0, p.e);
      }
    }
  });

  Object.keys(perSeason).forEach(sNum => {
    const sInt = parseInt(sNum);
    const sInfo = tmdbSeasons.find(x => x.season_number === sInt);
    const val = perSeason[sNum];

    if (sInfo) {
      const count = sInfo.episode_count;
      if (val === 'all') watchedEps += count;
      else watchedEps += Math.min(count, Math.max(0, val));
    } else if (totalEps > 0) {
      // Fallback if we don't have per-season info yet
      if (val === 'all') watchedEps += 10; // Assume 10
      else watchedEps += Math.max(0, val);
    }
  });

  const percent = (watchedEps / totalEps) * 100;
  return Math.min(100, percent);
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


// Renders every "active" show that has a known upcoming air date, soonest
// first — inserted directly inside the "En emisión ahora" section rather
// than as a separate top-of-page widget.
function upcomingEpisodesHtml(shows) {
  const upcoming = (shows || [])
    .map(s => ({ show: s, date: parseDate(s.nextEp) }))
    .filter(x => x.date)
    .sort((a, b) => a.date - b.date);

  if (!upcoming.length) return '';

  return `<div class="upcoming-inline">
    ${upcoming.map(({ show }) => {
      const poster = show.tmdb && show.tmdb.poster_path ? `${IMG}${show.tmdb.poster_path}` : '';
      const rel = relativeDaysLabel(show.nextEp);
      return `<div class="upcoming-item" onclick="openModal('${show.id}')">
      <div class="upcoming-poster">${poster ? `<img src="${poster}" alt="" loading="lazy">` : '📺'}</div>
      <div class="upcoming-info">
        <div class="upcoming-show-title">${show.title}</div>
        <div class="upcoming-ep">${show.nextEp || ''}${rel ? ` · <span class="next-ep-countdown">${rel}</span>` : ''}</div>
      </div>
    </div>`;
    }).join('')}
  </div>`;
}

function renderSections() {
  const con = document.getElementById('sectionsContainer');
  if (!con) return;
  const q = (document.getElementById('searchInput') || {}).value || '';
  const searchQ = q.toLowerCase();

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
    ${cat === 'active' ? upcomingEpisodesHtml(shows) : ''}
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
  ${cat === 'active' ? upcomingEpisodesHtml(shows) : ''}
  <div class="rec-container" style="margin-top: 0.5rem;">
    <button class="rec-nav nav-left" onclick="scrollNetflixRow(this, -1)" type="button" style="display:none;">‹</button>
    <div class="netflix-scroll">
      ${cardsHtml}
    </div>
    <button class="rec-nav nav-right" onclick="scrollNetflixRow(this, 1)" type="button" style="display:none;">›</button>
  </div>
</div>`;
  }

  con.innerHTML = html || `<div class="empty-state">
    <span class="empty-state-icon">🎬</span>
    <p class="empty-state-title">Aún no has añadido series</p>
    <p class="empty-state-body">Explora el catálogo y empieza tu cineteca</p>
    <button class="btn btn-primary" onclick="switchView('discover')">Explorar series</button>
  </div>`;
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


async function quickAdvance(id) {
  if (isPublicView) return; // Security: cannot advance in public view
  const show = findShow(id); if (!show) return;
  const detail = await getShowDetail(show);
  const res = await computeAdvance(show, detail);
  if (res.error) { showToast(res.error, 'var(--red)'); return; }
  const { newSeasons, newNextEp, newStatus, toastMsg } = res;
  show.seasons = newSeasons; show.nextEp = newNextEp;
  if (newStatus !== show.status) { const old = findCat(id); DB[old] = DB[old].filter(s => String(s.id) !== String(id)); show.status = newStatus; DB[newStatus].push(show); }
  await saveDB(); updateStats(); renderSections(); showToast(toastMsg);
}

async function startWatching(id) {
  const show = findShow(id);
  if (!show) return;
  const old = findCat(id);
  DB[old] = DB[old].filter(s => s.id !== id);
  show.status = 'active';
  show.seasons = [];
  show.nextEp = 'T1E1';
  DB['active'].push(show);

  await saveDB();
  updateStats();
  renderSections();
  showToast('📺 ¡Empezamos! T1E1 añadido');
}

