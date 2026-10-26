const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const utilsSource = fs.readFileSync(path.join(__dirname, "..", "0100_utils.js"), "utf8");
const domainSource = fs.readFileSync(path.join(__dirname, "..", "0200_domain.js"), "utf8");
const persistenceSource = fs.readFileSync(path.join(__dirname, "..", "0300_persistence.js"), "utf8");
const dataSource = fs.readFileSync(path.join(__dirname, "..", "0400_data.js"), "utf8");
const matchingSource = fs.readFileSync(path.join(__dirname, "..", "0500_matching.js"), "utf8");
const uiSource = fs.readFileSync(path.join(__dirname, "..", "0600_ui.js"), "utf8");
const appSource = fs.readFileSync(path.join(__dirname, "..", "0700_app.js"), "utf8");
const indexSource = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

function createUIContext(customState = {}) {
  const context = vm.createContext({
    console,
    Math,
    Date,
    Set,
    Map,
    Array,
    Object,
    Number,
    String,
    Boolean,
    JSON,
    State: customState,
    document: {
      createElement: (tag) => {
        if (tag === "canvas") {
          return {
            getContext: () => ({
              measureText: (text) => ({ width: text.length * 10 }),
              font: ""
            })
          };
        }
        return {};
      },
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => []
    }
  });
  vm.runInContext(utilsSource, context);
  vm.runInContext(domainSource, context);
  vm.runInContext(persistenceSource, context);
  vm.runInContext(dataSource, context);
  vm.runInContext(matchingSource, context);
  vm.runInContext(uiSource, context);
  return context;
}

test("renderStars outputs correct stars and line breaks", () => {
  const context = createUIContext();
  const { renderStars } = context.ViewerUI;

  assert.equal(renderStars(0), "");
  assert.equal(renderStars(null), "");
  assert.equal(renderStars(1), "★");
  assert.equal(renderStars(3), "★★★");
  assert.equal(renderStars(4), "★★★★");
  assert.equal(renderStars(5), "★★★★<br>★");
  assert.equal(renderStars(7), "★★★★<br>★★★");
  assert.equal(renderStars(8), "★★★★<br>★★★★");
});

test("Phase monitor uses the same configured scale, trust and base cycle as scoring", () => {
  const context = createUIContext();
  vm.runInContext(appSource, context);
  context.State.scoringConfig = {
    phase: { yellow: { baseCycleSec: 360, minSamples: 8 } },
    phaseError: { yellowScaleSec: 120 }
  };
  context.State.yellowSamples = [{}, {}];
  context.State.phaseAdjust.yellow = 0;
  const scales = [];
  context.getFilterToMs = now => now;
  context.readRangeMinutes = () => 15;
  context.formatClockHms = () => "12:00:00";
  context.formatClockHm = () => "12:00";
  context.ViewerDomain = {
    ...context.ViewerDomain,
    getPhaseWindowHalfWidthSec: (...args) => {
      scales.push(args[4]);
      return 30;
    }
  };
  // Reload the UI module so its domain helper binding uses the recording function.
  vm.runInContext(uiSource, context);
  const html = context.ViewerUI.buildPhaseCycleRowHTML("yellow", Date.now());
  assert.match(html, /基準360秒/);
  assert.match(html, /信頼度50%/);
  assert.doesNotMatch(html, /採点には乗算しない|周期の根拠/);
  assert.ok(scales.length > 0);
  assert.ok(scales.every(scale => scale === 120));
});

test("buildFilterGroupHTML generates expected checkbox labels", () => {
  const context = createUIContext();
  const { buildFilterGroupHTML } = context.ViewerUI;

  const items = [{ id: 1, name: "Item1" }, { id: 2, name: "Item2" }];
  const html = buildFilterGroupHTML(items, {
    labelClass: "chk-label",
    inputClass: "chk-input",
    getValue: item => item.id,
    getText: item => item.name
  });

  assert.ok(html.includes('class="filter-row"'));
  assert.ok(html.includes('value="1"'));
  assert.ok(html.includes('Item1'));
  assert.ok(html.includes('value="2"'));
  assert.ok(html.includes('Item2'));
});

test("Pink monitor shows compact cycle and interval trust without learning evidence row", () => {
  const context = createUIContext();
  vm.runInContext(appSource, context);
  context.State.scoringConfig = {
    phase: { pink: { baseCycleSec: 345, maxShiftSec: 45, minSamples: 8 } },
    phaseError: {}
  };
  context.State.phaseAdjust.pink = 2.2;
  context.State.pinkTargets = {};
  context.State.pinkCycleState = {
    version: 1, source: "encounter-learning", sampleCount: 3,
    trust: Math.sqrt(3 / 8), lastLearnedAt: 1792300000000
  };
  context.getFilterToMs = now => now;
  context.readRangeMinutes = () => 15;
  context.formatClockHms = () => "12:00:00";
  context.formatClockHm = () => "12:00";
  const html = context.ViewerUI.buildPhaseCycleRowHTML("pink", Date.now());
  assert.match(html, /347\.2秒/);
  assert.match(html, /当日間隔の信頼度0%/);
  assert.doesNotMatch(html, /採点には乗算しない|周期の根拠|保存周期の学習|当日再対戦|最終学習/);
  assert.match(html, /許容幅はdecay反映/);
});

test("shortenStoreName abbreviates long Japanese store names", () => {
  const context = createUIContext();
  const { shortenStoreName } = context.ViewerUI;

  assert.equal(shortenStoreName(""), "");
  assert.equal(shortenStoreName("秋葉原店"), "秋葉原店");

  // Under 18 zenkaku characters stays unchanged
  const normalStore = "ラウンドワン池袋店";
  assert.equal(shortenStoreName(normalStore), normalStore);

  // Very long Japanese store name gets shortened with ellipsis
  const veryLongStore = "ナムコランドプラザ東京新宿東口駅前中央通りメガステージ店";
  const shortened = shortenStoreName(veryLongStore);
  assert.ok(shortened.includes("…"));
});

test("Rank styling helpers return expected colors and labels", () => {
  const context = createUIContext();
  const { getRankColor, getRankShortLabel, getRankLegendStyle } = context.ViewerUI;

  assert.equal(getRankColor("R1"), "#dc2626");
  assert.equal(getRankColor("R7"), "#3b82f6");
  assert.equal(getRankColor("P_A"), "#eab308");
  assert.equal(getRankColor("P_G"), "#c026d3");
  assert.equal(getRankColor("UNKNOWN"), "#999");

  assert.equal(getRankShortLabel("R1"), "★1");
  assert.equal(getRankShortLabel("R7"), "★7");
  assert.equal(getRankShortLabel("P_A"), "A");
  assert.equal(getRankShortLabel("P_G"), "G");

  const style = getRankLegendStyle("R7");
  assert.ok(style.includes("background: #3b82f6"));
});

test("buildRankCountBadgesHTML renders badges for candidates", () => {
  const context = createUIContext();
  const { buildRankCountBadgesHTML } = context.ViewerUI;

  const players = [
    { __rankKey: "R7" },
    { __rankKey: "R7" },
    { __rankKey: "P_A" }
  ];

  const html = buildRankCountBadgesHTML(players);
  assert.ok(html.includes("★7"));
  assert.ok(html.includes("2人"));
  assert.ok(html.includes("A=～99"));
  assert.ok(html.includes("1人"));
});

test("allowLog correctly filters noise logs while allowing essential messages", () => {
  const context = createUIContext();
  const { allowLog } = context.ViewerUI;

  assert.equal(allowLog("データ取得中: 50%"), false);
  assert.equal(allowLog("通信時間: 200ms"), true);
  assert.equal(allowLog("Timeout発生"), true);
  assert.equal(allowLog("候補生成: Base=10"), true);
  assert.equal(allowLog("更新監視を開始しました"), true);
});

test("browser entry loads UI globals in correct order", () => {
  assert.match(
    indexSource,
    /<script src="0100_utils\.js\?cb=\d+"><\/script>\s*<script src="0200_domain\.js\?cb=\d+"><\/script>\s*<script src="0300_persistence\.js\?cb=\d+"><\/script>\s*<script src="0400_data\.js\?cb=\d+"><\/script>\s*<script src="0500_matching\.js\?cb=\d+"><\/script>\s*<script src="0600_ui\.js\?cb=\d+"><\/script>\s*<script src="0700_app\.js\?cb=\d+"><\/script>\s*<script src="0800_main\.js\?cb=\d+"><\/script>/
  );

  const context = createUIContext();
  assert.ok(context.ViewerUI);
  assert.equal(typeof context.ViewerUI.renderStars, "function");
  assert.equal(typeof context.ViewerUI.buildFilterGroupHTML, "function");
  assert.equal(typeof context.ViewerUI.renderSummary, "function");
  assert.equal(typeof context.ViewerUI.setThemeHeaderColor, "function");
});

test("setThemeHeaderColor updates root CSS property", () => {
  let setPropKey = null;
  let setPropVal = null;
  const context = createUIContext();
  context.document.documentElement = {
    style: {
      setProperty: (k, v) => {
        setPropKey = k;
        setPropVal = v;
      }
    }
  };

  context.ViewerUI.setThemeHeaderColor("area");
  assert.equal(setPropKey, "--theme-header-color");
  assert.equal(setPropVal, "#7c3fb3");

  context.ViewerUI.setThemeHeaderColor("matching");
  assert.equal(setPropVal, "#e91e63");
});

test("AREA search skips Phase and chart aggregation while unfiltered view retains it", () => {
  const context = createUIContext({ searchText: "PLAYER" });
  const area = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [] };
  context.document.getElementById = id => id === "summaryArea" ? area
    : id === "area-summary-view-styles" ? {} : null;
  const player = { name: "PLAYER", area: "1" };
  let filterCalls = 0;
  let phaseCalls = 0;
  let players = [{ key: "R7", list: [player] }];
  context.filterSummaryBySearch = () => {
    filterCalls++;
    return players;
  };
  context.isCopiedPlayer = () => false;
  context.isMatchingCandidateByPhase = () => {
    phaseCalls++;
    return true;
  };
  context.getAreaDisplayName = key => `AREA_${key}`;
  context.buildSummaryPopulationText = total => `TOTAL_${total}`;

  context.ViewerUI.renderAreaSummary();
  assert.equal(filterCalls, 1);
  assert.equal(phaseCalls, 0);
  assert.match(area.innerHTML, /areaSummarySearchResultBody/);
  assert.doesNotMatch(area.innerHTML, /area-summary-list/);

  players = [];
  context.ViewerUI.renderAreaSummary();
  assert.equal(filterCalls, 2);
  assert.equal(phaseCalls, 0);
  assert.doesNotMatch(area.innerHTML, /areaSummarySearchResultBody|area-summary-list/);

  players = [{ key: "R7", list: [player] }];
  context.State.searchText = "";
  context.ViewerUI.renderAreaSummary();
  assert.equal(filterCalls, 3);
  assert.equal(phaseCalls, 1);
  assert.match(area.innerHTML, /TOTAL_1/);
  assert.match(area.innerHTML, /area-summary-list/);
});
