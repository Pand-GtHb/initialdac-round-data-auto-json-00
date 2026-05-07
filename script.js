/* ---------------------------------------------------------
   Initial DAC Round Data Viewer（auto-json-00 対応）
   - latest.json → 最新ラウンド取得
   - roundXX.json → 統合JSON読み込み（配列 or {records:[]} 両対応）
   - 星数 + PRIDE帯 を同列で扱うサマリ
   - クリックで詳細表示
--------------------------------------------------------- */

/* ★ 定義（rd72fix から継承） */
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
let allData = [];     // roundXX.json の全プレイヤー
let summaryRows = []; // サマリ行データ
let detailList = [];  // 詳細表示用
let latestRound = null;

/* ---------------------------------------------------------
   デバッグログ
--------------------------------------------------------- */
function log(msg) {
  const box = document.getElementById("logBox");
  box.textContent += msg + "\n";
  box.scrollTop = box.scrollHeight;
}

/* ---------------------------------------------------------
   latest.json を取得
--------------------------------------------------------- */
async function loadLatest() {
  log("latest.json を取得中…");

  const res = await fetch("latest.json", { cache: "no-store" });
  const json = await res.json();

  latestRound = json.latestRound;
  document.getElementById("latestRound").textContent = latestRound;
  document.getElementById("jsonUpdateTime").textContent = json.updateDate;

  log("latest.json 読み込み完了");
}

/* ---------------------------------------------------------
   roundXX.json を取得（配列 or {records:[]} 両対応）
--------------------------------------------------------- */
async function loadRoundData() {
  const url = `round${latestRound}.json?t=${Date.now()}`;
  log(`round${latestRound}.json を取得中…`);

  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();

  // ★ 配列 or {records:[]} の両対応
  allData = Array.isArray(json) ? json : json.records;

  log(`round${latestRound}.json 読み込み完了（${allData.length}件）`);
}

/* ---------------------------------------------------------
   サマリ生成（星数 + PRIDE帯）
--------------------------------------------------------- */
function buildSummary() {
  summaryRows = [];

  /* ★ ランク帯（星数） */
  for (let star = 1; star <= 8; star++) {
    const list = allData.filter(p =>
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

  /* ★ PRIDE帯 */
  PRIDE_LEVELS.forEach(level => {
    const list = allData.filter(p =>
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
        <td><img src="${r.icon}" width="32"></td>
        <td>${r.label}</td>
        <td>${cnt}</td>
        <td>${avg}</td>
        <td>${min}</td>
        <td>${max}</td>
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

  /* クリックイベント */
  document.querySelectorAll("#summaryArea .clickable").forEach(tr => {
    tr.addEventListener("click", () => {
      const key = tr.dataset.key;
      showDetail(key);
    });
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
      <td>${p.rank}</td>
      <td>${p.name}</td>
      <td>${p.point}</td>
      <td>${p.shopname}</td>
      <td>${p.updateDate}</td>
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
   CSV出力（rd72fix のロジックを継承）
--------------------------------------------------------- */
function exportCSV() {
  if (!detailList.length) {
    alert("詳細データがありません");
    return;
  }

  const columns = [
    "rank","name","shopname","updateDate","point",
    "mytitleId","prideId","pridePoint","onlineBattleRankId","starCnt"
  ];

  const header = columns.join(",");

  const body = detailList
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
  a.download = "detail_records.csv";
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

  buildSummary();
  renderSummary();

  log("=== 初期化完了 ===");
}

/* ---------------------------------------------------------
   イベント
--------------------------------------------------------- */
document.getElementById("reloadBtn").onclick = init;
document.getElementById("backBtn").onclick = () => {
  document.getElementById("detailView").style.display = "none";
  document.getElementById("summaryView").style.display = "block";
};
document.getElementById("csvBtn").onclick = exportCSV;

/* ---------------------------------------------------------
   実行
--------------------------------------------------------- */
init();
