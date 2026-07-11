/* offline-engine.js — 零 API 离线规则诊断引擎
 * 不调用任何大模型：基于内置知识库故障树 chunk + 参数阈值规则，生成结构化诊断报告。
 * 用法：await OfflineEngine.init(); const {text, kbCount} = OfflineEngine.diagnose(userText);
 */
(function (global) {
  'use strict';

  const self = {
    kb: null,

    async init() {
      if (this.kb) return;
      const res = await fetch('./data/knowledge.json');
      this.kb = await res.json();
    },

    chunkByTitle(title) {
      return this.kb.chunks.find((c) => c.title === title) || null;
    },

    // 从自然语言中提取关键信号
    extract(text) {
      const num = (re) => { const m = text.match(re); return m ? parseFloat(m[1]) : null; };
      const has = (...ws) => ws.some((w) => text.includes(w));
      const temp = num(/(?:排气温度|机头温度|油温|温度)[^\d]{0,6}(\d{2,3}(?:\.\d+)?)\s*℃?/i);
      const pressure = num(/(?:排气压力|出口压力|压力)[^\d]{0,6}(\d+(?:\.\d+)?)\s*(?:MPa|bar|公斤|kg)?/i);
      const current = num(/(?:运行电流|电流|load\s*current)[^\d]{0,6}(\d+(?:\.\d+)?)\s*A?/i);
      const ratedP = num(/(?:额定|铭牌)[^\d]{0,12}(?:压力)[^\d]{0,6}(\d+(?:\.\d+)?)/i);
      const ratedC = num(/(?:额定|铭牌)[^\d]{0,12}(?:电流)[^\d]{0,6}(\d+(?:\.\d+)?)/i);
      const alarm = (text.match(/(?:报警|故障|错误|err|alm)[^\d]{0,4}(\w{2,8})/i) || [])[1] || null;
      return {
        temp, pressure, current, ratedP, ratedC, alarm,
        oilCarry: has('带油', '耗油', '喷油', '油分', '含油量高'),
        leakOil: has('漏油', '渗油'),
        noise: has('异响', '振动', '噪音', '噪声', '响声'),
        freqLoad: has('频繁加卸载', '频繁加载', '加卸载频繁', '压力波动', '一直加载', '不停加载'),
        trip: has('跳机', '停机', '停不下来', '无法启动', '过载保护', '超温保护'),
        overPress: has('安全阀起跳', '超压', '压力高', '压力过高'),
        lowPress: has('压力不足', '打不上', '上不来', '压力低', '排压低', '建不起压'),
        highTempWord: has('高温', '超温', '温度高', '油温高'),
        highCurrentWord: has('电流高', '电流大', '过载', '电流过载'),
        lowCurrentWord: has('电流低', '电流小', '空载'),
      };
    },

    // 信号 -> 主故障类别（最多取 3 个）
    classify(s) {
      const cats = [];
      if ((s.temp != null && s.temp >= 100) || s.highTempWord) cats.push('highTemp');
      if (s.lowPress || (s.pressure != null && s.ratedP && s.pressure < s.ratedP * 0.8)) cats.push('lowPress');
      if (s.overPress) cats.push('highPress');
      if (s.oilCarry) cats.push('oilCarry');
      if (s.noise) cats.push('noise');
      if (s.freqLoad) cats.push('freqLoad');
      if (s.trip) cats.push('trip');
      if (s.highCurrentWord || (s.current != null && s.ratedC && s.current > s.ratedC * 1.1)) cats.push('highCurrent');
      if (s.lowCurrentWord) cats.push('lowCurrent');
      return cats;
    },

    MAP: {
      highTemp:   { cf: '1.1 排气温度/油温过高（>100℃）', dt: '决策树 1：排气温度 / 油温异常', ft: 'FT-02 排气温度 / 油温过高' },
      lowPress:   { cf: '2.1 排气压力打不上 / 压力不足', dt: '决策树 2：压力异常', ft: 'FT-01 排气压力不足' },
      highPress:  { cf: '2.2 排气压力过高（安全阀起跳）', dt: '决策树 2：压力异常', ft: 'FT-01 排气压力不足' },
      oilCarry:   { cf: '4. 排气带油（油分异常）', dt: '决策树 4：排气带油', ft: 'FT-03 排气带油（耗油量大）' },
      noise:      { cf: '5. 异响异常', dt: '决策树 5：异响诊断', ft: 'FT-04 异响 / 振动大' },
      freqLoad:   { cf: '6. 频繁加卸载', dt: '决策树 6：频繁加卸载', ft: 'FT-05 频繁加卸载（压力波动）' },
      trip:       { cf: '7. 停机故障', dt: '决策树 7：停机故障', ft: 'FT-06 停机 / 跳机' },
      highCurrent:{ cf: '3.1 运行电流偏高', dt: '决策树 3：电流异常', ft: null },
      lowCurrent: { cf: '3.2 运行电流偏低', dt: '决策树 3：电流异常', ft: null },
    },

    trimChunk(t, max) {
      t = (t || '').trim();
      if (t.length <= max) return t;
      const cut = t.slice(0, max);
      const lastNl = cut.lastIndexOf('\n');
      return (lastNl > max * 0.5 ? cut.slice(0, lastNl) : cut) + '\n\n_（知识库内容较长，已截断，现场以完整手册为准）_';
    },

    stripTitle(t) {
      t = (t || '').trim();
      const lines = t.split('\n');
      if (lines[0] && /^#{1,6}\s/.test(lines[0])) lines.shift();
      return lines.join('\n').trim();
    },

    diagnose(text) {
      const s = this.extract(text);
      const cats = this.classify(s);
      const unit = (text.match(/(?:MPa|bar)/i) || [])[0] || '';

      // 参数对比表
      const rows = [];
      if (s.temp != null) {
        const judge = s.temp >= 100 ? '⚠️ 超温' : (s.temp < 60 ? '⚠️ 偏低' : '正常');
        rows.push(['排气/油温', '≤95℃（>100℃报警）', s.temp + '℃', judge]);
      }
      if (s.pressure != null) {
        rows.push(['排气压力', s.ratedP ? s.ratedP + ' MPa(额定)' : '见机型标准', s.pressure + unit, '见机型']);
      }
      if (s.current != null) {
        let judge = '见铭牌';
        if (s.ratedC) judge = s.current > s.ratedC * 1.1 ? '⚠️ 偏高' : (s.current < s.ratedC * 0.6 ? '⚠️ 偏低' : '正常');
        rows.push(['运行电流', s.ratedC ? s.ratedC + ' A(额定)' : '见铭牌', s.current + ' A', judge]);
      }

      const statusBits = [];
      if (cats.includes('highTemp')) statusBits.push('高温');
      if (cats.includes('lowPress')) statusBits.push('排压不足');
      if (cats.includes('highPress')) statusBits.push('超压');
      if (cats.includes('oilCarry')) statusBits.push('排气带油');
      if (cats.includes('noise')) statusBits.push('异响/振动');
      if (cats.includes('freqLoad')) statusBits.push('频繁加卸载');
      if (cats.includes('trip')) statusBits.push('跳机/停机');
      if (s.alarm) statusBits.push('报警' + s.alarm);
      if (s.leakOil) statusBits.push('漏油');

      let out = '';
      out += '# 📊 初步诊断结果（离线模式 · 规则引擎）\n';
      out += '> 📴 当前未调用大模型，基于内置知识库故障树输出，结论需现场验证。\n\n';
      out += '## 📌 当前设备\n';
      out += '- 型号：（未提供，请补充）\n- 运行小时：（未提供）\n- 当前状态：' + (statusBits.join('、') || '待判定') + '\n\n';

      if (rows.length) {
        out += '## 🔍 数据异常分析\n';
        out += '| 参数 | 参考标准 | 当前值 | 判断 |\n|------|------|------|------|\n';
        rows.forEach((r) => (out += `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} |\n`));
        out += '\n';
      }

      if (!cats.length) {
        out += '## ⚠️ 信息不足，无法定位\n';
        out += '请补充以下信息，我将基于故障树给出排查路径：\n';
        out += '- 机型 / 额定排气压力 / 额定电流\n';
        out += '- 当前 排气压力 / 油温 / 运行电流\n';
        out += '- 异常现象：带油？异响？频繁加卸载？跳机？漏油？报警代码？\n';
        out += '- 发生时机：突然发生 / 一直存在 / 保养后 / 维修后？\n';
        return { text: out, kbCount: 0 };
      }

      out += '## 🎯 命中故障树与排查要点\n';
      let kbCount = 0;
      const order = ['①', '②', '③'];
      cats.slice(0, 3).forEach((c, i) => {
        const m = this.MAP[c];
        const cf = this.chunkByTitle(m.cf);
        const dt = this.chunkByTitle(m.dt);
        const ft = m.ft ? this.chunkByTitle(m.ft) : null;
        if (cf) kbCount++;
        if (dt) kbCount++;
        if (ft) kbCount++;
        const headTitle = cf ? cf.title : (ft ? ft.title : m.dt);
        out += `### ${order[i]} ${headTitle}\n`;
        if (cf) out += this.trimChunk(this.stripTitle(cf.text), 900) + '\n';
        else if (ft) out += this.trimChunk(this.stripTitle(ft.text), 800) + '\n';
        if (dt) out += `\n**决策树（${dt.title}）**\n` + this.trimChunk(this.stripTitle(dt.text), 700) + '\n';
      });

      out += '\n## 🛠️ 推荐维修步骤\n';
      out += '请按以上故障树「从易到难、先外后内」顺序验证；每步确认后再进行下一步。\n';
      out += '\n## ⚠️ 安全提醒（LOTO）\n';
      out += '请确认以下全部完成，否则禁止继续维修：\n✅ 已停机 ✅ 已断电 ✅ 已完全泄压(压力表归零) ✅ 已挂牌上锁 ✅ 旋转件已静止\n';
      out += '\n## 📷 建议上传\n';
      out += '□ 控制器报警 □ 油位 □ 冷却器 □ 电控柜 □ 故障部位\n';
      out += '\n## 💡 维修完成后\n';
      out += '确认：□ 是否解决 □ 更换零件 □ 实际根因 □ 是否还有异常。可点「📑 沉淀案例」提交审核入库。\n';
      return { text: out, kbCount };
    },
  };

  global.OfflineEngine = self;
})(window);
