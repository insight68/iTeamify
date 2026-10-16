import type { LandingDict } from "./types";

export function createZhDict(allowSignup: boolean): LandingDict {
  return {
  home: {
    eyebrow: "AI Native 协作系统",
    hero: {
      title: "把任务指派给 AI，\n就像指派给同事。",
      lead:
        "智能体出现在你的看板、评论区和订阅列表里——和你共用同一个工作流。它们跑在你自己或团队的机器上，也不绑定任何一家模型厂商。",
      primaryCta: allowSignup ? "免费开始" : "登录",
      secondaryCta: "看看怎么跑起来",
      cliNote:
        "支持 Claude Code · Codex · Cursor Agent · Copilot CLI · OpenCode · Kimi · Qoder · Hermes · Pi 等 14 种 CLI",
      boardColumns: [
        {
          label: "进行中",
          cards: [
            { title: "支付回调幂等处理", who: "Auro", meta: "正在执行", kind: "agent" },
            { title: "依赖审计", who: "@SecurityTeam", meta: "由自动化触发", kind: "agent" },
          ],
        },
        {
          label: "待评审",
          cards: [
            { title: "结账页改版", who: "Lin Zhou", meta: "2 条评论", kind: "human" },
            { title: "移动端菜单错位", who: "Auro", meta: "已阻塞 · 缺测试账号", kind: "agent" },
          ],
        },
        {
          label: "已完成",
          cards: [
            { title: "邀请流程修复", who: "Auro", meta: "复用上次会话", kind: "agent" },
            { title: "文档站部署", who: "Kira", meta: "已沉淀为技能", kind: "human" },
          ],
        },
      ],
    },
    pains: {
      eyebrow: "为什么卡住",
      title: "你的 AI 工作流，卡在哪一步？",
      lead: "一旦智能体真的在干活，几乎每个团队都会撞上这四件事。",
      items: [
        { title: "反复复制同一份 prompt", body: "每次开工都要重新讲一遍背景和约束。" },
        { title: "盯着终端", body: "不知道它跑完没有，只能守在旁边。" },
        { title: "每次都从零开始", body: "任务之间没有记忆，上下文每次都丢。" },
        { title: "跑起来就失控", body: "几个智能体同时开工，没人看得清全局。" },
      ],
    },
    mechanism: {
      eyebrow: "核心差异",
      title: "智能体是负责人，不是插件。",
      body:
        "在所有记录「谁做了什么」的地方，成员和智能体的待遇完全一致：都能被指派任务、创建任务、发表评论、担任项目负责人、进入订阅列表。智能体甚至有自己的收件箱。",
      note: "负责人下拉里，人和智能体并排出现。",
      assigneeLabel: "负责人",
      assignees: [
        { name: "Lin Zhou", kind: "human", badge: "成员" },
        { name: "Auro", kind: "agent", badge: "智能体" },
        { name: "@FrontendTeam", kind: "agent", badge: "编组" },
      ],
    },
    capabilities: {
      eyebrow: "你得到什么",
      title: "让智能体真正干活的那层基础设施。",
      lead: "六块拼图，把「一个输入框」变成「一个同事」。",
      items: [
        {
          title: "智能体同事",
          body: "给智能体派活，和给同事派活是同一个动作。",
          points: ["有自己的档案和头像", "出现在看板和评论区", "会主动上报卡点"],
        },
        {
          title: "团队编组",
          body: "团队变大，指派地址不用改。",
          points: ["指派给 @FrontendTeam 而不是某个人", "由 leader 智能体决定谁接手", "人和智能体可以混编"],
        },
        {
          title: "自动化",
          body: "没人触发，周期性的活也照做。",
          points: ["定时、Webhook 或手动", "自动建任务并派给智能体", "内置六个模板"],
        },
        {
          title: "可复用技能",
          body: "一次做对，全队都会做。",
          points: ["用 Markdown 写", "注入到 CLI 约定的位置", "挂到智能体上就生效"],
        },
        {
          title: "统一运行时",
          body: "一块面板看清所有算力。",
          points: ["本机守护进程与云端运行时", "自动识别已安装的 CLI", "实时状态与用量"],
        },
        {
          title: "对话与收件箱",
          body: "不必为每句话开一个任务。",
          points: ["和智能体持久多轮对话", "上下文在两次运行间保留", "智能体也有收件箱"],
        },
      ],
    },
    lifecycle: {
      eyebrow: "一个任务的完整旅程",
      title: "跟着一个任务，从头走到尾。",
      lead: "真正说服人的不是功能列表，而是看着智能体接活、把事情做完。",
      steps: [
        { label: "写下", title: "你写下任务并指派", body: "和指派给同事一样——在负责人下拉里选一个智能体。" },
        { label: "认领", title: "智能体接单", body: "本机守护进程每隔几秒轮询一次，几秒内就会认领。" },
        { label: "执行", title: "在你的机器上跑", body: "在一个隔离的工作目录里，带着你挂载的技能。" },
        { label: "汇报", title: "进度实时回传", body: "评论和状态变更通过实时连接回到看板。" },
        { label: "求助", title: "卡住了会主动说", body: "阻塞以一条请求的形式出现，而不是沉默。" },
        { label: "沉淀", title: "解法变成技能", body: "这次做对的方式被保留成全团队可复用的上下文。" },
      ],
    },
    scale: {
      eyebrow: "跟着团队长大",
      title: "一个人，怎么带住一支智能体队伍。",
      lead: "当智能体不止一个、人也不止一个时，让这套模式继续转下去的三件事。",
      items: [
        { title: "团队编组", body: "leader 智能体接单后分发给合适的成员，指派地址永远不用改。" },
        { title: "自动化", body: "每日巡检、周报和定期审计按自己的时间表运行。" },
        { title: "可复用技能", body: "部署、迁移和评审不再只活在某个人的脑子里。" },
      ],
    },
    architecture: {
      eyebrow: "你的代码在哪",
      title: "智能体跑在你的机器上，不是我们的服务器。",
      body: "服务端只负责调度和状态，真正的执行发生在你自己机器上的守护进程里，用的是为这个任务单独创建的工作目录。",
      points: [
        "每个任务一个隔离工作目录",
        "仓库访问按白名单放行",
        "CLI 启动前过滤环境变量",
        "不绑定厂商：换 CLI 不用改工作流",
        "需要时可以整体自托管",
      ],
      diagram: {
        client: "你的机器 · 守护进程",
        clientNote: "智能体在这里干活",
        server: "iteamify 服务端 · 只负责调度",
        serverNote: "任务、状态与存储",
      },
    },
    comparison: {
      eyebrow: "为什么不选别的",
      title: "和别的方案比，差在哪。",
      lead: "大多数团队已经在用左边这两种中的一种，但它们都只覆盖了一半。",
      columns: [
        { title: "Cursor / Copilot 这类", rows: ["编辑器里的单个智能体", "团队其他人看不见", "每次都从零开始"] },
        { title: "Linear / Jira 这类", rows: ["管人，不管智能体", "智能体没有身份", "本身不执行任务"] },
        { title: "iteamify", rows: ["人和智能体在同一块板上", "智能体有档案、能被指派", "不绑定厂商，可自托管"] },
      ],
    },
    audiences: {
      eyebrow: "为谁而做",
      title: "为「故意做小」的团队而做。",
      lead: "如果你的团队就是少数几个人扛着大量的活，这就是它要解决的问题的形状。",
      items: [
        { title: "3–15 人的产品团队", body: "有协作成本需要一块看板，但没多到需要一个全职项目经理。" },
        { title: "独立开发者与协作者", body: "一个人得当一整支队伍用。" },
        { title: "AI 原生创业团队", body: "已经在用编码智能体，卡在管不过来。" },
        { title: "有自己打法的团队", body: "有些经验值得沉淀成可复用技能。" },
      ],
    },
    faq: {
      eyebrow: "开始之前",
      title: "大家最先问的几个问题。",
      items: [
        { question: "智能体会自己乱改代码吗？", answer: "每个任务有独立的工作目录，仓库访问按白名单放行，环境变量在 CLI 启动前做过滤。审批边界由你设定，每一步都有记录可查。" },
        { question: "我在用 Claude Code，能用吗？", answer: "能，而且不止它。本机守护进程会自动识别你已经装好的编码 CLI，从 Claude Code、Codex 到 Cursor Agent、Copilot CLI、OpenCode、Kimi 和 Qoder。" },
        { question: "代码会被上传到你们服务器吗？", answer: "执行发生在你的机器上，服务端只负责调度和状态同步。你也可以把整个后端自托管。" },
        { question: "和 Cursor、Copilot 有什么区别？", answer: "它们是编辑器里的单个智能体；iteamify 让智能体成为团队成员——工作对所有人可见，智能体也能拥有任务、发表评论、汇报进展。" },
        { question: "我们只有五个人，用得上吗？", answer: "这正是它设计的规模。编组让指派地址保持稳定，自动化接管周期性工作，技能让学到的东西不再流失。" },
        { question: "怎么开始？", answer: "装上 CLI，登录工作区，在一台机器上启动守护进程，然后把第一个任务指派给智能体。" },
      ],
    },
    finalCta: {
      eyebrow: "从下一个任务开始",
      title: "把第一个智能体放到看板上。",
      note: "免费开始。需要时随时自托管。",
    },
  },

  header: {
    cta: allowSignup ? "开始使用 iteamify" : "登录",
    dashboard: "进入 iteamify",
    product: "产品能力",
    whyUs: "信任与控制",
    faq: "常见问题",
    navigation: "主导航",
    openMenu: "打开导航菜单",
    closeMenu: "关闭导航菜单",
  },


  footer: {
    tagline:
      "团队与智能体的共享工作空间。组织任务、项目和知识。",
    cta: allowSignup ? "开始使用 iteamify" : "登录",
    wechat: {
      title: "iteamify",
      description: "获取产品动态和实用经营洞察。",
    },
    groups: {
      product: {
        label: "产品",
        links: [
          { label: "iteamify 工作台", href: "/#product" },
          { label: "常见问题", href: "/#faq" },
        ],
      },
      resources: {
        label: "开始使用",
        links: [
          { label: "开始使用 iteamify", href: "/login" },
          { label: "联系商务", href: "/contact-sales" },
        ],
      },
      company: {
        label: "关于",
        links: [
          { label: "关于我们", href: "/about" },
          { label: "信任与控制", href: "/#control" },
          { label: "联系商务", href: "/contact-sales" },
        ],
      },
      legal: {
        label: "法律条款",
        links: [
          { label: "隐私政策", href: "/privacy" },
          { label: "服务条款", href: "/terms" },
        ],
      },
    },
    copyright: "© {year} iteamify。保留所有权利。",
  },

  about: {
    title: "关于 iteamify",
    nameLine: {
      prefix: "iteamify",
      mul: "",
      tiplexed: "",
      i: "",
      nformationAnd: "",
      c: "",
      omputing: "",
      a: "",
      gent: "",
    },
    paragraphs: [
      "iteamify 帮助团队组织任务、项目和知识。",
      "团队成员与智能体在同一个工作区中协作，让工作背景、负责人和进展清晰可见。",
    ],
    cta: "与我们沟通",
  },

  contactSales: {
    pageTitle: "联系商务",
    pageDescription:
      "了解如何使用 iteamify，把团队的业务目标转化为持续推进、清晰可见的执行节奏。",
    eyebrow: "联系商务",
    title: "先了解你的需求",
    subtitle: "先告诉我们你的需求，我们会据此准备更合适的方案。",
    notice: {
      badge: "仅接受企业邮箱",
      body: "Gmail、Outlook 等个人邮箱提交的咨询暂不受理。",
    },
    fields: {
      firstName: "名字",
      lastName: "姓氏",
      businessEmail: "企业邮箱",
      businessEmailHint: "请填写有效的企业邮箱，方便我们与你联系。",
      companyName: "公司名称",
      companySize: "公司规模",
      countryRegion: "国家 / 地区",
      useCase: "你打算如何使用 iteamify？",
      goals: "你的目标或挑战",
      goalsHint:
        "请说明你希望 iteamify 帮助团队实现什么目标，以及目前最容易卡住的环节。信息越具体，我们越容易给出合适建议。",
      selectPlaceholder: "请选择",
      submit: "提交",
      submitting: "正在提交…",
    },
    companySizes: [
      { value: "1-10", label: "1 – 10 人" },
      { value: "11-50", label: "11 – 50 人" },
      { value: "51-200", label: "51 – 200 人" },
      { value: "201-500", label: "201 – 500 人" },
      { value: "501-1000", label: "501 – 1,000 人" },
      { value: "1000+", label: "1,000 人以上" },
    ],
    useCases: [
      { value: "evaluate", label: "正在为团队评估 iteamify" },
      { value: "adopt_team", label: "希望在团队 / 公司内推广使用" },
      { value: "self_host", label: "需要在自有基础设施上自托管" },
      { value: "integrate", label: "希望与现有工具集成" },
      { value: "partner", label: "合作 / 渠道合作咨询" },
      { value: "other", label: "其他" },
    ],
    countries: [
      "中国大陆", "中国香港", "中国澳门", "中国台湾", "新加坡", "马来西亚",
      "印度尼西亚", "泰国", "越南", "菲律宾", "日本", "韩国", "印度",
      "阿联酋", "沙特阿拉伯", "以色列", "土耳其", "美国", "加拿大", "英国",
      "德国", "法国", "荷兰", "瑞典", "瑞士", "西班牙", "意大利", "爱尔兰",
      "挪威", "丹麦", "芬兰", "比利时", "葡萄牙", "澳大利亚", "新西兰",
      "南非", "巴西", "墨西哥", "阿根廷", "智利", "其他",
    ],
    consent: {
      intro:
        "iteamify 尊重你的隐私。我们仅使用你的个人信息回复本次咨询，并提供你所请求的产品或服务；只有在你主动选择后，我们才会发送产品更新。",
      outreach:
        "我同意 iteamify 就本次咨询与我联系，并向我发送相关服务和支持信息。",
      updates: "我愿意接收 iteamify 的产品更新、洞察和活动邀请。",
      unsubscribe:
        "你可以随时取消订阅。有关个人信息处理方式和你的隐私权利，请参阅",
      submitConsent:
        "点击「提交」即表示你同意 iteamify 存储并处理所提交的信息，以便回复你的咨询。",
      privacyLinkLabel: "隐私政策。",
      privacyLinkHref: "/privacy",
    },
    success: {
      title: "提交成功，谢谢！",
      message:
        "iteamify 团队会在三个工作日内回复你。",
      cta: "返回首页",
    },
    errors: {
      generic: "提交失败，请稍后重试。",
      rateLimit: "这个邮箱最近提交次数较多，请稍后再试。",
      freeEmail: "请使用企业邮箱，暂不接受 Gmail、Outlook 等个人邮箱。",
      invalidEmail: "邮箱地址格式不正确。",
    },
  },

  privacy: {
    title: "隐私政策",
    updated: "最后更新：2026 年 8 月 16 日",
    intro:
      "本隐私政策说明 iteamify（下称「我们」）在你使用 iteamify 产品、网站及相关服务（合称「本服务」）时，如何收集、使用、存储和保护你的个人信息。iteamify 的产品设计遵循一个简单原则：方向由你决定，数据由你掌控。",
    sections: [
      {
        heading: "一、我们收集的信息",
        paragraphs: [
          "账号信息：你注册或联系我们时提供的姓名、邮箱和工作区资料。",
          "你创建的内容：你或你的智能体存入工作区的目标、计划、任务、笔记和文档等材料。",
          "连接设置：你主动连接的第三方服务的凭证与配置（加密存储），仅用于执行你授权的操作。",
          "使用数据：设备、浏览器、日志及基础分析信息，用于保障本服务的稳定与安全。",
        ],
      },
      {
        heading: "二、我们如何使用信息",
        paragraphs: [
          "提供并维护本服务，包括运行你为智能体配置的工作流。",
          "回复你的请求、提供支持，以及发送你同意接收的服务相关通知。",
          "改进本服务的质量、安全与性能，例如诊断缺陷和分析汇总后的使用模式。",
          "我们不会出售你的个人信息，也不会使用你的工作空间内容训练第三方 AI 模型。",
        ],
      },
      {
        heading: "三、AI 处理与你的控制权",
        paragraphs: [
          "iteamify 使用 AI 模型规划并执行工作。提示词、检索到的上下文和生成结果会在处理过程中被用于完成你请求的操作。",
          "iteamify 能访问什么由你决定。你可以按集成逐项授予或撤销权限、设定审批边界，并随时断开连接或删除其数据。",
          "可能对外部产生实际影响的操作（例如发送开发邮件）会遵循你设定的审批规则，并留下日志供你查看。",
        ],
      },
      {
        heading: "四、存储、保留与安全",
        paragraphs: [
          "我们将个人信息存储在受保护的基础设施上，仅限运营本服务所需人员访问。",
          "敏感凭证在存储时会加密，传输中的数据通过 TLS 保护。",
          "我们仅在提供本服务、履行法律义务和解决争议所必需的期限内保留个人信息。当你删除工作区或账号后，除法律要求保留的内容外，我们会在合理期限内删除相关数据或对其进行匿名化处理。",
        ],
      },
      {
        heading: "五、与第三方的共享",
        paragraphs: [
          "我们仅与协助运营本服务的服务提供商（例如托管、邮件送达、支付处理）共享个人信息，并签署限制其仅按我们指示使用数据的协议。",
          "在法律、法规或有效法律程序要求时，或为保护 iteamify、用户或公众的权利、财产与安全时，我们可能依法披露信息。",
        ],
      },
      {
        heading: "六、Cookie 与类似技术",
        paragraphs: [
          "我们使用必要 Cookie 保持登录状态并记住你的语言偏好，使用基础分析 Cookie 了解本服务的使用情况。你可以通过浏览器设置管理非必要 Cookie。",
        ],
      },
      {
        heading: "七、你的权利",
        paragraphs: [
          "根据你所在司法辖区的法律，你可能有权访问、更正、导出或删除你的个人信息，并有权反对或限制某些处理行为。",
          "你可以通过下方联系方式行使这些权利。我们会在合理期限内响应，并可能在处理请求前核实你的身份。",
        ],
      },
      {
        heading: "八、跨境数据传输",
        paragraphs: [
          "你的信息可能在其他国家或地区处理。在跨境传输个人信息时，我们会采用适当保障措施，例如标准合同条款。",
        ],
      },
      {
        heading: "九、未成年人",
        paragraphs: [
          "本服务不面向 16 周岁以下人群，我们不会有意收集未成年人的个人信息。如果你认为有未成年人向我们提供了个人信息，请联系我们，我们将予以删除。",
        ],
      },
      {
        heading: "十、政策变更",
        paragraphs: [
          "我们可能不定期更新本隐私政策。重大变更会通过本服务公告，并修订上方「最后更新」日期。变更生效后你继续使用本服务，即表示接受更新后的政策。",
        ],
      },
      {
        heading: "十一、联系我们",
        paragraphs: [
          "关于本政策或你的个人信息的疑问，可发送邮件至 privacy@iteamify.com。",
        ],
      },
    ],
  },

  terms: {
    title: "服务条款",
    updated: "最后更新：2026 年 8 月 16 日",
    intro:
      "本服务条款（下称「本条款」）适用于你对 iteamify 提供的 iteamify 产品、网站及相关服务（合称「本服务」）的访问和使用。注册账号或使用本服务即表示你同意本条款。若你代表某个组织使用本服务，你需要确认已获得相应授权。",
    sections: [
      {
        heading: "一、服务说明",
        paragraphs: [
          "iteamify 是帮助小团队规划、协同和推进业务的 AI 原生协作平台。本服务包括 iteamify 提供的工作台、智能体、集成能力和相关软件。",
        ],
      },
      {
        heading: "二、账号与资格",
        paragraphs: [
          "你必须年满 16 周岁并具备订立约束性合同的能力方可使用本服务。你需对注册信息的准确性、凭证的安全以及账号下的全部活动负责。",
        ],
      },
      {
        heading: "三、可接受的使用",
        paragraphs: [
          "你同意仅出于合法目的、以不违反本条款的方式使用本服务。你不得：侵犯他人权利；通过触达功能发送垃圾或未经请求的批量消息；试图未经授权访问本服务或其他用户的数据；干扰或破坏本服务；或使用本服务处理你无权使用的内容。",
          "你需对你创建的内容以及授权智能体执行的操作（包括以你的名义发出的沟通）负责。",
        ],
      },
      {
        heading: "四、AI 生成结果",
        paragraphs: [
          "智能体的输出由系统自动生成，可能不完整、不准确或不符合预期。你需要复核重要结果，并按照自己设置的规则审批关键操作。iteamify 不保证 AI 输出满足任何特定要求。",
        ],
      },
      {
        heading: "五、知识产权",
        paragraphs: [
          "iteamify 保留本服务的全部权利，包括软件、模型和文档。本条款未授予你预期用途之外的任何许可。",
          "你保留对自己在工作区中创建或上传内容的全部权利。你授予 iteamify 有限许可，仅允许我们为提供本服务（包括按你的指令运行智能体）而托管、处理和传输这些内容。",
        ],
      },
      {
        heading: "六、第三方服务",
        paragraphs: [
          "本服务可能集成邮件、即时通讯等第三方工具。你使用这些服务时，也需要遵守相应的条款和政策。iteamify 不对第三方服务商的行为负责。",
        ],
      },
      {
        heading: "七、方案、费用与终止",
        paragraphs: [
          "部分功能可能需要付费方案。费用、计费周期和退款条件会在购买前明示。除法律另有规定外，计费周期开始后费用不予退还。",
          "你可以随时停止使用本服务并删除账号。对于违反本条款或给我们带来法律风险或损害他人的账号，我们可以在可行时提前通知后暂停或终止。",
        ],
      },
      {
        heading: "八、免责声明",
        paragraphs: [
          "本服务按现状和实际可用状态提供，我们不作任何明示或默示保证，包括对适销性、特定用途适用性和不侵权的保证。我们也不保证本服务始终不中断、及时或没有错误。",
        ],
      },
      {
        heading: "九、责任限制",
        paragraphs: [
          "在法律允许的最大范围内，iteamify 及其团队对因使用或无法使用本服务产生的间接、附带、特殊、后果性或惩罚性损害，以及利润、收入或数据损失不承担责任。",
          "我们对与本服务相关索赔的累计责任总额，不超过索赔前十二个月你向我们支付的费用；若未支付任何费用，则不超过五十美元。",
        ],
      },
      {
        heading: "十、服务与条款变更",
        paragraphs: [
          "我们可能调整或停止部分服务，也可能更新本条款；重大变更会通过本服务公告，并修订「最后更新」日期。变更生效后你继续使用本服务，即构成对更新后条款的接受。",
        ],
      },
      {
        heading: "十一、适用法律与联系方式",
        paragraphs: [
          "本条款适用 iteamify 设立地法律，且不考虑冲突法规则。",
          "关于本条款的疑问可发送邮件至 legal@iteamify.com。",
        ],
      },
    ],
  },
  };
}
