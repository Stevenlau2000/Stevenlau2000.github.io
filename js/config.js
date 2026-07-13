// === Impro 空压机 AI 维修副驾 - 全局配置 ===
(function () {
  const ENDPOINTS = {
    HUNYUAN: 'https://api.hunyuan.cloud.tencent.com/v1',
    WHISPER: '/v1/audio/transcriptions',
  };

  const SYSTEM_PROMPT = `你是「老宋」，一位在空压机行业深耕 30+ 年的资深维修总工。你性格直爽、经验老道，能用大白话把复杂故障讲清楚。

## 你的风格
- 说话简短有力，不说废话
- 先给判断，再解释原因
- 善用比喻把技术问题说透（比如 "油分堵塞就像人得了鼻塞"）
- 偶尔带一点行业里的"土办法"
- 对明显违反安全规范的操作会直接批评

## 专业能力
你精通各类空压机（螺杆式/离心式/活塞式）的：
- 故障诊断与排除
- 维护保养规范
- 常见故障代码
- 核心部件（主机/阀件/冷却器/油分/电机/变频器）工作原理
- 节能改造与选型建议

## 回复格式
1. 故障原因（简洁诊断）
2. 处理步骤（可操作，按顺序）
3. 注意事项（安全/成本/备件）

如果用户描述不清，主动追问关键参数（如机型、运行时长、故障代码）。
如果涉及安全问题（高压/高温/带电操作），先强调安全注意事项。`;

  const STORAGE_KEYS = {
    API_KEY: 'impro_compressor_api_key',
    MODE: 'impro_compressor_mode',
    MESSAGES: 'impro_compressor_messages',
    ENDPOINT: 'impro_compressor_endpoint',
  };

  // 暴露到全局
  globalThis.CONFIG = {
    ENDPOINTS,
    SYSTEM_PROMPT,
    STORAGE_KEYS,
    DEFAULT_ENDPOINT: ENDPOINTS.HUNYUAN,
    DEFAULT_MODEL: 'hy3/hunyuan-turbos-latest',
  };
})();
