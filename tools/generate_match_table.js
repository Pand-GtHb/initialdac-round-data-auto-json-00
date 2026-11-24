const fs = require('fs');
const path = require('path');

const baseDir = path.resolve(__dirname, '..', '..');
const jsonPath = path.join(baseDir, 'テストデータ', 'わくわく', 'viewer_analysis_20261013 (1).json');
const csvPath = path.join(baseDir, 'テストデータ', 'わくわく', 'マッチングデータシーズン6-261013.csv');

const logData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const candidateEvents = logData.candidateEvents || [];
const copyEvents = logData.copyEvents || [];

const csv = fs.readFileSync(csvPath, 'utf8');
const lines = csv.trim().split(/\r?\n/).slice(1);
const matches = lines.map((line, idx) => {
  const parts = line.split(',');
  return {
    matchIdx: idx + 1,
    season: parts[0],
    date: parts[1],
    no: parts[2],
    myRank: parts[3],
    myStar: parts[4],
    oppRank: parts[5],
    oppStar: parts[6],
    pref: parts[7],
    oppName: parts[8],
    shop: parts[9]
  };
});

function norm(str) {
  return String(str || '').trim().replace(/[\s　]+/g, '').normalize('NFKC');
}

// Map candidateEvents to matches
// CE count is 36. Notice CE#1 (13:50:14) and CE#2 (13:50:31) both before Match 1.
// Let's create an exact chronologic assignment.
console.log('Match | Time | Opponent | My Rank -> Opp Rank | Status | Top10 Rank | Slot & Rank | Global Score Rank | Slot Cap / Allocation');
console.log('---|---|---|---|---|---|---|---|---');

let top10Count = 0;
let poolCount = 0;
let outCount = 0;

matches.forEach((m, idx) => {
  const normOpp = norm(m.oppName);

  // Approximate CE index:
  // Usually CE #idx+1 or near it
  // Let's find CE where this match was closest in time
  const copy = copyEvents.find(c => norm(c.n) === normOpp || norm(c.n).includes(normOpp) || normOpp.includes(norm(c.n)));
  
  let targetCE = null;
  if (copy && copy.candidateEventId) {
    targetCE = candidateEvents.find(c => c.id === copy.candidateEventId || c.t === copy.candidateEventId);
  }
  if (!targetCE) {
    // Look for CE around index
    // For Match 1: CE 2 (13:50:31)
    // For Match 2: CE 3 (13:56:10)
    // For Match 3: CE 4 (14:06:02)
    // etc.
    const approxIdx = Math.min(candidateEvents.length - 1, idx + 1);
    targetCE = candidateEvents[approxIdx];
  }

  const ceTime = targetCE ? new Date(targetCE.t).toLocaleTimeString('ja-JP', { hour12: false }) : '--:--:--';
  const myTier = targetCE ? targetCE.viewerTier : '?';

  // Check in targetCE
  const topCand = targetCE ? (targetCE.candidates || []).find(c => norm(c.name) === normOpp || norm(c.name).includes(normOpp)) : null;
  const allCand = targetCE && targetCE.allCandidates ? targetCE.allCandidates.find(r => norm(r[1]) === normOpp || norm(r[1]).includes(normOpp)) : null;

  let status = '';
  let topRankStr = '-';
  let slotStr = '-';
  let globalRankStr = '-';
  let slotInfo = '';

  if (topCand) {
    top10Count++;
    poolCount++;
    status = '★ Top10的中';
    topRankStr = `#${topCand.displayRank || topCand.scoreRank}`;
    slotStr = `${topCand.slotBucket} #${topCand.slotRank}`;
    globalRankStr = `#${topCand.globalScoreRank || topCand.scoreRank}`;
    slotInfo = `表示枠内`;
  } else if (allCand) {
    poolCount++;
    status = '○ 候補プール内(選外)';
    slotStr = `${allCand[28]} #${allCand[29]}`;
    globalRankStr = `#${allCand[0]}`;
    const bucketPlan = targetCE && targetCE.slotPlan ? targetCE.slotPlan.find(s => s.bucket === allCand[28]) : null;
    const allocatedSlots = bucketPlan ? bucketPlan.slots : 0;
    slotInfo = `スロット枠=${allocatedSlots} (本人#${allCand[29]})`;
  } else {
    outCount++;
    status = '× 候補外';
    slotInfo = '母集団・フィルタ外';
  }

  console.log(`Match #${String(m.matchIdx).padStart(2, '0')} | ${ceTime} | ${m.oppName} | ${m.myRank}(${m.myStar}) vs ${m.oppRank}(${m.oppStar}) | ${status} | ${topRankStr} | ${slotStr} | ${globalRankStr} | ${slotInfo}`);
});

console.log(`\n集計: 総数=${matches.length}, Top10的中=${top10Count} (${(top10Count/matches.length*100).toFixed(1)}%), 候補プール内=${poolCount} (${(poolCount/matches.length*100).toFixed(1)}%), 候補外=${outCount} (${(outCount/matches.length*100).toFixed(1)}%)`);
