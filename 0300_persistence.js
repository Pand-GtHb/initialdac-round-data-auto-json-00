(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ViewerPersistence = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* =========================================================
   Persistence Keys & Constants
  ========================================================= */
  const PERSIST_STATE_KEY = "initialdac_viewer_pink_state_v1";
  const R6_PRIDE_FREQUENCY_STORAGE_KEY = "initialdac_r6_pride_frequency_v1";
  const REALTIME_ACTIVITY_STORAGE_KEY = "matchingRealtimeActivity_v1";

  const LOG_STORAGE_KEYS = Object.freeze({
    copyEvents: "initialdac_copy_events_"
  });

  const LOG_STORAGE_LIMITS = Object.freeze({
    // Copy logs are retained by recorded business days, not by record count.
    copyEvents: Infinity,
    copyRecordDays: 14,
    copyAreaHistory: 200,
    candidateEvents: 300
  });

  const LOG_DB_NAME = "viewer_logs_db";
  const LOG_DB_VERSION = 3;

  const LOG_STORE = Object.freeze({
    events: "events",
    copyEvents: "copyEvents",
    candidateEvents: "candidateEvents"
  });

  let activeLogDB = null;
  let copyRecordDays = new Set();

  /* =========================================================
   Date Utility (28時締め日付けキー)
  ========================================================= */
  function buildDailyKey(date = new Date(), timezoneOffsetMinutes = null) {
    const d = new Date(date);
    if (timezoneOffsetMinutes !== null) {
      d.setTime(d.getTime() + (timezoneOffsetMinutes - 4 * 60) * 60000);
      return d.toISOString().slice(0, 10).replace(/-/g, "");
    }
    if (d.getHours() < 4) {
      d.setDate(d.getDate() - 1);
    }
    const y = d.getFullYear();
    const m = ("0" + (d.getMonth() + 1)).slice(-2);
    const day = ("0" + d.getDate()).slice(-2);
    return `${y}${m}${day}`;
  }

  /* =========================================================
   Stored Array Helpers
  ========================================================= */
  function readStoredArraySafe(key, storage = (typeof globalThis !== "undefined" ? globalThis.localStorage : null)) {
    try {
      const raw = storage?.getItem(key);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn("readStoredArraySafe error:", key, e);
      return [];
    }
  }

  function writeStoredArraySafe(key, arr, storage = (typeof globalThis !== "undefined" ? globalThis.localStorage : null)) {
    try {
      storage?.setItem(key, JSON.stringify(arr));
    } catch (e) {
      console.error("writeStoredArraySafe error:", key, e);
    }
  }

  function pushStoredRecord(key, record, limit = 200, daily = false, options = {}) {
    let finalKey = key;
    if (daily) {
      const dk =
        record.dk ||
        options.dailyKey ||
        (typeof globalThis !== "undefined" && typeof globalThis.buildDailyKey === "function"
          ? globalThis.buildDailyKey()
          : buildDailyKey());
      finalKey = key + dk;
    }

    const storage = options.storage || (typeof globalThis !== "undefined" ? globalThis.localStorage : null);
    if (daily && key === LOG_STORAGE_KEYS.copyEvents) {
      return saveCopyRecordToStorage(record, storage, options);
    }
    const arr = readStoredArraySafe(finalKey, storage);
    arr.unshift(record);
    const trimmed = arr.slice(0, limit);
    writeStoredArraySafe(finalKey, trimmed, storage);
  }

  function getLocalStorageUsage(storage = globalThis.localStorage) {
    let bytes = 0;
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key === null) throw new Error("保存容量確認中にキーが変化しました");
      bytes += 2 * (key.length + (storage.getItem(key)?.length ?? 0));
    }
    return bytes;
  }

  function saveCopyRecordToStorage(record, storage = globalThis.localStorage, options = {}) {
    if (!storage) throw new Error("localStorageが利用できません");
    const day = record.dk ?? options.dailyKey ?? buildDailyKey(new Date(record.t), 540);
    const key = LOG_STORAGE_KEYS.copyEvents + day;
    pruneLocalCopyRecords(storage, day);
    const raw = storage.getItem(key);
    const records = raw === null ? [] : JSON.parse(raw);
    if (!Array.isArray(records)) throw new Error(`コピー記録が配列ではありません：${key}`);
    const value = JSON.stringify([record, ...records]);
    const protectedDay = buildDailyKey(new Date(), 540);
    const oldest = collectLocalCopyDays(storage)
      .filter(entry => entry.day < day && entry.day !== protectedDay)
      .sort((a, b) => a.day.localeCompare(b.day));
    const removedDays = [];
    while (true) {
      try {
        storage.setItem(key, value);
        return { removedDays, estimatedUtf16Bytes: getLocalStorageUsage(storage) };
      } catch (error) {
        if (error.name !== "QuotaExceededError" && error.name !== "NS_ERROR_DOM_QUOTA_REACHED") throw error;
        const entry = oldest.shift();
        if (!entry) throw error;
        storage.removeItem(entry.key);
        removedDays.push(entry.day);
        const message = `保存容量上限：${entry.day}のlocalStorageコピー記録を削除し、保存を再試行します（IndexedDBの記録は削除しません）`;
        if (typeof options.onWarning === "function") options.onWarning(message);
        else console.warn(message);
      }
    }
  }

  function collectLocalCopyDays(storage) {
    const entries = [];
    if (!storage) return entries;
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key?.startsWith(LOG_STORAGE_KEYS.copyEvents)) continue;
      const day = key.slice(LOG_STORAGE_KEYS.copyEvents.length);
      if (!/^\d{8}$/.test(day)) continue;
      const records = JSON.parse(storage.getItem(key));
      if (!Array.isArray(records)) throw new Error(`コピー記録が配列ではありません：${key}`);
      if (records.length) entries.push({ key, day });
    }
    return entries;
  }

  function pruneLocalCopyRecords(storage = globalThis.localStorage, incomingDay = null, databaseDays = copyRecordDays) {
    const entries = collectLocalCopyDays(storage);
    const days = new Set([...databaseDays, ...entries.map(entry => entry.day)]);
    if (incomingDay) days.add(incomingDay);
    const retained = [...days].sort().reverse().slice(0, LOG_STORAGE_LIMITS.copyRecordDays);
    const keep = new Set(retained);
    for (const { key, day } of entries) {
      if (!keep.has(day)) storage.removeItem(key);
    }
    return keep;
  }

  function copyRecordDay(record) {
    if (!Number.isFinite(record.t)) throw new Error("コピー記録の日時が不正です");
    return buildDailyKey(new Date(record.t), 540);
  }

  function pruneCopyEventLogs(db = activeLogDB, storage = globalThis.localStorage) {
    if (!db) return Promise.reject(new Error("コピー記録整理：IndexedDBが未初期化です"));
    return new Promise((resolve, reject) => {
      const tx = db.transaction(LOG_STORE.copyEvents, "readwrite");
      const store = tx.objectStore(LOG_STORE.copyEvents);
      const req = store.getAll();
      let retainedDatabaseDays;
      req.onsuccess = () => {
        try {
          const records = req.result;
          const days = records.map(copyRecordDay);
          const keep = pruneLocalCopyRecords(storage, null, new Set(days));
          retainedDatabaseDays = new Set(days.filter(day => keep.has(day)));
          records.forEach((record, index) => {
            if (!keep.has(days[index])) store.delete(record.id);
          });
        } catch (error) {
          tx.abort();
          reject(error);
        }
      };
      req.onerror = () => reject(req.error);
      tx.onabort = () => reject(tx.error ?? new Error("コピー記録整理が中断されました"));
      tx.oncomplete = () => {
        copyRecordDays = retainedDatabaseDays;
        resolve();
      };
    });
  }

  /* =========================================================
   Pink State & Daily Cleanup
  ========================================================= */
  function isPinkTargetStale(entry, today = null) {
    if (!entry) {
      return true;
    }
    const currentToday =
      today ??
      (typeof globalThis !== "undefined" && typeof globalThis.buildDailyKey === "function"
        ? globalThis.buildDailyKey()
        : buildDailyKey());

    if (!entry.dailyKey) {
      return false;
    }
    return entry.dailyKey !== currentToday;
  }

  function checkAndCleanDailyState(targetState = (typeof globalThis !== "undefined" ? globalThis.State : null), today = null, onCleaned = null) {
    const currentToday =
      today ??
      (typeof globalThis !== "undefined" && typeof globalThis.buildDailyKey === "function"
        ? globalThis.buildDailyKey()
        : buildDailyKey());

    let cleaned = false;
    if (targetState?.pinkTargets && typeof targetState.pinkTargets === "object") {
      for (const [key, entry] of Object.entries(targetState.pinkTargets)) {
        if (entry && entry.dailyKey !== currentToday) {
          delete targetState.pinkTargets[key];
          cleaned = true;
        }
      }
    }

    if (cleaned) {
      if (typeof onCleaned === "function") {
        onCleaned("日付変更を検知：前日のPink管理ターゲットを自動クリーンアップしました");
      } else if (typeof globalThis !== "undefined" && typeof globalThis.log === "function") {
        globalThis.log("日付変更を検知：前日のPink管理ターゲットを自動クリーンアップしました");
      }
    }
    return cleaned;
  }

  function serializePinkState(targetState = (typeof globalThis !== "undefined" ? globalThis.State : null)) {
    return {
      pinkTargets: targetState?.pinkTargets || {},
      encounterHistory: targetState?.encounterHistory || {},
      phaseAdjust: targetState?.phaseAdjust || { yellow: 0, pink: 0 },
      pinkCycleState: targetState?.pinkCycleState ?? null,
      yellowSamples: targetState?.yellowSamples || [],
      savedAt: Date.now()
    };
  }

  function savePinkStateToStorage(targetState = (typeof globalThis !== "undefined" ? globalThis.State : null), storage = (typeof globalThis !== "undefined" ? globalThis.localStorage : null), options = {}) {
    try {
      checkAndCleanDailyState(targetState, options.today, options.onCleaned);
      const payload = serializePinkState(targetState);
      if (Number.isFinite(options.savedAt)) {
        payload.savedAt = options.savedAt;
      }
      storage?.setItem(PERSIST_STATE_KEY, JSON.stringify(payload));
      return true;
    } catch (e) {
      console.warn("[persist] save failed", e);
      return false;
    }
  }

  function restorePinkStateFromStorage(targetState = (typeof globalThis !== "undefined" ? globalThis.State : null), storage = (typeof globalThis !== "undefined" ? globalThis.localStorage : null), options = {}) {
    try {
      const raw = storage?.getItem(PERSIST_STATE_KEY);
      if (!raw) {
        return false;
      }
      const parsed = JSON.parse(raw);
      const currentToday =
        options.today ??
        (typeof globalThis !== "undefined" && typeof globalThis.buildDailyKey === "function"
          ? globalThis.buildDailyKey()
          : buildDailyKey());

      if (targetState) {
        targetState.pinkTargets = {};
        if (parsed?.pinkTargets && typeof parsed.pinkTargets === "object") {
          for (const [key, entry] of Object.entries(parsed.pinkTargets)) {
            if (entry && entry.dailyKey === currentToday) {
              targetState.pinkTargets[key] = entry;
            }
          }
        }

        if (parsed?.encounterHistory && typeof parsed.encounterHistory === "object") {
          targetState.encounterHistory = parsed.encounterHistory;
        }

        if (parsed?.phaseAdjust && typeof parsed.phaseAdjust === "object") {
          targetState.phaseAdjust = {
            yellow: Number(parsed.phaseAdjust.yellow ?? targetState.phaseAdjust?.yellow ?? 0),
            pink: Number(parsed.phaseAdjust.pink ?? targetState.phaseAdjust?.pink ?? 0)
          };
        }

        if (Array.isArray(parsed?.yellowSamples)) {
          targetState.yellowSamples = parsed.yellowSamples;
        }
        targetState.pinkCycleState = parsed?.pinkCycleState ?? null;
      }
      return true;
    } catch (e) {
      console.warn("[persist] restore failed", e);
      return false;
    }
  }

  /* =========================================================
   Realtime Activity Storage
  ========================================================= */
  function saveRealtimeActivityToStorage(targetState = (typeof globalThis !== "undefined" ? globalThis.State : null), storage = (typeof globalThis !== "undefined" ? globalThis.localStorage : null)) {
    try {
      storage?.setItem(
        REALTIME_ACTIVITY_STORAGE_KEY,
        JSON.stringify({
          playerActivity: targetState?.playerActivity || {},
          rankActivity: targetState?.rankActivity || {}
        })
      );
      return true;
    } catch (e) {
      return false;
    }
  }

  function restoreRealtimeActivityFromStorage(targetState = (typeof globalThis !== "undefined" ? globalThis.State : null), storage = (typeof globalThis !== "undefined" ? globalThis.localStorage : null)) {
    try {
      const raw = storage?.getItem(REALTIME_ACTIVITY_STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (targetState) {
        targetState.playerActivity = parsed?.playerActivity || {};
        targetState.rankActivity = parsed?.rankActivity || {};
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  /* =========================================================
   R6 PRIDE Frequency Ledger
  ========================================================= */
  function createDefaultR6PrideLedger() {
    return {
      version: 1,
      lastGenerationMs: null,
      credit: 0,
      granted: false,
      countedGenerations: 0,
      grantedGenerations: 0
    };
  }

  function isValidR6PrideLedger(ledger) {
    return (
      ledger?.version === 1 &&
      (ledger.lastGenerationMs === null || Number.isFinite(ledger.lastGenerationMs)) &&
      Number.isFinite(ledger.credit) &&
      ledger.credit >= 0 &&
      ledger.credit <= 1 &&
      typeof ledger.granted === "boolean" &&
      Number.isSafeInteger(ledger.countedGenerations) &&
      ledger.countedGenerations >= 0 &&
      Number.isSafeInteger(ledger.grantedGenerations) &&
      ledger.grantedGenerations >= 0 &&
      ledger.grantedGenerations <= ledger.countedGenerations
    );
  }

  function loadR6PrideLedger(storage = (typeof globalThis !== "undefined" ? globalThis.localStorage : null)) {
    try {
      const raw = storage?.getItem(R6_PRIDE_FREQUENCY_STORAGE_KEY);
      const ledger = raw ? JSON.parse(raw) : createDefaultR6PrideLedger();
      if (!isValidR6PrideLedger(ledger)) {
        throw new Error("invalid R6 PRIDE frequency ledger");
      }
      return ledger;
    } catch (error) {
      console.warn("[R6 PRIDE frequency] restore failed", error);
      return null;
    }
  }

  function saveR6PrideLedger(ledger, storage = (typeof globalThis !== "undefined" ? globalThis.localStorage : null)) {
    try {
      storage?.setItem(R6_PRIDE_FREQUENCY_STORAGE_KEY, JSON.stringify(ledger));
      return true;
    } catch (error) {
      console.warn("[R6 PRIDE frequency] save failed", error);
      return false;
    }
  }

  /* =========================================================
   IndexedDB Core & Log Pruning
  ========================================================= */
  function getLogDB() {
    return activeLogDB;
  }

  function setLogDB(db) {
    activeLogDB = db;
  }

  function pruneLogStore(storeName, limit, db = activeLogDB) {
    if (!db) {
      return;
    }
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const req = store.getAllKeys();

    req.onsuccess = () => {
      const keys = req.result || [];
      if (keys.length <= limit) {
        return;
      }
      const sorted = [...keys].sort((a, b) => a - b);
      const toDelete = sorted.slice(0, sorted.length - limit);
      for (const key of toDelete) {
        store.delete(key);
      }
    };

    req.onerror = (e) => {
      console.error(`[LOG] ${storeName} prune failed`, e);
    };
  }

  function pruneCandidateEventsStore(limit = LOG_STORAGE_LIMITS.candidateEvents, db = activeLogDB) {
    pruneLogStore(LOG_STORE.candidateEvents, limit, db);
  }

  function putLog(storeName, data, db = activeLogDB) {
    if (!db) {
      return null;
    }
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    store.put(data);
    return tx;
  }

  function logEvent(type, payload = {}, options = {}) {
    const db = options.db || activeLogDB;
    if (!db) {
      if (type === "copy" || type === "top") {
        const message = "IndexedDB未初期化：コピー記録を保存できません";
        console.error(message);
        if (typeof options.onError === "function") options.onError(message);
        else if (typeof globalThis.logError === "function") globalThis.logError(message);
      }
      if (type === "candidate" && payload.analysisDiagnostics) {
        if (typeof options.onError === "function") {
          options.onError("IndexedDB未初期化：候補分析ログを保存できません");
        } else if (typeof globalThis !== "undefined" && typeof globalThis.logError === "function") {
          globalThis.logError("IndexedDB未初期化：候補分析ログを保存できません");
          if (typeof globalThis.alert === "function") {
            globalThis.alert("候補分析ログを保存できません。IndexedDBの初期化状態を確認してください。");
          }
        }
      }
      return;
    }

    const record = {
      t: options.now ?? Date.now(),
      e: type,
      ...(payload || {})
    };

    if (type === "pink-trigger") {
      putLog(LOG_STORE.events, record, db);
      return;
    }

    if (type === "copy" || type === "top") {
      const reportError = error => {
        const message = `コピー記録のIndexedDB保存失敗：${error?.message ?? "transaction aborted"}`;
        console.error(message, error);
        if (typeof options.onError === "function") options.onError(message);
        else if (typeof globalThis.logError === "function") globalThis.logError(message);
      };
      let tx;
      try {
        tx = putLog(LOG_STORE.copyEvents, record, db);
      } catch (error) {
        reportError(error);
        return;
      }
      if (tx) {
        tx.onabort = () => reportError(tx.error);
        tx.oncomplete = () => {
          if (typeof options.onSaved === "function") options.onSaved();
          pruneCopyEventLogs(db, options.storage ?? globalThis.localStorage).catch(error => {
            console.error("[LOG] copy retention failed", error);
            if (typeof options.onError === "function") options.onError(`コピー記録の整理失敗：${error.message}`);
            else if (typeof globalThis.logError === "function") globalThis.logError(`コピー記録の整理失敗：${error.message}`);
          });
        };
      }
      return;
    }

    if (type === "candidate") {
      const startedAt =
        typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
      let tx;
      try {
        tx = putLog(LOG_STORE.candidateEvents, record, db);
      } catch (error) {
        const msg = `候補ログの保存開始失敗：${error.message}`;
        if (typeof options.onError === "function") {
          options.onError(msg);
        } else if (typeof globalThis !== "undefined" && typeof globalThis.logError === "function") {
          globalThis.logError(msg);
          if (typeof globalThis.alert === "function") {
            globalThis.alert("候補ログの保存に失敗しました。分析ログを確認してください。");
          }
        }
        return;
      }
      if (tx && record.analysisDiagnostics) {
        tx.oncomplete = () => {
          const perfNow =
            typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
          logEvent(
            "runtime",
            {
              severity: "info",
              message: "analysis-candidate-save",
              candidateEventId: record.id,
              storageTransactionMs: perfNow - startedAt,
              jsonUtf8BytesBeforeMetrics:
                record.analysisDiagnostics.storageMetrics?.jsonUtf8BytesBeforeMetrics
            },
            { db }
          );
        };
        tx.onabort = () => {
          const msg = `候補ログの保存失敗：${tx.error?.message ?? "transaction aborted"}`;
          if (typeof options.onError === "function") {
            options.onError(msg);
          } else if (typeof globalThis !== "undefined" && typeof globalThis.logError === "function") {
            globalThis.logError(msg);
            if (typeof globalThis.alert === "function") {
              globalThis.alert("候補ログの保存に失敗しました。分析ログを確認してください。");
            }
          }
        };
      }
      return;
    }

    putLog(LOG_STORE.events, record, db);
  }

  function initLogDB(options = {}) {
    const idb = options.indexedDB || (typeof globalThis !== "undefined" ? globalThis.indexedDB : null);
    if (!idb) {
      return Promise.reject(new Error("indexedDB is not available"));
    }

    return new Promise((resolve, reject) => {
      const req = idb.open(LOG_DB_NAME, LOG_DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;

        if (!db.objectStoreNames.contains(LOG_STORE.events)) {
          db.createObjectStore(LOG_STORE.events, {
            keyPath: "id",
            autoIncrement: true
          });
        }

        if (!db.objectStoreNames.contains(LOG_STORE.copyEvents)) {
          db.createObjectStore(LOG_STORE.copyEvents, {
            keyPath: "id",
            autoIncrement: true
          });
        }

        if (db.objectStoreNames.contains("cycleEvents")) {
          db.deleteObjectStore("cycleEvents");
        }

        if (!db.objectStoreNames.contains(LOG_STORE.candidateEvents)) {
          db.createObjectStore(LOG_STORE.candidateEvents, {
            keyPath: "id"
          });
        }
      };

      req.onsuccess = async (e) => {
        const db = e.target.result;
        activeLogDB = db;
        try {
          copyRecordDays = new Set();
          await pruneCopyEventLogs(db, options.storage ?? globalThis.localStorage);
        } catch (error) {
          console.error("[LOG] copy retention failed", error);
          reject(error);
          return;
        }
        if (typeof options.onSuccess === "function") {
          options.onSuccess(db);
        }

        pruneCandidateEventsStore(LOG_STORAGE_LIMITS.candidateEvents, db);

        console.log("[LOG] IndexedDB ready");
        resolve(db);
      };

      req.onerror = (e) => {
        console.error("[LOG] DB init failed", e);
        reject(e);
      };
    });
  }

  return {
    PERSIST_STATE_KEY,
    R6_PRIDE_FREQUENCY_STORAGE_KEY,
    REALTIME_ACTIVITY_STORAGE_KEY,
    LOG_STORAGE_KEYS,
    LOG_STORAGE_LIMITS,
    LOG_DB_NAME,
    LOG_DB_VERSION,
    LOG_STORE,
    buildDailyKey,
    readStoredArraySafe,
    writeStoredArraySafe,
    pushStoredRecord,
    saveCopyRecordToStorage,
    getLocalStorageUsage,
    pruneLocalCopyRecords,
    pruneCopyEventLogs,
    isPinkTargetStale,
    checkAndCleanDailyState,
    serializePinkState,
    savePinkStateToStorage,
    restorePinkStateFromStorage,
    saveRealtimeActivityToStorage,
    restoreRealtimeActivityFromStorage,
    createDefaultR6PrideLedger,
    isValidR6PrideLedger,
    loadR6PrideLedger,
    saveR6PrideLedger,
    getLogDB,
    setLogDB,
    initLogDB,
    putLog,
    logEvent,
    pruneLogStore,
    pruneCandidateEventsStore
  };
});
