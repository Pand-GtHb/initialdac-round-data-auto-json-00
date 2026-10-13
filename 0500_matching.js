(function (global) {
  "use strict";

  const ViewerUtils = (typeof global !== "undefined" && global.ViewerUtils) || {};
  const ViewerDomain = (typeof global !== "undefined" && global.ViewerDomain) || {};
  const ViewerPersistence = (typeof global !== "undefined" && global.ViewerPersistence) || {};

  const clamp = ViewerUtils.clamp || ((v, min, max) => Math.max(min, Math.min(max, v)));
  const normalizePlayerName = ViewerUtils.normalizePlayerName || (name => String(name ?? "").trim());
  const RANKS = ViewerDomain.RANKS || [];
  const getPlayerRankKey = (p => p?.__rankKey || ViewerDomain.getPlayerRankKey?.(p));
  const mapRankKeyToTierKey = ViewerDomain.mapRankKeyToTierKey || (k => k?.startsWith?.("P_") ? "PRIDE" : k);
  const R6_PRIDE_FREQUENCY_STORAGE_KEY = ViewerPersistence.R6_PRIDE_FREQUENCY_STORAGE_KEY || "viewer_r6_pride_frequency_ledger";
  const LOG_STORAGE_LIMITS = ViewerPersistence.LOG_STORAGE_LIMITS || { copyEvents: 50 };

  const HISTORICAL_RELIABILITY_K = 100;
  const HISTORICAL_CANDIDATE_COUNT_ALPHA = 0.35;
  const DEFAULT_PRIDE_BAND_DIVERSITY_GAP_THRESHOLD = 0.08;
  const DEFAULT_PRIDE_BAND_PRIOR_EXPONENT = 0.5;
  const NORMAL_SLOT_COUNT = 9;
  const CROSS_BUCKET_SLOT_COUNT = 1;
  const DEFAULT_MAX_PINK_MANAGED_SLOTS = 3;
  const DEFAULT_SOFTMAX_BACKTEST_ENABLED = true;
  const DEFAULT_SOFTMAX_BACKTEST_TEMPERATURE = 0.15;
  const DEFAULT_REALTIME_PLAYER_WEIGHT = 0.35;
  const DEFAULT_REALTIME_RANK_WEIGHT = 0.03;
  const DEFAULT_REALTIME_MAX_BONUS = 0.25;
  const DEFAULT_PINK_MISMATCH_FLOOR = 0.3;
  const DEFAULT_PINK_MISMATCH_DECAY_SEC = 60;
  const DEFAULT_AREA_BOOST_WEIGHT = 0.05;
  const DEFAULT_AREA_SMOOTHING_SAMPLE_SIZE = 30;
  const DEFAULT_RECENT_AREA_BOOST_ENABLED = true;
  const DEFAULT_RECENT_AREA_BOOST_WEIGHT = 0.1;
  const MAX_RECENT_AREA_BOOST_WEIGHT = 0.1;
  const DEFAULT_RECENT_AREA_MATCH_WINDOW_SIZE = 10;
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
      ? ctx.ownDistribution.total / (ctx.ownDistribution.total + HISTORICAL_RELIABILITY_K)
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
      ? Math.min(MAX_RECENT_AREA_BOOST_WEIGHT, clamp(configuredWeight, 0, 1))
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

    const diagnostics = {
      historicalRate,
      populationShare,
      populationThreshold: R6_PRIDE_POPULATION_THRESHOLD,
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
    const highPopulation = populationShare >= R6_PRIDE_POPULATION_THRESHOLD;
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

    for (const entry of plan) {
      if (entry.slots <= 0) {
        continue;
      }

      const pool = candidates.filter(
        player => getMatchingSlotBucketKey(player.__rankKey) === entry.bucket
      );

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

    const crossBucketBackfillCount = droppedPink.filter(p => p.__crossBucket).length;
    const crossBucketBackfill = [...eligibleBackfill]
      .sort((a, b) => getCandidateCrossBucketScore(b) - getCandidateCrossBucketScore(a))
      .slice(0, crossBucketBackfillCount);

    crossBucketBackfill.forEach(p => {
      p.__crossBucket = true;
      p.__crossBucketSelectionReason = "pink-cap-backfill";
    });

    const crossBucketBackfillSet = new Set(crossBucketBackfill);
    const normalBackfill = eligibleBackfill
      .filter(p => !crossBucketBackfillSet.has(p))
      .sort((a, b) => getCandidateSlotScore(b) - getCandidateSlotScore(a))
      .slice(0, droppedCount - crossBucketBackfill.length);

    const backfill = [...crossBucketBackfill, ...normalBackfill];

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

  function computeSoftmaxBacktestPreview(pool, slotCount, temperature, options = {}) {
    const config = options.scoringConfig ?? getState()?.scoringConfig;
    const enabled = Boolean(
      config?.experimental?.softmaxBacktest?.enabled ?? DEFAULT_SOFTMAX_BACKTEST_ENABLED
    );

    if (!enabled || !Array.isArray(pool) || pool.length === 0 || slotCount <= 0) {
      return {
        enabled,
        temperature,
        previewCandidates: []
      };
    }

    const items = pool
      .map(p => ({
        player: p,
        score: getCandidateSlotScore(p)
      }))
      .filter(x => x.score > 0);

    const remaining = [...items];
    const picked = [];
    const effectiveSlotCount = Math.min(slotCount, remaining.length);

    for (let i = 0; i < effectiveSlotCount; i++) {
      const maxScore = Math.max(...remaining.map(x => x.score));
      const weights = remaining.map(x => Math.exp((x.score - maxScore) / temperature));
      const totalWeight = weights.reduce((sum, w) => sum + w, 0);

      let r = (options.random ?? Math.random)() * totalWeight;
      let idx = 0;
      for (; idx < weights.length; idx++) {
        r -= weights[idx];
        if (r <= 0) {
          break;
        }
      }
      idx = Math.min(idx, remaining.length - 1);

      picked.push(remaining[idx].player);
      remaining.splice(idx, 1);
    }

    return {
      enabled,
      temperature,
      previewCandidates: picked.map(p => ({
        name: p.name,
        shopname: p.shopname ?? "",
        slotScore: Number(getCandidateSlotScore(p).toFixed(6)),
        isPinkManaged: Boolean(p.__detail?.isPinkManaged)
      }))
    };
  }

  const ViewerMatching = {
    HISTORICAL_RELIABILITY_K,
    HISTORICAL_CANDIDATE_COUNT_ALPHA,
    DEFAULT_PRIDE_BAND_DIVERSITY_GAP_THRESHOLD,
    DEFAULT_PRIDE_BAND_PRIOR_EXPONENT,
    NORMAL_SLOT_COUNT,
    CROSS_BUCKET_SLOT_COUNT,
    DEFAULT_MAX_PINK_MANAGED_SLOTS,
    DEFAULT_SOFTMAX_BACKTEST_ENABLED,
    DEFAULT_SOFTMAX_BACKTEST_TEMPERATURE,
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
    applyPinkManagedSlotCap,
    computeSoftmaxBacktestPreview
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ViewerMatching;
  }
  if (typeof global !== "undefined") {
    global.ViewerMatching = ViewerMatching;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
