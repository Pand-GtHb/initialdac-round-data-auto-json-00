/* ---------------------------------------------------------
   ★ latest_update.json の更新監視（完全修正版）
--------------------------------------------------------- */
async function checkUpdate() {
  try {
    const json = await fetchJSON("latest_update.json");

    // ★ lastUpdated → generatedAt の順で参照
    const raw = json.lastUpdated ?? json.generatedAt ?? "";
    if (!raw) return;

    // ★ 表示用にフォーマット
    const disp = formatYMDHM(parseDateJST(raw));

    // ★ 監視ログ（希望フォーマット）
    log(`更新監視中（latest_update：${disp}）`);
    appendLog("■■□□□□□□□□□□□□", "warn");

    // ★ 初回は保存だけ
    if (!State.latestUpdateRaw) {
      State.latestUpdateRaw = raw;
      return;
    }

    // ★ 生の文字列で比較（フォーマット差異による不一致を防ぐ）
    if (raw !== State.latestUpdateRaw) {
      State.latestUpdateRaw = raw;

      const btn = document.getElementById("reloadBtn");
      if (btn) btn.classList.add("updated");

      logWarn("データ更新を検知しました（latest_update.json）");
    }

  } catch (e) {
    logError("latest_update.json の監視に失敗：" + e.message);
  }
}

/* ---------------------------------------------------------
   初期化（★ 監視開始はここで行う）
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

  /* ---------------------------------------------------------
     ★ 初期化完了時刻で監視開始
  --------------------------------------------------------- */
  log("更新監視を開始しました（2分ごとにチェック）");

  // ★ 初回チェック（即時）
  checkUpdate();

  // ★ 2分ごとに監視
  setInterval(checkUpdate, 120000);
}

/* ---------------------------------------------------------
   DOMContentLoaded（イベント登録）
--------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {

  /* ---------------------------------------------------------
     ★ reloadBtn の初期色を filterBtn と完全一致させる
  --------------------------------------------------------- */
  const reloadBtn = document.getElementById("reloadBtn");
  const filterBtn = document.getElementById("filterBtn");

  if (reloadBtn && filterBtn) {
    // classList を完全コピー
    reloadBtn.className = filterBtn.className;

    // inline style を完全クリア
    reloadBtn.style.cssText = "";

    // updated クラスも念のため削除
    reloadBtn.classList.remove("updated");
  }

  /* ---------------------------------------------------------
     ★ 最新データ取得（init は再実行しない）
  --------------------------------------------------------- */
  reloadBtn.onclick = async () => {
    startProgress();
    await loadRoundData();
    applyFilters();
    buildSummary();
    renderSummary();
    stopProgress();
  };

  filterBtn.onclick = () => {
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

  /* ---------------------------------------------------------
     ★ Viewer 初期化
  --------------------------------------------------------- */
  init();
});
