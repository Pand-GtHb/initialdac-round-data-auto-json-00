/* ---------------------------------------------------------
   Initial DAC Round Data Viewer（auto-json-00 対応）
   - latest.json → 最新ラウンド取得
   - roundXX.json → 統合JSON読み込み（配列 or {records:[]} 両対応）
   - 時間フィルタ + Ruby星数フィルタ
   - サマリCSV / 全データCSV
   - generatedAt 表示
   - ログ色分け（緑/赤）
--------------------------------------------------------- */

/* ★ 定義 */
const RUBY_ID =
  "dcb98f86f149cf71d3707a1592072e7838f0811140c24238820dff2b82602a85";

const PRIDE_LEVELS = [
  { level: "A=～99", min: 1, max: 99, icon: "ef788ee816773c454495ebf83e5ac380" },
  { level: "B=100～", min: 100, max: 499, icon: "3c8cc917bb7a97d46ba35c93d898491c" },
  { level: "C=500～", min: 500, max: 999, icon: "ec8f805c9de95c65c858d2e1341f76ab" },
  { level: "D=1000～", min: 1000, max: 4999, icon: "58446a29e6c496139963728eea887349" },
  { level: "E=5000～", min: 5000, max: 9999, icon: "5f88cb6a33355e7bc890d92576e36c94" },
  { level: "F=10000～", min: 10000, max: 49999, icon: "807b2b796691b862d667448a3918edd7" },
  { level: "G=50000～", min: 50000, max: Infinity, icon: "dfff542ae4eee8e95ea61a665dd8ce8e" }
];

/* ---------------------------------------------------------
   グローバル
--------------------------------------------------------- */
let allData = [];
let filteredData = [];
let summaryRows = [];
let detailList = [];
let latestRound = null;
let generatedAt = "";

/* ---------------------------------------------------------
   ログ（緑/赤）
--------------------------------------------------------- */
function appendLog(msg, type = "normal") {
  const box = document.getElementById("logBox");
  const line = document.createElement("div");
  line.textContent = msg;
  line.style.color = type === "error" ? "#ff5555" : "#00ff00";
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

function log(msg) {
  appendLog(msg, "normal");
}

function logError(msg) {
  appendLog(msg, "error");
}

/* ---------------------------------------------------------
   カンマ付きフォーマット
--------------------------------------------------------- */
function fmt(n) {
  return Number(n).toLocaleString();
}

/* Safari 互換の日時パース */
function parseDateJST(str) {
  return new Date(str.replace(/-/g, "/"));
}

/* ---------------------------------------------------------
   latest.json を取得
--------------------------------------------------------- */
async function loadLatest() {
  log("latest.json を取得中…");

  try {
    const res = await fetch("latest.json", { cache: "no-store" });
    const json = await res.json();

    latestRound = json.latestRound;
    document.getElementById("latestRound").textContent = latestRound;

    log("latest.json 読み込み完了");
  } catch (e) {
    logError("latest.json の取得に失敗");
  }
}

/* ---------------------------------------------------------
   roundXX.json を取得（配列 or {records:[]} 両対応）
--------------------------------------------------------- */
async function loadRoundData() {
  const url = `round${latestRound}.json?t=${Date.now()}`;
  log(`round${latestRound}.json を取得中…`);

  try {
    const res = await fetch(url, { cache: "no-store" });
    const json = await res.json();

    // ★ generatedAt を保存
    generatedAt = json.generatedAt ?? "";

    // ★ 配列 or {records:[]} の両対応
    allData = Array.isArray(json) ? json : json.records;

    document.getElementById("jsonUpdateTime").textContent = generatedAt;

    log(`round${latestRound}.json 読み込み完了（${allData.length}件）`);
  } catch (e) {
    logError(`round${latestRound}.json の取得に失敗`);
  }
}

/* ---------------------------------------------------------
   時間フィルタ
--------------------------------------------------------- */
function filterByTime(data) {
  const minutes = Number(document.getElementById("rangeSelect").value);
  const nowMs = Date.now();
  const RANGE = minutes * 60 * 1000;

  return data.filter(p => {
    if (!p.updateDate) return false;
    const t = parseDateJST(p.updateDate).getTime();
    return nowMs - t <= RANGE;
  });
}

/* ---------------------------------------------------------
   Ruby星数フィルタ
--------------------------------------------------------- */
function filterByRuby(data) {
  const selectedStars = [...document.querySelectorAll(".ruby-filter:checked")]
    .map(x => Number(x.value));

  return data.filter(p => {
    if (p.onlineBattleRankId !== RUBY_ID) return true;
    return selectedStars.includes(p.starCnt);
  });
}

/* ---------------------------------------------------------
   フィルタ適用
--------------------------------------------------------- */
function applyFilters() {
  let data = [...allData];
  data = filterByTime(data);
  data = filterByRuby(data);
  filteredData = data;

  // サマリタイトル更新
  document.getElementById("summaryTitle").textContent =
    `稼働プレイヤー（合計：${fmt(filteredData.length)}人）`;
}

/* ---------------------------------------------------------
   サマリ生成
--------------------------------------------------------- */
function buildSummary() {
  summaryRows = [];

  // ★ ランク帯
  for (let star = 1; star <= 8; star++) {
    const list = filteredData.filter(p =>
      p.onlineBattleRankId === RUBY_ID && p.starCnt === star
    );

    summaryRows.push({
      type: "rank",
      key: `R${star}`,
      label: `☆${star}`,
      icon: `https://initiald.sega.jp/inidac/ranking-images/online/${RUBY_ID}.png`,
      list
    });
  }

  // ★ PRIDE帯
  PRIDE_LEVELS.forEach(level => {
    const list = filteredData.filter(p =>
      p.pridePoint >= level.min && p.pridePoint <= level.max
    );

    summaryRows.push({
      type: "pride",
      key: `P_${level.level}`,
      label: level.level,
      icon: `https://initiald.sega.jp/inidac/ranking-images/pride/${level.icon}.png`,
      list
    });
  });
}

/* ---------------------------------------------------------
   サマリ表示
--------------------------------------------------------- */
function renderSummary() {
  const area = document.getElementById("summaryArea");

  const rows = summaryRows.map(r => {
    const cnt = r.list.length;
    const points = r.list.map(p => Number(p.point ?? 0));

    const avg = cnt ? Math.round(points.reduce((a,b)=>a+b,0) / cnt) : 0;
    const min = cnt ? Math.min(...points) : 0;
    const max = cnt ? Math.max(...points) : 0;

    return `
      <tr class="clickable" data-key="${r.key}">
        <td class="center"><img src="${r.icon}" width="32"></td>
        <td class="left">${r.label}</td>
        <td class="right">${fmt(cnt)}</td>
        <td class="right">${fmt(avg)}</td>
        <td class="right">${fmt(min)}</td>
        <td class="right">${fmt(max)}</td>
      </tr>
    `;
  }).join("");

  area.innerHTML = `
    <div style="overflow-x:auto;">
    <table>
      <tr>
        <th>アイコン</th>
        <th>☆・Lv</th>
        <th>人数</th>
        <th>平均RP</th>
        <th>最小RP</th>
        <th>最大RP</th>
      </tr>
      ${rows}
    </table>
    </div>
  `;

  document.querySelectorAll("#summaryArea .clickable").forEach(tr => {
    tr.addEventListener("click", () => showDetail(tr.dataset.key));
  });
}

/* ---------------------------------------------------------
   詳細表示
--------------------------------------------------------- */
function showDetail(key) {
  const row = summaryRows.find(r => r.key === key);
  detailList = row.list;

  const area = document.getElementById("detailArea");

  const rows = detailList.map(p => `
    <tr>
      <td class="right">${fmt(p.rank)}</td>
      <td class="left">${p.name}</td>
      <td class="right">${fmt(p.point)}</td>
      <td class="left">${p.shopname}</td>
      <td class="left">${p.updateDate}</td>
    </tr>
  `).join("");

  area.innerHTML = `
    <div style="overflow-x:auto;">
    <table>
      <tr>
        <th>順位</th>
        <th>名前</th>
        <th>RP</th>
        <th>店舗</th>
        <th>更新日時</th>
      </tr>
      ${rows}
    </table>
    </div>
  `;

  document.getElementById("summaryView").style.display = "none";
  document.getElementById("detailView").style.display = "block";
}

/* ---------------------------------------------------------
   CSV出力（サマリ）
--------------------------------------------------------- */
function exportSummaryCSV() {
  const header = "帯,人数,平均RP,最小RP,最大RP";

  const body = summaryRows.map(r => {
    const cnt = r.list.length;
    const points = r.list.map(p => Number(p.point ?? 0));
    const avg = cnt ? Math.round(points.reduce((a,b)=>a+b,0) / cnt) : 0;
    const min = cnt ? Math.min(...points) : 0;
    const max = cnt ? Math.max(...points) : 0;

    return `${r.label},${cnt},${avg},${min},${max}`;
  }).join("\n");

  const csv = "\ufeff" + header + "\n" + body;

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "summary.csv";
  a.click();

  URL.revokeObjectURL(url);
}

/* ---------------------------------------------------------
   CSV出力（全データ）
--------------------------------------------------------- */
function exportAllCSV() {
  const columns = [
    "rank","name","shopname","updateDate","point",
    "mytitleId","prideId","pridePoint","onlineBattleRankId","starCnt"
  ];

  const header = columns.join(",");

  const body = allData
    .map(p =>
      columns
        .map(col => `"${String(p[col] ?? "").replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n");

  const csv = "\ufeff" + header + "\n" + body;

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "all_records.csv";
  a.click();

  URL.revokeObjectURL(url);
}

/* ---------------------------------------------------------
   初期化
--------------------------------------------------------- */
async function init() {
  log("=== Viewer 初期化開始 ===");

  await loadLatest();
  await loadRoundData();

  applyFilters();
  buildSummary();
  renderSummary();

  log("=== Viewer 初期化完了 ===");
}

/* ---------------------------------------------------------
   イベント
--------------------------------------------------------- */
document.getElementById("reloadBtn").onclick = init;
document.getElementById("filterBtn").onclick = () => {
  applyFilters();
  buildSummary();
  renderSummary();
};
document.getElementById("summaryCsvBtn").onclick = exportSummaryCSV;
document.getElementById("allCsvBtn").onclick = exportAllCSV;
document.getElementById("backBtn").onclick = () => {
  document.getElementById("detailView").style.display = "none";
  document.getElementById("summaryView").style.display = "block";
};

/* ---------------------------------------------------------
   Ruby星数フィルタ生成
--------------------------------------------------------- */
window.onload = () => {
  const rubyBox = document.getElementById("rubyFilters");
  rubyBox.innerHTML = [...Array(8).keys()]
    .map(i => `<label><input type="checkbox" class="ruby-filter" value="${i+1}" checked> ☆${i+1}</label>`)
    .join(" ");
};

/* ---------------------------------------------------------
   実行
--------------------------------------------------------- */
init();
