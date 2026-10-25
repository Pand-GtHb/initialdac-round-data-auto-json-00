const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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

const ViewerUtils = require('../0100_utils.js');
const ViewerDomain = require('../0200_domain.js');
const ViewerPersistence = require('../0300_persistence.js');
const ViewerData = require('../0400_data.js');
const ViewerMatching = require('../0500_matching.js');
const ViewerUI = require('../0600_ui.js');
const ViewerApp = require('../0700_app.js');
const ViewerMain = require('../0800_main.js');

test('Main exports init and bootstrap lifecycle methods', () => {
  assert.equal(typeof ViewerMain.init, 'function');
  assert.equal(typeof ViewerMain.bootstrap, 'function');
});

test('bootstrap can be executed and prevents double execution', async () => {
  let initCallCount = 0;
  const originalInit = ViewerApp.init;
  const originalGlobalInit = globalThis.init;
  ViewerApp.init = () => {
    initCallCount++;
  };
  globalThis.init = ViewerApp.init;

  // Reset flag for test
  globalThis.__viewerInitialized = false;

  await ViewerMain.bootstrap();
  assert.equal(globalThis.__viewerInitialized, true);

  // Calling bootstrap again should be a no-op
  await ViewerMain.bootstrap();
  assert.equal(initCallCount, 1, 'bootstrap should only initialize once');

  // Restore
  ViewerApp.init = originalInit;
  globalThis.init = originalGlobalInit;
});

test('bootstrap gates matching until ready and reports initialization failure', async () => {
  for (const fail of [false, true]) {
    let finish;
    const messages = [];
    let stopped = false;
    const button = {};
    const recoveryButton = {};
    let recoveryCalls = 0;
    const context = vm.createContext({
      console,
      document: {
        readyState: 'loading',
        addEventListener() {},
        getElementById: id => id === 'matchingBtn' ? button :
          id === 'recoverCopyLogBtn' ? recoveryButton : null
      },
      history: { replaceState() {}, pushState() {} },
      ViewerApp: {
        STATE: { SUMMARY: 'summary' },
        ensureReloadViewerTime() {},
        exportCopyRecovery20261025: () => { recoveryCalls++; },
        stopProgress: () => { stopped = true; },
        init: () => new Promise((resolve, reject) => {
          finish = () => fail ? reject(new Error('invalid config')) : resolve();
        })
      },
      ViewerUI: { logError: message => messages.push(message) }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '0800_main.js'), 'utf8'), context);
    const initialization = context.ViewerMain.bootstrap();
    assert.equal(recoveryButton.disabled, false);
    recoveryButton.onclick();
    assert.equal(recoveryCalls, 1);
    assert.equal(button.disabled, true);
    finish();
    await initialization;
    assert.equal(button.disabled, fail);
    assert.equal(stopped, fail);
    assert.equal(messages.length, fail ? 1 : 0);
    if (fail) assert.match(messages[0], /invalid config/);
  }
});
