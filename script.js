/* ---------------------------------------------------------
   Initial DAC Round Data Viewer（Ruby＋PRIDE専用・前後ランク移動＋検索保持対応）
   ★ サマリ検索窓は HTML 側に固定配置（IME 完全安定）
   ★ サマリ検索＋詳細検索を normalize ベースで統一
   ★ summaryFiltered を導入
   ★ 詳細 → サマリ戻る時に検索クリア
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
   ★ rankOrder（Ruby☆1〜☆8 → PRIDE A〜G）
--------------------------------------------------------- */
const rankOrder = [
  "R1","R2","R3","R4","R5","R6","R7","R8",
  "P_A","P_B","P_C","P_D","P_E","P_F","P_G"
];

/* ---------------------------------------------------------
   ★ rankBadgeIdMap（Ruby＋PRIDE）
--------------------------------------------------------- */
const rankBadgeIdMap = {
  R1: RUBY_ID, R2: RUBY_ID, R3: RUBY_ID, R4: RUBY_ID,
  R5: RUBY_ID, R6: RUBY_ID, R7: RUBY_ID, R8: RUBY_ID,

  P_A: PRIDE_LEVELS[0].icon,
  P_B: PRIDE_LEVELS[1].icon,
  P_C: PRIDE_LEVELS[2].icon,
  P_D: PRIDE_LEVELS[3].icon,
  P_E: PRIDE_LEVELS[4].icon,
  P_F: PRIDE_LEVELS[5].icon,
  P_G: PRIDE_LEVELS[6].icon
};

/* ---------------------------------------------------------
   ★ 前後ランク移動ボタン制御
--------------------------------------------------------- */
function setupRankNavigation(currentKey) {
  const idx = rankOrder.indexOf(currentKey);

  const prev = idx > 0 ? rankOrder[idx - 1] : null;
  const next = idx < rankOrder.length - 1 ? rankOrder[idx + 1] : null;

  const prevBtn = document.getElementById("prevRankBtn");
  const nextBtn = document.getElementById("nextRankBtn");

  prevBtn.disabled = !prev;
  nextBtn.disabled = !next;

  prevBtn.onclick = () => prev && showDetail(prev);
  nextBtn.onclick = () => next && showDetail(next);
}

/* ---------------------------------------------------------
   状態管理（検索文字列保持を追加）
--------------------------------------------------------- */
const State = {
  all: [],
  filtered: [],
  summary: [],            // 全ランク一覧
  summaryFiltered: [],    // ★ サマリ検索後のランク一覧
  detailOriginal: [],
  latestRound: null,
  generatedAt: "",

  summarySearchText: "",  // 🔍 サマリ検索（HTML 固定検索窓と同期）
  detailSearchText: ""    // 🔍 詳細検索（サマリ→詳細で引き継ぐ）
};

/* ---------------------------------------------------------
   ログ（最新が上）＋色分け＋最大行数制限
--------------------------------------------------------- */
const MAX_LOG_LINES = 200;

function appendLog(msg, type = "info") {
  const box = document.getElementById("logBox");

  [...box.children].forEach(line => {
    const t = line.dataset.type;
    if (t === "info") line.style.color = "#66aa66";
    if (t === "warn") line.style.color = "#bbaa55";
  });

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
  else if (type === "warn") line.style.color = "#ffcc00";
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
   ★ normalize（半角→全角＋ひらがな→カタカナ＋小文字化＋スペース除去）
--------------------------------------------------------- */
function normalize(s) {
  if (!s) return "";

  s = s.replace(/\u3000/g, " "); // 全角スペース → 半角
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
   ★ 店舗名省略ロジック（旧版のまま）
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
   共通 fetch
--------------------------------------------------------- */
async function fetchJSON(path) {
  const res = await fetch(`${BASE_URL}/${path}?t=${Date.now()}`, {
    cache: "no-store"
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

/* ---------------------------------------------------------
   Ruby星数フィルタ生成
--------------------------------------------------------- */
function buildRubyFilters() {
  const area = document.getElementById("rubyFilters");
  area.innerHTML = Array.from({ length: 8 }, (_, i) => {
    const star = i + 1;
    return `
      <label style="margin-right:10px;">
        <input type="checkbox" class="ruby-filter" value="${star}" checked>
        ☆${star}
      </label>
    `;
  }).join("");
}

/* ---------------------------------------------------------
   latest.json 読み込み
--------------------------------------------------------- */
async function loadLatest() {
  log("latest.json 取得準備中");

  try {
    const json = await fetchJSON("latest.json");
    if (!json.latestRound) throw new Error("latestRound が存在しません");

    State.latestRound = json.latestRound;
    document.getElementById("latestRound").textContent = State.latestRound;

    log("latest.json 読み込み完了");
  } catch (e) {
    logError("latest.json の取得に失敗：" + e.message);
  }
}

/* ---------------------------------------------------------
   roundXX.json 読み込み
--------------------------------------------------------- */
async function loadRoundData() {
  if (!State.latestRound) {
    logError("latestRound が未取得のため、roundXX.json を読み込めません");
    return;
  }

  log(`round${State.latestRound}.json 取得準備中`);

  try {
    const json = await fetchJSON(`round${State.latestRound}.json`);

    State.generatedAt = json.generatedAt ?? "";

    if (State.generatedAt) {
      document.getElementById("jsonUpdateTime").textContent =
        formatYMDHM(parseDateJST(State.generatedAt));
    }

    State.all = Array.isArray(json) ? json : (json.records || []);

    log(`round${State.latestRound}.json 読み込み完了 (${State.all.length}件)`);
  } catch (e) {
    logError("roundXX.json の取得に失敗：" + e.message);
  }
}

/* ---------------------------------------------------------
   フィルタ
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
}

/* ---------------------------------------------------------
   サマリ統計計算
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
   PRIDE レベル判定
--------------------------------------------------------- */
function findPrideLevel(label) {
  return PRIDE_LEVELS.find(l => l.level === label);
}

/* ---------------------------------------------------------
   サマリ生成（Ruby＋PRIDE）
--------------------------------------------------------- */
function buildSummary() {
  State.summary = [];

  const selectedStars = [...document.querySelectorAll(".ruby-filter:checked")]
    .map(x => Number(x.value));

  /* Ruby帯（R1〜R8） */
  selectedStars.forEach(star => {
    const list = State.filtered.filter(
      p => p.onlineBattleRankId === RUBY_ID && p.starCnt === star
    );

    State.summary.push({
      key: `R${star}`,
      label: `☆${star}`,
      icon: `https://initiald.sega.jp/inidac/ranking-images/online/${RUBY_ID}.png`,
      list
    });
  });

  /* PRIDE帯（P_A〜P_G） */
  PRIDE_LEVELS.forEach(level => {
    const list = State.filtered.filter(
      p => p.pridePoint >= level.min && p.pridePoint <= level.max
    );

    State.summary.push({
      key: level.key,
      label: level.level,
      icon: `https://initiald.sega.jp/inidac/ranking-images/pride/${level.icon}.png`,
      list
    });
  });
}

/* ---------------------------------------------------------
   ★ サマリ検索フィルタ（normalize ベース）
--------------------------------------------------------- */
function filterSummaryBySearch() {
  const text = normalize(State.summarySearchText);

  if (!text) {
    return State.summary; // 全表示
  }

  return State.summary.filter(r => {
    return r.list.some(p =>
      normalize(p.name).includes(text)
    );
  });
}

/* ---------------------------------------------------------
   ★ 修正版：サマリ表示（検索窓は HTML 固定、ここではテーブルのみ描画）
--------------------------------------------------------- */
function renderSummary() {
  const area = document.getElementById("summaryArea");

  /* ★ サマリ検索結果を State に反映 */
  State.summaryFiltered = filterSummaryBySearch();
  const filteredSummary = State.summaryFiltered;

  const total = filteredSummary.reduce((sum, r) => sum + r.list.length, 0);
  const rubyTotal = filteredSummary
    .filter(r => r.key.startsWith("R"))
    .reduce((s, r) => s + r.list.length, 0);
  const prideTotal = total - rubyTotal;

  /* ★ 検索窓は HTML 側に固定したため、ここではテーブルのみ描画 */
  area.innerHTML = `
    <h3>合計 ${fmt(total)}人：ランク帯 ${fmt(rubyTotal)}人 ＋ PRIDE帯 ${fmt(prideTotal)}人</h3>

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

  /* ★ ランククリックで詳細へ（検索引き継ぎ） */
  document.querySelectorAll("#summaryArea .clickable").forEach(tr => {
    tr.addEventListener("click", () => {
      State.detailSearchText = State.summarySearchText;
      showDetail(tr.dataset.key);
    });
  });

  document.getElementById("summaryView").style.display = "block";
  document.getElementById("detailView").style.display = "none";
}
/* ---------------------------------------------------------
   詳細表示（前後ランク移動＋検索再実行対応）
--------------------------------------------------------- */
function showDetail(key) {
  const row = State.summaryFiltered.find(r => r.key === key);
  if (!row) {
    logError("詳細データが見つかりません: " + key);
    return;
  }

  /* ★ 前後ランク移動ボタン制御 */
  setupRankNavigation(key);

  const isRubyBand = key.startsWith("R");
  const bandLabel = row.label;

  let bandIcon = "";
  if (isRubyBand) {
    bandIcon = `https://initiald.sega.jp/inidac/ranking-images/online/${RUBY_ID}.png`;
  } else {
    const levelInfo = findPrideLevel(bandLabel);
    if (levelInfo) {
      bandIcon =
        `https://initiald.sega.jp/inidac/ranking-images/pride/${levelInfo.icon}.png`;
    }
  }

  /* ★ ランクの元データを更新（更新日時の新しい順） */
  State.detailOriginal = row.list.slice().sort((a, b) => {
    return parseDateJST(b.updateDate) - parseDateJST(a.updateDate);
  });

  /* ★ 詳細テーブル描画（検索欄の復元もここで行う） */
  renderDetailTable(isRubyBand, bandLabel, bandIcon);

  document.getElementById("summaryView").style.display = "none";
  document.getElementById("detailView").style.display = "block";
}

/* ---------------------------------------------------------
   詳細テーブル（検索文字列復元＋再検索対応）
--------------------------------------------------------- */
function renderDetailTable(isRubyBand, bandLabel, bandIcon) {
  const area = document.getElementById("detailArea");

  area.innerHTML = `
    <h3>
      <img src="${bandIcon}" width="32" style="vertical-align:middle;">
      ${bandLabel}：${fmt(State.detailOriginal.length)}人
    </h3>

    <div style="margin:8px 0;">
      <input
        id="playerFilterInput"
        type="text"
        placeholder="プレイヤー名で絞り込み（あいうえお順）"
        style="
          width: 95%;
          padding: 6px 8px;
          font-size: 14px;
          border: 1px solid #ccc;
          border-radius: 4px;
        "
      />
    </div>

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

  const input = document.getElementById("playerFilterInput");

  /* ★ サマリ検索 → 詳細検索へ引き継ぎ済み */
  input.value = State.detailSearchText;

  /* ★ 入力イベントで State を更新 */
  input.addEventListener("input", e => {
    State.detailSearchText = e.target.value;
    applyPlayerFilter(State.detailSearchText, isRubyBand);
  });

  /* ★ 初期描画時も検索を適用（ランク移動後の再検索） */
  applyPlayerFilter(State.detailSearchText, isRubyBand);
}

/* ---------------------------------------------------------
   プレイヤー名フィルタ（normalize ベース）
--------------------------------------------------------- */
function applyPlayerFilter(keyword, isRubyBand) {
  const base = State.detailOriginal || [];
  const normKey = normalize(keyword);

  let list = normKey
    ? base.filter(p => normalize(p.name).includes(normKey))
    : base;

  list = [...list].sort((a, b) =>
    String(a.name).localeCompare(String(b.name), "ja")
  );

  renderDetailRows(list, isRubyBand);
}

/* ---------------------------------------------------------
   詳細行描画
--------------------------------------------------------- */
function renderDetailRows(list, isRubyBand) {
  const tbody = document.getElementById("detailTableBody");
  if (!tbody) return;

  const rows = list.map(p => {
    const titleUrl = p.mytitleId
      ? `https://initiald.sega.jp/inidac/ranking-images/title/${p.mytitleId}.png`
      : "";

    const starOrLevel = isRubyBand
      ? (p.onlineBattleRankId === RUBY_ID && p.starCnt ? `☆${p.starCnt}` : "")
      : p.pridePoint;

    const fullShop = p.shopname ?? "";
    const shortShop = shortenStoreName(fullShop);

    return `
      <tr>
        <td class="center">${starOrLevel}</td>

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
  }).join("");

  tbody.innerHTML = rows;
}

/* ---------------------------------------------------------
   クリックコピー
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
   初期化
--------------------------------------------------------- */
async function init() {
  log("Viewer 初期化中");

  startProgress();

  buildRubyFilters();

  await loadLatest();
  await loadRoundData();

  applyFilters();
  buildSummary();

  /* ★ サマリ検索反映 */
  State.summaryFiltered = filterSummaryBySearch();

  renderSummary();

  stopProgress();

  log("Viewer 初期化完了");
}

/* ---------------------------------------------------------
   DOMContentLoaded（★ サマリ検索窓のイベント登録をここに移動）
--------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("reloadBtn").onclick = () => {
    startProgress();
    init().then(stopProgress);
  };

  document.getElementById("filterBtn").onclick = () => {
    startProgress();
    applyFilters();
    buildSummary();
    State.summaryFiltered = filterSummaryBySearch();
    renderSummary();
    stopProgress();
  };

  document.getElementById("summaryCsvBtn").onclick = exportSummaryCSV;
  document.getElementById("allCsvBtn").onclick = exportAllCSV;

  /* ★ サマリ検索窓のイベント登録（IME 完全安定） */
  const summaryInput = document.getElementById("summarySearchInput");
  summaryInput.addEventListener("input", e => {
    State.summarySearchText = e.target.value;
    renderSummary();
  });

  /* ★ 詳細 → サマリ戻る時に検索クリア（HTML 側の input もクリア） */
  document.getElementById("backBtn").onclick = () => {
    State.summarySearchText = "";
    document.getElementById("summarySearchInput").value = ""; // ★ HTML 側もクリア
    renderSummary();

    document.getElementById("detailView").style.display = "none";
    document.getElementById("summaryView").style.display = "block";
  };

  init();
});
