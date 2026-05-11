// ── HELPERS & UTILS ────────────────────────────────
function genId() { return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) }

function showToast(m, color) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = m;
  t.style.borderLeftColor = color || 'var(--gold)';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

function parseDate(str) {
  if (!str) return null;
  const m = str.match(/\((\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\)/);
  if (!m) return null;
  const day = parseInt(m[1]), mon = parseInt(m[2]) - 1;
  const now = new Date();
  let yr = m[3] ? parseInt(m[3].length === 2 ? '20' + m[3] : m[3]) : now.getFullYear();
  
  // Bug fix: If year is omitted and date is more than 6 months in the past, it's likely for next year
  // (e.g. searching for Jan in Dec)
  if (!m[3]) {
    const d = new Date(yr, mon, day);
    if (now - d > 1000 * 60 * 60 * 24 * 180) yr++;
  }
  return new Date(yr, mon, day);
}

function fmtDate(str) {
  // Convert YYYY-MM-DD to DD/MM/YYYY
  if (!str || str.length < 10) return null;
  const [y, mo, d] = str.split('-'); return `${d}/${mo}/${y}`;
}

function parseEp(str) {
  if (!str) return null;
  const m = str.match(/T(\d+)(?:E(\d+))?/i);
  return m ? { s: parseInt(m[1]), e: m[2] ? parseInt(m[2]) : null } : null;
}

function tmdbDatePast(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr + 'T12:00:00');
  return d <= new Date();
}

// ── SORTING ───────────────────────────────────────
function sortedShows(cat, shows) {
  if (cat === 'waiting') {
    return [...shows].sort((a, b) => {
      const da = parseDate(a.nextEp), db = parseDate(b.nextEp);
      if (da && db) return da - db; if (da) return -1; if (db) return 1;
      return (b.rating || 0) - (a.rating || 0);
    });
  }
  return [...shows].sort((a, b) => (b.rating || 0) - (a.rating || 0));
}
