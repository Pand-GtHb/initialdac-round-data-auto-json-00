(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ViewerData = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PRODUCTION_BASE_URL =
    "https://pand-gthb.github.io/initialdac-round-data-auto-json-00";

  function getDefaultBaseUrl() {
    if (typeof globalThis !== "undefined" && globalThis.VIEWER_BASE_URL != null) {
      return String(globalThis.VIEWER_BASE_URL);
    }
    if (
      typeof location !== "undefined" &&
      (location.hostname === "localhost" || location.hostname === "127.0.0.1")
    ) {
      return "";
    }
    return PRODUCTION_BASE_URL;
  }

  const DEFAULT_TIMEOUTS = Object.freeze({
    "latest_update.json": 8000,
    "integrated_data.json": 20000,
    default: 10000
  });

  const MAX_RETRY = 3;

  function getTimeoutForPath(path, customTimeouts = {}) {
    if (Number.isFinite(customTimeouts[path])) {
      return customTimeouts[path];
    }
    if (Number.isFinite(DEFAULT_TIMEOUTS[path])) {
      return DEFAULT_TIMEOUTS[path];
    }
    return customTimeouts.default ?? DEFAULT_TIMEOUTS.default;
  }

  function resolveLogger(options = {}) {
    const logInfo =
      options.onLog ??
      (typeof globalThis !== "undefined" && typeof globalThis.log === "function"
        ? globalThis.log
        : null);

    const logWarn =
      options.onWarn ??
      (typeof globalThis !== "undefined" && typeof globalThis.logWarn === "function"
        ? globalThis.logWarn
        : null);

    return {
      info: typeof logInfo === "function" ? logInfo : () => {},
      warn: typeof logWarn === "function" ? logWarn : () => {}
    };
  }

  async function fetchJSON(path, options = {}) {
    const {
      cache = "no-store",
      baseUrl = (options.baseUrl ?? getDefaultBaseUrl()),
      fetchImpl = (options.fetchImpl ?? (typeof fetch === "function" ? fetch : null)),
      timeouts = {},
      maxRetry = MAX_RETRY,
      now = () => Date.now(),
      perfNow = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()),
      delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    } = options;

    if (!fetchImpl) {
      throw new Error("fetch implementation is not available");
    }

    const logger = resolveLogger(options);
    const timeoutMs = getTimeoutForPath(path, timeouts);
    let lastError = null;

    const basePrefix = baseUrl ? `${baseUrl}/` : "";

    for (let attempt = 1; attempt <= maxRetry; attempt++) {
      const controller = new AbortController();
      const timeoutTimer = setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      const startedAt = perfNow();

      try {
        const url = `${basePrefix}${path}?t=${now()}`;
        const res = await fetchImpl(url, {
          cache,
          headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache"
          },
          signal: controller.signal
        });

        if (!res.ok) {
          throw new Error("HTTP " + res.status);
        }

        const json = await res.json();
        clearTimeout(timeoutTimer);
        const elapsed = Math.round(perfNow() - startedAt);

        if (path !== "latest_update.json" || elapsed >= 1000) {
          logger.info(`${path} 通信時間:${elapsed}ms`);
        }

        return json;
      } catch (e) {
        clearTimeout(timeoutTimer);
        lastError = e;

        if (e.name === "AbortError") {
          logger.warn(`${path} Timeout (${timeoutMs}ms)`);
        }

        if (attempt < maxRetry) {
          await delay(attempt * 1000);
        }
      }
    }

    throw lastError;
  }

  async function fetchAreaListJson(options = {}) {
    return fetchJSON("areaList.json", options);
  }

  async function fetchLatestRoundJson(options = {}) {
    return fetchJSON("latest_round.json", options);
  }

  async function fetchLatestUpdateJson(options = {}) {
    return fetchJSON("latest_update.json", options);
  }

  async function fetchHistoricalMatchupDistributionJson(options = {}) {
    return fetchJSON("historical_matchup_distribution.json", options);
  }

  async function fetchScoringConfigJson(options = {}) {
    return fetchJSON("scoring_config.json", options);
  }

  async function fetchUpdateWatchConfigJson(options = {}) {
    return fetchJSON("update_watch_config.json", options);
  }

  async function fetchRoundDataJson(options = {}) {
    return fetchJSON("integrated_data.json", options);
  }

  return {
    PRODUCTION_BASE_URL,
    DEFAULT_TIMEOUTS,
    MAX_RETRY,
    getDefaultBaseUrl,
    getTimeoutForPath,
    fetchJSON,
    fetchAreaListJson,
    fetchLatestRoundJson,
    fetchLatestUpdateJson,
    fetchHistoricalMatchupDistributionJson,
    fetchScoringConfigJson,
    fetchUpdateWatchConfigJson,
    fetchRoundDataJson
  };
});
