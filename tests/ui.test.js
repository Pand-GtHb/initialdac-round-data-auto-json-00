const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const utilsSource = fs.readFileSync(path.join(__dirname, "..", "utils.js"), "utf8");
const domainSource = fs.readFileSync(path.join(__dirname, "..", "domain.js"), "utf8");
const persistenceSource = fs.readFileSync(path.join(__dirname, "..", "persistence.js"), "utf8");
const dataSource = fs.readFileSync(path.join(__dirname, "..", "data.js"), "utf8");
const matchingSource = fs.readFileSync(path.join(__dirname, "..", "matching.js"), "utf8");
const uiSource = fs.readFileSync(path.join(__dirname, "..", "ui.js"), "utf8");
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
    /<script src="utils\.js\?cb=\d+"><\/script>\s*<script src="domain\.js\?cb=\d+"><\/script>\s*<script src="persistence\.js\?cb=\d+"><\/script>\s*<script src="data\.js\?cb=\d+"><\/script>\s*<script src="matching\.js\?cb=\d+"><\/script>\s*<script src="ui\.js\?cb=\d+"><\/script>\s*<script src="app\.js\?cb=\d+"><\/script>\s*<script src="main\.js\?cb=\d+"><\/script>/
  );

  const context = createUIContext();
  assert.ok(context.ViewerUI);
  assert.equal(typeof context.ViewerUI.renderStars, "function");
  assert.equal(typeof context.ViewerUI.buildFilterGroupHTML, "function");
  assert.equal(typeof context.ViewerUI.renderSummary, "function");
});
