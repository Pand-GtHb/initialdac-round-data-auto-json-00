/* ---------------------------------------------------------
   [29] calcMatchingScore（分解能強化版）
   ・rankは基準点として使用
   ・areaとmiscで差を作る
--------------------------------------------------------- */
function calcMatchingScore(player) {

  // -------------------------
  // 基本チェック
  // -------------------------
  if (!player || !player.updateDate) return 0;

  // -------------------------
  // ランク
  // -------------------------
  const rankWeight = getRankWeight(player);
  if (rankWeight <= 0) return 0;

  // -------------------------
  // 時間
  // -------------------------
  const timeWeight = getTimeWeight(player);

  const { diffMin, d } = getPhaseDistanceMin(player.updateDate);
  if (!isFinite(diffMin)) return 0;

  const phaseScore =
    (isFinite(d) && d !== Infinity)
      ? Math.max(0, 1 - (d / MATCHING_SCORE_CONFIG.phaseWindow))
      : 0;

  const recencyScore =
    Math.exp(-diffMin / MATCHING_SCORE_CONFIG.recencyTau);

  // -------------------------
  // 活動量
  // -------------------------
  const star = Number(player.starCnt ?? 0);
  const pride = Number(player.pridePoint ?? 0);

  const activityScore =
    star > 0
      ? Math.min(1, star / 7)
      : (pride > 0 ? 0.7 : 0);

  // -------------------------
  // Area
  // -------------------------
  const areaId = player.areaId;
  const areaWeight =
    State.areaModel?.[areaId] ?? 0;

  // -------------------------
  // rank基準（スケール化）
  // -------------------------
  const RANK_SCALE = 100;  // ★重要

  const rankScore = rankWeight * RANK_SCALE * timeWeight;

  // -------------------------
  // 補助スコア（加算）
  // -------------------------
  const miscScore =
      phaseScore    * 20
    + recencyScore * 20
    + activityScore * 10
    + areaWeight    * 50;

  // -------------------------
  // realtimeBoost
  // -------------------------
  let realtimeBoost = getRealtimeBoost(player);
  realtimeBoost = Math.min(realtimeBoost, 2.0);

  // -------------------------
  // 最終スコア
  // -------------------------
  const score =
    (rankScore + miscScore) * realtimeBoost;

  return Math.max(0, score);
}
