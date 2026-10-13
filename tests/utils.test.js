const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const utilitySource = fs.readFileSync(
  path.join(__dirname, "..", "0100_utils.js"),
  "utf8"
);
const indexSource = fs.readFileSync(
  path.join(__dirname, "..", "index.html"),
  "utf8"
);
const context = vm.createContext({});
vm.runInContext(utilitySource, context);
const utils = context.ViewerUtils;

test("normalize preserves Japanese search normalization", () => {
  assert.equal(
    utils.normalize("  AbC\u3000\u3042\u3044\u3046 123  "),
    "\uff41\uff42\uff43\u30a2\u30a4\u30a6\uff11\uff12\uff13"
  );
  assert.equal(utils.normalize(null), "");
});

test("normalizePlayerName preserves NFKC name normalization", () => {
  assert.equal(
    utils.normalizePlayerName(" \uff21\uff22\uff23\u3000\uff76\uff9e "),
    " ABC \u30ac "
  );
  assert.equal(utils.normalizePlayerName(null), "");
});

test("formatting and text-width helpers preserve their outputs", () => {
  assert.equal(utils.fmt("1234567"), "1,234,567");
  assert.equal(utils.getZenkakuLength("AB\u3042"), 2);
  assert.equal(utils.getZenkakuLength(""), 0);
  assert.equal(utils.isMostlyAscii("abc\u3042"), true);
  assert.equal(utils.isMostlyAscii("ab\u3042"), false);
  assert.equal(utils.isMostlyAscii(""), true);
});

test("cycle and adjustment calculations preserve exact numeric results", () => {
  assert.equal(utils.foldToCycle(90, 100), -10);
  assert.equal(utils.foldToCycle(-60, 100), -60);
  assert.equal(
    utils.updateAdjust(0.2, 0.6, 0.25),
    0.30000000000000004
  );
  assert.equal(utils.clamp(-2, 0, 1), 0);
  assert.equal(utils.clamp(2, 0, 1), 1);
  assert.ok(Number.isNaN(utils.clamp(NaN, 0, 1)));
});

test("outlier rejection preserves values and the all-rejected fallback", () => {
  assert.deepEqual(
    Array.from(utils.rejectFoldedOutliers([1, 20, -2], 5)),
    [1, -2]
  );

  const values = [20, -30];
  assert.strictEqual(utils.rejectFoldedOutliers(values, 5), values);
  assert.strictEqual(utils.rejectFoldedOutliers(values, 0), values);
});

test("legacy global helper names remain available", () => {
  for (const name of [
    "normalize",
    "normalizePlayerName",
    "getZenkakuLength",
    "isMostlyAscii",
    "foldToCycle",
    "updateAdjust",
    "clamp",
    "rejectFoldedOutliers"
  ]) {
    assert.strictEqual(context[name], utils[name]);
  }
});

test("browser entry loads utility globals before the application", () => {
  assert.match(
    indexSource,
    /<script src="0100_utils\.js\?cb=\d+"><\/script>\s*<script src="0200_domain\.js\?cb=\d+"><\/script>\s*<script src="0300_persistence\.js\?cb=\d+"><\/script>\s*<script src="0400_data\.js\?cb=\d+"><\/script>\s*<script src="0500_matching\.js\?cb=\d+"><\/script>\s*<script src="0600_ui\.js\?cb=\d+"><\/script>\s*<script src="0700_app\.js\?cb=\d+"><\/script>\s*<script src="0800_main\.js\?cb=\d+"><\/script>/
  );

  vm.runInContext(
    "const { normalize: importedNormalize } = globalThis.ViewerUtils;" +
      "globalThis.importedNormalizeResult = importedNormalize('ABC');",
    context
  );
  assert.equal(
    context.importedNormalizeResult,
    "\uff41\uff42\uff43"
  );
});
