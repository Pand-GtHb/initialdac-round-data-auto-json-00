const test = require('node:test');
const assert = require('node:assert/strict');

// Ensure browser globals are mocked for Node.js test environment
globalThis.window = {
  addEventListener: () => {},
  removeEventListener: () => {}
};
globalThis.document = {
  readyState: 'loading',
  getElementById: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {}
};
globalThis.history = {
  replaceState: () => {},
  pushState: () => {}
};
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {}
};
globalThis.indexedDB = {
  open: () => ({
    onupgradeneeded: null,
    onsuccess: null,
    onerror: null
  })
};

const ViewerUtils = require('../utils.js');
const ViewerDomain = require('../domain.js');
const ViewerPersistence = require('../persistence.js');
const ViewerData = require('../data.js');
const ViewerMatching = require('../matching.js');
const ViewerUI = require('../ui.js');
const ViewerApp = require('../app.js');
const ViewerMain = require('../main.js');

test('Main exports init and bootstrap lifecycle methods', () => {
  assert.equal(typeof ViewerMain.init, 'function');
  assert.equal(typeof ViewerMain.bootstrap, 'function');
});

test('bootstrap can be executed and prevents double execution', () => {
  let initCallCount = 0;
  const originalInit = ViewerApp.init;
  const originalGlobalInit = globalThis.init;
  ViewerApp.init = () => {
    initCallCount++;
  };
  globalThis.init = ViewerApp.init;

  // Reset flag for test
  globalThis.__viewerInitialized = false;

  ViewerMain.bootstrap();
  assert.equal(globalThis.__viewerInitialized, true);

  // Calling bootstrap again should be a no-op
  ViewerMain.bootstrap();
  assert.equal(initCallCount, 1, 'bootstrap should only initialize once');

  // Restore
  ViewerApp.init = originalInit;
  globalThis.init = originalGlobalInit;
});
