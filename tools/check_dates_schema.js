const fs = require('fs');
const path = require('path');

const dataDir = path.resolve(__dirname, '..', '..', 'テストデータ', 'わくわく');
const dates = [
  '20260906', '20260909', '20260910', '20260911', '20260912', '20260913', '20260914', '20260915',
  '20260919', '20260920', '20260921', '20260923', '20260925', '20260926', '20260927', '20260928',
  '20260929', '20261001', '20261002', '20261003', '20261004', '20261005', '20261009', '20261010',
  '20261011', '20261012', '20261013'
];

dates.forEach(d => {
  const fName = d === '20261013' ? 'viewer_analysis_20261013 (1).json' : `viewer_analysis_${d}.json`;
  const p = path.join(dataDir, fName);
  if (!fs.existsSync(p)) return;
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  const ce = data.candidateEvents ? data.candidateEvents[0] : null;
  const schema = ce?.logSchemaVersion || data.copyEvents?.[0]?.logSchemaVersion || 'unknown';
  const hasSlotPlan = Boolean(ce?.slotPlan);
  console.log(`${d}: schema=${schema}, hasSlotPlan=${hasSlotPlan}, isArrayAllCand=${Array.isArray(ce?.allCandidates?.[0])}`);
});
