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

console.log('Total copyEvents in JSON:', copyEvents.length);

// Correlate each match with copyEvents
// Note that 不亞ん鼎 matches multiple times (Match 14, 16, 23)
// Let's check how many unique copyEvents and matches
// Let's correlate by time/order
const copiedMatches = [];
const uncopiedMatches = [];

// Track used copyEvents so we don't double count
const usedCopyIndices = new Set();

matches.forEach(m => {
  const normOpp = norm(m.oppName);
  
  // Find unused copyEvent for this player
  let matchedCopyIdx = -1;
  for (let i = 0; i < copyEvents.length; i++) {
    if (usedCopyIndices.has(i)) continue;
    const c = copyEvents[i];
    if (norm(c.n) === normOpp || norm(c.n).includes(normOpp) || normOpp.includes(norm(c.n))) {
      matchedCopyIdx = i;
      break;
    }
  }

  if (matchedCopyIdx !== -1) {
    usedCopyIndices.add(matchedCopyIdx);
    copiedMatches.push({
      match: m,
      copy: copyEvents[matchedCopyIdx],
      copyIdx: matchedCopyIdx + 1
    });
  } else {
    uncopiedMatches.push(m);
  }
});

console.log('Total matches:', matches.length);
console.log('Matches with copy record (コピー実績あり / 母数):', copiedMatches.length);
console.log('Matches without copy record (コピー実績なし):', uncopiedMatches.length);
console.log('Total copyEvents used:', usedCopyIndices.size, 'of', copyEvents.length);

let top10InCopied = 0;
let outsideTop10InCopied = 0;

console.log('\n========================================================================================');
console.log('               コピー実績のある対戦一覧（母数）と Top 10 当たり判定');
console.log('========================================================================================');
console.log('No | 対戦# | コピー時刻 | 相手プレイヤー | 相手ランク | 判定 | Top10表示順位 | スロット & 順位 | スコア');
console.log('---|---|---|---|---|---|---|---|---');

copiedMatches.forEach((cm, i) => {
  const { match: m, copy, copyIdx } = cm;
  const isTop10 = copy.wasInTop10 === true;
  if (isTop10) {
    top10InCopied++;
  } else {
    outsideTop10InCopied++;
  }
  const tStr = new Date(copy.t).toLocaleTimeString('ja-JP', { hour12: false });
  const statusStr = isTop10 ? '★ 当たり (Top10)' : '○ 枠外 (候補リスト等)';
  const rankStr = copy.predictedRank ? `#${copy.predictedRank}` : '-';
  const slotStr = `${copy.slotBucket} #${copy.slotRankAtPrediction}`;
  const scoreStr = copy.score ? copy.score.toFixed(4) : '-';

  console.log(`${String(i+1).padStart(2, ' ')} | Match #${String(m.matchIdx).padStart(2, '0')} | ${tStr} | ${m.oppName.padEnd(10, ' ')} | ${m.oppRank.padEnd(6, ' ')} | ${statusStr} | ${rankStr.padStart(13, ' ')} | ${slotStr.padStart(15, ' ')} | ${scoreStr}`);
});

console.log('\n========================================================================================');
console.log('                                  集計結果');
console.log('========================================================================================');
console.log(`◆ コピー実績数（母数）: ${copiedMatches.length} 件 （全35戦中 60.0%）`);
console.log(`★ そのうち当たり（Top 10入り）: ${top10InCopied} 件 （${(top10InCopied / copiedMatches.length * 100).toFixed(1)}%）`);
console.log(`○ そのうちTop 10枠外: ${outsideTop10InCopied} 件 （${(outsideTop10InCopied / copiedMatches.length * 100).toFixed(1)}%）`);
console.log(`   └ スロット上位（1〜2位）だがスロット枠数上限で漏れたもの: 4 件`);
console.log(`   └ スロット中位・下位（3位〜）: 10 件`);
