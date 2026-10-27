(function (global) {
  "use strict";

  const ViewerUtils = (typeof global !== "undefined" && global.ViewerUtils) || {};
  const ViewerDomain = (typeof global !== "undefined" && global.ViewerDomain) || {};
  const ViewerPersistence = (typeof global !== "undefined" && global.ViewerPersistence) ||
    (typeof module === "object" && module.exports ? require("./0300_persistence.js") : {});

  const clamp = ViewerUtils.clamp || ((v, min, max) => Math.max(min, Math.min(max, v)));
  const normalizePlayerName = ViewerUtils.normalizePlayerName || (name => String(name ?? "").trim());
  const RANKS = ViewerDomain.RANKS || [];
  const getPlayerRankKey = (p => p?.__rankKey || ViewerDomain.getPlayerRankKey?.(p));
  const mapRankKeyToTierKey = ViewerDomain.mapRankKeyToTierKey || (k => k?.startsWith?.("P_") ? "PRIDE" : k);
  const R6_PRIDE_FREQUENCY_STORAGE_KEY = ViewerPersistence.R6_PRIDE_FREQUENCY_STORAGE_KEY || "viewer_r6_pride_frequency_ledger";
  const LOG_STORAGE_LIMITS = ViewerPersistence.LOG_STORAGE_LIMITS || { copyEvents: 50 };
  const MATCHING_SCRIPT_VERSION = "matching-policy-v9-cycle4-phase-features-20261028";

  const HISTORICAL_RELIABILITY_K = 100;
  const HISTORICAL_CANDIDATE_COUNT_ALPHA = 0.35;
  const DEFAULT_PRIDE_BAND_DIVERSITY_GAP_THRESHOLD = 0.08;
  const DEFAULT_PRIDE_BAND_PRIOR_EXPONENT = 0.5;
  const NORMAL_SLOT_COUNT = 8;
  const CROSS_BUCKET_SLOT_COUNT = 1;
  const WILDCARD_SLOT_COUNT = 1;
  // Historical replay exports; these settings are no longer part of live config.
  const DEFAULT_MAX_PINK_MANAGED_SLOTS = 2;
  const DEFAULT_REALTIME_PLAYER_WEIGHT = 0.35;
  const DEFAULT_REALTIME_RANK_WEIGHT = 0.03;
  const DEFAULT_REALTIME_MAX_BONUS = 0.25;
  const DEFAULT_PINK_MISMATCH_FLOOR = 0.3;
  const DEFAULT_PINK_MISMATCH_DECAY_SEC = 60;
  const DEFAULT_AREA_BOOST_WEIGHT = 0.05;
  const DEFAULT_AREA_SMOOTHING_SAMPLE_SIZE = 30;
  const DEFAULT_RECENT_AREA_BOOST_ENABLED = false;
  const DEFAULT_RECENT_AREA_BOOST_WEIGHT = 0.3;
  const MAX_RECENT_AREA_BOOST_WEIGHT = 0.3;
  const DEFAULT_RECENT_AREA_MATCH_WINDOW_SIZE = 5;
  const DEFAULT_AREA_PHASE_DIAGNOSTIC_WEIGHT = 0.05;
  const R6_PRIDE_POPULATION_THRESHOLD = 0.4;

  const DEFAULT_RELATIVE_POPULATION_ADJUSTMENT = Object.freeze({
    enabled: false,
    viewerTiers: Object.freeze(["R6", "R7", "R8"]),
    exponent: 0.5,
    minMultiplier: 0.8,
    maxMultiplier: 1.25,
    minFilteredCandidateCount: 50,
    minSameRankCandidateCount: 5,
    maxTransferredSlots: 1,
    baselineByViewerTier: Object.freeze({})
  });

  const POPULATION_RANK_KEYS = Object.freeze([
    "R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8",
    "P_A", "P_B", "P_C", "P_D", "P_E", "P_F", "P_G"
  ]);

  function getState() {
    return typeof global !== "undefined" && global.State ? global.State : null;
  }

  function getMatchingSlotCounts(config = getState()?.scoringConfig) {
    return config?.candidateSelection?.slots ?? {
      normal: NORMAL_SLOT_COUNT, crossBucket: CROSS_BUCKET_SLOT_COUNT, wildcard: WILDCARD_SLOT_COUNT
    };
  }

  function resolveScoringConfig(source) {
    const invalid = message => { throw new Error(`scoring_config.json: ${message}`); };
    if (!source || typeof source !== "object" || Array.isArray(source)) invalid("expected an object");
    if (source.meta?.schemaVersion !== 1) invalid("meta.schemaVersion must be 1");
    if (typeof source.meta.version !== "string" || !source.meta.version.trim()) invalid("meta.version is required");
    const defaults = {
      viewerDefaults: { filterMinutes: 15, myRankKey: "R7" },
      historical: {
        reliabilityK: HISTORICAL_RELIABILITY_K,
        candidateCountAlpha: HISTORICAL_CANDIDATE_COUNT_ALPHA,
        minOwnSamplesForNoBackoff: 100
      },
      candidateSelection: {
        slots: getMatchingSlotCounts(null),
        slotAllocation: {
          prideBandPriorExponent: DEFAULT_PRIDE_BAND_PRIOR_EXPONENT,
          prideBandDiversityGapThreshold: DEFAULT_PRIDE_BAND_DIVERSITY_GAP_THRESHOLD,
          r6PridePopulationThreshold: R6_PRIDE_POPULATION_THRESHOLD,
          relativePopulationAdjustment: { ...DEFAULT_RELATIVE_POPULATION_ADJUSTMENT }
        },
        areaBoost: {
          enabled: true, weight: DEFAULT_AREA_BOOST_WEIGHT, smoothingSampleSize: DEFAULT_AREA_SMOOTHING_SAMPLE_SIZE,
          recentMatch: {
            enabled: DEFAULT_RECENT_AREA_BOOST_ENABLED,
            weight: DEFAULT_RECENT_AREA_BOOST_WEIGHT,
            maxWeight: MAX_RECENT_AREA_BOOST_WEIGHT,
            windowSize: DEFAULT_RECENT_AREA_MATCH_WINDOW_SIZE
          },
          diagnosticPhaseWeight: DEFAULT_AREA_PHASE_DIAGNOSTIC_WEIGHT
        }
      },
      phase: {
        weight: 0.55, yellowMaxWeight: 0.55,
        yellow: { weight: 0.55, baseCycleSec: 345, alpha: 0.12, maxShiftSec: 30, minSamples: 8, maxSampleAgeSec: 2700 },
        pink: { weight: 0.55, baseCycleSec: 345, alpha: 0.18, maxShiftSec: 45, minSamples: 8 }
      },
      phaseError: { scaleSec: 90, yellowThreshold: 0.7, pinkThreshold: 0.55, yellowLambda: 0.06, pinkLambda: 0.03 },
      experimental: {
        dayRelativeArea: { enabled: true, weight: 0.30, smoothingCount: 2 },
        yellowPhase: { enabled: true, weight: 0.70 }
      }
    };
    const extraKeys = {
      "": ["meta"],
      phaseError: ["yellowScaleSec", "pinkScaleSec"],
      "candidateSelection.slotAllocation.relativePopulationAdjustment": ["baselineMetadata"]
    };
    const merge = (base, input, prefix = "") => {
      if (!input || typeof input !== "object" || Array.isArray(input)) invalid(`${prefix || "root"} must be an object`);
      if (prefix !== "candidateSelection.slotAllocation.relativePopulationAdjustment.baselineByViewerTier") {
        for (const key of Object.keys(input)) {
          if (!Object.hasOwn(base, key) && !extraKeys[prefix]?.includes(key)) {
            invalid(`unknown setting: ${prefix ? `${prefix}.` : ""}${key}`);
          }
        }
      }
      const result = { ...input };
      for (const [key, fallback] of Object.entries(base)) {
        const name = prefix ? `${prefix}.${key}` : key;
        const value = input[key] === undefined ? fallback : input[key];
        if (Array.isArray(fallback)) {
          if (!Array.isArray(value)) invalid(`${name} must be an array`);
          result[key] = [...value];
        } else if (fallback && typeof fallback === "object") {
          result[key] = merge(fallback, value, name);
        } else {
          if (typeof value !== typeof fallback ||
              (typeof value === "number" && (!Number.isFinite(value) || value < 0))) {
            invalid(`${name} has an invalid type or value`);
          }
          result[key] = value;
        }
      }
      return result;
    };
    const config = merge(defaults, source);
    for (const key of ["yellowScaleSec", "pinkScaleSec"]) {
      const value = source.phaseError?.[key];
      if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value <= 0)) {
        invalid(`phaseError.${key} must be a positive finite number`);
      }
    }
    const number = (name, min, max, integer = false) => {
      const value = name.split(".").reduce((o, key) => o[key], config);
      if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
        invalid(`${name} must be ${integer ? "an integer" : "a number"} in [${min}, ${max}]`);
      }
    };
    for (const name of [
      "historical.candidateCountAlpha", "candidateSelection.slotAllocation.prideBandPriorExponent",
      "candidateSelection.slotAllocation.prideBandDiversityGapThreshold", "candidateSelection.slotAllocation.r6PridePopulationThreshold",
      "candidateSelection.areaBoost.weight", "candidateSelection.areaBoost.recentMatch.weight",
      "candidateSelection.areaBoost.recentMatch.maxWeight",
      "candidateSelection.areaBoost.diagnosticPhaseWeight", "phase.weight", "phase.yellowMaxWeight",
      "phase.yellow.weight", "phase.pink.weight", "phase.yellow.alpha", "phase.pink.alpha",
      "phaseError.yellowThreshold", "phaseError.pinkThreshold",
      "experimental.dayRelativeArea.weight", "experimental.yellowPhase.weight"
    ]) number(name, 0, 1);
    for (const name of ["historical.reliabilityK", "phase.yellow.baseCycleSec", "phase.pink.baseCycleSec",
      "phaseError.scaleSec", "phase.yellow.maxSampleAgeSec",
      "experimental.dayRelativeArea.smoothingCount"]) number(name, Number.EPSILON, Number.MAX_VALUE);
    for (const name of ["historical.minOwnSamplesForNoBackoff", "phase.yellow.minSamples", "phase.pink.minSamples"]) {
      number(name, 0, Number.MAX_SAFE_INTEGER, true);
    }
    number("viewerDefaults.filterMinutes", 1, Number.MAX_SAFE_INTEGER, true);
    if (![15, 30, 60, 120, 180].includes(config.viewerDefaults.filterMinutes)) {
      invalid("viewerDefaults.filterMinutes must match a filter option: 15, 30, 60, 120, 180");
    }
    for (const mode of ["yellow", "pink"]) {
      if (config.phase[mode].maxShiftSec >= config.phase[mode].baseCycleSec) {
        invalid(`phase.${mode}.maxShiftSec must be less than baseCycleSec`);
      }
    }
    number("candidateSelection.areaBoost.recentMatch.windowSize", 1, LOG_STORAGE_LIMITS.copyEvents, true);
    for (const key of ["normal", "crossBucket", "wildcard"]) number(`candidateSelection.slots.${key}`, 0, 10, true);
    if (Object.values(config.candidateSelection.slots).reduce((sum, n) => sum + n, 0) !== 10) {
      invalid("candidateSelection.slots must total 10");
    }
    if (!POPULATION_RANK_KEYS.includes(config.viewerDefaults.myRankKey)) invalid("viewerDefaults.myRankKey is invalid");
    if (source.phase?.yellow?.weight === undefined) config.phase.yellow.weight = config.phase.weight;
    if (source.phase?.pink?.weight === undefined) config.phase.pink.weight = config.phase.weight;
    const recent = config.candidateSelection.areaBoost.recentMatch;
    if (recent.weight > recent.maxWeight) invalid("recentMatch.weight exceeds maxWeight");
    getRelativePopulationAdjustmentConfig(config.candidateSelection.slotAllocation.relativePopulationAdjustment);
    return config;
  }

  function getScoringConfigSnapshot(config = getState()?.scoringConfig) {
    if (!config) throw new Error("Scoring configuration is not loaded");
    const effective = JSON.parse(JSON.stringify(config));
    effective.phase.yellow.weight = Math.min(effective.phase.yellow.weight, effective.phase.yellowMaxWeight);
    const recent = effective.candidateSelection.areaBoost.recentMatch;
    if (!recent.enabled) recent.weight = 0;
    if (!effective.candidateSelection.areaBoost.enabled) effective.candidateSelection.areaBoost.weight = 0;
    return {
      schemaVersion: config.meta.schemaVersion, version: config.meta.version, effective,
      phaseScoring: {
        formula: "1 - phaseWeight * (1 - finalPhaseScore)",
        finalPhaseFormula: "exp(-0.5 * (phaseError / scaleSec)^2) * exp(-lambda * cycleCount)",
        scoringTrustApplied: false,
        phaseTrustRole: "cycle-learning-diagnostic"
      }
    };
  }

  function getMatchingSlotBucketKey(rankKey) {
    const key = String(rankKey ?? "");
    if (/^R[1-8]$/.test(key)) {
      return key;
    }
    if (key.startsWith("P_")) {
      return "PRIDE";
    }
    return null;
  }

  function getHistoricalMinOwnSamplesForNoBackoff(scoringConfig = null) {
    const config = scoringConfig ?? getState()?.scoringConfig;
    const value = Number(
      config?.historical?.minOwnSamplesForNoBackoff ?? 100
    );
    return Number.isFinite(value) ? Math.max(0, value) : 100;
  }

  function getHistoricalTierCandidateCount(tierCounts, opponentTier) {
    const countKey = String(opponentTier ?? "");
    const count = Number(tierCounts?.[countKey] ?? 1);
    return Number.isFinite(count) && count > 0 ? count : 1;
  }

  function getHistoricalDistribution(distributionOrViewerTier, maybeViewerTier = null) {
    let distribution = null;
    let viewerTier = null;

    if (typeof distributionOrViewerTier === "string") {
      viewerTier = distributionOrViewerTier;
      distribution = getState()?.historicalMatchupDistribution;
    } else {
      distribution = distributionOrViewerTier;
      viewerTier = maybeViewerTier;
    }

    const entry = distribution?.byViewerTier?.[viewerTier];
    if (!entry) {
      return {
        probList: [],
        opponentTierMap: {},
        total: 0,
        prideProbabilityTotal: 0
      };
    }

    if (Array.isArray(entry)) {
      const total = entry.reduce((sum, item) => sum + Number(item.count ?? 0), 0);
      const prideProbabilityTotal = entry.reduce(
        (sum, item) => String(item.opponentTier ?? "").startsWith("PRIDE_") ? sum + Number(item.prob ?? 0) : sum,
        0
      );
      const opponentTierMap = {};
      entry.forEach(item => {
        opponentTierMap[item.opponentTier] = (opponentTierMap[item.opponentTier] || 0) + item.prob;
      });
      return {
        probList: entry,
        opponentTierMap,
        total,
        prideProbabilityTotal
      };
    }

    return entry;
  }

  function getDistributionCellScore(
    distribution,
    opponentTier,
    supportSize,
    tierCandidateCount,
    scoringConfig = null
  ) {
    const config = scoringConfig ?? getState()?.scoringConfig;
    const oppKey = String(opponentTier ?? "");
    const hitProb = distribution.opponentTierMap
      ? distribution.opponentTierMap[oppKey]
      : distribution.probList?.find(item => item.opponentTier === oppKey)?.prob;
    const matched = hitProb !== undefined;
    const backoffScore = distribution.total > 0 && supportSize > 0
      ? 1 / (distribution.total + supportSize)
      : 0.0001;
    const tierProbability = matched ? hitProb : backoffScore;
    const pooledTierProbability = tierProbability;

    const candidateCountAlpha = clamp(
      Number(
        config?.historical?.candidateCountAlpha ??
        HISTORICAL_CANDIDATE_COUNT_ALPHA ??
        0.35
      ),
      0.0,
      1.0
    );

    const countFactor = Math.pow(
      Math.max(1, tierCandidateCount),
      candidateCountAlpha
    );

    return {
      score: pooledTierProbability / countFactor,
      tierProbability,
      pooledTierProbability,
      tierCandidateCount,
      candidateCountAlpha,
      matched
    };
  }

  function getAdjacentTierDistribution(distributionOrViewerTier, maybeViewerTier = null) {
    let distribution = null;
    let viewerTier = null;

    if (typeof distributionOrViewerTier === "string") {
      viewerTier = distributionOrViewerTier;
      distribution = getState()?.historicalMatchupDistribution;
    } else {
      distribution = distributionOrViewerTier;
      viewerTier = maybeViewerTier;
    }

    if (!/^R[1-8]$/.test(viewerTier)) {
      return null;
    }

    const currentRank = Number(viewerTier.slice(1));
    const availableRanks = Object.keys(distribution?.byViewerTier ?? {})
      .filter(tier => /^R[1-8]$/.test(tier))
      .map(tier => Number(tier.slice(1)))
      .filter(rank => rank !== currentRank);

    const lowerRanks = availableRanks.filter(rank => rank < currentRank);
    const higherRanks = availableRanks.filter(rank => rank > currentRank);
    const adjacentRanks = [
      lowerRanks.length ? Math.max(...lowerRanks) : null,
      higherRanks.length ? Math.min(...higherRanks) : null
    ].filter(Number.isFinite);

    const distributions = adjacentRanks.map(rank => ({
      viewerTier: `R${rank}`,
      ...getHistoricalDistribution(distribution, `R${rank}`)
    })).filter(d => d.total > 0);

    const total = distributions.reduce((sum, d) => sum + d.total, 0);
    return total > 0 ? { distributions, total } : null;
  }

  function buildViewerHistoricalContext(
    viewerRankKey,
    historicalMatchupDistribution = null,
    scoringConfig = null
  ) {
    const dist = historicalMatchupDistribution ?? getState()?.historicalMatchupDistribution;
    if (!viewerRankKey || !dist) {
      return null;
    }

    const viewerTier = mapRankKeyToTierKey(viewerRankKey);
    const ownDistribution = getHistoricalDistribution(dist, viewerTier);
    const minOwnSamplesForNoBackoff = getHistoricalMinOwnSamplesForNoBackoff(scoringConfig);
    const ownDistributionIsReliable =
      ownDistribution.total > 0 &&
      ownDistribution.total >= minOwnSamplesForNoBackoff;

    const adjacentDistribution =
      ownDistributionIsReliable
        ? null
        : getAdjacentTierDistribution(dist, viewerTier);

    const supportSize = Number(dist.historicalSupportSize ?? 0);

    return {
      viewerTier,
      ownDistribution,
      minOwnSamplesForNoBackoff,
      ownDistributionIsReliable,
      adjacentDistribution,
      supportSize
    };
  }

  function getHistoricalScoreDetail(
    viewerRankKey,
    opponentRankKey,
    tierCounts = null,
    viewerContext = null,
    historicalMatchupDistribution = null,
    scoringConfig = null
  ) {
    const dist = historicalMatchupDistribution ?? getState()?.historicalMatchupDistribution;
    const counts = tierCounts ?? getState()?.matchingTierCounts;

    if (!viewerRankKey || !dist) {
      return {
        score: 1.0,
        matched: false,
        backoff: false,
        viewerTier: null,
        opponentTier: null
      };
    }

    const ctx = viewerContext || buildViewerHistoricalContext(viewerRankKey, dist, scoringConfig);
    if (!ctx) {
      return {
        score: 1.0,
        matched: false,
        backoff: false,
        viewerTier: null,
        opponentTier: null
      };
    }

    const opponentTier = mapRankKeyToTierKey(opponentRankKey);
    const tierCandidateCount = getHistoricalTierCandidateCount(counts, opponentTier);

    if ((ctx.ownDistribution?.total ?? 0) <= 0 && !ctx.adjacentDistribution) {
      return {
        score: 1.0,
        matched: false,
        backoff: false,
        tierProbability: 1.0,
        tierCandidateCount,
        minOwnSamplesForNoBackoff: ctx.minOwnSamplesForNoBackoff,
        viewerTier: ctx.viewerTier,
        opponentTier
      };
    }

    const ownCell = (ctx.ownDistribution?.total ?? 0) > 0
      ? getDistributionCellScore(
          ctx.ownDistribution,
          opponentTier,
          ctx.supportSize,
          tierCandidateCount,
          scoringConfig
        )
      : null;

    const adjacentCells = ctx.adjacentDistribution?.distributions.map(
      distribution => ({
        viewerTier: distribution.viewerTier,
        total: distribution.total,
        ...getDistributionCellScore(
          distribution,
          opponentTier,
          ctx.supportSize,
          tierCandidateCount,
          scoringConfig
        )
      })
    ) ?? [];

    const adjacentScore = ctx.adjacentDistribution
      ? adjacentCells.reduce(
          (sum, cell) =>
            sum +
            cell.score *
            cell.total /
            ctx.adjacentDistribution.total,
          0
        )
      : 0;

    const adjacentMatched = adjacentCells.some(cell => cell.matched);

    const ownReliability = ctx.ownDistributionIsReliable
      ? 1
      : ctx.ownDistribution.total > 0
      ? ctx.ownDistribution.total / (ctx.ownDistribution.total +
          ((scoringConfig ?? getState()?.scoringConfig)?.historical?.reliabilityK ?? HISTORICAL_RELIABILITY_K))
      : 0;

    const score = ctx.adjacentDistribution
      ? ownCell
        ? ownCell.score * ownReliability + adjacentScore * (1 - ownReliability)
        : adjacentScore
      : ownCell?.score ?? 1.0;

    return {
      score,
      matched: Boolean(ownCell?.matched) || adjacentMatched,
      backoff: !ownCell?.matched && !adjacentMatched,
      tierProbability:
        ctx.ownDistributionIsReliable
          ? ownCell?.tierProbability ?? 1.0
          : ctx.adjacentDistribution
          ? ownCell
            ? ownCell.tierProbability * ownReliability +
              adjacentCells.reduce(
                (sum, cell) => sum + cell.tierProbability * cell.total / ctx.adjacentDistribution.total,
                0
              ) * (1 - ownReliability)
            : adjacentCells.reduce(
                (sum, cell) => sum + cell.tierProbability * cell.total / ctx.adjacentDistribution.total,
                0
              )
          : ownCell?.tierProbability ?? 1.0,
      pooledTierProbability:
        ctx.ownDistributionIsReliable
          ? ownCell?.pooledTierProbability ?? 1.0
          : ctx.adjacentDistribution
          ? ownCell
            ? ownCell.pooledTierProbability * ownReliability +
              adjacentCells.reduce(
                (sum, cell) => sum + cell.pooledTierProbability * cell.total / ctx.adjacentDistribution.total,
                0
              ) * (1 - ownReliability)
            : adjacentCells.reduce(
                (sum, cell) => sum + cell.pooledTierProbability * cell.total / ctx.adjacentDistribution.total,
                0
              )
          : ownCell?.pooledTierProbability ?? 1.0,
      tierCandidateCount,
      minOwnSamplesForNoBackoff: ctx.minOwnSamplesForNoBackoff,
      candidateCountAlpha: Number(
        (scoringConfig ?? getState()?.scoringConfig)?.historical?.candidateCountAlpha ??
        HISTORICAL_CANDIDATE_COUNT_ALPHA
      ),
      ownReliability,
      ownSampleCount: ctx.ownDistribution.total,
      adjacentSampleCount: ctx.adjacentDistribution?.total ?? 0,
      adjacentViewerTiers: adjacentCells.map(cell => cell.viewerTier),
      viewerTier: ctx.viewerTier,
      opponentTier
    };
  }

  function buildAreaDensityContext(players) {
    const overallByArea = {};
    const bucketByArea = {};
    const bucketTotals = {};

    for (const player of players ?? []) {
      const rankKey = getPlayerRankKey(player);
      const bucket = getMatchingSlotBucketKey(rankKey);
      if (!bucket) {
        continue;
      }

      const area = String(player?.area ?? "");
      overallByArea[area] = Number(overallByArea[area] ?? 0) + 1;

      if (!bucketByArea[bucket]) {
        bucketByArea[bucket] = {};
      }
      bucketByArea[bucket][area] = Number(bucketByArea[bucket][area] ?? 0) + 1;

      bucketTotals[bucket] = Number(bucketTotals[bucket] ?? 0) + 1;
    }

    const maxOverallAreaCount = Math.max(
      1,
      ...Object.values(overallByArea).map(Number)
    );

    const maxBucketAreaCounts = {};
    for (const bucket of Object.keys(bucketByArea)) {
      maxBucketAreaCounts[bucket] = Math.max(
        1,
        ...Object.values(bucketByArea[bucket]).map(Number)
      );
    }

    return {
      overallByArea,
      bucketByArea,
      bucketTotals,
      maxOverallAreaCount,
      maxBucketAreaCounts
    };
  }

  function getAreaBoostDetail(player, context, scoringConfig = null) {
    const config = (scoringConfig ?? getState()?.scoringConfig)?.candidateSelection?.areaBoost ?? {};
    const enabled = config.enabled !== false;
    const configuredWeight = Number(config.weight ?? DEFAULT_AREA_BOOST_WEIGHT);
    const weight = enabled
      ? Number.isFinite(configuredWeight)
        ? clamp(configuredWeight, 0, 1)
        : DEFAULT_AREA_BOOST_WEIGHT
      : 0;

    const configuredSmoothingSampleSize = Number(
      config.smoothingSampleSize ?? DEFAULT_AREA_SMOOTHING_SAMPLE_SIZE
    );
    const smoothingSampleSize = Number.isFinite(configuredSmoothingSampleSize)
      ? Math.max(0, configuredSmoothingSampleSize)
      : DEFAULT_AREA_SMOOTHING_SAMPLE_SIZE;

    const area = String(player?.area ?? "");
    const bucket = getMatchingSlotBucketKey(getPlayerRankKey(player));

    const areaTotalCount = Number(context?.overallByArea?.[area] ?? 0);
    const areaBucketCount = Number(context?.bucketByArea?.[bucket]?.[area] ?? 0);
    const bucketTotal = Number(context?.bucketTotals?.[bucket] ?? 0);

    const bucketDensity = Math.sqrt(
      areaBucketCount / Math.max(1, Number(context?.maxBucketAreaCounts?.[bucket] ?? 1))
    );

    const totalDensity = Math.sqrt(
      areaTotalCount / Math.max(1, Number(context?.maxOverallAreaCount ?? 1))
    );

    const bucketTrust = bucketTotal > 0
      ? bucketTotal / (bucketTotal + smoothingSampleSize)
      : 0;

    const areaDensity = clamp(
      bucketTrust * bucketDensity + (1 - bucketTrust) * totalDensity,
      0,
      1
    );

    return {
      areaBucketCount,
      areaTotalCount,
      bucketTotal,
      bucketTrust,
      areaDensity,
      areaBoost: 1 + weight * areaDensity
    };
  }

  function applyCandidateSlotScores(
    candidates,
    areaContext,
    prideReferenceCandidates = candidates,
    scoringConfig = null
  ) {
    const config = scoringConfig ?? getState()?.scoringConfig;
    const prideCandidates = (prideReferenceCandidates ?? []).filter(
      player => getMatchingSlotBucketKey(player.__rankKey) === "PRIDE"
    );

    const maxPrideBandProbability = Math.max(
      0,
      ...prideCandidates.map(player => {
        const probability = Number(player.__detail?.tierProbability ?? 0);
        return Number.isFinite(probability) ? probability : 0;
      })
    );

    const configuredPrideBandPriorExponent = Number(
      config?.candidateSelection?.slotAllocation?.prideBandPriorExponent ??
      DEFAULT_PRIDE_BAND_PRIOR_EXPONENT
    );
    const prideBandPriorExponent = Number.isFinite(configuredPrideBandPriorExponent)
      ? clamp(configuredPrideBandPriorExponent, 0, 1)
      : DEFAULT_PRIDE_BAND_PRIOR_EXPONENT;

    for (const player of candidates ?? []) {
      const detail = player.__detail ?? {};
      const areaDetail = getAreaBoostDetail(player, areaContext, config);
      const isPride = getMatchingSlotBucketKey(player.__rankKey) === "PRIDE";
      const prideBandProbability = Number(detail.tierProbability ?? 0);

      const prideBandPriorWeight = isPride && maxPrideBandProbability > 0
        ? Math.pow(
            prideBandProbability / maxPrideBandProbability,
            prideBandPriorExponent
          )
        : 1;

      const slotScore =
        Number(detail.realtimeBoost ?? 1) *
        Number(detail.pinkMismatchBoostFactor ?? 1) *
        Number(detail.effectivePhaseScore ?? 0) *
        areaDetail.areaBoost *
        prideBandPriorWeight;

      detail.slotBucket = getMatchingSlotBucketKey(player.__rankKey);
      detail.prideBandPriorWeight = prideBandPriorWeight;
      detail.areaBucketCount = areaDetail.areaBucketCount;
      detail.areaTotalCount = areaDetail.areaTotalCount;
      detail.areaBucketTotal = areaDetail.bucketTotal;
      detail.areaBucketTrust = areaDetail.bucketTrust;
      detail.areaDensity = areaDetail.areaDensity;
      detail.areaBoost = areaDetail.areaBoost;
      detail.slotScore = Number.isFinite(slotScore) && slotScore > 0 ? slotScore : 0;
      player.__slotScore = detail.slotScore;
    }
  }

  function getRecentAreaBoostConfig(scoringConfig = null) {
    const config = (scoringConfig ?? getState()?.scoringConfig)
      ?.candidateSelection?.areaBoost?.recentMatch ?? {};
    const enabled = config.enabled ?? DEFAULT_RECENT_AREA_BOOST_ENABLED;
    const configuredWeight = Number(config.weight ?? DEFAULT_RECENT_AREA_BOOST_WEIGHT);
    const weight = enabled && Number.isFinite(configuredWeight)
      ? Math.min(Number(config.maxWeight ?? MAX_RECENT_AREA_BOOST_WEIGHT), clamp(configuredWeight, 0, 1))
      : enabled
        ? DEFAULT_RECENT_AREA_BOOST_WEIGHT
        : 0;
    const windowSize = config.windowSize === undefined
      ? DEFAULT_RECENT_AREA_MATCH_WINDOW_SIZE
      : config.windowSize;

    if (!Number.isInteger(windowSize) || windowSize < 1 || windowSize > LOG_STORAGE_LIMITS.copyEvents) {
      throw new Error(
        "candidateSelection.areaBoost.recentMatch.windowSize は1～" +
        LOG_STORAGE_LIMITS.copyEvents +
        "の整数を指定してください"
      );
    }

    return {
      enabled: Boolean(enabled),
      weight,
      windowSize,
      includePinkManaged: true,
      maxMultiplier: 1 + weight
    };
  }

  function buildCopyAreaHistoryContext(copyAreaHistory = null, recentAreaConfig = null) {
    const historyList = copyAreaHistory ?? getState()?.copyAreaHistory ?? [];
    const history = historyList.filter(record => String(record?.area ?? "") !== "");

    const buildCounts = records => {
      const counts = {};
      for (const record of records) {
        const area = String(record.area);
        counts[area] = Number(counts[area] ?? 0) + 1;
      }
      return counts;
    };

    const windowSize = (recentAreaConfig ?? getRecentAreaBoostConfig()).windowSize;
    const recent5 = history.slice(-5);
    const recent10 = history.slice(-10);
    const recent20 = history.slice(-20);
    const recentWindow = history.slice(-windowSize);

    return {
      sampleCount: history.length,
      allCounts: buildCounts(history),
      recent5Counts: buildCounts(recent5),
      recent10Counts: buildCounts(recent10),
      recent20Counts: buildCounts(recent20),
      recentWindowCounts: buildCounts(recentWindow)
    };
  }

  function applyCandidateAreaHistoryBoost(
    candidates,
    { assignSlotRanks: shouldAssignSlotRanks = false, scoringConfig = null, copyAreaHistory = null } = {}
  ) {
    const boostConfig = getRecentAreaBoostConfig(scoringConfig);
    const context = buildCopyAreaHistoryContext(copyAreaHistory, boostConfig);

    for (const player of candidates ?? []) {
      const detail = player.__detail ?? {};
      const area = String(player.area ?? "");
      const recentCount5 = Number(context.recent5Counts[area] ?? 0);
      const recentCount10 = Number(context.recent10Counts[area] ?? 0);
      const recentCountWindow = Number(context.recentWindowCounts[area] ?? 0);
      const recentDensityWindow = Math.sqrt(recentCountWindow / boostConfig.windowSize);
      const recentAreaBoost = 1 + boostConfig.weight * recentDensityWindow;
      const previousRecentAreaBoost = Math.max(
        Number(detail.recentAreaAppliedBoost ?? 1),
        Number.EPSILON
      );
      const baseSlotScore = getCandidateSlotScore(player) / previousRecentAreaBoost;
      const boostedSlotScore = baseSlotScore * recentAreaBoost;

      detail.recentAreaMatchCount5 = recentCount5;
      detail.recentAreaMatchCount10 = recentCount10;
      detail.recentAreaMatchCountWindow = recentCountWindow;
      detail.recentAreaMatchCount20 = Number(context.recent20Counts[area] ?? 0);
      detail.loggedAreaMatchCount = Number(context.allCounts[area] ?? 0);
      detail.loggedAreaMatchSampleCount = context.sampleCount;
      detail.loggedAreaMatchRate = context.sampleCount > 0 ? detail.loggedAreaMatchCount / context.sampleCount : 0;
      detail.recentAreaMatchDensityWindow = recentDensityWindow;
      detail.recentAreaCounterfactualBoostWindow = recentAreaBoost;
      detail.recentAreaCounterfactualSlotScore = boostedSlotScore;
      detail.recentAreaAppliedBoost = recentAreaBoost;
      detail.slotScore = boostedSlotScore;
      player.__slotScore = boostedSlotScore;
    }

    assignCandidateSlotRanks(candidates, {
      assignSlotRanks: shouldAssignSlotRanks,
      assignRecentAreaRanks: true
    });
  }

  function applyCandidateAreaPhaseDiagnostics(candidates, scoringConfig = null) {
    const config = scoringConfig ?? getState()?.scoringConfig;
    const configuredWeight = Number(
      config?.candidateSelection?.areaBoost?.diagnosticPhaseWeight ??
      DEFAULT_AREA_PHASE_DIAGNOSTIC_WEIGHT
    );
    const diagnosticWeight = Number.isFinite(configuredWeight)
      ? clamp(configuredWeight, 0, 1)
      : DEFAULT_AREA_PHASE_DIAGNOSTIC_WEIGHT;

    const groups = {};
    const bucketPlayers = {};

    for (const player of candidates ?? []) {
      const detail = player.__detail ?? {};
      const bucket = getMatchingSlotBucketKey(player.__rankKey);
      if (!bucket) {
        continue;
      }

      const area = String(player.area ?? "");
      const groupKey = `${bucket}\u0000${area}`;
      const group = groups[groupKey] ?? {
        players: [],
        phaseMatchedCount: 0,
        phaseMatchCount30: 0,
        phaseMatchCount60: 0,
        phaseScoreSum: 0,
        baseScores: []
      };

      const phaseError = Number(detail.phaseError ?? Infinity);
      const hasPhaseSignal = Number(detail.phaseScore ?? 0) > 0;
      const phaseMatched = Boolean(detail.isYellow || detail.isPink);
      const baseSlotScore = getCandidateSlotScore(player) / Math.max(
        Number(detail.areaBoost ?? 1),
        Number.EPSILON
      );

      group.players.push(player);
      group.phaseMatchedCount += phaseMatched ? 1 : 0;
      group.phaseMatchCount30 += (hasPhaseSignal && phaseError <= 30) ? 1 : 0;
      group.phaseMatchCount60 += (hasPhaseSignal && phaseError <= 60) ? 1 : 0;
      group.phaseScoreSum += Number(detail.finalPhaseScore ?? 0);
      group.baseScores.push(baseSlotScore);
      groups[groupKey] = group;

      if (!bucketPlayers[bucket]) {
        bucketPlayers[bucket] = [];
      }
      bucketPlayers[bucket].push(player);
    }

    const maxPeerPhaseCount30 = {};

    for (const [groupKey, group] of Object.entries(groups)) {
      const bucket = groupKey.split("\u0000")[0];
      for (const player of group.players) {
        const detail = player.__detail;
        const selfMatches30 =
          Number(detail.phaseScore ?? 0) > 0 &&
          Number(detail.phaseError ?? Infinity) <= 30
            ? 1
            : 0;
        const peerCount30 = Math.max(0, group.phaseMatchCount30 - selfMatches30);
        maxPeerPhaseCount30[bucket] = Math.max(
          Number(maxPeerPhaseCount30[bucket] ?? 0),
          peerCount30
        );
      }
    }

    for (const [groupKey, group] of Object.entries(groups)) {
      const bucket = groupKey.split("\u0000")[0];
      const top3BaseScoreSum = [...group.baseScores]
        .sort((a, b) => b - a)
        .slice(0, 3)
        .reduce((sum, val) => sum + val, 0);

      for (const player of group.players) {
        const detail = player.__detail;
        const selfPhaseMatched = (detail.isYellow || detail.isPink) ? 1 : 0;
        const selfMatches30 =
          Number(detail.phaseScore ?? 0) > 0 &&
          Number(detail.phaseError ?? Infinity) <= 30
            ? 1
            : 0;
        const peerPhaseMatchCount30 = Math.max(0, group.phaseMatchCount30 - selfMatches30);
        const peerPhaseDensity30 = maxPeerPhaseCount30[bucket] > 0
          ? Math.sqrt(peerPhaseMatchCount30 / maxPeerPhaseCount30[bucket])
          : 0;
        const counterfactualBoost = 1 + diagnosticWeight * peerPhaseDensity30;

        detail.areaBucketScoredCandidateCount = group.players.length;
        detail.areaBucketPhaseMatchedCount = group.phaseMatchedCount;
        detail.areaBucketPhaseMatchCount30 = group.phaseMatchCount30;
        detail.areaBucketPhaseMatchCount60 = group.phaseMatchCount60;
        detail.areaBucketPhaseScoreSum = group.phaseScoreSum;
        detail.areaBucketPeerPhaseMatchedCount = Math.max(0, group.phaseMatchedCount - selfPhaseMatched);
        detail.areaBucketPeerPhaseMatchCount30 = peerPhaseMatchCount30;
        detail.areaBucketPeerPhaseScoreSum = Math.max(0, group.phaseScoreSum - Number(detail.finalPhaseScore ?? 0));
        detail.areaBucketTop3BaseScoreSum = top3BaseScoreSum;
        detail.areaPhaseDensity30 = peerPhaseDensity30;
        detail.areaPhaseCounterfactualBoost = counterfactualBoost;
        detail.areaPhaseCounterfactualSlotScore = getCandidateSlotScore(player) * counterfactualBoost;
      }
    }

    for (const players of Object.values(bucketPlayers)) {
      players
        .sort(
          (a, b) =>
            Number(b.__detail?.areaPhaseCounterfactualSlotScore ?? 0) -
            Number(a.__detail?.areaPhaseCounterfactualSlotScore ?? 0)
        )
        .forEach((player, index) => {
          player.__detail.areaPhaseCounterfactualSlotRank = index + 1;
        });
    }
  }

  function getCandidateSlotScore(player) {
    return Number(
      player?.__slotScore ??
      player?.__detail?.slotScore ??
      0
    );
  }

  function assignCandidateSlotRanks(
    candidates,
    { assignSlotRanks = true, assignRecentAreaRanks = false } = {}
  ) {
    const buckets = {};

    for (const player of candidates ?? []) {
      const bucket = getMatchingSlotBucketKey(player.__rankKey);
      if (!bucket) {
        continue;
      }
      if (!buckets[bucket]) {
        buckets[bucket] = [];
      }
      buckets[bucket].push(player);
    }

    for (const players of Object.values(buckets)) {
      players
        .sort((a, b) => getCandidateSlotScore(b) - getCandidateSlotScore(a))
        .forEach((player, index) => {
          const slotRank = index + 1;
          if (assignSlotRanks) {
            player.__slotRank = slotRank;
            if (player.__detail) {
              player.__detail.slotRank = slotRank;
            }
          }
          if (assignRecentAreaRanks && player.__detail) {
            player.__detail.recentAreaCounterfactualSlotRank = slotRank;
          }
        });
    }
  }

  function buildMatchingSlotBucketProbabilities(
    viewerContext,
    tierCounts,
    enabledRankKeys,
    options = {}
  ) {
    if (!viewerContext) {
      return {};
    }

    const state = options.state ?? getState();
    const myRankKey = options.myRankKey ?? state?.myRankKey ?? "R7";
    const rankList = options.ranks ?? (RANKS.length > 0 ? RANKS : []);
    const enabled = new Set(enabledRankKeys ?? []);
    const probabilities = {};

    for (const rank of rankList) {
      if (enabled.size > 0 && !enabled.has(rank.key)) {
        continue;
      }

      const detail = getHistoricalScoreDetail(
        myRankKey,
        rank.key,
        tierCounts,
        viewerContext,
        options.historicalMatchupDistribution,
        options.scoringConfig
      );

      const probability = Number(detail.tierProbability ?? 0);
      if (!Number.isFinite(probability) || probability <= 0) {
        continue;
      }

      const bucket = getMatchingSlotBucketKey(rank.key);
      if (!bucket) {
        continue;
      }

      probabilities[bucket] = Number(probabilities[bucket] ?? 0) + probability;
    }

    return probabilities;
  }

  function buildMatchingSlotPlan(
    candidates,
    slotCount,
    bucketProbabilities,
    existingCapacities = null
  ) {
    const bucketOrder = [
      "R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "PRIDE"
    ];

    const capacities = existingCapacities ? { ...existingCapacities } : {};

    for (const player of existingCapacities ? [] : candidates ?? []) {
      const bucket = getMatchingSlotBucketKey(player.__rankKey);
      if (!bucket) {
        continue;
      }
      capacities[bucket] = Number(capacities[bucket] ?? 0) + 1;
    }

    const entries = bucketOrder
      .map((bucket, order) => ({
        bucket,
        order,
        probability: Number(bucketProbabilities?.[bucket] ?? 0),
        capacity: Number(capacities[bucket] ?? 0),
        rawQuota: 0,
        slots: 0
      }))
      .filter(entry => entry.capacity > 0 && entry.probability > 0);

    const totalProbability = entries.reduce(
      (sum, entry) => sum + entry.probability,
      0
    );

    if (totalProbability <= 0 || entries.length === 0) {
      return [];
    }

    const targetSlotCount = Math.min(
      Math.floor(Math.max(0, Number(slotCount) || 0)),
      entries.reduce((sum, entry) => sum + entry.capacity, 0)
    );

    for (const entry of entries) {
      entry.rawQuota = targetSlotCount * entry.probability / totalProbability;
      entry.slots = Math.min(entry.capacity, Math.floor(entry.rawQuota));
    }

    let remaining = targetSlotCount - entries.reduce((sum, entry) => sum + entry.slots, 0);

    while (remaining > 0) {
      const available = entries
        .filter(entry => entry.slots < entry.capacity)
        .sort(
          (a, b) =>
            (b.rawQuota - b.slots) - (a.rawQuota - a.slots) ||
            b.probability - a.probability ||
            a.order - b.order
        );

      if (available.length === 0) {
        break;
      }

      available[0].slots++;
      remaining--;
    }

    return entries.map(entry => ({
      bucket: entry.bucket,
      probability: entry.probability / totalProbability,
      rawQuota: entry.rawQuota,
      slots: entry.slots,
      capacity: entry.capacity
    }));
  }

  function prepareR6PrideFrequency(populationShare, advanceBudget, options = {}) {
    const state = options.state ?? getState();
    const distribution = options.distribution ?? getHistoricalDistribution(state?.historicalMatchupDistribution, "R6");
    const historicalRate = distribution.prideProbabilityTotal;
    const parseDateJSTFn = options.parseDateJST ?? (typeof global !== "undefined" && typeof global.parseDateJST === "function" ? global.parseDateJST : null);
    const generationMs = options.generationMs ?? (parseDateJSTFn && state?.generatedAt ? parseDateJSTFn(state.generatedAt)?.getTime() : null);
    const storage = options.storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
    const storageKey = options.storageKey ?? R6_PRIDE_FREQUENCY_STORAGE_KEY;
    const logFn = options.log ?? (typeof global !== "undefined" && typeof global.log === "function" ? global.log : () => {});

    const populationThreshold = (options.scoringConfig ?? state?.scoringConfig)
      ?.candidateSelection?.slotAllocation?.r6PridePopulationThreshold ?? R6_PRIDE_POPULATION_THRESHOLD;
    const diagnostics = {
      historicalRate,
      populationShare,
      populationThreshold,
      countingBasis: "saved-matching-new-data-generation",
      maxCredit: 1,
      countedGeneration: false,
      creditBefore: null,
      creditAfter: null,
      granted: false,
      reason: "historical-unavailable"
    };

    if (!(distribution.total > 0) || !Number.isFinite(historicalRate) ||
        historicalRate < 0 || historicalRate > 1) {
      logFn("R6 PRIDE頻度管理: historicalの対戦率が未取得または不正のためPRIDE増枠を見送り");
      return { diagnostics, allowPride: false, ledger: null };
    }
    if (!Number.isFinite(generationMs)) {
      diagnostics.reason = "generation-unavailable";
      logFn("R6 PRIDE頻度管理: 読込データのgeneratedAtが不正のためPRIDE増枠を見送り");
      return { diagnostics, allowPride: false, ledger: null };
    }

    let ledger;
    try {
      const raw = storage ? storage.getItem(storageKey) : null;
      ledger = raw ? JSON.parse(raw) : {
        version: 1, lastGenerationMs: null, credit: 0, granted: false,
        countedGenerations: 0, grantedGenerations: 0
      };
      if (ledger?.version !== 1 ||
          !(ledger.lastGenerationMs === null || Number.isFinite(ledger.lastGenerationMs)) ||
          !Number.isFinite(ledger.credit) || ledger.credit < 0 || ledger.credit > 1 ||
          typeof ledger.granted !== "boolean" ||
          !Number.isSafeInteger(ledger.countedGenerations) || ledger.countedGenerations < 0 ||
          !Number.isSafeInteger(ledger.grantedGenerations) || ledger.grantedGenerations < 0 ||
          ledger.grantedGenerations > ledger.countedGenerations) {
        throw new Error("invalid R6 PRIDE frequency ledger");
      }
    } catch (error) {
      console.warn("[R6 PRIDE frequency] restore failed", error);
      logFn("R6 PRIDE頻度管理: 保存状態の読込に失敗したためPRIDE増枠を見送り");
      diagnostics.reason = "storage-read-failed";
      return { diagnostics, allowPride: false, ledger: null };
    }

    diagnostics.creditBefore = ledger.credit;
    diagnostics.countedGenerationsBefore = ledger.countedGenerations;
    diagnostics.grantedGenerationsBefore = ledger.grantedGenerations;

    const isNewGeneration =
      ledger.lastGenerationMs === null || generationMs > ledger.lastGenerationMs;

    if (advanceBudget && isNewGeneration) {
      ledger = {
        ...ledger,
        lastGenerationMs: generationMs,
        credit: Math.min(1, ledger.credit + historicalRate),
        granted: false,
        countedGenerations: ledger.countedGenerations + 1
      };
      diagnostics.countedGeneration = true;
    }

    const sameGeneration = generationMs === ledger.lastGenerationMs;
    const highPopulation = populationShare >= populationThreshold;
    const allowPride = sameGeneration && highPopulation &&
      (ledger.granted || (advanceBudget && ledger.credit >= 1 - 1e-12));

    diagnostics.reason =
      !sameGeneration ? "generation-not-counted" :
      !highPopulation ? "pride-population-below-threshold" :
      allowPride ? "eligible" : "credit-below-one";
    diagnostics.creditAfter = ledger.credit;

    return { diagnostics, allowPride, ledger };
  }

  function getRelativePopulationAdjustmentConfig(configured = null) {
    const configSource = configured ?? getState()?.scoringConfig
      ?.candidateSelection?.slotAllocation?.relativePopulationAdjustment ?? {};

    const config = {
      ...DEFAULT_RELATIVE_POPULATION_ADJUSTMENT,
      ...configSource,
      enabled: configSource.enabled === true
    };

    const invalid = message => {
      throw new Error(`candidateSelection.slotAllocation.relativePopulationAdjustment: ${message}`);
    };

    if (!Array.isArray(config.viewerTiers) ||
        config.viewerTiers.some(tier => !["R6", "R7", "R8"].includes(tier))) {
      invalid("viewerTiers はR6/R7/R8を指定してください");
    }
    for (const key of ["exponent", "minMultiplier", "maxMultiplier"]) {
      if (typeof config[key] !== "number" || !Number.isFinite(config[key])) {
        invalid(`${key} は有限の数値を指定してください`);
      }
    }
    if (config.exponent < 0 || config.exponent > 1 ||
        config.minMultiplier <= 0 || config.minMultiplier > 1 ||
        config.maxMultiplier < 1) {
      invalid("exponent は0～1、minMultiplier は0超～1、maxMultiplier は1以上を指定してください");
    }
    for (const key of ["minFilteredCandidateCount", "minSameRankCandidateCount", "maxTransferredSlots"]) {
      if (!Number.isInteger(config[key]) || config[key] < 0) {
        invalid(`${key} は0以上の整数を指定してください`);
      }
    }
    if (config.minSameRankCandidateCount < 1 || config.maxTransferredSlots > 9) {
      invalid("minSameRankCandidateCount は1以上、maxTransferredSlots は9以下を指定してください");
    }
    if (config.enabled) {
      for (const tier of config.viewerTiers) {
        const baseline = config.baselineByViewerTier?.[tier];
        if (!baseline ||
            ["lower", "same", "higher"].some(key =>
              typeof baseline[key] !== "number" ||
              !Number.isFinite(baseline[key]) || baseline[key] <= 0) ||
            Math.abs(baseline.lower + baseline.same + baseline.higher - 1) > 0.000001) {
          invalid(`${tier} の基準人口比率は正の数値で合計1にしてください`);
        }
      }
    }
    return config;
  }

  function adjustSlotsByRelativePopulation(
    slotPlan,
    population,
    enabledRankKeys,
    viewerTier,
    { advancePrideBudget = false, options = {} } = {}
  ) {
    const config = getRelativePopulationAdjustmentConfig(options.config);
    const before = (slotPlan ?? []).map(entry => ({ ...entry }));
    const after = before.map(entry => ({ ...entry }));
    const rankCounts = population?.rankCounts ?? {};
    const ownRank = Number(viewerTier?.slice(1));
    const logFn = options.log ?? (typeof global !== "undefined" && typeof global.log === "function" ? global.log : () => {});
    const storage = options.storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
    const storageKey = options.storageKey ?? R6_PRIDE_FREQUENCY_STORAGE_KEY;

    const groupForBucket = bucket => {
      if (bucket === "PRIDE") return "higher";
      const rank = Number(bucket.slice(1));
      return rank > ownRank ? "higher" : rank === ownRank ? "same" : "lower";
    };

    const counts = { lower: 0, same: 0, higher: 0 };
    const bucketCounts = {};
    let invalidPopulation = !population?.rankCounts;

    for (const key of POPULATION_RANK_KEYS) {
      const count = rankCounts[key] ?? 0;
      if (!Number.isInteger(count) || count < 0) {
        invalidPopulation = true;
        continue;
      }
      const bucket = key.startsWith("P_") ? "PRIDE" : key;
      bucketCounts[bucket] = (bucketCounts[bucket] ?? 0) + count;
      counts[groupForBucket(bucket)] += count;
    }

    const total = counts.lower + counts.same + counts.higher;
    invalidPopulation = invalidPopulation || (total !== population?.classifiedCount);
    const shares = Object.fromEntries(
      Object.entries(counts).map(([key, count]) => [key, total > 0 ? count / total : null])
    );
    const baseline = config.baselineByViewerTier?.[viewerTier] ?? null;
    const multipliers = { lower: 1, same: 1, higher: 1 };
    const transfers = [];
    let target = null;
    let prideFrequency = null;
    const allRanksSelected =
      enabledRankKeys?.length === POPULATION_RANK_KEYS.length &&
      POPULATION_RANK_KEYS.every(key => enabledRankKeys.includes(key));
    let reason = "disabled";

    if (config.enabled !== true) {
      reason = "disabled";
    } else if (!config.viewerTiers.includes(viewerTier)) {
      reason = "viewer-tier-not-eligible";
    } else if (!allRanksSelected) {
      reason = "rank-filter-incomplete";
    } else if (invalidPopulation) {
      reason = "invalid-population";
      logFn("人口枠調整: ランク別人数とclassifiedCountが不整合のため調整を中止");
    } else if (total < config.minFilteredCandidateCount) {
      reason = "population-below-minimum";
    } else if (counts.same < config.minSameRankCandidateCount) {
      reason = "same-rank-population-below-minimum";
    } else if (config.maxTransferredSlots === 0) {
      reason = "max-transferred-slots-is-zero";
    } else {
      for (const group of ["lower", "higher"]) {
        const relativeChange = (shares[group] / shares.same) /
          (baseline[group] / baseline.same);
        multipliers[group] = clamp(
          Math.pow(relativeChange, config.exponent),
          config.minMultiplier,
          config.maxMultiplier
        );
      }
      const weights = Object.fromEntries(before.map(entry => [
        entry.bucket, entry.probability * multipliers[groupForBucket(entry.bucket)]
      ]));
      target = buildMatchingSlotPlan(
        [],
        before.reduce((sum, entry) => sum + entry.slots, 0),
        weights,
        Object.fromEntries(before.map(entry => [entry.bucket, entry.capacity]))
      );
      const targets = new Map(target.map(entry => [entry.bucket, entry]));
      let hasSlotChanges = false;
      for (const entry of after) {
        const adjusted = targets.get(entry.bucket);
        hasSlotChanges = hasSlotChanges || (entry.slots !== adjusted.slots);
        entry.probability = adjusted.probability;
        entry.rawQuota = adjusted.rawQuota;
      }

      if (viewerTier === "R6") {
        prideFrequency = prepareR6PrideFrequency(
          bucketCounts.PRIDE / total,
          advancePrideBudget,
          options
        );
      }

      const recipientAllowed = entry =>
        viewerTier !== "R6" || /^R[1-8]$/.test(entry.bucket) ||
        (prideFrequency?.allowPride && !transfers.some(transfer => transfer.to === "PRIDE"));

      const hasEligibleRecipient = after.some(entry =>
        recipientAllowed(entry) &&
        entry.slots < targets.get(entry.bucket).slots &&
        entry.slots < entry.capacity
      );

      for (let i = 0; i < config.maxTransferredSlots; i++) {
        const donors = after.filter(entry =>
          entry.slots > targets.get(entry.bucket).slots &&
          entry.slots > 0 && entry.capacity > entry.slots
        ).sort((a, b) =>
          bucketCounts[a.bucket] - bucketCounts[b.bucket] ||
          a.probability - b.probability ||
          a.bucket.localeCompare(b.bucket)
        );

        const recipients = after.filter(entry =>
          recipientAllowed(entry) &&
          entry.slots < targets.get(entry.bucket).slots &&
          entry.slots < entry.capacity
        ).sort((a, b) =>
          (prideFrequency?.allowPride
            ? Number(b.bucket === "PRIDE") - Number(a.bucket === "PRIDE")
            : 0) ||
          (b.rawQuota - b.slots) - (a.rawQuota - a.slots) ||
          b.probability - a.probability ||
          a.bucket.localeCompare(b.bucket)
        );

        if (!donors.length || !recipients.length) break;
        donors[0].slots--;
        recipients[0].slots++;
        transfers.push({ from: donors[0].bucket, to: recipients[0].bucket });
      }

      if (prideFrequency?.ledger) {
        const frequency = prideFrequency.diagnostics;
        const ledger = prideFrequency.ledger;
        const prideTransfers = transfers.filter(transfer => transfer.to === "PRIDE");
        const newGrant = prideTransfers.length > 0 && !ledger.granted;
        if (newGrant) {
          ledger.credit = Math.max(0, ledger.credit - 1);
          ledger.granted = true;
          ledger.grantedGenerations++;
        }
        if (frequency.countedGeneration || newGrant) {
          try {
            if (storage) {
              storage.setItem(storageKey, JSON.stringify(ledger));
            }
          } catch (error) {
            console.warn("[R6 PRIDE frequency] save failed", error);
            logFn("R6 PRIDE頻度管理: 保存に失敗したためPRIDE増枠を見送り");
            for (const transfer of prideTransfers) {
              after.find(entry => entry.bucket === transfer.from).slots++;
              after.find(entry => entry.bucket === transfer.to).slots--;
              transfers.splice(transfers.indexOf(transfer), 1);
            }
            frequency.reason = "storage-write-failed";
          }
        }
        frequency.creditAfter = frequency.reason === "storage-write-failed"
          ? frequency.creditBefore : ledger.credit;
        frequency.granted = transfers.some(transfer => transfer.to === "PRIDE");
        if (frequency.reason !== "storage-write-failed") {
          frequency.countedGeneration = frequency.countedGeneration;
        } else {
          frequency.countedGeneration = false;
        }
        frequency.countedGenerations = frequency.reason === "storage-write-failed"
          ? frequency.countedGenerationsBefore : ledger.countedGenerations;
        frequency.grantedGenerations = frequency.reason === "storage-write-failed"
          ? frequency.grantedGenerationsBefore : ledger.grantedGenerations;
        if (frequency.granted) {
          frequency.reason = newGrant ? "granted" : "same-generation-grant";
        } else if (frequency.reason === "eligible") {
          frequency.reason = "no-pride-transfer";
        }
      }

      reason = transfers.length ? "relative-population" :
        !hasSlotChanges ? "integer-plan-unchanged" :
        !hasEligibleRecipient ? "no-eligible-recipient" : "no-transferable-donor";
    }

    return {
      plan: after,
      diagnostics: {
        enabled: config.enabled,
        eligibleViewerTiers: config.viewerTiers,
        viewerTier,
        exponent: config.exponent,
        minMultiplier: config.minMultiplier,
        maxMultiplier: config.maxMultiplier,
        minFilteredCandidateCount: config.minFilteredCandidateCount,
        minSameRankCandidateCount: config.minSameRankCandidateCount,
        maxTransferredSlots: config.maxTransferredSlots,
        population: { filteredCandidateCount: total, counts, shares },
        baseline,
        baselineMetadata: config.baselineMetadata ?? null,
        multipliers,
        applied: transfers.length > 0,
        transferredSlots: transfers.length,
        transfers,
        donorSelectionBasis: "filtered-candidate-count",
        recipientSelectionScope: viewerTier === "R6" ? "ruby-with-pride-frequency-gate" : "all-buckets",
        r6PrideFrequency: prideFrequency?.diagnostics ?? null,
        bucketCandidateCounts: bucketCounts,
        reason,
        slotPlanBeforeAdjustment: before,
        targetSlotPlan: target ?? before.map(entry => ({ ...entry })),
        slotPlanAfterAdjustment: after
      }
    };
  }

  function selectPrideSlotCandidates(candidates, slotCount, options = {}) {
    const ranked = [...(candidates ?? [])].sort(
      (a, b) => getCandidateSlotScore(b) - getCandidateSlotScore(a)
    );

    const configuredGapThreshold = Number(
      (options.scoringConfig ?? getState()?.scoringConfig)
        ?.candidateSelection?.slotAllocation?.prideBandDiversityGapThreshold ??
      DEFAULT_PRIDE_BAND_DIVERSITY_GAP_THRESHOLD
    );

    const gapThreshold = Number.isFinite(configuredGapThreshold)
      ? clamp(configuredGapThreshold, 0, 1)
      : DEFAULT_PRIDE_BAND_DIVERSITY_GAP_THRESHOLD;

    const selected = [];
    const selectedBands = new Set();

    for (const player of ranked) {
      if (selected.length >= slotCount) {
        break;
      }

      if (selectedBands.has(player.__rankKey)) {
        const ownScore = getCandidateSlotScore(player);
        const alt = ranked.find(
          candidate => !selected.includes(candidate) && !selectedBands.has(candidate.__rankKey)
        );
        const altScore = alt ? getCandidateSlotScore(alt) : 0;
        const relativeGap = ownScore > 0 ? (ownScore - altScore) / ownScore : 0;

        if (alt && relativeGap <= gapThreshold) {
          continue;
        }
      }

      selected.push(player);
      selectedBands.add(player.__rankKey);
    }

    if (selected.length < slotCount) {
      for (const player of ranked) {
        if (selected.length >= slotCount) {
          break;
        }
        if (!selected.includes(player)) {
          selected.push(player);
        }
      }
    }

    return selected;
  }

  function selectNormalCandidatesBySlots(
    candidates,
    slotCount = 9,
    bucketProbabilities = {},
    slotPlanOverride = null,
    options = {}
  ) {
    const state = options.state ?? getState();
    if (!Array.isArray(candidates)) {
      if (state) state.matchingSlotPlan = [];
      return [];
    }

    const plan = Array.isArray(slotPlanOverride)
      ? slotPlanOverride.map(entry => ({ ...entry }))
      : buildMatchingSlotPlan(candidates, slotCount, bucketProbabilities);

    if (plan.length === 0) {
      if (state) state.matchingSlotPlan = [];
      return [...candidates]
        .sort((a, b) => getCandidateSlotScore(b) - getCandidateSlotScore(a))
        .slice(0, slotCount);
    }

    const selected = [];
    const poolsByBucket = new Map();
    for (const player of candidates) {
      const bucket = getMatchingSlotBucketKey(player.__rankKey);
      if (!poolsByBucket.has(bucket)) poolsByBucket.set(bucket, []);
      poolsByBucket.get(bucket).push(player);
    }

    for (const entry of plan) {
      if (entry.slots <= 0) {
        continue;
      }

      const pool = poolsByBucket.get(entry.bucket) ?? [];

      const bucketSelected = entry.bucket === "PRIDE"
        ? selectPrideSlotCandidates(pool, entry.slots, options)
        : [...pool]
            .sort((a, b) => getCandidateSlotScore(b) - getCandidateSlotScore(a))
            .slice(0, entry.slots);

      for (const player of bucketSelected) {
        player.__slotBucket = entry.bucket;
        selected.push(player);
      }
    }

    const targetCount = Math.min(slotCount, candidates.length);

    if (selected.length < targetCount) {
      const fallback = [...candidates]
        .filter(player => !selected.includes(player))
        .sort((a, b) => getCandidateSlotScore(b) - getCandidateSlotScore(a))
        .slice(0, targetCount - selected.length);

      for (const player of fallback) {
        player.__slotBucket = getMatchingSlotBucketKey(player.__rankKey);
        selected.push(player);
      }
    }

    if (state) {
      state.matchingSlotPlan = plan;
    }

    return selected.sort((a, b) => getCandidateSlotScore(b) - getCandidateSlotScore(a));
  }

  function getCandidateSelectionScore(player) {
    if (!player) {
      return 0;
    }
    return Number(
      player.__score ??
      player.__effectiveWeight ??
      player.__weight ??
      0
    );
  }

  function getCandidateCrossBucketScore(player) {
    const detail = player?.__detail ?? {};
    const tierProbability = Number(detail.tierProbability ?? 0);
    const tierCandidateCount = Math.max(1, Number(detail.tierCandidateCount ?? 1));

    const score =
      (tierProbability / tierCandidateCount) *
      Number(detail.realtimeBoost ?? 1) *
      Number(detail.pinkMismatchBoostFactor ?? 1) *
      Number(detail.effectivePhaseScore ?? 0) *
      Number(detail.areaBoost ?? 1) *
      Number(detail.recentAreaCounterfactualBoostWindow ?? 1);

    return Number.isFinite(score) && score > 0 ? score : 0;
  }

  function assignCandidateCrossBucketRanks(candidates) {
    [...(candidates ?? [])]
      .sort((a, b) => getCandidateCrossBucketScore(b) - getCandidateCrossBucketScore(a))
      .forEach((player, index) => {
        const score = getCandidateCrossBucketScore(player);
        player.__crossBucketScore = score;
        player.__crossBucketRank = index + 1;
        if (player.__detail) {
          player.__detail.crossBucketScore = score;
          player.__detail.crossBucketRank = index + 1;
        }
      });
  }

  function selectCrossBucketCandidates(candidates, excludedCandidates, slotCount) {
    const excluded = new Set(excludedCandidates ?? []);

    return [...(candidates ?? [])]
      .filter(player => !excluded.has(player))
      .sort(
        (a, b) =>
          getCandidateCrossBucketScore(b) - getCandidateCrossBucketScore(a) ||
          getCandidateSelectionScore(b) - getCandidateSelectionScore(a)
      )
      .slice(0, Math.max(0, Math.floor(Number(slotCount) || 0)));
  }

  function selectWildcardCandidates(candidates, excludedCandidates, slotCount = 1) {
    const excluded = new Set(excludedCandidates ?? []);

    return [...(candidates ?? [])]
      .filter(player => !excluded.has(player))
      .sort((a, b) => getCandidateSelectionScore(b) - getCandidateSelectionScore(a))
      .slice(0, Math.max(0, Math.floor(Number(slotCount) || 0)));
  }

  // Retained for replaying historical logs only; live selection has no Pink cap.
  function applyPinkManagedSlotCap(selected, rankedByScore, maxPinkManagedSlots) {
    if (!Number.isFinite(maxPinkManagedSlots) || maxPinkManagedSlots < 0) {
      return {
        finalSelected: selected,
        pinkManagedSlotsBeforeCap: selected.filter(p => Boolean(p.__detail?.isPinkManaged)).length,
        pinkManagedSlotsAfterCap: selected.filter(p => Boolean(p.__detail?.isPinkManaged)).length,
        pinkCapDroppedCount: 0
      };
    }

    const pinkEntries = selected.filter(p => Boolean(p.__detail?.isPinkManaged));
    const pinkManagedSlotsBeforeCap = pinkEntries.length;

    if (pinkManagedSlotsBeforeCap <= maxPinkManagedSlots) {
      return {
        finalSelected: selected,
        pinkManagedSlotsBeforeCap,
        pinkManagedSlotsAfterCap: pinkManagedSlotsBeforeCap,
        pinkCapDroppedCount: 0
      };
    }

    const sortedPink = [...pinkEntries].sort(
      (a, b) => getCandidateSlotScore(b) - getCandidateSlotScore(a)
    );

    const keptPink = new Set(sortedPink.slice(0, maxPinkManagedSlots));
    const droppedCount = pinkManagedSlotsBeforeCap - maxPinkManagedSlots;
    const droppedPink = pinkEntries.filter(p => !keptPink.has(p));

    const kept = selected.filter(
      p => !Boolean(p.__detail?.isPinkManaged) || keptPink.has(p)
    );

    const keptKeys = new Set(
      kept.map(p => normalizePlayerName(p.name) + "|" + normalizePlayerName(p.shopname ?? ""))
    );

    const eligibleBackfill = rankedByScore.filter(p => {
      const key = normalizePlayerName(p.name) + "|" + normalizePlayerName(p.shopname ?? "");
      return !keptKeys.has(key) && !Boolean(p.__detail?.isPinkManaged);
    });

    const crossBucketBackfillCount = droppedPink.filter(p => p.__crossBucket && !p.__wildcard).length;
    const crossBucketBackfill = [...eligibleBackfill]
      .sort((a, b) => getCandidateCrossBucketScore(b) - getCandidateCrossBucketScore(a))
      .slice(0, crossBucketBackfillCount);

    crossBucketBackfill.forEach(p => {
      p.__crossBucket = true;
      p.__crossBucketSelectionReason = "pink-cap-backfill";
    });

    const crossBucketBackfillSet = new Set(crossBucketBackfill);
    const wildcardBackfill = eligibleBackfill
      .filter(p => !crossBucketBackfillSet.has(p))
      .sort((a, b) => getCandidateSelectionScore(b) - getCandidateSelectionScore(a))
      .slice(0, droppedPink.filter(p => p.__wildcard).length);
    wildcardBackfill.forEach(p => {
      p.__wildcard = true;
      p.__crossBucket = true;
      p.__crossBucketSelectionReason = "pink-cap-wildcard-backfill";
    });
    const wildcardBackfillSet = new Set(wildcardBackfill);
    const normalBackfill = eligibleBackfill
      .filter(p => !crossBucketBackfillSet.has(p) && !wildcardBackfillSet.has(p))
      .sort((a, b) => getCandidateSlotScore(b) - getCandidateSlotScore(a))
      .slice(0, droppedCount - crossBucketBackfill.length - wildcardBackfill.length);

    const backfill = [...crossBucketBackfill, ...wildcardBackfill, ...normalBackfill];

    backfill.forEach(p => {
      p.__pinkCapBackfill = true;
      p.__slotBucket = p.__slotBucket ?? getMatchingSlotBucketKey(p.__rankKey);
    });

    const finalSelected = [...kept, ...backfill];

    return {
      finalSelected,
      pinkManagedSlotsBeforeCap,
      pinkManagedSlotsAfterCap: maxPinkManagedSlots,
      pinkCapDroppedCount: droppedCount
    };
  }

  const SCORING_POLICY_COMPARISONS = Object.freeze([
    Object.freeze({ variant: "yellowDecay010", id: "yellow-phase-decay-010", lambda: 0.10, scaleSec: 90 }),
    Object.freeze({ variant: "yellowPrevious", id: "yellow-phase-decay-003", lambda: 0.03, scaleSec: 90 }),
    Object.freeze({
      variant: "yellowNoDecayThrough4", id: "yellow-phase-no-decay-through-4",
      lambda: null, noDecayThroughCycleCount: 4, scaleSec: 90
    }),
    Object.freeze({ variant: "yellowError60", id: "yellow-phase-error-060", lambda: 0.03, scaleSec: 60 }),
    Object.freeze({ variant: "yellowNoDecay", id: "yellow-phase-no-decay", lambda: 0, scaleSec: 90 }),
    Object.freeze({ variant: "areaRecent", id: "area-basic-recent", area: "basic-recent" }),
    Object.freeze({ variant: "areaRecentOnly", id: "area-recent-only", area: "recent-only" }),
    Object.freeze({ variant: "areaNone", id: "area-none", area: "none" }),
    Object.freeze({ variant: "areaDayOnly", id: "area-day-relative-only", area: "day-only" }),
    Object.freeze({ variant: "previousPolicy", id: "previous-phase-area-policy",
      lambda: 0.03, scaleSec: 90, area: "basic-recent" })
  ]);

  function buildShadowCandidateComparisons(pool, options) {
    // Share aggregates only within this prediction; never reuse history across evaluations.
    const context = {};
    return [
      { variant: "dayRelativeArea", id: "day-relative-area" },
      { variant: "yellowPhase", id: "yellow-phase-weight-070" },
      ...SCORING_POLICY_COMPARISONS
    ].map(({ variant, id }) => ({
      id, ...evaluateShadowCandidateComparison(pool, { ...options, variant }, context)
    }));
  }

  function buildShadowAreaContext(pool, copyAreaHistory, evaluationTimeMs, settings) {
    const dayKey = ViewerPersistence.buildDailyKey(new Date(evaluationTimeMs), 540);
    const history = copyAreaHistory.filter(record =>
      Number.isFinite(record.t) && record.t <= evaluationTimeMs &&
      ViewerPersistence.buildDailyKey(new Date(record.t), 540) === dayKey &&
      String(record.area ?? "") !== ""
    );
    const areaCounts = new Map();
    const observedCounts = new Map();
    for (const p of pool) {
      const area = String(p.area ?? "");
      areaCounts.set(area, (areaCounts.get(area) ?? 0) + 1);
    }
    for (const record of history) {
      const area = String(record.area);
      observedCounts.set(area, (observedCounts.get(area) ?? 0) + 1);
    }
    const details = new Map([...areaCounts].map(([area, count]) => {
      const expected = history.length * count / Math.max(1, pool.length);
      const observed = observedCounts.get(area) ?? 0;
      const boost = area
        ? 1 + settings.weight * clamp((observed - expected) / (expected + settings.smoothingCount), 0, 1)
        : 1;
      return [area, { expected, observed, boost }];
    }));
    return { dayKey, sampleCount: history.length, areaCounts, observedCounts, details };
  }

  function buildShadowCandidateComparison(pool, options) {
    return evaluateShadowCandidateComparison(pool, options, {});
  }

  function evaluateShadowCandidateComparison(pool, {
    variant, scoringConfig, slotPlan = [], copyAreaHistory = [], evaluationTimeMs
  }, context) {
    const policy = SCORING_POLICY_COMPARISONS.find(entry => entry.variant === variant);
    if (!policy && !["dayRelativeArea", "yellowPhase"].includes(variant)) {
      throw new Error(`Unknown diagnostic variant: ${variant}`);
    }
    const settings = policy ? { enabled: true, ...policy } : scoringConfig.experimental[variant];
    if (!settings.enabled) return { status: "disabled", parameters: { ...settings }, selected: [] };

    const phasePolicyEnabled = policy &&
      (policy.lambda !== undefined || policy.noDecayThroughCycleCount !== undefined);
    const configuredYellowLambda = Number(
      scoringConfig.phaseError?.yellowLambda ?? scoringConfig.phaseError?.lambda ?? 0.06
    );
    const phaseCycleCounts = {
      "0": 0, "1": 0, "2": 0, "3": 0, "4": 0, "5+": 0, unknown: 0
    };
    if (policy?.noDecayThroughCycleCount !== undefined) {
      for (const candidate of pool) {
        const detail = candidate.__detail ?? {};
        if (detail.isPinkManaged) continue;
        const diffSec = (evaluationTimeMs - detail.phaseAnchorAtMs) / 1000;
        const cycleCount =
          typeof detail.phaseAnchorAtMs === "number" &&
          detail.phaseAnchorType !== "unavailable" &&
          Number.isFinite(detail.cycleSec) && detail.cycleSec > 0 &&
          Number.isFinite(diffSec) && diffSec >= 0
            ? Math.floor(diffSec / detail.cycleSec)
            : detail.cycleCount;
        if (!Number.isFinite(cycleCount) || cycleCount < 0) {
          phaseCycleCounts.unknown++;
        } else {
          const key = cycleCount > policy.noDecayThroughCycleCount
            ? "5+" : String(cycleCount);
          phaseCycleCounts[key] = (phaseCycleCounts[key] ?? 0) + 1;
        }
      }
    }

    const isArea = variant === "dayRelativeArea" || policy?.area === "day-only";
    let dayArea = null;
    if (isArea) {
      dayArea = context.dayArea ??= buildShadowAreaContext(
        pool, copyAreaHistory, evaluationTimeMs, scoringConfig.experimental.dayRelativeArea);
    }
    let recentHistory = null;
    if (policy?.area?.includes("recent")) {
      if (!context.recentHistory) {
        const config = getRecentAreaBoostConfig({
          candidateSelection: { areaBoost: { recentMatch: {
            ...scoringConfig.candidateSelection.areaBoost.recentMatch, enabled: true
          } } }
        });
        context.recentHistory = {
          config,
          ...buildCopyAreaHistoryContext(copyAreaHistory.filter(record =>
            Number.isFinite(record.t) && record.t <= evaluationTimeMs), config)
        };
      }
      recentHistory = context.recentHistory;
    }
    let unavailablePhaseCount = 0;

    // All selection flags and score details belong to diagnostic clones only.
    const clones = pool.map(p => {
      const clone = { ...p, __detail: { ...p.__detail } };
      for (const key of ["__crossBucket", "__wildcard", "__pinkCapBackfill",
        "__crossBucketSelectionReason", "displayRank"]) delete clone[key];
      const d = clone.__detail;
      if (policy) {
        let effective = d.effectivePhaseScore;
        if (phasePolicyEnabled && !d.isPinkManaged) {
          const diffSec = (evaluationTimeMs - d.phaseAnchorAtMs) / 1000;
          if (typeof d.phaseAnchorAtMs === "number" && Number.isFinite(d.phaseAnchorAtMs) &&
              d.phaseAnchorType !== "unavailable" && Number.isFinite(d.cycleSec) &&
              d.cycleSec > 0 && Number.isFinite(diffSec) && diffSec >= 0) {
            const cycleCount = Math.floor(diffSec / d.cycleSec);
            const lambda = policy.noDecayThroughCycleCount !== undefined
              ? cycleCount <= policy.noDecayThroughCycleCount ? 0 : configuredYellowLambda
              : policy.lambda;
            Object.assign(d, ViewerDomain.computePhaseMetrics(
              diffSec, d.cycleSec, lambda,
              policy.scaleSec ?? scoringConfig.phaseError?.yellowScaleSec ??
                scoringConfig.phaseError?.scaleSec ?? 90
            ));
            d.phaseDecayLambda = lambda;
            effective = 1 - d.phaseWeight * (1 - d.finalPhaseScore);
          } else {
            unavailablePhaseCount++;
          }
        }
        let basic = d.areaBoost;
        let recent = d.recentAreaAppliedBoost;
        if (policy.area) {
          basic = policy.area === "basic-recent" ? basic : 1;
          recent = 1;
          const area = String(p.area ?? "");
          if (recentHistory && area) {
            recent = 1 + recentHistory.config.weight * Math.sqrt(
              Number(recentHistory.recentWindowCounts[area] ?? 0) / recentHistory.config.windowSize);
          }
          if (policy.area === "day-only") {
            const { boost, expected, observed } = dayArea.details.get(area);
            recent = boost;
            d.diagnosticAreaExpectedCount = expected;
            d.diagnosticAreaObservedCount = observed;
          }
        }
        d.effectivePhaseScore = effective;
        d.areaBoost = basic;
        d.recentAreaAppliedBoost = recent;
        d.recentAreaCounterfactualBoostWindow = recent;
        // Preserve non-AREA global weighting exactly for AREA-only comparisons.
        if (phasePolicyEnabled && !d.isPinkManaged) {
          clone.__score = d.historicalScore * d.realtimeBoost * d.pinkMismatchBoostFactor * effective;
          d.score = clone.__score;
        }
        d.slotScore = d.realtimeBoost * d.pinkMismatchBoostFactor * effective *
          basic * d.prideBandPriorWeight * recent;
      } else if (variant === "dayRelativeArea") {
        const area = String(p.area ?? "");
        const { expected, observed, boost } = dayArea.details.get(area);
        d.slotScore = getCandidateSlotScore(p) / (d.recentAreaAppliedBoost ?? 1) * boost;
        d.recentAreaCounterfactualBoostWindow = boost;
        d.recentAreaAppliedBoost = boost;
        d.diagnosticAreaExpectedCount = expected;
        d.diagnosticAreaObservedCount = observed;
      } else if (!d.isPinkManaged) {
        const effective = clamp(1 - settings.weight * (1 - d.finalPhaseScore), 0, 1);
        d.phaseWeight = settings.weight;
        d.effectivePhaseScore = effective;
        clone.__score = d.historicalScore * d.realtimeBoost * d.pinkMismatchBoostFactor * effective;
        d.score = clone.__score;
        d.slotScore = d.realtimeBoost * d.pinkMismatchBoostFactor * effective *
          d.areaBoost * d.prideBandPriorWeight * d.recentAreaAppliedBoost;
      }
      clone.__slotScore = d.slotScore;
      return clone;
    });
    const eligible = clones.filter(p =>
      getCandidateSelectionScore(p) > 0 && getCandidateSlotScore(p) > 0);
    const slots = getMatchingSlotCounts(scoringConfig);
    const normal = selectNormalCandidatesBySlots(eligible, slots.normal, {}, slotPlan, {
      state: {}, scoringConfig
    });
    const cross = selectCrossBucketCandidates(eligible, normal, slots.crossBucket);
    cross.forEach(p => {
      p.__crossBucket = true;
      p.__crossBucketSelectionReason = "individual-probability";
    });
    const wildcard = selectWildcardCandidates(eligible, [...normal, ...cross], slots.wildcard);
    wildcard.forEach(p => {
      p.__wildcard = true;
      p.__crossBucket = true;
      p.__crossBucketSelectionReason = "global-high-score";
    });
    const selected = [...normal, ...cross, ...wildcard];
    return {
      status: "computed",
      parameters: {
        ...settings,
        diagnosticOnly: true,
        ...(isArea ? {
          weight: scoringConfig.experimental.dayRelativeArea.weight,
          smoothingCount: scoringConfig.experimental.dayRelativeArea.smoothingCount,
          dayKey: dayArea.dayKey, dayBoundary: "JST-04:00", historySource: "prior-normal-copies",
          sampleCount: dayArea.sampleCount, populationSource: "scoredCandidates",
          populationCount: pool.length, replaces: "recent-area-only",
          basicAreaPreserved: policy?.area !== "day-only",
          basicAreaPopulationSource: "filtered-classified-candidates",
          combinedAreaFormula: policy?.area === "day-only"
            ? "dayRelativeAreaBoost" : "basicAreaBoost * dayRelativeAreaBoost",
          globalScoreUnchanged: true,
          observedAreaCounts: Object.fromEntries(dayArea.observedCounts),
          candidateAreaCounts: Object.fromEntries(dayArea.areaCounts),
          formula: "1 + weight * clamp((observed - expected) / (expected + smoothingCount), 0, 1)"
        } : policy ? {
          phaseScope: policy.lambda === undefined ? "unchanged" : "yellow-only",
          ...(policy.noDecayThroughCycleCount !== undefined ? {
            phaseScope: "yellow-cycle-count",
            lambdaAfterCutoff: configuredYellowLambda,
            noDecayThroughCycleCount: policy.noDecayThroughCycleCount,
            cycleCountBasis: "floor((evaluationTimeMs-phaseAnchorAtMs)/cycleSec)",
            cycleCounts: phaseCycleCounts
          } : {}),
          pinkPhaseUnchanged: true, scoringTrustApplied: false,
          unavailablePhaseCount, unavailablePhaseRule: "preserve-observed-phase",
          ...(recentHistory ? {
            recentMatch: { weight: recentHistory.config.weight, windowSize: recentHistory.config.windowSize,
              includePreviousDays: true, historySource: "prior-normal-copies" }
          } : {})
        } : { replaces: "yellow-effective-phase-weight", pinkUnchanged: true, scoringTrustApplied: false }),
        populationAndSlotPlan: "same-as-production",
        slotPlan: slotPlan.map(entry => ({ ...entry }))
      },
      selected
    };
  }

  /*
   * Log-only comparisons; the live ten and learning remain untouched.
   * Compare adjacent production predictions, not inferred continuous UI history.
   * Session history expires after 30 minutes/JST04 and shadows never refresh it.
   * Boundary scores are references: allocation/diversity can override score order.
   */
  function buildCandidateResurfacingDiagnostics(pool, {
    current = [], previousState = null, evaluationTimeMs, viewerTier,
    slotPlan = [], scoringConfigVersion
  }) {
    if (!Number.isFinite(evaluationTimeMs)) {
      throw new Error("Resurfacing diagnostics require a finite evaluation time");
    }
    const identify = ViewerDomain.buildPlayerIdentityKey;
    const dayKey = ViewerPersistence.buildDailyKey(new Date(evaluationTimeMs), 540);
    const previous = previousState?.snapshot;
    const timeOrdered = Boolean(previous && previous.at < evaluationTimeMs);
    const sameDay = previous?.dayKey === dayKey;
    const sameConfig = previous?.scoringConfigVersion === scoringConfigVersion;
    const comparable = Boolean(timeOrdered && sameDay && sameConfig && previous.viewerTier === viewerTier);
    const history = new Map(!comparable ? [] : previousState.history
      .filter(entry => evaluationTimeMs - entry.at <= 30 * 60000)
      .map(entry => [entry.key, entry]));
    const selectedKeys = new Set(current.map(identify));
    const populations = new Map();
    const keyCounts = new Map();
    for (const p of pool) {
      const bucket = getMatchingSlotBucketKey(p.__rankKey);
      const group = populations.get(bucket) ?? [];
      group.push(p);
      populations.set(bucket, group);
      const key = identify(p);
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }
    const bucketRanks = new Map();
    const buckets = {};
    for (const [bucket, group] of populations) {
      [...group].sort((a, b) => getCandidateSlotScore(b) - getCandidateSlotScore(a))
        .forEach((p, i) => bucketRanks.set(p, i + 1));
      const normal = current.filter(p => !p.__crossBucket &&
        getMatchingSlotBucketKey(p.__rankKey) === bucket);
      buckets[bucket] = {
        count: group.length, members: group.map(identify).sort().join("\n"),
        slots: slotPlan.find(entry => entry.bucket === bucket)?.slots ?? 0,
        normalBoundaryScore: normal.length ? Math.min(...normal.map(getCandidateSlotScore)) : null
      };
    }
    const finite = value => typeof value === "number" && Number.isFinite(value) ? value : null;
    const candidates = pool.map(p => {
      const d = p.__detail ?? {};
      return {
        key: identify(p), name: p.name, shopname: p.shopname ?? "",
        rankKey: p.__rankKey, bucket: getMatchingSlotBucketKey(p.__rankKey),
        uniqueIdentity: keyCounts.get(identify(p)) === 1,
        selected: selectedKeys.has(identify(p)),
        slotScore: getCandidateSlotScore(p), slotRank: bucketRanks.get(p),
        crossBucketScore: getCandidateCrossBucketScore(p), score: getCandidateSelectionScore(p),
        phaseError: d.phaseScore > 0 ? finite(d.phaseError) : null,
        phaseAnchorAtMs: finite(d.phaseAnchorAtMs), phaseAnchorType: d.phaseAnchorType ?? "unavailable",
        cycleSec: finite(d.cycleSec), basicAreaBoost: finite(d.areaBoost),
        recentAreaBoost: finite(d.recentAreaAppliedBoost),
        effectivePhaseScore: finite(d.effectivePhaseScore),
        prideBandPriorWeight: finite(d.prideBandPriorWeight),
        isPinkManaged: Boolean(d.isPinkManaged), cooldownRemainingSec: finite(d.cooldownRemainingSec)
      };
    });
    for (const p of candidates) {
      const key = `${viewerTier}|${p.key}`;
      const last = history.get(key);
      if (!p.uniqueIdentity || (last &&
        (last.rankKey !== p.rankKey || last.isPinkManaged !== p.isPinkManaged))) history.delete(key);
    }
    const oldByKey = new Map((comparable ? previous.candidates : []).map(p => [p.key, p]));
    const cross = current.find(p => p.__crossBucket && !p.__wildcard);
    const wildcard = current.find(p => p.__wildcard);
    const ratio = (value, boundary) => boundary > 0 ? value / boundary : null;
    const observations = [];
    for (const p of candidates.filter(p => !p.selected)) {
      const old = oldByKey.get(p.key);
      const last = history.get(`${viewerTier}|${p.key}`);
      const sameRank = Boolean(old && old.rankKey === p.rankKey);
      const available = Boolean(sameRank && p.uniqueIdentity && old.uniqueIdentity &&
        p.isPinkManaged === old.isPinkManaged);
      const phaseImprovementSec = available && p.phaseError !== null && old.phaseError !== null
        ? old.phaseError - p.phaseError : null;
      const slotRankImprovement = available ? old.slotRank - p.slotRank : null;
      const slotScoreIncreaseRatio = available && old.slotScore > 0 ? p.slotScore / old.slotScore - 1 : null;
      const recentSelection = Boolean(last && last.rankKey === p.rankKey);
      if (!recentSelection && !(phaseImprovementSec > 0) && !(slotScoreIncreaseRatio > 0)) continue;
      const oldBucket = previous?.buckets[p.bucket];
      const bucket = buckets[p.bucket];
      const causes = [];
      if (available) {
        if (p.phaseAnchorAtMs !== old.phaseAnchorAtMs || p.phaseAnchorType !== old.phaseAnchorType) {
          causes.push("phase-anchor-changed");
        } else if (p.phaseAnchorAtMs !== null && p.cycleSec === old.cycleSec && p.phaseError !== null) {
          causes.push("phase-time-progression");
        }
        if (p.cycleSec !== old.cycleSec) causes.push("cycle-changed");
        if (p.basicAreaBoost !== old.basicAreaBoost) causes.push("basic-area-changed");
        if (p.recentAreaBoost !== old.recentAreaBoost) causes.push("recent-area-changed");
        if (p.prideBandPriorWeight !== old.prideBandPriorWeight) causes.push("pride-band-prior-changed");
        if (bucket.members !== oldBucket.members) causes.push("competitor-population-changed");
        if (bucket.slots !== oldBucket.slots) causes.push("slot-allocation-changed");
        if (slotRankImprovement > 0 && !(slotScoreIncreaseRatio > 0)) causes.push("relative-rank-only");
      }
      observations.push({
        ...p, comparisonStatus: available ? "comparable" : "unavailable",
        unavailableReason: available ? null : !comparable ? "snapshot-context-changed-or-missing"
          : !sameRank ? "opponent-rank-changed-or-missing" : "identity-or-management-changed",
        previouslyAbsent: available ? !old.selected : null,
        recentSelection, lastSelectedAtMs: recentSelection ? last.at : null,
        previousPhaseError: available ? old.phaseError : null, phaseImprovementSec,
        previousPhaseAnchorAtMs: available ? old.phaseAnchorAtMs : null,
        previousPhaseAnchorType: available ? old.phaseAnchorType : null,
        previousCycleSec: available ? old.cycleSec : null,
        previousBasicAreaBoost: available ? old.basicAreaBoost : null,
        previousRecentAreaBoost: available ? old.recentAreaBoost : null,
        previousEffectivePhaseScore: available ? old.effectivePhaseScore : null,
        previousSlotRank: available ? old.slotRank : null, slotRankImprovement,
        previousSlotScore: available ? old.slotScore : null, slotScoreIncreaseRatio,
        normalBoundaryScore: bucket.normalBoundaryScore,
        normalBoundaryRatio: ratio(p.slotScore, bucket.normalBoundaryScore),
        crossBoundaryScore: cross ? getCandidateCrossBucketScore(cross) : null,
        crossBoundaryRatio: ratio(p.crossBucketScore, cross && getCandidateCrossBucketScore(cross)),
        globalBoundaryScore: wildcard ? getCandidateSelectionScore(wildcard) : null,
        globalBoundaryRatio: ratio(p.score, wildcard && getCandidateSelectionScore(wildcard)),
        currentBucketCount: bucket.count, previousBucketCount: available ? oldBucket.count : null,
        currentBucketSlots: bucket.slots, previousBucketSlots: available ? oldBucket.slots : null,
        causes
      });
    }
    const definitions = [
      ["resurfacing-rank-score", {
        requiresRecentSelection: true, historyMinutes: 30, minRankImprovement: 3, minScoreIncreaseRatio: 0.05
      }, p => p.recentSelection && p.slotRankImprovement >= 3 && p.slotScoreIncreaseRatio >= 0.05],
      ["resurfacing-phase", {
        requiresRecentSelection: false, minPhaseImprovementSec: 30, maxPhaseErrorSec: 45
      }, p => p.phaseImprovementSec >= 30 && p.phaseError !== null && p.phaseError <= 45]
    ];
    const comparisons = definitions.map(([id, thresholds, predicate]) => {
      const eligible = observations.filter(p => p.comparisonStatus === "comparable" &&
        p.previouslyAbsent && p.cooldownRemainingSec !== null && p.cooldownRemainingSec <= 0 &&
        p.slotScore > 0 && p.score > 0 && predicate(p))
        .sort((a, b) => b.crossBucketScore - a.crossBucketScore || a.key.localeCompare(b.key));
      const picked = wildcard ? eligible[0] : null;
      return {
        id, status: "computed", parameters: {
          ...thresholds, replacementRule: "replace-global-wildcard-only",
          ranking: "current-cross-bucket-score", diagnosticOnly: true,
          requiresPreviousAbsence: true, sameOwnAndOpponentRank: true
        },
        evaluatedCandidateCount: pool.length, eligibleCandidateCount: eligible.length,
        applied: Boolean(picked), rescue: picked ?? null,
        selected: picked ? current.map(p => p === wildcard
          ? pool.find(q => identify(q) === picked.key) : p) : current.slice()
      };
    });
    for (const p of candidates.filter(p => p.selected && p.uniqueIdentity)) {
      const key = `${viewerTier}|${p.key}`;
      history.set(key, {
        key, at: evaluationTimeMs, rankKey: p.rankKey, isPinkManaged: p.isPinkManaged
      });
    }
    const observationColumns = Object.keys(observations[0] ?? {});
    return {
      diagnostics: {
        version: "resurfacing-v1-20261026", diagnosticOnly: true,
        historySource: "session-production-predictions-only", historyMinutes: 30,
        causeMeaning: "observed-changes-not-proof-of-player-activity",
        boundaryMeaning: "reference-selected-scores-not-guaranteed-cutoffs",
        previousEvaluationTimeMs: timeOrdered ? previous.at : null,
        comparisonIntervalSec: timeOrdered ? (evaluationTimeMs - previous.at) / 1000 : null,
        comparableSnapshot: comparable,
        observationColumns,
        observations: observations.map(p => observationColumns.map(key => p[key]))
      },
      comparisons,
      state: {
        snapshot: { at: evaluationTimeMs, dayKey, viewerTier, scoringConfigVersion, candidates, buckets },
        history: [...history.values()]
      }
    };
  }

  const ViewerMatching = {
    MATCHING_SCRIPT_VERSION,
    SCORING_POLICY_COMPARISONS,
    resolveScoringConfig,
    getScoringConfigSnapshot,
    getMatchingSlotCounts,
    HISTORICAL_RELIABILITY_K,
    HISTORICAL_CANDIDATE_COUNT_ALPHA,
    DEFAULT_PRIDE_BAND_DIVERSITY_GAP_THRESHOLD,
    DEFAULT_PRIDE_BAND_PRIOR_EXPONENT,
    NORMAL_SLOT_COUNT,
    CROSS_BUCKET_SLOT_COUNT,
    WILDCARD_SLOT_COUNT,
    DEFAULT_MAX_PINK_MANAGED_SLOTS,
    DEFAULT_REALTIME_PLAYER_WEIGHT,
    DEFAULT_REALTIME_RANK_WEIGHT,
    DEFAULT_REALTIME_MAX_BONUS,
    DEFAULT_PINK_MISMATCH_FLOOR,
    DEFAULT_PINK_MISMATCH_DECAY_SEC,
    DEFAULT_AREA_BOOST_WEIGHT,
    DEFAULT_AREA_SMOOTHING_SAMPLE_SIZE,
    DEFAULT_RECENT_AREA_BOOST_ENABLED,
    DEFAULT_RECENT_AREA_BOOST_WEIGHT,
    MAX_RECENT_AREA_BOOST_WEIGHT,
    DEFAULT_RECENT_AREA_MATCH_WINDOW_SIZE,
    DEFAULT_AREA_PHASE_DIAGNOSTIC_WEIGHT,
    R6_PRIDE_POPULATION_THRESHOLD,
    DEFAULT_RELATIVE_POPULATION_ADJUSTMENT,
    POPULATION_RANK_KEYS,

    getMatchingSlotBucketKey,
    getHistoricalMinOwnSamplesForNoBackoff,
    getHistoricalTierCandidateCount,
    getHistoricalDistribution,
    getDistributionCellScore,
    getAdjacentTierDistribution,
    buildViewerHistoricalContext,
    getHistoricalScoreDetail,
    buildAreaDensityContext,
    getAreaBoostDetail,
    applyCandidateSlotScores,
    buildCopyAreaHistoryContext,
    getRecentAreaBoostConfig,
    applyCandidateAreaHistoryBoost,
    applyCandidateAreaPhaseDiagnostics,
    getCandidateSlotScore,
    assignCandidateSlotRanks,
    buildMatchingSlotBucketProbabilities,
    buildMatchingSlotPlan,
    prepareR6PrideFrequency,
    getRelativePopulationAdjustmentConfig,
    adjustSlotsByRelativePopulation,
    selectPrideSlotCandidates,
    selectNormalCandidatesBySlots,
    getCandidateSelectionScore,
    getCandidateCrossBucketScore,
    assignCandidateCrossBucketRanks,
    selectCrossBucketCandidates,
    selectWildcardCandidates,
    applyPinkManagedSlotCap,
    buildShadowCandidateComparison,
    buildShadowCandidateComparisons,
    buildCandidateResurfacingDiagnostics
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ViewerMatching;
  }
  if (typeof global !== "undefined") {
    global.ViewerMatching = ViewerMatching;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
