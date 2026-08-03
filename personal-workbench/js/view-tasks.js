/**
 * view-tasks.js —— 任务视图（列表 / 看板 双模式）
 *
 * 能力：
 *   - 快速添加输入框，支持轻量语法：#项目  !P0  @今天  ~45（分钟）
 *   - 多维筛选：空间 / 项目 / 优先级 / 状态 / 标签 / 时间范围 / 关键词
 *   - 列表模式：分组展示、行内完成、编辑、删除、批量完成
 *   - 看板模式：todo / doing / done 三列，原生 HTML5 拖拽改状态
 *
 * 对外接口（供其它视图与命令面板调用）：
 *   openTaskForm(task, presets)   打开新建/编辑弹层
 *   deleteTask(task)              删除（带确认）
 *   parseQuickInput(text)         解析快速输入语法
 *   buildParsePreview(parsed)     生成解析预览 chip
 *   createFromParsed(parsed)      按解析结果建任务
 *   setSpaceFilter(spaceId)       外部跳转时预设空间筛选
 *
 * 依赖：ui.js、store.js
 */
(function (global) {
  'use strict';

  var WB = global.WB = global.WB || {};
  WB.Views = WB.Views || {};

  var UI = WB.UI, U = WB.Util, P = WB.Parts;
  var el = UI.el;

  /** 视图本地状态（跨重绘保持）。 */
  var vs = {
    mode: 'list',          // 'list' | 'board'
    spaceId: '',
    projectId: '',
    priority: '',
    status: '',
    tag: '',
    range: 'undone',       // today | week | overdue | undone | all
    q: ''
  };

  var RANGES = [
    { value: 'today', label: '今日' },
    { value: 'week', label: '本周' },
    { value: 'overdue', label: '逾期' },
    { value: 'undone', label: '未完成' },
    { value: 'all', label: '全部' }
  ];

  /* ==================================================================
     01 / 快速输入语法解析
     ================================================================== */

  var WEEK_TOKENS = { '周一': 1, '周二': 2, '周三': 3, '周四': 4, '周五': 5, '周六': 6, '周日': 0, '周天': 0 };

  /**
   * 解析日期 token。
   * @param {string} token 如 '今天' / '周五' / '8-15' / '2026-08-15' / '+3'
   * @return {?string} ISO 日期
   */
  function parseDateToken(token) {
    if (!token) return null;
    var today = U.todayISO();
    var t = token.trim();

    if (t === '今天' || t === '今日' || t.toLowerCase() === 'today') return today;
    if (t === '明天' || t.toLowerCase() === 'tomorrow') return U.addDays(today, 1);
    if (t === '后天') return U.addDays(today, 2);
    if (t === '下周') return U.addDays(U.startOfWeek(today, 1), 7);

    var nextWeek = false;
    var wk = t;
    if (t.indexOf('下') === 0) { nextWeek = true; wk = t.slice(1); }
    if (WEEK_TOKENS.hasOwnProperty(wk)) {
      var target = WEEK_TOKENS[wk];
      var cur = U.parseISO(today).getDay();
      var delta = (target - cur + 7) % 7;
      if (delta === 0) delta = 7;             // 「周五」指下一个周五
      if (nextWeek) delta += 7;
      return U.addDays(today, delta);
    }

    if (/^\+\d+$/.test(t)) return U.addDays(today, Number(t.slice(1)));
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(t)) {
      var p = t.split('-');
      return p[0] + '-' + String(p[1]).padStart(2, '0') + '-' + String(p[2]).padStart(2, '0');
    }
    if (/^\d{1,2}[-/]\d{1,2}$/.test(t)) {
      var mp = t.split(/[-/]/);
      var year = U.parseISO(today).getFullYear();
      return year + '-' + String(mp[0]).padStart(2, '0') + '-' + String(mp[1]).padStart(2, '0');
    }
    return null;
  }

  /**
   * 解析快速输入。
   * @param {string} text
   * @return {{title:string, projectId:?string, spaceId:?string, priority:string,
   *           due:?string, estimateMin:?number, projectName:string, dueToken:string}}
   */
  function parseQuickInput(text) {
    var raw = String(text || '');
    var out = {
      title: '', projectId: null, spaceId: null, priority: 'P1',
      due: null, estimateMin: null, projectName: '', dueToken: ''
    };

    var projM = raw.match(/#([^\s#!@~]+)/);
    var prioM = raw.match(/!\s*([Pp][012])/);
    var dueM = raw.match(/@([^\s#!@~]+)/);
    var estM = raw.match(/~(\d+)\s*(小时|h|分钟|min|m)?/);

    if (prioM) out.priority = prioM[1].toUpperCase();

    if (dueM) {
      out.dueToken = dueM[1];
      out.due = parseDateToken(dueM[1]);
    }

    if (estM) {
      var n = Number(estM[1]);
      var unit = (estM[2] || 'min').toLowerCase();
      out.estimateMin = (unit === '小时' || unit === 'h') ? n * 60 : n;
    }

    if (projM) {
      var key = projM[1].toLowerCase();
      out.projectName = projM[1];
      var project = WB.Store.projects.list({ includeArchived: true }).find(function (p) {
        return p.name.toLowerCase().indexOf(key) >= 0;
      });
      if (project) {
        out.projectId = project.id;
        out.spaceId = project.spaceId;
      } else {
        var space = WB.Store.spaces.list({ includeArchived: true }).find(function (s) {
          return s.code.toLowerCase() === key || s.name.toLowerCase().indexOf(key) >= 0;
        });
        if (space) out.spaceId = space.id;
      }
    }

    out.title = raw
      .replace(/#[^\s#!@~]+/g, '')
      .replace(/!\s*[Pp][012]/g, '')
      .replace(/@[^\s#!@~]+/g, '')
      .replace(/~\d+\s*(小时|h|分钟|min|m)?/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    return out;
  }

  /**
   * 生成解析预览 chip 列表。
   * @param {!Object} parsed
   * @return {!Array<!HTMLElement>}
   */
  function buildParsePreview(parsed) {
    var chips = [];
    if (parsed.title) chips.push(el('span', { class: 'pp title', text: '标题：' + parsed.title }));
    if (parsed.projectId) {
      var p = WB.Store.projects.get(parsed.projectId);
      chips.push(el('span', { class: 'pp proj', text: '项目：' + p.name }));
    } else if (parsed.spaceId) {
      var s = WB.Store.spaces.get(parsed.spaceId);
      chips.push(el('span', { class: 'pp proj', text: '空间：' + s.name }));
    } else if (parsed.projectName) {
      chips.push(el('span', { class: 'pp title', text: '未匹配到项目「' + parsed.projectName + '」' }));
    }
    chips.push(el('span', { class: 'pp prio', text: '优先级：' + parsed.priority }));
    if (parsed.due) chips.push(el('span', { class: 'pp date', text: '截止：' + parsed.due + ' ' + U.weekdayCN(parsed.due) }));
    else if (parsed.dueToken) chips.push(el('span', { class: 'pp title', text: '无法识别日期「' + parsed.dueToken + '」' }));
    if (parsed.estimateMin) chips.push(el('span', { class: 'pp est', text: '预估：' + parsed.estimateMin + ' 分钟' }));
    return chips;
  }

  /**
   * 按解析结果创建任务。
   * @param {!Object} parsed
   * @return {?Object}
   */
  function createFromParsed(parsed) {
    if (!parsed.title) {
      UI.toast('任务标题不能为空', 'err');
      return null;
    }
    var task = WB.Store.tasks.create({
      title: parsed.title,
      projectId: parsed.projectId,
      spaceId: parsed.spaceId,
      priority: parsed.priority,
      due: parsed.due,
      estimateMin: parsed.estimateMin,
      status: 'todo',
      tags: []
    });
    WB.Store.logs.add('task_add', task.id, '新建任务：' + task.title);
    return task;
  }

  /* ==================================================================
     02 / 任务表单
     ================================================================== */

  /** @return {!Array<{value:string,label:string}>} 项目下拉选项 */
  function projectOptions() {
    var opts = [{ value: '', label: '— 不关联项目 —' }];
    WB.Store.projects.list({ includeArchived: true }).forEach(function (p) {
      var sp = WB.Store.spaces.get(p.spaceId);
      opts.push({ value: p.id, label: (sp ? '[' + sp.code + '] ' : '') + p.name });
    });
    return opts;
  }

  /** @return {!Array<{value:string,label:string}>} 空间下拉选项 */
  function spaceOptions() {
    var opts = [{ value: '', label: '— 不指定空间 —' }];
    WB.Store.spaces.list({ includeArchived: true }).forEach(function (s) {
      opts.push({ value: s.id, label: s.code + ' · ' + s.name });
    });
    return opts;
  }

  /**
   * 打开任务新建 / 编辑弹层。
   * @param {?Object=} task 为空表示新建
   * @param {!Object=} presets 新建时的预填字段
   */
  function openTaskForm(task, presets) {
    var isEdit = !!task;
    var values = Object.assign({
      title: '', note: '', spaceId: '', projectId: '', status: 'todo',
      priority: 'P1', due: '', estimateMin: '', tags: []
    }, task || {}, presets || {});
    if (values.due === null) values.due = '';
    if (values.estimateMin === null) values.estimateMin = '';
    if (values.projectId === null) values.projectId = '';
    if (values.spaceId === null) values.spaceId = '';

    UI.formModal({
      title: isEdit ? '编辑任务' : '新建任务',
      tag: isEdit ? '02 / EDIT TASK' : '02 / NEW TASK',
      submitText: isEdit ? '保存修改' : '创建任务',
      values: values,
      fields: [
        { key: 'title', label: '任务标题', type: 'text', span: 12, required: true, placeholder: '一句话说清要做什么' },
        { key: 'note', label: '备注', type: 'textarea', span: 12, placeholder: '补充上下文、判断依据、下一步…' },
        { key: 'projectId', label: '所属项目', type: 'select', span: 6, options: projectOptions() },
        { key: 'spaceId', label: '所属空间', type: 'select', span: 6, options: spaceOptions(), hint: '选了项目会自动跟随项目的空间' },
        { key: 'status', label: '状态', type: 'select', span: 4, options: WB.Store.ENUMS.taskStatus },
        { key: 'priority', label: '优先级', type: 'select', span: 4, options: WB.Store.ENUMS.priority },
        { key: 'due', label: '截止日期', type: 'date', span: 4 },
        { key: 'estimateMin', label: '预估耗时（分钟）', type: 'number', span: 4, min: 0, placeholder: '如 90' },
        { key: 'tags', label: '标签', type: 'tags', span: 8, placeholder: '用逗号分隔，如：标书, 渠道' }
      ],
      onSubmit: function (v) {
        var patch = {
          title: v.title,
          note: v.note,
          projectId: v.projectId || null,
          spaceId: v.spaceId || null,
          status: v.status,
          priority: v.priority,
          due: v.due || null,
          estimateMin: v.estimateMin == null || v.estimateMin === '' ? null : Number(v.estimateMin),
          tags: v.tags
        };
        if (patch.projectId) {
          var proj = WB.Store.projects.get(patch.projectId);
          if (proj) patch.spaceId = proj.spaceId;
        }
        if (patch.status === 'done') {
          patch.completedAt = (task && task.completedAt) || U.todayISO();
        } else {
          patch.completedAt = null;
        }

        if (isEdit) {
          WB.Store.tasks.update(task.id, patch);
          UI.toast('任务已更新', 'ok');
        } else {
          var created = WB.Store.tasks.create(patch);
          WB.Store.logs.add('task_add', created.id, '新建任务：' + created.title);
          UI.toast('任务已创建', 'ok');
        }
      }
    });
  }

  /**
   * 删除任务（带确认）。
   * @param {!Object} task
   */
  function deleteTask(task) {
    UI.confirm({
      title: '删除任务',
      message: '确定删除「' + task.title + '」吗？此操作不可撤销。',
      danger: true,
      confirmText: '删除'
    }).then(function (ok) {
      if (!ok) return;
      WB.Store.tasks.remove(task.id);
      UI.toast('已删除任务', 'ok');
    });
  }

  /* ==================================================================
     03 / 工具条与筛选器
     ================================================================== */

  /**
   * 顶部快速添加区。
   * @return {!HTMLElement}
   */
  function buildQuickAddBar() {
    var input = el('input', {
      class: 'input', type: 'text',
      placeholder: '快速添加任务：整理访谈纪要 #诊断 !P0 @明天 ~90'
    });
    var preview = el('div', { class: 'parse-preview', style: { padding: '0' } });

    function refresh() {
      UI.clear(preview);
      if (!input.value.trim()) return;
      UI.append(preview, buildParsePreview(parseQuickInput(input.value)));
    }

    function submit() {
      var text = input.value.trim();
      if (!text) return;
      var created = createFromParsed(parseQuickInput(text));
      if (created) {
        input.value = '';
        UI.clear(preview);
        UI.toast('已创建：' + created.title, 'ok');
      }
    }

    input.addEventListener('input', refresh);
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); submit(); }
    });

    var card = UI.card({
      tag: '＋ / QUICK ADD',
      title: '快速添加',
      span: 12,
      actions: [
        el('span', { class: 'kbd', text: '#项目' }),
        el('span', { class: 'kbd', text: '!P0' }),
        el('span', { class: 'kbd', text: '@今天' }),
        el('span', { class: 'kbd', text: '~90' })
      ]
    });
    UI.append(card.bodyEl, [
      el('div', { class: 'row' }, [
        UI.icon('plus', 16),
        input,
        el('button', { class: 'btn btn-primary', type: 'button', text: '添加', on: { click: submit } })
      ]),
      preview
    ]);
    card.inputEl = input;
    return card;
  }

  /**
   * 筛选条。
   * @param {number} total 当前筛选命中数量
   * @return {!HTMLElement}
   */
  function buildFilterBar(total) {
    var card = UI.card({
      tag: '⌗ / FILTER',
      title: '筛选',
      span: 12,
      actions: [el('span', { class: 'card-tag', text: '命中 ' + total + ' 条' })]
    });

    /**
     * 生成 chip 组。
     * @param {!Array<{value:string,label:string}>} options
     * @param {string} key vs 的键
     * @param {boolean} allowEmpty 是否有「不限」项
     * @return {!HTMLElement}
     */
    function chipGroup(options, key, allowEmpty) {
      var wrap = el('div', { class: 'row wrap', style: { gap: '6px' } });
      var list = allowEmpty ? [{ value: '', label: '不限' }].concat(options) : options;
      list.forEach(function (o) {
        UI.append(wrap, el('button', {
          class: 'chip' + (vs[key] === o.value ? ' active' : ''),
          type: 'button', text: o.label,
          on: { click: function () { vs[key] = o.value; WB.App.render(false); } }
        }));
      });
      return wrap;
    }

    var spaceSel = el('select', { class: 'select' });
    UI.append(spaceSel, el('option', { value: '', text: '全部空间' }));
    WB.Store.spaces.list({ includeArchived: true }).forEach(function (s) {
      UI.append(spaceSel, el('option', { value: s.id, text: s.code + ' · ' + s.name, selected: vs.spaceId === s.id }));
    });
    spaceSel.value = vs.spaceId;
    spaceSel.addEventListener('change', function () {
      vs.spaceId = spaceSel.value;
      vs.projectId = '';
      WB.App.render(false);
    });

    var projSel = el('select', { class: 'select' });
    UI.append(projSel, el('option', { value: '', text: '全部项目' }));
    WB.Store.projects.list({ includeArchived: true })
      .filter(function (p) { return !vs.spaceId || p.spaceId === vs.spaceId; })
      .forEach(function (p) {
        UI.append(projSel, el('option', { value: p.id, text: p.name, selected: vs.projectId === p.id }));
      });
    projSel.value = vs.projectId;
    projSel.addEventListener('change', function () { vs.projectId = projSel.value; WB.App.render(false); });

    var allTags = {};
    WB.Store.tasks.all().forEach(function (t) { (t.tags || []).forEach(function (tag) { allTags[tag] = true; }); });
    var tagSel = el('select', { class: 'select' });
    UI.append(tagSel, el('option', { value: '', text: '全部标签' }));
    Object.keys(allTags).sort().forEach(function (tag) {
      UI.append(tagSel, el('option', { value: tag, text: '#' + tag, selected: vs.tag === tag }));
    });
    tagSel.value = vs.tag;
    tagSel.addEventListener('change', function () { vs.tag = tagSel.value; WB.App.render(false); });

    var searchInput = el('input', { class: 'input', type: 'search', placeholder: '关键词…', value: vs.q });
    searchInput.addEventListener('input', U.debounce(function () {
      vs.q = searchInput.value.trim();
      WB.App.render(false);
      var again = document.querySelector('.js-task-search');
      if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
    }, 240));
    searchInput.classList.add('js-task-search');

    UI.append(card.bodyEl, el('div', { class: 'stack' }, [
      el('div', { class: 'row wrap', style: { gap: '10px' } }, [
        el('div', { style: { width: '190px' } }, spaceSel),
        el('div', { style: { width: '220px' } }, projSel),
        el('div', { style: { width: '150px' } }, tagSel),
        el('div', { style: { width: '180px' } }, searchInput),
        el('div', { class: 'spacer' }),
        el('button', {
          class: 'btn btn-sm', type: 'button', text: '重置筛选',
          on: {
            click: function () {
              vs.spaceId = ''; vs.projectId = ''; vs.priority = ''; vs.status = ''; vs.tag = ''; vs.q = ''; vs.range = 'undone';
              WB.App.render(false);
            }
          }
        })
      ]),
      el('div', { class: 'row wrap', style: { gap: '14px' } }, [
        el('div', { class: 'row', style: { gap: '6px' } }, [el('span', { class: 'label', text: '时间' }), chipGroup(RANGES, 'range', false)]),
        el('div', { class: 'row', style: { gap: '6px' } }, [el('span', { class: 'label', text: '优先级' }), chipGroup(WB.Store.ENUMS.priority.map(function (p) { return { value: p.value, label: p.value }; }), 'priority', true)]),
        el('div', { class: 'row', style: { gap: '6px' } }, [el('span', { class: 'label', text: '状态' }), chipGroup(WB.Store.ENUMS.taskStatus, 'status', true)])
      ])
    ]));
    return card;
  }

  /* ==================================================================
     04 / 列表模式
     ================================================================== */

  /**
   * @param {!Array<!Object>} list
   * @return {!HTMLElement}
   */
  function renderList(list) {
    var card = UI.card({
      tag: '≡ / LIST',
      title: '任务列表',
      span: 12,
      flush: true,
      actions: [
        el('button', {
          class: 'btn btn-sm', type: 'button', text: '批量完成',
          title: '把当前筛选结果中所有未完成任务标记为已完成',
          on: { click: function () { batchComplete(list); } }
        }),
        buildModeSwitch()
      ]
    });

    if (!list.length) {
      UI.append(card.bodyEl, UI.empty({
        title: '没有符合条件的任务',
        text: '换个筛选条件，或者直接在上面的快速添加框里丢一条进来。',
        actionText: '新建任务',
        onAction: function () { openTaskForm(); }
      }));
      return card;
    }

    var wrap = el('div', { class: 'task-list' });
    list.forEach(function (t) {
      UI.append(wrap, P.taskRow(t, {
        onEdit: function (task) { openTaskForm(task); },
        onDelete: function (task) { deleteTask(task); }
      }));
    });
    UI.append(card.bodyEl, wrap);
    return card;
  }

  /**
   * 批量完成。
   * @param {!Array<!Object>} list
   */
  function batchComplete(list) {
    var pending = list.filter(function (t) { return t.status !== 'done'; });
    if (!pending.length) {
      UI.toast('当前列表没有未完成任务', 'warn');
      return;
    }
    UI.confirm({
      title: '批量完成',
      message: '将把当前筛选结果中的 ' + pending.length + ' 条任务标记为已完成，确定吗？',
      confirmText: '全部完成'
    }).then(function (ok) {
      if (!ok) return;
      pending.forEach(function (t) { WB.Store.tasks.setStatus(t.id, 'done'); });
      UI.toast('已完成 ' + pending.length + ' 条任务', 'ok');
    });
  }

  /* ==================================================================
     05 / 看板模式（HTML5 拖拽）
     ================================================================== */

  /**
   * @param {!Array<!Object>} list
   * @return {!HTMLElement}
   */
  function renderBoard(list) {
    var wrap = el('div', { class: 'c12', dataset: { stagger: '1' } });
    UI.append(wrap, el('div', { class: 'row between', style: { marginBottom: '10px' } }, [
      el('span', { class: 'card-tag', text: '⊞ / BOARD · 拖拽卡片可改变状态' }),
      buildModeSwitch()
    ]));

    var board = el('div', { class: 'kanban' });
    WB.Store.ENUMS.taskStatus.forEach(function (st) {
      var items = list.filter(function (t) { return t.status === st.value; });
      var col = el('section', { class: 'kcol', dataset: { status: st.value } });
      var body = el('div', { class: 'kcol-body' });

      UI.append(col, el('div', { class: 'kcol-head' }, [
        P.status('taskStatus', st.value),
        el('span', { class: 'kcol-count', text: String(items.length) })
      ]));

      if (!items.length) {
        UI.append(body, el('div', {
          class: 'dim',
          style: { fontSize: '11.5px', textAlign: 'center', padding: '18px 0' },
          text: '拖动任务到这里'
        }));
      }

      items.forEach(function (t) {
        UI.append(body, buildKanbanCard(t));
      });

      col.addEventListener('dragover', function (ev) {
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'move';
        col.classList.add('dragover');
      });
      col.addEventListener('dragleave', function () { col.classList.remove('dragover'); });
      col.addEventListener('drop', function (ev) {
        ev.preventDefault();
        col.classList.remove('dragover');
        var id = ev.dataTransfer.getData('text/plain');
        if (!id) return;
        WB.Store.tasks.setStatus(id, st.value);
        UI.toast('已移动到「' + st.label + '」', 'ok', 1600);
      });

      UI.append(col, body);
      UI.append(board, col);
    });

    UI.append(wrap, board);
    return wrap;
  }

  /**
   * 看板卡片。
   * @param {!Object} t
   * @return {!HTMLElement}
   */
  function buildKanbanCard(t) {
    var card = el('article', { class: 'kcard', draggable: 'true', title: '拖拽以改变状态' }, [
      el('div', { class: 'kcard-title', text: t.title }),
      el('div', { class: 'kcard-meta' }, [
        P.priority(t.priority),
        P.space(t.spaceId),
        P.due(t.due, t.status)
      ]),
      el('div', { class: 'row', style: { gap: '4px', marginTop: '6px', justifyContent: 'flex-end' } }, [
        el('button', {
          class: 'btn btn-icon', type: 'button', title: '编辑',
          on: { click: function (ev) { ev.stopPropagation(); openTaskForm(t); } }
        }, UI.icon('edit', 13)),
        el('button', {
          class: 'btn btn-icon', type: 'button', title: '删除',
          on: { click: function (ev) { ev.stopPropagation(); deleteTask(t); } }
        }, UI.icon('trash', 13))
      ])
    ]);
    card.addEventListener('dragstart', function (ev) {
      ev.dataTransfer.setData('text/plain', t.id);
      ev.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', function () { card.classList.remove('dragging'); });
    return card;
  }

  /**
   * 列表 / 看板 切换控件。
   * @return {!HTMLElement}
   */
  function buildModeSwitch() {
    var seg = el('div', { class: 'seg' });
    [
      { value: 'list', label: '列表', icon: 'list' },
      { value: 'board', label: '看板', icon: 'board' }
    ].forEach(function (m) {
      UI.append(seg, el('button', {
        class: 'seg-item' + (vs.mode === m.value ? ' active' : ''),
        type: 'button',
        on: { click: function () { vs.mode = m.value; WB.App.render(true); } }
      }, [UI.icon(m.icon, 13), el('span', { text: m.label })]));
    });
    return seg;
  }

  /* ==================================================================
     06 / 视图导出
     ================================================================== */

  WB.Views.tasks = {
    id: 'tasks',
    title: '任务',
    subtitle: 'EXECUTION / TASKS',
    icon: 'task',
    navKey: '2',

    openTaskForm: openTaskForm,
    deleteTask: deleteTask,
    parseQuickInput: parseQuickInput,
    buildParsePreview: buildParsePreview,
    createFromParsed: createFromParsed,

    /**
     * 外部跳转时预设空间筛选。
     * @param {string} spaceId
     */
    setSpaceFilter: function (spaceId) {
      vs.spaceId = spaceId || '';
      vs.projectId = '';
      vs.range = 'undone';
    },

    /**
     * 外部跳转时预设项目筛选。
     * @param {string} projectId
     */
    setProjectFilter: function (projectId) {
      var p = WB.Store.projects.get(projectId);
      vs.projectId = projectId || '';
      vs.spaceId = p ? p.spaceId : '';
      vs.range = 'all';
    },

    /**
     * 渲染任务视图。
     * @param {!HTMLElement} mount
     * @param {{fresh:boolean}} ctx
     */
    render: function (mount, ctx) {
      var list = WB.Store.tasks.list({
        spaceId: vs.spaceId || undefined,
        projectId: vs.projectId || undefined,
        priority: vs.priority || undefined,
        status: vs.status || undefined,
        tag: vs.tag || undefined,
        range: vs.range,
        q: vs.q || undefined
      });

      var grid = el('div', { class: 'grid12' });
      UI.append(grid, buildQuickAddBar());
      UI.append(grid, buildFilterBar(list.length));
      UI.append(grid, vs.mode === 'board' ? renderBoard(list) : renderList(list));
      UI.append(mount, grid);

      if (ctx.fresh) UI.stagger(mount, 40);
    }
  };

})(window);
