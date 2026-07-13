// === Impro 空压机 AI 维修副驾 - 离线规则诊断引擎 ===
(function () {
  const FT = {
    'FT-01': { name: '排气温度过高', signals: ['排气温度', '高温', '温度高', '温度过高', '110度', '105度', '100度', '冷却器', '温控阀'] },
    'FT-02': { name: '排气压力偏低', signals: ['压力低', '压力偏低', '气压不足', '压力上不去', '加卸载', '进气阀', '进气阀故障'] },
    'FT-03': { name: '排气含油量高', signals: ['含油', '有油', '油分', '油分离器', '油耗高', '加油', '回油管', '回油单向阀'] },
    'FT-04': { name: '主机异响', signals: ['异响', '噪音', '声音大', '响声', '咔咔', '摩擦声', '轴承', '啮合'] },
    'FT-05': { name: '主机高温停机', signals: ['高温停机', '热停机', '温度保护', '停机保护', '散热器', '冷却风扇', '环境温度高'] },
    'FT-06': { name: '变频器报警', signals: ['变频器', '变频器报警', '过流', '过载', '过热', 'IGBT', '驱动板', '模块'] },
  };

  // 故障排除决策树（精简版）
  const DECISIONS = {
    'FT-01': [
      '检查冷却器翅片是否脏堵 → 压缩空气吹扫或清洗',
      '检查温控阀是否卡滞在旁通位 → 更换温控阀芯',
      '检查油位是否偏低 → 补充至规定油位',
      '检查环境通风是否良好 → 改善通风或加装导风罩',
    ],
    'FT-02': [
      '检查进气阀是否完全打开 → 清洁阀芯、检查电磁阀',
      '检查卸荷阀是否内漏 → 更换卸荷阀密封件',
      '检查管路系统是否有漏气点 → 皂水检漏',
      '检查最小压力阀是否卡涩 → 清洗或更换',
    ],
    'FT-03': [
      '检查油分离器是否到更换周期 → 更换油分芯',
      '检查回油单向阀是否堵塞 → 清洗或更换回油单向阀',
      '检查油位是否过高 → 排出多余润滑油至正常油位',
    ],
    'FT-04': [
      '检查联轴器/传动皮带是否异常磨损 → 更换',
      '检查主轴承是否磨损 → 听诊判断，必要时更换轴承',
      '检查电机轴承 → 加注润滑脂或更换',
      '检查螺杆转子是否碰磨 → 需拆检主机',
    ],
    'FT-05': [
      '检查散热器翅片是否严重脏堵 → 高压水枪清洗',
      '检查冷却风扇是否正常工作 → 更换风扇电机',
      '检查环境温度是否超过 45℃ → 改善通风或移机',
      '检查油冷却器是否内部结垢 → 化学清洗',
    ],
    'FT-06': [
      '检查输入电压是否稳定 → 加装稳压器',
      '检查变频器散热风扇 → 清洁或更换',
      '参数设置是否与电机铭牌匹配 → 重新设置参数',
      '模块或驱动板故障 → 联系变频器厂家维修',
    ],
  };

  function matchSignals(text) {
    const t = text.toLowerCase();
    const scores = Object.entries(FT).map(([code, ft]) => {
      let score = 0;
      ft.signals.forEach((sig) => {
        if (t.includes(sig)) score++;
      });
      return { code, name: ft.name, score };
    });
    return scores.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  }

  function getKBtext(kb) {
    if (!kb || !kb.chunks) return '';
    // 从知识库中提取 FT 相关段落
    const lines = kb.chunks
      .filter((c) => c.category === '故障' || c.category === '维修')
      .map((c) => `【${c.title}】${c.text}`);
    return lines.join('\n');
  }

  function diagnose(text) {
    const matched = matchSignals(text);
    let output = '';

    if (matched.length === 0) {
      output += '⚠️ 离线引擎未匹配到明确故障模式。请尝试切换到「在线模式」（需配置 API Key），或补充更多故障现象描述。\n\n';
      output += '常见故障代码：\n';
      Object.entries(FT).forEach(([code, ft]) => {
        output += `- **${code}** ${ft.name}（${ft.signals.slice(0, 3).join(' / ')}）\n`;
      });
      return { text: output, kbCount: 0 };
    }

    const top = matched[0];
    output += `## 🔍 离线诊断结果\n\n`;
    output += `**匹配故障：${top.code} — ${top.name}**（匹配度 ${top.score} 个信号词）\n\n`;
    output += `### 排查步骤\n`;

    const steps = DECISIONS[top.code] || [];
    steps.forEach((step, i) => {
      output += `${i + 1}. ${step}\n`;
    });

    if (matched.length > 1) {
      output += `\n### 其他可能故障\n`;
      matched.slice(1).forEach((m) => {
        output += `- ${m.code} — ${m.name}（匹配 ${m.score} 个信号词）\n`;
      });
    }

    output += `\n> 💡 离线诊断仅供参考。如需更精确分析，请切换到「在线模式」（需配置 API Key）。`;

    return { text: output, kbCount: 0 };
  }

  globalThis.OfflineEngine = { diagnose };
})();
