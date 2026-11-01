const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const fs = require("node:fs");

const dataModule = require(path.join(__dirname, "..", "0400_data.js"));

test("Data constants and timeout mappings", () => {
  assert.equal(
    dataModule.PRODUCTION_BASE_URL,
    "https://pand-gthb.github.io/initialdac-round-data-auto-json-00"
  );
  assert.equal(dataModule.MAX_RETRY, 3);
  assert.equal(dataModule.DEFAULT_TIMEOUTS["latest_update.json"], 8000);
  assert.equal(dataModule.DEFAULT_TIMEOUTS["integrated_data.json"], 20000);
  assert.equal(dataModule.DEFAULT_TIMEOUTS.default, 10000);

  assert.equal(dataModule.getTimeoutForPath("latest_update.json"), 8000);
  assert.equal(dataModule.getTimeoutForPath("integrated_data.json"), 20000);
  assert.equal(dataModule.getTimeoutForPath("unknown.json"), 10000);
  assert.equal(
    dataModule.getTimeoutForPath("unknown.json", { default: 5000 }),
    5000
  );
});

test("getDefaultBaseUrl resolution rules", () => {
  // Production fallback
  assert.equal(dataModule.getDefaultBaseUrl(), dataModule.PRODUCTION_BASE_URL);

  // When VIEWER_BASE_URL is set
  globalThis.VIEWER_BASE_URL = "https://custom.example.com";
  assert.equal(dataModule.getDefaultBaseUrl(), "https://custom.example.com");
  delete globalThis.VIEWER_BASE_URL;
});

test("fetchJSON successfully fetches and parses JSON with headers and cache busting", async () => {
  let requestedUrl = null;
  let requestedHeaders = null;

  const mockFetch = async (url, options) => {
    requestedUrl = url;
    requestedHeaders = options.headers;
    return {
      ok: true,
      status: 200,
      json: async () => ({ round: 42 })
    };
  };

  const loggedMessages = [];
  const result = await dataModule.fetchJSON("test.json", {
    baseUrl: "http://example.com/api",
    fetchImpl: mockFetch,
    now: () => 1700000000000,
    perfNow: () => 100,
    onLog: (msg) => loggedMessages.push(msg)
  });

  assert.deepEqual(result, { round: 42 });
  assert.equal(requestedUrl, "http://example.com/api/test.json?t=1700000000000");
  assert.equal(requestedHeaders["Cache-Control"], "no-cache, no-store, must-revalidate");
  assert.equal(requestedHeaders["Pragma"], "no-cache");
  assert.equal(loggedMessages.length, 1);
  assert.match(loggedMessages[0], /test\.json 通信時間:0ms/);
});

test("fetchJSON retries on failure up to maxRetry and logs timeouts", async () => {
  let callCount = 0;
  const mockFetch = async (url, options) => {
    callCount++;
    if (callCount < 3) {
      throw new Error(`Connection reset on attempt ${callCount}`);
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ successAfterRetry: true })
    };
  };

  let delaysCalled = [];
  const mockDelay = async (ms) => {
    delaysCalled.push(ms);
  };

  const result = await dataModule.fetchJSON("flaky.json", {
    fetchImpl: mockFetch,
    delay: mockDelay,
    baseUrl: ""
  });

  assert.deepEqual(result, { successAfterRetry: true });
  assert.equal(callCount, 3);
  assert.deepEqual(delaysCalled, [1000, 2000]);
});

test("fetchJSON throws after maxRetry attempts exhausted", async () => {
  let callCount = 0;
  const mockFetch = async () => {
    callCount++;
    throw new Error("Persistent network error");
  };

  let delaysCalled = [];
  const mockDelay = async (ms) => delaysCalled.push(ms);

  await assert.rejects(
    async () => {
      await dataModule.fetchJSON("unreachable.json", {
        fetchImpl: mockFetch,
        delay: mockDelay,
        maxRetry: 2
      });
    },
    { message: "Persistent network error" }
  );

  assert.equal(callCount, 2);
  assert.deepEqual(delaysCalled, [1000]);
});

test("fetchJSON keeps the timeout active while reading the response body", { timeout: 2000 }, async () => {
  const warnings = [];
  await assert.rejects(dataModule.fetchJSON("slow-body.json", {
    baseUrl: "",
    maxRetry: 1,
    timeouts: { default: 15 },
    onWarn: message => warnings.push(message),
    fetchImpl: async (_url, { signal }) => ({
      ok: true,
      json: () => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Body timed out", "AbortError")));
      })
    })
  }), { name: "AbortError" });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /slow-body\.json Timeout/);
});

test("Endpoint fetchers request correct file paths", async () => {
  const pathsRequested = [];
  const mockFetch = async (url) => {
    const parsedPath = url.split("?")[0].replace(/^\//, "");
    pathsRequested.push(parsedPath);
    return {
      ok: true,
      json: async () => ({})
    };
  };

  const opts = { fetchImpl: mockFetch, baseUrl: "" };

  await dataModule.fetchAreaListJson(opts);
  await dataModule.fetchLatestRoundJson(opts);
  await dataModule.fetchLatestUpdateJson(opts);
  await dataModule.fetchHistoricalMatchupDistributionJson(opts);
  await dataModule.fetchScoringConfigJson(opts);
  await dataModule.fetchUpdateWatchConfigJson(opts);
  await dataModule.fetchRoundDataJson(opts);

  assert.deepEqual(pathsRequested, [
    "areaList.json",
    "latest_round.json",
    "latest_update.json",
    "historical_matchup_distribution.json",
    "scoring_config.json",
    "update_watch_config.json",
    "integrated_data.json"
  ]);
});

test("browser entry loads data globals in correct order", () => {
  const indexSource = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.match(
    indexSource,
    /<script src="0100_utils\.js\?cb=\d+"><\/script>\s*<script src="0200_domain\.js\?cb=\d+"><\/script>\s*<script src="0300_persistence\.js\?cb=\d+"><\/script>\s*<script src="0400_data\.js\?cb=\d+"><\/script>\s*<script src="0500_matching\.js\?cb=\d+"><\/script>\s*<script src="0600_ui\.js\?cb=\d+"><\/script>\s*<script src="0700_app\.js\?cb=\d+"><\/script>\s*<script src="0800_main\.js\?cb=\d+"><\/script>/
  );
});

test("Concurrent integrated requests share one retry chain and release it after success", async () => {
  let finish;
  let calls = 0;
  const diagnostics = [];
  const fetchImpl = async () => {
    calls++;
    if (calls === 1) throw new Error("temporary offline");
    return new Promise(resolve => {
      finish = () => resolve({ ok: true, status: 200, json: async () => ({ generatedAt: "new" }) });
    });
  };
  const options = {
    fetchImpl, baseUrl: "", delay: async () => {}, onDiagnostic: d => diagnostics.push(d)
  };
  const first = dataModule.fetchRoundDataJson({ ...options, purpose: "prefetch" });
  const second = dataModule.fetchRoundDataJson({ ...options, purpose: "reload" });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
  finish();
  const results = await Promise.all([first, second]);
  assert.equal(results[0], results[1]);
  assert.deepEqual(diagnostics.map(d => d.result), ["shared", "error", "success"]);
  assert.equal(new Set(diagnostics.map(d => d.requestId)).size, 1);
  const next = dataModule.fetchRoundDataJson(options);
  assert.equal(calls, 3);
  finish();
  await next;
});

test("Shared rejection reaches every caller and does not cache the failure", async () => {
  let calls = 0;
  const options = {
    baseUrl: "", maxRetry: 1,
    fetchImpl: async () => { calls++; throw new Error("offline"); }
  };
  const results = await Promise.allSettled([
    dataModule.fetchRoundDataJson(options), dataModule.fetchRoundDataJson(options)
  ]);
  assert.equal(calls, 1);
  assert(results.every(result => result.status === "rejected" && result.reason.message === "offline"));
  await assert.rejects(dataModule.fetchRoundDataJson(options), /offline/);
  assert.equal(calls, 2);
});

test("Manifest sharing supports a fresh post-body check without reusing in-flight observations", async () => {
  const finishes = [];
  const options = {
    baseUrl: "",
    fetchImpl: () => new Promise(resolve => finishes.push(value =>
      resolve({ ok: true, json: async () => ({ lastUpdated: value }) })))
  };
  const watcher = dataModule.fetchLatestUpdateJson(options);
  const before = dataModule.fetchLatestUpdateJson(options);
  const after = dataModule.fetchLatestUpdateJson({ ...options, fresh: true });
  assert.equal(finishes.length, 2);
  finishes[1]("new");
  assert.equal((await after).lastUpdated, "new");
  finishes[0]("old");
  assert.equal((await watcher).lastUpdated, "old");
  assert.equal((await before).lastUpdated, "old");
  const next = dataModule.fetchLatestUpdateJson(options);
  assert.equal(finishes.length, 3);
  finishes[2]("new");
  await next;
});

test("Sharing isolates different origins, fetch implementations and timeout policies", async () => {
  const finishes = [];
  const fetchImpl = () => new Promise(resolve => finishes.push(() =>
    resolve({ ok: true, json: async () => ({}) })));
  const options = { fetchImpl, baseUrl: "http://one" };
  const promises = [
    dataModule.fetchRoundDataJson(options),
    dataModule.fetchRoundDataJson({ ...options, baseUrl: "http://two" }),
    dataModule.fetchRoundDataJson({ ...options, timeouts: { "integrated_data.json": 30000 } }),
    dataModule.fetchRoundDataJson({ ...options, fetchImpl: (...args) => fetchImpl(...args) })
  ];
  assert.equal(finishes.length, 4);
  finishes.forEach(finish => finish());
  await Promise.all(promises);
});

test("Fetch diagnostics distinguish response headers, body time, HTTP errors and retry attempts", async () => {
  let clock = 0;
  let calls = 0;
  const diagnostics = [];
  await dataModule.fetchJSON("integrated_data.json", {
    baseUrl: "", maxRetry: 2, delay: async () => {}, perfNow: () => clock,
    purpose: "reload", expectedGeneration: "new",
    onDiagnostic: d => diagnostics.push(d),
    fetchImpl: async () => {
      calls++;
      clock += 10;
      return {
        ok: calls > 1, status: calls === 1 ? 503 : 200,
        json: async () => { clock += 30; return { generatedAt: "new" }; }
      };
    }
  });
  assert.equal(diagnostics.length, 2);
  assert.equal(diagnostics[0].status, 503);
  assert.equal(diagnostics[0].result, "error");
  assert.equal(diagnostics[0].timedOut, false);
  assert.equal(diagnostics[1].attempt, 2);
  assert.equal(diagnostics[1].headersMs, 10);
  assert.equal(diagnostics[1].bodyMs, 30);
  assert.equal(diagnostics[1].elapsedMs, 40);
  assert.equal(diagnostics[1].generatedAt, "new");
  assert.equal(diagnostics[0].requestId, diagnostics[1].requestId);
});

test("Only the request timer is classified as timeout, not every AbortError", async () => {
  const warnings = [];
  const diagnostics = [];
  await assert.rejects(dataModule.fetchJSON("integrated_data.json", {
    maxRetry: 1, onWarn: message => warnings.push(message),
    onDiagnostic: d => diagnostics.push(d),
    fetchImpl: async () => { throw new DOMException("external abort", "AbortError"); }
  }), { name: "AbortError" });
  assert.equal(warnings.length, 0);
  assert.equal(diagnostics[0].timedOut, false);
  await assert.rejects(dataModule.fetchJSON("integrated_data.json", {
    maxRetry: 1, timeouts: { "integrated_data.json": 15 },
    onWarn: message => warnings.push(message), onDiagnostic: d => diagnostics.push(d),
    fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("timer abort", "AbortError")));
    })
  }), { name: "AbortError" });
  assert.equal(warnings.length, 1);
  assert.equal(diagnostics[1].timedOut, true);
  assert.equal(diagnostics[1].headersMs, null);
});
