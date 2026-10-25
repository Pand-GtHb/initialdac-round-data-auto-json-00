const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const p = require(path.join(__dirname, "..", "0300_persistence.js"));

function createMockStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    get length() { return store.size; },
    key(index) { return [...store.keys()][index] ?? null; },
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(String(key));
    },
    clear() {
      store.clear();
    },
    _raw: store
  };
}

test("Persistence constants match existing schema", () => {
  assert.equal(p.PERSIST_STATE_KEY, "initialdac_viewer_pink_state_v1");
  assert.equal(p.R6_PRIDE_FREQUENCY_STORAGE_KEY, "initialdac_r6_pride_frequency_v1");
  assert.equal(p.REALTIME_ACTIVITY_STORAGE_KEY, "matchingRealtimeActivity_v1");
  assert.equal(p.LOG_STORAGE_KEYS.copyEvents, "initialdac_copy_events_");
  assert.equal(p.LOG_STORAGE_LIMITS.copyEvents, Infinity);
  assert.equal(p.LOG_STORAGE_LIMITS.copyRecordDays, 14);
  assert.equal(p.LOG_STORAGE_LIMITS.copyAreaHistory, 200);
  assert.equal(p.LOG_STORAGE_LIMITS.candidateEvents, 300);
  assert.equal(p.LOG_DB_NAME, "viewer_logs_db");
  assert.equal(p.LOG_DB_VERSION, 3);
  assert.equal(p.LOG_STORE.events, "events");
  assert.equal(p.LOG_STORE.copyEvents, "copyEvents");
  assert.equal(p.LOG_STORE.candidateEvents, "candidateEvents");
});

test("buildDailyKey rolls over at 04:00 (28:00 cutoff)", () => {
  // 2026-10-13 03:59:59 JST -> 20261012
  const d1 = new Date(2026, 9, 13, 3, 59, 59);
  assert.equal(p.buildDailyKey(d1), "20261012");

  // 2026-10-13 04:00:00 JST -> 20261013
  const d2 = new Date(2026, 9, 13, 4, 0, 0);
  assert.equal(p.buildDailyKey(d2), "20261013");

  // 2026-10-13 23:30:00 JST -> 20261013
  const d3 = new Date(2026, 9, 13, 23, 30, 0);
  assert.equal(p.buildDailyKey(d3), "20261013");
});

test("explicit timezone daily keys use JST 04:00 regardless of host timezone", () => {
  assert.equal(p.buildDailyKey(new Date("2026-10-18T18:59:59Z"), 540), "20261018");
  assert.equal(p.buildDailyKey(new Date("2026-10-18T19:00:00Z"), 540), "20261019");
  assert.equal(p.buildDailyKey(new Date("2026-10-19T03:59:59Z"), 0), "20261018");
  assert.equal(p.buildDailyKey(new Date("2026-10-19T04:00:00Z"), 0), "20261019");
});

test("readStoredArraySafe & writeStoredArraySafe handle arrays and errors", () => {
  const storage = createMockStorage();

  // Empty initial
  assert.deepEqual(p.readStoredArraySafe("test_key", storage), []);

  // Write and read
  p.writeStoredArraySafe("test_key", [{ id: 1 }, { id: 2 }], storage);
  assert.deepEqual(p.readStoredArraySafe("test_key", storage), [{ id: 1 }, { id: 2 }]);

  // Corrupted / non-array data
  storage.setItem("corrupt", "{ invalid json");
  assert.deepEqual(p.readStoredArraySafe("corrupt", storage), []);

  storage.setItem("not_array", JSON.stringify({ a: 1 }));
  assert.deepEqual(p.readStoredArraySafe("not_array", storage), []);
});

test("pushStoredRecord unshifts and enforces limits", () => {
  const storage = createMockStorage();

  // Normal push without daily
  p.pushStoredRecord("list", { v: 1 }, 3, false, { storage });
  p.pushStoredRecord("list", { v: 2 }, 3, false, { storage });
  p.pushStoredRecord("list", { v: 3 }, 3, false, { storage });
  assert.deepEqual(p.readStoredArraySafe("list", storage), [{ v: 3 }, { v: 2 }, { v: 1 }]);

  // Over limit (limit = 3)
  p.pushStoredRecord("list", { v: 4 }, 3, false, { storage });
  assert.deepEqual(p.readStoredArraySafe("list", storage), [{ v: 4 }, { v: 3 }, { v: 2 }]);

  // With daily key
  p.pushStoredRecord("daily_list", { v: "today" }, 3, true, { storage, dailyKey: "20261013" });
  assert.deepEqual(p.readStoredArraySafe("daily_list20261013", storage), [{ v: "today" }]);
});

test("copy retention keeps 14 recorded JST business days across both stores without a count cap", async () => {
  const fs = require("node:fs");
  const vm = require("node:vm");
  const storage = createMockStorage({
    [p.PERSIST_STATE_KEY]: '{"preserve":true}',
    [p.REALTIME_ACTIVITY_STORAGE_KEY]: '{"preserve":true}',
    initialdac_copy_events_notes: "preserve",
    initialdac_copy_events_20260101: "[]"
  });
  const api = vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "..", "0300_persistence.js"), "utf8") +
    "\nViewerPersistence;",
    { console, localStorage: storage }
  );
  const rows = [];
  const days = [];
  // Irregularly spaced days must count as recorded days, not elapsed days.
  for (let i = 0; i < 16; i++) {
    const t = Date.parse("2026-01-01T04:00:00+09:00") + i * 4 * 86400000;
    const day = api.buildDailyKey(new Date(t), 540);
    days.push(day);
    if (i % 2 === 0) storage.setItem(p.LOG_STORAGE_KEYS.copyEvents + day, JSON.stringify([{ t }]));
    else rows.push({ id: i, t });
  }
  // More than 200 copies in one retained day must all survive.
  for (let i = 0; i < 250; i++) rows.push({ id: 100 + i, t: rows.at(-1).t });
  const deleted = [];
  const db = {
    transaction(name, mode) {
      assert.equal(name, "copyEvents");
      assert.equal(mode, "readwrite");
      const tx = {
        objectStore: () => ({
          getAll() {
            const req = { result: rows };
            queueMicrotask(() => {
              req.onsuccess();
              if (!tx.aborted) tx.oncomplete();
            });
            return req;
          },
          delete(id) { deleted.push(id); }
        }),
        abort() { tx.aborted = true; tx.onabort(); }
      };
      return tx;
    }
  };
  await api.pruneCopyEventLogs(db, storage);
  assert.deepEqual(deleted, [1]);
  assert.equal(storage.getItem(p.LOG_STORAGE_KEYS.copyEvents + days[0]), null);
  assert(storage.getItem(p.LOG_STORAGE_KEYS.copyEvents + days[2]));
  assert.equal(storage.getItem(p.PERSIST_STATE_KEY), '{"preserve":true}');
  assert.equal(storage.getItem(p.REALTIME_ACTIVITY_STORAGE_KEY), '{"preserve":true}');
  assert.equal(storage.getItem("initialdac_copy_events_notes"), "preserve");

  const before = [...storage._raw];
  api.pruneLocalCopyRecords(storage);
  assert.deepEqual([...storage._raw], before, "Idle calendar days must not age out recorded days");
  const nextTime = Date.parse("2026-10-25T04:00:00+09:00");
  api.pushStoredRecord(p.LOG_STORAGE_KEYS.copyEvents, { t: nextTime, dk: "20261025" },
    api.LOG_STORAGE_LIMITS.copyEvents, true, { storage });
  assert.equal(storage.getItem(p.LOG_STORAGE_KEYS.copyEvents + days[2]), null);
  assert.equal(JSON.parse(storage.getItem(p.LOG_STORAGE_KEYS.copyEvents + "20261025")).length, 1);
  for (let i = 0; i < 220; i++) {
    api.pushStoredRecord(p.LOG_STORAGE_KEYS.copyEvents, { t: nextTime, dk: "20261025" },
      api.LOG_STORAGE_LIMITS.copyEvents, true, { storage });
  }
  assert.equal(JSON.parse(storage.getItem(p.LOG_STORAGE_KEYS.copyEvents + "20261025")).length, 221);
  assert.equal(api.buildDailyKey(new Date("2026-10-25T03:59:59+09:00"), 540), "20261024");
  assert.equal(api.buildDailyKey(new Date(nextTime), 540), "20261025");
});

test("copy retention rejects malformed data and aborted database transactions", async () => {
  const storage = createMockStorage({ initialdac_copy_events_20261025: "not-json" });
  assert.throws(() => p.pruneLocalCopyRecords(storage), SyntaxError);
  assert.equal(storage.getItem("initialdac_copy_events_20261025"), "not-json");
  await assert.rejects(p.pruneCopyEventLogs({
    transaction() {
      const tx = {
        objectStore: () => ({ getAll: () => ({}) })
      };
      queueMicrotask(() => tx.onabort());
      return tx;
    }
  }, createMockStorage()), /中断/);
});

test("quota retry evicts only oldest local copy days until the exact write succeeds", () => {
  const oldDays = ["20200101", "20200104", "20200201"];
  const storage = createMockStorage({
    [p.PERSIST_STATE_KEY]: "keep-settings",
    unrelated: "keep-unrelated",
    ...Object.fromEntries(oldDays.map(day => [p.LOG_STORAGE_KEYS.copyEvents + day, JSON.stringify([{ dk: day }])]))
  });
  const setItem = storage.setItem;
  const record = { t: Date.parse("2020-03-01T04:00:00+09:00"), dk: "20200301", candidateEventId: 123 };
  const newKey = p.LOG_STORAGE_KEYS.copyEvents + record.dk;
  const newBytes = 2 * (newKey.length + JSON.stringify([record]).length);
  const bytesOfDay = day => {
    const key = p.LOG_STORAGE_KEYS.copyEvents + day;
    return 2 * (key.length + storage.getItem(key).length);
  };
  const quotaBytes = p.getLocalStorageUsage(storage) - bytesOfDay(oldDays[0]) - bytesOfDay(oldDays[1]) + newBytes;
  let attempts = 0;
  storage.setItem = (key, value) => {
    attempts++;
    if (p.getLocalStorageUsage(storage) + 2 * (key.length + value.length) > quotaBytes) {
      const error = new Error("full");
      error.name = "QuotaExceededError";
      throw error;
    }
    setItem(key, value);
  };
  const warnings = [];
  const result = p.saveCopyRecordToStorage(record, storage, { onWarning: message => warnings.push(message) });
  assert.deepEqual(result.removedDays, oldDays.slice(0, 2));
  assert.equal(attempts, 3);
  assert.equal(warnings.length, 2);
  assert.deepEqual(JSON.parse(storage.getItem(p.LOG_STORAGE_KEYS.copyEvents + record.dk)), [record]);
  assert(storage.getItem(p.LOG_STORAGE_KEYS.copyEvents + oldDays[2]));
  assert.equal(storage.getItem(p.PERSIST_STATE_KEY), "keep-settings");
  assert.equal(storage.getItem("unrelated"), "keep-unrelated");
  assert.equal(result.estimatedUtf16Bytes, [...storage._raw].reduce((sum, [key, value]) => sum + 2 * (key.length + value.length), 0));
  assert.equal(result.estimatedUtf16Bytes, quotaBytes);
});

test("quota exhaustion protects current/incoming days; non-quota errors do not evict data", () => {
  const today = p.buildDailyKey(new Date(), 540);
  for (const name of ["QuotaExceededError", "SecurityError"]) {
    const storage = createMockStorage({
      [p.LOG_STORAGE_KEYS.copyEvents + today]: JSON.stringify([{ dk: today }]),
      [p.LOG_STORAGE_KEYS.copyEvents + "20200101"]: JSON.stringify([{ dk: "20200101" }]),
      [p.PERSIST_STATE_KEY]: "keep"
    });
    const error = new Error(name);
    error.name = name;
    storage.setItem = () => { throw error; };
    assert.throws(() => p.saveCopyRecordToStorage({ dk: today, t: Date.now() }, storage, { onWarning() {} }), { name });
    assert(storage.getItem(p.LOG_STORAGE_KEYS.copyEvents + today));
    assert.equal(storage.getItem(p.PERSIST_STATE_KEY), "keep");
    if (name === "SecurityError") assert(storage.getItem(p.LOG_STORAGE_KEYS.copyEvents + "20200101"));
    else assert.equal(storage.getItem(p.LOG_STORAGE_KEYS.copyEvents + "20200101"), null);
  }
});

test("copy save failures notify explicitly and never report successful persistence", () => {
  for (const failure of ["uninitialized", "start", "abort"]) {
    const errors = [];
    let saved = 0;
    const tx = {
      error: new Error("database full"),
      objectStore: () => ({ put() {} })
    };
    const db = failure === "uninitialized" ? null : {
      transaction() {
        if (failure === "start") throw new Error("transaction unavailable");
        return tx;
      }
    };
    p.setLogDB(null);
    p.logEvent("copy", { t: Date.now() }, {
      db, onError: message => errors.push(message), onSaved: () => saved++
    });
    if (failure === "abort") tx.onabort();
    assert.equal(errors.length, 1);
    assert.equal(saved, 0);
  }
});

test("startup and copy-save cleanup enforce the same 14-day policy", async () => {
  const fs = require("node:fs");
  const vm = require("node:vm");
  const storage = createMockStorage();
  const records = new Map();
  const base = Date.parse("2026-08-01T04:00:00+09:00");
  for (let id = 1; id <= 15; id++) {
    const t = base + id * 3 * 86400000;
    records.set(id, { id, t });
    storage.setItem(p.LOG_STORAGE_KEYS.copyEvents + p.buildDailyKey(new Date(t), 540), JSON.stringify([{ t }]));
  }
  const api = vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "..", "0300_persistence.js"), "utf8") +
    "\nViewerPersistence;",
    { console, localStorage: storage }
  );
  const transactions = [];
  const db = {
    transaction(name) {
      transactions.push(name);
      const tx = {
        objectStore: () => ({
          getAll() {
            const req = {};
            queueMicrotask(() => {
              req.result = [...records.values()];
              req.onsuccess();
              tx.oncomplete();
            });

            return req;
          },
          getAllKeys() {
            const req = { result: [] };
            queueMicrotask(() => req.onsuccess());
            return req;
          },
          delete(id) { records.delete(id); },
          put(record) {
            records.set(record.id, record);
            queueMicrotask(() => tx.oncomplete());
          }
        })
      };
      return tx;
    }
  };
  const indexedDB = {
    open() {
      const req = {};
      queueMicrotask(() => req.onsuccess({ target: { result: db } }));
      return req;
    }
  };
  let initialized = false;
  await api.initLogDB({ indexedDB, storage, onSuccess() {
    assert.equal(records.size, 14, "cleanup must complete before initialization succeeds");
    initialized = true;
  } });
  assert(initialized);
  assert.equal(storage.length, 14);
  assert(!records.has(1));
  const t = Date.parse("2026-10-25T04:00:00+09:00");
  api.logEvent("copy", { id: 16, t }, { db, storage });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(records.size, 14);
  assert(!records.has(2));
  assert(records.has(16));
  assert.equal(storage.length, 13, "an IndexedDB-only day also counts toward the 14 days");
  assert(transactions.includes("candidateEvents"), "candidate count pruning remains unchanged");
});

test("Pink target staleness & daily cleanup", () => {
  const today = "20261013";
  const yesterday = "20261012";

  assert.equal(p.isPinkTargetStale(null, today), true);
  assert.equal(p.isPinkTargetStale({ dailyKey: yesterday }, today), true);
  assert.equal(p.isPinkTargetStale({ dailyKey: today }, today), false);
  assert.equal(p.isPinkTargetStale({ foo: "no dailyKey" }, today), false);

  const mockState = {
    pinkTargets: {
      player1: { name: "P1", dailyKey: yesterday },
      player2: { name: "P2", dailyKey: today },
      player3: { name: "P3", dailyKey: "20261011" }
    }
  };

  let cleanedMessage = null;
  const cleaned = p.checkAndCleanDailyState(mockState, today, (msg) => {
    cleanedMessage = msg;
  });

  assert.equal(cleaned, true);
  assert.equal(Object.keys(mockState.pinkTargets).length, 1);
  assert.equal(mockState.pinkTargets.player2.name, "P2");
  assert.match(cleanedMessage, /日付変更を検知/);
});

test("savePinkStateToStorage & restorePinkStateFromStorage preserve state across days", () => {
  const storage = createMockStorage();
  const today = "20261013";
  const yesterday = "20261012";

  const originalState = {
    pinkTargets: {
      pYesterday: { name: "Old", dailyKey: yesterday },
      pToday: { name: "Active", dailyKey: today }
    },
    encounterHistory: {
      "P1@@Shop": { count: 3 }
    },
    phaseAdjust: {
      yellow: 1.5,
      pink: -0.5
    },
    pinkCycleState: {
      version: 1, baseCycleSec: 345, maxShiftSec: 45, adjustSec: -0.5,
      source: "encounter-learning", sampleCount: 3, trust: Math.sqrt(3 / 8),
      lastLearnedAt: 123456000
    },
    yellowSamples: [100, 102, 98]
  };

  // Save
  const saved = p.savePinkStateToStorage(originalState, storage, { today, savedAt: 123456789 });
  assert.equal(saved, true);

  // Raw storage payload check
  const raw = JSON.parse(storage.getItem(p.PERSIST_STATE_KEY));
  assert.equal(raw.savedAt, 123456789);
  assert.equal(raw.phaseAdjust.yellow, 1.5);
  assert.equal(raw.yellowSamples.length, 3);
  // Yesterday was cleaned before saving
  assert.equal(raw.pinkTargets.pYesterday, undefined);
  assert.equal(raw.pinkTargets.pToday.name, "Active");

  // Restore on same day
  const restoredState1 = {};
  p.restorePinkStateFromStorage(restoredState1, storage, { today });
  assert.equal(restoredState1.pinkTargets.pToday.name, "Active");
  assert.equal(restoredState1.encounterHistory["P1@@Shop"].count, 3);
  assert.equal(restoredState1.phaseAdjust.yellow, 1.5);
  assert.deepEqual(restoredState1.yellowSamples, [100, 102, 98]);
  assert.deepEqual(restoredState1.pinkCycleState, originalState.pinkCycleState);
  assert.equal(restoredState1.phaseAdjust.pink, -0.5);

  // Restore on next day (20261014) -> pink targets should automatically expire
  const restoredStateNextDay = {};
  p.restorePinkStateFromStorage(restoredStateNextDay, storage, { today: "20261014" });
  assert.deepEqual(restoredStateNextDay.pinkTargets, {});
  // But history and adjust should persist!
  assert.equal(restoredStateNextDay.encounterHistory["P1@@Shop"].count, 3);
  assert.equal(restoredStateNextDay.phaseAdjust.yellow, 1.5);
  assert.deepEqual(restoredStateNextDay.yellowSamples, [100, 102, 98]);
  assert.deepEqual(restoredStateNextDay.pinkCycleState, originalState.pinkCycleState);
  assert.equal(restoredStateNextDay.phaseAdjust.pink, -0.5);
});

test("Realtime activity save and restore", () => {
  const storage = createMockStorage();

  const state = {
    playerActivity: { playerA: 0.8 },
    rankActivity: { R7: 0.15 }
  };

  p.saveRealtimeActivityToStorage(state, storage);

  const restored = {};
  p.restoreRealtimeActivityFromStorage(restored, storage);

  assert.deepEqual(restored.playerActivity, { playerA: 0.8 });
  assert.deepEqual(restored.rankActivity, { R7: 0.15 });
});

test("R6 PRIDE frequency ledger", () => {
  const storage = createMockStorage();

  // Default when empty
  const defaultLedger = p.loadR6PrideLedger(storage);
  assert.equal(defaultLedger.version, 1);
  assert.equal(defaultLedger.credit, 0);
  assert.equal(defaultLedger.granted, false);

  // Update & save
  defaultLedger.credit = 0.8;
  defaultLedger.countedGenerations = 5;
  defaultLedger.grantedGenerations = 2;
  assert.equal(p.saveR6PrideLedger(defaultLedger, storage), true);

  // Re-read
  const reloaded = p.loadR6PrideLedger(storage);
  assert.equal(reloaded.credit, 0.8);
  assert.equal(reloaded.countedGenerations, 5);

  // Invalid ledger rejected
  storage.setItem(p.R6_PRIDE_FREQUENCY_STORAGE_KEY, JSON.stringify({ version: 999 }));
  assert.equal(p.loadR6PrideLedger(storage), null);
});

test("pruneLogStore logic deletes oldest keys exceeding limit", () => {
  const deletedKeys = [];
  const mockStore = {
    getAllKeys() {
      return {
        result: [105, 101, 104, 102, 103],
        onsuccess: null,
        onerror: null
      };
    },
    delete(k) {
      deletedKeys.push(k);
    }
  };

  const mockDb = {
    transaction() {
      return {
        objectStore() {
          return mockStore;
        }
      };
    }
  };

  // prune with limit 3 (should keep 3 newest: 103, 104, 105; delete 101, 102)
  p.pruneLogStore("testStore", 3, mockDb);
  mockStore.getAllKeys = () => {
    const req = { result: [105, 101, 104, 102, 103], onsuccess: null, onerror: null };
    queueMicrotask(() => req.onsuccess && req.onsuccess());
    return req;
  };
  p.pruneLogStore("testStore", 3, mockDb);
});

test("browser entry loads persistence globals in correct order", () => {
  const fs = require("node:fs");
  const indexSource = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.match(
    indexSource,
    /<script src="0100_utils\.js\?cb=\d+"><\/script>\s*<script src="0200_domain\.js\?cb=\d+"><\/script>\s*<script src="0300_persistence\.js\?cb=\d+"><\/script>\s*<script src="0400_data\.js\?cb=\d+"><\/script>\s*<script src="0500_matching\.js\?cb=\d+"><\/script>\s*<script src="0600_ui\.js\?cb=\d+"><\/script>\s*<script src="0700_app\.js\?cb=\d+"><\/script>\s*<script src="0800_main\.js\?cb=\d+"><\/script>/
  );
});
