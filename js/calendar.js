// ── ESTRENOS (CALENDAR) TAB ──────────────────────

async function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  if (!grid) return;

  grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:4rem 2rem;color:var(--muted)"><div class="spinner" style="margin:0 auto 1rem"></div>Calculando estrenos...</div>';

  const relevantShows = [...DB.active, ...DB.waiting];
  const releases = [];

  // Use a map to track processed IDs to avoid duplicates if a show is in multiple categories
  const processedIds = new Set();

  let anyChange = false;
  for (const show of relevantShows) {
    if (processedIds.has(show.id)) continue;
    processedIds.add(show.id);

    const detail = await getShowDetail(show);
    if (detail) {
      // Sync metadata (dates, status) while we have the detail
      const corrected = await autoCorrectStatus(show, detail);
      if (corrected) anyChange = true;

      if (detail.next_episode_to_air) {
        const ne = detail.next_episode_to_air;
        releases.push({
          show,
          ep: ne,
          date: new Date(ne.air_date),
          airDateStr: ne.air_date
        });
      }
    }
  }

  if (anyChange) {
    await saveDB();
    updateStats();
    // No need to re-render everything here, just proceed to render the calendar grid
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

