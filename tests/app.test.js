const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Ensure browser globals are mocked for Node.js test environment
globalThis.window = {
  addEventListener: () => {},
  removeEventListener: () => {}
};
globalThis.document = {
  getElementById: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {}
};
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {}
};

const ViewerUtils = require('../utils.js');
const ViewerDomain = require('../domain.js');
const ViewerPersistence = require('../persistence.js');
const ViewerData = require('../data.js');
const ViewerMatching = require('../matching.js');
const ViewerUI = require('../ui.js');
const ViewerApp = require('../app.js');

test('App constants and configuration are exported', () => {
  assert.equal(typeof ViewerApp.BASE_URL, 'string');
  assert.equal(ViewerApp.STATE.SUMMARY, 'summary');
  assert.equal(ViewerApp.STATE.DETAIL, 'detail');
  assert.equal(ViewerApp.STATE.MATCHING, 'matching');
  assert.equal(ViewerApp.DEFAULT_FILTER_MINUTES, 30);
  assert.equal(ViewerApp.DEFAULT_MY_RANK_KEY, 'R7');
  assert.equal(typeof ViewerApp.ANALYSIS_SCRIPT_VERSION, 'string');
  assert.ok(Array.isArray(ViewerApp.ALL_CANDIDATES_COLUMNS));
  assert.ok(ViewerApp.ALL_CANDIDATES_COLUMNS.includes('slotScore'));
});

test('State object initialization and view state helpers', () => {
  assert.ok(Array.isArray(ViewerApp.State.all));
  assert.ok(Array.isArray(ViewerApp.State.filtered));
  assert.ok(Array.isArray(ViewerApp.State.matchingList));
  assert.equal(typeof ViewerApp.State.pinkTargets, 'object');

  ViewerApp.setCurrentView(ViewerApp.STATE.SUMMARY);
  assert.equal(ViewerApp.isCurrentView(ViewerApp.STATE.SUMMARY), true);
  assert.equal(ViewerApp.isCurrentView(ViewerApp.STATE.MATCHING), false);

  ViewerApp.setCurrentView(ViewerApp.STATE.MATCHING);
  assert.equal(ViewerApp.isCurrentView(ViewerApp.STATE.MATCHING), true);

  // Reset to summary
  ViewerApp.setCurrentView(ViewerApp.STATE.SUMMARY);
});

test('syncMyRankSelection updates rank and clears candidate caches on change', () => {
  ViewerApp.State.matchingList = [{ name: 'Dummy' }];
  const updated = ViewerApp.syncMyRankSelection('R5');
  assert.equal(updated, 'R5');
  assert.equal(ViewerApp.State.myRankKey, 'R5');
  assert.equal(ViewerApp.State.matchingList.length, 0);

  // Restore default
  ViewerApp.syncMyRankSelection('R7');
  assert.equal(ViewerApp.State.myRankKey, 'R7');
});

test('analysisChecksum produces consistent 8-character hash', () => {
  const hash1 = ViewerApp.analysisChecksum({ test: 123 });
  const hash2 = ViewerApp.analysisChecksum({ test: 123 });
  const hash3 = ViewerApp.analysisChecksum({ test: 456 });

  assert.equal(hash1, hash2);
  assert.notEqual(hash1, hash3);
  assert.equal(hash1.length, 8);
});

test('buildSummaryPopulationText formats rank counts and percentages', () => {
  const total = 100;
  const rankCounts = {
    R1: 5, R2: 5, R3: 5, R4: 5, R5: 5, R6: 5, // low ruby: 30
    R7: 20, R8: 10,                           // high ruby: 30
    P_A: 10, P_B: 10, P_C: 20                 // pride: 40
  };

  const text = ViewerApp.buildSummaryPopulationText(total, rankCounts);
  assert.ok(text.includes('計100人'));
  assert.ok(text.includes('R1～6＝30人[30%]'));
  assert.ok(text.includes('R7～8＝30人[30%]'));
  assert.ok(text.includes('PRIDE帯＝40人[40%]'));
});

test('getPinkTarget and self-healing lookups', () => {
  assert.equal(ViewerApp.getPinkTarget(null), null);

  const testPlayer = {
    name: 'TEST_DRIVER',
    shopname: 'SEGA_AKIHABARA',
    starCnt: 7
  };

  // Initially null
  const identityKey = ViewerDomain.buildPlayerIdentityKey(testPlayer);
  delete ViewerApp.State.pinkTargets[identityKey];
  assert.equal(ViewerApp.getPinkTarget(testPlayer), null);

  // Register target for today
  ViewerApp.State.pinkTargets[identityKey] = {
    name: 'TEST_DRIVER',
    shopname: 'SEGA_AKIHABARA',
    dateKey: ViewerPersistence.buildDailyKey(),
    copiedAt: Date.now()
  };

  const target = ViewerApp.getPinkTarget(testPlayer);
  assert.ok(target);
  assert.equal(target.name, 'TEST_DRIVER');
});

test('browser entry loads all modules in correct order in index.html', () => {
  const htmlPath = path.join(__dirname, '..', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  const scriptMatches = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(m => m[1]);

  const scriptBaseNames = scriptMatches.map(s => s.split('?')[0]);

  const expectedOrder = [
    'utils.js',
    'domain.js',
    'persistence.js',
    'data.js',
    'matching.js',
    'ui.js',
    'app.js',
    'main.js'
  ];

  for (let i = 0; i < expectedOrder.length; i++) {
    const expected = expectedOrder[i];
    const actualIdx = scriptBaseNames.indexOf(expected);
    assert.ok(actualIdx >= 0, `Script ${expected} should be included in index.html`);
    if (i > 0) {
      const prev = expectedOrder[i - 1];
      const prevIdx = scriptBaseNames.indexOf(prev);
      assert.ok(
        actualIdx > prevIdx,
        `${prev} (index ${prevIdx}) must precede ${expected} (index ${actualIdx})`
      );
    }
  }
});
