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

console.log('=== MATCH TIMELINE MAPPING ===');

matches.forEach(m => {
  const normOpp = norm(m.oppName);
  
  // Find all appearances in candidateEvents
  const inEvents = [];
  candidateEvents.forEach((ce, ceIdx) => {
    const tStr = new Date(ce.t).toLocaleTimeString('ja-JP', { hour12: false });
    const topIdx = (ce.candidates || []).findIndex(c => norm(c.name) === normOpp || norm(c.name).includes(normOpp));
    const allRow = (ce.allCandidates || []).find(r => norm(r[1]) === normOpp || norm(r[1]).includes(normOpp));
    
    if (topIdx !== -1 || allRow) {
      inEvents.push({
        ceIdx: ceIdx + 1,
        time: tStr,
        topRank: topIdx !== -1 ? topIdx + 1 : null,
        topSlot: topIdx !== -1 ? `${ce.candidates[topIdx].slotBucket}#${ce.candidates[topIdx].slotRank}` : null,
        allRank: allRow ? allRow[0] : null,
        allSlot: allRow ? `${allRow[28]}#${allRow[29]}` : null,
        slotCap: allRow && ce.slotPlan ? (ce.slotPlan.find(s => s.bucket === allRow[28])?.slots ?? 0) : null
      });
    }
  });

  console.log(`\n------------------------------------------------------------`);
  console.log(`Match #${String(m.matchIdx).padStart(2, '0')}: ${m.oppName} [${m.oppRank} ${m.oppStar}] (${m.shop})`);
  console.log(`My Rank at play: ${m.myRank} ${m.myStar}`);
  if (inEvents.length === 0) {
    console.log(`  => 全36回の予測ログ中に一度も出現せず (完全候補外)`);
  } else {
    console.log(`  => 出現回数: ${inEvents.length}回`);
    inEvents.forEach(e => {
      const topStr = e.topRank ? `★Top10 #${e.topRank} (${e.topSlot})` : `Top10外`;
      const allStr = e.allRank ? `All #${e.allRank} (${e.allSlot}, スロット枠=${e.slotCap})` : `All外`;
      console.log(`     CE #${String(e.ceIdx).padStart(2, '0')} (${e.time}): ${topStr} | ${allStr}`);
    });
  }
});
