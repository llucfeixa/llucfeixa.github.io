// ── HORIZONTAL SCROLL & INFINITE LOADING ─────────
// Netflix-style horizontal row scrolling, arrow visibility, and the
// infinite-scroll loaders shared by "Mis Series" rows and Discover rows.

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

