(function (root) {
  "use strict";
  const version = 139;
  const currentCache = `dac-record-poc-v${version}`;
  const isAppCache = name => /^dac-record-poc-v\d+$/.test(name);
  async function cacheNames() {
    if (!root.caches) throw new Error("このブラウザではアプリ用キャッシュを確認できません。");
    return (await root.caches.keys()).filter(isAppCache);
  }
  function workerStatus(worker) {
    return new Promise((resolve, reject) => {
      const channel = new root.MessageChannel();
      const close = () => {
        root.clearTimeout(timer);
        channel.port1.close();
        channel.port2.close();
      };
      const timer = root.setTimeout(() => {
        close();
        reject(new Error("旧版または応答しないオフライン機能があります。このアプリのタブをすべて閉じ、開き直してから実行してください。"));
      }, 2000);
      channel.port1.onmessage = event => {
        const data = event.data;
        close();
        if (!data || !isAppCache(data.cache) || !Number.isInteger(data.otherTabs) || data.otherTabs < 0) {
          reject(new Error("オフライン機能の状態を確認できませんでした。消去は中止しました。"));
        } else resolve(data);
      };
      try {
        worker.postMessage({ type: "DAC_MAINTENANCE_STATUS" }, [channel.port2]);
      } catch (error) {
        close();
        reject(error);
      }
    });
  }
  async function registrations(scope) {
    if (!root.navigator.serviceWorker) return [];
    return (await root.navigator.serviceWorker.getRegistrations()).filter(registration => registration.scope === scope);
  }
  async function offlineStatus(scope) {
    const registered = await registrations(scope);
    const workers = [...new Set(registered.flatMap(registration =>
      [registration.active, registration.waiting, registration.installing].filter(Boolean)))];
    const statuses = await Promise.all(workers.map(workerStatus));
    return { registered, statuses };
  }
  async function cleanOldCaches(scope) {
    const { statuses } = await offlineStatus(scope);
    const protectedNames = new Set([currentCache, ...statuses.map(status => status.cache)]);
    const obsolete = (await cacheNames()).filter(name => !protectedNames.has(name));
    let removed = 0;
    for (const name of obsolete) if (await root.caches.delete(name)) removed++;
    return removed;
  }
  async function clearOffline(scope) {
    const { registered, statuses } = await offlineStatus(scope);
    if (statuses.some(status => status.otherTabs > 0)) {
      throw new Error("このアプリの別タブが開いています。ほかのタブを閉じてから初期化してください。");
    }
    const names = await cacheNames();
    for (const registration of registered) {
      if (!await registration.unregister()) throw new Error("オフライン機能の登録解除を確認できませんでした。初期化を中止しました。");
    }
    for (const name of names) await root.caches.delete(name);
  }
  const api = { version, cacheNames, cleanOldCaches, clearOffline };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RecordMaintenance = api;
})(globalThis);
