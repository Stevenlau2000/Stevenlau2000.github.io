/* uploads.js — 知识库文件上传：PDF/Word/TXT/MD 文本提取 → 分块 → 注入 RAG；
   音频/视频作为附件存储，在线模式可用 Whisper 兼容接口转写，或手动粘贴文本。 */
(function (global) {
  'use strict';

  const C = global.AppConfig;
  const K = global.KnowledgeRAG;

  const DB_NAME = 'impro_os_uploads';
  const STORE = 'files';
  const CHUNK_SIZE = 520;
  const CHUNK_OVERLAP = 90;
  const MAX_CHUNKS_PER_FILE = 80;
  const MAX_TOTAL_CHUNKS = 600;

  let dbp = null;
  let listeners = []; // 变更回调（用于刷新列表 / KB）

  // ---------- 工具 ----------
  function uid() { return 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function escapeHtml(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function fmtSize(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1024 / 1024).toFixed(1) + ' MB';
  }
  function fileCategory(file) {
    const n = (file.name || '').toLowerCase();
    const t = file.type || '';
    if (t === 'application/pdf' || n.endsWith('.pdf')) return 'document';
    if (n.endsWith('.docx') || n.endsWith('.doc') || t.includes('officedocument') || t.includes('msword')) return 'document';
    if (n.endsWith('.txt') || n.endsWith('.md') || n.endsWith('.markdown') || t === 'text/plain') return 'document';
    if (t.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|aac|flac)$/.test(n)) return 'audio';
    if (t.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi)$/.test(n)) return 'video';
    return 'other';
  }

  // 懒加载 CDN 库（按需，避免拖慢首屏）
  const loaded = {};
  function loadScript(src) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = () => resolve(); s.onerror = () => reject(new Error('加载失败: ' + src));
      document.head.appendChild(s);
    });
    return loaded[src];
  }
  const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const MAMMOTH_URL = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';

  // ---------- IndexedDB ----------
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }
  function tx(mode) { return open().then((db) => db.transaction(STORE, mode).objectStore(STORE)); }
  function req2p(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

  // ---------- 文本分块 ----------
  function chunkText(text, meta) {
    const paras = (text || '').split(/\r?\n+/).map((s) => s.trim()).filter(Boolean);
    const chunks = []; let buf = '';
    for (const p of paras) {
      if (buf && (buf.length + p.length + 1) > CHUNK_SIZE) { chunks.push(buf); buf = ''; }
      buf = buf ? buf + '\n' + p : p;
    }
    if (buf) chunks.push(buf);
    // 重叠合并小尾块
    if (chunks.length > 1) {
      const merged = [];
      for (let i = 0; i < chunks.length; i++) {
        let c = chunks[i];
        if (i < chunks.length - 1 && c.length < CHUNK_OVERLAP) c = c + '\n' + chunks[++i];
        merged.push(c);
      }
      chunks.length = 0; chunks.push(...merged);
    }
    const total = chunks.length;
    const kw = (meta.name || '').replace(/\.[^.]+$/, '').split(/[_\-\s.]+/).filter((w) => w.length > 1);
    return chunks.slice(0, MAX_CHUNKS_PER_FILE).map((c, i) => ({
      category: 'upload',
      source: meta.name,
      title: (meta.title || meta.name) + (total > 1 ? ` (${i + 1}/${total})` : ''),
      text: c,
      keywords: kw,
    }));
  }

  // ---------- 解析器 ----------
  async function readArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('读取文件失败'));
      r.readAsArrayBuffer(file);
    });
  }
  async function readText(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('读取文本失败'));
      r.readAsText(file);
    });
  }

  async function extractDocument(file) {
    const cat = fileCategory(file);
    const n = (file.name || '').toLowerCase();
    if (n.endsWith('.pdf')) {
      await loadScript(PDFJS_URL);
      const pdfjsLib = global.pdfjsLib;
      if (!pdfjsLib) throw new Error('PDF 解析库未加载');
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      const buf = await readArrayBuffer(file);
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      let text = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((it) => it.str || '').join(' ') + '\n';
      }
      return text;
    }
    if (n.endsWith('.docx')) {
      await loadScript(MAMMOTH_URL);
      if (!global.mammoth) throw new Error('Word 解析库未加载');
      const buf = await readArrayBuffer(file);
      const res = await global.mammoth.extractRawText({ arrayBuffer: buf });
      return res.value || '';
    }
    if (cat === 'document') {
      // .txt / .md / .doc(尽力以文本读)
      return await readText(file);
    }
    throw new Error('不支持的文档类型');
  }

  // 在线模式 Whisper 兼容转写（仅音频）
  async function transcribeAudio(file, settings) {
    if (!settings.url || !settings.key) throw new Error('请先在 ⚙️ 配置 API（在线模式 + Key）');
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('model', 'whisper-1');
    form.append('response_format', 'json');
    const res = await fetch(settings.url.replace(/\/$/, '') + '/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + settings.key },
      body: form,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error('转写失败 HTTP ' + res.status + '：' + t.slice(0, 160) + '（端点可能不支持 Whisper）');
    }
    const j = await res.json().catch(() => ({}));
    return j.text || '';
  }

  function mediaDuration(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const el = document.createElement(file.type.startsWith('video') ? 'video' : 'audio');
      el.preload = 'metadata';
      el.onloadedmetadata = () => { const d = el.duration; URL.revokeObjectURL(url); resolve(isFinite(d) ? d : 0); };
      el.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
      el.src = url;
    });
  }

  // ---------- 入库 / 变更 ----------
  function notify() { listeners.forEach((fn) => { try { fn(); } catch (e) {} }); }
  function allChunks() {
    // 同步聚合（用于即时注入）：依赖内存缓存
    return memoryChunks;
  }
  let memoryChunks = [];
  function rebuildKB() {
    memoryChunks = [];
    return list().then((files) => {
      for (const f of files) { if (f.text && f.status === 'indexed') memoryChunks = memoryChunks.concat(f.chunks || []); }
      if (memoryChunks.length > MAX_TOTAL_CHUNKS) memoryChunks = memoryChunks.slice(-MAX_TOTAL_CHUNKS);
      if (K && K.setUserChunks) K.setUserChunks(memoryChunks);
      return memoryChunks;
    });
  }

  // ---------- 公开 API ----------
  async function list() {
    const st = await tx('readonly');
    const all = await req2p(st.getAll());
    return all.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  async function remove(id) {
    const st = await tx('readwrite');
    await req2p(st.delete(id));
    await rebuildKB(); notify();
  }

  // 重新索引某个文件（文本变更后）
  async function reindex(id, text) {
    const st = await tx('readwrite');
    const rec = await req2p(st.get(id));
    if (!rec) return;
    const chunks = chunkText(text, { name: rec.name, title: rec.title });
    const merged = Object.assign({}, rec, { text, chunks, status: text && text.trim() ? 'indexed' : 'pending', updatedAt: new Date().toISOString() });
    await req2p(st.put(merged));
    await rebuildKB(); notify();
    return merged;
  }

  async function processFiles(fileList) {
    const files = Array.from(fileList || []);
    const results = [];
    for (const file of files) {
      const cat = fileCategory(file);
      const meta = {
        id: uid(), name: file.name, mime: file.type, size: file.size,
        category: cat, status: 'pending', text: '', chunks: [],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      if (cat === 'document') {
        try {
          meta.status = 'parsing';
          const text = await extractDocument(file);
          meta.text = text;
          meta.chunks = chunkText(text, { name: file.name });
          meta.status = (text && text.trim()) ? 'indexed' : 'empty';
          meta.title = file.name.replace(/\.[^.]+$/, '');
        } catch (e) {
          meta.status = 'error'; meta.error = e.message;
        }
      } else if (cat === 'audio' || cat === 'video') {
        meta.title = file.name.replace(/\.[^.]+$/, '');
        meta.duration = await mediaDuration(file);
        // 存储 blob 以便转写 / 回放
        meta.blob = file;
        meta.status = 'pending'; // 等待转写或手动文本
      } else {
        meta.status = 'error'; meta.error = '不支持的文件类型';
      }
      const st = await tx('readwrite');
      await req2p(st.put(meta));
      results.push(meta);
    }
    await rebuildKB(); notify();
    return results;
  }

  // 在线转写音频
  async function transcribe(id, settings) {
    const st = await tx('readonly');
    const rec = await req2p(st.get(id));
    if (!rec || rec.category !== 'audio') throw new Error('仅音频文件支持 AI 转写');
    const blob = rec.blob;
    if (!blob) throw new Error('原始音频已丢失，无法转写');
    const text = await transcribeAudio(blob, settings);
    return reindex(id, text);
  }

  function on(fn) { listeners.push(fn); }
  async function refreshKB() { return rebuildKB(); }
  async function init() { await open(); return rebuildKB(); }

  global.Uploads = { init, list, remove, reindex, processFiles, transcribe, refreshKB, on, getChunks: allChunks, fileCategory, fmtSize };
})(window);
