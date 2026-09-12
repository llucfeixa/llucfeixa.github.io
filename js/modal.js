// ── DETAIL MODAL & CONFIRM MODAL ─────────────────
// The show detail modal, its recommendations carousel, the confirm dialog,
// and shared accessibility behavior (Escape-to-close, focus handling) for
// every overlay in the app.

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
  document.getElementById('modalBackdrop').alt = show.title ? `Imagen de fondo de ${show.title}` : '';
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

  // PRE-POPULATE from existing metadata to avoid flicker
  if (show.tmdb) {
    const t = show.tmdb;
    if (t.backdrop_path) document.getElementById('modalBackdrop').src = `${BG}${t.backdrop_path}`;
    if (t.overview) document.getElementById('modalOverview').textContent = t.overview;
    if (t.first_air_date) document.getElementById('modalYear').textContent = t.first_air_date.slice(0, 4);
    if (t.number_of_seasons) {
        document.getElementById('modalExtraInfo').textContent = `${t.number_of_seasons} temp. · ${t.number_of_episodes || '?'} eps.`;
    }
  }

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
      document.getElementById('modalNextEpVal').textContent = show.nextEp || '—';
      document.getElementById('modalNextEpBlock').style.display = show.status === 'active' ? 'block' : 'none';
      renderModalSeasons(show);
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


// ── ACCESSIBILITY: Escape-to-close + focus handling for all overlays ──
// Maps each overlay's id to its close function. Functions are wrapped in
// arrows so the actual identifiers (some, like closeLogin, live in
// storage.js which loads AFTER this file) are only looked up when called,
// not at script-parse time.
const OVERLAY_CLOSE_FNS = [
  ['confirmOverlay', () => closeConfirm()],
  ['settingsOverlay', () => closeSettings()],
  ['shareOverlay', () => closeShareModal()],
  ['editOverlay', () => closeEdit()],
  ['modalOverlay', () => closeModal()],
  ['loginOverlay', () => closeLogin()],
];

let lastFocusedEl = null;

function getOpenOverlayId() {
  for (const [id] of OVERLAY_CLOSE_FNS) {
    const el = document.getElementById(id);
    if (el && el.classList.contains('open')) return id;
  }
  return null;
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const openId = getOpenOverlayId();
  if (!openId) return;
  const entry = OVERLAY_CLOSE_FNS.find(([id]) => id === openId);
  if (entry) entry[1]();
});

// When any overlay opens, remember what had focus and move focus into the
// overlay's close/first focusable element; restore focus on close.
new MutationObserver(mutations => {
  for (const m of mutations) {
    const el = m.target;
    if (!(el instanceof HTMLElement) || !el.classList.contains('open')) continue;
    if (!OVERLAY_CLOSE_FNS.some(([id]) => id === el.id)) continue;
    lastFocusedEl = document.activeElement;
    const focusable = el.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable) setTimeout(() => focusable.focus(), 50);
  }
}).observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });

document.addEventListener('overlayclosed', () => {
  if (lastFocusedEl && typeof lastFocusedEl.focus === 'function') lastFocusedEl.focus();
  lastFocusedEl = null;
});

// Wrap each close function so it fires 'overlayclosed' for focus restoration,
// without altering any of the app's existing close behavior.
for (const [id, fn] of OVERLAY_CLOSE_FNS) {
  const idx = OVERLAY_CLOSE_FNS.findIndex(e => e[0] === id);
  const original = fn;
  OVERLAY_CLOSE_FNS[idx][1] = (...args) => {
    original(...args);
    document.dispatchEvent(new CustomEvent('overlayclosed'));
  };
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

