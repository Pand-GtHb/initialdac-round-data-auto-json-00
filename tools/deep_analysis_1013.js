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

console.log(`Matches: ${matches.length}, CandidateEvents: ${candidateEvents.length}, CopyEvents: ${copyEvents.length}`);

// Helper to normalize names for loose matching
function norm(str) {
  return String(str || '').trim().replace(/[\s　]+/g, '').normalize('NFKC');
}

// Map each match to its candidate event
// Match time can be inferred from copyEvents or candidateEvent timestamps
// Let's first inspect copyEvent timestamps and candidateEvent timestamps
const results = [];

// Match candidateEvents to matches by index / time
// CandidateEvents count: 36
// Notice #1 is 13:50:14, #2 is 13:50:31 (two prediction clicks right before Match 1)
// Let's inspect which candidate event corresponds to which match
for (let mIdx = 0; mIdx < matches.length; mIdx++) {
  const m = matches[mIdx];
  const normOppName = norm(m.oppName);

  // Find corresponding copyEvent if any
  const copy = copyEvents.find(c => norm(c.n) === normOppName || norm(c.n).includes(normOppName) || normOppName.includes(norm(c.n)));

  // Find candidateEvent by candidateEventId from copyEvent if available, or by index mapping
  let matchedCE = null;
  if (copy && copy.candidateEventId) {
    matchedCE = candidateEvents.find(ce => ce.id === copy.candidateEventId || ce.t === copy.candidateEventId);
  }

  // If not found by copy, search across all candidateEvents in chronological progression
  // We will also check every candidateEvent to see if oppName appears in candidates or allCandidates
  const appearances = [];
  candidateEvents.forEach((ce, ceIdx) => {
    const tStr = new Date(ce.t).toLocaleTimeString('ja-JP', { hour12: false });
    // Check in Top10 candidates
    const inTop = (ce.candidates || []).find(c => norm(c.name) === normOppName || norm(c.name).includes(normOppName));
    
    // Check in allCandidates
    let inAll = null;
    if (ce.allCandidates) {
      inAll = ce.allCandidates.find(row => {
        const name = row[1];
        return norm(name) === normOppName || norm(name).includes(normOppName);
      });
    }

    if (inTop || inAll) {
      appearances.push({
        ceIdx: ceIdx + 1,
        time: tStr,
        inTop: inTop ? {
          rank: inTop.displayRank || inTop.scoreRank,
          slot: `${inTop.slotBucket}#${inTop.slotRank}`,
          score: inTop.score
        } : null,
        inAll: inAll ? {
          globalRank: inAll[0],
          slot: `${inAll[28]}#${inAll[29]}`,
          score: inAll[5],
          slotScore: inAll[27],
          wasDisplayed: inAll[6] === 1,
          displayRank: inAll[7]
        } : null
      });
    }
  });

  results.push({
    match: m,
    copyEvent: copy,
    appearances
  });
}

// Print detailed report
console.log('\n================================================================================');
console.log('                 INITIAL D THE ARCADE - 2026/10/13 実戦35戦 厳密予測照合');
console.log('================================================================================');

let top10HitCount = 0;
let candidatePoolHitCount = 0;
let completelyMissingCount = 0;

results.forEach(r => {
  const m = r.match;
  const copy = r.copyEvent;
  const apps = r.appearances;

  let status = 'MISSED';
  let detailStr = '';

  // Look for appearance closest to match time or corresponding to copy
  let relevantApp = null;
  if (copy && copy.candidateEventId) {
    const ce = candidateEvents.find(c => c.id === copy.candidateEventId || c.t === copy.candidateEventId);
    if (ce) {
      const ceIdx = candidateEvents.indexOf(ce) + 1;
      relevantApp = apps.find(a => a.ceIdx === ceIdx);
    }
  }
  if (!relevantApp && apps.length > 0) {
    relevantApp = apps[0]; // fallback
  }

  if (relevantApp) {
    if (relevantApp.inTop) {
      status = '★ TOP10 HIT';
      top10HitCount++;
      candidatePoolHitCount++;
      detailStr = `Top10 #${relevantApp.inTop.rank} (${relevantApp.inTop.slot})`;
    } else if (relevantApp.inAll) {
      status = '○ POOL HIT (選外)';
      candidatePoolHitCount++;
      detailStr = `AllCandidates #${relevantApp.inAll.globalRank} (${relevantApp.inAll.slot})`;
    }
  } else {
    completelyMissingCount++;
    status = '× 候補外(未出現)';
    detailStr = '候補プール内に存在せず';
  }

  const copyStr = copy ? `[COPIED: ${copy.scoreSource || 'manual'}]` : '[NOT COPIED]';
  console.log(`Match #${String(m.matchIdx).padStart(2, '0')}: [${status.padEnd(16, ' ')}] ${m.oppName.padEnd(10, ' ')} (${m.oppRank} ${m.oppStar}) | ${detailStr.padEnd(35, ' ')} | ${copyStr}`);
});

console.log('\n================================================================================');
console.log('                             集計サマリー');
console.log('================================================================================');
console.log(`総対戦数: ${matches.length}`);
console.log(`★ Top 10 表示枠的中: ${top10HitCount} 件 (${(top10HitCount / matches.length * 100).toFixed(1)}%)`);
console.log(`○ 候補プール内存在(スロット選外含む): ${candidatePoolHitCount} 件 (${(candidatePoolHitCount / matches.length * 100).toFixed(1)}%)`);
console.log(`× 候補プール外(未出現): ${completelyMissingCount} 件 (${(completelyMissingCount / matches.length * 100).toFixed(1)}%)`);
console.log(`ユーザー様コピー操作数: ${copyEvents.length} 件`);
