(function (global) {
  "use strict";

  const ViewerUtils = (typeof global !== "undefined" && global.ViewerUtils) || {};
  const ViewerDomain = (typeof global !== "undefined" && global.ViewerDomain) || {};
  const ViewerPersistence = (typeof global !== "undefined" && global.ViewerPersistence) || {};
  const ViewerMatching = (typeof global !== "undefined" && global.ViewerMatching) || {};

  const normalize = ViewerUtils.normalize || (s => String(s ?? "").trim());
  const normalizePlayerName = ViewerUtils.normalizePlayerName || (name => String(name ?? "").trim());
  const fmt = ViewerUtils.fmt || (n => Number(n).toLocaleString());
  const getZenkakuLength = ViewerUtils.getZenkakuLength || (s => (s ? s.length : 0));
  const isMostlyAscii = ViewerUtils.isMostlyAscii || (() => true);
  const clamp = ViewerUtils.clamp || ((v, min, max) => Math.max(min, Math.min(max, v)));

  const RANKS = ViewerDomain.RANKS || [];
  const getRankIndex = ViewerDomain.getRankIndex || (() => 0);
  const getRankInfo = ViewerDomain.getRankInfo || (() => ({}));
  const getPlayerRankKey = ViewerDomain.getPlayerRankKey || (p => p?.__rankKey);
  const mapRankKeyToTierKey = ViewerDomain.mapRankKeyToTierKey || (k => k);
  const buildPlayerIdentityKey = ViewerDomain.buildPlayerIdentityKey || (() => "");
  const getPhaseErrorScaleSec = ViewerDomain.getPhaseErrorScaleSec || (() => 60);
  const getPhaseWindowHalfWidthSec = ViewerDomain.getPhaseWindowHalfWidthSec || (() => 30);
  const calcStats = ViewerDomain.calcStats || (() => ({ count: 0, avg: 0, min: 0, max: 0 }));

  const STATE = {
    SUMMARY: "summary",
    DETAIL: "detail",
    MATCHING: "matching"
  };

  const MAX_LOG_LINES = 100;

  function getState() {
    return typeof global !== "undefined" && global.State ? global.State : null;
  }

/* #################################################################
 [LAYER 10000] View Templates（HTML文字列を返す層）
 ################################################################# */

/* =========================================================
 [10000] Render Utility:renderStars（旧 [2500]）
========================================================= */
function renderStars(starCount) {

  if (
    !starCount ||
    starCount < 1
  ) {
    return "";
  }

  const stars =
    "★".repeat(starCount);

  return stars.length > 4
    ? (
        stars.slice(0, 4) +
        "<br>" +
        stars.slice(4)
      )
    : stars;
}

/* =========================================================
 [10100] Filter UI Template:buildFilterGroupHTML（旧 [5200]）
========================================================= */
function buildFilterGroupHTML(
  items,
  options
) {

  const {
    labelClass,
    inputClass,
    getValue,
    getText
  } = options;

  const itemHtml =
    items
      .map(
        item => `
      <label class="${labelClass}">
        <input
          type="checkbox"
          class="${inputClass}"
          value="${getValue(item)}"
          checked
        >
        ${getText(item)}
      </label>
    `
      )
      .join("");

  return `
    <div class="filter-row">
      <div class="filter-label"></div>
      <div class="filter-items">
        ${itemHtml}
      </div>
    </div>
  `;
}

/* =========================================================
 [10200] Shop Name Display:getTextWidth【DOM】（旧 [2420]）
========================================================= */
function getTextWidth(text, font) {

  const canvas =
    getTextWidth.canvas ||
    (
      getTextWidth.canvas =
      document.createElement(
        "canvas"
      )
    );

  const ctx =
    canvas.getContext("2d");

  ctx.font = font;

  return ctx.measureText(text)
    .width;
}

/* =========================================================
 [10210] Shop Name Display:shortenStoreName【DOM】（旧 [2430]）
========================================================= */
function shortenStoreName(full) {

  if (!full) {
    return "";
  }

  if (!isMostlyAscii(full)) {

    const zLen =
      getZenkakuLength(full);

    if (zLen <= 18) {
      return full;
    }

    const head = 6;
    const tail = 6;

    if (
      full.length <=
      head + tail
    ) {
      return full;
    }

    return (
      full.slice(0, head) +
      "…" +
      full.slice(-tail)
    );
  }

  const font =
    "14px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

  const maxWidth = 220;

  if (
    getTextWidth(full, font) <=
    maxWidth
  ) {
    return full;
  }

  let head = 10;
  let tail = 10;

  while (
    head + tail > 2
  ) {

    const candidate =
      full.slice(0, head) +
      "…" +
      full.slice(-tail);

    if (
      getTextWidth(
        candidate,
        font
      ) <= maxWidth
    ) {
      return candidate;
    }

    if (head >= tail) {
      head--;
    } else {
      tail--;
    }
  }

  return (
    full.slice(0, 1) +
    "…" +
    full.slice(-1)
  );
}

/* =========================================================
 [10300] Phase Cycle Monitor:buildPhaseCycleWindowHTML（旧 [6152]）
========================================================= */
function buildPhaseCycleWindowHTML(
  cycleSec,
  n,
  halfWidthSec,
  filterFromMs,
  filterToMs,
  colorBg,
  borderColor,
  textColor,
  referenceMs,
  phaseOffsetPct,
  phaseWidthPct
) {

  const centerSec =
    cycleSec * n;

  const centerMs =
    referenceMs - centerSec * 1000;

  const windowFromMs =
    centerMs - halfWidthSec * 1000;

  const windowToMs =
    centerMs + halfWidthSec * 1000;

  const clippedFromMs =
    Math.max(
      filterFromMs,
      windowFromMs
    );

  const clippedToMs =
    Math.min(
      filterToMs,
      windowToMs
    );

  const centerIsInFilterRange =
    centerMs >= filterFromMs &&
    centerMs <= filterToMs;

  if (
    clippedFromMs > clippedToMs ||
    (
      clippedFromMs === clippedToMs &&
      !centerIsInFilterRange
    )
  ) {
    return "";
  }

  const rangeMs =
    filterToMs - filterFromMs;

  const leftPct =
    phaseOffsetPct +
    (
      ((filterToMs - clippedToMs) / rangeMs) *
      phaseWidthPct
    );

  const availableWidthPct =
    phaseOffsetPct +
    phaseWidthPct -
    leftPct;

  /*
   * decay により許容幅が 0 になった古い周期も、
   * Filter範囲内の中心時刻は細いマーカーとして残す。
   */
  const widthPct =
    Math.min(
      availableWidthPct,
      Math.max(
        0.5,
        ((clippedToMs - clippedFromMs) / rangeMs) *
          phaseWidthPct
      )
    );

  if (widthPct <= 0) {
    return "";
  }

  /*
   * 表のYellow/Pink判定と同じく現在時刻を起点として
   * n周期前の中心時刻を表示する。
   * 表示範囲だけをFilter From〜Toに合わせ、帯の両端を
   * その範囲内にクリップする。周期計算の基準時刻は変えない。
   *
   * バー内表示は秒単位の厳密性を求めないため
   * 時:分のみ（formatClockHm）。
   * ツールチップ（title）は詳細確認用に秒まで表示する。
   */
  const centerClockShort =
    formatClockHm(
      referenceMs - centerSec * 1000
    );

  const centerClockFull =
    formatClockHms(
      referenceMs - centerSec * 1000
    );

  /*
   * 範囲端に掛かる帯は描画するが、中心時刻がFilter Toより
   * 新しい、またはFilter Fromより古い場合は時刻文字を表示しない。
   */
  const centerLabel =
    centerIsInFilterRange
      ? `
        <span
          style="
            font-size:14px;
            font-weight:bold;
            color:${textColor};
            white-space:nowrap;
          "
        >${centerClockShort}</span>
      `
      : "";

  return `
    <div
      style="
        position:absolute;
        left:${leftPct}%;
        width:${widthPct}%;
        top:0;
        bottom:0;
        background:${colorBg};
        border:1px solid ${borderColor};
        border-radius:3px;
        display:flex;
        align-items:center;
        justify-content:center;
        box-sizing:border-box;
      "
      title="${n}周期前：${centerClockFull} 頃（許容 ±${Math.round(halfWidthSec)}秒）"
    >
      ${centerLabel}
    </div>
  `;
}

/* =========================================================
 [10310] Phase Cycle Monitor:buildPhaseCycleRowHTML【State】（旧 [6153]）
========================================================= */
function buildPhaseCycleRowHTML(mode, nowMs = Date.now()) {

  const isPink =
    mode === "pink";

  const cfg =
    State.scoringConfig
      ?.phase?.[mode] ?? {};

  const errCfg =
    State.scoringConfig
      ?.phaseError ?? {};

  const cycleSec =
    isPink
      ? calcPinkCycle()
      : calcYellowCycle();

  const adjust =
    Number(
      (
        isPink
          ? State.phaseAdjust?.pink
          : State.phaseAdjust?.yellow
      ) ?? 0
    );

  const threshold =
    Number(
      errCfg[
        isPink ? "pinkThreshold" : "yellowThreshold"
      ] ?? (isPink ? 0.55 : 0.7)
    );

  const lambda =
    Number(
      errCfg[
        isPink ? "pinkLambda" : "yellowLambda"
      ] ?? 0.03
    );

  const samples =
    isPink
      ? getPinkSampleCount()
      : (State.yellowSamples?.length ?? 0);

  const minSamples =
    Number(cfg.minSamples ?? 8);

  const trustPct =
    minSamples > 0
      ? Math.min(
          100,
          Math.round((samples / minSamples) * 100)
        )
      : 100;

  const filterToMs =
    getFilterToMs(nowMs);

  const rangeMinutes =
    readRangeMinutes();

  if (
    !isFinite(rangeMinutes) ||
    rangeMinutes <= 0
  ) {
    return "";
  }

  const filterFromMs =
    filterToMs -
    rangeMinutes * 60 * 1000;

  const phaseReferenceMs =
    nowMs;

  const staleSec =
    Math.max(
      0,
      (nowMs - filterToMs) / 1000
    );

  /*
   * 左端＝現在時刻、右方向＝過去。
   * 黒領域は現在時刻からFilterのTo時刻までを示す。
   * Filter To〜From の位相軸は残りの領域に収める。
   */
  const staleMaxSec =
    45 * 60;

  const stalePct =
    Math.min(
      20,
      (staleSec / staleMaxSec) * 20
    );

  const phaseOffsetPct =
    stalePct;

  const phaseWidthPct =
    100 - stalePct;

  const maxCycleIndex =
    Math.max(
      0,
      Math.ceil(
        (phaseReferenceMs - filterFromMs) /
        (cycleSec * 1000)
      ) + 1
    );

  /*
   * 詳細表示・候補表示の行ハイライトと同じ色に統一
   * .match-row-yellow { background-color:#FFFFCC }
   * .match-row-pink   { background-color:#FFE4EC }
   */
  const colorBg =
    isPink
      ? "rgba(255, 228, 236, 0.58)"
      : "rgba(255, 255, 204, 0.58)";

  const borderColor =
    isPink
      ? "rgba(173, 20, 87, 0.52)"
      : "rgba(102, 92, 0, 0.4)";

  const textColor =
    isPink
      ? "#ad1457"
      : "#665c00";

  const windows =
    Array.from(
      { length: maxCycleIndex + 1 },
      (_, n) => n
    )
      .map(n => {

        return buildPhaseCycleWindowHTML(
          cycleSec,
          n,
          getPhaseWindowHalfWidthSec(
            cycleSec,
            n,
            threshold,
            lambda,
            getPhaseErrorScaleSec(mode)
          ),
          filterFromMs,
          filterToMs,
          colorBg,
          borderColor,
          textColor,
          phaseReferenceMs,
          phaseOffsetPct,
          phaseWidthPct
        );
      })
      .join("");

  const label =
    isPink ? "Pink" : "Yellow";

  const labelColor =
    isPink ? "#c2185b" : "#a67c00";

  return `
    <div style="margin-bottom:14px;">

      <div style="font-size:12px; color:#555; margin-bottom:4px;">
        <strong style="color:${labelColor};">${label}</strong>
        ：周期 ${cycleSec.toFixed(1)}秒（基準345秒 ${adjust >= 0 ? "+" : ""}${adjust.toFixed(1)}秒）
        ／信頼度${trustPct}%
        ／許容幅はdecay反映（しきい値${threshold}）
      </div>

      <div
        style="
          position:relative;
          height:26px;
          background:#eee;
          border-radius:4px;
          overflow:hidden;
        "
      >
        <div
          style="
            position:absolute;
            left:0;
            top:0;
            bottom:0;
            width:${stalePct}%;
            background:#111;
            color:#fff;
            display:flex;
            align-items:center;
            justify-content:flex-start;
            padding-left:4px;
            box-sizing:border-box;
            font-size:14px;
            font-weight:bold;
            white-space:nowrap;
            z-index:2;
          "
          title="現在時刻：${formatClockHms(nowMs)} ／ FilterのTo：${formatClockHms(filterToMs)}"
        >
          ${formatClockHm(nowMs)}
        </div>
        <div
          style="
            position:absolute;
            left:0;
            top:-2px;
            bottom:-2px;
            width:2px;
            background:#333;
            z-index:3;
          "
          title="現在時刻 ${formatClockHms(nowMs)}"
        ></div>
        ${windows}
      </div>
      <div
        style="
          display:flex;
          justify-content:space-between;
          margin-top:2px;
          font-size:11px;
          color:#555;
          padding-left:${stalePct}%;
          box-sizing:border-box;
        "
      >
        <span title="Filter To：${formatClockHms(filterToMs)}">
          To ${formatClockHm(filterToMs)}
        </span>
        <span title="Filter From：${formatClockHms(filterFromMs)}">
          From ${formatClockHm(filterFromMs)}
        </span>
      </div>

    </div>
  `;
}

/* =========================================================
 [10320] Phase Cycle Monitor:buildPhaseCycleMonitorHTML（旧 [6154]）
========================================================= */
function buildPhaseCycleMonitorHTML(nowMs = Date.now()) {

  return `
    <div
      style="
        border:1px solid #ddd;
        border-radius:6px;
        padding:10px 14px;
        margin-bottom:14px;
        background:#fafafa;
      "
    >
      ${buildPhaseCycleRowHTML("yellow", nowMs)}
      ${buildPhaseCycleRowHTML("pink", nowMs)}
    </div>
  `;
}

/* =========================================================
 [10400] Player Row Template:buildPlayerRowHTML【State】（旧 [6600]）
========================================================= */
function buildPlayerRowHTML(
  p
) {
  const titleUrl =
    p.mytitleId
      ? `https://initiald.sega.jp/inidac/ranking-images/title/${p.mytitleId}.png`
      : "";

  const isRuby =
    p.onlineBattleRankId === RUBY_ID &&
    p.starCnt;

  const starOrLevel =
    isRuby
      ? renderStars(
          p.starCnt
        )
      : (Number(p.pridePoint) > 0 ? p.pridePoint : "-");

  const fullShop =
    p.shopname ?? "";

  const shortShop =
    shortenStoreName(
      fullShop
    );

  const areaName =
    getAreaDisplayName(p.area);

  const isPinkManaged =
    isCopiedPlayer(p);

  const isPinkPhase =
    isMatchingCandidateByCopyPhase(p);

  const playerNameClass =
    isPinkPhase
      ? "pink-phase"
      : isPinkManaged
          ? "pink-managed"
          : "";

  const safeName =
    String(
      p.name ?? ""
    )
      .replace(
        /\\/g,
        "\\\\"
      )
      .replace(
        /'/g,
        "\\'"
      )
      .replace(
        /"/g,
        '\\"'
      );

  const safeShop =
    String(
      fullShop ?? ""
    )
      .replace(
        /\\/g,
        "\\\\"
      )
      .replace(
        /'/g,
        "\\'"
      )
      .replace(
        /"/g,
        "&quot;"
      );

  const copyValue =
    [
      isRuby
        ? `★${"★".repeat(p.starCnt - 1)}`
        : p.pridePoint,
      p.name ?? "",
      areaName,
      fullShop
    ]
      .join("\t")
      .replace(
        /\\/g,
        "\\\\"
      )
      .replace(
        /'/g,
        "\\'"
      )
      .replace(
        /\r?\n/g,
        " "
      );

  const rowStateClass =
    isPinkPhase
      ? "pink-phase"
      : isPinkManaged
          ? "pink-managed"
          : "";

  const crossBucketClass =
    p.__crossBucket
      ? " cross-bucket"
      : "";

  return `
    <tr
      class="${rowStateClass}${crossBucketClass}"
      data-updated="${p.updateDate}"
      data-name="${safeName}"
      data-shopname="${safeShop}"
    >
      <td
        class="center clickable"
        onclick="copyToClipboard(
          '${copyValue}',
          '${safeName}',
          '${safeShop}'
        )"
      >
        ${starOrLevel}
      </td>

      <td
        class="left player-name clickable ${playerNameClass}"
        onclick="copyToClipboard(
          '${safeName}',
          '${safeName}',
          '${safeShop}'
        )"
      >
        ${p.name}${
          p.__crossBucket
            ? ' <span style="background:#e8f5e9;color:#246b2d;border-radius:3px;padding:0 4px;font-size:0.8em;" title="バケット横断枠：過去バケット確率を現在候補数で個人へ配分した推定確率により選出">X↑</span>'
            : ""
        }
      </td>

      <td class="center">
        ${areaName}
      </td>

      <td
        class="left clickable"
        data-fullname="${safeShop}"
        onclick="copyToClipboard(
          '${safeShop}',
          '${safeName}',
          '${safeShop}'
        )"
      >
        <div class="store-name">
          ${shortShop}
        </div>
      </td>

      <td class="right">
        ${fmt(p.point)}
      </td>
      
      <td class="left phase-last-update">
        <button
          type="button"
          class="phase-detail-trigger"
          style="
            border:0;
            padding:0;
            background:transparent;
            color:inherit;
            font:inherit;
            text-align:left;
            cursor:pointer;
          "
          title="タップしてPhaseを表示"
        >${p.updateDate}</button>
      </td>

      <td class="center">
        ${
          titleUrl
            ? `<img src="${titleUrl}" height="24">`
            : ""
        }
      </td>
    </tr>
  `;
}

/* =========================================================
 [10500] Matching Header Template:buildMatchingRankCountsHTML【State】（旧 [7800]）
========================================================= */
function buildRankCountBadgesHTML(list) {
  const counts = {};

  RANKS.forEach(rank => {
    counts[rank.key] = 0;
  });

  (list || []).forEach(player => {
    const rankKey =
      player.__rankKey || getPlayerRankKey(player);

    if (rankKey && Object.prototype.hasOwnProperty.call(counts, rankKey)) {
      counts[rankKey] += 1;
    }
  });

  return RANKS
    .filter(rank => counts[rank.key] > 0)
    .map(rank => `
      <span
        class="rank-count-badge"
        title="${rank.label}: ${counts[rank.key]}人"
        style="
          display:inline-flex;
          align-items:center;
          gap:4px;
          background:rgba(255,255,255,0.92);
          border:1px solid rgba(148,163,184,0.45);
          border-radius:999px;
          padding:4px 10px;
          white-space:nowrap;
        "
      >
        <img src="${rank.icon}" width="20">
        ${rank.label}：${fmt(counts[rank.key])}人
      </span>
    `)
    .join("");
}

function buildMatchingRankCountsHTML() {

  if (
    !State.matchingList.length
  ) {
    return "<span>マッチング候補は現在 0人です。</span>";
  }

  return buildRankCountBadgesHTML(State.matchingList);
}


/* #################################################################
 [LAYER 11000] DOM Renderers（DOMを書き換える層）
 ################################################################# */

/* =========================================================
 [11000] View Switching:switchDisplayView【DOM】（旧 [0220]）
========================================================= */
function switchDisplayView(view) {

  const summaryView =
    document.getElementById("summaryView");

  const detailView =
    document.getElementById("detailView");

  const matchingView =
    document.getElementById("matchingView");

  if (summaryView) {
    summaryView.style.display =
      view === STATE.SUMMARY
        ? "block"
        : "none";
  }

  if (detailView) {
    detailView.style.display =
      view === STATE.DETAIL
        ? "block"
        : "none";
  }

  if (matchingView) {
    matchingView.style.display =
      view === STATE.MATCHING
        ? "block"
        : "none";
  }
}

/* =========================================================
 [11100] Progress Utility:state【DOM】（旧 [2300]）
========================================================= */
let progressTimer = null;

let progressPos = 0;

let progressLine = null;

/* =========================================================
 [11110] Progress Utility:startProgress【DOM】（旧 [2310]）
========================================================= */
function startProgress() {
  const box = document.getElementById("logBox");

  // logBox が存在しない環境では何もしない
  if (!box) return;

  if (progressLine && progressLine.parentNode) {
    progressLine.remove();
  }

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

/* =========================================================
 [11120] Progress Utility:updateProgressBar【DOM】（旧 [2320]）
========================================================= */
function updateProgressBar() {
  if (!progressLine) return;

  const total = 20;

  const filled = "■".repeat(Math.max(0, Math.min(total, progressPos)));

  const empty = "□".repeat(Math.max(0, total - progressPos));

  progressLine.textContent = `進行中：${filled}${empty}`;
}

/* =========================================================
 [11130] Progress Utility:stopProgress【DOM】（旧 [2330]）
========================================================= */
function stopProgress() {

  if (progressTimer) {
    clearInterval(progressTimer);
  }

  progressTimer = null;

  if (progressLine) {

    progressLine.remove();

    progressLine = null;
  }

  log("Viewer フィルタ完了");
}

/* =========================================================
 [11200] Filter UI Renderer:buildRubyFilters【DOM】（旧 [5210]）
========================================================= */
function buildRubyFilters() {

  const area =
    document.getElementById(
      "rubyFilters"
    );

  if (!area) {
    return;
  }

  const stars =
    Array.from(
      { length: 8 },
      (_, i) => i + 1
    );

  area.innerHTML =
    buildFilterGroupHTML(
      stars,
      {
        labelClass: "ruby-btn",

        inputClass:
          "ruby-filter",

        getValue:
          star => star,

        getText:
          star => `★${star}`
      }
    );
}

/* =========================================================
 [11210] Filter UI Renderer:buildPrideFilters【DOM】（旧 [5220]）
========================================================= */
function buildPrideFilters() {

  const area =
    document.getElementById(
      "prideFilters"
    );

  if (!area) {
    return;
  }

  area.innerHTML =
    buildFilterGroupHTML(
      PRIDE_LEVELS,
      {
        labelClass:
          "pride-btn",

        inputClass:
          "pride-filter",

        getValue:
          p => p.key,

        getText:
          p => p.key.replace(
            "P_",
            ""
          )
      }
    );
}

/* =========================================================
 [11300] Summary Renderer:renderSummary【DOM】【State】（旧 [5410]）
========================================================= */
function buildSummaryModeNavHTML(activeMode) {
  const modes = [
    {
      key: "rank",
      label: "🏆 RANK"
    },
    {
      key: "area",
      label: "🗺️ AREA"
    }
  ];

  /*
   * どの画面からも RankSummary / AreaSummary
   * 両方に常時遷移できるようにするため、
   * ボタンは常に有効（非活性にしない）。
   */
  return `
    <div class="summary-mode-nav">
      ${modes.map(mode => `
        <button
          type="button"
          class="summary-mode-btn summary-mode-btn-${mode.key}${mode.key === activeMode ? " active" : ""}"
          data-summary-mode="${mode.key}"
        >${mode.label}</button>
      `).join("")}
      <button
        type="button"
        class="summary-mode-btn summary-mode-btn-preview${State.matchingContext?.mode === "preview" && activeMode === "both" ? " active" : ""}"
        data-matching-preview
      >🔭 PREVIEW</button>
      ${buildMatchingOffsetSelectHTML(
        "previewOffsetSelect",
        State.previewOffsetSec,
        "PREVIEWの予測時刻"
      )}
    </div>
  `;
}

function buildMatchingOffsetSelectHTML(
  id,
  selectedValue,
  ariaLabel
) {
  const options = [
    { value: 0, label: "NOW" },
    { value: 5, label: "5秒後" },
    { value: 10, label: "10秒後" },
    { value: 15, label: "15秒後" }
  ];

  return `
    <select
      id="${id}"
      class="matching-offset-select"
      aria-label="${ariaLabel}"
    >
      ${options.map(option => `
        <option
          value="${option.value}"
          ${Number(selectedValue) === option.value ? "selected" : ""}
        >${option.label}</option>
      `).join("")}
    </select>
  `;
}

function setThemeHeaderColor(mode) {
  const colors = {
    rank: "#168a45",
    area: "#7c3fb3",
    matching: "#e91e63",
    preview: "#2563a6"
  };
  const color = colors[mode] || "#168a45";
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.style.setProperty("--theme-header-color", color);
  }
}

function ensureAreaSummaryStyles() {
  if (document.getElementById("area-summary-view-styles")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "area-summary-view-styles";
  style.textContent = `
    :root {
      --theme-header-color: #168a45;
    }

    th {
      background: var(--theme-header-color, #168a45) !important;
      color: #fff !important;
    }

    .area-summary-list {
      display: flex;
      flex-direction: column;
      gap: 0;
      margin-top: 12px;
      border: 1px solid #e2e8f0;
      border-radius: 0;
      overflow: hidden;
      background: #fff;
    }

    .summary-mode-btn-rank,
    .summary-mode-btn-rank.active {
      background: #168a45;
      border-color: #116f37;
      color: #fff;
    }

    .summary-mode-btn-area,
    .summary-mode-btn-area.active {
      background: #7c3fb3;
      border-color: #643191;
      color: #fff;
    }

    .summary-mode-btn-rank:hover {
      background: #116f37;
    }

    .summary-mode-btn-area:hover {
      background: #643191;
    }

    .summary-mode-btn-preview,
    .summary-mode-btn-preview.active {
      background: #2563a6;
      border-color: #1d4f84;
      color: #fff;
    }

    .summary-mode-btn-preview:hover {
      background: #1d4f84;
    }

    .summary-mode-btn.active {
      box-shadow:
        inset 0 0 0 2px rgba(255, 255, 255, 0.5),
        0 2px 4px rgba(0, 0, 0, 0.15);
    }

    .summary-mode-btn:disabled {
      background: #edf2f7;
      border-color: #d4dbe5;
      color: #5d6775;
      cursor: default;
      opacity: 0.8;
    }

    .summary-mode-nav {
      width: 100%;
      margin-top: 8px;
      margin-bottom: 0;
      display: grid;
      grid-template-columns:
        minmax(0, 1fr)
        minmax(0, 0.85fr)
        minmax(0, 1.15fr)
        minmax(0, 0.85fr);
      gap: 5px;
    }

    .summary-mode-btn,
    .matching-offset-select {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      height: 48px;
      padding: 12px 6px;
      font-size: 15px;
      font-weight: bold;
      border-radius: 6px;
      white-space: nowrap;
    }

    #analysisLogBtn {
      box-sizing: border-box;
      width: calc((100% - 16px) / 3);
      flex: 0 0 calc((100% - 16px) / 3);
      height: 48px;
      padding: 12px 6px;
      font-size: 15px;
      font-weight: bold;
      border-radius: 6px;
      white-space: nowrap;
    }

    .matching-offset-select {
      background: #fff;
      color: #222;
      border: 1px solid #aeb7c2;
      text-align: center;
      padding: 8px 2px;
    }

    #matchingHeader,
    .summary-action-header {
      display: none !important;
    }

    .matching-primary-row {
      display: grid !important;
      grid-template-columns:
        minmax(0, 1fr)
        minmax(0, 0.85fr)
        minmax(0, 1.15fr)
        minmax(0, 0.85fr);
      gap: 5px !important;
      width: 100%;
    }

    .matching-primary-row > #reloadBtn,
    .matching-primary-row > #undoCopyBtn,
    .matching-primary-row > #matchingBtn,
    .matching-primary-row > #matchingOffsetSelect {
      box-sizing: border-box;
      width: 100% !important;
      min-width: 0;
      margin: 0 !important;
      white-space: nowrap;
    }

    #reloadViewerTime {
      white-space: nowrap;
      font-size: inherit;
      font-variant-numeric: tabular-nums;
    }

    #searchRow {
      align-items: stretch;
      display: flex;
      flex-wrap: nowrap;
      gap: 4px;
      min-width: 0;
      width: 100%;
      box-sizing: border-box;
    }

    #searchInput {
      flex: 1 1 0;
      min-width: 0;
      width: 0 !important;
    }

    #unmatchedMemoBtn {
      flex: 0 0 auto;
      height: 36px;
      padding: 0 6px;
      margin: 0;
      white-space: nowrap;
      font-size: 12px;
    }

    #myRankSelect,
    #searchInput {
      box-sizing: border-box;
      height: 36px;
    }

    #logExportDate {
      box-sizing: border-box;
      height: 48px;
      padding: 12px 8px !important;
      font-size: 15px !important;
      border-radius: 6px;
    }

    .area-summary-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 14px;
      margin: 8px 0 12px;
      padding: 8px 10px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      background: #f8fafc;
    }

    .area-summary-legend-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      white-space: nowrap;
      color: #334155;
    }

    .area-summary-legend-swatch {
      display: inline-block;
      width: 14px;
      height: 14px;
      border-radius: 4px;
      border: 1px solid rgba(15, 23, 42, 0.18);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.24);
    }

    /*
     * 【表示修正】ランクサマリ／エリアサマリ共通の
     * Rubyの設定範囲2帯とPRIDE帯を表示する合計見出しの背景。
     * ランク・エリア別バッジ（rank-count-badge）と同じ
     * 半透明白ピル背景に揃えることで、写真背景の上でも
     * 見出しの視認性を確保する。
     */
    .summary-total-badge {
      display: inline-block;
      background: rgba(255,255,255,0.92);
      border: 1px solid rgba(148,163,184,0.45);
      border-radius: 999px;
      padding: 10px 20px;
    }

    /*
     * 【表示修正】ROUND〜PRIDEのViewer操作パネルを、
     * summary-total-badgeと同じ背景でまとめる。
     */
    #viewer-filter-panel {
      display: inline-block;
      max-width: 100%;
      box-sizing: border-box;
      background: rgba(255,255,255,0.92);
      border: 1px solid rgba(148,163,184,0.45);
      border-radius: 12px;
      padding: 10px 20px;
    }

    .area-summary-row {
      display: flex;
      align-items: stretch;
      gap: 0;
      min-width: 0;
      border-top: 1px solid #edf2f7;
    }

    .area-summary-row:first-child {
      border-top: none;
    }

    .area-summary-header-row {
      display: flex;
      align-items: stretch;
      background: var(--theme-header-color, #7c3fb3) !important;
      border-bottom: 1px solid rgba(0, 0, 0, 0.15);
      font-size: 12px;
      font-weight: 700;
      color: #fff !important;
    }

    .area-summary-header-row + .area-summary-row {
      border-top: none;
    }

    .area-sort-th {
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
      padding: 2px 0;
      color: #fff !important;
    }

    .area-sort-th:hover {
      color: #fff !important;
      text-decoration: underline;
    }

    .area-sort-mark {
      margin-left: 4px;
      font-size: 10px;
    }

    .area-sort-mark.idle {
      opacity: 0.65;
      font-weight: 400;
      color: #fff !important;
    }

    .area-summary-header-label {
      padding-left: 10px;
      color: rgba(255, 255, 255, 0.95) !important;
    }

    .area-summary-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-width: 260px;
      flex: 0 0 260px;
      padding: 4px 10px;
      border-right: 1px solid #e2e8f0;
    }

    .area-summary-name {
      font-weight: 600;
      color: #0f172a;
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .area-summary-bar-area {
      display: flex;
      align-items: center;
      flex: 1 1 auto;
      min-width: 0;
    }

    .area-summary-bar {
      display: flex;
      align-items: stretch;
      height: 26px;
      min-width: 40px;
      overflow: hidden;
      margin: 0;
    }

    .area-segment {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      min-width: 0;
      position: relative;
      overflow: visible;
      color: rgba(255,255,255,0.96);
      text-shadow: 0 1px 1px rgba(15,23,42,0.22);
      font-size: 13px;
      font-weight: 700;
      line-height: 1;
      white-space: nowrap;
    }

    .area-segment:hover {
      z-index: 5;
    }

    .area-segment-label {
      position: relative;
      z-index: 1;
      pointer-events: none;
    }

    .area-segment.pride {
      color: #111827;
      text-shadow: 0 1px 1px rgba(255,255,255,0.55);
    }

    .area-segment.empty {
      background: repeating-linear-gradient(
        135deg,
        #f8fafc 0,
        #f8fafc 5px,
        #edf2f7 5px,
        #edf2f7 10px
      );
    }

    @media (max-width: 700px) {
      .summary-mode-btn,
      .matching-offset-select,
      .matching-primary-row > button,
      .matching-primary-row > select {
        padding-left: 2px !important;
        padding-right: 2px !important;
        font-size: 11px !important;
      }

      .matching-primary-row,
      .summary-mode-nav {
        grid-template-columns: repeat(3, minmax(0, 1fr)) 48px;
      }

      .matching-primary-row > button,
      .summary-mode-nav > button {
        font-size: 13px !important;
      }

      .matching-primary-row > #reloadBtn {
        padding-top: 6px;
        padding-bottom: 6px;
        line-height: 18px;
      }

      .reload-button-label {
        display: block;
      }

      #reloadViewerTime {
        font-size: 16px;
      }

      .area-summary-row {
        flex-direction: column;
        align-items: stretch;
      }

      .area-summary-head {
        min-width: 0;
        width: 100%;
        flex-basis: auto;
      }

      .area-summary-header-row {
        flex-direction: column;
      }

      .area-summary-header-row .area-summary-bar-area {
        display: none;
      }
    }
  `;

  document.head.appendChild(style);
}

function bindSummaryModeButtons(root) {
  if (!root) return;

  const refreshButton =
    root.querySelector(
      "[data-summary-refresh]"
    );

  if (refreshButton) {
    refreshButton.addEventListener(
      "click",
      () => {
        renderSummary();
      }
    );
  }

  const detailSummaryButton =
    root.querySelector(
      "[data-detail-summary]"
    );

  if (detailSummaryButton) {
    detailSummaryButton.addEventListener(
      "click",
      () => {
        if (
          State.currentDetailType ===
          "area"
        ) {
          showAreaSummary(true);
          return;
        }

        showSummaryUI(
          true,
          "rank"
        );
      }
    );
  }

  root.querySelectorAll("[data-summary-mode]").forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.summaryMode;

      State.searchText = "";

      const searchInput =
        document.getElementById("searchInput");

      if (searchInput) {
        searchInput.value = "";
      }

      if (mode === "area") {
        showAreaSummary(true);
      } else {
        showSummaryUI(true, "rank");
      }
    });
  });

  const previewBtn =
    root.querySelector(
      "[data-matching-preview]"
    );

  if (previewBtn) {
    previewBtn.addEventListener(
      "click",
      () => {
        State.searchText = "";

        const searchInput =
          document.getElementById(
            "searchInput"
          );

        if (searchInput) {
          searchInput.value = "";
        }

        showMatchingCandidates({
          push: true,
          mode: "preview",
          offsetSec:
            State.previewOffsetSec
        });
      }
    );
  }

  const previewOffsetSelect =
    root.querySelector(
      "#previewOffsetSelect"
    );

  if (previewOffsetSelect) {
    previewOffsetSelect.addEventListener(
      "change",
      e => {
        State.previewOffsetSec =
          Number(e.target.value) || 0;
      }
    );
  }

  const nav =
    root.querySelector(
      ".summary-mode-nav"
    );
  const searchRow =
    document.getElementById(
      "searchRow"
    );

  if (
    nav &&
    searchRow?.parentNode
  ) {
    document
      .querySelectorAll(
        ".summary-mode-nav"
      )
      .forEach(otherNav => {
        if (otherNav !== nav) {
          otherNav.remove();
        }
      });

    searchRow.parentNode.insertBefore(
      nav,
      searchRow
    );
  }
}

function getAreaSummaryRows() {
  const nowMs = Date.now();
  const filteredSummary = filterSummaryBySearch();

  const groupedByArea =
    new Map();

  for (let areaNo = 0; areaNo <= 62; areaNo++) {
    const counts = {};

    RANKS.forEach(rank => {
      counts[rank.key] = 0;
    });

    groupedByArea.set(
      String(areaNo),
      {
        list: [],
        counts,
        phaseMatchedTotal: 0
      }
    );
  }

  for (const rank of filteredSummary) {
    for (const player of rank.list) {
      const group =
        groupedByArea.get(
          String(player.area ?? "")
        );

      if (!group) {
        continue;
      }

      group.list.push(player);
      group.counts[rank.key] += 1;

      const phaseMatched =
        isCopiedPlayer(player)
          ? isMatchingCandidateByCopyPhase(
              player,
              nowMs
            )
          : isMatchingCandidateByPhase(
              player,
              nowMs
            );

      if (phaseMatched) {
        group.phaseMatchedTotal += 1;
      }
    }
  }

  const rows = [];

  for (let areaNo = 0; areaNo <= 62; areaNo++) {
    const areaKey = String(areaNo);
    const areaName = getAreaDisplayName(areaKey);
    const group =
      groupedByArea.get(areaKey);
    const list =
      group?.list ?? [];
    const counts =
      group?.counts ?? {};

    const total = Object.values(counts).reduce((sum, v) => sum + v, 0);

    rows.push({
      areaNo,
      areaKey,
      areaName,
      total,
      phaseMatchedTotal:
        group?.phaseMatchedTotal ?? 0,
      counts,
      list
    });
  }

  return rows;
}

/*
 * Areaサマリの並び替え。
 * 集計（getAreaSummaryRows）とは分離し、描画直前にのみ適用する。
 * 同値の場合は areaNo 昇順で安定させる。
 */
function sortAreaSummaryRows(rows) {
  const key =
    State.areaSortKey === "total"
      ? "total"
      : "areaNo";

  const sign =
    State.areaSortDir === "desc"
      ? -1
      : 1;

  return [...rows].sort((a, b) => {
    const diff = a[key] - b[key];

    if (diff === 0) {
      return a.areaNo - b.areaNo;
    }

    return diff * sign;
  });
}

function getAreaNavigationAreaNos() {
  if (State.areaSortKey !== "total") {
    return Array.from(
      { length: 63 },
      (_, areaNo) => areaNo
    );
  }

  return sortAreaSummaryRows(
    getAreaSummaryRows()
  ).map(row => row.areaNo);
}

function buildAreaSummaryHeaderHTML() {
  const mark = key => {
    if (State.areaSortKey !== key) {
      return `<span class="area-sort-mark idle">⇅</span>`;
    }

    return `<span class="area-sort-mark">${
      State.areaSortDir === "asc" ? "▲" : "▼"
    }</span>`;
  };

  return `
    <div class="area-summary-header-row">
      <div class="area-summary-head">
        <span
          class="area-sort-th"
          data-area-sort="areaNo"
          role="button"
          tabindex="0"
        >エリアNo.${mark("areaNo")}</span>
        <span
          class="area-sort-th"
          data-area-sort="total"
          role="button"
          tabindex="0"
        >人数${mark("total")}</span>
      </div>
      <div class="area-summary-bar-area">
        <span class="area-summary-header-label">ランク構成</span>
      </div>
    </div>
  `;
}

function bindAreaSortHeader(root) {
  if (!root) return;

  root.querySelectorAll(".area-sort-th").forEach(th => {

    const apply = () => {
      const key = th.dataset.areaSort;
      if (!key) return;

      if (State.areaSortKey === key) {
        State.areaSortDir =
          State.areaSortDir === "asc" ? "desc" : "asc";
      } else {
        State.areaSortKey = key;
        /*
         * 人数は「多い順」を見たい場面が多いため降順を既定とする。
         */
        State.areaSortDir =
          key === "total" ? "desc" : "asc";
      }

      renderAreaSummary();
    };

    th.addEventListener("click", apply);

    th.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        apply();
      }
    });
  });
}

function getRankColor(rankKey) {
  const colors = {
    R1: "#dc2626",
    R2: "#f97316",
    R3: "#facc15",
    R4: "#84cc16",
    R5: "#22c55e",
    R6: "#14b8a6",
    R7: "#3b82f6",
    R8: "#8b5cf6",
    // PRIDE帯の色は、各LEVELのバッジアイコン（画像）の
    // 実際の配色に近づけたもの。
    P_A: "#eab308", // バッジ：ゴールド系
    P_B: "#84cc16", // バッジ：黄緑系
    P_C: "#65a30d", // バッジ：黄緑系（Bよりやや濃色で区別）
    P_D: "#16a34a", // バッジ：グリーン系
    P_E: "#0d9488", // バッジ：ティール系
    P_F: "#1d4ed8", // バッジ：ブルー系
    P_G: "#c026d3"  // バッジ：マゼンタ系
  };

  return colors[rankKey] || "#999";
}

/*
 * PRIDE帯は「透過」ではなく斜線パターンで
 * RUBY帯（単色塗り）と区別する。
 * さらに、隣り合うPRIDE帯（P_A→P_B→…）で斜線の向きを
 * 交互（45deg / -45deg）に変えることで、隣接する帯同士の
 * 境界がわかりやすくなるようにする。
 */
const PRIDE_ORDER = ["P_A", "P_B", "P_C", "P_D", "P_E", "P_F", "P_G"];

function getRankFillStyle(rankKey) {
  const base = getRankColor(rankKey);

  if (String(rankKey).startsWith("P_")) {
    const idx = PRIDE_ORDER.indexOf(rankKey);
    const angle = idx % 2 === 0 ? 45 : -45;
    // 色のついた線自体を細くし、白地部分を広めにすることで、
    // ランク色の識別と中央の文字表記の可読性を両立させる。
    return `background: repeating-linear-gradient(${angle}deg, ${base} 0px, ${base} 3px, rgba(255,255,255,0.75) 3px, rgba(255,255,255,0.75) 10px);`;
  }

  return `background: ${base};`;
}

function getRankLegendStyle(rankKey) {
  const base = getRankColor(rankKey);
  return `${getRankFillStyle(rankKey)} border:1px solid ${base};`;
}

/*
 * グラフ内の人数表記を「ルビー帯なら★1=1」「PRIDE帯ならA=1」のように
 * ランク判別しやすい短縮ラベル付きにするためのヘルパー。
 */
function getRankShortLabel(rankKey) {
  if (String(rankKey).startsWith("P_")) {
    return String(rankKey).replace("P_", "");
  }
  return `★${String(rankKey).replace("R", "")}`;
}

function renderAreaSummary() {
  const area = document.getElementById("summaryArea");
  if (!area) return;

  ensureAreaSummaryStyles();
  setThemeHeaderColor("area");

  const rows = sortAreaSummaryRows(getAreaSummaryRows());
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const rankCounts = Object.fromEntries(
    RANKS.map(rank => [
      rank.key,
      rows.reduce((sum, row) => sum + (row.counts[rank.key] || 0), 0)
    ])
  );

  const normSearch = typeof normalize === "function" ? normalize(State.searchText || "") : String(State.searchText || "").trim().toLowerCase();
  const filteredSummary = filterSummaryBySearch();
  const matchedPlayers = normSearch
    ? filteredSummary.flatMap(r => r.list)
    : [];

  const displayRows = normSearch ? rows.filter(r => r.total > 0) : rows;
  const maxAreaTotal = Math.max(1, ...displayRows.map(r => r.total));
  const legendHTML = RANKS.map(rank => `
    <span class="area-summary-legend-item">
      <span class="area-summary-legend-swatch" style="${getRankLegendStyle(rank.key)}"></span>
      ${rank.label}
    </span>
  `).join("");

  let searchResultsHTML = "";
  if (normSearch) {
    if (matchedPlayers.length > 0) {
      searchResultsHTML = `
        <div class="summary-search-results" style="margin: 12px 0 16px;">
          <h4 style="margin: 6px 0; color: #7c3fb3; font-size: 14px;">🔍 検索結果: ${matchedPlayers.length}名</h4>
          <div style="overflow-x:auto;">
            <table>
              <thead>
                <tr>
                  <th>★・PRIDE</th>
                  <th>プレイヤー名</th>
                  <th>エリア</th>
                  <th>店舗名</th>
                  <th>RP</th>
                  <th>Last Update</th>
                  <th>称号</th>
                </tr>
              </thead>
              <tbody id="areaSummarySearchResultBody"></tbody>
            </table>
          </div>
        </div>
      `;
    } else {
      searchResultsHTML = `
        <div style="margin: 10px 0 14px; padding: 8px 12px; background: #fff3cd; border: 1px solid #ffeeba; border-radius: 6px; color: #856404; font-size: 13px;">
          「${State.searchText}」に一致するプレイヤーは見つかりませんでした。
        </div>
      `;
    }

    area.innerHTML = `
      ${buildSummaryModeNavHTML("area")}
      ${searchResultsHTML}
    `;

    bindSummaryModeButtons(area);

    if (matchedPlayers.length > 0) {
      renderPlayerRowsToBody("areaSummarySearchResultBody", matchedPlayers);
    }
    return;
  }

  area.innerHTML = `
    ${buildSummaryModeNavHTML("area")}
    <h3 class="summary-total-badge">
      ${buildSummaryPopulationText(total, rankCounts)}
    </h3>

    <div class="area-summary-legend">${legendHTML}</div>

    <div class="area-summary-list">
      ${buildAreaSummaryHeaderHTML()}
      ${displayRows.map(row => {
        const segments = [];

        RANKS.forEach(rank => {
          const count = row.counts[rank.key] || 0;
          if (!count) return;

          // 全エリア共通のスケール（maxAreaTotal基準）で幅を算出することで、
          // 「1人」の幅がエリアごとにばらつかないようにする。
          const pctOfScale = (count / maxAreaTotal) * 100;

          segments.push(`
            <div
              class="area-segment${String(rank.key).startsWith("P_") ? " pride" : ""}"
              title="${rank.label}: ${count}人"
              style="width:${pctOfScale}%; ${getRankFillStyle(rank.key)}"
            ><span class="area-segment-label"><b>${getRankShortLabel(rank.key)}=${count}</b></span></div>
          `);
        });

        const barContent = segments.length ? segments.join("") : "";

        return `
          <div class="area-summary-row">
            <div class="area-summary-head">
              <span class="area-summary-name clickable" data-area="${row.areaNo}">No.${row.areaNo} ${row.areaName}：Phase ${fmt(row.phaseMatchedTotal)}／${fmt(row.total)}人</span>
            </div>
            <div class="area-summary-bar-area">
              <div class="area-summary-bar" style="width:100%;">
                ${barContent}
              </div>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;

  bindSummaryModeButtons(area);
  bindAreaSortHeader(area);

  area.querySelectorAll(".area-summary-name").forEach(el => {
    el.addEventListener("click", () => {
      const areaNo = Number(el.dataset.area);
      if (!Number.isNaN(areaNo)) {
        showAreaDetail(areaNo);
      }
    });
  });

  State.currentDetailKey = "";
  State.currentDetailLabel = "";
  State.currentDetailIcon = "";
}

function renderSummary() {
  ensureAreaSummaryStyles();
  setThemeHeaderColor("rank");

  if (State.summaryMode === "area") {
    renderAreaSummary();
    return;
  }

  const area =
    document.getElementById(
      "summaryArea"
    );

  const filteredSummary =
    filterSummaryBySearch();

  const total =
    filteredSummary.reduce(
      (sum, r) =>
        sum + r.list.length,
      0
    );

  const rankCounts = Object.fromEntries(
    filteredSummary.map(row => [row.key, row.list.length])
  );

  const normSearch = typeof normalize === "function" ? normalize(State.searchText || "") : String(State.searchText || "").trim().toLowerCase();
  const matchedPlayers = normSearch
    ? filteredSummary.flatMap(r => r.list)
    : [];

  let searchResultsHTML = "";
  if (normSearch) {
    if (matchedPlayers.length > 0) {
      searchResultsHTML = `
        <div class="summary-search-results" style="margin: 12px 0 16px;">
          <h4 style="margin: 6px 0; color: #168a45; font-size: 14px;">🔍 検索結果: ${matchedPlayers.length}名</h4>
          <div style="overflow-x:auto;">
            <table>
              <thead>
                <tr>
                  <th>★・PRIDE</th>
                  <th>プレイヤー名</th>
                  <th>エリア</th>
                  <th>店舗名</th>
                  <th>RP</th>
                  <th>Last Update</th>
                  <th>称号</th>
                </tr>
              </thead>
              <tbody id="summarySearchResultBody"></tbody>
            </table>
          </div>
        </div>
      `;
    } else {
      searchResultsHTML = `
        <div style="margin: 10px 0 14px; padding: 8px 12px; background: #fff3cd; border: 1px solid #ffeeba; border-radius: 6px; color: #856404; font-size: 13px;">
          「${State.searchText}」に一致するプレイヤーは見つかりませんでした。
        </div>
      `;
    }

    area.innerHTML = `
      ${buildSummaryModeNavHTML("rank")}
      ${searchResultsHTML}
    `;

    bindSummaryModeButtons(area);

    if (matchedPlayers.length > 0) {
      renderPlayerRowsToBody("summarySearchResultBody", matchedPlayers);
    }
    return;
  }

  area.innerHTML = `
    ${buildSummaryModeNavHTML("rank")}
    <h3 class="summary-total-badge">
      ${buildSummaryPopulationText(total, rankCounts)}
    </h3>

    <div style="overflow-x:auto;">
      <table>

        <tr>
          <th>ランク</th>
          <th>★・Lv</th>
          <th>人数</th>
          <th>%</th>
          <th>Bar</th>
          <th>RP:Avg</th>
          <th>RP:Min</th>
          <th>RP:Max</th>
        </tr>

        ${filteredSummary.map(r => {

          const {
            cnt,
            percent,
            avg,
            min,
            max
          } = calcStats(
            r.list,
            total
          );

          return `
            <tr
              class="clickable"
              data-key="${r.key}"
            >

              <td class="center">
                <img src="${r.icon}" width="32">
              </td>

              <td class="left">
                ${r.label}
              </td>

              <td class="right">
                ${fmt(cnt)}
              </td>

              <td class="right">
                ${percent}%
              </td>

              <td class="center">
                <div class="bar-wrap">
                  <div
                    class="bar"
                    style="width:${percent}%;"
                  ></div>
                </div>
              </td>

              <td class="right">
                ${fmt(avg)}
              </td>

              <td class="right">
                ${fmt(min)}
              </td>

              <td class="right">
                ${fmt(max)}
              </td>

            </tr>
          `;

        }).join("")}

      </table>
    </div>
  `;

  bindSummaryModeButtons(area);

  document
    .querySelectorAll(
      "#summaryArea .clickable"
    )
    .forEach(tr => {

      tr.addEventListener(
        "click",
        () => {

          const key =
            tr.dataset.key;

          State.currentDetailType = "rank";
          showDetail(
            key
          );
        }
      );
    });

  State.currentDetailKey = "";
  State.currentDetailLabel = "";
  State.currentDetailIcon = "";
}

/* =========================================================
 [11400] Detail Renderer:renderDetailTable【DOM】【State】（旧 [6200]）
========================================================= */
function renderDetailTable() {
  ensureAreaSummaryStyles();
  setThemeHeaderColor("rank");

  const area =
    document.getElementById(
      "detailArea"
    );

  const list =
    applyPlayerFilter(
      State.searchText,
      true
    );

  area.innerHTML = `
    ${buildSummaryModeNavHTML()}

    ${buildPhaseCycleMonitorHTML()}

    <div class="rank-nav-box">
        <button id="prevRankBtn" class="rank-nav-btn">　◀◀◀　</button>
        <button id="nextRankBtn" class="rank-nav-btn">　▶▶▶　</button>
    </div>

    <div
      class="rank-count-badges"
      style="display:flex; flex-wrap:wrap; gap:8px; margin:8px 0 12px;"
    >
      ${buildRankCountBadgesHTML(list)}
    </div>

    <div style="overflow-x:auto;">

      <table>

        <thead>

          <tr>
            <th>★・PRIDE</th>
            <th>プレイヤー名</th>
            <th>エリア</th>
            <th>店舗名</th>
            <th>RP</th>
            <th>Last Update</th>
            <th>称号</th>
          </tr>

        </thead>

        <tbody id="detailTableBody"></tbody>

      </table>

    </div>
  `;

  bindSummaryModeButtons(area);
  setupRankNavigation(
    State.currentDetailKey
  );

  renderPlayerRowsToBody(
    "detailTableBody",
    list
  );
}

function renderAreaDetailTable(areaNo) {
  const area = document.getElementById("detailArea");
  if (!area) return;

  ensureAreaSummaryStyles();
  setThemeHeaderColor("area");

  const areaKey = String(areaNo);
  const areaName = getAreaDisplayName(areaKey);
  const list = (State.searchText ? applyPlayerFilter(State.searchText, true) : (State.detailOriginal || []).slice())
    .filter(p => String(p.area ?? "") === areaKey)
    .filter(isPlayerIncludedInRankFilters);
  area.innerHTML = `
    ${buildSummaryModeNavHTML()}

    ${buildPhaseCycleMonitorHTML()}

    <div class="rank-nav-box">
        <button id="prevAreaBtn" class="rank-nav-btn">　◀◀◀　</button>
        <button id="nextAreaBtn" class="rank-nav-btn">　▶▶▶　</button>
    </div>

    <h3>
      <span>エリアNo.${areaNo} ${areaName}</span>
      <span style="margin-left:16px;">（${fmt(list.length)}人）</span>
    </h3>

    <div
      class="rank-count-badges"
      style="display:flex; flex-wrap:wrap; gap:8px; margin:8px 0 12px;"
    >
      ${buildRankCountBadgesHTML(list)}
    </div>

    <div style="overflow-x:auto;">
      <table>
        <thead>
          <tr>
            <th>★・PRIDE</th>
            <th>プレイヤー名</th>
            <th>エリア</th>
            <th>店舗名</th>
            <th>RP</th>
            <th>Last Update</th>
            <th>称号</th>
          </tr>
        </thead>
        <tbody id="detailTableBody"></tbody>
      </table>
    </div>
  `;

  bindSummaryModeButtons(area);
  setupAreaNavigation(areaNo);
  renderPlayerRowsToBody("detailTableBody", list);
}

/* =========================================================
 [11500] Player Row Renderer:renderPlayerRowsToBody【DOM】（旧 [6500]）
========================================================= */
function renderPlayerRowsToBody(
  tbodyId,
  list
) {
  const tbody =
    document.getElementById(
      tbodyId
    );

  if (!tbody) return;

  const rows =
    list
      .map(p => buildPlayerRowHTML(p))
      .join("");

  tbody.innerHTML = rows;

  tbody.querySelectorAll(
    ".phase-detail-trigger"
  )
    .forEach(trigger => {
      trigger.addEventListener(
        "click",
        () => {
          const row =
            trigger.closest("tr");

          if (!row) {
            return;
          }

          const player = {
            name: row.dataset.name || "",
            shopname:
              row.dataset.shopname || "",
            updateDate:
              row.dataset.updated || ""
          };

          showPlayerPhaseDetailDialog(
            player
          );
        }
      );
    });

  highlightMatchingRows(
    tbody
  );
}

/* =========================================================
 [11510] Matching Highlight Renderer:highlightMatchingRows【DOM】【State】（旧 [6400]）
========================================================= */
function highlightMatchingRows(
  tbody
) {

  if (!tbody) return;

  tbody.querySelectorAll("tr").forEach(tr => {

    const updated =
      tr.dataset.updated || "";

    const rowName =
      tr.dataset.name || "";

    const rowShop =
      tr.dataset.shopname || "";

    const rowPlayer = {
      name: rowName,
      shopname: rowShop,
      updateDate: updated
    };

    const isYellow =
      isMatchingCandidateByPhase(
        rowPlayer
      );

    const isPink =
      isMatchingCandidateByCopyPhase(
        rowPlayer
      );

    tr.classList.remove(
      "match-row-yellow"
    );

    tr.classList.remove(
      "match-row-pink"
    );

    if (isPink) {

      tr.classList.add(
        "match-row-pink"
      );

    } else if (isYellow) {

      tr.classList.add(
        "match-row-yellow"
      );

    }

  });

}

/* =========================================================
 [11600] Matching Renderer:renderMatchingHeader【DOM】（旧 [7800] 内）
========================================================= */
function renderMatchingHeader() {

  const headerEl =
    document.getElementById(
      "matchingHeader"
    );

  if (!headerEl) {
    return;
  }

  headerEl.style.display = "none";
}

/* =========================================================
 [11610] Matching Renderer:renderMatchingTable【DOM】【State】（旧 [7810]）
========================================================= */
function renderMatchingTable() {

  ensureAreaSummaryStyles();
  setThemeHeaderColor(
    State.matchingContext?.mode === "preview" ? "preview" : "matching"
  );

  const area =
    document.getElementById(
      "matchingArea"
    );

  if (!area) return;

  area.innerHTML = `
    ${buildSummaryModeNavHTML("both")}
    ${buildPhaseCycleMonitorHTML(
      State.matchingContext
        ?.evaluationTimeMs ??
      Date.now()
    )}

    <div
      id="matchingRankCounts"
      class="mt10"
      style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px;"
    >
      ${buildMatchingRankCountsHTML()}
    </div>

    <div style="overflow-x:auto;">

      <table>

        <thead>
          <tr>
            <th>★・PRIDE</th>
            <th>プレイヤー名</th>
            <th>エリア</th>
            <th>店舗名</th>
            <th>RP</th>
            <th>Last Update</th>
                        <th>称号</th>
          </tr>
        </thead>

        <tbody id="matchingTableBody"></tbody>

      </table>

    </div>
  `;

  bindSummaryModeButtons(area);

  renderMatchingRows(
    State.matchingList
  );
}

/* =========================================================
 [11620] Matching Renderer:renderMatchingRows【DOM】（旧 [7820]）
========================================================= */
function renderMatchingRows(
  list
) {

  // ✅ 修正：ここでは除外しない
  // すでに候補生成段階で処理済

  renderPlayerRowsToBody(
    "matchingTableBody",
    list
  );

}

/* =========================================================
 [11700] Log Output:appendLog【DOM】【永続化】（旧 [9000]）
========================================================= */
function appendLog(
  msg,
  type = "info"
) {

  /* =====================================
   * ログフィルタ
   * ===================================== */

  if (
    !allowLog(msg, type)
  ) {
    return;
  }

  const box =
    document.getElementById(
      "logBox"
    );

  const t =
    getNowLabelJa();

  if (box) {

    const line =
      document.createElement(
        "div"
      );

    line.textContent =
      `[${t}] ${msg}`;

    line.dataset.type =
      type;

    if (
      type === "error"
    ) {

      line.style.color =
        "#ff5555";

    } else if (
      type === "warn" ||
      String(msg).includes("人口枠調整=")
    ) {

      line.style.color =
        "#ffeb3b";

    } else {

      line.style.color =
        "#00ff00";
    }

    box.prepend(line);

    while (
      box.children.length >
      MAX_LOG_LINES
    ) {

      box.removeChild(
        box.lastChild
      );
    }
  }

  if (
    type === "warn" ||
    type === "error"
  ) {
    logEvent(
      "runtime",
      {
        logSchemaVersion:
          "phase_score_v2",
        severity: type,
        message: String(msg ?? ""),
        currentView:
          State.currentView || "",
        generatedAt:
          State.generatedAt || "",
        latestRound:
          State.latestRound || "",
        latestUpdateAt:
          State.latestUpdateAt || ""
      }
    );
  }
}

/* =========================================================
 [11710] Log Output:allowLog（旧 [9010]）
========================================================= */
function allowLog(
  message,
  type
) {

  if (type === "error") {
    return true;
  }

  if (
    message.includes(
      "Viewer 初期化中"
    )
  ) {
    return true;
  }

  if (
    message.includes(
      "初期データ取得完了"
    )
  ) {
    return true;
  }

  if (
    message.includes(
      "フィルタ結果"
    )
  ) {
    return true;
  }

  if (
    message.includes(
      "候補生成"
    )
  ) {

    return true;
  }

  if (
    message.includes("候補外対戦メモ") ||
    message.includes("候補外メモをクリップボードにコピー")
  ) {
    return true;
  }

  if (
    message.includes(
      "PREVIEWではコピー操作"
    )
  ) {
    return true;
  }

  if (
    message.startsWith(
      "コピー:"
    ) ||
    message.includes(
      "コピー取消"
    ) ||
    message.includes(
      "重複コピー"
    )
  ) {
    return true;
  }

  if (
    message.startsWith(
      "自分ランク変更"
    )
  ) {
    return true;
  }

  if (
    message.includes(
      "Reload完了"
    )
  ) {
    return true;
  }

  if (
    message.includes(
      "更新監視開始"
    )
  ) {
    return true;
  }

  if (
    message.includes("更新監視を開始しました") ||
    message.includes("更新監視中：") ||
    message.includes("update_watch_config.json 読み込み完了")
  ) {
    return true;
  }

  if (
    message.includes("Reload 世代確認") ||
    message.includes("Reload 世代不一致") ||
    message.includes("Reload 利用元")
  ) {
    return true;
  }

  if (
    message.includes(
      "先読み開始"
    )
  ) {
    return true;
  }

  if (
    message.includes(
      "先読み成功"
    )
  ) {
    return true;
  }

  if (
    message.includes(
      "先読み失敗"
    )
  ) {
    return true;
  }
  if (
    message.includes(
      "利用元:"
    )
  ) {
    return true;
  }

  if (
    message.includes(
      "通信時間"
    )
  ) {
    return true;
  }

  if (
    message.includes(
      "Timeout"
    )
  ) {
    return true;
  }

  return false;
}

const log =
  msg =>
    appendLog(
      msg,
      "info"
    );

const logWarn =
  msg =>
    appendLog(
      msg,
      "warn"
    );

const logError =
  msg =>
    appendLog(
      msg,
      "error"
    );




  const ViewerUI = {
    STATE,
    MAX_LOG_LINES,
    renderStars,
    buildFilterGroupHTML,
    getTextWidth,
    shortenStoreName,
    buildPhaseCycleWindowHTML,
    buildPhaseCycleRowHTML,
    buildPhaseCycleMonitorHTML,
    buildPlayerRowHTML,
    buildRankCountBadgesHTML,
    buildMatchingRankCountsHTML,
    switchDisplayView,
    startProgress,
    updateProgressBar,
    stopProgress,
    buildRubyFilters,
    buildPrideFilters,
    buildSummaryModeNavHTML,
    buildMatchingOffsetSelectHTML,
    ensureAreaSummaryStyles,
    bindSummaryModeButtons,
    getAreaSummaryRows,
    sortAreaSummaryRows,
    getAreaNavigationAreaNos,
    buildAreaSummaryHeaderHTML,
    bindAreaSortHeader,
    setThemeHeaderColor,
    getRankColor,
    getRankFillStyle,
    getRankLegendStyle,
    getRankShortLabel,
    renderAreaSummary,
    renderSummary,
    renderDetailTable,
    renderAreaDetailTable,
    renderPlayerRowsToBody,
    highlightMatchingRows,
    renderMatchingHeader,
    renderMatchingTable,
    renderMatchingRows,
    appendLog,
    allowLog,
    log,
    logWarn,
    logError
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ViewerUI;
  }
  if (typeof global !== "undefined") {
    global.ViewerUI = ViewerUI;
  }
  if (typeof globalThis !== "undefined") {
    Object.assign(globalThis, ViewerUI);
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
