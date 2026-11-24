const fs = require('fs');
const path = require('path');

const dataDir = path.resolve(__dirname, '..', '..', 'テストデータ', 'わくわく');
const files = fs.readdirSync(dataDir);

const jsonFiles = files.filter(f => f.startsWith('viewer_analysis_') && f.endsWith('.json') && !f.includes('(1)'));
const csvFiles = files.filter(f => f.startsWith('マッチングデータシーズン6-') && f.endsWith('.csv'));

console.log('JSON files count:', jsonFiles.length);
console.log('CSV files count:', csvFiles.length);

// Pair by date
// JSON: viewer_analysis_YYYYMMDD.json (e.g. 20261012)
// CSV: マッチングデータシーズン6-YYMMDD.csv (e.g. 261012)
const pairs = [];
csvFiles.forEach(cf => {
  const m = cf.match(/26(\d{4})/);
  if (!m) return;
  const mmdd = m[1];
  const jfName = `viewer_analysis_2026${mmdd}.json`;
  if (jsonFiles.includes(jfName)) {
    pairs.push({
      date: `2026${mmdd}`,
      csv: cf,
      json: jfName
    });
  }
});

console.log('\nMatching pairs count:', pairs.length);

const validPairs = [];
pairs.forEach(p => {
  const jPath = path.join(dataDir, p.json);
  const cPath = path.join(dataDir, p.csv);
  try {
    const jData = JSON.parse(fs.readFileSync(jPath, 'utf8'));
    const cLines = fs.readFileSync(cPath, 'utf8').trim().split(/\r?\n/).slice(1);
    const ceCount = jData.candidateEvents ? jData.candidateEvents.length : 0;
    const copyCount = jData.copyEvents ? jData.copyEvents.length : 0;
    const matchCount = cLines.length;

    console.log(`${p.date}: matches=${matchCount}, CE=${ceCount}, copy=${copyCount}, fileSize=${(fs.statSync(jPath).size / 1024 / 1024).toFixed(2)}MB`);
    if (ceCount > 0 && matchCount > 0) {
      validPairs.push({
        ...p,
        matchCount,
        ceCount,
        copyCount
      });
    }
  } catch (e) {
    console.log(`${p.date}: ERROR reading - ${e.message}`);
  }
});

console.log('\nValid pairs for backtest (with candidateEvents):', validPairs.length);
