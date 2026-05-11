// ── TMDB API CONFIG ──────────────────────────────
const TMDB_KEY = (window.LOCAL_CONFIG && window.LOCAL_CONFIG.TMDB_KEY) || '__TMDB_KEY__';
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

async function tmdbTrending(page = 1) {
  try {
    const r = await fetch(`https://api.themoviedb.org/3/trending/tv/week?api_key=${TMDB_KEY}&language=es-ES&page=${page}`);
    const d = await r.json();
    return d.results || [];
  } catch (e) { return [] }
}

async function tmdbTopRated(page = 1) {
  try {
    const r = await fetch(`https://api.themoviedb.org/3/tv/top_rated?api_key=${TMDB_KEY}&language=es-ES&page=${page}`);
    const d = await r.json();
    return d.results || [];
  } catch (e) { return [] }
}

async function tmdbRecs(id) {
  try {
    const r = await fetch(`https://api.themoviedb.org/3/tv/${id}/recommendations?api_key=${TMDB_KEY}&language=es-ES`);
    const d = await r.json();
    return (d.results || []).slice(0, 10);
  } catch (e) { return [] }
}

async function tmdbGenres() {
  try {
    const r = await fetch(`https://api.themoviedb.org/3/genre/tv/list?api_key=${TMDB_KEY}&language=es-ES`);
    const d = await r.json();
    return d.genres || [];
  } catch (e) { return [] }
}

async function tmdbDiscoverByGenre(genreId, page = 1) {
  try {
    const r = await fetch(`https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_KEY}&language=es-ES&sort_by=popularity.desc&with_genres=${genreId}&page=${page}`);
    const d = await r.json();
    return d.results || [];
  } catch (e) { return [] }
}

async function tmdbVideos(id) {
  try {
    const r = await fetch(`https://api.themoviedb.org/3/tv/${id}/videos?api_key=${TMDB_KEY}&language=es-ES`);
    const d = await r.json();
    return d.results || [];
  } catch (e) { return [] }
}

async function tmdbCredits(id) {
  try {
    const r = await fetch(`https://api.themoviedb.org/3/tv/${id}/credits?api_key=${TMDB_KEY}&language=es-ES`);
    const d = await r.json();
    return d.cast || [];
  } catch (e) { return [] }
}

async function tmdbMulti(q, page = 1) {
  try {
    const r = await fetch(`https://api.themoviedb.org/3/search/tv?api_key=${TMDB_KEY}&query=${encodeURIComponent(q)}&language=es-ES&page=${page}`);
    const d = await r.json();
    return d.results || [];
  } catch (e) { return [] }
}

async function tmdbDetail(id) {
  if (!id) return null;
  if (tmdbDetailCache[id]) return tmdbDetailCache[id];
  try {
    const r = await fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${TMDB_KEY}&language=es-ES&append_to_response=watch%2Fproviders`);
    const d = await r.json(); tmdbDetailCache[id] = d; return d;
  } catch (e) { return null }
}

const tmdbSeasonCache = {};
async function tmdbSeason(showId, seasonNum) {
  const key = `${showId}_${seasonNum}`;
  if (tmdbSeasonCache[key]) return tmdbSeasonCache[key];
  try {
    const r = await fetch(`https://api.themoviedb.org/3/tv/${showId}/season/${seasonNum}?api_key=${TMDB_KEY}&language=es-ES`);
    const d = await r.json(); tmdbSeasonCache[key] = d; return d;
  } catch (e) { return null }
}

async function getShowDetail(show) {
  if (show.tmdb && show.tmdb.id) return await tmdbDetail(show.tmdb.id);
  const basic = await tmdbSearch(show.title);
  if (basic && basic.id) {
    show.tmdb = basic;
    return await tmdbDetail(basic.id);
  }
  return null;
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

  const allowedProviders = {
    'Netflix': `https://www.netflix.com/`,
    'HBO Max': `https://play.hbomax.com/`,
    'Max': `https://www.max.com/`,
    'Disney Plus': `https://www.disneyplus.com/es-es/`,
    'Amazon Prime Video': `https://www.primevideo.com/`,
    'Movistar Plus+': `https://ver.movistarplus.es/`,
    'Apple TV Plus': `https://tv.apple.com/`,
    'SkyShowtime': `https://www.skyshowtime.com/`
  };

  const filteredProviders = uniqueProviders.filter(p => allowedProviders.hasOwnProperty(p.provider_name));
  if (!filteredProviders.length) return '';

  const badges = filteredProviders.map(prov => {
    const logoUrl = `${LOGO_BASE}${prov.logo_path}`;
    const name = prov.provider_name;
    const url = allowedProviders[name];
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
    return `<div class="next-ep-tmdb">📡 <strong>T${ne.season_number}E${ne.episode_number}</strong>${d ? ` — <strong>${d}</strong>` : ''}${ne.name ? ` · "${ne.name}"` : ''}` + `</div>`;
  }
  if (show.status === 'waiting') {
    if (ne && ne.air_date) return `<div class="next-ep-tmdb">📅 T${ne.season_number} confirmada para <strong>${fmtDate(ne.air_date)}</strong></div>`;
    if (st === 'Ended' || st === 'Canceled') return `<div class="season-ended-info">🔚 TMDB indica que esta serie ha finalizado</div>`;
    return `<div class="season-ended-info">⏳ Sin fecha anunciada: <strong>${st || 'Desconocido'}</strong></div>`;
  }
  if (show.status === 'done') return `<div class="season-ended-info">✅ Serie finalizada · ${detail.number_of_seasons || ''} temporadas · ${detail.number_of_episodes || ''} episodios</div>`;
  return '';
}