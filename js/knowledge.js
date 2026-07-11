/* knowledge.js — 浏览器内轻量 RAG 检索（关键词 + bigram 相关性打分） */
(function (global) {
  'use strict';

  let KB = null; // { version, count, chunks: [...] }
  let userChunks = []; // 用户上传文件解析出的分块（运行时 + 持久化合并）

  function bigrams(s) {
    const clean = (s || '').replace(/[\s\p{P}\p{S}]+/gu, '');
    const out = [];
    for (let i = 0; i < clean.length - 1; i++) {
      const b = clean.slice(i, i + 2);
      if (/[\u4e00-\u9fa5]{2}/.test(b)) out.push(b);
    }
    return out;
  }

  async function init() {
    if (KB) return KB;
    const res = await fetch('data/knowledge.json', { cache: 'no-cache' });
    KB = await res.json();
    return KB;
  }

  // 相关性打分：标题命中权重高，关键词次之，正文包含再次之
  function scoreChunk(chunk, qbg) {
    if (!qbg.length) return 0;
    let score = 0;
    const title = chunk.title || '';
    const text = chunk.text || '';
    const kws = chunk.keywords || [];
    for (const qb of qbg) {
      if (title.includes(qb)) score += 4;
      if (kws.some((k) => k === qb || k.includes(qb) || qb.includes(k))) score += 2;
      if (text.includes(qb)) score += 1;
    }
    return score;
  }

  function search(query, topK = 8) {
    if (!KB) return userChunks.slice(0, topK);
    const all = KB.chunks.concat(userChunks);
    const qbg = bigrams(query);
    const scored = all
      .map((c) => ({ chunk: c, score: scoreChunk(c, qbg) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((x) => x.chunk);
    return scored;
  }

  // 仅检索用户上传知识（离线引擎追加上下文用）
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

  function setUserChunks(arr) { userChunks = Array.isArray(arr) ? arr : []; }
  function getUserChunks() { return userChunks; }

  // 拼成可注入 System Prompt 的知识上下文
  function formatContext(chunks) {
    if (!chunks.length) return '（本次未检索到相关参考知识，基于通用工程推理，并标注「工程推理，未经知识库确认」）';
    const blocks = chunks.map((c, i) => {
      const src = c.source || 'reference';
      return `[参考 ${i + 1}｜${c.category}｜${src}]\n${c.text}`;
    });
    return blocks.join('\n\n');
  }

  global.KnowledgeRAG = { init, search, formatContext, searchUser, setUserChunks, getUserChunks };
})(window);
