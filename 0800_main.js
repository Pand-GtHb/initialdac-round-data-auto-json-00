(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define(["./0700_app.js", "./0600_ui.js"], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("./0700_app.js"),
      require("./0600_ui.js")
    );
  } else {
    root.ViewerMain = factory(
      root.ViewerApp,
      root.ViewerUI
    );
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (
  ViewerApp,
  ViewerUI
) {
  "use strict";

  const App = ViewerApp || (typeof globalThis !== "undefined" ? globalThis.ViewerApp : {});
  const UI = ViewerUI || (typeof globalThis !== "undefined" ? globalThis.ViewerUI : {});

/* =========================================================
 [15100] Entry Point:DOMContentLoaded【DOM】（旧 [4100]）
========================================================= */
function bootstrap() {
    if (globalThis.__viewerInitialized) return;
    globalThis.__viewerInitialized = true;

    /* =====================================
     * 履歴初期化
     * ===================================== */

    history.replaceState(
      { page: STATE.SUMMARY, summaryMode: "rank" },
      "",
      ""
    );

    history.pushState(
      { page: STATE.SUMMARY, summaryMode: "rank" },
      "",
      ""
    );

    /* =====================================
     * 要素取得
     * ===================================== */

    const reloadBtn =
      document.getElementById(
        "reloadBtn"
      );

    const filterBtn =
      document.getElementById(
        "filterBtn"
      );

    const rangeSelect =
      document.getElementById(
        "rangeSelect"
      );

    const summaryCsvBtn =
      document.getElementById(
        "summaryCsvBtn"
      );

    const allCsvBtn =
      document.getElementById(
        "allCsvBtn"
      );

    const matchingBtn =
      document.getElementById(
        "matchingBtn"
      );

    const matchingBackBtn =
      document.getElementById(
        "matchingBackBtn"
      );

    const searchInput =
      document.getElementById(
        "searchInput"
      );

    if (searchInput && !document.getElementById("unmatchedMemoBtn")) {
      const button = document.createElement("button");
      button.id = "unmatchedMemoBtn";
      button.type = "button";
      button.textContent = "候補外記録";
      button.title = "検索文字を未確定の対戦相手メモとして保存";
      button.onclick = recordUnmatchedSearchMemo;
      searchInput.insertAdjacentElement("afterend", button);
    }

    const analysisLogBtn =
      document.getElementById(
        "analysisLogBtn"
      );

    const undoCopyBtn =
      document.getElementById(
        "undoCopyBtn"
      );

    if (undoCopyBtn) {
      undoCopyBtn.textContent =
        "↩️ UNDO";

      undoCopyBtn.onclick = () => {
        if (typeof undoLastCopiedInfo === "function") {
          undoLastCopiedInfo();
        }
      };
    }

    /* =====================================
     * Analysis Log Export
     * ===================================== */

    if (analysisLogBtn) {

      if (
        typeof exportTodayViewerLogsAsJSON ===
        "function"
      ) {

        analysisLogBtn.onclick =
          exportTodayViewerLogsAsJSON;

      } else {

        analysisLogBtn.disabled =
          true;

      }

    }

    /* =====================================
     * Reload
     * ===================================== */

    if (reloadBtn) {

      reloadBtn.classList.remove(
        "update-alert"
      );

      reloadBtn.style.cssText =
        "";

      reloadBtn.onclick =
        async () => {

          await reloadLatestDataPreferPrefetch();

        };

    }

    /* =====================================
     * Filter
     * ===================================== */

    const applyFilterAndRefreshSummary =
      () => {

        startProgress();

        applyFilters();

        buildSummary();

        renderSummary();

        setCurrentView(
          STATE.SUMMARY
        );

        switchDisplayView(
          STATE.SUMMARY
        );

        stopProgress();

      };

    if (filterBtn) {

      filterBtn.onclick =
        applyFilterAndRefreshSummary;

    }

    if (rangeSelect) {

      rangeSelect.addEventListener(
        "change",
        applyFilterAndRefreshSummary
      );

    }

    /* =====================================
     * CSV Export
     * ===================================== */

    if (summaryCsvBtn) {

      summaryCsvBtn.onclick =
        exportSummaryCSV;

    }

    if (allCsvBtn) {

      allCsvBtn.onclick =
        exportAllCSV;

    }

    /* =====================================
     * Search
     * ===================================== */

    if (searchInput) {

      searchInput.addEventListener(
        "input",
        (e) => {

          State.searchText =
            e.target.value;

          if (
            isCurrentView(
              STATE.SUMMARY
            )
          ) {
            renderSummary();

          } else if (
            isCurrentView(
              STATE.DETAIL
            )
          ) {
            if (State.currentDetailType === "area") {
              const areaNo = Number(State.currentDetailKey);
              if (!Number.isNaN(areaNo)) {
                renderAreaDetailTable(areaNo);
              }
            } else {
              renderDetailTable();
            }

          } else if (
            isCurrentView(
              STATE.MATCHING
            )
          ) {

            applyMatchingFilter(
              State.searchText
            );

          }

        }
      );

    }

    /* =====================================
     * Matching Open
     * ===================================== */

    if (
      matchingBtn &&
      searchInput
    ) {
      matchingBtn.textContent =
        "⚔️ MATCHING";

      const matchingOffsetSelect =
        document.createElement(
          "select"
        );

      matchingOffsetSelect.id =
        "matchingOffsetSelect";

      matchingOffsetSelect.className =
        "matching-offset-select";

      matchingOffsetSelect.setAttribute(
        "aria-label",
        "MATCHINGの予測時刻"
      );

      matchingOffsetSelect.innerHTML = `
        <option value="0">NOW</option>
        <option value="5">5秒後</option>
        <option value="10">10秒後</option>
        <option value="15">15秒後</option>
      `;

      matchingBtn.insertAdjacentElement(
        "afterend",
        matchingOffsetSelect
      );

      const primaryRow =
        matchingBtn.parentElement;

      if (
        primaryRow &&
        reloadBtn?.parentElement === primaryRow &&
        undoCopyBtn?.parentElement === primaryRow
      ) {
        primaryRow.appendChild(reloadBtn);
        primaryRow.appendChild(undoCopyBtn);
        primaryRow.appendChild(matchingBtn);
        primaryRow.appendChild(matchingOffsetSelect);

        primaryRow.classList.add(
          "matching-primary-row"
        );
      }

      matchingOffsetSelect.addEventListener(
        "change",
        e => {
          State.matchingOffsetSec =
            Number(e.target.value) || 0;
        }
      );

      matchingBtn.onclick =
        () => {

          State.searchText = "";

          searchInput.value = "";

          showMatchingCandidates({
            push: true,
            mode: "matching",
            offsetSec:
              State.matchingOffsetSec,
            saveEvent: true
          });

        };

    }

    /* =====================================
     * Matching Back
     * ===================================== */

    ensureReloadViewerTime();

    if (
      matchingBackBtn &&
      searchInput
    ) {

      matchingBackBtn.onclick =
        () => {

          State.searchText = "";

          searchInput.value = "";

          backToSummaryFromMatching(
            true
          );

        };

    }

    /* =====================================
     * My Rank
     * ===================================== */

    const myRankSelect =
      document.getElementById(
        "myRankSelect"
      );

    if (myRankSelect) {

      syncMyRankSelection(
        myRankSelect.value
      );

      myRankSelect.addEventListener(
        "change",
        (e) => {

          const selectedMyRank =
            syncMyRankSelection(
              e.target.value
            );

          log(
            `自分ランク変更：${selectedMyRank}` +
            `（候補生成はMATCHINGボタン押下時に反映されます）`
          );

          /*
           * 自ランク変更時点では候補の
           * 即時再生成は行わない。
           * 候補生成・ログ保存は
           * MATCHINGボタン押下時のみ実行する。
           * 表示は「候補0件」時と同じ見た目にするため、
           * 候補リストを空にして通常描画に任せる。
           */
          if (
            isCurrentView(
              STATE.MATCHING
            )
          ) {

            State.matchingList = [];
            State.matchingFilteredPopulationCount = 0;
            State.matchingCooldownExcludedCandidates = [];

            renderMatchingHeader();
            renderMatchingTable();

          }

        }
      );

    }

    /* =====================================
     * Initialize
     * ===================================== */

    if (typeof App.init === "function") {
      App.init();
    } else if (typeof init === "function") {
      init();
    }
  }


  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", bootstrap);
    } else {
      bootstrap();
    }
  }

  const ViewerMain = {
    init: typeof init === "function" ? init : App.init,
    bootstrap
  };

  if (typeof globalThis !== "undefined") {
    globalThis.ViewerMain = ViewerMain;
  }

  return ViewerMain;
});
