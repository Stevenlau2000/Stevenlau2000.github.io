/**
 * connectors.js —— 数据源抽象层（DataSource）
 *
 * 设计目标：
 *   工作台的所有读写都可以经由「适配器」完成。当前生效的是 LocalAdapter（localStorage）；
 *   LarkAdapter（飞书）与 LexiangAdapter（乐享知识库）为预留桩，
 *   将来只需替换其方法实现即可接通真实后端，视图层与 store 层无需改动。
 *
 * 契约（所有适配器必须实现，全部返回 Promise，不抛异常）：
 *   name                                  -> string           适配器显示名
 *   listTasks(filter)                     -> Promise<Task[]>
 *   upsertTask(task)                      -> Promise<Task>
 *   listOutputs(filter)                   -> Promise<Output[]>
 *   pushOutput(output)                    -> Promise<Output>
 *   testConnection()                      -> Promise<{ok:boolean, message:string}>
 *
 * 依赖：ui.js（WB.Util）、store.js（WB.Store）
 */
(function (global) {
  'use strict';

  var WB = global.WB = global.WB || {};

  /**
   * 统一的「未接通」返回体。
   * @param {string} who 连接器中文名
   * @return {!Promise<{ok:boolean, message:string}>}
   */
  function notWired(who) {
    return Promise.resolve({ ok: false, message: who + '连接器接口已预留，尚未接通' });
  }

  /* ======================================================================
     01 / LocalAdapter —— 当前生效实现
     ====================================================================== */

  /**
   * 本地适配器：直接代理 WB.Store，数据落在 localStorage。
   * @const
   */
  var LocalAdapter = {
    id: 'local',
    name: '本地存储',
    description: '数据保存在浏览器 localStorage，双击 index.html 即可离线使用。',

    /**
     * @param {!Object=} filter 见 WB.Store.tasks.list
     * @return {!Promise<!Array<!Object>>}
     */
    listTasks: function (filter) {
      return Promise.resolve(WB.Store.tasks.list(filter || {}));
    },

    /**
     * 新建或更新任务。
     * @param {!Object} task 含 id 则更新，否则新建
     * @return {!Promise<!Object>}
     */
    upsertTask: function (task) {
      if (task && task.id && WB.Store.tasks.get(task.id)) {
        return Promise.resolve(WB.Store.tasks.update(task.id, task));
      }
      return Promise.resolve(WB.Store.tasks.create(task || {}));
    },

    /**
     * @param {!Object=} filter 见 WB.Store.outputs.list
     * @return {!Promise<!Array<!Object>>}
     */
    listOutputs: function (filter) {
      return Promise.resolve(WB.Store.outputs.list(filter || {}));
    },

    /**
     * @param {!Object} output
     * @return {!Promise<!Object>}
     */
    pushOutput: function (output) {
      if (output && output.id && WB.Store.outputs.get(output.id)) {
        return Promise.resolve(WB.Store.outputs.update(output.id, output));
      }
      return Promise.resolve(WB.Store.outputs.create(output || {}));
    },

    /** @return {!Promise<{ok:boolean, message:string}>} */
    testConnection: function () {
      var bytes = WB.Store.stats.storageBytes();
      return Promise.resolve({
        ok: true,
        message: '本地存储可用，当前占用 ' + WB.Util.fmtBytes(bytes)
      });
    }
  };

  /* ======================================================================
     02 / LarkAdapter —— 飞书（预留桩）
     ====================================================================== */

  /**
   * 飞书适配器（桩）。
   *
   * 【将来的接通方式】
   *   走 lark-cli 的 task / base 能力，或直接调用飞书开放平台 OpenAPI：
   *     - 鉴权：POST https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal
   *             body: { app_id, app_secret }  ->  tenant_access_token（2h 有效，需缓存）
   *     - 任务列表：GET  /open-apis/task/v2/tasks?tasklist_guid={taskListId}&page_size=50
   *     - 建/改任务：POST /open-apis/task/v2/tasks   PATCH /open-apis/task/v2/tasks/{task_guid}
   *     - 多维表格（产出物库）：POST /open-apis/bitable/v1/apps/{baseAppToken}/tables/{tableId}/records
   *
   * 【字段映射表】飞书任务 ↔ 本地 Task
   *   飞书 summary            ↔  task.title
   *   飞书 description        ↔  task.note
   *   飞书 due.timestamp(ms)  ↔  task.due（'YYYY-MM-DD'，需按本地时区换算）
   *   飞书 completed_at       ↔  task.completedAt（0 表示未完成）
   *   飞书 custom_fields[优先级] ↔ task.priority（P0/P1/P2）
   *   飞书 tasklist_guid      ↔  task.spaceId（一个空间对应一个清单）
   *   飞书 extra(JSON)        ↔  { projectId, tags, estimateMin }
   *
   * 【注意】桩方法一律 resolve，绝不 reject，避免污染调用方的错误处理。
   * @const
   */
  var LarkAdapter = {
    id: 'lark',
    name: '飞书',
    description: '将任务同步为飞书任务清单，产出物写入多维表格。',
    docs: '通过 lark-cli 的 task / base 能力对接；需要 App ID、App Secret、任务清单 GUID。',

    /**
     * TODO(接通): GET /open-apis/task/v2/tasks，按 tasklist_guid 拉取并映射为本地 Task。
     * @param {!Object=} filter
     * @return {!Promise<!Array<!Object>>}
     */
    listTasks: function (filter) {
      void filter;
      return Promise.resolve([]);
    },

    /**
     * TODO(接通): 有 lark task_guid 走 PATCH，无则 POST 创建，成功后把 task_guid 回写到本地 task.extRef。
     * @param {!Object} task
     * @return {!Promise<!Object>}
     */
    upsertTask: function (task) {
      return Promise.resolve(task);
    },

    /**
     * TODO(接通): 读取多维表格 records 并映射为 Output（title/type/link/date/tags）。
     * @param {!Object=} filter
     * @return {!Promise<!Array<!Object>>}
     */
    listOutputs: function (filter) {
      void filter;
      return Promise.resolve([]);
    },

    /**
     * TODO(接通): POST bitable records，字段映射：
     *   标题→title、类型→type、链接→link(url 类型)、日期→date、标签→tags(多选)、备注→note。
     * @param {!Object} output
     * @return {!Promise<!Object>}
     */
    pushOutput: function (output) {
      return Promise.resolve(output);
    },

    /**
     * TODO(接通): 用 app_id/app_secret 换 tenant_access_token 验证连通性。
     * @return {!Promise<{ok:boolean, message:string}>}
     */
    testConnection: function () {
      return notWired('飞书');
    }
  };

  /* ======================================================================
     03 / LexiangAdapter —— 乐享知识库（预留桩）
     ====================================================================== */

  /**
   * 乐享知识库适配器（桩）。
   *
   * 【将来的接通方式】
   *   通过乐享知识库 MCP 工具集：
   *     - 搜索：search_kb_search / search_kb_embedding_search
   *             入参 { teamId, spaceId, query, size } -> 返回 entry 列表
   *     - 建条目：entry_create_entry
   *             入参 { teamId, spaceId, parentId, title, type } -> 返回 entryId
   *     - 写正文：block_convert_content_to_blocks + block_create_block_descendant
   *             或 draft_save_markdown_draft -> draft_publish_markdown_draft（推荐，直接投 Markdown）
   *     - 读正文：block_fetch_page / lexiang_fetch
   *
   * 【字段映射表】乐享 Entry ↔ 本地 Output
   *   entry.title      ↔ output.title
   *   entry.type       ↔ output.type（article→文档 / deck→附件 / video→超链接）
   *   entry.url        ↔ output.link（外链型产出用 file_create_hyperlink 建超链接条目）
   *   entry.createTime ↔ output.date
   *   知识标签         ↔ output.tags（knowledge_tag_set_entry_tags）
   *   正文首段         ↔ output.note
   *
   * @const
   */
  var LexiangAdapter = {
    id: 'lexiang',
    name: '乐享知识库',
    description: '把产出物同步为知识库条目，支持全文与语义检索。',
    docs: '通过乐享知识库 MCP 的 entry_create_entry / search_kb_search 对接；需要 Team ID 与 Space ID。',

    /**
     * 乐享侧不承载任务，返回空数组即可。
     * @param {!Object=} filter
     * @return {!Promise<!Array<!Object>>}
     */
    listTasks: function (filter) {
      void filter;
      return Promise.resolve([]);
    },

    /**
     * 乐享侧不承载任务，原样返回。
     * @param {!Object} task
     * @return {!Promise<!Object>}
     */
    upsertTask: function (task) {
      return Promise.resolve(task);
    },

    /**
     * TODO(接通): search_kb_search({ teamId, spaceId, query }) -> 映射为 Output[]。
     * @param {!Object=} filter
     * @return {!Promise<!Array<!Object>>}
     */
    listOutputs: function (filter) {
      void filter;
      return Promise.resolve([]);
    },

    /**
     * TODO(接通): entry_create_entry 建条目 -> draft_save_markdown_draft 写正文 -> draft_publish_markdown_draft 发布。
     * @param {!Object} output
     * @return {!Promise<!Object>}
     */
    pushOutput: function (output) {
      return Promise.resolve(output);
    },

    /**
     * TODO(接通): 调 whoami / team_list_teams 验证 token 与 teamId 是否可用。
     * @return {!Promise<{ok:boolean, message:string}>}
     */
    testConnection: function () {
      return notWired('乐享');
    }
  };

  /* ======================================================================
     04 / 注册表与门面
     ====================================================================== */

  WB.Connectors = {
    /** @const {!Object<string, !Object>} 适配器注册表 */
    registry: {
      local: LocalAdapter,
      lark: LarkAdapter,
      lexiang: LexiangAdapter
    },

    /** @type {string} 当前生效适配器（写操作始终经由 local 落盘） */
    active: 'local',

    /** @type {!Object<string, boolean>} 各远端连接器的「启用意图」（接通前仅作记录） */
    enabled: { lark: false, lexiang: false },

    /**
     * 启动时依据设置初始化。
     * 说明：Lark / Lexiang 目前是桩实现，即便在设置里打开开关也不会成为写入通道，
     *      本地 localStorage 始终是唯一真实来源；待接口接通后再把 active 切过去。
     * @return {string} 当前生效适配器 id
     */
    init: function () {
      var conf = (WB.Store && WB.Store.settings) ? WB.Store.settings.get().connectors : null;
      if (conf) {
        this.enabled = {
          lark: !!(conf.lark && conf.lark.enabled),
          lexiang: !!(conf.lexiang && conf.lexiang.enabled)
        };
      }
      this.active = 'local';
      return this.active;
    },

    /**
     * 取适配器实例。
     * @param {string=} id 缺省取 active
     * @return {!Object}
     */
    get: function (id) {
      return this.registry[id || this.active] || LocalAdapter;
    },

    /**
     * 切换当前适配器。
     * @param {string} id
     * @return {boolean}
     */
    setActive: function (id) {
      if (!this.registry[id]) return false;
      this.active = id;
      return true;
    },

    /**
     * 测试某个连接器。
     * @param {string} id
     * @return {!Promise<{ok:boolean, message:string}>}
     */
    test: function (id) {
      var adapter = this.registry[id];
      if (!adapter) return Promise.resolve({ ok: false, message: '未知连接器：' + id });
      try {
        return adapter.testConnection();
      } catch (e) {
        return Promise.resolve({ ok: false, message: '调用异常：' + e.message });
      }
    },

    /**
     * 便捷读写门面：始终经由当前适配器，失败时回落到本地。
     * @param {!Object=} filter
     * @return {!Promise<!Array<!Object>>}
     */
    listTasks: function (filter) {
      return this.get().listTasks(filter).catch(function () { return LocalAdapter.listTasks(filter); });
    },

    /**
     * @param {!Object} task
     * @return {!Promise<!Object>}
     */
    upsertTask: function (task) {
      // 本地永远是唯一真实来源；远端为镜像同步（接通后在此追加双写逻辑）。
      return LocalAdapter.upsertTask(task);
    },

    /**
     * @param {!Object=} filter
     * @return {!Promise<!Array<!Object>>}
     */
    listOutputs: function (filter) {
      return this.get().listOutputs(filter).catch(function () { return LocalAdapter.listOutputs(filter); });
    },

    /**
     * @param {!Object} output
     * @return {!Promise<!Object>}
     */
    pushOutput: function (output) {
      return LocalAdapter.pushOutput(output);
    }
  };

})(window);
