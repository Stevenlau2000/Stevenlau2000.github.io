// === Impro 空压机 AI 维修副驾 - 知识库检索（浏览器内 RAG） ===
(function () {
  let KB = null;            // { version, count, chunks: [...] }
  let userChunks = [];     // 用户上传的分块

  function bigrams(text) {
    const s = text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
    const b = new Set();
    for (let i = 0; i < s.length - 1; i++) b.add(s.slice(i, i + 2));
    return b;
  }

  function scoreChunk(chunk, qbg) {
    const cbg = bigrams(chunk.title + ' ' + chunk.text + ' ' + (chunk.keywords || []).join(' '));
    if (!qbg.size || !cbg.size) return 0;
    let inter = 0;
    qbg.forEach((bg) => { if (cbg.has(bg)) inter++; });
    return inter / Math.max(qbg.size, cbg.size);
  }

  function search(query, topK = 8) {
    if (!KB && !userChunks.length) return [];
    const qbg = bigrams(query);
    const all = [...(KB ? KB.chunks : []), ...userChunks];
    return all
      .map((c) => ({ chunk: c, score: scoreChunk(c, qbg) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((x) => x.chunk);
  }

  function searchUser(query, topK = 4) {
    if (!userChunks.length) return [];
    const qbg = bigrams(query);
    return userChunks
      .map((c) => ({ chunk: c, score: scoreChunk(c, qbg) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((x) => x.chunk);
  }

  function formatContext(chunks) {
    if (!chunks || !chunks.length) return '';
    return chunks.map((c, i) => {
      const tag = c.source?.startsWith('upload') ? 'upload' : 'ref';
      return `[${tag}|${c.source || '内置库'}][${c.title}] ${c.text}`;
    }).join('\n\n');
  }

  function setUserChunks(chunks) {
    userChunks = chunks || [];
  }

  function getUserChunks() {
    return userChunks;
  }

  async function init() {
    try {
      const resp = await fetch('data/knowledge.json');
      KB = await resp.json();
      console.log(`[KB] 加载 ${KB.chunks.length} 条知识`);
    } catch (e) {
      console.warn('[KB] 知识库加载失败:', e.message);
      KB = null;
    }
  }

  globalThis.KnowledgeRAG = { init, search, searchUser, formatContext, setUserChunks, getUserChunks };
})();
