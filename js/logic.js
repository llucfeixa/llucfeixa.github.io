// ── CORE ADVANCE LOGIC ────────────────────────────
async function computeAdvance(show, detail) {
  const seasons = [...(show.seasons || [])];
  const last = seasons.length ? seasons[seasons.length - 1] : null;
  const parsed = last ? parseEp(last) : null;

  const nextEpStr = show.nextEp || (parsed ? `T${parsed.s}E${parsed.e}` : 'T1E1');
  const pNext = parseEp(nextEpStr) || { s: 1, e: 1 };
  const newSeason = pNext.s;
  const newEp = pNext.e;

  const tmdbSeasons = (detail && detail.seasons || []).filter(s => s.season_number > 0 && s.episode_count > 0);
  const curSeaTmdb = tmdbSeasons.find(s => s.season_number === newSeason);
  const totalEps = curSeaTmdb ? curSeaTmdb.episode_count : null;
  const ne = detail ? detail.next_episode_to_air : null;
  const tmdbSt = detail ? detail.status : null;

  let isSeasonFinished = (totalEps !== null && newEp >= totalEps);
  if (ne && ne.season_number === newSeason && ne.episode_number > newEp) isSeasonFinished = false;

  const seaDetail = (detail && detail.id) ? await tmdbSeason(detail.id, newSeason) : null;
  const targetEpInfo = (seaDetail && seaDetail.episodes) ? seaDetail.episodes.find(e => e.episode_number === newEp) : null;
  const targetDate = targetEpInfo ? targetEpInfo.air_date : (ne && ne.season_number === newSeason && ne.episode_number === newEp ? ne.air_date : null);

  const today = new Date().toISOString().split('T')[0];
  if (targetDate && targetDate > today) {
    return { error: `⚠️ El episodio T${newSeason}E${newEp} aún no se ha estrenado (estreno: ${fmtDate(targetDate)})` };
  }

  if (!isSeasonFinished) {
    const nextE = newEp + 1;
    const nextEpInfo = (seaDetail && seaDetail.episodes) ? seaDetail.episodes.find(e => e.episode_number === nextE) : null;
    const nextDate = nextEpInfo ? nextEpInfo.air_date : (ne && ne.season_number === newSeason && ne.episode_number === nextE ? ne.air_date : null);

    let newNextEp = `T${newSeason}E${nextE}`;
    if (nextDate && nextDate >= today) newNextEp += ` (${fmtDate(nextDate)})`;
    
    let newSeasons = [...seasons];
    const epStr = `T${newSeason}E${newEp}`;
    if (!newSeasons.includes(epStr)) newSeasons.push(epStr);

    return { newSeasons, newNextEp, newStatus: 'active', toastMsg: `✅ Marcado: T${newSeason}E${newEp}` };
  } else {
    let newSeasons = [...seasons];
    const epStr = `T${newSeason}E${newEp}`;
    if (!newSeasons.includes(epStr)) newSeasons.push(epStr);
    const lastStr = `T${newSeason}`;
    if (!newSeasons.includes(lastStr)) newSeasons.push(lastStr);

    const nextSeaNum = newSeason + 1;
    const nextSeaTmdb = tmdbSeasons.find(s => s.season_number === nextSeaNum);

    if (nextSeaTmdb) {
      let ep1Aired = true, ep1Date = null;
      if (ne && ne.season_number === nextSeaNum && ne.episode_number === 1) {
        ep1Aired = false;
        ep1Date = ne.air_date ? fmtDate(ne.air_date) : null;
      }
      if (!ep1Aired) {
        const newNextEp = ep1Date ? `T${nextSeaNum} (${ep1Date})` : `T${nextSeaNum}`;
        return { newSeasons, newNextEp, newStatus: 'waiting', toastMsg: `⏳ T${newSeason} completada → esperando T${nextSeaNum}` };
      } else {
        let newNextEp = `T${nextSeaNum}E1`;
        if (ne && ne.season_number === nextSeaNum && ne.episode_number === 1 && ne.air_date && ne.air_date >= today) {
          newNextEp += ` (${fmtDate(ne.air_date)})`;
        }
        return { newSeasons, newNextEp, newStatus: 'active', toastMsg: `✅ T${newSeason} completada → T${nextSeaNum} disponible` };
      }
    } else {
      if (tmdbSt === 'Ended' || tmdbSt === 'Canceled') {
        const allSeasons = tmdbSeasons.map(s => `T${s.season_number}`);
        return { newSeasons: allSeasons, newNextEp: null, newStatus: 'done', toastMsg: `✅ Serie completada` };
      }
      let newNextEp = `T${nextSeaNum}`;
      if (ne && ne.air_date) newNextEp = `T${ne.season_number} (${fmtDate(ne.air_date)})`;
      return { newSeasons, newNextEp, newStatus: 'waiting', toastMsg: `⏳ T${newSeason} completada → esperando anuncios` };
    }
  }
}

function inferStatus(seaList, detail, manual) {
  if (!seaList.length) return manual;
  if (!detail) return manual;
  const last = seaList[seaList.length - 1];
  const parsed = parseEp(last);
  if (!parsed) return manual;
  const { s: curSeason, e: curEp } = parsed;
  const tmdbSeasons = (detail.seasons || []).filter(s => s.season_number > 0 && s.episode_count > 0);
  const curSeaTmdb = tmdbSeasons.find(s => s.season_number === curSeason);
  const totalEps = curSeaTmdb ? curSeaTmdb.episode_count : null;
  const ne = detail.next_episode_to_air;

  let atEnd = curEp === null;
  if (ne && ne.season_number === curSeason && ne.episode_number > (curEp || 0)) atEnd = false;

  if (!atEnd) return 'active';
  const nextSeaNum = curSeason + 1;
  const nextSeaTmdb = tmdbSeasons.find(s => s.season_number === nextSeaNum);
  const tmdbSt = detail.status;
  if (nextSeaTmdb) {
    if (ne && ne.season_number === nextSeaNum && ne.episode_number === 1) return 'waiting';
    return 'waiting';
  }
  if (tmdbSt === 'Ended' || tmdbSt === 'Canceled') return 'done';
  return 'waiting';
}

async function autoCorrectStatus(show, detail) {
  if (!detail || show.status === 'pending') return false;
  const tmdbSt = detail.status; const ne = detail.next_episode_to_air;

  if (show.status === 'done') {
    if (tmdbSt !== 'Ended' && tmdbSt !== 'Canceled') {
      const seasons = show.seasons || [];
      const last = seasons.length ? seasons[seasons.length - 1] : null;
      const parsed = last ? parseEp(last) : null;
      const curSeason = parsed ? parsed.s : 0;
      const tmdbSeasons = (detail.seasons || []).filter(s => s.season_number > 0 && s.episode_count > 0);
      if (tmdbSeasons.some(s => s.season_number > curSeason) || (ne && ne.season_number > curSeason)) {
        const nxt = ne && ne.air_date ? `T${ne.season_number} (${fmtDate(ne.air_date)})` : `T${curSeason + 1}`;
        moveTo(show, 'waiting', nxt); return true;
      }
    }
    return false;
  }

  if (show.status === 'waiting') {
    if (tmdbSt === 'Ended' || tmdbSt === 'Canceled') {
      const tmdbSeasons = (detail.seasons || []).filter(s => s.season_number > 0 && s.episode_count > 0);
      show.seasons = tmdbSeasons.map(s => `T${s.season_number}`);
      moveTo(show, 'done', null); return true;
    }
    const today = new Date().toISOString().split('T')[0];
    const tmdbSeasons = (detail.seasons || []).filter(s => s.season_number > 0 && s.episode_count > 0);
    const userSeasons = show.seasons || [];
    const lastStr = userSeasons.length ? userSeasons[userSeasons.length - 1] : null;
    const parsed = lastStr ? parseEp(lastStr) : null;
    const curSeason = parsed ? parsed.s : 0;
    
    const newAiredSeason = tmdbSeasons.find(s => s.season_number > curSeason && s.air_date && s.air_date <= today);
    const hasStarted = (ne && (ne.episode_number > 1 || (ne.episode_number === 1 && ne.air_date && ne.air_date <= today))) || newAiredSeason;
    
    if (hasStarted) {
      const startSeason = newAiredSeason ? newAiredSeason.season_number : (ne ? ne.season_number : curSeason + 1);
      const sData = tmdbSeasons.find(s => s.season_number === startSeason);
      const e1Date = sData && sData.air_date ? sData.air_date : null;
      if (ne && e1Date) {
        moveTo(show, 'active', `T${startSeason}E1 (${fmtDate(e1Date)})`); return true;
      } else {
        moveTo(show, 'active', `T${startSeason}E1`); return true;
      }
    }
    if (ne && ne.air_date) {
      const newNext = `T${ne.season_number} (${fmtDate(ne.air_date)})`;
      if (show.nextEp !== newNext) {
        show.nextEp = newNext;
        return true;
      }
    }
  }

  if (show.status === 'active') {
    const seasons = show.seasons || []; if (!seasons.length) return false;
    const last = seasons[seasons.length - 1]; const parsed = parseEp(last); if (!parsed) return false;
    const { s: curSeason, e: curEp } = parsed;
    const tmdbSeasons = (detail.seasons || []).filter(s => s.season_number > 0 && s.episode_count > 0);
    const curSeaTmdb = tmdbSeasons.find(s => s.season_number === curSeason);
    const totalEps = curSeaTmdb ? curSeaTmdb.episode_count : null;
    let atEnd = curEp === null;
    if (ne && ne.season_number === curSeason && ne.episode_number > (curEp || 0)) atEnd = false;

    if (atEnd) {
      const nextSeaTmdb = tmdbSeasons.find(s => s.season_number === curSeason + 1);
      if (!nextSeaTmdb) {
        if (tmdbSt === 'Ended' || tmdbSt === 'Canceled') {
          show.seasons = tmdbSeasons.map(s => `T${s.season_number}`);
          moveTo(show, 'done', null); return true;
        }
        const nxt = ne && ne.air_date ? `T${ne.season_number} (${fmtDate(ne.air_date)})` : `T${curSeason + 1}`;
        moveTo(show, 'waiting', nxt); return true;
      }
    }
  }
  return false;
}

function checkAutoMove() {
  const now = new Date(), ids = [];
  DB.waiting.forEach(s => { const d = parseDate(s.nextEp); if (d && d <= now) ids.push(s.id) });
  if (!ids.length) return 0;
  ids.forEach(id => { const s = DB.waiting.find(x => x.id === id); if (s) { s.status = 'active'; DB.waiting = DB.waiting.filter(x => x.id !== id); DB.active.push(s); } });
  return ids.length;
}
