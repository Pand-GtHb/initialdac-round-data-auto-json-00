/* ---------------------------------------------------------
   Initial DAC Round Data Viewer（auto-json-00 対応・最適化版）
--------------------------------------------------------- */

const BASE_URL = "https://pand-gthb.github.io/initialdac-round-data-auto-json-00";

const RUBY_ID =
  "dcb98f86f149cf71d3707a1592072e7838f0811140c24238820dff2b82602a85";

const PRIDE_LEVELS = [
  { level: "A=～99",    min: 1,     max: 99,    icon: "ef788ee816773c454495ebf83e5ac380" },
  { level: "B=100～",   min: 100,   max: 499,   icon: "3c8cc917bb7a97d46ba35c93d898491c" },
  { level: "C=500～",   min: 500,   max: 999,   icon: "ec8f805c9de95c65c858d2e1341f76ab" },
  { level: "D=1000～",  min: 1000,  max: 4999,  icon: "58446a29e6c496139963728eea887349" },
  { level: "E=5000～",  min: 5000,  max: 9999,  icon: "5f88cb6a33355e7bc890d92576e36c94" },
  { level: "F=10000～", min: 10000, max: 49999, icon: "807b2b796691b862d667448a3918edd7" },
  { level: "G=50000～", min: 50000, max: Infinity, icon: "dfff542ae4eee8e95ea61a665dd8ce8e" }
];

/* ---------------------------------------------------------
   状態管理
--------------------------------------------------------- */
const State = {
  all: [],
  filtered: [],
  summary: [],
  detail: [],
  latestRound: null,
  generatedAt: ""
};

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
function log(msg) { appendLog(msg, "normal"); }
function logError(msg) { appendLog(msg, "error"); }

/* ---------------------------------------------------------
   ユーティリティ
--------------------------------------------------------- */
function fmt(n) {
  return Number(n).toLocaleString();
}

function parseDateJST(str) {
  // 内部処理用：比較・フィルタ専用
  return new Date(str.replace(/-/g, "/"));
}

function formatYMDHM(date) {
  const y = date.getFullYear();
  const m = ("0" + (date.getMonth() + 1)).slice(-2);
  const d = ("0" + date.getDate()).slice(-2);
  const hh = ("0" + date.getHours()).slice(-2);
  const mm = ("0" + date.getMinutes()).slice(-2);
  return `${y}/${m}/${d} ${hh}:${mm}`;
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
  let html = "";

  for (let i = 1; i <= 8; i++) {
    html += `
      <label style="margin-right:10px;">
        <input type="checkbox" class="ruby-filter" value="${i}" checked>
        ☆${i}
      </label>
    `;
  }

  area.innerHTML = html;
}

/* ---------------------------------------------------------
   latest.json
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
   roundXX.json
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

    // 表示用：終了時刻を hh:mm に統一
    if (State.generatedAt) {
      const d = parseDateJST(State.generatedAt);
      document.getElementById("jsonUpdateTime").textContent = formatYMDHM(d);
    }

    // records 前提だが、配列そのものにも一応対応
    State.all = Array.isArray(json) ? json : (json.records || []);

    log(`round${State.latestRound}.json 読み込み完了 (${State.all.length}件)`);
  } catch (e) {
    logError("roundXX.json の取得に失敗：" + e.message);
  }
}

/* ---------------------------------------------------------
   フィルタ（表示開始＝generatedAt − フィルタ時間）
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

  const d = new Date(filterStartMs);
  document.getElementById("filterStartTime").textContent = formatYMDHM(d);

  State.filtered = State.all.filter(p => {
    if (!p.updateDate) return false;
    const t = parseDateJST(p.updateDate).getTime();
    return t >= filterStartMs;
  });
}

/* ---------------------------------------------------------
   サマリ生成（延べ人数基準）
--------------------------------------------------------- */
function buildSummary() {
  State.summary = [];

  const selectedStars = [...document.querySelectorAll(".ruby-filter:checked")]
    .map(x => Number(x.value));

  /* ---------------- Ruby帯 ---------------- */
  for (let star of selectedStars) {
    const list = State.filtered.filter(p =>
      p.onlineBattleRankId === RUBY_ID && p.starCnt === star
    );

    State.summary.push({
      key: `R${star}`,
      label: `☆${star}`,
      icon: `https://initiald.sega.jp/inidac/ranking-images/online/${RUBY_ID}.png`,
      list
    });
  }

  /* ---------------- PRIDE帯 ---------------- */
  PRIDE_LEVELS.forEach(level => {
    const list = State.filtered.filter(p =>
      p.pridePoint >= level.min && p.pridePoint <= level.max
    );

    const prideIcon =
      `https://initiald.sega.jp/inidac/ranking-images/pride/${level.icon}.png`;

    State.summary.push({
      key: `P_${level.level}`,
      label: `${level.min}～${level.max === Infinity ? "∞" : level.max}`,
      icon: prideIcon,
      list
    });
  });
}

/* ---------------------------------------------------------
   サマリ用統計計算
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
   サマリ表示
--------------------------------------------------------- */
function renderSummary() {
  const area = document.getElementById("summaryArea");

  const total = State.summary.reduce((sum, r) => sum + r.list.length, 0);

  document.getElementById("summaryTitle").textContent =
    `稼働プレイヤー（合計：${fmt(total)}人）`;

  const rows = State.summary.map(r => {
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

  document.getElementById("summaryView").style.display = "block";
  document.getElementById("detailView").style.display = "none";
}

/* ---------------------------------------------------------
   詳細表示
--------------------------------------------------------- */
function showDetail(key) {
  const row = State.summary.find(r => r.key === key);
  if (!row) return;

  State.detail = row.list.slice();

  const isRubyBand = key.startsWith("R");
  const bandLabel = row.label;

  let bandIcon = "";
  if (isRubyBand) {
    bandIcon = `https://initiald.sega.jp/inidac/ranking-images/online/${RUBY_ID}.png`;
  } else {
    const levelInfo = PRIDE_LEVELS.find(
      l => `${l.min}～${l.max === Infinity ? "∞" : l.max}` === bandLabel
    );
    if (levelInfo) {
      bandIcon =
        `https://initiald.sega.jp/inidac/ranking-images/pride/${levelInfo.icon}.png`;
    }
  }

  State.detail.sort((a, b) => {
    const ta = parseDateJST(a.updateDate).getTime();
    const tb = parseDateJST(b.updateDate).getTime();
    return tb - ta;
  });

  const area = document.getElementById("detailArea");

  const rows = State.detail.map(p => {
    const titleUrl = p.mytitleId
      ? `https://initiald.sega.jp/inidac/ranking-images/title/${p.mytitleId}.png`
      : "";

    const starOrLevel = isRubyBand
      ? (p.onlineBattleRankId === RUBY_ID && p.starCnt ? `☆${p.starCnt}` : "")
      : p.pridePoint;

    return `
      <tr>
        <td class="center">${bandIcon ? `<img src="${bandIcon}" width="32">` : ""}</td>
        <td class="left">${starOrLevel}</td>
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
   共通 CSV ダウンロード
--------------------------------------------------------- */
function downloadCSV(filename, header, body) {
  const csv = "\ufeff" + header + "\n" + body;
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
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

  buildRubyFilters();

  await loadLatest();
  await loadRoundData();

  applyFilters();
  buildSummary();
  renderSummary();

  log("Viewer 初期化完了");
}

/* ---------------------------------------------------------
   DOMContentLoaded 後にイベント登録＆初回 init 実行
--------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
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

  init();
});
