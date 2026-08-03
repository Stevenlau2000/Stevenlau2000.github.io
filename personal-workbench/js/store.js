/**
 * store.js —— 状态中心
 *
 * 职责：
 *   1. 定义数据 schema 与枚举
 *   2. localStorage 读写（key: wb.workbench.v1）
 *   3. 空间 / 项目 / 任务 / 产出物 / 快捷入口 / 日志 / 设置 的 CRUD
 *   4. 派生统计（仪表盘指标、空间概览、热力图数据）
 *   5. 导出 / 导入 / 重置 / 清空
 *   6. 首次启动的种子数据
 *
 * 依赖：ui.js（WB.Util）
 */
(function (global) {
  'use strict';

  var WB = global.WB = global.WB || {};
  var U = WB.Util;

  /** @const {string} */
  var STORAGE_KEY = 'wb.workbench.v1';
  /** @const {number} */
  var SCHEMA_VERSION = 1;

  /* ======================================================================
     01 / 枚举
     ====================================================================== */

  var ENUMS = {
    projectStatus: [
      { value: 'planning', label: '规划中' },
      { value: 'active', label: '进行中' },
      { value: 'blocked', label: '阻塞' },
      { value: 'done', label: '已完成' },
      { value: 'archived', label: '已归档' }
    ],
    taskStatus: [
      { value: 'todo', label: '待办' },
      { value: 'doing', label: '进行中' },
      { value: 'done', label: '已完成' }
    ],
    priority: [
      { value: 'P0', label: 'P0 紧急' },
      { value: 'P1', label: 'P1 重要' },
      { value: 'P2', label: 'P2 常规' }
    ],
    outputType: [
      { value: 'article', label: '文章' },
      { value: 'deck', label: 'PPT' },
      { value: 'report', label: '报告' },
      { value: 'video', label: '视频' },
      { value: 'code', label: '代码' },
      { value: 'plan', label: '方案' },
      { value: 'other', label: '其他' }
    ]
  };

  /**
   * 枚举值 -> 中文标签。
   * @param {string} group ENUMS 的键
   * @param {string} value
   * @return {string}
   */
  function labelOf(group, value) {
    var list = ENUMS[group] || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].value === value) return list[i].label;
    }
    return value || '';
  }

  /* ======================================================================
     02 / 种子数据
     ====================================================================== */

  /**
   * 确定性伪随机数发生器（保证每次生成的种子数据一致）。
   * @param {number} seed
   * @return {function():number} 返回 [0,1)
   */
  function makeRandom(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /**
   * 构造首次启动的种子数据 —— 贴合「资深空调营销 + AI 咨询 + 自媒体 + 投资 + 技能资产」五线并行的真实场景。
   * @return {!Object}
   */
  function buildSeed() {
    var T = U.todayISO();
    /** @param {number} n @return {string} */
    var D = function (n) { return U.addDays(T, n); };

    var spaces = [
      { id: 'sp_aic', name: '中央空调营销', code: 'AIC', color: '#C43B22', description: '商用 / 多联式 / 项目型销售与产品推广', createdAt: D(-420), archived: false },
      { id: 'sp_con', name: 'AI 咨询交付', code: 'CON', color: '#1F3A5F', description: 'Mantu · Amaris 企业 AI 转型客户项目', createdAt: D(-300), archived: false },
      { id: 'sp_med', name: '内容与自媒体', code: 'MED', color: '#B07D2B', description: '公众号 / 视频号 / 小红书 全媒体运营', createdAt: D(-262), archived: false },
      { id: 'sp_inv', name: '投资研究', code: 'INV', color: '#4A6B3F', description: '半导体与 AI 算力产业链 · 网格策略', createdAt: D(-205), archived: false },
      { id: 'sp_skl', name: 'AI 技能资产', code: 'SKL', color: '#4A4F57', description: 'WorkBuddy Skill 库 · 数字分身 FDE', createdAt: D(-150), archived: false }
    ];

    var projects = [
      {
        id: 'pj_vrf', spaceId: 'sp_aic', name: '2026 商用多联机新品上市推广方案',
        status: 'active', progress: 0, priority: 'P0', owner: '本人',
        startDate: D(-38), dueDate: D(21),
        tags: ['新品', '多联机', '渠道'],
        notes: '面向 8 个重点城市的商用 VRF 新品，核心卖点是全直流变频 + 低温制热 COP。需要产品手册、销售话术、经销商培训三件套同步交付。',
        milestones: [
          { id: 'ms_vrf1', title: '竞品参数对标表定稿', done: true, due: D(-24) },
          { id: 'ms_vrf2', title: '产品卖点提炼与话术手册', done: true, due: D(-10) },
          { id: 'ms_vrf3', title: '经销商线上培训（第一批）', done: false, due: D(6) },
          { id: 'ms_vrf4', title: '样板工程落地 2 个', done: false, due: D(19) }
        ],
        createdAt: D(-38), updatedAt: D(-2)
      },
      {
        id: 'pj_rebate', spaceId: 'sp_aic', name: '华东区经销商年度返利政策宣贯',
        status: 'planning', progress: 0, priority: 'P1', owner: '本人',
        startDate: D(-6), dueDate: D(34),
        tags: ['渠道', '政策'],
        notes: '新返利梯度对中小经销商影响较大，宣贯材料要把「达标路径」算给他们看，而不是只发文件。',
        milestones: [
          { id: 'ms_rb1', title: '政策测算模型（Excel）', done: false, due: D(9) },
          { id: 'ms_rb2', title: '宣贯 PPT 与答疑手册', done: false, due: D(20) },
          { id: 'ms_rb3', title: '分片区宣贯会 5 场', done: false, due: D(33) }
        ],
        createdAt: D(-6), updatedAt: D(-1)
      },
      {
        id: 'pj_hotel', spaceId: 'sp_aic', name: '万豪酒店群 VRF 项目技术标书',
        status: 'blocked', progress: 0, priority: 'P0', owner: '本人',
        startDate: D(-20), dueDate: D(4),
        tags: ['项目型销售', '标书', '酒店'],
        notes: '阻塞点：甲方暖通图纸第三版迟迟未出，负荷计算无法定稿。已电话催两次，需要走商务渠道推进。',
        milestones: [
          { id: 'ms_ht1', title: '负荷计算与机型选配', done: true, due: D(-12) },
          { id: 'ms_ht2', title: '技术方案主体撰写', done: true, due: D(-5) },
          { id: 'ms_ht3', title: '甲方图纸第三版确认', done: false, due: D(-1) },
          { id: 'ms_ht4', title: '标书封装与递交', done: false, due: D(4) }
        ],
        createdAt: D(-20), updatedAt: D(-3)
      },
      {
        id: 'pj_mfg', spaceId: 'sp_con', name: 'Mantu 制造业客户 AI 转型诊断（一期）',
        status: 'active', progress: 0, priority: 'P0', owner: '本人',
        startDate: D(-27), dueDate: D(12),
        tags: ['Mantu', '诊断', '制造业'],
        notes: '客户是苏州一家汽车零部件厂。一期只做现状盘点与场景漏斗，不承诺落地。交付物：诊断报告 + 场景优先级矩阵。',
        milestones: [
          { id: 'ms_mfg1', title: '高管访谈 6 场', done: true, due: D(-18) },
          { id: 'ms_mfg2', title: '业务流程与数据现状盘点', done: true, due: D(-9) },
          { id: 'ms_mfg3', title: 'AI 场景漏斗与优先级矩阵', done: false, due: D(3) },
          { id: 'ms_mfg4', title: '诊断报告终稿与汇报', done: false, due: D(11) }
        ],
        createdAt: D(-27), updatedAt: T
      },
      {
        id: 'pj_cert', spaceId: 'sp_con', name: 'Amaris 内部 AI 训练师认证课程开发',
        status: 'active', progress: 0, priority: 'P1', owner: '本人',
        startDate: D(-45), dueDate: D(40),
        tags: ['课程', '训练师', '内训'],
        notes: '三级认证体系：Prompt 工程 → Agent 编排 → 业务场景落地。每级 6 课时 + 实操考核。',
        milestones: [
          { id: 'ms_ct1', title: 'L1 课件与考核题库', done: true, due: D(-20) },
          { id: 'ms_ct2', title: 'L2 Agent 编排实操环境', done: false, due: D(10) },
          { id: 'ms_ct3', title: 'L3 场景落地案例集', done: false, due: D(30) },
          { id: 'ms_ct4', title: '首期开班 30 人', done: false, due: D(39) }
        ],
        createdAt: D(-45), updatedAt: D(-4)
      },
      {
        id: 'pj_column', spaceId: 'sp_med', name: '公众号《空调人的 AI 手册》专栏',
        status: 'active', progress: 0, priority: 'P1', owner: '本人',
        startDate: D(-70), dueDate: D(60),
        tags: ['公众号', '专栏', '长期'],
        notes: '每周一更，把 30 年空调行业经验和 AI 工具结合，目标是行业里最实用的一份手册。已更 9 篇。',
        milestones: [
          { id: 'ms_cl1', title: '前 5 篇（工具篇）完成', done: true, due: D(-40) },
          { id: 'ms_cl2', title: '第 6-12 篇（场景篇）', done: false, due: D(20) },
          { id: 'ms_cl3', title: '合集电子书 v1', done: false, due: D(58) }
        ],
        createdAt: D(-70), updatedAt: D(-2)
      },
      {
        id: 'pj_video', spaceId: 'sp_med', name: '视频号「WorkBuddy 工作台」系列',
        status: 'active', progress: 0, priority: 'P0', owner: '本人',
        startDate: D(-16), dueDate: D(14),
        tags: ['视频号', 'WorkBuddy', '教程'],
        notes: '5 集短视频：从零搭个人 AI 工作台。第 1 集数据表现不错（完播 38%），第 2 集要把节奏再压紧。',
        milestones: [
          { id: 'ms_vd1', title: '5 集脚本大纲', done: true, due: D(-11) },
          { id: 'ms_vd2', title: 'EP01 上线', done: true, due: D(-4) },
          { id: 'ms_vd3', title: 'EP02-03 拍摄剪辑', done: false, due: D(5) },
          { id: 'ms_vd4', title: 'EP04-05 上线 + 合集页', done: false, due: D(13) }
        ],
        createdAt: D(-16), updatedAt: D(-1)
      },
      {
        id: 'pj_chip', spaceId: 'sp_inv', name: 'AI 算力产业链跟踪（半导体设备）',
        status: 'active', progress: 0, priority: 'P2', owner: '本人',
        startDate: D(-120), dueDate: D(75),
        tags: ['半导体', '算力', '跟踪'],
        notes: '重点跟踪先进封装设备与 HBM 产能。每月一份跟踪纪要，季度更新一次估值表。',
        milestones: [
          { id: 'ms_ch1', title: '产业链图谱 v2', done: true, due: D(-60) },
          { id: 'ms_ch2', title: 'Q 报季纪要（本季）', done: false, due: D(16) },
          { id: 'ms_ch3', title: '估值表季度更新', done: false, due: D(45) }
        ],
        createdAt: D(-120), updatedAt: D(-8)
      },
      {
        id: 'pj_grid', spaceId: 'sp_inv', name: '网格策略回测与参数优化',
        status: 'planning', progress: 0, priority: 'P2', owner: '本人',
        startDate: D(-3), dueDate: D(50),
        tags: ['量化', '网格', '回测'],
        notes: '先把 2019-2025 的宽基与行业 ETF 数据跑一遍，验证网格宽度与仓位分配的敏感性。',
        milestones: [
          { id: 'ms_gr1', title: '数据源与回测框架搭建', done: false, due: D(12) },
          { id: 'ms_gr2', title: '参数敏感性分析报告', done: false, due: D(32) },
          { id: 'ms_gr3', title: '小仓位实盘验证', done: false, due: D(49) }
        ],
        createdAt: D(-3), updatedAt: D(-3)
      },
      {
        id: 'pj_skill', spaceId: 'sp_skl', name: 'WorkBuddy Skill 资产库 v2',
        status: 'active', progress: 0, priority: 'P1', owner: '本人',
        startDate: D(-52), dueDate: D(26),
        tags: ['Skill', 'WorkBuddy', '资产化'],
        notes: '把散落的提示词与流程沉淀成可复用 Skill：空调选型、标书生成、客户诊断、内容工厂四条主线。',
        milestones: [
          { id: 'ms_sk1', title: 'Skill 规范与目录结构', done: true, due: D(-38) },
          { id: 'ms_sk2', title: '空调选型 Skill 上线', done: true, due: D(-16) },
          { id: 'ms_sk3', title: '标书生成 Skill 上线', done: false, due: D(8) },
          { id: 'ms_sk4', title: '内容工厂 Skill 上线', done: false, due: D(24) }
        ],
        createdAt: D(-52), updatedAt: D(-1)
      },
      {
        id: 'pj_fde', spaceId: 'sp_skl', name: '数字分身 FDE 交付流程 SOP',
        status: 'done', progress: 100, priority: 'P1', owner: '本人',
        startDate: D(-96), dueDate: D(-14),
        tags: ['FDE', 'SOP', '数字分身'],
        notes: '已完成并在两个客户处跑通。后续按季度回顾修订。',
        milestones: [
          { id: 'ms_fd1', title: '需求澄清与画像模板', done: true, due: D(-80) },
          { id: 'ms_fd2', title: '语料采集与训练清单', done: true, due: D(-52) },
          { id: 'ms_fd3', title: '验收标准与交付清单', done: true, due: D(-20) }
        ],
        createdAt: D(-96), updatedAt: D(-14)
      }
    ];

    // 依据里程碑自动初始化 progress
    projects.forEach(function (p) {
      if (p.status === 'done') { p.progress = 100; return; }
      p.progress = computeProgress(p.milestones);
    });

    var order = 0;
    /**
     * 任务构造助手（仅用于种子数据，自动打 _seed / _seedOffset 标记）。
     * _seedOffset = 该任务相对「种子生成当天」的 due 偏移天数（今天=0、明天=1、逾期昨天=-1）。
     * 用户自建任务走 collection('tasks').create()，不会经过本工厂，因此不会带上这两个字段。
     * @param {!Object} cfg
     * @return {!Object}
     */
    function task(cfg) {
      order += 1;
      // 用 due 反推 _seedOffset：种子生成当天 T 为基准，offset = diffDays(T, due)
      var seedOffset = cfg.due ? U.diffDays(T, cfg.due) : 0;
      return {
        id: cfg.id,
        projectId: cfg.projectId || null,
        spaceId: cfg.spaceId || null,
        title: cfg.title,
        note: cfg.note || '',
        status: cfg.status || 'todo',
        priority: cfg.priority || 'P1',
        due: cfg.due || null,
        _seed: true,                 // 标识种子任务，dailyRefresh 滚动时只认这个
        _seedOffset: seedOffset,     // 原始偏移，滚动时直接用它重算 due，不累加 deltaDays
        estimateMin: cfg.estimateMin == null ? null : cfg.estimateMin,
        tags: cfg.tags || [],
        createdAt: cfg.createdAt || D(-5),
        completedAt: cfg.completedAt || null,
        order: order
      };
    }

    var tasks = [
      // —— 今日到期 ——
      task({ id: 'tk_01', projectId: 'pj_mfg', spaceId: 'sp_con', title: '整理苏州客户 6 场访谈纪要，提炼 12 个候选场景', priority: 'P0', due: T, status: 'doing', estimateMin: 120, tags: ['访谈', '诊断'], createdAt: D(-4) }),
      task({ id: 'tk_02', projectId: 'pj_vrf', spaceId: 'sp_aic', title: '经销商培训课件第 3 版：补充低温制热实测数据', priority: 'P0', due: T, estimateMin: 90, tags: ['培训'], createdAt: D(-3) }),
      task({ id: 'tk_03', projectId: 'pj_video', spaceId: 'sp_med', title: 'EP02 脚本终稿：把开头 5 秒钩子改成「打开就能看的作战室」', priority: 'P1', due: T, estimateMin: 45, tags: ['脚本'], createdAt: D(-2) }),
      task({ id: 'tk_04', projectId: null, spaceId: 'sp_skl', title: '把今天新写的两个提示词归档进 Skill 库', priority: 'P2', due: T, estimateMin: 20, tags: ['归档'], createdAt: D(-1) }),
      task({ id: 'tk_05', projectId: 'pj_column', spaceId: 'sp_med', title: '公众号第 10 篇选题定稿：《选型这件事，AI 能替你做到哪一步》', priority: 'P1', due: T, estimateMin: 30, tags: ['选题'], createdAt: D(-1) }),

      // —— 逾期 ——
      task({ id: 'tk_06', projectId: 'pj_hotel', spaceId: 'sp_aic', title: '催甲方暖通图纸第三版（走商务口）', priority: 'P0', due: D(-2), estimateMin: 15, tags: ['阻塞', '催办'], createdAt: D(-8) }),
      task({ id: 'tk_07', projectId: 'pj_chip', spaceId: 'sp_inv', title: '更新先进封装设备订单跟踪表（8 家）', priority: 'P2', due: D(-4), estimateMin: 60, tags: ['数据'], createdAt: D(-12) }),
      task({ id: 'tk_08', projectId: 'pj_rebate', spaceId: 'sp_aic', title: '找财务要 2025 年各片区实际返利兑付明细', priority: 'P1', due: D(-1), estimateMin: 20, tags: ['协作'], createdAt: D(-5) }),

      // —— 本周 ——
      task({ id: 'tk_09', projectId: 'pj_mfg', spaceId: 'sp_con', title: '搭 AI 场景优先级矩阵（价值 × 可行性 × 数据就绪度）', priority: 'P0', due: D(2), estimateMin: 150, tags: ['方法论'], createdAt: D(-3) }),
      task({ id: 'tk_10', projectId: 'pj_vrf', spaceId: 'sp_aic', title: '约 3 家核心经销商做课件预演，收集反馈', priority: 'P1', due: D(3), estimateMin: 90, tags: ['渠道'], createdAt: D(-2) }),
      task({ id: 'tk_11', projectId: 'pj_video', spaceId: 'sp_med', title: 'EP02 拍摄（屏录 + 口播），预留 2 小时', priority: 'P1', due: D(3), estimateMin: 120, tags: ['拍摄'], createdAt: D(-2) }),
      task({ id: 'tk_12', projectId: 'pj_skill', spaceId: 'sp_skl', title: '标书生成 Skill：把万豪项目的方案结构抽象成模板', priority: 'P1', due: D(4), estimateMin: 100, tags: ['Skill'], createdAt: D(-6) }),
      task({ id: 'tk_13', projectId: 'pj_hotel', spaceId: 'sp_aic', title: '标书商务部分与技术部分合稿校对', priority: 'P0', due: D(3), estimateMin: 80, tags: ['标书'], createdAt: D(-4) }),
      task({ id: 'tk_14', projectId: 'pj_cert', spaceId: 'sp_con', title: 'L2 课程实操环境：准备 3 个 Agent 编排样例', priority: 'P1', due: D(5), estimateMin: 180, tags: ['课程'], createdAt: D(-7) }),
      task({ id: 'tk_15', projectId: 'pj_column', spaceId: 'sp_med', title: '第 10 篇初稿 2500 字', priority: 'P1', due: D(5), estimateMin: 150, tags: ['写作'], createdAt: D(-1) }),

      // —— 稍远 ——
      task({ id: 'tk_16', projectId: 'pj_grid', spaceId: 'sp_inv', title: '确定回测数据源：先用日线跑通宽基 ETF', priority: 'P2', due: D(8), estimateMin: 120, tags: ['量化'], createdAt: D(-3) }),
      task({ id: 'tk_17', projectId: 'pj_rebate', spaceId: 'sp_aic', title: '返利测算模型：做三档达标路径的敏感性表', priority: 'P1', due: D(9), estimateMin: 180, tags: ['建模'], createdAt: D(-5) }),
      task({ id: 'tk_18', projectId: 'pj_mfg', spaceId: 'sp_con', title: '诊断报告框架搭建（含 executive summary）', priority: 'P0', due: D(7), estimateMin: 120, tags: ['报告'], createdAt: D(-2) }),
      task({ id: 'tk_19', projectId: 'pj_chip', spaceId: 'sp_inv', title: '整理本季 HBM 产能扩张口径差异', priority: 'P2', due: D(12), estimateMin: 90, tags: ['研究'], createdAt: D(-9) }),
      task({ id: 'tk_20', projectId: null, spaceId: 'sp_skl', title: '梳理数字分身 FDE SOP 的季度修订点', priority: 'P2', due: D(14), estimateMin: 60, tags: ['SOP'], createdAt: D(-10) }),
      task({ id: 'tk_21', projectId: 'pj_cert', spaceId: 'sp_con', title: '认证考核评分表设计（含实操评分维度）', priority: 'P2', due: D(16), estimateMin: 90, tags: ['考核'], createdAt: D(-6) }),

      // —— 已完成（近两周，供周报与热力图使用）——
      task({ id: 'tk_22', projectId: 'pj_vrf', spaceId: 'sp_aic', title: '竞品 6 款机型参数对标表定稿', priority: 'P0', status: 'done', due: D(-9), completedAt: D(-9), estimateMin: 180, tags: ['对标'], createdAt: D(-20) }),
      task({ id: 'tk_23', projectId: 'pj_vrf', spaceId: 'sp_aic', title: '产品卖点提炼：三句话讲清全直流变频价值', priority: 'P1', status: 'done', due: D(-8), completedAt: D(-8), estimateMin: 60, tags: ['话术'], createdAt: D(-16) }),
      task({ id: 'tk_24', projectId: 'pj_mfg', spaceId: 'sp_con', title: '完成第 5、6 场高管访谈', priority: 'P0', status: 'done', due: D(-7), completedAt: D(-7), estimateMin: 240, tags: ['访谈'], createdAt: D(-18) }),
      task({ id: 'tk_25', projectId: 'pj_video', spaceId: 'sp_med', title: 'EP01 剪辑上线 + 封面图', priority: 'P0', status: 'done', due: D(-5), completedAt: D(-5), estimateMin: 200, tags: ['剪辑'], createdAt: D(-12) }),
      task({ id: 'tk_26', projectId: 'pj_column', spaceId: 'sp_med', title: '第 9 篇《别再手搓表格了》发布', priority: 'P1', status: 'done', due: D(-4), completedAt: D(-4), estimateMin: 150, tags: ['发布'], createdAt: D(-11) }),
      task({ id: 'tk_27', projectId: 'pj_skill', spaceId: 'sp_skl', title: '空调选型 Skill v1 上线并自测 12 个用例', priority: 'P1', status: 'done', due: D(-6), completedAt: D(-6), estimateMin: 200, tags: ['Skill'], createdAt: D(-22) }),
      task({ id: 'tk_28', projectId: 'pj_hotel', spaceId: 'sp_aic', title: '负荷计算与机型选配完成', priority: 'P0', status: 'done', due: D(-12), completedAt: D(-12), estimateMin: 240, tags: ['技术'], createdAt: D(-19) }),
      task({ id: 'tk_29', projectId: 'pj_chip', spaceId: 'sp_inv', title: '产业链图谱 v2 更新（新增 HBM 环节）', priority: 'P2', status: 'done', due: D(-3), completedAt: D(-3), estimateMin: 120, tags: ['图谱'], createdAt: D(-15) }),
      task({ id: 'tk_30', projectId: 'pj_cert', spaceId: 'sp_con', title: 'L1 题库 60 题录入与校对', priority: 'P1', status: 'done', due: D(-2), completedAt: D(-2), estimateMin: 150, tags: ['题库'], createdAt: D(-14) }),
      task({ id: 'tk_31', projectId: 'pj_mfg', spaceId: 'sp_con', title: '业务流程现状盘点图（8 大流程）', priority: 'P0', status: 'done', due: D(-1), completedAt: D(-1), estimateMin: 210, tags: ['盘点'], createdAt: D(-10) }),
      task({ id: 'tk_32', projectId: 'pj_video', spaceId: 'sp_med', title: 'EP01 数据复盘：完播 38%、涨粉 214', priority: 'P2', status: 'done', due: D(-1), completedAt: D(-1), estimateMin: 30, tags: ['复盘'], createdAt: D(-5) })
    ];

    var outputs = [
      { id: 'op_01', projectId: 'pj_mfg', spaceId: 'sp_con', title: '苏州某汽车零部件厂 AI 转型诊断中期简报', type: 'report', link: '', date: D(-1), tags: ['Mantu', '诊断'], note: '含 8 大流程现状图与 12 个候选场景清单。' },
      { id: 'op_02', projectId: 'pj_video', spaceId: 'sp_med', title: '视频号 EP01《5 分钟搭个人 AI 工作台》', type: 'video', link: 'https://channels.weixin.qq.com/', date: D(-5), tags: ['视频号', 'WorkBuddy'], note: '完播 38%，涨粉 214，评论区最关心「数据存哪」。' },
      { id: 'op_03', projectId: 'pj_column', spaceId: 'sp_med', title: '公众号第 9 篇《别再手搓表格了：空调销售的 AI 表格术》', type: 'article', link: 'https://mp.weixin.qq.com/', date: D(-4), tags: ['公众号', '专栏'], note: '阅读 4.2k，转发到 3 个行业群。' },
      { id: 'op_04', projectId: 'pj_vrf', spaceId: 'sp_aic', title: '2026 商用多联机竞品参数对标表 v3', type: 'report', link: '', date: D(-9), tags: ['对标', '多联机'], note: '6 款主流机型，覆盖 IPLV / 低温制热 / 噪音三组关键参数。' },
      { id: 'op_05', projectId: 'pj_vrf', spaceId: 'sp_aic', title: '新品经销商培训课件 v2', type: 'deck', link: '', date: D(-7), tags: ['培训', '渠道'], note: '42 页，含 5 个成交场景演练。' },
      { id: 'op_06', projectId: 'pj_skill', spaceId: 'sp_skl', title: 'WorkBuddy Skill：中央空调选型助手 v1', type: 'code', link: '', date: D(-6), tags: ['Skill', '选型'], note: '输入面积/层高/用途，输出机型区间与冷媒管长校核提示。' },
      { id: 'op_07', projectId: 'pj_hotel', spaceId: 'sp_aic', title: '万豪酒店群 VRF 技术方案（主体稿）', type: 'plan', link: '', date: D(-5), tags: ['标书', '酒店'], note: '待甲方图纸第三版确认后定稿。' },
      { id: 'op_08', projectId: 'pj_chip', spaceId: 'sp_inv', title: 'AI 算力产业链图谱 v2', type: 'report', link: '', date: D(-3), tags: ['半导体', '图谱'], note: '新增 HBM 与先进封装设备环节，标注国产化率。' },
      { id: 'op_09', projectId: 'pj_cert', spaceId: 'sp_con', title: 'AI 训练师 L1 课件包（6 课时）', type: 'deck', link: '', date: D(-20), tags: ['课程', 'Amaris'], note: '含讲师手册与 60 道题库。' },
      { id: 'op_10', projectId: 'pj_fde', spaceId: 'sp_skl', title: '数字分身 FDE 交付 SOP v1.2', type: 'plan', link: '', date: D(-14), tags: ['FDE', 'SOP'], note: '两个客户处已跑通，含验收清单。' },
      { id: 'op_11', projectId: 'pj_column', spaceId: 'sp_med', title: '公众号第 8 篇《报价单里的三个坑》', type: 'article', link: 'https://mp.weixin.qq.com/', date: D(-11), tags: ['公众号'], note: '阅读 3.6k。' },
      { id: 'op_12', projectId: 'pj_mfg', spaceId: 'sp_con', title: '高管访谈提纲与记录模板', type: 'other', link: '', date: D(-18), tags: ['模板', '访谈'], note: '可复用到后续咨询项目。' },
      { id: 'op_13', projectId: 'pj_grid', spaceId: 'sp_inv', title: '网格策略参数设计初稿', type: 'plan', link: '', date: D(-2), tags: ['量化', '网格'], note: '网格宽度 / 仓位分配 / 止盈规则三段式。' },
      { id: 'op_14', projectId: 'pj_video', spaceId: 'sp_med', title: 'WorkBuddy 系列 5 集脚本大纲', type: 'other', link: '', date: D(-11), tags: ['脚本', '视频号'], note: '每集 3 分钟，一集解决一个具体问题。' }
    ];

    var links = [
      { id: 'ln_01', group: '工作平台', label: 'WorkBuddy', url: 'https://copilot.tencent.com/', glyph: 'W' },
      { id: 'ln_02', group: '工作平台', label: '飞书', url: 'https://www.feishu.cn/', glyph: '飞' },
      { id: 'ln_03', group: '工作平台', label: '乐享知识库', url: 'https://lexiang.tencent.com/', glyph: '乐' },
      { id: 'ln_04', group: '工作平台', label: '腾讯文档', url: 'https://docs.qq.com/', glyph: '文' },
      { id: 'ln_05', group: '内容阵地', label: '公众号后台', url: 'https://mp.weixin.qq.com/', glyph: '公' },
      { id: 'ln_06', group: '内容阵地', label: '视频号助手', url: 'https://channels.weixin.qq.com/', glyph: '视' },
      { id: 'ln_07', group: '内容阵地', label: '小红书创作', url: 'https://creator.xiaohongshu.com/', glyph: '红' },
      { id: 'ln_08', group: '数据与研究', label: '同花顺 i 问财', url: 'https://www.iwencai.com/', glyph: '财' },
      { id: 'ln_09', group: '数据与研究', label: '巨潮资讯', url: 'http://www.cninfo.com.cn/', glyph: '巨' },
      { id: 'ln_10', group: '数据与研究', label: '产业在线', url: 'https://www.chinaiol.com/', glyph: '产' },
      { id: 'ln_11', group: 'AI 工具', label: 'ChatGPT', url: 'https://chat.openai.com/', glyph: 'G' },
      { id: 'ln_12', group: 'AI 工具', label: 'Claude', url: 'https://claude.ai/', glyph: 'C' }
    ];

    // 事件流：已完成任务 + 产出物 + 历史活跃度（用于周报与热力图）
    var logs = [];
    tasks.forEach(function (t) {
      logs.push({ id: U.uid('lg'), date: t.createdAt, type: 'task_add', refId: t.id, text: '新建任务：' + t.title });
      if (t.status === 'done' && t.completedAt) {
        logs.push({ id: U.uid('lg'), date: t.completedAt, type: 'task_done', refId: t.id, text: '完成任务：' + t.title });
      }
    });
    outputs.forEach(function (o) {
      logs.push({ id: U.uid('lg'), date: o.date, type: 'output_add', refId: o.id, text: '新增产出：' + o.title });
    });

    // 历史活跃度（14 天前 ~ 90 天前），确定性伪随机，制造真实的热力图纹理
    var rnd = makeRandom(20260802);
    for (var back = 15; back <= 90; back++) {
      var dateIso = D(-back);
      var dow = U.parseISO(dateIso).getDay();
      var base = (dow === 0 || dow === 6) ? 0.35 : 0.88;   // 周末活跃度低
      if (rnd() > base) continue;
      var count = 1 + Math.floor(rnd() * 4);
      for (var k = 0; k < count; k++) {
        logs.push({ id: U.uid('lg'), date: dateIso, type: 'task_done', refId: 'archive', text: '完成历史任务（归档）' });
      }
    }
    logs.sort(function (a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });

    return {
      version: SCHEMA_VERSION,
      spaces: spaces,
      projects: projects,
      tasks: tasks,
      outputs: outputs,
      links: links,
      logs: logs,
      settings: defaultSettings(T)
    };
  }

  /**
   * 默认设置。
   * @param {string} today
   * @return {!Object}
   */
  function defaultSettings(today) {
    return {
      theme: 'blueprint',
      weekStart: 1,
      // 顶层 lastActiveDate：由 dailyRefresh 维护，用于跨天判断
      // 与 streak.lastActiveDate 保持同步（touchActivity 也会同时写两者）
      lastActiveDate: today,
      connectors: {
        lark: { enabled: false, appId: '', appSecret: '', taskListId: '', baseAppToken: '' },
        lexiang: { enabled: false, endpoint: '', teamId: '', spaceId: '', token: '' }
      },
      streak: { current: 12, best: 27, lastActiveDate: today }
    };
  }

  /**
   * 空数据骨架（清空后使用）。
   * @return {!Object}
   */
  function emptyState() {
    return {
      version: SCHEMA_VERSION,
      spaces: [], projects: [], tasks: [], outputs: [], links: [], logs: [],
      settings: defaultSettings(U.todayISO())
    };
  }

  /**
   * 根据里程碑计算项目进度百分比。
   * @param {!Array<!Object>} milestones
   * @return {number}
   */
  function computeProgress(milestones) {
    if (!milestones || !milestones.length) return 0;
    var done = milestones.filter(function (m) { return !!m.done; }).length;
    return Math.round(done / milestones.length * 100);
  }

  /* ======================================================================
     03 / 持久化
     ====================================================================== */

  /** @type {?Object} 内存中的应用状态 */
  var state = null;
  /** @type {!Array<function(string)>} 变更订阅者 */
  var subscribers = [];

  /**
   * 校验并补全状态结构。
   * @param {*} raw
   * @return {?Object} 合法状态或 null
   */
  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var keys = ['spaces', 'projects', 'tasks', 'outputs', 'links', 'logs'];
    for (var i = 0; i < keys.length; i++) {
      if (!Array.isArray(raw[keys[i]])) raw[keys[i]] = [];
    }
    raw.version = raw.version || SCHEMA_VERSION;
    var def = defaultSettings(U.todayISO());
    raw.settings = Object.assign({}, def, raw.settings || {});
    raw.settings.connectors = Object.assign({}, def.connectors, raw.settings.connectors || {});
    raw.settings.connectors.lark = Object.assign({}, def.connectors.lark, raw.settings.connectors.lark || {});
    raw.settings.connectors.lexiang = Object.assign({}, def.connectors.lexiang, raw.settings.connectors.lexiang || {});
    raw.settings.streak = Object.assign({}, def.streak, raw.settings.streak || {});
    // 顶层 lastActiveDate 兜底：优先用已有的 streak.lastActiveDate，否则用今天
    if (!raw.settings.lastActiveDate) {
      raw.settings.lastActiveDate = (raw.settings.streak && raw.settings.streak.lastActiveDate) || U.todayISO();
    }
    // 反向同步：若 streak.lastActiveDate 缺失，用顶层 lastActiveDate 补
    if (!raw.settings.streak.lastActiveDate) {
      raw.settings.streak.lastActiveDate = raw.settings.lastActiveDate;
    }
    // 数据完整性兜底：done 状态任务必须有 completedAt（防止导入或旧数据遗漏）
    if (Array.isArray(raw.tasks)) {
      var _today = U.todayISO();
      raw.tasks.forEach(function (t) {
        if (!t || typeof t !== 'object') return;
        if (t.status === 'done' && !t.completedAt) {
          // 优先用截止日期（若已过去），其次用创建日期，最后用今天
          t.completedAt = (t.due && t.due <= _today) ? t.due : (t.createdAt || _today);
        }
      });
    }
    return raw;
  }

  /** 从 localStorage 载入；首次运行灌入种子数据。 */
  function load() {
    var raw = null;
    try {
      var text = global.localStorage.getItem(STORAGE_KEY);
      if (text) raw = JSON.parse(text);
    } catch (e) {
      raw = null;
    }
    var normalized = normalize(raw);
    if (!normalized) {
      state = buildSeed();
      save('seed');
    } else {
      state = normalized;
    }
    return state;
  }

  /**
   * 写回 localStorage 并广播变更。
   * @param {string=} reason 变更原因（调试用）
   */
  function save(reason) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      if (WB.UI) WB.UI.toast('本地存储写入失败：' + e.message, 'err', 4000);
    }
    subscribers.forEach(function (fn) {
      try { fn(reason || 'change'); } catch (err) { /* 单个订阅者异常不影响其它 */ }
    });
  }

  /**
   * 订阅状态变更。
   * @param {function(string)} fn
   * @return {function()} 取消订阅
   */
  function subscribe(fn) {
    subscribers.push(fn);
    return function () {
      var i = subscribers.indexOf(fn);
      if (i >= 0) subscribers.splice(i, 1);
    };
  }

  /* ======================================================================
     04 / 通用集合操作
     ====================================================================== */

  /**
   * 为某个集合生成标准 CRUD。
   * @param {string} key 集合名
   * @param {string} idPrefix ID 前缀
   * @param {function(!Object):!Object} defaults 默认字段工厂
   * @return {!Object}
   */
  function collection(key, idPrefix, defaults) {
    return {
      /** @return {!Array<!Object>} 原始数组引用 */
      all: function () { return state[key]; },
      /**
       * @param {string} id
       * @return {?Object}
       */
      get: function (id) {
        if (!id) return null;
        var list = state[key];
        for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
        return null;
      },
      /**
       * 新建。
       * @param {!Object} data
       * @return {!Object} 新对象
       */
      create: function (data) {
        var item = Object.assign(defaults(data || {}), data || {});
        item.id = item.id || U.uid(idPrefix);
        state[key].push(item);
        save('create:' + key);
        return item;
      },
      /**
       * 局部更新。
       * @param {string} id
       * @param {!Object} patch
       * @return {?Object}
       */
      update: function (id, patch) {
        var item = this.get(id);
        if (!item) return null;
        Object.assign(item, patch);
        if ('updatedAt' in item) item.updatedAt = U.todayISO();
        save('update:' + key);
        return item;
      },
      /**
       * 删除。
       * @param {string} id
       * @return {boolean}
       */
      remove: function (id) {
        var list = state[key];
        for (var i = 0; i < list.length; i++) {
          if (list[i].id === id) {
            list.splice(i, 1);
            save('remove:' + key);
            return true;
          }
        }
        return false;
      }
    };
  }

  /* ======================================================================
     05 / 各实体 API
     ====================================================================== */

  var spaces = collection('spaces', 'sp', function () {
    return { name: '', code: '', color: '#4A4F57', description: '', createdAt: U.todayISO(), archived: false };
  });

  /**
   * 列出空间。
   * @param {{includeArchived:(boolean|undefined)}=} opts
   * @return {!Array<!Object>}
   */
  spaces.list = function (opts) {
    var o = opts || {};
    return state.spaces.filter(function (s) { return o.includeArchived ? true : !s.archived; });
  };

  /** 删除空间并解绑其下项目/任务/产出物的关联。 */
  spaces.removeCascade = function (id) {
    state.projects = state.projects.filter(function (p) { return p.spaceId !== id; });
    state.tasks.forEach(function (t) { if (t.spaceId === id) { t.spaceId = null; t.projectId = null; } });
    state.outputs.forEach(function (o) { if (o.spaceId === id) { o.spaceId = null; o.projectId = null; } });
    var idx = state.spaces.findIndex(function (s) { return s.id === id; });
    if (idx >= 0) state.spaces.splice(idx, 1);
    save('remove:space-cascade');
    return true;
  };

  var projects = collection('projects', 'pj', function () {
    var today = U.todayISO();
    return {
      spaceId: null, name: '', status: 'planning', progress: 0, priority: 'P1', owner: '本人',
      startDate: today, dueDate: U.addDays(today, 30), tags: [], notes: '', milestones: [],
      createdAt: today, updatedAt: today
    };
  });

  /**
   * 列出项目。
   * @param {{spaceId:(string|undefined), status:(string|undefined), includeArchived:(boolean|undefined), q:(string|undefined)}=} filter
   * @return {!Array<!Object>}
   */
  projects.list = function (filter) {
    var f = filter || {};
    var STATUS_ORDER = { active: 0, blocked: 1, planning: 2, done: 3, archived: 4 };
    return state.projects.filter(function (p) {
      if (f.spaceId && p.spaceId !== f.spaceId) return false;
      if (f.status && p.status !== f.status) return false;
      if (!f.includeArchived && !f.status && p.status === 'archived') return false;
      if (f.q) {
        var hay = (p.name + ' ' + (p.tags || []).join(' ') + ' ' + (p.notes || '')).toLowerCase();
        if (hay.indexOf(String(f.q).toLowerCase()) < 0) return false;
      }
      return true;
    }).sort(function (a, b) {
      var d = (STATUS_ORDER[a.status] || 9) - (STATUS_ORDER[b.status] || 9);
      if (d !== 0) return d;
      if (a.priority !== b.priority) return a.priority < b.priority ? -1 : 1;
      return (a.dueDate || '9999') < (b.dueDate || '9999') ? -1 : 1;
    });
  };

  /**
   * 依据里程碑重算进度并持久化。
   * @param {string} id
   * @return {?Object}
   */
  projects.recalcProgress = function (id) {
    var p = this.get(id);
    if (!p) return null;
    if (p.milestones && p.milestones.length) {
      p.progress = computeProgress(p.milestones);
      if (p.progress === 100 && p.status !== 'archived') p.status = 'done';
      else if (p.status === 'done' && p.progress < 100) p.status = 'active';
    }
    p.updatedAt = U.todayISO();
    save('project:progress');
    return p;
  };

  /**
   * 切换某个里程碑完成状态。
   * @param {string} projectId
   * @param {string} milestoneId
   */
  projects.toggleMilestone = function (projectId, milestoneId) {
    var p = this.get(projectId);
    if (!p) return null;
    var ms = (p.milestones || []).find(function (m) { return m.id === milestoneId; });
    if (!ms) return null;
    ms.done = !ms.done;
    logs.add(ms.done ? 'milestone_done' : 'milestone_undo', projectId, (ms.done ? '完成里程碑：' : '撤销里程碑：') + ms.title);
    return this.recalcProgress(projectId);
  };

  var tasks = collection('tasks', 'tk', function () {
    return {
      projectId: null, spaceId: null, title: '', note: '', status: 'todo', priority: 'P1',
      due: null, estimateMin: null, tags: [], createdAt: U.todayISO(), completedAt: null,
      order: (state && state.tasks ? state.tasks.length + 1 : 1)
    };
  });

  var PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2 };
  var TASK_STATUS_ORDER = { doing: 0, todo: 1, done: 2 };

  /**
   * 任务筛选 + 排序。
   * @param {{spaceId, projectId, status, priority, tag, range, q}=} filter
   *   range: 'today' | 'week' | 'overdue' | 'undone' | 'all'
   * @return {!Array<!Object>}
   */
  tasks.list = function (filter) {
    var f = filter || {};
    var today = U.todayISO();
    var ws = state.settings.weekStart;
    var weekFrom = U.startOfWeek(today, ws);
    var weekTo = U.endOfWeek(today, ws);

    return state.tasks.filter(function (t) {
      if (f.spaceId && t.spaceId !== f.spaceId) return false;
      if (f.projectId && t.projectId !== f.projectId) return false;
      if (f.status && t.status !== f.status) return false;
      if (f.priority && t.priority !== f.priority) return false;
      if (f.tag && (t.tags || []).indexOf(f.tag) < 0) return false;
      if (f.q) {
        var hay = (t.title + ' ' + (t.note || '') + ' ' + (t.tags || []).join(' ')).toLowerCase();
        if (hay.indexOf(String(f.q).toLowerCase()) < 0) return false;
      }
      if (f.range === 'today') {
        if (t.status === 'done') return false;
        return !!t.due && t.due <= today;
      }
      if (f.range === 'week') {
        if (t.status === 'done') return false;
        return !!t.due && t.due >= weekFrom && t.due <= weekTo;
      }
      if (f.range === 'overdue') {
        if (t.status === 'done') return false;
        return !!t.due && t.due < today;
      }
      if (f.range === 'undone') return t.status !== 'done';
      return true;
    }).sort(function (a, b) {
      var s = (TASK_STATUS_ORDER[a.status] || 9) - (TASK_STATUS_ORDER[b.status] || 9);
      if (s !== 0) return s;
      var p = (PRIORITY_ORDER[a.priority] || 9) - (PRIORITY_ORDER[b.priority] || 9);
      if (p !== 0) return p;
      var ad = a.due || '9999-12-31', bd = b.due || '9999-12-31';
      if (ad !== bd) return ad < bd ? -1 : 1;
      return (a.order || 0) - (b.order || 0);
    });
  };

  /**
   * 切换任务完成状态（同时写事件流、更新连续活跃）。
   * @param {string} id
   * @return {?Object}
   */
  tasks.toggle = function (id) {
    var t = this.get(id);
    if (!t) return null;
    if (t.status === 'done') {
      t.status = 'todo';
      t.completedAt = null;
      logs.add('task_undo', t.id, '取消完成：' + t.title, true);
    } else {
      t.status = 'done';
      t.completedAt = U.todayISO();
      logs.add('task_done', t.id, '完成任务：' + t.title, true);
      touchActivity(true);
    }
    save('task:toggle');
    return t;
  };

  /**
   * 修改任务状态（看板拖拽使用）。
   * @param {string} id
   * @param {string} status 'todo'|'doing'|'done'
   * @return {?Object}
   */
  tasks.setStatus = function (id, status) {
    var t = this.get(id);
    if (!t || t.status === status) return t;
    t.status = status;
    if (status === 'done') {
      t.completedAt = U.todayISO();
      logs.add('task_done', t.id, '完成任务：' + t.title, true);
      touchActivity(true);
    } else {
      t.completedAt = null;
    }
    save('task:status');
    return t;
  };

  var outputs = collection('outputs', 'op', function () {
    return { projectId: null, spaceId: null, title: '', type: 'article', link: '', date: U.todayISO(), tags: [], note: '' };
  });

  /**
   * 列出产出物（按日期倒序）。
   * @param {{spaceId, projectId, type, q, from, to}=} filter
   * @return {!Array<!Object>}
   */
  outputs.list = function (filter) {
    var f = filter || {};
    return state.outputs.filter(function (o) {
      if (f.spaceId && o.spaceId !== f.spaceId) return false;
      if (f.projectId && o.projectId !== f.projectId) return false;
      if (f.type && o.type !== f.type) return false;
      if (f.from && o.date < f.from) return false;
      if (f.to && o.date > f.to) return false;
      if (f.q) {
        var hay = (o.title + ' ' + (o.note || '') + ' ' + (o.tags || []).join(' ')).toLowerCase();
        if (hay.indexOf(String(f.q).toLowerCase()) < 0) return false;
      }
      return true;
    }).sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });
  };

  var links = collection('links', 'ln', function () {
    return { group: '常用', label: '', url: '', glyph: '·' };
  });

  /** @return {!Array<{group:string, items:!Array<!Object>}>} 按分组整理的快捷入口 */
  links.grouped = function () {
    var map = U.groupBy(state.links, function (l) { return l.group || '常用'; });
    return Object.keys(map).map(function (g) { return { group: g, items: map[g] }; });
  };

  var logs = collection('logs', 'lg', function () {
    return { date: U.todayISO(), type: 'note', refId: null, text: '' };
  });

  /**
   * 追加一条事件（不立即 save，由调用方统一持久化；silent=true 时不广播）。
   * @param {string} type
   * @param {?string} refId
   * @param {string} text
   * @param {boolean=} silent
   * @return {!Object}
   */
  logs.add = function (type, refId, text, silent) {
    var entry = { id: U.uid('lg'), date: U.todayISO(), type: type, refId: refId || null, text: text || '' };
    state.logs.push(entry);
    if (!silent) save('log:add');
    return entry;
  };

  /**
   * 按日期区间取事件。
   * @param {string} from
   * @param {string} to
   * @param {string=} type
   * @return {!Array<!Object>}
   */
  logs.range = function (from, to, type) {
    return state.logs.filter(function (l) {
      if (type && l.type !== type) return false;
      return l.date >= from && l.date <= to;
    });
  };

  /* ======================================================================
     06 / 设置与连续活跃
     ====================================================================== */

  var settings = {
    /** @return {!Object} */
    get: function () { return state.settings; },
    /**
     * 局部更新设置。
     * @param {!Object} patch
     * @return {!Object}
     */
    update: function (patch) {
      Object.assign(state.settings, patch);
      save('settings');
      return state.settings;
    },
    /**
     * 更新某个连接器配置。
     * @param {string} name 'lark' | 'lexiang'
     * @param {!Object} patch
     * @return {!Object}
     */
    updateConnector: function (name, patch) {
      var conn = state.settings.connectors[name] || {};
      state.settings.connectors[name] = Object.assign({}, conn, patch);
      save('settings:connector');
      return state.settings.connectors[name];
    }
  };

  /**
   * 刷新「连续活跃天数」。
   * 同步维护 settings.lastActiveDate（顶层）与 streak.lastActiveDate，保证 dailyRefresh 的跨天判断可靠。
   * @param {boolean=} silent 为 true 时不触发 save（由调用方统一 save）
   * @return {!Object} streak
   */
  function touchActivity(silent) {
    var today = U.todayISO();
    var st = state.settings.streak;
    if (st.lastActiveDate === today) return st;
    if (st.lastActiveDate && U.diffDays(st.lastActiveDate, today) === 1) st.current += 1;
    else st.current = 1;
    st.lastActiveDate = today;
    state.settings.lastActiveDate = today;   // 同步顶层，与 streak 保持一致
    if (st.current > st.best) st.best = st.current;
    if (!silent) save('streak');
    return st;
  }

  /**
   * 滚动种子任务的 due 日期（跨天启动时由 dailyRefresh 调用）。
   *
   * 规则：
   *   - 只动 _seed === true 的种子任务
   *   - 已完成的种子任务：不动（completedAt 是历史事实，热力图/周报依赖它）
   *   - 未完成的种子任务：t.due = dayISO(t._seedOffset)，用原始偏移重算，不累加 deltaDays
   *   - 用户自建任务（无 _seed）：不动
   *
   * 这样无论隔多少天打开，种子里「今日待办」始终是今天、「本周重点」始终是本周。
   * @param {string} today ISO 日期（仅用于日志/调试，实际滚动用 dayISO）
   */
  function rollSeedTasks(today) {
    if (!state || !Array.isArray(state.tasks)) return 0;
    var rolled = 0;
    state.tasks.forEach(function (t) {
      if (!t || t._seed !== true) return;        // 只动种子
      if (t.status === 'done') return;            // 已完成不动
      if (t._seedOffset == null || !isFinite(Number(t._seedOffset))) return;
      t.due = U.dayISO(Number(t._seedOffset));    // 用原始 offset 重算，不累加
      rolled += 1;
    });
    return rolled;
  }

  /* ======================================================================
     07 / 派生统计
     ====================================================================== */

  /**
   * 估算字符串的 UTF-8 字节数（不依赖 Blob，作为 storageBytes 的兜底）。
   * @param {string} text
   * @return {number}
   */
  function utf8Bytes(text) {
    var bytes = 0;
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i);
      if (code < 0x80) bytes += 1;
      else if (code < 0x800) bytes += 2;
      else if (code >= 0xD800 && code <= 0xDBFF) { bytes += 4; i++; }  // 代理对按 4 字节计
      else bytes += 3;
    }
    return bytes;
  }

  var stats = {
    /**
     * 仪表盘关键指标。
     * @return {!Object}
     */
    dashboard: function () {
      var today = U.todayISO();
      var ws = state.settings.weekStart;
      var weekFrom = U.startOfWeek(today, ws);
      var weekTo = U.endOfWeek(today, ws);
      var activeProjects = state.projects.filter(function (p) { return p.status === 'active'; });
      var todayTasks = tasks.list({ range: 'today' });
      var overdue = tasks.list({ range: 'overdue' });
      var weekDone = state.tasks.filter(function (t) {
        return t.status === 'done' && t.completedAt && t.completedAt >= weekFrom && t.completedAt <= weekTo;
      });
      var weekOutputs = state.outputs.filter(function (o) { return o.date >= weekFrom && o.date <= weekTo; });
      var blocked = state.projects.filter(function (p) { return p.status === 'blocked'; });
      return {
        activeProjects: activeProjects.length,
        blockedProjects: blocked.length,
        todayTasks: todayTasks.length,
        overdueTasks: overdue.length,
        weekDone: weekDone.length,
        weekOutputs: weekOutputs.length,
        streak: state.settings.streak.current,
        streakBest: state.settings.streak.best,
        weekFrom: weekFrom,
        weekTo: weekTo
      };
    },

    /**
     * 单个空间的概览统计。
     * @param {string} spaceId
     * @return {!Object}
     */
    space: function (spaceId) {
      var monthFrom = U.startOfMonth(U.todayISO());
      var monthTo = U.endOfMonth(U.todayISO());
      return {
        projects: state.projects.filter(function (p) { return p.spaceId === spaceId && p.status !== 'archived'; }).length,
        openTasks: state.tasks.filter(function (t) { return t.spaceId === spaceId && t.status !== 'done'; }).length,
        monthOutputs: state.outputs.filter(function (o) {
          return o.spaceId === spaceId && o.date >= monthFrom && o.date <= monthTo;
        }).length
      };
    },

    /**
     * 近 N 周的完成热力图数据。
     * @param {number=} weeks 默认 12
     * @return {!Array<!Array<{date:string, count:number, level:number}>>} 按周分组，每周 7 天
     */
    heatmap: function (weeks) {
      var w = weeks || 12;
      var today = U.todayISO();
      var ws = state.settings.weekStart;
      var thisWeekStart = U.startOfWeek(today, ws);
      var startDate = U.addDays(thisWeekStart, -7 * (w - 1));

      var counts = {};
      state.logs.forEach(function (l) {
        if (l.type !== 'task_done') return;
        counts[l.date] = (counts[l.date] || 0) + 1;
      });

      var grid = [];
      for (var i = 0; i < w; i++) {
        var col = [];
        for (var d = 0; d < 7; d++) {
          var iso = U.addDays(startDate, i * 7 + d);
          var c = counts[iso] || 0;
          var level = c === 0 ? 0 : (c === 1 ? 1 : (c <= 2 ? 2 : (c <= 4 ? 3 : 4)));
          col.push({ date: iso, count: c, level: iso > today ? -1 : level });
        }
        grid.push(col);
      }
      return grid;
    },

    /**
     * 数据条目统计。
     * @return {!Object}
     */
    counts: function () {
      return {
        spaces: state.spaces.length,
        projects: state.projects.length,
        tasks: state.tasks.length,
        outputs: state.outputs.length,
        links: state.links.length,
        logs: state.logs.length
      };
    },

    /**
     * localStorage 占用（字节）。
     * @return {number}
     */
    storageBytes: function () {
      var text = '';
      try {
        text = global.localStorage.getItem(STORAGE_KEY) || '';
      } catch (e) {
        return 0;
      }
      // 优先用 Blob 精确计算 UTF-8 字节数；环境不支持时退回手工统计
      try {
        var size = new global.Blob([text]).size;
        if (typeof size === 'number' && size > 0) return size;
      } catch (e2) { /* 忽略，走兜底 */ }
      return utf8Bytes(text);
    }
  };

  /* ======================================================================
     08 / 导入 / 导出 / 重置
     ====================================================================== */

  /** @return {string} 格式化后的 JSON 文本 */
  function exportJSON() {
    return JSON.stringify(state, null, 2);
  }

  /** 触发浏览器下载备份文件。 */
  function downloadBackup() {
    var name = 'workbench-backup-' + U.todayISO() + '.json';
    WB.UI.download(name, exportJSON(), 'application/json');
    return name;
  }

  /**
   * 从 JSON 文本导入（整体替换）。
   * @param {string} text
   * @return {{ok:boolean, message:string}}
   */
  function importJSON(text) {
    var parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { ok: false, message: 'JSON 解析失败：' + e.message };
    }
    if (!parsed || typeof parsed !== 'object') return { ok: false, message: '文件内容不是合法的工作台数据对象' };
    var required = ['spaces', 'projects', 'tasks', 'outputs'];
    for (var i = 0; i < required.length; i++) {
      if (!Array.isArray(parsed[required[i]])) {
        return { ok: false, message: '缺少必需字段「' + required[i] + '」或格式不正确' };
      }
    }
    state = normalize(parsed);
    save('import');
    return { ok: true, message: '已导入 ' + state.projects.length + ' 个项目 / ' + state.tasks.length + ' 条任务' };
  }

  /** 重置为种子数据。 */
  function resetToSeed() {
    state = buildSeed();
    save('reset');
  }

  /** 清空全部数据。 */
  function clearAll() {
    state = emptyState();
    save('clear');
  }

  /* ======================================================================
     09 / 导出命名空间
     ====================================================================== */

  WB.Store = {
    STORAGE_KEY: STORAGE_KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    ENUMS: ENUMS,
    labelOf: labelOf,
    /** @return {!Object} 当前状态（只读用途，写请走 CRUD） */
    get state() { return state; },
    load: load,
    save: save,
    subscribe: subscribe,
    spaces: spaces,
    projects: projects,
    tasks: tasks,
    outputs: outputs,
    links: links,
    logs: logs,
    settings: settings,
    stats: stats,
    computeProgress: computeProgress,
    touchActivity: touchActivity,
    rollSeedTasks: rollSeedTasks,
    exportJSON: exportJSON,
    downloadBackup: downloadBackup,
    importJSON: importJSON,
    resetToSeed: resetToSeed,
    clearAll: clearAll,
    buildSeed: buildSeed
  };

})(window);
