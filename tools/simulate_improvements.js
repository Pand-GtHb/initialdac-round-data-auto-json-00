const fs = require('fs');
const path = require('path');

const baseDir = path.resolve(__dirname, '..', '..');
const jsonPath = path.join(baseDir, 'テストデータ', 'わくわく', 'viewer_analysis_20261013 (1).json');
const csvPath = path.join(baseDir, 'テストデータ', 'わくわく', 'マッチングデータシーズン6-261013.csv');

const logData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const candidateEvents = logData.candidateEvents || [];

const csv = fs.readFileSync(csvPath, 'utf8');
const lines = csv.trim().split(/\r?\n/).slice(1);
const matches = lines.map((line, idx) => {
  const parts = line.split(',');
  return {
    matchIdx: idx + 1,
    oppName: parts[8],
    oppRank: parts[5],
    oppStar: parts[6]
  };
});

function norm(str) {
  return String(str || '').trim().replace(/[\s　]+/g, '').normalize('NFKC');
}

const matchToCE = [
  null,
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
  31, 32, 33, 34, 35
];

// Target "missed but close" matches:
// Match 06 (WW - All #9, R6#7)
// Match 10 (立ちんぼ女子 - All #9, R6#6)
// Match 15 (れま - All #5, R6#5)
// Match 16 (不亞ん鼎 - R4#2, slotCap=1)
// Match 17 (突貫ター帽 - R3#2, slotCap=1)
// Match 22 (小川桜花 - R3#2, slotCap=1)
// Match 26 (みきちゅわん - All #4, R6#5)
// Match 32 (シルバの弟子 - R3#1, slotCap=0)

console.log('=== SIMULATION OF PROPOSED IMPROVEMENTS ===\n');

// Idea 1: Global High-Score Rescue (If candidate is in overall Top 5 or Top 8, reserve 1 wild-card slot)
// Idea 2: Ruby Floor Guarantee (If R3/R4 has slotCap=0, but slot #1 has score > threshold, give 1 slot)

matches.forEach(m => {
  const ceIdx = matchToCE[m.matchIdx];
  const ce = candidateEvents[ceIdx];
  if (!ce) return;
  const normOpp = norm(m.oppName);

  const topIdx = (ce.candidates || []).findIndex(c => norm(c.name) === normOpp || norm(c.name).includes(normOpp));
  const allRow = (ce.allCandidates || []).find(r => norm(r[1]) === normOpp || norm(r[1]).includes(normOpp));

  if (topIdx !== -1) {
    // already Top10
  } else if (allRow) {
    const globalRank = allRow[0];
    const bucket = allRow[28];
    const slotRank = allRow[29];
    const plan = (ce.slotPlan || []).find(s => s.bucket === bucket);
    const slots = plan ? plan.slots : 0;

    let wouldHitByGlobalTop5 = globalRank <= 5;
    let wouldHitByGlobalTop8 = globalRank <= 8;
    let wouldHitByFloorSlot1 = slotRank === 1 && slots === 0;
    let wouldHitBySlotCapPlus1 = slotRank === slots + 1;

    console.log(`Match #${String(m.matchIdx).padStart(2, '0')}: ${m.oppName.padEnd(8, ' ')} [${bucket} #${slotRank}, All #${globalRank}] (枠=${slots})` +
      ` | 全体Top5救済:${wouldHitByGlobalTop5 ? 'HIT!' : '-'} | 全体Top8救済:${wouldHitByGlobalTop8 ? 'HIT!' : '-'} | フロア保証:${wouldHitByFloorSlot1 ? 'HIT!' : '-'} | 枠数+1:${wouldHitBySlotCapPlus1 ? 'HIT!' : '-'}`);
  }
});
