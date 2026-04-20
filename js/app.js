// ── STATE ─────────────────────────────────────────
let DB = { active: [], waiting: [], pending: [], done: [] };
let tmdbCache = {}, tmdbDetailCache = {};
let currentFilter = 'all', isGridView = true, currentView = 'my-series';
let editingId = null, editSeasons = [], editTmdbDetail = null, trendingCache = null;
let tmdbTimer = null, openModalId = null;

function getAllShows() { return [...DB.active, ...DB.waiting, ...DB.pending, ...DB.done] }
function findShow(id) { return getAllShows().find(s => s.id === id) }
function findCat(id) { for (const c of ['active', 'waiting', 'pending', 'done']) if (DB[c].find(s => s.id === id)) return c; return null }
function removeFromDB(id) { for (const c of ['active', 'waiting', 'pending', 'done']) DB[c] = DB[c].filter(s => s.id !== id) }
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

async function renderDiscover() {
  const grid = document.getElementById('discoverGrid');
  if (!grid) return;
  
  if (!trendingCache) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:4rem 2rem;color:var(--muted)"><div class="spinner" style="margin:0 auto 1rem"></div>Cargando recomendaciones...</div>';
    trendingCache = await tmdbTrending();
  }
  
  if (!trendingCache || !trendingCache.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:4rem 2rem;color:var(--muted)">No se pudieron cargar recomendaciones en este momento.</div>';
    return;
  }

  grid.innerHTML = trendingCache.map(s => {
    const poster = s.poster_path ? `${IMG}${s.poster_path}` : '';
    const rating = s.vote_average ? s.vote_average.toFixed(1) : '';
    const inList = getAllShows().some(x => x.tmdb && x.tmdb.id === s.id);
    const date = s.first_air_date ? s.first_air_date.slice(0, 4) : '';
    const safeTitle = s.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const safePoster = s.poster_path || '';
    const safeBackdrop = s.backdrop_path || '';

    return `<div class="card">
      <div class="card-poster" onclick="${inList ? `openModal('${getAllShows().find(x => x.tmdb && x.tmdb.id === s.id).id}')` : `discoverAdd(${s.id}, '${safeTitle}', '${safePoster}', '${date}', '${safeBackdrop}')`}">
        ${poster ? `<img src="${poster}" alt="${s.name}" loading="lazy">` : `<div class="card-poster-placeholder"><span>📺</span><p>${s.name}</p></div>`}
        ${rating ? `<div class="card-rating">★${rating}</div>` : ''}
        ${inList ? `<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(76,175,125,0.9);color:#000;font-size:0.65rem;font-weight:700;padding:4px;text-align:center">EN TU LISTA</div>` : 
        `<button class="card-next-btn" style="opacity:1" onclick="event.stopPropagation();discoverAdd(${s.id}, '${safeTitle}', '${safePoster}', '${date}', '${safeBackdrop}')">＋ Añadir a mi lista</button>`}
      </div>
      <div class="card-body">
        <div class="card-title">${s.name}</div>
        <div class="card-meta"><span class="card-ep">${date}</span></div>
      </div>
    </div>`;
  }).join('');
}

async function discoverAdd(tmdbId, name, poster, date, backdrop) {
  await openAdd();
  selectTmdb(tmdbId, name, poster, date, backdrop);
}

function updateStats() {
  const bar = document.getElementById('statsBar');
  if (!bar) return;
  bar.innerHTML = `
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
    document.getElementById('modalLinkWrap').innerHTML = buildPlatformBadge(detail);

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
  const tmdbId = editTmdbDetail ? editTmdbDetail.id : null;
  if (isDuplicate(title, editingId, tmdbId)) { showToast('⚠️ Esta serie ya está en tu lista', 'var(--red)'); document.getElementById('dupWarning').style.display = 'block'; return; }
  document.getElementById('dupWarning').style.display = 'none';
  const ratingRaw = document.getElementById('editRating').value;
  const rating = ratingRaw ? parseFloat(ratingRaw) : (editTmdbDetail ? tmdbRating(editTmdbDetail) : null);
  let status = document.getElementById('editStatus').value;
  if (editTmdbDetail && editSeasons.length) { const inf = inferStatus(editSeasons, editTmdbDetail, status); if (inf !== status) { status = inf; document.getElementById('editStatus').value = status; } }
  let nextEp = null;
  if (status === 'waiting' && editTmdbDetail) { const ne = editTmdbDetail.next_episode_to_air; if (ne && ne.air_date) nextEp = `T${ne.season_number} (${fmtDate(ne.air_date)})`; else { const p = editSeasons.length ? parseEp(editSeasons[editSeasons.length - 1]) : null; nextEp = `T${p ? (p.s + 1) : 1}`; } }
  if (status === 'active') { if (editingId) { const ex = findShow(editingId); if (ex && ex.nextEp && JSON.stringify(ex.seasons) === JSON.stringify(editSeasons)) nextEp = ex.nextEp; } if (!nextEp && editSeasons.length) { const last = editSeasons[editSeasons.length - 1]; const p = parseEp(last); if (p && p.e === null) nextEp = `T${p.s + 1}E1`; else nextEp = last; } }
  if (editingId) { const cat = findCat(editingId); const idx = DB[cat].findIndex(s => s.id === editingId); const prev = DB[cat][idx]; const updated = { ...prev, title, rating, status, seasons: [...editSeasons], nextEp }; if (status === cat) DB[cat][idx] = updated; else { DB[cat].splice(idx, 1); DB[status].push(updated); } }
  else { const basic = editTmdbDetail ? { id: editTmdbDetail.id, poster_path: editTmdbDetail.poster_path, backdrop_path: editTmdbDetail.backdrop_path, overview: editTmdbDetail.overview, first_air_date: editTmdbDetail.first_air_date } : null; const newShow = { id: genId(), title, rating, status, seasons: [...editSeasons], nextEp, tmdb: basic }; DB[status].push(newShow); if (!newShow.tmdb) tmdbSearch(title).then(t => { if (t) { newShow.tmdb = t; renderSections(); } }); }
  await saveDB(); updateStats(); 
  if (currentView === 'discover') renderDiscover();
  else renderSections();
  closeEdit(); showToast(editingId ? '✅ Guardado' : '✅ Serie añadida');
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

// ── INIT ──────────────────────────────────────────
async function init() {
  const saved = await loadDB();
  DB = saved || { active: [], waiting: [], pending: [], done: [] };
  const moved = checkAutoMove();
  if (moved) showToast(`📺 ${moved} serie${moved > 1 ? 's' : ''} pasada${moved > 1 ? 's' : ''} a "En curso"`);
  updateStats(); renderSections();

  let changesMade = false;
  for (const show of getAllShows()) {
    if (show.status === 'pending') continue;
    if (!show.tmdb) { const t = await tmdbSearch(show.title); if (t) { show.tmdb = t; changesMade = true; } }
    if (show.tmdb) {
      const d = await tmdbDetail(show.tmdb.id);
      if (d) {
        let r = tmdbRating(d); if (r && !show.rating) { show.rating = r; changesMade = true; }
        const c = await autoCorrectStatus(show, d); if (c) changesMade = true;
      }
      await new Promise(res => setTimeout(res, 150));
    }
  }
  if (changesMade) { await saveDB(); updateStats(); renderSections(); }
  setInterval(async () => { const n = checkAutoMove(); if (n) { await saveDB(); updateStats(); renderSections(); showToast(`📺 ${n} serie${n > 1 ? 's' : ''} movida a "En curso"`); } }, 3600000);
}
