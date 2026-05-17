/* ---------------------------------------------------------
   Initial DAC Round Data Viewer（integrated_data.json + latest_round.json 対応）
--------------------------------------------------------- */

const BASE_URL = "https://pand-gthb.github.io/initialdac-round-data-auto-json-00";

/* ---------------------------------------------------------
   Ruby帯・PRIDE帯 定義
--------------------------------------------------------- */

const RUBY_ID =
  "dcb98f86f149cf71d3707a1592072e7838f0811140c24238820dff2b82602a85";

const PRIDE_LEVELS = [
  { key: "P_A", level: "A=～99",    min: 1,     max: 99,    icon: "ef788ee816773c454495ebf83e5ac380" },
  { key: "P_B", level: "B=100～",   min: 100,   max: 499,   icon: "3c8cc917bb7a97d46ba35c93d898491c" },
  { key: "P_C", level: "C=500～",   min: 500,   max: 999,   icon: "ec8f805c9de95c65c858d2e1341f76ab" },
  { key: "P_D", level: "D=1000～",  min: 1000,  max: 4999,  icon: "58446a29e6c496139963728eea887349" },
  { key: "P_E", level: "E=5000～",  min: 5000,  max: 9999,  icon: "5f88cb6a33355e7bc890d92576e36c94" },
  { key: "P_F", level: "F=10000～", min: 10000, max: 49999, icon: "807b2b796691b862d667448a3918edd7" },
  { key: "P_G", level: "G=50000～", min: 50000, max: Infinity, icon: "dfff542ae4eee8e95ea61a665dd8ce8e" }
];

/* ---------------------------------------------------------
   ★ RANKS（Ruby☆1〜8 + PRIDE A〜G）
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

function getRankIndex(key) {
  return RANKS.findIndex(r => r.key === key);
}

function getRankInfo(key) {
  return RANKS.find(r => r.key === key) || null;
}

/* ---------------------------------------------------------
   ★ 前後ランク移動ボタン制御
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
   状態管理
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
  currentIsRubyBand: true
};

/* ---------------------------------------------------------
   ログ
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
   進行中アニメーション
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
   ユーティリティ
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
   normalize（★欠落していたため復元）
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
   ★ Ruby星の2行表示
--------------------------------------------------------- */
function renderStars(starCount) {
  const full = "★".repeat(starCount);
  return full.length > 4
    ? full.slice(0, 4) + "<br>" + full.slice(4)
    : full;
}
/* ---------------------------------------------------------
   Initial DAC Round Data Viewer（integrated_data.json + latest_round.json 対応）
--------------------------------------------------------- */

const BASE_URL = "https://pand-gthb.github.io/initialdac-round-data-auto-json-00";

/* ---------------------------------------------------------
   Ruby帯・PRIDE帯 定義
--------------------------------------------------------- */

const RUBY_ID =
  "dcb98f86f149cf71d3707a1592072e7838f0811140c24238820dff2b82602a85";

const PRIDE_LEVELS = [
  { key: "P_A", level: "A=～99",    min: 1,     max: 99,    icon: "ef788ee816773c454495ebf83e5ac380" },
  { key: "P_B", level: "B=100～",   min: 100,   max: 499,   icon: "3c8cc917bb7a97d46ba35c93d898491c" },
  { key: "P_C", level: "C=500～",   min: 500,   max: 999,   icon: "ec8f805c9de95c65c858d2e1341f76ab" },
  { key: "P_D", level: "D=1000～",  min: 1000,  max: 4999,  icon: "58446a29e6c496139963728eea887349" },
  { key: "P_E", level: "E=5000～",  min: 5000,  max: 9999,  icon: "5f88cb6a33355e7bc890d92576e36c94" },
  { key: "P_F", level: "F=10000～", min: 10000, max: 49999, icon: "807b2b796691b862d667448a3918edd7" },
  { key: "P_G", level: "G=50000～", min: 50000, max: Infinity, icon: "dfff542ae4eee8e95ea61a665dd8ce8e" }
];

/* ---------------------------------------------------------
   ★ RANKS（Ruby☆1〜8 + PRIDE A〜G）
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

function getRankIndex(key) {
  return RANKS.findIndex(r => r.key === key);
}

function getRankInfo(key) {
  return RANKS.find(r => r.key === key) || null;
}

/* ---------------------------------------------------------
   ★ 前後ランク移動ボタン制御
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
   状態管理
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
  currentIsRubyBand: true
};

/* ---------------------------------------------------------
   ログ
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
   進行中アニメーション
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
   ユーティリティ
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
   normalize（★欠落していたため復元）
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
   ★ Ruby星の2行表示
--------------------------------------------------------- */
function renderStars(starCount) {
  const full = "★".repeat(starCount);
  return full.length > 4
    ? full.slice(0, 4) + "<br>" + full.slice(4)
    : full;
}
/* ---------------------------------------------------------
   詳細表示（前後ランク移動＋検索再実行対応）
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

    renderDetailTable(isRubyBand, bandLabel, bandIcon);
    document.getElementById("summaryView").style.display = "none";
    document.getElementById("detailView").style.display = "block";
    return;
  }

  State.detailOriginal = row.list.slice().sort((a, b) => {
    return parseDateJST(b.updateDate) - parseDateJST(a.updateDate);
  });

  State.currentView = "detail";
  State.currentIsRubyBand = isRubyBand;

  renderDetailTable(isRubyBand, bandLabel, bandIcon);

  document.getElementById("summaryView").style.display = "none";
  document.getElementById("detailView").style.display = "block";
}

/* ---------------------------------------------------------
   詳細テーブル
--------------------------------------------------------- */
function renderDetailTable(isRubyBand, bandLabel, bandIcon) {
  const area = document.getElementById("detailArea");

  area.innerHTML = `
    <h3 id="detailCountHeader">
      <img src="${bandIcon}" width="32" style="vertical-align:middle;">
      ${bandLabel}：<span id="detailCount"></span>人
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

  applyPlayerFilter(State.searchText, isRubyBand);
}

/* ---------------------------------------------------------
   プレイヤー名フィルタ
--------------------------------------------------------- */
function applyPlayerFilter(keyword, isRubyBand) {
  const base = State.detailOriginal || [];
  const normKey = normalize(keyword);

  const list = normKey
    ? base.filter(p => (p.normalizedName || "").includes(normKey))
    : base;

  const countEl = document.getElementById("detailCount");
  if (countEl) countEl.textContent = fmt(list.length);

  renderDetailRows(list, isRubyBand);
}

/* ---------------------------------------------------------
   ★★★ 詳細行描画（★表示変更＋クリックコピー対応）
--------------------------------------------------------- */
function renderDetailRows(list, isRubyBand) {
  const tbody = document.getElementById("detailTableBody");
  if (!tbody) return;

  const rows = list.map(p => {
    const titleUrl = p.mytitleId
      ? `https://initiald.sega.jp/inidac/ranking-images/title/${p.mytitleId}.png`
      : "";

    /* ---------------------------------------------------------
       ★ Ruby帯 → ★表示（2行対応）
       ★ PRIDE帯 → 数値表示
       ★ クリックコピー用 data-* を付与
    --------------------------------------------------------- */
    let starOrLevelHtml = "";
    let starOrLevelAttr = "";

    if (isRubyBand) {
      const star = p.starCnt ?? 0;
      starOrLevelHtml = renderStars(star);
      starOrLevelAttr = `data-type="star" data-star="${star}"`;
    } else {
      const pride = p.pridePoint ?? 0;
      starOrLevelHtml = pride;
      starOrLevelAttr = `data-type="pride" data-pride="${pride}"`;
    }

    const fullShop = p.shopname ?? "";
    const shortShop = shortenStoreName(fullShop);

    return `
      <tr data-updated="${p.updateDate}">
        
        <!-- ★・PRIDE 列 -->
        <td class="center clickable star-pride-col"
            ${starOrLevelAttr}
            data-name="${p.name}">
          ${starOrLevelHtml}
        </td>

        <!-- 名前（名前単独コピー） -->
        <td class="left player-name clickable"
            data-type="name"
            data-name="${p.name}">
          ${p.name}
        </td>

        <td class="right">${fmt(p.point)}</td>

        <!-- 店舗名（従来通り店舗名単独コピー） -->
        <td class="left clickable"
            data-type="shop"
            data-name="${p.name}"
            data-fullname="${fullShop.replace(/"/g, "&quot;")}">
          <div class="store-name">${shortShop}</div>
        </td>

        <td class="center">${titleUrl ? `<img src="${titleUrl}" height="24">` : ""}</td>
        <td class="left">${p.updateDate}</td>
      </tr>
    `;
  }).join("");

  tbody.innerHTML = rows;

  /* ---------------------------------------------------------
     ★ 5分刻みマッチング可能性 → 行を淡いピンクに
  --------------------------------------------------------- */
  const now = new Date();

  tbody.querySelectorAll("tr").forEach(tr => {
    const updated = tr.dataset.updated;
    if (!updated) return;

    const last = new Date(updated.replace(/-/g, "/"));
    const diffMin = Math.abs(Math.floor((now - last) / 60000));

    if (diffMin % 5 === 0) {
      tr.classList.add("match-row-pink");
    }
  });
}

/* ---------------------------------------------------------
   クリックコピー（共通）
--------------------------------------------------------- */
function copyToClipboard(text) {
  navigator.clipboard.writeText(text);
  log(`コピー：${text}`);
}
/* ---------------------------------------------------------
   CSV 出力（サマリ）
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
   CSV 出力（全データ）
--------------------------------------------------------- */
function exportAllCSV() {
  const columns = [
    "rank","name","shopname","updateDate","point",
    "mytitleId","prideId","pridePoint","onlineBattleRankId","starCnt"
  ];

  const header = columns.join(",");

  const body = State.all
    .map(p =>
      columns
        .map(col => `"${String(p[col] ?? "").replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n");

  downloadCSV("all_records.csv", header, body);
}

/* ---------------------------------------------------------
   ★ latest_update.json の更新監視（監視ログなし）
--------------------------------------------------------- */
async function checkUpdate() {
  try {
    const json = await fetchJSON("latest_update.json");

    const raw = json.lastUpdated ?? json.generatedAt ?? "";
    if (!raw) return;

    // 初回は保存だけ
    if (!State.latestUpdateAt) {
      State.latestUpdateAt = raw;
      return;
    }

    // 更新検知
    if (raw !== State.latestUpdateAt) {
      State.latestUpdateAt = raw;

      const btn = document.getElementById("reloadBtn");
      if (btn) {
        btn.classList.add("update-alert"); // オレンジ化
      }

      logWarn("データ更新を検知しました（latest_update.json）");
    }

  } catch (e) {
    logError("latest_update.json の監視に失敗：" + e.message);
  }
}

/* ---------------------------------------------------------
   初期化（★ init は1回のみ実行）
--------------------------------------------------------- */
async function init() {
  log("Viewer 初期化中");

  startProgress();

  buildRubyFilters();

  await loadLatestRound();
  await loadRoundData();

  applyFilters();
  buildSummary();
  renderSummary();

  stopProgress();

  log("Viewer 初期化完了");

  /* ★ 監視開始（監視ログは出さない） */
  setInterval(checkUpdate, 60000);
  checkUpdate(); // 即時1回
}

/* ---------------------------------------------------------
   ★ クリックコピー（★・PRIDE・名前・店舗名）
--------------------------------------------------------- */
document.getElementById("detailArea").addEventListener("click", e => {
  const cell = e.target.closest(".clickable");
  if (!cell) return;

  const type = cell.dataset.type;
  const name = cell.dataset.name;

  if (type === "star") {
    const star = cell.dataset.star;
    copyToClipboard(`★${star}\t${name}`);
    return;
  }

  if (type === "pride") {
    const pride = cell.dataset.pride;
    copyToClipboard(`PRIDE${pride}\t${name}`);
    return;
  }

  if (type === "name") {
    copyToClipboard(name);
    return;
  }

  if (type === "shop") {
    const shop = cell.dataset.fullname;
    copyToClipboard(shop);
    return;
  }
});

/* ---------------------------------------------------------
   DOMContentLoaded
--------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {

  /* ★ reloadBtn の初期色を標準グレーに戻す */
  const reloadBtn = document.getElementById("reloadBtn");
  if (reloadBtn) {
    reloadBtn.classList.remove("update-alert");
    reloadBtn.style.cssText = "";
  }

  /* ★ 最新データ取得（init は再実行しない） */
  document.getElementById("reloadBtn").onclick = async () => {
    startProgress();
    await loadRoundData();
    applyFilters();
    buildSummary();
    renderSummary();
    stopProgress();
  };

  document.getElementById("filterBtn").onclick = () => {
    startProgress();
    applyFilters();
    buildSummary();
    renderSummary();
    stopProgress();
  };

  document.getElementById("summaryCsvBtn").onclick = exportSummaryCSV;
  document.getElementById("allCsvBtn").onclick = exportAllCSV;

  const searchInput = document.getElementById("searchInput");

  searchInput.addEventListener("input", e => {
    State.searchText = e.target.value;

    if (State.currentView === "summary") {
      renderSummary();
    } else {
      applyPlayerFilter(State.searchText, State.currentIsRubyBand);
    }
  });

  document.getElementById("backBtn").onclick = () => {
    State.searchText = "";
    searchInput.value = "";
    renderSummary();
  };

  init();
});
