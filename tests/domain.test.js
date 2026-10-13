const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const utilsSource = fs.readFileSync(path.join(__dirname, "..", "0100_utils.js"), "utf8");
const domainSource = fs.readFileSync(path.join(__dirname, "..", "0200_domain.js"), "utf8");

const context = vm.createContext({});
vm.runInContext(utilsSource, context);
vm.runInContext(domainSource, context);

const domain = context.ViewerDomain;

test("Rank definitions and lookup", () => {
  assert.equal(domain.RANKS.length, 15);
  assert.equal(domain.getRankIndex("R1"), 0);
  assert.equal(domain.getRankIndex("R8"), 7);
  assert.equal(domain.getRankIndex("P_A"), 8);
  assert.equal(domain.getRankIndex("P_G"), 14);

  const infoR7 = domain.getRankInfo("R7");
  assert.equal(infoR7.label, "★7");
  assert.equal(infoR7.type, "ruby");

  const infoPG = domain.getRankInfo("P_G");
  assert.equal(infoPG.label, "G=50000～");
  assert.equal(infoPG.type, "pride");
});

test("Pride band classification", () => {
  assert.equal(domain.getPrideBandKey(0), null);
  assert.equal(domain.getPrideBandKey(1), "P_A");
  assert.equal(domain.getPrideBandKey(99), "P_A");
  assert.equal(domain.getPrideBandKey(100), "P_B");
  assert.equal(domain.getPrideBandKey(500), "P_C");
  assert.equal(domain.getPrideBandKey(1000), "P_D");
  assert.equal(domain.getPrideBandKey(5000), "P_E");
  assert.equal(domain.getPrideBandKey(10000), "P_F");
  assert.equal(domain.getPrideBandKey(50000), "P_G");
  assert.equal(domain.getPrideBandKey(999999), "P_G");
});

test("Player rank key resolution", () => {
  const rubyPlayer = {
    onlineBattleRankId: domain.RUBY_ID,
    starCnt: 5,
    pridePoint: 0
  };
  assert.equal(domain.getPlayerRankKey(rubyPlayer), "R5");

  const pridePlayer = {
    onlineBattleRankId: "",
    starCnt: 0,
    pridePoint: 1200
  };
  assert.equal(domain.getPlayerRankKey(pridePlayer), "P_D");

  const unranked = {
    onlineBattleRankId: "",
    starCnt: 0,
    pridePoint: 0
  };
  assert.equal(domain.getPlayerRankKey(unranked), null);
});

test("Tier key mapping", () => {
  assert.equal(domain.mapRankKeyToTierKey("R6"), "R6");
  assert.equal(domain.mapRankKeyToTierKey("P_A"), "PRIDE_A");
  assert.equal(domain.mapRankKeyToTierKey("P_G"), "PRIDE_G");
  assert.equal(domain.mapRankKeyToTierKey(null), null);
});

test("Player identity key generation", () => {
  const player = { name: " 拓海 ", shopname: " 秋名スピードスターズ " };
  // normalizePlayerNameはNFKC正規化のみ（前後のtrimは行わないのが元の仕様）
  assert.equal(domain.buildPlayerIdentityKey(player), " 拓海 @@ 秋名スピードスターズ ");

  const emptyPlayer = {};
  assert.equal(domain.buildPlayerIdentityKey(emptyPlayer), "__empty__");
});

test("Phase metrics computation", () => {
  const metrics = domain.computePhaseMetrics(100, 345, 0.03, 90);
  assert.equal(metrics.cycleCount, 0);
  assert.equal(metrics.phaseError, 100);
  assert.ok(metrics.phaseScore > 0 && metrics.phaseScore < 1);
  assert.equal(metrics.decay, 1);
  assert.equal(metrics.finalPhaseScore, metrics.phaseScore);

  const metricsMultiCycle = domain.computePhaseMetrics(790, 345, 0.03, 90);
  assert.equal(metricsMultiCycle.cycleCount, 2);
  assert.equal(metricsMultiCycle.phaseError, 100);
  assert.ok(metricsMultiCycle.decay < 1);
  assert.equal(
    metricsMultiCycle.finalPhaseScore,
    metricsMultiCycle.phaseScore * metricsMultiCycle.decay
  );

  const invalid = domain.computePhaseMetrics(-10, 0, 0.03, 90);
  assert.equal(invalid.finalPhaseScore, 0);
});

test("Phase direction detail", () => {
  const detailPast = domain.buildPhaseDirectionDetail(10, 345, 10);
  assert.equal(detailPast.peakDirection, "past");
  assert.equal(detailPast.phaseBucket, "past_0_30");

  const detailUpcoming = domain.buildPhaseDirectionDetail(300, 345, 45);
  assert.equal(detailUpcoming.peakDirection, "upcoming");
  assert.equal(detailUpcoming.phaseBucket, "upcoming_30_60");
});

test("Phase window half width", () => {
  const width = domain.getPhaseWindowHalfWidthSec(345, 1, 0.5, 0.03, 90);
  assert.ok(width > 0 && width <= 345 / 2);

  const zeroWidth = domain.getPhaseWindowHalfWidthSec(345, 50, 0.99, 0.1, 90);
  assert.equal(zeroWidth, 0);
});

test("Calc stats calculation", () => {
  const list = [{ point: 1000 }, { point: 2000 }, { point: 3000 }];
  const stats = domain.calcStats(list, 10);
  assert.equal(stats.cnt, 3);
  assert.equal(stats.percent, 30);
  assert.equal(stats.avg, 2000);
  assert.equal(stats.min, 1000);
  assert.equal(stats.max, 3000);
});

test("Rank population snapshot", () => {
  const players = [
    { onlineBattleRankId: domain.RUBY_ID, starCnt: 1 },
    { onlineBattleRankId: domain.RUBY_ID, starCnt: 7 },
    { pridePoint: 50 },
    { pridePoint: 0 } // unclassified
  ];
  const snap = domain.buildRankPopulationSnapshot(players);
  assert.equal(snap.sourceCount, 4);
  assert.equal(snap.classifiedCount, 3);
  assert.equal(snap.unclassifiedCount, 1);
  assert.equal(snap.rankCounts.R1, 1);
  assert.equal(snap.rankCounts.R7, 1);
  assert.equal(snap.rankCounts.P_A, 1);
  assert.equal(snap.groupCounts.ruby1To6, 1);
  assert.equal(snap.groupCounts.ruby7, 1);
  assert.equal(snap.groupCounts.pride, 1);
});
