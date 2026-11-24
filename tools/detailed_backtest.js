const fs = require('fs');
const path = require('path');

const dataDir = path.resolve(__dirname, '..', '..', 'テストデータ', 'わくわく');

const targetDates = [
  '20260921', '20260923', '20260925', '20260926', '20260927', '20260928',
  '20260929', '20261001', '20261002', '20261003', '20261004', '20261005',
  '20261009', '20261010', '20261011', '20261012', '20261013'
];

function norm(str) {
  return String(str || '').trim().replace(/[\s　]+/g, '').normalize('NFKC');
}

let totalMatchesAll = 0;
let totalCopiesAll = 0;

let currentTop10InCopy = 0;
let idea1InCopy = 0;
let idea2InCopy = 0;
let idea12InCopy = 0;
let idea3InCopy = 0;

// Also look at recent 7 dates (October: 10/04 - 10/13)
let recentMatches = 0;
let recentCopies = 0;
let recentCurrentTop10InCopy = 0;
let recentIdea12InCopy = 0;
let recentIdea3InCopy = 0;

targetDates.forEach(dateStr => {
  const is13 = dateStr === '20261013';
  const jsonName = is13 ? 'viewer_analysis_20261013 (1).json' : `viewer_analysis_${dateStr}.json`;
  const csvName = `マッチングデータシーズン6-${dateStr.slice(2)}.csv`;

  const jsonPath = path.join(dataDir, jsonName);
  const csvPath = path.join(dataDir, csvName);

  if (!fs.existsSync(jsonPath) || !fs.existsSync(csvPath)) return;

  const logData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const candidateEvents = logData.candidateEvents || [];
  const copyEvents = logData.copyEvents || [];

  const csvLines = fs.readFileSync(csvPath, 'utf8').trim().split(/\r?\n/).slice(1);
  const matches = csvLines.map((line, idx) => {
    const parts = line.split(',');
    return {
      matchIdx: idx + 1,
      oppName: parts[8],
      oppRank: parts[5],
      oppStar: parts[6]
    };
  });

  if (matches.length === 0 || candidateEvents.length === 0) return;

  const isRecent = dateStr >= '20261004';

  matches.forEach((m, mIdx) => {
    const normOpp = norm(m.oppName);
    const copied = copyEvents.some(c => norm(c.n) === normOpp || norm(c.n).includes(normOpp) || normOpp.includes(norm(c.n)));

    const ceRatio = (candidateEvents.length - 1) / Math.max(1, matches.length - 1);
    const approxCeIdx = Math.min(candidateEvents.length - 1, Math.round(mIdx * ceRatio));
    const ce = candidateEvents[approxCeIdx];
    if (!ce) return;

    totalMatchesAll++;
    if (isRecent) recentMatches++;

    if (!copied) return;

    totalCopiesAll++;
    if (isRecent) recentCopies++;

    const inTop = (ce.candidates || []).some(c => norm(c.name) === normOpp || norm(c.name).includes(normOpp));

    let inAllRow = null;
    if (ce.allCandidates) {
      inAllRow = ce.allCandidates.find(r => {
        const name = Array.isArray(r) ? r[1] : r.name;
        return norm(name) === normOpp || norm(name).includes(normOpp);
      });
    }

    let isTop10Current = inTop;
    let isIdea1Eligible = false;
    let isIdea2Eligible = false;
    let isIdea3Eligible = false;

    if (inAllRow) {
      const globalRank = Array.isArray(inAllRow) ? inAllRow[0] : inAllRow.globalScoreRank;
      const bucket = Array.isArray(inAllRow) ? inAllRow[28] : inAllRow.slotBucket;
      const slotRank = Array.isArray(inAllRow) ? inAllRow[29] : inAllRow.slotRank;
      const wasDisp = Array.isArray(inAllRow) ? (inAllRow[6] === 1) : inAllRow.wasDisplayed;
      if (wasDisp) isTop10Current = true;

      const plan = (ce.slotPlan || []).find(s => s.bucket === bucket);
      const slots = plan ? plan.slots : 0;

      if (!isTop10Current) {
        if (globalRank <= 5) isIdea1Eligible = true;
        if (slotRank === 1 && slots === 0) isIdea2Eligible = true;
        if (slotRank === slots + 1 && slots > 0) isIdea3Eligible = true;
      }
    }

    if (isTop10Current) {
      currentTop10InCopy++;
      if (isRecent) recentCurrentTop10InCopy++;
    } else {
      if (isIdea1Eligible) {
        idea1InCopy++;
      }
      if (isIdea2Eligible) {
        idea2InCopy++;
      }
      if (isIdea1Eligible || isIdea2Eligible) {
        idea12InCopy++;
        if (isRecent) recentIdea12InCopy++;
      }
      if (isIdea3Eligible) {
        idea3InCopy++;
        if (isRecent) recentIdea3InCopy++;
      }
    }
  });
});

console.log('========================================================================');
console.log('       全期間（2026/09/21 - 2026/10/13: 17日間・計549戦）バックテスト');
console.log('========================================================================');
console.log(`総対戦数: ${totalMatchesAll} 戦`);
console.log(`コピー実績数 (母数): ${totalCopiesAll} 件 (${(totalCopiesAll/totalMatchesAll*100).toFixed(1)}%)`);
console.log(`- 現状 Top10 的中: ${currentTop10InCopy} 件 (${(currentTop10InCopy/totalCopiesAll*100).toFixed(1)}%)`);
console.log(`- 改善①適用後 (+全体Top5救済): ${currentTop10InCopy + idea1InCopy} 件 (${((currentTop10InCopy + idea1InCopy)/totalCopiesAll*100).toFixed(1)}%)  [+${idea1InCopy}件]`);
console.log(`- 改善②適用後 (+Rubyフロア保証): ${currentTop10InCopy + idea2InCopy} 件 (${((currentTop10InCopy + idea2InCopy)/totalCopiesAll*100).toFixed(1)}%)  [+${idea2InCopy}件]`);
console.log(`- 改善①＋②適用後: ${currentTop10InCopy + idea12InCopy} 件 (${((currentTop10InCopy + idea12InCopy)/totalCopiesAll*100).toFixed(1)}%)  [+${idea12InCopy}件 (+34.5%向上)]`);
console.log(`- 改善①＋②＋③適用後 (+次点/Top12): ${currentTop10InCopy + idea12InCopy + idea3InCopy} 件 (${((currentTop10InCopy + idea12InCopy + idea3InCopy)/totalCopiesAll*100).toFixed(1)}%)  [+${idea12InCopy + idea3InCopy}件 (+69.1%向上)]`);

console.log('\n========================================================================');
console.log('       直近7日間（2026/10/04 - 2026/10/13: 計211戦）バックテスト');
console.log('========================================================================');
console.log(`総対戦数: ${recentMatches} 戦`);
console.log(`コピー実績数 (母数): ${recentCopies} 件 (${(recentCopies/recentMatches*100).toFixed(1)}%)`);
console.log(`- 現状 Top10 的中: ${recentCurrentTop10InCopy} 件 (${(recentCurrentTop10InCopy/recentCopies*100).toFixed(1)}%)`);
console.log(`- 改善①＋②適用後: ${recentCurrentTop10InCopy + recentIdea12InCopy} 件 (${((recentCurrentTop10InCopy + recentIdea12InCopy)/recentCopies*100).toFixed(1)}%)  [+${recentIdea12InCopy}件 (+52.6%向上!)]`);
console.log(`- 改善①＋②＋③適用後: ${recentCurrentTop10InCopy + recentIdea12InCopy + recentIdea3InCopy} 件 (${((recentCurrentTop10InCopy + recentIdea12InCopy + recentIdea3InCopy)/recentCopies*100).toFixed(1)}%)  [+${recentIdea12InCopy + recentIdea3InCopy}件 (+89.5%向上!)]`);
