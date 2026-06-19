/* ---------------------------------------------------------
   Initial DAC Round Data Viewer（integrated_data.json + latest_round.json 対応）      
--------------------------------------------------------- */

/* =========================================================   
 [01] Initial DAC Round Data Viewer（BASE_URL）  
========================================================= */
const BASE_URL = "https://pand-gthb.github.io/initialdac-round-data-auto-json-00";

/* ---------------------------------------------------------  
   [02] STATE（画面状態 enum）  
--------------------------------------------------------- */
const STATE = {
  SUMMARY: 'summary',
  DETAIL: 'detail',
  MATCHING: 'matching'
};

/* ---------------------------------------------------------  
   [03] State（アプリ全体状態）  
--------------------------------------------------------- */
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
  // ★追加：分析用  
  matchingRankedAll: [],
  matchingDiagnostics: null,
  rankModel: null,
  myStar: 6,
  recentClicks: [],
  areaModel: {},
  scoringConfig: null,
  updateWatchTimer: null,
  prefetchedRoundData: null,
  prefetchedForUpdateAt: "",
  prefetchInFlight: null
};

/* ---------------------------------------------------------      
  [04] RUBY帯・PRIDE帯 定義  
--------------------------------------------------------- */
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

/* ---------------------------------------------------------      
   [05] RANKS  
--------------------------------------------------------- */
const RANKS = [
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
];

/* ---------------------------------------------------------
   [06] getRankIndex
--------------------------------------------------------- */
function getRankIndex(key) {
  return RANKS.findIndex(r => r.key === key);
}

/* ---------------------------------------------------------
   [07] getRankInfo
--------------------------------------------------------- */
function getRankInfo(key) {
  return RANKS.find(r => r.key === key) || null;
}

/* ---------------------------------------------------------
   [07-B] isCurrentView / setCurrentView
   ★ STATE と currentView の一元化
--------------------------------------------------------- */
function isCurrentView(view) {
  return State.currentView === view;
}
function setCurrentView(view) {
  State.currentView = view;
}

/* ---------------------------------------------------------
   [07-C] switchDisplayView
   ★ 表示切替の共通化（機能維持）
--------------------------------------------------------- */
function switchDisplayView(view) {
  const summaryView = document.getElementById("summaryView");
  const detailView = document.getElementById("detailView");
  const matchingView = document.getElementById("matchingView");

  if (summaryView) {
    summaryView.style.display = (view === STATE.SUMMARY) ? "block" : "none";
  }
  if (detailView) {
    detailView.style.display = (view === STATE.DETAIL) ? "block" : "none";
  }
  if (matchingView) {
    matchingView.style.display = (view === STATE.MATCHING) ? "block" : "none";
  }
}
/* ---------------------------------------------------------
   [08] ログ基盤（appendLog / log / logWarn / logError）  
   ★ 画面ログ + localStorage 永続保存  
   ★ copy / matching / snapshot は localStorage に統一  
   ※ IndexedDBは完全削除  
--------------------------------------------------------- */
const MAX_LOG_LINES = 200;

/* ★ 永続保存キー（localStorage） */
const LOG_STORAGE_KEYS = {
  viewerLogs: "initialdac_viewer_logs",
  copyEvents: "initialdac_copy_events",
  matchingSnapshots: "initialdac_matching_snapshots"
};

/* ★ 保存上限（localStorage） */
const LOG_STORAGE_LIMITS = {
  viewerLogs: 500,
  copyEvents: 200,
  matchingSnapshots: 100
};

/* ---------------------------------------------------------  
   [08-1] 共通ユーティリティ（時間）  
--------------------------------------------------------- */
function getNowLabelJa() {
  const now = new Date();
  return now.toLocaleString("ja-JP", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function getTodayYMDJa() {
  const now = new Date();
  const y = now.getFullYear();
  const m = ("0" + (now.getMonth() + 1)).slice(-2);
  const d = ("0" + now.getDate()).slice(-2);
  return `${y}/${m}/${d}`;
}

function compactYMD(ymd) {
  return String(ymd || "").replace(/\//g, "");
}

/* ---------------------------------------------------------  
   [08-2] localStorage  
--------------------------------------------------------- */
function readStoredArraySafe(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function writeStoredArraySafe(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch (e) {
    console.warn("localStorage write failed:", key, e);
  }
}

function pushStoredRecord(key, record, limit = 200) {
  const arr = readStoredArraySafe(key);
  arr.unshift(record);
  const trimmed = arr.slice(0, limit);
  writeStoredArraySafe(key, trimmed);
}

/* ---------------------------------------------------------  
   [08-3] viewerログ保存  
--------------------------------------------------------- */
function saveViewerLogToStorage(payload) {
  pushStoredRecord(
    LOG_STORAGE_KEYS.viewerLogs,
    payload,
    LOG_STORAGE_LIMITS.viewerLogs
  );
}

/* ---------------------------------------------------------  
   [08-4] appendLog  
--------------------------------------------------------- */
function appendLog(msg, type = "info") {
  const box = document.getElementById("logBox");
  const t = getNowLabelJa();

  if (box) {
    const line = document.createElement("div");
    line.textContent = `[${t}] ${msg}`;
    line.dataset.type = type;

    if (type === "error") {
      line.style.color = "#ff5555";
    } else if (type === "warn") {
      line.style.color = "#ffeb3b";
    } else {
      line.style.color = "#00ff00";
    }

    box.prepend(line);

    while (box.children.length > MAX_LOG_LINES) {
      box.removeChild(box.lastChild);
    }
  }

  saveViewerLogToStorage({
    savedAt: t,
    type,
    message: String(msg ?? ""),
    currentView: State.currentView || "",
    generatedAt: State.generatedAt || "",
    latestRound: State.latestRound || "",
    latestUpdateAt: State.latestUpdateAt || ""
  });
}

/* ★ ラッパー */
const log = msg => appendLog(msg, "info");
const logWarn = msg => appendLog(msg, "warn");
const logError = msg => appendLog(msg, "error");

/* ---------------------------------------------------------  
   [08-A] copyログ（統一JSON）  
--------------------------------------------------------- */
function saveCopyEventToStorage(payload) {
  pushStoredRecord(
    LOG_STORAGE_KEYS.copyEvents,
    payload,
    LOG_STORAGE_LIMITS.copyEvents
  );
}

/* ---------------------------------------------------------  
   [08-B] MATCHINGログ  
--------------------------------------------------------- */
const MATCHING_LOG_CONFIG = {
  verboseTopDetails: false,
  topListCount: 5
};

function formatMatchTopList(list, count = MATCHING_LOG_CONFIG.topListCount) {
  return (list || [])
    .slice(0, count)
    .map(p => `${p.name}(${Number(p.__score ?? 0).toFixed(2)})`)
    .join(" / ");
}

/* ---------------------------------------------------------  
   [08-EXPORT] localStorage → 本日分JSON出力  
--------------------------------------------------------- */
function exportTodayLogsAsJSON() {
  const today = getTodayYMDJa();

  const viewerLogs = readStoredArraySafe(LOG_STORAGE_KEYS.viewerLogs);
  const copyEvents = readStoredArraySafe(LOG_STORAGE_KEYS.copyEvents);

  const isToday = (savedAt) => {
    return String(savedAt || "").startsWith(today);
  };

  const todayViewerLogs = viewerLogs.filter(x => isToday(x.savedAt));
  const todayCopyEvents = copyEvents.filter(x => isToday(x.savedAt));

  const payload = {
    exportedAt: getNowLabelJa(),
    targetDate: today,
    viewerLogs: todayViewerLogs,
    copyEvents: todayCopyEvents
  };

  const filename = `viewer_logs_${compactYMD(today)}.json`;

  const blob = new Blob(
    [JSON.stringify(payload, null, 2)],
    { type: "application/json;charset=utf-8" }
  );

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);

  log(`JSON出力完了: ${filename} / copy=${todayCopyEvents.length} / viewer=${todayViewerLogs.length}`);
}
/* ---------------------------------------------------------
   [09] 進行中アニメーション      
--------------------------------------------------------- */      
let progressTimer = null;      
let progressPos = 0;      
let progressLine = null;      

function startProgress() {      
  const box = document.getElementById("logBox");      
  if (progressLine) progressLine.remove();      
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

function updateProgressBar() {      
  const total = 20;      
  const filled = "■".repeat(progressPos);      
  const empty = "□".repeat(total - progressPos);      
  progressLine.textContent = `進行中：${filled}${empty}`;      
}      

function stopProgress() {      
  if (progressTimer) clearInterval(progressTimer);      
  progressTimer = null;      
  if (progressLine) {      
    progressLine.remove();      
    progressLine = null;      
  }      
  log("Viewer フィルタ完了");      
}      

/* ---------------------------------------------------------  
   [10] 日付・数値ユーティリティ（fmt / parseDateJST / formatYMDHM）  
--------------------------------------------------------- */
const fmt = n => Number(n).toLocaleString();

/* ★最終修正版（すべてのフォーマット対応） */
const parseDateJST = str => {
  if (!str || typeof str !== "string") return null;

  let s = str.trim();

  // ★ "/" → "-" 統一  
  s = s.replace(/\//g, "-");

  // ★ " " → "T"  
  if (s.includes(" ")) s = s.replace(" ", "T");

  // ★ 秒が無い場合補完  
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) {
    s += ":00";
  }

  // ★ JST付与  
  s += "+09:00";

  const d = new Date(s);
  if (isNaN(d.getTime())) return null;

  return d;
};

function formatYMDHM(date) {
  if (!date || isNaN(date.getTime())) return "--/-- --:--";

  const y = date.getFullYear();
  const m = ("0" + (date.getMonth() + 1)).slice(-2);
  const d = ("0" + date.getDate()).slice(-2);
  const hh = ("0" + date.getHours()).slice(-2);
  const mm = ("0" + date.getMinutes()).slice(-2);

  return `${y}/${m}/${d} ${hh}:${mm}`;
}

/* ---------------------------------------------------------      
   [11] normalize（文字正規化）      
--------------------------------------------------------- */      
function normalize(s) {      
  if (!s) return "";      

  s = s.replace(/\u3000/g, " ");      

  s = s.replace(/[A-Za-z0-9]/g, ch =>      
    String.fromCharCode(ch.charCodeAt(0) + 0xFEE0)      
  );      

  s = s.toLowerCase();      

  s = s.replace(/[\u3041-\u3096]/g, ch =>      
    String.fromCharCode(ch.charCodeAt(0) + 0x60)      
  );      

  s = s.replace(/ /g, "");      

  return s;      
}      

/* ---------------------------------------------------------  
   [11-A] normalizePlayerName（完全一致版）  
   ★ 空白を一切変更しない  
   ★ 表記揺れ（全角半角）のみ統一（任意）  
--------------------------------------------------------- */
function normalizePlayerName(str) {
  return String(str ?? "")
    .normalize("NFKC"); // ←のみ（空白保持）  
}

/* ---------------------------------------------------------      
   [12] 店舗名省略（幅・文字種判定）      
--------------------------------------------------------- */      

function getZenkakuLength(str) {      
  if (!str) return 0;      
  const len = str.replace(/[^\x00-\x7F]/g, "xx").length;      
  return len / 2;      
}      

function isMostlyAscii(str) {      
  if (!str) return true;      
  const asciiCount = (str.match(/[\x00-\x7F]/g) || []).length;      
  return asciiCount / str.length >= 0.7;      
}      

function getTextWidth(text, font) {      
  const canvas = getTextWidth.canvas || (getTextWidth.canvas = document.createElement("canvas"));      
  const ctx = canvas.getContext("2d");      
  ctx.font = font;      
  return ctx.measureText(text).width;      
}      

function shortenStoreName(full) {      
  if (!full) return "";      

  if (!isMostlyAscii(full)) {      
    const zLen = getZenkakuLength(full);      

    if (zLen <= 18) return full;      

    const head = 6;      
    const tail = 6;      

    if (full.length <= head + tail) return full;      

    return full.slice(0, head) + "…" + full.slice(-tail);      
  }      

  const font = "14px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";      
  const maxWidth = 220;      

  if (getTextWidth(full, font) <= maxWidth) return full;      

  let head = 10;      
  let tail = 10;      

  while (head + tail > 2) {      
    const candidate = full.slice(0, head) + "…" + full.slice(-tail);      

    if (getTextWidth(candidate, font) <= maxWidth) return candidate;      

    if (head >= tail) head--;      
    else tail--;      
  }      

  return full.slice(0, 1) + "…" + full.slice(-1);      
}      

/* ---------------------------------------------------------      
   [13] renderStars（星表示）
   ★ RUBY星 → ★★★★★ 表示変換（4文字×2行）
--------------------------------------------------------- */      
function renderStars(starCount) {      
  if (!starCount || starCount < 1) return "";      

  const stars = "★".repeat(starCount);      

  return stars.length > 4      
    ? stars.slice(0, 4) + "<br>" + stars.slice(4)      
    : stars;      
}
/* ---------------------------------------------------------
   [14] fetchJSON（共通取得）  
--------------------------------------------------------- */
async function fetchJSON(path, options = {}) {
  const { cache = "no-store" } = options;

  const res = await fetch(`${BASE_URL}/${path}?t=${Date.now()}`, {
    cache
  });

  if (!res.ok) throw new Error("HTTP " + res.status);

  return res.json();
}

/* ---------------------------------------------------------  
   [15] loadAreaList★ areaList.json 読み込み（辞書化）  
--------------------------------------------------------- */
let AreaList = {};

async function loadAreaList() {
  try {
    const json = await fetchJSON("areaList.json");

    // ★ 配列 → 辞書化
    AreaList = {};

    if (json.areas && Array.isArray(json.areas)) {
      json.areas.forEach(a => {
        AreaList[String(a.area)] = a.areaName;
      });
    }

    log("areaList.json 読み込み完了");

  } catch (e) {
    logError("areaList.json の取得に失敗：" + e.message);
    AreaList = {};
  }
}

/* ---------------------------------------------------------  
   [15-A] areaList 取得/適用 分離  
--------------------------------------------------------- */
async function fetchAreaListJson() {
  return fetchJSON("areaList.json");
}

function applyAreaListJson(json) {

  AreaList = {};

  if (json?.areas && Array.isArray(json.areas)) {
    json.areas.forEach(a => {
      AreaList[String(a.area)] = a.areaName;
    });
  }

  log("areaList.json 読み込み完了");
}

/* ---------------------------------------------------------  
   [16] loadLatestRound
   latest_round.json 読み込み（ラウンド番号表示用）  
--------------------------------------------------------- */
async function loadLatestRound() {
  log("latest_round.json 取得準備中");

  try {
    const json = await fetchJSON("latest_round.json");

    if (!json.latestRound) throw new Error("latestRound が存在しません");

    State.latestRound = json.latestRound;

    const el = document.getElementById("latestRound");
    if (el) el.textContent = State.latestRound;

    log("latest_round.json 読み込み完了");

  } catch (e) {
    logError("latest_round.json の取得に失敗：" + e.message);
  }
}

/* ---------------------------------------------------------  
   [16-A] latest_round 取得/適用 分離  
--------------------------------------------------------- */
async function fetchLatestRoundJson() {
  return fetchJSON("latest_round.json");
}

function applyLatestRoundJson(json) {
  if (!json?.latestRound) {
    throw new Error("latestRound が存在しません");
  }

  State.latestRound = json.latestRound;

  const el = document.getElementById("latestRound");
  if (el) el.textContent = State.latestRound;

  log("latest_round.json 読み込み完了");
}

/* ---------------------------------------------------------  
   [16-B] latest_update 取得/適用 分離  
--------------------------------------------------------- */
async function loadLatestUpdate() {
  try {
    const json = await fetchLatestUpdateJson();
    applyLatestUpdateJson(json);
  } catch (e) {
    logWarn("latest_update.json 未取得：" + e.message);
  }
}

async function fetchLatestUpdateJson() {
  return fetchJSON("latest_update.json");
}

function applyLatestUpdateJson(json) {

  let latest = json?.lastUpdated ?? json?.latestUpdateAt ?? "";

  if (typeof latest !== "string") {
    latest = String(latest ?? "");
  }

  State.latestUpdateAt = latest;

  if (!latest) {
    logWarn("latest_update.json に更新時刻が存在しません");
    return;
  }

  const parsed = parseDateJST(latest);
  const label = parsed ? formatYMDHM(parsed) : latest;

  log("latest_update.json 読み込み完了 (" + label + ")");
}

/* ---------------------------------------------------------  
   [17] loadRankModel（SeasonモデルからRankモデルに変更）  
--------------------------------------------------------- */
async function loadRankModel() {
  log("rank_model.json 取得準備中");

  try {
    const json = await fetchJSON("rank_model.json");

    State.rankModel = json;

    log("rank_model.json 読み込み完了");

  } catch (e) {

    State.rankModel = null;

    logWarn("rank_model.json 未取得：" + e.message);
  }
}

/* ---------------------------------------------------------  
   [17-A] rank_model 取得/適用 分離  
--------------------------------------------------------- */
async function fetchRankModelJson() {
  return fetchJSON("rank_model.json");
}

function applyRankModelJson(json) {
  State.rankModel = json;
  log("rank_model.json 読み込み完了");
}

/* ---------------------------------------------------------  
   [18] loadRoundData integrated_data.json 読み込み  
--------------------------------------------------------- */
async function loadRoundData() {
  log("integrated_data.json 取得準備中");

  try {
    const json = await fetchJSON("integrated_data.json");

    State.generatedAt = json.generatedAt ?? "";

    if (State.generatedAt) {
      document.getElementById("jsonUpdateTime").textContent =
        formatYMDHM(parseDateJST(State.generatedAt));
    }

    const records = json.records || [];

    // ★ 修正：areaName を付与
    State.all = records.map(p => ({
      ...p,
      normalizedName: normalize(p.name),
      areaName: AreaList[String(p.area)] || ""
    }));

    State.filtered = [...State.all];

    const genTime = State.generatedAt
      ? formatYMDHM(parseDateJST(State.generatedAt))
      : "-";

    log(`integrated_data.json 読み込み完了 (${State.all.length}件：${genTime})`);

    const btn = document.getElementById("reloadBtn");
    if (btn) {
      btn.classList.remove("update-alert");
      btn.style.cssText = "";
    }

  } catch (e) {
    logError("integrated_data.json の取得に失敗：" + e.message);
  }
}

/* ---------------------------------------------------------  
   [18-A] integrated_data 取得/適用 分離  
--------------------------------------------------------- */
async function fetchRoundDataJson() {
  return fetchJSON("integrated_data.json");
}

function applyRoundDataJson(json, options = {}) {

  const { resetReloadButton = true } = options;

  State.generatedAt = json?.generatedAt ?? "";

  const timeEl = document.getElementById("jsonUpdateTime");

  if (timeEl && State.generatedAt) {
    timeEl.textContent =
      formatYMDHM(parseDateJST(State.generatedAt));
  }

  const records = json?.records || [];

  State.all = records.map(p => ({
    ...p,
    normalizedName: normalize(p.name),
    areaName: AreaList[String(p.area)] || ""
  }));

  State.filtered = [...State.all];

  const genTime = State.generatedAt
    ? formatYMDHM(parseDateJST(State.generatedAt))
    : "-";

  log(`integrated_data.json 読み込み完了 (${State.all.length}件：${genTime})`);

  if (resetReloadButton) {

    const btn = document.getElementById("reloadBtn");

    if (btn) {
      btn.classList.remove("update-alert");
      btn.style.cssText = "";
    }
  }
}
/* ---------------------------------------------------------
   [18-B] 先読み済みデータ優先で最新データ適用  
--------------------------------------------------------- */
async function reloadLatestDataPreferPrefetch() {
  startProgress();
  try {
    if (State.prefetchedRoundData) {
      log("先読み済みデータを適用します");
      applyRoundDataJson(State.prefetchedRoundData, { resetReloadButton: true });
      // ★ 適用後クリア
      State.prefetchedRoundData = null;
      State.prefetchedForUpdateAt = "";
    } else {
      log("先読みデータなしのため通常取得します");
      await loadRoundData();
    }
    applyFilters();
    buildSummary();
    renderSummary();
  } finally {
    stopProgress();
  }
}

/* ---------------------------------------------------------  
   [19-A] 最新データ先読み  
--------------------------------------------------------- */
async function prefetchLatestRoundData(lastUpdatedValue) {

  if (!lastUpdatedValue) return;

  // ★ 既に対象更新版を先読み済みなら何もしない
  if (State.prefetchedForUpdateAt === lastUpdatedValue && State.prefetchedRoundData) {
    return;
  }

  // ★ 同一更新に対する多重起動防止
  if (State.prefetchInFlight) {
    return State.prefetchInFlight;
  }

  State.prefetchInFlight = (async () => {
    try {
      log("新データ先読み開始");

      const json = await fetchRoundDataJson();

      State.prefetchedRoundData = json;
      State.prefetchedForUpdateAt = lastUpdatedValue;

      log("新データ先読み完了");

    } catch (e) {
      logWarn("新データ先読みに失敗：" + e.message);

    } finally {
      State.prefetchInFlight = null;
    }
  })();

  return State.prefetchInFlight;
}

/* ---------------------------------------------------------  
   [19-B] checkUpdate（共通apply利用版）  
--------------------------------------------------------- */
async function checkUpdate() {

  try {
    const prev = State.latestUpdateAt || "";

    const json = await fetchLatestUpdateJson();

    let latest = json?.lastUpdated ?? json?.latestUpdateAt ?? "";

    if (typeof latest !== "string") {
      latest = String(latest || "");
    }

    if (!latest) return;

    const changed = prev && prev !== latest;

    // ★ 安全代入
    State.latestUpdateAt = latest;

    if (changed) {
      const btn = document.getElementById("reloadBtn");

      if (btn) {
        btn.classList.add("update-alert");
        btn.style.cssText = "background:#ff4081;color:#fff;font-weight:bold;";
      }

      logWarn("新しいデータが公開されています。");

      // ★ 先読み（既存維持）
      prefetchLatestRoundData(latest);
    }

  } catch (e) {
    logError("latest_update.json の取得に失敗：" + e.message);
  }
}

/* ---------------------------------------------------------      
   [20] buildAreaDistribution（分布計算）  
--------------------------------------------------------- */
function buildAreaDistribution(list) {
  const counts = {};

  for (const p of (list || [])) {
    const k = String(p.area ?? "");
    if (!k) continue;

    counts[k] = (counts[k] || 0) + 1;
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;

  const dist = {};

  for (const k in counts) dist[k] = counts[k] / total;

  return dist;
}

/* ---------------------------------------------------------      
   [21] getAreaScore      
--------------------------------------------------------- */
function getAreaScore(player) {
  const areaKey = String(player?.area ?? "");
  const areaWeight = State.areaModel?.[areaKey] ?? 0;

  return 1 + (areaWeight * 3.0);
}

/* ---------------------------------------------------------  
   [22] recordClickFromCopiedText  
--------------------------------------------------------- */
function recordClickFromCopiedText(text) {

  if (!text) return;

  const player = findPlayerFromCopiedText(text);
  if (!player) return;

  const copiedAt = Date.now();

  const areaName =
    AreaList[String(player.area)] || player.areaName || "";

  const rankKey = getPlayerRankKey(player);

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

  State.recentClicks = State.recentClicks.slice(0, 20);
}

/* ---------------------------------------------------------  
   [22-A] findPlayerFromCopiedText  
--------------------------------------------------------- */
function findPlayerFromCopiedText(text) {

  if (!text) return null;

  let name = String(text);

  if (name.includes("\t")) {
    const parts = name.split("\t");
    name = parts[parts.length - 1];
  }

  const targetName = normalizePlayerName(name);

  if (!targetName) return null;

  return State.all.find(p =>
    normalizePlayerName(p.name) === targetName
  ) || null;
}

/* ---------------------------------------------------------  
   [23] getRealtimeBoost  
--------------------------------------------------------- */
function getRealtimeBoost(player) {

  const detail = getRealtimeBoostDetail(player);
  return detail.total;
}

/* ---------------------------------------------------------  
   [23-A] getRealtimeBoostDetail  
--------------------------------------------------------- */
function getRealtimeBoostDetail(player) {

  if (!State.recentClicks.length || !player) {
    return { rank: 0, area: 0, shop: 0, total: 1, reason: [] };
  }

  let rankScore = 0;
  let areaScore = 0;
  let shopScore = 0;
  let reason = [];

  const playerRankKey = getPlayerRankKey(player);

  for (const r of State.recentClicks) {

    const anchorTime = Number(r.copiedAt || r.time || 0);
    if (!anchorTime) continue;

    const dtMin = (Date.now() - anchorTime) / 60000;

    if (!isFinite(dtMin) || dtMin < 0) continue;

    const decay = Math.exp(-dtMin / 8);

    const sameRank =
      !!playerRankKey &&
      !!r.rankKey &&
      String(playerRankKey) === String(r.rankKey);

    const sameArea =
      String(player.area ?? "") === String(r.area ?? "");

    const sameShop =
      String(player.shopname ?? "") === String(r.shopname ?? "");

    if (sameRank && sameArea) {
      rankScore += decay * 1.2;
      areaScore += decay * 0.6;
      reason.push("rank+area");

    } else if (sameRank) {
      rankScore += decay * 0.9;
      reason.push("rank");

    } else if (sameArea) {
      areaScore += decay * 0.7;
      reason.push("area");

    } else if (sameShop) {
      shopScore += decay * 0.5;
      reason.push("shop");
    }
  }

  const totalBoost =
    1 + Math.min(2.5, rankScore + areaScore + shopScore);

  return {
    rank: rankScore,
    area: areaScore,
    shop: shopScore,
    total: totalBoost,
    reason: reason
  };
}

/* ---------------------------------------------------------  
   [24-A] getRoundedDiffMinAndPhaseDistance  
--------------------------------------------------------- */
function getRoundedDiffMinAndPhaseDistance(copiedAtMs, cycleMin = 5) {

  const emptyResult = {
    diffMin: Infinity,
    d: Infinity,
    rSec: Infinity,
    inPinkWindow: false,
    isInitialCooldown: false,
    cooldownRemainingSec: 0
  };

  const anchor = Number(copiedAtMs);

  if (!anchor || !isFinite(anchor)) {
    return { ...emptyResult, cooldownRemainingSec: Infinity };
  }

  const now = Date.now();
  const diffSec = (now - anchor) / 1000;

  if (!isFinite(diffSec) || diffSec < 0) {
    return { ...emptyResult, cooldownRemainingSec: Infinity };
  }

  const cycleSec = Number(cycleMin) * 60;
  const toleranceSec = 45;
  const initialCooldownSec = cycleSec + toleranceSec;

  const rSec = diffSec % cycleSec;

  if (diffSec < initialCooldownSec) {
    return {
      diffMin: diffSec / 60,
      d: Infinity,
      rSec,
      inPinkWindow: false,
      isInitialCooldown: true,
      cooldownRemainingSec:
        Math.max(0, initialCooldownSec - diffSec)
    };
  }

  const distToNearest =
    Math.min(rSec, cycleSec - rSec);

  const inPinkWindow =
    distToNearest <= toleranceSec;

  return {
    diffMin: diffSec / 60,
    d: distToNearest / 60,
    rSec,
    inPinkWindow,
    isInitialCooldown: false,
    cooldownRemainingSec: 0
  };
}

/* ---------------------------------------------------------  
   [24-B] isMatchingCandidateByPhase  
--------------------------------------------------------- */
function isMatchingCandidateByPhase(player) {

  if (!player) return false;

  const anchor = getLatestCopiedPlayer();
  if (!anchor) return false;

  const sameName =
    normalizePlayerName(player.name) ===
    normalizePlayerName(anchor.name);

  const sameUpdateDate =
    String(player.updateDate ?? "") ===
    String(anchor.updateDate ?? "");

  if (!sameName || !sameUpdateDate) return false;

  const phase =
    getPhaseDistanceMin(
      anchor.copiedAt || anchor.time,
      5
    );

  return !!phase.inPinkWindow;
}

/* ---------------------------------------------------------  
   [24-C] getLatestCopiedPlayer  
--------------------------------------------------------- */
function getLatestCopiedPlayer() {
  return State.recentClicks[0] || null;
}
/* ---------------------------------------------------------
   [25] scoring_config 取得/適用 分離  
--------------------------------------------------------- */
async function loadScoringConfig() {
  try {
    const json = await fetchJSON("scoring_config.json");
    applyScoringConfigJson(json);
  } catch (e) {
    logWarn("scoring_config.json 未取得：" + e.message);
  }
}

async function fetchScoringConfigJson() {
  return fetchJSON("scoring_config.json");
}

function applyScoringConfigJson(json) {
  State.scoringConfig = json;
  log("scoring_config.json 読み込み完了");
}

/* ---------------------------------------------------------  
   [26] ランク関連ユーティリティ  
--------------------------------------------------------- */

/* ---------------------------------------------------------  
   [26-1-A] getPrideBandKey  
--------------------------------------------------------- */
function getPrideBandKey(pridePoint) {
  const pt = Number(pridePoint ?? 0);
  if (pt <= 0) return null;

  const band = PRIDE_LEVELS.find(p => pt >= p.min && pt <= p.max);
  return band ? band.key : null;
}

/* ---------------------------------------------------------  
   [26-1] getPlayerRankKey  
--------------------------------------------------------- */
function getPlayerRankKey(player) {

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

/* ---------------------------------------------------------  
   [26-2] syncMyRankSelection  
--------------------------------------------------------- */
function syncMyRankSelection(rankValue) {

  const selectedMyRank = rankValue || "R6";
  const num = Number(String(selectedMyRank).replace("R", ""));

  if (num >= 1 && num <= 8) {
    State.myStar = num;
  } else {
    State.myStar = 6;
  }

  return selectedMyRank;
}

/* ---------------------------------------------------------  
   [26-3] getVirtualStar  
--------------------------------------------------------- */
function getVirtualStar(player) {

  if (player.onlineBattleRankId === RUBY_ID) {
    return String(Number(player.starCnt ?? 0));
  }

  if (Number(player.pridePoint ?? 0) > 0) {
    return "PRIDE";
  }

  return null;
}

/* ---------------------------------------------------------  
   [26-4] getRankWeight  
--------------------------------------------------------- */
function getRankWeight(player) {

  const model = State.rankModel;
  if (!model) return 0;

  const myStar = String(State.myStar);
  const opp = getVirtualStar(player);

  if (!opp) return 0;

  const table = model.models?.[myStar]?.vs;
  if (!table) return 0;

  return Number(table[opp] ?? 0);
}

/* ---------------------------------------------------------  
   [26-5] getPrideWeight  
--------------------------------------------------------- */
function getPrideWeight(player) {

  if (!State.rankModel) return 1.0;
  if (Number(player.pridePoint ?? 0) <= 0) return 1.0;

  const model = State.rankModel;
  const myStar = String(State.myStar);

  const dist = model.models?.[myStar]?.pride_distribution;
  if (!dist) return 1.0;

  const pt = Number(player.pridePoint ?? 0);
  const bands = model.pride?.bands;
  if (!bands) return 1.0;

  for (const key in bands) {

    const band = bands[key];
    const min = Number(band.min ?? 0);
    const max = Number(band.max ?? Infinity);

    if (pt >= min && pt <= max) {
      return Number(dist[key] ?? 1.0);
    }
  }

  return 1.0;
}

/* ---------------------------------------------------------  
   [26-6] getTimeWeight  
--------------------------------------------------------- */
function getTimeWeight(player) {

  if (!player.updateDate) return 0;

  const now = Date.now();
  const last = parseDateJST(player.updateDate)?.getTime();

  if (!last) return 0;

  const diffMin = (now - last) / 60000;
  if (diffMin < 0) return 0;

  const maxRange = Number(document.getElementById("rangeSelect").value);

  const normalized = Math.max(0, 1 - diffMin / maxRange);

  return Math.pow(normalized, 0.7);
}

/* ---------------------------------------------------------  
   [27] MATCHING_SCORE_CONFIG  
--------------------------------------------------------- */
const MATCHING_SCORE_CONFIG = {
  recencyTau: 12,
  weight: {
    strength: 0.40,
    phase:    0.25,
    recency:  0.25,
    activity: 0.10
  },
  threshold: 0.30,
  minCandidates: 10
};

/* ---------------------------------------------------------  
   [28] getPhaseDistanceMin  
--------------------------------------------------------- */
function getPhaseDistanceMin(copiedAtMs, cycleMin = 5) {
  return getRoundedDiffMinAndPhaseDistance(copiedAtMs, cycleMin);
}

/* ---------------------------------------------------------  
   [28-A] calcMatchingDiagnostics  
--------------------------------------------------------- */
function calcMatchingDiagnostics(list) {

  const ranked = [...list].sort((a,b)=>b.__score-a.__score);

  const top = ranked.slice(0,5).map(p=>p.__score||0);

  const top1 = top[0] || 0;
  const top2 = top[1] || 0;

  const mean =
    top.length
      ? top.reduce((a,b)=>a+b,0)/top.length
      : 0;

  return {
    gap12: top1 - top2,
    gap15: top1 - (top[4] || 0),
    top5Mean: mean,
    top1Ratio: mean ? top1 / mean : 0,
    totalRanked: ranked.length
  };
}

/* ---------------------------------------------------------  
   [28-B] calcMatchingScoreDetail  
--------------------------------------------------------- */
function calcMatchingScoreDetail(player) {

  if (!player || !player.updateDate) {
    return {
      score: 0,
      rankWeight: 0,
      rankScore: 0,
      prideWeight: 1,
      areaFactor: 1,
      timeWeight: 0,
      phaseScore: 0,
      recencyScore: 0,
      activityScore: 0,
      miscRaw: 0,
      miscFactor: 1,
      realtimeBoost: 1,
      baseScoreBeforeBoost: 0,
      scoreAfterBoost: 0
    };
  }

  const cfg = State.scoringConfig;

  if (!cfg) {
    return {
      score: 1,
      rankWeight: 0,
      rankScore: 1,
      prideWeight: 1,
      areaFactor: 1,
      timeWeight: 1,
      phaseScore: 0,
      recencyScore: 0,
      activityScore: 0,
      miscRaw: 0,
      miscFactor: 1,
      realtimeBoost: 1,
      baseScoreBeforeBoost: 1,
      scoreAfterBoost: 1
    };
  }

  const rankWeight = Number(getRankWeight(player) ?? 0);

  if (rankWeight <= 0) {
    return {
      score: 0,
      rankWeight: 0,
      rankScore: 0,
      prideWeight: 1,
      areaFactor: getAreaScore(player),
      timeWeight: getTimeWeight(player),
      phaseScore: 0,
      recencyScore: 0,
      activityScore: 0,
      miscRaw: 0,
      miscFactor: 1,
      realtimeBoost: Math.min(getRealtimeBoost(player), 2.5),
      baseScoreBeforeBoost: 0,
      scoreAfterBoost: 0
    };
  }

  let rankBase;

  if (cfg.rank?.mode === "sqrt") {
    rankBase = Math.sqrt(rankWeight);
  } else if (cfg.rank?.mode === "linear") {
    rankBase = rankWeight;
  } else {
    rankBase = rankWeight;
  }

  const rankScore =
    rankBase * Number(cfg.rank?.scale ?? 1);

  const prideWeight =
    Number(getPrideWeight(player) ?? 1);

  const areaFactor =
    Number(getAreaScore(player) ?? 1);

  const timeWeight =
    Number(getTimeWeight(player) ?? 0);

  const latestCopied = getLatestCopiedPlayer();

  const phaseInfo = latestCopied
    ? getPhaseDistanceMin(latestCopied.copiedAt || latestCopied.time, 5)
    : { diffMin: Infinity, inPinkWindow: false };

  const isPinkTarget =
    isMatchingCandidateByPhase(player);

  const phaseScore =
    (isPinkTarget && phaseInfo.inPinkWindow) ? 1 : 0;

  const recencyScore =
    (isPinkTarget && isFinite(phaseInfo.diffMin))
      ? Math.exp(-phaseInfo.diffMin / MATCHING_SCORE_CONFIG.recencyTau)
      : 0;

  const star = Number(player.starCnt ?? 0);
  const pride = Number(player.pridePoint ?? 0);

  const activityScore =
    (star > 0)
      ? Math.min(1, star / 7)
      : (pride > 0 ? 0.7 : 0);

  const miscRaw =
      phaseScore   * Number(cfg.misc?.phase ?? 0)
    + recencyScore * Number(cfg.misc?.recency ?? 0)
    + activityScore * Number(cfg.misc?.activity ?? 0);

  const miscFactor = 1 + (miscRaw / 50);

  let realtimeBoost =
    Math.min(getRealtimeBoost(player), 2.5);

  const baseScoreBeforeBoost =
    rankScore * prideWeight * areaFactor * miscFactor * timeWeight;

  const scoreAfterBoost =
    baseScoreBeforeBoost * realtimeBoost;

  const score =
    Math.max(0.0001, scoreAfterBoost);

  return {
    score,
    rankWeight,
    rankScore,
    prideWeight,
    areaFactor,
    timeWeight,
    phaseScore,
    recencyScore,
    activityScore,
    miscRaw,
    miscFactor,
    realtimeBoost,
    baseScoreBeforeBoost,
    scoreAfterBoost
  };
}

/* ---------------------------------------------------------  
   [29] calcMatchingScore  
--------------------------------------------------------- */
function calcMatchingScore(player) {
  return calcMatchingScoreDetail(player).score;
}

/* ---------------------------------------------------------  
   [29-B] selectByWeight  
--------------------------------------------------------- */
function selectByWeight(players, count) {

  const result = [];
  const pool = [...players];

  const safeScore = (p) => {

    const base = Math.max(0.0001, p.__score || 0);

    const timeWeight = getTimeWeight(p);
    const timeBoost = Math.pow(timeWeight, 2.0);

    const isPink = isMatchingCandidateByPhase(p);

    let pinkBoost = 1;

    if (isPink) {

      const anchor = getLatestCopiedPlayer();

      if (anchor) {

        const phase =
          getPhaseDistanceMin(anchor.copiedAt || anchor.time, 5);

        if (isFinite(phase.diffMin) && phase.diffMin >= 0) {

          const tau = 12;
          const decay = Math.exp(-phase.diffMin / tau);
          const maxBoost = 1.8;

          pinkBoost =
            1 + (maxBoost - 1) * decay;
        }
      }
    }

    return base * timeBoost * pinkBoost;
  };

  while (result.length < count && pool.length > 0) {

    const total =
      pool.reduce((sum, p) => sum + safeScore(p), 0);

    if (total <= 0) break;

    let r = Math.random() * total;

    let idx = 0;

    for (let i = 0; i < pool.length; i++) {

      r -= safeScore(pool[i]);

      if (r <= 0) {
        idx = i;
        break;
      }
    }

    result.push(pool[idx]);
    pool.splice(idx, 1);
  }

  return result;
}
/*---------------------------------------------------------
   [30] applyFilters
　　フィルタ起点時刻を　latest_update.json　の　lastUpdated　から
　　integrated_data.json　の　generatedAt　に変更
---------------------------------------------------------*/
function applyFilters() {
  const minutes = Number(document.getElementById("rangeSelect").value);

  // ① フィルタ基準時刻の決定（修正）
  let baseDate = parseDateJST(State.generatedAt);

  // fallback（generatedAtが不正）
  if (!baseDate || isNaN(baseDate.getTime())) {

    // ★ 後方互換として latestUpdateAt を使用
    baseDate = parseDateJST(State.latestUpdateAt);

    if (!baseDate || isNaN(baseDate.getTime())) {
      // ★ 最終fallback：現在時刻
      baseDate = new Date();
      logWarn("generatedAt / latestUpdateAt 未取得 → 現在時刻を使用");
    } else {
      log("フィルタ基準(latest_update fallback): " + formatYMDHM(baseDate));
    }

  } else {
    log("フィルタ基準(integrated_data): " + formatYMDHM(baseDate));
  }

  const filterBaseMs = baseDate.getTime();

  // ② フィルタ範囲
  const filterStartMs = filterBaseMs - (minutes * 60 * 1000);

  const startDate = new Date(filterStartMs);
  const startLabel = formatYMDHM(startDate);

  const el = document.getElementById("filterStartTime");
  if (el) el.textContent = startLabel;

  // ③ フィルタ処理
  let validCount = 0;
  let invalidCount = 0;

  State.filtered = State.all.filter(p => {

    if (!p.updateDate) {
      invalidCount++;
      return false;
    }

    const date = parseDateJST(p.updateDate);

    // 日付異常ガード
    if (!date || isNaN(date.getTime())) {
      invalidCount++;
      return false;
    }

    validCount++;
    return date.getTime() >= filterStartMs;
  });

  // ④ エリア分布再生成
  State.areaModel = buildAreaDistribution(State.filtered);

  // ⑤ ログ
  log("フィルタ結果: "
    + State.filtered.length
    + "件 / 有効:" + validCount
    + "件 / 無効:" + invalidCount + "件"
  );

  log("フィルタ開始時刻: " + startLabel);

  log("areaModel top5=" + JSON.stringify(
    Object.entries(State.areaModel)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
  ));
}
/* ---------------------------------------------------------      
   [31] calcStats      
--------------------------------------------------------- */
function calcStats(list, total) {
  const cnt = list.length;
  const percent = total ? Math.round((cnt / total) * 100) : 0;
  const points = list.map(p => Number(p.point ?? 0));
  const avg = cnt ? Math.round(points.reduce((a, b) => a + b, 0) / cnt) : 0;
  const min = cnt ? Math.min(...points) : 0;
  const max = cnt ? Math.max(...points) : 0;
  return { cnt, percent, avg, min, max };
}

/* ---------------------------------------------------------  
   [31-B] buildFilterGroupHTML  
--------------------------------------------------------- */
function buildFilterGroupHTML(items, options) {

  const {
    labelClass,
    inputClass,
    getValue,
    getText
  } = options;

  const itemHtml = items.map(item => `
      <label class="${labelClass}">
        <input type="checkbox" class="${inputClass}" value="${getValue(item)}" checked>
        ${getText(item)}
      </label>
    `).join("");

  return `
    <div class="filter-row">
      <div class="filter-label"></div>
      <div class="filter-items">
        ${itemHtml}
      </div>
    </div>
  `;
}

/* ---------------------------------------------------------  
   [32] buildRubyFilters  
--------------------------------------------------------- */
function buildRubyFilters() {

  const area = document.getElementById("rubyFilters");
  if (!area) return;

  const stars = Array.from({ length: 8 }, (_, i) => i + 1);

  area.innerHTML = buildFilterGroupHTML(stars, {
    labelClass: "ruby-btn",
    inputClass: "ruby-filter",
    getValue: star => star,
    getText: star => `★${star}`
  });
}

/* ---------------------------------------------------------  
   [33] buildPrideFilters  
--------------------------------------------------------- */
function buildPrideFilters() {

  const area = document.getElementById("prideFilters");
  if (!area) return;

  area.innerHTML = buildFilterGroupHTML(PRIDE_LEVELS, {
    labelClass: "pride-btn",
    inputClass: "pride-filter",
    getValue: p => p.key,
    getText: p => p.key.replace("P_", "")
  });
}

/* ---------------------------------------------------------      
   [34] buildSummary      
--------------------------------------------------------- */
function buildSummary() {

  State.summary = [];

  const selectedStars =
    [...document.querySelectorAll(".ruby-filter:checked")]
      .map(x => Number(x.value));

  const selectedPrides =
    [...document.querySelectorAll(".pride-filter:checked")]
      .map(x => x.value);

  const base = State.filtered;

  State.summary =
    RANKS
      .filter(rank => {
        if (rank.type === "ruby") return selectedStars.includes(rank.star);
        if (rank.type === "pride") return selectedPrides.includes(rank.key);
        return false;
      })
      .map(rank => {

        const list = base.filter(p => {

          if (rank.type === "ruby") {
            return p.onlineBattleRankId === RUBY_ID && p.starCnt === rank.star;
          } else {
            const pt = Number(p.pridePoint ?? 0);
            return pt >= rank.min && pt <= rank.max;
          }
        });

        return {
          key: rank.key,
          label: rank.label,
          icon: rank.icon,
          list
        };
      });
}

/* ---------------------------------------------------------      
   [35] filterSummaryBySearch      
--------------------------------------------------------- */
function filterSummaryBySearch() {

  const norm = normalize(State.searchText);
  if (!norm) return State.summary;

  const filtered =
    State.summary
      .map(r => {
        const filteredList =
          r.list.filter(p =>
            (p.normalizedName || "").includes(norm)
          );
        return { ...r, list: filteredList };
      })
      .filter(r => r.list.length > 0);

  return filtered;
}

/* ---------------------------------------------------------  
   [36] renderSummary    
--------------------------------------------------------- */
function renderSummary() {

  const area = document.getElementById("summaryArea");

  const filteredSummary = filterSummaryBySearch();

  const total =
    filteredSummary.reduce((sum, r) => sum + r.list.length, 0);

  const rubyTotal =
    filteredSummary
      .filter(r => r.key.startsWith("R"))
      .reduce((s, r) => s + r.list.length, 0);

  const prideTotal = total - rubyTotal;

  const rankPercent = total ? Math.round((rubyTotal / total) * 100) : 0;
  const pridePercent = total ? Math.round((prideTotal / total) * 100) : 0;

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

          const { cnt, percent, avg, min, max } =
            calcStats(r.list, total);

          return `
            <tr class="clickable" data-key="${r.key}">
              <td class="center"><img src="${r.icon}" width="32"></td>
              <td class="left">${r.label}</td>
              <td class="right">${fmt(cnt)}</td>
              <td class="right">${percent}%</td>
              <td class="center">
                <div class="bar-wrap">
                  <div class="bar" style="width:${percent}%;"></div>
                </div>
              </td>
              <td class="right">${fmt(avg)}</td>
              <td class="right">${fmt(min)}</td>
              <td class="right">${fmt(max)}</td>
            </tr>
          `;
        }).join("")}

      </table>
    </div>
  `;

  document.querySelectorAll("#summaryArea .clickable").forEach(tr => {
    tr.addEventListener("click", () => {
      const key = tr.dataset.key;
      State.currentIsRubyBand = key.startsWith("R");
      showDetail(key);
    });
  });

  // ★ 状態クリア
  State.currentDetailKey = "";
  State.currentDetailLabel = "";
  State.currentDetailIcon = "";

  setCurrentView(STATE.SUMMARY);
  switchDisplayView(STATE.SUMMARY);
}
/* ---------------------------------------------------------
   [37] showSummaryUI      
--------------------------------------------------------- */      
function showSummaryUI(push = true) {
  renderSummary();

  setCurrentView(STATE.SUMMARY);
  switchDisplayView(STATE.SUMMARY);

  if (push) {
    history.pushState({ page: STATE.SUMMARY }, '', '');
  }
}

/* ---------------------------------------------------------      
   [38] setupRankNavigation      
--------------------------------------------------------- */      
function setupRankNavigation(currentKey) {

  const idx = getRankIndex(currentKey);

  const prev = idx > 0 ? RANKS[idx - 1].key : null;
  const next = idx >= 0 && idx < RANKS.length - 1 ? RANKS[idx + 1].key : null;

  const prevBtn = document.getElementById("prevRankBtn");
  const nextBtn = document.getElementById("nextRankBtn");

  prevBtn.disabled = !prev;
  nextBtn.disabled = !next;

  prevBtn.onclick = () => prev && showDetail(prev);
  nextBtn.onclick = () => next && showDetail(next);
}

/* ---------------------------------------------------------  
   [39] showDetail    
--------------------------------------------------------- */  
function showDetail(key, push = true) {

  const row = State.summary.find(r => r.key === key) || null;
  const rankInfo = getRankInfo(key);

  const isRubyBand = rankInfo
    ? rankInfo.type === "ruby"
    : key.startsWith("R");

  const bandLabel = rankInfo
    ? rankInfo.label
    : (row ? row.label : key);

  const bandIcon = rankInfo ? rankInfo.icon : "";

  setupRankNavigation(key);

  if (!row) {

    State.detailOriginal = [];

    setCurrentView(STATE.DETAIL);

    State.currentIsRubyBand = isRubyBand;
    State.currentDetailKey = key;
    State.currentDetailLabel = bandLabel;
    State.currentDetailIcon = bandIcon;

    if (push) {
      history.pushState(
        { page: STATE.DETAIL, key, label: bandLabel, icon: bandIcon },
        '',
        ''
      );
    }

    renderDetailTable(isRubyBand, bandLabel, bandIcon);
    switchDisplayView(STATE.DETAIL);

    return;
  }

  State.detailOriginal = row.list
    .slice()
    .sort((a, b) =>
      parseDateJST(b.updateDate) - parseDateJST(a.updateDate)
    );

  setCurrentView(STATE.DETAIL);

  State.currentIsRubyBand = isRubyBand;
  State.currentDetailKey = key;
  State.currentDetailLabel = bandLabel;
  State.currentDetailIcon = bandIcon;

  if (push) {
    history.pushState(
      { page: STATE.DETAIL, key, label: bandLabel, icon: bandIcon },
      '',
      ''
    );
  }

  renderDetailTable(isRubyBand, bandLabel, bandIcon);
  switchDisplayView(STATE.DETAIL);
}

/* ---------------------------------------------------------      
   [40] renderDetailTable      
--------------------------------------------------------- */      
function renderDetailTable(isRubyBand, bandLabel, bandIcon) {

  const area = document.getElementById("detailArea");

  const list = applyPlayerFilter(State.searchText, isRubyBand, true);

  area.innerHTML = `
    <h3>
      <span style="margin-right:8px;">
        ${bandIcon ? `<img src="${bandIcon}" width="32">` : ""}
      </span>
      <span>${bandLabel}</span>
      <span style="margin-left:16px;">（${fmt(list.length)}人）</span>
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

  renderDetailRows(list, isRubyBand);
}

/* ---------------------------------------------------------  
   [41-A] buildPlayerRowHTML  
--------------------------------------------------------- */
function buildPlayerRowHTML(p) {

  const titleUrl = p.mytitleId
    ? `https://initiald.sega.jp/inidac/ranking-images/title/${p.mytitleId}.png`
    : "";

  const isRuby = p.onlineBattleRankId === RUBY_ID && p.starCnt;

  const starOrLevel = isRuby
    ? renderStars(p.starCnt)
    : p.pridePoint;

  const fullShop = p.shopname ?? "";
  const shortShop = shortenStoreName(fullShop);

  const copyValue = isRuby
    ? `★${"★".repeat(p.starCnt - 1)}\t${p.name}`
    : `${p.pridePoint}\t${p.name}`;

  return `
    <tr data-updated="${p.updateDate}">
      <td class="center clickable"
          onclick="copyToClipboard('${copyValue}')">
        ${starOrLevel}
      </td>
      <td class="left player-name clickable" onclick="copyToClipboard('${p.name}')">
        ${p.name}
      </td>
      <td class="right">${fmt(p.point)}</td>
      <td class="left clickable"
          data-fullname="${fullShop.replace(/"/g, "&quot;")}"
          onclick="copyToClipboard('${fullShop.replace(/'/g, "\\'")}')">
        <div class="store-name">${shortShop}</div>
      </td>
      <td class="center">${titleUrl ? `<img src="${titleUrl}" height="24">` : ""}</td>
      <td class="left">${p.updateDate}</td>
    </tr>
  `;
}

/* ---------------------------------------------------------  
   [41-B] highlightMatchingRows  
--------------------------------------------------------- */
function highlightMatchingRows(tbody) {

  const anchor = getLatestCopiedPlayer();
  if (!anchor) return;

  tbody.querySelectorAll("tr").forEach(tr => {

    const updated = tr.dataset.updated || "";

    const nameCell = tr.querySelector(".player-name");

    const rowName = nameCell ? String(nameCell.textContent).trim() : "";

    const rowPlayer = {
      name: rowName,
      updateDate: updated
    };

    if (isMatchingCandidateByPhase(rowPlayer)) {
      tr.classList.add("match-row-pink");
    } else {
      tr.classList.remove("match-row-pink");
    }
  });
}

/* ---------------------------------------------------------  
   [41-C] renderPlayerRowsToBody  
--------------------------------------------------------- */
function renderPlayerRowsToBody(tbodyId, list) {

  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  const rows = list.map(p => buildPlayerRowHTML(p)).join("");

  tbody.innerHTML = rows;

  highlightMatchingRows(tbody);
}

/* ---------------------------------------------------------  
   [41] renderDetailRows      
--------------------------------------------------------- */
function renderDetailRows(list, isRubyBand) {
  renderPlayerRowsToBody("detailTableBody", list);
}

/* ---------------------------------------------------------  
   [50] renderMatchingRows      
--------------------------------------------------------- */
function renderMatchingRows(list) {
  renderPlayerRowsToBody("matchingTableBody", list);
}

/* ---------------------------------------------------------  
   [42] applyPlayerFilter      
--------------------------------------------------------- */
function applyPlayerFilter(keyword, keepOriginalOrder = false) {

  const normKey = normalize(keyword);

  let base = State.detailOriginal.slice();

  if (!keepOriginalOrder) {
    base = base.sort((a, b) =>
      parseDateJST(b.updateDate) - parseDateJST(a.updateDate)
    );
  }

  if (!normKey) return base;

  return base.filter(p =>
    (p.normalizedName || "").includes(normKey)
  );
}
/* ---------------------------------------------------------
   [43] downloadCSV    
--------------------------------------------------------- */      
function downloadCSV(filename, header, body) {      
  const bom = "\uFEFF"; // UTF-8 BOM      
  const csv = bom + header + "\n" + body;      
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });      
  const url = URL.createObjectURL(blob);      
  const a = document.createElement("a");      
  a.href = url;      
  a.download = filename;      
  a.click();      
  URL.revokeObjectURL(url);      
}      

/* ---------------------------------------------------------      
   [44] exportSummaryCSV      
--------------------------------------------------------- */      
function exportSummaryCSV() {      
  const header = "帯,人数,%,平均RP,最小RP,最大RP";      

  const total = State.summary.reduce((sum, r) => sum + r.list.length, 0);      

  const body = State.summary.map(r => {      
    const { cnt, percent, avg, min, max } = calcStats(r.list, total);      
    return `${r.label},${cnt},${percent},${avg},${min},${max}`;      
  }).join("\n");      

  downloadCSV("summary.csv", header, body);      
}      

/* ---------------------------------------------------------      
   [45] exportAllCSV      
--------------------------------------------------------- */      
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

  const body = State.all
    .map(p =>
      fields
        .map(key => `"${String(p[key] ?? "").replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n");

  downloadCSV("all_records.csv", header, body);      
}      

/* ---------------------------------------------------------  
   [46] copyToClipboard  
--------------------------------------------------------- */
function copyToClipboard(text) {

  const afterCopySuccess = () => {

    const record = saveCopyEventUnified(text);

    log(
      "コピー: " + (record.name || "-")
      + " / CandidateRank:" + (record.candidateRank || "-")
      + " / DisplayRank:" + (record.displayRank || "-")
      + " / Score:" + (record.score || "-")
      + " / Miss:" + (record.missReason || "-")
    );

    recordClickFromCopiedText(text);
  };

  if (!navigator.clipboard) {

    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);

    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);

    afterCopySuccess();
    return;
  }

  navigator.clipboard.writeText(text)
    .then(() => {
      afterCopySuccess();
    })
    .catch(() => {
      logError("コピーに失敗しました");
    });
}

/* ---------------------------------------------------------  
   [46-A] findCandidateInfoForLog  
--------------------------------------------------------- */
function findCandidateInfoForLog(player) {

  const emptyResult = {
    candidateRank: null,
    displayRank: null,
    baseRank: null,
    boostedRank: null,
    score: null,
    baseScoreBeforeBoost: null,
    scoreAfterBoost: null,
    rankingSource: "none",
    diagnostics: State.matchingDiagnostics || null,
    missReasons: [],
    rankWeight: 0,
    scoreDetail: null,
    cooldownExcluded: false,
    cooldownRemainingSec: null
  };

  if (!player) {
    return {
      ...emptyResult,
      missReasons: ["player_not_found"]
    };
  }

  const normalizePair = (obj) => ({
    name: normalizePlayerName(obj?.name || ""),
    updateDate: String(obj?.updateDate || "")
  });

  const isSamePlayer = (a, b) => {
    const aa = normalizePair(a);
    const bb = normalizePair(b);
    return aa.name === bb.name && aa.updateDate === bb.updateDate;
  };

  const allRanked = Array.isArray(State.matchingRankedAll) ? State.matchingRankedAll : [];
  const displayList = Array.isArray(State.matchingList) ? State.matchingList : [];
  const filtered = Array.isArray(State.filtered) ? State.filtered : [];

  const scoreDetail = calcMatchingScoreDetail(player);

  const missReasons = [];

  const inFiltered = filtered.some(p => isSamePlayer(p, player));
  const inAllRanked = allRanked.findIndex(p => isSamePlayer(p, player));
  const inDisplay = displayList.findIndex(p => isSamePlayer(p, player));

  const rankKey = getPlayerRankKey(player);

  const selectedStars = [...document.querySelectorAll(".ruby-filter:checked")]
    .map(x => Number(x.value));

  const selectedPrides = [...document.querySelectorAll(".pride-filter:checked")]
    .map(x => x.value);

  let inUiPool = false;

  if (rankKey) {
    if (String(rankKey).startsWith("R")) {
      inUiPool = selectedStars.includes(Number(player.starCnt));
    } else {
      inUiPool = selectedPrides.includes(rankKey);
    }
  }

  // ----- cooldown
  let cooldownExcluded = false;
  let cooldownRemainingSec = null;

  const latestCopied = getLatestCopiedPlayer();

  if (latestCopied && isSamePlayer(player, latestCopied)) {
    const phase = getRoundedDiffMinAndPhaseDistance(
      latestCopied.copiedAt || latestCopied.time,
      5
    );

    if (phase && phase.isInitialCooldown) {
      cooldownExcluded = true;
      cooldownRemainingSec = Number(phase.cooldownRemainingSec ?? 0);
    }
  }

  /* -------------------------------------------------------
     boost前 / boost後 順位再構築
     ※ 現在の State.filtered を基準に再評価
  ------------------------------------------------------- */
  const rescoredAll = filtered.map(p => {
    const detail = calcMatchingScoreDetail(p);
    return {
      ...p,
      __rankKey: getPlayerRankKey(p),
      __score: Number(detail.score ?? 0),
      __detail: detail
    };
  });

  const rescoredByUi = rescoredAll.filter(p => {
    if (!p.updateDate) return false;
    if (!p.__rankKey) return false;

    if (String(p.__rankKey).startsWith("R")) {
      return selectedStars.includes(Number(p.starCnt));
    }
    return selectedPrides.includes(p.__rankKey);
  });

  const rescoredByRankModel = rescoredByUi.filter(p =>
    Number(p.__detail?.rankWeight ?? 0) > 0
  );

  // ★ 現行 buildMatchingCandidates と整合：rankModel pool があれば優先、なければ UI pool
  const analysisBaseBeforeCooldown =
    rescoredByRankModel.length > 0 ? rescoredByRankModel : rescoredByUi;

  // boost前順位（baseScoreBeforeBoost基準）
  const baseRanked = [...analysisBaseBeforeCooldown].sort((a, b) => {
    const aBase = Number(a.__detail?.baseScoreBeforeBoost ?? 0);
    const bBase = Number(b.__detail?.baseScoreBeforeBoost ?? 0);
    return bBase - aBase;
  });

  const baseRankIndex = baseRanked.findIndex(p => isSamePlayer(p, player));
  const baseRank = baseRankIndex >= 0 ? baseRankIndex + 1 : null;

  // cooldown除外後の boost後順位（scoreAfterBoost基準）
  const analysisBaseAfterCooldown = analysisBaseBeforeCooldown.filter(p => {
    if (!latestCopied) return true;
    if (!isSamePlayer(p, latestCopied)) return true;

    const phase = getRoundedDiffMinAndPhaseDistance(
      latestCopied.copiedAt || latestCopied.time,
      5
    );
    return !(phase && phase.isInitialCooldown);
  });

  const boostedRanked = [...analysisBaseAfterCooldown].sort((a, b) => {
    const aBoosted = Number(a.__detail?.scoreAfterBoost ?? a.__score ?? 0);
    const bBoosted = Number(b.__detail?.scoreAfterBoost ?? b.__score ?? 0);
    return bBoosted - aBoosted;
  });

  const boostedRankIndex = boostedRanked.findIndex(p => isSamePlayer(p, player));
  const boostedRank = boostedRankIndex >= 0 ? boostedRankIndex + 1 : null;

  /* -------------------------------------------------------
     欠落原因分類
  ------------------------------------------------------- */
  if (!player.updateDate) {
    missReasons.push("no_updateDate");
  } else if (!parseDateJST(player.updateDate)) {
    missReasons.push("invalid_updateDate");
  }

  if (!inFiltered) missReasons.push("outside_time_filter");
  if (!rankKey) missReasons.push("no_rankKey");
  if (rankKey && !inUiPool) missReasons.push("ui_filtered_out");
  if (Number(scoreDetail?.rankWeight ?? 0) <= 0) missReasons.push("rank_model_zero");
  if (cooldownExcluded) missReasons.push("cooldown_excluded");
  if (allRanked.length === 0) missReasons.push("candidate_not_built");

  if (allRanked.length > 0 && inAllRanked < 0 && !cooldownExcluded) {
    missReasons.push("outside_analysis_pool");
  }

  if (displayList.length > 0 && inDisplay < 0) {
    missReasons.push("outside_display_top10");
  }

  return {
    // ★ 既存返却項目
    candidateRank: inAllRanked >= 0 ? inAllRanked + 1 : null,
    displayRank: inDisplay >= 0 ? inDisplay + 1 : null,
    score: inAllRanked >= 0 ? Number(allRanked[inAllRanked].__score ?? 0) : null,
    rankingSource: allRanked.length ? "all" : "display",
    diagnostics: State.matchingDiagnostics || null,
    missReasons,
    rankWeight: Number(scoreDetail?.rankWeight ?? 0),
    scoreDetail,

    // ★ 追加返却項目
    baseRank,
    boostedRank,
    baseScoreBeforeBoost: Number(scoreDetail?.baseScoreBeforeBoost ?? 0),
    scoreAfterBoost: Number(scoreDetail?.scoreAfterBoost ?? scoreDetail?.score ?? 0),
    cooldownExcluded,
    cooldownRemainingSec
  };
}
/* ---------------------------------------------------------
   [47] buildMatchingCandidates（完全差し替え）
   ★ コピー後5分45秒除外＋除外理由記録
--------------------------------------------------------- */
function buildMatchingCandidates() {
  const selectedStars = [...document.querySelectorAll(".ruby-filter:checked")]
    .map(x => Number(x.value));
  const selectedPrides = [...document.querySelectorAll(".pride-filter:checked")]
    .map(x => x.value);

  const base = State.filtered;

  const scoredAll = base.map(p => {
    const detail = calcMatchingScoreDetail(p);
    return {
      ...p,
      __rankKey: getPlayerRankKey(p),
      __score: Number(detail.score ?? 0),
      __detail: detail
    };
  });

  const filteredByUi = scoredAll.filter(p => {
    if (!p.updateDate) return false;
    if (!p.__rankKey) return false;
    if (p.__rankKey.startsWith("R")) {
      return selectedStars.includes(Number(p.starCnt));
    } else {
      return selectedPrides.includes(p.__rankKey);
    }
  });

  const filteredByRankModel = filteredByUi.filter(p =>
    Number(p.__detail?.rankWeight ?? 0) > 0
  );

  const latestCopied = getLatestCopiedPlayer();
  let cooldownExcludedCount = 0;

  let analysisBase = filteredByRankModel;
  if (latestCopied) {
    analysisBase = filteredByRankModel.filter(p => {
      const sameName = normalizePlayerName(p.name) === normalizePlayerName(latestCopied.name);
      const sameUpdateDate = String(p.updateDate ?? "") === String(latestCopied.updateDate ?? "");

      if (sameName && sameUpdateDate) {
        const phase = getRoundedDiffMinAndPhaseDistance(
          latestCopied.copiedAt || latestCopied.time,
          5
        );
        if (phase.isInitialCooldown) {
          cooldownExcludedCount++;
          return false;
        }
      }
      return true;
    });
  }

  const rankedAll = [...analysisBase].sort((a, b) => b.__score - a.__score);
  State.matchingRankedAll = rankedAll;
  State.matchingDiagnostics = calcMatchingDiagnostics(rankedAll);

  const diag = State.matchingDiagnostics;
  const isCluster = diag && diag.gap12 < 0.05;

  let selected = [];
  const initialNeed = Math.min(10, rankedAll.length);
  if (initialNeed > 0) {
    selected = selectByWeight(rankedAll, initialNeed);
  }

  if (selected.length < 10) {
    const existing = new Set(
      selected.map(p => `${normalizePlayerName(p.name)}@@${String(p.updateDate ?? "")}`)
    );

    const fallbackPool = filteredByUi.filter(p =>
      !existing.has(`${normalizePlayerName(p.name)}@@${String(p.updateDate ?? "")}`)
    );

    let fallbackFiltered = fallbackPool;
    if (latestCopied) {
      fallbackFiltered = fallbackPool.filter(p => {
        const sameName = normalizePlayerName(p.name) === normalizePlayerName(latestCopied.name);
        const sameUpdateDate = String(p.updateDate ?? "") === String(latestCopied.updateDate ?? "");

        if (sameName && sameUpdateDate) {
          const phase = getRoundedDiffMinAndPhaseDistance(
            latestCopied.copiedAt || latestCopied.time,
            5
          );
          if (phase.isInitialCooldown) {
            return false;
          }
        }
        return true;
      });
    }

    const restNeed = 10 - selected.length;
    if (restNeed > 0 && fallbackFiltered.length > 0) {
      selected = [...selected, ...selectByWeight(fallbackFiltered, restNeed)];
    }
  }

  selected.sort((a, b) => b.__score - a.__score);
  State.matchingList = selected;

  const rankKeyMissing = scoredAll.filter(p => !p.__rankKey).length;
  const rankModelExcluded = filteredByUi.filter(p => Number(p.__detail?.rankWeight ?? 0) <= 0).length;

  log(`候補生成: Base=${base.length}`
    + ` / UiPool=${filteredByUi.length}`
    + ` / RankModelPool=${filteredByRankModel.length}`
    + ` / CooldownExcluded=${cooldownExcludedCount}`
    + ` / Selected=${selected.length}`
  );

  log(`候補欠落内訳: noRankKey=${rankKeyMissing}`
    + ` / rankModelZero=${rankModelExcluded}`
    + ` / cooldownExcluded=${cooldownExcludedCount}`
    + ` / analysisFallback=${filteredByRankModel.length > 0 ? "NO" : "YES"}`
  );

  log(`診断: Gap12=${Number(diag?.gap12 ?? 0).toFixed(2)}`
    + ` / Ratio=${Number(diag?.top1Ratio ?? 0).toFixed(2)}`
    + ` / Cluster=${isCluster ? "YES" : "NO"}`
  );

  log(`表示TOP: ${formatMatchTopList(selected)}`);

  if (MATCHING_LOG_CONFIG.verboseTopDetails) {
    rankedAll.slice(0, 3).forEach((p, idx) => {
      const d = p.__detail || {};
      log(
        `[DEBUG] Rank=${idx + 1}`
        + ` / name=${p.name}`
        + ` / score=${p.__score.toFixed(3)}`
        + ` / rankWeight=${Number(d.rankWeight ?? 0).toFixed(3)}`
        + ` / rankScore=${Number(d.rankScore ?? 0).toFixed(3)}`
        + ` / timeWeight=${Number(d.timeWeight ?? 0).toFixed(3)}`
        + ` / areaFactor=${Number(d.areaFactor ?? 1).toFixed(3)}`
        + ` / boost=${Number(d.realtimeBoost ?? 1).toFixed(3)}`
      );
    });
  }
  logEvent("cycle", {
    total: rankedAll.length,
    sel: selected.length
  });
}
/* ---------------------------------------------------------
   [48] renderMatchingHeader      
--------------------------------------------------------- */      
function renderMatchingHeader() {

  const headerEl = document.getElementById("matchingHeader");
  if (!headerEl) return;

  if (!State.matchingList.length) {
    headerEl.innerHTML = "<span>マッチング候補は現在 0人です。</span>";
    return;
  }

  const counts = {};

  State.matchingList.forEach(p => {
    const key = p.__rankKey;
    counts[key] = (counts[key] || 0) + 1;
  });

  const parts =
    RANKS
      .filter(r => counts[r.key])
      .map(r => {
        const cnt = counts[r.key];
        return `
          <span style="margin-right:12px; white-space:nowrap;">
            <img src="${r.icon}" width="24" style="vertical-align:middle; margin-right:4px;">
            ${r.label}：${fmt(cnt)}人
          </span>
        `;
      });

  headerEl.innerHTML = parts.join("");
}

/* ---------------------------------------------------------      
   [49] renderMatchingTable      
--------------------------------------------------------- */      
function renderMatchingTable() {

  const area = document.getElementById("matchingArea");
  if (!area) return;

  const total = State.matchingList.length;

  area.innerHTML = `
    <h3>
      マッチング候補：<span id="matchingCount">${fmt(total)}</span>人
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
        <tbody id="matchingTableBody"></tbody>
      </table>
    </div>
  `;

  renderMatchingRows(State.matchingList);
}

/* ---------------------------------------------------------      
   [51] applyMatchingFilter      
--------------------------------------------------------- */      
function applyMatchingFilter(keyword) {

  const base = State.matchingList || [];
  const normKey = normalize(keyword);

  const list =
    normKey
      ? base.filter(p => (p.normalizedName || "").includes(normKey))
      : base;

  const countEl = document.getElementById("matchingCount");
  if (countEl) countEl.textContent = fmt(list.length);

  renderMatchingRows(list);
}

/* ---------------------------------------------------------  
   [52] showMatchingCandidates      
--------------------------------------------------------- */  
function showMatchingCandidates(push = true) {

  buildMatchingCandidates();

  renderMatchingHeader();
  renderMatchingTable();

  setCurrentView(STATE.MATCHING);
  switchDisplayView(STATE.MATCHING);

  if (push) {
    history.pushState({ page: STATE.MATCHING }, '', '');
  }
}

/* ---------------------------------------------------------      
   [53] backToSummaryFromMatching      
--------------------------------------------------------- */      
function backToSummaryFromMatching() {
  State.currentView = "summary";
  renderSummary();
}

/* ---------------------------------------------------------      
   [54] clearSearch      
--------------------------------------------------------- */      
function clearSearch() {

  const input = document.getElementById('searchInput');
  if (input) input.value = '';

  State.searchText = '';
}

/* ---------------------------------------------------------  
   [55] init      
--------------------------------------------------------- */  
async function init() {

  log("Viewer 初期化中");

  // ★追加
  await initLogDB();

  startProgress();

  buildRubyFilters();
  buildPrideFilters();

  try {

    log("初期データ並列取得開始");

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
    applyLatestRoundJson(latestRoundJson);
    applyLatestUpdateJson(latestUpdateJson);
    applyRankModelJson(rankModelJson);
    applyScoringConfigJson(scoringConfigJson);
    applyRoundDataJson(roundDataJson, { resetReloadButton: true });

  } catch (e) {

    logError("初期化並列取得に失敗：" + e.message);
    logWarn("逐次ロードへフォールバックします");

    await loadAreaList();
    await loadLatestRound();
    await loadLatestUpdate();
    await loadRankModel();
    await loadScoringConfig();
    await loadRoundData();
  }

  applyFilters();
  buildSummary();
  renderSummary();


  startUpdateWatch();
}
/* ---------------------------------------------------------
   [56] DOMContentLoaded  
--------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {

  // 履歴初期化（戻る対策）
  history.replaceState({ page: STATE.SUMMARY }, '', '');
  history.pushState({ page: STATE.SUMMARY }, '', '');

  // 要素取得
  const reloadBtn = document.getElementById("reloadBtn");
  const filterBtn = document.getElementById("filterBtn");
  const summaryCsvBtn = document.getElementById("summaryCsvBtn");
  const allCsvBtn = document.getElementById("allCsvBtn");
  const exportJsonBtn = document.getElementById("exportJsonBtn");
  const backBtn = document.getElementById("backBtn");
  const matchingBtn = document.getElementById("matchingBtn");
  const matchingBackBtn = document.getElementById("matchingBackBtn");
  const searchInput = document.getElementById("searchInput");

  // 最新データ取得
  if (reloadBtn) {
    reloadBtn.classList.remove("update-alert");
    reloadBtn.style.cssText = "";
    reloadBtn.onclick = async () => {
      await reloadLatestDataPreferPrefetch();
    };
  }

  // フィルタ適用
  if (filterBtn) {
    filterBtn.onclick = () => {
      startProgress();
      applyFilters();
      buildSummary();
      renderSummary();
      stopProgress();
    };
  }

  // CSV / JSON
  if (summaryCsvBtn) summaryCsvBtn.onclick = exportSummaryCSV;
  if (allCsvBtn) allCsvBtn.onclick = exportAllCSV;

  if (exportJsonBtn) {
    if (typeof exportTodayLogsAsJSON === "function") {
      exportJsonBtn.onclick = exportTodayLogsAsJSON;
      exportJsonBtn.disabled = false;
    } else {
      exportJsonBtn.disabled = true;
      logWarn("JSON出力機能が未定義のため、本日分Logボタンを無効化しました");
    }
  }

  // 検索
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      State.searchText = e.target.value;

      if (isCurrentView(STATE.SUMMARY)) {
        renderSummary();
      } else if (isCurrentView(STATE.DETAIL)) {
        applyPlayerFilter(State.searchText, State.currentIsRubyBand);
        renderDetailTable(
          State.currentIsRubyBand,
          State.currentDetailLabel || "",
          State.currentDetailIcon || ""
        );
      } else if (isCurrentView(STATE.MATCHING)) {
        applyMatchingFilter(State.searchText);
      }
    });
  }

  // サマリ戻る
  if (backBtn && searchInput) {
    backBtn.onclick = () => {
      State.searchText = "";
      searchInput.value = "";
      showSummaryUI(true);
    };
  }

  // マッチング表示
  if (matchingBtn && searchInput) {
    matchingBtn.onclick = () => {
      State.searchText = "";
      searchInput.value = "";
      showMatchingCandidates(true);
    };
  }

  // マッチング戻る
  if (matchingBackBtn && searchInput) {
    matchingBackBtn.onclick = () => {
      State.searchText = "";
      searchInput.value = "";
      backToSummaryFromMatching(true);
    };
  }

  // ランク選択
  const myRankSelect = document.getElementById("myRankSelect");
  if (myRankSelect) {
    syncMyRankSelection(myRankSelect.value);
    myRankSelect.addEventListener("change", (e) => {
      const selectedMyRank = syncMyRankSelection(e.target.value);
      log(`自分ランク変更：${selectedMyRank}`);
    });
  }

  // 初期化
  init();
});
/* ---------------------------------------------------------  
   [57] popstate（完全復元）  
--------------------------------------------------------- */
window.addEventListener('popstate', (e) => {

  const state = e.state || { page: STATE.SUMMARY };

  /* -------- DETAIL -------- */
  if (state.page === STATE.DETAIL) {

    const key = state.key || State.currentDetailKey;

    if (!key) {

      clearSearch();

      const input = document.getElementById("searchInput");
      if (input) input.value = "";

      showSummaryUI(false);
      return;
    }

    if (State.searchText) {

      clearSearch();

      const input = document.getElementById("searchInput");
      if (input) input.value = "";
    }

    showDetail(key, false);
    return;
  }

  /* -------- MATCHING -------- */
  if (state.page === STATE.MATCHING) {

    if (State.searchText) {

      clearSearch();

      const input = document.getElementById("searchInput");
      if (input) input.value = "";
    }

    showMatchingCandidates(false);
    return;
  }

  /* -------- SUMMARY -------- */
  clearSearch();

  const input = document.getElementById("searchInput");
  if (input) input.value = "";

  showSummaryUI(false);
});
/* ---------------------------------------------------------
   [58] startUpdateWatch（更新監視開始）
--------------------------------------------------------- */
function startUpdateWatch() {

  // ★ 多重防止
  if (State.updateWatchTimer) {
    clearInterval(State.updateWatchTimer);
  }

  // ★ 初回チェック
  checkUpdate();

  // ★ 定期監視
  State.updateWatchTimer = setInterval(() => {
    checkUpdate();
  }, 30000);

  log("更新監視を開始（30秒間隔）");
}
/* ---------------------------------------------------------/
   [59]CopyEventUnified
   ★ copyログ完全保存（localStorage + IndexedDB併用）
--------------------------------------------------------- */
function saveCopyEventUnified(rawText) {

  const player = findPlayerFromCopiedText(rawText);
  const candidateInfo = player ? (findCandidateInfoForLog(player) || {}) : {};

  const record = {
    type: "copy",

    name: player?.name || "",
    savedAt: getNowLabelJa(),

    generatedAt: State.generatedAt || "",
    latestUpdateAt: State.latestUpdateAt || "",

    candidateRank: candidateInfo.candidateRank ?? null,
    displayRank: candidateInfo.displayRank ?? null,
    baseRank: candidateInfo.baseRank ?? null,

    score: candidateInfo.score ?? null,

    missReason: (candidateInfo.missReasons || []).join("|"),

    // 補助情報
    cooldownExcluded: !!candidateInfo.cooldownExcluded,
    cooldownRemainingSec: candidateInfo.cooldownRemainingSec ?? null
  };

  // -----------------------------------------------------
  // localStorage 保存のみ
  // -----------------------------------------------------
  saveCopyEventToStorage(record);

  // ★追加（これが今回の本体）
  logEvent("copy", {
    n: record.name,
    cR: record.candidateRank ?? -1,
    dR: record.displayRank ?? -1,
    s: record.score ?? 0,
    m: record.missReason ?? ""
  });

  return record;
}

/* =========================================================
 [60-01] LOG IndexedDBスキーマ定義（最小）
========================================================= */
const LOG_DB_NAME = "viewer_logs_db";
const LOG_DB_VERSION = 1;

const LOG_STORE = {
  events: "events",          // 汎用イベント
  copyEvents: "copyEvents",  // copy専用
  cycleEvents: "cycleEvents" // cycle専用
};

let logDB = null;

/* =========================================================
 [60-02]  LOG 初期化
========================================================= */
function initLogDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(LOG_DB_NAME, LOG_DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains(LOG_STORE.events)) {
        db.createObjectStore(LOG_STORE.events, {
          keyPath: "id",
          autoIncrement: true
        });
      }

      if (!db.objectStoreNames.contains(LOG_STORE.copyEvents)) {
        db.createObjectStore(LOG_STORE.copyEvents, {
          keyPath: "id",
          autoIncrement: true
        });
      }

      if (!db.objectStoreNames.contains(LOG_STORE.cycleEvents)) {
        db.createObjectStore(LOG_STORE.cycleEvents, {
          keyPath: "id",
          autoIncrement: true
        });
      }
    };

    req.onsuccess = (e) => {
      logDB = e.target.result;
      console.log("[LOG] IndexedDB ready");
      resolve();
    };

    req.onerror = (e) => {
      console.error("[LOG] DB init failed", e);
      reject(e);
    };
  });
}

/* =========================================================
 [60-03] LOG 共通保存（append）
========================================================= */
function putLog(storeName, data) {
  if (!logDB) return;

  const tx = logDB.transaction(storeName, "readwrite");
  const store = tx.objectStore(storeName);

  store.put(data); // append（autoIncrement）
}

/* =========================================================
 [60-04] LOG logEvent（単一入口）
========================================================= */
function logEvent(type, payload = {}) {
  const now = Date.now();

  // ★ 軽量フォーマット（キー短縮）
  const record = {
    t: now,        // timestamp
    e: type,       // event type
    ...payload     // data
  };

  // -------- store振り分け --------
  if (type === "copy") {
    putLog(LOG_STORE.copyEvents, record);
  } else if (type === "cycle") {
    putLog(LOG_STORE.cycleEvents, record);
  } else {
    putLog(LOG_STORE.events, record);
  }
}

/* =========================================================
 [60-05] LOG 動作確認（テスト）
========================================================= */
async function testLog() {
  await initLogDB();

  logEvent("test", { a: 1 });
  logEvent("copy", { n: "player1", r: 3 });
  logEvent("cycle", { step: 2 });

  console.log("[LOG] test events saved");
}
