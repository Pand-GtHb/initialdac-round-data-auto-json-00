(function (root) {
  "use strict";
  function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("dac-record-poc", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("state");
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("別タブを閉じてから開き直してください。"));
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
    });
  }
  function read(db) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("state", "readonly");
      const request = tx.objectStore("state").get("main");
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error || new Error("読み込みが中断されました。"));
    });
  }
  function readDetails(db) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("state", "readonly");
      const request = tx.objectStore("state").get("details");
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error || new Error("表示状態の読み込みが中断されました。"));
    });
  }
  function writeDetails(db, value, expectedRevision) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("state", "readwrite");
      const store = tx.objectStore("state");
      let conflict = false;
      const request = store.get("main");
      request.onsuccess = () => {
        if (request.result?.reset || (request.result?.revision ?? 0) !== expectedRevision) {
          conflict = true;
          tx.abort();
          return;
        }
        store.put(value, "details");
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(conflict
        ? new Error("別タブでデータが更新されました。この画面の救出用JSONを保存してから再読み込みしてください。")
        : tx.error || new Error("表示状態の保存が中断されました。"));
    });
  }
  function commit(db, value, expectedRevision, clear) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("state", "readwrite");
      const store = tx.objectStore("state");
      let conflict = false;
      const request = store.get("main");
      request.onsuccess = () => {
        if ((request.result?.revision ?? 0) !== expectedRevision) {
          conflict = true;
          tx.abort();
          return;
        }
        if (clear) store.clear();
        store.put({ ...value, revision: expectedRevision + 1 }, "main");
      };
      tx.oncomplete = () => resolve(expectedRevision + 1);
      tx.onabort = () => reject(conflict
        ? new Error("別タブでデータが更新されました。この画面の救出用JSONを保存してから再読み込みしてください。")
        : tx.error || new Error("保存が中断されました。"));
    });
  }
  function write(db, value, expectedRevision) {
    return commit(db, value, expectedRevision, false);
  }
  function clear(db, expectedRevision) {
    // Keep only the revision marker so stale tabs cannot restore erased data.
    return commit(db, { reset: true }, expectedRevision, true);
  }
  root.RecordStorage = { open, read, write, clear, readDetails, writeDetails };
})(globalThis);
