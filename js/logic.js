// ── CORE ADVANCE LOGIC ────────────────────────────
async function computeAdvance(show, detail) {
  const seasons = [...(show.seasons || [])];
  const last = seasons.length ? seasons[seasons.length - 1] : null;
  const parsed = last ? parseEp(last) : null;

  const nextEpStr = show.nextEp || (parsed ? `T${parsed.s}E${parsed.e || 1}` : 'T1E1');
  const pNext = parseEp(nextEpStr) || { s: 1, e: 1 };
  const newSeason = pNext.s;
  const newEp = pNext.e || 1;

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

  const today = new Date().toLocaleDateString('en-CA');
  if (targetDate && targetDate > today) {
    return { error: `⚠️ El episodio T${newSeason}E${newEp} aún no se ha estrenado (estreno: ${fmtDate(targetDate)})` };
  }

  // Base history update (mark current episode as watched)
  let newSeasons = [...seasons];
  const epStr = `T${newSeason}E${newEp}`;
  if (!newSeasons.includes(epStr)) newSeasons.push(epStr);

  if (!isSeasonFinished) {
    const nextE = newEp + 1;
    const nextEpInfo = (seaDetail && seaDetail.episodes) ? seaDetail.episodes.find(e => e.episode_number === nextE) : null;
    const nextDate = nextEpInfo ? nextEpInfo.air_date : (ne && ne.season_number === newSeason && ne.episode_number === nextE ? ne.air_date : null);

    let newNextEp = `T${newSeason}E${nextE}`;
    if (nextDate && nextDate > today) newNextEp += ` (${fmtDate(nextDate)})`;
    
    return { newSeasons, newNextEp, newStatus: 'active', toastMsg: `✅ Marcado: T${newSeason}E${newEp}` };
  } else {
    // Current season is finished, mark the whole season as watched
    const lastStr = `T${newSeason}`;
    if (!newSeasons.includes(lastStr)) newSeasons.push(lastStr);

    const nextSeaNum = newSeason + 1;
    const nextSeaTmdb = tmdbSeasons.find(s => s.season_number === nextSeaNum);

    if (nextSeaTmdb) {
      let ep1Aired = true, ep1Date = null;
      if ((ne && ne.season_number === nextSeaNum && ne.episode_number === 1) || (nextSeaTmdb.air_date && nextSeaTmdb.air_date > today)) {
        ep1Aired = false;
        ep1Date = (ne && ne.season_number === nextSeaNum && ne.air_date) ? fmtDate(ne.air_date) : (nextSeaTmdb.air_date ? fmtDate(nextSeaTmdb.air_date) : null);
      }
      if (!ep1Aired) {
        const newNextEp = ep1Date ? `T${nextSeaNum} (${ep1Date})` : `T${nextSeaNum}`;
        return { newSeasons, newNextEp, newStatus: 'waiting', toastMsg: `⏳ T${newSeason} completada → esperando T${nextSeaNum}` };
      } else {
        let newNextEp = `T${nextSeaNum}E1`;
        if (ne && ne.season_number === nextSeaNum && ne.episode_number === 1 && ne.air_date && ne.air_date > today) {
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
      if (ne && ne.season_number === nextSeaNum && ne.air_date) newNextEp = `T${ne.season_number} (${fmtDate(ne.air_date)})`;
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

  let atEnd = curEp === null || (totalEps !== null && curEp >= totalEps);
  if (ne && ne.season_number === curSeason && ne.episode_number > (curEp || 0)) atEnd = false;

  if (!atEnd) return 'active';
  const nextSeaNum = curSeason + 1;
  const nextSeaTmdb = tmdbSeasons.find(s => s.season_number === nextSeaNum);
  const tmdbSt = detail.status;
  if (nextSeaTmdb) return 'waiting';
  const maxTmdbSeason = Math.max(...tmdbSeasons.map(s => s.season_number), 0);
  if (curSeason >= maxTmdbSeason && (tmdbSt === 'Ended' || tmdbSt === 'Canceled')) return 'done';
  return 'waiting';
}

async function autoCorrectStatus(show, detail) {
  if (!detail) return false;
  const tmdbSt = detail.status;
  const ne = detail.next_episode_to_air;
  const today = new Date().toLocaleDateString('en-CA');
  const tmdbSeasons = (detail.seasons || []).filter(s => s.season_number > 0 && s.episode_count > 0);

  // 1. Pending shows: update date if T1/ep date announced
  if (show.status === 'pending') {
    if (ne && ne.air_date) {
      const newNext = `T${ne.season_number}E${ne.episode_number} (${fmtDate(ne.air_date)})`;
      if (show.nextEp !== newNext) {
        show.nextEp = newNext;
        return true;
      }
    }
    return false;
  }

  // Determine user's progress from show.seasons
  const seasons = show.seasons || [];
  const last = seasons.length ? seasons[seasons.length - 1] : null;
  const parsed = last ? parseEp(last) : null;
  const curWatchedSeason = parsed ? parsed.s : 0;
  const curWatchedEp = parsed ? parsed.e : null;

  // 2. Case: Show is in 'done' ("Finalizadas")
  if (show.status === 'done') {
    if (tmdbSt !== 'Ended' && tmdbSt !== 'Canceled') {
      const maxTmdbSea = tmdbSeasons.length ? Math.max(...tmdbSeasons.map(s => s.season_number)) : 0;
      if (curWatchedSeason >= maxTmdbSea || tmdbSeasons.some(s => s.season_number > curWatchedSeason) || (ne && ne.season_number > curWatchedSeason)) {
        const nxt = (ne && ne.season_number > curWatchedSeason && ne.air_date) ? `T${ne.season_number} (${fmtDate(ne.air_date)})` : `T${curWatchedSeason + 1}`;
        moveTo(show, 'waiting', nxt);
        return true;
      }
    }
    return false;
  }

  // 3. Case: Show is in 'waiting' ("Esperando")
  if (show.status === 'waiting') {
    // If show officially ended or canceled in TMDB, move to done
    if (tmdbSt === 'Ended' || tmdbSt === 'Canceled') {
      show.seasons = tmdbSeasons.map(s => `T${s.season_number}`);
      moveTo(show, 'done', null);
      return true;
    }

    // Check if the next season or episode has started airing
    const targetSeason = curWatchedSeason === 0 ? 1 : curWatchedSeason + 1;
    const targetSeaTmdb = tmdbSeasons.find(s => s.season_number === targetSeason);
    const targetStarted = (targetSeaTmdb && targetSeaTmdb.air_date && targetSeaTmdb.air_date <= today) ||
      (ne && (ne.season_number > targetSeason || (ne.season_number === targetSeason && (ne.episode_number > 1 || (ne.episode_number === 1 && ne.air_date && ne.air_date <= today))))) ||
      (targetSeason === 1 && detail.first_air_date && detail.first_air_date <= today);

    if (targetStarted) {
      moveTo(show, 'active', `T${targetSeason}E1`);
      return true;
    }

    // Otherwise, still waiting: update upcoming date if announced
    const targetDate = (ne && ne.season_number === targetSeason && ne.air_date)
      ? ne.air_date
      : (targetSeaTmdb && targetSeaTmdb.air_date ? targetSeaTmdb.air_date : null);

    if (targetDate) {
      const newNext = `T${targetSeason} (${fmtDate(targetDate)})`;
      if (show.nextEp !== newNext) {
        show.nextEp = newNext;
        return true;
      }
    }
    return false;
  }

  // 4. Case: Show is in 'active' ("En curso")
  if (show.status === 'active') {
    let userSeason = 1;
    let userEp = 1;

    // Self-healing: Reconcile user's next episode from watched history
    // (Prevents TMDB's future broadcast episodes from skipping user's progress)
    const pNext = parseEp(show.nextEp);
    if (last && parsed) {
      if (parsed.e !== null) {
        userSeason = parsed.s;
        userEp = parsed.e + 1;
      } else {
        // Last was full season like 'T1'
        userSeason = parsed.s + 1;
        userEp = (pNext && pNext.s === userSeason && pNext.e) ? pNext.e : 1;
      }
    } else if (pNext) {
      userSeason = pNext.s;
      userEp = pNext.e || 1;
    }

    // Check if user has exceeded the season
    const curSeaTmdb = tmdbSeasons.find(s => s.season_number === userSeason);
    const totalEps = curSeaTmdb ? curSeaTmdb.episode_count : null;
    if (totalEps !== null && userEp > totalEps) {
      // Current season is completed
      const nextSeaTmdb = tmdbSeasons.find(s => s.season_number === userSeason + 1);
      if (!nextSeaTmdb) {
        if (tmdbSt === 'Ended' || tmdbSt === 'Canceled') {
          show.seasons = tmdbSeasons.map(s => `T${s.season_number}`);
          moveTo(show, 'done', null);
          return true;
        } else {
          moveTo(show, 'waiting', `T${userSeason + 1}`);
          return true;
        }
      } else {
        const ep1Aired = (!ne || ne.season_number > userSeason + 1 || (ne.season_number === userSeason + 1 && (ne.episode_number > 1 || (ne.episode_number === 1 && ne.air_date && ne.air_date <= today)))) || (nextSeaTmdb.air_date && nextSeaTmdb.air_date <= today);
        if (ep1Aired) {
          moveTo(show, 'active', `T${userSeason + 1}E1`);
          return true;
        } else {
          const ep1Date = ne && ne.season_number === userSeason + 1 && ne.air_date ? fmtDate(ne.air_date) : (nextSeaTmdb.air_date ? fmtDate(nextSeaTmdb.air_date) : null);
          const nxt = ep1Date ? `T${userSeason + 1} (${ep1Date})` : `T${userSeason + 1}`;
          moveTo(show, 'waiting', nxt);
          return true;
        }
      }
    }

    // Check if user's current episode has a future air date (only for the actual episode the user is on)
    let epDate = null;
    if (ne && ne.season_number === userSeason && ne.episode_number === userEp) {
      epDate = ne.air_date;
    }

    let expectedNextEp = `T${userSeason}E${userEp}`;
    if (epDate && epDate > today) {
      expectedNextEp += ` (${fmtDate(epDate)})`;
    }

    if (show.nextEp !== expectedNextEp) {
      show.nextEp = expectedNextEp;
      return true;
    }
  }

  return false;
}

function checkAutoMove() {
  const now = new Date(), ids = [];
  DB.waiting.forEach(s => {
    const d = parseDate(s.nextEp);
    if (d && d <= now) ids.push(s.id);
  });
  if (!ids.length) return { count: 0, shows: [] };
  const movedShows = [];
  ids.forEach(id => {
    const s = DB.waiting.find(x => String(x.id) === String(id));
    if (s) {
      s.status = 'active';
      const p = parseEp(s.nextEp);
      const sNum = p ? p.s : 1;
      s.nextEp = `T${sNum}E1`;
      DB.waiting = DB.waiting.filter(x => String(x.id) !== String(id));
      DB.active.push(s);
      movedShows.push(s);
    }
  });
  return { count: movedShows.length, shows: movedShows };
}
