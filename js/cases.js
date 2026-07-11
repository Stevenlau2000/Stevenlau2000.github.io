/* cases.js — 案例库持久化（IndexedDB）+ 审核队列状态机 */
(function (global) {
  'use strict';

  const DB_NAME = 'impro_os';
  const STORE = 'cases';
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  async function tx(mode) {
    const db = await open();
    return db.transaction(STORE, mode).objectStore(STORE);
  }

  function req2p(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function add(obj) {
    const now = new Date().toISOString();
    const rec = Object.assign({ status: 'draft', createdAt: now, updatedAt: now }, obj);
    const st = await tx('readwrite');
    await req2p(st.put(rec));
    return rec;
  }

  async function list() {
    const st = await tx('readonly');
    const all = await req2p(st.getAll());
    return all.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  async function get(id) {
    const st = await tx('readonly');
    return req2p(st.get(id));
  }

  async function update(id, patch) {
    const st = await tx('readwrite');
    const rec = await req2p(st.get(id));
    if (!rec) return null;
    const merged = Object.assign({}, rec, patch, { updatedAt: new Date().toISOString() });
    await req2p(st.put(merged));
    return merged;
  }

  async function remove(id) {
    const st = await tx('readwrite');
    await req2p(st.delete(id));
  }

  global.CasesDB = { init: open, add, list, get, update, remove };
})(window);
