/* app.js — 主逻辑：对话流式、混元调用、设置、案例库、安全护栏 */
(function () {
  'use strict';

  const C = window.AppConfig;
  const K = window.KnowledgeRAG;
  const DB = window.CasesDB;

  // ---------- 状态 ----------
  const state = {
    messages: [],          // 对话历史（不含 system）
    settings: { url: '', model: '', key: '' },
    knowledgeReady: false,
  };

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const chat = $('chat');
  const input = $('user-input');
  const connState = $('conn-state');

  // ---------- 工具 ----------
  function escapeHtml(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function inline(s) {
    s = escapeHtml(s);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return s;
  }
  function buildTable(rows) {
    const cells = (r) => r.split('|').map((x) => x.trim()).filter((x) => x);
    const head = cells(rows[0]);
    const body = rows.slice(2).map(cells);
    let h = '<table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>';
    for (const r of body) h += '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>';
    return h + '</tbody></table>';
  }
  function renderBlocks(text) {
    const lines = text.split('\n');
    const out = [];
    let listBuf = [], tableBuf = [];
    const flushList = () => { if (listBuf.length) { out.push('<ul>' + listBuf.map((x) => '<li>' + inline(x) + '</li>').join('') + '</ul>'); listBuf = []; } };
    const flushTable = () => { if (tableBuf.length >= 3) { out.push(buildTable(tableBuf)); } tableBuf = []; };
    for (const line of lines) {
      const t = line.trim();
      if (!t) { flushList(); flushTable(); continue; }
      let m;
      if ((m = t.match(/^(#{1,3})\s+(.*)/))) { flushList(); flushTable(); const l = m[1].length; out.push(`<h${l}>${inline(m[2])}</h${l}>`); }
      else if (/^\|.*\|\s*$/.test(t) && t.split('|').filter((x) => x.trim()).length >= 2) { flushList(); tableBuf.push(t); }
      else if ((m = t.match(/^([-*])\s+(.*)/))) { flushTable(); listBuf.push(m[2]); }
      else if ((m = t.match(/^(\d+)\.\s+(.*)/))) { flushTable(); listBuf.push(m[2]); }
      else if ((m = t.match(/^>\s?(.*)/))) { flushList(); flushTable(); out.push('<blockquote>' + inline(m[1]) + '</blockquote>'); }
      else { flushList(); flushTable(); out.push('<p>' + inline(t) + '</p>'); }
    }
    flushList(); flushTable();
    return out.join('');
  }
  function renderMarkdown(src) {
    const parts = src.split(/```/);
    let html = '';
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) html += renderBlocks(parts[i]);
      else { const code = parts[i].replace(/^\n/, '').replace(/\n$/, ''); html += '<pre><code>' + escapeHtml(code) + '</code></pre>'; }
    }
    return html;
  }
  function toast(msg, kind) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.style.background = kind === 'err' ? '#c0392b' : '#1e9e5a';
    t.classList.add('show');
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ---------- 渲染消息 ----------
  const SVG_BOT = '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="16" cy="16" r="12"/><path d="M16 16 L16 6"/><circle cx="16" cy="16" r="2.2" fill="currentColor" stroke="none"/><path d="M6.5 16 H9 M23 16 H25.5 M16 6.5 V9" stroke-width="1.5" opacity=".55"/></svg>';
  const SVG_USER = '<svg viewBox="0 0 32 32" fill="currentColor"><circle cx="16" cy="11" r="5.2"/><path d="M5 28 a11 11 0 0 1 22 0 Z"/></svg>';

  function addUserMsg(text) {
    const el = document.createElement('div');
    el.className = 'msg user';
    el.innerHTML = `<div class="avatar">${SVG_USER}</div><div class="bubble"></div>`;
    el.querySelector('.bubble').textContent = text;
    chat.appendChild(el);
    scrollDown();
  }
  function addBotMsg(kbCount) {
    const el = document.createElement('div');
    el.className = 'msg bot';
    el.innerHTML =
      `<div class="avatar">${SVG_BOT}</div>` +
      `<div class="bubble">` +
        `<div class="kb-hint">🔎 已匹配 ${kbCount} 条知识库参考（P1–P5 已融入推理）</div>` +
        `<div class="content"></div>` +
        `<div class="msg-acts"><button class="ghost sm" data-save-case>📑 沉淀案例</button></div>` +
      `</div>`;
    chat.appendChild(el);
    const content = el.querySelector('.content');
    const saveBtn = el.querySelector('[data-save-case]');
    saveBtn.addEventListener('click', () => saveCaseFromConversation(content.textContent, saveBtn));
    scrollDown();
    return content;
  }
  function scrollDown() { requestAnimationFrame(() => { chat.scrollTop = chat.scrollHeight; }); }

  // ---------- LLM 调用（流式 SSE） ----------
  async function callLLM(systemText, onDelta) {
    const { url, model, key } = state.settings;
    if (!url || !key) { toast('请先配置 API（⚙️）', 'err'); throw new Error('no-config'); }
    const body = {
      model,
      messages: [{ role: 'system', content: systemText }, ...state.messages],
      temperature: C.temperature,
      max_tokens: C.maxTokens,
      stream: true,
    };
    const res = await fetch(url.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error('HTTP ' + res.status + ' ' + errText.slice(0, 200));
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '', full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
        for (const ln of chunk.split('\n')) {
          const line = ln.trim();
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') continue;
          try {
            const j = JSON.parse(data);
            const d = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
            if (d) { full += d; onDelta(full); }
          } catch (e) { /* ignore */ }
        }
      }
    }
    return full;
  }

  // ---------- 发送 ----------
  async function send(text) {
    text = (text || '').trim();
    if (!text) return;
    const offline = (localStorage.getItem(C.storageKeys.mode) || 'online') === 'offline';
    if (!offline && (!state.settings.url || !state.settings.key)) {
      toast('请先点 ⚙️ 配置 API Key', 'err');
      $('settings-modal').classList.remove('hidden');
      return;
    }
    addUserMsg(text);
    input.value = ''; input.style.height = 'auto';

    // 前端安全护栏提示（在线/离线共用）
    const riskWords = ['短接', '绕过', '关闭保护', '解除急停', '短接急停', '屏蔽报警'];
    if (riskWords.some((w) => text.includes(w))) {
      const warn = document.createElement('div');
      warn.className = 'safety';
      warn.textContent = '⚠️ 检测到可能涉及绕过安全保护的描述。根据 AI 宪法，任何关闭/短接安全保护的要求都将被拒绝。请确认操作符合 LOTO 规范。';
      chat.appendChild(warn); scrollDown();
    }

    // 离线规则引擎分支（零 API）
    if (offline) {
      try {
        if (!OfflineEngine.kb) await OfflineEngine.init();
        const { text: out, kbCount } = OfflineEngine.diagnose(text);
        const contentEl = addBotMsg(kbCount);
        let full = out;
        // 追加上传资料中相关片段（离线也能用你上传的手册/SOP）
        const up = K.searchUser(text, 4);
        if (up.length) {
          full += '\n\n## 📚 你上传的资料（相关片段）\n' +
            up.map((c, i) => `[资料 ${i + 1}｜${c.source}]\n${c.text}`).join('\n\n');
        }
        contentEl.innerHTML = renderMarkdown(full);
      } catch (e) {
        const contentEl = addBotMsg(0);
        contentEl.innerHTML = '<p style="color:#dc2626">⚠️ 离线引擎加载失败：' + escapeHtml(e.message) + '</p>';
      }
      return;
    }

    state.messages.push({ role: 'user', content: text });
    const chunks = K.search(text, 8);
    const sysText = C.SYSTEM_PROMPT.replace('{KNOWLEDGE_CONTEXT}', K.formatContext(chunks));
    const contentEl = addBotMsg(chunks.length);
    contentEl.classList.add('typing');
    try {
      const full = await callLLM(sysText, (full) => { contentEl.classList.remove('typing'); contentEl.innerHTML = renderMarkdown(full); scrollDown(); });
      contentEl.innerHTML = renderMarkdown(full);
    } catch (e) {
      if (e.message !== 'no-config') {
        contentEl.classList.remove('typing');
        contentEl.innerHTML = '<p style="color:#dc2626">⚠️ 调用失败：' + escapeHtml(e.message) + '</p><p class="muted">请检查 ⚙️ 中的端点 / 模型 / API Key 是否正确，以及网络是否可访问该端点。</p>';
      }
      // 回滚本次 user message（避免污染历史）
      state.messages.pop();
    }
  }

  // ---------- 案例沉淀 ----------
  function pick(arr, re, fallback) {
    for (const m of arr) { const x = m.content.match(re); if (x) return x[1].trim(); }
    return fallback || '';
  }
  async function saveCaseFromConversation(botText, btn) {
    const recent = state.messages.slice(-6);
    const machine = pick(recent, /(?:型号|machine|model)[:：]\s*([^\s,，。\n]{2,30})/i, '');
    const fault = pick(recent.filter((m) => m.role === 'user'), /(.{4,60})/, '');
    const rec = await DB.add({
      machine, sn: '', hours: '', fault: fault || '(见对话)', alarm: '',
      rootCause: '', repair: '', parts: '', downtime: '', verification: '',
      tags: '', engineer: '', photos: '', note: (botText || '').slice(0, 3000),
    });
    toast('📑 已存入案例库（草稿），可在 📚 完善并提交审核');
  }

  // ---------- 设置面板 ----------
  function loadSettings() {
    state.settings = {
      url: localStorage.getItem(C.storageKeys.endpointUrl) || C.ENDPOINTS[0].url,
      model: localStorage.getItem(C.storageKeys.model) || C.ENDPOINTS[0].model,
      key: localStorage.getItem(C.storageKeys.apiKey) || '',
    };
    const sel = $('set-endpoint');
    sel.innerHTML = C.ENDPOINTS.map((e, i) => `<option value="${i}">${e.label}</option>`).join('');
    // 选中匹配项
    let idx = C.ENDPOINTS.findIndex((e) => e.url === state.settings.url);
    if (idx < 0) idx = C.ENDPOINTS.length - 1; // 自定义
    sel.value = String(idx);
    $('set-url').value = idx === C.ENDPOINTS.length - 1 ? state.settings.url : '';
    $('set-model').value = state.settings.model;
    $('set-key').value = state.settings.key;
    $('set-mode').value = localStorage.getItem(C.storageKeys.mode) || 'online';
    updateConnState();
  }
  function updateConnState() {
    const dot = $('conn-dot');
    if ((localStorage.getItem(C.storageKeys.mode) || 'online') === 'offline') {
      connState.textContent = '离线模式 · 规则引擎';
      connState.style.color = '#ffd591';
      if (dot) { dot.classList.add('ok'); dot.style.background = '#ffb020'; }
      return;
    }
    const ok = state.settings.url && state.settings.key;
    connState.textContent = ok ? '已连接 · ' + state.settings.model : '未配置 API';
    connState.style.color = ok ? '#3ddc84' : '#ff6b6b';
    if (dot) { dot.classList.toggle('ok', !!ok); dot.style.background = ok ? '#3ddc84' : '#ff5252'; }
  }
  function saveSettings() {
    const mode = $('set-mode').value;
    localStorage.setItem(C.storageKeys.mode, mode);
    if (mode === 'offline') {
      state.settings.mode = 'offline';
      updateConnState();
      setMsg('✅ 已保存（离线模式 · 零 Key）', 'ok');
      return;
    }
    const idx = parseInt($('set-endpoint').value, 10);
    const e = C.ENDPOINTS[idx];
    const url = idx === C.ENDPOINTS.length - 1 ? $('set-url').value.trim() : e.url;
    const model = idx === C.ENDPOINTS.length - 1 ? $('set-model').value.trim() : e.model;
    const key = $('set-key').value.trim();
    if (!url || !model || !key) { setMsg('端点、模型、Key 均需填写', 'err'); return; }
    state.settings = { url, model, key, mode: 'online' };
    localStorage.setItem(C.storageKeys.endpointUrl, url);
    localStorage.setItem(C.storageKeys.model, model);
    localStorage.setItem(C.storageKeys.apiKey, key);
    updateConnState();
    setMsg('✅ 已保存', 'ok');
  }
  function setMsg(t, k) { const m = $('set-msg'); m.textContent = t; m.className = 'msg ' + (k || ''); }
  async function testConn() {
    const idx = parseInt($('set-endpoint').value, 10);
    const e = C.ENDPOINTS[idx];
    const url = idx === C.ENDPOINTS.length - 1 ? $('set-url').value.trim() : e.url;
    const model = idx === C.ENDPOINTS.length - 1 ? $('set-model').value.trim() : e.model;
    const key = $('set-key').value.trim();
    if (!url || !model || !key) { setMsg('请先填写完整再测试', 'err'); return; }
    setMsg('测试中…', '');
    try {
      const res = await fetch(url.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: '你好' }], max_tokens: 10 }),
      });
      setMsg(res.ok ? '✅ 连接成功 (HTTP ' + res.status + ')' : '❌ 失败 HTTP ' + res.status, res.ok ? 'ok' : 'err');
    } catch (err) { setMsg('❌ 网络错误：' + err.message, 'err'); }
  }

  // ---------- 案例库面板 ----------
  async function openCases() {
    $('cases-modal').classList.remove('hidden');
    await renderCases();
  }
  async function renderCases() {
    const list = await DB.list();
    $('cases-count').textContent = list.length + ' 条';
    const ul = $('cases-list');
    const detail = $('case-detail');
    detail.classList.add('hidden'); detail.innerHTML = '';
    if (!list.length) { ul.innerHTML = '<div class="empty">暂无案例。对话中点击「📑 沉淀案例」即可积累。</div>'; return; }
    ul.innerHTML = list.map((c) => `
      <li class="case-item" data-id="${c.id}">
        <div class="ci-top"><span class="ci-title">${escapeHtml(c.machine || '未知机型')} · ${escapeHtml((c.fault || '').slice(0, 24))}</span>
        <span class="badge ${c.status}">${statusLabel(c.status)}</span></div>
        <div class="ci-sub">${escapeHtml((c.rootCause || '根因待填').slice(0, 40))} · ${fmtDate(c.createdAt)}</div>
      </li>`).join('');
    ul.querySelectorAll('.case-item').forEach((li) => li.addEventListener('click', () => showCase(li.dataset.id)));
  }
  function statusLabel(s) { return { draft: '草稿', review: '审核中', published: '已发布', rejected: '已退回' }[s] || s; }
  function fmtDate(s) { try { return new Date(s).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
  async function showCase(id) {
    const c = await DB.get(id);
    if (!c) return;
    const d = $('case-detail');
    d.classList.remove('hidden');
    const field = (k, label, editable) =>
      `<div class="kv"><b>${label}：</b>${editable ? `<input data-f="${k}" value="${escapeHtml(c[k] || '')}" style="width:70%;padding:4px;border:1px solid #e2e8f0;border-radius:6px;"/>` : escapeHtml(c[k] || '—')}</div>`;
    d.innerHTML = `
      <h3 style="margin:0 0 8px;">案例 ${id.slice(-6)} · <span class="badge ${c.status}">${statusLabel(c.status)}</span></h3>
      ${field('machine', '机型')} ${field('sn', 'SN')} ${field('hours', '运行小时')}
      ${field('fault', '故障现象')} ${field('alarm', '报警代码')}
      ${field('rootCause', '根因', true)} ${field('repair', '维修动作', true)}
      ${field('parts', '更换备件', true)} ${field('downtime', '停机时长')}
      ${field('verification', '验证结果', true)} ${field('tags', '标签')} ${field('engineer', '工程师')}
      <div class="kv"><b>备注/对话摘要：</b><div style="font-size:12.5px;color:#475569;white-space:pre-wrap;">${escapeHtml((c.note || '').slice(0, 800))}</div></div>
      <div class="acts">
        <button class="primary sm" data-act="save">💾 保存编辑</button>
        <button class="ghost sm" data-act="review">提交审核</button>
        <button class="ghost sm" data-act="publish">直接发布</button>
        <button class="danger-ghost sm" data-act="delete">删除</button>
      </div>`;
    d.querySelector('[data-act="save"]').onclick = async () => {
      const patch = {};
      d.querySelectorAll('input[data-f]').forEach((i) => (patch[i.dataset.f] = i.value));
      await DB.update(id, patch); toast('💾 已保存');
    };
    d.querySelector('[data-act="review"]').onclick = async () => { await DB.update(id, { status: 'review' }); toast('已提交审核'); renderCases(); };
    d.querySelector('[data-act="publish"]').onclick = async () => { await DB.update(id, { status: 'published' }); toast('✅ 已发布'); renderCases(); };
    d.querySelector('[data-act="delete"]').onclick = async () => { if (confirm('确认删除该案例？')) { await DB.remove(id); toast('已删除'); renderCases(); } };
  }
  async function exportCases() {
    const list = await DB.list();
    const blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'impro-cases-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
  }

  // ---------- 知识库文件上传面板 ----------
  function fmtDur(s) { s = Math.round(s || 0); const m = Math.floor(s / 60); const r = s % 60; return m + ':' + String(r).padStart(2, '0'); }
  function kbStatus(s) {
    return { indexed: '已索引', pending: '待处理', parsing: '解析中', transcribing: '转写中', error: '失败', empty: '空文档', 'error': '失败' }[s] || s;
  }
  function kbItemHtml(f) {
    const ic = f.category === 'document' ? { c: 'doc', e: '📄' }
      : f.category === 'audio' ? { c: 'audio', e: '🎙️' }
      : f.category === 'video' ? { c: 'video', e: '🎞️' } : { c: '', e: '📦' };
    const sub = [Uploads.fmtSize(f.size),
      f.status === 'indexed' ? ((f.chunks || []).length + ' 段') : '',
      f.duration ? fmtDur(f.duration) : ''].filter(Boolean).join(' · ');
    let acts = '<button class="danger-ghost sm" data-act="del">删除</button>';
    if (f.category === 'audio' || f.category === 'video') {
      acts = '<button class="ghost sm" data-act="save">💾 保存文本</button>' + acts;
      if (f.category === 'audio' && f.status !== 'transcribing') acts = '<button class="primary sm" data-act="transcribe">🎧 AI 转写</button>' + acts;
    }
    const txtArea = (f.category === 'audio' || f.category === 'video')
      ? `<textarea class="kb-area" data-edit placeholder="粘贴转写文本 / 现场记录，保存后即入库检索…">${escapeHtml(f.text || '')}</textarea>` : '';
    const err = f.error ? `<div class="kb-err">⚠️ ${escapeHtml(f.error)}</div>` : '';
    return `<li class="kb-item" data-id="${f.id}">
      <div class="kb-top">
        <div class="kb-ic ${ic.c}">${ic.e}</div>
        <div class="kb-name"><div class="nm">${escapeHtml(f.name)}</div><div class="sub">${escapeHtml(sub)}</div></div>
        <span class="kb-badge ${f.status}">${kbStatus(f.status)}</span>
      </div>
      ${txtArea}${err}
      <div class="kb-acts">${acts}</div>
    </li>`;
  }
  async function openKb() { $('kb-modal').classList.remove('hidden'); await renderKb(); }
  async function renderKb() {
    const files = await Uploads.list();
    const chunks = Uploads.getChunks().length;
    $('kb-stat').textContent = files.length + ' 个文件 · ' + chunks + ' 段知识';
    const ul = $('kb-list');
    if (!files.length) { ul.innerHTML = '<div class="empty">还没有文件。拖入 PDF/Word/文本 即可入库检索；音频/视频可转写后入库。</div>'; return; }
    ul.innerHTML = files.map(kbItemHtml).join('');
    ul.querySelectorAll('.kb-item').forEach((li) => {
      const id = li.dataset.id;
      const del = li.querySelector('[data-act="del"]'); if (del) del.onclick = async () => { await Uploads.remove(id); toast('已删除'); renderKb(); };
      const tr = li.querySelector('[data-act="transcribe"]'); if (tr) tr.onclick = () => doTranscribe(id, li);
      const save = li.querySelector('[data-act="save"]'); if (save) save.onclick = async () => { const ta = li.querySelector('.kb-area'); await Uploads.reindex(id, ta.value); toast('✅ 已重新入库'); renderKb(); };
    });
  }
  async function doTranscribe(id, li) {
    const btn = li.querySelector('[data-act="transcribe"]');
    const badge = li.querySelector('.kb-badge');
    if (btn) { btn.disabled = true; btn.textContent = '转写中…'; }
    if (badge) { badge.className = 'kb-badge transcribing'; badge.textContent = '转写中'; }
    try {
      const mode = localStorage.getItem(C.storageKeys.mode) || 'online';
      if (mode === 'offline') throw new Error('离线模式不支持 AI 转写，请切在线或手动粘贴文本');
      const settings = {
        url: localStorage.getItem(C.storageKeys.endpointUrl) || C.ENDPOINTS[0].url,
        key: localStorage.getItem(C.storageKeys.apiKey) || '',
      };
      await Uploads.transcribe(id, settings);
      toast('✅ 转写完成并入库');
    } catch (e) { toast('转写失败：' + e.message, 'err'); }
    renderKb();
  }

  // ---------- 事件绑定 ----------
  function bind() {
    $('input-bar').addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });
    input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); } });
    $('btn-settings').onclick = () => $('settings-modal').classList.remove('hidden');
    $('btn-cases').onclick = openCases;
    $('btn-kb').onclick = openKb;
    $('btn-new').onclick = () => { state.messages = []; chat.innerHTML = ''; welcome(); toast('已开始新对话'); };
    // 知识库文件上传
    const fileInput = $('kb-file');
    const handleFiles = (fl) => {
      if (!fl || !fl.length) return;
      toast('📥 正在解析 ' + fl.length + ' 个文件…');
      Uploads.processFiles(fl).then(() => { if (!$('kb-modal').classList.contains('hidden')) renderKb(); })
        .catch((err) => toast('解析失败：' + err.message, 'err'));
    };
    fileInput.addEventListener('change', (e) => { handleFiles(e.target.files); e.target.value = ''; });
    const drop = $('kb-drop');
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('drag'); }));
    drop.addEventListener('drop', (e) => { handleFiles(e.dataTransfer.files); });
    document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => $(b.dataset.close).classList.add('hidden')));
    document.querySelectorAll('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); }));
    $('set-save').onclick = saveSettings;
    $('set-test').onclick = testConn;
    $('set-clear').onclick = () => {
      Object.values(C.storageKeys).forEach((k) => localStorage.removeItem(k));
      state.settings = { url: '', model: '', key: '' }; loadSettings(); setMsg('已清空', ''); updateConnState();
    };
    $('cases-refresh').onclick = renderCases;
    $('cases-export').onclick = exportCases;
  }

  function welcome() {
    const offline = (localStorage.getItem(C.storageKeys.mode) || 'online') === 'offline';
    const heroTxt = offline
      ? '当前为 <b>离线规则引擎</b>：零 Key、可离线、打开即用。点下面的常见问题直接试，或描述你的故障。'
      : '我是你的现场维修副驾。在线模式 <b>先点右上角 ⚙️ 配置 API Key</b>；或切到离线模式直接可用。';
    const chips = offline
      ? ['排气温度 105℃、电流正常、频繁跳机', '螺杆机频繁加卸载、压力波动', '排气口带油、耗油大']
      : ['排气温度 105℃、电流正常、频繁跳机', '螺杆机频繁加卸载、压力波动', '排气口带油、耗油大', '机器异响、振动大'];
    const el = document.createElement('div');
    el.className = 'welcome';
    el.innerHTML =
      `<div class="hero-badge"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="16" cy="16" r="12"/><path d="M16 16 L16 6"/><circle cx="16" cy="16" r="2.2" fill="currentColor" stroke="none"/><path d="M6.5 16 H9 M23 16 H25.5 M16 6.5 V9" stroke-width="1.5" opacity=".55"/></svg></div>` +
      `<h1>老宋 · 空压机 AI 维修副驾</h1>` +
      `<p>${heroTxt}</p>` +
      `<div class="chips">${chips.map((c) => `<button class="chip">${escapeHtml(c)}</button>`).join('')}</div>`;
    chat.appendChild(el);
    el.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => send(b.textContent)));
  }

  // ---------- 初始化 ----------
  async function init() {
    bind();
    loadSettings();
    try { await K.init(); state.knowledgeReady = true; } catch (e) { toast('知识库加载失败', 'err'); }
    try { await DB.init(); } catch (e) {}
    try { await Uploads.init(); } catch (e) { toast('上传模块加载失败', 'err'); }
    if ((localStorage.getItem(C.storageKeys.mode) || 'online') === 'offline') {
      OfflineEngine.init().catch(() => toast('离线知识库加载失败', 'err'));
    }
    welcome();
  }
  init();
})();
