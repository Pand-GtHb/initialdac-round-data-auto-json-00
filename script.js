/* =========================================================
 [0000] Core Config
========================================================= */
const BASE_URL =
  "https://pand-gthb.github.io/initialdac-round-data-auto-json-00";
/* =========================================================
 [0010] View State Enum
========================================================= */
const STATE = {
  SUMMARY: "summary",
  DETAIL: "detail",
  MATCHING: "matching"
};
/* =========================================================
 [0020] Application State
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
  matchingDiagnostics: null,
  rankModel: null,
  myStar: 7,
  recentClicks: [],
  areaModel: {},
  scoringConfig: null,
  updateWatchTimer: null,
  updateCheckRunning: false,
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
 [0030] Persistence Key
========================================================= */
const PERSIST_STATE_KEY = "initialdac_viewer_pink_state_v1";
/* =========================================================
 [0040] Rank Master
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
/* =========================================================
 [0100] Rank Utility:getRankIndex(key)
========================================================= */
function getRankIndex(key) {
  return RANKS.findIndex(r => r.key === key);
}
/* =========================================================
 [0110] Rank Utility:getRankInfo
========================================================= */
function getRankInfo(key) {
  return RANKS.find(r => r.key === key) || null;
}
/* =========================================================
 [0200] View Utility:isCurrentView
========================================================= */
function isCurrentView(view) {
  return State.currentView === view;
}
/* =========================================================
 [0210] View Utility:setCurrentView
========================================================= */
function setCurrentView(view) {
  State.currentView = view;
}
/* =========================================================
 [0220] View Utility:switchDisplayView
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
 [1000] Logging Core
========================================================= */
const LOG_STORAGE_KEYS = {
  viewerLogs: "initialdac_viewer_logs",
  copyEvents: "initialdac_copy_events_"
};

const LOG_STORAGE_LIMITS = {
  viewerLogs: 300,
  copyEvents: 200
};

const MAX_LOG_LINES = 100;
/* =========================================================
 [2000] Date Utility:getNowLabelJa
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
 [2010] Date Utility:getTodayYMDJa
========================================================= */
function getTodayYMDJa() {

  const now = new Date();

  const y = now.getFullYear();
  const m = ("0" + (now.getMonth() + 1)).slice(-2);
  const d = ("0" + now.getDate()).slice(-2);

  return `${y}/${m}/${d}`;
}
/* =========================================================
 [2020] Date Utility:compactYMD
========================================================= */
function compactYMD(ymd) {
  return String(ymd || "")
    .replace(/\//g, "");
}
/* =========================================================
 [2030] Date Utility:buildDailyKey
========================================================= */
function buildDailyKey() {

  const d = new Date();

  const y = d.getFullYear();
  const m = ("0" + (d.getMonth() + 1)).slice(-2);
  const day = ("0" + d.getDate()).slice(-2);

  return `${y}${m}${day}`;
}

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
 [2040] Date Utility:formatYMDHM
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
 [2100] String Utility:normalize
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
 [2110] String Utility:normalizePlayerName
========================================================= */
function normalizePlayerName(str) {

  return String(str ?? "")
    .normalize("NFKC");
}
/* =========================================================
 [2200] Number Utility
========================================================= */
const fmt =
  n => Number(n)
    .toLocaleString();
/* =========================================================
 [2300] Progress Utility
========================================================= */
let progressTimer = null;
let progressPos = 0;
let progressLine = null;
/* =========================================================
 [2310] Progress Utility:startProgress
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
 [2320] Progress Utility:updateProgressBar
========================================================= */
function updateProgressBar() {
  if (!progressLine) return;

  const total = 20;

  const filled = "■".repeat(Math.max(0, Math.min(total, progressPos)));

  const empty = "□".repeat(Math.max(0, total - progressPos));

  progressLine.textContent = `進行中：${filled}${empty}`;
}
/* =========================================================
 [2330] Progress Utility:stopProgress
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
 [2400] Shop Utility:getZenkakuLength
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
 [2410] Shop Utility:isMostlyAscii
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
 [2420] Shop Utility:getTextWidth
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
 [2430] Shop Utility:shortenStoreName
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
 [2500] Render Utility
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
 [3000] Fetch Core
========================================================= */
async function fetchJSON(
  path,
  options = {}
) {

  const {
    cache = "no-store"
  } = options;

  const MAX_RETRY = 3;

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
      }, 10000);

    const startedAt =
      performance.now();

    try {

      const res = await fetch(
        `${BASE_URL}/${path}?t=${Date.now()}`,
        {
          cache,
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
          `${path} Timeout`
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
 [3100] Area Data Loader:loadAreaList
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
 [3110] Area Data Loader:fetchAreaListJson
========================================================= */
async function fetchAreaListJson() {
  return fetchJSON(
    "areaList.json"
  );
}
/* =========================================================
 [3120] Area Data Loader:applyAreaListJson
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
 [3200] Latest Round Loader:loadLatestRound
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
 [3210] Latest Round Loader:fetchLatestRoundJson
========================================================= */
async function fetchLatestRoundJson() {

  return fetchJSON(
    "latest_round.json"
  );
}
/* =========================================================
 [3220] Latest Round Loader:applyLatestRoundJson
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
 [3300] Latest Update Loader:loadLatestUpdate
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
 [3310] Latest Update Loader:fetchLatestUpdateJson
========================================================= */
async function fetchLatestUpdateJson() {

  return fetchJSON(
    "latest_update.json"
  );
}
/* =========================================================
 [3320] Latest Update Loader:applyLatestUpdateJson
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
 [3400] Rank Model Loader:loadRankModel
========================================================= */
async function loadRankModel() {

  log(
    "rank_model.json 取得準備中"
  );

  try {

    const json =
      await fetchRankModelJson();

    applyRankModelJson(
      json
    );

  } catch (e) {

    State.rankModel = null;

    logWarn(
      "rank_model.json 未取得：" +
      e.message
    );
  }
}
/* =========================================================
 [3410] Rank Model Loader:fetchRankModelJson
========================================================= */
async function fetchRankModelJson() {

  return fetchJSON(
    "rank_model.json"
  );
}
/* =========================================================
 [3420] Rank Model Loader:applyRankModelJson
========================================================= */
function applyRankModelJson(
  json
) {

  State.rankModel =
    json;

  log(
    "rank_model.json 読み込み完了"
  );
}
/* =========================================================
 [3500] Scoring Config Loader:loadScoringConfig
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
 [3510] Scoring Config Loader:fetchScoringConfigJson
========================================================= */
async function fetchScoringConfigJson() {

  return fetchJSON(
    "scoring_config.json"
  );
}
/* =========================================================
 [3520] Scoring Config Loader:applyScoringConfigJson
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
 [3600] Round Data Loader:fetchRoundDataJson
========================================================= */
async function fetchRoundDataJson() {

  return fetchJSON(
    "integrated_data.json"
  );
}
/* =========================================================
 [3610] Round Data Loader:applyRoundDataJson
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
/* =========================================================
 [3700] Reload & Prefetch:reloadLatestDataPreferPrefetch
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
 [3710] Reload & Prefetch:prefetchLatestRoundData
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
 [3800] Update Watch Core
========================================================= */
async function checkUpdate() {

  /* =====================================
   * 多重実行防止
   * ===================================== */

  if (State.updateCheckRunning) {

    logWarn(
      "checkUpdate重複実行を抑止"
    );

    console.warn(
      "[checkUpdate] skipped (already running)"
    );

    return;
  }

  State.updateCheckRunning =
    true;

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
        "新しいデータが公開されています。"
      );

      /* =====================================
       * 先読み開始
       * ===================================== */

      prefetchLatestRoundData(
        latest
      );
    }

  } catch (e) {

    logError(
      "latest_update.json の取得に失敗：" +
      e.message
    );

  } finally {

    State.updateCheckRunning =
      false;
  }
}
/* =========================================================
 [4000] Application Init
========================================================= */
async function init() {

  log("Viewer 初期化中");

  await initLogDB();

  restorePinkStateFromStorage();

  startProgress();

  buildRubyFilters();

  buildPrideFilters();

  try {

    const [
      areaJson,
      latestRoundJson,
      latestUpdateJson,
      rankModelJson,
      scoringConfigJson,
      roundDataJson
    ] = await Promise.all([
      fetchAreaListJson(),
      fetchLatestRoundJson(),
      fetchLatestUpdateJson(),
      fetchRankModelJson(),
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

    applyRankModelJson(
      rankModelJson
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

    await loadRankModel();

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
 [4100] DOMContentLoaded
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

    const exportJsonBtn =
      document.getElementById(
        "exportJsonBtn"
      );

    const analysisLogBtn =
      document.getElementById(
        "analysisLogBtn"
      );

    /* =====================================
     * Viewer Log Export
     * ===================================== */

    if (exportJsonBtn) {

      if (
        typeof exportViewerLogsAsJSON ===
        "function"
      ) {

        exportJsonBtn.onclick =
          exportViewerLogsAsJSON;

      } else {

        exportJsonBtn.disabled =
          true;

      }

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
/* =========================================================
 [4200] History Navigation
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
/* =========================================================
 [4300] Lifecycle Watch
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
    "更新監視開始(30秒間隔)"
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
/* =========================================================
 [5000] Filter Engine
========================================================= */
function applyFilters() {

  const minutes =
    Number(
      document.getElementById(
        "rangeSelect"
      ).value
    );

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

  State.areaModel =
    buildAreaDistribution(
      State.filtered
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
 [5100] Summary Statistics
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
/* =========================================================
 [5200] Filter UI Builder:buildFilterGroupHTML
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
 [5210] Filter UI Builder:buildRubyFilters
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
 [5220] Filter UI Builder:buildPrideFilters
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
 [5300] Summary Builder
========================================================= */
function buildSummary() {

  State.summary = [];

  const selectedStars =
    [
      ...document.querySelectorAll(
        ".ruby-filter:checked"
      )
    ]
      .map(
        x => Number(x.value)
      );

  const selectedPrides =
    [
      ...document.querySelectorAll(
        ".pride-filter:checked"
      )
    ]
      .map(
        x => x.value
      );

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
 [5400] Summary Renderer:filterSummaryBySearch
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
 [5410] Summary Renderer:renderSummary
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
 [5500] Summary Navigation
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
 [6000] Detail Navigation
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
 [6100] Detail Renderer
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
 [6200] Player Row Renderer
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
 [6300] Detail Row Renderer
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
 [6400] Matching Highlight Renderer
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
 [6500] Player Row Renderer Core
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

  highlightMatchingRows(
    tbody
  );
}
/* =========================================================
 [6600] Clipboard Action
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

  return `
    <tr
      class="${rowStateClass}"
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
        ${p.name}
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
      
      <td class="left">
        ${p.updateDate}
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
/* ---------------------------------------------------------
 [6610] copyToClipboard
--------------------------------------------------------- */
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
 [6700] Detail Filter
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
 [6800] Area Engine
========================================================= */
function buildAreaDistribution(
  list
) {

  const counts = {};

  for (
    const p of
    (list || [])
  ) {

    const k =
      String(
        p.area ?? ""
      );

    if (!k) continue;

    counts[k] =
      (counts[k] || 0) + 1;
  }

  const total =
    Object.values(
      counts
    ).reduce(
      (a, b) => a + b,
      0
    ) || 1;

  const dist = {};

  for (const k in counts) {

    dist[k] =
      counts[k] / total;
  }

  return dist;
}

function getAreaScore(
  player
) {

  const areaKey =
    String(
      player?.area ?? ""
    );

  const areaWeight =
    State.areaModel?.[
      areaKey
    ] ?? 0;

  const scale =
    Number(
      State.scoringConfig
        ?.area
        ?.scale ?? 3.0
    );

  return (
    1 +
    (
      areaWeight *
      scale
    )
  );
}
/* =========================================================
 [6890] Score Normalizer Engine
========================================================= */
function buildScoreNormalizer(
    list
) {
    const source =
        (list || [])
        .filter(
            p => p && p.updateDate
        )
        .map(p => {

            const rankScore =
                Number(
                    getRankWeight(p) || 0
                );

            const prideWeight =
                Number(
                    getPrideWeight(p) || 1
                );

            const areaFactor =
                Number(
                    getAreaScore(p) || 1
                );

            return {
                rankComponent:
                    rankScore *
                    prideWeight,

                areaComponent:
                    areaFactor
            };
        });

    const rankValues =
        source.map(
            x => x.rankComponent
        );

    const areaValues =
        source.map(
            x => x.areaComponent
        );

    return {

        rankMin:
            rankValues.length
                ? Math.min(...rankValues)
                : 0,

        rankMax:
            rankValues.length
                ? Math.max(...rankValues)
                : 1,

        areaMin:
            areaValues.length
                ? Math.min(...areaValues)
                : 0,

        areaMax:
            areaValues.length
                ? Math.max(...areaValues)
                : 1
    };
}
/* =========================================================
 [6900] Candidate Score Engine
========================================================= */
function buildCandidateScore(
    player,
    normalizer = null
) {
    const detail =
        calcMatchingScoreDetail(
            player,
            normalizer
        );

    const score =
        Number(
            detail?.score ?? 0
        );

    const phaseMultiplier =
        getPhaseSelectionMultiplier(
            player
        );

    const effectiveWeight =
        score *
        phaseMultiplier;

    const rankKey =
        getPlayerRankKey(
            player
        );

    return {
        ...player,

        __score: score,

        __detail: detail,

        __effectiveWeight:
            effectiveWeight,

        __phaseMultiplier:
            phaseMultiplier,

        __rankKey:
            rankKey
    };
}
/* =========================================================
 [7000] Rank Weight Engine:getPrideBandKey
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
 [7010] Rank Weight Engine:getPlayerRankKey
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
 [7020] Rank Weight Engine:syncMyRankSelection
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

  } else {

    State.myStar = 6;
  }

  return selectedMyRank;
}
/* =========================================================
 [7030] Rank Weight Engine:getVirtualStar
========================================================= */
function getVirtualStar(player) {

  if (
    player.onlineBattleRankId === RUBY_ID
  ) {
    return String(
      Number(player.starCnt ?? 0)
    );
  }

  if (
    Number(
      player.pridePoint ?? 0
    ) > 0
  ) {
    return "PRIDE";
  }

  return null;
}
/* =========================================================
 [7040] Rank Weight Engine:getRankWeight
========================================================= */
function getRankWeight(player) {

  const model =
    State.rankModel;

  if (!model) {
    return 0;
  }

  const myStar =
    String(State.myStar);

  const opp =
    getVirtualStar(player);

  if (!opp) {
    return 0;
  }

  const table =
    model.models?.[myStar]?.vs;

  if (!table) {
    return 0;
  }

  return Number(
    table[opp] ?? 0
  );
}
/* =========================================================
 [7050] Rank Weight Engine:getPrideWeight
========================================================= */
function getPrideWeight(player) {

  if (!State.rankModel) {
    return 1.0;
  }

  if (
    Number(
      player.pridePoint ?? 0
    ) <= 0
  ) {
    return 1.0;
  }

  const model =
    State.rankModel;

  const myStar =
    String(State.myStar);

  const dist =
    model.models?.[myStar]
      ?.pride_distribution;

  if (!dist) {
    return 1.0;
  }

  const pt =
    Number(
      player.pridePoint ?? 0
    );

  const bands =
    model.pride?.bands;

  if (!bands) {
    return 1.0;
  }

  for (const key in bands) {

    const band = bands[key];

    const min =
      Number(
        band.min ?? 0
      );

    const max =
      Number(
        band.max ?? Infinity
      );

    if (
      pt >= min &&
      pt <= max
    ) {
      return Number(
        dist[key] ?? 1.0
      );
    }
  }

  return 1.0;
}
/* =========================================================
 [7060] Rank Weight Engine:getTimeWeight
========================================================= */
function getTimeWeight(player) {

  if (
    !player ||
    !player.updateDate
  ) {
    return 0;
  }

  const now =
    Date.now();

  const last =
    parseDateJST(
      player.updateDate
    )?.getTime();

  if (
    !last ||
    !isFinite(last)
  ) {
    return 0;
  }

  const diffMin =
    (now - last) / 60000;

  if (
    !isFinite(diffMin) ||
    diffMin < 0
  ) {
    return 0;
  }

  const maxRange =
    Number(
      document.getElementById(
        "rangeSelect"
      ).value
    );

  if (
    !maxRange ||
    !isFinite(maxRange) ||
    maxRange <= 0
  ) {
    return 0;
  }

  const normalized =
    Math.max(
      0,
      1 - diffMin / maxRange
    );

  const mode =
    State.scoringConfig?.time?.mode ??
    "multiply";

  const exp =
    Number(
      State.scoringConfig?.time?.exp
      ?? 1.2
    );

  let weight;

  if (mode === "multiply") {

    weight =
      Math.pow(
        normalized,
        exp
      );

  } else if (
    mode === "linear"
  ) {

    weight =
      normalized;

  } else {

    weight =
      Math.pow(
        normalized,
        exp
      );
  }

  if (!isFinite(weight)) {
    return 0;
  }

  return weight;
}
/* =========================================================
 [7070] Pink State Helpers:buildPlayerIdentityKey
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
 [7071] Pink State Helpers:savePinkStateToStorage
========================================================= */
function savePinkStateToStorage() {
  try {
    const payload = {
      /*
       * Pink対象は当日管理のみ
       * 永続保存しない
       */
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
 [7072] Pink State Helpers:restorePinkStateFromStorage
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
     * Pink対象復元なし
     */
    State.pinkTargets = {};

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
 [7073] Pink State Helpers:getPinkTarget
========================================================= */
function getPinkTarget(player) {

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
 [7074] Pink State Helpers:registerPinkTarget
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

  return entry;

}
/* =========================================================
 [7075] Pink State Helpers:updateEncounterHistory
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
/* =========================================================
 [7076] Pink State Helpers:getEncounterHistory
========================================================= */
function getEncounterHistory(
  player
) {

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
 [7077] Pink State Helpers:getEncounterBonus
========================================================= */
function getEncounterBonus(
    player
) {
    /*
     * 方針
     * 遭遇回数による加点は行わない
     *
     * encounterHistory は引き続き管理情報として保持する。
     * ただしスコア計算には反映しない。
     *
     * 呼び出し構造維持のため、
     * 常に倍率1.0を返す。
     */
    return 1.0;
}
/* =========================================================
 [7078] Yellow State Helpers:registerYellowSample
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
   * Yellow基準周期
   *
   * 現在の学習処理は
   * 300±45秒を前提としているため
   * 保存時も300秒基準で折り畳み
   */
  const baseCycleSec = 300;

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
    calcYellowCycle();
    savePinkStateToStorage();
  } catch (e) {
    console.warn("[yellow] calcYellowCycle failed:", e);
  }

  return sample;
}
/* =========================================================
 [7100] Realtime Boost Engine:recordClickFromCopiedInfo
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
      copiedAt

  });

  State.recentClicks =
    State.recentClicks.slice(
      0,
      20
    );

  registerPinkTarget(
    player,
    copiedAt
  );

  updateEncounterHistory(
    player,
    copiedAt
  );

  /*
   * Yellow周期学習用サンプル登録
   */
  registerYellowSample(
    player,
    copiedAt
  );

  const pinkTarget =
    getPinkTarget(
      player
    );

  if (pinkTarget) {

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
              calcMatchingScoreDetail(
                player
              ).score || 0
            ).toFixed(6)
          ),

        timestamp:
          copiedAt

      }
    );

  }

}
/* =========================================================
 [7110] Realtime Boost Engine:getRealtimeBoost
========================================================= */
function getRealtimeBoost(
  player
) {

  const detail =
    getRealtimeBoostDetail(
      player
    );

  return detail.total;
}
/* =========================================================
 [7120] Realtime Boost Engine:getRealtimeBoostDetail
========================================================= */
function getRealtimeBoostDetail(
  player
) {

  if (
    !State.recentClicks.length ||
    !player
  ) {

    return {
      total: 1.0
    };
  }

  const playerRankKey =
    getPlayerRankKey(
      player
    );

  let bestLevel = 0;

  let bestDecay = 0;

  for (
    const r of
    State.recentClicks
  ) {

    const anchorTime =
      Number(
        r.copiedAt ||
        r.time ||
        0
      );

    if (!anchorTime) {
      continue;
    }

    const dtMin =
      (
        Date.now() -
        anchorTime
      ) / 60000;

    if (
      !isFinite(dtMin) ||
      dtMin < 0
    ) {
      continue;
    }

    const decay =
      Math.exp(
        -dtMin / 8
      );

    const samePlayer =
      normalizePlayerName(
        player.name
      ) ===
      normalizePlayerName(
        r.name
      ) &&
      String(
        player.updateDate ?? ""
      ) ===
      String(
        r.updateDate ?? ""
      );

    const sameRank =
      String(playerRankKey)
      ===
      String(r.rankKey);

    const sameArea =
      String(
        player.area ?? ""
      ) ===
      String(
        r.area ?? ""
      );

    let level = 0;

    if (samePlayer) {

      level = 3;

    } else if (
      sameRank &&
      sameArea
    ) {

      level = 2;

    } else if (
      sameRank ||
      sameArea
    ) {

      level = 1;
    }

    if (
      level > bestLevel
    ) {

      bestLevel = level;

      bestDecay = decay;

    } else if (
      level === bestLevel
    ) {

      bestDecay = Math.max(
        bestDecay,
        decay
      );
    }
  }

  const boostByLevel = {
    0: 1.0,
    1: 1.2,
    2: 1.6,
    3: 2.5
  };

  return {
    total:
      boostByLevel[
        bestLevel
      ] * bestDecay
  };
}
/* =========================================================
 [7200] Phase Engine:getRoundedDiffMinAndPhaseDistance
========================================================= */
function getRoundedDiffMinAndPhaseDistance(
    copiedAtMs,
    cycleMin = 5
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
        Date.now();

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
 [7210] Phase Engine:getCurrentCycle
========================================================= */
function getCurrentCycle(
  player
) {

  return isCopiedPlayer(player)
    ? calcPinkCycle(player)
    : calcYellowCycle(player);
}
/* =========================================================
 [7220] Phase Engine:calcYellowCycle
========================================================= */
function calcYellowCycle(player) {

  const cfg =
    State.scoringConfig?.phase?.yellow ?? {};

  const base =
    cfg.baseCycleSec ?? 300;

  const samples =
    State.yellowSamples ?? [];

  if (samples.length === 0) {
    return (
      base +
      clamp(
        State.phaseAdjust?.yellow ?? 0,
        -(cfg.maxShiftSec ?? 45),
        (cfg.maxShiftSec ?? 45)
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

  const maxShift =
    cfg.maxShiftSec ?? 45;

  const clamped =
    clamp(
      updated,
      -maxShift,
      maxShift
    );

  State.phaseAdjust.yellow =
    clamped;

  return base + clamped;
}
/* =========================================================
 [7230] Phase Engine:calcPinkCycle
========================================================= */
function calcPinkCycle(
  player
) {

  const cfg =
    State.scoringConfig
      ?.phase?.pink || {};

  const base =
    cfg.baseCycleSec || 300;

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
        base
      );

    if (isFinite(folded)) {
      foldedList.push(folded);
    }
  }

  if (
    foldedList.length === 0
  ) {

    return (
      base +
      (
        State.phaseAdjust
          ?.pink ?? 0
      )
    );
  }

  const sum =
    foldedList.reduce(
      (a, b) => a + b,
      0
    );

  const avg =
    sum / foldedList.length;

  const prev =
    Number(
      State.phaseAdjust
        ?.pink ?? 0
    );

  const updated =
    updateAdjust(
      prev,
      avg,
      cfg.alpha || 0.3
    );

  const maxShift =
    cfg.maxShiftSec || 45;

  const clamped =
    clamp(
      updated,
      -maxShift,
      maxShift
    );

  State.phaseAdjust.pink =
    clamped;

  return base + clamped;
}
/* =========================================================
 [7240] Phase Engine:foldToCycle
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
 [7250] Phase Engine:updateAdjust
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
 [7260] Phase Engine:clamp
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
 [7270] Phase Engine:isCopiedPlayer
========================================================= */
function isCopiedPlayer(
  player
) {

  return Boolean(
    getPinkTarget(player)
  );
}
/* =========================================================
 [7280] Phase Engine:getPhaseDistanceMin
========================================================= */
function getPhaseDistanceMin(
  copiedAtMs,
  cycleMin = 5
) {

  return getRoundedDiffMinAndPhaseDistance(
    copiedAtMs,
    cycleMin
  );
}
/* =========================================================
 [7300] Phase Candidate Judge:getYellowPhaseScore
========================================================= */
/* =====================================
 * Yellow強度評価
 * 戻り値: 0.0 ～ 1.0
 * ===================================== */
function getYellowPhaseScore(player) {

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
    (Date.now() - anchor) / 1000;

  const rSec =
    diffSec % cycleSec;

  const theta =
    (2 * Math.PI * rSec) /
    cycleSec;

  const cosValue =
    Math.cos(theta);

  return Math.max(
    0,
    cosValue
  );
}
/* =========================================================
 [7310] Phase Candidate Judge:isMatchingCandidateByPhase
========================================================= */
/* =====================================
 * Yellow判定
 * ===================================== */
function isMatchingCandidateByPhase(
  player
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
      phaseCfg.display
        ?.yellowThreshold ?? 0
    );

  const score =
    getYellowPhaseScore(
      player
    );

  return score > threshold;
}
/* =========================================================
 [7320] Phase Candidate Judge:getLatestCopiedPlayer
========================================================= */
function getLatestCopiedPlayer() {

  return (
    State.recentClicks[0] ||
    null
  );
}
/* =========================================================[
7330] Phase Candidate Judge:getPinkPhaseScore
========================================================= */
/* =====================================
 * Pink強度評価
 * 戻り値: 0.0 ～ 1.0
 * ===================================== */
function getPinkPhaseScore(
    player
) {
    if (!player) {
        return 0;
    }

    const target =
        getPinkTarget(player);

    if (!target) {
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

    const diffSec =
        (
            Date.now() -
            (
                target.lastCopiedAt || 0
            )
        ) / 1000;

    /*
     * 修正
     * コピー後1Cycleは
     * Pink評価対象外
     */
    if (diffSec < cycleSec) {
        return 0;
    }

    const theta =
        (
            2 *
            Math.PI *
            (diffSec % cycleSec)
        ) / cycleSec;

    const cosValue =
        Math.cos(theta);

    const encounterBonus =
        getEncounterBonus(player);

    return Math.max(
        0,
        Math.min(
            1,
            Math.max(
                0,
                cosValue
            ) *
            encounterBonus
        )
    );
}
/* =========================================================[
7340] Phase Candidate Judge:isMatchingCandidateByCopyPhase3
Pink管理対象に対するPink周期アクティブ判定4 （PinkPool所属判定ではない）
========================================================= */
function isMatchingCandidateByCopyPhase(player) {

    if (!player) {
        return false;
    }

    const target =
        getPinkTarget(player);

    if (!target) {
        return false;
    }

    const cycleSec =
        getCurrentCycle(player);

    if (
        !cycleSec ||
        !isFinite(cycleSec)
    ) {
        return false;
    }

    const threshold =
        Number(
            State.scoringConfig
                ?.phase
                ?.display
                ?.pinkThreshold ?? 0
        );

    const diffSec =
        (
            Date.now() -
            (
                target.lastCopiedAt || 0
            )
        ) / 1000;

    /*
     * 修正
     * コピー後1Cycle未満は
     * Pink候補扱いしない
     */
    if (diffSec < cycleSec) {
        return false;
    }

    const theta =
        (
            2 *
            Math.PI *
            (diffSec % cycleSec)
        ) / cycleSec;

    const cosValue =
        Math.cos(theta);

    return cosValue > threshold;
}
/* =========================================================
 [7400] Matching Score Engine:calcMatchingDiagnostics
========================================================= */
function calcMatchingDiagnostics(
  list
) {

  const ranked =
    [...list].sort(
      (a, b) =>
        b.__score - a.__score
    );

  const top =
    ranked
      .slice(0, 5)
      .map(
        p => p.__score || 0
      );

  const top1 =
    top[0] || 0;

  const top2 =
    top[1] || 0;

  const mean =
    top.length
      ? top.reduce(
          (a, b) => a + b,
          0
        ) / top.length
      : 0;

  return {

    gap12:
      top1 - top2,

    gap15:
      top1 -
      (top[4] || 0),

    top5Mean:
      mean,

    top1Ratio:
      mean
        ? top1 / mean
        : 0,

    totalRanked:
      ranked.length
  };
}
/* =========================================================[
7410] Matching Score Engine:calcMatchingScoreDetail
========================================================= */
function calcMatchingScoreDetail(
    player,
    normalizer = null
) {
    if (!player || !player.updateDate) {
        return { score: 0 };
    }

    const rankScore =
        Number(getRankWeight(player) || 0);

    if (
        !Number.isFinite(rankScore) ||
        rankScore <= 0
    ) {
        return { score: 0 };
    }

    const prideWeight =
        Number(getPrideWeight(player) || 1);

    const areaFactor =
        Number(getAreaScore(player) || 1);

    const timeWeight =
        Number(getTimeWeight(player) || 0);

    const safePrideWeight =
        Number.isFinite(prideWeight)
            ? prideWeight
            : 1.0;

    const safeAreaFactor =
        Number.isFinite(areaFactor)
            ? areaFactor
            : 1.0;

    const safeTimeWeight =
        Number.isFinite(timeWeight)
            ? timeWeight
            : 0;

    /* =====================================
     * Rank Component
     * ===================================== */
    const rankComponent =
        rankScore * safePrideWeight;

    /* =====================================
     * Area Component
     * ===================================== */
    const areaComponent =
        safeAreaFactor;

    /* =====================================
     * Min-Max Normalize
     * ===================================== */
    let normalizedRank = 1;
    let normalizedArea = 1;

    if (normalizer) {

        const rankRange =
            normalizer.rankMax -
            normalizer.rankMin;

        const areaRange =
            normalizer.areaMax -
            normalizer.areaMin;

        normalizedRank =
            rankRange > 0
                ? (
                    rankComponent -
                    normalizer.rankMin
                ) / rankRange
                : 1;

        normalizedArea =
            areaRange > 0
                ? (
                    areaComponent -
                    normalizer.areaMin
                ) / areaRange
                : 1;
    }

    normalizedRank =
        Math.max(
            0,
            Math.min(1, normalizedRank)
        );

    normalizedArea =
        Math.max(
            0,
            Math.min(1, normalizedArea)
        );

    /* =====================================
     * Weight Setting
     * ===================================== */
    const rawRankWeight =
        Number(
            State.scoringConfig
            ?.scoreWeights
            ?.rank ?? 0.5
        );

    const rawAreaWeight =
        Number(
            State.scoringConfig
            ?.scoreWeights
            ?.area ?? 0.5
        );

    const totalWeight =
        Math.max(
            0.0001,
            rawRankWeight +
            rawAreaWeight
        );

    const rankWeight =
        rawRankWeight /
        totalWeight;

    const areaWeight =
        rawAreaWeight /
        totalWeight;

    /* =====================================
     * Contribution
     * ===================================== */
    const rankContribution =
        normalizedRank *
        rankWeight;

    const areaContribution =
        normalizedArea *
        areaWeight;

    /* =====================================
     * Base Score
     * ===================================== */
    const baseScore =
        rankContribution +
        areaContribution;

    const rankingScore =
        baseScore *
        safeTimeWeight;

    const realtimeBoostValue =
        Number(
            getRealtimeBoost(player)
        );

    const realtimeBoost =
        Math.min(
            Number.isFinite(
                realtimeBoostValue
            )
                ? realtimeBoostValue
                : 1.0,
            2.5
        );

    const encounterBonus =
        Number(
            getEncounterBonus(player) || 1.0
        );

    const selectionWeight =
        rankingScore *
        (
            1 +
            (realtimeBoost - 1) * 0.4
        ) *
        encounterBonus;

    const safeScore =
        Number.isFinite(selectionWeight) &&
        selectionWeight > 0
            ? selectionWeight
            : 0.0001;

    const rankRatio =
        Math.round(
            rankContribution /
            Math.max(
                0.0001,
                rankContribution +
                areaContribution
            ) * 100
        );

    const areaRatio =
        100 - rankRatio;

    return {
        score: safeScore,

        rankComponent,
        areaComponent,

        normalizedRank,
        normalizedArea,

        rankContribution,
        areaContribution,

        rankRatio,
        areaRatio,

        rankWeight,
        areaWeight,

        baseScore,
        rankingScore,

        realtimeBoost,
        encounterBonus
    };
}
/* =========================================================
 [7420] Matching Score Engine:calcMatchingScore
========================================================= */
function calcMatchingScore(
  player
) {

  return calcMatchingScoreDetail(
    player
  ).score;
}
/* =========================================================
 [7500] PhaseSelectionMultiplier
========================================================= */
function getPhaseSelectionMultiplier(player) {

  /* =====================================
   * 安全取得
   * ===================================== */
  const candidateCfg =
    State.scoringConfig?.candidate ?? {};

  const yellowBoost =
    Number(candidateCfg.yellowBoost ?? 2.0);

  const pinkBoost =
    Number(candidateCfg.pinkBoost ?? 2.5);

  const phasePower =
    Number(candidateCfg.phasePower ?? 2.0);

  /* =====================================
   * Pool優先度
   * ===================================== */
  const poolPriority =
    candidateCfg.poolPriority ?? {};

  const pinkPriority =
    Number(poolPriority.pink ?? 3);

  const yellowPriority =
    Number(poolPriority.yellow ?? 2);

  const otherPriority =
    Number(poolPriority.other ?? 1);

  /* =====================================
   * Pink周期判定
   * （Pink管理対象かつ閾値超過）
   * ===================================== */
  const pinkPhaseScore =
    getPinkPhaseScore(player);

  const pinkThreshold =
    Number(
      State.scoringConfig
        ?.phase
        ?.display
        ?.pinkThreshold ?? 0
    );

  const isPink =
    isCopiedPlayer(player) &&
    pinkPhaseScore > pinkThreshold;

  /* =====================================
   * Yellow周期判定
   * ===================================== */
  const isYellow =
    !isCopiedPlayer(player) &&
    isMatchingCandidateByPhase(player);

  /* =====================================
   * Pink補正
   * ===================================== */
  if (isPink) {

    const score =
      Math.max(
        0,
        pinkPhaseScore
      );

    const multiplier =
      1 +
      (
        (pinkBoost - 1)
        *
        Math.pow(
          score,
          phasePower
        )
      );

    return Math.max(
      1,
      multiplier * pinkPriority
    );
  }

  /* =====================================
   * Yellow補正
   * ===================================== */
  if (isYellow) {

    const score =
      Math.max(
        0,
        getYellowPhaseScore(player)
      );

    const multiplier =
      1 +
      (
        (yellowBoost - 1)
        *
        Math.pow(
          score,
          phasePower
        )
      );

    return Math.max(
      1,
      multiplier * yellowPriority
    );
  }

  /* =====================================
   * Other
   * ===================================== */
  return otherPriority;
}
/* =========================================================
 [7600] Weighted Selection
========================================================= */
function selectByWeight(
  players,
  count
) {

  const result = [];

  let pool =
    [...players];

  for (
    let i = 0;
    i < count &&
    pool.length > 0;
    i++
  ) {

    const total =
      pool.reduce(
        (sum, p) =>
          sum +
          (
            p.__effectiveWeight ??
            p.__weight ??
            p.__score ??
            0
          ),
        0
      );

    if (total <= 0) {
      break;
    }

    let r =
      Math.random() * total;

    for (
      let j = 0;
      j < pool.length;
      j++
    ) {

      r -= (
        pool[j]
          .__effectiveWeight ??
        pool[j]
          .__weight ??
        pool[j]
          .__score ??
        0
      );

      if (r <= 0) {

        result.push(
          pool[j]
        );

        pool.splice(
          j,
          1
        );

        break;
      }
    }
  }

  return result;
}
/* =========================================================
 [7700] Candidate Builder
========================================================= */
function buildMatchingCandidates() {

  const selectedStars =
    [...document.querySelectorAll(".ruby-filter:checked")]
      .map(x => Number(x.value));

  const selectedPrides =
    [...document.querySelectorAll(".pride-filter:checked")]
      .map(x => x.value);

  const base =
    State.filtered;

  /* =====================================
   * スコア計算
   * ===================================== */
  const normalizer =
    buildScoreNormalizer(base);

  const scoredAll =
    base.map(p =>
      buildCandidateScore(
        p,
        normalizer
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
   * rankModelフィルタ
   * ===================================== */
  const filteredByRankModel =
    filteredByUi.filter(
      p =>
        Number(
          p.__detail?.rankingScore ?? 0
        ) > 0
    );

  let analysisBase =
    (
      filteredByRankModel.length > 0
    )
      ? filteredByRankModel
      : filteredByUi;

  /* =====================================
   * cooldown
   * ===================================== */
  const afterCooldown =
    analysisBase.filter(p => {

      const pinkTarget =
        getPinkTarget(p);

      const click =
        State.recentClicks.find(
          r =>
            normalizePlayerName(r.name)
            ===
            normalizePlayerName(p.name)
            &&
            String(
              r.shopname ?? ""
            )
            ===
            String(
              p.shopname ?? ""
            )
        );

      const copiedAt =
        pinkTarget?.lastCopiedAt ||
        click?.copiedAt ||
        click?.time ||
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
       * Pink / Yellow 共通で
       * 初回1サイクルは除外
       */
      if (
        phase.isInitialCooldown
      ) {
        return false;
      }

      return true;

    });

  /* =====================================
   * Pink / Yellow Pool 分離
   * ===================================== */

  /*
   * Pink管理対象は全員PinkPool
   */
  const pinkPool =
    afterCooldown.filter(
      p => isCopiedPlayer(p)
    );

  /*
   * Yellow管理対象
   * （Pink管理対象は除外）
   */
  const yellowPool =
    afterCooldown.filter(
      p =>
        !isCopiedPlayer(p) &&
        isMatchingCandidateByPhase(p)
    );

  /*
   * その他
   */
  const otherPool =
    afterCooldown.filter(
      p =>
        !pinkPool.includes(p) &&
        !yellowPool.includes(p)
    );

  /* =====================================
   * 抽選母集団
   * Pink / Yellow 優先
   * ===================================== */
  const primaryPool = [
    ...pinkPool.sort(
      (a, b) =>
        b.__effectiveWeight -
        a.__effectiveWeight
    ),

    ...yellowPool.sort(
      (a, b) =>
        b.__effectiveWeight -
        a.__effectiveWeight
    )
  ];

  const fallbackPool =
    otherPool.sort(
      (a, b) =>
        b.__effectiveWeight -
        a.__effectiveWeight
    );

  let rankedAll = [];

  const primaryCount =
    primaryPool.length;

  const targetCount =
    Math.min(
      10,
      afterCooldown.length
    );

  if (
    primaryCount >=
    targetCount
  ) {

    rankedAll =
      primaryPool;

  } else {

    const shortage =
      targetCount -
      primaryCount;

    rankedAll = [
      ...primaryPool,

      ...fallbackPool.slice(
        0,
        shortage
      )
    ];
  }

  State.matchingRankedAll =
    rankedAll;

  /* =====================================
   * 分布抽選
   * ===================================== */

  const totalCount =
    Math.min(
      10,
      rankedAll.length
    );

  const myStar =
    String(
      State.myStar
    );

  const dist =
    State.rankModel
      ?.models?.[myStar]
      ?.vs;

  let selected = [];

  if (
    dist &&
    totalCount > 0
  ) {

    const quota = {};

    let sum = 0;

    const entries =
      Object.entries(dist);

    entries.forEach(
      ([key, ratio]) => {

        const cnt =
          Math.floor(
            ratio * totalCount
          );

        quota[key] = cnt;

        sum += cnt;
      }
    );

    const sortedKeys =
      entries
        .sort(
          (a, b) =>
            b[1] - a[1]
        )
        .map(
          x => x[0]
        );

    let idx = 0;

    while (
      sum < totalCount &&
      sortedKeys.length > 0
    ) {

      const key =
        sortedKeys[
          idx %
          sortedKeys.length
        ];

      quota[key] =
        (quota[key] || 0) + 1;

      sum++;

      idx++;
    }

    const poolByRank = {};

    rankedAll.forEach(p => {

      const key =
        p.__rankKey;

      if (!poolByRank[key]) {
        poolByRank[key] = [];
      }

      poolByRank[key].push(p);
    });

    for (
      const rankKey in quota
    ) {

      const need =
        quota[rankKey] ?? 0;

      if (need <= 0) {
        continue;
      }

      const pool =
        poolByRank[rankKey] ?? [];

      if (pool.length === 0) {
        continue;
      }

      /* =====================================
       * ランク内上位候補を優先
       * ===================================== */

      const sortedPool =
        [...pool].sort(
          (a, b) =>
            b.__effectiveWeight -
            a.__effectiveWeight
        );

      selected.push(
        ...sortedPool.slice(
          0,
          Math.min(
            need,
            sortedPool.length
          )
        )
      );
    }

    if (
      selected.length <
      totalCount
    ) {

      const existingKeys =
        new Set(
          selected.map(
            p =>
              normalizePlayerName(
                p.name
              )
              + "@@"
              +
              String(
                p.updateDate ?? ""
              )
          )
        );

      const rest =
        rankedAll.filter(
          p =>
            !existingKeys.has(
              normalizePlayerName(
                p.name
              )
              + "@@"
              +
              String(
                p.updateDate ?? ""
              )
            )
        );

      const need =
        totalCount -
        selected.length;

      if (
        need > 0 &&
        rest.length > 0
      ) {

        selected.push(
          ...selectByWeight(
            rest,
            need
          )
        );
      }
    }

  } else {

    selected =
      rankedAll.slice(
        0,
        totalCount
      );
  }

  /* =====================================
   * 重複排除
   * ===================================== */

  const uniq =
    new Set();

  selected =
    selected.filter(p => {

      const key =
        normalizePlayerName(
          p.name
        )
        + "@@"
        +
        String(
          p.updateDate ?? ""
        );

      if (
        uniq.has(key)
      ) {
        return false;
      }

      uniq.add(key);

      return true;
    });

  /* =====================================
   * ソート
   * ===================================== */

  selected.sort(
    (a, b) =>
      b.__effectiveWeight -
      a.__effectiveWeight
  );

  selected.forEach(
    (p, i) => {

      p.displayRank =
        i + 1;
    }
  );

  State.matchingList =
    selected;

  log(
    `候補生成: Base=${base.length} / Selected=${selected.length}  Yellow周期=${Math.round(calcYellowCycle())}秒  Pink周期=${Math.round(calcPinkCycle())}秒`
  );

  saveCandidateEvent();
}
/* =========================================================
 [7800] Matching Header
========================================================= */
function renderMatchingHeader() {

  const headerEl =
    document.getElementById(
      "matchingHeader"
    );

  if (!headerEl) {
    return;
  }

  if (
    !State.matchingList.length
  ) {

    headerEl.innerHTML =
      "<span>マッチング候補は現在 0人です。</span>";

    return;
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

  headerEl.innerHTML =
    parts.join("");
}
/* =========================================================
 [7810] Matching Table Renderer
========================================================= */
function renderMatchingTable() {

  const area =
    document.getElementById(
      "matchingArea"
    );

  if (!area) return;

  const total =
    State.matchingList.length;

  area.innerHTML = `
    <h3>
      マッチング候補：
      <span id="matchingCount">
        ${fmt(total)}
      </span>人
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

        <tbody id="matchingTableBody"></tbody>

      </table>

    </div>
  `;

  renderMatchingRows(
    State.matchingList
  );
}
/* =========================================================
 [7820] Matching Row Renderer
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
 [7900] Matching Navigation:showMatchingCandidates
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
 [7910] Matching Navigation:backToSummaryFromMatching
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
/* =========================================================
 [7920] Matching Navigation:clearSearch
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
 [8000] Export Core
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

  const blob =
    new Blob(
      [csv],
      {
        type:
          "text/csv;charset=utf-8"
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
 [8100] Summary Export
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
 [8200] Record Export
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
 [9000] Viewer Log Core:appendLog
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

  saveViewerLogToStorage({
    savedAt: t,
    type,
    message:
      String(
        msg ?? ""
      ),
    currentView:
      State.currentView || "",
    generatedAt:
      State.generatedAt || "",
    latestRound:
      State.latestRound || "",
    latestUpdateAt:
      State.latestUpdateAt || ""
  });
}
/* =========================================================
 [9010] Viewer Log Core:allowLog
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
/* =========================================================
 [9100] Viewer Log Storage:pushStoredRecord
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
 [9110] Viewer Log Storage:saveViewerLogToStorage
========================================================= */
function saveViewerLogToStorage(
  payload
) {

  pushStoredRecord(
    LOG_STORAGE_KEYS.viewerLogs,
    payload,
    LOG_STORAGE_LIMITS.viewerLogs
  );
}
/* =========================================================
 [9120] Viewer Log Storage:readStoredArraySafe
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
 [9130] Viewer Log Storage:writeStoredArraySafe
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
 [9200] Copy Log
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

      dk:
        buildDailyKey(),

      n:
        "",

      s:
        0,

      p:
        0,

      r:
        0,

      c:
        -1,

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

  const phaseInfo =
    getPhaseAnalysis(
      player
    );

  let phaseScore = 0;

  try {

    const cycleSec =
      phaseInfo.cycleSec || 300;

    const rawSec =
      phaseInfo.raw || 0;

    const theta =
      (
        2 *
        Math.PI *
        (
          rawSec %
          cycleSec
        )
      ) /
      cycleSec;

    phaseScore =
      Math.cos(theta);

  } catch (e) {

    phaseScore = 0;

  }

  const copyCandidateSnapshot =
    buildCopyCandidateSnapshot();

  const record = {

    t:
      Date.now(),

    dk:
      buildDailyKey(),

    n:
      player.name ?? "",

    s:
      Number(
        detail.score ?? 0
      ),

    p:
      Number(
        detail.phaseWeight ?? 0
      ),

    r:
      Number(
        detail.realtimeBoost ?? 0
      ),

    c:
      candidateRank,

    ph:
      Number(
        phaseScore.toFixed(
          4
        )
      ),

    pm:
      phaseInfo.mode,

    pc:
      phaseInfo.cycleSec,

    pa:
      phaseInfo.adjust,

    pf:
      phaseInfo.folded,

    pr:
      phaseInfo.raw,

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
 [9210] Copy Log:buildCopyCandidateSnapshot
========================================================= */
function buildCopyCandidateSnapshot() {

  const candidates =
    (State.matchingList ?? [])
      .map(p => ({
        name: p.name,
        shopname: p.shopname ?? "",
        displayRank: p.displayRank ?? null,
        score: Number(
          (p.__score ?? 0).toFixed(6)
        ),
        phaseMultiplier: Number(
          (p.__phaseMultiplier ?? 0).toFixed(4)
        ),
        rankRatio:
          p.__detail?.rankRatio ?? 0,
        areaRatio:
          p.__detail?.areaRatio ?? 0,
        pinkTarget:
          isCopiedPlayer(p),
        encounterCount:
          getEncounterHistory(p)?.count ?? 0
      }));

  return {
    candidateCount:
      candidates.length,
    candidates
  };

}

/* =========================================================
 [9300] Phase Analysis
========================================================= */
function getPhaseAnalysis(
  player
) {

  /* =====================================
   * コピー履歴取得
   * ===================================== */

  const clicks =
    State.recentClicks.filter(
      r =>
        normalizePlayerName(
          r.name
        ) ===
        normalizePlayerName(
          player.name
        )
    );

  /* =====================================
   * モード判定
   * ===================================== */

  const isPink =
    clicks.length >= 2;

  const base =
    300;

  /* =====================================
   * 最新クリック
   * ===================================== */

  const click =
    clicks.length > 0
      ? clicks[0]
      : null;

  /* =====================================
   * raw計算
   * ===================================== */

  let raw = 0;

  if (isPink) {

    raw =
      click
        ? (
            Date.now() -
            (
              click.copiedAt ??
              click.time
            )
          ) / 1000
        : 0;

  } else {

    const last =
      parseDateJST(
        player.updateDate
      )?.getTime();

    raw =
      last
        ? (
            Date.now() -
            last
          ) / 1000
        : 0;
  }

  /* =====================================
   * folded
   * ===================================== */

  const folded =
    foldToCycle(
      raw,
      base
    );

  /* =====================================
   * adjust
   * ===================================== */

  const adjust =
    isPink
      ? State.phaseAdjust.pink
      : State.phaseAdjust.yellow;

  /* =====================================
   * cycle
   * ===================================== */

  const cycle =
    base +
    clamp(
      adjust,
      -45,
      45
    );

  /* =====================================
   * cosValue
   * ===================================== */

  let cosValue = 0;

  if (
    cycle > 0 &&
    isFinite(cycle)
  ) {

    const remainder =
      raw % cycle;

    const theta =
      (
        2 *
        Math.PI *
        remainder
      ) / cycle;

    cosValue =
      Math.cos(theta);
  }

  /* =====================================
   * return
   * ===================================== */

  return {

    mode:
      isPink
        ? 1
        : 0,

    raw,

    folded,

    adjust,

    cycleSec:
      cycle,

    cosValue
  };
}
/* =========================================================
 [9500] Candidate Event Log
========================================================= */
function saveCandidateEvent() {

  const now =
    Date.now();

  const yellowCycle =
    300 +
    clamp(
      State.phaseAdjust?.yellow ?? 0,
      -45,
      45
    );

  const pinkCycle =
    300 +
    clamp(
      State.phaseAdjust?.pink ?? 0,
      -45,
      45
    );

  /*
   * Yellow学習状況
   */
  const yellowSamples =
    State.yellowSamples ?? [];

  const baseCycleSec = 300;

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

  const record = {

    t: now,

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

    candidateCount:
      State.matchingList.length,

    candidates:
      State.matchingList.map(p => ({

        name:
          p.name,

        score:
          Number(
            (p.__score ?? 0)
              .toFixed(6)
          ),

        phaseMultiplier:
          Number(
            (
              p.__phaseMultiplier ?? 0
            ).toFixed(4)
          ),

        rankComponent:
          Number(
            (
              p.__detail?.rankComponent ?? 0
            ).toFixed(6)
          ),

        areaComponent:
          Number(
            (
              p.__detail?.normalizedArea ?? 0
            ).toFixed(6)
          ),

        rankRatio:
          p.__detail?.rankRatio ?? 0,

        areaRatio:
          p.__detail?.areaRatio ?? 0,

        pinkTarget:
          isCopiedPlayer(p),

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
 [9600] IndexedDB Schema
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
 [9700] IndexedDB Core:initLogDB
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
 [9710] IndexedDB Core:putLog
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
 [9720] IndexedDB Core:logEvent
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
/* =========================================================
 [9800] IndexedDB Export:downloadJSON
========================================================= */
function downloadJSON(
  data
) {

  const blob =
    new Blob(
      [
        JSON.stringify(
          data,
          null,
          2
        )
      ],
      {
        type:
          "application/json"
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
    "viewer_analysis_logs.json";

  a.click();

  URL.revokeObjectURL(
    url
  );
}

/* =========================================================
 [9900] JSON Export
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

    candidateEvents: []

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
            LOG_STORE.candidateEvents
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

  const blob =
    new Blob(
      [
        JSON.stringify(
          payload,
          null,
          2
        )
      ],
      {
        type:
          "application/json;charset=utf-8"
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

  a.href =
    url;

  a.download =
    filename;

  a.click();

  URL.revokeObjectURL(
    url
  );

  log(
    `分析JSON出力完了: ${filename}`
  );

}
/* =========================================================
 [9910] Viewer Log Export
========================================================= */
async function exportViewerLogsAsJSON() {

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
    `[viewer-log] rawDate=${rawDate} dateKey=${dateKey}`
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

  const viewerLogs =
    readStoredArraySafe(
      LOG_STORAGE_KEYS.viewerLogs
    );

  const filteredViewerLogs =
    viewerLogs.filter(
      log => {

        if (
          !log?.savedAt
        ) {
          return false;
        }

        const ts =
          Date.parse(
            log.savedAt.replace(
              /\//g,
              "-"
            )
          );

        return (
          !Number.isNaN(
            ts
          ) &&
          ts >= startTs &&
          ts <= endTs
        );

      }
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

    viewerLogs:
      filteredViewerLogs

  };

  const filename =
    `viewer_runtime_${dateKey}.json`;

  const blob =
    new Blob(
      [
        JSON.stringify(
          payload,
          null,
          2
        )
      ],
      {
        type:
          "application/json;charset=utf-8"
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

  a.href =
    url;

  a.download =
    filename;

  a.click();

  URL.revokeObjectURL(
    url
  );

  log(
    `ViewerLog出力完了: ${filename}`
  );

}
