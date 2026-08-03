/**
 * view-outputs.js —— 产出物库
 *
 * 能力：
 *   - 网格卡片：类型图标、标题、日期、所属项目/空间、标签
 *   - 顶部：全文搜索（标题 / 标签 / 备注）+ 类型筛选 chips + 空间筛选
 *   - 按月时间轴分组
 *   - 有链接的卡片可新窗口打开
 *   - 新增 / 编辑 / 删除
 *   - 右上角「本年累计产出 N 件」统计
 *
 * 对外接口：openOutputForm(output, presets)、deleteOutput(output)
 * 依赖：ui.js、store.js
 */
(function (global) {
  'use strict';

  var WB = global.WB = global.WB || {};
  WB.Views = WB.Views || {};

  var UI = WB.UI, U = WB.Util, P = WB.Parts;
  var el = UI.el;

  /** 视图本地状态。 */
  var vs = { q: '', type: '', spaceId: '' };

  /* ==================================================================
     01 / 表单
     ================================================================== */

  /**
   * 产出物新建 / 编辑。
   * @param {?Object=} output
   * @param {!Object=} presets
   */
  function openOutputForm(output, presets) {
    var isEdit = !!output;
    var projOpts = [{ value: '', label: '— 不关联项目 —' }];
    WB.Store.projects.list({ includeArchived: true }).forEach(function (p) {
      var sp = WB.Store.spaces.get(p.spaceId);
      projOpts.push({ value: p.id, label: (sp ? '[' + sp.code + '] ' : '') + p.name });
    });
    var spaceOpts = [{ value: '', label: '— 不指定空间 —' }];
    WB.Store.spaces.list({ includeArchived: true }).forEach(function (s) {
      spaceOpts.push({ value: s.id, label: s.code + ' · ' + s.name });
    });

    var values = Object.assign({
      title: '', type: 'article', link: '', date: U.todayISO(),
      projectId: '', spaceId: '', tags: [], note: ''
    }, output || {}, presets || {});
    if (values.projectId === null) values.projectId = '';
    if (values.spaceId === null) values.spaceId = '';

    UI.formModal({
      title: isEdit ? '编辑产出物' : '登记产出物',
      tag: isEdit ? '04 / EDIT OUTPUT' : '04 / NEW OUTPUT',
      submitText: isEdit ? '保存修改' : '登记',
      values: values,
      fields: [
        { key: 'title', label: '标题', type: 'text', span: 12, required: true, placeholder: '如：万豪酒店群 VRF 技术方案（主体稿）' },
        { key: 'type', label: '类型', type: 'select', span: 4, options: WB.Store.ENUMS.outputType },
        { key: 'date', label: '产出日期', type: 'date', span: 4 },
        { key: 'tags', label: '标签', type: 'tags', span: 4, placeholder: '逗号分隔' },
        { key: 'projectId', label: '所属项目', type: 'select', span: 6, options: projOpts },
        { key: 'spaceId', label: '所属空间', type: 'select', span: 6, options: spaceOpts, hint: '选了项目会自动跟随项目的空间' },
        { key: 'link', label: '链接', type: 'url', span: 12, placeholder: 'https:// 或留空' },
        { key: 'note', label: '备注', type: 'textarea', span: 12, placeholder: '数据表现、复用场景、后续动作…' }
      ],
      onSubmit: function (v) {
        var patch = {
          title: v.title, type: v.type, date: v.date || U.todayISO(),
          tags: v.tags, link: v.link, note: v.note,
          projectId: v.projectId || null,
          spaceId: v.spaceId || null
        };
        if (patch.projectId) {
          var proj = WB.Store.projects.get(patch.projectId);
          if (proj) patch.spaceId = proj.spaceId;
        }
        if (isEdit) {
          WB.Store.outputs.update(output.id, patch);
          UI.toast('产出物已更新', 'ok');
        } else {
          var created = WB.Store.outputs.create(patch);
          WB.Store.logs.add('output_add', created.id, '新增产出：' + created.title);
          UI.toast('产出物已登记', 'ok');
        }
      }
    });
  }

  /**
   * 删除产出物（带确认）。
   * @param {!Object} output
   */
  function deleteOutput(output) {
    UI.confirm({
      title: '删除产出物',
      message: '确定删除「' + output.title + '」吗？此操作不可撤销。',
      danger: true, confirmText: '删除'
    }).then(function (ok) {
      if (!ok) return;
      WB.Store.outputs.remove(output.id);
      UI.toast('已删除', 'ok');
    });
  }

  /* ==================================================================
     02 / 工具条
     ================================================================== */

  /**
   * 搜索 + 筛选条。
   * @param {number} hit 命中数
   * @return {!HTMLElement}
   */
  function buildToolbar(hit) {
    var yearStart = U.todayISO().slice(0, 4) + '-01-01';
    var yearCount = WB.Store.outputs.all().filter(function (o) { return o.date >= yearStart; }).length;

    var card = UI.card({
      tag: '01 / LIBRARY',
      title: '产出物库',
      span: 12,
      actions: [
        el('div', { class: 'row', style: { gap: '6px' } }, [
          el('span', { class: 'card-tag', text: '本年累计' }),
          el('span', { class: 'display', style: { fontSize: '22px', color: 'var(--accent)' }, text: String(yearCount) }),
          el('span', { class: 'card-tag', text: '件' })
        ]),
        el('button', {
          class: 'btn btn-sm btn-primary', type: 'button',
          on: { click: function () { openOutputForm(); } }
        }, [UI.icon('plus', 12), el('span', { text: '登记产出' })])
      ]
    });

    var search = el('input', {
      class: 'input', type: 'search', placeholder: '搜索标题 / 标签 / 备注…', value: vs.q
    });
    search.classList.add('js-output-search');
    search.addEventListener('input', U.debounce(function () {
      vs.q = search.value.trim();
      WB.App.render(false);
      var again = document.querySelector('.js-output-search');
      if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
    }, 240));

    var spaceSel = el('select', { class: 'select' });
    UI.append(spaceSel, el('option', { value: '', text: '全部空间' }));
    WB.Store.spaces.list({ includeArchived: true }).forEach(function (s) {
      UI.append(spaceSel, el('option', { value: s.id, text: s.code + ' · ' + s.name, selected: vs.spaceId === s.id }));
    });
    spaceSel.value = vs.spaceId;
    spaceSel.addEventListener('change', function () { vs.spaceId = spaceSel.value; WB.App.render(false); });

    var typeRow = el('div', { class: 'row wrap', style: { gap: '6px' } });
    UI.append(typeRow, el('span', { class: 'label', text: '类型' }));
    var counts = {};
    WB.Store.outputs.all().forEach(function (o) { counts[o.type] = (counts[o.type] || 0) + 1; });
    UI.append(typeRow, el('button', {
      class: 'chip' + (vs.type === '' ? ' active' : ''), type: 'button',
      on: { click: function () { vs.type = ''; WB.App.render(false); } }
    }, [el('span', { text: '全部' }), el('span', { class: 'count', text: String(WB.Store.outputs.all().length) })]));
    WB.Store.ENUMS.outputType.forEach(function (t) {
      UI.append(typeRow, el('button', {
        class: 'chip' + (vs.type === t.value ? ' active' : ''), type: 'button',
        on: { click: function () { vs.type = t.value; WB.App.render(false); } }
      }, [UI.icon(t.value, 12), el('span', { text: t.label }), el('span', { class: 'count', text: String(counts[t.value] || 0) })]));
    });

    UI.append(card.bodyEl, el('div', { class: 'stack' }, [
      el('div', { class: 'row wrap', style: { gap: '10px' } }, [
        el('div', { style: { width: '260px' } }, search),
        el('div', { style: { width: '190px' } }, spaceSel),
        el('div', { class: 'spacer' }),
        el('span', { class: 'card-tag', text: '命中 ' + hit + ' 件' }),
        el('button', {
          class: 'btn btn-sm', type: 'button', text: '重置',
          on: { click: function () { vs.q = ''; vs.type = ''; vs.spaceId = ''; WB.App.render(false); } }
        })
      ]),
      typeRow
    ]));
    return card;
  }

  /* ==================================================================
     03 / 卡片与时间轴
     ================================================================== */

  /**
   * 单张产出物卡片。
   * @param {!Object} o
   * @return {!HTMLElement}
   */
  function buildOutputCard(o) {
    var card = el('article', { class: 'out-card' }, [
      el('div', { class: 'out-top' }, [
        P.outputType(o.type),
        el('div', { style: { flex: '1', minWidth: '0' } }, [
          el('div', { class: 'out-title', text: o.title }),
          el('div', { class: 'row', style: { gap: '6px', marginTop: '3px' } }, [
            el('span', { class: 'due', text: o.date }),
            el('span', { class: 'badge', text: WB.Store.labelOf('outputType', o.type) })
          ])
        ])
      ]),
      o.note ? el('div', { class: 'muted', style: { fontSize: '11.5px', lineHeight: '1.65' }, text: o.note }) : null,
      (o.tags || []).length ? el('div', { class: 'row wrap', style: { gap: '5px' } }, P.tags(o.tags, 5)) : null,
      el('div', { class: 'out-meta' }, [
        P.space(o.spaceId),
        P.project(o.projectId),
        el('div', { class: 'spacer' }),
        o.link ? el('a', {
          class: 'btn btn-icon', href: o.link, target: '_blank', rel: 'noopener noreferrer', title: '打开链接'
        }, UI.icon('link', 13)) : null,
        el('button', {
          class: 'btn btn-icon', type: 'button', title: '编辑',
          on: { click: function () { openOutputForm(o); } }
        }, UI.icon('edit', 13)),
        el('button', {
          class: 'btn btn-icon', type: 'button', title: '删除',
          on: { click: function () { deleteOutput(o); } }
        }, UI.icon('trash', 13))
      ])
    ]);
    return card;
  }

  /**
   * 时间轴（按月分组）。
   * @param {!Array<!Object>} list
   * @return {!HTMLElement}
   */
  function buildTimeline(list) {
    var wrap = el('div', { class: 'c12', dataset: { stagger: '1' } });
    var byMonth = U.groupBy(list, function (o) { return o.date.slice(0, 7); });
    Object.keys(byMonth).sort().reverse().forEach(function (month) {
      var items = byMonth[month];
      UI.append(wrap, el('div', { class: 'month-sep' }, [
        el('span', { class: 'display', style: { fontSize: '17px' }, text: month.replace('-', ' 年 ') + ' 月' }),
        el('span', { class: 'card-tag', text: items.length + ' 件' }),
        el('span', { class: 'line' })
      ]));
      var grid = el('div', { class: 'out-grid', style: { marginBottom: '18px' } });
      items.forEach(function (o) { UI.append(grid, buildOutputCard(o)); });
      UI.append(wrap, grid);
    });
    return wrap;
  }

  /* ==================================================================
     04 / 视图导出
     ================================================================== */

  WB.Views.outputs = {
    id: 'outputs',
    title: '产出物',
    subtitle: 'ARCHIVE / OUTPUTS',
    icon: 'output',
    navKey: '4',

    openOutputForm: openOutputForm,
    deleteOutput: deleteOutput,

    /**
     * 渲染产出物库。
     * @param {!HTMLElement} mount
     * @param {{fresh:boolean}} ctx
     */
    render: function (mount, ctx) {
      var list = WB.Store.outputs.list({
        q: vs.q || undefined,
        type: vs.type || undefined,
        spaceId: vs.spaceId || undefined
      });

      var grid = el('div', { class: 'grid12' });
      UI.append(grid, buildToolbar(list.length));

      if (!list.length) {
        var emptyCard = UI.card({ tag: '02 / TIMELINE', title: '时间轴', span: 12 });
        UI.append(emptyCard.bodyEl, UI.empty({
          title: WB.Store.outputs.all().length ? '没有匹配的产出物' : '产出物库还是空的',
          text: WB.Store.outputs.all().length
            ? '换个关键词或类型试试。'
            : '每完成一份方案、一篇文章、一个 Skill，都在这里留一条记录。到了年底，这就是你最硬的底气。',
          actionText: '登记第一件产出',
          onAction: function () { openOutputForm(); }
        }));
        UI.append(grid, emptyCard);
      } else {
        UI.append(grid, buildTimeline(list));
      }

      UI.append(mount, grid);
      if (ctx.fresh) UI.stagger(mount, 40);
    }
  };

})(window);
