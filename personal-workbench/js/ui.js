/**
 * ui.js —— 通用 UI 基础设施
 *
 * 提供：
 *   WB.Util  日期 / 字符串 / 集合等纯函数工具
 *   WB.UI    DOM 构建、图标、toast、modal、表单弹层、抽屉、确认框、数字滚动、错峰动画
 *
 * 约定：本文件必须最先加载（不依赖任何其它模块）。
 * 安全：所有用户输入一律通过 textContent 渲染；innerHTML 仅用于本文件内置的可信 SVG 常量。
 */
(function (global) {
  'use strict';

  /** @type {Object} 全局命名空间 */
  var WB = global.WB = global.WB || {};

  /* ======================================================================
     01 / UTIL —— 纯函数工具
     ====================================================================== */

  var WEEKDAY_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  /**
   * 生成短 ID。
   * @param {string} prefix 前缀，如 'tk'
   * @return {string}
   */
  function uid(prefix) {
    var rand = Math.random().toString(36).slice(2, 8);
    var time = Date.now().toString(36).slice(-4);
    return (prefix || 'id') + '_' + time + rand;
  }

  /**
   * Date -> 'YYYY-MM-DD'（本地时区，避免 toISOString 的 UTC 偏移问题）。
   * @param {Date} date
   * @return {string}
   */
  function toISO(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  /**
   * 'YYYY-MM-DD' -> Date（本地 00:00）。非法输入返回 null。
   * @param {string} iso
   * @return {?Date}
   */
  function parseISO(iso) {
    if (!iso || typeof iso !== 'string') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  /** @return {string} 今天的 ISO 日期。 */
  function todayISO() { return toISO(new Date()); }

  /**
   * 今天 ± offset 天的 ISO 日期（仅日期部分 YYYY-MM-DD）。
   * 给种子任务滚动用：dayISO(0)=今天、dayISO(1)=明天、dayISO(-1)=昨天。
   * @param {number} offset 可为负
   * @return {string}
   */
  function dayISO(offset) {
    var n = Number(offset);
    if (!isFinite(n)) n = 0;
    return addDays(todayISO(), Math.round(n));
  }

  /**
   * 日期加减天数。
   * @param {string} iso 基准日期
   * @param {number} days 可为负
   * @return {string}
   */
  function addDays(iso, days) {
    var d = parseISO(iso) || new Date();
    d.setDate(d.getDate() + days);
    return toISO(d);
  }

  /**
   * 计算 b - a 的天数差（正数表示 b 在 a 之后）。
   * @param {string} aIso
   * @param {string} bIso
   * @return {number}
   */
  function diffDays(aIso, bIso) {
    var a = parseISO(aIso), b = parseISO(bIso);
    if (!a || !b) return 0;
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  }

  /**
   * 求所在周的周一（weekStart=1）或周日（weekStart=0）。
   * @param {string} iso
   * @param {number=} weekStart 1=周一起，0=周日起，默认 1
   * @return {string}
   */
  function startOfWeek(iso, weekStart) {
    var ws = (weekStart === 0) ? 0 : 1;
    var d = parseISO(iso) || new Date();
    var day = d.getDay();
    var delta = (day - ws + 7) % 7;
    d.setDate(d.getDate() - delta);
    return toISO(d);
  }

  /**
   * 求所在周的最后一天。
   * @param {string} iso
   * @param {number=} weekStart
   * @return {string}
   */
  function endOfWeek(iso, weekStart) {
    return addDays(startOfWeek(iso, weekStart), 6);
  }

  /** @param {string} iso @return {string} 当月第一天 */
  function startOfMonth(iso) {
    var d = parseISO(iso) || new Date();
    return toISO(new Date(d.getFullYear(), d.getMonth(), 1));
  }

  /** @param {string} iso @return {string} 当月最后一天 */
  function endOfMonth(iso) {
    var d = parseISO(iso) || new Date();
    return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  }

  /**
   * ISO 8601 周序号。
   * @param {string} iso
   * @return {number}
   */
  function weekNumber(iso) {
    var d = parseISO(iso) || new Date();
    var target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var dayNr = (target.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    var firstThursday = new Date(target.getFullYear(), 0, 4);
    var firstDayNr = (firstThursday.getDay() + 6) % 7;
    firstThursday.setDate(firstThursday.getDate() - firstDayNr + 3);
    return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86400000));
  }

  /** @param {string} iso @return {string} '周三' */
  function weekdayCN(iso) {
    var d = parseISO(iso);
    return d ? WEEKDAY_CN[d.getDay()] : '';
  }

  /**
   * 中文短日期：'8 月 15 日'。
   * @param {string} iso
   * @return {string}
   */
  function fmtDateCN(iso) {
    var d = parseISO(iso);
    if (!d) return '';
    return (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
  }

  /**
   * 相对日期短标签：今天 / 明天 / 昨天 / 逾期 3 天 / 08-15。
   * @param {string} iso
   * @return {string}
   */
  function fmtDue(iso) {
    if (!iso) return '';
    var delta = diffDays(todayISO(), iso);
    if (delta === 0) return '今天';
    if (delta === 1) return '明天';
    if (delta === 2) return '后天';
    if (delta === -1) return '昨天';
    if (delta < 0) return '逾期 ' + Math.abs(delta) + ' 天';
    if (delta <= 6) return weekdayCN(iso) + ' · ' + iso.slice(5);
    return iso.slice(5);
  }

  /** @param {string} iso @return {boolean} */
  function isToday(iso) { return !!iso && iso === todayISO(); }

  /** @param {string} iso @return {boolean} 是否早于今天 */
  function isPast(iso) { return !!iso && diffDays(todayISO(), iso) < 0; }

  /**
   * 判断 iso 是否落在 [from, to] 闭区间。
   * @param {string} iso @param {string} from @param {string} to @return {boolean}
   */
  function inRange(iso, from, to) {
    if (!iso) return false;
    return iso >= from && iso <= to;
  }

  /** 数值裁剪。 */
  function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

  /**
   * HTML 转义（仅在极少数必须拼接字符串的场景使用）。
   * @param {string} str
   * @return {string}
   */
  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** 深拷贝（纯 JSON 数据）。 */
  function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

  /**
   * 按 key 分组。
   * @param {!Array<!Object>} arr
   * @param {function(!Object):string} keyFn
   * @return {!Object<string, !Array<!Object>>}
   */
  function groupBy(arr, keyFn) {
    var out = {};
    arr.forEach(function (item) {
      var k = keyFn(item);
      if (!out[k]) out[k] = [];
      out[k].push(item);
    });
    return out;
  }

  /**
   * 简易模糊匹配：查询字符逐个按序出现即命中，返回得分（越小越好），-1 表示不命中。
   * @param {string} text
   * @param {string} query
   * @return {number}
   */
  function fuzzyScore(text, query) {
    if (!query) return 0;
    var t = String(text || '').toLowerCase();
    var q = String(query).toLowerCase();
    var idx = t.indexOf(q);
    if (idx >= 0) return idx;                     // 连续子串优先
    var ti = 0, score = 0;
    for (var qi = 0; qi < q.length; qi++) {
      var found = t.indexOf(q[qi], ti);
      if (found < 0) return -1;
      score += found - ti + 1;
      ti = found + 1;
    }
    return 100 + score;
  }

  /** 防抖。 */
  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, wait || 160);
    };
  }

  /**
   * 字节数转可读体积。
   * @param {number} bytes
   * @return {string}
   */
  function fmtBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
  }

  WB.Util = {
    uid: uid, toISO: toISO, parseISO: parseISO, todayISO: todayISO, dayISO: dayISO,
    addDays: addDays, diffDays: diffDays,
    startOfWeek: startOfWeek, endOfWeek: endOfWeek,
    startOfMonth: startOfMonth, endOfMonth: endOfMonth,
    weekNumber: weekNumber, weekdayCN: weekdayCN,
    fmtDateCN: fmtDateCN, fmtDue: fmtDue,
    isToday: isToday, isPast: isPast, inRange: inRange,
    clamp: clamp, escapeHtml: escapeHtml, deepClone: deepClone,
    groupBy: groupBy, fuzzyScore: fuzzyScore, debounce: debounce, fmtBytes: fmtBytes,
    WEEKDAY_CN: WEEKDAY_CN
  };

  /* ======================================================================
     02 / DOM 构建
     ====================================================================== */

  /**
   * 追加子节点（支持字符串 / 节点 / 数组 / null）。
   * @param {!Element} parent
   * @param {*} children
   */
  function append(parent, children) {
    if (children === null || children === undefined || children === false) return;
    if (Array.isArray(children)) {
      children.forEach(function (c) { append(parent, c); });
      return;
    }
    if (children instanceof Node) { parent.appendChild(children); return; }
    parent.appendChild(document.createTextNode(String(children)));
  }

  /**
   * 元素构建器。
   * @param {string} tag 标签名
   * @param {Object=} opts 属性表：class/text/style/dataset/on/其它 attribute
   * @param {*=} children 子节点
   * @return {!HTMLElement}
   */
  function el(tag, opts, children) {
    var node = document.createElement(tag);
    opts = opts || {};
    Object.keys(opts).forEach(function (key) {
      var val = opts[key];
      if (val === null || val === undefined || val === false) return;
      if (key === 'class' || key === 'className') { node.className = val; }
      else if (key === 'text') { node.textContent = String(val); }
      else if (key === 'svg') { node.innerHTML = val; }               // 仅内置可信 SVG
      else if (key === 'style' && typeof val === 'object') { Object.assign(node.style, val); }
      else if (key === 'dataset') { Object.keys(val).forEach(function (k) { node.dataset[k] = val[k]; }); }
      else if (key === 'on') { Object.keys(val).forEach(function (k) { node.addEventListener(k, val[k]); }); }
      else if (key === 'value') { node.value = val; }
      else if (key === 'checked') { node.checked = !!val; }
      else if (val === true) { node.setAttribute(key, ''); }
      else { node.setAttribute(key, String(val)); }
    });
    append(node, children);
    return node;
  }

  /** 清空元素。 */
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  /* ======================================================================
     03 / 内联 SVG 图标
     ====================================================================== */

  /** @const {!Object<string,string>} 全部为本文件内置常量，可信。 */
  var ICON_PATHS = {
    dashboard: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>',
    task: '<path d="M9.5 6H20M9.5 12H20M9.5 18H20"/><path d="M4 6l1.4 1.4L8 4.8"/><path d="M4 12l1.4 1.4L8 10.8"/><path d="M4 18l1.4 1.4L8 16.8"/>',
    project: '<path d="M3 6.5h6l2 2h10V19H3z"/><path d="M3 6.5V19"/>',
    output: '<path d="M5 3.5h9l5 5V20.5H5z"/><path d="M14 3.5v5h5"/><path d="M8.5 13h7M8.5 16.5h4.5"/>',
    review: '<path d="M4 19.5V4M4 19.5h16"/><path d="M8 16V10M12 16V6.5M16 16v-3.5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.8M12 18.7v2.8M2.5 12h2.8M18.7 12h2.8M5.3 5.3l2 2M16.7 16.7l2 2M18.7 5.3l-2 2M7.3 16.7l-2 2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
    check: '<path d="M4.5 12.5l5 5L20 6.5"/>',
    trash: '<path d="M4 6.5h16M9.5 6.5V3.5h5v3M6.5 6.5L7.6 20.5h8.8L17.5 6.5"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14.5 5.5l4 4"/>',
    link: '<path d="M10.5 13.5a4.5 4.5 0 006.4 0l2.6-2.6a4.5 4.5 0 00-6.4-6.4l-1 1"/><path d="M13.5 10.5a4.5 4.5 0 00-6.4 0l-2.6 2.6a4.5 4.5 0 006.4 6.4l1-1"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    chevron: '<path d="M9 5.5l6.5 6.5L9 18.5"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    flame: '<path d="M12 3c2.8 4 6 5.2 6 9.2A6 6 0 1 1 6 12c0-1.8.9-3.2 2-4.2 0 1.8 1 2.8 2 2.8 0-3 .8-5.6 2-7.6z"/>',
    download: '<path d="M12 3.5v11.5M7.5 11L12 15.5 16.5 11"/><path d="M4 20.5h16"/>',
    upload: '<path d="M12 20.5V9M7.5 13L12 8.5 16.5 13"/><path d="M4 3.5h16"/>',
    copy: '<rect x="8.5" y="8.5" width="11.5" height="11.5"/><path d="M15.5 5.5V4H4v11.5h1.6"/>',
    grid: '<rect x="3.5" y="3.5" width="7.5" height="7.5"/><rect x="13" y="3.5" width="7.5" height="7.5"/><rect x="3.5" y="13" width="7.5" height="7.5"/><rect x="13" y="13" width="7.5" height="7.5"/>',
    list: '<path d="M8.5 6H20M8.5 12H20M8.5 18H20M4 6h.01M4 12h.01M4 18h.01"/>',
    board: '<rect x="3.5" y="4" width="5" height="16"/><rect x="10" y="4" width="5" height="11"/><rect x="16.5" y="4" width="4" height="7.5"/>',
    archive: '<rect x="3.5" y="4" width="17" height="4"/><path d="M5.5 8v12h13V8M10 12h4"/>',
    warn: '<path d="M12 4l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.5h.01"/>',
    filter: '<path d="M3.5 5h17l-6.5 8v6.5l-4 1.5V13z"/>',
    space: '<path d="M12 3l8.5 4.8v8.4L12 21l-8.5-4.8V7.8z"/><path d="M3.5 7.8L12 12.6l8.5-4.8M12 12.6V21"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.2l3.4 2"/>',
    bolt: '<path d="M13.5 3L5 13.5h6L10.5 21 19 10.5h-6z"/>',
    dot: '<circle cx="12" cy="12" r="4"/>',
    article: '<rect x="5" y="3.5" width="14" height="17"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    deck: '<rect x="3" y="4" width="18" height="12"/><path d="M12 16v4.5M8.5 20.5h7"/>',
    report: '<path d="M6 3.5h9l4 4v13H6z"/><path d="M15 3.5v4h4"/><path d="M9 12.5h7M9 16h7"/>',
    video: '<rect x="3" y="6" width="12.5" height="12"/><path d="M15.5 10.5l5.5-3v9l-5.5-3z"/>',
    code: '<path d="M9 7.5L3.5 12 9 16.5M15 7.5L20.5 12 15 16.5"/>',
    plan: '<rect x="3.5" y="4.5" width="17" height="15"/><path d="M3.5 9h17M9 9v10.5"/>',
    other: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v4.5M12 16h.01"/>'
  };

  /**
   * 构建内联 SVG 图标元素。
   * @param {string} name 图标名（见 ICON_PATHS）
   * @param {number=} size 像素尺寸，默认 16
   * @return {!SVGElement}
   */
  function icon(name, size) {
    var s = size || 16;
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(s));
    svg.setAttribute('height', String(s));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'icon');
    svg.innerHTML = ICON_PATHS[name] || ICON_PATHS.dot;
    return svg;
  }

  /* ======================================================================
     04 / 浮层栈（Esc 逐层关闭）
     ====================================================================== */

  /** @type {!Array<function()>} */
  var layerStack = [];

  /** 关闭最顶层浮层。 @return {boolean} 是否关闭了某层 */
  function closeTop() {
    if (!layerStack.length) return false;
    var close = layerStack[layerStack.length - 1];
    close();
    return true;
  }

  /** @return {boolean} 当前是否有浮层打开 */
  function hasLayer() { return layerStack.length > 0; }

  /**
   * 挂载一个浮层。
   * @param {!HTMLElement} node 浮层根节点（自带遮罩）
   * @param {function()=} onClose 关闭回调
   * @return {function()} 关闭函数
   */
  function mountLayer(node, onClose) {
    var host = document.getElementById('overlay-layer');
    host.appendChild(node);
    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      var i = layerStack.indexOf(close);
      if (i >= 0) layerStack.splice(i, 1);
      if (node.parentNode) node.parentNode.removeChild(node);
      if (onClose) onClose();
    }
    layerStack.push(close);
    return close;
  }

  /* ======================================================================
     05 / Toast
     ====================================================================== */

  /**
   * 右下角轻提示。
   * @param {string} message
   * @param {string=} kind 'ok' | 'err' | 'warn' | ''
   * @param {number=} duration 毫秒，默认 2500
   */
  function toast(message, kind, duration) {
    var host = document.getElementById('toast-layer');
    if (!host) return;
    var iconName = kind === 'err' ? 'warn' : (kind === 'ok' ? 'check' : 'dot');
    var node = el('div', { class: 'toast ' + (kind || '') }, [
      icon(iconName, 14),
      el('span', { text: message })
    ]);
    host.appendChild(node);
    setTimeout(function () {
      node.classList.add('out');
      setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 220);
    }, duration || 2500);
  }

  /* ======================================================================
     06 / Modal / Confirm / Drawer
     ====================================================================== */

  /**
   * 通用弹层。
   * @param {{title:string, tag:(string|undefined), size:(string|undefined),
   *          build:function(!HTMLElement, !Object), footer:(function(!Object):*|undefined),
   *          onClose:(function()|undefined)}} cfg
   * @return {!Object} api {close, body, root}
   */
  function modal(cfg) {
    var body = el('div', { class: 'modal-body' });
    var foot = el('div', { class: 'modal-foot' });
    var panel = el('div', { class: 'modal ' + (cfg.size || '') }, [
      el('div', { class: 'modal-head' }, [
        el('div', {}, [
          cfg.tag ? el('div', { class: 'card-tag', text: cfg.tag }) : null,
          el('div', { class: 'modal-title', text: cfg.title || '' })
        ]),
        el('div', { class: 'spacer' }),
        el('button', {
          class: 'btn btn-icon', type: 'button', title: '关闭 (Esc)',
          on: { click: function () { api.close(); } }
        }, icon('close', 16))
      ]),
      body, foot
    ]);
    var root = el('div', {
      class: 'overlay',
      on: {
        mousedown: function (ev) { if (ev.target === root) api.close(); }
      }
    }, panel);

    var close = mountLayer(root, cfg.onClose);
    var api = { close: close, body: body, foot: foot, root: root, panel: panel };

    if (cfg.build) cfg.build(body, api);
    if (cfg.footer) append(foot, cfg.footer(api));
    else foot.style.display = 'none';

    // ⌘Enter / Ctrl+Enter 提交
    root.addEventListener('keydown', function (ev) {
      if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter' && api.submit) {
        ev.preventDefault();
        api.submit();
      }
    });

    var firstInput = body.querySelector('input, textarea, select');
    if (firstInput) setTimeout(function () { firstInput.focus(); }, 30);
    return api;
  }

  /**
   * 确认框。
   * @param {{title:string, message:string, danger:(boolean|undefined), confirmText:(string|undefined)}} cfg
   * @return {!Promise<boolean>}
   */
  function confirmBox(cfg) {
    return new Promise(function (resolve) {
      var decided = false;
      var api = modal({
        title: cfg.title || '确认操作',
        tag: cfg.danger ? '！ / DANGER' : '？ / CONFIRM',
        size: 'sm',
        build: function (body) {
          append(body, el('div', { class: 'muted', style: { lineHeight: '1.75' }, text: cfg.message || '' }));
        },
        footer: function (a) {
          return [
            el('button', { class: 'btn', type: 'button', text: '取消', on: { click: function () { a.close(); } } }),
            el('button', {
              class: 'btn ' + (cfg.danger ? 'btn-danger' : 'btn-primary'),
              type: 'button', text: cfg.confirmText || '确认',
              on: { click: function () { decided = true; a.close(); resolve(true); } }
            })
          ];
        },
        onClose: function () { if (!decided) resolve(false); }
      });
      api.submit = function () { decided = true; api.close(); resolve(true); };
    });
  }

  /**
   * 表单弹层：按字段描述自动生成表单。
   *
   * 字段描述：{key, label, type, span, required, placeholder, options, hint, min, max}
   * type: text | textarea | select | date | number | url | tags | checkbox
   *
   * @param {{title:string, tag:(string|undefined), size:(string|undefined),
   *          fields:!Array<!Object>, values:(!Object|undefined),
   *          submitText:(string|undefined), extra:(function(!HTMLElement,!Object)|undefined),
   *          onSubmit:function(!Object, !Object):*}} cfg
   * @return {!Object} modal api
   */
  function formModal(cfg) {
    var values = Object.assign({}, cfg.values || {});
    var controls = {};

    var api = modal({
      title: cfg.title,
      tag: cfg.tag,
      size: cfg.size,
      build: function (body, a) {
        var grid = el('div', { class: 'form-grid' });
        cfg.fields.forEach(function (f) {
          var span = 'f' + (f.span || 12);
          var control = buildControl(f, values[f.key]);
          controls[f.key] = control;
          var wrap = el('div', { class: 'field ' + span }, [
            el('label', { class: 'field-label', text: f.label + (f.required ? ' *' : '') }),
            control,
            f.hint ? el('div', { class: 'field-hint', text: f.hint }) : null
          ]);
          append(grid, wrap);
        });
        append(body, grid);
        if (cfg.extra) cfg.extra(body, a);
      },
      footer: function (a) {
        return [
          el('span', { class: 'kbd', text: '⌘ + Enter 提交' }),
          el('div', { class: 'spacer' }),
          el('button', { class: 'btn', type: 'button', text: '取消', on: { click: function () { a.close(); } } }),
          el('button', {
            class: 'btn btn-primary', type: 'button', text: cfg.submitText || '保存',
            on: { click: function () { a.submit(); } }
          })
        ];
      }
    });

    /**
     * 生成单个控件。
     * @param {!Object} f 字段描述
     * @param {*} val 初值
     * @return {!HTMLElement}
     */
    function buildControl(f, val) {
      if (f.type === 'textarea') {
        return el('textarea', { class: 'textarea', placeholder: f.placeholder || '', value: val == null ? '' : val });
      }
      if (f.type === 'select') {
        var sel = el('select', { class: 'select' });
        (f.options || []).forEach(function (o) {
          append(sel, el('option', { value: o.value, text: o.label, selected: String(o.value) === String(val) }));
        });
        if (val != null) sel.value = String(val);
        return sel;
      }
      if (f.type === 'checkbox') {
        var wrap = el('label', { class: 'switch' });
        var input = el('input', { type: 'checkbox', checked: !!val });
        append(wrap, [input, el('span', { class: 'switch-track' }), el('span', { class: 'muted', text: f.placeholder || '' })]);
        wrap._input = input;
        return wrap;
      }
      if (f.type === 'tags') {
        var text = Array.isArray(val) ? val.join(', ') : (val || '');
        return el('input', { class: 'input mono', type: 'text', placeholder: f.placeholder || '用逗号分隔', value: text });
      }
      var type = f.type === 'date' ? 'date' : (f.type === 'number' ? 'number' : (f.type === 'url' ? 'url' : 'text'));
      var attrs = { class: 'input' + (f.type === 'date' || f.type === 'number' ? ' mono' : ''), type: type, placeholder: f.placeholder || '', value: val == null ? '' : val };
      if (f.min != null) attrs.min = f.min;
      if (f.max != null) attrs.max = f.max;
      return el('input', attrs);
    }

    /** 读取当前表单值。 @return {!Object} */
    function readValues() {
      var out = {};
      cfg.fields.forEach(function (f) {
        var c = controls[f.key];
        if (f.type === 'checkbox') { out[f.key] = !!c._input.checked; return; }
        var raw = String(c.value == null ? '' : c.value).trim();
        if (f.type === 'tags') {
          out[f.key] = raw ? raw.split(/[,，\s]+/).filter(Boolean) : [];
        } else if (f.type === 'number') {
          out[f.key] = raw === '' ? null : Number(raw);
        } else {
          out[f.key] = raw;
        }
      });
      return out;
    }

    api.submit = function () {
      var bad = null;
      cfg.fields.forEach(function (f) {
        var c = controls[f.key];
        if (f.type === 'checkbox') return;
        c.classList.remove('invalid');
        if (f.required && !String(c.value || '').trim()) {
          c.classList.add('invalid');
          if (!bad) bad = f;
        }
      });
      if (bad) {
        toast('请填写「' + bad.label + '」', 'err');
        controls[bad.key].focus();
        return;
      }
      var result = cfg.onSubmit(readValues(), api);
      if (result !== false) api.close();
    };

    return api;
  }

  /**
   * 右侧滑出抽屉。
   * @param {{title:string, tag:(string|undefined), subtitle:(string|undefined),
   *          build:function(!HTMLElement, !Object), footer:(function(!Object):*|undefined)}} cfg
   * @return {!Object} api {close, refresh, body}
   */
  function drawer(cfg) {
    var body = el('div', { class: 'drawer-body' });
    var foot = el('div', { class: 'drawer-foot' });
    var titleEl = el('div', { class: 'modal-title', text: cfg.title || '' });
    var subEl = el('div', { class: 'muted', style: { fontSize: '12px' }, text: cfg.subtitle || '' });

    var panel = el('aside', { class: 'drawer' }, [
      el('div', { class: 'drawer-head' }, [
        el('div', { class: 'row between' }, [
          el('div', { class: 'card-tag', text: cfg.tag || '— / DETAIL' }),
          el('button', {
            class: 'btn btn-icon', type: 'button', title: '关闭 (Esc)',
            on: { click: function () { api.close(); } }
          }, icon('close', 16))
        ]),
        titleEl, subEl
      ]),
      body, foot
    ]);

    var root = el('div', {
      class: 'drawer-wrap',
      on: { mousedown: function (ev) { if (ev.target === root) api.close(); } }
    }, panel);

    var close = mountLayer(root, cfg.onClose);
    var api = {
      close: close,
      body: body,
      foot: foot,
      /** 重新构建抽屉内容。 */
      refresh: function () {
        clear(body); clear(foot);
        cfg.build(body, api);
        if (cfg.footer) append(foot, cfg.footer(api));
        else foot.style.display = 'none';
      },
      /** 更新标题区。 */
      setTitle: function (title, subtitle) {
        titleEl.textContent = title || '';
        subEl.textContent = subtitle || '';
      }
    };
    api.refresh();
    return api;
  }

  /* ======================================================================
     07 / 动画助手
     ====================================================================== */

  /** @return {boolean} 用户是否要求减少动效 */
  function reducedMotion() {
    return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * 为容器下的直接子元素添加错峰淡入。
   * @param {!Element} container
   * @param {number=} step 每级延迟毫秒，默认 40
   */
  function stagger(container, step) {
    var s = step == null ? 40 : step;
    var kids = container.querySelectorAll('[data-stagger]');
    for (var i = 0; i < kids.length; i++) {
      kids[i].classList.add('anim-in');
      kids[i].style.setProperty('--d', (i * s) + 'ms');
    }
  }

  /**
   * 数字滚动计数动画。
   * @param {!Element} node 目标元素
   * @param {number} target 目标值
   * @param {number=} duration 毫秒，默认 300
   */
  function countUp(node, target, duration) {
    var end = Number(target) || 0;
    if (reducedMotion() || end === 0) { node.textContent = String(end); return; }
    var dur = duration || 300;
    var start = performance.now();
    function tick(now) {
      var p = clamp((now - start) / dur, 0, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      node.textContent = String(Math.round(end * eased));
      if (p < 1) requestAnimationFrame(tick);
      else node.textContent = String(end);
    }
    node.textContent = '0';
    requestAnimationFrame(tick);
  }

  /* ======================================================================
     08 / 组合组件（跨视图复用）
     ====================================================================== */

  /**
   * 刻度尺进度条。
   * @param {number} percent 0-100
   * @param {string=} tone 'accent'|'moss'|'ochre'|'indigo'
   * @return {!HTMLElement}
   */
  function ruler(percent, tone) {
    var p = clamp(Math.round(Number(percent) || 0), 0, 100);
    var fill = el('i', { class: 'ruler-fill ' + (tone && tone !== 'accent' ? tone : ''), style: { width: p + '%' } });
    return el('div', { class: 'ruler', title: p + '%' }, fill);
  }

  /**
   * 卡片外壳。
   * @param {{tag:string, title:string, span:(number|undefined),
   *          actions:(*|undefined), flush:(boolean|undefined)}} cfg
   * @return {!HTMLElement} 带 .bodyEl 引用
   */
  function card(cfg) {
    var bodyEl = el('div', { class: 'card-body' + (cfg.flush ? ' flush' : '') });
    var head = el('div', { class: 'card-head' }, [
      el('span', { class: 'card-tag', text: cfg.tag || '' }),
      el('span', { class: 'card-title', text: cfg.title || '' }),
      cfg.actions ? el('div', { class: 'card-actions' }, cfg.actions) : null
    ]);
    var node = el('section', {
      class: 'card' + (cfg.span ? ' c' + cfg.span : ''),
      dataset: { stagger: '1' }
    }, [head, bodyEl]);
    node.bodyEl = bodyEl;
    node.headEl = head;
    return node;
  }

  /**
   * 空状态。
   * @param {{title:string, text:string, actionText:(string|undefined), onAction:(function()|undefined)}} cfg
   * @return {!HTMLElement}
   */
  function empty(cfg) {
    return el('div', { class: 'empty' }, [
      el('div', { class: 'empty-mark', text: '— — — —' }),
      el('div', { class: 'empty-title', text: cfg.title || '这里还是空的' }),
      el('div', { class: 'empty-text', text: cfg.text || '' }),
      cfg.actionText ? el('button', {
        class: 'btn btn-primary', type: 'button', style: { marginTop: '4px' },
        on: { click: cfg.onAction || function () {} }
      }, [icon('plus', 14), el('span', { text: cfg.actionText })]) : null
    ]);
  }

  /**
   * 触发浏览器下载。
   * @param {string} filename
   * @param {string} content
   * @param {string=} mime
   */
  function download(filename, content, mime) {
    var blob = new Blob([content], { type: (mime || 'application/octet-stream') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 400);
  }

  /**
   * 复制文本到剪贴板（带 execCommand 兜底，兼容 file:// 场景）。
   * @param {string} text
   * @return {!Promise<boolean>}
   */
  function copyText(text) {
    if (global.navigator && global.navigator.clipboard && global.isSecureContext) {
      return global.navigator.clipboard.writeText(text).then(function () { return true; })
        .catch(function () { return fallbackCopy(text); });
    }
    return Promise.resolve(fallbackCopy(text));
  }

  /**
   * execCommand 兜底复制。
   * @param {string} text
   * @return {boolean}
   */
  function fallbackCopy(text) {
    var ta = el('textarea', { value: text, style: { position: 'fixed', top: '-1000px', opacity: '0' } });
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  /* ======================================================================
     09 / PARTS —— 跨视图复用的渲染片段
     运行期依赖 WB.Store（调用时已加载），不在模块初始化时访问。
     ====================================================================== */

  var Parts = {
    /**
     * 优先级徽标。
     * @param {string} priority 'P0'|'P1'|'P2'
     * @return {!HTMLElement}
     */
    priority: function (priority) {
      return el('span', { class: 'badge p-' + (priority || 'P2'), text: priority || 'P2' });
    },

    /**
     * 状态点 + 文字。
     * @param {string} group 'projectStatus' | 'taskStatus'
     * @param {string} value
     * @return {!HTMLElement}
     */
    status: function (group, value) {
      return el('span', { class: 'status s-' + value, text: WB.Store.labelOf(group, value) });
    },

    /**
     * 空间小标（色块 + code）。
     * @param {?string} spaceId
     * @return {?HTMLElement}
     */
    space: function (spaceId) {
      var sp = WB.Store.spaces.get(spaceId);
      if (!sp) return null;
      return el('span', { class: 'badge', title: sp.name }, [
        el('i', { class: 'space-dot', style: { background: sp.color } }),
        el('span', { text: sp.code })
      ]);
    },

    /**
     * 项目小标。
     * @param {?string} projectId
     * @return {?HTMLElement}
     */
    project: function (projectId) {
      var p = WB.Store.projects.get(projectId);
      if (!p) return null;
      var short = p.name.length > 16 ? p.name.slice(0, 15) + '…' : p.name;
      return el('span', { class: 'badge', title: p.name, style: { color: 'var(--indigo)' }, text: short });
    },

    /**
     * 截止日期标签（今天 / 逾期 / 临近 有不同配色）。
     * @param {?string} iso
     * @param {string=} status 任务状态，done 时弱化
     * @return {?HTMLElement}
     */
    due: function (iso, status) {
      if (!iso) return null;
      var cls = 'due';
      if (status !== 'done') {
        if (isPast(iso)) cls += ' overdue';
        else if (isToday(iso)) cls += ' today';
        else if (diffDays(todayISO(), iso) <= 2) cls += ' soon';
      }
      return el('span', { class: cls, text: fmtDue(iso) });
    },

    /**
     * 标签列表。
     * @param {!Array<string>} tags
     * @param {number=} max 最多显示数量
     * @return {!Array<!HTMLElement>}
     */
    tags: function (tags, max) {
      var list = (tags || []).slice(0, max || 4);
      return list.map(function (t) { return el('span', { class: 'tag', text: '#' + t }); });
    },

    /**
     * 产出物类型图标块。
     * @param {string} type
     * @return {!HTMLElement}
     */
    outputType: function (type) {
      return el('div', { class: 'out-type', title: WB.Store.labelOf('outputType', type) }, icon(type, 15));
    },

    /**
     * 任务行（仪表盘与任务列表共用）。
     * @param {!Object} task
     * @param {{showProject:(boolean|undefined), onEdit:(function(!Object)|undefined),
     *          onDelete:(function(!Object)|undefined), compact:(boolean|undefined)}=} opts
     * @return {!HTMLElement}
     */
    taskRow: function (task, opts) {
      var o = opts || {};
      var done = task.status === 'done';

      var check = el('button', {
        class: 'task-check' + (done ? ' on' : ''),
        type: 'button',
        title: done ? '标记为未完成' : '标记为完成',
        'aria-label': done ? '标记为未完成' : '标记为完成'
      }, icon('check', 11));

      var row = el('div', { class: 'task' + (done ? ' done' : '') });

      check.addEventListener('click', function () {
        // 先播放视觉反馈，再落库（落库会触发视图重绘）
        if (!done) {
          check.classList.add('on');
          row.classList.add('done');
          setTimeout(function () { WB.Store.tasks.toggle(task.id); }, 240);
        } else {
          WB.Store.tasks.toggle(task.id);
        }
      });

      var meta = el('div', { class: 'task-meta' }, [
        Parts.priority(task.priority),
        o.showProject === false ? null : Parts.space(task.spaceId),
        o.showProject === false ? null : Parts.project(task.projectId),
        Parts.due(task.due, task.status),
        task.estimateMin ? el('span', { class: 'due', text: '≈' + task.estimateMin + 'min' }) : null,
        Parts.tags(task.tags, 3)
      ]);

      var ops = el('div', { class: 'task-ops' }, [
        o.onEdit ? el('button', {
          class: 'btn btn-icon', type: 'button', title: '编辑',
          on: { click: function () { o.onEdit(task); } }
        }, icon('edit', 14)) : null,
        o.onDelete ? el('button', {
          class: 'btn btn-icon', type: 'button', title: '删除',
          on: { click: function () { o.onDelete(task); } }
        }, icon('trash', 14)) : null
      ]);

      append(row, [
        check,
        el('div', { class: 'task-main' }, [
          el('div', { class: 'task-title', text: task.title }),
          task.note && !o.compact ? el('div', { class: 'task-note', text: task.note }) : null,
          meta
        ]),
        ops
      ]);
      return row;
    }
  };

  WB.Parts = Parts;

  WB.UI = {
    el: el, append: append, clear: clear, icon: icon,
    toast: toast, modal: modal, confirm: confirmBox, formModal: formModal, drawer: drawer,
    mountLayer: mountLayer, closeTop: closeTop, hasLayer: hasLayer,
    stagger: stagger, countUp: countUp, reducedMotion: reducedMotion,
    ruler: ruler, card: card, empty: empty,
    download: download, copyText: copyText
  };

})(window);
