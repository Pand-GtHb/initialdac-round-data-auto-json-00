const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { MessageChannel } = require("node:worker_threads");

const source = fs.readFileSync(path.join(__dirname, "..", "record-poc", "maintenance.js"), "utf8");
const scope = "https://example.test/record-poc/";
function setup({ registered = [], names = [], deleteError, timers = {} } = {}) {
  const deleted = [];
  const context = vm.createContext({
    module: { exports: {} }, MessageChannel, setTimeout, clearTimeout, ...timers,
    navigator: { serviceWorker: { getRegistrations: async () => registered } },
    caches: {
      keys: async () => names,
      delete: async name => {
        if (deleteError) throw deleteError;
        deleted.push(name);
        return true;
      }
    }
  });
  vm.runInContext(source, context);
  return { api: context.module.exports, deleted };
}
function worker(cache, otherTabs = 0) {
  return { postMessage: (message, ports) => ports[0].postMessage({ cache, otherTabs }) };
}

test("cache cleanup retains current, active and waiting generations and unrelated app caches", async () => {
  const { api, deleted } = setup({
    names: ["dac-record-poc-v95", "dac-record-poc-v96", "dac-record-poc-v97", `dac-record-poc-v${setup().api.version}`,
      "viewer-cache-v1", "dac-record-poc-other"],
    registered: [
      { scope, active: worker("dac-record-poc-v96"), waiting: worker("dac-record-poc-v97") },
      { scope: "https://example.test/viewer/", active: { postMessage: () => assert.fail("Unrelated worker queried") } }
    ]
  });
  assert.equal(await api.cleanOldCaches(scope), 1);
  assert.deepEqual(deleted, ["dac-record-poc-v95"]);
});

test("unknown legacy worker stops cleanup without guessing which cache is safe", async () => {
  const { api, deleted } = setup({
    names: ["dac-record-poc-v95"],
    registered: [{ scope, active: { postMessage() {} } }],
    timers: { setTimeout: callback => setImmediate(callback), clearTimeout: clearImmediate }
  });
  await assert.rejects(api.cleanOldCaches(scope), /タブをすべて閉じ/);
  assert.deepEqual(deleted, []);
});

test("malformed worker status and cache deletion failures are explicit errors", async () => {
  const invalid = setup({
    names: ["dac-record-poc-v95"],
    registered: [{ scope, active: worker("viewer-cache-v1") }]
  });
  await assert.rejects(invalid.api.cleanOldCaches(scope), /状態を確認できません/);
  assert.deepEqual(invalid.deleted, []);
  const failed = setup({ names: ["dac-record-poc-v95"], deleteError: new Error("quota storage failure") });
  await assert.rejects(failed.api.cleanOldCaches(scope), /quota storage failure/);
});

test("full cleanup refuses another app tab before unregistering or deleting caches", async () => {
  let unregistered = false;
  const { api, deleted } = setup({
    names: ["dac-record-poc-v98"],
    registered: [{ scope, active: worker("dac-record-poc-v98", 1),
      unregister: async () => { unregistered = true; return true; } }]
  });
  await assert.rejects(api.clearOffline(scope), /別タブ/);
  assert.equal(unregistered, false);
  assert.deepEqual(deleted, []);
});

test("full cleanup removes only the exact app registration and versioned app caches", async () => {
  let count = 0;
  const { api, deleted } = setup({
    names: ["dac-record-poc-v97", "dac-record-poc-v98", "viewer-cache-v1"],
    registered: [
      { scope, active: worker("dac-record-poc-v98"), unregister: async () => { count++; return true; } },
      { scope: "https://example.test/", unregister: async () => assert.fail("Unrelated registration removed") }
    ]
  });
  await api.clearOffline(scope);
  assert.equal(count, 1);
  assert.deepEqual(deleted, ["dac-record-poc-v97", "dac-record-poc-v98"]);
});

test("unregister failure stops full cleanup and leaves caches alone", async () => {
  const { api, deleted } = setup({
    names: ["dac-record-poc-v98"],
    registered: [{ scope, active: worker("dac-record-poc-v98"), unregister: async () => false }]
  });
  await assert.rejects(api.clearOffline(scope), /登録解除/);
  assert.deepEqual(deleted, []);
});

test("worker reports other app windows only, excluding the requesting page and unrelated scopes", async () => {
  const handlers = {};
  const context = vm.createContext({
    URL,
    self: {
      registration: { scope },
      addEventListener: (type, handler) => { handlers[type] = handler; },
      clients: { matchAll: async () => [
        { id: "requester", url: `${scope}index.html` },
        { id: "other", url: `${scope}index.html?v=98` },
        { id: "viewer", url: "https://example.test/viewer/index.html" },
        { id: "similar", url: "https://example.test/record-poc-other/" }
      ] }
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "record-poc", "sw.js"), "utf8"), context);
  let result, pending;
  handlers.message({
    data: { type: "DAC_MAINTENANCE_STATUS" }, source: { id: "requester" },
    ports: [{ postMessage: value => { result = value; } }],
    waitUntil: operation => { pending = operation; }
  });
  await pending;
  assert.equal(result.otherTabs, 1);
});

test("worker caches app assets but does not intercept Viewer requests on the same origin", async () => {
  const handlers = {};
  const context = vm.createContext({
    URL,
    self: {
      registration: { scope },
      location: { origin: "https://example.test" },
      addEventListener: (type, handler) => { handlers[type] = handler; }
    },
    caches: { open: async () => ({ match: async () => "cached app" }) }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "record-poc", "sw.js"), "utf8"), context);
  let response;
  const request = url => handlers.fetch({
    request: { method: "GET", url },
    respondWith: value => { response = value; }
  });
  request(`${scope}index.html`);
  assert.equal(await response, "cached app");
  response = undefined;
  request("https://example.test/viewer/index.html");
  assert.equal(response, undefined);
  request("https://other.example/viewer/");
  assert.equal(response, undefined);
});
