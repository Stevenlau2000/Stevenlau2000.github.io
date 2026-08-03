/**
 * @fileoverview 个人工作台 · 应用外壳（app.js）
 *
 * 职责：
 *   1. 视图注册与路由（左侧导航 / 顶栏 / 视图挂载）
 *   2. 命令面板（⌘K / Ctrl+K，模糊搜索任务、项目、产出物、空间、快捷入口、动作）
 *   3. 全局键盘快捷键（1~6 / N / / / Esc / ?）
 *   4. 启动引导（加载数据 → 刷新连续活跃 → 订阅变更 → 首屏渲染）
 *
 * 依赖（必须先于本文件加载）：
 *   ui.js → store.js → connectors.js → view-*.js
 *
 * 全局命名空间：WB.App
 */
;(function (global) {
  'use strict';

  var WB = global.WB = global.WB || {};
  var UI = WB.UI;
  var U = WB.Util;
  var el = UI.el;

  /* ======================================================================
     01 / 常量与内部状态
     ====================================================================== */

  /** @const {!Array<string>} 视图顺序（同时对应快捷键 1~6） */
  var VIEW_ORDER = ['dashboard', 'tasks', 'projects', 'outputs', 'review', 'settings'];

  /** @const {boolean} 是否 macOS（用于快捷键文案） */
  var IS_MAC = /Mac|iPhone|iPad|iPod/i.test(
    (global.navigator && (global.navigator.platform || global.navigator.userAgent)) || ''
  );

  /** @const {string} 修饰键显示文案 */
  var MOD_LABEL = IS_MAC ? '⌘' : 'Ctrl+';

  /** @type {string} 当前视图 id */
  var currentView = 'dashboard';

  /** @type {boolean} 是否有一次「数据变更引发的重绘」正在排队 */
  var renderQueued = false;

  /** @type {number} rAF 句柄 */
  var rafHandle = 0;

  /** @type {?function()} 命令面板关闭函数（同一时刻只允许一个面板） */
  var paletteClose = null;

  /** @type {!Object<string,!HTMLElement>} 导航按钮引用 */
  var navRefs = {};

  /* ======================================================================
     02 / 视图注册表
     ====================================================================== */

  /**
   * 取视图定义。
   * @param {string} id
   * @return {?Object}
   */
  function getView(id) {
    var views = WB.Views || {};
    return views[id] || null;
  }

  /**
   * 全部已注册视图（按既定顺序）。
   * @return {!Array<!Object>}
   */
  function allViews() {
    return VIEW_ORDER.map(getView).filter(function (v) { return !!v; });
  }

  /* ======================================================================
     03 / 左侧导航 / 侧栏底部 / 顶栏
     ====================================================================== */

  /** 构建左侧导航（只构建一次）。 */
  function buildNav() {
    var nav = document.getElementById('nav');
    if (!nav) return;
    UI.clear(nav);
    navRefs = {};

    allViews().forEach(function (v) {
      var btn = el('button', {
        class: 'nav-item',
        type: 'button',
        'aria-label': v.title,
        on: { click: function () { go(v.id); } }
      }, [
        UI.icon(v.icon || 'dot', 16),
        el('span', { class: 'nav-label', text: v.title }),
        el('span', { class: 'nav-key mono', text: v.navKey || '' })
      ]);
      navRefs[v.id] = btn;
      nav.appendChild(btn);
    });
  }

  /** 同步导航高亮状态。 */
  function syncNav() {
    Object.keys(navRefs).forEach(function (id) {
      var on = id === currentView;
      navRefs[id].classList.toggle('active', on);
      if (on) navRefs[id].setAttribute('aria-current', 'page');
      else navRefs[id].removeAttribute('aria-current');
    });
  }

  /** 渲染侧栏底部：连续活跃 + 备份入口 + 版本号。 */
  function renderSidebarFoot() {
    var foot = document.getElementById('sidebar-foot');
    if (!foot) return;
    UI.clear(foot);

    var st = WB.Store.settings.get().streak;

    UI.append(foot, el('div', { class: 'streak-box', title: '历史最佳 ' + st.best + ' 天' }, [
      UI.icon('flame', 18),
      el('span', { class: 'streak-num mono', text: String(st.current) }),
      el('div', {}, [
        el('div', { class: 'streak-cap', text: '连续活跃' }),
        el('div', { class: 'streak-cap', text: 'BEST ' + st.best })
      ])
    ]));

    UI.append(foot, el('button', {
      class: 'btn btn-sm',
      type: 'button',
      title: '导出全部数据为 JSON 备份文件',
      on: {
        click: function () {
          WB.Store.downloadBackup();
          UI.toast('备份文件已开始下载', 'ok');
        }
      }
    }, [UI.icon('download', 13), el('span', { text: '备份数据' })]));

    UI.append(foot, el('div', {
      class: 'streak-cap',
      text: 'LOCAL ONLY · v' + WB.Store.SCHEMA_VERSION + '.0'
    }));
  }

  /**
   * 渲染顶栏。
   * @param {!Object} view 当前视图定义
   */
  function renderTopbar(view) {
    var bar = document.getElementById('topbar');
    if (!bar) return;
    UI.clear(bar);

    UI.append(bar, el('div', {}, [
      el('div', { class: 'topbar-sub', text: view.subtitle || '' }),
      el('div', { class: 'topbar-title display', text: view.title || '' })
    ]));

    UI.append(bar, el('div', { class: 'spacer' }));

    var search = el('button', {
      class: 'search-trigger',
      type: 'button',
      title: '打开命令面板',
      on: { click: function () { openPalette(''); } }
    }, [
      UI.icon('search', 14),
      el('span', { text: '搜索任务 / 项目 / 产出物…' }),
      el('span', { class: 'kbd', text: MOD_LABEL + 'K' })
    ]);

    var help = el('button', {
      class: 'btn btn-icon',
      type: 'button',
      title: '快捷键帮助 (?)',
      'aria-label': '快捷键帮助',
      on: { click: function () { openHelp(); } }
    }, el('span', { class: 'mono', text: '?' }));

    var newTaskBtn = el('button', {
      class: 'btn btn-accent',
      type: 'button',
      title: '新建任务 (N)',
      on: { click: function () { newTask(); } }
    }, [UI.icon('plus', 14), el('span', { text: '新建任务' })]);

    UI.append(bar, el('div', { class: 'topbar-right' }, [search, help, newTaskBtn]));
  }

  /* ======================================================================
     04 / 路由与渲染
     ====================================================================== */

  /**
   * 切换视图。
   * @param {string} id 视图 id
   */
  function go(id) {
    if (!getView(id)) {
      UI.toast('视图不存在：' + id, 'err');
      return;
    }
    var changed = id !== currentView;
    currentView = id;
    render(true);
    if (changed) {
      var mount = document.getElementById('view');
      if (mount) mount.scrollTop = 0;
    }
  }

  /**
   * 渲染当前视图。
   * @param {boolean=} fresh 是否为「新鲜进入」（触发错峰动效）
   */
  function render(fresh) {
    // 手动渲染即视为已消费掉排队中的重绘
    renderQueued = false;
    if (rafHandle) {
      global.cancelAnimationFrame(rafHandle);
      rafHandle = 0;
    }

    var view = getView(currentView) || getView('dashboard');
    if (!view) return;

    var mount = document.getElementById('view');
    if (!mount) return;

    syncNav();
    renderTopbar(view);
    renderSidebarFoot();
    document.title = view.title + ' · 个人工作台';

    UI.clear(mount);
    try {
      view.render(mount, { fresh: !!fresh });
    } catch (err) {
      // 任何视图异常都不允许把整个应用打死：降级为可读的错误卡片
      UI.append(mount, buildErrorCard(view, err));
      if (global.console && global.console.error) global.console.error('[WB] 视图渲染失败：' + view.id, err);
    }
  }

  /**
   * 视图渲染异常时的兜底卡片。
   * @param {!Object} view
   * @param {!Error} err
   * @return {!HTMLElement}
   */
  function buildErrorCard(view, err) {
    var card = UI.card({ tag: 'ERROR', title: '「' + view.title + '」渲染失败', span: 12 });
    UI.append(card.bodyEl, el('div', { class: 'stack' }, [
      el('div', { text: '这个视图在渲染时抛出了异常，其它视图与你的数据不受影响。' }),
      el('div', { class: 'md-preview mono', text: String((err && err.message) || err) }),
      el('div', { class: 'row' }, [
        el('button', {
          class: 'btn btn-primary', type: 'button',
          on: { click: function () { render(true); } }
        }, [el('span', { text: '重试渲染' })]),
        el('button', {
          class: 'btn', type: 'button',
          on: { click: function () { go('dashboard'); } }
        }, [el('span', { text: '回到仪表盘' })])
      ])
    ]));
    return card;
  }

  /** 数据变更后的合并重绘（避免同一操作触发多次渲染）。 */
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    rafHandle = global.requestAnimationFrame(function () {
      rafHandle = 0;
      if (!renderQueued) return;
      render(false);
    });
  }

  /* ======================================================================
     05 / 快捷动作
     ====================================================================== */

  /** 新建任务（带当前视图上下文的合理预设）。 */
  function newTask() {
    if (!WB.Views.tasks) return;
    WB.Views.tasks.openTaskForm(null, {});
  }

  /** 打开快捷键帮助弹层。 */
  function openHelp() {
    var shortcuts = (WB.Views.settings && WB.Views.settings.getShortcuts)
      ? WB.Views.settings.getShortcuts()
      : [];

    UI.modal({
      title: '键盘快捷键',
      tag: 'HELP / SHORTCUTS',
      size: 'sm',
      build: function (body) {
        var table = el('table', { class: 'table' });
        var tbody = el('tbody');
        shortcuts.forEach(function (s) {
          UI.append(tbody, el('tr', {}, [
            el('td', { style: { width: '140px' } }, el('span', { class: 'kbd', text: s.key })),
            el('td', { text: s.desc })
          ]));
        });
        UI.append(table, tbody);
        UI.append(body, table);
        UI.append(body, el('div', {
          class: 'field-hint',
          style: { marginTop: '10px' },
          text: '提示：在输入框内打字时，数字与字母快捷键会自动让位，只有 ' + MOD_LABEL + 'K 与 Esc 仍然生效。'
        }));
      },
      footer: function (api) {
        return el('button', {
          class: 'btn btn-primary', type: 'button', text: '知道了',
          on: { click: function () { api.close(); } }
        });
      }
    });
  }

  /* ======================================================================
     06 / 命令面板
     ====================================================================== */

  /**
   * 收集命令面板的候选项。
   * @return {!Array<{kind:string, title:string, sub:string, keywords:string,
   *                  weight:number, run:function()}>}
   */
  function collectItems() {
    var items = [];

    // 6.1 视图跳转
    allViews().forEach(function (v) {
      items.push({
        kind: '视图',
        title: '前往 · ' + v.title,
        sub: v.subtitle || '',
        keywords: v.id + ' ' + v.title + ' ' + (v.subtitle || ''),
        weight: 0,
        run: function () { go(v.id); }
      });
    });

    // 6.2 动作
    var actions = [
      {
        title: '新建任务', sub: '快捷键 N', keywords: 'new task 新建 任务 todo',
        run: function () { newTask(); }
      },
      {
        title: '新建项目', sub: '在项目视图中创建', keywords: 'new project 新建 项目',
        run: function () { go('projects'); WB.Views.projects.openProjectForm(); }
      },
      {
        title: '新建空间', sub: '最上层的业务分类', keywords: 'new space 新建 空间',
        run: function () { go('projects'); WB.Views.projects.openSpaceForm(); }
      },
      {
        title: '登记产出物', sub: '方案 / 文章 / 报告 / Skill…', keywords: 'new output 产出 登记 归档',
        run: function () { go('outputs'); WB.Views.outputs.openOutputForm(); }
      },
      {
        title: '生成本周周报', sub: '复盘视图 · Markdown 输出', keywords: 'weekly report 周报 复盘 markdown',
        run: function () { go('review'); }
      },
      {
        title: '导出数据备份', sub: '下载 JSON 快照到本地', keywords: 'export backup 导出 备份 json',
        run: function () { WB.Store.downloadBackup(); UI.toast('备份文件已开始下载', 'ok'); }
      },
      {
        title: '打开设置', sub: '数据 / 连接器 / 偏好', keywords: 'settings 设置 连接器 飞书 乐享',
        run: function () { go('settings'); }
      },
      {
        title: '查看快捷键', sub: '按 ? 也可以打开', keywords: 'help shortcut 帮助 快捷键',
        run: function () { openHelp(); }
      }
    ];
    actions.forEach(function (a) {
      items.push({
        kind: '动作', title: a.title, sub: a.sub, keywords: a.keywords, weight: 1, run: a.run
      });
    });

    // 6.3 任务（未完成排前面）
    var tasks = WB.Store.tasks.all().slice().sort(function (a, b) {
      var ad = a.status === 'done' ? 1 : 0;
      var bd = b.status === 'done' ? 1 : 0;
      if (ad !== bd) return ad - bd;
      return (a.due || '9999') < (b.due || '9999') ? -1 : 1;
    });
    tasks.forEach(function (t) {
      var sp = t.spaceId ? WB.Store.spaces.get(t.spaceId) : null;
      var pj = t.projectId ? WB.Store.projects.get(t.projectId) : null;
      var parts = [];
      if (sp) parts.push(sp.code);
      if (pj) parts.push(pj.name);
      parts.push(WB.Store.labelOf('taskStatus', t.status));
      parts.push(t.priority);
      if (t.due) parts.push(U.fmtDue(t.due));
      items.push({
        kind: '任务',
        title: t.title,
        sub: parts.join(' · '),
        keywords: t.title + ' ' + (t.note || '') + ' ' + (t.tags || []).join(' ') +
                  ' ' + (sp ? sp.code + sp.name : '') + ' ' + (pj ? pj.name : ''),
        weight: t.status === 'done' ? 4 : 2,
        run: function () { go('tasks'); WB.Views.tasks.openTaskForm(t); }
      });
    });

    // 6.4 项目
    WB.Store.projects.all().forEach(function (p) {
      var sp = p.spaceId ? WB.Store.spaces.get(p.spaceId) : null;
      items.push({
        kind: '项目',
        title: p.name,
        sub: (sp ? sp.code + ' · ' : '') + WB.Store.labelOf('projectStatus', p.status) +
             ' · ' + p.progress + '%' + (p.dueDate ? ' · 截止 ' + p.dueDate : ''),
        keywords: p.name + ' ' + (p.tags || []).join(' ') + ' ' + (p.notes || '') +
                  ' ' + (sp ? sp.code + sp.name : ''),
        weight: 2,
        run: function () { go('projects'); WB.Views.projects.openProjectDrawer(p.id); }
      });
    });

    // 6.5 产出物
    WB.Store.outputs.all().forEach(function (o) {
      var sp = o.spaceId ? WB.Store.spaces.get(o.spaceId) : null;
      items.push({
        kind: '产出',
        title: o.title,
        sub: WB.Store.labelOf('outputType', o.type) + ' · ' + o.date + (sp ? ' · ' + sp.code : ''),
        keywords: o.title + ' ' + (o.note || '') + ' ' + (o.tags || []).join(' ') +
                  ' ' + WB.Store.labelOf('outputType', o.type),
        weight: 3,
        run: function () { go('outputs'); WB.Views.outputs.openOutputForm(o); }
      });
    });

    // 6.6 空间
    WB.Store.spaces.all().forEach(function (s) {
      items.push({
        kind: '空间',
        title: s.code + ' · ' + s.name,
        sub: s.description || '筛选该空间下的任务',
        keywords: s.code + ' ' + s.name + ' ' + (s.description || ''),
        weight: 3,
        run: function () { WB.Views.tasks.setSpaceFilter(s.id); go('tasks'); }
      });
    });

    // 6.7 快捷入口
    WB.Store.links.all().forEach(function (l) {
      items.push({
        kind: '入口',
        title: l.label,
        sub: l.group + ' · ' + l.url,
        keywords: l.label + ' ' + l.group + ' ' + l.url,
        weight: 3,
        run: function () { global.open(l.url, '_blank', 'noopener'); }
      });
    });

    return items;
  }

  /**
   * 按查询词过滤 + 排序。
   * @param {!Array<!Object>} items
   * @param {string} query
   * @return {!Array<!Object>}
   */
  function filterItems(items, query) {
    var q = String(query || '').trim();
    if (!q) {
      return items.filter(function (it) { return it.weight <= 2; }).slice(0, 24);
    }
    var scored = [];
    items.forEach(function (it) {
      var best = -1;
      [it.title, it.keywords, it.sub].forEach(function (field) {
        var s = U.fuzzyScore(field, q);
        if (s >= 0 && (best < 0 || s < best)) best = s;
      });
      if (best >= 0) scored.push({ item: it, score: best + it.weight * 3 });
    });
    scored.sort(function (a, b) {
      if (a.score !== b.score) return a.score - b.score;
      return a.item.title.length - b.item.title.length;
    });
    return scored.slice(0, 40).map(function (s) { return s.item; });
  }

  /**
   * 打开命令面板。
   * @param {string=} prefill 预填查询词
   */
  function openPalette(prefill) {
    if (paletteClose) { paletteClose(); paletteClose = null; }

    var items = collectItems();
    var results = [];
    var active = 0;

    var input = el('input', {
      class: 'palette-input',
      type: 'text',
      placeholder: '搜索任务、项目、产出物、空间，或输入动作…',
      'aria-label': '命令面板搜索框',
      value: prefill || ''
    });

    var list = el('div', { class: 'palette-list', role: 'listbox' });

    var panel = el('div', { class: 'palette', role: 'dialog', 'aria-label': '命令面板' }, [
      el('div', { class: 'palette-input-wrap' }, [
        UI.icon('search', 16),
        input,
        el('span', { class: 'kbd', text: 'Esc' })
      ]),
      list,
      el('div', { class: 'palette-foot' }, [
        el('span', { class: 'kbd', text: '↑ ↓ 选择' }),
        el('span', { class: 'kbd', text: 'Enter 执行' }),
        el('span', { class: 'kbd', text: MOD_LABEL + 'K 呼出' })
      ])
    ]);

    var overlay = el('div', {
      class: 'overlay',
      on: {
        mousedown: function (ev) { if (ev.target === overlay) close(); }
      }
    }, panel);

    var close = UI.mountLayer(overlay, function () { paletteClose = null; });
    paletteClose = close;

    /** 高亮同步（含滚动跟随）。 */
    function syncActive() {
      var nodes = list.querySelectorAll('.palette-item');
      for (var i = 0; i < nodes.length; i++) {
        var on = i === active;
        nodes[i].classList.toggle('active', on);
        nodes[i].setAttribute('aria-selected', on ? 'true' : 'false');
        if (on && nodes[i].scrollIntoView) nodes[i].scrollIntoView({ block: 'nearest' });
      }
    }

    /** 重新渲染候选列表。 */
    function refresh() {
      results = filterItems(items, input.value);
      active = 0;
      UI.clear(list);

      if (!results.length) {
        UI.append(list, el('div', { class: 'empty', style: { padding: '26px 20px' } }, [
          el('div', { class: 'empty-mark', text: '— — — —' }),
          el('div', { class: 'empty-title', text: '没有匹配项' }),
          el('div', { class: 'empty-text', text: '换个关键词试试，或者按 Esc 关闭。' })
        ]));
        return;
      }

      results.forEach(function (it, idx) {
        var node = el('div', {
          class: 'palette-item' + (idx === 0 ? ' active' : ''),
          role: 'option',
          'aria-selected': idx === 0 ? 'true' : 'false',
          on: {
            mouseenter: function () { active = idx; syncActive(); },
            click: function () { execute(idx); }
          }
        }, [
          el('span', { class: 'palette-kind', text: it.kind }),
          el('div', { class: 'palette-text' }, [
            el('div', { class: 'palette-title', text: it.title }),
            it.sub ? el('div', { class: 'palette-sub', text: it.sub }) : null
          ]),
          UI.icon('chevron', 12)
        ]);
        UI.append(list, node);
      });
    }

    /**
     * 执行候选项。
     * @param {number} idx
     */
    function execute(idx) {
      var it = results[idx];
      if (!it) return;
      close();
      // 关闭后再执行，避免新弹层被同一次 Esc 连带关闭
      setTimeout(function () { it.run(); }, 0);
    }

    input.addEventListener('input', refresh);
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        if (results.length) { active = (active + 1) % results.length; syncActive(); }
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        if (results.length) { active = (active - 1 + results.length) % results.length; syncActive(); }
      } else if (ev.key === 'Enter') {
        ev.preventDefault();
        execute(active);
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        close();
      }
    });

    refresh();
    setTimeout(function () { input.focus(); input.select(); }, 20);
  }

  /* ======================================================================
     07 / 全局键盘快捷键
     ====================================================================== */

  /**
   * 判断事件是否发生在可输入控件里。
   * @param {EventTarget} target
   * @return {boolean}
   */
  function isTypingTarget(target) {
    if (!target || !target.tagName) return false;
    var tag = target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    return !!target.isContentEditable;
  }

  /**
   * 全局键盘处理。
   * @param {!KeyboardEvent} ev
   */
  function onKeydown(ev) {
    var key = ev.key;

    // ⌘K / Ctrl+K —— 任何情况下都可呼出命令面板
    if ((ev.metaKey || ev.ctrlKey) && (key === 'k' || key === 'K')) {
      ev.preventDefault();
      openPalette('');
      return;
    }

    // Esc —— 逐层关闭浮层
    if (key === 'Escape') {
      if (UI.hasLayer()) {
        ev.preventDefault();
        UI.closeTop();
      } else if (isTypingTarget(ev.target) && ev.target.blur) {
        ev.target.blur();
      }
      return;
    }

    // 其余快捷键在输入态与浮层态下让位
    if (isTypingTarget(ev.target) || UI.hasLayer()) return;
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;

    // 1~6 切换视图
    if (key >= '1' && key <= '6') {
      var idx = parseInt(key, 10) - 1;
      if (VIEW_ORDER[idx]) {
        ev.preventDefault();
        go(VIEW_ORDER[idx]);
      }
      return;
    }

    // N 新建任务
    if (key === 'n' || key === 'N') {
      ev.preventDefault();
      newTask();
      return;
    }

    // / 聚焦搜索（命令面板）
    if (key === '/') {
      ev.preventDefault();
      openPalette('');
      return;
    }

    // ? 快捷键帮助
    if (key === '?') {
      ev.preventDefault();
      openHelp();
    }
  }

  /* ======================================================================
     08 / 启动
     ====================================================================== */

  /**
   * 每日刷新：识别"新的一天"并触发日滚。
   *
   * 决策表（以 settings.lastActiveDate 为基准，对比 todayISO）：
   *   - lastActiveDate === today       → 同日多次打开，no-op（幂等，防多标签页重复滚）
   *   - lastActiveDate === 昨天         → streak.current += 1（连续），streak.best = max(best, current)
   *   - lastActiveDate 早于昨天（断签）  → streak.current = 1（重置）
   *
   * 跨天时还会：
   *   1. 调 rollSeedTasks(today)：种子未完成任务 due 按原始 _seedOffset 重算
   *   2. 调 touchActivity(true)：更新 streak（内部判断昨天/断签，并同步 lastActiveDate）
   *   3. logs.add('daily-roll')：追加一条「新的一天启动 · streak=N」日志
   *   4. 写回 settings.lastActiveDate = today，save 持久化
   *
   * 幂等性：同日重复调 lastActiveDate === today 直接返回 false，不滚动、不写日志、不改 streak。
   *
   * @return {boolean} 是否触发了日滚（true=跨天并完成滚动，false=同日 no-op）
   */
  function dailyRefresh() {
    var today = U.todayISO();
    var settings = WB.Store.settings.get();
    var last = settings.lastActiveDate;

    // 同日多次打开：no-op
    if (last === today) return false;

    // 跨天：1. 滚动种子任务（只动 _seed 且未完成的）
    WB.Store.rollSeedTasks(today);

    // 2. 更新连续活跃（touchActivity 内部判断昨天→+1 / 断签→=1，并同步 lastActiveDate）
    WB.Store.touchActivity(true);

    // 3. 追加 daily-roll 日志（silent=true，由最后统一 save）
    var streakNow = settings.streak.current;
    WB.Store.logs.add('daily-roll', null, '新的一天启动 · streak=' + streakNow, true);

    // 4. 写回 lastActiveDate（touchActivity 已同步写过，这里显式再写一次确保）
    settings.lastActiveDate = today;
    WB.Store.save('daily-refresh');

    return true;
  }

  /** 检查依赖是否齐备（缺失时给出可读提示而不是白屏）。 */
  function checkDeps() {
    var missing = [];
    if (!WB.Util || !WB.UI) missing.push('ui.js');
    if (!WB.Store) missing.push('store.js');
    if (!WB.Connectors) missing.push('connectors.js');
    VIEW_ORDER.forEach(function (id) {
      if (!getView(id)) missing.push('view-' + id + '.js');
    });
    return missing;
  }

  /** 应用启动。 */
  function boot() {
    var missing = checkDeps();
    if (missing.length) {
      var mount = document.getElementById('view');
      if (mount) {
        mount.textContent = '缺少脚本文件：' + missing.join('、') + '，请检查 index.html 的 script 顺序。';
      }
      if (global.console && global.console.error) {
        global.console.error('[WB] 缺少依赖脚本：' + missing.join(', '));
      }
      return;
    }

    // 8.1 载入数据（首次运行会自动灌入种子数据）
    WB.Store.load();

    // 8.2 每日刷新：识别"新的一天"，跨天时滚动种子任务 due + 更新连续活跃 + 写日志
    //     同日重复打开为 no-op（幂等），天然防多标签页重复滚
    dailyRefresh();

    // 8.3 初始化连接器（读取设置中的启用状态）
    WB.Connectors.init();

    // 8.4 数据变更 → 合并重绘
    WB.Store.subscribe(function () { scheduleRender(); });

    // 8.5 导航 + 首屏
    buildNav();
    render(true);

    // 8.6 全局键盘
    document.addEventListener('keydown', onKeydown);

    // 8.7 跨标签页同步：另一个标签页改了数据，这里跟着刷新
    global.addEventListener('storage', function (ev) {
      if (ev.key !== WB.Store.STORAGE_KEY) return;
      WB.Store.load();
      render(false);
      UI.toast('检测到另一个标签页的数据变更，已同步', '', 2000);
    });
  }

  /* ======================================================================
     09 / 导出命名空间
     ====================================================================== */

  WB.App = {
    VIEW_ORDER: VIEW_ORDER,
    MOD_LABEL: MOD_LABEL,
    /** @return {string} 当前视图 id */
    current: function () { return currentView; },
    go: go,
    render: render,
    scheduleRender: scheduleRender,
    openPalette: openPalette,
    openHelp: openHelp,
    newTask: newTask,
    dailyRefresh: dailyRefresh,
    boot: boot
  };

  // DOM 就绪后启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window);
