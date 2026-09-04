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
  myStar: 7,
  myRankKey: "R7",
  recentClicks: [],
  recentClickIndex: null,
  jointModel: null,
  playerActivity: {},
  rankActivity: {},
  areaActivity: {},
  sessionStartAt: Date.now(),
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
  copyEvents: "initialdac_copy_events_"
};

const LOG_STORAGE_LIMITS = {
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
 [3400] Joint Model Loader:loadJointModel
 rank_model.json / area_model は廃止。
 過去対戦実績は joint_model.json（count集計）へ一本化。
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
 [3410] Joint Model Loader:fetchJointModelJson
========================================================= */
async function fetchJointModelJson() {

  return fetchJSON(
    "joint_model.json"
  );
}
/* =========================================================
 [3420] Joint Model Loader:applyJointModelJson
 保持しているのは count のみ。
 確率化（正規化）はロード時にここで行う。
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
 改善: updateCheckRunning を削除し、常に latest_update.json をチェック
 prefetch が実行中の場合は、prefetchInFlight で制御
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
 [4000] Application Init
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
 [6150] Phase Cycle Monitor:formatClockHms
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
 [6150b] Phase Cycle Monitor:formatClockHm
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
 [6150c] Phase Cycle Monitor:getFilterToMs
========================================================= */
function getFilterToMs() {

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

  return Date.now();
}
/* =========================================================
 [6151] Phase Cycle Monitor:getPinkSampleCount
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
 [6152] Phase Cycle Monitor:buildPhaseCycleWindowHTML
========================================================= */
function buildPhaseCycleWindowHTML(
  cycleSec,
  n,
  halfWidthSec,
  totalSec,
  colorRgb,
  textColor,
  rightOffsetPct,
  rightWidthPct,
  referenceMs,
  positionSec = cycleSec
) {

  const centerSec =
    cycleSec * n;

  const leftPct =
    rightOffsetPct +
    Math.max(
      0,
      ((positionSec - halfWidthSec) / totalSec) *
        rightWidthPct
    );

  const widthPct =
    Math.max(
      0.5,
      Math.min(
        100 - leftPct,
        ((halfWidthSec * 2) / totalSec) *
          rightWidthPct
      )
    );

  /*
   * 表のYellow/Pink判定と同じく現在時刻を起点として
   * n周期前の中心時刻を表示する。
   * 第1帯はFilterのTo時刻（秒切り捨て）より前になる
   * 最初の周期位置から開始する。
   * 黒領域はデータの古さを示す表示であり、
   * 周期計算の基準時刻には使用しない。
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
      <span
        style="
          font-size:14px;
          font-weight:bold;
          color:${textColor};
          white-space:nowrap;
        "
      >${centerClockShort}</span>
    </div>
  `;
}
/* =========================================================
 [6152a] Phase Cycle Monitor:getPhaseWindowHalfWidthSec
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
 [6153] Phase Cycle Monitor:buildPhaseCycleRowHTML
========================================================= */
function buildPhaseCycleRowHTML(mode) {

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

  const nowMs =
    Date.now();

  const filterToMs =
    getFilterToMs();

  const phaseReferenceMs =
    nowMs;

  const filterToFloorMs =
    Math.floor(
      filterToMs / 60000
    ) * 60000;

  const filterToMinuteEndMs =
    filterToFloorMs + 60000;

  /*
   * 現在時刻を基準にした周期中心のうち、
   * Filter To（秒切り捨て）の分全体
   * （xx:00〜xx:59）を含められる最初の周期を
   * 第1サイクルとする。
   */
  const firstCycleIndex =
    Math.max(
      0,
      Math.ceil(
        (
          phaseReferenceMs -
          filterToMinuteEndMs +
          1
        ) /
        (cycleSec * 1000)
      )
    );

  const totalSec =
    cycleSec * 5;

  const staleSec =
    Math.max(
      0,
      (nowMs - filterToMs) / 1000
    );

  /*
   * 左端＝現在時刻、右方向＝過去。
   * 黒領域は現在時刻からFilterのTo時刻までを示す。
   * 運用上の最大45分を基準に、全体の20%を上限とする。
   */
  const staleMaxSec =
    45 * 60;

  const stalePct =
    Math.min(
      20,
      (staleSec / staleMaxSec) * 20
    );

  const rightOffsetPct =
    stalePct;

  const rightWidthPct =
    100 - stalePct;

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
    [0, 1, 2, 3, 4]
      .map(offset => {
        const n =
          firstCycleIndex + offset;

        return buildPhaseCycleWindowHTML(
          cycleSec,
          n,
          getPhaseWindowHalfWidthSec(
            cycleSec,
            n,
            threshold,
            lambda
          ),
          totalSec,
          colorRgb,
          textColor,
          rightOffsetPct,
          rightWidthPct,
          phaseReferenceMs,
          (offset + 0.5) * cycleSec
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
          "
          title="現在時刻 ${formatClockHms(nowMs)}"
        ></div>
        ${windows}
      </div>

    </div>
  `;
}
/* =========================================================
 [6154] Phase Cycle Monitor:buildPhaseCycleMonitorHTML
========================================================= */
function buildPhaseCycleMonitorHTML() {

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
      ${buildPhaseCycleRowHTML("yellow")}
      ${buildPhaseCycleRowHTML("pink")}
    </div>
  `;
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
            ? ' <span style="background:#e0f2ff;color:#0b5da6;border-radius:3px;padding:0 4px;font-size:0.8em;" title="Phase救済枠：FinalPhaseScoreが高いため選出">P↑</span>'
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
 [6800] Joint Model Engine
 過去対戦実績の count を確率化して保持する。
 保持しているのは count のみ、確率はロード時に計算する。
 構造:
 {
   viewerTiers: {
     "<viewerTier>": {
       total: N,
       opponents: { "<opponentTier>_<area>": count, ... }
     }
   }
 }
 Phase 情報はこのモデルには含まれない。
 HistoricalScore は viewerTier × opponentTier × area の
 3軸のみで算出し、PhaseScore は別項として乗算する。
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

  return { byViewerTier };
}
/* =========================================================
 [6810] Historical Score Engine:getHistoricalScore
 HistoricalScore = P(opponentTier, area | viewerTier)
 該当データが無い場合は中立値（1.0）または
 ほぼゼロ（0.0001）を返す。
========================================================= */
function getHistoricalScore(
  viewerRankKey,
  opponentRankKey,
  area
) {
  return getHistoricalScoreDetail(
    viewerRankKey,
    opponentRankKey,
    area
  ).score;
}

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
      viewerTier: null,
      opponentTier: null
    };
  }

  const viewerTier =
    mapRankKeyToTierKey(viewerRankKey);

  const opponentTier =
    mapRankKeyToTierKey(opponentRankKey);

  const probList =
    State.jointModel.byViewerTier?.[
      viewerTier
    ];

  if (
    !probList ||
    !probList.length
  ) {
    return {
      score: 1.0,
      matched: false,
      viewerTier,
      opponentTier
    };
  }

  const hit =
    probList.find(
      o =>
        o.opponentTier === String(opponentTier) &&
        o.area === String(area)
    );

  return {
    score: hit
      ? hit.prob
      : 0.0001,
    matched: Boolean(hit),
    viewerTier,
    opponentTier
  };
}
/* =========================================================
 [6900] Candidate Score Engine
 Score = HistoricalScore × PlayerBoost × RankBoost × AreaBoost × PhaseScore
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
 [7015] Rank Weight Engine:mapRankKeyToTierKey
 内部rankKey（R1..R8 / P_A..P_G）を
 joint_model.json の tierKey（R1..R8 / PRIDE_A..PRIDE_G）へ変換する。
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
    State.myRankKey = `R${num}`;

  } else {

    State.myStar = 6;
    State.myRankKey = selectedMyRank;
  }

  return selectedMyRank;
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
 [7070b] Pink State Helpers:checkAndCleanDailyState
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
 [7071] Pink State Helpers:savePinkStateToStorage
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
 [7073b] Pink State Helpers:isPinkTargetStale
 「当日」判定：dailyKeyが変わっていれば
 前日以前のPink登録として失効させる。
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
   * Yellowと同様、新しいPink履歴が増えた直後に
   * 明示的に学習（EMA更新）を行う。
   * これ以外（getCurrentCycle経由の通常参照）では
   * calcPinkCycle は読み取り専用として動作する。
   */
  try {
    calcPinkCycle(null, { learn: true });
    savePinkStateToStorage();
  } catch (e) {
    console.warn("[pink] calcPinkCycle failed:", e);
  }

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
      predictedRank

  });

  State.recentClicks =
    State.recentClicks.slice(
      0,
      20
    );

  rebuildRecentClickIndex();

  /* 重複ガード中でない場合のみ周期学習・履歴に登録 */
  if (!isDuplicateGuard) {
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
 [7105] Realtime Boost Engine:undoLastCopiedInfo
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

  const targetName = normalizePlayerName(lastTarget.name ?? "");
  const targetShop = normalizePlayerName(lastTarget.shopname ?? "");
  const copiedAt = Number(lastTarget.time || lastTarget.copiedAt || 0);

  /* 1. Yellow周期学習サンプルの最新1件（時間一致）を取り消し */
  if (State.yellowSamples && State.yellowSamples.length > 0) {
    const yIndex = State.yellowSamples.findIndex(
      s => s.copiedAt === copiedAt || Math.abs(s.copiedAt - copiedAt) < 1000
    );
    if (yIndex >= 0) {
      State.yellowSamples.splice(yIndex, 1);
      try {
        calcYellowCycle(null, { learn: true });
      } catch (e) {
        console.warn("[undo] calcYellowCycle re-learn failed:", e);
      }
    }
  }

  /* 2. Pinkターゲット履歴を取り消し */
  const playerIdentity = `${targetName}@@${targetShop}`;
  const pinkEntry = State.pinkTargets[playerIdentity] || Object.values(State.pinkTargets || {}).find(
    e => normalizePlayerName(e?.name ?? "") === targetName && normalizePlayerName(e?.shopname ?? "") === targetShop
  );

  if (pinkEntry) {
    pinkEntry.copyCount = Math.max(0, (pinkEntry.copyCount || 1) - 1);
    if (Array.isArray(pinkEntry.history)) {
      const hIndex = pinkEntry.history.indexOf(copiedAt);
      if (hIndex >= 0) {
        pinkEntry.history.splice(hIndex, 1);
      } else {
        pinkEntry.history.pop();
      }
    }
    if (pinkEntry.copyCount <= 0 || pinkEntry.history.length === 0) {
      delete State.pinkTargets[pinkEntry.key || playerIdentity];
    }
    try {
      calcPinkCycle(null, { learn: true });
    } catch (e) {
      console.warn("[undo] calcPinkCycle re-learn failed:", e);
    }
  }

  /* 3. 遭遇履歴（EncounterHistory）を取り消し */
  const encEntry = State.encounterHistory[playerIdentity] || Object.values(State.encounterHistory || {}).find(
    e => normalizePlayerName(e?.name ?? "") === targetName && normalizePlayerName(e?.shopname ?? "") === targetShop
  );
  if (encEntry) {
    encEntry.count = Math.max(0, (encEntry.count || 1) - 1);
    if (encEntry.count <= 0) {
      delete State.encounterHistory[encEntry.key || playerIdentity];
    }
  }

  savePinkStateToStorage();

  /* 4. 取り消しイベントのログ記録 */
  logEvent("match-copied-undo", {
    player: {
      name: lastTarget.name,
      shopname: lastTarget.shopname
    },
    undoneCopiedAt: copiedAt,
    timestamp: Date.now()
  });

  if (typeof log === "function") {
    log(`[コピー取消完了] ${lastTarget.name} のマッチング記録・学習サンプルを取り消しました`);
  }

  return true;
}
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

function getBoostDecayHalfLifeSec() {

  return Number(
    State.scoringConfig
      ?.realtimeBoost
      ?.decaySec ?? 3600
  );
}

function computeBoostValue(
  entry
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
    (Date.now() - lastSeen) / 1000;

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

  const areaKey =
    String(player.area ?? "");

  if (areaKey) {

    const prev =
      State.areaActivity[
        areaKey
      ] || { count: 0 };

    State.areaActivity[
      areaKey
    ] = {
      count:
        Number(prev.count ?? 0) + 1,
      lastSeen: now
    };
  }

  saveRealtimeActivityToStorage();
}

/* =========================================================
 [7110] Realtime Boost Engine:getPlayerBoost
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
 [7120] Realtime Boost Engine:getRankBoost
========================================================= */
function getRankBoost(rankKey) {

  return computeBoostValue(
    State.rankActivity[
      String(rankKey ?? "")
    ]
  );
}
/* =========================================================
 [7130] Realtime Boost Engine:getAreaBoost
========================================================= */
function getAreaBoost(area) {

  return computeBoostValue(
    State.areaActivity[
      String(area ?? "")
    ]
  );
}
/* =========================================================
 [7140] Realtime Boost Engine:Storage Persistence
========================================================= */
const REALTIME_ACTIVITY_STORAGE_KEY =
  "matchingRealtimeActivity_v1";

function saveRealtimeActivityToStorage() {

  try {

    localStorage.setItem(
      REALTIME_ACTIVITY_STORAGE_KEY,
      JSON.stringify({
        playerActivity:
          State.playerActivity,
        rankActivity:
          State.rankActivity,
        areaActivity:
          State.areaActivity,
        viewerLastCopiedAt:
          State.viewerLastCopiedAt
      })
    );

  } catch (e) {
    /* storage unavailable: ignore */
  }
}

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

    State.areaActivity =
      parsed?.areaActivity || {};

    if (parsed?.viewerLastCopiedAt) {
      State.viewerLastCopiedAt =
        parsed.viewerLastCopiedAt;
    }

  } catch (e) {
    /* storage unavailable or corrupt: ignore */
  }
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
 [7230] Phase Engine:calcPinkCycle
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
      clamp(
        State.phaseAdjust
          ?.pink ?? 0,
        -maxShift,
        maxShift
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

function getYellowPhaseScore(player) {

  if (
    !player ||
    !player.updateDate
  ) {
    return 0;
  }

  cycleSec =
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
      State.scoringConfig
        ?.phaseError
        ?.yellowThreshold ??
      phaseCfg.display
        ?.yellowThreshold ?? 0.5
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
function computePhaseSignal(player, mode = "pink") {
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

 cycleSec =
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
     ? (Date.now() - (target.lastCopiedAt || 0)) / 1000
     : (Date.now() - ((player.lastCopiedAt || player.copiedAt || 0))) / 1000;

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
   phaseError: metrics.phaseError,
   phaseScore: metrics.phaseScore,
   decay: metrics.decay,
   finalPhaseScore: metrics.finalPhaseScore,
   threshold,
   active: metrics.finalPhaseScore > threshold
 };
}

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

   const signal =
       computePhaseSignal(player, "pink");

   if (!signal.cycleSec || !signal.active) {
       return 0;
   }

   const encounterBonus =
       getEncounterBonus(player);

   return Math.max(
       0,
       Math.min(
           1,
           Math.max(
               0,
               signal.finalPhaseScore
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
   const signal =
     computePhaseSignal(player, "pink");
   return signal.active;
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
 Score = HistoricalScore × PlayerBoost × RankBoost × AreaBoost × PhaseScore
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

    const playerBoost =
        isPinkManaged
            ? getPlayerBoost(player)
            : 1.0;

    const rankBoost =
        isPinkManaged
            ? getRankBoost(rankKey)
            : 1.0;

    const areaBoost =
        isPinkManaged
            ? getAreaBoost(player.area)
            : 1.0;

    const realtimeBoost =
        playerBoost *
        rankBoost *
        areaBoost;

    const encounterBonus =
        Number(
            getEncounterBonus(player) || 1.0
        );

    const effectivePhaseScore =
        isPinkManaged
            ? finalPhaseScore * encounterBonus
            : finalPhaseScore;

    const rawScore =
        historicalScore *
        playerBoost *
        rankBoost *
        areaBoost *
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
        viewerTier: historical.viewerTier,
        opponentTier: historical.opponentTier,
        area: String(player.area ?? ""),
        isPinkManaged,
        playerBoost,
        rankBoost,
        areaBoost,
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
        pinkThreshold: phaseCtx?.pinkThreshold ?? 0,
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

function getPlayerCycleCount(player) {

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
    (Date.now() - anchor) / 1000;

  return Math.round(
    diffSec / cycleSec
  );
}

function computePhaseContext(player) {
  const isPinkManaged = isCopiedPlayer(player);
  let metrics = null;
  let cycleSec = 0;

  if (isPinkManaged) {
   metrics = computePhaseSignal(player, "pink");
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
           (Date.now() - anchor) / 1000,
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
 [7600] Candidate Selection (score priority)
 候補は計算スコア(HistoricalScore×PlayerBoost×RankBoost×AreaBoost×PhaseScore)
 の上位順で採用する。
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
   * 対象はhistoricalMatched=trueの相手に限定し、
   * 実績のない組み合わせ（historicalScore未マッチ）
   * による過剰な救済を避ける。
   * ===================================== */
  const NORMAL_SLOT_COUNT = 8;
  const PHASE_RESCUE_SLOT_COUNT = 2;

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

      return Boolean(
        p.__detail?.historicalMatched
      );
    });

  const phaseRescueSelected =
    [...phaseRescuePool]
      .sort(
        (a, b) =>
          Number(b.__detail?.finalPhaseScore ?? 0) -
          Number(a.__detail?.finalPhaseScore ?? 0)
      )
      .slice(
        0,
        PHASE_RESCUE_SLOT_COUNT
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
/* =========================================================
 [7800] Matching Header
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
 [7810] Matching Table Renderer
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

    score:
      Number(detail.score ?? 0),

    scoreRank:
      candidateRank > 0
        ? candidateRank
        : null,

    wasInTop10:
      candidateRank >= 1 &&
      candidateRank <= 10,

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
      playerBoost:
        Number(detail.playerBoost ?? 1),
      rankBoost:
        Number(detail.rankBoost ?? 1),
      areaBoost:
        Number(detail.areaBoost ?? 1),
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
      encounterBonus:
        Number(detail.encounterBonus ?? 1),
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
 [9210] Copy Log:buildCopyCandidateSnapshot
========================================================= */
function buildCopyCandidateSnapshot() {

  const candidates =
    (State.matchingList ?? [])
      .map(p => ({
        scoreRank: p.displayRank ?? null,
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
          playerBoost:
            Number(p.__detail?.playerBoost ?? 1),
          rankBoost:
            Number(p.__detail?.rankBoost ?? 1),
          areaBoost:
            Number(p.__detail?.areaBoost ?? 1),
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
            Number(p.__detail?.effectivePhaseScore ?? 0),
          encounterBonus:
            Number(p.__detail?.encounterBonus ?? 1)
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

  const adjust =
   isPink
     ? State.phaseAdjust.pink
     : State.phaseAdjust.yellow;

  const cycleSec =
   getCurrentCycle(player);

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

  const lambda =
   Number(
     State.scoringConfig
       ?.phaseError
       ?.[isPink ? "pinkLambda" : "yellowLambda"] ?? 0.03
   );

  const folded =
   cycleSec > 0
     ? foldToCycle(
         raw,
         cycleSec
       )
     : 0;

  const metrics =
   cycleSec > 0
     ? computePhaseMetrics(
         raw,
         cycleSec,
         lambda
       )
     : {
         cycleCount: 0,
         phaseError: 0,
         phaseScore: 0,
         decay: 0,
         finalPhaseScore: 0
       };

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

   cycleSec,

   cycleCount:
     metrics.cycleCount,

   phaseError:
     metrics.phaseError,

   phaseScore:
     metrics.phaseScore,

   decay:
     metrics.decay,

   finalPhaseScore:
     metrics.finalPhaseScore
  };
}
/* =========================================================
 [9500] Candidate Event Log
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

        name:
          p.name,

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
          playerBoost:
            Number(p.__detail?.playerBoost ?? 1),
          rankBoost:
            Number(p.__detail?.rankBoost ?? 1),
          areaBoost:
            Number(p.__detail?.areaBoost ?? 1),
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
          encounterBonus:
            Number(p.__detail?.encounterBonus ?? 1),
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

  return exportTodayViewerLogsAsJSON();

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
