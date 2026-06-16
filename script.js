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
  matchingRankedAll: [],      // 抽選前の全件順位
  matchingDiagnostics: null,  // Gapなどの診断値
  rankModel: null,
  myStar: 6,
  recentClicks: [],
  areaModel: {},
  scoringConfig: null,
  updateWatchTimer: null,
  prefetchedRoundData: null,
  prefetchedForUpdateAt: "",
  prefetchInFlight: null,

  // ★追加：デバッグセッション
  debugSession: null,
  debugHistory: []
};
/* ---------------------------------------------------------    
  [04] RUBY帯・PRIDE帯 定義
--------------------------------------------------------- */    
const RUBY_ID =    
  "dcb98f86f149cf71d3707a1592072e7838f0811140c24238820dff2b82602a85";    
const PRIDE_LEVELS = [    
  { key: "P_A", level: "A=～99",    min: 1,     max: 99,    icon: "ef788ee816773c454495ebf83e5ac380" },    
  { key: "P_B", level: "B=100～",   min: 100,   max: 499,   icon: "3c8cc917bb7a97d46ba35c93d898491c" },    
  { key: "P_C", level: "C=500～",   min: 500,   max: 999,   icon: "ec8f805c9de95c65c858d2e1341f76ab" },    
  { key: "P_D", level: "D=1000～",  min: 1000,  max: 4999,  icon: "58446a29e6c496139963728eea887349" },    
  { key: "P_E", level: "E=5000～",  min: 5000, max: 9999,  icon: "5f88cb6a33355e7bc890d92576e36c94" },    
  { key: "P_F", level: "F=10000～", min: 10000, max: 49999, icon: "807b2b796691b862d667448a3918edd7" },    
  { key: "P_G", level: "G=50000～", min: 50000, max: Infinity, icon: "dfff542ae4eee8e95ea61a665dd8ce8e" }    
];    
/* ---------------------------------------------------------    
   [05] RANKS（全ランク定義）★ RANKS（RUBY★1〜8 + PRIDE A〜G）
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
   ★ 完全時系列保証
   ★ 逆順表示（新しいものが上）
   ★ progressLineを破壊しない設計
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
   [08-LOGCORE] 単一定義（重複削除済）
--------------------------------------------------------- */
let LOG_SEQ = 0;
const LOG_BUFFER = [];
const MAX_LOG_RENDER = 200;

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
/* ---------------------------------------------------------
   [08-2] getTodayYMDJa
--------------------------------------------------------- */
function getTodayYMDJa() {
  const now = new Date();
  const y = now.getFullYear();
  const m = ("0" + (now.getMonth() + 1)).slice(-2);
  const d = ("0" + now.getDate()).slice(-2);
  return `${y}/${m}/${d}`;
}

function compactYMD(ymd) {
  return String(ymd ?? "").replace(/\//g, "");
}
/* ---------------------------------------------------------
   [08-3] localStorage
--------------------------------------------------------- */
function readStoredArraySafe(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
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
  writeStoredArraySafe(key, arr.slice(0, limit));
}
/* ---------------------------------------------------------
   [08-4] viewerログ保存
--------------------------------------------------------- */
function saveViewerLogToStorage(payload) {
  pushStoredRecord(
    LOG_STORAGE_KEYS.viewerLogs,
    payload,
    LOG_STORAGE_LIMITS.viewerLogs
  );
}
/* ---------------------------------------------------------
   [08-5] appendLog（完全時系列保証）
--------------------------------------------------------- */
function appendLog(msg, type = "info") {
  const box = document.getElementById("logBox");
  const now = new Date();

  const record = {
    seq: ++LOG_SEQ,
    time: now.getTime(),
    label: getNowLabelJa(),
    type,
    message: String(msg ?? ""),

    currentView: State.currentView || "",
    generatedAt: State.generatedAt || "",
    latestRound: State.latestRound || "",
    latestUpdateAt: State.latestUpdateAt || ""
  };

  LOG_BUFFER.push(record);

  saveViewerLogToStorage({
    savedAt: record.label,
    type: record.type,
    message: record.message,
    currentView: record.currentView,
    generatedAt: record.generatedAt,
    latestRound: record.latestRound,
    latestUpdateAt: record.latestUpdateAt
  });

  renderLogs(box);
}

/* ---------------------------------------------------------
   [08-LOGRENDER] ログ描画（逆順＋progress保護）
--------------------------------------------------------- */
function renderLogs(box) {
  if (!box) return;

  // ★ progressLine退避
  let progress = null;
  if (window.progressLine && box.contains(progressLine)) {
    progress = progressLine;
    progress.remove();
  }

  // ★ 時系列ソート（新しい順）
  const sorted = [...LOG_BUFFER].sort((a, b) => {
    if (a.time !== b.time) return b.time - a.time;
    return b.seq - a.seq;
  });

  const slice = sorted.slice(0, MAX_LOG_RENDER);
  const frag = document.createDocumentFragment();

  for (const r of slice) {
    const line = document.createElement("div");
    line.textContent = `[${r.label}] ${r.message}`;
    line.dataset.type = r.type;

    if (r.type === "error") {
      line.style.color = "#ff5555";
    } else if (r.type === "warn") {
      line.style.color = "#ffeb3b";
    } else {
      line.style.color = "#00ff00";
    }

    frag.appendChild(line);
  }

  box.innerHTML = "";
  box.appendChild(frag);

  // ★ progressLineを最上部へ戻す
  if (progress) {
    box.prepend(progress);
  }
}

/* ---------------------------------------------------------
   [08-UTIL] ラッパー
--------------------------------------------------------- */
const log = msg => appendLog(msg, "info");
const logWarn = msg => appendLog(msg, "warn");
const logError = msg => appendLog(msg, "error");

/* ---------------------------------------------------------
   [08-A] copyログ
--------------------------------------------------------- */
function saveCopyEventToStorage(payload) {
  pushStoredRecord(
    LOG_STORAGE_KEYS.copyEvents,
    payload,
    LOG_STORAGE_LIMITS.copyEvents
  );
}

/* ---------------------------------------------------------
   [08-B] MATCHINGログ補助
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
   [08-DB] IndexedDB 保存
   ★ matching_open / copy イベントを自動保存
--------------------------------------------------------- */
const IDB_CONFIG = {
  dbName: "InitialDacViewerDB",
  dbVersion: 1,
  stores: {
    events: "events"
  }
};

let idbOpenPromise = null;

function openViewerIndexedDB() {
  if (idbOpenPromise) return idbOpenPromise;

  idbOpenPromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("indexedDB_not_supported"));
      return;
    }

    const req = indexedDB.open(IDB_CONFIG.dbName, IDB_CONFIG.dbVersion);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(IDB_CONFIG.stores.events)) {
        const store = db.createObjectStore(IDB_CONFIG.stores.events, {
          keyPath: "id",
          autoIncrement: true
        });

        store.createIndex("type", "type", { unique: false });
        store.createIndex("savedAt", "savedAt", { unique: false });
        store.createIndex("reason", "reason", { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("indexeddb_open_failed"));
  });

  return idbOpenPromise;
}

async function putViewerEventToIndexedDB(record) {
  try {
    const db = await openViewerIndexedDB();

    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_CONFIG.stores.events, "readwrite");
      const store = tx.objectStore(IDB_CONFIG.stores.events);

      store.add(record);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("indexeddb_tx_failed"));
      tx.onabort = () => reject(tx.error || new Error("indexeddb_tx_aborted"));
    });

  } catch (e) {
    console.warn("IndexedDB write failed:", e);

    // ★修正：appendLog系へ統一
    logWarn("IndexedDB保存失敗: " + (e.message || e));
  }
}

function buildMatchingOpenEventRecord() {
  const rankedTop20 = (State.matchingRankedAll || []).slice(0, 20).map((p, idx) => ({
    rank: idx + 1,
    name: p.name,
    updateDate: p.updateDate || "",
    area: p.area ?? "",
    shopname: p.shopname ?? "",
    rankKey: p.__rankKey ?? getPlayerRankKey(p),
    score: Number(p.__score ?? 0),
    rankWeight: Number(p.__detail?.rankWeight ?? 0),
    realtimeBoost: Number(p.__detail?.realtimeBoost ?? 1),
    baseScoreBeforeBoost: Number(p.__detail?.baseScoreBeforeBoost ?? 0),
    scoreAfterBoost: Number(p.__detail?.scoreAfterBoost ?? p.__score ?? 0)
  }));

  const displayTop10 = (State.matchingList || []).map((p, idx) => ({
    rank: idx + 1,
    name: p.name,
    updateDate: p.updateDate || "",
    area: p.area ?? "",
    shopname: p.shopname ?? "",
    rankKey: p.__rankKey ?? getPlayerRankKey(p),
    score: Number(p.__score ?? 0),
    rankWeight: Number(p.__detail?.rankWeight ?? 0),
    realtimeBoost: Number(p.__detail?.realtimeBoost ?? 1),
    baseScoreBeforeBoost: Number(p.__detail?.baseScoreBeforeBoost ?? 0),
    scoreAfterBoost: Number(p.__detail?.scoreAfterBoost ?? p.__score ?? 0)
  }));

  return {
    type: "matching_open",
    reason: "matching_button",
    savedAt: getNowLabelJa(),
    generatedAt: State.generatedAt || "",
    latestRound: State.latestRound || "",
    latestUpdateAt: State.latestUpdateAt || "",
    currentView: State.currentView || "",
    diagnostics: State.matchingDiagnostics || null,
    rankedTop20,
    displayTop10
  };
}

async function saveMatchingOpenToIndexedDB() {
  const record = buildMatchingOpenEventRecord();
  await putViewerEventToIndexedDB(record);
}
/* ---------------------------------------------------------
   [08-EXPORT] localStorage → 本日分JSON出力
   ★ IndexedDBは使用しない
   ★ viewerLogs / copyEvents をまとめてJSON保存
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

// ★修正：global化
window.progressLine = null;

function startProgress() {
  const box = document.getElementById("logBox");

  if (window.progressLine) window.progressLine.remove();

  progressPos = 0;

  window.progressLine = document.createElement("div");
  window.progressLine.style.color = "#ffeb3b";

  box.prepend(window.progressLine);

  updateProgressBar();

  progressTimer = setInterval(() => {
    progressPos = (progressPos + 1) % 20;
    updateProgressBar();
  }, 120);
}

function updateProgressBar() {
  if (!window.progressLine) return;

  const total = 20;
  const filled = "■".repeat(progressPos);
  const empty = "□".repeat(total - progressPos);

  window.progressLine.textContent = `進行中：${filled}${empty}`;
}

function stopProgress() {
  if (progressTimer) clearInterval(progressTimer);
  progressTimer = null;

  if (window.progressLine) {
    window.progressLine.remove();
    window.progressLine = null;
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
      [13] renderStars（星表示）★ RUBY星 → ★★★★★ 表示変換（4文字×2行）
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
    [16] loadLatestRound  latest_round.json 読み込み（ラウンド番号表示用）
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
   ★ 起動時にも latestUpdateAt を確実に反映
   ★ lastUpdated / latestUpdateAt の両対応
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
    timeEl.textContent = formatYMDHM(parseDateJST(State.generatedAt));
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
   「フィルタ後母集団のエリア分布」を自動計算して使う 分布計算関数
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

  // ★ calcMatchingScoreと統一
  return 1 + (areaWeight * 3.0);
} 
/* ---------------------------------------------------------
   [22] recordClickFromCopiedText
   ★ コピー履歴を「実マッチアンカー」として保存
   ★ areaName / updateDate / rankKey / copiedAt を追加
--------------------------------------------------------- */
function recordClickFromCopiedText(text) {
  if (!text) return;

  const player = findPlayerFromCopiedText(text);
  if (!player) return;

  const copiedAt = Date.now();
  const areaName = AreaList[String(player.area)] || player.areaName || "";
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
    time: copiedAt,       // 既存互換維持
    copiedAt: copiedAt    // 新基準
  });

  // 最大20件（現行維持）
  State.recentClicks = State.recentClicks.slice(0, 20);
}
/* ---------------------------------------------------------
   [22-A] findPlayerFromCopiedText
   ★ コピー文字列からプレイヤーを特定
   ★ 名前は完全一致（空白も含める）
--------------------------------------------------------- */
function findPlayerFromCopiedText(text) {
  if (!text) return null;

  let name = String(text);

  // タブ区切り（ランク＋名前コピー対応）
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
   ★ ブースト内訳取得関数と統一
--------------------------------------------------------- */
function getRealtimeBoost(player) {
  const detail = getRealtimeBoostDetail(player);
  return detail.total;
}
/* ---------------------------------------------------------
   [23-A] getRealtimeBoostDetail
   ★ ランク・エリア・店舗のブースト内訳を返す
   ★ コピー相手の属性（ランク＋エリア）への重みを強化
   ★ ブースト理由返却
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

    const decay = Math.exp(-dtMin / 8); // ★ 減衰強化
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

  const totalBoost = 1 + Math.min(2.5, rankScore + areaScore + shopScore);

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
   ★ copiedAt 基準の 5分±45秒 サイクル情報を返す
   ★ 初回だけ 5分45秒 まで完全除外
   ★ その後は 5分周期のピンク窓（±45秒）を判定
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

  const cycleSec = Number(cycleMin) * 60;   // 例: 5分 → 300秒
  const toleranceSec = 45;                  // ±45秒
  const initialCooldownSec = cycleSec + toleranceSec; // 345秒 = 5分45秒
  const rSec = diffSec % cycleSec;

  // ★ 初回だけ 5分45秒までは完全除外
  if (diffSec < initialCooldownSec) {
    return {
      diffMin: diffSec / 60,
      d: Infinity,
      rSec,
      inPinkWindow: false,
      isInitialCooldown: true,
      cooldownRemainingSec: Math.max(0, initialCooldownSec - diffSec)
    };
  }

  // ★ 2周目以降の通常ピンク判定
  const distToNearest = Math.min(rSec, cycleSec - rSec);
  const inPinkWindow = distToNearest <= toleranceSec;

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
   ★ ピンク判定（本人＋updateDate一致）
   ★ 名前は完全一致（空白も含める）
--------------------------------------------------------- */
function isMatchingCandidateByPhase(player) {
  if (!player) return false;

  const anchor = getLatestCopiedPlayer();
  if (!anchor) return false;

  const sameName =
    normalizePlayerName(player.name) === normalizePlayerName(anchor.name);

  const sameUpdateDate =
    String(player.updateDate ?? "") === String(anchor.updateDate ?? "");

  if (!sameName || !sameUpdateDate) return false;

  const phase = getPhaseDistanceMin(anchor.copiedAt || anchor.time, 5);
  return !!phase.inPinkWindow;
}
/* ---------------------------------------------------------
   [24-C] getLatestCopiedPlayer
   ★ 最新コピー履歴を返す
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
   [26] ランク関連ユーティリティ（最終版）
   ・実測分布モデル対応
   ・PRIDE分離
   ・PRIDE帯ランク別分布
--------------------------------------------------------- */
/* ---------------------------------------------------------
   [26-1-A] getPrideBandKey
   ★ pridePoint から P_A〜P_G を返す
--------------------------------------------------------- */
function getPrideBandKey(pridePoint) {
  const pt = Number(pridePoint ?? 0);
  if (pt <= 0) return null;

  const band = PRIDE_LEVELS.find(p => pt >= p.min && pt <= p.max);
  return band ? band.key : null;
}
/* ---------------------------------------------------------
   [26-1] getPlayerRankKey
   ★ PRIDE を P_A〜P_G 単位で返す
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
   ★ 自分ランク選択を R1〜R8 の実値で保持する
--------------------------------------------------------- */
function syncMyRankSelection(rankValue) {
  const selectedMyRank = rankValue || "R6";

  const num = Number(String(selectedMyRank).replace("R", ""));

  if (num >= 1 && num <= 8) {
    State.myStar = num;
  } else {
    State.myStar = 6; // fallback
  }

  return selectedMyRank;
}
/* ---------------------------------------------------------
   [26-3] getVirtualStar
   ★ PRIDEは "PRIDE" を返す
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
   ★ PRIDE帯をランク別distributionで評価
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
   [26-6] getTimeWeight（★変更なし）
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
   ★ 予測スコア設定（Phaseはピンクと一致・距離モデル廃止）
   ★ 確率調整は抽選処理（[29-B]）のみで行う
--------------------------------------------------------- */
const MATCHING_SCORE_CONFIG = {
  recencyTau: 12,    // ★ 時間減衰（分単位）

  weight: {
    strength: 0.40,   // ★ rank×timeベースの重み
    phase:    0.25,   // ★ ピンク一致時の寄与（0 or 1）
    recency:  0.25,
    activity: 0.10
  },

  threshold: 0.30,   // ★ 候補抽出閾値
  minCandidates: 10  // ★ 最低候補人数（現仕様維持）
};
/* ---------------------------------------------------------
   [28] getPhaseDistanceMin
   ★ copiedAt 基準 phase ラッパー
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

  const mean = top.length ? top.reduce((a,b)=>a+b,0)/top.length : 0;

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
   ★ scoreの内訳返却版
   ★ boost前後値返却
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
  // -------------------------
  // rankWeight（自ランク × 相手帯）
  // -------------------------
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
  // -------------------------
  // rankScore（rankWeightの変換後）
  // -------------------------
  let rankBase;
  if (cfg.rank?.mode === "sqrt") {
    rankBase = Math.sqrt(rankWeight);
  } else if (cfg.rank?.mode === "linear") {
    rankBase = rankWeight;
  } else {
    rankBase = rankWeight;
  }
  const rankScale = Number(cfg.rank?.scale ?? 1);
  const rankScore = rankBase * rankScale;
  // -------------------------
  // pride / area / time
  // -------------------------
  const prideWeight = Number(getPrideWeight(player) ?? 1);
  const areaFactor = Number(getAreaScore(player) ?? 1);
  const timeWeight = Number(getTimeWeight(player) ?? 0);
  // -------------------------
  // phase / recency
  // -------------------------
  const latestCopied = getLatestCopiedPlayer();
  const phaseInfo = latestCopied
    ? getPhaseDistanceMin(latestCopied.copiedAt || latestCopied.time, 5)
    : { diffMin: Infinity, inPinkWindow: false };
  const isPinkTarget = isMatchingCandidateByPhase(player);
  const phaseScore =
    (isPinkTarget && phaseInfo.inPinkWindow) ? 1 : 0;
  const recencyScore =
    (isPinkTarget && isFinite(phaseInfo.diffMin))
      ? Math.exp(-phaseInfo.diffMin / MATCHING_SCORE_CONFIG.recencyTau)
      : 0;
  // -------------------------
  // activity
  // -------------------------
  const star = Number(player.starCnt ?? 0);
  const pride = Number(player.pridePoint ?? 0);
  const activityScore =
    (star > 0)
      ? Math.min(1, star / 7)
      : (pride > 0 ? 0.7 : 0);
  // -------------------------
  // misc
  // -------------------------
  const miscPhase = Number(cfg.misc?.phase ?? 0);
  const miscRecency = Number(cfg.misc?.recency ?? 0);
  const miscActivity = Number(cfg.misc?.activity ?? 0);
  const miscRaw =
      phaseScore    * miscPhase
    + recencyScore  * miscRecency
    + activityScore * miscActivity;
  const miscFactor = 1 + (miscRaw / 50);
  // -------------------------
  // realtimeBoost
  // -------------------------
  let realtimeBoost = getRealtimeBoost(player);
  realtimeBoost = Math.min(realtimeBoost, 2.5);
  // -------------------------
  // final score
  // -------------------------
  const baseScoreBeforeBoost =
    rankScore
    * prideWeight
    * areaFactor
    * miscFactor
    * timeWeight;
  const scoreAfterBoost = baseScoreBeforeBoost * realtimeBoost;
  const score = Math.max(0.0001, scoreAfterBoost);
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
   calcMatchingScore = 呼び出しだけ
   calcMatchingScoreDetail = 本体
   ★ phase は copiedAt 基準の新判定
   ★ realtimeBoost は同ランク＋同エリア強化版を使用
   ★ pride_distribution を score に反映
--------------------------------------------------------- */
function calcMatchingScore(player) {
  return calcMatchingScoreDetail(player).score;
}
/* ---------------------------------------------------------
   [29-B] selectByWeight
   ★ 抽選優遇対象を「コピー本人の新ピンク対象」に変更
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
        const phase = getPhaseDistanceMin(anchor.copiedAt || anchor.time, 5);
        if (isFinite(phase.diffMin) && phase.diffMin >= 0) {
          const tau = 12;   // 分
          const decay = Math.exp(-phase.diffMin / tau);
          const maxBoost = 1.8;
          pinkBoost = 1 + (maxBoost - 1) * decay;
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
   - 基準時刻：json.latestUpdateAt
   - fallback：latestUpdateAtが無効な場合のみ現在時刻
   - スコア計算には使用しない（フィルタ専用）
---------------------------------------------------------*/
function applyFilters() {
  const minutes = Number(document.getElementById("rangeSelect").value);

  // ① フィルタ基準時刻の決定
  let baseDate = parseDateJST(State.latestUpdateAt);

  // fallback（latestUpdateAtが不正 or 未取得）
  if (!baseDate || isNaN(baseDate.getTime())) {
    baseDate = new Date();
    logWarn("latestUpdateAt未取得 → 現在時刻を使用");
  } else {
    log("フィルタ基準(JSON): " + formatYMDHM(baseDate));
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

  // ④ エリア分布再生成（既存維持）
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

  // ⑥ デバッグセッションへ反映
  if (State.debugSession) {
    State.debugSession.filter = {
      rangeMinutes: minutes,
      filterBase: formatYMDHM(baseDate),
      filterStart: startLabel,
      totalCount: State.all.length,
      filteredCount: State.filtered.length,
      validCount,
      invalidCount
    };
  }
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
   ★ buildRubyFilters / buildPrideFilters 共通HTML生成
   - 機能互換維持：
     - filter-row / filter-label / filter-items の構造を維持
     - checked / class / value / 表示順を維持
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
   ★ RUBYフィルタ生成（ラベル列＋内容列の2列レイアウト）
   ★ 共通化対応版（機能完全維持）
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
   ★ PRIDEフィルタ生成（ラベル列＋内容列の2列レイアウト）
   ★ 共通化対応版（機能完全維持）
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
   [34] buildSummary　サマリ統計計算
　★ サマリ生成（RUBY＋PRIDE フィルタ対応）    
--------------------------------------------------------- */    
function buildSummary() {    
  State.summary = [];    
  const selectedStars = [...document.querySelectorAll(".ruby-filter:checked")]    
    .map(x => Number(x.value));    
  const selectedPrides = [...document.querySelectorAll(".pride-filter:checked")]    
    .map(x => x.value);    
  const base = State.filtered;
  State.summary = RANKS    
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
   [35] filterSummaryBySearch   サマリ検索フィルタ    
--------------------------------------------------------- */    
function filterSummaryBySearch() {    
  const norm = normalize(State.searchText);    
  if (!norm) return State.summary;    
  const filtered = State.summary    
    .map(r => {    
      const filteredList = r.list.filter(p =>    
        (p.normalizedName || "").includes(norm)    
      );    
      return { ...r, list: filteredList };    
    })    
    .filter(r => r.list.length > 0);    
  return filtered;    
}    
/* ---------------------------------------------------------
    [36] renderSummary  サマリ表示
--------------------------------------------------------- */
function renderSummary() {
  const area = document.getElementById("summaryArea");
  const filteredSummary = filterSummaryBySearch();
  const total = filteredSummary.reduce((sum, r) => sum + r.list.length, 0);

  const rubyTotal = filteredSummary
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
          const { cnt, percent, avg, min, max } = calcStats(r.list, total);
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

  // ★ 状態クリア（現状維持）
  State.currentDetailKey = "";
  State.currentDetailLabel = "";
  State.currentDetailIcon = "";

  // ★ 現在ビュー設定＋表示切替
  setCurrentView(STATE.SUMMARY);
  switchDisplayView(STATE.SUMMARY);
}
/* ---------------------------------------------------------    
   [37] showSummaryUI   ★ showSummaryUI    
--------------------------------------------------------- */    
function showSummaryUI(push = true) {
  renderSummary();

  // renderSummary側でも実施されるが、現行挙動を崩さないため維持
  setCurrentView(STATE.SUMMARY);
  switchDisplayView(STATE.SUMMARY);

  if (push) {
    history.pushState({ page: STATE.SUMMARY }, '', '');
  }
}
/* ---------------------------------------------------------    
   [38] setupRankNavigation   ★ 前後ランク移動ボタン制御    
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
   [39] showDetail   詳細表示（前後ランク移動＋検索再実行対応）
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
   [40] renderDetailTable   詳細テーブル描画    
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
   ★ 詳細/マッチング共通：1行分HTML生成
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
   ★ ピンク着色対象を「コピーしたプレイヤー本人だけ」に変更
   ★ 判定基準は copiedAt 基準 5分±45秒
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
   ★ 共通：tbody描画
--------------------------------------------------------- */
function renderPlayerRowsToBody(tbodyId, list) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  const rows = list.map(p => buildPlayerRowHTML(p)).join("");
  tbody.innerHTML = rows;

  // ★ ハイライト処理
  highlightMatchingRows(tbody);
}

/* ---------------------------------------------------------
   [41] renderDetailRows   詳細行描画（軽量ラッパー化）
--------------------------------------------------------- */
function renderDetailRows(list, isRubyBand) {
  renderPlayerRowsToBody("detailTableBody", list);
}

/* ---------------------------------------------------------
   [50] renderMatchingRows   ★ マッチング候補行描画（軽量ラッパー化）
--------------------------------------------------------- */
function renderMatchingRows(list) {
  renderPlayerRowsToBody("matchingTableBody", list);
}
/* ---------------------------------------------------------
   [42] applyPlayerFilter   プレイヤー名フィルタ（サマリ横断）
--------------------------------------------------------- */
function applyPlayerFilter(keyword, keepOriginalOrder = false) {
  const normKey = normalize(keyword);
  let base = State.detailOriginal.slice();
  if (!keepOriginalOrder) {
    base = base.sort((a, b) => {
      return parseDateJST(b.updateDate) - parseDateJST(a.updateDate);
    });
  }
  if (!normKey) return base;
  return base.filter(p => (p.normalizedName || "").includes(normKey));
}  
/* ---------------------------------------------------------    
   [43] downloadCSV   CSV ダウンロード共通関数    
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
   [44] exportSummaryCSV   CSV 出力（サマリ）    
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
   [45] exportAllCSV   CSV 出力（全データ）★ areaName 列追加済み    
--------------------------------------------------------- */    
function exportAllCSV() {    
  // 表示上のヘッダ（列名）    
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
  // 実データ側で参照するフィールド名    
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
   ★ copy + matching完全解析対応版
--------------------------------------------------------- */
function copyToClipboard(text) {

  // ★ セッション開始
  State.debugSession = startDebugSession({
    type: "copy",
    rawText: String(text ?? "")
  });

  const afterCopySuccess = () => {

    // ★ ① 履歴更新（最優先）
    recordClickFromCopiedText(text);

    // ★ ② matching再計算（ここが重要）
    buildMatchingCandidates();

    // ★ ③ 結果保存
    const record = saveCopyEventUnified(text);

    // ★ 表示ログ
    log(
      "コピー: " + (record.name || "-")
      + " / CandidateRank:" + (record.candidateRank ?? "-")
      + " / DisplayRank:" + (record.displayRank ?? "-")
      + " / Score:" + (record.score ?? "-")
      + " / Miss:" + (record.missReason || "-")
    );

    // ★ セッション完了（完全データで）
    finalizeDebugSession(record.__debugSnapshot || {
      result: {
        name: record.name || "",
        candidateRank: record.candidateRank ?? null,
        displayRank: record.displayRank ?? null,
        score: record.score ?? null,
        missReason: record.missReason || ""
      }
    });
  };

  // ---- clipboard処理 ----
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
    .then(afterCopySuccess)
    .catch(() => {
      logError("コピーに失敗しました");

      finalizeDebugSession({
        result: {
          name: "",
          candidateRank: null,
          displayRank: null,
          score: null,
          missReason: "clipboard_failed"
        }
      });
    });
}
/* ---------------------------------------------------------
   [46-A] findCandidateInfoForLog（完全差し替え）
   ★ 欠落理由解析強化
   ★ boost前後順位・cooldown情報を返す
   ★ 既存返却項目は維持
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

  /* -------------------------------------------------------
     cooldown 判定（最新コピー相手本人 + 5分45秒以内）
  ------------------------------------------------------- */
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
   [46-DEBUG] ログ + マッチング完全解析デバッグモード
--------------------------------------------------------- */
let DEBUG_SESSION_ID = 0;

function startDebugSession(trigger) {
  return {
    id: ++DEBUG_SESSION_ID,
    startedAt: getNowLabelJa(),
    trigger: trigger || { type: "unknown" },
    filter: null,
    candidates: null,
    diagnostics: null,
    rankedTop: [],
    selectedTop: [],
    result: null,
    note: ""
  };
}

function cloneScoreDetailForDebug(detail) {
  if (!detail) return null;
  return {
    score: Number(detail.score ?? 0),
    rankWeight: Number(detail.rankWeight ?? 0),
    rankScore: Number(detail.rankScore ?? 0),
    prideWeight: Number(detail.prideWeight ?? 1),
    areaFactor: Number(detail.areaFactor ?? 1),
    timeWeight: Number(detail.timeWeight ?? 0),
    phaseScore: Number(detail.phaseScore ?? 0),
    recencyScore: Number(detail.recencyScore ?? 0),
    activityScore: Number(detail.activityScore ?? 0),
    miscRaw: Number(detail.miscRaw ?? 0),
    miscFactor: Number(detail.miscFactor ?? 1),
    realtimeBoost: Number(detail.realtimeBoost ?? 1),
    baseScoreBeforeBoost: Number(detail.baseScoreBeforeBoost ?? 0),
    scoreAfterBoost: Number(detail.scoreAfterBoost ?? 0)
  };
}

function buildDebugTopEntries(list, count = 10) {
  return (list || []).slice(0, count).map((p, idx) => ({
    rank: idx + 1,
    name: p.name || "",
    updateDate: p.updateDate || "",
    area: p.area ?? "",
    shopname: p.shopname ?? "",
    rankKey: p.__rankKey ?? getPlayerRankKey(p),
    score: Number(p.__score ?? 0),
    scoreDetail: cloneScoreDetailForDebug(p.__detail)
  }));
}

function saveMatchingDebugSnapshotToStorage(payload) {
  pushStoredRecord(
    LOG_STORAGE_KEYS.matchingSnapshots,
    payload,
    LOG_STORAGE_LIMITS.matchingSnapshots
  );
}

function emitDebugSessionLogs(session) {
  if (!session) return;

  log(`[DEBUG] Session#${session.id} trigger=${JSON.stringify(session.trigger)}`);
  if (session.filter) {
    log(`[DEBUG] filter=${JSON.stringify(session.filter)}`);
  }
  if (session.candidates) {
    log(`[DEBUG] candidates=${JSON.stringify(session.candidates)}`);
  }
  if (session.diagnostics) {
    log(`[DEBUG] diagnostics=${JSON.stringify(session.diagnostics)}`);
  }
  if (session.selectedTop && session.selectedTop.length) {
    log(
      `[DEBUG] selectedTop=${session.selectedTop
        .map(x => `${x.rank}:${x.name}(${Number(x.score ?? 0).toFixed(2)})`)
        .join(" / ")}`
    );
  }
  if (session.result) {
    log(`[DEBUG] result=${JSON.stringify(session.result)}`);
  }
}

function finalizeDebugSession(extra = {}) {
  if (!State.debugSession) return null;

  const session = State.debugSession;

  if (extra.filter) session.filter = extra.filter;
  if (extra.candidates) session.candidates = extra.candidates;
  if (extra.diagnostics) session.diagnostics = extra.diagnostics;
  if (extra.rankedTop) session.rankedTop = extra.rankedTop;
  if (extra.selectedTop) session.selectedTop = extra.selectedTop;
  if (extra.result) session.result = extra.result;
  if (extra.note) session.note = extra.note;

  const snapshot = {
    ...session,
    completedAt: getNowLabelJa()
  };

  State.debugHistory.unshift(snapshot);
  State.debugHistory = State.debugHistory.slice(0, 30);

  saveMatchingDebugSnapshotToStorage(snapshot);
  State.debugSession = null;

  emitDebugSessionLogs(snapshot);
  return snapshot;
}
/* ---------------------------------------------------------
   [47] buildMatchingCandidates（完全差し替え）
   ★ コピー後5分45秒除外＋除外理由記録
   ★ デバッグセッションへ候補母集団・TOP・診断を格納
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

  // ★ デバッグセッションへ解析結果を反映
  if (State.debugSession) {
    State.debugSession.candidates = {
      baseCount: base.length,
      uiPoolCount: filteredByUi.length,
      rankModelPoolCount: filteredByRankModel.length,
      cooldownExcludedCount,
      selectedCount: selected.length,
      noRankKeyCount: rankKeyMissing,
      rankModelZeroCount: rankModelExcluded,
      analysisFallback: filteredByRankModel.length > 0 ? "NO" : "YES"
    };

    State.debugSession.diagnostics = diag ? {
      gap12: Number(diag.gap12 ?? 0),
      gap15: Number(diag.gap15 ?? 0),
      top5Mean: Number(diag.top5Mean ?? 0),
      top1Ratio: Number(diag.top1Ratio ?? 0),
      totalRanked: Number(diag.totalRanked ?? 0),
      cluster: isCluster ? "YES" : "NO"
    } : null;

    State.debugSession.rankedTop = buildDebugTopEntries(rankedAll, 10);
    State.debugSession.selectedTop = buildDebugTopEntries(selected, 10);
  }
}
/* ---------------------------------------------------------    
   [48] renderMatchingHeader   ★ マッチング候補ヘッダ表示    
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
  const parts = RANKS    
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
   [49] renderMatchingTable   ★ マッチング候補テーブル    
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
   [51] applyMatchingFilter   ★ マッチング候補検索フィルタ    
--------------------------------------------------------- */    
function applyMatchingFilter(keyword) {    
  const base = State.matchingList || [];    
  const normKey = normalize(keyword);    
  const list = normKey    
    ? base.filter(p => (p.normalizedName || "").includes(normKey))    
    : base;    
  const countEl = document.getElementById("matchingCount");    
  if (countEl) countEl.textContent = fmt(list.length);    
  renderMatchingRows(list);    
}    
/* ---------------------------------------------------------
   [52] showMatchingCandidates
   ★ マッチング候補画面表示
   ★ デバッグセッション対応
--------------------------------------------------------- */
function showMatchingCandidates(push = true) {
  const createdForOpen = !State.debugSession;

  // ★ マッチング画面を単独で開いた場合も解析セッション化
  if (createdForOpen) {
    State.debugSession = startDebugSession({
      type: "matching_open"
    });
  }

  buildMatchingCandidates();
  renderMatchingHeader();
  renderMatchingTable();

  setCurrentView(STATE.MATCHING);
  switchDisplayView(STATE.MATCHING);

  if (push) {
    history.pushState({ page: STATE.MATCHING }, '', '');
  }

  // ★ matching_open 単独操作はここで完了
  if (createdForOpen) {
    finalizeDebugSession({
      result: {
        name: "",
        candidateRank: null,
        displayRank: null,
        score: null,
        missReason: "matching_open_only"
      },
      note: "matching画面表示のみ"
    });
  }
}
/* ---------------------------------------------------------    
   [53] backToSummaryFromMatching   ★ マッチング候補 → サマリに戻る    
--------------------------------------------------------- */    
function backToSummaryFromMatching() {    
  State.currentView = "summary";    
  renderSummary();    
}    
/* ---------------------------------------------------------    
   [54] clearSearch   検索クリア関数    
--------------------------------------------------------- */    
function clearSearch() {    
  const input = document.getElementById('searchInput');    
  if (input) input.value = '';    
  State.searchText = '';    
}    
/* ---------------------------------------------------------
   [55] init   初期化（Promise.all化・既存関数温存型）
--------------------------------------------------------- */
async function init() {
  log("Viewer 初期化中");
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

    // ★ 適用順序だけ維持
    applyAreaListJson(areaJson);
    applyLatestRoundJson(latestRoundJson);
    applyLatestUpdateJson(latestUpdateJson);
    applyRankModelJson(rankModelJson);
    applyScoringConfigJson(scoringConfigJson);
    applyRoundDataJson(roundDataJson, { resetReloadButton: true });

  } catch (e) {
    logError("初期化並列取得に失敗：" + e.message);
    logWarn("逐次ロードへフォールバックします");

    // ★ フォールバック：既存逐次処理 + latest_update追加
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
  stopProgress();
  log("Viewer 初期化完了");
  startUpdateWatch();
}
/* ---------------------------------------------------------
 * [56] DOMContentLoaded
 * 初期イベント設定
 * 
 * ■役割
 * ・HTMLで定義されたUI要素の取得
 * ・各ボタンイベントの登録
 * ・検索イベントの登録
 * ・画面遷移処理の初期化
 * ・アプリ初期化（init 呼び出し）
 * 
 * ■変更点（今回）
 * ・JSON出力ボタンは exportTodayLogsAsJSON が定義されている場合のみ有効化
 * ・未定義関数参照で起動全体が止まらないよう保護
 * ・button生成処理は行わず、UIは index.html 側管理を維持
 * 
 * ■注意
 * ・DOM構造（id）は index.html と完全一致必須
 * ・ボタン未存在時も安全に動作するよう if ガードあり
 * --------------------------------------------------------- */
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
   [57] popstate（戻る制御   戻るボタン処理      
--------------------------------------------------------- */
window.addEventListener('popstate', (e) => {
  const state = e.state || { page: STATE.SUMMARY };

  // ✅ DETAILへ戻る
  if (state.page === STATE.DETAIL) {
    const key = state.key || State.currentDetailKey;

    // keyがない場合は安全にサマリ
    if (!key) {
      clearSearch();
      const input = document.getElementById("searchInput");
      if (input) input.value = "";
      showSummaryUI(false);
      return;
    }

    // 検索クリア（現行仕様維持）
    if (State.searchText) {
      clearSearch();
      const input = document.getElementById("searchInput");
      if (input) input.value = "";
    }

    // ★重要：pushしない
    showDetail(key, false);
    return;
  }

  // ✅ MATCHINGへ戻る
  if (state.page === STATE.MATCHING) {
    if (State.searchText) {
      clearSearch();
      const input = document.getElementById("searchInput");
      if (input) input.value = "";
    }

    // ★重要：pushしない
    showMatchingCandidates(false);
    return;
  }

  // ✅ SUMMARY（デフォルト）
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
/* ---------------------------------------------------------
   [59] saveCopyEventUnified
   ★ copyログ完全保存（localStorage版）
   ★ IndexedDBは使用しない
   ★ デバッグセッション連携対応
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

    // ★ ランキング系
    candidateRank: candidateInfo.candidateRank ?? null,
    displayRank: candidateInfo.displayRank ?? null,
    baseRank: candidateInfo.baseRank ?? null,

    // ★ スコア
    score: candidateInfo.score ?? null,

    // ★ 欠落理由
    missReason: (candidateInfo.missReasons || []).join("|"),

    // ★ cooldown補助
    cooldownExcluded: !!candidateInfo.cooldownExcluded,
    cooldownRemainingSec: candidateInfo.cooldownRemainingSec ?? null
  };

  //-----------------------------------------------------
  // localStorage 保存（既存機能維持）
  //-----------------------------------------------------
  saveCopyEventToStorage(record);

  //-----------------------------------------------------
  // ★ デバッグセッション用情報（メモリのみ）
  //-----------------------------------------------------
  record.__debugSnapshot = {
    result: {
      name: record.name || "",
      candidateRank: record.candidateRank ?? null,
      displayRank: record.displayRank ?? null,
      baseRank: record.baseRank ?? null,
      score: record.score ?? null,
      missReason: record.missReason || "",
      cooldownExcluded: record.cooldownExcluded,
      cooldownRemainingSec: record.cooldownRemainingSec ?? null
    },
    note: player
      ? "copy player resolved"
      : "copy player not resolved"
  };

  if (player) {
    record.__debugSnapshot.result.player = {
      name: player.name || "",
      updateDate: player.updateDate || "",
      area: player.area ?? "",
      shopname: player.shopname ?? "",
      rankKey: getPlayerRankKey(player)
    };
  }

  if (candidateInfo) {
    record.__debugSnapshot.result.candidateInfo = {
      candidateRank: candidateInfo.candidateRank ?? null,
      displayRank: candidateInfo.displayRank ?? null,
      baseRank: candidateInfo.baseRank ?? null,
      boostedRank: candidateInfo.boostedRank ?? null,

      score: candidateInfo.score ?? null,
      baseScoreBeforeBoost: candidateInfo.baseScoreBeforeBoost ?? null,
      scoreAfterBoost: candidateInfo.scoreAfterBoost ?? null,

      rankWeight: candidateInfo.rankWeight ?? 0,

      cooldownExcluded: !!candidateInfo.cooldownExcluded,
      cooldownRemainingSec: candidateInfo.cooldownRemainingSec ?? null,

      missReasons: candidateInfo.missReasons || [],

      // ★ detailまるごと保持
      scoreDetail: cloneScoreDetailForDebug(candidateInfo.scoreDetail)
    };
  }

  return record;
}
