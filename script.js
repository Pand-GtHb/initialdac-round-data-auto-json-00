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

  // ★ latest_update.json の生文字列
  latestUpdateAt: "",

  searchText: "",
  currentView: "summary",
  currentIsRubyBand: true,

  // ★ 新規追加：マッチング候補一覧
  matchingList: []
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
   normalize
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
   店舗名省略
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
   ★ Ruby星 → ★★★★★ 表示変換（4文字×2行）
--------------------------------------------------------- */
function renderStars(starCount) {
  if (!starCount || starCount < 1) return "";

  const stars = "★".repeat(starCount);

  return stars.length > 4
    ? stars.slice(0, 4) + "<br>" + stars.slice(4)
    : stars;
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
   ★ 新規追加：5n±1分ロジック（マッチング候補判定）
--------------------------------------------------------- */
function isMatchingCandidateByUpdateDate(updateDateStr) {
  if (!updateDateStr) return false;

  const now = new Date();
  const last = new Date(updateDateStr.replace(/-/g, "/"));
  const diffMin = Math.abs(Math.floor((now - last) / 60000));

  const nearest = Math.round(diffMin / 5) * 5;
  return Math.abs(diffMin - nearest) <= 1;
}

/* ---------------------------------------------------------
   ★ 新規追加：プレイヤーのランクキー取得（R1〜R8 / P_A〜P_G）
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
   integrated_data.json 読み込み
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

    State.all = records.map(p => ({
      ...p,
      normalizedName: normalize(p.name)
    }));

    State.filtered = [...State.all];

    /* ★ 修正ポイント：generatedAt をログに追加 */
    const genTime = State.generatedAt
      ? formatYMDHM(parseDateJST(State.generatedAt))
      : "-";

    log(`integrated_data.json 読み込み完了 (${State.all.length}件：${genTime})`);

    /* ★ 最新データ取得後は通常色へ戻す（標準グレー） */
    const btn = document.getElementById("reloadBtn");
    if (btn) {
      btn.classList.remove("update-alert");
      btn.style.cssText = ""; // 標準ボタンに戻す
    }

  } catch (e) {
    logError("integrated_data.json の取得に失敗：" + e.message);
  }
}

/* ---------------------------------------------------------
   フィルタ（時間フィルタ）
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
   サマリ生成
--------------------------------------------------------- */
function buildSummary() {
  State.summary = [];

  const selectedStars = [...document.querySelectorAll(".ruby-filter:checked")]
    .map(x => Number(x.value));

  const base = State.filtered.length ? State.filtered : State.all;

  State.summary = RANKS
    .filter(rank => rank.type === "pride" || selectedStars.includes(rank.star))
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
   サマリ検索フィルタ
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
   サマリ表示（★割合追加済み）
--------------------------------------------------------- */
function renderSummary() {
  const area = document.getElementById("summaryArea");

  const filteredSummary = filterSummaryBySearch();

  const total = filteredSummary.reduce((sum, r) => sum + r.list.length, 0);
  const rubyTotal = filteredSummary
    .filter(r => r.key.startsWith("R"))
    .reduce((s, r) => s + r.list.length, 0);
  const prideTotal = total - rubyTotal;

  /* ★ 追加：割合計算 */
  const rankPercent = total ? Math.round((rubyTotal / total) * 100) : 0;
  const pridePercent = total ? Math.round((prideTotal / total) * 100) : 0;

  area.innerHTML = `
    <h3>
      合計 ${fmt(total)}人：
      ランク帯 ${fmt(rubyTotal)}人＝${rankPercent}% ＋
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

  /* ★ 新規追加：matchingView を必ず非表示にする */
  const mv = document.getElementById("matchingView");
  if (mv) mv.style.display = "none";
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

    /* ★ matchingView を非表示 */
    const mv = document.getElementById("matchingView");
    if (mv) mv.style.display = "none";

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

  /* ★ matchingView を非表示 */
  const mv = document.getElementById("matchingView");
  if (mv) mv.style.display = "none";
}

/* ---------------------------------------------------------
   ★ 新規追加：マッチング候補一覧生成
--------------------------------------------------------- */
function buildMatchingCandidates() {
  const base = State.filtered.length ? State.filtered : State.all;

  const list = [];

  base.forEach(p => {
    if (!p.updateDate) return;

    if (!isMatchingCandidateByUpdateDate(p.updateDate)) return;

    const rankKey = getPlayerRankKey(p);
    if (!rankKey) return;

    list.push({
      ...p,
      __rankKey: rankKey
    });
  });

  /* ランク順 → 更新日時降順 */
  list.sort((a, b) => {
    const ra = getRankInfo(a.__rankKey);
    const rb = getRankInfo(b.__rankKey);
    const oa = ra ? ra.order : 999;
    const ob = rb ? rb.order : 999;

    if (oa !== ob) return oa - ob;

    const da = parseDateJST(a.updateDate);
    const db = parseDateJST(b.updateDate);
    return db - da;
  });

  State.matchingList = list;
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
   詳細行描画（★クリックコピー改善の唯一の変更箇所）
--------------------------------------------------------- */
function renderDetailRows(list, isRubyBand) {
  const tbody = document.getElementById("detailTableBody");
  if (!tbody) return;

  const rows = list.map(p => {
    const titleUrl = p.mytitleId
      ? `https://initiald.sega.jp/inidac/ranking-images/title/${p.mytitleId}.png`
      : "";

    /* ★ 星 or PRIDE 表示（前回の修正済み） */
    const starOrLevel = isRubyBand
      ? (p.onlineBattleRankId === RUBY_ID && p.starCnt ? renderStars(p.starCnt) : "")
      : p.pridePoint;

    const fullShop = p.shopname ?? "";
    const shortShop = shortenStoreName(fullShop);

    /* ★ ここが今回のクリックコピー改善の変更点 */
    const copyValue = isRubyBand
      ? `★${"★".repeat(p.starCnt - 1)}\t${p.name}`
      : `${p.pridePoint}\t${p.name}`;

    return `
      <tr data-updated="${p.updateDate}">

        <!-- ★/PRIDE セル：クリックで「★×n + タブ + 名前」 or 「PRIDE + タブ + 名前」 -->
        <td class="center clickable"
            onclick="copyToClipboard('${copyValue}')">
          ${starOrLevel}
        </td>

        <!-- 名前セル：名前単独コピー（現状維持） -->
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

  /* ---------------------------------------------------------
     ★ 5分刻みマッチング可能性 → 行を淡いピンクに（5n±1分ロジックに変更）
  --------------------------------------------------------- */
  const now = new Date();

  tbody.querySelectorAll("tr").forEach(tr => {
    const updated = tr.dataset.updated;
    if (!updated) return;

    const last = new Date(updated.replace(/-/g, "/"));
    const diffMin = Math.abs(Math.floor((now - last) / 60000));

    /* ★ 5n±1分ロジック（最適な±1分判定） */
    const nearest = Math.round(diffMin / 5) * 5;
    if (Math.abs(diffMin - nearest) <= 1) {
      tr.classList.add("match-row-pink");
    }
  });
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
   ★ latest_update.json の更新監視（監視ログなし）
--------------------------------------------------------- */
async function checkUpdate() {
  try {
    const json = await fetchJSON("latest_update.json");

    const raw = json.lastUpdated ?? json.generatedAt ?? "";
    if (!raw) return;

    if (!State.latestUpdateAt) {
      State.latestUpdateAt = raw;
      return;
    }

    if (raw !== State.latestUpdateAt) {
      State.latestUpdateAt = raw;

      const btn = document.getElementById("reloadBtn");
      if (btn) {
        btn.classList.add("update-alert");
      }

      logWarn("データ更新を検知しました（latest_update.json）");
    }

  } catch (e) {
    logError("latest_update.json の監視に失敗：" + e.message);
  }
}

/* ---------------------------------------------------------
   ★ 新規追加：マッチング候補ヘッダ表示
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
   ★ 新規追加：マッチング候補テーブル
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
   ★ 新規追加：マッチング候補行描画
--------------------------------------------------------- */
function renderMatchingRows(list) {
  const tbody = document.getElementById("matchingTableBody");
  if (!tbody) return;

  const rows = list.map(p => {
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
  }).join("");

  tbody.innerHTML = rows;

  /* ★ ピンク色付け（5n±1分ロジック） */
  tbody.querySelectorAll("tr").forEach(tr => {
    const updated = tr.dataset.updated;
    if (!updated) return;
    if (isMatchingCandidateByUpdateDate(updated)) {
      tr.classList.add("match-row-pink");
    }
  });
}

/* ---------------------------------------------------------
   ★ 新規追加：マッチング候補画面表示
--------------------------------------------------------- */
function showMatchingCandidates() {
  buildMatchingCandidates();

  if (!State.matchingList.length) {
    logWarn("マッチング候補となるプレイヤーがいません（5n±1分条件）");
  }

  renderMatchingHeader();
  renderMatchingTable();

  const summaryView = document.getElementById("summaryView");
  const detailView  = document.getElementById("detailView");
  const matchingView = document.getElementById("matchingView");

  if (summaryView) summaryView.style.display = "none";
  if (detailView)  detailView.style.display  = "none";
  if (matchingView) matchingView.style.display = "block";

  State.currentView = "matching";
}

/* ---------------------------------------------------------
   ★ 新規追加：マッチング候補 → サマリに戻る
--------------------------------------------------------- */
function backToSummaryFromMatching() {
  const matchingView = document.getElementById("matchingView");
  const summaryView  = document.getElementById("summaryView");
  const detailView   = document.getElementById("detailView");

  if (matchingView) matchingView.style.display = "none";
  if (detailView)   detailView.style.display  = "none";
  if (summaryView)  summaryView.style.display = "block";

  State.currentView = "summary";
}

/* ---------------------------------------------------------
   ★ 新規追加：マッチング候補検索フィルタ
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

  setInterval(checkUpdate, 60000);
  checkUpdate();
}

/* ---------------------------------------------------------
   DOMContentLoaded
--------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {

  const reloadBtn = document.getElementById("reloadBtn");
  if (reloadBtn) {
    reloadBtn.classList.remove("update-alert");
    reloadBtn.style.cssText = "";
  }

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
    } else if (State.currentView === "detail") {
      applyPlayerFilter(State.searchText, State.currentIsRubyBand);
    } else if (State.currentView === "matching") {
      applyMatchingFilter(State.searchText);
    }
  });

  document.getElementById("backBtn").onclick = () => {
    State.searchText = "";
    searchInput.value = "";
    renderSummary();
  };

  /* ★ 新規追加：マッチング候補ボタン */
  const matchingBtn = document.getElementById("matchingBtn");
  if (matchingBtn) {
    matchingBtn.onclick = () => {
      State.searchText = "";
      searchInput.value = "";
      showMatchingCandidates();
    };
  }

  /* ★ 新規追加：マッチング候補 → サマリ戻る */
  const matchingBackBtn = document.getElementById("matchingBackBtn");
  if (matchingBackBtn) {
    matchingBackBtn.onclick = () => {
      State.searchText = "";
      searchInput.value = "";
      backToSummaryFromMatching();
    };
  }

  init();
});
