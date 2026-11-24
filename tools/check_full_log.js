const fs = require('fs');
const path = require('path');

const baseDir = path.resolve(__dirname, '..', '..');
const jsonPath = path.join(baseDir, 'テストデータ', 'わくわく', 'viewer_analysis_20261013 (1).json');
const csvPath = path.join(baseDir, 'テストデータ', 'わくわく', 'マッチングデータシーズン6-261013.csv');

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

console.log('=== Log Summary ===');
console.log('exportedAt:', new Date(data.exportedAt).toLocaleString('ja-JP'));
console.log('dateKey:', data.dateKey);
console.log('copyEvents:', data.copyEvents ? data.copyEvents.length : 0);
console.log('candidateEvents:', data.candidateEvents ? data.candidateEvents.length : 0);
console.log('runtimeEvents:', data.runtimeEvents ? data.runtimeEvents.length : 0);

if (data.candidateEvents && data.candidateEvents.length > 0) {
  console.log('\n=== Candidate Events Timeline ===');
  data.candidateEvents.forEach((ce, idx) => {
    const tStr = new Date(ce.t).toLocaleTimeString('ja-JP', { hour12: false });
    const topCount = ce.candidates ? ce.candidates.length : 0;
    const allCount = ce.allCandidates ? ce.allCandidates.length : 0;
    console.log(`[#${String(idx+1).padStart(2, '0')}] ${tStr} (id:${ce.id}) - TopCandidates:${topCount}, AllCandidates:${allCount}, viewerTier:${ce.viewerTier}, yellowAdj:${ce.yellowAdjust}, pinkAdj:${ce.pinkAdjust}`);
  });
}
