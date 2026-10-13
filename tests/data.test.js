const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const fs = require("node:fs");

const dataModule = require(path.join(__dirname, "..", "data.js"));

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
    /<script src="utils\.js\?cb=\d+"><\/script>\s*<script src="domain\.js\?cb=\d+"><\/script>\s*<script src="persistence\.js\?cb=\d+"><\/script>\s*<script src="data\.js\?cb=\d+"><\/script>\s*<script src="matching\.js\?cb=\d+"><\/script>\s*<script src="ui\.js\?cb=\d+"><\/script>\s*<script src="app\.js\?cb=\d+"><\/script>\s*<script src="main\.js\?cb=\d+"><\/script>/
  );
});
