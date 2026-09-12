// ── STATS ─────────────────────────────────────────
// The header stats bar and the dedicated Stats tab.

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

