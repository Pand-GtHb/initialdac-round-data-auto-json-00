/* =========================================================
 [100] Core Config
========================================================= */

const BASE_URL =
  "https://pand-gthb.github.io/initialdac-round-data-auto-json-00";
/* =========================================================
 [110] View State Enum
========================================================= */

const STATE = {
  SUMMARY: "summary",
  DETAIL: "detail",
  MATCHING: "matching"
};
/* =========================================================
 [120] Application State
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
  myStar: 6,

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
  }
};
/* =========================================================
 [130] Rank Master
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
 [140] Rank Utility
========================================================= */

function getRankIndex(key) {
  return RANKS.findIndex(r => r.key === key);
}

function getRankInfo(key) {
  return RANKS.find(r => r.key === key) || null;
}
/* =========================================================
 [150] View Utility
========================================================= */

function isCurrentView(view) {
  return State.currentView === view;
}

function setCurrentView(view) {
  State.currentView = view;
}

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
 [200] Logging Core
========================================================= */

const LOG_STORAGE_KEYS = {
  viewerLogs: "initialdac_viewer_logs",
  copyEvents: "initialdac_copy_events_",
  matchingSnapshots: "initialdac_matching_snapshots_"
};

const LOG_STORAGE_LIMITS = {
  viewerLogs: 300,
  copyEvents: 200,
  matchingSnapshots: 100
};

const MAX_LOG_LINES = 100;

/* =========================================================
 [300] Date Utility
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

function getTodayYMDJa() {

  const now = new Date();

  const y = now.getFullYear();
  const m = ("0" + (now.getMonth() + 1)).slice(-2);
  const d = ("0" + now.getDate()).slice(-2);

  return `${y}/${m}/${d}`;
}

function compactYMD(ymd) {
  return String(ymd || "")
    .replace(/\//g, "");
}

function buildDailyKey() {

  const d = new Date();

  const y = d.getFullYear();
  const m = ("0" + (d.getMonth() + 1)).slice(-2);
  const day = ("0" + d.getDate()).slice(-2);

  return `${y}${m}${day}`;
}

const parseDateJST = str => {

  if (!str || typeof str !== "string") {
    return null;
  }

  let s = str.trim();

  s = s.replace(/\//g, "-");

  if (s.includes(" ")) {
    s = s.replace(" ", "T");
  }

  if (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)
  ) {
    s += ":00";
  }

  s += "+09:00";

  const d = new Date(s);

  return isNaN(d.getTime())
    ? null
    : d;
};

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
 [310] String Utility
========================================================= */

function normalize(s) {

  if (!s) {
    return "";
  }

  s = s.replace(/\u3000/g, " ");

  s = s.replace(
    /[A-Za-z0-9]/g,
    ch =>
      String.fromCharCode(
        ch.charCodeAt(0) + 0xFEE0
      )
  );

  s = s.toLowerCase();

  s = s.replace(
    /[\u3041-\u3096]/g,
    ch =>
      String.fromCharCode(
        ch.charCodeAt(0) + 0x60
      )
  );

  s = s.replace(/ /g, "");

  return s;
}

function normalizePlayerName(str) {

  return String(str ?? "")
    .normalize("NFKC");
}

/* =========================================================
 [320] Number Utility
========================================================= */

const fmt =
  n => Number(n)
    .toLocaleString();

/* =========================================================
 [330] Progress Utility
========================================================= */

let progressTimer = null;
let progressPos = 0;
let progressLine = null;

function startProgress() {

  const box =
    document.getElementById("logBox");

  if (progressLine) {
    progressLine.remove();
  }

  progressPos = 0;

  progressLine =
    document.createElement("div");

  progressLine.style.color =
    "#ffeb3b";

  box.prepend(progressLine);

  updateProgressBar();

  progressTimer =
    setInterval(() => {

      progressPos =
        (progressPos + 1) % 20;

      updateProgressBar();

    }, 120);
}

function updateProgressBar() {

  const total = 20;

  const filled =
    "■".repeat(progressPos);

  const empty =
    "□".repeat(
      total - progressPos
    );

  progressLine.textContent =
    `進行中：${filled}${empty}`;
}

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
 [340] Shop Utility
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
 [350] Render Utility
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
 [400] Fetch Core
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
 [410] Area Data Loader
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

async function fetchAreaListJson() {
  return fetchJSON(
    "areaList.json"
  );
}

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
 [420] Latest Round Loader
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

async function fetchLatestRoundJson() {

  return fetchJSON(
    "latest_round.json"
  );
}

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
 [430] Latest Update Loader
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

async function fetchLatestUpdateJson() {

  return fetchJSON(
    "latest_update.json"
  );
}

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
 [440] Rank Model Loader
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

async function fetchRankModelJson() {

  return fetchJSON(
    "rank_model.json"
  );
}

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
 [450] Round Data Loader
========================================================= */

async function fetchRoundDataJson() {

  return fetchJSON(
    "integrated_data.json"
  );
}

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
 [460] Reload & Prefetch
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

      await loadRoundData();
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
 [470] Update Watch Core
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
 [900] Application Init
========================================================= */

async function init() {

  log("Viewer 初期化中");

  await initLogDB();

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

    await loadRoundData();

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
 [910] DOMContentLoaded
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
        typeof exportTodayViewerLogsAsJSON ===
        "function"
      ) {

        exportJsonBtn.onclick =
          exportTodayViewerLogsAsJSON;

      } else {

        exportJsonBtn.disabled =
          true;
      }
    }

    /* =====================================
     * Analysis Log Export
     * ===================================== */

    if (analysisLogBtn) {

      analysisLogBtn.onclick =
        exportTodayLogsAsJSON;
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
 [920] History Navigation
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
 [930] Lifecycle Watch
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
 [500] Filter Engine
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
 [510] Summary Statistics
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
 [520] Filter UI Builder
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
 [530] Summary Builder
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
 [540] Summary Renderer
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
          } =
            calcStats(
              r.list,
              total
            );

          return `
            <tr
              class="clickable"
              data-key="${r.key}"
            >
              <td class="center">
                ${r.icon}
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
                    style="width:${percent}%;">
                  </div>
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

  State.currentDetailKey =
    "";

  State.currentDetailLabel =
    "";

  State.currentDetailIcon =
    "";

  setCurrentView(
    STATE.SUMMARY
  );

  switchDisplayView(
    STATE.SUMMARY
  );
}
/* =========================================================
 [550] Summary Navigation
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
 [600] Detail Navigation
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
 [610] Detail Renderer
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
            ? `${bandIcon}`
            : ""
        }
      </span>

      <span>${bandLabel}</span>

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
            <th>称号</th>
            <th>Last Update</th>
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
 [620] Player Row Renderer
========================================================= */

function buildPlayerRowHTML(p) {

  const titleUrl =
    p.mytitleId
      ? `https://initiald.sega.jp/inidac/ranking-images/title/${p.mytitleId}.png`
      : "";

  const isRuby =
    p.onlineBattleRankId === RUBY_ID &&
    p.starCnt;

  const starOrLevel =
    isRuby
      ? renderStars(p.starCnt)
      : p.pridePoint;

  const fullShop =
    p.shopname ?? "";

  const shortShop =
    shortenStoreName(fullShop);

  const safeName =
    String(p.name ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"');

  const safeShop =
    String(fullShop ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/"/g, "&quot;");

  const copyValue =
    isRuby
      ? `★${"★".repeat(p.starCnt - 1)}\t${safeName}`
      : `${p.pridePoint}\t${safeName}`;

  return `
    <tr data-updated="${p.updateDate}">
      <td class="center clickable"
          onclick="copyToClipboard('${copyValue}')">
        ${starOrLevel}
      </td>

      <td class="left player-name clickable"
          onclick="copyToClipboard('${safeName}')">
        ${p.name}
      </td>

      <td class="right">
        ${fmt(p.point)}
      </td>

      <td class="left clickable"
          data-fullname="${safeShop}"
          onclick="copyToClipboard('${safeShop}')">

        <div class="store-name">
          ${shortShop}
        </div>

      </td>

      <td class="center">
        ${
          titleUrl
            ? `${titleUrl}`
            : ""
        }
      </td>

      <td class="left">
        ${p.updateDate}
      </td>

    </tr>
  `;
}

function highlightMatchingRows(tbody) {

  if (!tbody) return;

  tbody.querySelectorAll("tr")
    .forEach(tr => {

      const updated =
        tr.dataset.updated || "";

      const nameCell =
        tr.querySelector(
          ".player-name"
        );

      const rowName =
        nameCell
          ? String(
              nameCell.textContent
            ).trim()
          : "";

      const shopCell =
        tr.querySelector(
          ".store-name"
        );

      const rowShop =
        shopCell
          ? String(
              shopCell.textContent
            ).trim()
          : "";

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
      .map(
        p =>
          buildPlayerRowHTML(p)
      )
      .join("");

  tbody.innerHTML =
    rows;

  highlightMatchingRows(
    tbody
  );
}

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
 [630] Clipboard Action
========================================================= */
function copyToClipboard(text) {
  const afterCopySuccess = () => {

    saveMatchingSnapshot();

    const copyRecord =
      saveCopyEventUnified(text);

    logEvent(
      "copy",
      copyRecord
    );

    recordClickFromCopiedText(text);

    const player =
      findPlayerFromCopiedText(text);

    if (player) {

      const clicks =
        State.recentClicks.filter(
          r =>
            normalizePlayerName(r.name) ===
            normalizePlayerName(player.name)
        );

      if (clicks.length === 1) {
        calcYellowCycle(player);
      }

      if (clicks.length >= 2) {
        calcPinkCycle(player);
      }
    }

    log(`コピー: ${text}`);

    buildMatchingCandidates();

    if (isCurrentView(STATE.MATCHING)) {

      renderMatchingHeader();
      renderMatchingTable();

    } else if (isCurrentView(STATE.DETAIL)) {

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
    .catch(() =>
      logError("コピー失敗")
    );
}

/* =========================================================
 [640] Detail Filter
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
 [650] Area Engine
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
 [660] Candidate Score Engine
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

    __rankKey:
      rankKey,

    __score:
      score,

    __phaseMultiplier:
      Number(
        phaseMultiplier.toFixed(
          4
        )
      ),

    __effectiveWeight:
      Number(
        effectiveWeight.toFixed(
          6
        )
      ),

    __detail:
      detail
  };
}
/* =========================================================
 [700] Rank Weight Engine
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

function syncMyRankSelection(
  rankValue
) {

  const selectedMyRank =
    rankValue || "R6";

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
 [710] Realtime Boost Engine
========================================================= */

function recordClickFromCopiedText(text) {

  if (!text) return;

  const player =
    findPlayerFromCopiedText(text);

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
    getPlayerRankKey(player);

  State.recentClicks.unshift({
    name: player.name,

    area: player.area,

    areaName: areaName,

    shopname: player.shopname,

    starCnt: player.starCnt,

    pridePoint: player.pridePoint,

    rankKey: rankKey,

    updateDate: player.updateDate,

    time: copiedAt,

    copiedAt: copiedAt
  });

  State.recentClicks =
    State.recentClicks.slice(
      0,
      20
    );
}

function findPlayerFromCopiedText(text) {

  if (!text) {
    return null;
  }

  let name =
    String(text);

  if (
    name.includes("\t")
  ) {

    const parts =
      name.split("\t");

    name =
      parts[
        parts.length - 1
      ];
  }

  const targetName =
    normalizePlayerName(
      name
    );

  if (!targetName) {
    return null;
  }

  return (
    State.all.find(
      p =>
        normalizePlayerName(
          p.name
        ) === targetName
    ) || null
  );
}

function getRealtimeBoost(
  player
) {

  const detail =
    getRealtimeBoostDetail(
      player
    );

  return detail.total;
}

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
 [720] Phase Engine
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

    return {
      ...emptyResult,
      cooldownRemainingSec:
        Infinity
    };
  }

  const now =
    Date.now();

  const diffSec =
    (now - anchor) / 1000;

  if (
    !isFinite(diffSec) ||
    diffSec < 0
  ) {

    return {
      ...emptyResult,
      cooldownRemainingSec:
        Infinity
    };
  }

  const cycleSec =
    Number(cycleMin) * 60;

  const toleranceSec =
    45;

  const initialCooldownSec =
    cycleSec +
    toleranceSec;

  const rSec =
    diffSec % cycleSec;

  if (
    diffSec <
    initialCooldownSec
  ) {

    return {
      diffMin: diffSec / 60,
      d: Infinity,
      rSec,
      inYellowWindow: false,
      isInitialCooldown: true,
      cooldownRemainingSec:
        Math.max(
          0,
          initialCooldownSec -
            diffSec
        )
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
    diffMin: diffSec / 60,
    d: distToNearest / 60,
    rSec,
    inYellowWindow,
    isInitialCooldown: false,
    cooldownRemainingSec: 0
  };
}

function getCurrentCycle(
  player
) {

  return isCopiedPlayer(player)
    ? calcPinkCycle(player)
    : calcYellowCycle(player);
}

function calcYellowCycle(
  player
) {

  const cfg =
    State.scoringConfig
      ?.phase?.yellow || {};

  const base =
    cfg.baseCycleSec || 300;

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

  if (clicks.length === 0) {

    return (
      base +
      (
        State.phaseAdjust
          ?.yellow ?? 0
      )
    );
  }

  const click =
    clicks[0];

  const last =
    parseDateJST(
      player.updateDate
    )?.getTime();

  if (!last) {
    return base;
  }

  const now =
    Date.now();

  const diffSec =
    (now - last) / 1000;

  const folded =
    foldToCycle(
      diffSec,
      base
    );

  const prev =
    Number(
      State.phaseAdjust
        ?.yellow ?? 0
    );

  const updated =
    updateAdjust(
      prev,
      folded,
      cfg.alpha || 0.2
    );

  const maxShift =
    cfg.maxShiftSec || 45;

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

function calcPinkCycle(
  player
) {

  const cfg =
    State.scoringConfig
      ?.phase?.pink || {};

  const base =
    cfg.baseCycleSec || 300;

  const groups = {};

  for (
    const r of
    State.recentClicks
  ) {

    const key =
      normalizePlayerName(
        r.name
      );

    if (!groups[key]) {
      groups[key] = [];
    }

    groups[key].push(r);
  }

  const foldedList = [];

  for (const key in groups) {

    const arr =
      groups[key];

    if (arr.length < 2) {
      continue;
    }

    const latest =
      arr[0];

    const prev =
      arr[1];

    const interval =
      (
        latest.copiedAt -
        prev.copiedAt
      ) / 1000;

    const folded =
      foldToCycle(
        interval,
        base
      );

    if (
      isFinite(folded)
    ) {
      foldedList.push(
        folded
      );
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
    sum /
    foldedList.length;

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

function isCopiedPlayer(
  player
) {

  return State.recentClicks.some(
    r =>
      normalizePlayerName(
        r.name
      ) ===
      normalizePlayerName(
        player.name
      )
  );
}

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
 [730] Phase Candidate Judge
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

function getLatestCopiedPlayer() {

  return (
    State.recentClicks[0] ||
    null
  );
}

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

  const click =
    State.recentClicks.find(
      r =>
        normalizePlayerName(
          r.name
        ) ===
          normalizePlayerName(
            player.name
          ) &&
        String(
          r.shopname ?? ""
        ) ===
          String(
            player.shopname ?? ""
          )
    );

  if (!click) {
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
        click.copiedAt ??
        click.time
      )
    ) / 1000;

  if (diffSec < cycleSec) {
    return 1;
  }

  const theta =
    (
      2 *
      Math.PI *
      (diffSec % cycleSec)
    ) / cycleSec;

  const cosValue =
    Math.cos(theta);

  return Math.max(
    0,
    cosValue
  );
}

/* =====================================
 * Pink判定
 * ===================================== */
function isMatchingCandidateByCopyPhase(
  player
) {

  if (!player) {
    return false;
  }

  const click =
    State.recentClicks.find(
      r =>
        normalizePlayerName(
          r.name
        ) ===
          normalizePlayerName(
            player.name
          ) &&
        String(
          r.shopname ?? ""
        ) ===
          String(
            player.shopname ?? ""
          )
    );

  if (!click) {
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

  const diffSec =
    (
      Date.now() -
      (
        click.copiedAt ??
        click.time
      )
    ) / 1000;

  if (diffSec < cycleSec) {
    return true;
  }

  const theta =
    (
      2 *
      Math.PI *
      (diffSec % cycleSec)
    ) / cycleSec;

  const cosValue =
    Math.cos(theta);

  return cosValue > 0;
}
/* =========================================================
 [740] Matching Score Engine
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

function calcMatchingScoreDetail(
  player
) {

  if (
    !player ||
    !player.updateDate
  ) {
    return {
      score: 0
    };
  }

  const rankScore =
    Number(
      getRankWeight(player) || 0
    );

  if (
    rankScore <= 0
  ) {
    return {
      score: 0
    };
  }

  const prideWeight =
    Number(
      getPrideWeight(player) || 1
    );

  const areaFactor =
    Number(
      getAreaScore(player) || 1
    );

  const timeWeight =
    Number(
      getTimeWeight(player) || 0
    );

  const rankingScore =
    rankScore *
    prideWeight *
    areaFactor *
    timeWeight;

  const realtimeBoost =
    Math.min(
      getRealtimeBoost(player),
      2.5
    );

  const selectionWeight =
    rankingScore *
    (
      1 +
      (
        realtimeBoost - 1
      ) * 0.4
    );

  return {

    score:
      Math.max(
        0.0001,
        selectionWeight
      ),

    rankingScore,

    phaseWeight: 1.0,

    realtimeBoost,

    selectionWeight
  };
}

function calcMatchingScore(
  player
) {

  return calcMatchingScoreDetail(
    player
  ).score;
}
/* =========================================================
 [750] Weighted Selection
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
 [760] Candidate Builder
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

  const scoredAll =
    base.map(buildCandidateScore);

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

      if (!click) {
        return true;
      }

      const phase =
        getPhaseDistanceMin(
          click.copiedAt ??
          click.time,
          5
        );

      if (
        phase.isInitialCooldown
      ) {
        return false;
      }

      return true;
    });

  /* =====================================
   * ランキング
   * ===================================== */

  const rankedAll =
    [...afterCooldown]
      .sort(
        (a, b) =>
          b.__effectiveWeight -
          a.__effectiveWeight
      );

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

      const picked =
        selectByWeight(
          pool.sort(
            (a, b) =>
              b.__effectiveWeight -
              a.__effectiveWeight
          ),
          Math.min(
            need,
            pool.length
          )
        );

      selected.push(
        ...picked
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
    `候補生成(修正版): Base=${base.length} / Selected=${selected.length}`
  );
}
/* =========================================================
 [770] Matching Renderer
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
        r =>
          counts[r.key]
      )
      .map(
        r => {

          const cnt =
            counts[r.key];

          return `
            <span
              style="
                margin-right:12px;
                white-space:nowrap;
              "
            >
              ${r.icon}
              ${r.label}：${fmt(cnt)}人
            </span>
          `;
        }
      );

  headerEl.innerHTML =
    parts.join("");
}

function renderMatchingTable() {

  const area =
    document.getElementById(
      "matchingArea"
    );

  if (!area) {
    return;
  }

  const total =
    State.matchingList.length;

  area.innerHTML = `
    <h3>
      マッチング候補：
      <span id="matchingCount">
        ${fmt(total)}
      </span>
      人
    </h3>

    <div style="overflow-x:auto;">

      <table>

        <thead>
          <tr>
            <th>★・PRIDE</th>
            <th>プレイヤー名</th>
            <th>RP</th>
            <th>店舗名</th>
            <th>称号</th>
            <th>Last Update</th>
          </tr>
        </thead>

        <tbody id="matchingTableBody">
        </tbody>

      </table>

    </div>
  `;

  renderMatchingRows(
    State.matchingList
  );
}

function renderMatchingRows(
  list
) {

  /* ===============================
   * cooldown除外は候補生成側
   * =============================== */

  renderPlayerRowsToBody(
    "matchingTableBody",
    list
  );
}

function applyMatchingFilter(
  keyword
) {

  const base =
    State.matchingList || [];

  const normKey =
    normalize(keyword);

  const list =
    normKey
      ? base.filter(
          p =>
            (
              p.normalizedName ||
              ""
            ).includes(normKey)
        )
      : base;

  const countEl =
    document.getElementById(
      "matchingCount"
    );

  if (countEl) {

    countEl.textContent =
      fmt(
        list.length
      );
  }

  renderMatchingRows(
    list
  );
}
/* =========================================================
 [780] Matching Navigation
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
 [800] Export Core
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
 [810] Summary Export
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
 [820] Record Export
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
 [1000] Viewer Log Core
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

    if (
      State._lastCandidateLog ===
      message
    ) {
      return false;
    }

    State._lastCandidateLog =
      message;

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
 [1010] Viewer Log Storage
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

function saveViewerLogToStorage(
  payload
) {

  pushStoredRecord(
    LOG_STORAGE_KEYS.viewerLogs,
    payload,
    LOG_STORAGE_LIMITS.viewerLogs
  );
}

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
 [1020] Copy Log
========================================================= */

function saveCopyEventUnified(
  rawText
) {

  const player =
    findPlayerFromCopiedText(
      rawText
    );

  if (!player) {

    const record = {
      t: Date.now(),
      dk: buildDailyKey(),
      n: "",
      s: 0,
      p: 0,
      r: 0,
      c: -1,
      sid:
        State.lastSnapshotId ??
        null
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

  let candidateRank =
    -1;

  const idx =
    rankedAll.findIndex(
      p =>
        normalizePlayerName(
          p.name
        ) ===
          normalizePlayerName(
            player.name
          ) &&
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

  /* =====================================
   * phaseScore算出
   * ===================================== */

  let phaseScore = 0;

  try {

    const cycleSec =
      phaseInfo.cycleSec ||
      300;

    const rawSec =
      phaseInfo.raw ||
      0;

    const theta =
      (
        2 *
        Math.PI *
        (
          rawSec %
          cycleSec
        )
      ) / cycleSec;

    phaseScore =
      Math.cos(theta);

  } catch (e) {

    phaseScore = 0;
  }

  const record = {

    t: Date.now(),

    dk: buildDailyKey(),

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

    sid:
      State.lastSnapshotId ??
      null
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
 [1030] Phase Analysis
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
 [1040] Snapshot Log
========================================================= */

function saveMatchingSnapshot() {

  const snapshotId =
    Date.now();

  const dk =
    buildDailyKey();

  State.lastSnapshotId =
    snapshotId;

  const snapshot = {

    id:
      snapshotId,

    t:
      snapshotId,

    dk:
      dk,

    candidates:
      (
        State.matchingList || []
      ).map(
        p => ({
          name:
            p.name,

          score:
            Number(
              p.__score ?? 0
            )
        })
      )
  };

  pushStoredRecord(
    LOG_STORAGE_KEYS
      .matchingSnapshots,
    snapshot,
    LOG_STORAGE_LIMITS
      .matchingSnapshots,
    true
  );
}
/* =========================================================
 [1050] IndexedDB Schema
========================================================= */
const LOG_DB_NAME =
  "viewer_logs_db";

const LOG_DB_VERSION =
  1;

const LOG_STORE = {
  events: "events",
  copyEvents: "copyEvents",
  cycleEvents: "cycleEvents"
};

let logDB = null;


/* =========================================================
 [1060] IndexedDB Core
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

function logEvent(
  type,
  payload = {}
) {

  if (!logDB) {
    return;
  }

  const record = {

    t: Date.now(),

    e: type,

    ...(payload || {})
  };

  if (
    type === "copy" ||
    type === "top"
  ) {

    putLog(
      LOG_STORE.copyEvents,
      record
    );
  }
}
/* =========================================================
 [1070] IndexedDB Export
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

function exportTodayLogsAsJSON() {

  if (!logDB) {

    console.warn(
      "DB未初期化"
    );

    return;
  }

  const todayStart =
    new Date();

  todayStart.setHours(
    0,
    0,
    0,
    0
  );

  const startTs =
    todayStart.getTime();

  const todayEnd =
    new Date();

  todayEnd.setHours(
    23,
    59,
    59,
    999
  );

  const endTs =
    todayEnd.getTime();

  const result = {

    exportedAt:
      Date.now(),

    range: {
      start: startTs,
      end: endTs
    },

    copyEvents: []
  };

  const tx =
    logDB.transaction(
      LOG_STORE.copyEvents,
      "readonly"
    );

  const store =
    tx.objectStore(
      LOG_STORE.copyEvents
    );

  const req =
    store.getAll();

  req.onsuccess =
    () => {

      const all =
        req.result || [];

      result.copyEvents =
        all.filter(
          x =>
            x.t >= startTs &&
            x.t <= endTs
        );

      /* fallback */
      if (
        !result.copyEvents.length
      ) {

        const dk =
          buildDailyKey();

        const fallback =
          readStoredArraySafe(
            LOG_STORAGE_KEYS
              .copyEvents +
            dk
          );

        result.copyEvents =
          fallback || [];
      }

      downloadJSON(
        result
      );
    };

  req.onerror =
    () => {

      console.error(
        "read error: copyEvents"
      );

      downloadJSON(
        result
      );
    };
}
