/**
 * view-dashboard.js —— 每日仪表盘
 *
 * 结构（12 列非对称网格）：
 *   作战简报 → 关键指标条 → 今日待办(7) / 本周重点(5) → 项目进度(8) / 近期产出(4)
 *   → 空间概览(5) / 快捷入口(7)
 *
 * 依赖：ui.js、store.js
 */
(function (global) {
  'use strict';

  var WB = global.WB = global.WB || {};
  WB.Views = WB.Views || {};

  var UI = WB.UI, U = WB.Util, P = WB.Parts;
  var el = UI.el;

  /** 「星期日 / 星期一 …」全称（dashboard 日期块专用，不改 ui.js 的 weekdayCN） */
  var WEEK_FULL = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

  /* ------------------------------------------------------------------
     作战简报
     ------------------------------------------------------------------ */

  /**
   * 生成一句话状态摘要（实时数据）。
   * 格式：今日 N 项待办 · 逾期 N 项待清 · N 项进行中项目 · 本周已交付 N 件 · 连续活跃 N 天
   * @param {!Object} m 指标对象
   * @return {string}
   */
  function summaryText(m) {
    var parts = [];
    parts.push('今日 ' + m.todayTasks + ' 项待办');
    if (m.overdueTasks > 0) parts.push('逾期 ' + m.overdueTasks + ' 项待清');
    parts.push(m.activeProjects + ' 项进行中项目');
    parts.push('本周已交付 ' + m.weekOutputs + ' 件');
    parts.push('连续活跃 ' + m.streak + ' 天');
    if (m.blockedProjects > 0) parts.push(m.blockedProjects + ' 个项目阻塞中');
    return parts.join(' · ');
  }

  /**
   * @param {!Object} m
   * @return {!HTMLElement}
   */
  function renderBriefing(m) {
    var today = U.todayISO();
    var d = U.parseISO(today);
    var monthDay = (d.getMonth() + 1) + '月' + d.getDate() + '日';
    var weekInfo = WEEK_FULL[d.getDay()] + ' · 第 ' + U.weekNumber(today) + ' 周';

    // 今日已完成进度：今日 completedAt===today 的任务数 / 今日相关任务总数
    var todayDone = WB.Store.tasks.all().filter(function (t) {
      return t.status === 'done' && t.completedAt === today;
    }).length;
    var todayTotal = m.todayTasks + todayDone;   // m.todayTasks 已含今日+逾期未完成
    var progressPercent = todayTotal > 0 ? Math.round(todayDone / todayTotal * 100) : 0;

    return el('section', { class: 'briefing', dataset: { stagger: '1' } }, [
      // 左：日期块（display 大字 + mono 小字星期/周序）
      el('div', {}, [
        el('div', { class: 'brief-meta', text: weekInfo }),
        el('div', { class: 'brief-date' }, [
          el('span', { text: monthDay }),
          el('span', { class: 'mono', style: { fontSize: '15px', marginLeft: '10px', color: 'var(--ink-3)' }, text: String(d.getFullYear()) })
        ])
      ]),
      // 中：状态摘要
      el('div', { class: 'brief-summary', text: summaryText(m) }),
      // 右：今日已完成小卡（刻度尺，不用圆角胶囊）
      el('div', { class: 'brief-today-done', style: { marginLeft: 'auto', textAlign: 'right' } }, [
        el('div', { class: 'card-tag', text: 'TODAY / DONE' }),
        el('div', { class: 'row', style: { gap: '6px', alignItems: 'baseline', justifyContent: 'flex-end', marginTop: '2px' } }, [
          el('span', { class: 'display', style: { fontSize: '28px', lineHeight: '1' }, text: String(todayDone) }),
          el('span', { class: 'dim', style: { fontSize: '12px' }, text: '/ ' + todayTotal + ' 项' })
        ]),
        el('div', { style: { width: '160px', marginTop: '6px' } }, UI.ruler(progressPercent, todayDone > 0 ? 'moss' : '')),
        el('div', { class: 'mono', style: { fontSize: '10px', color: 'var(--ink-3)', marginTop: '4px' }, text: '今日已完成 ' + progressPercent + '%' })
      ])
    ]);
  }

  /* ------------------------------------------------------------------
     关键指标条
     ------------------------------------------------------------------ */

  /**
   * @param {!Object} m
   * @param {boolean} animate
   * @return {!HTMLElement}
   */
  function renderMetrics(m, animate) {
    var items = [
      { num: m.activeProjects, label: 'ACTIVE PROJECTS', sub: '进行中项目', tone: '' },
      { num: m.todayTasks, label: 'DUE TODAY', sub: '今日待办', tone: 'hot' },
      { num: m.overdueTasks, label: 'OVERDUE', sub: '逾期任务', tone: m.overdueTasks > 0 ? 'hot' : '' },
      { num: m.weekDone, label: 'DONE THIS WEEK', sub: '本周完成', tone: 'good' },
      { num: m.streak, label: 'STREAK · DAYS', sub: '连续活跃 · 最佳 ' + m.streakBest, tone: 'calm' }
    ];
    var wrap = el('section', { class: 'metrics c12', dataset: { stagger: '1' } });
    items.forEach(function (it) {
      var numEl = el('div', { class: 'metric-num ' + it.tone, text: String(it.num) });
      UI.append(wrap, el('div', { class: 'metric' }, [
        numEl,
        el('div', { class: 'metric-label', text: it.label }),
        el('div', { class: 'metric-sub', text: it.sub })
      ]));
      if (animate) UI.countUp(numEl, it.num, 320);
    });
    return wrap;
  }

  /* ------------------------------------------------------------------
     今日待办
     ------------------------------------------------------------------ */

  /**
   * 今日待办卡。
   * 今日待办 = due === today && status !== 'done'
   * 逾期     = due < today && status !== 'done'（单独分组，朱砂红标注）
   * 两者都空时显示有设计感的清闲空状态。
   * @return {!HTMLElement}
   */
  function renderToday() {
    var today = U.todayISO();
    // 复用 store 的排序逻辑（range:'today' 已含今日+逾期未完成），再 split 成两组
    var sorted = WB.Store.tasks.list({ range: 'today' });
    var todayList = sorted.filter(function (t) { return t.due === today; });
    var overdueList = sorted.filter(function (t) { return t.due && t.due < today; });

    var card = UI.card({
      tag: '01 / TODAY',
      title: '今日待办',
      span: 7,
      flush: true,
      actions: [
        el('span', { class: 'card-tag', text: (todayList.length + overdueList.length) + ' 项' }),
        el('button', {
          class: 'btn btn-sm', type: 'button', title: '前往任务视图',
          on: { click: function () { WB.App.go('tasks'); } }
        }, [el('span', { text: '全部' }), UI.icon('chevron', 12)])
      ]
    });

    if (!todayList.length && !overdueList.length) {
      // 清闲空状态：今日既无待办也无逾期
      UI.append(card.bodyEl, UI.empty({
        title: '今日无安排',
        text: '适合深度工作或复盘。也可以从下面直接新增一件今天想做的事。',
        actionText: '新建任务',
        onAction: function () { WB.Views.tasks.openTaskForm(null, { due: today }); }
      }));
    } else {
      var listWrap = el('div', { class: 'task-list' });

      // 逾期分组（朱砂红标注，排在最前提醒清掉）
      if (overdueList.length) {
        UI.append(listWrap, el('div', {
          class: 'row',
          style: { padding: '6px 14px', background: 'var(--accent-soft)', borderBottom: '1px solid var(--rule-soft)' }
        }, [
          el('span', { class: 'card-tag', style: { color: 'var(--accent)' }, text: '逾期 ' + overdueList.length + ' 项' }),
          el('span', { class: 'dim', style: { fontSize: '11px' }, text: '需清掉或改期' })
        ]));
        overdueList.forEach(function (t) {
          UI.append(listWrap, P.taskRow(t, {
            onEdit: function (task) { WB.Views.tasks.openTaskForm(task); },
            onDelete: function (task) { WB.Views.tasks.deleteTask(task); }
          }));
        });
      }

      // 今日待办分组（若上面已有逾期分组，这里加个分隔标题）
      if (todayList.length) {
        if (overdueList.length) {
          UI.append(listWrap, el('div', {
            class: 'row',
            style: { padding: '6px 14px', background: 'var(--paper)', borderBottom: '1px solid var(--rule-soft)' }
          }, [
            el('span', { class: 'card-tag', text: '今日 ' + todayList.length + ' 项' })
          ]));
        }
        todayList.forEach(function (t) {
          UI.append(listWrap, P.taskRow(t, {
            onEdit: function (task) { WB.Views.tasks.openTaskForm(task); },
            onDelete: function (task) { WB.Views.tasks.deleteTask(task); }
          }));
        });
      }

      UI.append(card.bodyEl, listWrap);
    }

    UI.append(card, buildQuickAdd());
    return card;
  }

  /**
   * 行内快速新增（复用任务视图的语法解析）。
   * @return {!HTMLElement}
   */
  function buildQuickAdd() {
    var input = el('input', {
      class: 'input', type: 'text',
      placeholder: '快速新增：写点什么…（#项目 !P0 @今天）'
    });
    var preview = el('div', { class: 'parse-preview' });

    function refreshPreview() {
      UI.clear(preview);
      if (!input.value.trim()) return;
      var parsed = WB.Views.tasks.parseQuickInput(input.value);
      UI.append(preview, WB.Views.tasks.buildParsePreview(parsed));
    }

    function submit() {
      var text = input.value.trim();
      if (!text) return;
      var parsed = WB.Views.tasks.parseQuickInput(text);
      if (!parsed.due) parsed.due = U.todayISO();
      WB.Views.tasks.createFromParsed(parsed);
      input.value = '';
      UI.clear(preview);
      UI.toast('已添加到今日待办', 'ok');
    }

    input.addEventListener('input', refreshPreview);
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); submit(); }
    });

    return el('div', {}, [
      el('div', { class: 'quick-add' }, [
        UI.icon('plus', 14),
        input,
        el('span', { class: 'kbd', text: 'Enter' })
      ]),
      preview
    ]);
  }

  /* ------------------------------------------------------------------
     本周重点（任务 + 里程碑，按日期分组）
     ------------------------------------------------------------------ */

  /**
   * @return {!HTMLElement}
   */
  function renderWeek() {
    var m = WB.Store.stats.dashboard();
    var card = UI.card({
      tag: '02 / THIS WEEK',
      title: '本周重点',
      span: 5,
      flush: true,
      actions: [el('span', { class: 'card-tag', text: m.weekFrom.slice(5) + ' → ' + m.weekTo.slice(5) })]
    });

    /** @type {!Array<{date:string, kind:string, title:string, meta:?HTMLElement}>} */
    var items = [];
    WB.Store.tasks.list({ range: 'week' }).forEach(function (t) {
      items.push({ date: t.due, kind: 'task', title: t.title, ref: t });
    });
    WB.Store.projects.list().forEach(function (p) {
      (p.milestones || []).forEach(function (ms) {
        if (ms.done || !ms.due) return;
        if (ms.due >= m.weekFrom && ms.due <= m.weekTo) {
          items.push({ date: ms.due, kind: 'milestone', title: ms.title, ref: p });
        }
      });
    });
    items.sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });

    if (!items.length) {
      UI.append(card.bodyEl, UI.empty({
        title: '本周暂无排期',
        text: '给本周安排点关键动作，别让日程被临时事务填满。',
        actionText: '安排任务',
        onAction: function () { WB.Views.tasks.openTaskForm(null, { due: U.addDays(U.todayISO(), 1) }); }
      }));
      return card;
    }

    var byDate = U.groupBy(items, function (i) { return i.date; });
    var wrap = el('div', { class: 'task-list' });
    Object.keys(byDate).sort().forEach(function (date) {
      UI.append(wrap, el('div', {
        class: 'row',
        style: { padding: '6px 14px', background: 'var(--paper)', borderBottom: '1px solid var(--rule-soft)' }
      }, [
        el('span', { class: 'card-tag', text: date.slice(5) + ' · ' + U.weekdayCN(date) }),
        el('span', { class: 'dim', style: { fontSize: '11px' }, text: U.fmtDue(date) })
      ]));
      byDate[date].forEach(function (it) {
        if (it.kind === 'task') {
          UI.append(wrap, P.taskRow(it.ref, {
            compact: true,
            onEdit: function (task) { WB.Views.tasks.openTaskForm(task); }
          }));
        } else {
          UI.append(wrap, el('div', { class: 'task' }, [
            el('span', { style: { marginTop: '3px', color: 'var(--indigo)' } }, UI.icon('bolt', 14)),
            el('div', { class: 'task-main' }, [
              el('div', { class: 'task-title', text: it.title }),
              el('div', { class: 'task-meta' }, [
                el('span', { class: 'badge', text: '里程碑' }),
                P.project(it.ref.id)
              ])
            ])
          ]));
        }
      });
    });
    UI.append(card.bodyEl, wrap);
    return card;
  }

  /* ------------------------------------------------------------------
     项目进度
     ------------------------------------------------------------------ */

  /**
   * @return {!HTMLElement}
   */
  function renderProjects() {
    var list = WB.Store.projects.list().filter(function (p) {
      return p.status === 'active' || p.status === 'blocked';
    });
    var card = UI.card({
      tag: '03 / PROGRESS',
      title: '项目进度',
      span: 8,
      flush: true,
      actions: [el('button', {
        class: 'btn btn-sm', type: 'button',
        on: { click: function () { WB.App.go('projects'); } }
      }, [el('span', { text: '管理' }), UI.icon('chevron', 12)])]
    });

    if (!list.length) {
      UI.append(card.bodyEl, UI.empty({
        title: '暂无进行中的项目',
        text: '把手上的事情立成项目，进度才看得见。',
        actionText: '新建项目',
        onAction: function () { WB.App.go('projects'); WB.Views.projects.openProjectForm(); }
      }));
      return card;
    }

    var table = el('table', { class: 'table' });
    var thead = el('thead', {}, el('tr', {}, [
      el('th', { text: '项目' }),
      el('th', { style: { width: '90px' }, text: '状态' }),
      el('th', { style: { width: '180px' }, text: '进度' }),
      el('th', { style: { width: '110px' }, text: '截止' })
    ]));
    var tbody = el('tbody');

    list.forEach(function (p) {
      var space = WB.Store.spaces.get(p.spaceId);
      var left = U.diffDays(U.todayISO(), p.dueDate);
      var dueText = left < 0 ? ('逾期 ' + Math.abs(left) + ' 天') : (left === 0 ? '今天到期' : ('剩 ' + left + ' 天'));
      var tone = p.status === 'blocked' ? 'ochre' : (p.progress >= 100 ? 'moss' : 'accent');

      var row = el('tr', {
        style: { cursor: 'pointer' },
        on: { click: function () { WB.App.go('projects'); WB.Views.projects.openProjectDrawer(p.id); } }
      }, [
        el('td', {}, el('div', {}, [
          el('div', { class: 'row', style: { gap: '6px' } }, [
            space ? el('i', { class: 'space-dot', style: { background: space.color } }) : null,
            el('span', { class: 'strong', text: p.name })
          ]),
          el('div', { class: 'row', style: { gap: '6px', marginTop: '2px' } }, [
            P.priority(p.priority),
            el('span', { class: 'dim', style: { fontSize: '11px' }, text: (space ? space.code + ' · ' : '') + p.owner })
          ])
        ])),
        el('td', {}, P.status('projectStatus', p.status)),
        el('td', {}, el('div', { class: 'row', style: { gap: '8px' } }, [
          el('div', { style: { flex: '1' } }, UI.ruler(p.progress, tone)),
          el('span', { class: 'ruler-num', text: p.progress + '%' })
        ])),
        el('td', {}, el('span', {
          class: 'due' + (left < 0 ? ' overdue' : (left <= 3 ? ' today' : '')),
          text: dueText
        }))
      ]);
      UI.append(tbody, row);
    });

    UI.append(table, [thead, tbody]);
    UI.append(card.bodyEl, table);
    return card;
  }

  /* ------------------------------------------------------------------
     近期产出
     ------------------------------------------------------------------ */

  /**
   * @return {!HTMLElement}
   */
  function renderRecentOutputs() {
    var list = WB.Store.outputs.list().slice(0, 5);
    var card = UI.card({
      tag: '04 / OUTPUT',
      title: '近期产出',
      span: 4,
      flush: true,
      actions: [el('button', {
        class: 'btn btn-sm', type: 'button',
        on: { click: function () { WB.App.go('outputs'); } }
      }, [el('span', { text: '产出库' }), UI.icon('chevron', 12)])]
    });

    if (!list.length) {
      UI.append(card.bodyEl, UI.empty({
        title: '还没有产出记录',
        text: '做完的东西要留痕，年底复盘才有底气。',
        actionText: '登记产出',
        onAction: function () { WB.App.go('outputs'); WB.Views.outputs.openOutputForm(); }
      }));
      return card;
    }

    var wrap = el('div', { class: 'task-list' });
    list.forEach(function (o) {
      var row = el('div', { class: 'task', style: { cursor: o.link ? 'pointer' : 'default' } }, [
        el('span', { style: { marginTop: '2px', color: 'var(--indigo)' } }, UI.icon(o.type, 15)),
        el('div', { class: 'task-main' }, [
          el('div', { class: 'task-title', text: o.title }),
          el('div', { class: 'task-meta' }, [
            el('span', { class: 'badge', text: WB.Store.labelOf('outputType', o.type) }),
            el('span', { class: 'due', text: o.date.slice(5) }),
            P.space(o.spaceId)
          ])
        ]),
        o.link ? el('span', { class: 'dim' }, UI.icon('link', 13)) : null
      ]);
      if (o.link) {
        row.addEventListener('click', function () { global.open(o.link, '_blank', 'noopener'); });
      }
      UI.append(wrap, row);
    });
    UI.append(card.bodyEl, wrap);
    return card;
  }

  /* ------------------------------------------------------------------
     空间概览
     ------------------------------------------------------------------ */

  /**
   * @return {!HTMLElement}
   */
  function renderSpaces() {
    var list = WB.Store.spaces.list();
    var card = UI.card({
      tag: '05 / SPACES',
      title: '空间概览',
      span: 5,
      flush: true,
      actions: [el('button', {
        class: 'btn btn-sm', type: 'button',
        on: { click: function () { WB.App.go('projects'); } }
      }, [el('span', { text: '管理' }), UI.icon('chevron', 12)])]
    });

    if (!list.length) {
      UI.append(card.bodyEl, UI.empty({
        title: '还没有空间',
        text: '空间是最上层的分类，比如「客户交付」「内容」「投资」。',
        actionText: '新建空间',
        onAction: function () { WB.App.go('projects'); WB.Views.projects.openSpaceForm(); }
      }));
      return card;
    }

    var table = el('table', { class: 'table' });
    UI.append(table, el('thead', {}, el('tr', {}, [
      el('th', { text: '空间' }),
      el('th', { style: { width: '68px' }, text: '项目' }),
      el('th', { style: { width: '68px' }, text: '未完成' }),
      el('th', { style: { width: '80px' }, text: '本月产出' })
    ])));
    var tbody = el('tbody');
    list.forEach(function (sp) {
      var s = WB.Store.stats.space(sp.id);
      UI.append(tbody, el('tr', {
        style: { cursor: 'pointer' },
        on: { click: function () { WB.Views.tasks.setSpaceFilter(sp.id); WB.App.go('tasks'); } }
      }, [
        el('td', {}, el('div', { class: 'row', style: { gap: '7px' } }, [
          el('span', { class: 'code-badge', style: { background: sp.color }, text: sp.code }),
          el('span', { text: sp.name })
        ])),
        el('td', { class: 'num', text: String(s.projects) }),
        el('td', { class: 'num', style: { color: s.openTasks > 0 ? 'var(--accent)' : 'inherit' }, text: String(s.openTasks) }),
        el('td', { class: 'num', text: String(s.monthOutputs) })
      ]));
    });
    UI.append(table, tbody);
    UI.append(card.bodyEl, table);
    return card;
  }

  /* ------------------------------------------------------------------
     快捷入口
     ------------------------------------------------------------------ */

  /**
   * @return {!HTMLElement}
   */
  function renderLinks() {
    var groups = WB.Store.links.grouped();
    var card = UI.card({
      tag: '06 / LAUNCHER',
      title: '快捷入口',
      span: 7,
      actions: [el('button', {
        class: 'btn btn-sm', type: 'button',
        on: { click: function () { WB.App.go('settings'); } }
      }, [UI.icon('settings', 12), el('span', { text: '编辑' })])]
    });

    if (!groups.length) {
      UI.append(card.bodyEl, UI.empty({
        title: '还没有快捷入口',
        text: '把每天都要打开的后台、文档、行情站放这里，少点几次鼠标。',
        actionText: '去设置添加',
        onAction: function () { WB.App.go('settings'); }
      }));
      return card;
    }

    groups.forEach(function (g, gi) {
      UI.append(card.bodyEl, el('div', {
        class: 'row', style: { gap: '10px', margin: (gi ? '14px 0 7px' : '0 0 7px') }
      }, [
        el('span', { class: 'card-tag', text: g.group }),
        el('span', { class: 'line', style: { flex: '1', height: '1px', background: 'var(--rule-soft)' } })
      ]));
      var grid = el('div', { class: 'link-grid' });
      g.items.forEach(function (l) {
        UI.append(grid, el('a', {
          class: 'link-card', href: l.url, target: '_blank', rel: 'noopener noreferrer', title: l.url
        }, [
          el('span', { class: 'link-glyph', text: l.glyph || '·' }),
          el('span', { class: 'link-label', text: l.label })
        ]));
      });
      UI.append(card.bodyEl, grid);
    });
    return card;
  }

  /* ------------------------------------------------------------------
     视图导出
     ------------------------------------------------------------------ */

  WB.Views.dashboard = {
    id: 'dashboard',
    title: '仪表盘',
    subtitle: 'COMMAND / DASHBOARD',
    icon: 'dashboard',
    navKey: '1',

    /**
     * 渲染仪表盘。
     * @param {!HTMLElement} mount 挂载点
     * @param {{fresh:boolean}} ctx 渲染上下文
     */
    render: function (mount, ctx) {
      var m = WB.Store.stats.dashboard();
      var grid = el('div', { class: 'grid12' });

      UI.append(mount, renderBriefing(m));
      UI.append(mount, el('div', { style: { height: '14px' } }));
      UI.append(grid, [
        renderMetrics(m, !!ctx.fresh),
        renderToday(),
        renderWeek(),
        renderProjects(),
        renderRecentOutputs(),
        renderSpaces(),
        renderLinks()
      ]);
      UI.append(mount, grid);

      if (ctx.fresh) UI.stagger(mount, 40);
    }
  };

})(window);
