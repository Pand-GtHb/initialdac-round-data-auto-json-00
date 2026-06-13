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
  prefetchInFlight: null
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
   [08] ログ（appendLog / log / logWarn / logError）
--------------------------------------------------------- */    
const MAX_LOG_LINES = 200;    
function appendLog(msg, type = "info") {    
  const box = document.getElementById("logBox");    
  const now = new Date();    
  const t = now.toLocaleString("ja-JP", {    
    hour12: false,    
    year: "numeric", month: "2-digit", day: "2-digit",    
    hour: "2-digit", minute: "2-digit", second: "2-digit"    
  });    
  const line = document.createElement("div");    
  line.textContent = `[${t}] ${msg}`;    
  line.dataset.type = type;    
  if (type === "error") line.style.color = "#ff5555";    
  else if (type === "warn") line.style.color = "#ffeb3b";    
  else line.style.color = "#00ff00";    
  box.prepend(line);    
  while (box.children.length > MAX_LOG_LINES) {    
    box.removeChild(box.lastChild);    
  }    
}    
const log = msg => appendLog(msg, "info");    
const logWarn = msg => appendLog(msg, "warn");    
const logError = msg => appendLog(msg, "error");    
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
   [19-B] checkUpdate（更新監視） latest_update.json 監視（更新検知＋先読み）
--------------------------------------------------------- */
async function checkUpdate() {
  try {
    const json = await fetchJSON("latest_update.json");
    const latest = json.lastUpdated || "";
    if (!latest) return;

    const changed = State.latestUpdateAt && State.latestUpdateAt !== latest;

    if (changed) {
      const btn = document.getElementById("reloadBtn");
      if (btn) {
        btn.classList.add("update-alert");
        btn.style.cssText = "background:#ff4081;color:#fff;font-weight:bold;";
      }
      logWarn("新しいデータが公開されています。");

      // ★追加：更新版本体を先読み
      prefetchLatestRoundData(latest);
    }

    State.latestUpdateAt = latest;
  } catch (e) {
    logError("latest_update.json の取得に失敗：" + e.message);
  }
}

/* ---------------------------------------------------------    
   [20] buildAreaDistribution（分布計算）「フィルタ後母集団のエリア分布」を自動計算して使う 分布計算関数
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
   優先度：
   1) 同ランク＋同エリア
   2) 同ランクのみ
   3) 同エリアのみ
   4) 同店舗のみ
--------------------------------------------------------- */
function getRealtimeBoostDetail(player) {
  if (!State.recentClicks.length || !player) {
    return { rank: 0, area: 0, shop: 0, total: 1 };
  }

  let rankScore = 0;
  let areaScore = 0;
  let shopScore = 0;

  const playerRankKey = getPlayerRankKey(player);

  for (const r of State.recentClicks) {
    const anchorTime = Number(r.copiedAt || r.time || 0);
    if (!anchorTime) continue;

    const dtMin = (Date.now() - anchorTime) / 60000;
    if (!isFinite(dtMin) || dtMin < 0) continue;

    const decay = Math.exp(-dtMin / 10);

    const sameRank =
      !!playerRankKey &&
      !!r.rankKey &&
      String(playerRankKey) === String(r.rankKey);

    const sameArea =
      String(player.area ?? "") === String(r.area ?? "");

    const sameShop =
      String(player.shopname ?? "") === String(r.shopname ?? "");

    if (sameRank && sameArea) {
      rankScore += decay * 0.8;
      areaScore += decay * 0.4;
    } else if (sameRank) {
      rankScore += decay * 0.6;
    } else if (sameArea) {
      areaScore += decay * 0.5;
    } else if (sameShop) {
      shopScore += decay * 0.3;
    }
  }

  const totalBoost = 1 + Math.min(1.8, rankScore + areaScore + shopScore);

  return {
    rank: rankScore,
    area: areaScore,
    shop: shopScore,
    total: totalBoost
  };
}
/* ---------------------------------------------------------
   [24-A] getRoundedDiffMinAndPhaseDistance
   ★ 旧 3分30秒〜4分30秒 / updateDate 基準を廃止
   ★ copiedAt 基準の 5分±45秒 サイクル情報を返す
   ★ 最初の対象窓は 4分15秒〜5分45秒、その後5分周期で繰り返し
   ★ 5分±45秒 + 初回サイクル除外
--------------------------------------------------------- */
function getRoundedDiffMinAndPhaseDistance(copiedAtMs, cycleMin = 5) {
  if (!copiedAtMs || !isFinite(Number(copiedAtMs))) {
    return {
      diffMin: Infinity,
      d: Infinity,
      rSec: Infinity,
      inPinkWindow: false
    };
  }

  const now = Date.now();
  const anchor = Number(copiedAtMs);
  const diffSec = (now - anchor) / 1000;

  if (!isFinite(diffSec) || diffSec < 0) {
    return {
      diffMin: Infinity,
      d: Infinity,
      rSec: Infinity,
      inPinkWindow: false
    };
  }

  const cycleSec = cycleMin * 60;   // 300秒
  const toleranceSec = 45;

  const rSec = diffSec % cycleSec;

  // ★ここが追加（最重要）
  // 1周期目を完全除外
  if (diffSec < cycleSec) {
    return {
      diffMin: diffSec / 60,
      d: Infinity,
      rSec: rSec,
      inPinkWindow: false
    };
  }

  // ★通常ピンク判定
  let inPinkWindow = false;

  const distToNearest = Math.min(rSec, cycleSec - rSec);

  if (distToNearest <= toleranceSec) {
    inPinkWindow = true;
  }

  return {
    diffMin: diffSec / 60,
    d: distToNearest / 60,
    rSec: rSec,
    inPinkWindow: inPinkWindow
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
--------------------------------------------------------- */
function calcMatchingScoreDetail(player) {
  if (!player || !player.updateDate) return { score:0 };

  const cfg = State.scoringConfig || {};

  const rankWeight = getRankWeight(player);
  if (rankWeight <= 0) return { score:0 };

  const rankScore = rankWeight;
  const prideWeight = getPrideWeight(player);
  const areaFactor = getAreaScore(player);
  const timeWeight = getTimeWeight(player);

  let realtimeBoost = getRealtimeBoost(player);
  realtimeBoost = Math.min(realtimeBoost, 2.5);

  const score =
    rankScore *
    prideWeight *
    areaFactor *
    timeWeight *
    realtimeBoost;

  return {
    score: Math.max(0.0001, score),
    rankScore,
    prideWeight,
    areaFactor,
    timeWeight,
    realtimeBoost
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
/* ---------------------------------------------------------
   [30] applyFilters（★現在時刻基準＋完全安全版）
--------------------------------------------------------- */
function applyFilters() {

  const minutes = Number(document.getElementById("rangeSelect").value);

  // ★ 基準時刻：現在時刻に統一
  const baseMs = Date.now();
  const filterStartMs = baseMs - minutes * 60 * 1000;

  const startDate = new Date(filterStartMs);
  const startLabel = formatYMDHM(startDate);

  const el = document.getElementById("filterStartTime");
  if (el) el.textContent = startLabel;

  let validCount = 0;
  let invalidCount = 0;

  State.filtered = State.all.filter(p => {

    if (!p.updateDate) {
      invalidCount++;
      return false;
    }

    const date = parseDateJST(p.updateDate);

    // ★ 日付異常ガード（最重要）
    if (!date || isNaN(date.getTime())) {
      invalidCount++;
      return false;
    }

    validCount++;

    return date.getTime() >= filterStartMs;
  });

  // ★ エリアモデル再生成
  State.areaModel = buildAreaDistribution(State.filtered);

  // ★ デバッグログ（原因把握用）
  log(`フィルタ結果: ${State.filtered.length}件 / 有効:${validCount}件 / 無効:${invalidCount}件`);

  log("areaModel top5=" + JSON.stringify(
    Object.entries(State.areaModel)
      .sort((a,b)=>b[1]-a[1])
      .slice(0,5)
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
   ★ コピー内容は変更しない
   ★ ログに「エリア名 / Update時刻 / Boost / CandidateRank / Score / rankWeight」を追加
--------------------------------------------------------- */
function copyToClipboard(text) {

  const buildCopyLogMessage = (rawText) => {
    const player = findPlayerFromCopiedText(rawText);

    if (!player) {
      return `コピー：${rawText}`;
    }

    const areaName = AreaList[String(player.area)] || player.areaName || "";
    const updateLabel = player.updateDate
      ? formatYMDHM(parseDateJST(player.updateDate))
      : "--/-- --:--";

    const boost = getRealtimeBoostDetail(player);
    const candidateInfo = findCandidateInfoForLog(player);

    const rankLabel =
      candidateInfo.candidateRank != null
        ? candidateInfo.candidateRank
        : "-";

    const scoreLabel =
      candidateInfo.score != null
        ? candidateInfo.score.toFixed(2)
        : "-";

    const rankWeightLabel =
      candidateInfo.rankWeight != null
        ? Number(candidateInfo.rankWeight).toFixed(3)
        : "-";

    return `コピー：${rawText} / ${areaName} / Update:${updateLabel}`
      + ` / Boost[rank=${boost.rank.toFixed(2)}`
      + ` area=${boost.area.toFixed(2)}`
      + ` shop=${boost.shop.toFixed(2)}`
      + ` total=${boost.total.toFixed(2)}]`
      + ` / CandidateRank:${rankLabel}`
      + ` / Score:${scoreLabel}`
      + ` / rankWeight:${rankWeightLabel}`;
  };

  if (!navigator.clipboard) {
    // 古いブラウザ用（同期コピー）
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);

    log(buildCopyLogMessage(text));
    recordClickFromCopiedText(text);
    return;
  }

  // 新しいブラウザ用（非同期コピー）
  navigator.clipboard.writeText(text)
    .then(() => {
      log(buildCopyLogMessage(text));
      recordClickFromCopiedText(text);
    })
    .catch(() => {
      logError("コピーに失敗しました");
    });
}
/* ---------------------------------------------------------
   [46-A] findCandidateInfoForLog
   ★ CandidateRank / Score / rankWeight取得
   ★ 名前完全一致（空白含む）
--------------------------------------------------------- */
function findCandidateInfoForLog(player) {
  if (!player) return {};

  // ★全件順位優先
  const list = State.matchingRankedAll?.length
    ? State.matchingRankedAll
    : State.matchingList;

  const source = State.matchingRankedAll?.length
    ? "all"
    : "display";

  if (!list?.length) return {};

  const idx = list.findIndex(p =>
    normalizePlayerName(p.name) === normalizePlayerName(player.name) &&
    String(p.updateDate) === String(player.updateDate)
  );

  return {
    candidateRank: idx >= 0 ? idx + 1 : null,
    score: idx >= 0 ? list[idx].__score : null,
    rankingSource: source,
    diagnostics: State.matchingDiagnostics,
    scoreDetail: calcMatchingScoreDetail(player)
  };
}
/* ---------------------------------------------------------
   [47] buildMatchingCandidates
   ★ マッチング候補一覧生成
   ★ 最終表示を「スコア降順」に変更
--------------------------------------------------------- */
function buildMatchingCandidates() {

  const base = State.filtered;

  // ★スコア計算
  const scored = base.map(p=>{
    const d = calcMatchingScoreDetail(p);
    return {
      ...p,
      __score: d.score,
      __detail: d
    };
  });

  // ★全件順位（決定論）
  const rankedAll = [...scored].sort((a,b)=>b.__score-a.__score);

  State.matchingRankedAll = rankedAll;
  State.matchingDiagnostics = calcMatchingDiagnostics(rankedAll);

  // ★従来の抽選ロジック維持
  const selected = selectByWeight(scored, 10);

  selected.sort((a,b)=>b.__score-a.__score);

  State.matchingList = selected;

  // ★ログ
  log("分析TOP: " +
    rankedAll.slice(0,5).map(p=>`${p.name}(${p.__score.toFixed(2)})`).join(" / ")
  );

  log("表示TOP: " +
    selected.slice(0,5).map(p=>`${p.name}(${p.__score.toFixed(2)})`).join(" / ")
  );

  log(`診断: Gap12=${State.matchingDiagnostics.gap12.toFixed(2)}`
    + ` / Ratio=${State.matchingDiagnostics.top1Ratio.toFixed(2)}`
  );
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
   [52] showMatchingCandidates   ★ マッチング候補画面表示
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
      rankModelJson,
      scoringConfigJson,
      roundDataJson
    ] = await Promise.all([
      fetchAreaListJson(),
      fetchLatestRoundJson(),
      fetchRankModelJson(),
      fetchScoringConfigJson(),
      fetchRoundDataJson()
    ]);

    // ★ 適用順序だけ維持
    applyAreaListJson(areaJson);
    applyLatestRoundJson(latestRoundJson);
    applyRankModelJson(rankModelJson);
    applyScoringConfigJson(scoringConfigJson);
    applyRoundDataJson(roundDataJson, { resetReloadButton: true });

  } catch (e) {
    logError("初期化並列取得に失敗：" + e.message);
    logWarn("逐次ロードへフォールバックします");

    // ★ フォールバック：既存逐次処理
    await loadAreaList();
    await loadLatestRound();
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
   [56] DOMContentLoaded   DOMContentLoaded    
--------------------------------------------------------- */    
document.addEventListener("DOMContentLoaded", () => {    
  // ✅ 最優先で履歴を仕込む（初回戻るで閉じる対策）    
  history.replaceState({ page: STATE.SUMMARY }, '', '');    
  history.pushState({ page: STATE.SUMMARY }, '', '');    
  // ★ ボタン群を1行に揃えて生成    
  const btnArea = document.getElementById("buttonArea");    
  if (btnArea) {    
    btnArea.innerHTML = `    
      <div class="button-row">    
        <button id="reloadBtn">最新データ取得</button>    
        <button id="filterBtn">フィルタ適用</button>    
        <button id="summaryCsvBtn">サマリCSV出力</button>    
        <button id="allCsvBtn">全データCSV出力</button>    
      </div>    
    `;    
  }    
  // ✅ 安全に要素取得（null防止）    
  const reloadBtn = document.getElementById("reloadBtn");    
  const filterBtn = document.getElementById("filterBtn");    
  const summaryCsvBtn = document.getElementById("summaryCsvBtn");    
  const allCsvBtn = document.getElementById("allCsvBtn");    
  const backBtn = document.getElementById("backBtn");    
  const matchingBtn = document.getElementById("matchingBtn");    
  const matchingBackBtn = document.getElementById("matchingBackBtn");    
  const searchInput = document.getElementById("searchInput");    
  // ✅ reload
  if (reloadBtn) {
    reloadBtn.classList.remove("update-alert");
    reloadBtn.style.cssText = "";
    reloadBtn.onclick = async () => {
      await reloadLatestDataPreferPrefetch();
    };
  }
  // ✅ filter    
  if (filterBtn) {    
    filterBtn.onclick = () => {    
      startProgress();    
      applyFilters();    
      buildSummary();    
      renderSummary();    
      stopProgress();    
    };    
  }    
  // ✅ CSV    
  if (summaryCsvBtn) summaryCsvBtn.onclick = exportSummaryCSV;    
  if (allCsvBtn) allCsvBtn.onclick = exportAllCSV;    
  // ✅ 検索    
  if (searchInput) {
  searchInput.addEventListener("input", (e) => {  
    State.searchText = e.target.value;  

    if (isCurrentView(STATE.SUMMARY)) {  
      renderSummary();  

    } else if (isCurrentView(STATE.DETAIL)) {  
      applyPlayerFilter(State.searchText, State.currentIsRubyBand);  

      // ★修正（見出し保持）
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
// ✅ サマリ戻る（UIボタン）
if (backBtn && searchInput) {
  backBtn.onclick = () => {

    State.searchText = "";
    searchInput.value = "";

    showSummaryUI(true);
  };
}

// ✅ matching表示
if (matchingBtn && searchInput) {
  matchingBtn.onclick = () => {

    State.searchText = "";
    searchInput.value = "";

    showMatchingCandidates(true);
  };
}

// ✅ matching戻る
if (matchingBackBtn && searchInput) {
  matchingBackBtn.onclick = () => {

    State.searchText = "";
    searchInput.value = "";

    backToSummaryFromMatching(true);
  };
} 
// ✅ ランク選択
const myRankSelect = document.getElementById("myRankSelect");
if (myRankSelect) {
  syncMyRankSelection(myRankSelect.value);
  myRankSelect.addEventListener("change", (e) => {
    const selectedMyRank = syncMyRankSelection(e.target.value);
    log(`自分ランク変更：${selectedMyRank}`);
  });
} 
// ✅ 初期化（DOM後）
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
