/**
 * view-review.js —— 复盘与周报
 *
 * 能力：
 *   - 时间范围选择：本周 / 上周 / 本月 / 自定义起止
 *   - 一键生成结构化 Markdown 周报：
 *       完成任务（按空间 → 项目分组）、项目进度、新增产出、逾期与阻塞、下期计划
 *   - mono 预览区 + 复制到剪贴板 + 下载 .md
 *   - 近 12 周 × 7 天 活跃热力图（纯 CSS grid，朱砂四档）
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
    preset: 'thisWeek',
    from: '',
    to: '',
    markdown: ''
  };

  var PRESETS = [
    { value: 'thisWeek', label: '本周' },
    { value: 'lastWeek', label: '上周' },
    { value: 'thisMonth', label: '本月' },
    { value: 'last30', label: '近 30 天' },
    { value: 'custom', label: '自定义' }
  ];

  /**
   * 依据 preset 求出起止日期。
   * @return {{from:string, to:string, label:string}}
   */
  function resolveRange() {
    var today = U.todayISO();
    var ws = WB.Store.settings.get().weekStart;
    if (vs.preset === 'thisWeek') {
      return { from: U.startOfWeek(today, ws), to: U.endOfWeek(today, ws), label: '本周' };
    }
    if (vs.preset === 'lastWeek') {
      var lastStart = U.addDays(U.startOfWeek(today, ws), -7);
      return { from: lastStart, to: U.addDays(lastStart, 6), label: '上周' };
    }
    if (vs.preset === 'thisMonth') {
      return { from: U.startOfMonth(today), to: U.endOfMonth(today), label: '本月' };
    }
    if (vs.preset === 'last30') {
      return { from: U.addDays(today, -29), to: today, label: '近 30 天' };
    }
    return {
      from: vs.from || U.addDays(today, -7),
      to: vs.to || today,
      label: '自定义区间'
    };
  }

  /* ==================================================================
     01 / Markdown 生成
     ================================================================== */

  /**
   * 生成结构化 Markdown 复盘/周报。
   * @param {string} from
   * @param {string} to
   * @param {string} label
   * @return {string}
   */
  function buildMarkdown(from, to, label) {
    var lines = [];
    var today = U.todayISO();

    var doneTasks = WB.Store.tasks.all().filter(function (t) {
      return t.status === 'done' && t.completedAt && t.completedAt >= from && t.completedAt <= to;
    });
    var newOutputs = WB.Store.outputs.list({ from: from, to: to });
    var overdue = WB.Store.tasks.list({ range: 'overdue' });
    var blocked = WB.Store.projects.all().filter(function (p) { return p.status === 'blocked'; });
    var activeProjects = WB.Store.projects.list({ status: 'active' });
    var nextTasks = WB.Store.tasks.all().filter(function (t) {
      return t.status !== 'done' && t.due && t.due > to && t.due <= U.addDays(to, 7);
    }).sort(function (a, b) { return a.due < b.due ? -1 : 1; });

    var estimateMin = doneTasks.reduce(function (sum, t) { return sum + (t.estimateMin || 0); }, 0);

    lines.push('# 工作复盘 · ' + label);
    lines.push('');
    lines.push('> 区间：' + from + ' ~ ' + to + '　|　生成于 ' + today);
    lines.push('');
    lines.push('## 一、总览');
    lines.push('');
    lines.push('| 指标 | 数值 |');
    lines.push('| --- | --- |');
    lines.push('| 完成任务 | ' + doneTasks.length + ' 项 |');
    lines.push('| 投入估算 | ' + (estimateMin ? (estimateMin / 60).toFixed(1) + ' 小时' : '未登记') + ' |');
    lines.push('| 新增产出 | ' + newOutputs.length + ' 件 |');
    lines.push('| 进行中项目 | ' + activeProjects.length + ' 个 |');
    lines.push('| 逾期任务 | ' + overdue.length + ' 项 |');
    lines.push('| 阻塞项目 | ' + blocked.length + ' 个 |');
    lines.push('| 连续活跃 | ' + WB.Store.settings.get().streak.current + ' 天 |');
    lines.push('');

    // —— 完成任务：空间 → 项目 分组 ——
    lines.push('## 二、期间完成');
    lines.push('');
    if (!doneTasks.length) {
      lines.push('_本区间没有已完成任务记录。_');
      lines.push('');
    } else {
      var bySpace = U.groupBy(doneTasks, function (t) { return t.spaceId || '__none__'; });
      Object.keys(bySpace).forEach(function (spaceId) {
        var sp = WB.Store.spaces.get(spaceId);
        lines.push('### ' + (sp ? '[' + sp.code + '] ' + sp.name : '未归属空间'));
        lines.push('');
        var byProject = U.groupBy(bySpace[spaceId], function (t) { return t.projectId || '__none__'; });
        Object.keys(byProject).forEach(function (pid) {
          var proj = WB.Store.projects.get(pid);
          lines.push('**' + (proj ? proj.name : '零散事项') + '**');
          lines.push('');
          byProject[pid].forEach(function (t) {
            var suffix = [];
            if (t.priority === 'P0') suffix.push('P0');
            if (t.estimateMin) suffix.push(t.estimateMin + 'min');
            lines.push('- [x] ' + t.title + '　`' + t.completedAt + '`' + (suffix.length ? ' `' + suffix.join(' · ') + '`' : ''));
          });
          lines.push('');
        });
      });
    }

    // —— 项目进度 ——
    lines.push('## 三、项目进度');
    lines.push('');
    if (!activeProjects.length && !blocked.length) {
      lines.push('_当前没有进行中或阻塞的项目。_');
      lines.push('');
    } else {
      lines.push('| 项目 | 空间 | 状态 | 进度 | 里程碑 | 截止 |');
      lines.push('| --- | --- | --- | --- | --- | --- |');
      activeProjects.concat(blocked).forEach(function (p) {
        var sp = WB.Store.spaces.get(p.spaceId);
        var doneMs = (p.milestones || []).filter(function (m) { return m.done; }).length;
        var left = U.diffDays(today, p.dueDate);
        lines.push('| ' + p.name + ' | ' + (sp ? sp.code : '—') + ' | ' +
          WB.Store.labelOf('projectStatus', p.status) + ' | ' + p.progress + '% | ' +
          doneMs + '/' + (p.milestones || []).length + ' | ' + p.dueDate +
          (left < 0 ? ' ⚠逾期' + Math.abs(left) + '天' : '（剩 ' + left + ' 天）') + ' |');
      });
      lines.push('');

      var msDone = [];
      WB.Store.projects.all().forEach(function (p) {
        (p.milestones || []).forEach(function (m) {
          if (m.done && m.due && m.due >= from && m.due <= to) {
            msDone.push('- ✅ ' + p.name + ' → ' + m.title + '　`' + m.due + '`');
          }
        });
      });
      if (msDone.length) {
        lines.push('**本期达成的里程碑**');
        lines.push('');
        lines.push.apply(lines, msDone);
        lines.push('');
      }
    }

    // —— 新增产出 ——
    lines.push('## 四、新增产出');
    lines.push('');
    if (!newOutputs.length) {
      lines.push('_本区间没有登记新的产出物。_');
      lines.push('');
    } else {
      newOutputs.forEach(function (o) {
        var sp = WB.Store.spaces.get(o.spaceId);
        var line = '- `' + o.date + '` **[' + WB.Store.labelOf('outputType', o.type) + ']** ' + o.title;
        if (sp) line += '　（' + sp.code + '）';
        if (o.link) line += '　[链接](' + o.link + ')';
        lines.push(line);
        if (o.note) lines.push('  - ' + o.note);
      });
      lines.push('');
    }

    // —— 逾期与阻塞 ——
    lines.push('## 五、逾期与阻塞');
    lines.push('');
    if (!overdue.length && !blocked.length) {
      lines.push('_没有逾期任务与阻塞项目，节奏健康。_');
      lines.push('');
    } else {
      if (overdue.length) {
        lines.push('**逾期任务（' + overdue.length + '）**');
        lines.push('');
        overdue.forEach(function (t) {
          var proj = WB.Store.projects.get(t.projectId);
          lines.push('- [ ] ' + t.title + '　`应完成于 ' + t.due + '，已逾期 ' + Math.abs(U.diffDays(today, t.due)) + ' 天`' +
            (proj ? '　（' + proj.name + '）' : ''));
        });
        lines.push('');
      }
      if (blocked.length) {
        lines.push('**阻塞项目（' + blocked.length + '）**');
        lines.push('');
        blocked.forEach(function (p) {
          lines.push('- ⛔ ' + p.name);
          if (p.notes) lines.push('  - ' + p.notes);
        });
        lines.push('');
      }
    }

    // —— 下期计划 ——
    lines.push('## 六、下期计划');
    lines.push('');
    if (!nextTasks.length) {
      lines.push('_未来 7 天暂无排期任务，建议主动排一下关键动作。_');
      lines.push('');
    } else {
      var byDue = U.groupBy(nextTasks, function (t) { return t.due; });
      Object.keys(byDue).sort().forEach(function (date) {
        lines.push('**' + date + ' ' + U.weekdayCN(date) + '**');
        lines.push('');
        byDue[date].forEach(function (t) {
          var proj = WB.Store.projects.get(t.projectId);
          lines.push('- [ ] `' + t.priority + '` ' + t.title + (proj ? '　（' + proj.name + '）' : ''));
        });
        lines.push('');
      });
    }

    lines.push('---');
    lines.push('');
    lines.push('_由「个人工作台 · Personal Workbench」自动生成_');
    lines.push('');
    return lines.join('\n');
  }

  /* ==================================================================
     02 / 区间选择 + 预览
     ================================================================== */

  /**
   * @return {!HTMLElement}
   */
  function renderGenerator() {
    var range = resolveRange();
    var card = UI.card({
      tag: '01 / REVIEW',
      title: '复盘与周报生成',
      span: 12,
      actions: [el('span', { class: 'card-tag', text: range.from + ' → ' + range.to })]
    });

    var presetRow = el('div', { class: 'row wrap', style: { gap: '6px' } });
    UI.append(presetRow, el('span', { class: 'label', text: '区间' }));
    PRESETS.forEach(function (p) {
      UI.append(presetRow, el('button', {
        class: 'chip' + (vs.preset === p.value ? ' active' : ''),
        type: 'button', text: p.label,
        on: {
          click: function () {
            vs.preset = p.value;
            if (p.value === 'custom' && !vs.from) {
              vs.from = U.addDays(U.todayISO(), -7);
              vs.to = U.todayISO();
            }
            vs.markdown = '';
            WB.App.render(false);
          }
        }
      }));
    });

    var customRow = null;
    if (vs.preset === 'custom') {
      var fromInput = el('input', { class: 'input mono', type: 'date', value: vs.from });
      var toInput = el('input', { class: 'input mono', type: 'date', value: vs.to });
      fromInput.addEventListener('change', function () { vs.from = fromInput.value; vs.markdown = ''; WB.App.render(false); });
      toInput.addEventListener('change', function () { vs.to = toInput.value; vs.markdown = ''; WB.App.render(false); });
      customRow = el('div', { class: 'row', style: { gap: '10px' } }, [
        el('span', { class: 'label', text: '起止' }),
        el('div', { style: { width: '160px' } }, fromInput),
        el('span', { class: 'dim', text: '→' }),
        el('div', { style: { width: '160px' } }, toInput)
      ]);
    }

    var preview = el('div', { class: 'md-preview', text: vs.markdown || '点击右侧「生成报告」，这里会输出可直接粘贴的 Markdown 周报。' });

    var genBtn = el('button', {
      class: 'btn btn-accent', type: 'button',
      on: {
        click: function () {
          var r = resolveRange();
          if (r.from > r.to) {
            UI.toast('起始日期不能晚于结束日期', 'err');
            return;
          }
          vs.markdown = buildMarkdown(r.from, r.to, r.label);
          preview.textContent = vs.markdown;
          UI.toast('报告已生成', 'ok');
          WB.App.render(false);
        }
      }
    }, [UI.icon('bolt', 13), el('span', { text: '生成报告' })]);

    var copyBtn = el('button', {
      class: 'btn', type: 'button', disabled: !vs.markdown,
      on: {
        click: function () {
          UI.copyText(vs.markdown).then(function (ok) {
            UI.toast(ok ? '已复制到剪贴板' : '复制失败，请手动全选复制', ok ? 'ok' : 'err');
          });
        }
      }
    }, [UI.icon('copy', 13), el('span', { text: '复制' })]);

    var dlBtn = el('button', {
      class: 'btn', type: 'button', disabled: !vs.markdown,
      on: {
        click: function () {
          var r = resolveRange();
          UI.download('复盘-' + r.from + '_' + r.to + '.md', vs.markdown, 'text/markdown');
          UI.toast('已下载 Markdown 文件', 'ok');
        }
      }
    }, [UI.icon('download', 13), el('span', { text: '下载 .md' })]);

    UI.append(card.bodyEl, el('div', { class: 'stack' }, [
      presetRow,
      customRow,
      el('div', { class: 'row wrap', style: { gap: '8px' } }, [
        genBtn, copyBtn, dlBtn,
        el('div', { class: 'spacer' }),
        el('span', { class: 'dim', style: { fontSize: '11.5px' }, text: '内容包含：完成清单 · 项目进度 · 新增产出 · 逾期阻塞 · 下期计划' })
      ]),
      preview
    ]));
    return card;
  }

  /* ==================================================================
     03 / 热力图
     ================================================================== */

  /**
   * 近 12 周活跃热力图。
   * @return {!HTMLElement}
   */
  function renderHeatmap() {
    var grid = WB.Store.stats.heatmap(12);
    var total = 0;
    grid.forEach(function (col) {
      col.forEach(function (cell) { if (cell.level >= 0) total += cell.count; });
    });

    var card = UI.card({
      tag: '02 / ACTIVITY',
      title: '活跃热力图',
      span: 12,
      actions: [el('span', { class: 'card-tag', text: '近 12 周共完成 ' + total + ' 项' })]
    });

    // 行标签（依据第一列的日期推导星期顺序）
    var dayLabels = el('div', { class: 'heat-days' });
    grid[0].forEach(function (cell, idx) {
      var show = (idx % 2 === 1);   // 隔行显示，避免拥挤
      UI.append(dayLabels, el('div', { text: show ? U.weekdayCN(cell.date).replace('周', '') : '' }));
    });

    var months = el('div', { class: 'heat-months', style: { gridAutoColumns: '13px' } });
    var lastMonth = '';
    grid.forEach(function (col) {
      var m = col[0].date.slice(5, 7);
      var label = (m !== lastMonth) ? (Number(m) + '月') : '';
      lastMonth = m;
      UI.append(months, el('div', { style: { whiteSpace: 'nowrap' }, text: label }));
    });

    var heat = el('div', { class: 'heat' });
    grid.forEach(function (col) {
      col.forEach(function (cell) {
        if (cell.level < 0) {
          UI.append(heat, el('div', { class: 'heat-cell void' }));
          return;
        }
        UI.append(heat, el('div', {
          class: 'heat-cell l' + cell.level,
          title: cell.date + ' ' + U.weekdayCN(cell.date) + '：完成 ' + cell.count + ' 项'
        }));
      });
    });

    var legend = el('div', { class: 'heat-legend', style: { marginTop: '10px' } }, [
      el('span', { text: '少' }),
      el('span', { class: 'heat-cell' }),
      el('span', { class: 'heat-cell l1' }),
      el('span', { class: 'heat-cell l2' }),
      el('span', { class: 'heat-cell l3' }),
      el('span', { class: 'heat-cell l4' }),
      el('span', { text: '多' }),
      el('span', { class: 'dim', style: { marginLeft: '12px' }, text: '色块深浅 = 当日完成任务数（0 / 1 / 2 / 3-4 / 5+）' })
    ]);

    UI.append(card.bodyEl, [
      el('div', { class: 'heat-wrap' }, [
        dayLabels,
        el('div', { class: 'heat-col-wrap' }, [months, heat])
      ]),
      legend
    ]);
    return card;
  }

  /* ==================================================================
     04 / 期间明细速览
     ================================================================== */

  /**
   * @return {!HTMLElement}
   */
  function renderSnapshot() {
    var r = resolveRange();
    var doneTasks = WB.Store.tasks.all().filter(function (t) {
      return t.status === 'done' && t.completedAt && t.completedAt >= r.from && t.completedAt <= r.to;
    });
    var outputs = WB.Store.outputs.list({ from: r.from, to: r.to });
    var overdue = WB.Store.tasks.list({ range: 'overdue' });

    var card = UI.card({
      tag: '03 / SNAPSHOT',
      title: '区间明细',
      span: 12,
      flush: true
    });

    var wrap = el('div', { class: 'grid12', style: { padding: '12px 14px' } });

    /**
     * 小列。
     * @param {string} title
     * @param {!Array<!HTMLElement>} rows
     * @param {number} span
     * @return {!HTMLElement}
     */
    function column(title, rows, span) {
      return el('div', { class: 'c' + span }, [
        el('div', { class: 'card-tag', style: { marginBottom: '7px' }, text: title }),
        rows.length ? el('div', { class: 'stack', style: { gap: '5px' } }, rows)
          : el('div', { class: 'dim', style: { fontSize: '12px' }, text: '暂无记录' })
      ]);
    }

    UI.append(wrap, column('完成任务 · ' + doneTasks.length, doneTasks.slice(0, 12).map(function (t) {
      return el('div', { class: 'row', style: { gap: '7px' } }, [
        el('span', { style: { color: 'var(--moss)' } }, UI.icon('check', 12)),
        el('span', { class: 'truncate', style: { flex: '1', fontSize: '12.5px' }, text: t.title }),
        el('span', { class: 'due', text: t.completedAt.slice(5) })
      ]);
    }), 5));

    UI.append(wrap, column('新增产出 · ' + outputs.length, outputs.slice(0, 12).map(function (o) {
      return el('div', { class: 'row', style: { gap: '7px' } }, [
        el('span', { style: { color: 'var(--indigo)' } }, UI.icon(o.type, 12)),
        el('span', { class: 'truncate', style: { flex: '1', fontSize: '12.5px' }, text: o.title }),
        el('span', { class: 'due', text: o.date.slice(5) })
      ]);
    }), 4));

    UI.append(wrap, column('逾期待清 · ' + overdue.length, overdue.slice(0, 12).map(function (t) {
      return el('div', { class: 'row', style: { gap: '7px' } }, [
        P.priority(t.priority),
        el('span', { class: 'truncate', style: { flex: '1', fontSize: '12.5px' }, text: t.title }),
        el('span', { class: 'due overdue', text: String(Math.abs(U.diffDays(U.todayISO(), t.due))) + 'd' })
      ]);
    }), 3));

    UI.append(card.bodyEl, wrap);
    return card;
  }

  /* ==================================================================
     05 / 视图导出
     ================================================================== */

  WB.Views.review = {
    id: 'review',
    title: '复盘',
    subtitle: 'RETRO / WEEKLY REPORT',
    icon: 'review',
    navKey: '5',

    /**
     * 渲染复盘视图。
     * @param {!HTMLElement} mount
     * @param {{fresh:boolean}} ctx
     */
    render: function (mount, ctx) {
      var grid = el('div', { class: 'grid12' });
      UI.append(grid, renderGenerator());
      UI.append(grid, renderSnapshot());
      UI.append(grid, renderHeatmap());
      UI.append(mount, grid);
      if (ctx.fresh) UI.stagger(mount, 40);
    }
  };

})(window);
