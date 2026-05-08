/* ---------------------------------------------------------
   Initial DAC Round Data Viewer（auto-json-00 対応）
--------------------------------------------------------- */

const BASE_URL = "https://pand-gthb.github.io/initialdac-round-data-auto-json-00";

const RUBY_ID =
  "dcb98f86f149cf71d3707a1592072e7838f0811140c24238820dff2b82602a85";

const PRIDE_LEVELS = [
  { level: "A=～99", min: 1, max: 99 },
  { level: "B=100～", min: 100, max: 499 },
  { level: "C=500～", min: 500, max: 999 },
  { level: "D=1000～", min: 1000, max: 4999 },
  { level: "E=5000～", min: 5000, max: 9999 },
  { level: "F=10000～", min: 10000, max: 49999 },
  { level: "G=50000～", min: 50000, max: Infinity }
];

let allData = [];
let filteredData = [];
let summaryRows = [];
let detailList = [];
let latestRound = null;
let generatedAt = "";

/* ---------------------------------------------------------
   ログ
--------------------------------------------------------- */
function appendLog(msg, type = "normal") {
  const box = document.getElementById("logBox");
  const line = document.createElement("div");
  line.textContent = msg;
  line.style.color = type === "error" ? "#ff5555" : "#00ff00";
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}
function log(msg) { appendLog(msg, "normal"); }
function logError(msg) { appendLog(msg, "error"); }

/* ---------------------------------------------------------
   ユーティリティ
--------------------------------------------------------- */
function fmt(n) { return Number(n).toLocaleString(); }
function parseDateJST(str) { return new Date(str.replace(/-/g, "/")); }

function formatGeneratedAt(str) {
  if (!str) return "-";
  const d = parseDateJST(str);
  const y = d.getFullYear();
  const m = ("0" + (d.getMonth() + 1)).slice(-2);
  const day = ("0" + d.getDate()).slice(-2);
  const hh = ("0" + d.getHours()).slice(-2);
  const mm = ("0" + d.getMinutes()).slice(-2);
  return `${y}/${m}/${day} ${hh}:${mm}`;
}

/* ---------------------------------------------------------
   latest.json
--------------------------------------------------------- */
async function loadLatest() {
  log("latest.json 取得準備中");

  try {
    const res = await fetch(`${BASE_URL}/latest.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);

    const json = await res.json();
    if (!json.latestRound) throw new Error("latestRound が存在しません");

    latestRound = json.latestRound;
    document.getElementById("latestRound").textContent = latestRound;

    log("latest.json 読み込み完了");
  } catch (e) {
    logError("latest.json の取得に失敗：" + e.message);
  }
}

/* ---------------------------------------------------------
   roundXX.json
--------------------------------------------------------- */
async function loadRoundData() {
  log(`round${latestRound}.json 取得準備中`);

  try {
    const res = await fetch(
      `${BASE_URL}/round${latestRound}.json?t=${Date.now()}`,
      { cache: "no-store" }
    );
    if (!res.ok) throw new Error("HTTP " + res.status);

    const json = await res.json();

    generatedAt = json.generatedAt ?? "";
    document.getElementById("jsonUpdateTime").textContent = formatGeneratedAt(generatedAt);

    allData = Array.isArray(json) ? json : json.records;

    log(`round${latestRound}.json 読み込み完了 (${allData.length}件)`);
  } catch (e) {
    logError("roundXX.json の取得に失敗：" + e.message);
  }
}

/* ---------------------------------------------------------
   フィルタ
--------------------------------------------------------- */
function applyFilters() {
  const minutes = Number(document.getElementById("rangeSelect").value);

  if (!generatedAt) {
    logError("generatedAt が未取得のため、時間フィルタをスキップしました");
    filteredData = [...allData];
    return;
  }

  const baseMs = parseDateJST(generatedAt).getTime();
  const filterStartMs = baseMs - minutes * 60 * 1000;

  const d = new Date(filterStartMs);
  const y = d.getFullYear();
  const m = ("0" + (d.getMonth() + 1)).slice(-2);
  const day = ("0" + d.getDate()).slice(-2);
  const hh = ("0" + d.getHours()).slice(-2);
  const mm = ("0" + d.getMinutes()).slice(-2);

  document.getElementById("filterStartTime").textContent =
    `${y}/${m}/${day} ${hh}:${mm}`;

  filteredData = allData.filter(p => {
    if (!p.updateDate) return false;
    const t = parseDateJST(p.updateDate).getTime();
    return t >= filterStartMs;
  });
}

/* ---------------------------------------------------------
   サマリ生成
--------------------------------------------------------- */
function buildSummary() {
  summaryRows = [];

  const selectedStars = [...document.querySelectorAll(".ruby-filter:checked")]
    .map(x => Number(x.value));

  // Ruby帯
  for (let star of selectedStars) {
    const list = filteredData.filter(p =>
      p.onlineBattleRankId === RUBY_ID && p.starCnt === star
    );

    summaryRows.push({
      key: `R${star}`,
      label: `☆${star}`,
      icon: list.length
        ? `https://initiald.sega.jp/inidac/ranking-images/online/${list[0].onlineBattleRankId}.png`
        : "",
      list
    });
  }

  // PRIDE帯
  PRIDE_LEVELS.forEach(level => {
    const list = filteredData.filter(p =>
      p.pridePoint >= level.min && p.pridePoint <= level.max
    );

    summaryRows.push({
      key: `P_${level.level}`,
      label: level.level,
      icon: list.length
        ? `https://initiald.sega.jp/inidac/ranking-images/pride/${list[0].prideId}.png`
        : "",
      list
    });
  });
}

/* ---------------------------------------------------------
   サマリ表示
--------------------------------------------------------- */
function renderSummary() {
  const area = document.getElementById("summaryArea");

  const total = summaryRows.reduce((sum, r) => sum + r.list.length, 0);

  document.getElementById("summaryTitle").textContent =
    `稼働プレイヤー（合計：${fmt(total)}人）`;

  const rows = summaryRows.map(r => {
    const cnt = r.list.length;
    const percent = total ? Math.round((cnt / total) * 100) : 0;

    const points = r.list.map(p => Number(p.point ?? 0));
    const avg = cnt ? Math.round(points.reduce((a,b)=>a+b,0) / cnt) : 0;
    const min = cnt ? Math.min(...points) : 0;
    const max = cnt ? Math.max(...points) : 0;

    return `
      <tr class="clickable" data-key="${r.key}">
        <td class="center">${r.icon ? `<img src="${r.icon}" width="32">` : ""}</td>
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
  }).join("");

  area.innerHTML = `
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
  detailList = row.list.slice();

  detailList.sort((a, b) => {
    const ta = parseDateJST(a.updateDate).getTime();
    const tb = parseDateJST(b.updateDate).getTime();
    return tb - ta;
  });

  const area = document.getElementById("detailArea");

  const rows = detailList.map(p => {
    let rankIcon = "";

    if (p.onlineBattleRankId) {
      rankIcon = `https://initiald.sega.jp/inidac/ranking-images/online/${p.onlineBattleRankId}.png`;
    } else if (p.prideId) {
      rankIcon = `https://initiald.sega.jp/inidac/ranking-images/pride/${p.prideId}.png`;
    }

    const starLabel =
      p.onlineBattleRankId === RUBY_ID && p.starCnt
        ? `☆${p.starCnt}`
        : "";

    const titleUrl = p.mytitleId
      ? `https://initiald.sega.jp/inidac/ranking-images/title/${p.mytitleId}.png`
      : "";

    return `
      <tr>
        <td class="center">${rankIcon ? `<img src="${rankIcon}" width="32">` : ""}</td>
        <td class="left">${starLabel}</td>
        <td class="left">${p.name}</td>
        <td class="center">${titleUrl ? `<img src="${titleUrl}" height="24">` : ""}</td>
        <td class="right">${fmt(p.point)}</td>
        <td class="left">${p.shopname}</td>
        <td class="left">${p.updateDate}</td>
      </tr>
    `;
  }).join("");

  area.innerHTML = `
    <div style="overflow-x:auto;">
    <table>
      <tr>
        <th>ランク</th>
        <th>☆・Lv</th>
        <th>名前</th>
        <th>称号</th>
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
   CSV 出力（サマリ）
--------------------------------------------------------- */
function exportSummaryCSV() {
  const header = "帯,人数,%,平均RP,最小RP,最大RP";

  const total = summaryRows.reduce((sum, r) => sum + r.list.length, 0);

  const body = summaryRows.map(r => {
    const cnt = r.list.length;
    const percent = total ? Math.round((cnt / total) * 100) : 0;

    const points = r.list.map(p => Number(p.point ?? 0));
    const avg = cnt ? Math.round(points.reduce((a,b)=>a+b,0) / cnt) : 0;
    const min = cnt ? Math.min(...points) : 0;
    const max = cnt ? Math.max(...points) : 0;

    return `${r.label},${cnt},${percent},${avg},${min},${max}`;
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
   CSV 出力（全データ）
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
  log("Viewer 初期化中");

  await loadLatest();
  await loadRoundData();

  applyFilters();
  buildSummary();
  renderSummary();

  log("Viewer 初期化完了");
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
