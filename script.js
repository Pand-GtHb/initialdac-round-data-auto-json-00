/* ---------------------------------------------------------
   ★ マッチング候補ヘッダ表示
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
   ★ マッチング候補テーブル
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
   ★ マッチング候補行描画
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

  tbody.querySelectorAll("tr").forEach(tr => {
    const updated = tr.dataset.updated;
    if (!updated) return;
    if (isMatchingCandidateByUpdateDate(updated)) {
      tr.classList.add("match-row-pink");
    }
  });
}

/* ---------------------------------------------------------
   ★ マッチング候補検索フィルタ
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
   ★ マッチング候補画面表示
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
   ★ マッチング候補 → サマリに戻る
--------------------------------------------------------- */
function backToSummaryFromMatching() {
  State.currentView = "summary";
  renderSummary();
}

/* ---------------------------------------------------------
   latest_update.json 監視（更新検知）
--------------------------------------------------------- */
async function checkUpdate() {
  try {
    const res = await fetch(`${BASE_URL}/latest_update.json?t=${Date.now()}`, {
      cache: "no-store"
    });
    if (!res.ok) throw new Error("HTTP " + res.status);

    const json = await res.json();
    const latest = json.latestUpdateAt || "";

    if (!latest) return;

    if (State.latestUpdateAt && State.latestUpdateAt !== latest) {
      const btn = document.getElementById("reloadBtn");
      if (btn) {
        btn.classList.add("update-alert");
        btn.style.cssText = "background:#ff4081;color:#fff;font-weight:bold;";
      }
      logWarn("新しいデータが公開されています。[最新データ更新] ボタンで再取得してください。");
    }

    State.latestUpdateAt = latest;
  } catch (e) {
    logError("latest_update.json の取得に失敗：" + e.message);
  }
}

/* ---------------------------------------------------------
   初期化
--------------------------------------------------------- */
async function init() {
  log("Viewer 初期化中");

  startProgress();

  // ★ RUBY / PRIDE フィルタ自動生成（gridレイアウト対応）
  buildRubyFilters();
  buildPrideFilters();

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
      renderDetailTable(State.currentIsRubyBand, "", "");
    } else if (State.currentView === "matching") {
      applyMatchingFilter(State.searchText);
    }
  });

  document.getElementById("backBtn").onclick = () => {
    State.searchText = "";
    searchInput.value = "";
    renderSummary();
  };

  const matchingBtn = document.getElementById("matchingBtn");
  if (matchingBtn) {
    matchingBtn.onclick = () => {
      State.searchText = "";
      searchInput.value = "";
      showMatchingCandidates();
    };
  }

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
