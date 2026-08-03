/**
 * view-projects.js —— 项目 & 空间视图
 *
 * 上半区：空间管理（横向卡片，新增 / 编辑 / 归档 / 删除）
 * 下半区：项目列表（卡片 / 表格 双视图，状态、刻度尺进度、负责人、起止、标签、里程碑完成度）
 * 项目详情：右侧滑出抽屉，可编辑全部字段、勾选里程碑（自动重算进度）、查看关联任务与产出物
 *
 * 对外接口：
 *   openSpaceForm(space)        空间新建 / 编辑
 *   openProjectForm(project)    项目新建 / 编辑
 *   openProjectDrawer(id)       打开项目详情抽屉
 *
 * 依赖：ui.js、store.js
 */
(function (global) {
  'use strict';

  var WB = global.WB = global.WB || {};
  WB.Views = WB.Views || {};

  var UI = WB.UI, U = WB.Util, P = WB.Parts;
  var el = UI.el;

  /** 视图本地状态。 */
  var vs = {
    layout: 'card',        // 'card' | 'table'
    spaceId: '',
    status: '',
    showArchivedSpaces: false
  };

  /** @type {?Object} 当前打开的抽屉实例 */
  var openDrawer = null;
  /** @type {string} 当前抽屉对应的项目 ID */
  var openDrawerProjectId = '';

  /* ==================================================================
     01 / 空间管理
     ================================================================== */

  var PRESET_COLORS = ['#C43B22', '#1F3A5F', '#B07D2B', '#4A6B3F', '#4A4F57', '#7A3B6B', '#2F6E75'];

  /**
   * 空间新建 / 编辑。
   * @param {?Object=} space
   */
  function openSpaceForm(space) {
    var isEdit = !!space;
    UI.formModal({
      title: isEdit ? '编辑空间' : '新建空间',
      tag: isEdit ? '03 / EDIT SPACE' : '03 / NEW SPACE',
      submitText: isEdit ? '保存修改' : '创建空间',
      values: Object.assign({ name: '', code: '', color: PRESET_COLORS[0], description: '' }, space || {}),
      fields: [
        { key: 'name', label: '空间名称', type: 'text', span: 8, required: true, placeholder: '如：中央空调营销' },
        { key: 'code', label: '代号（3 字母）', type: 'text', span: 4, required: true, placeholder: 'AIC' },
        { key: 'color', label: '主色', type: 'select', span: 4, options: PRESET_COLORS.map(function (c) { return { value: c, label: c }; }) },
        { key: 'description', label: '描述', type: 'text', span: 8, placeholder: '这个空间装的是什么类型的事' }
      ],
      onSubmit: function (v) {
        var patch = {
          name: v.name,
          code: String(v.code || '').toUpperCase().slice(0, 4),
          color: v.color,
          description: v.description
        };
        if (isEdit) {
          WB.Store.spaces.update(space.id, patch);
          UI.toast('空间已更新', 'ok');
        } else {
          WB.Store.spaces.create(patch);
          UI.toast('空间已创建', 'ok');
        }
      }
    });
  }

  /**
   * 空间卡片。
   * @param {!Object} sp
   * @return {!HTMLElement}
   */
  function buildSpaceCard(sp) {
    var s = WB.Store.stats.space(sp.id);
    var card = el('article', {
      class: 'space-card' + (sp.archived ? ' archived' : ''),
      title: '点击筛选该空间的项目'
    });
    card.style.setProperty('--sp-color', sp.color);

    UI.append(card, [
      el('div', { class: 'row between', style: { marginBottom: '4px' } }, [
        el('div', { class: 'row', style: { gap: '7px' } }, [
          el('span', { class: 'code-badge', style: { background: sp.color }, text: sp.code }),
          el('span', { class: 'space-name', text: sp.name })
        ]),
        el('div', { class: 'row', style: { gap: '2px' } }, [
          el('button', {
            class: 'btn btn-icon', type: 'button', title: '编辑空间',
            on: { click: function (ev) { ev.stopPropagation(); openSpaceForm(sp); } }
          }, UI.icon('edit', 13)),
          el('button', {
            class: 'btn btn-icon', type: 'button', title: sp.archived ? '取消归档' : '归档空间',
            on: {
              click: function (ev) {
                ev.stopPropagation();
                WB.Store.spaces.update(sp.id, { archived: !sp.archived });
                UI.toast(sp.archived ? '已取消归档' : '空间已归档', 'ok');
              }
            }
          }, UI.icon('archive', 13)),
          el('button', {
            class: 'btn btn-icon', type: 'button', title: '删除空间',
            on: {
              click: function (ev) {
                ev.stopPropagation();
                UI.confirm({
                  title: '删除空间',
                  message: '删除「' + sp.name + '」会同时删除其下的 ' + s.projects + ' 个项目，关联任务与产出物将解除绑定（不会被删除）。确定吗？',
                  danger: true,
                  confirmText: '删除空间'
                }).then(function (ok) {
                  if (!ok) return;
                  WB.Store.spaces.removeCascade(sp.id);
                  UI.toast('空间已删除', 'ok');
                });
              }
            }
          }, UI.icon('trash', 13))
        ])
      ]),
      el('div', { class: 'space-desc', text: sp.description || '—' }),
      el('div', { class: 'space-stats' }, [
        el('div', { class: 'space-stat' }, [el('b', { text: String(s.projects) }), el('span', { text: 'PROJECT' })]),
        el('div', { class: 'space-stat' }, [el('b', { style: { color: s.openTasks ? 'var(--accent)' : '' }, text: String(s.openTasks) }), el('span', { text: 'OPEN' })]),
        el('div', { class: 'space-stat' }, [el('b', { text: String(s.monthOutputs) }), el('span', { text: 'OUT/M' })])
      ])
    ]);

    card.addEventListener('click', function () {
      vs.spaceId = (vs.spaceId === sp.id) ? '' : sp.id;
      WB.App.render(false);
    });
    return card;
  }

  /**
   * 空间区块。
   * @return {!HTMLElement}
   */
  function renderSpaces() {
    var list = WB.Store.spaces.list({ includeArchived: vs.showArchivedSpaces });
    var card = UI.card({
      tag: '01 / SPACES',
      title: '空间管理',
      span: 12,
      actions: [
        el('label', { class: 'switch', title: '显示已归档空间' }, [
          el('input', {
            type: 'checkbox', checked: vs.showArchivedSpaces,
            on: { change: function (ev) { vs.showArchivedSpaces = ev.target.checked; WB.App.render(false); } }
          }),
          el('span', { class: 'switch-track' }),
          el('span', { class: 'card-tag', text: '含归档' })
        ]),
        el('button', {
          class: 'btn btn-sm btn-primary', type: 'button',
          on: { click: function () { openSpaceForm(); } }
        }, [UI.icon('plus', 12), el('span', { text: '新建空间' })])
      ]
    });

    if (!list.length) {
      UI.append(card.bodyEl, UI.empty({
        title: '还没有空间',
        text: '空间是最上层的分类容器。建议按「业务线」而不是「项目」来分，比如客户交付、内容、投资。',
        actionText: '新建第一个空间',
        onAction: function () { openSpaceForm(); }
      }));
      return card;
    }

    var strip = el('div', { class: 'space-strip' });
    list.forEach(function (sp) { UI.append(strip, buildSpaceCard(sp)); });
    UI.append(card.bodyEl, strip);

    if (vs.spaceId) {
      var sel = WB.Store.spaces.get(vs.spaceId);
      UI.append(card.bodyEl, el('div', {
        class: 'row', style: { marginTop: '10px', gap: '8px' }
      }, [
        el('span', { class: 'card-tag', text: '当前筛选' }),
        el('span', { class: 'chip active', text: sel ? sel.name : '未知空间' }),
        el('button', {
          class: 'btn btn-sm', type: 'button', text: '清除',
          on: { click: function () { vs.spaceId = ''; WB.App.render(false); } }
        })
      ]));
    }
    return card;
  }

  /* ==================================================================
     02 / 项目表单
     ================================================================== */

  /**
   * 项目新建 / 编辑。
   * @param {?Object=} project
   * @param {!Object=} presets
   */
  function openProjectForm(project, presets) {
    var isEdit = !!project;
    var spaceOpts = WB.Store.spaces.list({ includeArchived: true }).map(function (s) {
      return { value: s.id, label: s.code + ' · ' + s.name };
    });
    if (!spaceOpts.length) {
      UI.toast('请先创建一个空间', 'warn');
      openSpaceForm();
      return;
    }
    var today = U.todayISO();
    var values = Object.assign({
      name: '', spaceId: vs.spaceId || spaceOpts[0].value, status: 'planning', priority: 'P1',
      owner: '本人', startDate: today, dueDate: U.addDays(today, 30), tags: [], notes: ''
    }, project || {}, presets || {});

    UI.formModal({
      title: isEdit ? '编辑项目' : '新建项目',
      tag: isEdit ? '02 / EDIT PROJECT' : '02 / NEW PROJECT',
      submitText: isEdit ? '保存修改' : '创建项目',
      values: values,
      fields: [
        { key: 'name', label: '项目名称', type: 'text', span: 12, required: true, placeholder: '如：2026 商用多联机新品上市推广方案' },
        { key: 'spaceId', label: '所属空间', type: 'select', span: 6, options: spaceOpts, required: true },
        { key: 'owner', label: '负责人', type: 'text', span: 6, placeholder: '本人 / 张三' },
        { key: 'status', label: '状态', type: 'select', span: 4, options: WB.Store.ENUMS.projectStatus },
        { key: 'priority', label: '优先级', type: 'select', span: 4, options: WB.Store.ENUMS.priority },
        { key: 'tags', label: '标签', type: 'tags', span: 4, placeholder: '逗号分隔' },
        { key: 'startDate', label: '开始日期', type: 'date', span: 6 },
        { key: 'dueDate', label: '截止日期', type: 'date', span: 6 },
        { key: 'notes', label: '项目说明', type: 'textarea', span: 12, placeholder: '目标、边界、关键风险、当前判断…' }
      ],
      onSubmit: function (v) {
        var patch = {
          name: v.name, spaceId: v.spaceId, owner: v.owner || '本人',
          status: v.status, priority: v.priority, tags: v.tags,
          startDate: v.startDate || today, dueDate: v.dueDate || U.addDays(today, 30),
          notes: v.notes
        };
        if (isEdit) {
          WB.Store.projects.update(project.id, patch);
          WB.Store.logs.add('project_update', project.id, '更新项目：' + patch.name);
          UI.toast('项目已更新', 'ok');
          if (openDrawer && openDrawerProjectId === project.id) openDrawer.refresh();
        } else {
          var created = WB.Store.projects.create(patch);
          WB.Store.logs.add('project_add', created.id, '新建项目：' + created.name);
          UI.toast('项目已创建', 'ok');
        }
      }
    });
  }

  /* ==================================================================
     03 / 项目详情抽屉
     ================================================================== */

  /**
   * 打开项目详情抽屉。
   * @param {string} projectId
   */
  function openProjectDrawer(projectId) {
    var p = WB.Store.projects.get(projectId);
    if (!p) {
      UI.toast('项目不存在', 'err');
      return;
    }
    openDrawerProjectId = projectId;
    openDrawer = UI.drawer({
      title: p.name,
      tag: '▸ / PROJECT DETAIL',
      subtitle: (WB.Store.spaces.get(p.spaceId) || { name: '未分配空间' }).name + ' · 负责人 ' + p.owner,
      build: buildDrawerBody,
      footer: function (api) {
        return [
          el('button', {
            class: 'btn btn-danger', type: 'button', text: '删除项目',
            on: {
              click: function () {
                UI.confirm({
                  title: '删除项目',
                  message: '删除「' + p.name + '」后，其下任务与产出物会解除关联（不会被删除）。确定吗？',
                  danger: true, confirmText: '删除'
                }).then(function (ok) {
                  if (!ok) return;
                  WB.Store.tasks.all().forEach(function (t) { if (t.projectId === projectId) t.projectId = null; });
                  WB.Store.outputs.all().forEach(function (o) { if (o.projectId === projectId) o.projectId = null; });
                  WB.Store.projects.remove(projectId);
                  UI.toast('项目已删除', 'ok');
                  api.close();
                });
              }
            }
          }),
          el('div', { class: 'spacer' }),
          el('button', {
            class: 'btn', type: 'button', text: '编辑字段',
            on: { click: function () { openProjectForm(WB.Store.projects.get(projectId)); } }
          }),
          el('button', {
            class: 'btn btn-primary', type: 'button', text: '完成',
            on: { click: function () { api.close(); } }
          })
        ];
      },
      onClose: function () { openDrawer = null; openDrawerProjectId = ''; }
    });

    /**
     * 构建抽屉正文。
     * @param {!HTMLElement} body
     * @param {!Object} api
     */
    function buildDrawerBody(body, api) {
      var cur = WB.Store.projects.get(projectId);
      if (!cur) { api.close(); return; }
      api.setTitle(cur.name, (WB.Store.spaces.get(cur.spaceId) || { name: '未分配空间' }).name + ' · 负责人 ' + cur.owner);

      var left = U.diffDays(U.todayISO(), cur.dueDate);
      var doneMs = (cur.milestones || []).filter(function (m) { return m.done; }).length;

      // —— 概览 ——
      UI.append(body, el('div', { class: 'stack' }, [
        el('div', { class: 'row wrap', style: { gap: '8px' } }, [
          P.status('projectStatus', cur.status),
          P.priority(cur.priority),
          el('span', { class: 'due' + (left < 0 ? ' overdue' : (left <= 3 ? ' today' : '')), text: left < 0 ? ('逾期 ' + Math.abs(left) + ' 天') : ('剩 ' + left + ' 天') }),
          el('span', { class: 'mono dim', text: cur.startDate + ' → ' + cur.dueDate })
        ]),
        el('div', { class: 'row', style: { gap: '10px' } }, [
          el('div', { style: { flex: '1' } }, UI.ruler(cur.progress, cur.status === 'blocked' ? 'ochre' : 'accent')),
          el('span', { class: 'ruler-num', text: cur.progress + '%' }),
          el('span', { class: 'card-tag', text: '里程碑 ' + doneMs + '/' + (cur.milestones || []).length })
        ]),
        (cur.tags || []).length ? el('div', { class: 'row wrap', style: { gap: '6px' } }, P.tags(cur.tags, 8)) : null,
        cur.notes ? el('div', {
          class: 'muted',
          style: { fontSize: '12.5px', lineHeight: '1.8', borderLeft: '2px solid var(--rule)', paddingLeft: '10px' },
          text: cur.notes
        }) : null
      ]));

      // —— 里程碑 ——
      UI.append(body, sectionTitle('里程碑 MILESTONES', el('button', {
        class: 'btn btn-sm', type: 'button',
        on: { click: function () { openMilestoneForm(projectId, null, api); } }
      }, [UI.icon('plus', 12), el('span', { text: '添加' })])));

      if (!(cur.milestones || []).length) {
        UI.append(body, el('div', { class: 'dim', style: { fontSize: '12px', padding: '6px 0' }, text: '还没有里程碑。把项目拆成 3-5 个可验收的节点，进度才有意义。' }));
      } else {
        var msWrap = el('div', { class: 'task-list', style: { border: '1px solid var(--rule)' } });
        cur.milestones.forEach(function (ms) {
          var check = el('button', {
            class: 'task-check' + (ms.done ? ' on' : ''), type: 'button', title: '勾选后自动重算进度',
            on: {
              click: function () {
                WB.Store.projects.toggleMilestone(projectId, ms.id);
                api.refresh();
              }
            }
          }, UI.icon('check', 11));
          UI.append(msWrap, el('div', { class: 'task' + (ms.done ? ' done' : '') }, [
            check,
            el('div', { class: 'task-main' }, [
              el('div', { class: 'task-title', text: ms.title }),
              el('div', { class: 'task-meta' }, [P.due(ms.due, ms.done ? 'done' : 'todo')])
            ]),
            el('div', { class: 'task-ops', style: { opacity: '1' } }, [
              el('button', {
                class: 'btn btn-icon', type: 'button', title: '编辑',
                on: { click: function () { openMilestoneForm(projectId, ms, api); } }
              }, UI.icon('edit', 13)),
              el('button', {
                class: 'btn btn-icon', type: 'button', title: '删除',
                on: {
                  click: function () {
                    var proj = WB.Store.projects.get(projectId);
                    proj.milestones = proj.milestones.filter(function (x) { return x.id !== ms.id; });
                    WB.Store.projects.recalcProgress(projectId);
                    api.refresh();
                    UI.toast('里程碑已删除', 'ok');
                  }
                }
              }, UI.icon('trash', 13))
            ])
          ]));
        });
        UI.append(body, msWrap);
      }

      // —— 关联任务 ——
      var relTasks = WB.Store.tasks.list({ projectId: projectId, range: 'all' });
      UI.append(body, sectionTitle('关联任务 TASKS · ' + relTasks.length, el('button', {
        class: 'btn btn-sm', type: 'button',
        on: {
          click: function () {
            WB.Views.tasks.openTaskForm(null, { projectId: projectId, spaceId: cur.spaceId });
          }
        }
      }, [UI.icon('plus', 12), el('span', { text: '新任务' })])));

      if (!relTasks.length) {
        UI.append(body, el('div', { class: 'dim', style: { fontSize: '12px', padding: '6px 0' }, text: '该项目下暂无任务。' }));
      } else {
        var tWrap = el('div', { class: 'task-list', style: { border: '1px solid var(--rule)' } });
        relTasks.forEach(function (t) {
          UI.append(tWrap, P.taskRow(t, {
            showProject: false,
            compact: true,
            onEdit: function (task) { WB.Views.tasks.openTaskForm(task); }
          }));
        });
        UI.append(body, tWrap);
      }

      // —— 关联产出物 ——
      var relOutputs = WB.Store.outputs.list({ projectId: projectId });
      UI.append(body, sectionTitle('关联产出 OUTPUTS · ' + relOutputs.length, el('button', {
        class: 'btn btn-sm', type: 'button',
        on: {
          click: function () {
            WB.Views.outputs.openOutputForm(null, { projectId: projectId, spaceId: cur.spaceId });
          }
        }
      }, [UI.icon('plus', 12), el('span', { text: '登记产出' })])));

      if (!relOutputs.length) {
        UI.append(body, el('div', { class: 'dim', style: { fontSize: '12px', padding: '6px 0' }, text: '该项目下暂无产出物。' }));
      } else {
        var oWrap = el('div', { class: 'task-list', style: { border: '1px solid var(--rule)' } });
        relOutputs.forEach(function (o) {
          UI.append(oWrap, el('div', { class: 'task' }, [
            el('span', { style: { marginTop: '2px', color: 'var(--indigo)' } }, UI.icon(o.type, 15)),
            el('div', { class: 'task-main' }, [
              el('div', { class: 'task-title', text: o.title }),
              el('div', { class: 'task-meta' }, [
                el('span', { class: 'badge', text: WB.Store.labelOf('outputType', o.type) }),
                el('span', { class: 'due', text: o.date })
              ])
            ]),
            o.link ? el('a', { class: 'btn btn-icon', href: o.link, target: '_blank', rel: 'noopener noreferrer', title: '打开链接' }, UI.icon('link', 13)) : null
          ]));
        });
        UI.append(body, oWrap);
      }
    }
  }

  /**
   * 抽屉内小节标题。
   * @param {string} text
   * @param {HTMLElement=} action
   * @return {!HTMLElement}
   */
  function sectionTitle(text, action) {
    return el('div', {
      class: 'row between',
      style: { margin: '20px 0 8px', paddingBottom: '5px', borderBottom: '1px solid var(--rule)' }
    }, [el('span', { class: 'card-tag', text: text }), action || null]);
  }

  /**
   * 里程碑新建 / 编辑。
   * @param {string} projectId
   * @param {?Object} milestone
   * @param {!Object} drawerApi
   */
  function openMilestoneForm(projectId, milestone, drawerApi) {
    var isEdit = !!milestone;
    UI.formModal({
      title: isEdit ? '编辑里程碑' : '添加里程碑',
      tag: '◇ / MILESTONE',
      size: 'sm',
      submitText: isEdit ? '保存' : '添加',
      values: Object.assign({ title: '', due: U.addDays(U.todayISO(), 14), done: false }, milestone || {}),
      fields: [
        { key: 'title', label: '里程碑标题', type: 'text', span: 12, required: true, placeholder: '一个可验收的节点' },
        { key: 'due', label: '目标日期', type: 'date', span: 12 },
        { key: 'done', label: '已完成', type: 'checkbox', span: 12, placeholder: '勾选表示该节点已达成' }
      ],
      onSubmit: function (v) {
        var proj = WB.Store.projects.get(projectId);
        if (!proj) return;
        if (!proj.milestones) proj.milestones = [];
        if (isEdit) {
          var target = proj.milestones.find(function (m) { return m.id === milestone.id; });
          if (target) { target.title = v.title; target.due = v.due; target.done = v.done; }
        } else {
          proj.milestones.push({ id: U.uid('ms'), title: v.title, due: v.due, done: v.done });
        }
        WB.Store.projects.recalcProgress(projectId);
        if (drawerApi) drawerApi.refresh();
        UI.toast(isEdit ? '里程碑已更新' : '里程碑已添加', 'ok');
      }
    });
  }

  /* ==================================================================
     04 / 项目列表
     ================================================================== */

  /**
   * 项目卡片。
   * @param {!Object} p
   * @return {!HTMLElement}
   */
  function buildProjectCard(p) {
    var sp = WB.Store.spaces.get(p.spaceId);
    var left = U.diffDays(U.todayISO(), p.dueDate);
    var doneMs = (p.milestones || []).filter(function (m) { return m.done; }).length;
    var openTasks = WB.Store.tasks.all().filter(function (t) { return t.projectId === p.id && t.status !== 'done'; }).length;

    return el('article', {
      class: 'proj-card',
      on: { click: function () { openProjectDrawer(p.id); } }
    }, [
      el('div', { class: 'row', style: { gap: '7px', marginBottom: '2px' } }, [
        sp ? el('span', { class: 'code-badge', style: { background: sp.color }, text: sp.code }) : null,
        P.status('projectStatus', p.status),
        el('div', { class: 'spacer' }),
        P.priority(p.priority)
      ]),
      el('div', { class: 'proj-name', text: p.name }),
      el('div', { class: 'row', style: { gap: '10px', marginTop: '9px' } }, [
        el('div', { style: { flex: '1' } }, UI.ruler(p.progress, p.status === 'blocked' ? 'ochre' : (p.status === 'done' ? 'moss' : 'accent'))),
        el('span', { class: 'ruler-num', text: p.progress + '%' })
      ]),
      el('div', { class: 'proj-meta' }, [
        el('span', { class: 'badge', text: '里程碑 ' + doneMs + '/' + (p.milestones || []).length }),
        el('span', { class: 'badge', text: '待办 ' + openTasks }),
        el('span', { class: 'due' + (left < 0 ? ' overdue' : (left <= 3 ? ' today' : '')), text: left < 0 ? ('逾期 ' + Math.abs(left) + ' 天') : ('剩 ' + left + ' 天') }),
        el('span', { class: 'dim', style: { fontSize: '11px' }, text: p.owner })
      ]),
      (p.tags || []).length ? el('div', { class: 'row wrap', style: { gap: '5px', marginTop: '7px' } }, P.tags(p.tags, 4)) : null
    ]);
  }

  /**
   * 项目表格。
   * @param {!Array<!Object>} list
   * @return {!HTMLElement}
   */
  function buildProjectTable(list) {
    var table = el('table', { class: 'table' });
    UI.append(table, el('thead', {}, el('tr', {}, [
      el('th', { text: '项目' }),
      el('th', { style: { width: '78px' }, text: '空间' }),
      el('th', { style: { width: '86px' }, text: '状态' }),
      el('th', { style: { width: '56px' }, text: '优先级' }),
      el('th', { style: { width: '160px' }, text: '进度' }),
      el('th', { style: { width: '78px' }, text: '里程碑' }),
      el('th', { style: { width: '92px' }, text: '负责人' }),
      el('th', { style: { width: '150px' }, text: '起止' })
    ])));
    var tbody = el('tbody');
    list.forEach(function (p) {
      var sp = WB.Store.spaces.get(p.spaceId);
      var doneMs = (p.milestones || []).filter(function (m) { return m.done; }).length;
      UI.append(tbody, el('tr', {
        style: { cursor: 'pointer' },
        on: { click: function () { openProjectDrawer(p.id); } }
      }, [
        el('td', {}, el('div', {}, [
          el('div', { class: 'strong', text: p.name }),
          (p.tags || []).length ? el('div', { class: 'row wrap', style: { gap: '4px', marginTop: '3px' } }, P.tags(p.tags, 3)) : null
        ])),
        el('td', {}, sp ? el('span', { class: 'code-badge', style: { background: sp.color }, text: sp.code }) : el('span', { class: 'dim', text: '—' })),
        el('td', {}, P.status('projectStatus', p.status)),
        el('td', {}, P.priority(p.priority)),
        el('td', {}, el('div', { class: 'row', style: { gap: '8px' } }, [
          el('div', { style: { flex: '1' } }, UI.ruler(p.progress, p.status === 'blocked' ? 'ochre' : (p.status === 'done' ? 'moss' : 'accent'))),
          el('span', { class: 'ruler-num', text: p.progress + '%' })
        ])),
        el('td', { class: 'num', text: doneMs + '/' + (p.milestones || []).length }),
        el('td', { text: p.owner }),
        el('td', {}, el('span', { class: 'mono dim', style: { fontSize: '11px' }, text: p.startDate.slice(5) + ' → ' + p.dueDate.slice(5) }))
      ]));
    });
    UI.append(table, tbody);
    return table;
  }

  /**
   * 项目区块。
   * @return {!HTMLElement}
   */
  function renderProjects() {
    var list = WB.Store.projects.list({
      spaceId: vs.spaceId || undefined,
      status: vs.status || undefined,
      includeArchived: !!vs.status
    });

    var layoutSeg = el('div', { class: 'seg' });
    [
      { value: 'card', label: '卡片', icon: 'grid' },
      { value: 'table', label: '表格', icon: 'list' }
    ].forEach(function (m) {
      UI.append(layoutSeg, el('button', {
        class: 'seg-item' + (vs.layout === m.value ? ' active' : ''),
        type: 'button',
        on: { click: function () { vs.layout = m.value; WB.App.render(true); } }
      }, [UI.icon(m.icon, 13), el('span', { text: m.label })]));
    });

    var card = UI.card({
      tag: '02 / PROJECTS',
      title: '项目列表',
      span: 12,
      flush: vs.layout === 'table',
      actions: [
        el('span', { class: 'card-tag', text: list.length + ' 个' }),
        layoutSeg,
        el('button', {
          class: 'btn btn-sm btn-primary', type: 'button',
          on: { click: function () { openProjectForm(); } }
        }, [UI.icon('plus', 12), el('span', { text: '新建项目' })])
      ]
    });

    // 状态筛选 chips
    var statusRow = el('div', {
      class: 'row wrap',
      style: { gap: '6px', padding: vs.layout === 'table' ? '10px 14px' : '0 0 10px', borderBottom: vs.layout === 'table' ? '1px solid var(--rule-soft)' : 'none' }
    });
    UI.append(statusRow, el('span', { class: 'label', text: '状态' }));
    [{ value: '', label: '不限' }].concat(WB.Store.ENUMS.projectStatus).forEach(function (s) {
      UI.append(statusRow, el('button', {
        class: 'chip' + (vs.status === s.value ? ' active' : ''),
        type: 'button', text: s.label,
        on: { click: function () { vs.status = s.value; WB.App.render(false); } }
      }));
    });
    UI.append(card.bodyEl, statusRow);

    if (!list.length) {
      UI.append(card.bodyEl, UI.empty({
        title: '没有符合条件的项目',
        text: '换个筛选条件，或者把手上正在推进的事情立成一个项目。',
        actionText: '新建项目',
        onAction: function () { openProjectForm(); }
      }));
      return card;
    }

    if (vs.layout === 'table') {
      UI.append(card.bodyEl, buildProjectTable(list));
    } else {
      var grid = el('div', { class: 'proj-grid' });
      list.forEach(function (p) { UI.append(grid, buildProjectCard(p)); });
      UI.append(card.bodyEl, grid);
    }
    return card;
  }

  /* ==================================================================
     05 / 视图导出
     ================================================================== */

  WB.Views.projects = {
    id: 'projects',
    title: '项目',
    subtitle: 'PORTFOLIO / PROJECTS',
    icon: 'project',
    navKey: '3',

    openSpaceForm: openSpaceForm,
    openProjectForm: openProjectForm,
    openProjectDrawer: openProjectDrawer,

    /**
     * 渲染项目视图。
     * @param {!HTMLElement} mount
     * @param {{fresh:boolean}} ctx
     */
    render: function (mount, ctx) {
      var grid = el('div', { class: 'grid12' });
      UI.append(grid, renderSpaces());
      UI.append(grid, renderProjects());
      UI.append(mount, grid);
      if (ctx.fresh) UI.stagger(mount, 40);
    }
  };

})(window);
