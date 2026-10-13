const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const p = require(path.join(__dirname, "..", "0300_persistence.js"));

function createMockStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
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
  assert.equal(p.LOG_STORAGE_LIMITS.copyEvents, 200);
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

  // Restore on next day (20261014) -> pink targets should automatically expire
  const restoredStateNextDay = {};
  p.restorePinkStateFromStorage(restoredStateNextDay, storage, { today: "20261014" });
  assert.deepEqual(restoredStateNextDay.pinkTargets, {});
  // But history and adjust should persist!
  assert.equal(restoredStateNextDay.encounterHistory["P1@@Shop"].count, 3);
  assert.equal(restoredStateNextDay.phaseAdjust.yellow, 1.5);
  assert.deepEqual(restoredStateNextDay.yellowSamples, [100, 102, 98]);
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

