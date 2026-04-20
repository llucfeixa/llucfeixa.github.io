// ── TMDB API CONFIG ──────────────────────────────
const TMDB_KEY = '__TMDB_KEY__';
const IMG = 'https://image.tmdb.org/t/p/w342';
const BG = 'https://image.tmdb.org/t/p/w780';
const LOGO_BASE = 'https://image.tmdb.org/t/p/w45';

// ── TMDB FUNCTIONS ───────────────────────────────
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

// ── UI COMPONENTS FROM API DATA ───────────────────
function buildPlatformBadge(detail) {
  if (!detail) return '';
  const wp = detail['watch/providers'];
  if (!wp || !wp.results) return '';
  const region = wp.results['ES'] || wp.results['US'] || wp.results['GB'] || null;
  if (!region) return '';

  const allProviders = [...(region.flatrate || []), ...(region.free || [])];
  if (!allProviders.length) return '';

  const uniqueProviders = [];
  const seen = new Set();
  for (const p of allProviders) {
    if (!seen.has(p.provider_id) && p.logo_path) {
      seen.add(p.provider_id);
      uniqueProviders.push(p);
    }
  }

  if (!uniqueProviders.length) return '';

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const allowedProviders = {
    'Netflix': {
      web: `https://www.netflix.com/`,
      app: `nflx://`
    },
    'Max': {
      web: `https://www.max.com/`,
      app: `max://`
    },
    'HBO Max': {
      web: `https://play.hbomax.com/`,
      app: `hbomax://`
    },
    'Disney Plus': {
      web: `https://www.disneyplus.com/es-es/`,
      app: `disneyplus://`
    },
    'Disney+': {
      web: `https://www.disneyplus.com/es-es/`,
      app: `disneyplus://`
    },
    'Amazon Prime Video': {
      web: `https://www.primevideo.com/`,
      app: `primevideo://`
    },
    'Movistar Plus+': {
      web: `https://ver.movistarplus.es/`,
      app: `movistarplus://`
    },
    'Movistar+': {
      web: `https://ver.movistarplus.es/`,
      app: `movistarplus://`
    }
  };

  const filteredProviders = uniqueProviders.filter(p => allowedProviders.hasOwnProperty(p.provider_name));
  if (!filteredProviders.length) return '';

  const badges = filteredProviders.map(prov => {
    const logoUrl = `${LOGO_BASE}${prov.logo_path}`;
    const name = prov.provider_name;
    const config = allowedProviders[name];
    const url = isMobile ? config.app : config.web;

    return `<a class="platform-badge" href="${url}" target="_blank" rel="noopener" title="Abrir ${name}">
<img src="${logoUrl}" alt="${name}">
<span>${name}</span>
</a>`;
  });

  return `<div style="display:flex;gap:0.6rem;flex-wrap:wrap;justify-content:center">${badges.join('')}</div>`;
}

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
