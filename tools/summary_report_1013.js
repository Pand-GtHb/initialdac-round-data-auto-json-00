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

// Map each match to its CE index
// CE 1: 13:50:14 (first click)
// CE 2: 13:50:31 -> Match 1 (PrTak)
// CE 3: 13:56:10 -> Match 2 (ARia)
// CE 4: 14:06:02 -> Match 3 (BLACK楓)
// CE 5: 14:11:36 -> Match 4 (WORST+)
// CE 6: 14:17:50 -> Match 5 (きら)
// CE 7: 14:25:44 -> Match 6 (WW)
// CE 8: 14:33:06 -> Match 7 (らく！)
// CE 9: 14:41:14 -> Match 8 (衛諏遊)
// CE 10: 14:47:24 -> Match 9 (Taka@)
// CE 11: 14:53:00 -> Match 10 (立ちんぼ女子)
// CE 12: 14:59:43 -> Match 11 (金無い小林)
// CE 13: 15:05:47 -> Match 12 (TWICE)
// CE 14: 15:12:44 -> Match 13 (悲しいカバ)
// CE 15: 15:18:49 -> Match 14 (不亞ん鼎)
// CE 16: 15:25:51 -> Match 15 (れま)
// CE 17: 15:31:37 -> Match 16 (不亞ん鼎)
// CE 18: 15:38:38 -> Match 17 (突貫ター帽)
// CE 19: 15:44:00 -> Match 18 (あきれすけん)
// CE 20: 15:56:15 -> Match 19 (Guilty)
// CE 21: 16:02:32 -> Match 20 (ヨルヲ先生)
// CE 22: 16:10:12 -> Match 21 (超絶Lulu)
// CE 23: 16:16:10 -> Match 22 (小川桜花)
// CE 24: 16:22:23 -> Match 23 (不亞ん鼎)
// CE 25: 16:28:09 -> Match 24 (ピアスホール)
// CE 26: 16:34:28 -> Match 25 (顔文字@T様)
// CE 27: 16:39:56 -> Match 26 (みきちゅわん)
// CE 28: 16:46:40 -> Match 27 (遊＊戯＊王)
// CE 29: 16:57:45 -> Match 28 (ジェネシス)
// CE 30: 17:03:45 -> Match 29 (あるむ♪)
// CE 31: 17:10:53 -> Match 30 (未来の破片．)
// CE 32: 17:16:34 -> Match 31 (HRC@)
// CE 33: 17:23:30 -> Match 32 (シルバの弟子)
// CE 34: 17:29:27 -> Match 33 (ピロティ)
// CE 35: 17:35:12 -> Match 34 (オールニージ)
// CE 36: 17:41:28 -> Match 35 (出光興産)

const matchToCE = [
  null, // 0 index dummy
  1, // Match 1 -> CE 2 (idx 1)
  2, // Match 2 -> CE 3 (idx 2)
  3, // Match 3 -> CE 4
  4, // Match 4 -> CE 5
  5, // Match 5 -> CE 6
  6, // Match 6 -> CE 7
  7, // Match 7 -> CE 8
  8, // Match 8 -> CE 9
  9, // Match 9 -> CE 10
  10, // Match 10 -> CE 11
  11, // Match 11 -> CE 12
  12, // Match 12 -> CE 13
  13, // Match 13 -> CE 14
  14, // Match 14 -> CE 15
  15, // Match 15 -> CE 16
  16, // Match 16 -> CE 17
  17, // Match 17 -> CE 18
  18, // Match 18 -> CE 19
  19, // Match 19 -> CE 20
  20, // Match 20 -> CE 21
  21, // Match 21 -> CE 22
  22, // Match 22 -> CE 23
  23, // Match 23 -> CE 24
  24, // Match 24 -> CE 25
  25, // Match 25 -> CE 26
  26, // Match 26 -> CE 27
  27, // Match 27 -> CE 28
  28, // Match 28 -> CE 29
  29, // Match 29 -> CE 30
  30, // Match 30 -> CE 31
  31, // Match 31 -> CE 32
  32, // Match 32 -> CE 33
  33, // Match 33 -> CE 34
  34, // Match 34 -> CE 35
  35  // Match 35 -> CE 36
];

console.log('Match | Time | Opponent | My -> Opp | Exact Status at Play | Slot & Rank | Global Score Rank | Slot Cap / Reason');
console.log('---|---|---|---|---|---|---|---');

let hitTop10 = 0;
let inSlot = 0;
let inPool = 0;
let outOfPool = 0;

const rows = [];

matches.forEach(m => {
  const ceIdx = matchToCE[m.matchIdx];
  const ce = candidateEvents[ceIdx];
  const ceTime = ce ? new Date(ce.t).toLocaleTimeString('ja-JP', { hour12: false }) : '--:--:--';
  const normOpp = norm(m.oppName);

  // Check in candidates (Top10)
  const topIdx = (ce.candidates || []).findIndex(c => norm(c.name) === normOpp || norm(c.name).includes(normOpp));
  const allRow = (ce.allCandidates || []).find(r => norm(r[1]) === normOpp || norm(r[1]).includes(normOpp));

  let status = '';
  let slotRankStr = '-';
  let globalRankStr = '-';
  let reason = '';

  if (topIdx !== -1) {
    hitTop10++;
    const cand = ce.candidates[topIdx];
    status = '★ Top10的中';
    slotRankStr = `${cand.slotBucket} #${cand.slotRank}`;
    globalRankStr = `All #${allRow ? allRow[0] : cand.scoreRank}`;
    reason = `表示枠 #${topIdx + 1} に選出`;
  } else if (allRow) {
    inPool++;
    const bucket = allRow[28];
    const slotRank = allRow[29];
    const globalRank = allRow[0];
    const plan = (ce.slotPlan || []).find(s => s.bucket === bucket);
    const slots = plan ? plan.slots : 0;
    slotRankStr = `${bucket} #${slotRank}`;
    globalRankStr = `All #${globalRank}`;

    if (slotRank <= slots) {
      inSlot++;
      status = '◇ スロット枠内(Top10漏れ)';
      reason = `スロット内${slotRank}位(枠数${slots})だがTop10漏れ`;
    } else {
      status = '○ 候補プール(スロット枠外)';
      reason = `スロット枠数${slots}に対しスロット内${slotRank}位`;
    }
  } else {
    outOfPool++;
    status = '× 候補プール外';
    reason = '直近更新なし/ランクフィルタ外';
  }

  rows.push({
    m,
    ceTime,
    status,
    slotRankStr,
    globalRankStr,
    reason
  });

  console.log(`Match #${String(m.matchIdx).padStart(2, '0')} | ${ceTime} | ${m.oppName} | ${m.myRank}(${m.myStar}) vs ${m.oppRank}(${m.oppStar}) | ${status} | ${slotRankStr} | ${globalRankStr} | ${reason}`);
});

console.log('\n============================================================');
console.log(`総対戦数: ${matches.length}`);
console.log(`★ Top10的中: ${hitTop10} 件 (${(hitTop10/matches.length*100).toFixed(1)}%)`);
console.log(`○ 候補プール内: ${inPool + hitTop10} 件 (${((inPool + hitTop10)/matches.length*100).toFixed(1)}%)`);
console.log(`× 候補プール外: ${outOfPool} 件 (${(outOfPool/matches.length*100).toFixed(1)}%)`);
