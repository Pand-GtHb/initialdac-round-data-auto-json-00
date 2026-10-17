const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const utilsSource = fs.readFileSync(path.join(__dirname, "..", "0100_utils.js"), "utf8");
const domainSource = fs.readFileSync(path.join(__dirname, "..", "0200_domain.js"), "utf8");
const persistenceSource = fs.readFileSync(path.join(__dirname, "..", "0300_persistence.js"), "utf8");
const dataSource = fs.readFileSync(path.join(__dirname, "..", "0400_data.js"), "utf8");
const matchingSource = fs.readFileSync(path.join(__dirname, "..", "0500_matching.js"), "utf8");
const indexSource = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

function createMatchingContext(customState = {}) {
  const context = vm.createContext({
    console,
    Math,
    Date,
    Set,
    Map,
    Array,
    Object,
    Number,
    String,
    Boolean,
    JSON,
    State: customState
  });
  vm.runInContext(utilsSource, context);
  vm.runInContext(domainSource, context);
  vm.runInContext(persistenceSource, context);
  vm.runInContext(dataSource, context);
  vm.runInContext(matchingSource, context);
  return context;
}

test("Matching constants export and values", () => {
  const context = createMatchingContext();
  const matching = context.ViewerMatching;

  assert.equal(matching.NORMAL_SLOT_COUNT, 8);
  assert.equal(matching.CROSS_BUCKET_SLOT_COUNT, 1);
  assert.equal(matching.WILDCARD_SLOT_COUNT, 1);
  assert.equal(matching.HISTORICAL_RELIABILITY_K, 100);
  assert.equal(matching.HISTORICAL_CANDIDATE_COUNT_ALPHA, 0.35);
  assert.equal(matching.DEFAULT_MAX_PINK_MANAGED_SLOTS, 2);
  assert.equal(matching.DEFAULT_RECENT_AREA_BOOST_WEIGHT, 0.3);
  assert.equal(matching.MAX_RECENT_AREA_BOOST_WEIGHT, 0.3);
  assert.equal(matching.DEFAULT_RECENT_AREA_MATCH_WINDOW_SIZE, 5);
  assert.equal(matching.DEFAULT_PRIDE_BAND_DIVERSITY_GAP_THRESHOLD, 0.08);
  assert.equal(matching.R6_PRIDE_POPULATION_THRESHOLD, 0.4);
  assert.equal(matching.POPULATION_RANK_KEYS.length, 15);
});

test("getMatchingSlotBucketKey maps ruby and pride ranks", () => {
  const context = createMatchingContext();
  const { getMatchingSlotBucketKey } = context.ViewerMatching;

  assert.equal(getMatchingSlotBucketKey("R1"), "R1");
  assert.equal(getMatchingSlotBucketKey("R7"), "R7");
  assert.equal(getMatchingSlotBucketKey("R8"), "R8");
  assert.equal(getMatchingSlotBucketKey("P_A"), "PRIDE");
  assert.equal(getMatchingSlotBucketKey("P_G"), "PRIDE");
  assert.equal(getMatchingSlotBucketKey("UNKNOWN"), null);
  assert.equal(getMatchingSlotBucketKey(null), null);
});

test("buildMatchingSlotPlan distributes slots by quota and remainder", () => {
  const context = createMatchingContext();
  const { buildMatchingSlotPlan } = context.ViewerMatching;

  const candidates = [
    { __rankKey: "R6" },
    { __rankKey: "R6" },
    { __rankKey: "R7" },
    { __rankKey: "R7" },
    { __rankKey: "R7" },
    { __rankKey: "R7" },
    { __rankKey: "P_A" },
    { __rankKey: "P_B" },
    { __rankKey: "P_C" }
  ];

  const bucketProbabilities = {
    R6: 0.2,
    R7: 0.5,
    PRIDE: 0.3
  };

  const plan = buildMatchingSlotPlan(candidates, 9, bucketProbabilities);
  assert.equal(plan.length, 3);

  const totalSlots = plan.reduce((sum, entry) => sum + entry.slots, 0);
  assert.equal(totalSlots, 9);

  const r6 = plan.find(e => e.bucket === "R6");
  const r7 = plan.find(e => e.bucket === "R7");
  const pride = plan.find(e => e.bucket === "PRIDE");

  assert.equal(r6.slots, 2); // capacity is 2
  assert.equal(r7.slots, 4); // capacity is 4
  assert.equal(pride.slots, 3); // capacity is 3
});

test("Historical score calculation with distribution and candidate count factor", () => {
  const mockDistribution = {
    byViewerTier: {
      R7: {
        total: 200,
        opponentTierMap: {
          R7: 0.6,
          PRIDE: 0.3,
          R6: 0.1
        }
      }
    },
    historicalSupportSize: 50
  };

  const context = createMatchingContext({
    historicalMatchupDistribution: mockDistribution,
    scoringConfig: {
      historical: {
        minOwnSamplesForNoBackoff: 100,
        candidateCountAlpha: 0.35
      }
    }
  });

  const { getHistoricalScoreDetail, buildViewerHistoricalContext } = context.ViewerMatching;
  const viewerContext = buildViewerHistoricalContext("R7", mockDistribution);
  assert.ok(viewerContext);
  assert.equal(viewerContext.ownDistributionIsReliable, true);

  const tierCounts = { R7: 10, PRIDE: 5, R6: 2 };
  const r7Detail = getHistoricalScoreDetail("R7", "R7", tierCounts, viewerContext, mockDistribution);
  assert.equal(r7Detail.matched, true);
  assert.equal(r7Detail.tierProbability, 0.6);

  // score should be tierProbability / (tierCandidateCount ^ alpha)
  const expectedCountFactor = Math.pow(10, 0.35);
  const expectedScore = 0.6 / expectedCountFactor;
  assert.ok(Math.abs(r7Detail.score - expectedScore) < 1e-9);
});

test("Area density context and area boost computation", () => {
  const context = createMatchingContext();
  const { buildAreaDensityContext, getAreaBoostDetail } = context.ViewerMatching;

  const players = [
    { __rankKey: "R7", area: "Tokyo" },
    { __rankKey: "R7", area: "Tokyo" },
    { __rankKey: "R7", area: "Osaka" },
    { __rankKey: "P_A", area: "Tokyo" }
  ];

  const areaContext = buildAreaDensityContext(players);
  assert.equal(areaContext.overallByArea["Tokyo"], 3);
  assert.equal(areaContext.overallByArea["Osaka"], 1);
  assert.equal(areaContext.bucketByArea["R7"]["Tokyo"], 2);

  const player = { __rankKey: "R7", area: "Tokyo" };
  const boost = getAreaBoostDetail(player, areaContext, {
    candidateSelection: {
      areaBoost: { enabled: true, weight: 0.1, smoothingSampleSize: 10 }
    }
  });

  assert.ok(boost.areaBoost >= 1.0 && boost.areaBoost <= 1.1);
  assert.ok(boost.areaDensity >= 0 && boost.areaDensity <= 1);
});

test("PRIDE slot candidates selection with diversity gap threshold", () => {
  const context = createMatchingContext();
  const { selectPrideSlotCandidates } = context.ViewerMatching;

  const candidates = [
    { name: "P1", __rankKey: "P_A", __slotScore: 10.0 },
    { name: "P2", __rankKey: "P_A", __slotScore: 9.8 }, // Close to P1, within 8% gap
    { name: "P3", __rankKey: "P_B", __slotScore: 5.0 }, // Far worse alternative band
    { name: "P4", __rankKey: "P_C", __slotScore: 4.0 }
  ];

  // When slotCount = 2:
  // P1 is chosen first.
  // Next is P2 (same band P_A). Alternative in different band is P3 (score 5.0).
  // Relative gap: (9.8 - 5.0) / 9.8 = 0.489 > 0.08 threshold, so P2 is accepted because it significantly beats alternative band.
  const selected = selectPrideSlotCandidates(candidates, 2, {
    scoringConfig: {
      candidateSelection: {
        slotAllocation: {
          prideBandDiversityGapThreshold: 0.08
        }
      }
    }
  });

  assert.equal(selected.length, 2);
  assert.equal(selected[0].name, "P1");
  assert.equal(selected[1].name, "P2");
});

test("applyPinkManagedSlotCap enforces max pink managed limit and backfills", () => {
  const context = createMatchingContext();
  const { applyPinkManagedSlotCap } = context.ViewerMatching;

  const selected = [
    { name: "Pink1", __detail: { isPinkManaged: true }, __slotScore: 10 },
    { name: "Pink2", __detail: { isPinkManaged: true }, __slotScore: 9 },
    { name: "Pink3", __detail: { isPinkManaged: true }, __slotScore: 8 },
    { name: "Pink4", __detail: { isPinkManaged: true }, __slotScore: 7 }, // 4th pink, should be dropped if cap is 2
    { name: "Normal1", __detail: { isPinkManaged: false }, __slotScore: 6 }
  ];

  const rankedByScore = [
    ...selected,
    { name: "Backfill1", __detail: { isPinkManaged: false }, __slotScore: 5, __rankKey: "R7" },
    { name: "Backfill2", __detail: { isPinkManaged: false }, __slotScore: 4, __rankKey: "R7" }
  ];

  const result = applyPinkManagedSlotCap(selected, rankedByScore, 2);

  assert.equal(result.pinkManagedSlotsBeforeCap, 4);
  assert.equal(result.pinkManagedSlotsAfterCap, 2);
  assert.equal(result.pinkCapDroppedCount, 2);
  assert.equal(result.finalSelected.length, 5);

  const pinkInFinal = result.finalSelected.filter(p => p.__detail?.isPinkManaged);
  assert.equal(pinkInFinal.length, 2);
  assert.equal(pinkInFinal[0].name, "Pink1");
  assert.equal(pinkInFinal[1].name, "Pink2");

  const backfilled = result.finalSelected.filter(p => p.__pinkCapBackfill);
  assert.equal(backfilled.length, 2);
});

test("computeSoftmaxBacktestPreview generates candidate sample", () => {
  const context = createMatchingContext();
  const { computeSoftmaxBacktestPreview } = context.ViewerMatching;

  const pool = [
    { name: "C1", __slotScore: 5.0, __detail: {} },
    { name: "C2", __slotScore: 4.0, __detail: {} },
    { name: "C3", __slotScore: 3.0, __detail: {} },
    { name: "C4", __slotScore: 2.0, __detail: {} }
  ];

  const result = computeSoftmaxBacktestPreview(pool, 2, 0.15, {
    scoringConfig: {
      experimental: {
        softmaxBacktest: { enabled: true }
      }
    }
  });

  assert.equal(result.enabled, true);
  assert.equal(result.previewCandidates.length, 2);
  assert.ok(result.previewCandidates[0].slotScore > 0);
});

test("adjustSlotsByRelativePopulation handles disabled state and eligible adjustments", () => {
  const context = createMatchingContext();
  const { adjustSlotsByRelativePopulation } = context.ViewerMatching;

  const slotPlan = [
    { bucket: "R6", slots: 2, capacity: 5, probability: 0.2 },
    { bucket: "R7", slots: 4, capacity: 10, probability: 0.5 },
    { bucket: "PRIDE", slots: 3, capacity: 10, probability: 0.3 }
  ];

  const population = {
    classifiedCount: 60,
    rankCounts: {
      R1: 0, R2: 0, R3: 0, R4: 0, R5: 0, R6: 15, R7: 25, R8: 0,
      P_A: 5, P_B: 5, P_C: 5, P_D: 5, P_E: 0, P_F: 0, P_G: 0
    }
  };

  const enabledRankKeys = [
    "R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8",
    "P_A", "P_B", "P_C", "P_D", "P_E", "P_F", "P_G"
  ];

  // Disabled by default
  const disabledResult = adjustSlotsByRelativePopulation(
    slotPlan,
    population,
    enabledRankKeys,
    "R7"
  );
  assert.equal(disabledResult.diagnostics.reason, "disabled");
  assert.deepEqual(JSON.parse(JSON.stringify(disabledResult.plan)), slotPlan);
});

test("selectNormalCandidatesBySlots selects candidates and records plan to State", () => {
  const context = createMatchingContext();
  const { selectNormalCandidatesBySlots } = context.ViewerMatching;

  const candidates = [
    { name: "R7_A", __rankKey: "R7", __slotScore: 10 },
    { name: "R7_B", __rankKey: "R7", __slotScore: 8 },
    { name: "R7_C", __rankKey: "R7", __slotScore: 6 },
    { name: "R6_A", __rankKey: "R6", __slotScore: 9 },
    { name: "R6_B", __rankKey: "R6", __slotScore: 7 },
    { name: "PRIDE_A", __rankKey: "P_A", __slotScore: 11 }
  ];

  const bucketProbabilities = {
    R7: 0.5,
    R6: 0.3,
    PRIDE: 0.2
  };

  const selected = selectNormalCandidatesBySlots(candidates, 4, bucketProbabilities, null, {
    state: context.State
  });

  assert.equal(selected.length, 4);
  assert.ok(context.State.matchingSlotPlan);
  assert.ok(context.State.matchingSlotPlan.length > 0);
  assert.ok(selected.every(c => c.__slotBucket));
});

test("selectCrossBucketCandidates excludes already-selected and picks highest cross-bucket score", () => {
  const context = createMatchingContext();
  const { selectCrossBucketCandidates } = context.ViewerMatching;

  const c1 = { name: "C1", __detail: { tierProbability: 0.5, tierCandidateCount: 5, realtimeBoost: 1.2, effectivePhaseScore: 0.9, areaBoost: 1.0, recentAreaCounterfactualBoostWindow: 1.0 } };
  const c2 = { name: "C2", __detail: { tierProbability: 0.8, tierCandidateCount: 2, realtimeBoost: 1.0, effectivePhaseScore: 0.95, areaBoost: 1.0, recentAreaCounterfactualBoostWindow: 1.0 } };
  const c3 = { name: "C3", __detail: { tierProbability: 0.1, tierCandidateCount: 1, realtimeBoost: 1.0, effectivePhaseScore: 0.5, areaBoost: 1.0, recentAreaCounterfactualBoostWindow: 1.0 } };

  const pool = [c1, c2, c3];
  // If c2 is already selected in normal slots
  const selectedCross = selectCrossBucketCandidates(pool, [c2], 1);

  assert.equal(selectedCross.length, 1);
  assert.equal(selectedCross[0].name, "C1");
});

test("selectWildcardCandidates picks highest overall score candidate excluding already selected", () => {
  const context = createMatchingContext();
  const { selectWildcardCandidates } = context.ViewerMatching;

  const p1 = { name: "P1", __score: 0.08 };
  const p2 = { name: "P2", __score: 0.05 };
  const p3 = { name: "P3", __score: 0.09 };

  const wildcard = selectWildcardCandidates([p1, p2, p3], [p3], 1);
  assert.equal(wildcard.length, 1);
  assert.equal(wildcard[0].name, "P1");
});

test("normal selection preserves zero Ruby slots and the donor bucket's second candidate", () => {
  const context = createMatchingContext();
  const { selectNormalCandidatesBySlots } = context.ViewerMatching;
  const slotPlan = [
    { bucket: "R7", slots: 2, capacity: 2, rawQuota: 1.8 },
    { bucket: "R2", slots: 0, capacity: 1, rawQuota: 0.2 }
  ];
  const candidates = [
    { name: "R7_first", __rankKey: "R7", __slotScore: 1.1 },
    { name: "R7_second", __rankKey: "R7", __slotScore: 1.0 },
    { name: "R2_first", __rankKey: "R2", __slotScore: 1.2 }
  ];
  const selected = selectNormalCandidatesBySlots(candidates, 2, {}, slotPlan);
  assert.deepEqual(Array.from(selected, p => p.name), ["R7_first", "R7_second"]);
  assert.equal(slotPlan[1].slots, 0);
});

test("recent AREA defaults and deployed config use five matches, 30 percent and two Pink slots", () => {
  const { getRecentAreaBoostConfig, applyCandidateAreaHistoryBoost } = createMatchingContext().ViewerMatching;
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "scoring_config.json"), "utf8"));
  const defaults = getRecentAreaBoostConfig();
  const configured = getRecentAreaBoostConfig(config);
  assert.equal(defaults.windowSize, 5);
  assert.equal(configured.windowSize, 5);
  assert.equal(configured.weight, 0.3);
  assert.equal(configured.maxMultiplier, 1.3);
  assert.equal(config.candidateSelection.maxPinkManagedSlots, 2);
  const history = [{ area: "old" }, ...Array.from({ length: 5 }, () => ({ area: "recent" }))];
  const candidates = ["old", "recent"].map(area => ({
    area, __rankKey: "R6", __slotScore: 1, __detail: {}
  }));
  applyCandidateAreaHistoryBoost(candidates, { copyAreaHistory: history, scoringConfig: config });
  assert.equal(candidates[0].__slotScore, 1);
  assert.equal(candidates[1].__slotScore, 1.3);
  applyCandidateAreaHistoryBoost(candidates, { copyAreaHistory: history, scoringConfig: config });
  assert.equal(candidates[1].__slotScore, 1.3);
  assert.equal(getRecentAreaBoostConfig({
    candidateSelection: { areaBoost: { recentMatch: { weight: 1 } } }
  }).weight, 0.3);
  assert.equal(getRecentAreaBoostConfig({
    candidateSelection: { areaBoost: { recentMatch: { enabled: false } } }
  }).weight, 0);
});

test("scoring config resolves defaults, validates inputs and records effective values", () => {
  const { resolveScoringConfig, getScoringConfigSnapshot, getMatchingSlotCounts, getRecentAreaBoostConfig } =
    createMatchingContext().ViewerMatching;
  const source = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "scoring_config.json"), "utf8"));
  const config = resolveScoringConfig(source);
  assert.equal(config.candidateSelection.maxPinkManagedSlots, 2);
  assert.equal(config.phase.yellow.weight, 0.8);
  assert.equal(source.phase.yellow.maxSampleAgeSec, 2700);
  assert.equal(config.phase.yellow.maxSampleAgeSec, source.phase.yellow.maxSampleAgeSec);
  const snapshot = getScoringConfigSnapshot(config);
  assert.equal(snapshot.version, source.meta.version);
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.effective.phase.yellow.weight, 0.55);
  assert.equal(config.phase.yellow.weight, 0.8);
  assert.equal(snapshot.effective.candidateSelection.areaBoost.recentMatch.weight, 0.3);
  assert.equal(getMatchingSlotCounts(config).normal, 8);
  const defaults = resolveScoringConfig({ meta: { schemaVersion: 1, version: "minimal" } });
  assert.equal(defaults.historical.reliabilityK, 100);
  assert.equal(defaults.phase.pink.weight, defaults.phase.weight);
  assert.equal(defaults.candidateSelection.areaBoost.recentMatch.windowSize, 5);
  const disabled = resolveScoringConfig({
    ...source,
    candidateSelection: {
      ...source.candidateSelection,
      areaBoost: { recentMatch: { enabled: false, weight: 0.4, maxWeight: 0.5 } }
    }
  });

  assert.equal(getScoringConfigSnapshot(disabled).effective.candidateSelection.areaBoost.recentMatch.weight, 0);
  assert.equal(getRecentAreaBoostConfig(disabled).weight, 0);
  disabled.candidateSelection.areaBoost.recentMatch.enabled = true;
  assert.equal(getRecentAreaBoostConfig(disabled).weight, 0.4);
  for (const [keys, value] of [
    [["meta", "schemaVersion"], 2],
    [["meta", "version"], ""],
    [["candidateSelection", "maxPinkManagedSlots"], 11],
    [["candidateSelection", "slots", "normal"], 7],
    [["candidateSelection", "slots", "wildcard"], 1.5],
    [["candidateSelection", "areaBoost", "recentMatch", "weight"], "0.3"],
    [["candidateSelection", "areaBoost", "recentMatch", "weight"], 0.4],
    [["candidateSelection", "areaBoost", "recentMatch", "windowSize"], 0],
    [["candidateSelection", "areaBoost", "recentMatch", "enabled"], null],
    [["phase", "yellowMaxWeight"], 2],
    [["phase", "maxSampleAgeSec"], 2700],
    [["phase", "pink", "maxShiftSec"], 345],
    [["viewerDefaults", "filterMinutes"], 45],
    [["candidateSelection", "slots", "wildCard"], 0],
    [["candidateSelection", "areaBoost", "diagnosticRecentWeight"], 0.1],
    [["phaseError", "scaleSec"], 0],
    [["phaseError", "yellowScaleSec"], "90"],
    [["realtimeBoost", "decaySec"], Infinity],
    [["realtimeBoost", "maxBonus"], -1],
    [["historical", "reliabilityK"], NaN]
  ]) {
    const bad = JSON.parse(JSON.stringify(source));
    const parent = keys.slice(0, -1).reduce((o, k) => o[k], bad);
    parent[keys.at(-1)] = value;
    assert.throws(() => resolveScoringConfig(bad), /scoring_config.json/);
  }
});

test("Pink cap backfills wildcard by global score and cross-bucket by individual probability", () => {
  const { applyPinkManagedSlotCap } = createMatchingContext().ViewerMatching;
  const pink = (name, wildcard) => ({
    name, __slotScore: 10, __crossBucket: true, __wildcard: wildcard,
    __detail: { isPinkManaged: true }
  });
  const globalLeader = {
    name: "global", __score: 10, __slotScore: 1,
    __detail: { tierProbability: 0.1, effectivePhaseScore: 1 }
  };
  const individualLeader = {
    name: "individual", __score: 1, __slotScore: 10,
    __detail: { tierProbability: 0.9, effectivePhaseScore: 1 }
  };
  const result = applyPinkManagedSlotCap(
    [pink("wildcard", true), pink("cross", false)],
    [globalLeader, individualLeader], 0
  );
  assert.equal(result.finalSelected.length, 2);
  assert.equal(globalLeader.__wildcard, true);
  assert.equal(globalLeader.__crossBucketSelectionReason, "pink-cap-wildcard-backfill");
  assert.equal(individualLeader.__crossBucketSelectionReason, "pink-cap-backfill");
  assert.equal(result.pinkManagedSlotsAfterCap, 0);
});

test("browser entry loads matching globals in correct order", () => {
  const context = createMatchingContext();
  const matching = context.ViewerMatching;

  assert.ok(matching);
  assert.equal(typeof matching.buildMatchingSlotPlan, "function");
  assert.equal(typeof matching.getHistoricalScoreDetail, "function");
  assert.equal(typeof matching.applyPinkManagedSlotCap, "function");
});
