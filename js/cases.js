// === Impro 空压机 AI 维修副驾 - 案例库（IndexedDB） ===
(function () {
  const DB_NAME = 'ImproCasesDB';
  const DB_VER = 1;
  const STORE = 'cases';

  let db = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(STORE)) {
          const store = d.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('created', 'created', { unique: false });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function init() {
    try { db = await openDB(); } catch (e) { db = null; }
    return !!db;
  }

  function add(caseData) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const record = {
        ...caseData,
        status: 'pending',   // pending | approved | rejected
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };
      const req = store.add(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function getAll() {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = (req.result || []).sort((a, b) => new Date(b.created) - new Date(a.created));
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }

  function update(id, updates) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const record = getReq.result;
        if (!record) { reject(new Error('not found')); return; }
        Object.assign(record, updates, { updated: new Date().toISOString() });
        store.put(record).onsuccess = () => resolve(true);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  function remove(id) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const st = tx.objectStore(STORE);
      const req = st.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  // 审核状态机
  async function approve(id) { return update(id, { status: 'approved' }); }
  async function reject(id) { return update(id, { status: 'rejected' }); }

  function exportJSON() {
    return getAll().then((list) => JSON.stringify(list, null, 2));
  }

  globalThis.CaseDB = { init, add, getAll, update, remove, approve, reject, exportJSON };
})();
