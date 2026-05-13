// ── CORE ADVANCE LOGIC ────────────────────────────
async function computeAdvance(show, detail) {
  const seasons = [...(show.seasons || [])];
  const last = seasons.length ? seasons[seasons.length - 1] : null;
  const parsed = last ? parseEp(last) : null;

  const nextEpStr = show.nextEp || (parsed ? `T${parsed.s}E${parsed.e}` : 'T1E1');
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

  const today = new Date().toLocaleDateString('en-CA'); // Gets YYYY-MM-DD in local time
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
    if (nextDate && nextDate >= today) newNextEp += ` (${fmtDate(nextDate)})`;
    
    return { newSeasons, newNextEp, newStatus: 'active', toastMsg: `✅ Marcado: T${newSeason}E${newEp}` };
  } else {
    // Current season is finished, mark the whole season as watched
    const lastStr = `T${newSeason}`;
    if (!newSeasons.includes(lastStr)) newSeasons.push(lastStr);

    const nextSeaNum = newSeason + 1;
    const nextSeaTmdb = tmdbSeasons.find(s => s.season_number === nextSeaNum);

    if (nextSeaTmdb) {
      // Check if the first episode of the next season has aired
      const firstEpNext = await tmdbEpisode(detail.id, nextSeaNum, 1);
      const firstEpDate = firstEpNext ? firstEpNext.air_date : null;

      if (firstEpDate && firstEpDate <= today) {
        // Next season available
        return { newSeasons, newNextEp: `T${nextSeaNum}E1`, newStatus: 'active', toastMsg: `✅ T${newSeason} completada → T${nextSeaNum} disponible` };
      } else {
        // Next season announced but not aired yet
        let newNextEp = `T${nextSeaNum}`;
        if (firstEpDate) newNextEp += ` (${fmtDate(firstEpDate)})`;
        return { newSeasons, newNextEp, newStatus: 'waiting', toastMsg: `⏳ T${newSeason} completada → esperando T${nextSeaNum}` };
      }
    } else {
      // No next season in TMDB. If current season is the last one, mark as done
      const maxTmdbSeason = Math.max(...tmdbSeasons.map(s => s.season_number), 0);
      if (newSeason >= maxTmdbSeason && (!ne || ne.season_number <= newSeason)) {
        const allSeasons = tmdbSeasons.map(s => `T${s.season_number}`);
        return { newSeasons: allSeasons, newNextEp: null, newStatus: 'done', toastMsg: `✅ Serie completada` };
      }

      // Fallback to waiting if we think there might be more
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
  if (nextSeaTmdb) return 'waiting';
  const maxTmdbSeason = Math.max(...tmdbSeasons.map(s => s.season_number), 0);
  if (curSeason >= maxTmdbSeason && (!ne || ne.season_number <= curSeason)) return 'done';
  return 'waiting';
}

async function autoCorrectStatus(show, detail) {
  if (!detail) return false;
  const seasons = show.seasons || [];
  if (!seasons.length) return false;

  const last = seasons[seasons.length - 1];
  const parsed = parseEp(last);
  if (!parsed) return false;

  const { s: curSeason, e: curEp } = parsed;
  const tmdbSeasons = (detail.seasons || []).filter(s => s.season_number > 0 && s.episode_count > 0);
  const curSeaTmdb = tmdbSeasons.find(s => s.season_number === curSeason);
  const totalEps = curSeaTmdb ? curSeaTmdb.episode_count : null;
  const ne = detail.next_episode_to_air;
  const tmdbSt = detail.status;

  let atEnd = (totalEps !== null && (curEp === null || curEp >= totalEps));
  if (ne && ne.season_number === curSeason && ne.episode_number > (curEp || 0)) atEnd = false;

  const today = new Date().toLocaleDateString('en-CA');

  // Case 1: In 'waiting' but a new episode has aired -> move to 'active'
  if (show.status === 'waiting') {
    if (ne && ne.air_date && ne.air_date <= today) {
       // Check if nextEp was set to something that already aired
       moveTo(show, 'active', `T${ne.season_number}E${ne.episode_number}`);
       return true;
    }
    // Also check if current season has aired an episode that we haven't seen but isn't 'ne'
    // (e.g. season started but we haven't updated in weeks)
    const nextSeaNum = curSeason + 1;
    const nextSeaTmdb = tmdbSeasons.find(s => s.season_number === nextSeaNum);
    if (nextSeaTmdb) {
       const firstEpNext = await tmdbEpisode(detail.id, nextSeaNum, 1);
       if (firstEpNext && firstEpNext.air_date && firstEpNext.air_date <= today) {
          moveTo(show, 'active', `T${nextSeaNum}E1`);
          return true;
       }
    }
  }

  // Case 2: In 'active' but it's actually finished or waiting
  if (show.status === 'active' && atEnd) {
    const nextSeaNum = curSeason + 1;
    const nextSeaTmdb = tmdbSeasons.find(s => s.season_number === nextSeaNum);
    if (nextSeaTmdb) {
        const firstEpNext = await tmdbEpisode(detail.id, nextSeaNum, 1);
        const firstDate = firstEpNext ? firstEpNext.air_date : null;
        if (firstDate && firstDate <= today) {
            // Next season is already out, stay active and update nextEp
            const newNext = `T${nextSeaNum}E1`;
            if (show.nextEp !== newNext) { show.nextEp = newNext; return true; }
            return false;
        }
        const nxt = firstDate ? `T${nextSeaNum} (${fmtDate(firstDate)})` : `T${nextSeaNum}`;
        moveTo(show, 'waiting', nxt); return true;
    } else {
      const maxTmdbSeason = Math.max(...tmdbSeasons.map(s => s.season_number), 0);
      if (curSeason >= maxTmdbSeason && (!ne || ne.season_number <= curSeason)) {
        // Only move to done if we are not currently watching this season as 'active'
        // or if we have explicitly marked the last episode as seen.
        if (show.status === 'active' && show.nextEp && parseEp(show.nextEp).s === curSeason) {
           return false; // Stay active on the current season
        }
        moveTo(show, 'done', null); return true;
      }
      moveTo(show, 'waiting', `T${nextSeaNum}`); return true;
    }
  }

  // Case 3: In 'pending' but it actually started
  if (show.status === 'pending') {
    if (detail.first_air_date && detail.first_air_date <= today) {
       // This is handled by checkAutoMove but we can double check here
    }
  }

  // Case 4: Sync release date if missing or outdated (even if status doesn't change)
  if (!isPublicView && (show.status === 'waiting' || show.status === 'active' || show.status === 'pending')) {
    let newNextEp = null;
    if (ne && ne.air_date) {
      if (show.status === 'waiting' || show.status === 'pending') {
        newNextEp = `T${ne.season_number} (${fmtDate(ne.air_date)})`;
      } else if (show.status === 'active') {
        newNextEp = `T${ne.season_number}E${ne.episode_number} (${fmtDate(ne.air_date)})`;
      }
    }

    if (newNextEp && show.nextEp !== newNextEp) {
      // Check if we are just adding a date to the same episode/season
      const pOld = parseEp(show.nextEp);
      const pNew = parseEp(newNextEp);
      
      // If it's the same season/episode, just update the date
      if (pOld && pNew && pOld.s === pNew.s && pOld.e === pNew.e) {
        show.nextEp = newNextEp;
        return true;
      }
      
      // Special case for 'waiting' where show.nextEp might just be 'T2'
      if (show.status === 'waiting' && show.nextEp && !show.nextEp.includes('(')) {
          if (pOld && pNew && pOld.s === pNew.s) {
              show.nextEp = newNextEp;
              return true;
          }
      }
    }
  }

  // Case 5: Ensure active shows have episode number
  if (show.status === 'active' && show.nextEp && !show.nextEp.includes('E')) {
    const p = parseEp(show.nextEp);
    if (p && p.s) {
       show.nextEp = `T${p.s}E1`;
       return true;
    }
  }

  return false;
}

function moveTo(show, newStatus, nextEp) {
  const old = findCat(show.id);
  if (!old) return;
  DB[old] = DB[old].filter(s => s.id !== show.id);
  show.status = newStatus;
  show.nextEp = nextEp;
  DB[newStatus].push(show);
}

function checkAutoMove() {
  let count = 0;
  const today = new Date().toLocaleDateString('en-CA');

  ['waiting'].forEach(cat => {
    DB[cat].forEach(s => {
      let shouldMove = false;
      if (s.nextEp) {
        const m = s.nextEp.match(/\((.*?)\)/);
        if (m) {
          const d = parseDate(m[0]);
          if (d && d <= new Date()) shouldMove = true;
        }
      }
      
      if (shouldMove) {
        removeFromDB(s.id);
        s.status = 'active';
        // Clean nextEp from the date string for active status
        if (s.nextEp) {
          s.nextEp = s.nextEp.split(' (')[0];
          // If it only has the season (e.g. "T3"), append "E1"
          if (s.nextEp && !s.nextEp.includes('E')) s.nextEp += 'E1';
        }
        if (cat === 'pending' && !s.nextEp) s.nextEp = 'T1E1';
        DB.active.push(s);
        count++;
      }
    });
  });
  return count;
}
