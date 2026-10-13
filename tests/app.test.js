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
  addEventListener: () => {},
  createElement: (tag) => ({
    getContext: () => ({ measureText: (s) => ({ width: (s || '').length * 8 }) }),
    style: {}
  })
};
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {}
};

const ViewerUtils = require('../0100_utils.js');
const ViewerDomain = require('../0200_domain.js');
const ViewerPersistence = require('../0300_persistence.js');
const ViewerData = require('../0400_data.js');
const ViewerMatching = require('../0500_matching.js');
const ViewerUI = require('../0600_ui.js');
const ViewerApp = require('../0700_app.js');

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
    '0100_utils.js',
    '0200_domain.js',
    '0300_persistence.js',
    '0400_data.js',
    '0500_matching.js',
    '0600_ui.js',
    '0700_app.js',
    '0800_main.js'
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

test('ViewerApp delegates matching and candidate calculations correctly', () => {
  assert.equal(typeof ViewerApp.calcMatchingScoreDetail, 'function');
  assert.equal(typeof ViewerApp.buildCandidateScore, 'function');
  assert.equal(typeof ViewerApp.buildMatchingCandidates, 'function');

  // Provide mock player for score calculation
  const mockPlayer = {
    name: 'TEST_DELEGATE_PLAYER',
    shopname: 'TEST_SHOP',
    starCnt: 7,
    areaNo: 1,
    time: Date.now() - 60000
  };

  const scoreDetail = ViewerApp.calcMatchingScoreDetail(mockPlayer, {
    baseNow: Date.now(),
    myRankKey: 'R7'
  });

  assert.ok(scoreDetail);
  assert.equal(typeof scoreDetail.score, 'number');
  assert.ok(Number.isFinite(scoreDetail.score));

  const candidateScore = ViewerApp.buildCandidateScore(mockPlayer);
  assert.equal(typeof candidateScore, 'object');
  assert.equal(typeof candidateScore.__score, 'number');
  assert.ok(Number.isFinite(candidateScore.__score));
});

test('ViewerApp persistence wrappers interact with State and storage correctly', () => {
  assert.equal(typeof ViewerApp.savePinkStateToStorage, 'function');
  assert.equal(typeof ViewerApp.restorePinkStateFromStorage, 'function');
  assert.equal(typeof ViewerApp.checkAndCleanDailyState, 'function');

  // Mock localStorage for test
  let storedData = {};
  globalThis.localStorage = {
    getItem: (k) => storedData[k] ?? null,
    setItem: (k, v) => { storedData[k] = String(v); },
    removeItem: (k) => { delete storedData[k]; },
    clear: () => { storedData = {}; }
  };

  const todayKey = ViewerPersistence.buildDailyKey();
  ViewerApp.State.pinkTargets['test_key'] = {
    name: 'TEST_PERSIST_PLAYER',
    dailyKey: todayKey,
    copiedAt: Date.now()
  };

  ViewerApp.savePinkStateToStorage();
  assert.ok(storedData[ViewerPersistence.PERSIST_STATE_KEY]);

  // Clear in-memory state and restore
  ViewerApp.State.pinkTargets = {};
  ViewerApp.restorePinkStateFromStorage();
  assert.ok(ViewerApp.State.pinkTargets['test_key']);
  assert.equal(ViewerApp.State.pinkTargets['test_key'].name, 'TEST_PERSIST_PLAYER');
});

test('exportTodayViewerLogsAsJSON uses active LogDB and exports candidateEvents', async () => {
  const now = Date.now();
  let downloadedContent = null;
  let downloadedFilename = null;

  // Mock document.createElement and URL for Node test environment
  const origCreateElement = globalThis.document.createElement;
  const origCreateObjectURL = globalThis.URL?.createObjectURL;
  const origRevokeObjectURL = globalThis.URL?.revokeObjectURL;
  if (!globalThis.URL) globalThis.URL = {};
  globalThis.URL.createObjectURL = () => 'blob:mock-url';
  globalThis.URL.revokeObjectURL = () => {};

  globalThis.document.createElement = (tag) => {
    if (tag === 'a') {
      return {
        set href(v) {},
        set download(v) { downloadedFilename = v; },
        click: () => {}
      };
    }
    return null;
  };

  // Intercept Blob constructor or capture before downloadBlob
  // In Node 18+, Blob is globally available. We can intercept downloadBlob via Blob.text or mock Blob
  const origBlob = globalThis.Blob;
  globalThis.Blob = class MockBlob {
    constructor(parts, opts) {
      downloadedContent = parts.join('');
      this.parts = parts;
      this.opts = opts;
    }
  };

  // Mock mockLogDB
  const mockCandidates = [
    { id: 1, t: now, candidates: [{ name: 'TEST_P1' }] }
  ];
  const mockEvents = [
    { id: 2, t: now, e: 'runtime', message: 'test' }
  ];

  const mockDb = {
    transaction: (stores, mode) => {
      return {
        objectStore: (storeName) => {
          return {
            getAll: () => {
              const req = { onsuccess: null, onerror: null };
              setTimeout(() => {
                req.result = storeName === ViewerPersistence.LOG_STORE.candidateEvents
                  ? mockCandidates
                  : mockEvents;
                if (req.onsuccess) req.onsuccess();
              }, 0);
              return req;
            }
          };
        }
      };
    }
  };

  ViewerPersistence.setLogDB(mockDb);

  await ViewerApp.exportTodayViewerLogsAsJSON();

  assert.ok(downloadedContent, 'downloadBlob should be called with blob content');
  assert.ok(downloadedFilename.startsWith('viewer_analysis_'), 'filename should match viewer_analysis pattern');

  const parsed = JSON.parse(downloadedContent);
  assert.equal(parsed.candidateEvents.length, 1);
  assert.equal(parsed.candidateEvents[0].candidates[0].name, 'TEST_P1');
  assert.equal(parsed.runtimeEvents.length, 1);

  // Restore mocks
  globalThis.document.createElement = origCreateElement;
  globalThis.URL.createObjectURL = origCreateObjectURL;
  globalThis.URL.revokeObjectURL = origRevokeObjectURL;
  globalThis.Blob = origBlob;
  ViewerPersistence.setLogDB(null);
});

test('buildMatchingCandidates correctly integrates normal, crossBucket and wildcard slots', () => {
  // Mock checkbox selection so UI filter passes all stars
  const origQSA = globalThis.document.querySelectorAll;
  globalThis.document.querySelectorAll = (selector) => {
    if (selector.includes('.ruby-filter:checked')) {
      return [{ value: '6' }, { value: '7' }];
    }
    if (selector.includes('.pride-filter:checked')) {
      return [];
    }
    return [];
  };

  // Setup 15 mock players across R6 and R7
  const mockPlayers = [];
  for (let i = 1; i <= 15; i++) {
    mockPlayers.push({
      name: `PLAYER_${i}`,
      shopname: `SHOP_${i}`,
      onlineBattleRankId: ViewerDomain.RUBY_ID,
      starCnt: i <= 10 ? 6 : 7,
      areaNo: 1,
      time: Date.now() - 60000,
      updateDate: '2026/10/13 15:00:00'
    });
  }

  ViewerApp.State.filtered = mockPlayers;
  ViewerApp.State.myRankKey = 'R6';

  ViewerApp.buildMatchingCandidates({ saveEvent: false });
  const candidates = ViewerApp.State.matchingList;
  assert.ok(Array.isArray(candidates));
  assert.ok(candidates.length <= 10);
  assert.ok(candidates.length >= 8);

  // Check if at least one wildcard or crossBucket was selected
  const hasSpecial = candidates.some(p => p.__crossBucket || p.__wildcard);
  assert.ok(hasSpecial, 'Should have selected cross-bucket or wildcard candidate');

  globalThis.document.querySelectorAll = origQSA;
});

test('applyMatchingFilter handles cross-search between MATCHING candidates and RANK summary', () => {
  // Setup mock DOM elements
  const elements = {};
  const createMockEl = (id) => ({
    id,
    style: {},
    textContent: '',
    innerHTML: '',
    querySelectorAll: () => []
  });

  const ids = [
    'matchingRankCounts',
    'matchingSearchResultsHeader',
    'matchingSearchResultsTitle',
    'matchingCandidateEmptyMessage',
    'matchingTableWrapper',
    'matchingCrossRankSection',
    'matchingCrossRankTitle',
    'matchingCrossRankEmptyMessage',
    'matchingCrossRankTableWrapper',
    'matchingTableBody',
    'matchingCrossRankTableBody'
  ];
  ids.forEach(id => { elements[id] = createMockEl(id); });

  const origGetElementById = globalThis.document.getElementById;
  globalThis.document.getElementById = (id) => elements[id] || null;

  // Setup mock State data
  const pMatching = {
    name: 'MATCH_TARGET',
    normalizedName: ViewerUtils.normalize('MATCH_TARGET'),
    shopname: 'SHOP1',
    area: 'AREA1',
    onlineBattleRankId: ViewerDomain.RUBY_ID,
    starCnt: 6,
    updateDate: '2026/10/14 08:00:00'
  };
  const pRankOnly = {
    name: 'RANK_ONLY_TARGET',
    normalizedName: ViewerUtils.normalize('RANK_ONLY_TARGET'),
    shopname: 'SHOP2',
    area: 'AREA2',
    onlineBattleRankId: ViewerDomain.RUBY_ID,
    starCnt: 7,
    updateDate: '2026/10/14 08:00:00'
  };

  ViewerApp.State.matchingList = [pMatching];
  ViewerApp.State.summary = [
    { key: 'R6', label: '★6', list: [pMatching] },
    { key: 'R7', label: '★7', list: [pRankOnly] }
  ];

  // Case 1: Empty search keyword -> returns to normal view
  ViewerApp.applyMatchingFilter('');
  assert.equal(elements.matchingRankCounts.style.display, 'flex');
  assert.equal(elements.matchingSearchResultsHeader.style.display, 'none');
  assert.equal(elements.matchingTableWrapper.style.display, 'block');
  assert.equal(elements.matchingCrossRankSection.style.display, 'none');

  // Case 2: Search matching candidate
  ViewerApp.State.searchText = 'MATCH';
  ViewerApp.applyMatchingFilter('MATCH');
  assert.equal(elements.matchingRankCounts.style.display, 'none');
  assert.equal(elements.matchingSearchResultsHeader.style.display, 'block');
  assert.ok(elements.matchingSearchResultsTitle.textContent.includes('1名'));
  assert.equal(elements.matchingTableWrapper.style.display, 'block');
  assert.equal(elements.matchingCandidateEmptyMessage.style.display, 'none');
  assert.equal(elements.matchingCrossRankSection.style.display, 'block');

  // Case 3: Search rank-only player (not in MATCHING candidates, but in RANK)
  ViewerApp.State.searchText = 'RANK_ONLY';
  ViewerApp.applyMatchingFilter('RANK_ONLY');
  // Matching candidate should show 0 and empty message
  assert.ok(elements.matchingSearchResultsTitle.textContent.includes('0名'));
  assert.equal(elements.matchingTableWrapper.style.display, 'none');
  assert.equal(elements.matchingCandidateEmptyMessage.style.display, 'block');
  assert.ok(elements.matchingCandidateEmptyMessage.textContent.includes('見つかりませんでした'));
  // Cross rank section should show 1 player
  assert.equal(elements.matchingCrossRankSection.style.display, 'block');
  assert.ok(elements.matchingCrossRankTitle.textContent.includes('1名'));
  assert.equal(elements.matchingCrossRankTableWrapper.style.display, 'block');
  assert.equal(elements.matchingCrossRankEmptyMessage.style.display, 'none');

  // Case 4: Search non-existent player
  ViewerApp.State.searchText = 'UNKNOWN_PLAYER';
  ViewerApp.applyMatchingFilter('UNKNOWN_PLAYER');
  assert.ok(elements.matchingSearchResultsTitle.textContent.includes('0名'));
  assert.equal(elements.matchingTableWrapper.style.display, 'none');
  assert.equal(elements.matchingCandidateEmptyMessage.style.display, 'block');
  assert.ok(elements.matchingCrossRankTitle.textContent.includes('0名'));
  assert.equal(elements.matchingCrossRankTableWrapper.style.display, 'none');
  assert.equal(elements.matchingCrossRankEmptyMessage.style.display, 'block');

  // Restore mocks
  globalThis.document.getElementById = origGetElementById;
  ViewerApp.State.searchText = '';
});



