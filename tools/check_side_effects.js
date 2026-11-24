const fs = require('fs');
const path = require('path');

const dataDir = path.resolve(__dirname, '..', '..', 'テストデータ', 'わくわく');

// Verify if any existing Top 10 hits are displaced
// Top 10 has 10 slots.
// Currently: 9 normal slots + 1 cross-bucket slot.
// If we change cross-bucket slot from "individual probability" to "Global Top Score Wildcard" (or reserve 1 slot):
// The 1 slot that gets displaced is the candidate that was previously selected by crossBucket!
// Let's check: Did the cross-bucket selected candidate EVER match in real history?

const targetDates = [
  '20260921', '20260923', '20260925', '20260926', '20260927', '20260928',
  '20260929', '20261001', '20261002', '20261003', '20261004', '20261005',
  '20261009', '20261010', '20261011', '20261012', '20261013'
];

function norm(str) {
  return String(str || '').trim().replace(/[\s　]+/g, '').normalize('NFKC');
}

let crossBucketWasEverHitCount = 0;
let crossBucketTotalEvents = 0;

targetDates.forEach(dateStr => {
  const is13 = dateStr === '20261013';
  const jsonName = is13 ? 'viewer_analysis_20261013 (1).json' : `viewer_analysis_${dateStr}.json`;
  const csvName = `マッチングデータシーズン6-${dateStr.slice(2)}.csv`;

  const jsonPath = path.join(dataDir, jsonName);
  const csvPath = path.join(dataDir, csvName);
  if (!fs.existsSync(jsonPath) || !fs.existsSync(csvPath)) return;

  const logData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const candidateEvents = logData.candidateEvents || [];
  const csvLines = fs.readFileSync(csvPath, 'utf8').trim().split(/\r?\n/).slice(1);
  const matches = csvLines.map((line, idx) => {
    const parts = line.split(',');
    return { oppName: parts[8] };
  });

  candidateEvents.forEach(ce => {
    crossBucketTotalEvents++;
    // Find candidate selected by cross-bucket
    let crossCand = null;
    if (ce.allCandidates) {
      crossCand = ce.allCandidates.find(r => Array.isArray(r) ? (r[6] === 1 && r[8] === 1) : (r.wasDisplayed && r.isCrossBucket));
    }
    if (crossCand) {
      const cName = Array.isArray(crossCand) ? crossCand[1] : crossCand.name;
      // Check if this player was ever faced in that day's matches
      const faced = matches.some(m => norm(m.oppName) === norm(cName) || norm(m.oppName).includes(norm(cName)));
      if (faced) {
        crossBucketWasEverHitCount++;
        console.log(`[Cross-bucket hit on ${dateStr}]: ${cName}`);
      }
    }
  });
});

console.log(`Cross-bucket total events: ${crossBucketTotalEvents}, Cross-bucket hits in history: ${crossBucketWasEverHitCount}`);
