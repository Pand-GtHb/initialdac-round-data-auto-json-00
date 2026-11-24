const fs = require('fs');
const path = require('path');

const dataDir = path.resolve(__dirname, '..', '..', 'テストデータ', 'わくわく');

// Target dates with slot system
const targetDates = [
  '20260921', '20260923', '20260925', '20260926', '20260927', '20260928',
  '20260929', '20261001', '20261002', '20261003', '20261004', '20261005',
  '20261009', '20261010', '20261011', '20261012', '20261013'
];

function norm(str) {
  return String(str || '').trim().replace(/[\s　]+/g, '').normalize('NFKC');
}

const summaryByDate = [];
let totalMatchesAll = 0;
let totalCopiesAll = 0;
let totalCurrentTop10All = 0;
let totalIdea1Top10All = 0; // Idea 1: Global High Score (Top 5)
let totalIdea2Top10All = 0; // Idea 2: Slot 1 Floor
let totalIdea12Top10All = 0; // Idea 1 + 2 combined
let totalIdea3Top10All = 0; // Idea 3: Slot 2 (runner up) / Top 12

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
      oppStar: parts[6],
      myRank: parts[3],
      myStar: parts[4]
    };
  });

  if (matches.length === 0 || candidateEvents.length === 0) return;

  let currentTop10 = 0;
  let idea1Added = 0; // Global Top 5 rescue
  let idea2Added = 0; // Floor slot #1
  let idea12Combined = 0; // 1 + 2
  let idea3RunnerUpAdded = 0; // Slot runner up
  let copyHitCount = 0;

  matches.forEach((m, mIdx) => {
    const normOpp = norm(m.oppName);
    
    // Check copy
    const copied = copyEvents.some(c => norm(c.n) === normOpp || norm(c.n).includes(normOpp) || normOpp.includes(norm(c.n)));
    if (copied) copyHitCount++;

    // Find closest candidateEvent around match
    // Map proportionally or by timestamp
    const ceRatio = (candidateEvents.length - 1) / Math.max(1, matches.length - 1);
    const approxCeIdx = Math.min(candidateEvents.length - 1, Math.round(mIdx * ceRatio));
    const ce = candidateEvents[approxCeIdx];

    if (!ce) return;

    // Check if in Top10 candidates
    const inTop = (ce.candidates || []).some(c => norm(c.name) === normOpp || norm(c.name).includes(normOpp));

    // Check in allCandidates
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
        // Idea 1: Global Score Top 5 rescue (wildcard)
        if (globalRank <= 5) {
          isIdea1Eligible = true;
        }
        // Idea 2: Slot 1 floor guarantee (slotRank === 1 and slots === 0)
        if (slotRank === 1 && slots === 0) {
          isIdea2Eligible = true;
        }
        // Idea 3: Runner up (slotRank === slots + 1)
        if (slotRank === slots + 1 && slots > 0) {
          isIdea3Eligible = true;
        }
      }
    }

    if (isTop10Current) {
      currentTop10++;
    } else {
      if (isIdea1Eligible) idea1Added++;
      if (isIdea2Eligible) idea2Added++;
      if (isIdea1Eligible || isIdea2Eligible) idea12Combined++;
      if (isIdea3Eligible) idea3RunnerUpAdded++;
    }
  });

  const row = {
    date: dateStr,
    matches: matches.length,
    copies: copyHitCount,
    currentTop10,
    currentRate: (currentTop10 / matches.length * 100).toFixed(1),
    idea1Total: currentTop10 + idea1Added,
    idea1Rate: ((currentTop10 + idea1Added) / matches.length * 100).toFixed(1),
    idea2Total: currentTop10 + idea2Added,
    idea2Rate: ((currentTop10 + idea2Added) / matches.length * 100).toFixed(1),
    idea12Total: currentTop10 + idea12Combined,
    idea12Rate: ((currentTop10 + idea12Combined) / matches.length * 100).toFixed(1),
    idea3Total: currentTop10 + idea12Combined + idea3RunnerUpAdded,
    idea3Rate: ((currentTop10 + idea12Combined + idea3RunnerUpAdded) / matches.length * 100).toFixed(1)
  };

  summaryByDate.push(row);

  totalMatchesAll += matches.length;
  totalCopiesAll += copyHitCount;
  totalCurrentTop10All += currentTop10;
  totalIdea1Top10All += (currentTop10 + idea1Added);
  totalIdea2Top10All += (currentTop10 + idea2Added);
  totalIdea12Top10All += (currentTop10 + idea12Combined);
  totalIdea3Top10All += (currentTop10 + idea12Combined + idea3RunnerUpAdded);
});

console.log('=== BACKTEST SUMMARY BY DATE (2026/09/21 - 2026/10/13: 17 dates) ===\n');
console.log('Date     | Matches | Copy | 現状Top10 | +改善①(全体Top5) | +改善②(フロア) | 改善①+②合計 | +改善③(次点/Top12)');
console.log('---------|---------|------|-----------|------------------|----------------|--------------|--------------------');

summaryByDate.forEach(r => {
  console.log(`${r.date} | ${String(r.matches).padStart(7, ' ')} | ${String(r.copies).padStart(4, ' ')} | ${String(r.currentTop10).padStart(3, ' ')}(${r.currentRate}%) | ${String(r.idea1Total).padStart(4, ' ')}(${r.idea1Rate}%) | ${String(r.idea2Total).padStart(4, ' ')}(${r.idea2Rate}%) | ${String(r.idea12Total).padStart(4, ' ')}(${r.idea12Rate}%) | ${String(r.idea3Total).padStart(4, ' ')}(${r.idea3Rate}%)`);
});

console.log('---------|---------|------|-----------|------------------|----------------|--------------|--------------------');
console.log(`TOTAL    | ${String(totalMatchesAll).padStart(7, ' ')} | ${String(totalCopiesAll).padStart(4, ' ')} | ${String(totalCurrentTop10All).padStart(3, ' ')}(${(totalCurrentTop10All/totalMatchesAll*100).toFixed(1)}%) | ${String(totalIdea1Top10All).padStart(4, ' ')}(${(totalIdea1Top10All/totalMatchesAll*100).toFixed(1)}%) | ${String(totalIdea2Top10All).padStart(4, ' ')}(${(totalIdea2Top10All/totalMatchesAll*100).toFixed(1)}%) | ${String(totalIdea12Top10All).padStart(4, ' ')}(${(totalIdea12Top10All/totalMatchesAll*100).toFixed(1)}%) | ${String(totalIdea3Top10All).padStart(4, ' ')}(${(totalIdea3Top10All/totalMatchesAll*100).toFixed(1)}%)`);
