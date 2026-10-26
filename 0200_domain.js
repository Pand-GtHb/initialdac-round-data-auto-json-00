(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    const utils = typeof ViewerUtils !== "undefined" ? ViewerUtils : require("./0100_utils.js");
    module.exports = factory(utils);
  } else {
    root.ViewerDomain = factory(root.ViewerUtils);
    // 既存スクリプトとの互換性のためグローバルにも展開
    Object.assign(root, root.ViewerDomain);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (ViewerUtils) {
  "use strict";

  const {
    normalizePlayerName
  } = ViewerUtils || {};

  const DEFAULT_PHASE_ERROR_SCALE_SEC = 90;

  const RUBY_ID =
    "dcb98f86f149cf71d3707a1592072e7838f0811140c24238820dff2b82602a85";

  const PRIDE_LEVELS = Object.freeze([
    { key: "P_A", level: "A=～99", min: 1, max: 99, icon: "ef788ee816773c454495ebf83e5ac380" },
    { key: "P_B", level: "B=100～", min: 100, max: 499, icon: "3c8cc917bb7a97d46ba35c93d898491c" },
    { key: "P_C", level: "C=500～", min: 500, max: 999, icon: "ec8f805c9de95c65c858d2e1341f76ab" },
    { key: "P_D", level: "D=1000～", min: 1000, max: 4999, icon: "58446a29e6c496139963728eea887349" },
    { key: "P_E", level: "E=5000～", min: 5000, max: 9999, icon: "5f88cb6a33355e7bc890d92576e36c94" },
    { key: "P_F", level: "F=10000～", min: 10000, max: 49999, icon: "807b2b796691b862d667448a3918edd7" },
    { key: "P_G", level: "G=50000～", min: 50000, max: Infinity, icon: "dfff542ae4eee8e95ea61a665dd8ce8e" }
  ]);

  const RANKS = Object.freeze([
    ...Array.from({ length: 8 }, (_, i) => ({
      key: `R${i + 1}`,
      type: "ruby",
      star: i + 1,
      label: `★${i + 1}`,
      badgeId: RUBY_ID,
      icon: `https://initiald.sega.jp/inidac/ranking-images/online/${RUBY_ID}.png`,
      order: i
    })),
    ...PRIDE_LEVELS.map((p, idx) => ({
      key: p.key,
      type: "pride",
      min: p.min,
      max: p.max,
      label: p.level,
      badgeId: p.icon,
      icon: `https://initiald.sega.jp/inidac/ranking-images/pride/${p.icon}.png`,
      order: 8 + idx
    }))
  ]);

  function getRankIndex(key) {
    return RANKS.findIndex(r => r.key === key);
  }

  function getRankInfo(key) {
    return RANKS.find(r => r.key === key) || null;
  }

  function getPrideBandKey(pridePoint) {
    const pt = Number(pridePoint ?? 0);
    if (pt <= 0) {
      return null;
    }
    const band = PRIDE_LEVELS.find(p => pt >= p.min && pt <= p.max);
    return band ? band.key : null;
  }

  function getPlayerRankKey(player) {
    if (!player) return null;
    if (
      player.onlineBattleRankId === RUBY_ID &&
      Number(player.starCnt) >= 1 &&
      Number(player.starCnt) <= 8
    ) {
      return `R${player.starCnt}`;
    }
    const prideBandKey = getPrideBandKey(player.pridePoint);
    if (prideBandKey) {
      return prideBandKey;
    }
    return null;
  }

  function mapRankKeyToTierKey(rankKey) {
    if (!rankKey) return null;
    if (rankKey.startsWith("R")) {
      return rankKey;
    }
    if (rankKey.startsWith("P_")) {
      return `PRIDE_${rankKey.slice(2)}`;
    }
    return rankKey;
  }

  function buildPlayerIdentityKey(player) {
    const name = (normalizePlayerName ? normalizePlayerName(player?.name ?? "") : String(player?.name ?? ""));
    const shop = (normalizePlayerName ? normalizePlayerName(player?.shopname ?? "") : String(player?.shopname ?? ""));
    const parts = [name, shop].filter(Boolean);
    if (parts.length > 0) {
      return parts.join("@@");
    }
    return "__empty__";
  }

  function computePhaseMetrics(
    diffSec,
    cycleSec,
    lambda,
    phaseErrorScaleSec = DEFAULT_PHASE_ERROR_SCALE_SEC
  ) {
    const safeCycleSec = Number(cycleSec);
    const safeDiffSec = Number(diffSec);
    const safeLambda = Number.isFinite(Number(lambda)) ? Number(lambda) : 0.03;
    const safePhaseErrorScaleSec =
      Number.isFinite(Number(phaseErrorScaleSec)) && Number(phaseErrorScaleSec) > 0
        ? Number(phaseErrorScaleSec)
        : DEFAULT_PHASE_ERROR_SCALE_SEC;

    if (
      !isFinite(safeCycleSec) ||
      safeCycleSec <= 0 ||
      !isFinite(safeDiffSec) ||
      safeDiffSec < 0
    ) {
      return {
        cycleCount: 0,
        phaseError: 0,
        phaseScore: 0,
        decay: 0,
        finalPhaseScore: 0
      };
    }

    const phasePos = safeDiffSec % safeCycleSec;
    const phaseError = Math.min(phasePos, safeCycleSec - phasePos);
    const phaseScore = Math.exp(
      -0.5 * Math.pow(phaseError / safePhaseErrorScaleSec, 2)
    );
    const cycleCount = Math.floor(safeDiffSec / safeCycleSec);
    const decay = Math.exp(-safeLambda * cycleCount);
    const finalPhaseScore = phaseScore * decay;

    return {
      cycleCount,
      phaseError,
      phaseScore,
      decay,
      finalPhaseScore
    };
  }

  function buildPhaseDirectionDetail(
    diffSec,
    cycleSec,
    phaseError
  ) {
    const safeDiffSec = Number(diffSec);
    const safeCycleSec = Number(cycleSec);
    const safePhaseError = Number(phaseError);

    if (
      !Number.isFinite(safeDiffSec) ||
      safeDiffSec < 0 ||
      !Number.isFinite(safeCycleSec) ||
      safeCycleSec <= 0 ||
      !Number.isFinite(safePhaseError)
    ) {
      return {
        diffSec: 0,
        phasePos: 0,
        peakDirection: "unknown",
        signedPhaseError: 0,
        phaseBucket: "unknown"
      };
    }

    const phasePos = safeDiffSec % safeCycleSec;
    const peakDirection = phasePos < safeCycleSec / 2 ? "past" : "upcoming";
    const signedPhaseError = peakDirection === "past" ? safePhaseError : -safePhaseError;
    const absError = Math.abs(signedPhaseError);
    const bucketRange =
      absError < 30
        ? "0_30"
        : absError < 60
        ? "30_60"
        : absError < 120
        ? "60_120"
        : "120_plus";

    return {
      diffSec: safeDiffSec,
      phasePos,
      peakDirection,
      signedPhaseError,
      phaseBucket: `${peakDirection}_${bucketRange}`
    };
  }

  function calcStats(list, total) {
    const cnt = list ? list.length : 0;
    const percent = total ? Math.round((cnt / total) * 100) : 0;
    const points = (list || []).map(p => Number(p.point ?? 0));
    const avg = cnt ? Math.round(points.reduce((a, b) => a + b, 0) / cnt) : 0;
    const min = cnt ? Math.min(...points) : 0;
    const max = cnt ? Math.max(...points) : 0;

    return {
      cnt,
      percent,
      avg,
      min,
      max
    };
  }

  function buildRankPopulationSnapshot(players) {
    const rankKeys = [
      "R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8",
      "P_A", "P_B", "P_C", "P_D", "P_E", "P_F", "P_G"
    ];

    const rankCounts = Object.fromEntries(rankKeys.map(key => [key, 0]));
    let sourceCount = 0;
    let unclassifiedCount = 0;

    for (const player of players ?? []) {
      sourceCount++;
      const rankKey = player?.__rankKey ?? getPlayerRankKey(player);
      if (!Object.prototype.hasOwnProperty.call(rankCounts, rankKey)) {
        unclassifiedCount++;
        continue;
      }
      rankCounts[rankKey]++;
    }

    const classifiedCount = sourceCount - unclassifiedCount;
    const rankShares = {};

    for (const rankKey of rankKeys) {
      rankShares[rankKey] =
        classifiedCount > 0
          ? Number((rankCounts[rankKey] / classifiedCount).toFixed(6))
          : 0;
    }

    const groupCounts = {
      ruby1To6:
        rankCounts.R1 + rankCounts.R2 + rankCounts.R3 +
        rankCounts.R4 + rankCounts.R5 + rankCounts.R6,
      ruby7: rankCounts.R7,
      ruby8: rankCounts.R8,
      pride:
        rankCounts.P_A + rankCounts.P_B + rankCounts.P_C +
        rankCounts.P_D + rankCounts.P_E + rankCounts.P_F + rankCounts.P_G
    };

    const groupShares = {};
    for (const [group, count] of Object.entries(groupCounts)) {
      groupShares[group] =
        classifiedCount > 0
          ? Number((count / classifiedCount).toFixed(6))
          : 0;
    }

    return {
      sourceCount,
      classifiedCount,
      unclassifiedCount,
      denominator: "classifiedCount",
      rankCounts,
      rankShares,
      groupCounts,
      groupShares
    };
  }

  function normalizeHistoricalMatchupDistribution(json) {
    const viewerTiers = json?.viewerTiers;
    if (!viewerTiers || typeof viewerTiers !== "object") {
      return null;
    }

    const byViewerTier = {};
    const opponentTierSet = new Set();

    for (const viewerTier in viewerTiers) {
      const entry = viewerTiers[viewerTier];
      const opponents = entry?.opponents ?? {};
      const total =
        Object.values(opponents).reduce((a, c) => a + Number(c ?? 0), 0) || 1;

      const probList = [];
      const opponentTierMap = {};
      let prideProbabilityTotal = 0;

      for (const key in opponents) {
        const lastSep = key.lastIndexOf("_");
        if (lastSep < 0) continue;

        const opponentTier = key.slice(0, lastSep);
        const area = key.slice(lastSep + 1);

        opponentTierSet.add(opponentTier);
        const count = Number(opponents[key] ?? 0);
        const prob = count / total;

        probList.push({
          opponentTier,
          area,
          count,
          prob
        });

        opponentTierMap[opponentTier] =
          (opponentTierMap[opponentTier] || 0) + prob;

        if (opponentTier.startsWith("PRIDE_")) {
          prideProbabilityTotal += prob;
        }
      }

      byViewerTier[viewerTier] = {
        probList,
        opponentTierMap,
        total,
        prideProbabilityTotal
      };
    }

    return {
      byViewerTier,
      usesAreaWildcard: true,
      historicalOpponentTierCount: opponentTierSet.size,
      historicalAreaCount: 1,
      historicalSupportSize: opponentTierSet.size
    };
  }

  return Object.freeze({
    DEFAULT_PHASE_ERROR_SCALE_SEC,
    RUBY_ID,
    PRIDE_LEVELS,
    RANKS,
    getRankIndex,
    getRankInfo,
    getPrideBandKey,
    getPlayerRankKey,
    mapRankKeyToTierKey,
    buildPlayerIdentityKey,
    computePhaseMetrics,
    buildPhaseDirectionDetail,
    calcStats,
    buildRankPopulationSnapshot,
    normalizeHistoricalMatchupDistribution
  });
});
