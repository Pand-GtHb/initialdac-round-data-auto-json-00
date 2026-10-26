(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([
      "./0100_utils.js",
      "./0200_domain.js",
      "./0300_persistence.js",
      "./0400_data.js",
      "./0500_matching.js",
      "./0600_ui.js"
    ], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("./0100_utils.js"),
      require("./0200_domain.js"),
      require("./0300_persistence.js"),
      require("./0400_data.js"),
      require("./0500_matching.js"),
      require("./0600_ui.js")
    );
  } else {
    root.ViewerApp = factory(
      root.ViewerUtils,
      root.ViewerDomain,
      root.ViewerPersistence,
      root.ViewerData,
      root.ViewerMatching,
      root.ViewerUI
    );
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (
  ViewerUtils,
  ViewerDomain,
  ViewerPersistence,
  ViewerData,
  ViewerMatching,
  ViewerUI
) {
  "use strict";

  const {
    normalize,
    normalizePlayerName,
    fmt,
    foldToCycle,
    updateAdjust,
    clamp,
    rejectFoldedOutliers
  } = ViewerUtils || {};

  const {
    RUBY_ID,
    RANKS,
    DEFAULT_PHASE_ERROR_SCALE_SEC,
    getRankIndex,
    getRankInfo,
    getPlayerRankKey,
    mapRankKeyToTierKey,
    buildPlayerIdentityKey,
    computePhaseMetrics,
    buildPhaseDirectionDetail,
    calcStats,
    buildRankPopulationSnapshot,
    normalizeHistoricalMatchupDistribution
  } = ViewerDomain || {};

  const {
    LOG_STORAGE_KEYS,
    LOG_STORAGE_LIMITS,
    LOG_STORE,
    buildDailyKey,
    saveCopyRecordToStorage,
    getLocalStorageUsage,
    isPinkTargetStale,
    initLogDB,
    getLogDB,
    putLog,
    logEvent,
    pruneLogStore,
    pruneCandidateEventsStore
  } = ViewerPersistence || {};

  const {
    PRODUCTION_BASE_URL,
    fetchJSON,
    fetchAreaListJson,
    fetchLatestRoundJson,
    fetchLatestUpdateJson,
    fetchHistoricalMatchupDistributionJson,
    fetchScoringConfigJson,
    fetchUpdateWatchConfigJson,
    fetchRoundDataJson
  } = ViewerData || {};

  const {
    MATCHING_SCRIPT_VERSION,
    resolveScoringConfig,
    getScoringConfigSnapshot,
    getMatchingSlotCounts,
    DEFAULT_PRIDE_BAND_DIVERSITY_GAP_THRESHOLD,
    buildViewerHistoricalContext,
    getHistoricalScoreDetail,
    buildAreaDensityContext,
    applyCandidateSlotScores,
    getRecentAreaBoostConfig,
    applyCandidateAreaHistoryBoost,
    applyCandidateAreaPhaseDiagnostics,
    getCandidateSlotScore,
    buildMatchingSlotBucketProbabilities,
    buildMatchingSlotPlan,
    adjustSlotsByRelativePopulation,
    selectNormalCandidatesBySlots,
    getCandidateSelectionScore,
    getCandidateCrossBucketScore,
    assignCandidateCrossBucketRanks,
    selectCrossBucketCandidates,
    selectWildcardCandidates,
    buildShadowCandidateComparisons,
    buildCandidateResurfacingDiagnostics
  } = ViewerMatching || {};

  const {
    switchDisplayView,
    startProgress,
    stopProgress,
    buildRubyFilters,
    buildPrideFilters,
    getAreaNavigationAreaNos,
    renderSummary,
    renderDetailTable,
    renderAreaDetailTable,
    renderPlayerRowsToBody,
    renderMatchingHeader,
    renderMatchingTable,
    renderMatchingRows,
    log,
    logWarn,
    logError
  } = ViewerUI || {};



/* #################################################################
 [LAYER 0000] Configuration / Constants
 ################################################################# */

const BASE_URL =
  PRODUCTION_BASE_URL ||
  "https://pand-gthb.github.io/initialdac-round-data-auto-json-00";

const DEFAULT_UPDATE_WATCH_CONFIG = Object.freeze({
  enabled: true,
  unrestricted: true,
  timezoneOffsetMinutes: 540,
  intervalSeconds: 30,
  windows: Object.freeze([])
});

const STATE = {
  SUMMARY: "summary",
  DETAIL: "detail",
  MATCHING: "matching"
};

const ANALYSIS_SCRIPT_VERSION = "analysis-v9-yellow-cycle5-20261026";
const ANALYSIS_LOG_SCHEMA_VERSION = "slot_area_v18_yellow_cycle5";
const MAX_LOG_LINES = 100;
const DEFAULT_FILTER_MINUTES = 15;
const DEFAULT_MY_RANK_KEY = "R7";
/*
 * 診断比較は本番選出・学習・保存上限を変更しない。
 * 候補外記録のsearchMemoは部分文字列でもよく、相手名ではない。
 * CSVの自ランク・店舗・前後の実績と照合し、曖昧なら未確定を維持する。
 * 比較案は完全な選出可能候補で計算し、結果だけ保存する。
 * 再浮上はセッション内の本番選出履歴だけを参照し、比較案を履歴に戻さない。
 */
function analysisChecksum(value) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}


function buildSummaryPopulationText(total, rankCounts) {
  let lowRubyCount = 0;
  for (let rank = 1; rank <= 6; rank++) {
    lowRubyCount += Number(rankCounts[`R${rank}`] ?? 0);
  }
  const highRubyCount =
    Number(rankCounts.R7 ?? 0) + Number(rankCounts.R8 ?? 0);
  const prideTotal = total - (lowRubyCount + highRubyCount);
  const percent = count => total ? Math.round(count / total * 100) : 0;
  return `計${fmt(total)}人：` +
    `R1～6＝${fmt(lowRubyCount)}人[${percent(lowRubyCount)}%]・` +
    `R7～8＝${fmt(highRubyCount)}人[${percent(highRubyCount)}%]・` +
    `PRIDE帯＝${fmt(prideTotal)}人[${percent(prideTotal)}%]`;
}

function buildAnalysisDiagnostics() {
  const startedAt = performance.now();
  const pool = State.matchingRankedAll;
  const current = State.matchingList;
  const identify = p => ({
    name: p.name,
    shopname: p.shopname ?? "",
    rankKey: p.__rankKey,
    slotScore: getCandidateSlotScore(p),
    score: getCandidateSelectionScore(p),
    crossBucketScore: getCandidateCrossBucketScore(p),
    selectionRoute: p.__wildcard ? "global-high-score"
      : p.__crossBucket ? "individual-probability" : "normal",
    phaseWeight: p.__detail?.phaseWeight ?? null,
    effectivePhaseScore: p.__detail?.effectivePhaseScore ?? null,
    phaseScore: p.__detail?.phaseScore ?? null,
    phaseDecay: p.__detail?.decay ?? null,
    finalPhaseScore: p.__detail?.finalPhaseScore ?? null,
    phaseError: p.__detail?.phaseError ?? null,
    phaseAnchorAtMs: p.__detail?.phaseAnchorAtMs ?? null,
    phaseAnchorType: p.__detail?.phaseAnchorType ?? null,
    cycleSec: p.__detail?.cycleSec ?? null,
    phaseCycleCount: p.__detail?.cycleCount ?? null,
    isPinkManaged: Boolean(p.__detail?.isPinkManaged),
    recentAreaBoost: p.__detail?.recentAreaAppliedBoost ?? null,
    basicAreaBoost: p.__detail?.areaBoost ?? null,
    combinedAreaBoost: Number.isFinite(p.__detail?.areaBoost) &&
      Number.isFinite(p.__detail?.recentAreaAppliedBoost)
      ? p.__detail.areaBoost * p.__detail.recentAreaAppliedBoost : null,
    areaExpectedCount: p.__detail?.diagnosticAreaExpectedCount ?? null,
    areaObservedCount: p.__detail?.diagnosticAreaObservedCount ?? null
  });
  const phasePopulation = {};
  for (const p of State.matchingScoredAll) {
    const key = p.__rankKey;
    const group = phasePopulation[key] ??= {
      count: 0, phaseUnknown: 0, phaseUnder30: 0,
      phase30To60: 0, phase60OrMore: 0, pinkManaged: 0
    };
    group.count++;
    if (p.__detail?.isPinkManaged) group.pinkManaged++;
    const error = p.__detail?.phaseError;
    if (!(p.__detail?.phaseScore > 0) || typeof error !== "number" || !Number.isFinite(error)) {
      group.phaseUnknown++;
    } else if (Math.abs(error) < 30) {
      group.phaseUnder30++;
    } else if (Math.abs(error) < 60) {
      group.phase30To60++;
    } else {
      group.phase60OrMore++;
    }
  }

  const currentKeys = new Set(current.map(buildPlayerIdentityKey));
  const finish = (id, parameters, selected, extra = {}) => {
    const selectedKeys = new Set(selected.map(buildPlayerIdentityKey));
    return {
      id, parameters, status: "computed",
      evaluatedCandidateCount: pool.length,
      candidates: selected.map(identify),
      added: selected.filter(p => !currentKeys.has(buildPlayerIdentityKey(p))).map(identify),
      removed: extra.status === "disabled" ? []
        : current.filter(p => !selectedKeys.has(buildPlayerIdentityKey(p))).map(identify),
      ...extra
    };
  };
  const comparisons = [];

  const rescuePool = pool.filter(p =>
    p.__detail?.slotBucket === "PRIDE" &&
    !current.includes(p) && !p.__detail?.isPinkManaged &&
    typeof p.__detail?.phaseError === "number" &&
    Number.isFinite(p.__detail.phaseError) &&
    Math.abs(p.__detail.phaseError) < 60 &&
    Number(p.__detail?.prideBandPriorWeight) > 0
  );
  const rescueScore = p =>
    getCandidateSlotScore(p) / p.__detail.prideBandPriorWeight;
  rescuePool.sort((a, b) => rescueScore(b) - rescueScore(a));
  const rescue = rescuePool[0];
  const cross = current.find(p => p.__crossBucket);
  const selected = current.slice();
  const eligibleViewer = /^R[78]$/.test(mapRankKeyToTierKey(State.myRankKey));
  if (eligibleViewer && rescue && cross) {
    selected[selected.indexOf(cross)] = rescue;
  }
  comparisons.push(finish("pride-rescue-cross-slot", {
    phaseLimitSec: 60, excludePinkManaged: true,
    eligibleViewerTiers: ["R7", "R8"],
    replacementRule: "replace-existing-cross-slot",
    removeBandPriorForRescueOnly: true
  }, selected, {
    applied: Boolean(eligibleViewer && rescue && cross),
    rescue: rescue ? { ...identify(rescue), rescueScore: rescueScore(rescue) } : null,
    replacement: eligibleViewer && rescue && cross ? identify(cross) : null
  }));
  for (const result of buildShadowCandidateComparisons(State.matchingScoredAll, {
    scoringConfig: State.scoringConfig,
    slotPlan: State.matchingSlotPlan,
    copyAreaHistory: State.copyAreaHistory,
    evaluationTimeMs: State.matchingContext.evaluationTimeMs
  })) {
    comparisons.push(finish(result.id, result.parameters, result.selected, {
      status: result.status, evaluatedCandidateCount: State.matchingScoredAll.length
    }));
  }
  for (const result of State.matchingResurfacing?.comparisons ?? []) {
    comparisons.push(finish(result.id, result.parameters, result.selected, {
      evaluatedCandidateCount: result.evaluatedCandidateCount,
      eligibleCandidateCount: result.eligibleCandidateCount,
      applied: result.applied, rescue: result.rescue
    }));
  }

  return {
    version: ANALYSIS_SCRIPT_VERSION,
    evaluatedAt: State.matchingContext.evaluationTimeMs,
    phasePopulationSource: "scoredCandidates",
    phasePopulation,
    resurfacing: State.matchingResurfacing?.diagnostics ?? {
      status: "unavailable", reason: State.matchingContext.mode === "preview"
        ? "preview-not-observed" : "no-prediction-in-session"
    },
    comparisons,
    computationMs: performance.now() - startedAt,
    provenance: {
      matchingScriptVersion: MATCHING_SCRIPT_VERSION,
      historicalMeta: State.historicalMatchupDistribution?.meta ?? null,
      historicalChecksum: analysisChecksum(State.historicalMatchupDistribution),
      scoringConfigChecksum: analysisChecksum(State.scoringConfig),
      scoringConfigVersion: State.matchingContext.scoringConfigSnapshot?.version ?? State.scoringConfig?.meta.version,
      historicalSampleCount: pool[0]?.__detail?.ownSampleCount ?? null,
      scoringConfig: State.scoringConfig
    }
  };
}

function updateCopyStorageUsage() {
  const element = document.getElementById("copyStorageUsage");
  try {
    const mib = getLocalStorageUsage() / (1024 * 1024);
    if (element) element.textContent = `localStorage使用量（UTF-16換算・推定）：${mib.toFixed(2)} MiB／上限・空き容量は取得不可`;
  } catch (error) {
    if (element) element.textContent = "localStorage使用量：取得失敗";
    console.error("保存容量の確認失敗", error);
    logError(`保存容量の確認失敗：${error.message}`);
  }
}

function persistCopyRecordLocally(record) {
  try {
    saveCopyRecordToStorage(record, localStorage, { onWarning: message => logWarn(message) });
  } catch (error) {
    console.error("コピー記録のlocalStorage保存失敗", error);
    logError(`コピー記録のlocalStorage保存失敗：${error.message}（IndexedDBへの保存を試みます）`);
  }
  updateCopyStorageUsage();
}

function recordUnmatchedSearchMemo() {
  const input = document.getElementById("searchInput");
  const searchMemo = String(input?.value ?? "").trim();
  if (!searchMemo) {
    logWarn("候補外記録：検索欄に照合用メモを入力してください");
    return;
  }
  const id = State.latestCandidateEventIdForCopy ?? State.activeCandidateEventId;
  const candidateEventId =
    id && State.matchingContext?.mode !== "preview"
      ? id
      : null;
  const t = Date.now();
  const record = {
    t, dk: buildDailyKey(), logSchemaVersion: ANALYSIS_SCRIPT_VERSION,
    scriptVersion: ANALYSIS_SCRIPT_VERSION,
    matchingScriptVersion: MATCHING_SCRIPT_VERSION,
    recordKind: "unmatched-search-memo",
    matchEventId: `manual-${crypto.randomUUID()}`,
    searchMemo, n: null, shopname: null, opponentTier: null,
    identityStatus: "unresolved", linkSource: candidateEventId
      ? "automatic-latest-prediction" : "no-prediction-available",
    candidateEventId, viewerTier: mapRankKeyToTierKey(State.myRankKey),
    matchStartedAt: null, wasInTop10: null,
    predictionSnapshotAvailable: false, unmatchedPlayer: true,
    scoreSource: "unavailable",
    populationAtCopy: {
      integratedData: buildRankPopulationSnapshot(State.all),
      filteredData: buildRankPopulationSnapshot(State.filtered)
    },
    integratedDataGeneratedAtAtCopy: State.generatedAt || null,
    dataPresenceStatus: "user-reported-absent-not-verified",
    dataPresenceObservedAt: t
  };
  persistCopyRecordLocally(record);
  logEvent("copy", record, {
    onError: message => logError(message),
    onSaved: () => log(`候補外対戦メモを保存：${searchMemo}（相手名未確定）`)
  });
  let temporaryInput = null;
  try {
    temporaryInput = document.createElement("textarea");
    temporaryInput.value = searchMemo;
    temporaryInput.setAttribute("readonly", "");
    temporaryInput.style.position = "fixed";
    temporaryInput.style.opacity = "0";
    document.body.appendChild(temporaryInput);
    temporaryInput.select();
    temporaryInput.setSelectionRange(0, temporaryInput.value.length);
    const copied = document.execCommand("copy");
    temporaryInput.remove();

    if (copied) {
      log(`候補外メモをクリップボードにコピー：${searchMemo}`);
      return;
    }

    if (!navigator.clipboard?.writeText) {
      throw new Error("Clipboard APIを利用できません");
    }
    navigator.clipboard.writeText(searchMemo)
      .then(() => log(`候補外メモをクリップボードにコピー：${searchMemo}`))
      .catch(error =>
        logError(`候補外メモのクリップボードコピー失敗：${error.message}`)
      );
  } catch (error) {
    temporaryInput?.remove();
    logError(`候補外メモのクリップボードコピー失敗：${error.message}`);
  }
}


/*
 * 【2026-09 ログ量対策②】allCandidates 配列化フォーマット
 *
 * 従来は候補1件ごとに { globalScoreRank: ..., name: ..., ... }
 * というキー名付きオブジェクトで保存しており、候補数が
 * 100～300件規模になるとキー名の重複だけでファイルサイズの
 * 大きな割合を占めていた。
 *
 * ここでは同じ情報を「列の並び順を固定した配列（行）」として
 * 保存し、列名は candidateEvent 1件につき1回だけ
 * allCandidatesColumns として記録する（自己記述的で、
 * 後から列の意味が分かるようにする）。
 *
 * 追加項目（2026-09 予測精度改善策の検証用）:
 *   isPinkManaged     : Phase起点・周期・信頼度・cooldownの
 *                        適用条件検証用
 *   historicalBackoff : historicalScoreがバックオフ値かどうか
 *                        （historicalScoreの信頼性検証用）
 *   decay             : Phase周期減衰。これが無いと
 *                        「実際の周期ズレ」と「経過周期数による
 *                        減衰」を区別できず、Matchingボタンの
 *                        最適タイミング分析ができなかったため追加。
 *
 * 除外した項目（イベント側へ統合）:
 *   ownSampleCount / adjacentSampleCount / minOwnSamplesForNoBackoff は
 *   同一candidateEvent内で全候補共通値（viewerTierのみに依存し
 *   opponentTierに依存しないことを実データで確認済み）のため、
 *   候補ごとの重複記録をやめ、candidateEventレコード側に
 *   1回だけ記録する。
 */
const CANDIDATE_TIMING_COLUMNS = [
  "phaseAnchorAtMs", "phaseAnchorType", "lastUpdate", "lastUpdateAtMs",
  "lastUpdateAgeSec", "pinkLastEncounterAtMs", "pinkLastEncounterAgeSec",
  "cooldownRemainingSec", "cooldownCycleSec", "cooldownDurationSec", "cycleSec"
];
const ALL_CANDIDATES_COLUMNS = [
  "globalScoreRank",
  "name",
  "shopname",
  "rankKey",
  "area",
  "score",
  "wasDisplayed",
  "displayRank",
  "isCrossBucket",
  "crossBucketRank",
  "crossBucketScore",
  "crossBucketSelectionReason",
  "isPinkManaged",
  "pinkPhaseMatched",
  "pinkMismatchBoostFactor",
  "historicalScore",
  "historicalBackoff",
  "tierProbability",
  "playerBoost",
  "rankBoost",
  "realtimeBoost",
  "playerActivitySignal",
  "rankActivitySignal",
  "playerRealtimeBonus",
  "rankRealtimeBonus",
  "realtimeBonusBeforeCap",
  "realtimeBonusCap",
  "slotScore",
  "slotBucket",
  "slotRank",
  "prideBandPriorWeight",
  "areaBucketCount",
  "areaTotalCount",
  "areaDensity",
  "areaBoost",
  "recentAreaMatchCount5",
  "recentAreaMatchCount10",
  "recentAreaMatchCount20",
  "recentAreaMatchCountWindow",
  "loggedAreaMatchCount",
  "loggedAreaMatchSampleCount",
  "loggedAreaMatchRate",
  "recentAreaMatchDensityWindow",
  "recentAreaCounterfactualBoostWindow",
  "recentAreaCounterfactualSlotScore",
  "recentAreaCounterfactualSlotRank",
  "areaBucketScoredCandidateCount",
  "areaBucketPhaseMatchedCount",
  "areaBucketPhaseMatchCount30",
  "areaBucketPhaseMatchCount60",
  "areaBucketPhaseScoreSum",
  "areaBucketPeerPhaseMatchedCount",
  "areaBucketPeerPhaseMatchCount30",
  "areaBucketPeerPhaseScoreSum",
  "areaBucketTop3BaseScoreSum",
  "areaPhaseDensity30",
  "areaPhaseCounterfactualBoost",
  "areaPhaseCounterfactualSlotScore",
  "areaPhaseCounterfactualSlotRank",
  "phaseError",
  "signedPhaseError",
  "peakDirection",
  "phaseBucket",
  "phaseScore",
  "decay",
  "finalPhaseScore",
  "effectivePhaseScore",
  "phaseWeight",
  "phaseSampleCount",
  "phaseTrust",
  "phaseAdjustValue",
  ...CANDIDATE_TIMING_COLUMNS
];

const MAX_YELLOW_PHASE_WEIGHT = 0.55;

/*
 * 【2026-09 改善6：C-3ハイブリッド計画 フェーズA】


/* #################################################################
 [LAYER 1000] Application State
 ################################################################# */

/* =========================================================
 [1000] Application State（旧 [0020]）
========================================================= */
const State = {
  all: [],
  filtered: [],
  summary: [],
  detailOriginal: [],
  generatedAt: "",
  latestRound: null,
  latestUpdateAt: "",
  searchText: "",
  currentView: STATE.SUMMARY,
  summaryMode: "rank",
  areaSortKey: "total",
  areaSortDir: "desc",
  currentDetailType: "rank",
  currentDetailKey: "",
  currentDetailLabel: "",
  currentDetailIcon: "",
  matchingList: [],
  matchingFilteredPopulationCount: 0,
  matchingCooldownExcludedCandidates: [],
  matchingRankedAll: [],
  matchingScoredAll: [],
  matchingResurfacing: null,
  matchingResurfacingState: null,
  matchingTierCounts: {},
  matchingSlotPlan: [],
  matchingSlotAllocationDiagnostics: null,
  matchingFilteredPopulationSnapshot: null,
  matchingCrossBucketDiagnostics: null,
  matchingPinkCapDiagnostics: null,
  matchingOffsetSec: 0,
  previewOffsetSec: 0,
  matchingContext: {
    mode: "matching",
    clickedAtMs: null,
    evaluationTimeMs: null,
    offsetSec: 0
  },
  copyAreaHistory: [],
  myRankKey: DEFAULT_MY_RANK_KEY,
  recentClicks: [],
  recentClickSet: null,
  historicalMatchupDistribution: null,
  scoringConfig: null,
  updateWatchConfig: null,
  updateWatchTimer: null,
  updateCheckRunning: false,
  updateWatchVisibilityHandler: null,
  updateWatchActiveWindowKey: "",
  pendingPrefetchForUpdateAt: "",
  prefetchedRoundData: null,
  prefetchedForUpdateAt: "",
  prefetchInFlight: null,

  phaseAdjust: {
    yellow: 0,
    pink: 0
  },
  pinkCycleState: null,

  /*
   * Phase学習の診断情報（分析用）
   *
   * calcYellowCycle/calcPinkCycle が learn:true で
   * 実行された際に更新される。読み取り専用モードの
   * 呼び出しでも最新の診断値を参照できるようにする。
   */
  phaseDiag: {
    yellow: {
      sampleCount: 0,
      trust: 1,
      adjustValue: 0
    },
    pink: {
      sampleCount: 0,
      trust: 1,
      adjustValue: 0
    }
  },

  activeCandidateEventId: null,
  latestCandidateEventIdForCopy: null,

  /* --- 新仕様追加（Fact） --- */
  pinkTargets: {},
  encounterHistory: {},

  /*
   * Yellow周期学習用
   * copiedAt - updateDate
   * の実績サンプルを保存
   */
  yellowSamples: []
};

/* =========================================================
 [1100] View State:isCurrentView【State】（旧 [0200]）
========================================================= */
function isCurrentView(view) {
  return State.currentView === view;
}

/* =========================================================
 [1110] View State:setCurrentView【State】（旧 [0210]）
========================================================= */
function setCurrentView(view) {
  State.currentView = view;
}

/* =========================================================
 [1200] My Rank State:syncMyRankSelection【State】（旧 [7020]）
========================================================= */
function syncMyRankSelection(
  rankValue
) {

  const previousMyRank =
    State.myRankKey;

  const selectedMyRank =
    rankValue ||
    State.scoringConfig
      ?.viewerDefaults
      ?.myRankKey ||
    DEFAULT_MY_RANK_KEY;

  const num =
    Number(
      String(selectedMyRank)
        .replace("R", "")
    );

  if (
    num >= 1 &&
    num <= 8
  ) {
    State.myRankKey = `R${num}`;

  } else {
    State.myRankKey = selectedMyRank;
  }

  if (State.myRankKey !== previousMyRank) {
    State.activeCandidateEventId = null;
    State.latestCandidateEventIdForCopy = null;
    State.matchingList = [];
    State.matchingFilteredPopulationCount = 0;
    State.matchingCooldownExcludedCandidates = [];
    State.matchingScoredAll = [];
    State.matchingRankedAll = [];
    State.matchingTierCounts = {};
    State.matchingSlotPlan = [];
    State.matchingSlotAllocationDiagnostics = null;
    State.matchingFilteredPopulationSnapshot = null;
    State.matchingCrossBucketDiagnostics = null;
    State.matchingPinkCapDiagnostics = null;
    State.matchingResurfacing = null;
    State.matchingResurfacingState = null;
    State.matchingContext = {
      mode: "matching",
      clickedAtMs: null,
      evaluationTimeMs: null,
      offsetSec: 0
    };
  }

  return State.myRankKey;
}


  if (typeof globalThis !== "undefined") { globalThis.State = State; }


/* #################################################################
 [LAYER 2000] Pure Utilities（DOM・State・永続化に触れない層）
 ################################################################# */

/* =========================================================
 [2000] Date Utility:getNowLabelJa（旧 [2000]）
========================================================= */
function getNowLabelJa() {

  const now = new Date();

  return now.toLocaleString(
    "ja-JP",
    {
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }
  );
}


/* =========================================================
 [2040] Date Utility:parseDateJST（旧 [2030] 内）
========================================================= */
const parseDateJST = str => {

  if (str == null) {
    return null;
  }

  let s = String(str).trim();

  s = s.replace(/\//g, "-");

  // 複数空白や改行を T に置換
  s = s.replace(/\s+/, "T");

  // 秒が無ければ補完
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) {
    s += ":00";
  }

  // 既にタイムゾーン表記があれば追加しない（Z または +HH or +HH:MM など）
  if (!/(?:Z|z|[+\-]\d{2}(?::\d{2})?)$/.test(s)) {
    s += "+09:00";
  }

  const d = new Date(s);

  return isNaN(d.getTime()) ? null : d;
};

/* =========================================================
 [2050] Date Utility:formatYMDHM（旧 [2040]）
========================================================= */
function formatYMDHM(date) {

  if (
    !date ||
    isNaN(date.getTime())
  ) {
    return "--/-- --:--";
  }

  const y = date.getFullYear();
  const m = ("0" + (date.getMonth() + 1)).slice(-2);
  const d = ("0" + date.getDate()).slice(-2);
  const hh = ("0" + date.getHours()).slice(-2);
  const mm = ("0" + date.getMinutes()).slice(-2);

  return `${y}/${m}/${d} ${hh}:${mm}`;
}

/* =========================================================
 [2060] Date Utility:formatClockHms（旧 [6150]）
========================================================= */
/*
 * 学習中のYellow/Pink周期を「現在時刻」を起点として
 * 1〜3周期前（過去方向）の窓（許容誤差帯）で可視化するための
 * 汎用モニターバー。
 *
 * 左端＝現在時刻で固定し、右にいくほど過去
 * （1周期前・2周期前・3周期前）を表す。
 *
 * 特定プレイヤーの実測値ではなく、学習済みの
 * 周期長・調整値・サンプル信頼度・許容誤差幅を
 * 一目で確認できるようにする目的の表示。
 */

function formatClockHms(ms) {

  return new Date(ms).toLocaleTimeString(
    "ja-JP",
    { hour12: false }
  );
}

/* =========================================================
 [2070] Date Utility:formatClockHm（旧 [6150b]）
========================================================= */
/*
 * バー内の時刻表示用（秒なし・時:分のみ）。
 * 帯自体がある程度の幅（許容誤差）を持つ表示のため、
 * 秒単位の厳密性は不要という判断による。
 */

function formatClockHm(ms) {

  const d = new Date(ms);

  const hh =
    String(d.getHours()).padStart(2, "0");

  const mm =
    String(d.getMinutes()).padStart(2, "0");

  return `${hh}:${mm}`;
}

function updateReloadViewerTime() {
  const timeEl = document.getElementById("reloadViewerTime");
  if (!timeEl) return;
  const parsed = parseDateJST(State.generatedAt);
  timeEl.textContent = parsed
    ? parsed.toLocaleTimeString("ja-JP", {
        timeZone: "Asia/Tokyo",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      })
    : "--:--";
  timeEl.title = parsed
    ? `Viewer読込済み更新時刻: ${State.generatedAt}`
    : "Viewer読込済み更新時刻: 未取得";
  timeEl.setAttribute("aria-label", timeEl.title);
}

function ensureReloadViewerTime() {
  const button = document.getElementById("reloadBtn");
  if (!button) return;
  if (!document.getElementById("reloadViewerTime")) {
    button.textContent = "⌚ ";
    const timeEl = document.createElement("span");
    timeEl.id = "reloadViewerTime";
    timeEl.setAttribute("aria-live", "polite");
    button.appendChild(timeEl);
    const labelEl = document.createElement("span");
    labelEl.className = "reload-button-label";
    labelEl.textContent = "　🔄 RELOAD";
    button.appendChild(labelEl);
  }
  updateReloadViewerTime();
}


/* =========================================================
 [2440] Math Utility:computeSampleTrust（周期学習：サンプル数信頼度）
 ※ 従来の線形カーブ（count/minSamples）から平方根カーブに変更し、
   少数サンプル時の立ち上がりを強化する。
   例（minSamples=8）：1件→35.4%／2件→50.0%／4件→70.7%／8件→100%
========================================================= */
function computeSampleTrust(
  sampleCount,
  minSamples
) {

  const count =
    Number(sampleCount);

  const min =
    Number(minSamples);

  if (
    !isFinite(min) ||
    min <= 0
  ) {
    return 1;
  }

  if (
    !isFinite(count) ||
    count <= 0
  ) {
    return 0;
  }

  return Math.min(
    1,
    Math.sqrt(count / min)
  );
}



function getPhaseLambda(mode = "yellow") {
  const isPink = mode === "pink";
  const value = Number(
    State.scoringConfig?.phaseError?.[isPink ? "pinkLambda" : "yellowLambda"]
  );

  return Number.isFinite(value) ? value : (isPink ? 0.03 : 0.06);
}

function getPhaseErrorScaleSec(
  mode = "yellow"
) {
  const config =
    State.scoringConfig?.phaseError ?? {};

  const value =
    Number(
      config[
        mode === "pink"
          ? "pinkScaleSec"
          : "yellowScaleSec"
      ] ??
      config.scaleSec ??
      DEFAULT_PHASE_ERROR_SCALE_SEC
    );

  return Number.isFinite(value) &&
    value > 0
      ? value
      : DEFAULT_PHASE_ERROR_SCALE_SEC;
}



/* =========================================================
 [3200] Data Applier:applyAreaListJson【State】（旧 [3120]）
========================================================= */
function applyAreaListJson(json) {

  AreaList = {};
  AreaIsoAlpha3 = {};

  if (
    json?.areas &&
    Array.isArray(json.areas)
  ) {

    json.areas.forEach(a => {

      AreaList[
        String(a.area)
      ] = a.areaName;

      if (a.isoAlpha3) {
        AreaIsoAlpha3[
          String(a.area)
        ] = String(a.isoAlpha3).toUpperCase();
      }

    });
  }

  log(
    "areaList.json 読み込み完了"
  );
}

/* =========================================================
 [3210] Data Applier:applyLatestRoundJson【State】【DOM】（旧 [3220]）
========================================================= */
function applyLatestRoundJson(
  json
) {

  if (
    !json?.latestRound
  ) {

    throw new Error(
      "latestRound が存在しません"
    );
  }

  State.latestRound =
    json.latestRound;

  const el =
    document.getElementById(
      "latestRound"
    );

  if (el) {

    el.textContent =
      State.latestRound;
  }

  log(
    "latest_round.json 読み込み完了"
  );
}

/* =========================================================
 [3220] Data Applier:applyLatestUpdateJson【State】（旧 [3320]）
========================================================= */
function applyLatestUpdateJson(
  json
) {

  let latest =
    json?.lastUpdated ??
    json?.latestUpdateAt ??
    "";

  if (
    typeof latest !==
    "string"
  ) {
    latest =
      String(latest ?? "");
  }

  State.latestUpdateAt =
    latest;

  if (!latest) {

    logWarn(
      "latest_update.json に更新時刻が存在しません"
    );

    return;
  }

  const parsed =
    parseDateJST(latest);

  const label =
    parsed
      ? formatYMDHM(parsed)
      : latest;

  log(
    "latest_update.json 読み込み完了 (" +
    label +
    ")"
  );
}

/* =========================================================
 [3230] Data Applier:applyHistoricalMatchupDistributionJson【State】（旧 [3420]）
========================================================= */
function applyHistoricalMatchupDistributionJson(
  json
) {

  State.historicalMatchupDistribution =
    normalizeHistoricalMatchupDistribution(
      json
    );

  log(
    "historical_matchup_distribution.json 読み込み完了"
  );
}

/* =========================================================
 [3240] Data Applier:applyScoringConfigJson【State】（旧 [3520]）
========================================================= */
function applyScoringConfigJson(
  json
) {

  const resolvedConfig = resolveScoringConfig(json);
  State.scoringConfig = resolvedConfig;
  initializePinkCycleState();

  const viewerDefaults =
    resolvedConfig.viewerDefaults;

  const filterMinutes =
    Number(
      viewerDefaults.filterMinutes ??
      DEFAULT_FILTER_MINUTES
    );

  const filterSelect =
    document.getElementById(
      "rangeSelect"
    );

  if (
    filterSelect &&
    Number.isFinite(filterMinutes) &&
    filterMinutes > 0 &&
    [...filterSelect.options].some(
      option =>
        Number(option.value) === filterMinutes
    )
  ) {
    filterSelect.value =
      String(filterMinutes);
  }

  const myRankKey =
    String(
      viewerDefaults.myRankKey ??
      DEFAULT_MY_RANK_KEY
    );

  const normalizedMyRankKey =
    syncMyRankSelection(
      myRankKey
    );

  const myRankSelect =
    document.getElementById(
      "myRankSelect"
    );

  if (
    myRankSelect &&
    [...myRankSelect.options].some(
      option =>
        option.value === normalizedMyRankKey
    )
  ) {
    myRankSelect.value =
      normalizedMyRankKey;
  }

  log(
    "scoring_config.json 読み込み完了"
  );
}

/* =========================================================
 [3250] Data Applier:applyRoundDataJson【State】【DOM】（旧 [3610]）
========================================================= */
function applyRoundDataJson(
  json,
  options = {}
) {

  State.latestCandidateEventIdForCopy =
    null;

  const {
    resetReloadButton = true
  } = options;

  State.generatedAt =
    json?.generatedAt ?? "";
  updateReloadViewerTime();

  const timeEl =
    document.getElementById(
      "jsonUpdateTime"
    );

  if (
    timeEl &&
    State.generatedAt
  ) {

    timeEl.textContent =
      formatYMDHM(
        parseDateJST(
          State.generatedAt
        )
      );
  }

  const records =
    json?.records || [];

  State.all =
    records.map(p => ({
      ...p,

      normalizedName:
        normalize(p.name),

      areaName:
        getAreaDisplayName(p.area)
    }));

  State.filtered =
    [...State.all];

  const genTime =
    State.generatedAt
      ? formatYMDHM(
          parseDateJST(
            State.generatedAt
          )
        )
      : "-";

  log(
    `integrated_data.json 読み込み完了 (${State.all.length}件：${genTime})`
  );

  if (
    resetReloadButton
  ) {

    const btn =
      document.getElementById(
        "reloadBtn"
      );

    if (btn) {

      btn.classList.remove(
        "update-alert"
      );

      btn.style.cssText = "";
    }
  }
}



/* #################################################################
 [LAYER 4000] Persistence（localStorage / IndexedDB）- 委譲ラッパー
 ################################################################# */
function checkAndCleanDailyState() {
  return ViewerPersistence.checkAndCleanDailyState(State);
}

function savePinkStateToStorage() {
  return ViewerPersistence.savePinkStateToStorage(State);
}

function restorePinkStateFromStorage() {
  return ViewerPersistence.restorePinkStateFromStorage(State);
}




/* =========================================================
 [5200] Data Loader:loadAreaList【State】（旧 [3100]）
========================================================= */
let AreaList = {};

let AreaIsoAlpha3 = {};

function getAreaDisplayName(area) {
  const areaKey = String(area ?? "");
  return AreaIsoAlpha3[areaKey] ||
    AreaList[areaKey] ||
    areaKey;
}

async function loadAreaList() {

  try {

    const json =
      await fetchAreaListJson();

    applyAreaListJson(json);

  } catch (e) {

    logError(
      "areaList.json の取得に失敗：" +
      e.message
    );

    AreaList = {};
    AreaIsoAlpha3 = {};
  }
}

/* =========================================================
 [5210] Data Loader:loadLatestRound【State】（旧 [3200]）
========================================================= */
async function loadLatestRound() {

  log(
    "latest_round.json 取得準備中"
  );

  try {

    const json =
      await fetchLatestRoundJson();

    applyLatestRoundJson(
      json
    );

  } catch (e) {

    logError(
      "latest_round.json の取得に失敗：" +
      e.message
    );
  }
}

/* =========================================================
 [5220] Data Loader:loadLatestUpdate【State】（旧 [3300]）
========================================================= */
async function loadLatestUpdate() {

  try {

    const json =
      await fetchLatestUpdateJson();

    applyLatestUpdateJson(
      json
    );

  } catch (e) {

    logWarn(
      "latest_update.json 未取得：" +
      e.message
    );
  }
}

/* =========================================================
 [5230] Data Loader:loadHistoricalMatchupDistribution【State】（旧 [3400]）
========================================================= */
async function loadHistoricalMatchupDistribution() {

  log(
    "historical_matchup_distribution.json 取得準備中"
  );

  try {

    const json =
      await fetchHistoricalMatchupDistributionJson();

    applyHistoricalMatchupDistributionJson(
      json
    );

  } catch (e) {

    State.historicalMatchupDistribution = null;

    logWarn(
      "historical_matchup_distribution.json 未取得：" +
      e.message
    );
  }
}

/* =========================================================
 [5240] Data Loader:loadScoringConfig【State】（旧 [3500]）
========================================================= */
async function loadScoringConfig() {

  try {

    const json =
      await fetchJSON(
        "scoring_config.json"
      );

    applyScoringConfigJson(
      json
    );

  } catch (e) {

    logWarn(
      "scoring_config.json 未取得：" +
      e.message
    );
    throw e;
  }
}

function applyUpdateWatchConfigJson(json) {
  if (
    typeof json?.enabled !== "boolean" ||
    (
      json?.unrestricted !== undefined &&
      typeof json.unrestricted !== "boolean"
    ) ||
    !Number.isInteger(json?.timezoneOffsetMinutes) ||
    json.timezoneOffsetMinutes < -720 ||
    json.timezoneOffsetMinutes > 840 ||
    !Number.isInteger(json?.intervalSeconds) ||
    json.intervalSeconds < 5 ||
    json.intervalSeconds > 3600 ||
    !Array.isArray(json?.windows) ||
    (
      json.unrestricted !== true &&
      json.windows.length === 0
    ) ||
    (
      json.unrestricted === true &&
      json.windows.length > 0
    )
  ) {
    throw new Error("設定の必須項目または値が不正です");
  }

  const windows = json.windows.map(window => {
    if (
      !Number.isInteger(window?.startMinute) ||
      window.startMinute < 0 ||
      window.startMinute > 59 ||
      !Number.isInteger(window?.durationMinutes) ||
      window.durationMinutes < 1 ||
      window.durationMinutes > 15 ||
      window.startMinute + window.durationMinutes > 60
    ) {
      throw new Error("監視窓の開始分または長さが不正です");
    }

    return {
      startMinute: window.startMinute,
      durationMinutes: window.durationMinutes
    };
  });

  windows.sort(
    (a, b) => a.startMinute - b.startMinute
  );

  for (let i = 1; i < windows.length; i++) {
    if (
      windows[i].startMinute <
      windows[i - 1].startMinute +
        windows[i - 1].durationMinutes
    ) {
      throw new Error("監視窓同士が重複しています");
    }
  }

  State.updateWatchConfig = {
    enabled: json.enabled,
    unrestricted: json.unrestricted === true,
    timezoneOffsetMinutes: json.timezoneOffsetMinutes,
    intervalSeconds: json.intervalSeconds,
    windows
  };

  const windowLabels = windows.map(
    window =>
      `${window.startMinute}～` +
      `${window.startMinute + window.durationMinutes}分`
  );
  const offsetHours =
    json.timezoneOffsetMinutes / 60;
  const timezoneLabel =
    `UTC${offsetHours >= 0 ? "+" : ""}${offsetHours}`;

  log(
    `update_watch_config.json 読み込み完了：` +
    `${timezoneLabel}、` +
    `${json.unrestricted === true ? "終日監視" : `毎時${windowLabels.join(" / ")}`}、` +
    `${json.intervalSeconds}秒間隔` +
    (json.enabled ? "" : "（監視無効）")
  );
}

async function loadUpdateWatchConfig() {
  try {
    const json =
      await fetchUpdateWatchConfigJson();

    applyUpdateWatchConfigJson(json);
  } catch (e) {
    State.updateWatchConfig = {
      enabled: DEFAULT_UPDATE_WATCH_CONFIG.enabled,
      unrestricted: DEFAULT_UPDATE_WATCH_CONFIG.unrestricted,
      timezoneOffsetMinutes:
        DEFAULT_UPDATE_WATCH_CONFIG.timezoneOffsetMinutes,
      intervalSeconds:
        DEFAULT_UPDATE_WATCH_CONFIG.intervalSeconds,
      windows:
        DEFAULT_UPDATE_WATCH_CONFIG.windows.map(
          window => ({ ...window })
        )
    };

    logWarn(
      "update_watch_config.json を適用できません。" +
      "既定の監視条件（時間帯制限なし）を使用します：" +
      e.message
    );
  }
}

/* =========================================================
 [5300] Prefetch:prefetchLatestRoundData【State】（旧 [3710]）
========================================================= */
async function prefetchLatestRoundData(
  lastUpdatedValue
) {

  if (
    !lastUpdatedValue
  ) {
    return;
  }

  if (
    State.prefetchedForUpdateAt ===
      lastUpdatedValue &&
    State.prefetchedRoundData
  ) {
    return;
  }

  if (
    State.prefetchInFlight
  ) {
    return State.prefetchInFlight;
  }

  State.prefetchInFlight =
    (async () => {

      const startedAt =
        performance.now();

      try {

        log(
          "先読み開始"
        );

        const json =
          await fetchRoundDataJson();

        const expectedTime =
          parseDateJST(lastUpdatedValue)?.getTime();
        const generatedTime =
          parseDateJST(json?.generatedAt)?.getTime();

        if (
          !Number.isFinite(expectedTime) ||
          !Number.isFinite(generatedTime) ||
          generatedTime !== expectedTime
        ) {
          logWarn(
            `先読み世代不一致：期待=${lastUpdatedValue} / ` +
            `取得=${json?.generatedAt ?? "none"}。監視窓内で再試行します`
          );
          return;
        }

        State.prefetchedRoundData =
          json;

        State.prefetchedForUpdateAt =
          lastUpdatedValue;
        State.pendingPrefetchForUpdateAt =
          "";

        const elapsed =
          Math.round(
            performance.now() -
            startedAt
          );

        const count =
          json?.records?.length ??
          0;

        log(
          `先読み成功:${count}件 通信時間:${elapsed}ms`
        );

      } catch (e) {

        logWarn(
          "先読み失敗:" +
          e.message
        );

        console.warn(
          "prefetch failed:",
          e.message
        );

      } finally {

        State.prefetchInFlight =
          null;
      }

    })();

  return State.prefetchInFlight;
}

/* =========================================================
 [5310] Reload:reloadLatestDataPreferPrefetch【State】（旧 [3700]）
========================================================= */
async function reloadLatestDataPreferPrefetch() {

  startProgress();

  try {

    const maxAttempts = 3;
    let latestObserved = "";
    let verifiedRoundData = null;
    let verifiedLatestAt = "";
    let verifiedFromPrefetch = false;

    for (
      let attempt = 1;
      attempt <= maxAttempts;
      attempt++
    ) {
      const beforeJson =
        await fetchLatestUpdateJson();
      const beforeValue =
        beforeJson?.lastUpdated ??
        beforeJson?.latestUpdateAt ??
        "";
      const beforeLatest =
        String(beforeValue || "");
      const beforeTime =
        parseDateJST(beforeLatest)?.getTime();

      if (!Number.isFinite(beforeTime)) {
        throw new Error(
          "最新更新時刻を取得または解析できません"
        );
      }
      latestObserved = beforeLatest;

      const prefetchedData =
        State.prefetchedRoundData;
      const prefetchedTime =
        parseDateJST(
          prefetchedData?.generatedAt
        )?.getTime();
      const prefetchedVersionTime =
        parseDateJST(
          State.prefetchedForUpdateAt
        )?.getTime();
      const usePrefetch =
        prefetchedData &&
        Number.isFinite(prefetchedTime) &&
        prefetchedTime === beforeTime &&
        Number.isFinite(prefetchedVersionTime) &&
        prefetchedVersionTime === beforeTime;

      log(
        `Reload 世代確認 ${attempt}/${maxAttempts}：` +
        `最新=${beforeLatest}、取得元=${usePrefetch ? "Prefetch" : "Network"}`
      );

      const roundDataJson =
        usePrefetch
          ? prefetchedData
          : await fetchRoundDataJson();
      const roundDataTime =
        parseDateJST(
          roundDataJson?.generatedAt
        )?.getTime();

      const afterJson =
        await fetchLatestUpdateJson();
      const afterValue =
        afterJson?.lastUpdated ??
        afterJson?.latestUpdateAt ??
        "";
      const afterLatest =
        String(afterValue || "");
      const afterTime =
        parseDateJST(afterLatest)?.getTime();

      if (!Number.isFinite(afterTime)) {
        throw new Error(
          "Reload後の最新更新時刻を取得または解析できません"
        );
      }
      latestObserved = afterLatest;

      const stateLatestTime =
        parseDateJST(State.latestUpdateAt)?.getTime();
      const generationMatches =
        Number.isFinite(roundDataTime) &&
        roundDataTime === beforeTime &&
        beforeTime === afterTime &&
        (
          !Number.isFinite(stateLatestTime) ||
          stateLatestTime <= afterTime
        );

      if (generationMatches) {
        verifiedRoundData = roundDataJson;
        verifiedLatestAt = afterLatest;
        verifiedFromPrefetch = Boolean(usePrefetch);
        log(
          `Reload 世代確認成功：generatedAt=${roundDataJson.generatedAt}`
        );
        break;
      }

      if (
        State.prefetchedRoundData &&
        (
          State.prefetchedRoundData === roundDataJson ||
          prefetchedTime !== afterTime
        )
      ) {
        State.prefetchedRoundData = null;
        State.prefetchedForUpdateAt = "";
      }

      State.pendingPrefetchForUpdateAt =
        afterLatest;
      logWarn(
        `Reload 世代不一致：公開=${beforeLatest}→${afterLatest} / ` +
        `取得=${roundDataJson?.generatedAt ?? "none"}。再試行します`
      );

      if (attempt < maxAttempts) {
        await new Promise(
          resolve => setTimeout(resolve, 1000)
        );
      }
    }

    if (!verifiedRoundData) {
      throw new Error(
        `最新世代を確認できませんでした（最新=${latestObserved || "不明"}）。` +
        "表示中のデータを維持します"
      );
    }

    log(
      `Reload 利用元：${verifiedFromPrefetch ? "Prefetch" : "Network"}`
    );
    applyRoundDataJson(
      verifiedRoundData,
      {
        resetReloadButton: true
      }
    );
    State.latestUpdateAt = verifiedLatestAt;
    State.pendingPrefetchForUpdateAt = "";
    State.prefetchedRoundData = null;
    State.prefetchedForUpdateAt = "";

    /* =====================================
     * 再集計
     * ===================================== */

    applyFilters();

    buildSummary();

    renderSummary();

    State.activeCandidateEventId =
      null;

    setCurrentView(
      STATE.SUMMARY
    );

    switchDisplayView(
      STATE.SUMMARY
    );

    /* =====================================
     * 完了ログ
     * ===================================== */

    log(
      "Reload完了：generatedAt=" +
      (
        State.generatedAt ||
        "none"
      )
    );

    return true;

  } catch (e) {

    logError(
      "Reload失敗：既存データを保持します：" +
      e.message
    );

    return false;

  } finally {

    stopProgress();
  }
}

/* =========================================================
 [5400] Update Watch:checkUpdate【State】【DOM】（旧 [3800]）
========================================================= */
async function checkUpdate() {

  const windowKey =
    getJstUpdateWatchWindow();

  if (!windowKey) {
    State.updateWatchActiveWindowKey = "";
    return;
  }

  if (
    windowKey !==
    State.updateWatchActiveWindowKey
  ) {
    State.updateWatchActiveWindowKey =
      windowKey;

    const config =
      State.updateWatchConfig ??
      DEFAULT_UPDATE_WATCH_CONFIG;
    const localDate = new Date(
      Date.now() +
      config.timezoneOffsetMinutes * 60 * 1000
    );
    const minute = localDate.getUTCMinutes();
    const activeWindow =
      config.unrestricted
        ? null
        : config.windows.find(
            window => {
              const secondOfHour =
                minute * 60 + localDate.getUTCSeconds();
              return (
                secondOfHour >= window.startMinute * 60 &&
                secondOfHour <
                  (window.startMinute + window.durationMinutes) * 60
              );
            }
          );
    const windowLabel =
      config.unrestricted
        ? "終日"
        : activeWindow
          ? `毎時${activeWindow.startMinute}～` +
            `${activeWindow.startMinute + activeWindow.durationMinutes}分`
          : "設定窓";

    log(
      `更新監視中：${windowLabel}（${config.intervalSeconds}秒間隔）`
    );
  }

  if (State.updateCheckRunning) {
    return;
  }

  State.updateCheckRunning = true;

  try {

    const prev =
      State.latestUpdateAt || "";

    const json =
      await fetchLatestUpdateJson();

    let latest =
      json?.lastUpdated ??
      json?.latestUpdateAt ??
      "";

    if (
      typeof latest !==
      "string"
    ) {
      latest =
        String(latest || "");
    }

    if (!latest) {
      return;
    }

    const changed =
      prev &&
      prev !== latest;

    const latestTime =
      parseDateJST(latest)?.getTime();
    const generatedTime =
      parseDateJST(State.generatedAt)?.getTime();
    const integratedDataBehind =
      Number.isFinite(latestTime) &&
      (
        !Number.isFinite(generatedTime) ||
        generatedTime < latestTime
      );

    if (integratedDataBehind) {
      State.pendingPrefetchForUpdateAt = latest;
    } else if (
      State.pendingPrefetchForUpdateAt &&
      !State.prefetchedRoundData
    ) {
      State.pendingPrefetchForUpdateAt = "";
    }

    if (changed) {
      if (
        State.prefetchedForUpdateAt !== latest
      ) {
        State.prefetchedRoundData = null;
        State.prefetchedForUpdateAt = "";
      }
    }
    State.latestUpdateAt = latest;

    /* =====================================
     * 更新検知
     * ===================================== */

    if (changed) {

      const btn =
        document.getElementById(
          "reloadBtn"
        );

      if (btn) {

        btn.classList.add(
          "update-alert"
        );

        btn.style.cssText =
          "background:#ff4081;color:#fff;font-weight:bold;";
      }

      logWarn(
        "新しいデータが公開されています。更新時刻: " + latest
      );

    }

    if (
      State.pendingPrefetchForUpdateAt &&
      !State.prefetchedRoundData &&
      !State.prefetchInFlight &&
      isWithinUpdateWatchWindow()
    ) {
      prefetchLatestRoundData(
        State.pendingPrefetchForUpdateAt
      );
    }

  } catch (e) {

    logError(
      "latest_update.json の取得に失敗：" +
      e.message
    );

  } finally {
    State.updateCheckRunning = false;
  }
}

function getJstUpdateWatchWindow(nowMs = Date.now()) {
  const config =
    State.updateWatchConfig ??
    DEFAULT_UPDATE_WATCH_CONFIG;
  if (!config.enabled) {
    return null;
  }

  const localDate = new Date(
    nowMs +
    config.timezoneOffsetMinutes * 60 * 1000
  );
  const dateKey = [
    localDate.getUTCFullYear(),
    String(localDate.getUTCMonth() + 1).padStart(2, "0"),
    String(localDate.getUTCDate()).padStart(2, "0")
  ].join("");
  const hourKey =
    String(localDate.getUTCHours()).padStart(2, "0");

  if (config.unrestricted) {
    return `${dateKey}-${hourKey}:all`;
  }

  const minute = localDate.getUTCMinutes();
  const secondOfHour =
    minute * 60 + localDate.getUTCSeconds();
  const matchingWindow = config.windows.find(
    window => {
      const startSecond =
        window.startMinute * 60;
      const endSecond =
        startSecond + window.durationMinutes * 60;
      return (
        secondOfHour >= startSecond &&
        secondOfHour < endSecond
      );
    }
  );

  if (!matchingWindow) {
    return null;
  }

  return (
    `${dateKey}-${hourKey}:` +
    String(matchingWindow.startMinute).padStart(2, "0")
  );
}

function isWithinUpdateWatchWindow(nowMs = Date.now()) {
  return getJstUpdateWatchWindow(nowMs) !== null;
}

/* =========================================================
 [5410] Update Watch:startUpdateWatch【State】（旧 [4300]）
========================================================= */
function startUpdateWatch() {

  if (
    State.updateWatchTimer
  ) {

    clearInterval(
      State.updateWatchTimer
    );
  }

  if (
    State.updateWatchVisibilityHandler
  ) {
    document.removeEventListener(
      "visibilitychange",
      State.updateWatchVisibilityHandler
    );
    State.updateWatchVisibilityHandler = null;
  }

  const config =
    State.updateWatchConfig ??
    DEFAULT_UPDATE_WATCH_CONFIG;

  if (!config.enabled) {
    log("更新監視はConfigで無効化されています");
    return;
  }

  const watchDescription =
    config.unrestricted
      ? "終日"
      : config.windows.map(
          window =>
            `${window.startMinute}～` +
            `${window.startMinute + window.durationMinutes}分`
        ).join("、");

  log(
    `✓ 更新監視を開始しました：${watchDescription}、` +
    `${config.intervalSeconds}秒間隔、` +
    `UTC${config.timezoneOffsetMinutes >= 0 ? "+" : ""}` +
    `${config.timezoneOffsetMinutes / 60}`
  );

  State.updateWatchTimer =
    setInterval(
      () => {
        checkUpdate();
      },
      config.intervalSeconds * 1000
    );

  State.updateWatchVisibilityHandler = () => {
    if (
      document.visibilityState === "visible" &&
      isWithinUpdateWatchWindow()
    ) {
      checkUpdate();
    }
  };
  document.addEventListener(
    "visibilitychange",
    State.updateWatchVisibilityHandler
  );

  if (isWithinUpdateWatchWindow()) {
    checkUpdate();
  }
}



/* #################################################################
 [LAYER 6000] Learning State Operations
 ################################################################# */

/* =========================================================
 [6000] Pink Target:getPinkTarget【State】（旧 [7073]）
========================================================= */
function getPinkTarget(player) {

  /*
   * 【設計メモ：参照系の自己修復】
   * 本関数は参照（read）だが、以下の「自己修復」を意図的に行う。
   *  - stale（前日以前）エントリの削除
   *  - 旧キー（legacyKey）で登録されたエントリの正式キーへの移行
   * これはデータ整合性維持のための公式な副作用であり、
   * 削除すると旧データが残り続ける。State への書き込みは許容する。
   */
  if (!player) {
    return null;
  }

  const directKey =
    buildPlayerIdentityKey(player);

  const directTarget =
    State.pinkTargets?.[
      directKey
    ];

  if (directTarget) {

    if (isPinkTargetStale(directTarget)) {
      delete State.pinkTargets[directKey];
      return null;
    }

    return directTarget;
  }

  const normalizedName =
    normalizePlayerName(
      player?.name ?? ""
    );

  const normalizedShop =
    normalizePlayerName(
      player?.shopname ?? ""
    );

  const fallbackEntry =
    Object.entries(
      State.pinkTargets || {}
    ).find(
      ([, entry]) => {

        if (!entry) {
          return false;
        }

        const entryName =
          normalizePlayerName(
            entry?.name ?? ""
          );

        const entryShop =
          normalizePlayerName(
            entry?.shopname ?? ""
          );

        return (
          entryName ===
            normalizedName &&
          entryShop ===
            normalizedShop
        );

      }
    );

  if (fallbackEntry) {

    const [
      legacyKey,
      resolvedEntry
    ] = fallbackEntry;

    if (isPinkTargetStale(resolvedEntry)) {
      delete State.pinkTargets[legacyKey];
      return null;
    }

    if (
      legacyKey !== directKey
    ) {

      State.pinkTargets[
        directKey
      ] = resolvedEntry;

      delete State.pinkTargets[
        legacyKey
      ];

    }

    return resolvedEntry;

  }

  return null;

}

/* =========================================================
 [6010] Pink Target:registerPinkTarget【State】【永続化】（旧 [7074]）
========================================================= */
function registerPinkTarget(
  player,
  copiedAt = Date.now()
) {

  if (!player) {
    return null;
  }

  const now =
    Number(copiedAt) ||
    Date.now();

  const key =
    buildPlayerIdentityKey(
      player
    );

  const existing =
    getPinkTarget(player);

  const entry =
    existing || {

      key,

      name:
        player.name ?? "",

      shopname:
        player.shopname ?? "",

      rankKey:
        getPlayerRankKey(
          player
        ),

      copyCount: 0,

      firstCopiedAt:
        now,

      lastCopiedAt:
        now,

      dailyKey:
        buildDailyKey(),

      history: []

    };

  entry.copyCount =
    (entry.copyCount || 0) + 1;

  entry.lastCopiedAt =
    now;

  entry.history = [
    ...(entry.history || []),
    now
  ].slice(-5);

  entry.rankKey =
    getPlayerRankKey(player)
    || entry.rankKey;

  entry.name =
    player.name ??
    entry.name;

  entry.shopname =
    player.shopname ??
    entry.shopname;

  entry.key =
    key;

  State.pinkTargets[key] =
    entry;

  savePinkStateToStorage();

  /*
   * 新しいPink履歴間隔（区間）が追加された直後（history.length >= 2）のみ
   * 明示的に学習（EMA更新）を行う。
   */
  if (entry.history && entry.history.length >= 2) {
    try {
      calcPinkCycle({ learn: true });
      savePinkStateToStorage();
    } catch (e) {
      console.warn("[pink] calcPinkCycle failed:", e);
    }
  }

  return entry;

}

/* =========================================================
 [6020] Pink Target:isCopiedPlayer【State】（旧 [7270]）
========================================================= */
function isCopiedPlayer(
  player
) {

  return Boolean(
    getPinkTarget(player)
  );
}

/* =========================================================
 [6100] Encounter History:getEncounterHistory【State】【永続化】（旧 [7076]）
========================================================= */
function getEncounterHistory(
  player
) {

  /*
   * 【設計メモ：参照系の自己修復】
   * 本関数は参照（read）だが、旧キーで登録されたエントリを
   * 正式キーへ移行する「自己修復」を意図的に行う（保存も発火）。
   * これはデータ整合性維持のための公式な副作用であり、
   * State への書き込みと savePinkStateToStorage() を許容する。
   */
  if (!player) {
    return null;
  }

  const directKey =
    buildPlayerIdentityKey(
      player
    );

  const directEntry =
    State.encounterHistory?.[
      directKey
    ];

  if (directEntry) {
    return directEntry;
  }

  const normalizedName =
    normalizePlayerName(
      player?.name ?? ""
    );

  const normalizedShop =
    normalizePlayerName(
      player?.shopname ?? ""
    );

  const fallbackEntry =
    Object.entries(
      State.encounterHistory || {}
    ).find(
      ([, entry]) => {

        if (!entry) {
          return false;
        }

        const entryName =
          normalizePlayerName(
            entry?.name ?? ""
          );

        const entryShop =
          normalizePlayerName(
            entry?.shopname ?? ""
          );

        return (
          entryName ===
            normalizedName &&
          entryShop ===
            normalizedShop
        );

      }
    );

  if (fallbackEntry) {

    const [
      legacyKey,
      resolvedEntry
    ] = fallbackEntry;

    if (
      legacyKey !== directKey
    ) {

      State.encounterHistory[
        directKey
      ] = resolvedEntry;

      delete State.encounterHistory[
        legacyKey
      ];

      savePinkStateToStorage();

    }

    return resolvedEntry;

  }

  return null;

}

/* =========================================================
 [6110] Encounter History:updateEncounterHistory【State】【永続化】（旧 [7075]）
========================================================= */
function updateEncounterHistory(
  player,
  copiedAt = Date.now()
) {

  if (!player) {
    return null;
  }

  const now =
    Number(copiedAt) ||
    Date.now();

  const key =
    buildPlayerIdentityKey(
      player
    );

  const existing =
    getEncounterHistory(
      player
    );

  const entry =
    existing || {

      key,

      name:
        player.name ?? "",

      shopname:
        player.shopname ?? "",

      count: 0,

      firstSeenAt:
        now,

      lastSeenAt:
        now,

      lastUpdateDate:
        player.updateDate ?? ""

    };

  entry.count =
    (entry.count || 0) + 1;

  entry.lastSeenAt =
    now;

  entry.lastUpdateDate =
    player.updateDate ??
    entry.lastUpdateDate;

  entry.key = key;

  State.encounterHistory[key] =
    entry;

  savePinkStateToStorage();

  return entry;

}

/*
 * 【2026-09 削除】getEncounterBonus は常に1.0を返す
 * 無効化済み関数だったため、呼び出し箇所とあわせて削除した。
 * encounterHistory 自体は undo 等の管理情報として引き続き利用する。
 */

/* =========================================================
 [6200] Yellow Samples:registerYellowSample【State】【永続化】（旧 [7078]）
========================================================= */
function registerYellowSample(
  player,
  copiedAt = Date.now()
) {

  if (
    !player ||
    !player.updateDate
  ) {
    return null;
  }

  const updateMs =
    parseDateJST(
      player.updateDate
    )?.getTime();

  if (
    !updateMs ||
    !isFinite(updateMs)
  ) {
    return null;
  }

  const diffSec =
    (
      copiedAt -
      updateMs
    ) / 1000;

  if (
    !isFinite(diffSec) ||
    diffSec < 0
  ) {
    return null;
  }

  /*
   * フィルタ対象期間（45分＝2700秒）を超える古すぎるデータは
   * 周期学習のノイズ・過学習・矛盾の原因となるためサンプルから除外する
   */
  const maxAllowableDiffSec = State.scoringConfig?.phase?.yellow?.maxSampleAgeSec ?? 45 * 60;
  if (diffSec > maxAllowableDiffSec) {
    return null;
  }

  /*
   * Yellow基準周期
   *
   * 学習処理と同じ設定周期で折り畳む。
   */
  const baseCycleSec = State.scoringConfig?.phase?.yellow?.baseCycleSec ?? 345;

  /*
   * 周期ズレ
   *
   * 302 → 2
   * 598 → -2
   * 905 → 5
   * 1198 → -2
   */
  const foldedSec =
    foldToCycle(
      diffSec,
      baseCycleSec
    );

  /*
   * 経過周期数
   *
   * 302 → 1
   * 598 → 1
   * 905 → 3
   * 1198 → 3
   */
  const cycleCount =
    Math.max(
      1,
      Math.round(
        diffSec /
        baseCycleSec
      )
    );

  const sample = {

    copiedAt,

    updateMs,

    diffSec,

    /*
     * 周期ズレ
     */
    foldedSec,

    /*
     * おおよその経過周期数
     */
    cycleCount

  };

  State.yellowSamples = [
    sample,
    ...State.yellowSamples
  ].slice(0, 50);

  savePinkStateToStorage();

  // Immediately update learned yellow adjustment so
  // subsequent candidate generation uses the new sample.
  try {
    calcYellowCycle({ learn: true });
    savePinkStateToStorage();
  } catch (e) {
    console.warn("[yellow] calcYellowCycle failed:", e);
  }

  return sample;
}

/*
 * コピー履歴から作る旧Realtime Area Boostは廃止済み。
 * 現在のアクティブ人数から作るArea Boostは、Matching Calculation層で
 * 通常枠内スコアにだけ適用する。
 */

/* =========================================================
 [6400] Recent Clicks:rebuildRecentClickIndex【State】（旧 [7105] 内）
========================================================= */
function rebuildRecentClickIndex() {
  const set = new Set();

  for (const r of State.recentClicks) {
    if (!r) continue;

    const nameKey =
      normalizePlayerName(r.name ?? "");

    if (!nameKey) continue;

    const dateKey =
      String(r.updateDate ?? "");

    set.add(`${nameKey}|${dateKey}`);
  }

  State.recentClickSet = set;
}

/* =========================================================
 [6410] Recent Clicks:hasSamePlayerRecentClick【State】（旧 [7500] 内）
========================================================= */
function hasSamePlayerRecentClick(player) {

  if (!player || !State.recentClicks?.length) {
    return false;
  }

  const targetName =
    normalizePlayerName(player.name);

  const targetUpdateDate =
    String(player.updateDate ?? "");

  const lookupKey =
    `${targetName}|${targetUpdateDate}`;

  return State.recentClickSet?.has(lookupKey) ?? false;
}



/* #################################################################
 [LAYER 7000] Phase Calculation
 ################################################################# */

/* =========================================================
 [7000] Cycle Learning:calcYellowCycle【State】（旧 [7220]）
========================================================= */
function calcYellowCycle(opts = {}) {

  const learn =
    Boolean(opts.learn);

  const cfg =
    State.scoringConfig?.phase?.yellow ?? {};

  const base =
    cfg.baseCycleSec ?? 345;

  const maxShift =
    cfg.maxShiftSec ?? 45;

  /*
   * 読み取り専用モード（既定）
   *
   * getCurrentCycle経由の参照（行ハイライト・スコアリング等）は
   * 1回の描画で何十〜何百回も呼ばれる。そのたびにここで
   * EMA更新（学習）を行うと、同じサンプル集合に対して
   * 呼び出し回数分だけ学習が繰り返し進んでしまい、
   * 本来「新しいサンプルが増えた時だけ」働くはずの学習が
   * 実質的に毎描画で暴走する不具合になる。
   *
   * そのため、新しいサンプル登録直後（registerYellowSample）で
   * learn:true を明示した時だけ学習・上書きを行い、
   * それ以外（既定）は現在保持している adjust を
   * そのまま読むだけの純粋な参照とする。
   */
  if (!learn) {
    return (
      base +
      clamp(
        State.phaseAdjust?.yellow ?? 0,
        -maxShift,
        maxShift
      )
    );
  }

  const samples =
    State.yellowSamples ?? [];

  if (samples.length === 0) {
    return (
      base +
      clamp(
        State.phaseAdjust?.yellow ?? 0,
        -maxShift,
        maxShift
      )
    );
  }

  const values =
    samples
      .map(s => {
        const diffSec =
          Number(s.diffSec ?? 0);

        if (
          !isFinite(diffSec) ||
          diffSec <= 0
        ) {
          return null;
        }

        /*
         * 複数周期分を折り畳む
         *
         * 例
         * 302 → 2
         * 598 → -2
         * 902 → 2
         * 1198 → -2
         */
        const folded =
          foldToCycle(
            diffSec,
            base
          );

        /*
         * 【2026-09 改善3】1周期当たりの誤差へ正規化
         *
         * 従来は複数周期分の折り畳み誤差（foldedSec）を
         * そのまま1周期分の誤差として学習していたため、
         * 経過周期数が多いサンプルほど誤差が実際より
         * 大きく（あるいは小さく）評価されるおそれがあった。
         *
         * 保存済みの cycleCount（経過周期数）で割ることで、
         * 1周期当たりの誤差に正規化してから学習する。
         * 旧データ等で cycleCount が未保存の場合は、
         * diffSec / base から後方互換的に導出する。
         */
        const cycleCount =
          Number.isFinite(
            Number(s.cycleCount)
          ) &&
          Number(s.cycleCount) > 0
            ? Number(s.cycleCount)
            : Math.max(
                1,
                Math.round(
                  diffSec / base
                )
              );

        return (
          folded /
          Math.max(1, cycleCount)
        );
      })
      .filter(
        v =>
          v !== null &&
          isFinite(v)
      )
      .sort(
        (a, b) => a - b
      );

  if (values.length === 0) {
    return (
      base +
      clamp(
        State.phaseAdjust?.yellow ?? 0,
        -(cfg.maxShiftSec ?? 45),
        (cfg.maxShiftSec ?? 45)
      )
    );
  }

  /*
   * 外れ値除去
   *
   * 立ち上がり強化（sqrtカーブ）により少数サンプルでも
   * adjust への反映率が上がるため、中央値算出前に
   * maxShiftSec を超える折り畳み値（明らかな異常値）を除外する。
   */
  const trimmedValues =
    rejectFoldedOutliers(
      values,
      maxShift
    );

  /*
   * 中央値算出
   */
  const mid =
    Math.floor(
      trimmedValues.length / 2
    );

  const median =
    (trimmedValues.length % 2)
      ? trimmedValues[mid]
      : (
          trimmedValues[mid - 1] +
          trimmedValues[mid]
        ) / 2;

  /*
   * median は
   * 「周期からのズレ秒数」
   *
   * +10 → 周期を延ばした方がよい
   * -10 → 周期を短くした方がよい
   */
  const folded = median;

  const prev =
    Number(
      State.phaseAdjust?.yellow ?? 0
    );

  const updated =
    updateAdjust(
      prev,
      folded,
      cfg.alpha ?? 0.2
    );

  const clampedRaw =
    clamp(
      updated,
      -maxShift,
      maxShift
    );

  /*
   * サンプル数ガード
   *
   * 少数サンプル（外れ値1件など）による
   * 急激な周期シフト・発振を防ぐため、
   * minSamples に対するサンプル数の割合を
   * 信頼度として adjust に乗算する。
   *
   * 立ち上がり強化のため線形ではなくsqrtカーブを採用。
   * サンプルが十分（minSamples以上）
   * であれば信頼度1.0（そのまま採用）。
   */
  const minSamples =
    cfg.minSamples ?? 8;

  const trust =
    computeSampleTrust(
      values.length,
      minSamples
    );

  const clamped =
    clampedRaw * trust;

  State.phaseAdjust.yellow =
    clamped;

  /*
   * 分析用診断情報の記録
   * （trust強化・外れ値除去の効果検証のため）
   */
  State.phaseDiag.yellow = {
    sampleCount: values.length,
    trust,
    adjustValue: clamped
  };

  return base + clamped;
}

/* =========================================================
 [7010] Cycle Learning:calcPinkCycle【State】（旧 [7230]）
========================================================= */
function calcPinkCycle(
  opts = {}
) {

  const learn =
    Boolean(opts.learn);

  const cfg =
    State.scoringConfig
      ?.phase?.pink || {};

  const base =
    cfg.baseCycleSec ?? 345;

  const maxShift =
    cfg.maxShiftSec ?? 45;

  /*
   * 読み取り専用モード（既定）
   *
   * Yellowと同様、getCurrentCycle経由の参照で
   * 毎回EMA更新してしまう不具合を避けるため、
   * learn:true が明示された時（新規Pinkサンプル登録直後）
   * だけ学習・上書きを行う。
   */
  if (!learn) {
    return (
      base +
      clamp(
        State.phaseAdjust?.pink ?? 0,
        -maxShift,
        maxShift
      )
    );
  }

  const foldedList = [];

  const targets =
    Object.values(
      State.pinkTargets || {}
    );

  for (const entry of targets) {

    const history =
      entry.history || [];

    if (history.length < 2) {
      continue;
    }

    /* Pink対象ごとの全過去マッチング間隔（隣接ペア）をすべて折りたたんで登録 */
    for (let i = 1; i < history.length; i++) {
      const latest =
        Number(history[i] || 0);

      const prev =
        Number(history[i - 1] || 0);

      if (!latest || !prev || latest <= prev) {
        continue;
      }

      const interval =
        (latest - prev) / 1000;

      const folded =
        foldToCycle(
          interval,
          base
        );

      if (isFinite(folded)) {
        const cycleCount = Math.max(1, Math.round(interval / base));
        foldedList.push(folded / cycleCount);
      }
    }
  }

  if (
    foldedList.length === 0
  ) {

    return (
      base +
      clamp(
        State.phaseAdjust
          ?.pink ?? 0,
        -maxShift,
        maxShift
      )
    );
  }

  /* 中央値算出（外れ値に強い収束処理） */
  const values =
    [...foldedList].sort(
      (a, b) => a - b
    );

  /*
   * 外れ値除去
   *
   * 立ち上がり強化（sqrtカーブ）により少数サンプルでも
   * adjust への反映率が上がるため、中央値算出前に
   * maxShiftSec を超える折り畳み値（明らかな異常値）を除外する。
   */
  const trimmedValues =
    rejectFoldedOutliers(
      values,
      maxShift
    );

  const mid =
    Math.floor(
      trimmedValues.length / 2
    );

  const median =
    (trimmedValues.length % 2)
      ? trimmedValues[mid]
      : (
          trimmedValues[mid - 1] +
          trimmedValues[mid]
        ) / 2;

  const prev =
    Number(
      State.phaseAdjust
        ?.pink ?? 0
    );

  const updated =
    updateAdjust(
      prev,
      median,
      cfg.alpha ?? 0.3
    );

  const clampedRaw =
    clamp(
      updated,
      -maxShift,
      maxShift
    );

  /*
   * サンプル数ガード
   *
   * 少数サンプル（外れ値1件など）による
   * 急激な周期シフト・発振を防ぐため、
   * minSamples に対するサンプル数の割合を
   * 信頼度として adjust に乗算する。
   *
   * 立ち上がり強化のため線形ではなくsqrtカーブを採用。
   */
  const minSamples =
    cfg.minSamples ?? 8;

  const trust =
    computeSampleTrust(
      foldedList.length,
      minSamples
    );

  const clamped =
    clampedRaw * trust;

  State.phaseAdjust.pink =
    clamped;

  /*
   * 分析用診断情報の記録
   * （trust強化・外れ値除去の効果検証のため）
   */
  State.phaseDiag.pink = {
    sampleCount: foldedList.length,
    trust,
    adjustValue: clamped
  };
  State.pinkCycleState = {
    version: 1,
    baseCycleSec: base,
    maxShiftSec: maxShift,
    adjustSec: clamped,
    source: "encounter-learning",
    sampleCount: foldedList.length,
    trust,
    lastLearnedAt: Date.now()
  };

  return base + clamped;
}

/* =========================================================
 [7020] Cycle Learning:getCurrentCycle【State】（旧 [7210]）
========================================================= */
function getCurrentCycle(
  player
) {

  return isCopiedPlayer(player)
    ? calcPinkCycle()
    : calcYellowCycle();
}

/* =========================================================
 [7030] Cycle Learning:seedPhaseAdjustFromCopyHistory【State】【永続化】
 Pinkは保存した周期と根拠を復元し、旧方式・不正・非互換の値は
 一度だけ設定基準へ移行する。起動時の過去誤差による再シードは行わない。
 Yellowの過去コピー履歴によるシードと、通常の再対戦学習は維持する。
========================================================= */
function initializePinkCycleState() {
  const cfg = State.scoringConfig.phase.pink;
  const saved = State.pinkCycleState;
  const valid = saved?.version === 1 &&
    saved.baseCycleSec === cfg.baseCycleSec &&
    saved.maxShiftSec === cfg.maxShiftSec &&
    Number.isFinite(saved.adjustSec) &&
    Math.abs(saved.adjustSec) <= cfg.maxShiftSec &&
    saved.adjustSec === State.phaseAdjust.pink &&
    ["initial", "encounter-learning"].includes(saved.source) &&
    Number.isInteger(saved.sampleCount) && saved.sampleCount >= 0 &&
    Number.isFinite(saved.trust) && saved.trust >= 0 && saved.trust <= 1 &&
    (saved.lastLearnedAt === null ||
      (Number.isFinite(saved.lastLearnedAt) && saved.lastLearnedAt > 0)) &&
    (saved.source === "initial"
      ? saved.sampleCount === 0 && saved.trust === 0 && saved.adjustSec === 0 && saved.lastLearnedAt === null
      : saved.sampleCount > 0 && saved.lastLearnedAt !== null);
  if (valid) {
    log(`Pink周期：保存値を復元（${(cfg.baseCycleSec + saved.adjustSec).toFixed(3)}秒、学習${saved.sampleCount}件）`);
    return;
  }
  const previousAdjust = State.phaseAdjust.pink;
  State.phaseAdjust.pink = 0;
  State.pinkCycleState = {
    version: 1, baseCycleSec: cfg.baseCycleSec, maxShiftSec: cfg.maxShiftSec,
    adjustSec: 0, source: "initial", sampleCount: 0, trust: 0, lastLearnedAt: null
  };
  logWarn(`Pink周期：旧方式・未保存・非互換または不正な補正を初期値へ移行（補正${previousAdjust}秒 → 0秒、周期${cfg.baseCycleSec}秒）。対戦履歴とYellowは保持します`);
  if (!savePinkStateToStorage()) {
    logError("Pink周期の移行結果を保存できません。次回起動時に再度移行が必要です");
  }
}

async function seedPhaseAdjustFromCopyHistory() {

  const activeDb = getLogDB();
  if (!activeDb) {
    return;
  }

  try {

    const tx =
      activeDb.transaction(
        [LOG_STORE.copyEvents],
        "readonly"
      );

    const store =
      tx.objectStore(
        LOG_STORE.copyEvents
      );

    const records =
      await new Promise(
        (resolve, reject) => {
          const req = store.getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = reject;
        }
      );

    if (
      !Array.isArray(records) ||
      records.length === 0
    ) {
      return;
    }

    const yellowCfg =
      State.scoringConfig?.phase?.yellow ?? {};

    const yellowMinSamples =
      Number(yellowCfg.minSamples ?? 8);

    /*
     * すでにローカルで十分サンプルが蓄積・学習済みの場合は
     * ログからの再シードで学習結果を後退させないよう上書きしない。
     */
    const yellowAlreadyLearned =
      (State.yellowSamples?.length ?? 0) >= yellowMinSamples;

    const yellowPerCycleErrors = [];

    for (const rec of records) {

      const sb = rec?.scoreBreakdown;

      const signedPhaseError =
        Number(sb?.signedPhaseError);

      if (!Number.isFinite(signedPhaseError)) {
        continue;
      }

      const cycleCount =
        Math.max(
          1,
          Number(rec.cycleCountAtCopy) || 1
        );

      const perCycle =
        signedPhaseError / cycleCount;

      if (!Number.isFinite(perCycle)) {
        continue;
      }

      if (rec.isPinkManaged || rec.isPink) {
        continue;
      } else {
        yellowPerCycleErrors.push(perCycle);
      }

    }

    const median = values => {

      if (!values.length) {
        return null;
      }

      const sorted =
        [...values].sort((a, b) => a - b);

      const mid =
        Math.floor(sorted.length / 2);

      return (sorted.length % 2)
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;

    };

    /*
     * 3件未満（外れ値1件で全体が偏るリスクが高い）は
     * シードを見送る。
     */
    const MIN_SEED_SAMPLES = 3;

    let seeded = false;

    if (
      !yellowAlreadyLearned &&
      yellowPerCycleErrors.length >= MIN_SEED_SAMPLES
    ) {

      const m = median(yellowPerCycleErrors);

      const maxShift =
        Number(yellowCfg.maxShiftSec ?? 45);

      State.phaseAdjust.yellow =
        clamp(m, -maxShift, maxShift);

      seeded = true;

      log(
        `[phase] Yellow位相バイアスを実績ログから初期化：${Math.round(State.phaseAdjust.yellow)}秒（サンプル${yellowPerCycleErrors.length}件）`
      );

    }

    if (seeded) {
      savePinkStateToStorage();
    }

  } catch (e) {

    console.warn(
      "[phase] seedPhaseAdjustFromCopyHistory failed:",
      e
    );

  }

}

function normalizeCopyAreaHistory(
  records
) {
  const result = [];

  for (
    const record of
    [...(records ?? [])].sort(
      (a, b) =>
        Number(a?.t ?? 0) -
        Number(b?.t ?? 0)
    )
  ) {
    if (
      record?.e !== "copy" ||
      record?.unmatchedPlayer ||
      String(record?.area ?? "") === ""
    ) {
      continue;
    }

    const previous =
      result[result.length - 1];
    const samePlayer =
      previous &&
      normalizePlayerName(
        previous.name ?? ""
      ) ===
        normalizePlayerName(
          record.n ?? ""
        ) &&
      normalizePlayerName(
        previous.shopname ?? ""
      ) ===
        normalizePlayerName(
          record.shopname ?? ""
        );
    const withinDuplicateGuard =
      samePlayer &&
      Number(record.t ?? 0) -
        Number(previous.t ?? 0) <
        15000;

    if (withinDuplicateGuard) {
      continue;
    }

    result.push({
      t:
        Number(record.t ?? 0),
      name:
        record.n ?? "",
      shopname:
        record.shopname ?? "",
      area:
        String(record.area)
    });
  }

  return result.slice(
    -LOG_STORAGE_LIMITS.copyAreaHistory
  );
}

async function loadCopyAreaHistory() {
  const activeDb = getLogDB();
  if (!activeDb) {
    State.copyAreaHistory = [];
    return;
  }

  const tx =
    activeDb.transaction(
      [LOG_STORE.copyEvents],
      "readonly"
    );
  const store =
    tx.objectStore(
      LOG_STORE.copyEvents
    );
  const records =
    await new Promise(
      (resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () =>
          resolve(req.result || []);
        req.onerror = reject;
      }
    );

  State.copyAreaHistory =
    normalizeCopyAreaHistory(records);
}

function appendCopyAreaHistory(
  record
) {
  if (
    record?.unmatchedPlayer ||
    String(record?.area ?? "") === ""
  ) {
    return;
  }

  const nextRecord = {
    t:
      Number(record.t ?? Date.now()),
    name:
      record.n ?? "",
    shopname:
      record.shopname ?? "",
    area:
      String(record.area)
  };
  const previous =
    State.copyAreaHistory[
      State.copyAreaHistory.length - 1
    ];
  const isDuplicate =
    previous &&
    normalizePlayerName(
      previous.name ?? ""
    ) ===
      normalizePlayerName(
        nextRecord.name
      ) &&
    normalizePlayerName(
      previous.shopname ?? ""
    ) ===
      normalizePlayerName(
        nextRecord.shopname
      ) &&
    nextRecord.t -
      Number(previous.t ?? 0) <
      15000;

  if (isDuplicate) {
    return;
  }

  State.copyAreaHistory.push(
    nextRecord
  );
  State.copyAreaHistory =
    State.copyAreaHistory.slice(
      -LOG_STORAGE_LIMITS.copyAreaHistory
    );
}

/* =========================================================
 [7100] Phase Distance:getRoundedDiffMinAndPhaseDistance（旧 [7200]）
========================================================= */
function getRoundedDiffMinAndPhaseDistance(
    copiedAtMs,
    cycleMin = 5,
    nowMs = Date.now()
) {
    const emptyResult = {
        diffMin: Infinity,
        d: Infinity,
        rSec: Infinity,
        inYellowWindow: false,
        isInitialCooldown: false,
        cooldownRemainingSec: 0
    };

    const anchor =
        Number(copiedAtMs);

    if (
        !anchor ||
        !isFinite(anchor)
    ) {
        return emptyResult;
    }

    const now =
        nowMs;

    const diffSec =
        (now - anchor) / 1000;

    if (
        !isFinite(diffSec) ||
        diffSec < 0
    ) {
        return emptyResult;
    }

    const cycleSec =
        Number(cycleMin) * 60;

    const toleranceSec =
        45;

    /*
     * 修正
     * コピー後は
     * 1.5YellowCycle完全除外
     */
    const initialCooldownSec =
        cycleSec * 1.5;

    const rSec =
        diffSec % cycleSec;

    if (
        diffSec <
        initialCooldownSec
    ) {
        return {
            diffMin:
                diffSec / 60,
            d: Infinity,
            rSec,
            inYellowWindow: false,
            isInitialCooldown: true,
            cooldownRemainingSec:
                initialCooldownSec - diffSec
        };
    }

    const distToNearest =
        Math.min(
            rSec,
            cycleSec - rSec
        );

    const inYellowWindow =
        distToNearest <=
        toleranceSec;

    return {
        diffMin:
            diffSec / 60,
        d:
            distToNearest / 60,
        rSec,
        inYellowWindow,
        isInitialCooldown: false,
        cooldownRemainingSec: 0
    };
}

/* =========================================================
 [7110] Phase Distance:getPhaseDistanceMin（旧 [7280]）
========================================================= */
function getPhaseDistanceMin(
  copiedAtMs,
  cycleMin = 5,
  nowMs = Date.now()
) {

  return getRoundedDiffMinAndPhaseDistance(
    copiedAtMs,
    cycleMin,
    nowMs
  );
}

/* =========================================================
 [7200] Phase Signal:computePhaseSignal【State】（旧 [7330]）
========================================================= */

/* =====================================
 * Pink強度評価
 * 戻り値: 0.0 ～ 1.0
 * ===================================== */
function computePhaseSignal(player, mode = "pink", nowMs = Date.now()) {
 if (!player) {
   return {
     cycleSec: 0,
     diffSec: 0,
     phaseError: 0,
     phaseScore: 0,
     decay: 0,
     finalPhaseScore: 0,
     threshold: 0,
     active: false
   };
 }

 const target =
   mode === "pink"
     ? getPinkTarget(player)
     : null;

 if (mode === "pink" && !target) {
   return {
     cycleSec: 0,
     diffSec: 0,
     phaseError: 0,
     phaseScore: 0,
     decay: 0,
     finalPhaseScore: 0,
     threshold: 0,
     active: false
   };
 }

 const cycleSec =
   getCurrentCycle(player);

 if (
   !cycleSec ||
   !isFinite(cycleSec)
 ) {
   return {
     cycleSec: 0,
     diffSec: 0,
     phaseError: 0,
     phaseScore: 0,
     decay: 0,
     finalPhaseScore: 0,
     threshold: 0,
     active: false
   };
 }

 const diffSec =
   mode === "pink"
     ? (nowMs - (target.lastCopiedAt || 0)) / 1000
     : (nowMs - ((player.lastCopiedAt || player.copiedAt || 0))) / 1000;

 if (diffSec < cycleSec) {
   return {
     cycleSec,
     diffSec,
     phaseError: 0,
     phaseScore: 0,
     decay: 0,
     finalPhaseScore: 0,
     threshold: 0,
     active: false
   };
 }

 const lambda = getPhaseLambda("pink");

 const metrics =
   computePhaseMetrics(
     diffSec,
     cycleSec,
     lambda,
     getPhaseErrorScaleSec(mode)
   );

 const threshold =
   Number(
     State.scoringConfig
       ?.phaseError
       ?.pinkThreshold ??
     State.scoringConfig
       ?.phase
       ?.display
       ?.pinkThreshold ?? 0.5
   );

 return {
   cycleSec,
   diffSec,
   cycleCount: metrics.cycleCount,
   phaseError: metrics.phaseError,
   phaseScore: metrics.phaseScore,
   decay: metrics.decay,
   finalPhaseScore: metrics.finalPhaseScore,
   threshold,
   active: metrics.finalPhaseScore > threshold
 };
}

/* =========================================================
 [7205] Phase Detail:getPlayerPhaseDetail【State】
========================================================= */
function getPlayerPhaseDetail(
 player,
 nowMs = Date.now()
) {
 if (!player) {
   return {
     error: "Phase：計算できません"
   };
 }

 const isPink =
   isCopiedPlayer(player);

 const mode =
   isPink ? "pink" : "yellow";

 const cycleSec =
   getCurrentCycle(player);

 if (
   !isFinite(cycleSec) ||
   cycleSec <= 0
 ) {
   return {
     error: "Phase：周期を計算できません"
   };
 }

 const anchorMs =
   isPink
     ? Number(
         getPinkTarget(player)
           ?.lastCopiedAt
       )
     : parseDateJST(
         player.updateDate
       )?.getTime();

 if (
   !isFinite(anchorMs) ||
   anchorMs <= 0
 ) {
   return {
     error: `Phase（${isPink ? "Pink" : "Yellow"}）：基準時刻を取得できません`
   };
 }

 const diffSec =
   (nowMs - anchorMs) / 1000;

 if (diffSec < 0) {
   return {
     error: `Phase（${isPink ? "Pink" : "Yellow"}）：基準時刻が現在時刻より後です`
   };
 }

 const lambda = getPhaseLambda(mode);

 const metrics =
   computePhaseMetrics(
     diffSec,
     cycleSec,
     lambda,
     getPhaseErrorScaleSec(mode)
   );

 /*
  * ピーク方向判定（表示専用）
  *
  * phasePos：直前の周期境界（ピーク）からの経過秒数（0〜cycleSec未満）。
  * 半周期未満＝直前のピークからまだ日が浅い＝ピークを「過ぎた」直後。
  * 半周期以上＝次のピークの方が近い＝ピークが「これから」来る。
  *
  * ※ isMatchingCandidateByPhase 等の判定・スコアリングは
  *   引き続き絶対値の phaseError / finalPhaseScore を用いるため、
  *   本判定を追加しても既存の候補選出ロジックには影響しない。
  */
 const directionDetail =
   buildPhaseDirectionDetail(
     diffSec,
     cycleSec,
     metrics.phaseError
   );

 return {
   mode,
   cycleSec,
   cycleCount: metrics.cycleCount,
   phaseError: metrics.phaseError,
   diffSec: directionDetail.diffSec,
   phasePos: directionDetail.phasePos,
   peakDirection: directionDetail.peakDirection,
   signedPhaseError:
     directionDetail.signedPhaseError,
   phaseBucket:
     directionDetail.phaseBucket
 };
}

/* =========================================================
 [7206] Phase Detail:buildPlayerPhaseSummaryText【State】
========================================================= */
function buildPlayerPhaseSummaryText(
 player,
 nowMs = Date.now()
) {
 const detail =
   getPlayerPhaseDetail(
     player,
     nowMs
   );

 if (detail.error) {
   return detail.error;
 }

 const signedError =
   detail.peakDirection === "past"
     ? Math.round(detail.phaseError)
     : -Math.round(detail.phaseError);

 const signedLabel =
   signedError >= 0
     ? `＋${signedError}秒`
     : `－${Math.abs(signedError)}秒`;

 return `${detail.mode === "pink" ? "Pink" : "Yellow"}=${detail.cycleSec.toFixed(1)}秒　${detail.cycleCount}サイクル／${signedLabel}`;
}

/* =========================================================
 [7207] Phase Detail:showPlayerPhaseDetailDialog【DOM】
========================================================= */
function showPlayerPhaseDetailDialog(
 player
) {
 const overlay =
   document.createElement("div");

 const dialog =
   document.createElement("div");

 const closeButton =
   document.createElement("button");

 const detail =
   document.createElement("div");

 overlay.style.cssText =
   "position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,0.35);box-sizing:border-box;";

 dialog.style.cssText =
   "width:min(420px,100%);padding:20px;border-radius:10px;background:#fff;box-shadow:0 8px 24px rgba(0,0,0,0.28);font-size:20px;font-weight:bold;line-height:1.6;color:#222;";

 closeButton.type = "button";
 closeButton.textContent = "閉じる";
 closeButton.style.cssText =
   "display:block;margin:16px 0 0 auto;padding:8px 14px;border:1px solid #999;border-radius:5px;background:#f5f5f5;font-size:16px;cursor:pointer;";

 const updateDetail = () => {
   detail.textContent =
     buildPlayerPhaseSummaryText(
       player,
       Date.now()
     );
 };

 updateDetail();
 const timerId = setInterval(updateDetail, 1000);

 const close = () => {
   clearInterval(timerId);
   overlay.remove();
 };

 closeButton.addEventListener(
   "click",
   close
 );

 overlay.addEventListener(
   "click",
   event => {
     if (event.target === overlay) {
       close();
     }
   }
 );

 dialog.append(
   detail,
   closeButton
 );
 overlay.append(dialog);
 document.body.append(overlay);
}

/* =========================================================
 [7210] Phase Signal:getYellowPhaseScore【State】（旧 [7300] 内）
========================================================= */
function getYellowPhaseScore(player, nowMs = Date.now()) {

  if (
    !player ||
    !player.updateDate
  ) {
    return 0;
  }

  const cycleSec =
    getCurrentCycle(player);

  if (
    !cycleSec ||
    !isFinite(cycleSec)
  ) {
    return 0;
  }

  const anchor =
    parseDateJST(
      player.updateDate
    )?.getTime();

  if (!anchor) {
    return 0;
  }

  const diffSec =
    (nowMs - anchor) / 1000;

  const lambda = getPhaseLambda("yellow");

  return computePhaseMetrics(
    diffSec,
    cycleSec,
    lambda,
    getPhaseErrorScaleSec("yellow")
  ).finalPhaseScore;
}

/* =========================================================
 [7300] Phase Judgement:isMatchingCandidateByPhase【State】（旧 [7310]）
========================================================= */

/* =====================================
 * Yellow判定
 * ===================================== */
function isMatchingCandidateByPhase(
  player,
  nowMs = Date.now()
) {
  if (
    !player ||
    !player.updateDate
  ) {
    return false;
  }

  /* =====================================
   * Pink管理対象はYellow対象外
   * ===================================== */
  if (isCopiedPlayer(player)) {
    return false;
  }

  const phaseCfg =
    State.scoringConfig?.phase ?? {};

  const threshold =
    Number(
      State.scoringConfig
        ?.phaseError
        ?.yellowThreshold ??
      phaseCfg.display
        ?.yellowThreshold ?? 0.5
    );

  const score =
    getYellowPhaseScore(
      player,
      nowMs
    );

  return score > threshold;
}

/* =========================================================
 [7310] Phase Judgement:isMatchingCandidateByCopyPhase【State】（旧 [7340]）
========================================================= */
function isMatchingCandidateByCopyPhase(player, nowMs = Date.now()) {
   const signal =
     computePhaseSignal(player, "pink", nowMs);
   return signal.active;
}

/* =========================================================
 [7400] Phase Context:getFilterToMs【State】（旧 [6150c]）
========================================================= */
function getFilterToMs(nowMs = Date.now()) {

  const generatedAt =
    parseDateJST(
      State.generatedAt
    );

  if (
    generatedAt &&
    isFinite(generatedAt.getTime())
  ) {
    return generatedAt.getTime();
  }

  const latestUpdateAt =
    parseDateJST(
      State.latestUpdateAt
    );

  if (
    latestUpdateAt &&
    isFinite(latestUpdateAt.getTime())
  ) {
    return latestUpdateAt.getTime();
  }

  return nowMs;
}

/* =========================================================
 [7410] Phase Context:getPinkSampleCount【State】（旧 [6151]）
========================================================= */
function getPinkSampleCount() {

  const targets =
    Object.values(
      State.pinkTargets || {}
    );

  let count = 0;

  for (const entry of targets) {

    const history =
      entry.history || [];

    if (history.length < 2) {
      continue;
    }

    /* Pink対象ごとの有効な履歴間隔（ペア）数を正しく累計 */
    for (let i = 1; i < history.length; i++) {
      const latest = Number(history[i] || 0);
      const prev = Number(history[i - 1] || 0);
      if (latest && prev && latest > prev) {
        count++;
      }
    }
  }

  return count;
}

/* =========================================================
 [7420] Phase Context:computePhaseContext【State】（旧 [7500] 内）
========================================================= */
function getCandidateTimingLog(player, evaluationTimeMs) {
  const target = getPinkTarget(player);
  const lastUpdateAt = parseDateJST(player?.updateDate)?.getTime();
  const lastUpdateAtMs = Number.isFinite(lastUpdateAt) ? lastUpdateAt : null;
  const encounterAt = Number(target?.lastCopiedAt);
  const pinkLastEncounterAtMs = Number.isFinite(encounterAt) && encounterAt > 0 ? encounterAt : null;
  const cycleSec = getCurrentCycle(player);
  const cooldownCycleSec = target ? Math.max(60, cycleSec) : null;
  const cooldown = target
    ? getPhaseDistanceMin(pinkLastEncounterAtMs, cooldownCycleSec / 60, evaluationTimeMs)
    : null;
  const phaseAnchorAtMs = target ? pinkLastEncounterAtMs : lastUpdateAtMs;
  return {
    phaseAnchorAtMs,
    phaseAnchorType: phaseAnchorAtMs === null
      ? "unavailable" : target ? "pink-last-copy" : "last-update",
    lastUpdate: player?.updateDate ?? null,
    lastUpdateAtMs,
    lastUpdateAgeSec: lastUpdateAtMs === null ? null : (evaluationTimeMs - lastUpdateAtMs) / 1000,
    pinkLastEncounterAtMs,
    pinkLastEncounterAgeSec: pinkLastEncounterAtMs === null
      ? null : (evaluationTimeMs - pinkLastEncounterAtMs) / 1000,
    cooldownRemainingSec: cooldown?.cooldownRemainingSec ?? 0,
    cooldownCycleSec,
    cooldownDurationSec: cooldownCycleSec === null ? 0 : cooldownCycleSec * 1.5,
    cycleSec
  };
}

function computePhaseContext(player, nowMs = Date.now()) {
  const isPinkManaged = isCopiedPlayer(player);
  let metrics = null;
  let cycleSec = 0;
  let diffSec = 0;

  if (isPinkManaged) {
   metrics = computePhaseSignal(player, "pink", nowMs);
   cycleSec = Number(metrics?.cycleSec ?? 0);
   diffSec = Number(metrics?.diffSec ?? 0);
  } else {
   const anchor =
     parseDateJST(player?.updateDate)?.getTime();
   cycleSec =
     getCurrentCycle(player);
   const lambda = getPhaseLambda("yellow");

   diffSec =
     anchor
       ? (nowMs - anchor) / 1000
       : 0;

   metrics =
     anchor && cycleSec
       ? computePhaseMetrics(
           diffSec,
           cycleSec,
           lambda,
           getPhaseErrorScaleSec("yellow")
         )
       : null;
  }

  const phaseError =
   Number(metrics?.phaseError ?? 0);

  const phaseScore =
   Number(metrics?.phaseScore ?? 0);

  const decay =
   Number(metrics?.decay ?? 0);

  const finalPhaseScore =
   Number(metrics?.finalPhaseScore ?? 0);

  const pinkThreshold =
   Number(
     State.scoringConfig
       ?.phaseError
       ?.pinkThreshold ??
     State.scoringConfig
       ?.phase
       ?.display
       ?.pinkThreshold ?? 0.5
   );

  const yellowThreshold =
   Number(
     State.scoringConfig
       ?.phaseError
       ?.yellowThreshold ?? 0.5
   );

  const isPinkPhase =
   isPinkManaged &&
   finalPhaseScore > pinkThreshold;

  const isYellowPhase =
   !isPinkManaged &&
   finalPhaseScore > yellowThreshold;

  const directionDetail =
   buildPhaseDirectionDetail(
     diffSec,
     cycleSec,
     phaseError
   );

  const phaseDiag =
   isPinkManaged
     ? State.phaseDiag?.pink
     : State.phaseDiag?.yellow;

  return {
   isPinkManaged,
   isPinkPhase,
   isYellowPhase,
   cycleCount: Number(metrics?.cycleCount ?? 0),
   cycleSec,
   diffSec: directionDetail.diffSec,
   phasePos: directionDetail.phasePos,
   peakDirection: directionDetail.peakDirection,
   signedPhaseError:
     directionDetail.signedPhaseError,
   phaseBucket:
     directionDetail.phaseBucket,
   phaseError,
   phaseScore,
   decay,
   finalPhaseScore,
   yellowThreshold,
   pinkThreshold,
   phaseSampleCount:
     Number(phaseDiag?.sampleCount ?? 0),
   phaseTrust:
     Number(phaseDiag?.trust ?? 1),
   phaseAdjustValue:
     Number(phaseDiag?.adjustValue ?? 0),
   phaseSurge:
     Number.isFinite(finalPhaseScore) &&
     finalPhaseScore > 0.9,
   samePlayerHit:
     hasSamePlayerRecentClick(player)
  };
}

/* =========================================================
 [7430] Phase Context:getPlayerCycleCount【State】（旧 [7500] 内）
========================================================= */
function getPlayerCycleCount(player, nowMs = Date.now()) {

  if (!player) return 0;

  if (isCopiedPlayer(player)) {

    const signal =
      computePhaseSignal(
        player,
        "pink",
        nowMs
      );

    return Math.round(
      (signal?.diffSec ?? 0) /
      (signal?.cycleSec || 1)
    );
  }

  if (!player.updateDate) return 0;

  const cycleSec =
    getCurrentCycle(player);

  const anchor =
    parseDateJST(
      player.updateDate
    )?.getTime();

  if (
    !cycleSec ||
    !anchor
  ) {
    return 0;
  }

  const diffSec =
    (nowMs - anchor) / 1000;

  return Math.round(
    diffSec / cycleSec
  );
}



/* =========================================================
 [8210] Matching Score:calcMatchingScoreDetail【State】（旧 [7410]）
========================================================= */
function calcMatchingScoreDetail(
    player,
    tierCounts = State.matchingTierCounts,
    viewerContext = null,
    evaluationTimeMs = Date.now()
) {
    if (!player || !player.updateDate) {
        return { score: 0 };
    }

    const phaseCtx =
        computePhaseContext(
            player,
            evaluationTimeMs
        );

    const finalPhaseScore =
        Number(
            phaseCtx?.finalPhaseScore ?? 0
        );

    const rankKey =
        getPlayerRankKey(player);

    const viewerRankKey =
        State.myRankKey;

    const historical =
        getHistoricalScoreDetail(
            viewerRankKey,
            rankKey,
            tierCounts,
            viewerContext
        );

    const historicalScore =
        historical.score;

    const isPinkManaged =
        Boolean(phaseCtx?.isPinkManaged);

    // Learning trust remains diagnostic; sparse samples must not soften scoring penalties.
    const phaseTrust =
        clamp(
            Number(
                phaseCtx?.phaseTrust ?? 1
            ),
            0,
            1
        );

    const defaultPhaseWeight =
        clamp(
            Number(
                State.scoringConfig
                    ?.phase?.weight ?? 0.55
            ),
            0,
            1
        );

    const phaseWeight =
        clamp(
            Number(
                isPinkManaged
                    ? State.scoringConfig
                        ?.phase?.pink?.weight ??
                      defaultPhaseWeight
                    : State.scoringConfig
                        ?.phase?.yellow?.weight ??
                      defaultPhaseWeight
            ),
            0,
            1
        );

    const pinkPhaseMatched =
        !isPinkManaged ||
        Boolean(phaseCtx?.isPinkPhase);

    const appliedPhaseWeight = isPinkManaged
        ? phaseWeight
        : Math.min(
            phaseWeight,
            State.scoringConfig?.phase?.yellowMaxWeight ?? MAX_YELLOW_PHASE_WEIGHT
        );

    const effectivePhaseScore =
        clamp(
            1 -
                appliedPhaseWeight *
                (1 - finalPhaseScore),
            0,
            1
        );

    const rawScore =
        historicalScore * effectivePhaseScore;

    const safeScore =
        Number.isFinite(rawScore) &&
        rawScore > 0
            ? rawScore
            : 0;

    return {
        score: safeScore,

        historicalScore,
        historicalMatched: historical.matched,
        historicalBackoff:
            Boolean(historical.backoff),
        tierProbability:
            Number(historical.tierProbability ?? historical.score),
        pooledTierProbability:
            Number(historical.pooledTierProbability ?? historical.score),
        tierCandidateCount:
            Number(historical.tierCandidateCount ?? 1),
        minOwnSamplesForNoBackoff:
            Number(historical.minOwnSamplesForNoBackoff ?? 100),
        ownSampleCount:
            Number(historical.ownSampleCount ?? 0),
        adjacentSampleCount:
            Number(historical.adjacentSampleCount ?? 0),
        adjacentViewerTiers:
            historical.adjacentViewerTiers ?? [],
        viewerTier: historical.viewerTier,
        opponentTier: historical.opponentTier,
        area: String(player.area ?? ""),
        isPinkManaged,
        // Neutral legacy columns keep old/new analysis logs self-describing.
        playerBoost: 1,
        rankBoost: 1,
        realtimeBoost: 1,
        playerActivitySignal: 0,
        rankActivitySignal: 0,
        playerRealtimeBonus: 0,
        rankRealtimeBonus: 0,
        realtimeBonusBeforeCap: 0,
        realtimeBonusCap: 0,
        phaseError: phaseCtx?.phaseError ?? 0,
        signedPhaseError:
            phaseCtx?.signedPhaseError ?? 0,
        phasePos:
            phaseCtx?.phasePos ?? 0,
        peakDirection:
            phaseCtx?.peakDirection ?? "unknown",
        phaseBucket:
            phaseCtx?.phaseBucket ?? "unknown",
        diffSec:
            phaseCtx?.diffSec ?? 0,
        phaseScore: phaseCtx?.phaseScore ?? 0,
        cycleCount: phaseCtx?.cycleCount ?? 0,
        cycleSec: phaseCtx?.cycleSec ?? 0,
        decay: phaseCtx?.decay ?? 0,
        finalPhaseScore,
        effectivePhaseScore,
        phaseWeight: appliedPhaseWeight,
        isYellow: Boolean(phaseCtx?.isYellowPhase),
        isPink: Boolean(phaseCtx?.isPinkPhase),
        pinkPhaseMatched,
        pinkMismatchBoostFactor: 1,
        yellowThreshold: phaseCtx?.yellowThreshold ?? 0,
        pinkThreshold: phaseCtx?.pinkThreshold ?? 0,

        /*
         * 分析用診断情報
         * （周期学習のサンプル数・信頼度・調整量）
         */
        phaseSampleCount:
            phaseCtx?.phaseSampleCount ?? 0,
        phaseTrust,
        phaseAdjustValue:
            phaseCtx?.phaseAdjustValue ?? 0,
        ...getCandidateTimingLog(player, evaluationTimeMs)
    };
}

/* =========================================================
 [8230] Candidate Score:buildCandidateScore（旧 [6900]）
========================================================= */
function buildCandidateScore(
    player,
    tierCounts = State.matchingTierCounts,
    viewerContext = null,
    evaluationTimeMs = Date.now()
) {
    const detail =
        calcMatchingScoreDetail(
            player,
            tierCounts,
            viewerContext,
            evaluationTimeMs
        );

    const score =
        Number(
            detail?.score ?? 0
        );

    const rankKey =
        getPlayerRankKey(
            player
        );

    return {
        ...player,

        __score: score,

        __detail: detail,

        __effectiveWeight:
            score,

        __rankKey:
            rankKey
    };
}



/* =========================================================
 [8310] Candidate Builder:buildMatchingCandidates【State】【DOM】（旧 [7700]）
========================================================= */
function buildMatchingCandidates(
  {
    evaluationTimeMs = Date.now(),
    saveEvent = false,
    clickedAtMs = Date.now(),
    mode = "matching",
    offsetSec = 0
  } = {}
) {

  if (!saveEvent) {
    State.latestCandidateEventIdForCopy =
      null;
  }

  State.matchingContext = {
    mode,
    clickedAtMs,
    evaluationTimeMs,
    offsetSec,
    scoringConfigSnapshot: State.scoringConfig ? getScoringConfigSnapshot() : null
  };

  const selectedStars =
    readSelectedStars();

  const selectedPrides =
    readSelectedPrides();

  const base =
    State.filtered;

  const baseWithRank =
    base.map(p => ({
      ...p,
      __rankKey:
        getPlayerRankKey(
          p
        )
    }));

  /* =====================================
   * UIフィルタ
   * ===================================== */
  const filteredByUi =
    baseWithRank.filter(p => {

      if (!p.updateDate) {
        return false;
      }

      if (!p.__rankKey) {
        return false;
      }

      if (
        p.__rankKey.startsWith("R")
      ) {

        return selectedStars.includes(
          Number(p.starCnt)
        );
      }

      return selectedPrides.includes(
        p.__rankKey
      );
    });

  /* =====================================
   * cooldown
   * Pink管理対象について初回1.5サイクルは除外する。
   * ===================================== */
  const afterCooldown =
    filteredByUi.filter(p => {

      const pinkTarget =
        getPinkTarget(p);

      if (!pinkTarget) {
        return true;
      }

      const copiedAt =
        pinkTarget?.lastCopiedAt ||
        null;

      if (!copiedAt) {
        return true;
      }

      const phase =
        getPhaseDistanceMin(
          copiedAt,
          Math.max(
            1,
            getCurrentCycle(p) / 60
          ),
          evaluationTimeMs
        );

      /*
       * Pink管理対象は初回1.5サイクルは除外
       */
      if (
        phase.isInitialCooldown
      ) {
        return false;
      }

      return true;

    });
  const afterCooldownSet = new Set(afterCooldown);
  State.matchingFilteredPopulationCount =
    filteredByUi.length;
  State.matchingCooldownExcludedCandidates =
    filteredByUi
      .filter(p => !afterCooldownSet.has(p))
      .map(p => ({
        name: p.name,
        shopname: p.shopname ?? "",
        rankKey: p.__rankKey,
        area: String(p.area ?? ""),
        exclusionReason: "pink-initial-cooldown",
        ...getCandidateTimingLog(p, evaluationTimeMs)
      }));

  const tierCounts = {};

  afterCooldown.forEach(p => {

    const opponentTier =
      mapRankKeyToTierKey(
        p.__rankKey
      );

    if (!opponentTier) {
      return;
    }

    tierCounts[opponentTier] =
      Number(
        tierCounts[opponentTier] ?? 0
      ) + 1;
  });

  State.matchingTierCounts =
    tierCounts;

  /* =====================================
   * STEP3〜6: 候補集合確定後に履歴スコアを
   * 個人priorへ変換し、Phaseと合成する。
   * ===================================== */
  const viewerContext =
    buildViewerHistoricalContext(
      State.myRankKey
    );

  const scoredAll =
    afterCooldown.map(p =>
      buildCandidateScore(
        p,
        tierCounts,
        viewerContext,
        evaluationTimeMs
      )
    );

  const areaDensityContext =
    buildAreaDensityContext(
      State.filtered
    );

  applyCandidateSlotScores(
    scoredAll,
    areaDensityContext
  );

  applyCandidateAreaHistoryBoost(
    scoredAll,
    { assignSlotRanks: true }
  );

  applyCandidateAreaPhaseDiagnostics(
    scoredAll
  );

  assignCandidateCrossBucketRanks(
    scoredAll
  );

  State.matchingScoredAll =
    scoredAll;

  const scoreEligible =
    scoredAll.filter(
      p =>
        getCandidateSelectionScore(p) > 0 &&
        getCandidateSlotScore(p) > 0
    );

  const rankedByScore =
    [...scoreEligible].sort(
      (a, b) =>
        getCandidateSelectionScore(b) -
        getCandidateSelectionScore(a)
    );

  State.matchingRankedAll =
    rankedByScore;

  State.matchingRankedAll.forEach(
    (p, i) => {
      p.__scoreRank = i + 1;
    }
  );

  /* =====================================
   * STEP7: 履歴分布を通常8枠へ配分し、自ランク基準の人口構成で補正
   * STEP8: 個人推定確率によるバケット横断1枠を追加
   * ===================================== */
  const enabledRankKeys = [
    ...selectedStars.map(
      star => `R${star}`
    ),
    ...selectedPrides
  ];
  const filteredPopulation =
    buildRankPopulationSnapshot(
      filteredByUi
    );
  State.matchingFilteredPopulationSnapshot =
    filteredPopulation;

  const slotBucketProbabilities =
    buildMatchingSlotBucketProbabilities(
      viewerContext,
      tierCounts,
      enabledRankKeys
    );
  const slotCounts = getMatchingSlotCounts();
  const originalSlotPlan =
    buildMatchingSlotPlan(
      scoreEligible,
      slotCounts.normal,
      slotBucketProbabilities
    );
  const adjustedSlotPlan =
    adjustSlotsByRelativePopulation(
      originalSlotPlan,
      filteredPopulation,
      enabledRankKeys,
      mapRankKeyToTierKey(State.myRankKey),
      { advancePrideBudget: saveEvent && mode === "matching" }
    );
  State.matchingSlotAllocationDiagnostics =
    adjustedSlotPlan.diagnostics;

  const normalSelected =
    selectNormalCandidatesBySlots(
      scoreEligible,
      slotCounts.normal,
      slotBucketProbabilities,
      adjustedSlotPlan.plan
    );

  const crossBucketSelected =
    selectCrossBucketCandidates(
      scoreEligible,
      normalSelected,
      slotCounts.crossBucket
    );

  crossBucketSelected.forEach(
    p => {
      p.__crossBucket = true;
      p.__crossBucketSelectionReason =
        "individual-probability";
    }
  );

  const wildcardSelected = selectWildcardCandidates(
    scoreEligible,
    [...normalSelected, ...crossBucketSelected],
    slotCounts.wildcard
  );

  wildcardSelected.forEach(
    p => {
      p.__wildcard = true;
      p.__crossBucket = true;
      p.__crossBucketSelectionReason =
        "global-high-score";
    }
  );

  const finalSelected = [
    ...normalSelected,
    ...crossBucketSelected,
    ...wildcardSelected
  ];

  const pinkManagedCount = finalSelected.filter(p => p.__detail?.isPinkManaged).length;

  State.matchingCrossBucketDiagnostics = {
    crossBucketSlotCount:
      slotCounts.crossBucket,
    wildcardSlotCount:
      slotCounts.wildcard,
    selectedBeforePinkCap:
      [...crossBucketSelected, ...wildcardSelected].map(
        p => ({
          name: p.name,
          shopname: p.shopname ?? "",
          bucket:
            p.__detail?.slotBucket ?? null,
          crossBucketRank:
            p.__crossBucketRank ?? null,
          crossBucketScore:
            getCandidateCrossBucketScore(p),
          selectionReason:
            p.__crossBucketSelectionReason ?? "individual-probability"
        })
      ),
    selectedAfterPinkCap:
      finalSelected
        .filter(p => p.__crossBucket)
        .map(
          p => ({
            name: p.name,
            shopname: p.shopname ?? "",
            bucket:
              p.__detail?.slotBucket ?? null,
            crossBucketRank:
              p.__crossBucketRank ?? null,
            crossBucketScore:
              getCandidateCrossBucketScore(p)
          })
        )
  };

  State.matchingPinkCapDiagnostics = {
    pinkCapEnabled: false,
    maxPinkManagedSlots: null,
    pinkManagedSlotsBeforeCap: pinkManagedCount,
    pinkManagedSlotsAfterCap: pinkManagedCount,
    pinkCapDroppedCount: 0
  };

  finalSelected.forEach(
    (p, i) => {

      p.displayRank =
        i + 1;
    }
  );

  State.matchingList =
    finalSelected;

  State.matchingResurfacing = null;
  if (mode === "matching") {
    const resurfacing = buildCandidateResurfacingDiagnostics(scoredAll, {
      current: finalSelected,
      previousState: State.matchingResurfacingState,
      evaluationTimeMs, viewerTier: State.myRankKey,
      slotPlan: State.matchingSlotPlan,
      scoringConfigVersion: analysisChecksum(State.scoringConfig)
    });
    State.matchingResurfacingState = resurfacing.state;
    State.matchingResurfacing = {
      diagnostics: resurfacing.diagnostics, comparisons: resurfacing.comparisons
    };
  }

  log(
    `候補生成: Base=${base.length} / Selected=${finalSelected.length}` +
    `（通常${normalSelected.length}＋バケット横断${crossBucketSelected.length}` +
    `＋ワイルドカード${wildcardSelected.length}` +
    `／Pink ${pinkManagedCount}人・上限なし）` +
    ` Slot=${State.matchingSlotPlan
      .filter(entry => entry.slots > 0)
      .map(entry => `${entry.bucket}:${entry.slots}`)
      .join(",") || "fallback"}` +
    `${State.matchingSlotAllocationDiagnostics?.applied
      ? ` 人口枠調整=${State.matchingSlotAllocationDiagnostics.transfers
          .map(transfer => `${transfer.from}→${transfer.to}(+1)`).join(",")}` +
        ` population=${JSON.stringify(State.matchingSlotAllocationDiagnostics.population.shares)}`
      : ""}` +
    `  Yellow周期=${Math.round(calcYellowCycle())}秒  Pink周期=${Math.round(calcPinkCycle())}秒`
  );

  if (saveEvent) {
    saveCandidateEvent({
      clickedAtMs,
      evaluationTimeMs,
      offsetSec
    });
  } else {
    State.activeCandidateEventId =
      null;
  }
}



/* #################################################################
 [LAYER 9000] Filtering / Summary
 ################################################################# */

/* =========================================================
 [9000] Filter Engine:applyFilters【State】【DOM】（旧 [5000]）
========================================================= */
function applyFilters() {

  const minutes =
    readRangeMinutes();

  /* =====================================
   * ガード
   * ===================================== */

  if (
    !isFinite(minutes) ||
    minutes <= 0
  ) {

    logWarn(
      "rangeSelect 不正値"
    );

    return;
  }

  let baseDate =
    parseDateJST(
      State.generatedAt
    );

  if (
    !baseDate ||
    isNaN(
      baseDate.getTime()
    )
  ) {

    baseDate =
      parseDateJST(
        State.latestUpdateAt
      );

    if (
      !baseDate ||
      isNaN(
        baseDate.getTime()
      )
    ) {

      baseDate =
        new Date();

      logWarn(
        "generatedAt / latestUpdateAt 未取得 → 現在時刻使用"
      );

    } else {

      log(
        "フィルタ基準(latestUpdateAt fallback): " +
        formatYMDHM(
          baseDate
        )
      );
    }

  } else {

    log(
      "フィルタ基準(generatedAt): " +
      formatYMDHM(
        baseDate
      )
    );
  }

  const filterBaseMs =
    baseDate.getTime();

  const filterStartMs =
    filterBaseMs -
    (
      minutes *
      60 *
      1000
    );

  const startDate =
    new Date(
      filterStartMs
    );

  const startLabel =
    formatYMDHM(
      startDate
    );

  const el =
    document.getElementById(
      "filterStartTime"
    );

  if (el) {
    el.textContent =
      startLabel;
  }

  let validCount = 0;
  let invalidCount = 0;

  State.filtered =
    State.all.filter(
      p => {

        if (
          !p.updateDate
        ) {

          invalidCount++;

          return false;
        }

        const date =
          parseDateJST(
            p.updateDate
          );

        if (
          !date ||
          isNaN(
            date.getTime()
          )
        ) {

          invalidCount++;

          return false;
        }

        validCount++;

        return (
          date.getTime() >=
          filterStartMs
        );
      }
    );

  log(
    "フィルタ結果: "
    + State.filtered.length
    + "件 / 有効:"
    + validCount
    + "件 / 無効:"
    + invalidCount
    + "件"
  );

  log(
    "フィルタ開始時刻: " +
    startLabel
  );
}

/* =========================================================
 [9100] Summary Builder:buildSummary【State】【DOM】（旧 [5300]）
========================================================= */
function buildSummary() {
  const selectedStars =
    readSelectedStars();

  const selectedPrides =
    readSelectedPrides();

  const base =
    State.filtered;

  const selectedRanks =
    RANKS
      .filter(rank => {

        if (rank.type === "ruby") {

          return selectedStars.includes(
            rank.star
          );
        }

        if (rank.type === "pride") {

          return selectedPrides.includes(
            rank.key
          );
        }

        return false;
      });
  const listsByRank =
    new Map(selectedRanks.map(rank => [rank.key, []]));
  const rubyRanksByStar =
    new Map(selectedRanks
      .filter(rank => rank.type === "ruby")
      .map(rank => [rank.star, rank]));
  const prideRanks =
    selectedRanks.filter(rank => rank.type === "pride");

  for (const player of base) {
    if (player.onlineBattleRankId === RUBY_ID) {
      const rank = rubyRanksByStar.get(player.starCnt);
      if (rank) {
        listsByRank.get(rank.key).push(player);
      }
    }
    const pridePoint = Number(player.pridePoint ?? 0);
    for (const rank of prideRanks) {
      if (pridePoint >= rank.min && pridePoint <= rank.max) {
        listsByRank.get(rank.key).push(player);
      }
    }
  }

  State.summary = selectedRanks.map(rank => ({
    key: rank.key,
    label: rank.label,
    icon: rank.icon,
    list: listsByRank.get(rank.key)
  }));
}

/* =========================================================
 [9200] Search Filter:filterSummaryBySearch【State】（旧 [5400]）
========================================================= */
function filterSummaryBySearch() {

  const norm =
    normalize(
      State.searchText
    );

  if (!norm) {
    return State.summary;
  }

  const filtered =
    State.summary
      .map(r => {

        const filteredList =
          r.list.filter(
            p =>
              (
                p.normalizedName || ""
              ).includes(norm)
          );

        return {
          ...r,
          list: filteredList
        };
      })
      .filter(
        r => r.list.length > 0
      );

  return filtered;
}

/* =========================================================
 [9210] Search Filter:applyPlayerFilter【State】（旧 [6700]）
========================================================= */
function applyPlayerFilter(
  keyword,
  keepOriginalOrder = false
) {

  const normKey =
    normalize(keyword);

  let base =
    State.detailOriginal.slice();

  /* =====================================
   * ソート制御
   * ===================================== */

  if (!keepOriginalOrder) {

    base = base.sort(
      (a, b) =>
        parseDateJST(
          b.updateDate
        ) -
        parseDateJST(
          a.updateDate
        )
    );
  }

  /* =====================================
   * 検索フィルタ
   * ===================================== */

  if (!normKey) {
    return base;
  }

  return base.filter(
    p =>
      (
        p.normalizedName || ""
      ).includes(normKey)
  );
}

/* =========================================================
 [9300] Matching Filter:applyMatchingFilter【State】【DOM】
 ※ 呼び出し側（[15100] Entry Point）は searchInput の input イベント
    で State.searchText を渡す。DETAIL 側の applyPlayerFilter と同様に
    normalizedName の前方一致（normalize 済み includes）で絞り込み、
    マッチング候補テーブルの行だけを再描画する。
========================================================= */
function applyMatchingFilter(
  keyword
) {

  const norm =
     typeof normalize === "function" ? normalize(keyword) : String(keyword || "").trim().toLowerCase();

  const base =
     State.matchingList || [];

  if (typeof document === "undefined") {
    const list = !norm
      ? base
      : base.filter(
          p => (p.normalizedName || "").includes(norm)
        );
    renderMatchingRows(list);
    return;
  }

  const rankCountsEl =
    document.getElementById("matchingRankCounts");
  const matchingHeaderEl =
    document.getElementById("matchingSearchResultsHeader");
  const matchingTitleEl =
    document.getElementById("matchingSearchResultsTitle");
  const matchingEmptyEl =
    document.getElementById("matchingCandidateEmptyMessage");
  const matchingTableWrap =
    document.getElementById("matchingTableWrapper");

  const rankSectionEl =
    document.getElementById("matchingCrossRankSection");
  const rankTitleEl =
    document.getElementById("matchingCrossRankTitle");
  const rankEmptyEl =
    document.getElementById("matchingCrossRankEmptyMessage");
  const rankTableWrap =
    document.getElementById("matchingCrossRankTableWrapper");

  const modeColor =
    State.matchingContext?.mode === "preview" ? "#2563a6" : "#e91e63";

  if (!norm) {
    if (rankCountsEl) rankCountsEl.style.display = "flex";
    if (matchingHeaderEl) matchingHeaderEl.style.display = "none";
    if (matchingEmptyEl) matchingEmptyEl.style.display = "none";
    if (matchingTableWrap) matchingTableWrap.style.display = "block";
    renderMatchingRows(base);

    if (rankSectionEl) rankSectionEl.style.display = "none";
    return;
  }

  // 1. MATCHING候補内での絞り込み
  const matchingFiltered = base.filter(
    p => (p.normalizedName || "").includes(norm)
  );

  if (rankCountsEl) rankCountsEl.style.display = "none";
  if (matchingHeaderEl) {
    matchingHeaderEl.style.display = "block";
    if (matchingTitleEl) {
      matchingTitleEl.style.color = modeColor;
      matchingTitleEl.textContent = `🔍 MATCHING候補の検索結果: ${matchingFiltered.length}名`;
    }
  }

  if (matchingFiltered.length > 0) {
    if (matchingEmptyEl) matchingEmptyEl.style.display = "none";
    if (matchingTableWrap) matchingTableWrap.style.display = "block";
    renderMatchingRows(matchingFiltered);
  } else {
    if (matchingTableWrap) matchingTableWrap.style.display = "none";
    if (matchingEmptyEl) {
      matchingEmptyEl.textContent = "";
      matchingEmptyEl.style.display = "none";
    }
  }

  // 2. 全体（RANK）での絞り込み
  const rankFilteredSummary = typeof filterSummaryBySearch === "function" ? filterSummaryBySearch() : [];
  const rankMatchedPlayers = rankFilteredSummary.flatMap(r => r.list || []);

  if (rankSectionEl) {
    rankSectionEl.style.display = "block";
    if (rankTitleEl) {
      rankTitleEl.textContent = `🔍 全体（RANK）の検索結果: ${rankMatchedPlayers.length}名`;
    }

    if (rankMatchedPlayers.length > 0) {
      if (rankEmptyEl) rankEmptyEl.style.display = "none";
      if (rankTableWrap) rankTableWrap.style.display = "block";
      renderPlayerRowsToBody("matchingCrossRankTableBody", rankMatchedPlayers);
    } else {
      if (rankTableWrap) rankTableWrap.style.display = "none";
      if (rankEmptyEl) {
        rankEmptyEl.textContent = "";
        rankEmptyEl.style.display = "none";
      }
    }
  }
}



/* #################################################################
 [LAYER 12000] Browser Actions / Export
 ################################################################# */

/* =========================================================
 [12000] Clipboard:copyToClipboard【DOM】【State】【永続化】（旧 [6610]）
========================================================= */
function copyToClipboard(
  text,
  playerName = "",
  shopName = ""
) {
  if (
    isCurrentView(STATE.MATCHING) &&
    State.matchingContext?.mode ===
      "preview"
  ) {
    log(
      "PREVIEWではコピー操作と実績記録を行いません"
    );
    return;
  }

  const afterCopySuccess = () => {

    const copyRecord =
      saveCopyEventUnified(
        playerName,
        shopName
      );

    logEvent(
      "copy",
      copyRecord,
      { onError: message => logError(message) }
    );

    /*
     * Pink管理用
     * 名前＋店舗名を直接渡す
     */
    recordClickFromCopiedInfo(
      playerName,
      shopName
    );

    log(
      `コピー: ${text}`
    );

    const matchingContext =
      State.matchingContext || {};

    const clickedAtMs =
      Date.now();

    const offsetSec =
      isCurrentView(STATE.MATCHING)
        ? Number(
            matchingContext.offsetSec
          ) || 0
        : 0;

    buildMatchingCandidates({
      clickedAtMs,
      evaluationTimeMs:
        clickedAtMs +
        offsetSec * 1000,
      offsetSec,
      mode: "matching",
      saveEvent: false
    });

    if (
      isCurrentView(
        STATE.MATCHING
      )
    ) {

      renderMatchingHeader();

      renderMatchingTable();

    } else if (
      isCurrentView(
        STATE.DETAIL
      )
    ) {

      renderDetailTable();

    } else {

      renderSummary();

    }
  };

  navigator.clipboard
    .writeText(text)
    .then(afterCopySuccess)
    .catch(
      () =>
        logError(
          "コピー失敗"
        )
    );
}

/* =========================================================
 [12050] Generic Downloader:downloadBlob【DOM】
========================================================= */
function downloadBlob(
  content,
  filename,
  mimeType = "application/json;charset=utf-8"
) {

  const blob =
    new Blob(
      [content],
      {
        type: mimeType
      }
    );

  const url =
    URL.createObjectURL(
      blob
    );

  const a =
    document.createElement(
      "a"
    );

  a.href = url;

  a.download =
    filename;

  a.click();

  URL.revokeObjectURL(
    url
  );
}

/* =========================================================
 [12100] CSV Export:downloadCSV【DOM】（旧 [8000]）
========================================================= */
function downloadCSV(
  filename,
  header,
  body
) {

  const bom =
    "\uFEFF";

  const csv =
    bom +
    header +
    "\n" +
    body;

  downloadBlob(
    csv,
    filename,
    "text/csv;charset=utf-8"
  );
}

/* =========================================================
 [12110] CSV Export:exportSummaryCSV【State】【DOM】（旧 [8100]）
========================================================= */
function exportSummaryCSV() {

  const header =
    "帯,人数,%,平均RP,最小RP,最大RP";

  const total =
    State.summary.reduce(
      (sum, r) =>
        sum + r.list.length,
      0
    );

  const body =
    State.summary
      .map(r => {

        const {
          cnt,
          percent,
          avg,
          min,
          max
        } = calcStats(
          r.list,
          total
        );

        return [
          r.label,
          cnt,
          percent,
          avg,
          min,
          max
        ].join(",");
      })
      .join("\n");

  downloadCSV(
    "summary.csv",
    header,
    body
  );
}

/* =========================================================
 [12120] CSV Export:exportAllCSV【State】【DOM】（旧 [8200]）
========================================================= */
function exportAllCSV() {

  const header = [
    "area",
    "areaName",
    "rank",
    "name",
    "shopname",
    "updateDate",
    "roundPoint",
    "mytitleId",
    "prideId",
    "pridePoint",
    "onlineBattleRankId",
    "starCnt"
  ].join(",");

  const fields = [
    "area",
    "areaName",
    "rank",
    "name",
    "shopname",
    "updateDate",
    "point",
    "mytitleId",
    "prideId",
    "pridePoint",
    "onlineBattleRankId",
    "starCnt"
  ];

  const body =
    State.all
      .map(
        p =>
          fields
            .map(
              key =>
                `"${String(
                  p[key] ?? ""
                ).replace(
                  /"/g,
                  '""'
                )}"`
            )
            .join(",")
      )
      .join("\n");

  downloadCSV(
    "all_records.csv",
    header,
    body
  );
}

/* =========================================================
 [12210] JSON Export:exportTodayViewerLogsAsJSON【State】【永続化】【DOM】（旧 [9900]）
========================================================= */
async function exportTodayViewerLogsAsJSON() {

  const input =
    document.getElementById(
      "logExportDate"
    );

  const rawDate =
    String(
      input?.value ?? ""
    ).trim();

  let dateKey;

  /*
   * 日付未指定
   * → 当日
   */
  if (!rawDate) {

    dateKey =
      buildDailyKey();

  } else {

    /*
     * 日付指定
     */
    dateKey =
      rawDate.replaceAll(
        "-",
        ""
      );

  }

  log(
    `[analysis] rawDate=${rawDate} dateKey=${dateKey}`
  );

  const year =
    Number(
      dateKey.slice(
        0,
        4
      )
    );

  const month =
    Number(
      dateKey.slice(
        4,
        6
      )
    ) - 1;

  const day =
    Number(
      dateKey.slice(
        6,
        8
      )
    );

  const targetDate =
    `${year}/${String(
      month + 1
    ).padStart(
      2,
      "0"
    )}/${String(
      day
    ).padStart(
      2,
      "0"
    )}`;

  const startDate =
    new Date(
      year,
      month,
      day,
      4,
      0,
      0,
      0
    );

  const endDate =
    new Date(
      year,
      month,
      day + 1,
      3,
      59,
      59,
      999
    );

  const startTs =
    startDate.getTime();

  const endTs =
    endDate.getTime();

  let copyEvents;
  try {
    const raw = localStorage.getItem(LOG_STORAGE_KEYS.copyEvents + dateKey);
    copyEvents = raw === null ? [] : JSON.parse(raw);
    if (!Array.isArray(copyEvents)) throw new Error("コピー記録が配列ではありません");
  } catch (error) {
    logError(`分析JSON出力中止：コピー記録の読込失敗：${error.message}`);
    return;
  }

  const payload = {

    exportedAt:
      Date.now(),
    scriptVersion: ANALYSIS_SCRIPT_VERSION,
    matchingScriptVersion: MATCHING_SCRIPT_VERSION,

    rawDate,

    dateKey,

    targetDate,

    range: {
      start: startTs,
      end: endTs
    },

    scoringConfigSnapshot:
      State.scoringConfig ? getScoringConfigSnapshot() : null,
    pinkCycleState: State.pinkCycleState ? { ...State.pinkCycleState } : null,

    copyEvents,

    candidateEvents: [],

    runtimeEvents: []

  };

  let activeDb = getLogDB();
  if (!activeDb && typeof initLogDB === "function") {
    try {
      activeDb = await initLogDB();
    } catch (error) {
      logError(`分析JSON出力中止：IndexedDB初期化失敗：${error.message}`);
      return;
    }
  }

  if (!activeDb) {

    logError("分析JSON出力中止：IndexedDBが未初期化です");
    return;

  } else {

    try {

      const tx =
        activeDb.transaction(
          [
            LOG_STORE.candidateEvents,
            LOG_STORE.events,
            LOG_STORE.copyEvents
          ],
          "readonly"
        );

      const stored = await new Promise((resolve, reject) => {
        const result = {};
        for (const name of [LOG_STORE.candidateEvents, LOG_STORE.events, LOG_STORE.copyEvents]) {
          const req = tx.objectStore(name).getAll();
          req.onsuccess = () => { result[name] = req.result; };
          req.onerror = () => reject(req.error ?? new Error("ログ読込失敗"));
        }
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(tx.error ?? new Error("ログ読込中断"));
      });
      const candidates = stored[LOG_STORE.candidateEvents];
      const copyKey = record => record.matchEventId ??
        `${record.t}|${buildPlayerIdentityKey({ name: record.n ?? record.name, shopname: record.shopname })}`;
      payload.copyEvents = [...new Map([
        ...copyEvents,
        ...stored[LOG_STORE.copyEvents].filter(record => record.t >= startTs && record.t <= endTs)
      ].map(record => [copyKey(record), record])).values()].sort((a, b) => a.t - b.t);

      payload.candidateEvents =
        candidates.filter(
          x => {

            const ts =
              Number(
                x?.t ?? 0
              );

            return (
              ts >= startTs &&
              ts <= endTs
            );

          }
        );

      const events = stored[LOG_STORE.events];

      payload.runtimeEvents =
        events.filter(
          event => {

            const ts =
              Number(event?.t ?? 0);

            return (
              event?.e === "runtime" &&
              ts >= startTs &&
              ts <= endTs
            );
          }
        );

    } catch (e) {

      logError(
        "IndexedDB読込失敗"
      );

      console.error(
        e
      );
      return;

    }

  }

  const filename =
    `viewer_analysis_${dateKey}.json`;

  downloadBlob(
    JSON.stringify(
      payload,
      null,
      2
    ),
    filename,
    "application/json;charset=utf-8"
  );

  log(
    `分析JSON出力完了: ${filename}`
  );

}



/* #################################################################
 [LAYER 13000] Application Use Cases
 ################################################################# */

/* =========================================================
 [12990] Log Use Case:buildScoreBreakdownLog【ログ軽量化】
========================================================= */
/*
 * copyEvents / candidateEvents（candidates・allCandidates）で
 * 重複していた scoreBreakdown 組み立てを1箇所へ集約する。
 *
 * slim=false（既定）:
 *   従来どおりの全項目（バックオフ診断用の詳細項目を含む）。
 *   Top10表示分（copyEvents本体・candidates）は
 *   情報量が小さいため、こちらを使う。
 *
 * slim=true:
 *   Phase傾向分析（signedPhaseError・phaseBucket・
 *   phaseScore系）に必要な項目のみへ絞った軽量版。
 *   allCandidates（候補全件・件数が多くログ肥大化の主因）で
 *   使用する。
 */
function buildScoreBreakdownLog(
  detail,
  slim = false
) {

  detail = detail || {};

  if (slim) {

    return {
      ...Object.fromEntries(CANDIDATE_TIMING_COLUMNS.map(key => [key, detail[key] ?? null])),
      historicalScore:
        Number(detail.historicalScore ?? 0),
      tierProbability:
        Number(detail.tierProbability ?? 0),
      playerBoost:
        Number(detail.playerBoost ?? 1),
      rankBoost:
        Number(detail.rankBoost ?? 1),
      realtimeBoost:
        Number(detail.realtimeBoost ?? 1),
      playerActivitySignal:
        Number(detail.playerActivitySignal ?? 0),
      rankActivitySignal:
        Number(detail.rankActivitySignal ?? 0),
      playerRealtimeBonus:
        Number(detail.playerRealtimeBonus ?? 0),
      rankRealtimeBonus:
        Number(detail.rankRealtimeBonus ?? 0),
      realtimeBonusBeforeCap:
        Number(detail.realtimeBonusBeforeCap ?? 0),
      realtimeBonusCap:
        Number(detail.realtimeBonusCap ?? 0),
      slotScore:
        Number(detail.slotScore ?? 0),
      slotBucket:
        detail.slotBucket ?? null,
      slotRank:
        Number(detail.slotRank ?? 0) ||
        null,
      crossBucketRank:
        Number(detail.crossBucketRank ?? 0) ||
        null,
      crossBucketScore:
        Number(detail.crossBucketScore ?? 0),
      prideBandPriorWeight:
        Number(detail.prideBandPriorWeight ?? 1),
      areaDensity:
        Number(detail.areaDensity ?? 0),
      areaBoost:
        Number(detail.areaBoost ?? 1),
      recentAreaMatchCount5:
        Number(detail.recentAreaMatchCount5 ?? 0),
      recentAreaMatchCount10:
        Number(detail.recentAreaMatchCount10 ?? 0),
      recentAreaMatchCount20:
        Number(detail.recentAreaMatchCount20 ?? 0),
      recentAreaMatchCountWindow:
        Number(detail.recentAreaMatchCountWindow ?? 0),
      loggedAreaMatchCount:
        Number(detail.loggedAreaMatchCount ?? 0),
      loggedAreaMatchSampleCount:
        Number(detail.loggedAreaMatchSampleCount ?? 0),
      loggedAreaMatchRate:
        Number(detail.loggedAreaMatchRate ?? 0),
      recentAreaMatchDensityWindow:
        Number(detail.recentAreaMatchDensityWindow ?? 0),
      recentAreaCounterfactualBoostWindow:
        Number(detail.recentAreaCounterfactualBoostWindow ?? 1),
      recentAreaCounterfactualSlotScore:
        Number(detail.recentAreaCounterfactualSlotScore ?? 0),
      recentAreaCounterfactualSlotRank:
        Number(detail.recentAreaCounterfactualSlotRank ?? 0) ||
        null,
      areaBucketPhaseMatchedCount:
        Number(detail.areaBucketPhaseMatchedCount ?? 0),
      areaBucketScoredCandidateCount:
        Number(detail.areaBucketScoredCandidateCount ?? 0),
      areaBucketPhaseMatchCount30:
        Number(detail.areaBucketPhaseMatchCount30 ?? 0),
      areaBucketPhaseMatchCount60:
        Number(detail.areaBucketPhaseMatchCount60 ?? 0),
      areaBucketPhaseScoreSum:
        Number(detail.areaBucketPhaseScoreSum ?? 0),
      areaBucketPeerPhaseMatchedCount:
        Number(detail.areaBucketPeerPhaseMatchedCount ?? 0),
      areaBucketPeerPhaseMatchCount30:
        Number(detail.areaBucketPeerPhaseMatchCount30 ?? 0),
      areaBucketPeerPhaseScoreSum:
        Number(detail.areaBucketPeerPhaseScoreSum ?? 0),
      areaBucketTop3BaseScoreSum:
        Number(detail.areaBucketTop3BaseScoreSum ?? 0),
      areaPhaseDensity30:
        Number(detail.areaPhaseDensity30 ?? 0),
      areaPhaseCounterfactualBoost:
        Number(detail.areaPhaseCounterfactualBoost ?? 1),
      areaPhaseCounterfactualSlotScore:
        Number(detail.areaPhaseCounterfactualSlotScore ?? 0),
      areaPhaseCounterfactualSlotRank:
        Number(detail.areaPhaseCounterfactualSlotRank ?? 0) ||
        null,
      phaseError:
        Number(detail.phaseError ?? 0),
      signedPhaseError:
        Number(detail.signedPhaseError ?? 0),
      peakDirection:
        detail.peakDirection ?? "unknown",
      phaseBucket:
        detail.phaseBucket ?? "unknown",
      phaseScore:
        Number(detail.phaseScore ?? 0),
      finalPhaseScore:
        Number(detail.finalPhaseScore ?? 0),
      effectivePhaseScore:
        Number(detail.effectivePhaseScore ?? 0),
      phaseSampleCount:
        Number(detail.phaseSampleCount ?? 0),
      phaseTrust:
        Number(detail.phaseTrust ?? 1),
      phaseAdjustValue:
        Number(detail.phaseAdjustValue ?? 0)
    };

  }

  return {
    ...Object.fromEntries(CANDIDATE_TIMING_COLUMNS.map(key => [key, detail[key] ?? null])),
    historicalScore:
      Number(detail.historicalScore ?? 0),
    historicalMatched:
      Boolean(detail.historicalMatched),
    historicalBackoff:
      Boolean(detail.historicalBackoff),
    tierProbability:
      Number(detail.tierProbability ?? 0),
    pooledTierProbability:
      Number(detail.pooledTierProbability ?? 0),
    tierCandidateCount:
      Number(detail.tierCandidateCount ?? 1),
    minOwnSamplesForNoBackoff:
      Number(detail.minOwnSamplesForNoBackoff ?? 100),
    ownSampleCount:
      Number(detail.ownSampleCount ?? 0),
    adjacentSampleCount:
      Number(detail.adjacentSampleCount ?? 0),
    adjacentViewerTiers:
      detail.adjacentViewerTiers ?? [],
    playerBoost:
      Number(detail.playerBoost ?? 1),
    rankBoost:
      Number(detail.rankBoost ?? 1),
    realtimeBoost:
      Number(detail.realtimeBoost ?? 1),
    playerActivitySignal:
      Number(detail.playerActivitySignal ?? 0),
    rankActivitySignal:
      Number(detail.rankActivitySignal ?? 0),
    playerRealtimeBonus:
      Number(detail.playerRealtimeBonus ?? 0),
    rankRealtimeBonus:
      Number(detail.rankRealtimeBonus ?? 0),
    realtimeBonusBeforeCap:
      Number(detail.realtimeBonusBeforeCap ?? 0),
    realtimeBonusCap:
      Number(detail.realtimeBonusCap ?? 0),
    slotScore:
      Number(detail.slotScore ?? 0),
    slotBucket:
      detail.slotBucket ?? null,
    slotRank:
      Number(detail.slotRank ?? 0) ||
      null,
    crossBucketRank:
      Number(detail.crossBucketRank ?? 0) ||
      null,
    crossBucketScore:
      Number(detail.crossBucketScore ?? 0),
    prideBandPriorWeight:
      Number(detail.prideBandPriorWeight ?? 1),
    areaBucketCount:
      Number(detail.areaBucketCount ?? 0),
    areaTotalCount:
      Number(detail.areaTotalCount ?? 0),
    areaBucketTotal:
      Number(detail.areaBucketTotal ?? 0),
    areaBucketTrust:
      Number(detail.areaBucketTrust ?? 0),
    areaDensity:
      Number(detail.areaDensity ?? 0),
    areaBoost:
      Number(detail.areaBoost ?? 1),
    recentAreaMatchCount5:
      Number(detail.recentAreaMatchCount5 ?? 0),
    recentAreaMatchCount10:
      Number(detail.recentAreaMatchCount10 ?? 0),
    recentAreaMatchCount20:
      Number(detail.recentAreaMatchCount20 ?? 0),
    recentAreaMatchCountWindow:
      Number(detail.recentAreaMatchCountWindow ?? 0),
    loggedAreaMatchCount:
      Number(detail.loggedAreaMatchCount ?? 0),
    loggedAreaMatchSampleCount:
      Number(detail.loggedAreaMatchSampleCount ?? 0),
    loggedAreaMatchRate:
      Number(detail.loggedAreaMatchRate ?? 0),
    recentAreaMatchDensityWindow:
      Number(detail.recentAreaMatchDensityWindow ?? 0),
    recentAreaCounterfactualBoostWindow:
      Number(detail.recentAreaCounterfactualBoostWindow ?? 1),
    recentAreaCounterfactualSlotScore:
      Number(detail.recentAreaCounterfactualSlotScore ?? 0),
    recentAreaCounterfactualSlotRank:
      Number(detail.recentAreaCounterfactualSlotRank ?? 0) ||
      null,
    areaBucketPhaseMatchedCount:
      Number(detail.areaBucketPhaseMatchedCount ?? 0),
    areaBucketScoredCandidateCount:
      Number(detail.areaBucketScoredCandidateCount ?? 0),
    areaBucketPhaseMatchCount30:
      Number(detail.areaBucketPhaseMatchCount30 ?? 0),
    areaBucketPhaseMatchCount60:
      Number(detail.areaBucketPhaseMatchCount60 ?? 0),
    areaBucketPhaseScoreSum:
      Number(detail.areaBucketPhaseScoreSum ?? 0),
    areaBucketPeerPhaseMatchedCount:
      Number(detail.areaBucketPeerPhaseMatchedCount ?? 0),
    areaBucketPeerPhaseMatchCount30:
      Number(detail.areaBucketPeerPhaseMatchCount30 ?? 0),
    areaBucketPeerPhaseScoreSum:
      Number(detail.areaBucketPeerPhaseScoreSum ?? 0),
    areaBucketTop3BaseScoreSum:
      Number(detail.areaBucketTop3BaseScoreSum ?? 0),
    areaPhaseDensity30:
      Number(detail.areaPhaseDensity30 ?? 0),
    areaPhaseCounterfactualBoost:
      Number(detail.areaPhaseCounterfactualBoost ?? 1),
    areaPhaseCounterfactualSlotScore:
      Number(detail.areaPhaseCounterfactualSlotScore ?? 0),
    areaPhaseCounterfactualSlotRank:
      Number(detail.areaPhaseCounterfactualSlotRank ?? 0) ||
      null,
    phaseError:
      Number(detail.phaseError ?? 0),
    signedPhaseError:
      Number(detail.signedPhaseError ?? 0),
    phasePos:
      Number(detail.phasePos ?? 0),
    peakDirection:
      detail.peakDirection ?? "unknown",
    phaseBucket:
      detail.phaseBucket ?? "unknown",
    diffSec:
      Number(detail.diffSec ?? 0),
    phaseScore:
      Number(detail.phaseScore ?? 0),
    decay:
      Number(detail.decay ?? 0),
    finalPhaseScore:
      Number(detail.finalPhaseScore ?? 0),
    effectivePhaseScore:
      Number(detail.effectivePhaseScore ?? 0),
    phaseWeight:
      Number(detail.phaseWeight ?? 0),
    phaseSampleCount:
      Number(detail.phaseSampleCount ?? 0),
    phaseTrust:
      Number(detail.phaseTrust ?? 1),
    phaseAdjustValue:
      Number(detail.phaseAdjustValue ?? 0)
  };

}

/* =========================================================
 [12995] Log Use Case:buildAllCandidateRow【ログ軽量化】
========================================================= */
/*
 * allCandidates 用の行データ（配列）を構築する。
 * 列の並びは ALL_CANDIDATES_COLUMNS と必ず一致させること。
 */
function buildAllCandidateRow(
  p
) {

  const d =
    p.__detail || {};

  return [
    p.__scoreRank ?? null,
    p.name,
    p.shopname ?? "",
    p.__rankKey ?? null,
    String(p.area ?? ""),
    Number(
      (p.__score ?? 0).toFixed(6)
    ),
    p.displayRank ? 1 : 0,
    p.displayRank ?? null,
    p.__crossBucket ? 1 : 0,
    p.__crossBucketRank ?? null,
    Number(p.__crossBucketScore ?? 0),
    p.__crossBucketSelectionReason ?? null,
    d.isPinkManaged ? 1 : 0,
    d.pinkPhaseMatched ? 1 : 0,
    Number(d.pinkMismatchBoostFactor ?? 1),
    Number(d.historicalScore ?? 0),
    d.historicalBackoff ? 1 : 0,
    Number(d.tierProbability ?? 0),
    Number(d.playerBoost ?? 1),
    Number(d.rankBoost ?? 1),
    Number(d.realtimeBoost ?? 1),
    Number(d.playerActivitySignal ?? 0),
    Number(d.rankActivitySignal ?? 0),
    Number(d.playerRealtimeBonus ?? 0),
    Number(d.rankRealtimeBonus ?? 0),
    Number(d.realtimeBonusBeforeCap ?? 0),
    Number(d.realtimeBonusCap ?? 0),
    Number(d.slotScore ?? 0),
    d.slotBucket ?? null,
    Number(d.slotRank ?? 0) || null,
    Number(d.prideBandPriorWeight ?? 1),
    Number(d.areaBucketCount ?? 0),
    Number(d.areaTotalCount ?? 0),
    Number(d.areaDensity ?? 0),
    Number(d.areaBoost ?? 1),
    Number(d.recentAreaMatchCount5 ?? 0),
    Number(d.recentAreaMatchCount10 ?? 0),
    Number(d.recentAreaMatchCount20 ?? 0),
    Number(d.recentAreaMatchCountWindow ?? 0),
    Number(d.loggedAreaMatchCount ?? 0),
    Number(d.loggedAreaMatchSampleCount ?? 0),
    Number(d.loggedAreaMatchRate ?? 0),
    Number(d.recentAreaMatchDensityWindow ?? 0),
    Number(d.recentAreaCounterfactualBoostWindow ?? 1),
    Number(d.recentAreaCounterfactualSlotScore ?? 0),
    Number(d.recentAreaCounterfactualSlotRank ?? 0) || null,
    Number(d.areaBucketScoredCandidateCount ?? 0),
    Number(d.areaBucketPhaseMatchedCount ?? 0),
    Number(d.areaBucketPhaseMatchCount30 ?? 0),
    Number(d.areaBucketPhaseMatchCount60 ?? 0),
    Number(d.areaBucketPhaseScoreSum ?? 0),
    Number(d.areaBucketPeerPhaseMatchedCount ?? 0),
    Number(d.areaBucketPeerPhaseMatchCount30 ?? 0),
    Number(d.areaBucketPeerPhaseScoreSum ?? 0),
    Number(d.areaBucketTop3BaseScoreSum ?? 0),
    Number(d.areaPhaseDensity30 ?? 0),
    Number(d.areaPhaseCounterfactualBoost ?? 1),
    Number(d.areaPhaseCounterfactualSlotScore ?? 0),
    Number(d.areaPhaseCounterfactualSlotRank ?? 0) || null,
    Number(d.phaseError ?? 0),
    Number(d.signedPhaseError ?? 0),
    d.peakDirection ?? "unknown",
    d.phaseBucket ?? "unknown",
    Number(d.phaseScore ?? 0),
    Number(d.decay ?? 0),
    Number(d.finalPhaseScore ?? 0),
    Number(d.effectivePhaseScore ?? 0),
    Number(d.phaseWeight ?? 0),
    Number(d.phaseSampleCount ?? 0),
    Number(d.phaseTrust ?? 1),
    Number(d.phaseAdjustValue ?? 0),
    ...CANDIDATE_TIMING_COLUMNS.map(key => d[key] ?? null)
  ];

}

/* =========================================================
 [13000] Copy Use Case:saveCopyEventUnified【State】【永続化】（旧 [9200]）
========================================================= */
function saveCopyEventUnified(
  playerName = "",
  shopName = ""
) {

  const candidateEventIdForCopy =
    State.latestCandidateEventIdForCopy ??
    State.activeCandidateEventId ??
    null;

  const normalizedName =
    normalizePlayerName(
      playerName
    );

  const normalizedShop =
    normalizePlayerName(
      shopName ?? ""
    );

  const player =
    State.all.find(
      p =>
        normalizePlayerName(
          p.name
        ) === normalizedName
        &&
        normalizePlayerName(
          p.shopname ?? ""
        ) === normalizedShop
    );

  if (!player) {

    const record = {

      t:
        Date.now(),

      logSchemaVersion:
        ANALYSIS_LOG_SCHEMA_VERSION,
      scriptVersion: ANALYSIS_SCRIPT_VERSION,
      matchingScriptVersion: MATCHING_SCRIPT_VERSION,

      dk:
        buildDailyKey(),

      n:
        playerName,

      shopname:
        shopName,

      score:
        null,

      slotScore:
        null,

      slotBucket:
        null,

      slotRankAtPrediction:
        null,

      crossBucketRankAtPrediction:
        null,

      crossBucketScoreAtPrediction:
        null,

      wasSelectedByCrossBucket:
        false,

      scoreRank:
        null,

      predictedRank:
        null,

      wasInTop10:
        false,

      unmatchedPlayer:
        true,

      integratedDataGeneratedAtAtCopy:
        State.generatedAt || null,

      latestUpdateAtAtCopy:
        State.latestUpdateAt || null,

      populationAtCopy: {
        integratedData:
          buildRankPopulationSnapshot(
            State.all
          ),
        filteredData:
          buildRankPopulationSnapshot(
            State.filtered
          )
      },

      candidateEventId:
        candidateEventIdForCopy,

      predictionSnapshotAvailable:
        false,

      scoreSource:
        "unavailable"

    };

    persistCopyRecordLocally(record);

    return record;

  }

  const scoredAtPrediction =
    candidateEventIdForCopy
      ? State.matchingScoredAll.find(
          candidate =>
            buildPlayerIdentityKey(
              candidate
            ) ===
            buildPlayerIdentityKey(
              player
            )
        ) ?? null
      : null;

  let scoredPlayer =
    scoredAtPrediction;

  if (!scoredPlayer) {
    scoredPlayer =
      buildCandidateScore(
        player,
        State.matchingTierCounts,
        buildViewerHistoricalContext(
          State.myRankKey
        ),
        candidateEventIdForCopy
          ? Number(
              State.matchingContext
                ?.evaluationTimeMs
            ) || Date.now()
          : Date.now()
      );

    applyCandidateSlotScores(
      [scoredPlayer],
      buildAreaDensityContext(
        State.filtered
      ),
      [
        ...State.matchingScoredAll,
        scoredPlayer
      ]
    );

    const diagnosticCandidates = [
      ...State.matchingScoredAll.filter(
        candidate =>
          buildPlayerIdentityKey(candidate) !==
          buildPlayerIdentityKey(scoredPlayer)
      ),
      scoredPlayer
    ];

    applyCandidateAreaHistoryBoost(
      diagnosticCandidates
    );

    applyCandidateAreaPhaseDiagnostics(
      diagnosticCandidates
    );

  }

  const detail =
    scoredPlayer.__detail;

  const rankedAll =
    candidateEventIdForCopy
      ? State.matchingRankedAll ?? []
      : [];

  const displayedCandidates =
    candidateEventIdForCopy
      ? State.matchingList ?? []
      : [];

  let candidateRank = -1;

  const idx =
    rankedAll.findIndex(
      p =>
        normalizePlayerName(
          p.name
        ) ===
          normalizePlayerName(
            player.name
          )
        &&
        String(
          p.shopname ?? ""
        ) ===
          String(
            player.shopname ?? ""
          )
    );

  if (idx >= 0) {

    candidateRank =
      idx + 1;

  }

  const displayedIndex =
    displayedCandidates.findIndex(
      p =>
        normalizePlayerName(
          p.name
        ) ===
          normalizePlayerName(
            player.name
          )
        &&
        normalizePlayerName(
          p.shopname ?? ""
        ) ===
          normalizePlayerName(
            player.shopname ?? ""
          )
    );

  const predictedRank =
    displayedIndex >= 0
      ? displayedIndex + 1
      : null;

  /*
   * Pink管理対象の再登場分析用
   * ・pinkEntryAgeSec: 初回コピーからの経過秒
   * ・cycleCountAtCopy: コピー時点での周期経過回数
   */
  const pinkTargetAtCopy =
    getPinkTarget(player);

  const pinkEntryAgeSec =
    pinkTargetAtCopy?.firstCopiedAt
      ? Number(
          (
            (Date.now() -
              pinkTargetAtCopy.firstCopiedAt) /
            1000
          ).toFixed(1)
        )
      : null;

  const cycleCountAtCopy =
    getPlayerCycleCount(player);

  const record = {

    t:
      Date.now(),

    logSchemaVersion:
      ANALYSIS_LOG_SCHEMA_VERSION,
    scriptVersion: ANALYSIS_SCRIPT_VERSION,
    matchingScriptVersion: MATCHING_SCRIPT_VERSION,

    dk:
      buildDailyKey(),

    n:
      player.name ?? "",

    shopname:
      player.shopname ?? "",

    score:
      Number(detail.score ?? 0),

    slotScore:
      Number(
        detail.slotScore ?? 0
      ),

    slotBucket:
      detail.slotBucket ?? null,

    slotRankAtPrediction:
      scoredAtPrediction
        ?.__slotRank ?? null,

    crossBucketRankAtPrediction:
      scoredAtPrediction
        ?.__crossBucketRank ?? null,

    crossBucketScoreAtPrediction:
      scoredAtPrediction
        ?.__crossBucketScore ?? null,

    wasSelectedByCrossBucket:
      displayedIndex >= 0 &&
      Boolean(
        displayedCandidates[
          displayedIndex
        ]?.__crossBucket
      ),

    scoreRank:
      candidateRank > 0
        ? candidateRank
        : null,

    predictedRank,

    wasInTop10:
      predictedRank !== null,

    predictionSnapshotAvailable:
      Boolean(scoredAtPrediction),

    scoreSource:
      scoredAtPrediction
        ? "prediction"
        : "copy-time-recalculation",

    scoreBreakdown:
      buildScoreBreakdownLog(
        detail,
        false
      ),

    viewerTier:
      detail.viewerTier ?? null,

    opponentTier:
      detail.opponentTier ?? null,

    area:
      detail.area ?? "",

    isYellow:
      Boolean(detail.isYellow),

    isPink:
      Boolean(detail.isPink),

    isPinkManaged:
      Boolean(detail.isPinkManaged),

    yellowThreshold:
      Number(detail.yellowThreshold ?? 0),

    pinkThreshold:
      Number(detail.pinkThreshold ?? 0),

    /*
     * Pink再登場分析用フィールド
     */
    pinkEntryAgeSec,

    cycleCountAtCopy,

    integratedDataGeneratedAtAtCopy:
      State.generatedAt || null,

    latestUpdateAtAtCopy:
      State.latestUpdateAt || null,

    populationAtCopy: {
      integratedData:
        buildRankPopulationSnapshot(
          State.all
        ),
      filteredData:
        buildRankPopulationSnapshot(
          State.filtered
        )
    },

    candidateEventId:
      candidateEventIdForCopy

  };

  persistCopyRecordLocally(record);

  appendCopyAreaHistory(record);

  return record;

}

/* =========================================================
 [13020] Copy Use Case:recordClickFromCopiedInfo【State】【永続化】（旧 [7100]）
========================================================= */
function recordClickFromCopiedInfo(
  playerName,
  shopName
) {

  if (!playerName) return;

  const candidateEventIdForCopy =
    State.latestCandidateEventIdForCopy ??
    State.activeCandidateEventId ??
    null;

  const normalizedName =
    normalizePlayerName(
      playerName
    );

  const normalizedShop =
    normalizePlayerName(
      shopName ?? ""
    );

  const player =
    State.all.find(
      p =>
        normalizePlayerName(
          p.name
        ) === normalizedName
        &&
        normalizePlayerName(
          p.shopname ?? ""
        ) === normalizedShop
    );

  if (!player) return;

  const copiedAt =
    Date.now();

  /* ----------------------------------------------------
   * 1. 重複コピーガード（Debounce Guard）
   * 15秒以内に同一プレイヤーが連続コピーされた場合、
   * 周期学習データの歪みを防ぐため学習サンプル登録をスキップする
   * ---------------------------------------------------- */
  const lastClick = State.recentClicks[0];
  const isSamePlayerAsLast =
    lastClick &&
    normalizePlayerName(lastClick.name ?? "") === normalizedName &&
    normalizePlayerName(lastClick.shopname ?? "") === normalizedShop;

  const timeDiffSec = lastClick ? (copiedAt - Number(lastClick.time || 0)) / 1000 : Infinity;
  const isDuplicateGuard = isSamePlayerAsLast && timeDiffSec < 15;

  if (isDuplicateGuard) {
    if (typeof log === "function") {
      log(`[重複コピーガード] ${player.name} (直前コピーから ${Math.round(timeDiffSec)}秒): 周期学習登録をスキップしました`);
    }
  }

  /* ----------------------------------------------------
   * 2. 直前予測順位の自動特定
   * 現在のマッチング候補リスト（State.matchingList）における
   * このプレイヤーの予測順位（1-indexed）を取得
   * ---------------------------------------------------- */
  const candidateIndex =
    candidateEventIdForCopy
      ? (State.matchingList || []).findIndex(
          p =>
            normalizePlayerName(
              p.name ?? ""
            ) === normalizedName &&
            normalizePlayerName(
              p.shopname ?? ""
            ) === normalizedShop
        )
      : -1;

  const predictedRank = candidateIndex >= 0 ? candidateIndex + 1 : null;
  const predictedPlayer =
    candidateEventIdForCopy
      ? State.matchingScoredAll.find(
          candidate =>
            buildPlayerIdentityKey(
              candidate
            ) ===
            buildPlayerIdentityKey(
              player
            )
        ) ?? null
      : null;

  const scoreDetail =
    predictedPlayer?.__detail ??
    calcMatchingScoreDetail(
      player,
      State.matchingTierCounts,
      buildViewerHistoricalContext(
        State.myRankKey
      ),
      candidateEventIdForCopy
        ? Number(
            State.matchingContext
              ?.evaluationTimeMs
          ) || copiedAt
        : copiedAt
    );

  const areaName =
    AreaList[
      String(player.area)
    ] ||
    player.areaName ||
    "";

  const rankKey =
    getPlayerRankKey(
      player
    );

  /* ----------------------------------------------------
   * 2b. Undo用スナップショット取得
   * 「コピークリック前の状態」に正確に戻すため、
   * 変更を加える対象（PinkTarget / EncounterHistory / YellowSamples）の
   * 現状（クリック前）をディープコピーで保存しておく。
   * ---------------------------------------------------- */
  const undoIdentityKey = buildPlayerIdentityKey(player);

  const snapshotBeforeCopy = {
    pinkEntry: State.pinkTargets[undoIdentityKey]
      ? JSON.parse(JSON.stringify(State.pinkTargets[undoIdentityKey]))
      : null,
    encounterEntry: State.encounterHistory[undoIdentityKey]
      ? JSON.parse(JSON.stringify(State.encounterHistory[undoIdentityKey]))
      : null,
    yellowSamples: JSON.parse(JSON.stringify(State.yellowSamples || [])),
    phaseAdjust: JSON.parse(JSON.stringify(State.phaseAdjust || { yellow: 0, pink: 0 })),
    pinkCycleState: State.pinkCycleState ? { ...State.pinkCycleState } : null
  };

  State.recentClicks.unshift({

    name:
      player.name,

    area:
      player.area,

    areaName:
      areaName,

    shopname:
      player.shopname,

    starCnt:
      player.starCnt,

    pridePoint:
      player.pridePoint,

    rankKey:
      rankKey,

    updateDate:
      player.updateDate,

    time:
      copiedAt,

    copiedAt:
      copiedAt,

    predictedRank:
      predictedRank,

    /*
     * コピークリック前の状態に戻すためのスナップショット
     * （undoLastCopiedInfo から参照）
     */
    __undoSnapshot:
      snapshotBeforeCopy,

    __undoIdentityKey:
      undoIdentityKey,

    __undoApplied:
      !isDuplicateGuard

  });

  State.recentClicks =
    State.recentClicks.slice(
      0,
      20
    );

  rebuildRecentClickIndex();

  /* 重複ガード中でない場合のみ周期学習・履歴に登録 */
  if (!isDuplicateGuard) {
    const isPinkManagedBefore =
      Boolean(snapshotBeforeCopy.pinkEntry);

    registerPinkTarget(
      player,
      copiedAt
    );

    updateEncounterHistory(
      player,
      copiedAt
    );

    /*
     * 学習の分離
     * 当日初コピー（＝コピー前時点でPink未管理）の時だけ
     * Yellow周期学習用サンプルとして登録・学習を行う。
     * （Pink管理対象の再マッチングデータがYellowに混入するのを防ぐ）
     */
    if (!isPinkManagedBefore) {
      registerYellowSample(
        player,
        copiedAt
      );
    }
  }

  /* ----------------------------------------------------
   * 3. マッチング実績＆予測的中の自動ログ記録
   * ---------------------------------------------------- */
  logEvent(
    "match-copied",
    {
      player: {
        name: player.name ?? "",
        shopname: player.shopname ?? "",
        area: player.area ?? "",
        rankKey: rankKey
      },
      predictedRank: predictedRank,
      totalCandidates: (State.matchingList || []).length,
      score: Number((scoreDetail.score || 0).toFixed(6)),
      isDuplicateGuard: isDuplicateGuard,
      timestamp: copiedAt
    }
  );

  const pinkTarget =
    getPinkTarget(
      player
    );

  if (pinkTarget && !isDuplicateGuard) {

    logEvent(
      "pink-trigger",
      {

        player: {

          name:
            player.name ?? "",

          shopname:
            player.shopname ?? "",

          area:
            player.area ?? "",

          rankKey:
            rankKey

        },

        pinkCycle:
          Number(
            (
              getCurrentCycle(
                player
              ) || 0
            ).toFixed(2)
          ),

        encounterCount:
          Number(
            getEncounterHistory(
              player
            )?.count ||
            pinkTarget.copyCount ||
            0
          ),

        score:
          Number(
            (
              scoreDetail.score || 0
            ).toFixed(6)
          ),

        timestamp:
          copiedAt

      }
    );

  }

}

/* =========================================================
 [13030] Copy Use Case:undoLastCopiedInfo【State】【永続化】（旧 [7105]）
========================================================= */
function undoLastCopiedInfo() {
  if (!State.recentClicks || State.recentClicks.length === 0) {
    if (typeof log === "function") {
      log("取消対象の直前コピー履歴がありません");
    }
    return false;
  }

  /* 直前のコピー履歴を1件取得して除外 */
  const lastTarget = State.recentClicks.shift();
  rebuildRecentClickIndex();

  if (!lastTarget) return false;

  /*
   * 重複コピーガードによりそもそも学習データへの登録が
   * 行われていなかった場合は、復元処理自体が不要
   */
  if (!lastTarget.__undoApplied) {
    savePinkStateToStorage();
    logEvent("match-copied-undo", {
      player: { name: lastTarget.name, shopname: lastTarget.shopname },
      wasDuplicateGuardSkip: true,
      timestamp: Date.now()
    });
    if (typeof log === "function") {
      log(`[コピー取消完了] ${lastTarget.name} （重複ガード対象のため学習データへの影響なし）`);
    }
    return true;
  }

  const snapshot = lastTarget.__undoSnapshot;
  const identityKey = lastTarget.__undoIdentityKey;

  if (snapshot && identityKey) {

    /* 1. Pinkターゲット：コピー前の状態に完全復元 */
    if (snapshot.pinkEntry) {
      /* 元々Pink管理対象だった → その時点の状態にそのまま戻す */
      State.pinkTargets[identityKey] = snapshot.pinkEntry;
    } else {
      /* 誤って「初めて」Pink管理対象になった → 対象から完全に除外 */
      delete State.pinkTargets[identityKey];
    }

    /* 2. 遭遇履歴：コピー前の状態に完全復元 */
    if (snapshot.encounterEntry) {
      State.encounterHistory[identityKey] = snapshot.encounterEntry;
    } else {
      delete State.encounterHistory[identityKey];
    }

    /* 3. Yellow周期学習サンプル：コピー前の配列にそのまま戻す */
    State.yellowSamples = snapshot.yellowSamples;

    /* 4. 周期補正値（EMA学習結果）もコピー前の値に戻す */
    State.phaseAdjust = snapshot.phaseAdjust;
    State.pinkCycleState = snapshot.pinkCycleState;

  } else {
    if (typeof log === "function") {
      logWarn(`[コピー取消] ${lastTarget.name} のスナップショットが見つからないため、学習データは変更していません`);
    }
  }

  savePinkStateToStorage();

  /* 5. 取り消しイベントのログ記録 */
  logEvent("match-copied-undo", {
    player: {
      name: lastTarget.name,
      shopname: lastTarget.shopname
    },
    undoneCopiedAt: Number(lastTarget.time || lastTarget.copiedAt || 0),
    restoredToPinkManaged: Boolean(snapshot?.pinkEntry),
    timestamp: Date.now()
  });

  if (typeof log === "function") {
    const statusMsg = snapshot?.pinkEntry
      ? "（Pink管理継続・周期基準を巻き戻し）"
      : "（Pink管理対象から除外）";
    log(`[コピー取消完了] ${lastTarget.name} のマッチング記録・学習サンプルをコピー前の状態に復元しました ${statusMsg}`);
  }

  return true;
}

/* =========================================================

 [13100] Candidate Event Log:saveCandidateEvent【State】【永続化】（旧 [9500]）
========================================================= */
function saveCandidateEvent(
  {
    clickedAtMs = Date.now(),
    evaluationTimeMs = clickedAtMs,
    offsetSec = 0
  } = {}
) {

  const now =
    clickedAtMs;

  const analysisDiagnostics = buildAnalysisDiagnostics();

  /*
   * ログ整合性修正
   *
   * 以前はここで -45〜45 のハードコード値を
   * 使っていたため、実際のスコアリングに使う
   * calcYellowCycle / calcPinkCycle（configの
   * maxShiftSec を参照）と乖離していた。
   * ここも同じ config を参照して統一する。
   */
  const yellowCfg =
    State.scoringConfig
      ?.phase?.yellow ?? {};

  const pinkCfg =
    State.scoringConfig
      ?.phase?.pink ?? {};

  const yellowCycle =
    (yellowCfg.baseCycleSec ?? 345) +
    clamp(
      State.phaseAdjust?.yellow ?? 0,
      -(yellowCfg.maxShiftSec ?? 45),
      (yellowCfg.maxShiftSec ?? 45)
    );

  const pinkCycle =
    (pinkCfg.baseCycleSec ?? 345) +
    clamp(
      State.phaseAdjust?.pink ?? 0,
      -(pinkCfg.maxShiftSec ?? 45),
      (pinkCfg.maxShiftSec ?? 45)
    );

  /*
   * Yellow学習状況
   */
  const yellowSamples =
    State.yellowSamples ?? [];

  const baseCycleSec = yellowCfg.baseCycleSec ?? 345;

  const yellowValues =
    yellowSamples
      .map(s => {

        const diffSec =
          Number(s.diffSec ?? 0);

        if (
          !isFinite(diffSec) ||
          diffSec <= 0
        ) {
          return null;
        }

        /*
         * 複数周期除去
         *
         * 305 → 5
         * 598 → -2
         * 905 → 5
         * 1198 → -2
         */
        const folded =
          foldToCycle(
            diffSec,
            baseCycleSec
          );

        /*
         * 【2026-09 改善3】学習ロジック（calcYellowCycle）と
         * 整合させるため、こちらの診断表示も
         * 1周期当たりの誤差へ正規化する。
         */
        const cycleCount =
          Number.isFinite(
            Number(s.cycleCount)
          ) &&
          Number(s.cycleCount) > 0
            ? Number(s.cycleCount)
            : Math.max(
                1,
                Math.round(
                  diffSec / baseCycleSec
                )
              );

        return (
          folded /
          Math.max(1, cycleCount)
        );

      })
      .filter(
        v =>
          v !== null &&
          isFinite(v)
      )
      .sort(
        (a, b) => a - b
      );

  let yellowMedianOffset = 0;

  if (
    yellowValues.length > 0
  ) {

    const mid =
      Math.floor(
        yellowValues.length / 2
      );

    yellowMedianOffset =
      (yellowValues.length % 2)
        ? yellowValues[mid]
        : (
            yellowValues[mid - 1] +
            yellowValues[mid]
          ) / 2;
  }

  /*
   * Pink学習状況
   *
   * calcPinkCycle(learn:true) と同じロジックで
   * foldedList（Pink再マッチング間隔サンプル）を
   * 算出し、学習の信頼度をログへ可視化する。
   * ここではState.phaseAdjust.pinkを上書きしない
   * 読み取り専用の再計算とする。
   */
  const pinkBaseCycleSec =
    pinkCfg.baseCycleSec ?? 345;

  const pinkFoldedList = [];

  const pinkTargets =
    Object.values(
      State.pinkTargets || {}
    );

  for (const entry of pinkTargets) {

    const history =
      entry.history || [];

    if (history.length < 2) {
      continue;
    }

    const latest =
      Number(history[history.length - 1] || 0);

    const prev =
      Number(history[history.length - 2] || 0);

    if (!latest || !prev) {
      continue;
    }

    const interval =
      (latest - prev) / 1000;

    const folded =
      foldToCycle(
        interval,
        pinkBaseCycleSec
      );

    if (isFinite(folded)) {
      pinkFoldedList.push(folded);
    }
  }

  const pinkMedianOffset =
    pinkFoldedList.length > 0
      ? pinkFoldedList.reduce(
          (a, b) => a + b,
          0
        ) / pinkFoldedList.length
      : 0;

  const pinkMinSamples =
    pinkCfg.minSamples ?? 8;

  const pinkTrust =
    pinkMinSamples > 0
      ? Math.min(
          1,
          pinkFoldedList.length / pinkMinSamples
        )
      : 1;

  const pinkAdjustRaw =
    clamp(
      pinkMedianOffset,
      -(pinkCfg.maxShiftSec ?? 45),
      (pinkCfg.maxShiftSec ?? 45)
    );

  const record = {

    t: now,

    logSchemaVersion:
      ANALYSIS_LOG_SCHEMA_VERSION,
    scriptVersion: ANALYSIS_SCRIPT_VERSION,
    matchingScriptVersion: MATCHING_SCRIPT_VERSION,

    e: "candidate",

    id: now,

    evaluationOffsetSec:
      Number(offsetSec) || 0,

    trigger:
      "matching-button",

    analysisDiagnostics,

    evaluationTimeMs:
      Number(evaluationTimeMs) || now,

    dk:
      buildDailyKey(),

    viewerTier:
      mapRankKeyToTierKey(
        State.myRankKey
      ),

    integratedDataGeneratedAt:
      State.generatedAt || null,

    latestUpdateAt:
      State.latestUpdateAt || null,

    summaryFilterAtPrediction: {
      rangeMinutes:
        readRangeMinutes(),
      selectedStars:
        readSelectedStars(),
      selectedPrides:
        readSelectedPrides(),
      searchText:
        State.searchText
    },

    populationAtPrediction: {
      integratedData:
        buildRankPopulationSnapshot(
          State.all
        ),
      filteredData:
        buildRankPopulationSnapshot(
          State.filtered
        ),
      filteredDataAfterTimeAndRankFilters:
        State.matchingFilteredPopulationSnapshot,
      rankSummary:
        buildRankPopulationSnapshot(
          filterSummaryBySearch()
            .flatMap(rank => rank.list)
        ),
      scoredCandidates:
        buildRankPopulationSnapshot(
          State.matchingScoredAll
        ),
      selectionEligibleCandidates:
        buildRankPopulationSnapshot(
          State.matchingRankedAll
        )
    },

    scoringConfigSnapshot:
      State.matchingContext.scoringConfigSnapshot ?? getScoringConfigSnapshot(),
    pinkCycleState: State.pinkCycleState ? { ...State.pinkCycleState } : null,

    recentAreaBoostConfig:
      getRecentAreaBoostConfig(),

    yellowAdjust:
      Math.round(
        State.phaseAdjust?.yellow ?? 0
      ),

    yellowCycle,

    yellowSampleCount:
      yellowValues.length,

    /*
     * 周期中央値ではなく
     * 周期ズレ中央値
     */
    yellowMedianOffset:
      Number(
        yellowMedianOffset.toFixed(2)
      ),

    pinkAdjust:
      Math.round(
        State.phaseAdjust?.pink ?? 0
      ),

    pinkCycle,

    /*
     * Pink周期学習の可視化用フィールド
     * （Yellowのyellow*系フィールドに相当）
     */
    pinkSampleCount:
      pinkFoldedList.length,

    pinkMedianOffset:
      Number(
        pinkMedianOffset.toFixed(2)
      ),

    pinkTrust:
      Number(
        pinkTrust.toFixed(3)
      ),

    pinkAdjustRaw:
      Number(
        pinkAdjustRaw.toFixed(2)
      ),

    candidateCount:
      State.matchingList.length,

    candidatePoolSize:
      State.filtered.length,

    eligibleCount:
      State.matchingRankedAll.length,

    scoredCandidateCount:
      State.matchingScoredAll.length,

    filteredPopulationAfterTimeAndRankFilters: {
      candidateCount:
        State.matchingFilteredPopulationCount,
      scoredCandidateCount:
        State.matchingScoredAll.length,
      pinkCooldownExcludedCandidates:
        State.matchingCooldownExcludedCandidates
    },

    slotPlan:
      State.matchingSlotPlan.map(
        entry => ({
          bucket: entry.bucket,
          probability:
            Number(
              entry.probability.toFixed(6)
            ),
          rawQuota:
            Number(
              entry.rawQuota.toFixed(6)
            ),
          slots: entry.slots,
          capacity: entry.capacity
        })
      ),

    relativePopulationSlotAdjustment:
      State.matchingSlotAllocationDiagnostics,

    crossBucketSelection:
      State.matchingCrossBucketDiagnostics ?? {
        crossBucketSlotCount:
          getMatchingSlotCounts().crossBucket,
        wildcardSlotCount:
          getMatchingSlotCounts().wildcard,
        selectedBeforePinkCap: [],
        selectedAfterPinkCap: []
      },

    phaseErrorScaleSec: {
      yellow:
        getPhaseErrorScaleSec(
          "yellow"
        ),
      pink:
        getPhaseErrorScaleSec(
          "pink"
        )
    },

    pinkPhaseMismatchCount:
      State.matchingScoredAll.filter(
        p =>
          p.__detail?.isPinkManaged &&
          !p.__detail?.pinkPhaseMatched
      ).length,

    pinkMismatchEnabled: false,
    pinkMismatchFloor: null,
    pinkMismatchDecaySec: null,
    pinkCapEnabled: false,
    maxPinkManagedSlots: null,

    pinkManagedSlotsBeforeCap:
      Number(
        State.matchingPinkCapDiagnostics
          ?.pinkManagedSlotsBeforeCap ?? 0
      ),

    pinkManagedSlotsAfterCap:
      Number(
        State.matchingPinkCapDiagnostics
          ?.pinkManagedSlotsAfterCap ?? 0
      ),

    pinkCapDroppedCount:
      Number(
        State.matchingPinkCapDiagnostics
          ?.pinkCapDroppedCount ?? 0
      ),

    /*
     * 【2026-09 改善7】PRIDEバンド多様性の閾値緩和パラメータ
     */
    prideBandDiversityGapThreshold:
      Number(
        State.scoringConfig
          ?.candidateSelection
          ?.slotAllocation
          ?.prideBandDiversityGapThreshold ??
        DEFAULT_PRIDE_BAND_DIVERSITY_GAP_THRESHOLD
      ),

    /*
     * 【2026-09 ログ拡充】ownSampleCount等は同一candidateEvent内
     * では全候補共通値（viewerTierのみに依存し、opponentTierには
     * 依存しないことを実データで確認済み）のため、候補ごとに
     * 重複させずイベント側へ1回だけ記録する。
     */
    ownSampleCount:
      Number(
        State.matchingRankedAll[0]
          ?.__detail
          ?.ownSampleCount ?? 0
      ),

    adjacentSampleCount:
      Number(
        State.matchingRankedAll[0]
          ?.__detail
          ?.adjacentSampleCount ?? 0
      ),

    minOwnSamplesForNoBackoff:
      Number(
        State.matchingRankedAll[0]
          ?.__detail
          ?.minOwnSamplesForNoBackoff ?? 100
      ),

    yellowThreshold:
      Number(
        State.scoringConfig
          ?.phaseError
          ?.yellowThreshold ?? 0.5
      ),

    pinkThreshold:
      Number(
        State.scoringConfig
          ?.phaseError
          ?.pinkThreshold ?? 0.5
      ),

    candidates:
      State.matchingList.map(p => ({

        scoreRank:
          p.displayRank ?? null,
        globalScoreRank:
          p.__scoreRank ?? null,

        name:
          p.name,

        shopname:
          p.shopname ?? "",

        rankKey:
          p.__rankKey ?? null,

        area:
          String(p.area ?? ""),

        score:
          Number(
            (p.__score ?? 0)
              .toFixed(6)
          ),

        slotScore:
          Number(
            (p.__slotScore ?? 0)
              .toFixed(6)
          ),

        slotBucket:
          p.__slotBucket ??
          p.__detail?.slotBucket ??
          null,

        slotRank:
          p.__slotRank ?? null,

        scoreBreakdown:
          buildScoreBreakdownLog(
            p.__detail,
            false
          ),

        isYellow:
          Boolean(p.__detail?.isYellow),

        isPink:
          Boolean(p.__detail?.isPink),

        isPinkManaged:
          Boolean(p.__detail?.isPinkManaged),

        yellowThreshold:
          Number(p.__detail?.yellowThreshold ?? 0),

        pinkThreshold:
          Number(p.__detail?.pinkThreshold ?? 0),

        cycleCount:
          Number(p.__detail?.cycleCount ?? 0),

        cycleSec:
          Number(p.__detail?.cycleSec ?? 0),

        isCrossBucket:
          Boolean(p.__crossBucket),
        crossBucketRank:
          p.__crossBucketRank ?? null,
        crossBucketScore:
          Number(
            p.__crossBucketScore ?? 0
          ),
        crossBucketSelectionReason:
          p.__crossBucketSelectionReason ??
          null,

        encounterCount:
          getEncounterHistory(p)?.count ?? 0

      })),

    /*
     * 【2026-09 改善5】スコア対象の全候補を分析ログへ保存
     *
     * 表示用 candidates は選出された最大10名分しか
     * 含まないため、後から任意の実績相手について
     * 「予測時点でのglobal score rank」「表示選出の有無」を
     * 特定できない問題があった。
     *
     * ここでは matchingScoredAll（時間・ランクUIフィルターおよび
     * Pink cooldown適用後のスコア計算対象）を全件保存する。
     * Top10外も含む候補間比較を後日再現できるようにする。
     *
     * 1候補あたりの情報量を抑えるため、キー名付きオブジェクト
     * ではなく列固定の配列（行）として保存する。列の意味は
     * allCandidatesColumns（＝ALL_CANDIDATES_COLUMNS）を参照。
     *
     * candidateEvents ストア自体のレコード数（イベント件数）は
     * 従来どおり putLog による1イベント1レコードのままで、
     * LOG_STORAGE_LIMITS.candidateEvents による件数上限・
     * 自動整理（pruneCandidateEventsStore）で管理する。
     */
    allCandidatesColumns:
      ALL_CANDIDATES_COLUMNS,

    allCandidates:
      [...State.matchingScoredAll]
        .sort(
          (a, b) =>
            getCandidateSelectionScore(b) -
            getCandidateSelectionScore(a)
        )
        .map(buildAllCandidateRow)
  };

  State.activeCandidateEventId =
    now;

  State.latestCandidateEventIdForCopy =
    now;

  record.analysisDiagnostics.storageCoverage = {
    scoredCandidateCount: State.matchingScoredAll.length,
    savedCandidateCount: record.allCandidates.length,
    filteredCandidateCount:
      State.matchingFilteredPopulationCount,
    pinkCooldownExcludedCount:
      State.matchingCooldownExcludedCandidates.length,
    complete:
      record.allCandidates.length === State.matchingScoredAll.length &&
      record.allCandidates.length +
        State.matchingCooldownExcludedCandidates.length ===
        State.matchingFilteredPopulationCount
  };
  const serializationStartedAt = performance.now();
  const serialized = JSON.stringify(record);
  record.analysisDiagnostics.storageMetrics = {
    jsonUtf8BytesBeforeMetrics: new TextEncoder().encode(serialized).length,
    serializationMs: performance.now() - serializationStartedAt
  };

  logEvent(
    "candidate",
    record
  );

  pruneCandidateEventsStore(
    LOG_STORAGE_LIMITS.candidateEvents
  );
}

/* =========================================================
 [13200] Navigation Use Case:showSummaryUI【State】【DOM】（旧 [5500]）
========================================================= */
function showSummaryUI(
  push = true,
  mode = "rank"
) {
  State.activeCandidateEventId =
    null;
  State.summaryMode = mode;
  renderSummary();

  State.activeCandidateEventId =
    null;

  setCurrentView(
    STATE.SUMMARY
  );

  switchDisplayView(
    STATE.SUMMARY
  );

  if (push) {
    history.pushState(
      {
        page: STATE.SUMMARY,
        summaryMode: mode
      },
      "",
      ""
    );
  }
}

function showAreaSummary(
  push = true
) {
  State.activeCandidateEventId =
    null;
  State.summaryMode = "area";
  renderSummary();

  State.activeCandidateEventId =
    null;

  setCurrentView(
    STATE.SUMMARY
  );

  switchDisplayView(
    STATE.SUMMARY
  );

  if (push) {
    history.pushState(
      {
        page: STATE.SUMMARY,
        summaryMode: "area"
      },
      "",
      ""
    );
  }
}

/* =========================================================
 [13210] Navigation Use Case:showDetail【State】【DOM】（旧 [6100]）
========================================================= */
function showDetail(
  key,
  push = true
) {
  State.activeCandidateEventId =
    null;
  const row =
    State.summary.find(
      r => r.key === key
    ) || null;

  const rankInfo =
    getRankInfo(key);

  const bandLabel =
    rankInfo
      ? rankInfo.label
      : (
          row
            ? row.label
            : key
        );

  const bandIcon =
    rankInfo
      ? rankInfo.icon
      : "";

  State.currentDetailType = "rank";

  if (!row) {

    State.detailOriginal = [];

    setCurrentView(
      STATE.DETAIL
    );

    State.currentDetailKey =
      key;

    State.currentDetailLabel =
      bandLabel;

    State.currentDetailIcon =
      bandIcon;

    if (push) {

      history.pushState(
        {
          page: STATE.DETAIL,
          key,
          label: bandLabel,
          icon: bandIcon,
          detailType: "rank"
        },
        "",
        ""
      );
    }

    renderDetailTable();

    switchDisplayView(
      STATE.DETAIL
    );

    return;
  }

  State.detailOriginal =
    row.list
      .slice()
      .sort(
        (a, b) =>
          parseDateJST(
            b.updateDate
          ) -
          parseDateJST(
            a.updateDate
          )
      );

  setCurrentView(
    STATE.DETAIL
  );

  State.currentDetailKey =
    key;

  State.currentDetailLabel =
    bandLabel;

  State.currentDetailIcon =
    bandIcon;

  if (push) {

    history.pushState(
      {
        page: STATE.DETAIL,
        key,
        label: bandLabel,
        icon: bandIcon,
        detailType: "rank"
      },
      "",
      ""
    );
  }

  renderDetailTable();

  switchDisplayView(
    STATE.DETAIL
  );
}

function showAreaDetail(
  areaNo,
  push = true
) {
  State.activeCandidateEventId =
    null;
  const areaKey = String(areaNo);
  const areaName = getAreaDisplayName(areaKey);
  const list = (State.filtered || []).filter(p => String(p.area ?? "") === areaKey);

  State.currentDetailType = "area";
  State.currentDetailKey = areaKey;
  State.currentDetailLabel = areaName;
  State.currentDetailIcon = "";
  State.detailOriginal = list.slice().sort((a, b) => parseDateJST(b.updateDate) - parseDateJST(a.updateDate));

  setCurrentView(STATE.DETAIL);

  if (push) {
    history.pushState(
      {
        page: STATE.DETAIL,
        key: areaKey,
        label: areaName,
        icon: "",
        detailType: "area"
      },
      "",
      ""
    );
  }

  renderAreaDetailTable(areaNo);
  switchDisplayView(STATE.DETAIL);
}

/* =========================================================
 [13220] Navigation Use Case:showMatchingCandidates【State】【DOM】（旧 [7900]）
========================================================= */
function showMatchingCandidates(
  options = true
) {

  const normalizedOptions =
    typeof options === "boolean"
      ? {
          push: options,
          mode: "matching",
          offsetSec:
            State.matchingOffsetSec,
          saveEvent: false
        }
      : options;

  const push =
    normalizedOptions.push !== false;

  const mode =
    normalizedOptions.mode === "preview"
      ? "preview"
      : "matching";

  const offsetSec =
    Number(
      normalizedOptions.offsetSec
    ) || 0;

  if (mode === "preview") {
    State.latestCandidateEventIdForCopy =
      null;
  }

  const clickedAtMs =
    Date.now();

  const saveEvent =
    mode === "matching" &&
    normalizedOptions.saveEvent ===
      true;

  buildMatchingCandidates({
    clickedAtMs,
    evaluationTimeMs:
      clickedAtMs +
      offsetSec * 1000,
    offsetSec,
    mode,
    saveEvent
  });

  renderMatchingHeader();

  renderMatchingTable();

  setCurrentView(
    STATE.MATCHING
  );

  switchDisplayView(
    STATE.MATCHING
  );

  if (push) {

    history.pushState(
      {
        page: STATE.MATCHING,
        matchingMode: mode,
        matchingOffsetSec: offsetSec
      },
      "",
      ""
    );
  }
}

/* =========================================================
 [13230] Navigation Use Case:backToSummaryFromMatching【State】【DOM】（旧 [7910]）
========================================================= */
function backToSummaryFromMatching(
  push = true
) {
  State.activeCandidateEventId =
    null;
  State.summaryMode = State.summaryMode === "area" ? "area" : "rank";
  renderSummary();

  setCurrentView(
    STATE.SUMMARY
  );

  switchDisplayView(
    STATE.SUMMARY
  );

  if (push) {
    history.pushState(
      {
        page: STATE.SUMMARY,
        summaryMode: State.summaryMode
      },
      "",
      ""
    );
  }
}



/* #################################################################
 [LAYER 14000] Navigation / Event Binding
 ################################################################# */

/* =========================================================
 [14000] Rank Navigation:setupRankNavigation【DOM】（旧 [6000]）
========================================================= */
function setupRankNavigation(
  currentKey
) {

  const idx =
    getRankIndex(
      currentKey
    );

  const prev =
    idx > 0
      ? RANKS[idx - 1].key
      : null;

  const next =
    idx >= 0 &&
    idx < RANKS.length - 1
      ? RANKS[idx + 1].key
      : null;

  const prevBtn =
    document.getElementById(
      "prevRankBtn"
    );

  const nextBtn =
    document.getElementById(
      "nextRankBtn"
    );

  if (!prevBtn || !nextBtn) {
    return;
  }

  prevBtn.disabled =
    !prev;

  nextBtn.disabled =
    !next;

  prevBtn.onclick =
    () =>
      prev &&
      showDetail(prev);

  nextBtn.onclick =
    () =>
      next &&
      showDetail(next);
}

function setupAreaNavigation(areaNo) {
  const areaNos =
    getAreaNavigationAreaNos();
  const currentIndex =
    areaNos.indexOf(
      Number(areaNo)
    );
  const prev =
    currentIndex > 0
      ? areaNos[currentIndex - 1]
      : null;
  const next =
    currentIndex >= 0 &&
    currentIndex < areaNos.length - 1
      ? areaNos[currentIndex + 1]
      : null;

  const prevBtn = document.getElementById("prevAreaBtn");
  const nextBtn = document.getElementById("nextAreaBtn");

  if (!prevBtn || !nextBtn) return;

  prevBtn.disabled = prev === null;
  nextBtn.disabled = next === null;

  prevBtn.onclick = () => prev !== null && showAreaDetail(prev);
  nextBtn.onclick = () => next !== null && showAreaDetail(next);
}

/* =========================================================
 [14100] Search Helpers:clearSearch【DOM】【State】（旧 [7920]）
========================================================= */
function clearSearch() {

  const input =
    document.getElementById(
      "searchInput"
    );

  if (input) {
    input.value = "";
  }

  State.searchText = "";
}

/* =========================================================
 [14200] History Navigation:popstate【DOM】（旧 [4200]）
========================================================= */
function handlePopState(e) {

    const state =
      e.state ||
      {
        page: STATE.SUMMARY
      };

    /* =====================================
     * DETAIL
     * ===================================== */

    if (
      state.page ===
      STATE.DETAIL
    ) {
      const key =
        state.key ||
        State.currentDetailKey;

      if (!key) {
        clearSearch();
        const input = document.getElementById("searchInput");
        if (input) input.value = "";
        showSummaryUI(false, state.summaryMode || "rank");
        return;
      }

      if (State.searchText) {
        clearSearch();
        const input = document.getElementById("searchInput");
        if (input) input.value = "";
      }

      if (state.detailType === "area" || State.currentDetailType === "area") {
        showAreaDetail(Number(key), false);
      } else {
        showDetail(key, false);
      }

      return;
    }

    if (
      state.page ===
      STATE.MATCHING
    ) {
      if (State.searchText) {
        clearSearch();
        const input = document.getElementById("searchInput");
        if (input) input.value = "";
      }

      showMatchingCandidates({
        push: false,
        mode:
          state.matchingMode ||
          "matching",
        offsetSec:
          Number(
            state.matchingOffsetSec
          ) || 0,
        saveEvent: false
      });
      return;
    }

    clearSearch();

    const input = document.getElementById("searchInput");
    if (input) input.value = "";

    State.summaryMode = state.summaryMode === "area" ? "area" : "rank";
    showSummaryUI(false, State.summaryMode);
}
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("popstate", handlePopState);
}



/* #################################################################
 [LAYER 16000] DOM Input Readers
 ※ 計算層・ユースケース層はこの層のリーダー経由でのみDOM入力値を
   参照する。値の解釈（数値化・既定値）はここに集約する。
 ################################################################# */

/* =========================================================
 [16000] DOM Input Reader:readRangeMinutes【DOM】
========================================================= */
function readRangeMinutes() {

  const el =
    document.getElementById(
      "rangeSelect"
    );

  const selected =
    Number(
      el?.value
    );

  if (
    Number.isFinite(selected) &&
    selected > 0
  ) {
    return selected;
  }

  return Number(
    State.scoringConfig
      ?.viewerDefaults
      ?.filterMinutes ??
    DEFAULT_FILTER_MINUTES
  );
}
/* =========================================================
 [16010] DOM Input Reader:readSelectedStars【DOM】
========================================================= */
function readSelectedStars() {

  return [
    ...document.querySelectorAll(
      ".ruby-filter:checked"
    )
  ]
    .map(
      x => Number(x.value)
    );
}
/* =========================================================
 [16020] DOM Input Reader:readSelectedPrides【DOM】
========================================================= */
function readSelectedPrides() {

  return [
    ...document.querySelectorAll(
      ".pride-filter:checked"
    )
  ]
    .map(
      x => x.value
    );
}

function isPlayerIncludedInRankFilters(player) {
  const rankKey =
    getPlayerRankKey(player);

  if (!rankKey) {
    return false;
  }

  if (rankKey.startsWith("R")) {
    return readSelectedStars().includes(
      Number(player.starCnt)
    );
  }

  return readSelectedPrides().includes(rankKey);
}


/* #################################################################
 [LAYER 15000] Bootstrap（ファイル末尾）
 ################################################################# */

/* =========================================================
 [15000] Application Init:init（旧 [4000]）
========================================================= */
async function init() {

  log("Viewer 初期化中");

  await initLogDB();
  updateCopyStorageUsage();

  restorePinkStateFromStorage();

  startProgress();

  buildRubyFilters();

  buildPrideFilters();

  try {

    const [
      areaJson,
      latestRoundJson,
      latestUpdateJson,
      historicalMatchupDistributionJson,
      scoringConfigJson,
      roundDataJson
    ] = await Promise.all([
      fetchAreaListJson(),
      fetchLatestRoundJson(),
      fetchLatestUpdateJson(),
      fetchHistoricalMatchupDistributionJson(),
      fetchScoringConfigJson(),
      fetchRoundDataJson()
    ]);

    applyAreaListJson(areaJson);

    applyLatestRoundJson(
      latestRoundJson
    );

    applyLatestUpdateJson(
      latestUpdateJson
    );

    applyHistoricalMatchupDistributionJson(
      historicalMatchupDistributionJson
    );

    applyScoringConfigJson(
      scoringConfigJson
    );

    await loadCopyAreaHistory();

    await seedPhaseAdjustFromCopyHistory();

    applyRoundDataJson(
      roundDataJson,
      {
        resetReloadButton: true
      }
    );

    log(
      "初期データ取得完了"
    );

  } catch (e) {

    logError(
      "初期化並列取得に失敗：" +
      e.message
    );

    await loadAreaList();

    await loadLatestRound();

    await loadLatestUpdate();

    await loadHistoricalMatchupDistribution();

    await loadScoringConfig();

    await loadCopyAreaHistory();

    await seedPhaseAdjustFromCopyHistory();

    try {
        const roundDataJson = await fetchRoundDataJson();
        applyRoundDataJson(roundDataJson, { resetReloadButton: true });
        } catch (err) {
          logError("integrated_data.json の取得に失敗：" + err.message);
        State.all = [];
          State.filtered = [];
        }
    log(
      "初期データ取得完了"
    );
  }

  applyFilters();

  buildSummary();

  renderSummary();

  setCurrentView(
    STATE.SUMMARY
  );

  switchDisplayView(
    STATE.SUMMARY
  );

  stopProgress();

  await loadUpdateWatchConfig();

  startUpdateWatch();
}


  function applyFilterAndRefreshSummary() {
    startProgress();
    applyFilters();
    buildSummary();
    renderSummary();
    setCurrentView(STATE.SUMMARY);
    switchDisplayView(STATE.SUMMARY);
    stopProgress();
  }

  const ViewerApp = {
    // Config / Constants
    BASE_URL,
    DEFAULT_UPDATE_WATCH_CONFIG,
    STATE,
    ANALYSIS_SCRIPT_VERSION,
    ALL_CANDIDATES_COLUMNS,
    MAX_YELLOW_PHASE_WEIGHT,
    DEFAULT_FILTER_MINUTES,
    DEFAULT_MY_RANK_KEY,
    MAX_LOG_LINES,

    // State
    State,
    isCurrentView,
    setCurrentView,
    syncMyRankSelection,

    // Diagnostics / Analysis
    analysisChecksum,
    buildSummaryPopulationText,
    buildAnalysisDiagnostics,
    recordUnmatchedSearchMemo,

    // Utilities
    getNowLabelJa,
    buildDailyKey,
    parseDateJST,
    formatYMDHM,
    formatClockHms,
    formatClockHm,
    updateReloadViewerTime,
    ensureReloadViewerTime,
    computeSampleTrust,
    getPhaseLambda,
    getPhaseErrorScaleSec,

    // Data Appliers
    applyAreaListJson,
    applyLatestRoundJson,
    applyLatestUpdateJson,
    applyHistoricalMatchupDistributionJson,
    applyScoringConfigJson,
    applyRoundDataJson,
    applyUpdateWatchConfigJson,

    // Persistence & Cleanup
    checkAndCleanDailyState,
    isPinkTargetStale,
    savePinkStateToStorage,
    restorePinkStateFromStorage,
    initLogDB,
    putLog,
    logEvent,
    pruneLogStore,
    pruneCandidateEventsStore,

    // Data Loaders & Watch Loop
    fetchJSON,
    fetchAreaListJson,
    fetchLatestRoundJson,
    fetchLatestUpdateJson,
    fetchHistoricalMatchupDistributionJson,
    fetchScoringConfigJson,
    fetchUpdateWatchConfigJson,
    fetchRoundDataJson,
    getAreaDisplayName,
    loadAreaList,
    loadLatestRound,
    loadLatestUpdate,
    loadHistoricalMatchupDistribution,
    loadScoringConfig,
    loadUpdateWatchConfig,
    prefetchLatestRoundData,
    reloadLatestDataPreferPrefetch,
    checkUpdate,
    getJstUpdateWatchWindow,
    isWithinUpdateWatchWindow,
    startUpdateWatch,

    // Learning State Operations
    getPinkTarget,
    registerPinkTarget,
    isCopiedPlayer,
    getEncounterHistory,
    updateEncounterHistory,
    registerYellowSample,
    rebuildRecentClickIndex,
    hasSamePlayerRecentClick,

    // Phase Calculation
    calcYellowCycle,
    calcPinkCycle,
    getCurrentCycle,
    seedPhaseAdjustFromCopyHistory,
    initializePinkCycleState,
    normalizeCopyAreaHistory,
    loadCopyAreaHistory,
    appendCopyAreaHistory,
    getRoundedDiffMinAndPhaseDistance,
    getPhaseDistanceMin,
    computePhaseSignal,
    getPlayerPhaseDetail,
    buildPlayerPhaseSummaryText,
    showPlayerPhaseDetailDialog,
    getYellowPhaseScore,
    isMatchingCandidateByPhase,
    isMatchingCandidateByCopyPhase,
    getFilterToMs,
    getPinkSampleCount,
    getCandidateTimingLog,
    computePhaseContext,
    getPlayerCycleCount,

    // Matching & Candidates
    calcMatchingScoreDetail,
    buildCandidateScore,
    buildMatchingCandidates,
    buildScoreBreakdownLog,
    buildAllCandidateRow,
    saveCandidateEvent,

    // Filters & Summary
    applyFilters,
    buildSummary,
    filterSummaryBySearch,
    applyPlayerFilter,
    applyMatchingFilter,
    applyFilterAndRefreshSummary,

    // Browser Actions & Export
    copyToClipboard,
    downloadBlob,
    downloadCSV,
    exportSummaryCSV,
    exportAllCSV,
    exportTodayViewerLogsAsJSON,

    // User Events & History
    saveCopyEventUnified,
    recordClickFromCopiedInfo,
    undoLastCopiedInfo,

    // Navigation
    showSummaryUI,
    showAreaSummary,
    showDetail,
    showAreaDetail,
    showMatchingCandidates,
    backToSummaryFromMatching,
    setupRankNavigation,
    setupAreaNavigation,
    clearSearch,
    handlePopState,

    // DOM Input Readers
    readRangeMinutes,
    readSelectedStars,
    readSelectedPrides,
    isPlayerIncludedInRankFilters,

    // Init Use Case
    init
  };

  if (typeof globalThis !== "undefined") {
    Object.assign(globalThis, ViewerApp);
  }

  return ViewerApp;
});
