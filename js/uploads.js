// === Impro 空压机 AI 维修副驾 - 知识库文件上传模块 ===
(function () {
  const DB_NAME = 'ImproUploadsDB';
  const DB_VER = 1;
  const KB_STORE = 'uploadChunks';
  const FILE_STORE = 'uploadFiles';

  let db = null;
  let onFilesChanged = null;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(KB_STORE)) {
          d.createObjectStore(KB_STORE, { keyPath: 'id', autoIncrement: true });
        }
        if (!d.objectStoreNames.contains(FILE_STORE)) {
          const fs = d.createObjectStore(FILE_STORE, { keyPath: 'id', autoIncrement: true });
          fs.createIndex('type', 'type', { unique: false });
          fs.createIndex('created', 'created', { unique: false });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async function init() {
    try {
      db = await openDB();
      await refreshKB();
    } catch (e) {
      console.warn('[Uploads] DB init failed:', e);
      db = null;
    }
    return !!db;
  }

  // 将文本分块（~520 字/块，短尾块与前一块合并）
  function chunkText(text, source, title) {
    const size = 520;
    const paragraphs = text.split(/\n\s*\n/).filter(Boolean);
    const raw = [];
    for (const p of paragraphs) {
      for (let i = 0; i < p.length; i += size) {
        raw.push(p.slice(i, i + size));
      }
    }
    // 合并短尾
    const merged = [];
    for (const chunk of raw) {
      if (merged.length && merged[merged.length - 1].length < size * 0.4) {
        merged[merged.length - 1] += ' ' + chunk;
      } else {
        merged.push(chunk);
      }
    }
    return merged.map((t, i) => ({
      category: 'upload',
      source: source + (i > 0 ? ` (${i + 1}/${merged.length})` : ''),
      title: title + (merged.length > 1 ? ` (${i + 1}/${merged.length})` : ''),
      text: t,
      keywords: [],
    }));
  }

  // 解析 PDF 文本（使用 pdf.js CDN）
  async function parsePDF(file) {
    const pdfjsLib = window.pdfjsLib;
    if (!pdfjsLib) throw new Error('pdf.js 库未加载');
    const arrayBuf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuf).promise;
    let text = '';
    for (let i = 1; i <= Math.min(pdf.numPages, 50); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((item) => item.str).join(' ') + '\n';
    }
    return text;
  }

  // 解析 DOCX（使用 mammoth CDN）
  async function parseDOCX(file) {
    const mammoth = window.mammoth;
    if (!mammoth) throw new Error('mammoth 库未加载');
    const arrayBuf = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: arrayBuf });
    return result.value || '';
  }

  // 处理文件：解析 → 分块 → 持久化
  async function processFile(file) {
    const name = file.name;
    const ext = name.split('.').pop().toLowerCase();
    let text = '';

    if (ext === 'pdf') {
      text = await parsePDF(file);
    } else if (ext === 'docx') {
      text = await parseDOCX(file);
    } else if (['txt', 'md', 'markdown'].includes(ext)) {
      text = await file.text();
    } else if (['mp3', 'wav', 'm4a', 'ogg', 'mp4', 'webm', 'mov', 'avi'].includes(ext)) {
      // 音视频：存为附件，文本由用户手动录入
      return { type: 'media', fileName: name, status: 'needs_text', text: '' };
    } else {
      throw new Error('不支持的文件格式: .' + ext);
    }

    if (!text.trim()) throw new Error('未能从文件中提取到文本');
    const chunks = chunkText(text, name, name);
    const ids = await saveChunks(chunks);
    await logFile(name, 'document', chunks.length);
    return { type: 'document', fileName: name, chunkCount: chunks.length, chunks };
  }

  // 保存 chunks 到 IndexedDB
  function saveChunks(chunks) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(KB_STORE, 'readwrite');
      const store = tx.objectStore(KB_STORE);
      const ids = [];
      chunks.forEach((c) => {
        const req = store.add(c);
        req.onsuccess = () => ids.push(req.result);
      });
      tx.oncomplete = () => resolve(ids);
      tx.onerror = () => reject(tx.error);
    });
  }

  // 记录上传文件
  function logFile(fileName, type, chunkCount) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(FILE_STORE, 'readwrite');
      const store = tx.objectStore(FILE_STORE);
      store.add({ fileName, type, chunkCount, created: new Date().toISOString() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // 获取所有上传文件记录
  function getFiles() {
    return new Promise((resolve, reject) => {
      if (!db) { resolve([]); return; }
      const tx = db.transaction(FILE_STORE, 'readonly');
      const store = tx.objectStore(FILE_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  // 删除文件及关联 chunks
  async function removeFile(id) {
    // 获取文件记录中的 chunk count
    const tx1 = db.transaction(FILE_STORE, 'readonly');
    const fileRec = await new Promise((resolve, reject) => {
      tx1.objectStore(FILE_STORE).get(id).onsuccess = (e) => resolve(e.target.result);
    });
    if (!fileRec) return;
    // 删除 file 记录
    await new Promise((resolve, reject) => {
      const tx = db.transaction(FILE_STORE, 'readwrite');
      tx.objectStore(FILE_STORE).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    await refreshKB();
  }

  // 刷新 RAG 中的 userChunks
  async function refreshKB() {
    if (!db) return;
    const chunks = await new Promise((resolve, reject) => {
      const tx = db.transaction(KB_STORE, 'readonly');
      const req = tx.objectStore(KB_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    if (globalThis.KnowledgeRAG) {
      KnowledgeRAG.setUserChunks(chunks);
      console.log(`[Uploads] 注入 ${chunks.length} 个上传分块到 RAG`);
    }
    if (onFilesChanged) onFilesChanged(chunks.length);
  }

  // 手动添加文本（用于音视频转写或手动输入）
  async function addManualText(fileName, text) {
    const chunks = chunkText(text, fileName, fileName);
    const ids = await saveChunks(chunks);
    await logFile(fileName, 'manual', chunks.length);
    await refreshKB();
    return chunks.length;
  }

  // 监听文件变更
  function setOnFilesChanged(cb) {
    onFilesChanged = cb;
  }

  globalThis.Uploads = {
    init, processFile, addManualText,
    getFiles, removeFile, refreshKB,
    setOnFilesChanged,
    chunkText,
  };
})();
