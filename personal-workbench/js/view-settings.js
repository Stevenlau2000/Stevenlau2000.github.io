/**
 * view-settings.js —— 设置
 *
 * 区块：
 *   01 数据管理：导出 JSON / 导入 JSON / 重置为种子数据 / 清空全部数据
 *   02 存储与统计：localStorage 占用、各集合条目数
 *   03 快捷入口管理：分组、增删改
 *   04 连接器：飞书 / 乐享（开关 + 配置字段 + 测试连接，当前为预留桩）
 *   05 偏好：每周起始日
 *   06 键盘快捷键说明
 *
 * 依赖：ui.js、store.js、connectors.js
 */
(function (global) {
  'use strict';

  var WB = global.WB = global.WB || {};
  WB.Views = WB.Views || {};

  var UI = WB.UI, U = WB.Util;
  var el = UI.el;

  /* ==================================================================
     01 / 数据管理
     ================================================================== */

  /**
   * @return {!HTMLElement}
   */
  function renderData() {
    var card = UI.card({ tag: '01 / DATA', title: '数据管理', span: 7 });

    var fileInput = el('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var text = String(reader.result || '');
        var peek;
        try {
          peek = JSON.parse(text);
        } catch (e) {
          UI.toast('文件不是合法 JSON：' + e.message, 'err', 4000);
          fileInput.value = '';
          return;
        }
        var summary = '将导入：' +
          ((peek.spaces || []).length) + ' 个空间 / ' +
          ((peek.projects || []).length) + ' 个项目 / ' +
          ((peek.tasks || []).length) + ' 条任务 / ' +
          ((peek.outputs || []).length) + ' 件产出。\n\n导入会完全覆盖当前数据，建议先导出备份。';
        UI.confirm({
          title: '确认导入',
          message: summary,
          danger: true,
          confirmText: '覆盖导入'
        }).then(function (ok) {
          fileInput.value = '';
          if (!ok) return;
          var result = WB.Store.importJSON(text);
          UI.toast(result.message, result.ok ? 'ok' : 'err', 4000);
        });
      };
      reader.onerror = function () {
        UI.toast('读取文件失败', 'err');
        fileInput.value = '';
      };
      reader.readAsText(file, 'utf-8');
    });

    UI.append(card.bodyEl, el('div', { class: 'stack', style: { gap: '14px' } }, [
      el('div', {}, [
        el('div', { class: 'label', style: { marginBottom: '6px' }, text: '备份与恢复' }),
        el('div', { class: 'row wrap', style: { gap: '8px' } }, [
          el('button', {
            class: 'btn btn-primary', type: 'button',
            on: {
              click: function () {
                var name = WB.Store.downloadBackup();
                UI.toast('已导出 ' + name, 'ok');
              }
            }
          }, [UI.icon('download', 13), el('span', { text: '导出 JSON 备份' })]),
          el('button', {
            class: 'btn', type: 'button',
            on: { click: function () { fileInput.click(); } }
          }, [UI.icon('upload', 13), el('span', { text: '导入 JSON' })]),
          fileInput
        ]),
        el('div', { class: 'field-hint', style: { marginTop: '6px' }, text: '备份文件名自动带日期，如 workbench-backup-' + U.todayISO() + '.json。建议每周导出一次，放到网盘或 Git 仓库。' })
      ]),

      el('div', { class: 'danger-zone' }, [
        el('div', { class: 'label', style: { color: 'var(--accent)', marginBottom: '6px' }, text: '危险操作 DANGER ZONE' }),
        el('div', { class: 'row wrap', style: { gap: '8px' } }, [
          el('button', {
            class: 'btn btn-danger', type: 'button',
            on: {
              click: function () {
                UI.confirm({
                  title: '重置为种子数据',
                  message: '当前所有数据会被示例数据替换，且无法撤销。建议先导出备份。确定继续吗？',
                  danger: true, confirmText: '重置'
                }).then(function (ok) {
                  if (!ok) return;
                  WB.Store.resetToSeed();
                  UI.toast('已重置为种子数据', 'ok');
                });
              }
            }
          }, [UI.icon('archive', 13), el('span', { text: '重置为种子数据' })]),
          el('button', {
            class: 'btn btn-danger', type: 'button',
            on: {
              click: function () {
                UI.confirm({
                  title: '清空全部数据',
                  message: '将删除全部空间、项目、任务、产出物、快捷入口与事件记录，工作台会变成全新空白状态。此操作不可撤销！',
                  danger: true, confirmText: '我确定，清空'
                }).then(function (ok) {
                  if (!ok) return;
                  UI.confirm({
                    title: '再次确认',
                    message: '真的要清空吗？确认前请务必已经导出备份。',
                    danger: true, confirmText: '清空全部数据'
                  }).then(function (ok2) {
                    if (!ok2) return;
                    WB.Store.clearAll();
                    UI.toast('数据已清空', 'ok');
                  });
                });
              }
            }
          }, [UI.icon('trash', 13), el('span', { text: '清空全部数据' })])
        ])
      ])
    ]));
    return card;
  }

  /* ==================================================================
     02 / 存储与统计
     ================================================================== */

  /**
   * @return {!HTMLElement}
   */
  function renderStorage() {
    var bytes = WB.Store.stats.storageBytes();
    var counts = WB.Store.stats.counts();
    // localStorage 单域名一般 5MB，用作占用比例参考
    var quota = 5 * 1024 * 1024;
    var pct = Math.min(100, (bytes / quota) * 100);

    var card = UI.card({ tag: '02 / STORAGE', title: '存储与统计', span: 5 });

    var rows = [
      { label: '空间 SPACES', value: counts.spaces },
      { label: '项目 PROJECTS', value: counts.projects },
      { label: '任务 TASKS', value: counts.tasks },
      { label: '产出物 OUTPUTS', value: counts.outputs },
      { label: '快捷入口 LINKS', value: counts.links },
      { label: '事件记录 LOGS', value: counts.logs }
    ];

    var table = el('table', { class: 'table' });
    var tbody = el('tbody');
    rows.forEach(function (r) {
      UI.append(tbody, el('tr', {}, [
        el('td', {}, el('span', { class: 'label', text: r.label })),
        el('td', { class: 'num', text: String(r.value) })
      ]));
    });
    UI.append(table, tbody);

    UI.append(card.bodyEl, el('div', { class: 'stack', style: { gap: '12px' } }, [
      el('div', {}, [
        el('div', { class: 'row between', style: { marginBottom: '5px' } }, [
          el('span', { class: 'label', text: '本地占用' }),
          el('span', { class: 'mono', text: U.fmtBytes(bytes) + ' / ≈5 MB' })
        ]),
        el('div', { class: 'bar' }, el('i', { style: { width: Math.max(0.6, pct) + '%' } })),
        el('div', { class: 'field-hint', style: { marginTop: '5px' }, text: '数据保存在浏览器 localStorage（键名 ' + WB.Store.STORAGE_KEY + '），不上传任何服务器。清理浏览器数据会导致丢失，请定期导出备份。' })
      ]),
      table
    ]));
    return card;
  }

  /* ==================================================================
     03 / 快捷入口管理
     ================================================================== */

  /**
   * 快捷入口表单。
   * @param {?Object=} link
   */
  function openLinkForm(link) {
    var isEdit = !!link;
    var groups = {};
    WB.Store.links.all().forEach(function (l) { groups[l.group] = true; });
    UI.formModal({
      title: isEdit ? '编辑快捷入口' : '新增快捷入口',
      tag: '⚑ / LAUNCHER',
      size: 'sm',
      submitText: isEdit ? '保存' : '添加',
      values: Object.assign({ group: Object.keys(groups)[0] || '常用', label: '', url: '', glyph: '·' }, link || {}),
      fields: [
        { key: 'label', label: '名称', type: 'text', span: 8, required: true, placeholder: '如：公众号后台' },
        { key: 'glyph', label: '标记字符', type: 'text', span: 4, placeholder: '公 / W / ★', hint: '1-2 个字符' },
        { key: 'group', label: '分组', type: 'text', span: 12, required: true, placeholder: '如：内容阵地' },
        { key: 'url', label: '链接地址', type: 'url', span: 12, required: true, placeholder: 'https://…' }
      ],
      onSubmit: function (v) {
        var patch = {
          label: v.label,
          glyph: (v.glyph || '·').slice(0, 2),
          group: v.group || '常用',
          url: v.url
        };
        if (isEdit) {
          WB.Store.links.update(link.id, patch);
          UI.toast('快捷入口已更新', 'ok');
        } else {
          WB.Store.links.create(patch);
          UI.toast('快捷入口已添加', 'ok');
        }
      }
    });
  }

  /**
   * @return {!HTMLElement}
   */
  function renderLinks() {
    var groups = WB.Store.links.grouped();
    var card = UI.card({
      tag: '03 / LAUNCHER',
      title: '快捷入口管理',
      span: 12,
      actions: [el('button', {
        class: 'btn btn-sm btn-primary', type: 'button',
        on: { click: function () { openLinkForm(); } }
      }, [UI.icon('plus', 12), el('span', { text: '新增入口' })])]
    });

    if (!groups.length) {
      UI.append(card.bodyEl, UI.empty({
        title: '还没有快捷入口',
        text: '把每天都要打开的后台、文档、行情站放进来，仪表盘上一键直达。',
        actionText: '新增入口',
        onAction: function () { openLinkForm(); }
      }));
      return card;
    }

    groups.forEach(function (g, gi) {
      UI.append(card.bodyEl, el('div', {
        class: 'row', style: { gap: '10px', margin: (gi ? '16px 0 8px' : '0 0 8px') }
      }, [
        el('span', { class: 'card-tag', text: g.group }),
        el('span', { style: { flex: '1', height: '1px', background: 'var(--rule-soft)' } })
      ]));
      var grid = el('div', { class: 'link-grid' });
      g.items.forEach(function (l) {
        UI.append(grid, el('div', { class: 'link-card', title: l.url }, [
          el('span', { class: 'link-glyph', text: l.glyph || '·' }),
          el('span', { class: 'link-label', style: { flex: '1' }, text: l.label }),
          el('button', {
            class: 'btn btn-icon', type: 'button', title: '编辑',
            on: { click: function () { openLinkForm(l); } }
          }, UI.icon('edit', 12)),
          el('button', {
            class: 'btn btn-icon', type: 'button', title: '删除',
            on: {
              click: function () {
                UI.confirm({
                  title: '删除快捷入口',
                  message: '确定删除「' + l.label + '」吗？',
                  danger: true, confirmText: '删除'
                }).then(function (ok) {
                  if (!ok) return;
                  WB.Store.links.remove(l.id);
                  UI.toast('已删除', 'ok');
                });
              }
            }
          }, UI.icon('trash', 12))
        ]));
      });
      UI.append(card.bodyEl, grid);
    });
    return card;
  }

  /* ==================================================================
     04 / 连接器
     ================================================================== */

  /**
   * 单个连接器卡片。
   * @param {string} id 'lark' | 'lexiang'
   * @param {!Array<{key:string, label:string, placeholder:string, secret:boolean}>} fields
   * @return {!HTMLElement}
   */
  function buildConnectorCard(id, fields) {
    var adapter = WB.Connectors.registry[id];
    var conf = WB.Store.settings.get().connectors[id] || {};
    var statusLine = el('div', { class: 'field-hint', text: conf.enabled ? '已启用（接口预留中，实际读写仍走本地存储）' : '未启用' });

    var card = UI.card({
      tag: (id === 'lark' ? '04' : '05') + ' / CONNECTOR',
      title: adapter.name,
      span: 6,
      actions: [
        el('label', { class: 'switch' }, [
          el('input', {
            type: 'checkbox', checked: !!conf.enabled,
            on: {
              change: function (ev) {
                WB.Store.settings.updateConnector(id, { enabled: ev.target.checked });
                UI.toast(adapter.name + (ev.target.checked ? ' 已启用' : ' 已停用'), 'ok');
              }
            }
          }),
          el('span', { class: 'switch-track' })
        ])
      ]
    });

    var inputs = {};
    var grid = el('div', { class: 'form-grid' });
    fields.forEach(function (f) {
      var input = el('input', {
        class: 'input mono', type: f.secret ? 'password' : 'text',
        placeholder: f.placeholder || '', value: conf[f.key] || ''
      });
      inputs[f.key] = input;
      UI.append(grid, el('div', { class: 'field f6' }, [
        el('label', { class: 'field-label', text: f.label }),
        input
      ]));
    });

    var resultLine = el('div', { class: 'field-hint', style: { minHeight: '18px' } });

    UI.append(card.bodyEl, el('div', { class: 'stack', style: { gap: '10px' } }, [
      el('div', { class: 'muted', style: { fontSize: '12.5px', lineHeight: '1.7' }, text: adapter.description }),
      el('div', {
        style: { fontSize: '11.5px', lineHeight: '1.7', color: 'var(--ink-3)', borderLeft: '2px solid var(--rule)', paddingLeft: '9px' },
        text: '对接方式：' + adapter.docs
      }),
      grid,
      el('div', { class: 'row', style: { gap: '8px' } }, [
        el('button', {
          class: 'btn', type: 'button',
          on: {
            click: function () {
              var patch = {};
              Object.keys(inputs).forEach(function (k) { patch[k] = inputs[k].value.trim(); });
              WB.Store.settings.updateConnector(id, patch);
              UI.toast('配置已保存到本地', 'ok');
            }
          }
        }, [UI.icon('check', 13), el('span', { text: '保存配置' })]),
        el('button', {
          class: 'btn', type: 'button',
          on: {
            click: function () {
              resultLine.textContent = '正在测试…';
              WB.Connectors.test(id).then(function (r) {
                resultLine.textContent = (r.ok ? '✓ ' : '✕ ') + r.message;
                resultLine.style.color = r.ok ? 'var(--moss)' : 'var(--accent)';
                UI.toast(r.message, r.ok ? 'ok' : 'warn', 3200);
              });
            }
          }
        }, [UI.icon('bolt', 13), el('span', { text: '测试连接' })]),
        el('div', { class: 'spacer' }),
        statusLine
      ]),
      resultLine
    ]));
    return card;
  }

  /* ==================================================================
     05 / 偏好 + 快捷键
     ================================================================== */

  /**
   * @return {!HTMLElement}
   */
  function renderPreferences() {
    var st = WB.Store.settings.get();
    var card = UI.card({ tag: '06 / PREFERENCE', title: '偏好设置', span: 5 });

    var weekSel = el('select', { class: 'select' });
    [{ value: '1', label: '周一' }, { value: '0', label: '周日' }].forEach(function (o) {
      UI.append(weekSel, el('option', { value: o.value, text: o.label, selected: String(st.weekStart) === o.value }));
    });
    weekSel.value = String(st.weekStart);
    weekSel.addEventListener('change', function () {
      WB.Store.settings.update({ weekStart: Number(weekSel.value) });
      UI.toast('每周起始日已更新', 'ok');
    });

    UI.append(card.bodyEl, el('div', { class: 'stack', style: { gap: '12px' } }, [
      el('div', { class: 'field' }, [
        el('label', { class: 'field-label', text: '每周起始日' }),
        weekSel,
        el('div', { class: 'field-hint', text: '影响「本周」筛选、周报区间与热力图列的起点。' })
      ]),
      el('div', { class: 'field' }, [
        el('label', { class: 'field-label', text: '主题' }),
        el('div', { class: 'row', style: { gap: '8px' } }, [
          el('span', { class: 'chip active', text: '工程蓝图 Blueprint' }),
          el('span', { class: 'dim', style: { fontSize: '11.5px' }, text: '当前版本仅提供浅色蓝图主题' })
        ])
      ]),
      el('div', { class: 'field' }, [
        el('label', { class: 'field-label', text: '连续活跃' }),
        el('div', { class: 'row', style: { gap: '10px' } }, [
          el('span', { class: 'display', style: { fontSize: '26px', color: 'var(--accent)' }, text: String(st.streak.current) }),
          el('span', { class: 'muted', style: { fontSize: '12px' }, text: '天　最佳纪录 ' + st.streak.best + ' 天　最近活跃 ' + (st.streak.lastActiveDate || '—') })
        ])
      ])
    ]));
    return card;
  }

  /** @const {!Array<{key:string, desc:string}>} */
  var SHORTCUTS = [
    { key: '⌘K / Ctrl+K', desc: '打开命令面板（全局搜索任务、项目、产出物、空间，跳转视图）' },
    { key: '1 ~ 6', desc: '依次切换 仪表盘 / 任务 / 项目 / 产出物 / 复盘 / 设置' },
    { key: 'N', desc: '新建任务' },
    { key: '/', desc: '聚焦搜索（打开命令面板）' },
    { key: 'Esc', desc: '关闭当前弹层 / 抽屉 / 命令面板' },
    { key: '?', desc: '显示快捷键帮助' },
    { key: '⌘ + Enter', desc: '在任意弹层中提交表单' },
    { key: 'Enter', desc: '在快速添加框中直接创建任务' }
  ];

  /**
   * @return {!HTMLElement}
   */
  function renderShortcuts() {
    var card = UI.card({ tag: '07 / KEYS', title: '键盘快捷键', span: 7 });
    var table = el('table', { class: 'table' });
    UI.append(table, el('thead', {}, el('tr', {}, [
      el('th', { style: { width: '150px' }, text: '按键' }),
      el('th', { text: '功能' })
    ])));
    var tbody = el('tbody');
    SHORTCUTS.forEach(function (s) {
      UI.append(tbody, el('tr', {}, [
        el('td', {}, el('span', { class: 'kbd', text: s.key })),
        el('td', { text: s.desc })
      ]));
    });
    UI.append(table, tbody);
    UI.append(card.bodyEl, table);
    return card;
  }

  /* ==================================================================
     06 / 视图导出
     ================================================================== */

  WB.Views.settings = {
    id: 'settings',
    title: '设置',
    subtitle: 'SYSTEM / SETTINGS',
    icon: 'settings',
    navKey: '6',

    /** @return {!Array<{key:string, desc:string}>} 供命令面板与帮助弹层复用 */
    getShortcuts: function () { return SHORTCUTS; },

    /**
     * 渲染设置视图。
     * @param {!HTMLElement} mount
     * @param {{fresh:boolean}} ctx
     */
    render: function (mount, ctx) {
      var grid = el('div', { class: 'grid12' });
      UI.append(grid, renderData());
      UI.append(grid, renderStorage());
      UI.append(grid, renderLinks());
      UI.append(grid, buildConnectorCard('lark', [
        { key: 'appId', label: 'App ID', placeholder: 'cli_xxxxxxxx', secret: false },
        { key: 'appSecret', label: 'App Secret', placeholder: '••••••••', secret: true },
        { key: 'taskListId', label: '任务清单 GUID', placeholder: 'tasklist_guid', secret: false },
        { key: 'baseAppToken', label: '多维表格 App Token', placeholder: 'bascn…', secret: false }
      ]));
      UI.append(grid, buildConnectorCard('lexiang', [
        { key: 'endpoint', label: 'MCP 服务地址', placeholder: 'https://…', secret: false },
        { key: 'token', label: '访问令牌', placeholder: '••••••••', secret: true },
        { key: 'teamId', label: 'Team ID', placeholder: '团队 ID', secret: false },
        { key: 'spaceId', label: 'Space ID', placeholder: '知识空间 ID', secret: false }
      ]));
      UI.append(grid, renderPreferences());
      UI.append(grid, renderShortcuts());
      UI.append(mount, grid);
      if (ctx.fresh) UI.stagger(mount, 40);
    }
  };

})(window);
