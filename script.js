
/* #################################################################
 [LAYER 0000] Configuration / Constants
 ################################################################# */

/* =========================================================
 [0000] Core Config（旧 [0000]）
========================================================= */
const BASE_URL =
  "https://pand-gthb.github.io/initialdac-round-data-auto-json-00";

/* =========================================================
 [0010] View State Enum（旧 [0010]）
========================================================= */
const STATE = {
  SUMMARY: "summary",
  DETAIL: "detail",
  MATCHING: "matching"
};

/* =========================================================
 [0020] Persistence Keys【永続化】（旧 [0030][1000][7140]）
========================================================= */
const PERSIST_STATE_KEY = "initialdac_viewer_pink_state_v1";

const LOG_STORAGE_KEYS = {
  copyEvents: "initialdac_copy_events_"
};

const LOG_STORAGE_LIMITS = {
  copyEvents: 200
};

const MAX_LOG_LINES = 100;

const REALTIME_ACTIVITY_STORAGE_KEY =
  "matchingRealtimeActivity_v1";

/* =========================================================
 [0030] IndexedDB Schema【永続化】（旧 [9600]）
========================================================= */
const LOG_DB_NAME =
  "viewer_logs_db";

const LOG_DB_VERSION =
  2;

const LOG_STORE = {

  events:
    "events",

  copyEvents:
    "copyEvents",

  cycleEvents:
    "cycleEvents",

  candidateEvents:
    "candidateEvents"

};

let logDB = null;

/* =========================================================
 [0040] Rank Master（旧 [0040]）
========================================================= */
const RUBY_ID =
  "dcb98f86f149cf71d3707a1592072e7838f0811140c24238820dff2b82602a85";

const PRIDE_LEVELS = [
  { key: "P_A", level: "A=～99", min: 1, max: 99, icon: "ef788ee816773c454495ebf83e5ac380" },
  { key: "P_B", level: "B=100～", min: 100, max: 499, icon: "3c8cc917bb7a97d46ba35c93d898491c" },
  { key: "P_C", level: "C=500～", min: 500, max: 999, icon: "ec8f805c9de95c65c858d2e1341f76ab" },
  { key: "P_D", level: "D=1000～", min: 1000, max: 4999, icon: "58446a29e6c496139963728eea887349" },
  { key: "P_E", level: "E=5000～", min: 5000, max: 9999, icon: "5f88cb6a33355e7bc890d92576e36c94" },
  { key: "P_F", level: "F=10000～", min: 10000, max: 49999, icon: "807b2b796691b862d667448a3918edd7" },
  { key: "P_G", level: "G=50000～", min: 50000, max: Infinity, icon: "dfff542ae4eee8e95ea61a665dd8ce8e" }
];

const RANKS = [

  ...Array.from({ length: 8 }, (_, i) => ({

    key: `R${i + 1}`,

    type: "ruby",

    star: i + 1,

    label: `★${i + 1}`,

    badgeId: RUBY_ID,

    icon:
      `https://initiald.sega.jp/inidac/ranking-images/online/${RUBY_ID}.png`,

    order: i

  })),

  ...PRIDE_LEVELS.map((p, idx) => ({

    key: p.key,

    type: "pride",

    min: p.min,

    max: p.max,

    label: p.level,

    badgeId: p.icon,

    icon:
      `https://initiald.sega.jp/inidac/ranking-images/pride/${p.icon}.png`,

    order: 8 + idx

  }))

];


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
  currentIsRubyBand: true,
  currentDetailKey: "",
  currentDetailLabel: "",
  currentDetailIcon: "",
  matchingList: [],
  matchingRankedAll: [],
  myStar: 7,
  myRankKey: "R7",
  recentClicks: [],
  recentClickIndex: null,
  jointModel: null,
  playerActivity: {},
  rankActivity: {},
  viewerLastCopiedAt: null,
  scoringConfig: null,
  updateWatchTimer: null,
  // updateCheckRunning は削除 (常に checkUpdate を実行)
  prefetchedRoundData: null,
  prefetchedForUpdateAt: "",
  prefetchInFlight: null,

  phaseAdjust: {
    yellow: 0,
    pink: 0
  },

  lastCandidateEventId: null,

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

  const selectedMyRank =
    rankValue || "R7";

  const num =
    Number(
      String(selectedMyRank)
        .replace("R", "")
    );

  if (
    num >= 1 &&
    num <= 8
  ) {

    State.myStar = num;
    State.myRankKey = `R${num}`;

  } else {

    State.myStar = 6;
    State.myRankKey = selectedMyRank;
  }

  return selectedMyRank;
}


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
 [2010] Date Utility:getTodayYMDJa（旧 [2010]）
========================================================= */
function getTodayYMDJa() {

  const now = new Date();

  const y = now.getFullYear();
  const m = ("0" + (now.getMonth() + 1)).slice(-2);
  const d = ("0" + now.getDate()).slice(-2);

  return `${y}/${m}/${d}`;
}

/* =========================================================
 [2020] Date Utility:compactYMD（旧 [2020]）
========================================================= */
function compactYMD(ymd) {
  return String(ymd || "")
    .replace(/\//g, "");
}

/* =========================================================
 [2030] Date Utility:buildDailyKey（旧 [2030]）
 ※ ゲーム運用日に合わせた日付けキー（午前4時＝28時切替）
 ========================================================= */
function buildDailyKey() {

  const d = new Date();

  // 午前4時(4:00)未満は前日扱いにする（28時締め）
  if (d.getHours() < 4) {
    d.setDate(d.getDate() - 1);
  }

  const y = d.getFullYear();
  const m = ("0" + (d.getMonth() + 1)).slice(-2);
  const day = ("0" + d.getDate()).slice(-2);

  return `${y}${m}${day}`;
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

/* =========================================================
 [2100] String Utility:normalize（旧 [2100]）
========================================================= */
function normalize(s) {
  if (s == null) {
    return "";
  }

  s = String(s).trim();

  // 全角スペースを半角に
  s = s.replace(/\u3000/g, " ");

  // 先に小文字化してから英数字を全角化する（toLowerCase が無効化されるのを防止）
  s = s.toLowerCase();

  s = s.replace(
    /[A-Za-z0-9]/g,
    ch => String.fromCharCode(ch.charCodeAt(0) + 0xFEE0)
  );

  // ひらがなをカタカナ相当に変換（既存ロジック維持）
  s = s.replace(
    /[\u3041-\u3096]/g,
    ch => String.fromCharCode(ch.charCodeAt(0) + 0x60)
  );

  // 空白を除去
  s = s.replace(/\s+/g, "");

  return s;
}

/* =========================================================
 [2110] String Utility:normalizePlayerName（旧 [2110]）
========================================================= */
function normalizePlayerName(str) {

  return String(str ?? "")
    .normalize("NFKC");
}

/* =========================================================
 [2200] Number Utility:fmt（旧 [2200]）
========================================================= */
const fmt =
  n => Number(n)
    .toLocaleString();

/* =========================================================
 [2300] Text Width Utility:getZenkakuLength（旧 [2400]）
========================================================= */
function getZenkakuLength(str) {

  if (!str) {
    return 0;
  }

  const len =
    str.replace(
      /[^\x00-\x7F]/g,
      "xx"
    ).length;

  return len / 2;
}

/* =========================================================
 [2310] Text Width Utility:isMostlyAscii（旧 [2410]）
========================================================= */
function isMostlyAscii(str) {

  if (!str) {
    return true;
  }

  const asciiCount =
    (str.match(/[\x00-\x7F]/g) || [])
      .length;

  return (
    asciiCount / str.length >= 0.7
  );
}

/* =========================================================
 [2400] Math Utility:foldToCycle（旧 [7240]）
========================================================= */
function foldToCycle(
  diff,
  cycle
) {

  const mod =
    diff % cycle;

  const half =
    cycle / 2;

  return (
    mod <= half
  )
    ? mod
    : mod - cycle;
}

/* =========================================================
 [2410] Math Utility:updateAdjust（旧 [7250]）
========================================================= */
function updateAdjust(
  prev,
  value,
  alpha
) {

  return (
    (1 - alpha) * prev +
    alpha * value
  );
}

/* =========================================================
 [2420] Math Utility:clamp（旧 [7260]）
========================================================= */
function clamp(
  v,
  min,
  max
) {

  return Math.max(
    min,
    Math.min(max, v)
  );
}

/* =========================================================
 [2500] Phase Metrics:computePhaseMetrics（旧 [7300] 内）
========================================================= */
/* =====================================
 * Yellow強度評価
 * 戻り値: 0.0 ～ 1.0
 * ===================================== */

/* =====================================
 * PhaseError → PhaseScore → CycleDecay
 * → FinalPhaseScore の一本化評価
 * ===================================== */
function computePhaseMetrics(
  diffSec,
  cycleSec,
  lambda
) {

  const safeCycleSec =
    Number(cycleSec);

  const safeDiffSec =
    Number(diffSec);

  const safeLambda =
    Number.isFinite(Number(lambda))
      ? Number(lambda)
      : 0.03;

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

  const phasePos =
    safeDiffSec % safeCycleSec;

  const phaseError =
    Math.min(
      phasePos,
      safeCycleSec - phasePos
    );

  const phaseScore =
    Math.max(
      0,
      Math.min(
        1,
        1 -
        (
          phaseError /
          (safeCycleSec / 2)
        )
      )
    );

  const cycleCount =
    Math.floor(
      safeDiffSec / safeCycleSec
    );

  const decay =
    Math.exp(
      -safeLambda * cycleCount
    );

  const finalPhaseScore =
    phaseScore * decay;

  return {
    cycleCount,
    phaseError,
    phaseScore,
    decay,
    finalPhaseScore
  };
}

/* =========================================================
 [2510] Phase Metrics:getPhaseWindowHalfWidthSec（旧 [6152a]）
========================================================= */
function getPhaseWindowHalfWidthSec(
  cycleSec,
  cycleCount,
  threshold,
  lambda
) {
  const decay =
    Math.exp(
      -Number(lambda) *
      Number(cycleCount)
    );

  const requiredPhaseScore =
    decay > 0
      ? Number(threshold) / decay
      : Infinity;

  if (
    !isFinite(requiredPhaseScore) ||
    requiredPhaseScore >= 1
  ) {
    return 0;
  }

  return Math.max(
    0,
    (1 - requiredPhaseScore) *
    (cycleSec / 2)
  );
}

/* =========================================================
 [2600] Statistics Utility:calcStats（旧 [5100]）
========================================================= */
function calcStats(
  list,
  total
) {

  const cnt =
    list.length;

  const percent =
    total
      ? Math.round(
          (cnt / total) * 100
        )
      : 0;

  const points =
    list.map(
      p => Number(
        p.point ?? 0
      )
    );

  const avg =
    cnt
      ? Math.round(
          points.reduce(
            (a, b) => a + b,
            0
          ) / cnt
        )
      : 0;

  const min =
    cnt
      ? Math.min(
          ...points
        )
      : 0;

  const max =
    cnt
      ? Math.max(
          ...points
        )
      : 0;

  return {
    cnt,
    percent,
    avg,
    min,
    max
  };
}


/* #################################################################
 [LAYER 3000] Domain Models / Normalizers
 ################################################################# */

/* =========================================================
 [3000] Rank Utility:getRankIndex（旧 [0100]）
========================================================= */
function getRankIndex(key) {
  return RANKS.findIndex(r => r.key === key);
}

/* =========================================================
 [3010] Rank Utility:getRankInfo（旧 [0110]）
========================================================= */
function getRankInfo(key) {
  return RANKS.find(r => r.key === key) || null;
}

/* =========================================================
 [3020] Rank Classification:getPrideBandKey（旧 [7000]）
========================================================= */
function getPrideBandKey(pridePoint) {

  const pt =
    Number(pridePoint ?? 0);

  if (pt <= 0) {
    return null;
  }

  const band =
    PRIDE_LEVELS.find(
      p =>
        pt >= p.min &&
        pt <= p.max
    );

  return band
    ? band.key
    : null;
}

/* =========================================================
 [3030] Rank Classification:getPlayerRankKey（旧 [7010]）
========================================================= */
function getPlayerRankKey(player) {

  if (
    player.onlineBattleRankId === RUBY_ID &&
    Number(player.starCnt) >= 1 &&
    Number(player.starCnt) <= 8
  ) {
    return `R${player.starCnt}`;
  }

  const prideBandKey =
    getPrideBandKey(
      player.pridePoint
    );

  if (prideBandKey) {
    return prideBandKey;
  }

  return null;
}

/* =========================================================
 [3040] Rank Classification:mapRankKeyToTierKey（旧 [7015]）
========================================================= */
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

/* =========================================================
 [3050] Player Identity:buildPlayerIdentityKey（旧 [7070]）
========================================================= */
function buildPlayerIdentityKey(player) {
  const name =
    normalizePlayerName(
      player?.name ?? ""
    );

  const shop =
    normalizePlayerName(
      player?.shopname ?? ""
    );

  const parts = [
    name,
    shop
  ].filter(Boolean);

  if (parts.length > 0) {
    return parts.join("@@");
  }

  return "__empty__";
}

/* =========================================================
 [3100] Joint Model Normalizer:normalizeJointModel（旧 [6800]）
========================================================= */
function normalizeJointModel(json) {

  const viewerTiers =
    json?.viewerTiers;

  if (
    !viewerTiers ||
    typeof viewerTiers !== "object"
  ) {
    return null;
  }

  const byViewerTier = {};
  const opponentTierSet = new Set();
  const areaSet = new Set();

  for (const viewerTier in viewerTiers) {

    const entry =
      viewerTiers[viewerTier];

    const opponents =
      entry?.opponents ?? {};

    const total =
      Object.values(opponents)
        .reduce(
          (a, c) => a + Number(c ?? 0),
          0
        ) || 1;

    const probList = [];

    for (const key in opponents) {

      /*
       * key = "<opponentTier>_<area>"
       * opponentTier は R1..R8 または PRIDE_A..PRIDE_G
       * （PRIDE_* はアンダースコアを含むため
       *   最後の "_" で area を切り分ける）
       */
      const lastSep =
        key.lastIndexOf("_");

      if (lastSep < 0) continue;

      const opponentTier =
        key.slice(0, lastSep);

      const area =
        key.slice(lastSep + 1);

      opponentTierSet.add(
        opponentTier
      );

      areaSet.add(
        area
      );

      const count =
        Number(opponents[key] ?? 0);

      probList.push({
        opponentTier,
        area,
        count,
        prob: count / total
      });
    }

    byViewerTier[viewerTier] = probList;
  }

  /*
   * 2026-09 joint_model 地域軸廃止対応:
   * area="ALL" を含むモデルでは ALL を
   * ワイルドカードとして扱うため、
   * 実際のマッチング粒度は opponentTier のみ。
   * この場合に地域数を掛けると support が
   * 過大評価され backoff スコアが実態より
   * 小さくなりすぎる。
   * 旧地域別モデル（ALL を含まない）では
   * 従来通り opponentTier × area の
   * 組み合わせ数を supportSize とする。
   */
  const usesAreaWildcard =
    areaSet.has("ALL");

  const historicalSupportSize =
    usesAreaWildcard
      ? opponentTierSet.size
      : opponentTierSet.size *
        areaSet.size;

  return {
    byViewerTier,
    usesAreaWildcard,
    historicalOpponentTierCount:
      opponentTierSet.size,
    historicalAreaCount:
      areaSet.size,
    historicalSupportSize
  };
}

/* =========================================================
 [3200] Data Applier:applyAreaListJson【State】（旧 [3120]）
========================================================= */
function applyAreaListJson(json) {

  AreaList = {};

  if (
    json?.areas &&
    Array.isArray(json.areas)
  ) {

    json.areas.forEach(a => {

      AreaList[
        String(a.area)
      ] = a.areaName;

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
 [3230] Data Applier:applyJointModelJson【State】（旧 [3420]）
========================================================= */
function applyJointModelJson(
  json
) {

  State.jointModel =
    normalizeJointModel(
      json
    );

  log(
    "joint_model.json 読み込み完了"
  );
}

/* =========================================================
 [3240] Data Applier:applyScoringConfigJson【State】（旧 [3520]）
========================================================= */
function applyScoringConfigJson(
  json
) {

  State.scoringConfig = json;

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

  const {
    resetReloadButton = true
  } = options;

  State.generatedAt =
    json?.generatedAt ?? "";

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
        AreaList[
          String(p.area)
        ] || ""
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
 [LAYER 4000] Persistence（localStorage / IndexedDB）
 ################################################################# */

/* =========================================================
 [4000] Daily State Cleanup:checkAndCleanDailyState【State】（旧 [7070b]）
========================================================= */
function checkAndCleanDailyState() {
  const today = buildDailyKey();
  let cleaned = false;
  if (State.pinkTargets && typeof State.pinkTargets === "object") {
    for (const [key, entry] of Object.entries(State.pinkTargets)) {
      if (entry && entry.dailyKey !== today) {
        delete State.pinkTargets[key];
        cleaned = true;
      }
    }
  }
  if (cleaned) {
    if (typeof log === "function") {
      log("日付変更を検知：前日のPink管理ターゲットを自動クリーンアップしました");
    }
  }
}

/* =========================================================
 [4010] Daily State Cleanup:isPinkTargetStale（旧 [7073b]）
========================================================= */
function isPinkTargetStale(entry) {

  if (!entry) {
    return true;
  }

  const today =
    buildDailyKey();

  if (!entry.dailyKey) {
    return false;
  }

  return entry.dailyKey !== today;
}

/* =========================================================
 [4100] Learning State Storage:savePinkStateToStorage【State】【永続化】（旧 [7071]）
========================================================= */
function savePinkStateToStorage() {
  try {
    checkAndCleanDailyState();
    const payload = {
      /*
       * Pink対象は当日分のみ復元対象とする
       * （dailyKeyで翌日以降は自動失効）
       */
      pinkTargets:
        State.pinkTargets || {},

      encounterHistory:
        State.encounterHistory || {},

      phaseAdjust:
        State.phaseAdjust || {
          yellow: 0,
          pink: 0
        },

      /*
       * Yellow周期学習用サンプル
       */
      yellowSamples:
        State.yellowSamples || [],

      savedAt:
        Date.now()
    };

    localStorage.setItem(
      PERSIST_STATE_KEY,
      JSON.stringify(payload)
    );

  } catch (e) {

    console.warn(
      "[persist] save failed",
      e
    );

  }
}

/* =========================================================
 [4110] Learning State Storage:restorePinkStateFromStorage【State】【永続化】（旧 [7072]）
========================================================= */
function restorePinkStateFromStorage() {
  try {

    const raw =
      localStorage.getItem(
        PERSIST_STATE_KEY
      );

    if (!raw) {
      return;
    }

    const parsed =
      JSON.parse(raw);

    /*
     * Pink対象復元
     * 当日分（dailyKey一致）のみ有効とし、
     * 前日以前のエントリは復元時に除外する。
     */
    State.pinkTargets = {};

    if (
      parsed?.pinkTargets &&
      typeof parsed.pinkTargets ===
        "object"
    ) {

      const today =
        buildDailyKey();

      for (
        const [key, entry]
          of Object.entries(parsed.pinkTargets)
      ) {

        if (
          entry &&
          entry.dailyKey === today
        ) {
          State.pinkTargets[key] = entry;
        }

      }

    }

    if (
      parsed?.encounterHistory &&
      typeof parsed.encounterHistory ===
        "object"
    ) {

      State.encounterHistory =
        parsed.encounterHistory;

    }

    if (
      parsed?.phaseAdjust &&
      typeof parsed.phaseAdjust ===
        "object"
    ) {

      State.phaseAdjust = {
        yellow:
          Number(
            parsed.phaseAdjust.yellow ??
            State.phaseAdjust.yellow ??
            0
          ),

        pink:
          Number(
            parsed.phaseAdjust.pink ??
            State.phaseAdjust.pink ??
            0
          )
      };

    }

    /*
     * Yellow周期学習サンプル復元
     */
    if (
      Array.isArray(
        parsed?.yellowSamples
      )
    ) {

      State.yellowSamples =
        parsed.yellowSamples;

    }

  } catch (e) {

    console.warn(
      "[persist] restore failed",
      e
    );

  }
}

/* =========================================================
 [4200] Realtime Activity Storage:saveRealtimeActivityToStorage【State】【永続化】（旧 [7140] 内）
========================================================= */
function saveRealtimeActivityToStorage() {

  try {

    localStorage.setItem(
      REALTIME_ACTIVITY_STORAGE_KEY,
      JSON.stringify({
        playerActivity:
          State.playerActivity,
        rankActivity:
          State.rankActivity,
        viewerLastCopiedAt:
          State.viewerLastCopiedAt
      })
    );

  } catch (e) {
    /* storage unavailable: ignore */
  }
}

/* =========================================================
 [4210] Realtime Activity Storage:restoreRealtimeActivityFromStorage【State】【永続化】（旧 [7140] 内）
========================================================= */
function restoreRealtimeActivityFromStorage() {

  try {

    const raw =
      localStorage.getItem(
        REALTIME_ACTIVITY_STORAGE_KEY
      );

    if (!raw) return;

    const parsed =
      JSON.parse(raw);

    State.playerActivity =
      parsed?.playerActivity || {};

    State.rankActivity =
      parsed?.rankActivity || {};

    if (parsed?.viewerLastCopiedAt) {
      State.viewerLastCopiedAt =
        parsed.viewerLastCopiedAt;
    }

  } catch (e) {
    /* storage unavailable or corrupt: ignore */
  }
}

/* =========================================================
 [4300] Stored Array Helpers:pushStoredRecord【永続化】（旧 [9100]）
========================================================= */
function pushStoredRecord(
  key,
  record,
  limit = 200,
  daily = false
) {

  let finalKey =
    key;

  if (daily) {

    const dk =
      record.dk ||
      buildDailyKey();

    finalKey =
      key + dk;
  }

  const arr =
    readStoredArraySafe(
      finalKey
    );

  arr.unshift(
    record
  );

  const trimmed =
    arr.slice(
      0,
      limit
    );

  writeStoredArraySafe(
    finalKey,
    trimmed
  );
}

/* =========================================================
 [4310] Stored Array Helpers:readStoredArraySafe【永続化】（旧 [9120]）
========================================================= */
function readStoredArraySafe(
  key
) {

  try {

    const raw =
      localStorage.getItem(
        key
      );

    if (!raw) {
      return [];
    }

    const parsed =
      JSON.parse(raw);

    return Array.isArray(
      parsed
    )
      ? parsed
      : [];

  } catch (e) {

    console.warn(
      "readStoredArraySafe error:",
      key,
      e
    );

    return [];
  }
}

/* =========================================================
 [4320] Stored Array Helpers:writeStoredArraySafe【永続化】（旧 [9130]）
========================================================= */
function writeStoredArraySafe(
  key,
  arr
) {

  try {

    localStorage.setItem(
      key,
      JSON.stringify(arr)
    );

  } catch (e) {

    console.error(
      "writeStoredArraySafe error:",
      key,
      e
    );
  }
}

/* =========================================================
 [4400] IndexedDB Core:initLogDB【永続化】（旧 [9700]）
========================================================= */
function initLogDB() {

  return new Promise(
    (resolve, reject) => {

      const req =
        indexedDB.open(
          LOG_DB_NAME,
          LOG_DB_VERSION
        );

      req.onupgradeneeded =
        (e) => {

          const db =
            e.target.result;

          if (
            !db.objectStoreNames.contains(
              LOG_STORE.events
            )
          ) {

            db.createObjectStore(
              LOG_STORE.events,
              {
                keyPath: "id",
                autoIncrement: true
              }
            );

          }

          if (
            !db.objectStoreNames.contains(
              LOG_STORE.copyEvents
            )
          ) {

            db.createObjectStore(
              LOG_STORE.copyEvents,
              {
                keyPath: "id",
                autoIncrement: true
              }
            );

          }

          if (
            !db.objectStoreNames.contains(
              LOG_STORE.cycleEvents
            )
          ) {

            db.createObjectStore(
              LOG_STORE.cycleEvents,
              {
                keyPath: "id",
                autoIncrement: true
              }
            );

          }

          if (
            !db.objectStoreNames.contains(
              LOG_STORE.candidateEvents
            )
          ) {

            db.createObjectStore(
              LOG_STORE.candidateEvents,
              {
                keyPath: "id"
              }
            );

          }

        };

      req.onsuccess =
        (e) => {

          logDB =
            e.target.result;

          console.log(
            "[LOG] IndexedDB ready"
          );

          resolve();

        };

      req.onerror =
        (e) => {

          console.error(
            "[LOG] DB init failed",
            e
          );

          reject(e);

        };

    }
  );

}

/* =========================================================
 [4410] IndexedDB Core:putLog【永続化】（旧 [9710]）
========================================================= */
function putLog(
  storeName,
  data
) {

  if (!logDB) {
    return;
  }

  const tx =
    logDB.transaction(
      storeName,
      "readwrite"
    );

  const store =
    tx.objectStore(
      storeName
    );

  store.put(data);
}

/* =========================================================
 [4420] IndexedDB Core:logEvent【永続化】（旧 [9720]）
========================================================= */
function logEvent(
  type,
  payload = {}
) {

  if (!logDB) {
    return;
  }

  const record = {

    t:
      Date.now(),

    e:
      type,

    ...(payload || {})

  };

  if (
    type === "pink-trigger"
  ) {

    putLog(
      LOG_STORE.events,
      record
    );

    return;

  }

  if (
    type === "copy" ||
    type === "top"
  ) {

    putLog(
      LOG_STORE.copyEvents,
      record
    );

    return;

  }

  if (
    type === "candidate"
  ) {

    putLog(
      LOG_STORE.candidateEvents,
      record
    );

    return;

  }

  putLog(
    LOG_STORE.events,
    record
  );

}


/* #################################################################
 [LAYER 5000] Data Access / Fetch
 ################################################################# */

/* =========================================================
 [5000] Fetch Core:fetchJSON（旧 [3000]）
========================================================= */
async function fetchJSON(
  path,
  options = {}
) {

  const {
    cache = "no-store"
  } = options;

  const MAX_RETRY = 3;

  // タイムアウト値の設定
  // 注: Viewer 運用環境のネットワークが不安定（WiFi 途切れ頻発）
  // かつ SEGA データが 15 分ごと更新という制約を考慮
  // DNS 解決 1-2秒 + 接続確立 1-2秒 + ファイル取得を考慮した時間設定
  const TIMEOUT_MS =
    path === 'latest_update.json'
      ? 8000    // 1KB 程度のファイル（ただしネットワーク遅延を想定）
      : path === 'integrated_data.json'
      ? 20000   // 複数 MB の大きいファイル
      : 10000;  // その他（標準）

  let lastError = null;

  for (
    let attempt = 1;
    attempt <= MAX_RETRY;
    attempt++
  ) {

    const controller =
      new AbortController();

    const timeoutTimer =
      setTimeout(() => {
        controller.abort();
      }, TIMEOUT_MS);

    const startedAt =
      performance.now();

    try {

      const res = await fetch(
        `${BASE_URL}/${path}?t=${Date.now()}`,
        {
          cache,
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          },
          signal: controller.signal
        }
      );

      clearTimeout(timeoutTimer);

      if (!res.ok) {
        throw new Error(
          "HTTP " + res.status
        );
      }

      const json =
        await res.json();

      const elapsed =
        Math.round(
          performance.now() -
          startedAt
        );

      if (
        path !==
          "latest_update.json" ||
        elapsed >= 1000
      ) {
        log(
          `${path} 通信時間:${elapsed}ms`
        );
      }

      return json;

    } catch (e) {

      clearTimeout(timeoutTimer);

      lastError = e;

      if (
        e.name === "AbortError"
      ) {
        logWarn(
          `${path} Timeout (${TIMEOUT_MS}ms)`
        );
      }

      if (
        attempt < MAX_RETRY
      ) {
        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              attempt * 1000
            )
        );
      }
    }
  }

  throw lastError;
}

/* =========================================================
 [5100] Endpoint Fetcher:fetchAreaListJson（旧 [3110]）
========================================================= */
async function fetchAreaListJson() {
  return fetchJSON(
    "areaList.json"
  );
}

/* =========================================================
 [5110] Endpoint Fetcher:fetchLatestRoundJson（旧 [3210]）
========================================================= */
async function fetchLatestRoundJson() {

  return fetchJSON(
    "latest_round.json"
  );
}

/* =========================================================
 [5120] Endpoint Fetcher:fetchLatestUpdateJson（旧 [3310]）
========================================================= */
async function fetchLatestUpdateJson() {

  return fetchJSON(
    "latest_update.json"
  );
}

/* =========================================================
 [5130] Endpoint Fetcher:fetchJointModelJson（旧 [3410]）
========================================================= */
async function fetchJointModelJson() {

  return fetchJSON(
    "joint_model.json"
  );
}

/* =========================================================
 [5140] Endpoint Fetcher:fetchScoringConfigJson（旧 [3510]）
========================================================= */
async function fetchScoringConfigJson() {

  return fetchJSON(
    "scoring_config.json"
  );
}

/* =========================================================
 [5150] Endpoint Fetcher:fetchRoundDataJson（旧 [3600]）
========================================================= */
async function fetchRoundDataJson() {

  return fetchJSON(
    "integrated_data.json"
  );
}

/* =========================================================
 [5200] Data Loader:loadAreaList【State】（旧 [3100]）
========================================================= */
let AreaList = {};

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
 [5230] Data Loader:loadJointModel【State】（旧 [3400]）
========================================================= */
async function loadJointModel() {

  log(
    "joint_model.json 取得準備中"
  );

  try {

    const json =
      await fetchJointModelJson();

    applyJointModelJson(
      json
    );

  } catch (e) {

    State.jointModel = null;

    logWarn(
      "joint_model.json 未取得：" +
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

        State.prefetchedRoundData =
          json;

        State.prefetchedForUpdateAt =
          lastUpdatedValue;

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

    /* =====================================
     * Prefetch利用
     * ===================================== */

    if (
      State.prefetchedRoundData
    ) {

      log(
        "Reload 利用元:Prefetch"
      );

      applyRoundDataJson(
        State.prefetchedRoundData,
        {
          resetReloadButton: true
        }
      );

      State.prefetchedRoundData =
        null;

      State.prefetchedForUpdateAt =
        "";

    } else {

      /* =====================================
       * Fallback取得
       * ===================================== */

      log(
        "Reload 利用元:Fallback"
      );

      try {
          const roundDataJson = await fetchRoundDataJson();
          applyRoundDataJson(roundDataJson, { resetReloadButton: true });
          } catch (err) {
          logError("integrated_data.json の取得に失敗：" + err.message);
          State.all = [];
          State.filtered = [];
          }
    }

    /* =====================================
     * 再集計
     * ===================================== */

    applyFilters();

    buildSummary();

    renderSummary();

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

  } finally {

    stopProgress();
  }
}

/* =========================================================
 [5400] Update Watch:checkUpdate【State】【DOM】（旧 [3800]）
========================================================= */
async function checkUpdate() {

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

    State.latestUpdateAt =
      latest;

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

      /* =====================================
       * 先読み開始
       * ===================================== */

      // prefetch が実行中でなければ開始
      if (
        !State.prefetchInFlight ||
        State.prefetchInFlight.status === "fulfilled"
      ) {
        prefetchLatestRoundData(
          latest
        );
      } else {
        logWarn(
          "Prefetch already in flight, skipping duplicate"
        );
      }
    }

  } catch (e) {

    logError(
      "latest_update.json の取得に失敗：" +
      e.message
    );

  }
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

  log(
    "✓ 更新監視開始(30秒間隔) - latest_update.json は常にチェック"
  );

  checkUpdate();

  State.updateWatchTimer =
    setInterval(
      () => {

        checkUpdate();

      },
      30000
    );
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
      calcPinkCycle(null, { learn: true });
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
  const maxAllowableDiffSec = 45 * 60;
  if (diffSec > maxAllowableDiffSec) {
    return null;
  }

  /*
   * Yellow基準周期
   *
   * 現在の学習処理は
   * 345±45秒を前提としているため
   * 保存時も345秒基準で折り畳み
   */
  const baseCycleSec = 345;

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
    calcYellowCycle(null, { learn: true });
    savePinkStateToStorage();
  } catch (e) {
    console.warn("[yellow] calcYellowCycle failed:", e);
  }

  return sample;
}

/* =========================================================
 [6300] Realtime Boost:recordRealtimeActivity【State】【永続化】（旧 [7105] 内）
========================================================= */
function recordRealtimeActivity(
  player,
  rankKey,
  timestamp
) {

  if (!player) return;

  const now =
    Number(timestamp) ||
    Date.now();

  const playerId =
    normalizePlayerName(
      player.name ?? ""
    );

  if (playerId) {

    const prev =
      State.playerActivity[
        playerId
      ] || { count: 0 };

    State.playerActivity[
      playerId
    ] = {
      count:
        Number(prev.count ?? 0) + 1,
      lastSeen: now
    };
  }

  const rk =
    String(rankKey ?? "");

  if (rk) {

    const prev =
      State.rankActivity[rk] ||
      { count: 0 };

    State.rankActivity[rk] = {
      count:
        Number(prev.count ?? 0) + 1,
      lastSeen: now
    };
  }

  saveRealtimeActivityToStorage();
}

/* =========================================================
 [6310] Realtime Boost:getBoostDecayHalfLifeSec（旧 [7105] 内）
========================================================= */
function getBoostDecayHalfLifeSec() {

  return Number(
    State.scoringConfig
      ?.realtimeBoost
      ?.decaySec ?? 3600
  );
}

/* =========================================================
 [6320] Realtime Boost:computeBoostValue（旧 [7105] 内）
========================================================= */
function computeBoostValue(
  entry,
  nowMs = Date.now()
) {

  if (!entry) {
    return 1.0;
  }

  const count =
    Number(entry.count ?? 0);

  const lastSeen =
    Number(entry.lastSeen ?? 0);

  if (
    !count ||
    !lastSeen ||
    !isFinite(lastSeen)
  ) {
    return 1.0;
  }

  const deltaSec =
    (nowMs - lastSeen) / 1000;

  if (
    !isFinite(deltaSec) ||
    deltaSec < 0
  ) {
    return 1.0;
  }

  const T =
    getBoostDecayHalfLifeSec();

  const magnitude =
    1 + Math.log(1 + count);

  const decay =
    Math.exp(-deltaSec / T);

  return magnitude * decay;
}

/* =========================================================
 [6330] Realtime Boost:getPlayerBoost【State】（旧 [7110]）
========================================================= */
function getPlayerBoost(player) {

  if (!player) return 1.0;

  const playerId =
    normalizePlayerName(
      player.name ?? ""
    );

  return computeBoostValue(
    State.playerActivity[
      playerId
    ]
  );
}

/* =========================================================
 [6340] Realtime Boost:getRankBoost【State】（旧 [7120]）
========================================================= */
function getRankBoost(rankKey) {

  return computeBoostValue(
    State.rankActivity[
      String(rankKey ?? "")
    ]
  );
}

/*
 * 【2026-09 削除】getAreaBoost は廃止した。
 * Pink管理対象の母数が少なく areaActivity が playerActivity の
 * 劣化コピーになり、realtimeBoost が二乗効果で歪む問題があったため。
 * State.areaActivity の記録・永続化処理もあわせて削除した。
 */

/* =========================================================
 [6400] Recent Clicks:rebuildRecentClickIndex【State】（旧 [7105] 内）
========================================================= */
function rebuildRecentClickIndex() {
 const index = {
   byName: new Map(),
   byNameArea: new Map(),
   byNameRank: new Map()
 };

 for (const r of State.recentClicks) {
   if (!r) {
     continue;
   }

   const key =
     normalizePlayerName(
       r.name ?? ""
     );

   if (!key) {
     continue;
   }

   const byName =
     index.byName.get(key) || [];
   byName.push(r);
   index.byName.set(key, byName);

   const areaKey =
     `${key}@@${String(r.area ?? "")}`;
   const byArea =
     index.byNameArea.get(areaKey) || [];
   byArea.push(r);
   index.byNameArea.set(areaKey, byArea);

   const rankKey =
     `${key}@@${String(r.rankKey ?? "")}`;
   const byRank =
     index.byNameRank.get(rankKey) || [];
   byRank.push(r);
   index.byNameRank.set(rankKey, byRank);
 }

 State.recentClickIndex = index;
}

/* =========================================================
 [6410] Recent Clicks:hasSamePlayerRecentClick【State】（旧 [7500] 内）
========================================================= */
function hasSamePlayerRecentClick(player) {

  if (!player || !State.recentClicks.length) {
   return false;
  }

  const targetName =
   normalizePlayerName(player.name);

  const targetUpdateDate =
   String(player.updateDate ?? "");

  return State.recentClicks.some(r => {

   if (
     normalizePlayerName(r.name) !==
     targetName
   ) {
     return false;
   }

   return String(r.updateDate ?? "") ===
     targetUpdateDate;
   });
}


/* #################################################################
 [LAYER 7000] Phase Calculation
 ################################################################# */

/* =========================================================
 [7000] Cycle Learning:calcYellowCycle【State】（旧 [7220]）
========================================================= */
function calcYellowCycle(player, opts = {}) {

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
        return foldToCycle(
          diffSec,
          base
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
   * 中央値算出
   */
  const mid =
    Math.floor(
      values.length / 2
    );

  const median =
    (values.length % 2)
      ? values[mid]
      : (
          values[mid - 1] +
          values[mid]
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
   * サンプルが十分（minSamples以上）
   * であれば信頼度1.0（そのまま採用）。
   */
  const minSamples =
    cfg.minSamples ?? 8;

  const trust =
    minSamples > 0
      ? Math.min(
          1,
          values.length / minSamples
        )
      : 1;

  const clamped =
    clampedRaw * trust;

  State.phaseAdjust.yellow =
    clamped;

  return base + clamped;
}

/* =========================================================
 [7010] Cycle Learning:calcPinkCycle【State】（旧 [7230]）
========================================================= */
function calcPinkCycle(
  player,
  opts = {}
) {

  const learn =
    Boolean(opts.learn);

  const cfg =
    State.scoringConfig
      ?.phase?.pink || {};

  const base =
    cfg.baseCycleSec || 345;

  const maxShift =
    cfg.maxShiftSec || 45;

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
        foldedList.push(folded);
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

  const mid =
    Math.floor(
      values.length / 2
    );

  const median =
    (values.length % 2)
      ? values[mid]
      : (
          values[mid - 1] +
          values[mid]
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
      cfg.alpha || 0.3
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
   */
  const minSamples =
    cfg.minSamples ?? 8;

  const trust =
    minSamples > 0
      ? Math.min(
          1,
          foldedList.length / minSamples
        )
      : 1;

  const clamped =
    clampedRaw * trust;

  State.phaseAdjust.pink =
    clamped;

  return base + clamped;
}

/* =========================================================
 [7020] Cycle Learning:getCurrentCycle【State】（旧 [7210]）
========================================================= */
function getCurrentCycle(
  player
) {

  return isCopiedPlayer(player)
    ? calcPinkCycle(player)
    : calcYellowCycle(player);
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

 const lambda =
   Number(
     State.scoringConfig
       ?.phaseError
       ?.pinkLambda ?? 0.03
   );

 const metrics =
   computePhaseMetrics(
     diffSec,
     cycleSec,
     lambda
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
 [7205] Phase Detail:buildPlayerPhaseDetailText【State】
========================================================= */
function buildPlayerPhaseDetailText(
 player,
 nowMs = Date.now()
) {
 if (!player) {
   return "Phase：計算できません";
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
   return "Phase：周期を計算できません";
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
   return `Phase（${isPink ? "Pink" : "Yellow"}）：基準時刻を取得できません`;
 }

 const diffSec =
   (nowMs - anchorMs) / 1000;

 if (diffSec < 0) {
   return `Phase（${isPink ? "Pink" : "Yellow"}）：基準時刻が現在時刻より後です`;
 }

 const lambda =
   Number(
     State.scoringConfig
       ?.phaseError?.[
         isPink
           ? "pinkLambda"
           : "yellowLambda"
       ] ?? 0.03
   );

 const metrics =
   computePhaseMetrics(
     diffSec,
     cycleSec,
     lambda
   );

 return `Phase（${mode === "pink" ? "Pink" : "Yellow"}）：周期=${cycleSec.toFixed(1)}秒　${metrics.cycleCount}サイクル／誤差±${Math.round(metrics.phaseError)}秒`;
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

  const lambda =
    Number(
      State.scoringConfig
        ?.phaseError
        ?.yellowLambda ?? 0.03
    );

  return computePhaseMetrics(
    diffSec,
    cycleSec,
    lambda
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
function computePhaseContext(player, nowMs = Date.now()) {
  const isPinkManaged = isCopiedPlayer(player);
  let metrics = null;
  let cycleSec = 0;

  if (isPinkManaged) {
   metrics = computePhaseSignal(player, "pink", nowMs);
   cycleSec = Number(metrics?.cycleSec ?? 0);
  } else {
   const anchor =
     parseDateJST(player?.updateDate)?.getTime();
   cycleSec =
     getCurrentCycle(player);
   const lambda =
     Number(
       State.scoringConfig
         ?.phaseError
         ?.yellowLambda ?? 0.03
     );

   metrics =
     anchor && cycleSec
       ? computePhaseMetrics(
          (nowMs - anchor) / 1000,
           cycleSec,
           lambda
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

  return {
   isPinkManaged,
   isPinkPhase,
   isYellowPhase,
   cycleCount: Number(metrics?.cycleCount ?? 0),
   cycleSec,
   phaseError,
   phaseScore,
   decay,
   finalPhaseScore,
   yellowThreshold,
   pinkThreshold,
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
      computePhaseSignal(player, "pink");

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

/* #################################################################
 [LAYER 8000] Matching Calculation
 ################################################################# */

/* =========================================================
 [8005] Historical Score:Adjacent Tier Pooling【State】
========================================================= */
const HISTORICAL_RELIABILITY_K = 100;

function getHistoricalDistribution(
  viewerTier
) {

  const probList =
    State.jointModel?.byViewerTier?.[
      viewerTier
    ] ?? [];

  const total =
    probList.reduce(
      (sum, item) =>
        sum + Number(item.count ?? 0),
      0
    );

  return {
    probList,
    total
  };
}

function getDistributionCellScore(
  distribution,
  opponentTier,
  area,
  supportSize
) {

  /*
   * area === "ALL" のセルは「地域を区別しない集計」であることを示す
   * ワイルドカードとして扱う（2026-09 joint_model地域軸廃止対応）。
   * 実際の候補地域(area)がどの都道府県コードであっても一致とみなす。
   */
  const hit =
    distribution.probList.find(
      item =>
        item.opponentTier ===
          String(opponentTier) &&
        (
          item.area === "ALL" ||
          item.area === String(area)
        )
    );

  const backoffScore =
    distribution.total > 0 &&
    supportSize > 0
      ? 1 / (
          distribution.total +
          supportSize
        )
      : 0.0001;

  return {
    score: hit
      ? hit.prob
      : backoffScore,
    matched: Boolean(hit)
  };
}

function getAdjacentTierDistribution(
  viewerTier
) {

  if (!/^R[1-8]$/.test(viewerTier)) {
    return null;
  }

  const currentRank =
    Number(viewerTier.slice(1));

  const availableRanks =
    Object.keys(
      State.jointModel?.byViewerTier ?? {}
    )
      .filter(
        tier => /^R[1-8]$/.test(tier)
      )
      .map(
        tier => Number(tier.slice(1))
      )
      .filter(
        rank => rank !== currentRank
      );

  const lowerRanks =
    availableRanks.filter(
      rank => rank < currentRank
    );

  const higherRanks =
    availableRanks.filter(
      rank => rank > currentRank
    );

  const adjacentRanks = [
    lowerRanks.length
      ? Math.max(...lowerRanks)
      : null,
    higherRanks.length
      ? Math.min(...higherRanks)
      : null
  ].filter(
    Number.isFinite
  );

  const distributions =
    adjacentRanks.map(
      rank => ({
        viewerTier: `R${rank}`,
        ...getHistoricalDistribution(
          `R${rank}`
        )
      })
    )
      .filter(
        distribution =>
          distribution.total > 0
      );

  const total =
    distributions.reduce(
      (sum, distribution) =>
        sum + distribution.total,
      0
    );

  return total > 0
    ? {
        distributions,
        total
      }
    : null;
}

/* =========================================================
 [8010] Historical Score:getHistoricalScoreDetail【State】（旧 [6810] 内）
========================================================= */
function getHistoricalScoreDetail(
  viewerRankKey,
  opponentRankKey,
  area
) {

  if (
    !viewerRankKey ||
    !State.jointModel
  ) {
    return {
      score: 1.0,
      matched: false,
      backoff: false,
      viewerTier: null,
      opponentTier: null
    };
  }

  const viewerTier =
    mapRankKeyToTierKey(viewerRankKey);

  const opponentTier =
    mapRankKeyToTierKey(opponentRankKey);

  const ownDistribution =
    getHistoricalDistribution(
      viewerTier
    );

  const adjacentDistribution =
    getAdjacentTierDistribution(
      viewerTier
    );

  if (
    ownDistribution.total <= 0 &&
    !adjacentDistribution
  ) {
    return {
      score: 1.0,
      matched: false,
      backoff: false,
      viewerTier,
      opponentTier
    };
  }

  const supportSize =
    Number(
      State.jointModel.historicalSupportSize ?? 0
    );

  const ownCell =
    ownDistribution.total > 0
      ? getDistributionCellScore(
          ownDistribution,
          opponentTier,
          area,
          supportSize
        )
      : null;

  const adjacentCells =
    adjacentDistribution?.distributions.map(
      distribution => ({
        viewerTier:
          distribution.viewerTier,
        total:
          distribution.total,
        ...getDistributionCellScore(
          distribution,
          opponentTier,
          area,
          supportSize
        )
      })
    ) ?? [];

  const adjacentScore =
    adjacentDistribution
      ? adjacentCells.reduce(
          (sum, cell) =>
            sum +
            cell.score *
            cell.total /
            adjacentDistribution.total,
          0
        )
      : 0;

  const adjacentMatched =
    adjacentCells.some(
      cell => cell.matched
    );

  const ownReliability =
    ownDistribution.total > 0
      ? ownDistribution.total /
        (
          ownDistribution.total +
          HISTORICAL_RELIABILITY_K
        )
      : 0;

  const score =
    adjacentDistribution
      ? ownCell
        ? ownCell.score *
            ownReliability +
          adjacentScore *
            (1 - ownReliability)
        : adjacentScore
      : ownCell?.score ?? 1.0;

  return {
    score,
    matched:
      Boolean(ownCell?.matched) ||
      adjacentMatched,
    backoff:
      !ownCell?.matched &&
      !adjacentMatched,
    ownReliability,
    ownSampleCount:
      ownDistribution.total,
    adjacentSampleCount:
      adjacentDistribution?.total ?? 0,
    adjacentViewerTiers:
      adjacentCells.map(
        cell => cell.viewerTier
      ),
    viewerTier,
    opponentTier
  };
}

/* =========================================================
 [8210] Matching Score:calcMatchingScoreDetail【State】（旧 [7410]）
========================================================= */
function calcMatchingScoreDetail(
    player
) {
    if (!player || !player.updateDate) {
        return { score: 0 };
    }

    const phaseCtx =
        computePhaseContext(player);

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
            player.area
        );

    const historicalScore =
        historical.score;

    const isPinkManaged =
        Boolean(phaseCtx?.isPinkManaged);

    /*
     * 【2026-09 realtimeBoost是正】
     * 以前は areaBoost (player.area 単位の直近活動カウント) も
     * 掛け合わせていたが、Pink管理対象の母数が少ないため
     * areaActivity の実体がほぼ playerActivity と同一になり、
     * 「個人の活動シグナル」を実質二乗で効かせてしまう歪みが
     * 生じていた（実地ログ検証で67件中62件が同値と確認）。
     * そのためエリア単位のリアルタイムブーストは廃止する。
     */
    const playerBoost =
        isPinkManaged
            ? getPlayerBoost(player)
            : 1.0;

    const rankBoost =
        isPinkManaged
            ? getRankBoost(rankKey)
            : 1.0;

    const realtimeBoost =
        playerBoost *
        rankBoost;

    const effectivePhaseScore =
        finalPhaseScore;

    const rawScore =
        historicalScore *
        playerBoost *
        rankBoost *
        effectivePhaseScore;

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
        viewerTier: historical.viewerTier,
        opponentTier: historical.opponentTier,
        area: String(player.area ?? ""),
        isPinkManaged,
        playerBoost,
        rankBoost,
        realtimeBoost,

        phaseError: phaseCtx?.phaseError ?? 0,
        phaseScore: phaseCtx?.phaseScore ?? 0,
        cycleCount: phaseCtx?.cycleCount ?? 0,
        cycleSec: phaseCtx?.cycleSec ?? 0,
        decay: phaseCtx?.decay ?? 0,
        finalPhaseScore,
        effectivePhaseScore,
        phaseWeight: effectivePhaseScore,
        isYellow: Boolean(phaseCtx?.isYellowPhase),
        isPink: Boolean(phaseCtx?.isPinkPhase),
        yellowThreshold: phaseCtx?.yellowThreshold ?? 0,
        pinkThreshold: phaseCtx?.pinkThreshold ?? 0
    };
}

/* =========================================================
 [8230] Candidate Score:buildCandidateScore（旧 [6900]）
========================================================= */
function buildCandidateScore(
    player
) {
    const detail =
        calcMatchingScoreDetail(
            player
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
 [8300] Candidate Selection:getCandidateSelectionScore（旧 [7600]）
========================================================= */
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

/* =========================================================
 [8310] Candidate Builder:buildMatchingCandidates【State】【DOM】（旧 [7700]）
========================================================= */
function buildMatchingCandidates() {

  const selectedStars =
    readSelectedStars();

  const selectedPrides =
    readSelectedPrides();

  const base =
    State.filtered;

  /* =====================================
   * STEP3〜6: HistoricalScore / RealtimeBoost
   * / PhaseScore を合成したスコア計算
   * ===================================== */
  const scoredAll =
    base.map(p =>
      buildCandidateScore(
        p
      )
    );

  /* =====================================
   * UIフィルタ
   * ===================================== */
  const filteredByUi =
    scoredAll.filter(p => {

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
   * Pink管理対象について初回1サイクルは除外する。
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
          )
        );

      /*
       * Pink管理対象は初回1サイクルは除外
       */
      if (
        phase.isInitialCooldown
      ) {
        return false;
      }

      return true;

    });

  const scoreEligible =
    afterCooldown.filter(
      p => getCandidateSelectionScore(p) > 0
    );

  State.matchingRankedAll =
    [...scoreEligible].sort(
      (a, b) =>
        getCandidateSelectionScore(b) -
        getCandidateSelectionScore(a)
    );

  State.matchingRankedAll.forEach(
    (p, i) => {
      p.__scoreRank = i + 1;
    }
  );

  /* =====================================
   * STEP7: Score順に並べる
   * STEP8: 上位10人を表示
   *
   * 二段階選出（Phase救済枠）
   * ------------------------------------
   * 通常スコア順だけでは、FinalPhaseScore
   * （周期ピーク近傍＝的中確度が高い状態）
   * が高くても、HistoricalScoreが低いために
   * Top10圏外へ落ちる相手が発生する
   * （例：phaseError極小でも29位落選）。
   *
   * このため、通常スコア上位
   * NORMAL_SLOT_COUNT人を確保したうえで、
   * 残り枠 PHASE_RESCUE_SLOT_COUNT人分は、
   * 通常選出から漏れた候補のうち
   * FinalPhaseScoreが高い順に追加する。
   *
   * 2枠は原則として既知の履歴セルと未観測セルに1枠ずつ
   * 配分し、履歴データが疎なランク帯・地域も完全には
   * 排除しない。片方が空なら他方で補完する。
   * ===================================== */
  const NORMAL_SLOT_COUNT = 8;
  const PHASE_RESCUE_SLOT_COUNT = 2;
  const MATCHED_RESCUE_SLOT_COUNT = 1;
  const BACKOFF_RESCUE_SLOT_COUNT = 1;

  const rankedByScore =
    [...scoreEligible].sort(
      (a, b) =>
        getCandidateSelectionScore(b) -
        getCandidateSelectionScore(a)
    );

  const normalSelected =
    rankedByScore.slice(
      0,
      NORMAL_SLOT_COUNT
    );

  const normalSelectedKeys =
    new Set(
      normalSelected.map(
        p =>
          normalizePlayerName(p.name) +
          "|" +
          normalizePlayerName(p.shopname ?? "")
      )
    );

  const phaseRescuePool =
    rankedByScore.filter(p => {

      const key =
        normalizePlayerName(p.name) +
        "|" +
        normalizePlayerName(p.shopname ?? "");

      if (normalSelectedKeys.has(key)) {
        return false;
      }

      return true;
    });

  const rankedPhaseRescuePool =
    [...phaseRescuePool].sort(
      (a, b) =>
        Number(b.__detail?.finalPhaseScore ?? 0) -
        Number(a.__detail?.finalPhaseScore ?? 0)
    );

  const phaseRescueSelected = [];

  const appendRescueCandidates = (
    pool,
    limit,
    reason
  ) => {

    for (const player of pool) {

      if (
        phaseRescueSelected.length >=
          PHASE_RESCUE_SLOT_COUNT ||
        phaseRescueSelected.filter(
          p => p.__rescueReason === reason
        ).length >= limit ||
        phaseRescueSelected.includes(player)
      ) {
        continue;
      }

      player.__rescueReason =
        reason;

      phaseRescueSelected.push(
        player
      );
    }
  };

  appendRescueCandidates(
    rankedPhaseRescuePool.filter(
      p => p.__detail?.historicalMatched
    ),
    MATCHED_RESCUE_SLOT_COUNT,
    "phase"
  );

  appendRescueCandidates(
    rankedPhaseRescuePool.filter(
      p => p.__detail?.historicalBackoff
    ),
    BACKOFF_RESCUE_SLOT_COUNT,
    "historical-backoff"
  );

  appendRescueCandidates(
    rankedPhaseRescuePool,
    PHASE_RESCUE_SLOT_COUNT,
    "phase"
  );

  phaseRescueSelected.forEach(
    p => {
      p.__phaseRescue = true;
    }
  );

  const selected = [
    ...normalSelected,
    ...phaseRescueSelected
  ];

  selected.forEach(
    (p, i) => {

      p.displayRank =
        i + 1;
    }
  );

  State.matchingList =
    selected;

  log(
    `候補生成: Base=${base.length} / Selected=${selected.length}` +
    `（通常${normalSelected.length}＋Phase救済${phaseRescueSelected.length}）` +
    `  Yellow周期=${Math.round(calcYellowCycle())}秒  Pink周期=${Math.round(calcPinkCycle())}秒`
  );

  saveCandidateEvent();
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

  State.summary = [];

  const selectedStars =
    readSelectedStars();

  const selectedPrides =
    readSelectedPrides();

  const base =
    State.filtered;

  State.summary =
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
      })
      .map(rank => {

        const list =
          base.filter(p => {

            if (
              rank.type === "ruby"
            ) {

              return (
                p.onlineBattleRankId ===
                  RUBY_ID &&
                p.starCnt ===
                  rank.star
              );
            }

            const pt =
              Number(
                p.pridePoint ?? 0
              );

            return (
              pt >= rank.min &&
              pt <= rank.max
            );
          });

        return {
          key: rank.key,
          label: rank.label,
          icon: rank.icon,
          list
        };
      });
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
     normalize(keyword);

  const base =
     State.matchingList || [];

  const list =
     !norm
       ? base
       : base.filter(
           p =>
             (
               p.normalizedName || ""
             ).includes(norm)
         );

  renderMatchingRows(list);
}


/* #################################################################
 [LAYER 10000] View Templates（HTML文字列を返す層）
 ################################################################# */

/* =========================================================
 [10000] Render Utility:renderStars（旧 [2500]）
========================================================= */
function renderStars(starCount) {

  if (
    !starCount ||
    starCount < 1
  ) {
    return "";
  }

  const stars =
    "★".repeat(starCount);

  return stars.length > 4
    ? (
        stars.slice(0, 4) +
        "<br>" +
        stars.slice(4)
      )
    : stars;
}

/* =========================================================
 [10100] Filter UI Template:buildFilterGroupHTML（旧 [5200]）
========================================================= */
function buildFilterGroupHTML(
  items,
  options
) {

  const {
    labelClass,
    inputClass,
    getValue,
    getText
  } = options;

  const itemHtml =
    items
      .map(
        item => `
      <label class="${labelClass}">
        <input
          type="checkbox"
          class="${inputClass}"
          value="${getValue(item)}"
          checked
        >
        ${getText(item)}
      </label>
    `
      )
      .join("");

  return `
    <div class="filter-row">
      <div class="filter-label"></div>
      <div class="filter-items">
        ${itemHtml}
      </div>
    </div>
  `;
}

/* =========================================================
 [10200] Shop Name Display:getTextWidth【DOM】（旧 [2420]）
========================================================= */
function getTextWidth(text, font) {

  const canvas =
    getTextWidth.canvas ||
    (
      getTextWidth.canvas =
      document.createElement(
        "canvas"
      )
    );

  const ctx =
    canvas.getContext("2d");

  ctx.font = font;

  return ctx.measureText(text)
    .width;
}

/* =========================================================
 [10210] Shop Name Display:shortenStoreName【DOM】（旧 [2430]）
========================================================= */
function shortenStoreName(full) {

  if (!full) {
    return "";
  }

  if (!isMostlyAscii(full)) {

    const zLen =
      getZenkakuLength(full);

    if (zLen <= 18) {
      return full;
    }

    const head = 6;
    const tail = 6;

    if (
      full.length <=
      head + tail
    ) {
      return full;
    }

    return (
      full.slice(0, head) +
      "…" +
      full.slice(-tail)
    );
  }

  const font =
    "14px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

  const maxWidth = 220;

  if (
    getTextWidth(full, font) <=
    maxWidth
  ) {
    return full;
  }

  let head = 10;
  let tail = 10;

  while (
    head + tail > 2
  ) {

    const candidate =
      full.slice(0, head) +
      "…" +
      full.slice(-tail);

    if (
      getTextWidth(
        candidate,
        font
      ) <= maxWidth
    ) {
      return candidate;
    }

    if (head >= tail) {
      head--;
    } else {
      tail--;
    }
  }

  return (
    full.slice(0, 1) +
    "…" +
    full.slice(-1)
  );
}

/* =========================================================
 [10300] Phase Cycle Monitor:buildPhaseCycleWindowHTML（旧 [6152]）
========================================================= */
function buildPhaseCycleWindowHTML(
  cycleSec,
  n,
  halfWidthSec,
  filterFromMs,
  filterToMs,
  colorRgb,
  textColor,
  referenceMs,
  phaseOffsetPct,
  phaseWidthPct
) {

  const centerSec =
    cycleSec * n;

  const centerMs =
    referenceMs - centerSec * 1000;

  const windowFromMs =
    centerMs - halfWidthSec * 1000;

  const windowToMs =
    centerMs + halfWidthSec * 1000;

  const clippedFromMs =
    Math.max(
      filterFromMs,
      windowFromMs
    );

  const clippedToMs =
    Math.min(
      filterToMs,
      windowToMs
    );

  const centerIsInFilterRange =
    centerMs >= filterFromMs &&
    centerMs <= filterToMs;

  if (
    clippedFromMs > clippedToMs ||
    (
      clippedFromMs === clippedToMs &&
      !centerIsInFilterRange
    )
  ) {
    return "";
  }

  const rangeMs =
    filterToMs - filterFromMs;

  const leftPct =
    phaseOffsetPct +
    (
      ((filterToMs - clippedToMs) / rangeMs) *
      phaseWidthPct
    );

  const availableWidthPct =
    phaseOffsetPct +
    phaseWidthPct -
    leftPct;

  /*
   * decay により許容幅が 0 になった古い周期も、
   * Filter範囲内の中心時刻は細いマーカーとして残す。
   */
  const widthPct =
    Math.min(
      availableWidthPct,
      Math.max(
        0.5,
        ((clippedToMs - clippedFromMs) / rangeMs) *
          phaseWidthPct
      )
    );

  if (widthPct <= 0) {
    return "";
  }

  /*
   * 表のYellow/Pink判定と同じく現在時刻を起点として
   * n周期前の中心時刻を表示する。
   * 表示範囲だけをFilter From〜Toに合わせ、帯の両端を
   * その範囲内にクリップする。周期計算の基準時刻は変えない。
   *
   * バー内表示は秒単位の厳密性を求めないため
   * 時:分のみ（formatClockHm）。
   * ツールチップ（title）は詳細確認用に秒まで表示する。
   */
  const centerClockShort =
    formatClockHm(
      referenceMs - centerSec * 1000
    );

  const centerClockFull =
    formatClockHms(
      referenceMs - centerSec * 1000
    );

  /*
   * 範囲端に掛かる帯は描画するが、中心時刻がFilter Toより
   * 新しい、またはFilter Fromより古い場合は時刻文字を表示しない。
   */
  const centerLabel =
    centerIsInFilterRange
      ? `
        <span
          style="
            font-size:14px;
            font-weight:bold;
            color:${textColor};
            white-space:nowrap;
          "
        >${centerClockShort}</span>
      `
      : "";

  return `
    <div
      style="
        position:absolute;
        left:${leftPct}%;
        width:${widthPct}%;
        top:0;
        bottom:0;
        background:rgb(${colorRgb});
        border-radius:3px;
        display:flex;
        align-items:center;
        justify-content:center;
      "
      title="${n}周期前：${centerClockFull} 頃（許容 ±${Math.round(halfWidthSec)}秒）"
    >
      ${centerLabel}
    </div>
  `;
}

/* =========================================================
 [10310] Phase Cycle Monitor:buildPhaseCycleRowHTML【State】（旧 [6153]）
========================================================= */
function buildPhaseCycleRowHTML(mode, nowMs = Date.now()) {

  const isPink =
    mode === "pink";

  const cfg =
    State.scoringConfig
      ?.phase?.[mode] ?? {};

  const errCfg =
    State.scoringConfig
      ?.phaseError ?? {};

  const cycleSec =
    isPink
      ? calcPinkCycle()
      : calcYellowCycle();

  const adjust =
    Number(
      (
        isPink
          ? State.phaseAdjust?.pink
          : State.phaseAdjust?.yellow
      ) ?? 0
    );

  const threshold =
    Number(
      errCfg[
        isPink ? "pinkThreshold" : "yellowThreshold"
      ] ?? (isPink ? 0.55 : 0.7)
    );

  const lambda =
    Number(
      errCfg[
        isPink ? "pinkLambda" : "yellowLambda"
      ] ?? 0.03
    );

  const samples =
    isPink
      ? getPinkSampleCount()
      : (State.yellowSamples?.length ?? 0);

  const minSamples =
    Number(cfg.minSamples ?? 8);

  const trustPct =
    minSamples > 0
      ? Math.min(
          100,
          Math.round((samples / minSamples) * 100)
        )
      : 100;

  const filterToMs =
    getFilterToMs(nowMs);

  const rangeMinutes =
    readRangeMinutes();

  if (
    !isFinite(rangeMinutes) ||
    rangeMinutes <= 0
  ) {
    return "";
  }

  const filterFromMs =
    filterToMs -
    rangeMinutes * 60 * 1000;

  const phaseReferenceMs =
    nowMs;

  const staleSec =
    Math.max(
      0,
      (nowMs - filterToMs) / 1000
    );

  /*
   * 左端＝現在時刻、右方向＝過去。
   * 黒領域は現在時刻からFilterのTo時刻までを示す。
   * Filter To〜From の位相軸は残りの領域に収める。
   */
  const staleMaxSec =
    45 * 60;

  const stalePct =
    Math.min(
      20,
      (staleSec / staleMaxSec) * 20
    );

  const phaseOffsetPct =
    stalePct;

  const phaseWidthPct =
    100 - stalePct;

  const maxCycleIndex =
    Math.max(
      0,
      Math.ceil(
        (phaseReferenceMs - filterFromMs) /
        (cycleSec * 1000)
      ) + 1
    );

  /*
   * 詳細表示・候補表示の行ハイライトと同じ色に統一
   * .match-row-yellow { background-color:#FFFFCC }
   * .match-row-pink   { background-color:#FFE4EC }
   */
  const colorRgb =
    isPink
      ? "255,228,236"
      : "255,255,204";

  const textColor =
    isPink
      ? "#ad1457"
      : "#665c00";

  const windows =
    Array.from(
      { length: maxCycleIndex + 1 },
      (_, n) => n
    )
      .map(n => {

        return buildPhaseCycleWindowHTML(
          cycleSec,
          n,
          getPhaseWindowHalfWidthSec(
            cycleSec,
            n,
            threshold,
            lambda
          ),
          filterFromMs,
          filterToMs,
          colorRgb,
          textColor,
          phaseReferenceMs,
          phaseOffsetPct,
          phaseWidthPct
        );
      })
      .join("");

  const label =
    isPink ? "Pink" : "Yellow";

  const labelColor =
    isPink ? "#c2185b" : "#a67c00";

  return `
    <div style="margin-bottom:14px;">

      <div style="font-size:12px; color:#555; margin-bottom:4px;">
        <strong style="color:${labelColor};">${label}</strong>
        ：周期 ${cycleSec.toFixed(1)}秒（基準345秒 ${adjust >= 0 ? "+" : ""}${adjust.toFixed(1)}秒）
        ／信頼度${trustPct}%
        ／許容幅はdecay反映（しきい値${threshold}）
      </div>

      <div
        style="
          position:relative;
          height:26px;
          background:#eee;
          border-radius:4px;
          overflow:hidden;
        "
      >
        <div
          style="
            position:absolute;
            left:0;
            top:0;
            bottom:0;
            width:${stalePct}%;
            background:#111;
            color:#fff;
            display:flex;
            align-items:center;
            justify-content:flex-start;
            padding-left:4px;
            box-sizing:border-box;
            font-size:14px;
            font-weight:bold;
            white-space:nowrap;
            z-index:2;
          "
          title="現在時刻：${formatClockHms(nowMs)} ／ FilterのTo：${formatClockHms(filterToMs)}"
        >
          ${formatClockHm(nowMs)}
        </div>
        <div
          style="
            position:absolute;
            left:0;
            top:-2px;
            bottom:-2px;
            width:2px;
            background:#333;
            z-index:3;
          "
          title="現在時刻 ${formatClockHms(nowMs)}"
        ></div>
        ${windows}
      </div>
      <div
        style="
          display:flex;
          justify-content:space-between;
          margin-top:2px;
          font-size:11px;
          color:#555;
          padding-left:${stalePct}%;
          box-sizing:border-box;
        "
      >
        <span title="Filter To：${formatClockHms(filterToMs)}">
          To ${formatClockHm(filterToMs)}
        </span>
        <span title="Filter From：${formatClockHms(filterFromMs)}">
          From ${formatClockHm(filterFromMs)}
        </span>
      </div>

    </div>
  `;
}

/* =========================================================
 [10320] Phase Cycle Monitor:buildPhaseCycleMonitorHTML（旧 [6154]）
========================================================= */
function buildPhaseCycleMonitorHTML(nowMs = Date.now()) {

  return `
    <div
      style="
        border:1px solid #ddd;
        border-radius:6px;
        padding:10px 14px;
        margin-bottom:14px;
        background:#fafafa;
      "
    >
      ${buildPhaseCycleRowHTML("yellow", nowMs)}
      ${buildPhaseCycleRowHTML("pink", nowMs)}
    </div>
  `;
}

/* =========================================================
 [10400] Player Row Template:buildPlayerRowHTML【State】（旧 [6600]）
========================================================= */
function buildPlayerRowHTML(
  p
) {
  const titleUrl =
    p.mytitleId
      ? `https://initiald.sega.jp/inidac/ranking-images/title/${p.mytitleId}.png`
      : "";

  const isRuby =
    p.onlineBattleRankId === RUBY_ID &&
    p.starCnt;

  const starOrLevel =
    isRuby
      ? renderStars(
          p.starCnt
        )
      : p.pridePoint;

  const fullShop =
    p.shopname ?? "";

  const shortShop =
    shortenStoreName(
      fullShop
    );

  const isPinkManaged =
    isCopiedPlayer(p);

  const isPinkPhase =
    isMatchingCandidateByCopyPhase(p);

  const playerNameClass =
    isPinkPhase
      ? "pink-phase"
      : isPinkManaged
          ? "pink-managed"
          : "";

  const safeName =
    String(
      p.name ?? ""
    )
      .replace(
        /\\/g,
        "\\\\"
      )
      .replace(
        /'/g,
        "\\'"
      )
      .replace(
        /"/g,
        '\\"'
      );

  const safeShop =
    String(
      fullShop ?? ""
    )
      .replace(
        /\\/g,
        "\\\\"
      )
      .replace(
        /'/g,
        "\\'"
      )
      .replace(
        /"/g,
        "&quot;"
      );

  const copyValue =
    isRuby
      ? `★${"★".repeat(
          p.starCnt - 1
        )}\t${safeName}`
      : `${p.pridePoint}\t${safeName}`;

  const rowStateClass =
    isPinkPhase
      ? "pink-phase"
      : isPinkManaged
          ? "pink-managed"
          : "";

  const phaseRescueClass =
    p.__phaseRescue
      ? " phase-rescue"
      : "";

  return `
    <tr
      class="${rowStateClass}${phaseRescueClass}"
      data-updated="${p.updateDate}"
      data-name="${safeName}"
      data-shopname="${safeShop}"
    >
      <td
        class="center clickable"
        onclick="copyToClipboard(
          '${copyValue}',
          '${safeName}',
          '${safeShop}'
        )"
      >
        ${starOrLevel}
      </td>

      <td
        class="left player-name clickable ${playerNameClass}"
        onclick="copyToClipboard(
          '${safeName}',
          '${safeName}',
          '${safeShop}'
        )"
      >
        ${p.name}${
          p.__phaseRescue
            ? p.__rescueReason === "historical-backoff"
              ? ' <span style="background:#fff3cd;color:#7a5200;border-radius:3px;padding:0 4px;font-size:0.8em;" title="履歴補完救済枠：未観測のランク帯・地域から位相上位を選出">H↑</span>'
              : ' <span style="background:#e0f2ff;color:#0b5da6;border-radius:3px;padding:0 4px;font-size:0.8em;" title="Phase救済枠：FinalPhaseScoreが高いため選出">P↑</span>'
            : ""
        }
      </td>

      <td class="right">
        ${fmt(p.point)}
      </td>

      <td
        class="left clickable"
        data-fullname="${safeShop}"
        onclick="copyToClipboard(
          '${safeShop}',
          '${safeName}',
          '${safeShop}'
        )"
      >
        <div class="store-name">
          ${shortShop}
        </div>
      </td>
      
      <td class="left phase-last-update">
        <button
          type="button"
          class="phase-detail-trigger"
          style="
            border:0;
            padding:0;
            background:transparent;
            color:inherit;
            font:inherit;
            text-align:left;
            cursor:pointer;
          "
          title="タップしてPhaseを表示"
          aria-expanded="false"
        >${p.updateDate}</button>
        <div
          class="phase-detail"
          style="
            display:none;
            margin-top:3px;
            font-size:11px;
            line-height:1.35;
            color:#555;
            white-space:nowrap;
          "
        ></div>
      </td>

      <td class="center">
        ${
          titleUrl
            ? `<img src="${titleUrl}" height="24">`
            : ""
        }
      </td>
    </tr>
  `;
}

/* =========================================================
 [10500] Matching Header Template:buildMatchingRankCountsHTML【State】（旧 [7800]）
========================================================= */
function buildMatchingRankCountsHTML() {

  if (
    !State.matchingList.length
  ) {
    return "<span>マッチング候補は現在 0人です。</span>";
  }

  const counts = {};

  State.matchingList.forEach(
    p => {

      const key =
        p.__rankKey;

      counts[key] =
        (counts[key] || 0) + 1;

    }
  );

  const parts =
    RANKS
      .filter(
        r => counts[r.key]
      )
      .map(r => {

        const cnt =
          counts[r.key];

        return `
          <span
            style="
              margin-right:12px;
              white-space:nowrap;
            "
          >
            <img src="${r.icon}" width="24" style="vertical-align:middle; margin-right:4px;">

            ${r.label}：${fmt(cnt)}人

          </span>
        `;
      });

  return parts.join("");
}


/* #################################################################
 [LAYER 11000] DOM Renderers（DOMを書き換える層）
 ################################################################# */

/* =========================================================
 [11000] View Switching:switchDisplayView【DOM】（旧 [0220]）
========================================================= */
function switchDisplayView(view) {

  const summaryView =
    document.getElementById("summaryView");

  const detailView =
    document.getElementById("detailView");

  const matchingView =
    document.getElementById("matchingView");

  if (summaryView) {
    summaryView.style.display =
      view === STATE.SUMMARY
        ? "block"
        : "none";
  }

  if (detailView) {
    detailView.style.display =
      view === STATE.DETAIL
        ? "block"
        : "none";
  }

  if (matchingView) {
    matchingView.style.display =
      view === STATE.MATCHING
        ? "block"
        : "none";
  }
}

/* =========================================================
 [11100] Progress Utility:state【DOM】（旧 [2300]）
========================================================= */
let progressTimer = null;

let progressPos = 0;

let progressLine = null;

/* =========================================================
 [11110] Progress Utility:startProgress【DOM】（旧 [2310]）
========================================================= */
function startProgress() {
  const box = document.getElementById("logBox");

  // logBox が存在しない環境では何もしない
  if (!box) return;

  if (progressLine && progressLine.parentNode) {
    progressLine.remove();
  }

  progressPos = 0;

  progressLine = document.createElement("div");

  progressLine.style.color = "#ffeb3b";

  box.prepend(progressLine);

  updateProgressBar();

  progressTimer = setInterval(() => {
    progressPos = (progressPos + 1) % 20;
    updateProgressBar();
  }, 120);
}

/* =========================================================
 [11120] Progress Utility:updateProgressBar【DOM】（旧 [2320]）
========================================================= */
function updateProgressBar() {
  if (!progressLine) return;

  const total = 20;

  const filled = "■".repeat(Math.max(0, Math.min(total, progressPos)));

  const empty = "□".repeat(Math.max(0, total - progressPos));

  progressLine.textContent = `進行中：${filled}${empty}`;
}

/* =========================================================
 [11130] Progress Utility:stopProgress【DOM】（旧 [2330]）
========================================================= */
function stopProgress() {

  if (progressTimer) {
    clearInterval(progressTimer);
  }

  progressTimer = null;

  if (progressLine) {

    progressLine.remove();

    progressLine = null;
  }

  log("Viewer フィルタ完了");
}

/* =========================================================
 [11200] Filter UI Renderer:buildRubyFilters【DOM】（旧 [5210]）
========================================================= */
function buildRubyFilters() {

  const area =
    document.getElementById(
      "rubyFilters"
    );

  if (!area) {
    return;
  }

  const stars =
    Array.from(
      { length: 8 },
      (_, i) => i + 1
    );

  area.innerHTML =
    buildFilterGroupHTML(
      stars,
      {
        labelClass: "ruby-btn",

        inputClass:
          "ruby-filter",

        getValue:
          star => star,

        getText:
          star => `★${star}`
      }
    );
}

/* =========================================================
 [11210] Filter UI Renderer:buildPrideFilters【DOM】（旧 [5220]）
========================================================= */
function buildPrideFilters() {

  const area =
    document.getElementById(
      "prideFilters"
    );

  if (!area) {
    return;
  }

  area.innerHTML =
    buildFilterGroupHTML(
      PRIDE_LEVELS,
      {
        labelClass:
          "pride-btn",

        inputClass:
          "pride-filter",

        getValue:
          p => p.key,

        getText:
          p => p.key.replace(
            "P_",
            ""
          )
      }
    );
}

/* =========================================================
 [11300] Summary Renderer:renderSummary【DOM】【State】（旧 [5410]）
========================================================= */
function renderSummary() {

  const area =
    document.getElementById(
      "summaryArea"
    );

  const filteredSummary =
    filterSummaryBySearch();

  const total =
    filteredSummary.reduce(
      (sum, r) =>
        sum + r.list.length,
      0
    );

  const rubyTotal =
    filteredSummary
      .filter(
        r =>
          r.key.startsWith(
            "R"
          )
      )
      .reduce(
        (s, r) =>
          s + r.list.length,
        0
      );

  const prideTotal =
    total - rubyTotal;

  const rankPercent =
    total
      ? Math.round(
          (
            rubyTotal /
            total
          ) * 100
        )
      : 0;

  const pridePercent =
    total
      ? Math.round(
          (
            prideTotal /
            total
          ) * 100
        )
      : 0;

  area.innerHTML = `
    <h3>
      合計 ${fmt(total)}人：
      RUBY帯 ${fmt(rubyTotal)}人＝${rankPercent}% ＋
      PRIDE帯 ${fmt(prideTotal)}人＝${pridePercent}%
    </h3>

    <div style="overflow-x:auto;">
      <table>

        <tr>
          <th>ランク</th>
          <th>★・Lv</th>
          <th>人数</th>
          <th>%</th>
          <th>Bar</th>
          <th>RP:Avg</th>
          <th>RP:Min</th>
          <th>RP:Max</th>
        </tr>

        ${filteredSummary.map(r => {

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

          return `
            <tr
              class="clickable"
              data-key="${r.key}"
            >

              <td class="center">
                <img src="${r.icon}" width="32">
              </td>

              <td class="left">
                ${r.label}
              </td>

              <td class="right">
                ${fmt(cnt)}
              </td>

              <td class="right">
                ${percent}%
              </td>

              <td class="center">
                <div class="bar-wrap">
                  <div
                    class="bar"
                    style="width:${percent}%;"
                  ></div>
                </div>
              </td>

              <td class="right">
                ${fmt(avg)}
              </td>

              <td class="right">
                ${fmt(min)}
              </td>

              <td class="right">
                ${fmt(max)}
              </td>

            </tr>
          `;

        }).join("")}

      </table>
    </div>
  `;

  document
    .querySelectorAll(
      "#summaryArea .clickable"
    )
    .forEach(tr => {

      tr.addEventListener(
        "click",
        () => {

          const key =
            tr.dataset.key;

          State.currentIsRubyBand =
            key.startsWith(
              "R"
            );

          showDetail(
            key
          );
        }
      );
    });

  State.currentDetailKey = "";

  State.currentDetailLabel = "";

  State.currentDetailIcon = "";

  setCurrentView(
    STATE.SUMMARY
  );

  switchDisplayView(
    STATE.SUMMARY
  );
}

/* =========================================================
 [11400] Detail Renderer:renderDetailTable【DOM】【State】（旧 [6200]）
========================================================= */
function renderDetailTable(
  isRubyBand,
  bandLabel,
  bandIcon
) {

  const area =
    document.getElementById(
      "detailArea"
    );

  const list =
    applyPlayerFilter(
      State.searchText,
      true
    );

  area.innerHTML = `
    ${buildPhaseCycleMonitorHTML()}

    <h3>

      <span style="margin-right:8px;">
        ${
          bandIcon
            ? `<img src="${bandIcon}" width="32">`
            : ""
        }
      </span>

      <span>
        ${bandLabel}
      </span>

      <span style="margin-left:16px;">
        （${fmt(list.length)}人）
      </span>

    </h3>

    <div style="overflow-x:auto;">

      <table>

        <thead>

          <tr>
            <th>★・PRIDE</th>
            <th>プレイヤー名</th>
            <th>RP</th>
            <th>店舗名</th>
            <th>Last Update</th>
            <th>称号</th>
          </tr>

        </thead>

        <tbody id="detailTableBody"></tbody>

      </table>

    </div>
  `;

  renderDetailRows(
    list,
    isRubyBand
  );
}

/* =========================================================
 [11410] Detail Renderer:renderDetailRows【DOM】（旧 [6300]）
========================================================= */
function renderDetailRows(
  list,
  isRubyBand
) {
  renderPlayerRowsToBody(
    "detailTableBody",
    list
  );
}

/* =========================================================
 [11500] Player Row Renderer:renderPlayerRowsToBody【DOM】（旧 [6500]）
========================================================= */
function renderPlayerRowsToBody(
  tbodyId,
  list
) {
  const tbody =
    document.getElementById(
      tbodyId
    );

  if (!tbody) return;

  const rows =
    list
      .map(p => buildPlayerRowHTML(p))
      .join("");

  tbody.innerHTML = rows;

  tbody.querySelectorAll(
    ".phase-detail-trigger"
  )
    .forEach(trigger => {
      trigger.addEventListener(
        "click",
        () => {
          const row =
            trigger.closest("tr");

          const detail =
            row?.querySelector(
              ".phase-detail"
            );

          if (!row || !detail) {
            return;
          }

          const player = {
            name: row.dataset.name || "",
            shopname:
              row.dataset.shopname || "",
            updateDate:
              row.dataset.updated || ""
          };

          const isExpanded =
            trigger.getAttribute(
              "aria-expanded"
            ) === "true";

          if (isExpanded) {
            detail.style.display = "none";
            trigger.setAttribute(
              "aria-expanded",
              "false"
            );
            return;
          }

          detail.textContent =
            buildPlayerPhaseDetailText(
              player
            );
          detail.style.display = "block";
          trigger.setAttribute(
            "aria-expanded",
            "true"
          );
        }
      );
    });

  highlightMatchingRows(
    tbody
  );
}

/* =========================================================
 [11510] Matching Highlight Renderer:highlightMatchingRows【DOM】【State】（旧 [6400]）
========================================================= */
function highlightMatchingRows(
  tbody
) {

  if (!tbody) return;

  tbody.querySelectorAll("tr").forEach(tr => {

    const updated =
      tr.dataset.updated || "";

    const rowName =
      tr.dataset.name || "";

    const rowShop =
      tr.dataset.shopname || "";

    const rowPlayer = {
      name: rowName,
      shopname: rowShop,
      updateDate: updated
    };

    const isYellow =
      isMatchingCandidateByPhase(
        rowPlayer
      );

    const isPink =
      isMatchingCandidateByCopyPhase(
        rowPlayer
      );

    tr.classList.remove(
      "match-row-yellow"
    );

    tr.classList.remove(
      "match-row-pink"
    );

    if (isPink) {

      tr.classList.add(
        "match-row-pink"
      );

    } else if (isYellow) {

      tr.classList.add(
        "match-row-yellow"
      );

    }

  });

}

/* =========================================================
 [11600] Matching Renderer:renderMatchingHeader【DOM】（旧 [7800] 内）
========================================================= */
function renderMatchingHeader() {

  const headerEl =
    document.getElementById(
      "matchingHeader"
    );

  if (!headerEl) {
    return;
  }

  /*
   * ランクアイコン：人数の表示は
   * マッチング候補テーブル側（PhaseグラフとTableの間）に統合したため、
   * 従来のこの位置（matchingHeader要素）は空にする。
   */
  headerEl.innerHTML = "";
}

/* =========================================================
 [11610] Matching Renderer:renderMatchingTable【DOM】【State】（旧 [7810]）
========================================================= */
function renderMatchingTable() {

  const area =
    document.getElementById(
      "matchingArea"
    );

  if (!area) return;

  area.innerHTML = `
    ${buildPhaseCycleMonitorHTML()}

    <div
      id="matchingRankCounts"
      class="mt10"
      style="margin-bottom:10px;"
    >
      ${buildMatchingRankCountsHTML()}
    </div>

    <div style="overflow-x:auto;">

      <table>

        <thead>
          <tr>
            <th>★・PRIDE</th>
            <th>プレイヤー名</th>
            <th>RP</th>
            <th>店舗名</th>
            <th>Last Update</th>
                        <th>称号</th>
          </tr>
        </thead>

        <tbody id="matchingTableBody"></tbody>

      </table>

    </div>
  `;

  renderMatchingRows(
    State.matchingList
  );
}

/* =========================================================
 [11620] Matching Renderer:renderMatchingRows【DOM】（旧 [7820]）
========================================================= */
function renderMatchingRows(
  list
) {

  // ✅ 修正：ここでは除外しない
  // すでに候補生成段階で処理済

  renderPlayerRowsToBody(
    "matchingTableBody",
    list
  );

}

/* =========================================================
 [11700] Log Output:appendLog【DOM】【永続化】（旧 [9000]）
========================================================= */
function appendLog(
  msg,
  type = "info"
) {

  /* =====================================
   * ログフィルタ
   * ===================================== */

  if (
    !allowLog(msg, type)
  ) {
    return;
  }

  const box =
    document.getElementById(
      "logBox"
    );

  const t =
    getNowLabelJa();

  if (box) {

    const line =
      document.createElement(
        "div"
      );

    line.textContent =
      `[${t}] ${msg}`;

    line.dataset.type =
      type;

    if (
      type === "error"
    ) {

      line.style.color =
        "#ff5555";

    } else if (
      type === "warn"
    ) {

      line.style.color =
        "#ffeb3b";

    } else {

      line.style.color =
        "#00ff00";
    }

    box.prepend(line);

    while (
      box.children.length >
      MAX_LOG_LINES
    ) {

      box.removeChild(
        box.lastChild
      );
    }
  }

  if (
    type === "warn" ||
    type === "error"
  ) {
    logEvent(
      "runtime",
      {
        logSchemaVersion:
          "phase_score_v2",
        severity: type,
        message: String(msg ?? ""),
        currentView:
          State.currentView || "",
        generatedAt:
          State.generatedAt || "",
        latestRound:
          State.latestRound || "",
        latestUpdateAt:
          State.latestUpdateAt || ""
      }
    );
  }
}

/* =========================================================
 [11710] Log Output:allowLog（旧 [9010]）
========================================================= */
function allowLog(
  message,
  type
) {

  if (type === "error") {
    return true;
  }

  if (
    message.includes(
      "Viewer 初期化中"
    )
  ) {
    return true;
  }

  if (
    message.includes(
      "初期データ取得完了"
    )
  ) {
    return true;
  }

  if (
    message.includes(
      "フィルタ結果"
    )
  ) {
    return true;
  }

  if (
    message.includes(
      "候補生成"
    )
  ) {

    return true;
  }

  if (
    message.startsWith(
      "コピー:"
    ) ||
    message.includes(
      "コピー取消"
    ) ||
    message.includes(
      "重複コピー"
    )
  ) {
    return true;
  }

  if (
    message.startsWith(
      "自分ランク変更"
    )
  ) {
    return true;
  }

  if (
    message.includes(
      "Reload完了"
    )
  ) {
    return true;
  }

  if (
    message.includes(
      "更新監視開始"
    )
  ) {
    return true;
  }

  if (
    message.includes(
      "先読み開始"
    )
  ) {
    return true;
  }

  if (
    message.includes(
      "先読み成功"
    )
  ) {
    return true;
  }

  if (
    message.includes(
      "先読み失敗"
    )
  ) {
    return true;
  }
  if (
    message.includes(
      "利用元:"
    )
  ) {
    return true;
  }

  if (
    message.includes(
      "通信時間"
    )
  ) {
    return true;
  }

  if (
    message.includes(
      "Timeout"
    )
  ) {
    return true;
  }

  return false;
}

const log =
  msg =>
    appendLog(
      msg,
      "info"
    );

const logWarn =
  msg =>
    appendLog(
      msg,
      "warn"
    );

const logError =
  msg =>
    appendLog(
      msg,
      "error"
    );


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

  const afterCopySuccess = () => {

    const copyRecord =
      saveCopyEventUnified(
        text,
        playerName,
        shopName
      );

    logEvent(
      "copy",
      copyRecord
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

    buildMatchingCandidates();

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

      renderDetailTable(
        State.currentIsRubyBand,
        State.currentDetailLabel,
        State.currentDetailIcon
      );

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
      compactYMD(
        getTodayYMDJa()
      );

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
      0,
      0,
      0,
      0
    );

  const endDate =
    new Date(
      year,
      month,
      day,
      23,
      59,
      59,
      999
    );

  const startTs =
    startDate.getTime();

  const endTs =
    endDate.getTime();

  const copyEvents =
    readStoredArraySafe(
      LOG_STORAGE_KEYS.copyEvents +
      dateKey
    );

  const payload = {

    exportedAt:
      Date.now(),

    rawDate,

    dateKey,

    targetDate,

    range: {
      start: startTs,
      end: endTs
    },

    copyEvents,

    candidateEvents: [],

    runtimeEvents: []

  };

  if (!logDB) {

    logWarn(
      "IndexedDB未初期化のため localStorage のみ出力"
    );

  } else {

    try {

      const tx =
        logDB.transaction(
          [
            LOG_STORE.candidateEvents,
            LOG_STORE.events
          ],
          "readonly"
        );

      const candidateStore =
        tx.objectStore(
          LOG_STORE.candidateEvents
        );

      const candidates =
        await new Promise(
          (
            resolve,
            reject
          ) => {

            const req =
              candidateStore.getAll();

            req.onsuccess =
              () =>
                resolve(
                  req.result || []
                );

            req.onerror =
              reject;

          }
        );

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

      const eventStore =
        tx.objectStore(
          LOG_STORE.events
        );

      const events =
        await new Promise(
          (
            resolve,
            reject
          ) => {

            const req =
              eventStore.getAll();

            req.onsuccess =
              () =>
                resolve(
                  req.result || []
                );

            req.onerror =
              reject;
          }
        );

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
 [13000] Copy Use Case:saveCopyEventUnified【State】【永続化】（旧 [9200]）
========================================================= */
function saveCopyEventUnified(
  rawText,
  playerName = "",
  shopName = ""
) {

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
        "phase_score_v2",

      dk:
        buildDailyKey(),

      n:
        playerName,

      shopname:
        shopName,

      score:
        null,

      scoreRank:
        null,

      predictedRank:
        null,

      wasInTop10:
        false,

      predictionAgeSec:
        State.lastCandidateEventId
          ? Number(
              (
                (Date.now() -
                  State.lastCandidateEventId) /
                1000
              ).toFixed(3)
            )
          : null,

      unmatchedPlayer:
        true,

      candidateEventId:
        State.lastCandidateEventId ?? null,

      candidateSnapshot:
        buildCopyCandidateSnapshot()

    };

    pushStoredRecord(
      LOG_STORAGE_KEYS.copyEvents,
      record,
      LOG_STORAGE_LIMITS.copyEvents,
      true
    );

    return record;

  }

  const detail =
    calcMatchingScoreDetail(
      player
    );

  const rankedAll =
    State.matchingRankedAll ?? [];

  const displayedCandidates =
    State.matchingList ?? [];

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

  const copyCandidateSnapshot =
    buildCopyCandidateSnapshot();

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
      "phase_score_v2",

    dk:
      buildDailyKey(),

    n:
      player.name ?? "",

    shopname:
      player.shopname ?? "",

    score:
      Number(detail.score ?? 0),

    scoreRank:
      candidateRank > 0
        ? candidateRank
        : null,

    predictedRank,

    wasInTop10:
      predictedRank !== null,

    predictionAgeSec:
      State.lastCandidateEventId
        ? Number(
            (
              (Date.now() -
                State.lastCandidateEventId) /
              1000
            ).toFixed(3)
          )
        : null,

    scoreBreakdown: {
      historicalScore:
        Number(detail.historicalScore ?? 0),
      historicalMatched:
        Boolean(detail.historicalMatched),
      historicalBackoff:
        Boolean(detail.historicalBackoff),
      playerBoost:
        Number(detail.playerBoost ?? 1),
      rankBoost:
        Number(detail.rankBoost ?? 1),
      realtimeBoost:
        Number(detail.realtimeBoost ?? 1),
      phaseError:
        Number(detail.phaseError ?? 0),
      phaseScore:
        Number(detail.phaseScore ?? 0),
      decay:
        Number(detail.decay ?? 0),
      finalPhaseScore:
        Number(detail.finalPhaseScore ?? 0),
      effectivePhaseScore:
        Number(detail.effectivePhaseScore ?? 0)
    },

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

    candidateEventId:
      State.lastCandidateEventId ?? null,

    candidateSnapshot:
      copyCandidateSnapshot

  };

  pushStoredRecord(
    LOG_STORAGE_KEYS.copyEvents,
    record,
    LOG_STORAGE_LIMITS.copyEvents,
    true
  );

  return record;

}

/* =========================================================
 [13010] Copy Use Case:buildCopyCandidateSnapshot【State】（旧 [9210]）
========================================================= */
function buildCopyCandidateSnapshot() {

  const candidates =
    (State.matchingList ?? [])
      .map(p => ({
        scoreRank: p.displayRank ?? null,
        globalScoreRank: p.__scoreRank ?? null,
        name: p.name,
        shopname: p.shopname ?? "",
        rankKey: p.__rankKey ?? null,
        area: String(p.area ?? ""),
        score: Number(
          (p.__score ?? 0).toFixed(6)
        ),
        scoreBreakdown: {
          historicalScore:
            Number(p.__detail?.historicalScore ?? 0),
          historicalMatched:
            Boolean(p.__detail?.historicalMatched),
          historicalBackoff:
            Boolean(p.__detail?.historicalBackoff),
          playerBoost:
            Number(p.__detail?.playerBoost ?? 1),
          rankBoost:
            Number(p.__detail?.rankBoost ?? 1),
          realtimeBoost:
            Number(p.__detail?.realtimeBoost ?? 1),
          phaseError:
            Number(p.__detail?.phaseError ?? 0),
          phaseScore:
            Number(p.__detail?.phaseScore ?? 0),
          decay:
            Number(p.__detail?.decay ?? 0),
          finalPhaseScore:
            Number(p.__detail?.finalPhaseScore ?? 0),
          effectivePhaseScore:
            Number(p.__detail?.effectivePhaseScore ?? 0)
        },
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
        encounterCount:
          getEncounterHistory(p)?.count ?? 0,
        isPhaseRescue:
          Boolean(p.__phaseRescue),
        rescueReason:
          p.__rescueReason ?? null
      }));

  return {
    candidateCount:
      candidates.length,
    candidates
  };

}

/* =========================================================
 [13020] Copy Use Case:recordClickFromCopiedInfo【State】【永続化】（旧 [7100]）
========================================================= */
function recordClickFromCopiedInfo(
  playerName,
  shopName
) {

  if (!playerName) return;

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
  const candidateIndex = (State.matchingList || []).findIndex(
    p =>
      normalizePlayerName(p.name ?? "") === normalizedName &&
      normalizePlayerName(p.shopname ?? "") === normalizedShop
  );

  const predictedRank = candidateIndex >= 0 ? candidateIndex + 1 : null;
  const scoreDetail = calcMatchingScoreDetail(player);

  State.viewerLastCopiedAt =
    copiedAt;

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
    phaseAdjust: JSON.parse(JSON.stringify(State.phaseAdjust || { yellow: 0, pink: 0 }))
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

    recordRealtimeActivity(
      player,
      rankKey,
      copiedAt
    );
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
function saveCandidateEvent() {

  const now =
    Date.now();

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

  const baseCycleSec = 345;

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
        return foldToCycle(
          diffSec,
          baseCycleSec
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
      "phase_score_v2",

    e: "candidate",

    id: now,

    eventAt:
      getNowLabelJa(),

    dk:
      buildDailyKey(),

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

    viewerTier:
      mapRankKeyToTierKey(
        State.myRankKey
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

        scoreBreakdown: {
          historicalScore:
            Number(p.__detail?.historicalScore ?? 0),
          historicalMatched:
            Boolean(p.__detail?.historicalMatched),
          historicalBackoff:
            Boolean(p.__detail?.historicalBackoff),
          playerBoost:
            Number(p.__detail?.playerBoost ?? 1),
          rankBoost:
            Number(p.__detail?.rankBoost ?? 1),
          realtimeBoost:
            Number(p.__detail?.realtimeBoost ?? 1),
          phaseError:
            Number(p.__detail?.phaseError ?? 0),
          phaseScore:
            Number(p.__detail?.phaseScore ?? 0),
          decay:
            Number(p.__detail?.decay ?? 0),
          finalPhaseScore:
            Number(p.__detail?.finalPhaseScore ?? 0),
          effectivePhaseScore:
            Number(p.__detail?.effectivePhaseScore ?? 0)
        },

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

        isPhaseRescue:
          Boolean(p.__phaseRescue),
        rescueReason:
          p.__rescueReason ?? null,

        encounterCount:
          getEncounterHistory(p)?.count ?? 0

      }))
  };

  State.lastCandidateEventId =
    now;

  logEvent(
    "candidate",
    record
  );
}

/* =========================================================
 [13200] Navigation Use Case:showSummaryUI【State】【DOM】（旧 [5500]）
========================================================= */
function showSummaryUI(
  push = true
) {

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
        page: STATE.SUMMARY
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
  const row =
    State.summary.find(
      r => r.key === key
    ) || null;

  const rankInfo =
    getRankInfo(key);

  const isRubyBand =
    rankInfo
      ? rankInfo.type === "ruby"
      : key.startsWith("R");

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

  setupRankNavigation(
    key
  );

  if (!row) {

    State.detailOriginal = [];

    setCurrentView(
      STATE.DETAIL
    );

    State.currentIsRubyBand =
      isRubyBand;

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
          icon: bandIcon
        },
        "",
        ""
      );
    }

    renderDetailTable(
      isRubyBand,
      bandLabel,
      bandIcon
    );

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

  State.currentIsRubyBand =
    isRubyBand;

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
        icon: bandIcon
      },
      "",
      ""
    );
  }

  renderDetailTable(
    isRubyBand,
    bandLabel,
    bandIcon
  );

  switchDisplayView(
    STATE.DETAIL
  );
}

/* =========================================================
 [13220] Navigation Use Case:showMatchingCandidates【State】【DOM】（旧 [7900]）
========================================================= */
function showMatchingCandidates(
  push = true
) {

  buildMatchingCandidates();

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
        page: STATE.MATCHING
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
        page: STATE.SUMMARY
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
window.addEventListener(
  "popstate",
  (e) => {

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

        const input =
          document.getElementById(
            "searchInput"
          );

        if (input) {
          input.value = "";
        }

        showSummaryUI(
          false
        );

        return;
      }

      if (
        State.searchText
      ) {

        clearSearch();

        const input =
          document.getElementById(
            "searchInput"
          );

        if (input) {
          input.value = "";
        }
      }

      showDetail(
        key,
        false
      );

      return;
    }

    /* =====================================
     * MATCHING
     * ===================================== */

    if (
      state.page ===
      STATE.MATCHING
    ) {

      if (
        State.searchText
      ) {

        clearSearch();

        const input =
          document.getElementById(
            "searchInput"
          );

        if (input) {
          input.value = "";
        }
      }

      showMatchingCandidates(
        false
      );

      return;
    }

    /* =====================================
     * SUMMARY
     * ===================================== */

    clearSearch();

    const input =
      document.getElementById(
        "searchInput"
      );

    if (input) {
      input.value = "";
    }

    showSummaryUI(
      false
    );
  }
);


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

  return Number(
    el?.value
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

/* #################################################################
 [LAYER 15000] Bootstrap（ファイル末尾）
 ################################################################# */

/* =========================================================
 [15000] Application Init:init（旧 [4000]）
========================================================= */
async function init() {

  log("Viewer 初期化中");

  await initLogDB();

  restorePinkStateFromStorage();

  restoreRealtimeActivityFromStorage();

  startProgress();

  buildRubyFilters();

  buildPrideFilters();

  try {

    const [
      areaJson,
      latestRoundJson,
      latestUpdateJson,
      jointModelJson,
      scoringConfigJson,
      roundDataJson
    ] = await Promise.all([
      fetchAreaListJson(),
      fetchLatestRoundJson(),
      fetchLatestUpdateJson(),
      fetchJointModelJson(),
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

    applyJointModelJson(
      jointModelJson
    );

    applyScoringConfigJson(
      scoringConfigJson
    );

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

    await loadJointModel();

    await loadScoringConfig();

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

  stopProgress();

  startUpdateWatch();
}

/* =========================================================
 [15100] Entry Point:DOMContentLoaded【DOM】（旧 [4100]）
========================================================= */
document.addEventListener(
  "DOMContentLoaded",
  () => {

    /* =====================================
     * 履歴初期化
     * ===================================== */

    history.replaceState(
      { page: STATE.SUMMARY },
      "",
      ""
    );

    history.pushState(
      { page: STATE.SUMMARY },
      "",
      ""
    );

    /* =====================================
     * 要素取得
     * ===================================== */

    const reloadBtn =
      document.getElementById(
        "reloadBtn"
      );

    const filterBtn =
      document.getElementById(
        "filterBtn"
      );

    const summaryCsvBtn =
      document.getElementById(
        "summaryCsvBtn"
      );

    const allCsvBtn =
      document.getElementById(
        "allCsvBtn"
      );

    const backBtn =
      document.getElementById(
        "backBtn"
      );

    const matchingBtn =
      document.getElementById(
        "matchingBtn"
      );

    const matchingBackBtn =
      document.getElementById(
        "matchingBackBtn"
      );

    const searchInput =
      document.getElementById(
        "searchInput"
      );

    const analysisLogBtn =
      document.getElementById(
        "analysisLogBtn"
      );

    const undoCopyBtn =
      document.getElementById(
        "undoCopyBtn"
      );

    if (undoCopyBtn) {
      undoCopyBtn.onclick = () => {
        if (typeof undoLastCopiedInfo === "function") {
          undoLastCopiedInfo();
        }
      };
    }

    /* =====================================
     * Analysis Log Export
     * ===================================== */

    if (analysisLogBtn) {

      if (
        typeof exportTodayViewerLogsAsJSON ===
        "function"
      ) {

        analysisLogBtn.onclick =
          exportTodayViewerLogsAsJSON;

      } else {

        analysisLogBtn.disabled =
          true;

      }

    }

    /* =====================================
     * Reload
     * ===================================== */

    if (reloadBtn) {

      reloadBtn.classList.remove(
        "update-alert"
      );

      reloadBtn.style.cssText =
        "";

      reloadBtn.onclick =
        async () => {

          await reloadLatestDataPreferPrefetch();

        };

    }

    /* =====================================
     * Filter
     * ===================================== */

    if (filterBtn) {

      filterBtn.onclick =
        () => {

          startProgress();

          applyFilters();

          buildSummary();

          renderSummary();

          stopProgress();

        };

    }

    /* =====================================
     * CSV Export
     * ===================================== */

    if (summaryCsvBtn) {

      summaryCsvBtn.onclick =
        exportSummaryCSV;

    }

    if (allCsvBtn) {

      allCsvBtn.onclick =
        exportAllCSV;

    }

    /* =====================================
     * Search
     * ===================================== */

    if (searchInput) {

      searchInput.addEventListener(
        "input",
        (e) => {

          State.searchText =
            e.target.value;

          if (
            isCurrentView(
              STATE.SUMMARY
            )
          ) {

            renderSummary();

          } else if (
            isCurrentView(
              STATE.DETAIL
            )
          ) {

            applyPlayerFilter(
              State.searchText,
              State.currentIsRubyBand
            );

            renderDetailTable(
              State.currentIsRubyBand,
              State.currentDetailLabel || "",
              State.currentDetailIcon || ""
            );

          } else if (
            isCurrentView(
              STATE.MATCHING
            )
          ) {

            applyMatchingFilter(
              State.searchText
            );

          }

        }
      );

    }

    /* =====================================
     * Summary Back
     * ===================================== */

    if (
      backBtn &&
      searchInput
    ) {

      backBtn.onclick =
        () => {

          State.searchText = "";

          searchInput.value = "";

          showSummaryUI(
            true
          );

        };

    }

    /* =====================================
     * Matching Open
     * ===================================== */

    if (
      matchingBtn &&
      searchInput
    ) {

      matchingBtn.onclick =
        () => {

          State.searchText = "";

          searchInput.value = "";

          showMatchingCandidates(
            true
          );

        };

    }

    /* =====================================
     * Matching Back
     * ===================================== */

    if (
      matchingBackBtn &&
      searchInput
    ) {

      matchingBackBtn.onclick =
        () => {

          State.searchText = "";

          searchInput.value = "";

          backToSummaryFromMatching(
            true
          );

        };

    }

    /* =====================================
     * My Rank
     * ===================================== */

    const myRankSelect =
      document.getElementById(
        "myRankSelect"
      );

    if (myRankSelect) {

      syncMyRankSelection(
        myRankSelect.value
      );

      myRankSelect.addEventListener(
        "change",
        (e) => {

          const selectedMyRank =
            syncMyRankSelection(
              e.target.value
            );

          log(
            `自分ランク変更：${selectedMyRank}`
          );

        }
      );

    }

    /* =====================================
     * Initialize
     * ===================================== */

    init();

  }
);
