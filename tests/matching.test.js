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

test("day-relative AREA shadow uses prior same-day copies and never mutates production", () => {
  const context = createMatchingContext();
  const { buildShadowCandidateComparison, resolveScoringConfig } = context.ViewerMatching;
  const config = resolveScoringConfig({ meta: { schemaVersion: 1, version: "test" } });
  const evaluationTimeMs = Date.parse("2026-10-19T10:00:00+09:00");
  const pool = Array.from({ length: 12 }, (_, i) => Object.freeze({
    name: `P${i}`, shopname: "S", area: i < 2 ? "rare" : "common",
    __rankKey: "R7", __score: 0.1, __slotScore: 1.3,
    __crossBucket: true, __wildcard: true, displayRank: 1,
    __detail: Object.freeze({
      slotBucket: "R7", slotScore: 1.3, effectivePhaseScore: 1,
      tierProbability: 1, tierCandidateCount: 12, recentAreaAppliedBoost: 1.3,
      recentAreaCounterfactualBoostWindow: 1.3
    })
  }));
  const slotPlan = [{ bucket: "R7", slots: 8 }];
  const history = [
    { t: Date.parse("2026-10-19T03:59:59+09:00"), area: "rare" },
    { t: Date.parse("2026-10-19T04:00:00+09:00"), area: "rare" },
    { t: evaluationTimeMs - 20000, area: "rare" },
    { t: evaluationTimeMs - 10000, area: "common" },
    { t: evaluationTimeMs + 1, area: "rare" },
    { t: evaluationTimeMs - 100, area: "" }
  ];
  const snapshot = JSON.stringify({ pool, slotPlan, history });
  const result = buildShadowCandidateComparison(pool, {
    variant: "dayRelativeArea", scoringConfig: config, slotPlan,
    copyAreaHistory: history, evaluationTimeMs
  });
  assert.equal(result.parameters.sampleCount, 3);
  assert.equal(result.parameters.populationCount, 12);
  assert.equal(result.parameters.dayKey, "20261019");
  assert.equal(result.parameters.basicAreaPreserved, true);
  assert.equal(result.parameters.combinedAreaFormula, "basicAreaBoost * dayRelativeAreaBoost");
  assert.equal(result.parameters.globalScoreUnchanged, true);
  assert.equal(result.selected.length, 10);
  assert.equal(new Set(result.selected.map(p => p.name)).size, 10);
  const rare = result.selected.find(p => p.area === "rare");
  assert.ok(Math.abs(rare.__slotScore - 1.18) < 1e-12);
  assert.equal(rare.__detail.diagnosticAreaExpectedCount, 0.5);
  assert.equal(rare.__detail.diagnosticAreaObservedCount, 2);
  assert.equal(rare.__score, 0.1, "AREA does not alter global-score wildcard weighting");
  assert.equal(result.selected.filter(p => p.__wildcard).length, 1);
  assert.equal(result.selected.filter(p => p.__crossBucket && !p.__wildcard).length, 1);
  assert.equal(JSON.stringify({ pool, slotPlan, history }), snapshot);
  assert.equal(context.State.matchingSlotPlan, undefined);
  const again = buildShadowCandidateComparison(pool, {
    variant: "dayRelativeArea", scoringConfig: config, slotPlan,
    copyAreaHistory: history, evaluationTimeMs
  });
  assert.deepEqual(again, result);
  const empty = buildShadowCandidateComparison(pool, {
    variant: "dayRelativeArea", scoringConfig: config, slotPlan,
    evaluationTimeMs: evaluationTimeMs + 86400000, copyAreaHistory: history.slice(0, 4)
  });
  assert.equal(empty.parameters.sampleCount, 0);
  assert.ok(empty.selected.every(p => p.__slotScore === 1));
});

test("AREA replacement preserves basic boost once in slot/cross scoring and leaves global score alone", () => {
  const { buildShadowCandidateComparison, resolveScoringConfig, getCandidateCrossBucketScore } =
    createMatchingContext().ViewerMatching;
  const config = resolveScoringConfig({ meta: { schemaVersion: 1, version: "test" } });
  const at = Date.parse("2026-10-26T10:00:00+09:00");
  const pool = Array.from({ length: 12 }, (_, i) => ({
    name: `AREA_${i}`, shopname: "S", area: i < 2 ? "rare" : "common",
    __rankKey: "R7", __score: 0.2, __slotScore: 0.8 * 1.05 * 1.3,
    __detail: {
      slotBucket: "R7", slotScore: 0.8 * 1.05 * 1.3,
      effectivePhaseScore: 0.8, areaBoost: 1.05, recentAreaAppliedBoost: 1.3,
      tierProbability: 1, tierCandidateCount: 12
    }
  }));
  const before = JSON.stringify(pool);
  const result = buildShadowCandidateComparison(pool, {
    variant: "dayRelativeArea", scoringConfig: config,
    slotPlan: [{ bucket: "R7", slots: 8 }], evaluationTimeMs: at,
    copyAreaHistory: [{ t: at - 1, area: "rare" }, { t: at - 2, area: "rare" },
      { t: at - 3, area: "common" }]
  });
  const rare = result.selected.find(p => p.area === "rare");
  assert.equal(rare.__detail.areaBoost, 1.05);
  assert.ok(Math.abs(rare.__slotScore - 0.8 * 1.05 * 1.18) < 1e-12);
  assert.ok(Math.abs(getCandidateCrossBucketScore(rare) - 1 / 12 * 0.8 * 1.05 * 1.18) < 1e-12);
  assert.equal(rare.__score, 0.2);
  assert.equal(JSON.stringify(pool), before);
});

test("policy comparisons independently rescore Phase and AREA without learning or future history", () => {
  const context = createMatchingContext();
  const M = context.ViewerMatching;
  const config = M.resolveScoringConfig({ meta: { schemaVersion: 1, version: "policy-test" } });
  const at = Date.parse("2026-10-26T10:00:00+09:00");
  const pool = Array.from({ length: 12 }, (_, i) => {
    const pink = i === 0;
    const metrics = context.ViewerDomain.computePhaseMetrics(700, 345, pink ? 0.03 : 0.06, 90);
    const effective = 1 - 0.55 * (1 - metrics.finalPhaseScore);
    return Object.freeze({
      name: `POLICY_${i}`, shopname: "S", area: "A", __rankKey: "R7",
      __score: 0.1 * effective, __slotScore: effective * 1.05,
      __crossBucket: true, __wildcard: true,
      __detail: Object.freeze({
        ...metrics, phaseAnchorAtMs: at - 700000,
        phaseAnchorType: pink ? "pink-last-copy" : "last-update",
        cycleSec: 345, isPinkManaged: pink, phaseWeight: 0.55, phaseTrust: 0,
        effectivePhaseScore: effective, historicalScore: 0.1,
        realtimeBoost: 1, pinkMismatchBoostFactor: 1,
        areaBoost: 1.05, recentAreaAppliedBoost: 1,
        prideBandPriorWeight: 1, slotBucket: "R7", slotScore: effective * 1.05,
        tierProbability: 1, tierCandidateCount: 12
      })
    });
  });
  const history = [
    { t: at - 86400000, area: "A" },
    { t: at - 1, area: "A" },
    ...Array.from({ length: 5 }, (_, i) => ({ t: at + i + 1, area: "B" }))
  ];
  const plan = [{ bucket: "R7", slots: 8 }];
  const before = JSON.stringify({ pool, history, plan, config });
  for (const policy of M.SCORING_POLICY_COMPARISONS) {
    const result = M.buildShadowCandidateComparison(pool, {
      variant: policy.variant, scoringConfig: config, slotPlan: plan,
      copyAreaHistory: history, evaluationTimeMs: at
    });
    assert.equal(result.status, "computed");
    assert.equal(result.selected.length, 10);
    assert.equal(new Set(result.selected.map(p => p.name)).size, 10);
    assert.equal(result.parameters.populationAndSlotPlan, "same-as-production");
    const recent = 1 + 0.3 * Math.sqrt(2 / 5);
    for (const p of result.selected) {
      const old = pool.find(q => q.name === p.name);
      const d = p.__detail;
      const phase = policy.lambda !== undefined && !d.isPinkManaged
        ? context.ViewerDomain.computePhaseMetrics(700, 345, policy.lambda, policy.scaleSec)
        : old.__detail;
      const effective = 1 - 0.55 * (1 - phase.finalPhaseScore);
      const basic = policy.area && policy.area !== "basic-recent" ? 1 : 1.05;
      const boost = policy.area?.includes("recent") ? recent : 1;
      assert.ok(Math.abs(d.finalPhaseScore - phase.finalPhaseScore) < 1e-12);
      assert.ok(Math.abs(p.__score - 0.1 * effective) < 1e-12);
      assert.ok(Math.abs(p.__slotScore - effective * basic * boost) < 1e-12);
      assert.ok(Math.abs(M.getCandidateCrossBucketScore(p) -
        effective * basic * boost / 12) < 1e-12);
      if (d.isPinkManaged) assert.equal(d.finalPhaseScore, old.__detail.finalPhaseScore);
    }
    if (policy.area === "day-only") assert.equal(result.parameters.sampleCount, 1);
    assert.equal(JSON.stringify({ pool, history, plan, config }), before);
  }
  const options = { scoringConfig: config, slotPlan: plan, copyAreaHistory: history, evaluationTimeMs: at };
  const variants = [
    { variant: "dayRelativeArea", id: "day-relative-area" },
    { variant: "yellowPhase", id: "yellow-phase-weight-070" },
    ...M.SCORING_POLICY_COMPARISONS
  ];
  const buildDailyKey = context.ViewerPersistence.buildDailyKey;
  let dailyKeyCalls = 0;
  context.ViewerPersistence.buildDailyKey = (...args) => {
    dailyKeyCalls++;
    return buildDailyKey(...args);
  };
  const individual = variants.map(({ variant, id }) => ({
    id, ...M.buildShadowCandidateComparison(pool, { ...options, variant })
  }));
  const individualKeyCalls = dailyKeyCalls;
  dailyKeyCalls = 0;
  const batch = M.buildShadowCandidateComparisons(pool, options);
  assert.equal(JSON.stringify(batch), JSON.stringify(individual));
  assert.equal(dailyKeyCalls * 2, individualKeyCalls);
  assert.equal(JSON.stringify({ pool, history, plan, config }), before);
  const fresh = M.buildShadowCandidateComparisons(pool, {
    ...options, copyAreaHistory: [], evaluationTimeMs: at + 86400000
  });
  assert.equal(fresh.find(c => c.id === "day-relative-area").parameters.sampleCount, 0);
  assert.ok(fresh.find(c => c.id === "area-basic-recent").selected.every(p =>
    p.__detail.recentAreaAppliedBoost === 1));
  config.experimental.dayRelativeArea.enabled = false;
  config.experimental.yellowPhase.enabled = false;
  const disabledBatch = M.buildShadowCandidateComparisons(pool, options);
  assert.ok(disabledBatch.slice(0, 2).every(c => c.status === "disabled" && c.selected.length === 0));
  assert.deepEqual(Array.from(M.buildShadowCandidateComparisons([], options), c => c.selected.length),
    Array(variants.length).fill(0));
  const missing = [null, at + 1].map((anchor, i) => ({
    ...pool[i], __detail: { ...pool[i].__detail, isPinkManaged: false,
      phaseAnchorAtMs: anchor, phaseAnchorType: anchor === null ? "unavailable" : "last-update" }
  }));
  const unknown = M.buildShadowCandidateComparison(missing, {
    variant: "yellowError60", scoringConfig: config, slotPlan: plan, evaluationTimeMs: at
  });
  assert.equal(unknown.parameters.unavailablePhaseCount, 2);
  for (const p of unknown.selected) {
    assert.equal(p.__detail.finalPhaseScore, missing.find(q => q.name === p.name).__detail.finalPhaseScore);
  }
});

function resurfacingFixture() {
  const matching = createMatchingContext().ViewerMatching;
  const at = Date.parse("2026-10-26T10:00:00+09:00");
  const pool = (phase, score, changes = {}) => Array.from({ length: 12 }, (_, i) => {
    const slot = i === 10 ? score : 1 - i * 0.03;
    return Object.freeze({
      name: `REBOUND_${i}`, shopname: "S", __rankKey: "R7",
      __score: slot / 10, __slotScore: slot,
      __crossBucket: i === 8 || i === 9, __wildcard: i === 9,
      __detail: Object.freeze({
        slotBucket: "R7", slotScore: slot, effectivePhaseScore: slot,
        phaseScore: 1, phaseError: i === 10 ? phase : 90,
        phaseAnchorAtMs: at - 600000, phaseAnchorType: "last-update", cycleSec: 345,
        areaBoost: 1.05, recentAreaAppliedBoost: 1.1, cooldownRemainingSec: 0,
        tierProbability: 1, tierCandidateCount: 12,
        ...(i === 10 ? changes : {})
      })
    });
  });
  const run = (players, time, previousState, overrides = {}) =>
    matching.buildCandidateResurfacingDiagnostics(players, {
      evaluationTimeMs: time, viewerTier: "R7", scoringConfigVersion: "test",
      slotPlan: [{ bucket: "R7", slots: 8 }], current: players.slice(0, 10),
      previousState, ...overrides
    });
  const first = pool(70, 0.8);
  const initial = run(first, at, null, { current: first.slice(1, 11) });
  const second = run(pool(100, 0.2), at + 60000, initial.state);
  return { matching, at, pool, run, initial, second };
}

function findResurfacingObservation(result, name) {
  return result.diagnostics.observations.map(row => Object.fromEntries(
    result.diagnostics.observationColumns.map((key, i) => [key, row[i]])
  )).find(p => p.name === name);
}

test("resurfacing shadows use fresh improvement, preserve nine slots, and never refresh rescue history", () => {
  const { at, pool, run, initial, second } = resurfacingFixture();
  assert.equal(initial.diagnostics.comparableSnapshot, false);
  assert.ok(second.comparisons.every(c => !c.applied));
  const players = pool(30, 0.96, { phaseAnchorAtMs: at - 300000, areaBoost: 1.04 });
  const before = JSON.stringify({ players, state: second.state });
  const result = run(players, at + 120000, second.state);
  assert.equal(result.diagnostics.comparableSnapshot, true);
  assert.ok(result.diagnostics.observations.every(row =>
    row.length === result.diagnostics.observationColumns.length));
  for (const c of result.comparisons) {
    assert.equal(c.applied, true);
    assert.equal(c.rescue.name, "REBOUND_10");
    assert.equal(c.selected.length, 10);
    assert.equal(new Set(c.selected.map(p => p.name)).size, 10);
    assert.deepEqual(c.selected.slice(0, 9).map(p => p.name), players.slice(0, 9).map(p => p.name));
    assert.equal(c.selected[9].name, "REBOUND_10");
  }
  const observed = findResurfacingObservation(result, "REBOUND_10");
  assert.equal(observed.phaseImprovementSec, 70);
  assert.ok(observed.slotRankImprovement >= 3);
  assert.equal(observed.previousPhaseError, 100);
  assert.equal(observed.normalBoundaryScore, players[7].__slotScore);
  assert.ok(observed.crossBoundaryRatio > 1);
  assert.ok(observed.causes.includes("phase-anchor-changed"));
  assert.ok(observed.causes.includes("basic-area-changed"));
  assert.equal(observed.lastSelectedAtMs, at);
  const historyKey = `R7|${observed.key}`;
  assert.equal(result.state.history.find(h => h.key === historyKey).at, at);
  assert.equal(JSON.stringify({ players, state: second.state }), before);
  assert.deepEqual(run(players, at + 120000, second.state), result);
  const unchanged = run(players, at + 180000, result.state);
  assert.ok(unchanged.comparisons.every(c => !c.applied), "No improvement means no continued rescue");
  const expired = run(players, at + 31 * 60000, second.state);
  assert.equal(expired.comparisons[0].applied, false);
  assert.equal(expired.comparisons[1].applied, true, "Phase recovery does not require past selection");
  assert.equal(expired.state.history.some(h => h.key === historyKey), false);
});

test("resurfacing rejects missing Phase, cooldown, ambiguous identities and changed contexts", () => {
  const { at, pool, run, second, matching } = resurfacingFixture();
  const time = at + 120000;
  for (const changes of [
    { cooldownRemainingSec: 1 }, { cooldownRemainingSec: null }
  ]) {
    assert.ok(run(pool(30, 0.96, changes), time, second.state).comparisons.every(c => !c.applied));
  }
  const unknown = run(pool(0, 0.96, { phaseScore: 0 }), time, second.state);
  assert.equal(unknown.comparisons[1].applied, false);
  assert.equal(findResurfacingObservation(unknown, "REBOUND_10").phaseError, null);
  assert.equal(run(pool(0, 0.96), time, second.state).comparisons[1].applied, true);
  const duplicates = pool(30, 0.96);
  duplicates.push(duplicates[10]);
  assert.ok(run(duplicates, time, second.state).comparisons.every(c => !c.applied));
  const rankChanged = pool(30, 0.96);
  rankChanged[10] = { ...rankChanged[10], __rankKey: "R6" };
  assert.ok(run(rankChanged, time, second.state).comparisons.every(c => !c.applied));
  const managed = run(pool(30, 0.96, { isPinkManaged: true }), time, second.state);
  assert.ok(managed.comparisons.every(c => !c.applied));
  assert.equal(findResurfacingObservation(managed, "REBOUND_10"), undefined);
  for (const overrides of [{ viewerTier: "R6" }, { scoringConfigVersion: "changed" }]) {
    const result = run(pool(30, 0.96), time, second.state, overrides);
    assert.equal(result.diagnostics.comparableSnapshot, false);
    assert.ok(result.comparisons.every(c => !c.applied));
  }
  for (const invalidTime of [at, Date.parse("2026-10-27T04:00:00+09:00")]) {
    const result = run(pool(30, 0.96), invalidTime, second.state);
    assert.equal(result.diagnostics.comparableSnapshot, false);
    assert.ok(result.comparisons.every(c => !c.applied));
  }
  assert.throws(() => matching.buildCandidateResurfacingDiagnostics([], {
    evaluationTimeMs: NaN
  }), /finite evaluation time/);
  const tiny = run([], time, second.state);
  assert.ok(tiny.comparisons.every(c => !c.applied && c.selected.length === 0));
  const noWildcard = pool(30, 0.96).map(p => ({ ...p, __wildcard: false }));
  assert.ok(run(noWildcard, time, second.state).comparisons.every(c => !c.applied));
});

test("Yellow Phase shadow applies 0.70 to all selection routes and leaves Pink unchanged", () => {
  const context = createMatchingContext();
  const { buildShadowCandidateComparison, resolveScoringConfig, getCandidateCrossBucketScore } = context.ViewerMatching;
  const config = resolveScoringConfig({ meta: { schemaVersion: 1, version: "test" } });
  const pool = Array.from({ length: 15 }, (_, i) => {
    const pink = i < 3;
    const effective = 0.56;
    const slot = 1.1 * effective * 1.05 * 0.9 * 1.3;
    return Object.freeze({
      name: `P${i}`, __rankKey: "R7", __score: 0.1 * 1.1 * effective, __slotScore: slot,
      __detail: Object.freeze({
        isPinkManaged: pink, slotBucket: "R7", slotScore: slot,
        phaseWeight: 0.55, phaseTrust: 0.5, finalPhaseScore: 0.2,
        effectivePhaseScore: effective, historicalScore: 0.1, realtimeBoost: 1.1,
        pinkMismatchBoostFactor: 1, areaBoost: 1.05, prideBandPriorWeight: 0.9,
        recentAreaAppliedBoost: 1.3, recentAreaCounterfactualBoostWindow: 1.3,
        tierProbability: 0.5, tierCandidateCount: 15
      })
    });
  });
  const snapshot = JSON.stringify(pool);
  const result = buildShadowCandidateComparison(pool, {
    variant: "yellowPhase", scoringConfig: config,
    slotPlan: [{ bucket: "R7", slots: 8 }], evaluationTimeMs: Date.now()
  });
  assert.equal(result.selected.length, 10);
  assert.equal(result.selected.filter(p => p.__detail.isPinkManaged).length, 3);
  const yellow = result.selected.find(p => !p.__detail.isPinkManaged);
  assert.equal(yellow.__detail.phaseWeight, 0.7);
  assert.ok(Math.abs(yellow.__detail.effectivePhaseScore - 0.44) < 1e-12);
  assert.ok(Math.abs(yellow.__score - 0.1 * 1.1 * 0.44) < 1e-12);
  assert.ok(Math.abs(yellow.__slotScore - 1.1 * 0.44 * 1.05 * 0.9 * 1.3) < 1e-12);
  assert.ok(Math.abs(getCandidateCrossBucketScore(yellow) - 0.5 / 15 * 1.1 * 0.44 * 1.05 * 1.3) < 1e-12);
  const pink = result.selected.find(p => p.__detail.isPinkManaged);
  assert.equal(pink.__detail.phaseWeight, 0.55);
  assert.equal(pink.__detail.effectivePhaseScore, 0.56);
  assert.equal(yellow.__detail.phaseTrust, 0.5);
  assert.equal(result.parameters.scoringTrustApplied, false);
  assert.equal(JSON.stringify(pool), snapshot);
  config.experimental.yellowPhase.enabled = false;
  assert.equal(buildShadowCandidateComparison(pool, {
    variant: "yellowPhase", scoringConfig: config, slotPlan: []
  }).status, "disabled");
  assert.throws(() => buildShadowCandidateComparison(pool, { variant: "unknown" }), /Unknown diagnostic/);
  assert.equal(context.ViewerMatching.computeSoftmaxBacktestPreview, undefined);
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

test("normal slot selection groups candidates once and preserves stable score ties", () => {
  const { selectNormalCandidatesBySlots } = createMatchingContext().ViewerMatching;
  let rankReads = 0;
  const candidates = ["R6", "R7"].flatMap(rank => Array.from({ length: 3 }, (_, i) => ({
    name: `${rank}_${i}`, __slotScore: 1 - i * 0.1,
    get __rankKey() { rankReads++; return rank; }
  })));
  const plan = [{ bucket: "R6", slots: 2 }, { bucket: "R7", slots: 2 }];
  const state = {};
  const selected = selectNormalCandidatesBySlots(candidates, 4, {}, plan, { state });
  assert.equal(rankReads, candidates.length);
  assert.deepEqual(Array.from(selected, p => p.name), ["R6_0", "R7_0", "R6_1", "R7_1"]);
  assert.deepEqual(Array.from(selected, p => p.__slotBucket), ["R6", "R7", "R6", "R7"]);
  assert.equal(JSON.stringify(state.matchingSlotPlan), JSON.stringify(plan));
  assert.ok(candidates.every(p => p.__slotScore === (p.name.endsWith("_0") ? 1 :
    p.name.endsWith("_1") ? 0.9 : 0.8)));
});

test("recent AREA is disabled by default but retains history and explicit diagnostic settings", () => {
  const { getRecentAreaBoostConfig, applyCandidateAreaHistoryBoost } = createMatchingContext().ViewerMatching;
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "scoring_config.json"), "utf8"));
  const defaults = getRecentAreaBoostConfig();
  const configured = getRecentAreaBoostConfig(config);
  assert.equal(defaults.windowSize, 5);
  assert.equal(configured.windowSize, 5);
  assert.equal(defaults.enabled, false);
  assert.equal(configured.weight, 0);
  assert.equal(configured.maxMultiplier, 1);
  assert.equal(Object.hasOwn(config.candidateSelection, "maxPinkManagedSlots"), false);
  assert.equal(Object.hasOwn(config, "realtimeBoost"), false);
  const history = [{ area: "old" }, ...Array.from({ length: 5 }, () => ({ area: "recent" }))];
  const candidates = ["old", "recent"].map(area => ({
    area, __rankKey: "R6", __slotScore: 1, __detail: {}
  }));
  applyCandidateAreaHistoryBoost(candidates, { copyAreaHistory: history, scoringConfig: config });
  assert.equal(candidates[0].__slotScore, 1);
  assert.equal(candidates[1].__slotScore, 1);
  assert.equal(candidates[1].__detail.recentAreaMatchCount5, 5);
  config.candidateSelection.areaBoost.recentMatch.enabled = true;
  applyCandidateAreaHistoryBoost(candidates, { copyAreaHistory: history, scoringConfig: config });
  assert.equal(candidates[1].__slotScore, 1.3);
  applyCandidateAreaHistoryBoost(candidates, { copyAreaHistory: history, scoringConfig: config });
  assert.equal(candidates[1].__slotScore, 1.3);
  assert.equal(getRecentAreaBoostConfig({
    candidateSelection: { areaBoost: { recentMatch: { enabled: true, weight: 1 } } }
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
  assert.equal(Object.hasOwn(config.candidateSelection, "maxPinkManagedSlots"), false);
  assert.equal(Object.hasOwn(config, "realtimeBoost"), false);
  assert.throws(() => resolveScoringConfig({
    ...source, candidateSelection: { ...source.candidateSelection, maxPinkManagedSlots: 2 }
  }), /unknown setting: candidateSelection.maxPinkManagedSlots/);
  assert.equal(config.phase.yellow.weight, 0.55);
  assert.equal(config.phase.pink.weight, 0.55);
  assert.equal(source.phase.yellow.maxSampleAgeSec, 2700);
  assert.equal(config.phase.yellow.maxSampleAgeSec, source.phase.yellow.maxSampleAgeSec);
  const snapshot = getScoringConfigSnapshot(config);
  assert.equal(snapshot.version, source.meta.version);
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.effective.phase.yellow.weight, 0.55);
  assert.equal(config.phase.yellow.weight, 0.55);
  assert.equal(snapshot.phaseScoring.scoringTrustApplied, false);
  assert.equal(snapshot.phaseScoring.formula, "1 - phaseWeight * (1 - finalPhaseScore)");
  const capped = resolveScoringConfig({ ...source, phase: { ...source.phase, yellow: {
    ...source.phase.yellow, weight: 0.8
  } } });
  assert.equal(getScoringConfigSnapshot(capped).effective.phase.yellow.weight, 0.55);
  assert.equal(capped.phase.yellow.weight, 0.8);
  assert.equal(config.candidateSelection.slotAllocation.relativePopulationAdjustment.enabled, true);
  assert.equal(config.phaseError.yellowLambda, 0.06);
  assert.equal(config.phaseError.pinkLambda, 0.03);
  assert.equal(config.candidateSelection.areaBoost.recentMatch.enabled, false);
  assert.equal(snapshot.effective.candidateSelection.areaBoost.recentMatch.weight, 0);
  assert.equal(getMatchingSlotCounts(config).normal, 8);
  const defaults = resolveScoringConfig({ meta: { schemaVersion: 1, version: "minimal" } });
  assert.equal(config.viewerDefaults.filterMinutes, 15);
  assert.equal(defaults.viewerDefaults.filterMinutes, 15);
  assert.equal(resolveScoringConfig({ ...source, viewerDefaults: {
    ...source.viewerDefaults, filterMinutes: 30
  } }).viewerDefaults.filterMinutes, 30);
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
    [["experimental", "dayRelativeArea", "weight"], 1.1],
    [["experimental", "dayRelativeArea", "smoothingCount"], 0],
    [["experimental", "yellowPhase", "weight"], "0.70"],
    [["experimental", "yellowPhase", "enabled"], 1],
    [["experimental", "softmaxBacktest"], { enabled: true, temperature: 0.15 }],
    [["realtimeBoost"], { playerWeight: 0.35 }],
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
