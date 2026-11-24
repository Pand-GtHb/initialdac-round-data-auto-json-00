const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "record-poc", "storage.js"), "utf8");

function setup() {
  const context = vm.createContext({});
  vm.runInContext(source, context);
  const rows = new Map([["main", { revision: 3 }]]);
  const db = {
    transaction() {
      const changes = new Map(rows);
      let aborted = false;
      const tx = {
        objectStore() {
          return {
            get(key) {
              const request = {};
              queueMicrotask(() => {
                request.result = changes.get(key);
                request.onsuccess?.();
                if (!aborted) {
                  rows.clear();
                  for (const [name, value] of changes) rows.set(name, value);
                  tx.oncomplete();
                }
              });
              return request;
            },
            put(value, key) { changes.set(key, value); },
            clear() { changes.clear(); }
          };
        },
        abort() { aborted = true; tx.onabort(); }
      };
      return tx;
    }
  };
  return { api: context.RecordStorage, db, rows };
}

test("details are saved separately without rewriting the main revision", async () => {
  const { api, db, rows } = setup();
  await api.writeDetails(db, { affiliation: true }, 3);
  assert.equal((await api.readDetails(db)).affiliation, true);
  assert.equal(rows.get("main").revision, 3);
  await assert.rejects(api.writeDetails(db, { affiliation: false }, 2), /別タブ/);
  assert.equal(rows.get("details").affiliation, true);
});

test("reset removes details and rejects writes from older and reset revisions", async () => {
  const { api, db, rows } = setup();
  await api.writeDetails(db, { affiliation: true }, 3);
  const revision = await api.clear(db, 3);
  assert.equal(rows.size, 1);
  assert.equal((await api.read(db)).reset, true);
  await assert.rejects(api.writeDetails(db, { affiliation: true }, 3), /別タブ/);
  await assert.rejects(api.writeDetails(db, { affiliation: true }, revision), /別タブ/);
  assert.equal(rows.has("details"), false);
});
