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
  DETAIL: 'detail'    
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
  currentView: "summary",    
  currentIsRubyBand: true,    
  matchingList: [],    
  seasonModel: null,    
  myStar: 6,       
  selectedMyRank: "R6",   // ★ UI選択（デフォルトR6）    
  recentClicks: [],       // ★ クリック履歴（リアルタイムBoost）    
  areaModel: {}           // ★ フィルタ後母集団のエリア分布    
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
   [05] RANKS（全ランク定義）★ RANKS（RUBY☆1〜8 + PRIDE A〜G）
--------------------------------------------------------- */    
const RANKS = [    
  ...Array.from({ length: 8 }, (_, i) => ({    
    key: `R${i + 1}`,    
    type: "ruby",    
    star: i + 1,    
    label: `☆${i + 1}`,    
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
const parseDateJST = str => new Date(str.replace(/-/g, "/"));    
function formatYMDHM(date) {    
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
   [17] loadSeasonModel★ シーズン 学習モデル（season_model.json）読み込み    
--------------------------------------------------------- */    
async function loadSeasonModel() {    
  log("season_model.json 取得準備中");    
  try {    
    const json = await fetchJSON("season_model.json");    
    State.seasonModel = json;    
    log("season_model.json 読み込み完了");    
  } catch (e) {    
    // 学習モデルがなくてもViewerが落ちないようにする    
    State.seasonModel = null;    
    logWarn("season_model.json 未取得：学習無しモードで動作します（" + e.message + "）");    
  }    
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
   [19] checkUpdate（更新監視） latest_update.json 監視（更新検知）
--------------------------------------------------------- */
async function checkUpdate() {
  try {
    const json = await fetchJSON("latest_update.json");

    const latest = json.lastUpdated || "";
    if (!latest) return;

    if (State.latestUpdateAt && State.latestUpdateAt !== latest) {
      const btn = document.getElementById("reloadBtn");
      if (btn) {
        btn.classList.add("update-alert");
        btn.style.cssText = "background:#ff4081;color:#fff;font-weight:bold;";
      }
      logWarn("新しいデータが公開されています。");
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
  const k = String(player.area ?? "");    
  const p = State.areaModel[k] ?? 0.01;    
  const areaCount = Object.keys(State.areaModel).length || 1;    
  // 平均分布    
  const avgP = 1 / areaCount;    
  // 正規化    
  const normalized = p / avgP;    
  // 強調    
  const areaScore = Math.pow(normalized, 0.7);    
  return areaScore;    
}    
/* ---------------------------------------------------------    
   [22] recordClickFromCopiedText クリックコピーを「擬似マッチログ」としてBoostに使う    
--------------------------------------------------------- */    
function recordClickFromCopiedText(text) {    
  if (!text) return;    
  // 形式例： "★★...\tNAME" や "123\tNAME" を想定    
  let name = text;    
  if (String(text).includes("\t")) {    
    const parts = String(text).split("\t");    
    name = parts[parts.length - 1];    
  }    
  const player = State.all.find(p => p.name === name);    
  if (!player) return;    
  State.recentClicks.unshift({    
    name: player.name,    
    area: player.area,    
    shopname: player.shopname,    
    time: Date.now()    
  });    
  // 最大20件    
  State.recentClicks = State.recentClicks.slice(0, 20);    
}    
/* ---------------------------------------------------------    
   [23] getRealtimeBoost　Boost関数
--------------------------------------------------------- */    
function getRealtimeBoost(player) {    
  if (!State.recentClicks.length) return 1;    
  let areaScore = 0;    
  let shopScore = 0;    
  for (const r of State.recentClicks) {    
    const dtMin = (Date.now() - r.time) / 60000;    
    const decay = Math.exp(-dtMin / 10); // 10分で減衰    
    if (player.area === r.area) areaScore += decay;    
    if ((player.shopname || "") === (r.shopname || "")) shopScore += decay;    
  }    
  const areaBoost = 1 + Math.min(0.5, areaScore * 0.2);    
  const shopBoost = 1 + Math.min(0.8, shopScore * 0.3);    
  return areaBoost * shopBoost;    
}    
/* ---------------------------------------------------------    
    [24] isMatchingCandidateByPhase
 　 ★ 新ロジック：現在時刻ベースのフェーズモデル（A案）    
   （指定周期の境目 ±w 分にいるプレイヤーを候補とする）    
--------------------------------------------------------- */    
function isMatchingCandidateByPhase(updateDateStr) {    
  if (!updateDateStr) return false;    
  const now = new Date();    
  const last = new Date(updateDateStr.replace(/-/g, "/"));    
  // ★ 秒を30秒単位に丸める（自然な丸め）    
  const sec = last.getSeconds();    
  const rounded = sec < 30 ? 0 : 30;    
  last.setSeconds(rounded, 0);    
  const diffMin = (now - last) / 60000;    
  // サイクル設定    
  const cycle = 4; // 4分00秒    
  if (diffMin < cycle) return false;    
  // 周期の位相（フェーズ）    
  const r = diffMin % cycle;    
  const d = Math.min(r, cycle - r); // 境目からの距離    
  // ★ 許容幅 w（±0.25分＝15秒）    
  const w = 0.25;    
  return d <= w;    
}    
/* ---------------------------------------------------------    
   [25] getSeasonStrengthScore
   ★ シーズン学習：相手ランク分布から strengthScore を返す    
   - 学習モデルがない場合は中立(0.5)    
   - 0確率を避けるため最低値を付与（スムージング）    
--------------------------------------------------------- */    
function getSeasonStrengthScore(player) {    
  const model = State.seasonModel;    
  if (!model || !model.strength) return 0.5;    
  const rankKey = getPlayerRankKey(player);    
  if (!rankKey) return 0.0;    
  const myKey = (State.myStar === 7) ? "myStar7" : "myStar6";    
  const dist = model.strength[myKey] || {};    
  const p = Number(dist[rankKey] ?? 0);    
  // ★ 最低値でゼロ回避（学習分布にない帯も候補に残す）    
  const base = Math.max(0.01, Math.min(1, p));    
  // ★ 強調：ピークを持ち上げる（0.65くらいが扱いやすい）    
  return Math.pow(base, 0.65);    
}    
/* ---------------------------------------------------------    
   [26] getPlayerRankKey   ★ プレイヤーのランクキー取得（R1〜R8 / P_A〜P_G）    
--------------------------------------------------------- */    
function getPlayerRankKey(player) {    
  if (player.onlineBattleRankId === RUBY_ID && player.starCnt >= 1 && player.starCnt <= 8) {    
    return `R${player.starCnt}`;    
  }    
  const pt = Number(player.pridePoint ?? 0);    
  const pride = PRIDE_LEVELS.find(p => pt >= p.min && pt <= p.max);    
  return pride ? pride.key : null;    
}    
/* ---------------------------------------------------------    
   [27] MATCHING_SCORE_CONFIG　★ 予測スコア（Season学習 + Phase + Recency + Activity）    
--------------------------------------------------------- */    
const MATCHING_SCORE_CONFIG = {    
  cycle: 4,    
  // ★ 15秒は厳しすぎて0人になりやすい → 36秒へ    
  phaseWindow: 0.60,    
  // 新しさは少し長めに（極端に落ちすぎない）    
  recencyTau: 12,    
  weight: {    
    // ★ 学習（strength）を少し強めると「当たりやすい帯」が上がる    
    strength: 0.40,    
    phase:    0.25,    
    recency:  0.25,    
    activity: 0.10    
  },    
  // ★ 目標10人前提：閾値を下げる    
  threshold: 0.30,    
  // ★ 0人対策：最低でも上位10人は必ず表示    
  minCandidates: 10    
};    
/* ---------------------------------------------------------
   [28] getPhaseDistanceMin
--------------------------------------------------------- */
function getPhaseDistanceMin(updateDateStr, cycleMin = MATCHING_SCORE_CONFIG.cycle) {    
  if (!updateDateStr) return { diffMin: Infinity, d: Infinity };    
  const now = new Date();    
  const last = new Date(updateDateStr.replace(/-/g, "/"));    
  const sec = last.getSeconds();    
  const rounded = sec < 30 ? 0 : 30;    
  last.setSeconds(rounded, 0);    
  const diffMin = (now - last) / 60000;    
  if (!isFinite(diffMin) || diffMin < 0) return { diffMin: Infinity, d: Infinity };    
  if (diffMin < cycleMin) return { diffMin, d: Infinity };    
  const r = diffMin % cycleMin;    
  const d = Math.min(r, cycleMin - r);    
  return { diffMin, d };    
}    
/* ---------------------------------------------------------
  [29] calcMatchingScore
--------------------------------------------------------- */
function calcMatchingScore(player) {    
  if (!player || !player.updateDate) return 0;    
  // ★ 学習（相手ランク分布）    
  const strengthScore = getSeasonStrengthScore(player);    
  // ★ Phase / Recency    
  const { diffMin, d } = getPhaseDistanceMin(player.updateDate);    
  if (!isFinite(diffMin) || diffMin === Infinity) return 0;    
  const phaseScore = (isFinite(d) && d !== Infinity)    
    ? Math.max(0, 1 - (d / MATCHING_SCORE_CONFIG.phaseWindow))    
    : 0;    
  const recencyScore = Math.exp(-diffMin / MATCHING_SCORE_CONFIG.recencyTau);    
  // ★ Activity（Viewer上の指標：starCnt / pridePoint）    
  const star = Number(player.starCnt ?? 0);    
  const pride = Number(player.pridePoint ?? 0);    
  const activityScore = star > 0 ? Math.min(1, star / 8) : (pride > 0 ? 0.70 : 0);    
  const w = MATCHING_SCORE_CONFIG.weight;    
   const baseScore =    
      strengthScore * w.strength +    
      phaseScore    * w.phase +    
      recencyScore  * w.recency +    
      activityScore * w.activity;       
const areaScore = getAreaScore(player);    
// ===============================    
// area補正（分布差ベース）    
// ===============================    
const areaMultiplier = (0.9 + 0.3 * areaScore);    
// ===============================    
// realtimeBoost（元ロジック流用）    
// ===============================    
let realtimeBoost = getRealtimeBoost(player);    
realtimeBoost = Math.min(realtimeBoost, 2.0);    
// ===============================    
//    [28] getPhaseDistanceMin★相乗暴発抑制    
// ===============================    
const areaInfluence = Math.min(areaScore, 2.5);    
const damping = 1 / Math.pow(areaInfluence, 0.6);    
const adjustedRealtimeBoost =    
  1 + (realtimeBoost - 1) * damping;    
// ===============================    
//    [29] calcMatchingScore（最重要コア）最終スコア    
// ===============================    
let score =    
  baseScore    
  * areaMultiplier    
  * adjustedRealtimeBoost;    
   // 重み可視化    
   console.log(    
  player.name,    
  "area=", player.area,    
  "areaScore=", areaScore.toFixed(2),    
  "areaMult=", areaMultiplier.toFixed(2),    
  "rtRaw=", realtimeBoost.toFixed(2),    
  "rtAdj=", adjustedRealtimeBoost.toFixed(2),    
  "score=", score.toFixed(3)    
);    
// ===============================    
// 上限＆下限    
// ===============================    
score = Math.min(score, baseScore * 3.0);  // 暴発防止（任意）    
return Math.max(0, Math.min(1, score));    
}    
/* ---------------------------------------------------------
   [30] applyFilters　フィルタ（時間フィルタ）
--------------------------------------------------------- */    
function applyFilters() {    
  const minutes = Number(document.getElementById("rangeSelect").value);    
  if (!State.generatedAt) {    
    logError("generatedAt が未取得のため、時間フィルタをスキップしました");    
    State.filtered = [...State.all];    
    return;    
  }    
  const baseMs = parseDateJST(State.generatedAt).getTime();    
  const filterStartMs = baseMs - minutes * 60 * 1000;    
  document.getElementById("filterStartTime").textContent =    
    formatYMDHM(new Date(filterStartMs));    
  State.filtered = State.all.filter(p => {    
    if (!p.updateDate) return false;    
    return parseDateJST(p.updateDate).getTime() >= filterStartMs;    
  });    
   State.areaModel = buildAreaDistribution(State.filtered);    
   // ★ 「エリア重みが効いているか」確認用ログ    
   log("areaModel top5=" + JSON.stringify(    
  Object.entries(State.areaModel).sort((a,b)=>b[1]-a[1]).slice(0,5)    
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
  const base = State.filtered.length ? State.filtered : State.all;    
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
          <th>☆・Lv</th>    
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
  State.currentView = "summary";    
  document.getElementById("summaryView").style.display = "block";    
  document.getElementById("detailView").style.display = "none";    
  const mv = document.getElementById("matchingView");    
  if (mv) mv.style.display = "none";    
}    
/* ---------------------------------------------------------    
   [37] showSummaryUI   ★ showSummaryUI    
--------------------------------------------------------- */    
function showSummaryUI(push = true) {    
  renderSummary();    
  // 画面切替（必要なら）    
  State.currentView = "summary";    
  document.getElementById("summaryView").style.display = "block";    
  document.getElementById("detailView").style.display = "none";    
  const mv = document.getElementById("matchingView");    
  if (mv) mv.style.display = "none";    
  // “遷移したときだけ” pushする    
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
function showDetail(key) {    
  const row = State.summary.find(r => r.key === key) || null;    
  const rankInfo = getRankInfo(key);    
  const isRubyBand = rankInfo ? rankInfo.type === "ruby" : key.startsWith("R");    
  const bandLabel = rankInfo ? rankInfo.label : (row ? row.label : key);    
  const bandIcon = rankInfo ? rankInfo.icon : "";    
  setupRankNavigation(key);    
  if (!row) {    
    State.detailOriginal = [];    
    State.currentView = "detail";    
    State.currentIsRubyBand = isRubyBand;    
    history.pushState({ page: STATE.DETAIL }, '', '');    
    renderDetailTable(isRubyBand, bandLabel, bandIcon);    
    document.getElementById("summaryView").style.display = "none";    
    document.getElementById("detailView").style.display = "block";    
    const mv = document.getElementById("matchingView");    
    if (mv) mv.style.display = "none";    
    return;    
  }    
  State.detailOriginal = row.list.slice().sort((a, b) => {    
    return parseDateJST(b.updateDate) - parseDateJST(a.updateDate);    
  });    
  State.currentView = "detail";    
  State.currentIsRubyBand = isRubyBand;    
  history.pushState({ page: STATE.DETAIL }, '', '');    
  renderDetailTable(isRubyBand, bandLabel, bandIcon);    
  document.getElementById("summaryView").style.display = "none";    
  document.getElementById("detailView").style.display = "block";    
  const mv = document.getElementById("matchingView");    
  if (mv) mv.style.display = "none";    
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
            <th>☆・PRIDE</th>    
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
   ★ 共通：フェーズハイライト
--------------------------------------------------------- */
function highlightMatchingRows(tbody) {
  tbody.querySelectorAll("tr").forEach(tr => {
    const updated = tr.dataset.updated;
    if (!updated) return;
    if (isMatchingCandidateByPhase(updated)) {
      tr.classList.add("match-row-pink");
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
function applyPlayerFilter(keyword, isRubyBand, keepOriginalOrder = false) {    
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
   [46] copyToClipboard   クリップボードコピー（★ログ復活版）    
--------------------------------------------------------- */    
function copyToClipboard(text) {    
  if (!navigator.clipboard) {    
    // 古いブラウザ用（同期コピー）    
    const ta = document.createElement("textarea");    
    ta.value = text;    
    document.body.appendChild(ta);    
    ta.select();    
    document.execCommand("copy");    
    document.body.removeChild(ta);    
    log(`コピー：${text}`);  // ★ 追加（同期コピー時）    
    recordClickFromCopiedText(text);    
    return;    
  }    
  // 新しいブラウザ用（非同期コピー）    
  navigator.clipboard.writeText(text)    
    .then(() => {    
      log(`コピー：${text}`);  // ★ 追加（成功時）    
       recordClickFromCopiedText(text);    
    })    
    .catch(() => {    
      logError("コピーに失敗しました");  // ★ 失敗時    
    });    
}    
/* ---------------------------------------------------------
   [47] buildMatchingCandidates   ★ マッチング候補一覧生成（アルゴリズム適用）    
--------------------------------------------------------- */    
function buildMatchingCandidates() {    
  const selectedStars = [...document.querySelectorAll(".ruby-filter:checked")]    
    .map(x => Number(x.value));    
  const selectedPrides = [...document.querySelectorAll(".pride-filter:checked")]    
    .map(x => x.value);    
  // filtered が極端に少ないと不安定になるので、必要なら all に退避    
  const base = (State.filtered.length >= 30 ? State.filtered : State.all);    
  // まず全員スコア化（学習＋時刻）    
  const scoredAll = base.map(p => {    
    const rankKey = getPlayerRankKey(p);    
    const score = calcMatchingScore(p);    
    return { ...p, __rankKey: rankKey, __score: score };    
  });    
  // フィルタ（RUBY/PRIDE）    
  const filteredByRank = scoredAll.filter(p => {    
    if (!p.updateDate) return false;    
    if (!p.__rankKey) return false;    
    if (p.__rankKey.startsWith("R")) {    
      return selectedStars.includes(p.starCnt);    
    } else {    
      return selectedPrides.includes(p.__rankKey);    
    }    
  });    
  // Step1: 通常閾値    
  let list = filteredByRank.filter(p => p.__score >= MATCHING_SCORE_CONFIG.threshold);    
  // Step2: 0人なら閾値緩和    
  if (list.length === 0) {    
    const relaxed = Math.max(0.25, MATCHING_SCORE_CONFIG.threshold - 0.10);    
    list = filteredByRank.filter(p => p.__score >= relaxed);    
    if (list.length > 0) {    
      logWarn(`候補0人のため閾値を緩和：${MATCHING_SCORE_CONFIG.threshold} → ${relaxed}`);    
    }    
  }    
  // Step3: それでも0人なら「参考表示（上位N）」    
  if (list.length === 0) {    
    list = filteredByRank    
      .slice()    
      .sort((a, b) => (b.__score ?? 0) - (a.__score ?? 0))    
      .slice(0, MATCHING_SCORE_CONFIG.minCandidates);    
    if (list.length > 0) {    
      logWarn(`候補0人のため、スコア上位${MATCHING_SCORE_CONFIG.minCandidates}人を参考表示します`);    
    }    
  }    
  // ソート（スコア降順 → rank order → updateDate新しい順）    
  list.sort((a, b) => {    
    const sa = (a.__score ?? 0);    
    const sb = (b.__score ?? 0);    
    if (sb !== sa) return sb - sa;    
    const ra = getRankInfo(a.__rankKey);    
    const rb = getRankInfo(b.__rankKey);    
    const oa = ra ? ra.order : 999;    
    const ob = rb ? rb.order : 999;    
    if (oa !== ob) return oa - ob;    
    return parseDateJST(b.updateDate) - parseDateJST(a.updateDate);    
  });    
// ★ 最終ガード：候補が10人未満なら、スコア上位で埋める（必ず10人出す）    
if (list.length < MATCHING_SCORE_CONFIG.minCandidates) {    
  const need = MATCHING_SCORE_CONFIG.minCandidates - list.length;    
  const existingNames = new Set(list.map(p => p.name));    
  const fillers = filteredByRank    
    .filter(p => !existingNames.has(p.name))    
    .slice()    
    .sort((a, b) => (b.__score ?? 0) - (a.__score ?? 0))    
    .slice(0, need);    
  list = list.concat(fillers);    
  if (fillers.length > 0) {    
    logWarn(`候補が${MATCHING_SCORE_CONFIG.minCandidates}人未満のため、上位スコアで補完しました（+${fillers.length}）`);    
  }    
}    
// ★ 最終確定：候補は必ず上位N人に固定    
list = list.slice(0, MATCHING_SCORE_CONFIG.minCandidates);    
  State.matchingList = list;    
  // デバッグログ（上位5）    
  if (State.matchingList.length) {    
    log(`候補TOP: ${State.matchingList.slice(0,5).map(p => `${p.name}(${(p.__score??0).toFixed(2)})`).join(" / ")}`);    
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
            <th>☆・PRIDE</th>    
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
function showMatchingCandidates() {    
  buildMatchingCandidates();    
  renderMatchingHeader();    
  renderMatchingTable();    
  State.currentView = "matching";    
  document.getElementById("summaryView").style.display = "none";    
  document.getElementById("detailView").style.display = "none";    
  const mv = document.getElementById("matchingView");    
  if (mv) mv.style.display = "block";    
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
   [55] init   初期化（★ loadAreaList を追加済み）    
--------------------------------------------------------- */    
async function init() {    
  log("Viewer 初期化中");    
  startProgress();    
  // ★ RUBY / PRIDE フィルタ自動生成    
  buildRubyFilters();    
  buildPrideFilters();    
  // ★ 追加：areaList.json を読み込む    
  await loadAreaList();    
  await loadLatestRound();    
  await loadSeasonModel();    
  await loadRoundData();    
  applyFilters();    
  buildSummary();    
  renderSummary();    
  stopProgress();    
  log("Viewer 初期化完了");    
  setInterval(checkUpdate, 30000);    
  checkUpdate();    
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
      startProgress();    
      await loadRoundData();    
      applyFilters();    
      buildSummary();    
      renderSummary();    
      stopProgress();    
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
      if (State.currentView === "summary") {    
        renderSummary();    
      } else if (State.currentView === "detail") {    
        applyPlayerFilter(State.searchText, State.currentIsRubyBand);    
        renderDetailTable(State.currentIsRubyBand, "", "");    
      } else if (State.currentView === "matching") {    
        applyMatchingFilter(State.searchText);    
      }    
    });    
  }    
  // ✅ サマリ戻る（UIボタン）    
  if (backBtn && searchInput) {    
    backBtn.onclick = () => {    
      State.searchText = "";    
      searchInput.value = "";    
      renderSummary();    
    };    
  }    
  // ✅ matching表示    
  if (matchingBtn && searchInput) {    
    matchingBtn.onclick = () => {    
      State.searchText = "";    
      searchInput.value = "";    
      showMatchingCandidates();    
    };    
  }    
  if (matchingBackBtn && searchInput) {    
    matchingBackBtn.onclick = () => {    
      State.searchText = "";    
      searchInput.value = "";    
      backToSummaryFromMatching();    
    };    
  }    
  // ✅ ランク選択    
  const myRankSelect = document.getElementById("myRankSelect");    
  if (myRankSelect) {    
    State.selectedMyRank = myRankSelect.value || "R6";    
    State.myStar =    
      (String(State.selectedMyRank).startsWith("R") &&    
        Number(String(State.selectedMyRank).slice(1)) >= 7)    
        ? 7 : 6;    
    myRankSelect.addEventListener("change", (e) => {    
      State.selectedMyRank = e.target.value;    
      State.myStar =    
        (String(State.selectedMyRank).startsWith("R") &&    
          Number(String(State.selectedMyRank).slice(1)) >= 7)    
          ? 7 : 6;    
      log(`自分ランク変更：${State.selectedMyRank}`);    
    });    
  }    
  // ✅ 初期化（DOM後）    
  init();    
});    
/* ---------------------------------------------------------    
   [57] popstate（戻る制御   戻るボタン処理    
--------------------------------------------------------- */    
window.addEventListener('popstate', (e) => {    
  const state = e.state;    
  console.log("popstate fired:", state, "history.length=", history.length);    
  // ✅ もう戻れない or stateが無い → 戻るキャンセル    
  if (!state || history.length <= 2) {    
    history.pushState({ page: STATE.SUMMARY }, '', '');    
    return;    
  }    
  // ✅ 詳細 / matching → サマリ    
  if (State.currentView === "detail" || State.currentView === "matching") {    
    showSummaryUI(false);    
    history.pushState({ page: STATE.SUMMARY }, '', '');    
    return;    
  }    
  // ✅ サマリで戻る → 検索クリア    
  if (state.page === STATE.SUMMARY) {    
    clearSearch();    
    showSummaryUI(false);    
    history.pushState({ page: STATE.SUMMARY }, '', '');    
  }    
});  
