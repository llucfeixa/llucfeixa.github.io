// ── ADD/EDIT MODAL ────────────────────────────────
// The add/edit show form, season/episode picker, TMDB autocomplete, and
// delete flow.

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
    else if (isAiring) can = (val !== 'done');
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
      if (eVal === 'all') {
        ns.push(`T${sNum}`);
        editSeasons = ns;
        const tmdbSeasons = (editTmdbDetail && editTmdbDetail.seasons || []).filter(s => s.season_number > 0 && s.episode_count > 0);
        const nextSeaTmdb = tmdbSeasons.find(s => s.season_number === sNum + 1);
        if (nextSeaTmdb) {
          nextEp = `T${sNum + 1}E1`;
        } else {
          const isEnded = editTmdbDetail && (editTmdbDetail.status === 'Ended' || editTmdbDetail.status === 'Canceled');
          if (isEnded) {
            status = 'done';
            nextEp = null;
          } else {
            status = 'waiting';
            nextEp = `T${sNum + 1}`;
          }
        }
      } else if (eVal) {
        const eNum = parseInt(eVal);
        if (eNum > 1) ns.push(`T${sNum}E${eNum - 1}`);
        editSeasons = ns;
        nextEp = `T${sNum}E${eNum}`;
      } else {
        editSeasons = ns;
        nextEp = `T${sNum}E1`;
      }
    } else {
      editSeasons = [];
      nextEp = 'T1E1';
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


function togglePickerGroup() {
  const statusEl = document.getElementById('editStatus');
  const waitingOpt = statusEl.querySelector('option[value="waiting"]');
  if (editTmdbDetail) {
    const tmdbSt = (editTmdbDetail.status || '').toLowerCase();
    const isEnded = tmdbSt.includes('end') || tmdbSt.includes('cancel');

    if (!isEnded) {
      waitingOpt.disabled = false;
    } else {
      waitingOpt.disabled = true;
      if (statusEl.value === 'waiting') {
        statusEl.value = 'done';
      }
    }
  } else {
    waitingOpt.disabled = false;
  }
  const status = statusEl.value;
  document.getElementById('progressGroup').style.display = (status === 'active') ? 'block' : 'none';
}
document.getElementById('editStatus').addEventListener('change', togglePickerGroup);

