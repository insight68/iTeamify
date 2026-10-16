import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  CircleDollarSign,
  Compass,
  ExternalLink,
  FileSignature,
  FileText,
  FolderKanban,
  Globe2,
  GraduationCap,
  Landmark,
  Languages,
  LayoutTemplate,
  MessageSquare,
  Mic2,
  PackageOpen,
  PlayCircle,
  ReceiptText,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Video,
  WalletCards,
} from "lucide-react";
import { cn } from "@iteamify/ui/lib/utils";
import type { MarketingLocale } from "@/lib/marketing-i18n";
import type { MarketingSession } from "@/lib/marketing-session";
import { BrandMark } from "./brand-mark";
import { DynamicCreatorNoun } from "./dynamic-creator-noun";
import { LandingFooter } from "./landing-footer";
import { LandingHeader } from "./landing-header";

const platformHrefs = {
  Fiverr: "https://www.fiverr.com/",
  Upwork: "https://www.upwork.com/",
  Freelancer: "https://www.freelancer.com/",
  italki: "https://www.italki.com/",
  Preply: "https://preply.com/",
  Voquent: "https://www.voquent.com/",
  Voices: "https://www.voices.com/",
  Gumroad: "https://gumroad.com/",
  Payhip: "https://payhip.com/",
  Etsy: "https://www.etsy.com/",
  "Creative Market": "https://creativemarket.com/",
  "Canva Creators": "https://www.canva.com/creators/",
  Udemy: "https://www.udemy.com/",
  Skillshare: "https://www.skillshare.com/",
  YouTube: "https://www.youtube.com/",
  TikTok: "https://www.tiktok.com/",
} as const;

type Platform = {
  name: keyof typeof platformHrefs;
  description: string;
  tags: readonly string[];
};

type Pathway = {
  number: string;
  title: string;
  description: string;
  signal: string;
  icon: typeof BriefcaseBusiness;
  platforms: readonly Platform[];
};

type OperatingTool = {
  name: string;
  href: string;
  description: string;
  note: string;
};

type ToolkitCategory = {
  number: string;
  title: string;
  description: string;
  icon: typeof BriefcaseBusiness;
  tools: readonly OperatingTool[];
};

type NavigatorCopy = {
  hero: {
    eyebrow: string;
    titleLead: string;
    titleAccent: string;
    subtitle: string;
    primary: string;
    secondary: string;
    note: string;
  };
  logic: {
    label: string;
    title: string;
    subtitle: string;
    steps: readonly { title: string; detail: string }[];
  };
  directory: {
    label: string;
    title: string;
    subtitle: string;
    count: string;
    platformLabel: string;
    cta: string;
  };
  pathways: readonly Pathway[];
  toolkit?: {
    label: string;
    title: string;
    subtitle: string;
    count: string;
    cta: string;
    notice: string;
    categories: readonly ToolkitCategory[];
  };
  plan: {
    label: string;
    title: string;
    subtitle: string;
    primary: string;
    status: string;
    decisionTitle: string;
    decisionBody: string;
    tasks: readonly string[];
    guardrailTitle: string;
    guardrailBody: string;
  };
};

const zhCopy: NavigatorCopy = {
  hero: {
    eyebrow: "中国大陆创作者 · 出海导航",
    titleLead: "你的",
    titleAccent: "值得更大的市场。",
    subtitle:
      "从已有能力出发，把它整理成海外客户愿意购买的服务或产品，做好跨境准备，再用一条最小路径验证真实需求。平台和经营工具都列在这里，但不用一开始就注册所有账号。",
    primary: "让 iteamify 规划我的出海路径",
    secondary: "查看平台与工具",
    note: "定价、对外承诺、账号注册和最终发布始终由你决定。",
  },
  logic: {
    label: "从已有能力开始",
    title: "不必重新学一门手艺，先把现有能力变成海外客户愿意购买的服务。",
    subtitle:
      "先说清楚你能为海外客户解决什么问题，再准备英文材料，核验平台准入、结算方式和交付边界。一次只验证一条路径。",
    steps: [
      { title: "确认能力", detail: "选择你已经能稳定交付的专业能力" },
      { title: "包装服务", detail: "把能力写成买家能理解的结果与边界" },
      { title: "跨境准备", detail: "核验语言、准入、收款、税务与交付条件" },
      { title: "小步验证", detail: "选择一条路径，用真实反馈决定下一步" },
    ],
  },
  directory: {
    label: "出海平台地图",
    title: "五条出海路径，覆盖 16 个常用平台。",
    subtitle:
      "平台按经营模式分类，不按所谓的“赚钱能力”排名。你可以先了解全部选择，再挑一条路径跑通最小闭环。",
    count: "16 个平台 · 完整展示",
    platformLabel: "平台与适用方式",
    cta: "让 iteamify 规划这条路径",
  },
  pathways: [
    {
      number: "01",
      title: "专业服务接单",
      description:
        "适合设计、开发、写作、翻译、剪辑与顾问型能力。先把交付物、周期、修改次数和不包含项写清楚。",
      signal: "先验证：能否收到高质量询盘",
      icon: BriefcaseBusiness,
      platforms: [
        {
          name: "Fiverr",
          description: "把服务做成清晰套餐，用固定范围降低第一次购买成本。",
          tags: ["服务套餐", "标准交付"],
        },
        {
          name: "Upwork",
          description: "用垂直案例匹配项目需求，适合专业服务与长期合作。",
          tags: ["项目制", "作品集"],
        },
        {
          name: "Freelancer",
          description: "通过竞标寻找项目机会，需要控制投标数量与时间成本。",
          tags: ["竞标", "项目制"],
        },
      ],
    },
    {
      number: "02",
      title: "语言、教学与声音",
      description:
        "适合中文或英语教学、口语陪练、配音与声音制作。示范课、样带和稳定交付环境比泛泛介绍更重要。",
      signal: "先验证：试听或样带能否带来预约",
      icon: Mic2,
      platforms: [
        {
          name: "italki",
          description: "以一对一语言教学和口语练习验证明确的学习结果。",
          tags: ["语言教学", "一对一"],
        },
        {
          name: "Preply",
          description: "围绕特定学员、目标和排课方式建立在线辅导定位。",
          tags: ["在线辅导", "排课"],
        },
        {
          name: "Voquent",
          description: "用语言、声音类型和专业样带呈现配音与本地化能力。",
          tags: ["配音", "本地化"],
        },
        {
          name: "Voices",
          description: "适合拥有稳定录音环境和多风格样带的专业声音创作者。",
          tags: ["声音服务", "样带"],
        },
      ],
    },
    {
      number: "03",
      title: "数字产品与设计素材",
      description:
        "适合模板、字体、图形、指南、脚本和小型工具。先围绕一个明确使用场景做出最小产品，而不是堆满商店。",
      signal: "先验证：买家是否真正使用，而不只是浏览",
      icon: PackageOpen,
      platforms: [
        {
          name: "Gumroad",
          description: "适合直接售卖下载内容、会员、课程和其他数字产品。",
          tags: ["数字商品", "直接销售"],
        },
        {
          name: "Payhip",
          description: "用轻量店铺测试小型数字产品目录与直接成交。",
          tags: ["数字店铺", "自有流量"],
        },
        {
          name: "Etsy",
          description: "适合围绕买家搜索意图设计模板、打印品和数字素材。",
          tags: ["搜索发现", "模板"],
        },
        {
          name: "Creative Market",
          description: "适合完成度高、格式清楚、可重复授权的设计资产。",
          tags: ["设计素材", "授权"],
        },
        {
          name: "Canva Creators",
          description: "适合已有成熟模板作品集、愿意按平台规范持续创作的人。",
          tags: ["模板生态", "作品集申请"],
        },
      ],
    },
    {
      number: "04",
      title: "录播课程",
      description:
        "适合能把知识组织成完整学习路径的创作者。先用一节示范课验证承诺，再投入完整录制。",
      signal: "先验证：学员是否愿意学完整门课程",
      icon: GraduationCap,
      platforms: [
        {
          name: "Udemy",
          description: "适合结构完整、可以独立学习的系统性录播课程。",
          tags: ["录播课程", "课程市场"],
        },
        {
          name: "Skillshare",
          description: "适合以作品或项目带动学习过程的创意类课程。",
          tags: ["项目学习", "创意教育"],
        },
      ],
    },
    {
      number: "05",
      title: "内容与长期受众",
      description:
        "适合愿意长期建立公开作品、受众关系和内容资产的创作者。它是长期路径，不承诺首周收入。",
      signal: "先验证：是否有人持续回来观看",
      icon: Video,
      platforms: [
        {
          name: "YouTube",
          description: "用可检索的长期内容建立公开作品、受众和多元变现基础。",
          tags: ["长期内容", "视频"],
        },
        {
          name: "TikTok",
          description: "用短内容快速测试选题、开场和表现形式，再决定深度投入。",
          tags: ["短内容", "快速测试"],
        },
      ],
    },
  ],
  toolkit: {
    label: "中国服务出海工具箱",
    title: "从找到需求，到合规收款，把经营链路补完整。",
    subtitle:
      "这 36 个入口覆盖九个经营环节，但不必全部注册。先找出当前瓶颈，再让 iteamify 组合一套够用的工具。",
    count: "9 个经营环节 · 36 个官方入口",
    cta: "让 iteamify 帮我选择工具",
    notice:
      "网络可用性、开户主体要求、费率、数据跨境、电子签名效力和税务规则都会变化。这里仅列出官方入口和适用场景，不构成开户、法律或税务建议。使用前请按照最新规则逐项核验。",
    categories: [
      {
        number: "01",
        title: "需求与市场验证",
        description: "先看海外买家是否真的在搜，以及流量和竞争来自哪里。",
        icon: Search,
        tools: [
          {
            name: "Google Trends",
            href: "https://trends.google.com/trends/explore",
            description: "比较关键词在不同国家、地区和时间段的搜索兴趣。",
            note: "海外需求",
          },
          {
            name: "Google Keyword Planner",
            href: "https://ads.google.com/home/tools/keyword-planner/",
            description: "发现买家关键词，并查看搜索量和广告竞争信号。",
            note: "搜索语言",
          },
          {
            name: "Similarweb",
            href: "https://www.similarweb.com/website/",
            description: "估算竞品网站流量来源、地区和主要获客渠道。",
            note: "渠道判断",
          },
          {
            name: "Semrush",
            href: "https://www.semrush.com/analytics/keywordoverview/",
            description: "检查关键词、搜索结果和同类服务的 SEO 竞争。",
            note: "SEO 竞争",
          },
        ],
      },
      {
        number: "02",
        title: "作品与独立页面",
        description: "把零散作品整理成海外客户看得懂、信得过的案例。",
        icon: LayoutTemplate,
        tools: [
          {
            name: "Behance",
            href: "https://www.behance.net/",
            description: "展示视觉案例、创作过程和可承接的专业服务。",
            note: "创意作品",
          },
          {
            name: "Dribbble",
            href: "https://dribbble.com/",
            description: "发布设计作品切片，建立设计领域的公开证明。",
            note: "设计作品",
          },
          {
            name: "GitHub",
            href: "https://github.com/",
            description: "用代码仓库、文档和发布记录证明技术交付能力。",
            note: "技术证明",
          },
          {
            name: "Framer",
            href: "https://www.framer.com/",
            description: "快速搭建双语服务页、案例页和独立询盘入口。",
            note: "独立站",
          },
        ],
      },
      {
        number: "03",
        title: "英文与本地化",
        description: "先统一术语、语气和目标市场表达，再做人工复核。",
        icon: Languages,
        tools: [
          {
            name: "DeepL",
            href: "https://www.deepl.com/translator",
            description: "翻译服务页和文件，并用术语表保持表达一致。",
            note: "翻译与术语",
          },
          {
            name: "Grammarly",
            href: "https://www.grammarly.com/",
            description: "检查英文语法、清晰度、正式程度和品牌语气。",
            note: "英文润色",
          },
          {
            name: "LanguageTool",
            href: "https://languagetool.org/",
            description: "为多语邮件、提案和网页提供语法与风格校对。",
            note: "多语校对",
          },
          {
            name: "Lokalise",
            href: "https://lokalise.com/",
            description: "管理多语言文案、术语和本地化协作流程。",
            note: "本地化协作",
          },
        ],
      },
      {
        number: "04",
        title: "询盘、预约与会议",
        description: "把客户背景、时区、会议记录和下一步归入同一条客户线索。",
        icon: MessageSquare,
        tools: [
          {
            name: "Tally",
            href: "https://tally.so/",
            description: "制作项目询盘表和客户需求简报，减少无效往返。",
            note: "询盘表单",
          },
          {
            name: "Calendly",
            href: "https://calendly.com/",
            description: "按双方时区开放可预约时间并自动发送提醒。",
            note: "跨时区预约",
          },
          {
            name: "Zoom",
            href: "https://zoom.us/",
            description: "用于需求访谈、方案演示和远程客户会议。",
            note: "客户会议",
          },
          {
            name: "Slack",
            href: "https://slack.com/",
            description: "为长期项目建立可追踪的异步客户协作频道。",
            note: "客户协作",
          },
        ],
      },
      {
        number: "05",
        title: "提案、合同与签署",
        description: "明确服务范围、里程碑、修改次数、知识产权和付款节点。",
        icon: FileSignature,
        tools: [
          {
            name: "PandaDoc",
            href: "https://www.pandadoc.com/",
            description: "组合提案、报价、合同和电子签署流程。",
            note: "提案与签署",
          },
          {
            name: "Docusign",
            href: "https://www.docusign.com/products/electronic-signature",
            description: "发送、签署并追踪跨设备电子协议。",
            note: "电子签名",
          },
          {
            name: "Dropbox Sign",
            href: "https://sign.dropbox.com/",
            description: "为标准服务协议提供轻量电子签署入口。",
            note: "轻量签署",
          },
          {
            name: "Bonsai",
            href: "https://www.hellobonsai.com/",
            description: "管理自由职业提案、合同、客户和项目文档。",
            note: "自由职业合同",
          },
        ],
      },
      {
        number: "06",
        title: "跨境收款与资金",
        description: "根据主体类型和真实交易背景选择收款方式，不要把个人转账当作长期经营方案。",
        icon: WalletCards,
        tools: [
          {
            name: "Payoneer 派安盈",
            href: "https://www.payoneer.cn/",
            description: "查看本地收款账户、付款请求和 B2B 收付能力。",
            note: "大陆业务入口",
          },
          {
            name: "PingPong 福贸",
            href: "https://www.pingpongx.com/zh/sales/flowmore",
            description: "核验服务贸易场景下的全球收款、换汇与结汇。",
            note: "服务贸易场景",
          },
          {
            name: "LianLian Global",
            href: "https://global.lianlianpay.com/products/receiving",
            description: "查看面向外贸 B2B 与服贸企业的全球收款账户。",
            note: "服贸企业",
          },
          {
            name: "Airwallex 空中云汇",
            href: "https://www.airwallex.com/cn/business-account/global-accounts",
            description: "了解企业全球账户、多币种收款和资金管理能力。",
            note: "企业全球账户",
          },
        ],
      },
      {
        number: "07",
        title: "交付、版本与审阅",
        description: "让文件、版本、客户反馈和最终验收都有明确入口。",
        icon: FolderKanban,
        tools: [
          {
            name: "Notion",
            href: "https://www.notion.so/",
            description: "建立客户空间，集中范围、进度、会议纪要和交付。",
            note: "客户空间",
          },
          {
            name: "Trello",
            href: "https://trello.com/",
            description: "用简单看板公开任务状态、负责人和下一步。",
            note: "任务看板",
          },
          {
            name: "Frame.io",
            href: "https://frame.io/",
            description: "收集视频、音频和视觉内容的时间点批注与审批。",
            note: "媒体审阅",
          },
          {
            name: "Dropbox",
            href: "https://www.dropbox.com/",
            description: "交付大文件、管理版本并控制客户访问权限。",
            note: "文件交付",
          },
        ],
      },
      {
        number: "08",
        title: "报价、发票与记账",
        description: "商业发票和记账工具不能替代中国税务发票系统。",
        icon: ReceiptText,
        tools: [
          {
            name: "Zoho Invoice",
            href: "https://www.zoho.com/invoice/",
            description: "制作多币种报价单、商业发票和付款提醒。",
            note: "报价与发票",
          },
          {
            name: "Xero",
            href: "https://www.xero.com/",
            description: "管理多币种账务、银行流水和经营报表。",
            note: "多币种记账",
          },
          {
            name: "QuickBooks",
            href: "https://quickbooks.intuit.com/",
            description: "跟踪小企业收入、费用、发票和账务资料。",
            note: "小企业账务",
          },
          {
            name: "FreshBooks",
            href: "https://www.freshbooks.com/",
            description: "为项目制服务管理计时、费用、发票和回款。",
            note: "项目账单",
          },
        ],
      },
      {
        number: "09",
        title: "中国规则与申报入口",
        description: "先阅读官方规则，再向银行、税务机关或专业顾问确认是否适用于自己。",
        icon: Landmark,
        tools: [
          {
            name: "国家税务总局",
            href: "https://www.chinatax.gov.cn/",
            description: "核验跨境应税服务的零税率、免税和申报规则。",
            note: "税务原文",
          },
          {
            name: "国家外汇管理局",
            href: "https://www.safe.gov.cn/",
            description: "查询服务贸易外汇收支、交易单证和申报要求。",
            note: "外汇规则",
          },
          {
            name: "中国服务贸易指南网",
            href: "https://tradeinservices.mofcom.gov.cn/",
            description: "查看商务部服务贸易政策、统计、市场与行业信息。",
            note: "服贸政策",
          },
          {
            name: "服务贸易统计监测企业端",
            href: "https://fwmytj-jsmycorp.mofcom.gov.cn/corplogin.html",
            description: "进入商务部服务贸易统计监测与技术贸易业务应用。",
            note: "业务申报",
          },
        ],
      },
    ],
  },
  plan: {
    label: "iteamify 出海计划",
    title: "平台提供渠道，iteamify 帮你跑通第一条出海路径。",
    subtitle:
      "iteamify 不会代你注册账号或对外承诺价格。它会把调研、服务包装、双语材料、执行任务和复盘整理成一份可追踪的计划。",
    primary: "开始我的 iteamify 出海计划",
    status: "示例计划 · 等待你的确认",
    decisionTitle: "需要你决定",
    decisionBody: "服务承诺、价格、对外发布和平台账号操作最终由你决定。",
    tasks: [
      "选择一个能力与一个海外买家场景",
      "整理竞品和买家常用表达，形成定位依据",
      "起草中英文服务页、作品集说明与交付边界",
      "选择一条路径，在 7 天内收集真实反馈",
    ],
    guardrailTitle: "发布前核验",
    guardrailBody:
      "平台准入、地区可用性、结算方式、税务、费用和内容政策都会变化。正式开户或发布前，请按照平台最新规则逐项确认。",
  },
};

const enCopy: NavigatorCopy = {
  hero: {
    eyebrow: "Creator paths · choose the next growth move",
    titleLead: "Make your work",
    titleAccent: "easier to buy.",
    subtitle:
      "Start with the constraint in your creative business. Shape one offer, choose one channel, and run a measurable experiment instead of opening every tool at once.",
    primary: "Plan my next move with iteamify",
    secondary: "Explore every platform",
    note: "You keep control of positioning, pricing, accounts, and publication.",
  },
  logic: {
    label: "The English creator journey",
    title: "Start with the growth constraint, then choose the smallest useful experiment.",
    subtitle:
      "The useful question is not which platform is biggest. It is which business model matches the work, audience, and proof you already have.",
    steps: [
      { title: "Choose the constraint", detail: "Clients, products, teaching, or audience growth" },
      { title: "Shape the offer", detail: "One buyer, one outcome, and explicit boundaries" },
      { title: "Choose a channel", detail: "Match acquisition and delivery to the offer" },
      { title: "Run the experiment", detail: "Use a 30-day signal to decide what compounds" },
    ],
  },
  directory: {
    label: "Fixed platform map",
    title: "Four business models. Sixteen platforms in view.",
    subtitle:
      "Every platform stays visible. The grouping helps creators compare how the business works before choosing where to build it.",
    count: "16 platforms · always visible",
    platformLabel: "Platforms and operating fit",
    cta: "Plan this path with iteamify",
  },
  pathways: [
    {
      number: "01",
      title: "Win better client work",
      description:
        "Package one outcome for one buyer. Clear scope, relevant proof, and a reliable delivery system matter more than a broad capability list.",
      signal: "Primary signal: qualified buyer replies",
      icon: BriefcaseBusiness,
      platforms: [
        { name: "Upwork", description: "Match a focused profile and relevant proof to project demand.", tags: ["Projects", "Portfolio"] },
        { name: "Fiverr", description: "Turn bounded services into tiers with clear delivery and revisions.", tags: ["Packages", "Inbound"] },
        { name: "Freelancer", description: "Add project opportunities while keeping a strict cap on bidding time.", tags: ["Bids", "Projects"] },
        { name: "Voices", description: "Present professional voice work through focused demos and reliable delivery.", tags: ["Voice", "Demos"] },
        { name: "Voquent", description: "Position voice and localisation work by language, style, and use case.", tags: ["Voice", "Localisation"] },
      ],
    },
    {
      number: "02",
      title: "Teach live before scaling",
      description:
        "Use direct sessions to validate the learner, the promise, and the teaching language before investing in a complete course library.",
      signal: "Primary signal: repeat bookings and learner progress",
      icon: Languages,
      platforms: [
        { name: "italki", description: "Validate a language-learning outcome through direct one-to-one lessons.", tags: ["Languages", "Live"] },
        { name: "Preply", description: "Test a defined learner profile, schedule, and progress promise.", tags: ["Tutoring", "Scheduling"] },
      ],
    },
    {
      number: "03",
      title: "Productize what repeats",
      description:
        "Turn the artifact or method people repeatedly ask for into a product, asset collection, or self-paced transformation.",
      signal: "Primary signal: paid activation, not page views",
      icon: PackageOpen,
      platforms: [
        { name: "Gumroad", description: "Sell downloads, memberships, courses, and other digital products directly.", tags: ["Digital", "Direct"] },
        { name: "Payhip", description: "Test a focused digital catalog without building a full commerce stack.", tags: ["Storefront", "Direct"] },
        { name: "Etsy", description: "Design templates and digital assets around clear buyer search intent.", tags: ["Discovery", "Templates"] },
        { name: "Creative Market", description: "Publish polished, reusable creative assets with clear formats and use cases.", tags: ["Assets", "Licensing"] },
        { name: "Canva Creators", description: "Contribute platform-ready templates through a portfolio-led creator program.", tags: ["Templates", "Application"] },
        { name: "Udemy", description: "Package a structured transformation as a complete self-paced course.", tags: ["Courses", "On-demand"] },
        { name: "Skillshare", description: "Teach creative skills through a tangible project and learning journey.", tags: ["Creative", "Project"] },
      ],
    },
    {
      number: "04",
      title: "Build a durable audience asset",
      description:
        "Choose one recognisable topic and format. Publish consistently, measure returning attention, and connect it to an owned next step.",
      signal: "Primary signal: returning viewers and direct conversion",
      icon: PlayCircle,
      platforms: [
        { name: "YouTube", description: "Build searchable, durable video work and multiple long-term revenue paths.", tags: ["Video", "Long-term"] },
        { name: "TikTok", description: "Test hooks and repeatable short-form formats before deeper production.", tags: ["Short-form", "Discovery"] },
      ],
    },
  ],
  plan: {
    label: "The iteamify plan",
    title: "Platforms provide channels. iteamify turns one into an operating experiment.",
    subtitle:
      "iteamify keeps the research, offer draft, owners, milestones, and review in one visible plan while the decisions that require your judgment return to you.",
    primary: "Build this experiment with iteamify",
    status: "Illustrative plan · ready for review",
    decisionTitle: "Your decision",
    decisionBody: "Final positioning, pricing, commitments, account actions, and publication.",
    tasks: [
      "Choose one business constraint and one buyer or audience",
      "Map comparable offers and collect source-backed positioning evidence",
      "Draft the offer, proof, boundaries, and channel-specific presentation",
      "Run a 30-day experiment and review the signal before expanding",
    ],
    guardrailTitle: "Verify before publishing",
    guardrailBody:
      "Eligibility, regional availability, payouts, taxes, fees, and content rules change. Confirm current platform terms before acting.",
  },
};

const platformAccentClasses = [
  "bg-[#141724] text-white",
  "bg-[#ec6b59] text-white",
  "bg-[#5166d8] text-white",
  "bg-[#26745a] text-white",
  "bg-[#e6b94f] text-[#141724]",
] as const;

const toolkitAccentClasses = [
  "bg-[#edf0ff] text-[#5166d8]",
  "bg-[#fff0ec] text-[#c94f3f]",
  "bg-[#eaf6f0] text-[#26745a]",
] as const;

function SectionHeading({
  label,
  title,
  description,
  inverse = false,
}: {
  label: string;
  title: string;
  description: string;
  inverse?: boolean;
}) {
  return (
    <div className="max-w-[900px]">
      <p
        className={cn(
          "text-[11px] font-semibold uppercase tracking-[0.18em]",
          inverse ? "text-[#f58a79]" : "text-[#5166d8]",
        )}
      >
        {label}
      </p>
      <h2
        className={cn(
          "mt-5 font-[family-name:var(--font-serif)] text-[clamp(2.4rem,5vw,4.8rem)] font-medium leading-[0.98] tracking-[-0.052em] text-balance",
          inverse ? "text-white" : "text-[#141724]",
        )}
      >
        {title}
      </h2>
      <p
        className={cn(
          "mt-6 max-w-[760px] text-[15px] leading-8 sm:text-[17px]",
          inverse ? "text-white/58" : "text-[#626978]",
        )}
      >
        {description}
      </p>
    </div>
  );
}

function PlanLink({
  href,
  children,
  inverse = false,
  compact = false,
}: {
  href: string;
  children: React.ReactNode;
  inverse?: boolean;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex min-h-12 items-center justify-center gap-2 rounded-[14px] px-5 py-3 text-[13px] font-semibold transition duration-200 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#5166d8]",
        compact && "min-h-10 rounded-[12px] px-4 py-2 text-[12px]",
        inverse
          ? "bg-white text-[#141724] hover:bg-white/92"
          : "bg-[#5166d8] text-white shadow-[0_12px_30px_rgba(81,102,216,0.24)] hover:bg-[#4053bc]",
      )}
    >
      <BrandMark className="size-4" />
      {children}
      <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

function PlatformCard({ platform, index }: { platform: Platform; index: number }) {
  return (
    <a
      href={platformHrefs[platform.name]}
      target="_blank"
      rel="noreferrer"
      className="group relative flex min-h-[164px] flex-col overflow-hidden rounded-[18px] border border-[#141724]/9 bg-white/72 p-5 transition duration-200 hover:-translate-y-1 hover:border-[#5166d8]/28 hover:shadow-[0_18px_42px_rgba(20,23,36,0.08)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#5166d8]"
    >
      <div className="flex items-start justify-between gap-4">
        <span
          className={cn(
            "flex size-10 items-center justify-center rounded-[12px] font-[family-name:var(--font-serif)] text-[19px] font-semibold",
            platformAccentClasses[index % platformAccentClasses.length],
          )}
          aria-hidden
        >
          {platform.name.slice(0, 1)}
        </span>
        <ArrowDownRight className="size-4 text-[#141724]/24 transition-transform group-hover:translate-x-0.5 group-hover:translate-y-0.5 group-hover:text-[#5166d8]" aria-hidden />
      </div>
      <h4 className="mt-5 text-[17px] font-semibold tracking-[-0.025em] text-[#141724]">
        {platform.name}
      </h4>
      <p className="mt-2 text-[12px] leading-6 text-[#626978]">
        {platform.description}
      </p>
      <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
        {platform.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-[#141724]/9 bg-[#f7f5f2] px-2.5 py-1 text-[9px] font-semibold text-[#141724]/55"
          >
            {tag}
          </span>
        ))}
      </div>
    </a>
  );
}

function ToolkitCategoryCard({
  category,
  index,
}: {
  category: ToolkitCategory;
  index: number;
}) {
  const Icon = category.icon;

  return (
    <article className="overflow-hidden rounded-[24px] border border-[#141724]/10 bg-white/72 shadow-[0_18px_48px_rgba(20,23,36,0.045)]">
      <div className="border-b border-[#141724]/9 p-6 sm:p-7">
        <div className="flex items-center justify-between gap-5">
          <span className="font-mono text-[10px] text-[#141724]/34">
            TOOLKIT {category.number}
          </span>
          <span
            className={cn(
              "flex size-10 items-center justify-center rounded-[13px]",
              toolkitAccentClasses[index % toolkitAccentClasses.length],
            )}
          >
            <Icon className="size-5" aria-hidden />
          </span>
        </div>
        <h3 className="mt-8 font-[family-name:var(--font-serif)] text-[29px] font-medium leading-[1.02] tracking-[-0.04em] text-[#141724]">
          {category.title}
        </h3>
        <p className="mt-3 min-h-12 text-[12px] leading-6 text-[#626978]">
          {category.description}
        </p>
      </div>

      <ul className="divide-y divide-[#141724]/8">
        {category.tools.map((tool) => (
          <li key={tool.name}>
            <a
              href={tool.href}
              target="_blank"
              rel="noreferrer"
              className="group/tool block px-6 py-5 transition-colors hover:bg-[#edf0ff]/55 focus-visible:bg-[#edf0ff]/55 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#5166d8] sm:px-7"
            >
              <div className="flex items-center justify-between gap-5">
                <span className="text-[14px] font-semibold tracking-[-0.02em] text-[#141724]">
                  {tool.name}
                </span>
                <ExternalLink
                  className="size-3.5 shrink-0 text-[#141724]/22 transition group-hover/tool:-translate-y-0.5 group-hover/tool:translate-x-0.5 group-hover/tool:text-[#5166d8]"
                  aria-hidden
                />
              </div>
              <p className="mt-2 text-[11px] leading-5 text-[#626978]">
                {tool.description}
              </p>
              <span className="mt-3 inline-flex rounded-full border border-[#141724]/8 bg-[#f7f5f2] px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.08em] text-[#141724]/45">
                {tool.note}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </article>
  );
}

export function CreatorNavigatorPage({
  locale,
  session,
}: {
  locale: MarketingLocale;
  session: MarketingSession;
}) {
  const copy = locale === "zh-Hans" ? zhCopy : enCopy;
  const isZh = locale === "zh-Hans";
  const ctaLabel = session.isAuthenticated
    ? isZh
      ? "进入 iteamify 继续规划"
      : "Open iteamify to continue"
    : copy.hero.primary;

  return (
    <div className="iteamify-marketing relative overflow-hidden bg-[#f7f5f2] text-[#141724] [--iteamify-line:#dbdee6] [--iteamify-muted:#626978]">
      <LandingHeader variant="brand" />
      <main>
        <section className="relative isolate overflow-hidden px-4 pb-24 pt-36 sm:px-6 sm:pb-28 sm:pt-44 lg:px-8">
          <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-[820px] max-w-[1500px]" aria-hidden>
            <div className="absolute left-[-14%] top-[-8%] h-[520px] w-[620px] rounded-full bg-[#f06d5c]/14 blur-[100px]" />
            <div className="absolute right-[-16%] top-[12%] h-[560px] w-[680px] rounded-full bg-[#5166d8]/16 blur-[115px]" />
            <div className="absolute bottom-10 right-[7%] size-[360px] rounded-full border border-[#5166d8]/10 shadow-[0_0_0_56px_rgba(81,102,216,0.025),0_0_0_112px_rgba(81,102,216,0.018)]" />
          </div>

          <div className="mx-auto grid max-w-[1240px] items-end gap-14 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.6fr)]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.19em] text-[#5166d8] sm:text-[12px]">
                {copy.hero.eyebrow}
              </p>
              <h1
                aria-label={
                  isZh
                    ? "你的技能、品位、审美、能力与手艺，值得更大的市场。"
                    : `${copy.hero.titleLead} ${copy.hero.titleAccent}`
                }
                className={cn(
                  "mt-7 font-[family-name:var(--font-serif)] font-medium leading-[0.94] tracking-[-0.06em] text-[#141724]",
                  isZh
                    ? "max-w-[940px] text-[clamp(3.6rem,7.3vw,6.6rem)]"
                    : "max-w-[960px] text-[clamp(4.2rem,8vw,7.2rem)]",
                )}
              >
                {isZh ? (
                  <span className="block">
                    <span>你的</span>
                    <DynamicCreatorNoun />
                    <span>，</span>
                  </span>
                ) : (
                  <span className="block">{copy.hero.titleLead}</span>
                )}
                <span className="block text-[#5166d8]">{copy.hero.titleAccent}</span>
              </h1>
              <p className="mt-8 max-w-[760px] text-[16px] leading-8 text-[#626978] sm:text-[19px] sm:leading-9">
                {copy.hero.subtitle}
              </p>
              <div className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <PlanLink href={session.ctaHref}>{ctaLabel}</PlanLink>
                <a
                  href="#directory"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[14px] border border-[#141724]/13 bg-white/62 px-5 py-3 text-[13px] font-semibold text-[#141724] backdrop-blur-md transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#5166d8]"
                >
                  {copy.hero.secondary}
                  <ArrowDownRight className="size-4" aria-hidden />
                </a>
              </div>
              <p className="mt-4 flex items-center gap-2 text-[12px] text-[#626978]">
                <ShieldCheck className="size-4 text-[#26745a]" aria-hidden />
                {copy.hero.note}
              </p>
            </div>

            <aside className="relative overflow-hidden rounded-[24px] border border-[#141724]/10 bg-white/66 p-6 shadow-[0_24px_70px_rgba(20,23,36,0.08)] backdrop-blur-xl sm:p-7">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#5166d8]">
                  {isZh ? "路径逻辑" : "Path logic"}
                </span>
                <Compass className="size-4 text-[#141724]/30" aria-hidden />
              </div>
              <div className="mt-7 space-y-3">
                {copy.logic.steps.map((step, index) => (
                  <div
                    key={step.title}
                    className="flex items-start gap-3 rounded-[13px] border border-[#5166d8]/8 bg-[#edf0ff]/82 p-3.5"
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#5166d8] font-mono text-[9px] font-semibold text-white">
                      0{index + 1}
                    </span>
                    <div>
                      <p className="text-[12px] font-semibold text-[#141724]">{step.title}</p>
                      <p className="mt-1 text-[10px] leading-5 text-[#626978]">{step.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </section>

        <section className="border-y border-[var(--iteamify-line)] bg-white/64 px-4 py-24 sm:px-6 sm:py-28 lg:px-8">
          <div className="mx-auto max-w-[1240px]">
            <SectionHeading
              label={copy.logic.label}
              title={copy.logic.title}
              description={copy.logic.subtitle}
            />
            <div className="mt-14 grid gap-px overflow-hidden rounded-[22px] border border-[#141724]/10 bg-[#141724]/10 md:grid-cols-2 lg:grid-cols-4">
              {copy.logic.steps.map((step, index) => (
                <article key={step.title} className="min-h-[210px] bg-[#fffdf8] p-6 sm:p-7">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-[#141724]/34">0{index + 1}</span>
                    {index === 0 ? <Target className="size-4 text-[#ec6b59]" aria-hidden /> : null}
                    {index === 1 ? <FileText className="size-4 text-[#5166d8]" aria-hidden /> : null}
                    {index === 2 ? <Globe2 className="size-4 text-[#26745a]" aria-hidden /> : null}
                    {index === 3 ? <Sparkles className="size-4 text-[#e0a92f]" aria-hidden /> : null}
                  </div>
                  <h3 className="mt-12 font-[family-name:var(--font-serif)] text-[25px] font-medium tracking-[-0.035em] text-[#141724]">
                    {step.title}
                  </h3>
                  <p className="mt-3 text-[12px] leading-6 text-[#626978]">{step.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="directory" className="scroll-mt-24 px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
          <div className="mx-auto max-w-[1240px]">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <SectionHeading
                label={copy.directory.label}
                title={copy.directory.title}
                description={copy.directory.subtitle}
              />
              <div className="shrink-0 rounded-[14px] border border-[#141724]/10 bg-white/66 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.1em] text-[#141724]/48">
                {copy.directory.count}
              </div>
            </div>

            <div className="mt-14 space-y-5 sm:mt-16">
              {copy.pathways.map((pathway, pathwayIndex) => {
                const Icon = pathway.icon;
                return (
                  <article
                    key={pathway.number}
                    className={cn(
                      "overflow-hidden rounded-[26px] border",
                      pathwayIndex % 2 === 0
                        ? "border-[#141724]/10 bg-white/64"
                        : "border-[#5166d8]/14 bg-[#edf0ff]/64",
                    )}
                  >
                    <div className="grid lg:grid-cols-[320px_minmax(0,1fr)]">
                      <div className="flex flex-col border-b border-[#141724]/9 p-6 sm:p-7 lg:border-b-0 lg:border-r lg:p-6">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] text-[#141724]/38">PATH {pathway.number}</span>
                          <span className="flex size-11 items-center justify-center rounded-[14px] bg-[#141724] text-white">
                            <Icon className="size-5" aria-hidden />
                          </span>
                        </div>
                        <h3 className="mt-5 font-[family-name:var(--font-serif)] text-[32px] font-medium leading-[1.02] tracking-[-0.045em] text-[#141724]">
                          {pathway.title}
                        </h3>
                        <p className="mt-4 text-[13px] leading-6 text-[#626978]">{pathway.description}</p>
                        <div className="mt-auto pt-5">
                          <p className="flex items-center gap-2 text-[11px] font-semibold text-[#26745a]">
                            <CheckCircle2 className="size-4" aria-hidden />
                            {pathway.signal}
                          </p>
                          <div className="mt-4">
                            <PlanLink href={session.ctaHref} compact>{copy.directory.cta}</PlanLink>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col p-5 sm:p-6 lg:p-7">
                        <div className="mb-4 flex items-center justify-between gap-5">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#626978]">
                            {copy.directory.platformLabel}
                          </p>
                          <span className="font-mono text-[9px] text-[#141724]/32">
                            {String(pathway.platforms.length).padStart(2, "0")} {isZh ? "个平台" : "platforms"}
                          </span>
                        </div>
                        <div className={cn("grid flex-1 gap-3", pathway.platforms.length === 2 ? "md:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-3")}>
                          {pathway.platforms.map((platform, index) => (
                            <PlatformCard key={platform.name} platform={platform} index={index + pathwayIndex} />
                          ))}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {copy.toolkit ? (
          <section
            id="toolkit"
            className="scroll-mt-24 border-t border-[#141724]/10 bg-[#efede6] px-4 py-24 sm:px-6 sm:py-32 lg:px-8"
          >
            <div className="mx-auto max-w-[1240px]">
              <div className="grid gap-9 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-end">
                <SectionHeading
                  label={copy.toolkit.label}
                  title={copy.toolkit.title}
                  description={copy.toolkit.subtitle}
                />
                <div className="flex flex-col items-start gap-5 lg:items-end">
                  <span className="rounded-[14px] border border-[#141724]/10 bg-white/60 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.1em] text-[#141724]/48">
                    {copy.toolkit.count}
                  </span>
                  <PlanLink href={session.ctaHref}>
                    {copy.toolkit.cta}
                  </PlanLink>
                </div>
              </div>

              <div className="mt-16 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {copy.toolkit.categories.map((category, index) => (
                  <ToolkitCategoryCard
                    key={category.number}
                    category={category}
                    index={index}
                  />
                ))}
              </div>

              <div className="mt-7 flex items-start gap-3 rounded-[18px] border border-[#141724]/10 bg-white/58 p-5 sm:p-6">
                <ShieldCheck
                  className="mt-0.5 size-5 shrink-0 text-[#26745a]"
                  aria-hidden
                />
                <p className="text-[11px] leading-6 text-[#626978]">
                  {copy.toolkit.notice}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <section className="relative overflow-hidden bg-[#101727] px-4 py-24 text-white sm:px-6 sm:py-32 lg:px-8">
          <div className="pointer-events-none absolute -left-44 -top-56 size-[520px] rounded-full bg-[#ec6b59]/15 blur-[110px]" aria-hidden />
          <div className="pointer-events-none absolute -bottom-64 right-[-8%] size-[620px] rounded-full bg-[#5166d8]/15 blur-[120px]" aria-hidden />
          <div className="relative mx-auto max-w-[1240px]">
            <SectionHeading
              label={copy.plan.label}
              title={copy.plan.title}
              description={copy.plan.subtitle}
              inverse
            />

            <div className="mt-14 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
              <article className="rounded-[24px] border border-white/10 bg-white/[0.045] p-6 sm:p-8">
                <div className="flex items-center justify-between gap-6 border-b border-white/10 pb-5">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-[13px] bg-[#5166d8]">
                      <BrandMark className="size-5" />
                    </span>
                    <div>
                      <p className="text-[13px] font-semibold">{isZh ? "第一条经营路线" : "First operating route"}</p>
                      <p className="mt-1 text-[10px] text-white/38">{copy.plan.status}</p>
                    </div>
                  </div>
                  <CircleDollarSign className="size-5 text-[#f58a79]" aria-hidden />
                </div>
                <div className="mt-3">
                  {copy.plan.tasks.map((task, index) => (
                    <div key={task} className="grid grid-cols-[30px_1fr_auto] items-start gap-3 border-b border-white/8 py-5 last:border-b-0">
                      <span className="flex size-7 items-center justify-center rounded-full border border-white/14 font-mono text-[9px] text-white/42">
                        0{index + 1}
                      </span>
                      <p className="pt-1 text-[13px] leading-6 text-white/72">{task}</p>
                      <span className="pt-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-white/26">
                        {index === 0 ? (isZh ? "你 + iteamify" : "You + iteamify") : "iteamify"}
                      </span>
                    </div>
                  ))}
                </div>
              </article>

              <div className="flex flex-col gap-4">
                <article className="rounded-[22px] border border-[#f58a79]/20 bg-[#f58a79]/8 p-6 sm:p-7">
                  <div className="flex size-10 items-center justify-center rounded-[13px] bg-[#f58a79] text-[#141724]">
                    <Target className="size-5" aria-hidden />
                  </div>
                  <h3 className="mt-7 font-[family-name:var(--font-serif)] text-[28px] font-medium tracking-[-0.035em]">
                    {copy.plan.decisionTitle}
                  </h3>
                  <p className="mt-3 text-[12px] leading-6 text-white/56">{copy.plan.decisionBody}</p>
                </article>
                <article className="rounded-[22px] border border-white/10 bg-white/[0.045] p-6 sm:p-7">
                  <div className="flex items-start gap-4">
                    <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#77c9a3]" aria-hidden />
                    <div>
                      <h3 className="text-[13px] font-semibold">{copy.plan.guardrailTitle}</h3>
                      <p className="mt-2 text-[11px] leading-6 text-white/46">{copy.plan.guardrailBody}</p>
                    </div>
                  </div>
                </article>
                <div className="mt-auto pt-2">
                  <PlanLink href={session.ctaHref} inverse>{copy.plan.primary}</PlanLink>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
