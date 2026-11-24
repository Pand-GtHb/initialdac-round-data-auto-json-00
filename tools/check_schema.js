const fs = require('fs');
const path = require('path');

const dataDir = path.resolve(__dirname, '..', '..', 'テストデータ', 'わくわく');

// Test samples: 20260910, 20260926, 20261010, 20261012, 20261013(1)
const testDates = ['20260910', '20260926', '20261010', '20261012', '20261013 (1)'];

testDates.forEach(d => {
  const fName = d.includes('(1)') ? `viewer_analysis_${d}.json` : `viewer_analysis_${d}.json`;
  const p = path.join(dataDir, fName);
  if (!fs.existsSync(p)) return;
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  const ce = data.candidateEvents ? data.candidateEvents[0] : null;
  console.log(`${d}: candidateEvents=${data.candidateEvents?.length}, CE[0] has allCandidates=${Boolean(ce?.allCandidates)}, colsLen=${ce?.allCandidatesColumns?.length}, candLen=${ce?.candidates?.length}`);
  if (ce?.allCandidatesColumns) {
    const colName = (col) => ce.allCandidatesColumns.indexOf(col);
    console.log(`  Indices: name=${colName('name')}, globalRank=${colName('globalScoreRank')}, slotBucket=${colName('slotBucket')}, slotRank=${colName('slotRank')}, wasDisplayed=${colName('wasDisplayed')}`);
  }
});
