const fs = require('fs');
const path = require('path');

const baseDir = path.resolve(__dirname, '..', '..');
const jsonPath = path.join(baseDir, 'テストデータ', 'わくわく', 'viewer_analysis_20261013.json');
const csvPath = path.join(baseDir, 'テストデータ', 'わくわく', 'マッチングデータシーズン6-261013.csv');

const d13 = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

console.log('copyEvents count:', d13.copyEvents.length);
d13.copyEvents.forEach((ev, idx) => {
  const d = new Date(ev.t);
  const timeStr = d.toLocaleTimeString('ja-JP', { hour12: false });
  console.log(`[${idx + 1}] ${timeStr} - ${ev.n} (${ev.shopname || ev.s}) oppTier:${ev.opponentTier} myTier:${ev.viewerTier} predRank:${ev.predictedRank} inTop10:${ev.wasInTop10} slot:${ev.slotBucket}#${ev.slotRankAtPrediction} score:${ev.score?.toFixed(4)} slotScore:${ev.slotScore?.toFixed(4)}`);
});

const csv = fs.readFileSync(csvPath, 'utf8');
const lines = csv.trim().split(/\r?\n/).slice(1);
console.log('\nCSV records count:', lines.length);
const matches = lines.map(line => {
  const parts = line.split(',');
  return {
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

let hitCount = 0;
const hits = [];
matches.forEach((m, idx) => {
  const foundInCopy = d13.copyEvents.find(c => {
    return c.n === m.oppName || (c.n && m.oppName && (c.n.includes(m.oppName) || m.oppName.includes(c.n)));
  });
  if (foundInCopy) {
    hitCount++;
    hits.push({
      matchIdx: idx + 1,
      oppName: m.oppName,
      shop: m.shop,
      oppRank: m.oppRank,
      oppStar: m.oppStar,
      predRank: foundInCopy.predictedRank,
      inTop10: foundInCopy.wasInTop10,
      slot: `${foundInCopy.slotBucket}#${foundInCopy.slotRankAtPrediction}`,
      score: foundInCopy.score,
      slotScore: foundInCopy.slotScore
    });
    console.log(`Match #${String(idx+1).padStart(2, '0')} [HIT!]: ${m.oppName} (${m.shop}) [${m.oppRank} ${m.oppStar}] -> PredRank: #${foundInCopy.predictedRank} (inTop10: ${foundInCopy.wasInTop10}, slot: ${foundInCopy.slotBucket}#${foundInCopy.slotRankAtPrediction})`);
  } else {
    console.log(`Match #${String(idx+1).padStart(2, '0')} [---]: ${m.oppName} (${m.shop}) [${m.oppRank} ${m.oppStar}]`);
  }
});

console.log(`\nTotal matches: ${matches.length}, Copy hits: ${hitCount} (${(hitCount/matches.length*100).toFixed(1)}%)`);
