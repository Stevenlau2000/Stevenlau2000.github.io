// === Impro 空压机 AI 维修副驾 - 主对话逻辑 ===
(function () {
  const $ = (id) => document.getElementById(id);

  // ---------- 状态 ----------
  const state = {
    messages: [],
    mode: 'online',    // 'online' | 'offline'
    apiKey: '',
    endpoint: CONFIG.DEFAULT_ENDPOINT,
    model: CONFIG.DEFAULT_MODEL,
    sending: false,
  };

  // ---------- DOM 引用 ----------
  let chat, input, sendBtn, connDot, modeSelect, keyInput, endpointInput;

  // ---------- 工具函数 ----------
  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function renderMarkdown(text) {
    if (!text) return '';
    let html = escapeHtml(text);
    // 代码块
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="lang-$1">$2</code></pre>');
    // 行内代码
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // 标题
    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');
    // 加粗
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // 列表
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
    html = html.replace(/^(\d+)\. (.+)$/gm, '<li>$1. $2</li>');
    // 引用
    html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
    // 换行
    html = html.replace(/\n/g, '<br>');
    html = html.replace(/(<\/h[234]>)\s*<br>/g, '$1');
    html = html.replace(/(<\/li>)\s*<br>/g, '$1');
    html = html.replace(/(<\/ul>)\s*<br>/g, '$1');
    html = html.replace(/(<\/blockquote>)\s*<br>/g, '$1');
    html = html.replace(/(<\/pre>)\s*<br>/g, '$1');
    return html;
  }

  function toast(msg, duration = 2500) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('show'), 10);
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, duration);
  }

  function updateConnState(status) {
    if (!connDot) return;
    connDot.className = 'conn-dot ' + status;
  }

  // ---------- 渲染 ----------
  function addUserMsg(text) {
    const div = document.createElement('div');
    div.className = 'msg user';
    div.innerHTML = `<div class="msg-avatar"><svg viewBox="0 0 40 40" width="32" height="32"><circle cx="20" cy="20" r="18" fill="#1a3a5c"/><text x="20" y="25" text-anchor="middle" fill="#00d4ff" font-size="18" font-family="sans-serif">👤</text></svg></div><div class="msg-bubble"><div class="msg-text">${escapeHtml(text)}</div></div>`;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    return div;
  }

  function addBotMsg(kbCount) {
    const div = document.createElement('div');
    div.className = 'msg bot';
    const kbInfo = kbCount ? `<div class="kb-badge">📚 ${kbCount} 条知识</div>` : '';
    div.innerHTML = `<div class="msg-avatar"><svg viewBox="0 0 40 40" width="32" height="32"><circle cx="20" cy="20" r="18" fill="#2d1b00"/><circle cx="20" cy="16" r="7" fill="#f0b429"/><circle cx="20" cy="16" r="3" fill="#1a1a2e"/><rect x="14" y="28" width="12" height="3" rx="1.5" fill="#f0b429"/></svg></div><div class="msg-bubble"><div class="msg-text"></div>${kbInfo}</div>`;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    return div.querySelector('.msg-text');
  }

  const DEMO_CHIPS = [
    '排气温度105℃，怎么办？',
    '压力偏低排查步骤',
    '螺杆机异响故障',
    '变频器报警F011',
    '油分更换周期',
    '冷却器清洗方法',
  ];

  function welcome() {
    chat.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'welcome';
    div.innerHTML = `
      <div class="welcome-logo">
        <svg viewBox="0 0 100 100" width="80" height="80">
          <circle cx="50" cy="50" r="44" fill="none" stroke="#f0b429" stroke-width="3"/>
          <circle cx="50" cy="50" r="30" fill="none" stroke="#0ea5e9" stroke-width="3" stroke-dasharray="141.3" stroke-dashoffset="47.1"/>
          <text x="50" y="42" text-anchor="middle" fill="#f0b429" font-size="24" font-family="monospace">MPa</text>
          <text x="50" y="64" text-anchor="middle" fill="#00d4ff" font-size="10" font-family="monospace">IMPRO</text>
          <line x1="20" y1="50" x2="8" y2="50" stroke="#f0b429" stroke-width="2"/>
          <line x1="80" y1="50" x2="92" y2="50" stroke="#f0b429" stroke-width="2"/>
          <line x1="50" y1="20" x2="50" y2="8" stroke="#f0b429" stroke-width="2"/>
          <line x1="50" y1="80" x2="50" y2="92" stroke="#f0b429" stroke-width="2"/>
        </svg>
      </div>
      <h2>老宋 · 空压机智能诊断</h2>
      <p class="welcome-sub">30 年维修总工，随时为您服务</p>
      <div class="welcome-chips">${DEMO_CHIPS.map((c) => `<span class="chip" data-text="${escapeHtml(c)}">${escapeHtml(c)}</span>`).join('')}</div>
      <p class="welcome-hint">${state.mode === 'online' ? '💬 输入故障现象，老宋在线诊断' : '🔌 离线模式 — 基础规则引擎'}</p>
    `;
    chat.appendChild(div);
    // 绑定 chips
    div.querySelectorAll('.chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const text = chip.getAttribute('data-text');
        input.value = text;
        send();
      });
    });
  }

  // ---------- AI 调用 ----------
  async function callLLM(userMsg, context) {
    const baseUrl = state.endpoint.replace(/\/+$/, '');
    const url = baseUrl + '/chat/completions';
    const ctxBlock = context ? { role: 'system', content: '参考以下知识库内容回答：\n\n' + context } : null;
    const messages = [
      { role: 'system', content: CONFIG.SYSTEM_PROMPT + '\n\n你叫「老宋」，请以老宋的口吻直接回答。回答要简短、专业、接地气。' },
      ...(ctxBlock ? [ctxBlock] : []),
      ...state.messages.slice(-20).map((m) => ({ role: m.role, content: m.content })),
    ];

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + state.apiKey },
      body: JSON.stringify({
        model: state.model,
        messages,
        temperature: 0.6,
        max_tokens: 1200,
        stream: false,
      }),
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => '');
      throw new Error(`API ${resp.status}: ${err.slice(0, 200)}`);
    }
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || '(模型未返回内容)';
  }

  // ---------- 发送 ----------
  async function send() {
    const text = input.value.trim();
    if (!text || state.sending) return;
    input.value = '';
    state.sending = true;
    sendBtn.disabled = true;

    // 添加用户消息
    addUserMsg(text);
    state.messages.push({ role: 'user', content: text });

    // 判断离线
    const offline = state.mode === 'offline' || !state.apiKey;

    // 在线分支
    if (!offline) {
      try {
        updateConnState('thinking');
        // RAG 检索
        let context = '';
        let kbCount = 0;
        if (globalThis.KnowledgeRAG) {
          const hits = KnowledgeRAG.search(text, 8);
          kbCount = hits.length;
          context = KnowledgeRAG.formatContext(hits);
        }
        const contentEl = addBotMsg(kbCount);
        // 检索上传库
        let uploadCtx = '';
        if (globalThis.KnowledgeRAG) {
          const uploadHits = KnowledgeRAG.searchUser(text, 4);
          if (uploadHits.length) {
            uploadCtx = KnowledgeRAG.formatContext(uploadHits);
            context = context + '\n\n【用户上传资料】\n' + uploadCtx;
          }
        }
        const reply = await callLLM(text, context);
        contentEl.innerHTML = renderMarkdown(reply);
        state.messages.push({ role: 'assistant', content: reply });
        updateConnState('online');
      } catch (e) {
        updateConnState('error');
        const contentEl = addBotMsg(0);
        contentEl.innerHTML = '<p style="color:#ef4444">⚠️ 在线诊断失败：' + escapeHtml(e.message) + '</p><p>请检查 API Key 和网络连接，或切换到「离线模式」使用规则引擎。</p>';
      }
    } else {
      // 离线分支
      try {
        let kbCount = 0;
        // 检索上传库
        let uploadCtx = '';
        if (globalThis.KnowledgeRAG) {
          const hits = KnowledgeRAG.search(text, 8);
          kbCount += hits.length;
          const uh = KnowledgeRAG.searchUser(text, 4);
          kbCount += uh.length;
        }
        const result = OfflineEngine.diagnose(text);
        const contentEl = addBotMsg(kbCount);
        contentEl.innerHTML = renderMarkdown(result.text);
        state.messages.push({ role: 'assistant', content: result.text });
      } catch (e) {
        const contentEl = addBotMsg(0);
        contentEl.innerHTML = '<p style="color:#ef4444">⚠️ 离线引擎错误：' + escapeHtml(e.message) + '</p>';
      }
    }

    // 保存状态
    try { localStorage.setItem(CONFIG.STORAGE_KEYS.MESSAGES, JSON.stringify(state.messages)); } catch (e) {}
    state.sending = false;
    sendBtn.disabled = false;
    chat.scrollTop = chat.scrollHeight;
  }

  // ---------- 设置面板 ----------
  let settingsModal, casesModal, kbModal;

  function openSettings() {
    settingsModal.classList.remove('hidden');
    settingsModal.querySelector('[data-close="settings-modal"]')?.focus();
  }

  function closeSettings() {
    settingsModal.classList.add('hidden');
    // 保存
    state.mode = modeSelect.value;
    state.apiKey = keyInput.value.trim();
    state.endpoint = endpointInput.value.trim() || CONFIG.DEFAULT_ENDPOINT;
    localStorage.setItem(CONFIG.STORAGE_KEYS.MODE, state.mode);
    localStorage.setItem(CONFIG.STORAGE_KEYS.API_KEY, state.apiKey);
    localStorage.setItem(CONFIG.STORAGE_KEYS.ENDPOINT, state.endpoint);
    updateConnState(state.mode === 'online' && state.apiKey ? 'online' : 'offline');
    toast(state.mode === 'online' && state.apiKey ? '在线模式已保存' : '已切换为离线模式');
  }

  // ---------- 案例面板 ----------
  async function openCases() {
    casesModal.classList.remove('hidden');
    await renderCaseList();
  }

  async function renderCaseList() {
    if (!globalThis.CaseDB) return;
    const list = await CaseDB.getAll().catch(() => []);
    document.getElementById('cases-count').textContent = list.length + ' 条';

    const ul = document.getElementById('cases-list');
    const detail = document.getElementById('case-detail');
    detail.classList.add('hidden');
    ul.innerHTML = '';

    if (!list.length) {
      ul.innerHTML = '<li class="muted">暂无案例。在线诊断对话可保存为案例。</li>';
      return;
    }

    list.forEach((c) => {
      const li = document.createElement('li');
      li.className = 'case-item';
      li.innerHTML = `
        <div class="case-head">
          <span class="case-tag ${c.status}">${c.status}</span>
          <span class="case-date">${new Date(c.created).toLocaleDateString()}</span>
        </div>
        <div class="case-preview">${escapeHtml((c.question || c.content || '').slice(0, 60))}</div>
        <div class="case-actions">
          ${c.status === 'pending' ? `<button class="ghost sm case-approve">✓ 采纳</button><button class="ghost sm case-reject">✕ 驳回</button>` : ''}
          <button class="ghost sm case-view">查看</button>
          <button class="ghost sm case-del">删除</button>
        </div>
      `;
      li.querySelector('.case-view')?.addEventListener('click', () => showCaseDetail(c));
      li.querySelector('.case-approve')?.addEventListener('click', async () => {
        await CaseDB.approve(c.id);
        await renderCaseList();
        toast('已采纳');
      });
      li.querySelector('.case-reject')?.addEventListener('click', async () => {
        await CaseDB.reject(c.id);
        await renderCaseList();
        toast('已驳回');
      });
      li.querySelector('.case-del')?.addEventListener('click', async () => {
        await CaseDB.remove(c.id);
        await renderCaseList();
        toast('已删除');
      });
      ul.appendChild(li);
    });
  }

  function showCaseDetail(c) {
    const detail = document.getElementById('case-detail');
    detail.classList.remove('hidden');
    detail.innerHTML = `
      <div class="detail-head"><span class="case-tag ${c.status}">${c.status}</span> ${new Date(c.created).toLocaleString()}</div>
      <pre>${escapeHtml(JSON.stringify(c, null, 2))}</pre>
    `;
  }

  // ---------- 知识库面板 ----------
  async function openKB() {
    kbModal.classList.remove('hidden');
    await renderFileList();
  }

  async function renderFileList() {
    if (!globalThis.Uploads) return;
    const files = await Uploads.getFiles();
    const list = document.getElementById('kb-file-list');
    const count = document.getElementById('kb-file-count');
    count.textContent = files.length + ' 个文件';
    list.innerHTML = '';
    if (!files.length) {
      list.innerHTML = '<li class="muted">暂无上传文件。拖拽或选择文件导入知识库。</li>';
      return;
    }
    files.forEach((f) => {
      const li = document.createElement('li');
      li.className = 'file-item';
      li.innerHTML = `
        <span class="file-icon">${f.type === 'manual' ? '📝' : '📄'}</span>
        <span class="file-name">${escapeHtml(f.fileName)}</span>
        <span class="file-meta">${f.chunkCount ? f.chunkCount + ' 段' : ''}</span>
        <button class="ghost sm file-del" data-id="${f.id}">删除</button>
      `;
      li.querySelector('.file-del')?.addEventListener('click', async () => {
        await Uploads.removeFile(f.id);
        await renderFileList();
        toast('已删除');
      });
      list.appendChild(li);
    });
  }

  // ---------- 文件上传 ----------
  async function handleFiles(fileList) {
    const dropZone = document.getElementById('kb-dropzone');
    const status = document.getElementById('kb-upload-status');
    if (!fileList?.length) return;

    status.innerHTML = '处理中...';
    status.classList.remove('hidden');

    for (const file of fileList) {
      const msg = document.createElement('div');
      msg.className = 'upload-progress';
      msg.textContent = `📄 ${file.name}...`;
      status.appendChild(msg);

      try {
        const result = await Uploads.processFile(file);
        if (result.type === 'document') {
          msg.textContent = `✅ ${file.name} — 已索引 ${result.chunkCount} 段`;
        } else if (result.type === 'media') {
          msg.textContent = `🎵 ${file.name} — 需补充文本（点击编辑）`;
        }
      } catch (e) {
        msg.textContent = `❌ ${file.name} — ${e.message}`;
      }
    }

    const done = document.createElement('div');
    done.textContent = '✅ 处理完成，新内容已注入知识库';
    done.style.color = '#4ade80';
    status.appendChild(done);

    await Uploads.refreshKB();
    await renderFileList();
  }

  // ---------- 绑定事件 ----------
  function bind() {
    // 发送
    sendBtn?.addEventListener('click', send);
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });

    // 设置
    document.getElementById('btn-settings')?.addEventListener('click', openSettings);
    document.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-close');
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
        if (id === 'settings-modal') closeSettings();
      });
    });
    // settings 关闭按钮
    settingsModal?.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => { settingsModal.classList.add('hidden'); closeSettings(); });
    });

    // 案例
    document.getElementById('btn-cases')?.addEventListener('click', openCases);
    document.getElementById('cases-export')?.addEventListener('click', async () => {
      const json = await CaseDB.exportJSON();
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'cases-export.json';
      a.click();
      URL.revokeObjectURL(a.href);
      toast('已导出');
    });
    document.getElementById('cases-refresh')?.addEventListener('click', renderCaseList);

    // 知识库
    document.getElementById('btn-kb')?.addEventListener('click', openKB);

    // 文件上传
    const dropZone = document.getElementById('kb-dropzone');
    const fileInput = document.getElementById('kb-file-input');
    dropZone?.addEventListener('click', () => fileInput?.click());
    dropZone?.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
    });
    fileInput?.addEventListener('change', (e) => {
      if (e.target.files.length) handleFiles(e.target.files);
      e.target.value = '';
    });

    // 新对话
    document.getElementById('btn-new')?.addEventListener('click', () => {
      state.messages = [];
      chat.innerHTML = '';
      welcome();
      try { localStorage.removeItem(CONFIG.STORAGE_KEYS.MESSAGES); } catch (e) {}
      toast('已开始新对话');
    });

    // 外部关闭弹窗
    document.querySelectorAll('.modal').forEach((m) => {
      m.addEventListener('click', (e) => {
        if (e.target === m) m.classList.add('hidden');
      });
    });
  }

  // ---------- 初始化 ----------
  async function init() {
    // DOM
    chat = $('chat');
    input = $('chat-input');
    sendBtn = $('btn-send');
    connDot = $('conn-dot');
    modeSelect = $('mode-select');
    keyInput = $('api-key-input');
    endpointInput = $('endpoint-input');
    settingsModal = $('settings-modal');
    casesModal = $('cases-modal');
    kbModal = $('kb-modal');

    // 读取存储
    state.mode = localStorage.getItem(CONFIG.STORAGE_KEYS.MODE) || 'online';
    state.apiKey = localStorage.getItem(CONFIG.STORAGE_KEYS.API_KEY) || '';
    state.endpoint = localStorage.getItem(CONFIG.STORAGE_KEYS.ENDPOINT) || CONFIG.DEFAULT_ENDPOINT;

    // 设置 UI
    if (modeSelect) modeSelect.value = state.mode;
    if (keyInput) keyInput.value = state.apiKey;
    if (endpointInput) endpointInput.value = state.endpoint;

    // 初始化知识库 RAG
    if (globalThis.KnowledgeRAG) {
      await KnowledgeRAG.init().catch(() => {});
    }

    // 初始化案例库
    if (globalThis.CaseDB) {
      await CaseDB.init().catch(() => {});
    }

    // 初始化上传模块
    if (globalThis.Uploads) {
      await Uploads.init().catch(() => {});
    }

    // 连接状态
    updateConnState(state.mode === 'online' && state.apiKey ? 'online' : 'offline');

    // 欢迎
    welcome();

    // 恢复历史消息
    try {
      const saved = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.MESSAGES));
      if (saved?.length) {
        state.messages = saved;
        state.messages.forEach((m) => {
          if (m.role === 'user') addUserMsg(m.content);
          else {
            const el = addBotMsg(0);
            el.innerHTML = renderMarkdown(m.content);
          }
        });
        setTimeout(() => chat.scrollTop = chat.scrollHeight, 50);
      }
    } catch (e) {}

    // 绑定事件
    bind();

    // 加载 PDF/DOCX 解析库 (CDN 懒加载)
    if (typeof pdfjsLib === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = () => { pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; };
      document.head.appendChild(script);
    }
  }

  // 页面加载完成后启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
