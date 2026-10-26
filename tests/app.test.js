const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Ensure browser globals are mocked for Node.js test environment
globalThis.window = {
  addEventListener: () => {},
  removeEventListener: () => {}
};
globalThis.document = {
  getElementById: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  createElement: (tag) => ({
    getContext: () => ({ measureText: (s) => ({ width: (s || '').length * 8 }) }),
    style: {}
  })
};
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {}
};

const ViewerUtils = require('../0100_utils.js');
const ViewerDomain = require('../0200_domain.js');
const ViewerPersistence = require('../0300_persistence.js');
const ViewerData = require('../0400_data.js');
globalThis.ViewerDomain = ViewerDomain;
const ViewerMatching = require('../0500_matching.js');
const ViewerUI = require('../0600_ui.js');
const ViewerApp = require('../0700_app.js');

test('App constants and configuration are exported', () => {
  assert.equal(typeof ViewerApp.BASE_URL, 'string');
  assert.equal(ViewerApp.STATE.SUMMARY, 'summary');
  assert.equal(ViewerApp.STATE.DETAIL, 'detail');
  assert.equal(ViewerApp.STATE.MATCHING, 'matching');
  assert.equal(ViewerApp.DEFAULT_FILTER_MINUTES, 30);
  assert.equal(ViewerApp.DEFAULT_MY_RANK_KEY, 'R7');
  assert.equal(typeof ViewerApp.ANALYSIS_SCRIPT_VERSION, 'string');
  assert.ok(Array.isArray(ViewerApp.ALL_CANDIDATES_COLUMNS));
  assert.ok(ViewerApp.ALL_CANDIDATES_COLUMNS.includes('slotScore'));
});

test('Pink cycle learning respects zero shift and zero alpha settings', () => {
  const { State } = ViewerApp;
  const previous = {
    scoringConfig: State.scoringConfig, pinkTargets: State.pinkTargets,
    phaseAdjust: State.phaseAdjust, phaseDiag: State.phaseDiag,
    pinkCycleState: State.pinkCycleState
  };
  try {
    State.scoringConfig = { phase: { pink: { baseCycleSec: 345, maxShiftSec: 0, alpha: 0, minSamples: 8 } } };
    State.phaseAdjust = { yellow: 0, pink: 12 };
    assert.equal(ViewerApp.calcPinkCycle(), 345);
    State.scoringConfig.phase.pink.maxShiftSec = 45;
    State.phaseAdjust.pink = 0;
    State.pinkTargets = { test: { history: [1000, 376000] } };
    assert.equal(ViewerApp.calcPinkCycle({ learn: true }), 345);
    assert.equal(State.phaseAdjust.pink, 0);
  } finally {
    Object.assign(State, previous);
  }
});

test('Pink startup migrates legacy adjustment once and preserves learned cycle across restarts', () => {
  const { State } = ViewerApp;
  const previous = {
    scoringConfig: State.scoringConfig, phaseAdjust: State.phaseAdjust,
    pinkCycleState: State.pinkCycleState, phaseDiag: State.phaseDiag,
    pinkTargets: State.pinkTargets, yellowSamples: State.yellowSamples
  };
  const originalStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
  try {
    State.scoringConfig = ViewerMatching.resolveScoringConfig(
      JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scoring_config.json'), 'utf8')));
    State.phaseAdjust = { yellow: 4.16, pink: 23.430700054742243 };
    State.pinkCycleState = null;
    State.pinkTargets = {};
    State.yellowSamples = [1, 2, 3];
    ViewerApp.initializePinkCycleState();
    assert.equal(ViewerApp.calcPinkCycle(), 345);
    assert.equal(State.phaseAdjust.yellow, 4.16);
    assert.deepEqual(State.yellowSamples, [1, 2, 3]);
    assert.equal(State.pinkCycleState.source, 'initial');
    const initial = JSON.stringify(State.pinkCycleState);
    ViewerApp.restorePinkStateFromStorage();
    ViewerApp.initializePinkCycleState();
    assert.equal(JSON.stringify(State.pinkCycleState), initial);

    State.pinkTargets = { test: { history: [1000, 376000] } };
    const learnedCycle = ViewerApp.calcPinkCycle({ learn: true });
    assert.notEqual(learnedCycle, 345);
    assert.equal(State.pinkCycleState.sampleCount, 1);
    assert.equal(State.pinkCycleState.trust, Math.sqrt(1 / 8));
    assert.equal(State.pinkCycleState.source, 'encounter-learning');
    ViewerApp.savePinkStateToStorage();
    const metadata = JSON.stringify(State.pinkCycleState);
    State.phaseAdjust.pink = 0;
    State.pinkCycleState = null;
    ViewerApp.restorePinkStateFromStorage();
    ViewerApp.initializePinkCycleState();
    assert.equal(ViewerApp.calcPinkCycle(), learnedCycle);
    assert.equal(JSON.stringify(State.pinkCycleState), metadata);
    ViewerApp.applyScoringConfigJson(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scoring_config.json'), 'utf8')));
    assert.equal(ViewerApp.calcPinkCycle(), learnedCycle);
    for (const invalid of [
      { ...State.pinkCycleState, baseCycleSec: 350 },
      { ...State.pinkCycleState, adjustSec: NaN },
      { ...State.pinkCycleState, trust: 2 },
      { ...State.pinkCycleState, version: 0 }
    ]) {
      State.pinkCycleState = invalid;
      ViewerApp.initializePinkCycleState();
      assert.equal(ViewerApp.calcPinkCycle(), 345);
      assert.equal(State.phaseAdjust.yellow, 4.16);
    }
  } finally {
    globalThis.localStorage = originalStorage;
    Object.assign(State, previous);
  }
});

test('Pink startup ignores the three historical residuals that previously produced 368.431 seconds', async () => {
  const { State } = ViewerApp;
  const previous = {
    scoringConfig: State.scoringConfig, phaseAdjust: State.phaseAdjust,
    pinkCycleState: State.pinkCycleState, yellowSamples: State.yellowSamples
  };
  const previousDB = ViewerPersistence.getLogDB();
  const records = [
    { isPinkManaged: true, scoreBreakdown: { signedPhaseError: 57.64738731744103 }, cycleCountAtCopy: 2 },
    { isPinkManaged: true, scoreBreakdown: { signedPhaseError: -103.24789493952926 }, cycleCountAtCopy: 9 },
    { isPinkManaged: true, scoreBreakdown: { signedPhaseError: 164.0149003831957 }, cycleCountAtCopy: 7 }
  ];
  const db = {
    transaction: () => ({ objectStore: () => ({
      getAll: () => {
        const request = { result: records };
        queueMicrotask(() => request.onsuccess());
        return request;
      }
    }) })
  };
  try {
    ViewerPersistence.setLogDB(db);
    State.scoringConfig = ViewerMatching.resolveScoringConfig(
      JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scoring_config.json'), 'utf8')));
    State.phaseAdjust = { yellow: 4, pink: 0 };
    State.pinkCycleState = null;
    State.yellowSamples = Array(50).fill({});
    ViewerApp.initializePinkCycleState();
    await ViewerApp.seedPhaseAdjustFromCopyHistory();
    await ViewerApp.seedPhaseAdjustFromCopyHistory();
    assert.equal(ViewerApp.calcPinkCycle(), 345);
    assert.equal(State.phaseAdjust.yellow, 4);
  } finally {
    ViewerPersistence.setLogDB(previousDB);
    Object.assign(State, previous);
  }
});

test('analysis diagnostics do not count unavailable Phase as a zero-error match', () => {
  const { State } = ViewerApp;
  const previous = {
    scoringConfig: State.scoringConfig, matchingScoredAll: State.matchingScoredAll,
    matchingRankedAll: State.matchingRankedAll, matchingList: State.matchingList,
    matchingContext: State.matchingContext
  };
  try {
    State.scoringConfig = ViewerMatching.resolveScoringConfig(
      JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scoring_config.json'), 'utf8'))
    );
    State.matchingContext = { evaluationTimeMs: Date.now() };
    State.matchingRankedAll = [];
    State.matchingList = [];
    State.matchingScoredAll = [
      { __rankKey: 'R7', __detail: { phaseError: 0, phaseScore: 0 } },
      { __rankKey: 'R7', __detail: { phaseError: 0, phaseScore: 1 } }
    ];
    const diagnostics = ViewerApp.buildAnalysisDiagnostics();
    assert.equal(diagnostics.phasePopulation.R7.phaseUnknown, 1);
    assert.equal(diagnostics.phasePopulation.R7.phaseUnder30, 1);
    assert.equal(diagnostics.provenance.scoringConfigVersion, State.scoringConfig.meta.version);
    assert.equal(Object.hasOwn(diagnostics.provenance, 'scoringConfigSnapshot'), false);
  } finally {
    Object.assign(State, previous);
  }
});

test('candidate timing logs preserve anchor types, missing values and exact cooldown boundary', () => {
  const { State } = ViewerApp;
  const previous = { ...State };
  try {
    State.scoringConfig = ViewerMatching.resolveScoringConfig(
      JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scoring_config.json'), 'utf8')));
    State.phaseAdjust = { yellow: 0, pink: 0 };
    State.pinkTargets = {};
    const evaluationTimeMs = Date.parse('2026-10-19T10:00:00+09:00');
    const player = { name: 'timing', shopname: 'S', updateDate: '2026/10/19 09:50:00' };
    const yellow = ViewerApp.getCandidateTimingLog(player, evaluationTimeMs);
    assert.equal(yellow.phaseAnchorType, 'last-update');
    assert.equal(yellow.phaseAnchorAtMs, Date.parse('2026-10-19T09:50:00+09:00'));
    assert.equal(yellow.lastUpdateAgeSec, 600);
    assert.equal(yellow.pinkLastEncounterAtMs, null);
    assert.equal(yellow.cooldownCycleSec, null);
    const missing = ViewerApp.getCandidateTimingLog({ name: 'missing', updateDate: 'invalid' }, evaluationTimeMs);
    assert.equal(missing.phaseAnchorAtMs, null);
    assert.equal(missing.phaseAnchorType, 'unavailable');
    assert.equal(missing.lastUpdateAtMs, null);
    assert.equal(missing.lastUpdateAgeSec, null);

    const target = { ...player, lastCopiedAt: evaluationTimeMs - 60000 };
    State.pinkTargets[ViewerDomain.buildPlayerIdentityKey(player)] = target;
    const pink = ViewerApp.getCandidateTimingLog(player, evaluationTimeMs);
    assert.equal(pink.phaseAnchorType, 'pink-last-copy');
    assert.equal(pink.phaseAnchorAtMs, target.lastCopiedAt);
    assert.equal(pink.pinkLastEncounterAgeSec, 60);
    assert.equal(pink.lastUpdateAgeSec, 600);
    assert.equal(pink.cooldownCycleSec, 345);
    assert.equal(pink.cooldownDurationSec, 517.5);
    assert.equal(pink.cooldownRemainingSec, 457.5);
    target.lastCopiedAt = evaluationTimeMs - 517500;
    assert.equal(ViewerApp.getCandidateTimingLog(player, evaluationTimeMs).cooldownRemainingSec, 0);
    for (const slim of [true, false]) {
      const breakdown = ViewerApp.buildScoreBreakdownLog(pink, slim);
      for (const key of Object.keys(pink)) assert.equal(breakdown[key], pink[key], key);
    }
    const row = ViewerApp.buildAllCandidateRow({ name: 'timing', __detail: pink });
    assert.equal(row.length, ViewerApp.ALL_CANDIDATES_COLUMNS.length);
    const decoded = Object.fromEntries(ViewerApp.ALL_CANDIDATES_COLUMNS.map((key, i) => [key, row[i]]));
    for (const key of Object.keys(pink)) assert.equal(decoded[key], pink[key], key);
  } finally {
    Object.assign(State, previous);
  }
});

test('Pink scoring uses Phase only even with legacy activity state and a Phase mismatch', () => {
  const { State } = ViewerApp;
  const previous = { ...State };
  try {
    State.scoringConfig = ViewerMatching.resolveScoringConfig(
      JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scoring_config.json'), 'utf8')));
    State.myRankKey = 'R7';
    State.phaseAdjust = { yellow: 0, pink: 0 };
    State.phaseDiag = { yellow: { sampleCount: 8, trust: 1 }, pink: { sampleCount: 8, trust: 1 } };
    State.pinkTargets = {};
    const now = Date.parse('2026-10-19T10:00:00+09:00');
    const player = {
      name: 'PHASE_ONLY', shopname: 'S', area: '1',
      onlineBattleRankId: ViewerDomain.RUBY_ID, starCnt: 7,
      updateDate: '2026/10/19 09:45:00'
    };
    const target = { ...player, lastCopiedAt: now - 862500 };
    State.pinkTargets[ViewerDomain.buildPlayerIdentityKey(player)] = target;
    State.playerActivity = { PHASE_ONLY: { count: 100, lastSeen: now } };
    State.rankActivity = { R7: { count: 100, lastSeen: now } };
    const detail = ViewerApp.calcMatchingScoreDetail(player, { R7: 1 }, null, now);
    assert.equal(detail.isPinkManaged, true);
    assert.equal(detail.phaseAnchorType, 'pink-last-copy');
    assert.equal(detail.phaseAnchorAtMs, target.lastCopiedAt);
    assert.equal(detail.cycleSec, 345);
    assert.equal(detail.phaseWeight, 0.55);
    assert.equal(detail.phaseTrust, 1);
    assert.equal(detail.pinkPhaseMatched, false);
    assert.equal(detail.phaseError, 172.5);
    assert.equal(detail.realtimeBoost, 1);
    assert.equal(detail.playerBoost, 1);
    assert.equal(detail.rankBoost, 1);
    assert.equal(detail.pinkMismatchBoostFactor, 1);
    for (const key of ['playerActivitySignal', 'rankActivitySignal', 'playerRealtimeBonus',
      'rankRealtimeBonus', 'realtimeBonusBeforeCap', 'realtimeBonusCap']) assert.equal(detail[key], 0, key);
    assert.equal(detail.score, detail.historicalScore * detail.effectivePhaseScore);
    assert.ok(Math.abs(detail.effectivePhaseScore - (1 - 0.55 * (1 - detail.finalPhaseScore))) < 1e-12);
    State.playerActivity = {};
    State.rankActivity = {};
    assert.deepEqual(ViewerApp.calcMatchingScoreDetail(player, { R7: 1 }, null, now), detail);
    delete State.pinkTargets[ViewerDomain.buildPlayerIdentityKey(player)];
    const yellow = ViewerApp.calcMatchingScoreDetail(player, { R7: 1 }, null, now);
    assert.equal(yellow.phaseAnchorType, 'last-update');
    assert.equal(yellow.phaseWeight, 0.55);
    assert.equal(yellow.score, yellow.historicalScore * yellow.effectivePhaseScore);
  } finally {
    delete State.playerActivity;
    delete State.rankActivity;
    Object.assign(State, previous);
  }
});

test('Yellow and Pink apply identical Phase scoring independently of learning trust', () => {
  const { State } = ViewerApp;
  const previous = { ...State };
  try {
    State.scoringConfig = ViewerMatching.resolveScoringConfig(
      JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scoring_config.json'), 'utf8')));
    State.myRankKey = 'R7';
    State.phaseAdjust = { yellow: 0, pink: 0 };
    State.pinkTargets = {};
    const now = Date.parse('2026-10-19T10:00:00+09:00');
    const player = {
      name: 'COMMON_PHASE', shopname: 'S', area: '1',
      onlineBattleRankId: ViewerDomain.RUBY_ID, starCnt: 7,
      updateDate: '2026/10/19 09:45:00'
    };
    let baseline;
    for (const trust of [0, Math.sqrt(1 / 8), 1]) {
      State.phaseDiag = {
        yellow: { sampleCount: 1, trust },
        pink: { sampleCount: 1, trust: 1 - trust }
      };
      State.pinkTargets = {};
      const yellow = ViewerApp.calcMatchingScoreDetail(player, { R7: 1 }, null, now);
      State.pinkTargets[ViewerDomain.buildPlayerIdentityKey(player)] = {
        ...player, lastCopiedAt: now - 900000
      };
      const learningBefore = JSON.stringify({
        diag: State.phaseDiag, adjust: State.phaseAdjust, targets: State.pinkTargets
      });
      const pink = ViewerApp.calcMatchingScoreDetail(player, { R7: 1 }, null, now);
      for (const detail of [yellow, pink]) {
        assert.equal(detail.phaseWeight, 0.55);
        assert.ok(Math.abs(detail.effectivePhaseScore - (1 - 0.55 * (1 - detail.finalPhaseScore))) < 1e-12);
        assert.ok(detail.effectivePhaseScore >= 0.45 && detail.effectivePhaseScore <= 1);
      }
      assert.equal(yellow.phaseTrust, trust);
      assert.equal(pink.phaseTrust, 1 - trust);
      assert.equal(pink.phaseError, yellow.phaseError);
      assert.equal(pink.finalPhaseScore, yellow.finalPhaseScore);
      assert.equal(pink.effectivePhaseScore, yellow.effectivePhaseScore);
      assert.equal(pink.score, yellow.score);
      if (baseline !== undefined) assert.equal(pink.score, baseline);
      baseline = pink.score;
      assert.equal(JSON.stringify({
        diag: State.phaseDiag, adjust: State.phaseAdjust, targets: State.pinkTargets
      }), learningBefore);
    }
  } finally {
    Object.assign(State, previous);
  }
});

test('live and shadow selection retain more than two Pink candidates without cap backfill', () => {
  const { State } = ViewerApp;
  const previous = { ...State };
  const previousDB = ViewerPersistence.getLogDB();
  const origQSA = globalThis.document.querySelectorAll;
  const saved = [];
  try {
    globalThis.document.querySelectorAll = selector =>
      selector.includes('.ruby-filter:checked') ? [{ value: '7' }] : [];
    ViewerPersistence.setLogDB({
      transaction: () => ({ objectStore: () => ({
        put: record => saved.push(JSON.parse(JSON.stringify(record))),
        getAllKeys: () => ({})
      }) })
    });
    State.scoringConfig = ViewerMatching.resolveScoringConfig(
      JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scoring_config.json'), 'utf8')));
    State.myRankKey = 'R7';
    State.phaseAdjust = { yellow: 0, pink: 0 };
    State.phaseDiag = { yellow: { sampleCount: 8, trust: 1 }, pink: { sampleCount: 8, trust: 1 } };
    State.pinkTargets = {};
    State.copyAreaHistory = [];
    const now = Date.parse('2026-10-19T10:00:00+09:00');
    const players = Array.from({ length: 16 }, (_, i) => ({
      name: `UNCAPPED_${i}`, shopname: 'S', area: '1',
      onlineBattleRankId: ViewerDomain.RUBY_ID, starCnt: 7,
      updateDate: '2026/10/19 09:46:30'
    }));
    for (const player of players.slice(0, 6)) {
      State.pinkTargets[ViewerDomain.buildPlayerIdentityKey(player)] = { ...player, lastCopiedAt: now - 690000 };
    }
    const cooldownPlayer = players.at(-1);
    State.pinkTargets[ViewerDomain.buildPlayerIdentityKey(cooldownPlayer)] = {
      ...cooldownPlayer, lastCopiedAt: now - 60000
    };
    State.all = players;
    State.filtered = players;
    const learnedBefore = JSON.stringify({ adjust: State.phaseAdjust, diag: State.phaseDiag, targets: State.pinkTargets });
    ViewerApp.buildMatchingCandidates({ evaluationTimeMs: now, clickedAtMs: now, saveEvent: false });
    assert.equal(State.matchingList.length, 10);
    assert.equal(new Set(State.matchingList.map(p => p.name)).size, 10);
    assert.equal(State.matchingList.filter(p => p.__detail.isPinkManaged).length, 6);
    assert.equal(State.matchingScoredAll.some(p => p.name === cooldownPlayer.name), false);
    assert.equal(State.matchingCooldownExcludedCandidates[0].name, cooldownPlayer.name);
    assert.equal(State.matchingPinkCapDiagnostics.pinkCapEnabled, false);
    assert.equal(State.matchingPinkCapDiagnostics.maxPinkManagedSlots, null);
    assert.equal(State.matchingPinkCapDiagnostics.pinkCapDroppedCount, 0);
    assert.equal(State.matchingPinkCapDiagnostics.pinkManagedSlotsBeforeCap, 6);
    assert.equal(State.matchingPinkCapDiagnostics.pinkManagedSlotsAfterCap, 6);
    for (const comparison of ViewerApp.buildAnalysisDiagnostics().comparisons) {
      assert.equal(comparison.candidates.length, 10);
      assert.equal(comparison.candidates.filter(p => players.slice(0, 6).some(q => q.name === p.name)).length, 6);
    }
    assert.equal(JSON.stringify({ adjust: State.phaseAdjust, diag: State.phaseDiag, targets: State.pinkTargets }), learnedBefore);
    ViewerApp.saveCandidateEvent({ clickedAtMs: now, evaluationTimeMs: now });
    const record = saved.find(r => r.e === 'candidate');
    assert.ok(record);
    assert.equal(record.pinkCapEnabled, false);
    assert.equal(record.maxPinkManagedSlots, null);
    assert.equal(record.pinkMismatchEnabled, false);
    assert.equal(record.pinkMismatchFloor, null);
    assert.equal(record.pinkMismatchDecaySec, null);
    assert.equal(record.pinkCapDroppedCount, 0);
    assert.equal(record.pinkManagedSlotsAfterCap, 6);
    const decoded = record.allCandidates.map(row =>
      Object.fromEntries(record.allCandidatesColumns.map((key, i) => [key, row[i]])));
    for (const p of decoded) {
      assert.equal(p.realtimeBoost, 1);
      assert.equal(p.pinkMismatchBoostFactor, 1);
      assert.equal(p.playerActivitySignal, 0);
    }
    assert.equal(Object.hasOwn(record.scoringConfigSnapshot.effective, 'realtimeBoost'), false);
  } finally {
    ViewerPersistence.setLogDB(previousDB);
    globalThis.document.querySelectorAll = origQSA;
    Object.assign(State, previous);
  }
});

test('saved shadow diagnostics and timing logs do not change production candidates or learning', () => {
  const { State } = ViewerApp;
  const previous = { ...State };
  const previousDB = ViewerPersistence.getLogDB();
  const origQSA = globalThis.document.querySelectorAll;
  const saved = [];
  try {
    globalThis.document.querySelectorAll = selector =>
      selector.includes('.ruby-filter:checked') ? [{ value: '7' }] : [];
    ViewerPersistence.setLogDB({
      transaction: () => ({ objectStore: () => ({
        put: record => saved.push(JSON.parse(JSON.stringify(record))),
        getAllKeys: () => ({})
      }) })
    });
    State.scoringConfig = ViewerMatching.resolveScoringConfig(
      JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scoring_config.json'), 'utf8')));
    State.myRankKey = 'R7';
    State.phaseAdjust = { yellow: 0, pink: 0 };
    State.yellowSamples = [];
    State.phaseDiag = { yellow: { sampleCount: 8, trust: 1 }, pink: { sampleCount: 0, trust: 0 } };
    State.pinkTargets = {};
    const now = Date.parse('2026-10-19T10:00:00+09:00');
    const players = Array.from({ length: 16 }, (_, i) => ({
      name: `SHADOW_${i}`, shopname: 'S', area: i < 4 ? '1' : '2',
      onlineBattleRankId: ViewerDomain.RUBY_ID, starCnt: 7,
      updateDate: `2026/10/19 09:${50 + i % 8}:00`
    }));
    State.filtered = players;
    State.all = players;
    State.pinkTargets[ViewerDomain.buildPlayerIdentityKey(players[0])] = {
      ...players[0], lastCopiedAt: now - 60000
    };
    State.copyAreaHistory = [{ t: now - 20000, area: '1' }];
    const buildOptions = { evaluationTimeMs: now, clickedAtMs: now, saveEvent: false };
    ViewerApp.buildMatchingCandidates(buildOptions);
    const before = JSON.stringify({
      list: State.matchingList, scored: State.matchingScoredAll,
      plan: State.matchingSlotPlan, pink: State.pinkTargets,
      adjust: State.phaseAdjust, pinkCycle: State.pinkCycleState,
      samples: State.yellowSamples
    });
    const diagnostics = ViewerApp.buildAnalysisDiagnostics();
    assert.deepEqual(diagnostics.comparisons.map(c => c.id), [
      'pride-rescue-cross-slot', 'day-relative-area', 'yellow-phase-weight-070',
      'resurfacing-rank-score', 'resurfacing-phase'
    ]);
    for (const c of diagnostics.comparisons) {
      assert.equal(c.candidates.length, 10);
      assert.equal(new Set(c.candidates.map(p => p.name)).size, 10);
    }
    assert.equal(JSON.stringify({
      list: State.matchingList, scored: State.matchingScoredAll,
      plan: State.matchingSlotPlan, pink: State.pinkTargets,
      adjust: State.phaseAdjust, pinkCycle: State.pinkCycleState,
      samples: State.yellowSamples
    }), before);
    ViewerApp.saveCandidateEvent({ clickedAtMs: now, evaluationTimeMs: now });
    const record = saved.find(r => r.e === 'candidate');
    assert.ok(record);
    assert.equal(record.scriptVersion, ViewerApp.ANALYSIS_SCRIPT_VERSION);
    assert.equal(record.matchingScriptVersion, ViewerMatching.MATCHING_SCRIPT_VERSION);
    assert.equal(Object.hasOwn(record, 'softmaxBacktest'), false);
    assert.equal(record.analysisDiagnostics.storageCoverage.complete, true);
    assert.equal(record.logSchemaVersion, 'slot_area_v16_resurfacing_diagnostics');
    assert.equal(record.analysisDiagnostics.resurfacing.diagnosticOnly, true);
    assert.deepEqual(record.analysisDiagnostics.resurfacing, diagnostics.resurfacing);
    assert.deepEqual(record.analysisDiagnostics.comparisons, diagnostics.comparisons);
    const excluded = record.filteredPopulationAfterTimeAndRankFilters.pinkCooldownExcludedCandidates[0];
    assert.equal(excluded.name, 'SHADOW_0');
    assert.equal(excluded.cooldownRemainingSec, 457.5);
    assert.equal(excluded.cooldownCycleSec, 345);
    assert.equal(excluded.phaseAnchorAtMs, now - 60000);
    for (const row of record.allCandidates) {
      assert.equal(row.length, record.allCandidatesColumns.length);
      assert.equal(row[record.allCandidatesColumns.indexOf('phaseAnchorType')], 'last-update');
      assert.equal(typeof row[record.allCandidatesColumns.indexOf('lastUpdateAgeSec')], 'number');
    }
    assert.equal(record.candidates[0].scoreBreakdown.phaseAnchorType, 'last-update');
    const names = State.matchingList.map(p => p.name);
    State.scoringConfig.experimental.dayRelativeArea.enabled = false;
    State.scoringConfig.experimental.yellowPhase.enabled = false;
    ViewerApp.buildMatchingCandidates(buildOptions);
    assert.deepEqual(State.matchingList.map(p => p.name), names);
    assert.ok(ViewerApp.buildAnalysisDiagnostics().comparisons.slice(1, 3).every(c =>
      c.status === 'disabled' && c.candidates.length === 0 && c.removed.length === 0));
    const historyBeforePreview = JSON.stringify(State.matchingResurfacingState);
    ViewerApp.buildMatchingCandidates({
      ...buildOptions, mode: 'preview', evaluationTimeMs: now + 300000
    });
    assert.equal(State.matchingResurfacing, null);
    assert.equal(JSON.stringify(State.matchingResurfacingState), historyBeforePreview);
    ViewerApp.buildMatchingCandidates({ ...buildOptions, evaluationTimeMs: now + 60000 });
    assert.equal(State.matchingResurfacing.diagnostics.previousEvaluationTimeMs, now);
    assert.equal(State.matchingResurfacing.diagnostics.comparableSnapshot, true);
  } finally {
    globalThis.document.querySelectorAll = origQSA;
    ViewerPersistence.setLogDB(previousDB);
    Object.assign(State, previous);
  }
});

test('State object initialization and view state helpers', () => {
  assert.ok(Array.isArray(ViewerApp.State.all));
  assert.ok(Array.isArray(ViewerApp.State.filtered));
  assert.ok(Array.isArray(ViewerApp.State.matchingList));
  assert.equal(typeof ViewerApp.State.pinkTargets, 'object');

  ViewerApp.setCurrentView(ViewerApp.STATE.SUMMARY);
  assert.equal(ViewerApp.isCurrentView(ViewerApp.STATE.SUMMARY), true);
  assert.equal(ViewerApp.isCurrentView(ViewerApp.STATE.MATCHING), false);

  ViewerApp.setCurrentView(ViewerApp.STATE.MATCHING);
  assert.equal(ViewerApp.isCurrentView(ViewerApp.STATE.MATCHING), true);

  // Reset to summary
  ViewerApp.setCurrentView(ViewerApp.STATE.SUMMARY);
});

test('syncMyRankSelection updates rank and clears candidate caches on change', () => {
  ViewerApp.State.matchingList = [{ name: 'Dummy' }];
  const updated = ViewerApp.syncMyRankSelection('R5');
  assert.equal(updated, 'R5');
  assert.equal(ViewerApp.State.myRankKey, 'R5');
  assert.equal(ViewerApp.State.matchingList.length, 0);

  // Restore default
  ViewerApp.syncMyRankSelection('R7');
  assert.equal(ViewerApp.State.myRankKey, 'R7');
});

test('analysisChecksum produces consistent 8-character hash', () => {
  const hash1 = ViewerApp.analysisChecksum({ test: 123 });
  const hash2 = ViewerApp.analysisChecksum({ test: 123 });
  const hash3 = ViewerApp.analysisChecksum({ test: 456 });

  assert.equal(hash1, hash2);
  assert.notEqual(hash1, hash3);
  assert.equal(hash1.length, 8);
});

test('buildSummaryPopulationText formats rank counts and percentages', () => {
  const total = 100;
  const rankCounts = {
    R1: 5, R2: 5, R3: 5, R4: 5, R5: 5, R6: 5, // low ruby: 30
    R7: 20, R8: 10,                           // high ruby: 30
    P_A: 10, P_B: 10, P_C: 20                 // pride: 40
  };

  const text = ViewerApp.buildSummaryPopulationText(total, rankCounts);
  assert.ok(text.includes('計100人'));
  assert.ok(text.includes('R1～6＝30人[30%]'));
  assert.ok(text.includes('R7～8＝30人[30%]'));
  assert.ok(text.includes('PRIDE帯＝40人[40%]'));
});

test('getPinkTarget and self-healing lookups', () => {
  assert.equal(ViewerApp.getPinkTarget(null), null);

  const testPlayer = {
    name: 'TEST_DRIVER',
    shopname: 'SEGA_AKIHABARA',
    starCnt: 7
  };

  // Initially null
  const identityKey = ViewerDomain.buildPlayerIdentityKey(testPlayer);
  delete ViewerApp.State.pinkTargets[identityKey];
  assert.equal(ViewerApp.getPinkTarget(testPlayer), null);

  // Register target for today
  ViewerApp.State.pinkTargets[identityKey] = {
    name: 'TEST_DRIVER',
    shopname: 'SEGA_AKIHABARA',
    dateKey: ViewerPersistence.buildDailyKey(),
    copiedAt: Date.now()
  };

  const target = ViewerApp.getPinkTarget(testPlayer);
  assert.ok(target);
  assert.equal(target.name, 'TEST_DRIVER');
});

test('browser entry loads all modules in correct order in index.html', () => {
  const htmlPath = path.join(__dirname, '..', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, /id="copyStorageUsage"/);
  assert.doesNotMatch(html, /コピー記録は記録のある営業日|容量上限時は当営業日を保護/);

  const scriptMatches = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(m => m[1]);

  const scriptBaseNames = scriptMatches.map(s => s.split('?')[0]);

  const expectedOrder = [
    '0100_utils.js',
    '0200_domain.js',
    '0300_persistence.js',
    '0400_data.js',
    '0500_matching.js',
    '0600_ui.js',
    '0700_app.js',
    '0800_main.js'
  ];

  for (let i = 0; i < expectedOrder.length; i++) {
    const expected = expectedOrder[i];
    const actualIdx = scriptBaseNames.indexOf(expected);
    assert.ok(actualIdx >= 0, `Script ${expected} should be included in index.html`);
    if (i > 0) {
      const prev = expectedOrder[i - 1];
      const prevIdx = scriptBaseNames.indexOf(prev);
      assert.ok(
        actualIdx > prevIdx,
        `${prev} (index ${prevIdx}) must precede ${expected} (index ${actualIdx})`
      );
    }
  }
});

test('ViewerApp delegates matching and candidate calculations correctly', () => {
  assert.equal(typeof ViewerApp.calcMatchingScoreDetail, 'function');
  assert.equal(typeof ViewerApp.buildCandidateScore, 'function');
  assert.equal(typeof ViewerApp.buildMatchingCandidates, 'function');

  // Provide mock player for score calculation
  const mockPlayer = {
    name: 'TEST_DELEGATE_PLAYER',
    shopname: 'TEST_SHOP',
    starCnt: 7,
    areaNo: 1,
    time: Date.now() - 60000
  };

  const scoreDetail = ViewerApp.calcMatchingScoreDetail(mockPlayer, {
    baseNow: Date.now(),
    myRankKey: 'R7'
  });

  assert.ok(scoreDetail);
  assert.equal(typeof scoreDetail.score, 'number');
  assert.ok(Number.isFinite(scoreDetail.score));

  const candidateScore = ViewerApp.buildCandidateScore(mockPlayer);
  assert.equal(typeof candidateScore, 'object');
  assert.equal(typeof candidateScore.__score, 'number');
  assert.ok(Number.isFinite(candidateScore.__score));
});

test('ViewerApp persistence wrappers interact with State and storage correctly', () => {
  assert.equal(typeof ViewerApp.savePinkStateToStorage, 'function');
  assert.equal(typeof ViewerApp.restorePinkStateFromStorage, 'function');
  assert.equal(typeof ViewerApp.checkAndCleanDailyState, 'function');

  // Mock localStorage for test
  let storedData = {};
  globalThis.localStorage = {
    getItem: (k) => storedData[k] ?? null,
    setItem: (k, v) => { storedData[k] = String(v); },
    removeItem: (k) => { delete storedData[k]; },
    clear: () => { storedData = {}; }
  };

  const todayKey = ViewerPersistence.buildDailyKey();
  ViewerApp.State.pinkTargets['test_key'] = {
    name: 'TEST_PERSIST_PLAYER',
    dailyKey: todayKey,
    copiedAt: Date.now()
  };

  ViewerApp.savePinkStateToStorage();
  assert.ok(storedData[ViewerPersistence.PERSIST_STATE_KEY]);

  // Clear in-memory state and restore
  ViewerApp.State.pinkTargets = {};
  ViewerApp.restorePinkStateFromStorage();
  assert.ok(ViewerApp.State.pinkTargets['test_key']);
  assert.equal(ViewerApp.State.pinkTargets['test_key'].name, 'TEST_PERSIST_PLAYER');
});

test('exportTodayViewerLogsAsJSON uses active LogDB and exports candidateEvents', async () => {
  const now = Date.now();
  let downloadedContent = null;
  let downloadedFilename = null;

  // Mock document.createElement and URL for Node test environment
  const origCreateElement = globalThis.document.createElement;
  const origCreateObjectURL = globalThis.URL?.createObjectURL;
  const origRevokeObjectURL = globalThis.URL?.revokeObjectURL;
  if (!globalThis.URL) globalThis.URL = {};
  globalThis.URL.createObjectURL = () => 'blob:mock-url';
  globalThis.URL.revokeObjectURL = () => {};

  globalThis.document.createElement = (tag) => {
    if (tag === 'a') {
      return {
        set href(v) {},
        set download(v) { downloadedFilename = v; },
        click: () => {}
      };
    }
    return null;
  };

  // Intercept Blob constructor or capture before downloadBlob
  // In Node 18+, Blob is globally available. We can intercept downloadBlob via Blob.text or mock Blob
  const origBlob = globalThis.Blob;
  globalThis.Blob = class MockBlob {
    constructor(parts, opts) {
      downloadedContent = parts.join('');
      this.parts = parts;
      this.opts = opts;
    }
  };

  // Mock mockLogDB
  const mockCandidates = [
    { id: 1, t: now, candidates: [{ name: 'TEST_P1' }] }
  ];
  const mockEvents = [
    { id: 2, t: now, e: 'runtime', message: 'test' }
  ];

  const mockDb = {
    transaction: (stores, mode) => {
      const tx = {
        objectStore: (storeName) => {
          return {
            getAll: () => {
              const req = { onsuccess: null, onerror: null };
              setTimeout(() => {
                req.result = storeName === ViewerPersistence.LOG_STORE.candidateEvents
                  ? mockCandidates
                  : storeName === ViewerPersistence.LOG_STORE.copyEvents ? [] : mockEvents;
                if (req.onsuccess) req.onsuccess();
                if (storeName === ViewerPersistence.LOG_STORE.copyEvents) tx.oncomplete();
              }, 0);
              return req;
            }
          };
        }
      };
      return tx;
    }
  };

  ViewerPersistence.setLogDB(mockDb);
  const previousConfig = ViewerApp.State.scoringConfig;
  ViewerApp.State.scoringConfig = ViewerMatching.resolveScoringConfig(
    JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scoring_config.json'), 'utf8'))
  );

  await ViewerApp.exportTodayViewerLogsAsJSON();

  assert.ok(downloadedContent, 'downloadBlob should be called with blob content');
  assert.ok(downloadedFilename.startsWith('viewer_analysis_'), 'filename should match viewer_analysis pattern');

  const parsed = JSON.parse(downloadedContent);
  assert.equal(parsed.candidateEvents.length, 1);
  assert.equal(parsed.candidateEvents[0].candidates[0].name, 'TEST_P1');
  assert.equal(parsed.runtimeEvents.length, 1);
  assert.equal(parsed.scoringConfigSnapshot.version, ViewerApp.State.scoringConfig.meta.version);
  assert.equal(parsed.scoringConfigSnapshot.effective.phase.yellow.weight, 0.55);
  assert.equal(parsed.scoringConfigSnapshot.effective.candidateSelection.slots.normal, 8);
  assert.equal(parsed.scriptVersion, ViewerApp.ANALYSIS_SCRIPT_VERSION);
  assert.equal(parsed.matchingScriptVersion, ViewerMatching.MATCHING_SCRIPT_VERSION);

  // Restore mocks
  globalThis.document.createElement = origCreateElement;
  globalThis.URL.createObjectURL = origCreateObjectURL;
  globalThis.URL.revokeObjectURL = origRevokeObjectURL;
  globalThis.Blob = origBlob;
  ViewerPersistence.setLogDB(null);
  ViewerApp.State.scoringConfig = previousConfig;
});

test('regular export merges both copy stores and stops on read failure; temporary recovery is removed', async () => {
  const vm = require('node:vm');
  const source = fs.readFileSync(path.join(__dirname, '..', '0700_app.js'), 'utf8');
  const start = new Date(2026, 9, 25, 4).getTime();
  const end = new Date(2026, 9, 26, 4).getTime();
  for (const failure of [null, 'uninitialized', 'abort', 'read', 'json', 'storage']) {
    const messages = [];
    const downloads = [];
    const transactions = [];
    const records = [
      { t: start - 1 },
      { t: start, matchEventId: 'normal-1', candidateEventId: 123, n: 'normal' },
      { t: end - 1, matchEventId: 'manual-1', recordKind: 'unmatched-search-memo', searchMemo: 'memo' },
      { t: end }
    ];
    const local = {
      initialdac_copy_events_20261025: failure === 'json' ? '{' : JSON.stringify([records[1]]),
      matchingRealtimeActivity_v1: '{"legacy":true}',
      unrelated: 'do-not-export-this-value'
    };
    const db = {
      transaction(stores, mode) {
        transactions.push({ stores: [...stores], mode });
        const tx = {
          objectStore(name) {
            return {
              getAll() {
                const req = {};
                setTimeout(() => {
                  if (failure === 'read') {
                    req.error = new Error('read failed');
                    req.onerror();
                  } else if (failure === 'abort') {
                    tx.error = new Error('transaction aborted');
                    tx.onabort();
                  } else {
                    req.result = name === ViewerPersistence.LOG_STORE.copyEvents ? records : [];
                    req.onsuccess();
                    if (name === ViewerPersistence.LOG_STORE.copyEvents) tx.oncomplete();
                  }
                }, 0);
                return req;
              }
            };
          }
        };
        return tx;
      }
    };
    const context = vm.createContext({
      console: { error() {} }, setTimeout, Date,
      ViewerUtils, ViewerDomain, ViewerMatching, ViewerData,
      ViewerPersistence: {
        ...ViewerPersistence,
        getLogDB: () => failure === 'uninitialized' ? null : db,
        initLogDB: async () => { throw new Error('uninitialized'); }
      },
      ViewerUI: { ...ViewerUI, log: message => messages.push(message), logError: message => messages.push(message) },
      document: {
        getElementById: id => id === 'logExportDate' ? { value: '2026-10-25' } : null,
        createElement: () => ({ click() {} })
      },
      localStorage: {
        get length() { return Object.keys(local).length; },
        key: i => Object.keys(local)[i],
        getItem(key) {
          if (failure === 'storage') throw new Error('storage access denied');
          return local[key] ?? null;
        },
        setItem() { assert.fail('Recovery must not write localStorage'); },
        removeItem() { assert.fail('Recovery must not delete localStorage'); },
        clear() { assert.fail('Recovery must not clear localStorage'); }
      },
      Blob: class {
        constructor(parts) { downloads.push(parts.join('')); }
      },
      URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} }
    });
    vm.runInContext(source, context);
    assert.equal(context.ViewerApp.exportCopyRecovery20261025, undefined);
    await context.ViewerApp.exportTodayViewerLogsAsJSON();
    assert(transactions.every(tx => tx.mode === 'readonly'));
    if (failure) {
      assert.equal(downloads.length, 0);
      assert(messages.some(message => /失敗|中止/.test(message)));
    } else {
      const payload = JSON.parse(downloads[0]);
      assert.equal(payload.dateKey, '20261025');
      assert.deepEqual(payload.copyEvents, records.slice(1, 3));
      assert.equal(payload.copyEvents[0].candidateEventId, 123);
      assert(!downloads[0].includes('do-not-export-this-value'));
      assert(messages.some(message => message.includes('出力完了')));
    }
  }
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert(!html.includes('recoverCopyLogBtn'));
  const main = fs.readFileSync(path.join(__dirname, '..', '0800_main.js'), 'utf8');
  assert(!main.includes('exportCopyRecovery20261025'));
});

test('manual copies still reach IndexedDB after local quota failure and show explicit status', () => {
  const vm = require('node:vm');
  const errors = [];
  const info = [];
  const stored = [];
  const usage = {};
  let writes = 0;
  const context = vm.createContext({
    console: { error() {} }, Date, crypto: require('node:crypto'),
    ViewerUtils, ViewerDomain, ViewerMatching, ViewerData,
    ViewerPersistence: {
      ...ViewerPersistence,
      saveCopyRecordToStorage() {
        writes++;
        const error = new Error('quota exhausted');
        error.name = 'QuotaExceededError';
        throw error;
      },
      getLocalStorageUsage: () => 1048576,
      logEvent(type, record, options) {
        assert.equal(type, 'copy');
        stored.push(record);
        options.onSaved();
      }
    },
    ViewerUI: {
      ...ViewerUI, log: message => info.push(message),
      logWarn: message => info.push(message), logError: message => errors.push(message)
    },
    localStorage: {},
    document: {
      getElementById: id => id === 'searchInput' ? { value: 'outside memo' } :
        id === 'copyStorageUsage' ? usage : null,
      createElement: () => ({ style: {}, setAttribute() {}, select() {}, setSelectionRange() {}, remove() {} }),
      body: { appendChild() {} },
      execCommand: () => true
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '0700_app.js'), 'utf8'), context);
  context.ViewerApp.State.latestCandidateEventIdForCopy = 123;
  context.ViewerApp.recordUnmatchedSearchMemo();
  assert.equal(writes, 1);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].candidateEventId, 123);
  assert.equal(stored[0].searchMemo, 'outside memo');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /quota exhausted/);
  assert.match(usage.textContent, /1\.00 MiB/);
  assert(info.some(message => message.includes('メモを保存')));
});

test('buildMatchingCandidates correctly integrates normal, crossBucket and wildcard slots', () => {
  // Mock checkbox selection so UI filter passes all stars
  const origQSA = globalThis.document.querySelectorAll;
  globalThis.document.querySelectorAll = (selector) => {
    if (selector.includes('.ruby-filter:checked')) {
      return [{ value: '6' }, { value: '7' }];
    }
    if (selector.includes('.pride-filter:checked')) {
      return [];
    }
    return [];
  };

  // Setup 15 mock players across R6 and R7
  const mockPlayers = [];
  for (let i = 1; i <= 15; i++) {
    mockPlayers.push({
      name: `PLAYER_${i}`,
      shopname: `SHOP_${i}`,
      onlineBattleRankId: ViewerDomain.RUBY_ID,
      starCnt: i <= 10 ? 6 : 7,
      areaNo: 1,
      time: Date.now() - 60000,
      updateDate: '2026/10/13 15:00:00'
    });
  }

  ViewerApp.State.filtered = mockPlayers;
  ViewerApp.State.myRankKey = 'R6';

  ViewerApp.buildMatchingCandidates({ saveEvent: false });
  const candidates = ViewerApp.State.matchingList;
  assert.ok(Array.isArray(candidates));
  assert.ok(candidates.length <= 10);
  assert.ok(candidates.length >= 8);

  // Check if at least one wildcard or crossBucket was selected
  const hasSpecial = candidates.some(p => p.__crossBucket || p.__wildcard);
  assert.ok(hasSpecial, 'Should have selected cross-bucket or wildcard candidate');

  const previousConfig = ViewerApp.State.scoringConfig;
  const previousDistribution = ViewerApp.State.historicalMatchupDistribution;
  try {
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scoring_config.json'), 'utf8'));
    config.candidateSelection.slots = { normal: 7, crossBucket: 1, wildcard: 2 };
    ViewerApp.applyScoringConfigJson(config);
    ViewerApp.State.historicalMatchupDistribution = {
      historicalSupportSize: 2,
      byViewerTier: { R7: {
        total: 200,
        opponentTierMap: { R6: 0.5, R7: 0.5 },
        probList: [{ opponentTier: "R6", prob: 0.5 }, { opponentTier: "R7", prob: 0.5 }]
      } }
    };
    ViewerApp.buildMatchingCandidates({ saveEvent: false });
    assert.equal(ViewerApp.State.matchingSlotPlan.reduce((sum, p) => sum + p.slots, 0), 7);
    assert.equal(ViewerApp.State.matchingCrossBucketDiagnostics.wildcardSlotCount, 2);
    assert.equal(ViewerApp.State.matchingList.length, 10);
    assert.equal(ViewerApp.State.matchingPinkCapDiagnostics.maxPinkManagedSlots, null);
    assert.equal(ViewerApp.State.matchingPinkCapDiagnostics.pinkCapEnabled, false);
    assert.equal(ViewerApp.State.matchingContext.scoringConfigSnapshot.version, config.meta.version);
    assert.equal(ViewerApp.State.matchingContext.scoringConfigSnapshot.effective.candidateSelection.slots.wildcard, 2);
    const active = ViewerApp.State.scoringConfig;
    assert.throws(() => ViewerApp.applyScoringConfigJson({
      ...config, candidateSelection: { ...config.candidateSelection, maxPinkManagedSlots: -1 }
    }), /scoring_config.json/);
    assert.equal(ViewerApp.State.scoringConfig, active);
  } finally {
    ViewerApp.State.scoringConfig = previousConfig;
    ViewerApp.State.historicalMatchupDistribution = previousDistribution;
  }

  globalThis.document.querySelectorAll = origQSA;
});

test('applyMatchingFilter handles cross-search between MATCHING candidates and RANK summary', () => {
  // Setup mock DOM elements
  const elements = {};
  const createMockEl = (id) => ({
    id,
    style: {},
    textContent: '',
    innerHTML: '',
    querySelectorAll: () => []
  });

  const ids = [
    'matchingRankCounts',
    'matchingSearchResultsHeader',
    'matchingSearchResultsTitle',
    'matchingCandidateEmptyMessage',
    'matchingTableWrapper',
    'matchingCrossRankSection',
    'matchingCrossRankTitle',
    'matchingCrossRankEmptyMessage',
    'matchingCrossRankTableWrapper',
    'matchingTableBody',
    'matchingCrossRankTableBody'
  ];
  ids.forEach(id => { elements[id] = createMockEl(id); });

  const origGetElementById = globalThis.document.getElementById;
  globalThis.document.getElementById = (id) => elements[id] || null;

  // Setup mock State data
  const pMatching = {
    name: 'MATCH_TARGET',
    normalizedName: ViewerUtils.normalize('MATCH_TARGET'),
    shopname: 'SHOP1',
    area: 'AREA1',
    onlineBattleRankId: ViewerDomain.RUBY_ID,
    starCnt: 6,
    updateDate: '2026/10/14 08:00:00'
  };
  const pRankOnly = {
    name: 'RANK_ONLY_TARGET',
    normalizedName: ViewerUtils.normalize('RANK_ONLY_TARGET'),
    shopname: 'SHOP2',
    area: 'AREA2',
    onlineBattleRankId: ViewerDomain.RUBY_ID,
    starCnt: 7,
    updateDate: '2026/10/14 08:00:00'
  };

  ViewerApp.State.matchingList = [pMatching];
  ViewerApp.State.summary = [
    { key: 'R6', label: '★6', list: [pMatching] },
    { key: 'R7', label: '★7', list: [pRankOnly] }
  ];

  // Case 1: Empty search keyword -> returns to normal view
  ViewerApp.applyMatchingFilter('');
  assert.equal(elements.matchingRankCounts.style.display, 'flex');
  assert.equal(elements.matchingSearchResultsHeader.style.display, 'none');
  assert.equal(elements.matchingTableWrapper.style.display, 'block');
  assert.equal(elements.matchingCrossRankSection.style.display, 'none');

  // Case 2: Search matching candidate
  ViewerApp.State.searchText = 'MATCH';
  ViewerApp.applyMatchingFilter('MATCH');
  assert.equal(elements.matchingRankCounts.style.display, 'none');
  assert.equal(elements.matchingSearchResultsHeader.style.display, 'block');
  assert.ok(elements.matchingSearchResultsTitle.textContent.includes('1名'));
  assert.equal(elements.matchingTableWrapper.style.display, 'block');
  assert.equal(elements.matchingCandidateEmptyMessage.style.display, 'none');
  assert.equal(elements.matchingCrossRankSection.style.display, 'block');

  // Case 3: Search rank-only player (not in MATCHING candidates, but in RANK)
  ViewerApp.State.searchText = 'RANK_ONLY';
  ViewerApp.applyMatchingFilter('RANK_ONLY');
  // Matching candidate should show only the zero-count header.
  assert.ok(elements.matchingSearchResultsTitle.textContent.includes('0名'));
  assert.equal(elements.matchingTableWrapper.style.display, 'none');
  assert.equal(elements.matchingCandidateEmptyMessage.style.display, 'none');
  assert.equal(elements.matchingCandidateEmptyMessage.textContent, '');
  // Cross rank section should show 1 player
  assert.equal(elements.matchingCrossRankSection.style.display, 'block');
  assert.ok(elements.matchingCrossRankTitle.textContent.includes('1名'));
  assert.equal(elements.matchingCrossRankTableWrapper.style.display, 'block');
  assert.equal(elements.matchingCrossRankEmptyMessage.style.display, 'none');

  // Case 4: Search non-existent player
  ViewerApp.State.searchText = 'UNKNOWN_PLAYER';
  ViewerApp.applyMatchingFilter('UNKNOWN_PLAYER');
  assert.ok(elements.matchingSearchResultsTitle.textContent.includes('0名'));
  assert.equal(elements.matchingTableWrapper.style.display, 'none');
  assert.equal(elements.matchingCandidateEmptyMessage.style.display, 'none');
  assert.equal(elements.matchingCandidateEmptyMessage.textContent, '');
  assert.ok(elements.matchingCrossRankTitle.textContent.includes('0名'));
  assert.equal(elements.matchingCrossRankTableWrapper.style.display, 'none');
  assert.equal(elements.matchingCrossRankEmptyMessage.style.display, 'none');
  assert.equal(elements.matchingCrossRankEmptyMessage.textContent, '');

  // Restore mocks
  globalThis.document.getElementById = origGetElementById;
  ViewerApp.State.searchText = '';
});
