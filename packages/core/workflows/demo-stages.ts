import type { StepDemo } from "./types"

export const DEMO_STAGES: StepDemo[] = [
  // ---- Step 1: 客户需求提报 ----
  {
    stepId: "step-1",
    stages: [
      {
        id: "s1-1",
        title: "AI 扫描客户邮件",
        description:
          "AI 数字员工自动扫描业务部收件箱，识别包含采购需求的邮件，过滤掉无关信息。",
        visualType: "document-scan",
        visualData: {
          documentTitle: "收件箱 — 客户需求邮件",
          documentType: "email",
          extractedFields: [
            {
              label: "发件人",
              value: "zhang.wei@customer.com",
              confidence: 100,
            },
            {
              label: "主题",
              value: "【紧急】PCB板材采购需求 — 2026Q3",
              confidence: 98,
            },
            {
              label: "产品型号",
              value: "PCB-FR4-1.6mm-2L",
              confidence: 95,
            },
            {
              label: "采购数量",
              value: "50,000 片",
              confidence: 97,
            },
            {
              label: "期望交期",
              value: "2026-08-15",
              confidence: 92,
            },
            {
              label: "目标单价",
              value: "¥12.50/片",
              confidence: 88,
            },
          ],
          annotations: [
            {
              text: "高优先级客户，历史订单金额 ¥2,300,000",
              type: "info",
            },
          ],
        },
        result: {
          summary: "从 47 封未读邮件中识别出 3 封采购需求，已自动分类并标记优先级。",
          highlights: ["识别准确率 97%", "处理耗时 2.3 秒"],
        },
      },
      {
        id: "s1-2",
        title: "提取关键需求字段",
        description:
          "AI 从邮件正文和附件中提取结构化需求信息，自动填充标准化需求表单。",
        visualType: "extraction-cards",
        visualData: {
          cards: [
            { label: "需求编号", value: "PR-2026-0842", confidence: 100 },
            { label: "客户名称", value: "深圳华创电子有限公司", confidence: 99 },
            { label: "产品名称", value: "PCB-FR4-1.6mm-2L 双面板", confidence: 98 },
            { label: "采购数量", value: "50,000 片", confidence: 97 },
            { label: "目标单价", value: "¥12.50/片", confidence: 88 },
            { label: "预算总额", value: "¥625,000", confidence: 90 },
            { label: "期望交期", value: "2026-08-15", confidence: 92 },
            { label: "质量等级", value: "IPC-A-600 Class 2", confidence: 85 },
            { label: "包装要求", value: "真空包装/防静电", confidence: 80 },
            { label: "付款条款", value: "月结60天", confidence: 78 },
          ],
        },
        result: {
          summary: "需求表单自动填充完成，10 个关键字段已提取。3 个低置信度字段需人工确认。",
          highlights: [
            "结构化提取 10 项关键字段",
            "自动分类：电子元器件 > PCB > 双面板",
          ],
          warnings: ["付款条款置信度偏低(78%)，建议人工核实"],
        },
      },
      {
        id: "s1-3",
        title: "生成标准化需求单",
        description:
          "AI 自动回填历史数据——同型号产品参数、历史成交价、平均交付周期，生成完整的需求单据。",
        visualType: "report-view",
        visualData: {
          title: "标准化采购需求单",
          sections: [
            {
              heading: "需求基本信息",
              content:
                "需求编号 PR-2026-0842，客户深圳华创电子，产品 PCB-FR4-1.6mm-2L 双面板，数量 50,000 片。",
              metrics: [
                { label: "参考历史成交价", value: "¥11.80–13.20/片" },
                { label: "平均交付周期", value: "28 天" },
                { label: "历史订单数", value: "12 笔" },
              ],
            },
            {
              heading: "技术规格",
              content:
                "板材 FR-4，板厚 1.6mm，铜厚 1oz，层数 2L，表面处理 HASL 无铅，阻焊颜色 绿色，丝印颜色 白色。",
            },
            {
              heading: "质量与验收标准",
              content:
                "IPC-A-600 Class 2 标准，附测试报告。抽样标准 GB/T 2828.1 AQL 0.65。",
            },
          ],
        },
        result: {
          summary:
            "标准化需求单已生成，回填历史参考数据 5 项。需求单已同步推送至采购工作台。",
          highlights: [
            "自动关联 12 条历史订单数据",
            "唯一需求单号已生成并归档",
          ],
        },
      },
      {
        id: "s1-4",
        title: "校验完整性并推送",
        description:
          "AI 校验需求单完整性，检测缺失字段，将完整需求单推送至采购部门工作台。",
        visualType: "extraction-cards",
        visualData: {
          cards: [
            { label: "完整性检查", value: "通过 ✓", confidence: 100 },
            { label: "必填字段", value: "12/12 项已完成", confidence: 100 },
            { label: "历史数据回填", value: "5 项已应用", confidence: 95 },
            { label: "推送状态", value: "已推送至采购工作台", confidence: 100 },
            { label: "通知对象", value: "采购部 王经理", confidence: 100 },
            { label: "需求单归档", value: "已完成", confidence: 100 },
          ],
        },
        result: {
          summary:
            "需求单校验通过，已推送至采购部王经理的工作台。全程耗时 4.8 秒。",
          highlights: ["零人工录入", "全程留痕可追溯", "自动归档"],
        },
      },
    ],
  },

  // ---- Step 2: 采购核价 & 询价 & 比价 ----
  {
    stepId: "step-2",
    stages: [
      {
        id: "s2-1",
        title: "批量发起询价",
        description:
          "AI 自动调取供应商库，匹配 PCB 品类供应商，批量生成并发送询价单至 5 家合格供应商。",
        visualType: "data-comparison",
        visualData: {
          title: "询价发送清单",
          columns: [
            { key: "supplier", label: "供应商" },
            { key: "rating", label: "评级" },
            { key: "status", label: "询价状态" },
            { key: "sentTime", label: "发送时间" },
            { key: "expectedReply", label: "预计回复" },
          ],
          rows: [
            {
              supplier: { value: "深圳鹏发电子材料有限公司" },
              rating: { value: "★★★★★", status: "best" },
              status: { value: "已发送 ✓", status: "best" },
              sentTime: { value: "09:32" },
              expectedReply: { value: "同日 14:00" },
            },
            {
              supplier: { value: "惠州市创达电路科技有限公司" },
              rating: { value: "★★★★☆", status: "best" },
              status: { value: "已发送 ✓", status: "best" },
              sentTime: { value: "09:32" },
              expectedReply: { value: "同日 16:00" },
            },
            {
              supplier: { value: "广州金百泽电子科技" },
              rating: { value: "★★★★☆", status: "best" },
              status: { value: "已发送 ✓", status: "best" },
              sentTime: { value: "09:33" },
              expectedReply: { value: "次日 10:00" },
            },
            {
              supplier: { value: "东莞生益电子股份有限公司" },
              rating: { value: "★★★★★", status: "best" },
              status: { value: "已发送 ✓", status: "best" },
              sentTime: { value: "09:33" },
              expectedReply: { value: "同日 15:00" },
            },
            {
              supplier: { value: "苏州东山精密制造" },
              rating: { value: "★★★☆☆", status: "warning" },
              status: { value: "待补发(邮箱退信)", status: "warning" },
              sentTime: { value: "09:34" },
              expectedReply: { value: "—" },
            },
          ],
          summary: [
            { label: "已发送", value: "4/5" },
            { label: "退信", value: "1 封" },
            { label: "预计收到报价", value: "4 份" },
          ],
        },
        result: {
          summary:
            "已向 5 家供应商发送询价，4 封成功送达。检测到东山精密邮箱退信，已自动标记需人工跟进。",
          highlights: ["自动匹配 5 家 PCB 品类供应商", "询价模板自动填充需求参数"],
          warnings: ["苏州东山精密邮箱异常，需人工确认联系方式"],
        },
      },
      {
        id: "s2-2",
        title: "收集供应商报价",
        description:
          "AI 接收供应商报价回复，自动解析报价单中的单价、交期、付款条件等关键信息。",
        visualType: "data-comparison",
        visualData: {
          title: "供应商报价汇总",
          columns: [
            { key: "supplier", label: "供应商" },
            { key: "unitPrice", label: "单价(元/片)" },
            { key: "totalPrice", label: "总价(万元)" },
            { key: "delivery", label: "交期(天)" },
            { key: "payment", label: "付款条件" },
            { key: "quality", label: "质量等级" },
          ],
          rows: [
            {
              supplier: { value: "深圳鹏发电子" },
              unitPrice: { value: "¥11.80", status: "best" },
              totalPrice: { value: "59.0" },
              delivery: { value: "25", status: "best" },
              payment: { value: "月结60天" },
              quality: { value: "Class 2" },
            },
            {
              supplier: { value: "惠州创达电路" },
              unitPrice: { value: "¥12.20" },
              totalPrice: { value: "61.0" },
              delivery: { value: "28" },
              payment: { value: "月结45天" },
              quality: { value: "Class 2" },
            },
            {
              supplier: { value: "广州金百泽" },
              unitPrice: { value: "¥13.50", status: "warning" },
              totalPrice: { value: "67.5" },
              delivery: { value: "30" },
              payment: { value: "月结30天" },
              quality: { value: "Class 3" },
            },
            {
              supplier: { value: "东莞生益电子" },
              unitPrice: { value: "¥12.00" },
              totalPrice: { value: "60.0" },
              delivery: { value: "27" },
              payment: { value: "月结60天" },
              quality: { value: "Class 2" },
            },
          ],
          summary: [
            { label: "收到报价", value: "4/4 份" },
            { label: "平均单价", value: "¥12.38/片" },
            { label: "最优报价", value: "¥11.80/片" },
            { label: "行业均价", value: "¥12.50/片" },
          ],
        },
        result: {
          summary:
            "4 家供应商已完成报价，AI 自动解析报价单字段。鹏发电子报价最低(¥11.80)，低于行业均价 5.6%。",
          highlights: [
            "报价解析准确率 100%",
            "自动标注异常报价(金百泽 ¥13.50，高于均价 8%)",
          ],
        },
      },
      {
        id: "s2-3",
        title: "生成标准化比价表",
        description:
          "AI 将 4 家供应商报价横向对比，自动标记价格偏差、交期异常和最优选项。",
        visualType: "data-comparison",
        visualData: {
          title: "多维度比价分析表",
          columns: [
            { key: "criterion", label: "比价维度" },
            { key: "pengfa", label: "鹏发电子" },
            { key: "chuangda", label: "创达电路" },
            { key: "jinbai", label: "金百泽" },
            { key: "shengyi", label: "生益电子" },
          ],
          rows: [
            {
              criterion: { value: "单价(元/片)" },
              pengfa: { value: "11.80", status: "best" },
              chuangda: { value: "12.20" },
              jinbai: { value: "13.50", status: "warning" },
              shengyi: { value: "12.00" },
            },
            {
              criterion: { value: "总价(万元)" },
              pengfa: { value: "59.0", status: "best" },
              chuangda: { value: "61.0" },
              jinbai: { value: "67.5", status: "warning" },
              shengyi: { value: "60.0" },
            },
            {
              criterion: { value: "交期(天)" },
              pengfa: { value: "25", status: "best" },
              chuangda: { value: "28" },
              jinbai: { value: "30", status: "warning" },
              shengyi: { value: "27" },
            },
            {
              criterion: { value: "付款条件" },
              pengfa: { value: "月结60天", status: "best" },
              chuangda: { value: "月结45天" },
              jinbai: { value: "月结30天", status: "warning" },
              shengyi: { value: "月结60天", status: "best" },
            },
            {
              criterion: { value: "供应商评级" },
              pengfa: { value: "5星" },
              chuangda: { value: "4星" },
              jinbai: { value: "4星" },
              shengyi: { value: "5星", status: "best" },
            },
            {
              criterion: { value: "历史履约率" },
              pengfa: { value: "98.5%", status: "best" },
              chuangda: { value: "96.2%" },
              jinbai: { value: "94.8%" },
              shengyi: { value: "99.1%", status: "best" },
            },
          ],
          summary: [
            { label: "综合最优", value: "鹏发电子" },
            { label: "价格节省", value: "¥85,000 vs 行业均价" },
            { label: "交期优势", value: "提前 3-5 天" },
          ],
        },
        result: {
          summary:
            "比价分析完成。综合价格、交期、付款条件、评级和履约率，推荐深圳鹏发电子为最优供应商。预估可节省 ¥85,000。",
          highlights: [
            "鹏发电子在 4/6 个维度表现最优",
            "预估总成本节约 13.6%",
          ],
          warnings: ["金百泽报价偏离度过大，建议排除本轮比价"],
        },
      },
      {
        id: "s2-4",
        title: "AI 最优供应商推荐",
        description:
          "AI 综合多维度评分，生成推荐报告并附详细理由，同时推送备选方案。",
        visualType: "report-view",
        visualData: {
          title: "供应商推荐报告",
          sections: [
            {
              heading: "🥇 首选推荐：深圳鹏发电子材料有限公司",
              content:
                "综合评分 94.2/100。单价 ¥11.80 为全场最低，交期 25 天最短，付款条件最优，历史履约率 98.5%。历史合作 28 笔订单，零质量事故。",
              metrics: [
                { label: "综合评分", value: "94.2/100" },
                { label: "价格评分", value: "98/100" },
                { label: "交期评分", value: "95/100" },
                { label: "质量评分", value: "92/100" },
              ],
            },
            {
              heading: "🥈 备选推荐：东莞生益电子股份有限公司",
              content:
                "综合评分 91.5/100。单价 ¥12.00 略高但历史履约率最高 99.1%，5 星评级，适合对品质要求极高的订单。",
              metrics: [
                { label: "综合评分", value: "91.5/100" },
                { label: "履约率", value: "99.1%" },
              ],
            },
            {
              heading: "风险提示",
              content:
                "广州金百泽报价高于均价 8%，且付款条件苛刻（月结30天）。苏州东山精密邮件退信，暂未报价。建议将金百泽排除本轮，东山精密补发询价后作为备选。",
            },
          ],
        },
        result: {
          summary:
            "推荐深圳鹏发电子为首选供应商，生益电子为备选。预计总价 ¥590,000，较预算节约 ¥35,000(5.6%)。",
          highlights: [
            "首选供应商综合评分 94.2",
            "预估节约 ¥35,000",
            "交期提前 3-5 天",
          ],
        },
      },
    ],
  },

  // ---- Step 3: 比价结果同步 ----
  {
    stepId: "step-3",
    stages: [
      {
        id: "s3-1",
        title: "编译比价结果",
        description:
          "AI 自动整理比价分析数据，计算各项指标，准备向业务端同步的结果报告。",
        visualType: "extraction-cards",
        visualData: {
          cards: [
            { label: "参与比价供应商", value: "4 家", confidence: 100 },
            { label: "首选推荐", value: "深圳鹏发电子", confidence: 95 },
            { label: "推荐单价", value: "¥11.80/片", confidence: 95 },
            { label: "总价", value: "¥590,000", confidence: 98 },
            { label: "较预算节约", value: "¥35,000 (5.6%)", confidence: 90 },
            { label: "预计交期", value: "25 天", confidence: 92 },
            { label: "毛利率测算", value: "18.5%", confidence: 85 },
            { label: "利润预估", value: "¥109,150", confidence: 85 },
          ],
        },
        result: {
          summary: "比价数据已编译完成，含利润率测算和风险标记。",
          highlights: ["自动测算毛利率 18.5%", "利润预估 ¥109,150"],
        },
      },
      {
        id: "s3-2",
        title: "生成附带利润测算的报告",
        description:
          "AI 生成正式的比价分析报告，包含利润测算、成本拆解和风险标注，格式标准化。",
        visualType: "report-view",
        visualData: {
          title: "比价分析报告 — PR-2026-0842",
          sections: [
            {
              heading: "一、比价概况",
              content:
                "本次共向 5 家供应商发起询价，收到 4 份有效报价。综合比价维度：单价、总价、交期、付款条件、供应商评级、历史履约率。",
              metrics: [
                { label: "询价供应商", value: "5 家" },
                { label: "有效报价", value: "4 份" },
                { label: "比价维度", value: "6 项" },
              ],
            },
            {
              heading: "二、成本利润测算",
              content:
                "首选供应商报价 ¥11.80/片，总价 ¥590,000。加计物流成本 ¥5,000、验收费 ¥2,000，全成本 ¥597,000。客户预算 ¥625,000，预计毛利 ¥109,150，毛利率 18.5%。",
              metrics: [
                { label: "总成本", value: "¥597,000" },
                { label: "预计毛利", value: "¥109,150" },
                { label: "毛利率", value: "18.5%", trend: "up" },
              ],
            },
            {
              heading: "三、风险标注",
              content:
                "金百泽报价偏离度过大(高于均价 8%)，建议排除。东山精密邮件退信未报价，建议确认联系方式后补发询价。",
            },
          ],
          riskFlags: [
            "金百泽报价偏离 > 8%",
            "东山精密未响应询价",
          ],
        },
        result: {
          summary: "比价分析报告已生成，自动同步至业务端工作台并推送通知。",
          highlights: [
            "报告生成耗时 1.8 秒",
            "自动推送至 3 名业务人员",
          ],
        },
      },
      {
        id: "s3-3",
        title: "推送通知各相关方",
        description:
          "AI 将比价报告推送至业务端工作台，弹窗提醒相关人员，全程操作留痕。",
        visualType: "timeline-tracker",
        visualData: {
          events: [
            {
              time: "10:15:32",
              title: "比价报告生成完成",
              description: "AI 自动生成比价分析报告并附利润测算",
              status: "completed",
            },
            {
              time: "10:15:33",
              title: "推送至业务部工作台",
              description: "发送至业务部张经理、李经理工作台",
              status: "completed",
            },
            {
              time: "10:15:34",
              title: "弹窗提醒已发送",
              description: "实时弹窗推送至 3 名业务人员",
              status: "completed",
            },
            {
              time: "10:16:05",
              title: "张经理已查看",
              description: "业务部张经理已打开比价报告",
              status: "completed",
            },
            {
              time: "10:18:00",
              title: "待查看：李经理",
              description: "系统将每 30 分钟提醒一次",
              status: "pending",
            },
          ],
        },
        result: {
          summary:
            "比价报告已同步推送至业务端。张经理已查看，李经理待查看。所有操作已留痕记录。",
          highlights: ["实时推送 + 弹窗提醒", "全程留痕可追溯"],
        },
      },
    ],
  },

  // ---- Step 4: 销售合同签订 ----
  {
    stepId: "step-4",
    stages: [
      {
        id: "s4-1",
        title: "AI 扫描销售合同",
        description:
          "AI 读取销售合同文档，识别合同类型、签约方和核心条款区域。",
        visualType: "document-scan",
        visualData: {
          documentTitle: "销售合同 — 深圳华创电子",
          documentType: "contract",
          extractedFields: [
            { label: "合同编号", value: "SC-2026-0842", confidence: 100 },
            { label: "甲方", value: "深圳华创电子有限公司", confidence: 99 },
            { label: "乙方", value: "我方", confidence: 100 },
            { label: "合同金额", value: "¥625,000", confidence: 95 },
            { label: "签订日期", value: "2026-06-14", confidence: 97 },
            { label: "交付日期", value: "2026-08-15", confidence: 90 },
            { label: "付款条款", value: "预付30%/验收后60天付70%", confidence: 88 },
          ],
          annotations: [
            { text: "关键条款区域", type: "info" },
            { text: "金额需再次确认", type: "warning" },
          ],
        },
        result: {
          summary: "销售合同扫描完成，7 项关键字段已提取。",
          highlights: ["OCR 识别准确率 99%"],
        },
      },
      {
        id: "s4-2",
        title: "识别关键条款",
        description:
          "AI 逐条解析合同条款，标记交付、付款、违约、质保等核心条款。",
        visualType: "document-scan",
        visualData: {
          documentTitle: "销售合同条款解析",
          documentType: "contract",
          extractedFields: [
            { label: "交付条款", value: "2026年8月15日前完成交付，逾期每日万分之三违约金", confidence: 96, highlighted: true },
            { label: "付款条款", value: "合同签订后预付30%，验收合格60日内支付70%", confidence: 95, highlighted: true },
            { label: "质量标准", value: "IPC-A-600 Class 2，附出厂检测报告", confidence: 94 },
            { label: "验收条款", value: "货到7个工作日内完成验收", confidence: 92 },
            { label: "质保条款", value: "12个月质量保证期", confidence: 90 },
            { label: "违约责任", value: "逾期交付违约金每日万分之三，上限合同金额10%", confidence: 88, highlighted: true },
          ],
          annotations: [
            { text: "逾期违约金上限合理", type: "info" },
            { text: "验收期7天偏短，建议争取15天", type: "warning" },
            { text: "付款条件与采购报价匹配 ✓", type: "success" },
          ],
        },
        result: {
          summary: "6 项核心条款已解析。AI 发现 1 项风险：验收期限偏短。",
          highlights: ["核心条款识别率 100%"],
          warnings: ["验收期限 7 天偏短，行业惯例为 15 天"],
        },
      },
      {
        id: "s4-3",
        title: "校验毛利与价格合规",
        description:
          "AI 校验合同金额与采购成本的毛利空间，检测价格合规性，异常标黄预警。",
        visualType: "data-comparison",
        visualData: {
          title: "价格合规校验",
          columns: [
            { key: "item", label: "校验项" },
            { key: "value", label: "合同值" },
            { key: "reference", label: "参考值" },
            { key: "status", label: "结果" },
          ],
          rows: [
            {
              item: { value: "合同金额" },
              value: { value: "¥625,000" },
              reference: { value: "¥625,000(客户预算)" },
              status: { value: "匹配 ✓", status: "best" },
            },
            {
              item: { value: "采购成本" },
              value: { value: "¥597,000" },
              reference: { value: "含物流/验收费" },
              status: { value: "已确认 ✓", status: "best" },
            },
            {
              item: { value: "毛利润" },
              value: { value: "¥109,150" },
              reference: { value: "最小阈值 ¥50,000" },
              status: { value: "充足 ✓", status: "best" },
            },
            {
              item: { value: "毛利率" },
              value: { value: "18.5%" },
              reference: { value: "公司标准 ≥15%" },
              status: { value: "达标 ✓", status: "best" },
            },
            {
              item: { value: "付款条件" },
              value: { value: "预付30%/验收后60天70%" },
              reference: { value: "月结60天(供应商)" },
              status: { value: "匹配 ✓", status: "best" },
            },
            {
              item: { value: "违约金上限" },
              value: { value: "合同金额10%" },
              reference: { value: "行业标准 10%" },
              status: { value: "合理 ✓", status: "best" },
            },
          ],
          summary: [
            { label: "风险项", value: "1 项" },
            { label: "合规项", value: "6/6 通过" },
          ],
        },
        result: {
          summary:
            "价格合规检查 6/6 项通过。毛利率 18.5% 高于公司标准。验收期限 7 天偏短为唯一关注点。",
          highlights: ["毛利率 18.5% 高于公司标准 3.5%", "付款条件与供应商条款匹配"],
          warnings: ["验收期限建议从 7 天修改为 15 天"],
        },
      },
      {
        id: "s4-4",
        title: "一键同步订单台账",
        description:
          "AI 自动将合同核心数据同步至订单台账，创建唯一订单号，关联采购需求单。",
        visualType: "extraction-cards",
        visualData: {
          cards: [
            { label: "订单编号", value: "SO-2026-0842", confidence: 100 },
            { label: "关联需求单", value: "PR-2026-0842", confidence: 100 },
            { label: "客户", value: "深圳华创电子有限公司", confidence: 99 },
            { label: "订单金额", value: "¥625,000", confidence: 100 },
            { label: "交货日期", value: "2026-08-15", confidence: 97 },
            { label: "合同状态", value: "已签订", confidence: 100 },
            { label: "台账同步", value: "已完成 ✓", confidence: 100 },
            { label: "通知销售经理", value: "已发送 ✓", confidence: 100 },
          ],
        },
        result: {
          summary:
            "订单 SO-2026-0842 已同步至台账。合同电子模板已归档，全流程数据已关联。",
          highlights: ["合同→订单同步耗时 1.2 秒", "全流程数据链路已建立"],
        },
      },
    ],
  },

  // ---- Step 5: 采购合同拟定与审批 ----
  {
    stepId: "step-5",
    stages: [
      {
        id: "s5-1",
        title: "匹配合同模板",
        description:
          "AI 根据采购品类(PCB)、金额(59万)和供应商类型，自动匹配最合适的采购合同模板。",
        visualType: "extraction-cards",
        visualData: {
          cards: [
            { label: "采购品类", value: "电子元器件 > PCB > 双面板", confidence: 100 },
            { label: "供应商类型", value: "合格供应商(A级)", confidence: 100 },
            { label: "合同金额", value: "¥590,000", confidence: 100 },
            { label: "匹配模板", value: "PCB-采购合同-标准版-v3.2", confidence: 96 },
            { label: "模板版本", value: "2026Q2 最新版", confidence: 100 },
            { label: "适用金额范围", value: "10万–200万", confidence: 95 },
          ],
        },
        result: {
          summary:
            '已匹配"PCB-采购合同-标准版-v3.2"模板，该模板为 2026Q2 最新版本，适用金额范围匹配。',
          highlights: ["模板匹配准确度 96%", "自动选用最新版本"],
        },
      },
      {
        id: "s5-2",
        title: "AI 自动填充合同字段",
        description:
          "AI 从订单、比价结果、供应商信息中自动提取数据填充合同字段，无需人工复制。",
        visualType: "document-scan",
        visualData: {
          documentTitle: "采购合同 — 深圳鹏发电子",
          documentType: "contract",
          extractedFields: [
            { label: "采购方", value: "我方", confidence: 100, highlighted: true },
            { label: "供应方", value: "深圳鹏发电子材料有限公司", confidence: 100, highlighted: true },
            { label: "产品名称", value: "PCB-FR4-1.6mm-2L 双面板", confidence: 99, highlighted: true },
            { label: "采购数量", value: "50,000 片", confidence: 99, highlighted: true },
            { label: "单价", value: "¥11.80/片", confidence: 100, highlighted: true },
            { label: "合同总价", value: "¥590,000", confidence: 100, highlighted: true },
            { label: "交付日期", value: "2026-07-25 (25天)", confidence: 95, highlighted: true },
            { label: "付款条件", value: "月结60天", confidence: 98, highlighted: true },
            { label: "质量等级", value: "IPC-A-600 Class 2", confidence: 96 },
            { label: "质保期", value: "12个月", confidence: 94 },
            { label: "关联订单", value: "SO-2026-0842", confidence: 100 },
          ],
          annotations: [
            { text: "11 个关键字段已自动填充", type: "success" },
            { text: "所有数据来源可追溯", type: "info" },
          ],
        },
        result: {
          summary:
            "合同字段已全部自动填充，11 个关键字段数据均来自上游系统，无需人工录入。",
          highlights: ["自动填充率 100%", "数据全程可追溯"],
        },
      },
      {
        id: "s5-3",
        title: "校验付款/违约条款风险",
        description:
          "AI 逐条审查合同条款，重点校验付款条款、交付周期和违约条款，标记潜在风险。",
        visualType: "report-view",
        visualData: {
          title: "合同条款风险审查报告",
          sections: [
            {
              heading: "✅ 付款条款",
              content:
                "月结60天，与公司标准一致。付款条件明确，无歧义。",
              metrics: [
                { label: "付款条件", value: "月结60天" },
                { label: "风险等级", value: "低" },
              ],
            },
            {
              heading: "✅ 交付条款",
              content:
                "交付日期 2026-07-25，25 天交期。鹏发电子历史按期交付率 98.5%，交期风险低。",
              metrics: [
                { label: "交期", value: "25 天" },
                { label: "风险等级", value: "低" },
              ],
            },
            {
              heading: "⚠️ 违约条款",
              content:
                "逾期违约金为每日万分之三，上限合同金额 10%。标准可接受。但质保条款中\"不可抗力\"定义范围偏宽，建议补充明确排除项。",
              metrics: [
                { label: "违约金率", value: "0.03%/天" },
                { label: "风险等级", value: "中" },
              ],
            },
          ],
          riskFlags: [
            "质保条款中\"不可抗力\"定义偏宽，建议补充排除项",
          ],
        },
        result: {
          summary:
            "合同审查完成。付款和交付条款无风险，违约条款发现 1 处建议修改项。",
          highlights: ["付款/交付条款无风险", "整体风险评级：低"],
          warnings: ['建议收紧"不可抗力"条款定义'],
        },
      },
      {
        id: "s5-4",
        title: "分级审批流实时监控",
        description:
          "AI 根据合同金额自动匹配审批链路，实时追踪审批节点，超时自动预警。",
        visualType: "timeline-tracker",
        visualData: {
          events: [
            {
              time: "10:30",
              title: "采购经理审批",
              description: "王经理 — 审批中（预计 2 小时内完成）",
              status: "in-progress",
            },
            {
              time: "待触发",
              title: "法务审核",
              description: "金额超过50万，系统自动加入法务审核节点",
              status: "pending",
            },
            {
              time: "待触发",
              title: "财务总监审批",
              description: "金额超过50万，需财务总监终审",
              status: "pending",
            },
            {
              time: "待触发",
              title: "合同归档",
              description: "审批通过后自动归档至合同管理系统",
              status: "pending",
            },
          ],
        },
        result: {
          summary:
            "审批链路已启动：采购经理→法务→财务总监。金额 ¥590,000 触发两级额外审批。系统每30分钟自动催办。",
          highlights: [
            "智能匹配 3 级审批链路",
            "超时自动预警+催办",
            "审批全程留痕",
          ],
        },
      },
    ],
  },

  // ---- Step 6: 付款与台账登记 ----
  {
    stepId: "step-6",
    stages: [
      {
        id: "s6-1",
        title: "组装付款申请单",
        description:
          "AI 自动从合同、订单和验收报告中提取数据，一键组装完整的付款申请单。",
        visualType: "extraction-cards",
        visualData: {
          cards: [
            { label: "付款申请编号", value: "PAY-2026-0842", confidence: 100 },
            { label: "关联合同", value: "SC-PROC-2026-0842", confidence: 100 },
            { label: "供应商", value: "深圳鹏发电子材料有限公司", confidence: 100 },
            { label: "付款金额", value: "¥590,000", confidence: 100 },
            { label: "已付预付款", value: "¥0 (月结60天)", confidence: 100 },
            { label: "付款方式", value: "银行转账", confidence: 98 },
            { label: "收款账户", value: "6217****8901 (已校验)", confidence: 95 },
            { label: "付款期限", value: "2026-08-24 前", confidence: 97 },
          ],
        },
        result: {
          summary:
            "付款申请单已自动组装完成，8 项数据全部来自上游系统，无需手动填写。",
          highlights: ["数据自动提取率 100%", "收款账户已校验"],
        },
      },
      {
        id: "s6-2",
        title: "智能分级匹配审批流",
        description:
          "AI 根据付款金额自动匹配审批层级，生成审批链路并推送给对应审批人。",
        visualType: "timeline-tracker",
        visualData: {
          events: [
            {
              time: "10:45",
              title: "采购经理审核",
              description: "审核付款金额与合同一致性",
              status: "in-progress",
            },
            {
              time: "待触发",
              title: "财务经理审核",
              description: "金额 > 50万，自动升级审批",
              status: "pending",
            },
            {
              time: "待触发",
              title: "财务总监终审",
              description: "金额 > 50万，需总监终审",
              status: "pending",
            },
            {
              time: "待触发",
              title: "出纳付款",
              description: "审批完成后自动生成付款指令",
              status: "pending",
            },
          ],
        },
        result: {
          summary:
            "付款审批链路：采购经理→财务经理→财务总监。金额¥590,000 触发三级审批。",
          highlights: ["智能分级审批", "超时自动催办"],
        },
      },
      {
        id: "s6-3",
        title: "付款完成同步台账",
        description:
          "付款完成后，AI 自动将付款记录同步至采购台账和财务系统，数据实时更新。",
        visualType: "data-comparison",
        visualData: {
          title: "台账同步记录",
          columns: [
            { key: "field", label: "同步字段" },
            { key: "value", label: "当前值" },
            { key: "status", label: "同步状态" },
          ],
          rows: [
            { field: { value: "付款编号" }, value: { value: "PAY-2026-0842" }, status: { value: "已同步 ✓", status: "best" } },
            { field: { value: "合同编号" }, value: { value: "SC-PROC-2026-0842" }, status: { value: "已关联 ✓", status: "best" } },
            { field: { value: "付款金额" }, value: { value: "¥590,000" }, status: { value: "已同步 ✓", status: "best" } },
            { field: { value: "付款日期" }, value: { value: "2026-08-24" }, status: { value: "已同步 ✓", status: "best" } },
            { field: { value: "采购台账" }, value: { value: "已更新 ✓" }, status: { value: "已同步 ✓", status: "best" } },
            { field: { value: "财务系统" }, value: { value: "已更新 ✓" }, status: { value: "已同步 ✓", status: "best" } },
            { field: { value: "供应商对账单" }, value: { value: "已更新 ✓" }, status: { value: "已同步 ✓", status: "best" } },
          ],
          summary: [
            { label: "同步系统", value: "3 个" },
            { label: "同步字段", value: "7/7" },
            { label: "异常记录", value: "0" },
          ],
        },
        result: {
          summary:
            "付款记录已同步至采购台账、财务系统和供应商对账单，共 3 个系统 7 个字段全部同步成功。",
          highlights: ["3 系统数据实时同步", "零异常记录"],
        },
      },
      {
        id: "s6-4",
        title: "异常检测与标记",
        description:
          "AI 自动检测付款数据中的异常模式——重复付款、金额不符、超期未付等。",
        visualType: "report-view",
        visualData: {
          title: "付款异常检测报告",
          sections: [
            {
              heading: "检测结果",
              content:
                "本次付款申请已通过 8 项自动检查，未发现异常。付款金额与合同一致，收款账户与供应商备案一致。",
              metrics: [
                { label: "检测项", value: "8 项" },
                { label: "通过", value: "8 项" },
                { label: "异常", value: "0 项" },
              ],
            },
            {
              heading: "检测项目清单",
              content:
                "✓ 重复付款检测、✓ 金额一致性、✓ 收款账户校验、✓ 合同有效期校验、✓ 审批完整性检查、✓ 预算额度检测、✓ 供应商状态检查、✓ 付款时效合规检查",
            },
          ],
        },
        result: {
          summary:
            "8 项付款异常检测全部通过。无重复付款、无金额不符、无超期风险。",
          highlights: ["8/8 项检测通过", "零异常"],
        },
      },
    ],
  },

  // ---- Step 7: 物流履约跟踪 ----
  {
    stepId: "step-7",
    stages: [
      {
        id: "s7-1",
        title: "抓取物流轨迹",
        description:
          "AI 自动对接 3 家物流商 API（顺丰、德邦、京东物流），实时抓取运输轨迹数据。",
        visualType: "timeline-tracker",
        visualData: {
          events: [
            {
              time: "2026-07-20 08:30",
              title: "货物出库",
              description: "深圳鹏发电子仓库出库，物流单号 SF1234567890",
              status: "completed",
            },
            {
              time: "2026-07-20 14:00",
              title: "深圳分拨中心",
              description: "已到达深圳分拨中心，扫描入库",
              status: "completed",
            },
            {
              time: "2026-07-21 03:00",
              title: "运输中",
              description: "已发往上海分拨中心，预计 07-22 到达",
              status: "completed",
            },
            {
              time: "2026-07-22 10:00",
              title: "上海分拨中心",
              description: "已到达上海分拨中心",
              status: "completed",
            },
            {
              time: "预计 2026-07-23 16:00",
              title: "派送中",
              description: "预计明日开始派送",
              status: "pending",
            },
            {
              time: "预计 2026-07-24 12:00",
              title: "客户签收",
              description: "预计签收时间",
              status: "pending",
              isPredicted: true,
            },
          ],
        },
        result: {
          summary: "物流轨迹已对接 3 家承运商，实时数据更新正常。预计准时交付。",
          highlights: ["3 家物流商 API 对接", "轨迹更新延迟 < 30 分钟"],
        },
      },
      {
        id: "s7-2",
        title: "实时状态更新",
        description:
          "AI 持续监控物流状态变化，异常停留、路线偏离等自动检测并更新状态。",
        visualType: "data-comparison",
        visualData: {
          title: "物流实时监控面板",
          columns: [
            { key: "order", label: "订单号" },
            { key: "carrier", label: "物流商" },
            { key: "status", label: "当前状态" },
            { key: "location", label: "当前位置" },
            { key: "eta", label: "预计送达" },
          ],
          rows: [
            {
              order: { value: "SO-2026-0842" },
              carrier: { value: "顺丰速运" },
              status: { value: "运输中", status: "best" },
              location: { value: "上海分拨中心" },
              eta: { value: "07-24 12:00" },
            },
            {
              order: { value: "SO-2026-0842-B" },
              carrier: { value: "德邦物流" },
              status: { value: "运输中", status: "best" },
              location: { value: "杭州中转站" },
              eta: { value: "07-25 18:00" },
            },
            {
              order: { value: "SO-2026-0842-C" },
              carrier: { value: "京东物流" },
              status: { value: "分拨延迟", status: "warning" },
              location: { value: "广州分拨中心" },
              eta: { value: "07-25 20:00 ⚠️" },
            },
          ],
          summary: [
            { label: "总订单", value: "3 票" },
            { label: "正常", value: "2 票" },
            { label: "预警", value: "1 票" },
          ],
        },
        result: {
          summary:
            "3 票物流中 2 票正常，京东物流 SO-2026-0842-C 在广州分拨中心停留超 8 小时，已触发预警。",
          highlights: ["实时更新延迟 < 5 分钟"],
          warnings: ["京东物流广州分拨延迟，建议跟进"],
        },
      },
      {
        id: "s7-3",
        title: "交付阈值预警",
        description:
          "AI 根据距离交付日期天数、当前运输状态和历史数据，计算交付风险并自动触发黄色提醒。",
        visualType: "report-view",
        visualData: {
          title: "交付风险预警报告",
          sections: [
            {
              heading: "🟡 黄色预警：SO-2026-0842-C",
              content:
                "京东物流承运的 SO-2026-0842-C 批次在广州分拨中心停留超 8 小时，历史同期正常停留时间为 3-4 小时。当前预计送达时间已延至 07-25 20:00，距交付截止仅余 21 天，仍在可接受范围但建议关注。",
              metrics: [
                { label: "风险等级", value: "黄色(关注)" },
                { label: "延误时长", value: "约 4 小时" },
                { label: "距交付截止", value: "21 天" },
              ],
            },
            {
              heading: "🟢 正常：SO-2026-0842, SO-2026-0842-B",
              content:
                "顺丰和德邦物流运输正常，预计可提前 1-2 天送达。",
              metrics: [
                { label: "正常批次", value: "2/3" },
                { label: "提前送达预计", value: "1-2 天" },
              ],
            },
          ],
          riskFlags: [
            "京东物流广州分拨延迟，建议致电确认",
          ],
        },
        result: {
          summary:
            "2/3 批次运输正常。京东物流 SO-2026-0842-C 已触发黄色预警，建议采购部联系物流商确认情况。",
          highlights: ["风险预测准确率 92%", "提前 21 天预警"],
          warnings: ["京东物流延迟 — 建议致电承运商确认"],
        },
      },
      {
        id: "s7-4",
        title: "逾期风险前置预判",
        description:
          "AI 基于历史数据和当前运输状态，预判逾期风险并自动推送加急协调方案。",
        visualType: "extraction-cards",
        visualData: {
          cards: [
            { label: "风险评级", value: "低风险（2 票正常，1 票预警）", confidence: 92 },
            { label: "最坏情况", value: "京东物流延误 1-2 天，仍在交付期内", confidence: 88 },
            { label: "建议方案", value: "联系京东物流确认分拨延迟原因", confidence: 95 },
            { label: "备选方案", value: "如延误超 48h，安排顺丰专车转运", confidence: 90 },
            { label: "通知对象", value: "采购部 + 商务部 + 客户经理", confidence: 100 },
            { label: "下次评估", value: "4 小时后自动更新", confidence: 100 },
          ],
        },
        result: {
          summary:
            "综合评估：交付风险为低。京东物流批次虽有短暂延迟，但在交付期内仍有充足缓冲。系统 4 小时后自动重新评估。",
          highlights: [
            "超前预警窗口 21 天",
            "自动推送加急协调方案",
            "每 4 小时自动评估更新",
          ],
        },
      },
    ],
  },

  // ---- Step 8: 货物验收入库 ----
  {
    stepId: "step-8",
    stages: [
      {
        id: "s8-1",
        title: "生成标准化验收单",
        description:
          "AI 根据订单数据和质检标准，自动生成标准化验收单模板，包含数量、外观、性能等检测项。",
        visualType: "document-scan",
        visualData: {
          documentTitle: "货物验收单 — SO-2026-0842",
          documentType: "receipt",
          extractedFields: [
            { label: "验收单号", value: "GRN-2026-0842", confidence: 100, highlighted: true },
            { label: "关联订单", value: "SO-2026-0842", confidence: 100 },
            { label: "供应商", value: "深圳鹏发电子材料有限公司", confidence: 100 },
            { label: "产品名称", value: "PCB-FR4-1.6mm-2L 双面板", confidence: 100, highlighted: true },
            { label: "采购数量", value: "50,000 片", confidence: 100, highlighted: true },
            { label: "抽检数量", value: "500 片（AQL 0.65）", confidence: 98 },
            { label: "检测标准", value: "IPC-A-600 Class 2", confidence: 100 },
          ],
          annotations: [
            { text: "验收模板已自动填充订单数据", type: "success" },
            { text: "抽检方案符合 GB/T 2828.1 标准", type: "info" },
          ],
        },
        result: {
          summary: "标准化验收单已生成，检测项和抽检方案已按国家标准自动配置。",
          highlights: ["验收模板自动填充率 100%", "抽检方案符合国标"],
        },
      },
      {
        id: "s8-2",
        title: "录入质检数据",
        description:
          "物流部人员录入验收数据后，AI 自动整理并结构化存储，对比采购标准。",
        visualType: "data-comparison",
        visualData: {
          title: "质检数据汇总",
          columns: [
            { key: "checkItem", label: "检测项" },
            { key: "standard", label: "标准要求" },
            { key: "actual", label: "实测结果" },
            { key: "result", label: "判定" },
          ],
          rows: [
            { checkItem: { value: "外观检查" }, standard: { value: "无划痕、变色" }, actual: { value: "合格" }, result: { value: "通过 ✓", status: "best" } },
            { checkItem: { value: "板厚" }, standard: { value: "1.6mm ±0.1mm" }, actual: { value: "1.58-1.62mm" }, result: { value: "通过 ✓", status: "best" } },
            { checkItem: { value: "铜厚" }, standard: { value: "1oz (35μm)" }, actual: { value: "34.2-36.1μm" }, result: { value: "通过 ✓", status: "best" } },
            { checkItem: { value: "尺寸" }, standard: { value: "100×80mm ±0.2mm" }, actual: { value: "100.05×80.03mm" }, result: { value: "通过 ✓", status: "best" } },
            { checkItem: { value: "阻焊颜色" }, standard: { value: "绿色" }, actual: { value: "合格" }, result: { value: "通过 ✓", status: "best" } },
            { checkItem: { value: "数量" }, standard: { value: "50,000 片" }, actual: { value: "49,985 片" }, result: { value: "差异 ⚠️", status: "warning" } },
          ],
          summary: [
            { label: "合格项", value: "5/6" },
            { label: "异常项", value: "1 项(数量)" },
          ],
        },
        result: {
          summary:
            "质检 5/6 项通过。数量项目检测到差异：实收 49,985 片，短少 15 片(0.03%)。",
          highlights: ["质量指标全部达标", "外观、尺寸、性能均合格"],
          warnings: ["数量短少 15 片，差异率 0.03%，需联系供应商确认"],
        },
      },
      {
        id: "s8-3",
        title: "对比订单差异标记",
        description:
          "AI 自动对比验收数据与采购订单，差异项自动标记预警，生成差异报告。",
        visualType: "report-view",
        visualData: {
          title: "订单差异分析报告",
          sections: [
            {
              heading: "数量差异",
              content:
                "采购订单：50,000 片 → 实收：49,985 片 → 短少 15 片（0.03%）。差异率低于行业标准 0.1%，属于可接受范围，但需记录并通知供应商补发。",
              metrics: [
                { label: "短少数", value: "15 片" },
                { label: "差异率", value: "0.03%" },
                { label: "行业标准", value: "≤0.1%" },
              ],
            },
            {
              heading: "质量差异",
              content:
                "全部质量检测项（外观、板厚、铜厚、尺寸、阻焊）均符合 IPC-A-600 Class 2 标准，无质量差异。",
            },
          ],
        },
        result: {
          summary:
            "差异分析完成。数量短少 15 片在行业标准内，建议通知供应商补发。质量无差异。",
          warnings: ["数量短少 15 片，已通知供应商补发"],
        },
      },
      {
        id: "s8-4",
        title: "报告归档推送",
        description:
          "验收完成后，AI 自动生成验收报告，电子归档并同步推送至采购部、财务部。",
        visualType: "extraction-cards",
        visualData: {
          cards: [
            { label: "验收报告编号", value: "GRN-2026-0842", confidence: 100 },
            { label: "验收结论", value: "合格（数量短少 15 片，供应商补发中）", confidence: 100 },
            { label: "归档状态", value: "已电子归档 ✓", confidence: 100 },
            { label: "推送采购部", value: "已推送 ✓", confidence: 100 },
            { label: "推送财务部", value: "已推送 ✓", confidence: 100 },
            { label: "供应商通知", value: "已发送补发通知 ✓", confidence: 100 },
            { label: "下次跟进", value: "3 天后确认补发到货", confidence: 98 },
          ],
        },
        result: {
          summary:
            "验收报告归档完成，同步推送至采购部和财务部。供应商补发通知已发送。",
          highlights: ["全流程电子化", "多部门同步推送", "自动归档"],
        },
      },
    ],
  },

  // ---- Step 9: 发票处理与账单核对 ----
  {
    stepId: "step-9",
    stages: [
      {
        id: "s9-1",
        title: "OCR 识别发票信息",
        description:
          "AI 对供应商发票进行 OCR 扫描识别，自动提取票面核心信息——发票号码、金额、税额、开票日期等。",
        visualType: "document-scan",
        visualData: {
          documentTitle: "增值税专用发票 — 深圳鹏发电子",
          documentType: "invoice",
          extractedFields: [
            { label: "发票代码", value: "4400221130", confidence: 99, highlighted: true },
            { label: "发票号码", value: "28374619", confidence: 99, highlighted: true },
            { label: "开票日期", value: "2026-07-25", confidence: 98, highlighted: true },
            { label: "销售方", value: "深圳鹏发电子材料有限公司", confidence: 99, highlighted: true },
            { label: "购买方", value: "我方公司", confidence: 100 },
            { label: "货物名称", value: "PCB-FR4-1.6mm-2L 双面板", confidence: 98, highlighted: true },
            { label: "数量", value: "50,000 片", confidence: 97 },
            { label: "金额(不含税)", value: "¥522,123.89", confidence: 96, highlighted: true },
            { label: "税率", value: "13%", confidence: 99 },
            { label: "税额", value: "¥67,876.11", confidence: 98, highlighted: true },
            { label: "价税合计", value: "¥590,000.00", confidence: 99, highlighted: true },
          ],
          annotations: [
            { text: "核心金额字段已高亮", type: "info" },
            { text: "OCR 识别准确率 > 99%", type: "success" },
          ],
        },
        result: {
          summary:
            "发票 OCR 识别完成。11 个关键字段已自动提取，识别准确率 99.2%。",
          highlights: ["OCR 识别准确率 99.2%", "11 个字段自动提取"],
        },
      },
      {
        id: "s9-2",
        title: "发票联网验真",
        description:
          "AI 自动对接税务系统 API，验证发票真伪、状态（正常/作废/红冲）和有效性。",
        visualType: "extraction-cards",
        visualData: {
          cards: [
            { label: "发票真伪", value: "真实 ✓", confidence: 100 },
            { label: "发票状态", value: "正常 ✓", confidence: 100 },
            { label: "是否作废", value: "否 ✓", confidence: 100 },
            { label: "是否红冲", value: "否 ✓", confidence: 100 },
            { label: "认证状态", value: "已认证 ✓", confidence: 100 },
            { label: "认证日期", value: "2026-07-26", confidence: 98 },
            { label: "销售方状态", value: "正常经营 ✓", confidence: 96 },
          ],
        },
        result: {
          summary:
            "发票验真通过。发票为真实有效的增值税专用发票，销售方经营状态正常。",
          highlights: ["验真通过", "发票状态正常", "可正常抵扣"],
        },
      },
      {
        id: "s9-3",
        title: "三单匹配校验",
        description:
          "AI 自动执行三单匹配——采购订单(PO)、入库单(GRN)和发票(Invoice)的核心数据比对。",
        visualType: "data-comparison",
        visualData: {
          title: "三单匹配校验表",
          columns: [
            { key: "field", label: "校验字段" },
            { key: "po", label: "采购订单" },
            { key: "grn", label: "入库单" },
            { key: "invoice", label: "发票" },
            { key: "match", label: "匹配结果" },
          ],
          rows: [
            { field: { value: "供应商" }, po: { value: "鹏发电子" }, grn: { value: "鹏发电子" }, invoice: { value: "鹏发电子" }, match: { value: "匹配 ✓", status: "best" } },
            { field: { value: "产品名称" }, po: { value: "PCB-FR4..." }, grn: { value: "PCB-FR4..." }, invoice: { value: "PCB-FR4..." }, match: { value: "匹配 ✓", status: "best" } },
            { field: { value: "数量" }, po: { value: "50,000" }, grn: { value: "49,985" }, invoice: { value: "50,000" }, match: { value: "差异 ⚠️", status: "warning" } },
            { field: { value: "单价" }, po: { value: "¥11.80" }, grn: { value: "¥11.80" }, invoice: { value: "¥11.80" }, match: { value: "匹配 ✓", status: "best" } },
            { field: { value: "金额" }, po: { value: "¥590,000" }, grn: { value: "¥589,823" }, invoice: { value: "¥590,000" }, match: { value: "差异 ⚠️", status: "warning" } },
            { field: { value: "税率" }, po: { value: "13%" }, grn: { value: "—" }, invoice: { value: "13%" }, match: { value: "匹配 ✓", status: "best" } },
          ],
          summary: [
            { label: "匹配项", value: "4/6" },
            { label: "差异项", value: "2 项" },
            { label: "差异率", value: "< 0.03%" },
          ],
        },
        result: {
          summary:
            "三单匹配 4/6 项完全匹配。数量差异(少15片)和金额差异(¥177)均因验收短少数导致，在可接受范围内。建议按实收数量付款。",
          highlights: ["单价、税率、供应商完全匹配"],
          warnings: ["数量差异 0.03% — 建议按实收数调整付款金额为 ¥589,823"],
        },
      },
      {
        id: "s9-4",
        title: "生成供应商对账单",
        description:
          "AI 自动生成标准化供应商对账单，线上推送给供应商确认，留存电子对账凭证。",
        visualType: "report-view",
        visualData: {
          title: "供应商对账单 — 2026年7月",
          sections: [
            {
              heading: "交易摘要",
              content:
                "供应商：深圳鹏发电子材料有限公司。本期交易 1 笔，采购 PCB-FR4-1.6mm-2L 双面板。",
              metrics: [
                { label: "交易笔数", value: "1 笔" },
                { label: "发票金额", value: "¥590,000" },
                { label: "建议付款", value: "¥589,823" },
                { label: "差异金额", value: "¥177" },
              ],
            },
            {
              heading: "差异说明",
              content:
                "差异 ¥177 因实收数短少 15 片（0.03%）。建议付款金额按实收数计算为 ¥589,823。供应商已确认补发 15 片。",
            },
            {
              heading: "对账结果",
              content:
                "对账单已线上推送至供应商。供应商需在 3 个工作日内确认。确认后生成电子对账凭证，双方留存。",
            },
          ],
        },
        result: {
          summary:
            "供应商对账单已生成并线上推送。建议付款金额 ¥589,823（按实收调整）。等待供应商 3 个工作日内确认。",
          highlights: [
            "对账单自动生成",
            "差异自动标注",
            "线上推送确认",
            "电子凭证留存",
          ],
        },
      },
    ],
  },

  // ---- Step 10: 单据整理归档 ----
  {
    stepId: "step-10",
    stages: [
      {
        id: "s10-1",
        title: "收集全流程电子单据",
        description:
          "AI 自动遍历整个采购流程，收集所有环节产生的电子单据——需求单、报价单、合同、验收单、发票、付款凭证等。",
        visualType: "file-organization",
        visualData: {
          folders: [
            {
              name: "📋 需求与计划",
              files: [
                { name: "客户需求邮件.pdf", status: "indexed" },
                { name: "标准化需求单 PR-2026-0842.pdf", status: "indexed" },
              ],
              completeness: 100,
            },
            {
              name: "💰 询价与比价",
              files: [
                { name: "鹏发电子报价单.pdf", status: "indexed" },
                { name: "创达电路报价单.pdf", status: "indexed" },
                { name: "金百泽报价单.pdf", status: "indexed" },
                { name: "生益电子报价单.pdf", status: "indexed" },
                { name: "比价分析报告.pdf", status: "indexed" },
              ],
              completeness: 100,
            },
            {
              name: "📝 合同文件",
              files: [
                { name: "销售合同 SC-2026-0842.pdf", status: "indexed" },
                { name: "采购合同 SC-PROC-2026-0842.pdf", status: "indexed" },
                { name: "合同审批记录.pdf", status: "indexed" },
              ],
              completeness: 100,
            },
            {
              name: "🚚 物流与验收",
              files: [
                { name: "物流轨迹记录.pdf", status: "indexed" },
                { name: "货物验收单 GRN-2026-0842.pdf", status: "indexed" },
                { name: "质检报告.pdf", status: "indexed" },
                { name: "短少补发确认函.pdf", status: "indexed" },
              ],
              completeness: 100,
            },
            {
              name: "🧾 发票与付款",
              files: [
                { name: "增值税发票.pdf", status: "indexed" },
                { name: "付款申请单 PAY-2026-0842.pdf", status: "indexed" },
                { name: "付款凭证.pdf", status: "indexed" },
                { name: "供应商对账单.pdf", status: "indexed" },
              ],
              completeness: 100,
            },
          ],
        },
        result: {
          summary:
            "全流程 18 份电子单据已收集完成，涵盖需求、询价、合同、物流、验收、发票、付款全链路。",
          highlights: ["18 份单据自动收集", "5 大类自动分类"],
        },
      },
      {
        id: "s10-2",
        title: "AI 智能分类归档",
        description:
          "AI 按订单号、供应商、时间、单据类型等多维度自动建立分类索引，支持多路径检索。",
        visualType: "file-organization",
        visualData: {
          folders: [
            {
              name: "按订单号：SO-2026-0842",
              files: [
                { name: "📋 需求单 PR-2026-0842", status: "indexed" },
                { name: "💰 比价报告", status: "indexed" },
                { name: "📝 销售合同", status: "indexed" },
                { name: "📝 采购合同", status: "indexed" },
                { name: "🚚 物流记录", status: "indexed" },
                { name: "📦 验收单", status: "indexed" },
                { name: "🧾 发票", status: "indexed" },
                { name: "💳 付款凭证", status: "indexed" },
              ],
              completeness: 100,
            },
            {
              name: "按供应商：深圳鹏发电子",
              files: [
                { name: "供应商档案.pdf", status: "indexed" },
                { name: "报价单 (本批).pdf", status: "indexed" },
                { name: "采购合同.pdf", status: "indexed" },
                { name: "补发确认函.pdf", status: "indexed" },
                { name: "对账单.pdf", status: "indexed" },
              ],
              completeness: 95,
            },
            {
              name: "按时间：2026年7月",
              files: [
                { name: "2026-07-20 物流出库", status: "indexed" },
                { name: "2026-07-24 货物签收", status: "indexed" },
                { name: "2026-07-25 验收入库", status: "indexed" },
                { name: "2026-07-25 发票开具", status: "indexed" },
                { name: "2026-07-26 发票认证", status: "indexed" },
              ],
              completeness: 100,
            },
          ],
        },
        result: {
          summary:
            "18 份单据已按 3 个维度交叉索引归档：订单号、供应商、时间线。支持关键词、单号、客户、供应商快速检索。",
          highlights: ["3 维度交叉索引", "支持全文关键词检索", "检索响应 < 0.5 秒"],
        },
      },
      {
        id: "s10-3",
        title: "建立索引库",
        description:
          "AI 为每份单据生成结构化元数据标签，建立可搜索的索引数据库。",
        visualType: "extraction-cards",
        visualData: {
          cards: [
            { label: "索引记录", value: "18 条", confidence: 100 },
            { label: "元数据标签", value: "126 个", confidence: 100 },
            { label: "搜索关键词", value: "已自动生成", confidence: 98 },
            { label: "关联关系", value: "全链路已建立", confidence: 100 },
            { label: "索引语言", value: "中文 + 英文", confidence: 100 },
            { label: "可检索字段", value: "单号/客户/供应商/产品/日期/金额", confidence: 98 },
          ],
        },
        result: {
          summary:
            "索引库已建立，18 条记录、126 个元数据标签。支持 6 种检索字段和全文关键词搜索。",
          highlights: ["126 个标签自动生成", "6 种检索维度"],
        },
      },
      {
        id: "s10-4",
        title: "完整性检查与云端备份",
        description:
          "AI 检查全流程单据完整性，标记缺失项，并将所有单据自动备份至云端知识库。",
        visualType: "file-organization",
        visualData: {
          folders: [
            {
              name: "✅ 已归档 (18/20)",
              files: [
                { name: "需求类：2/2 份 ✓", status: "indexed" },
                { name: "询价类：5/5 份 ✓", status: "indexed" },
                { name: "合同类：3/3 份 ✓", status: "indexed" },
                { name: "物流类：4/4 份 ✓", status: "indexed" },
                { name: "发票类：4/4 份 ✓", status: "indexed" },
              ],
              completeness: 90,
            },
            {
              name: "⚠️ 缺失项 (2)",
              files: [
                { name: "东山精密补发询价回复.pdf", status: "missing" },
                { name: "短少补发到货确认函.pdf", status: "pending" },
              ],
              completeness: 0,
            },
            {
              name: "☁️ 云端备份",
              files: [
                { name: "主备份：阿里云 OSS", status: "indexed" },
                { name: "灾备：AWS S3 (自动同步)", status: "indexed" },
              ],
              completeness: 100,
            },
          ],
        },
        result: {
          summary:
            "完整性检查：18/20 份单据已归档，2 份待补齐（东山精密报价、补发到货确认）。云端双备份已完成。",
          highlights: [
            "归档完整度 90%",
            "云端双备份(国内+海外)",
            "替代纸质存档",
          ],
          warnings: ["2 份单据缺失：东山精密报价、补发到货确认函"],
        },
      },
    ],
  },
]
