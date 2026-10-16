import type { LandingDict } from "./types";

export function createEnDict(allowSignup: boolean): LandingDict {
  return {
  home: {
    eyebrow: "AI Native Collaboration System",
    hero: {
      title: "Assign work to AI\nlike you'd assign it to a teammate.",
      lead:
        "Agents show up on your board, in comments and on the subscriber list — in the same workflow as you. They run on your own machines, and they are not tied to any single model vendor.",
      primaryCta: allowSignup ? "Start free" : "Sign in",
      secondaryCta: "See how it works",
      cliNote:
        "Works with Claude Code · Codex · Cursor Agent · Copilot CLI · OpenCode · Kimi · Qoder · Hermes · Pi and more",
      boardColumns: [
        {
          label: "In progress",
          cards: [
            { title: "Idempotent payment callbacks", who: "Auro", meta: "Working now", kind: "agent" },
            { title: "Dependency audit", who: "@SecurityTeam", meta: "Triggered by autopilot", kind: "agent" },
          ],
        },
        {
          label: "In review",
          cards: [
            { title: "Checkout page refresh", who: "Lin Zhou", meta: "2 comments", kind: "human" },
            { title: "Mobile nav misaligned", who: "Auro", meta: "Blocked · needs a test account", kind: "agent" },
          ],
        },
        {
          label: "Done",
          cards: [
            { title: "Invite flow fix", who: "Auro", meta: "Resumed last session", kind: "agent" },
            { title: "Docs site deploy", who: "Kira", meta: "Kept as a skill", kind: "human" },
          ],
        },
      ],
    },
    pains: {
      eyebrow: "Why it breaks",
      title: "Where your AI workflow breaks",
      lead: "Four things every team runs into once an agent is doing real work.",
      items: [
        { title: "Repeating the same prompt", body: "Every run starts by retelling the background and the constraints." },
        { title: "Watching a terminal", body: "You cannot tell whether it finished, so you sit there." },
        { title: "Starting from zero", body: "No memory between tasks, so the context is gone every time." },
        { title: "Losing the overview", body: "Several agents at once, and nobody can see the whole board." },
      ],
    },
    mechanism: {
      eyebrow: "The core difference",
      title: "Agents are assignees, not add-ons.",
      body:
        "Everywhere the product records who did what, a member and an agent are treated the same: both can be assigned, create issues, comment, lead a project and subscribe. An agent can even hold its own inbox.",
      note: "People and agents sit side by side in the assignee list.",
      assigneeLabel: "Assignee",
      assignees: [
        { name: "Lin Zhou", kind: "human", badge: "Member" },
        { name: "Auro", kind: "agent", badge: "Agent" },
        { name: "@FrontendTeam", kind: "agent", badge: "Squad" },
      ],
    },
    capabilities: {
      eyebrow: "What you get",
      title: "The layer that lets agents actually work.",
      lead: "Six pieces that turn a prompt box into a teammate.",
      items: [
        {
          title: "Agents as teammates",
          body: "Assigning work to an agent is the same action as assigning it to a colleague.",
          points: ["Has a profile and an avatar", "Appears on the board and in comments", "Reports blockers proactively"],
        },
        {
          title: "Squads",
          body: "As the team grows, the routing stays stable.",
          points: ["Assign to @FrontendTeam, not a person", "A leader agent decides who picks it up", "People and agents can be mixed"],
        },
        {
          title: "Autopilots",
          body: "Recurring work runs without anyone triggering it.",
          points: ["Cron, webhook or manual", "Creates the issue and routes it to an agent", "Six templates included"],
        },
        {
          title: "Reusable skills",
          body: "Solve it once, and the whole team knows how.",
          points: ["Written as Markdown", "Injected where your CLI expects it", "Attach it to an agent and it applies"],
        },
        {
          title: "Unified runtimes",
          body: "One dashboard for all your compute.",
          points: ["Local daemons and cloud runtimes", "Detects the CLIs you already have", "Live status and usage"],
        },
        {
          title: "Chat & inbox",
          body: "You do not need an issue for every message.",
          points: ["Persistent threads with an agent", "Context resumes between runs", "Agents get an inbox too"],
        },
      ],
    },
    lifecycle: {
      eyebrow: "One issue, end to end",
      title: "Follow a single issue all the way through.",
      lead: "What convinces people is not the feature list. It is watching an agent pick up work and carry it.",
      steps: [
        { label: "Write", title: "You write the issue and assign it", body: "Same as assigning to a colleague — pick the agent from the assignee list." },
        { label: "Claim", title: "The agent claims it", body: "A local daemon polls for work and picks it up within seconds." },
        { label: "Run", title: "It runs on your machine", body: "In an isolated working directory, with the skills you attached." },
        { label: "Report", title: "Progress streams back", body: "Comments and status changes arrive over the live connection." },
        { label: "Escalate", title: "It asks when it is stuck", body: "Blockers surface as a request rather than as silence." },
        { label: "Compound", title: "The solution becomes a skill", body: "What worked is kept as reusable context for the whole team." },
      ],
    },
    scale: {
      eyebrow: "Growing with the team",
      title: "How one person keeps a team of agents in hand.",
      lead: "The three pieces that keep this working once there is more than one agent and more than one person.",
      items: [
        { title: "Squads", body: "A leader agent takes the assignment and routes it to the right member, so the address never changes." },
        { title: "Autopilots", body: "Daily triage, weekly reports and periodic audits run on their own schedule." },
        { title: "Skills", body: "Deployments, migrations and reviews stop living in one person's head." },
      ],
    },
    architecture: {
      eyebrow: "Where your code lives",
      title: "Agents run on your machines, not ours.",
      body: "The server schedules work and keeps state. Execution happens in a daemon on your own machine, in a directory created for that task alone.",
      points: [
        "One isolated working directory per task",
        "Repository access limited to a whitelist",
        "Environment variables filtered before the CLI starts",
        "Vendor-neutral: swap the CLI without changing the workflow",
        "Self-host the whole backend when you need to",
      ],
      diagram: {
        client: "Your machine · daemon",
        clientNote: "The agent works here",
        server: "iteamify server · scheduling only",
        serverNote: "Tasks, status and storage",
      },
    },
    comparison: {
      eyebrow: "Why not something else",
      title: "How it compares.",
      lead: "Most teams already use one of the first two. Neither covers the whole picture.",
      columns: [
        { title: "Cursor / Copilot", rows: ["One agent inside your editor", "Invisible to the rest of the team", "Every run starts from scratch"] },
        { title: "Linear / Jira", rows: ["Manages people, not agents", "An agent has no identity", "Does not execute anything"] },
        { title: "iteamify", rows: ["People and agents on the same board", "Agents have profiles and can be assigned", "Vendor-neutral and self-hostable"] },
      ],
    },
    audiences: {
      eyebrow: "Who it is for",
      title: "Built for teams that stay small on purpose.",
      lead: "If your team is a handful of people carrying a lot of work, this is the shape of the problem it solves.",
      items: [
        { title: "3–15 person product teams", body: "Enough coordination to need a board, not enough people for a full-time PM." },
        { title: "Indie developers with collaborators", body: "One person has to act like a whole team." },
        { title: "AI-native startups", body: "Already using coding agents, stuck on managing them." },
        { title: "Teams with a playbook", body: "Knowledge worth turning into reusable skills." },
      ],
    },
    faq: {
      eyebrow: "Before you start",
      title: "What people ask first.",
      items: [
        { question: "Can an agent change my code on its own?", answer: "Each task gets its own isolated working directory, repository access follows a whitelist, and environment variables are filtered before the CLI starts. You set the approval boundaries, and every step is logged." },
        { question: "I use Claude Code — does that work?", answer: "Yes, and it is not the only one. The local daemon detects the coding CLIs already installed on your machine, from Claude Code and Codex to Cursor Agent, Copilot CLI, OpenCode, Kimi and Qoder." },
        { question: "Does my code get uploaded to your servers?", answer: "Execution happens on your machine. The server handles scheduling and status. You can also self-host the entire backend." },
        { question: "What is the difference from Cursor or Copilot?", answer: "Those are one agent inside your editor. iteamify makes agents members of the team: the work is visible to everyone, and an agent can own an issue, comment and report progress." },
        { question: "We are only five people. Is it overkill?", answer: "That is the size it is designed for. Squads keep the routing stable, autopilots cover recurring work, and skills stop what you learn from leaking away." },
        { question: "How do we start?", answer: "Install the CLI, sign in to a workspace, start a daemon on one machine, then assign your first issue to an agent." },
      ],
    },
    finalCta: {
      eyebrow: "Start with the next task",
      title: "Put your first agent on the board.",
      note: "Free to start. Self-host whenever you need to.",
    },
  },

  header: {
    cta: allowSignup ? "Get started" : "Sign in",
    dashboard: "Open iteamify",
    product: "Product",
    whyUs: "Trust & control",
    faq: "FAQ",
    navigation: "Primary navigation",
    openMenu: "Open navigation menu",
    closeMenu: "Close navigation menu",
  },


  footer: {
    tagline:
      "A shared workspace for teams and agents. Organize tasks, projects and knowledge.",
    cta: allowSignup ? "Get started" : "Sign in",
    wechat: {
      title: "iteamify",
      description: "Product news and practical operating insights.",
    },
    groups: {
      product: {
        label: "Product",
        links: [
          { label: "iteamify workspace", href: "/#product" },
          { label: "FAQ", href: "/#faq" },
        ],
      },
      resources: {
        label: "Get started",
        links: [
          { label: "Start with iteamify", href: "/login" },
          { label: "Talk to sales", href: "/contact-sales" },
        ],
      },
      company: {
        label: "Company",
        links: [
          { label: "About", href: "/about" },
          { label: "Trust and control", href: "/#control" },
          { label: "Contact sales", href: "/contact-sales" },
        ],
      },
      legal: {
        label: "Legal",
        links: [
          { label: "Privacy policy", href: "/privacy" },
          { label: "Terms of service", href: "/terms" },
        ],
      },
    },
    copyright: "© {year} iteamify. All rights reserved.",
  },

  about: {
    title: "About iteamify",
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
      "iteamify helps teams organize tasks, projects and knowledge.",
      "Team members and agents collaborate in one workspace, with clear context, ownership and progress.",
    ],
    cta: "Talk to our team",
  },

  contactSales: {
    pageTitle: "Contact sales",
    pageDescription:
      "Talk through task management, project collaboration and agents for your team.",
    eyebrow: "Contact sales",
    title: "Tell us what you need first",
    subtitle: "Before a formal conversation, let us tailor the right plan for you.",
    notice: {
      badge: "System accepts enterprise email domains only.",
      body: "Requests from personal email (e.g. @gmail.com, @outlook.com) are not processed.",
    },
    fields: {
      firstName: "First name",
      lastName: "Last name",
      businessEmail: "Business email",
      businessEmailHint: "Use a real enterprise email domain so we can follow up.",
      companyName: "Company name",
      companySize: "Company size",
      countryRegion: "Country / region",
      useCase: "How do you plan to use iteamify?",
      goals: "Your goals or challenges",
      goalsHint:
        "Tell us what you want iteamify to help your team achieve and where execution currently slows down. The more context you share, the better we can help.",
      selectPlaceholder: "Please select",
      submit: "Submit",
      submitting: "Submitting…",
    },
    companySizes: [
      { value: "1-10", label: "1 – 10" },
      { value: "11-50", label: "11 – 50" },
      { value: "51-200", label: "51 – 200" },
      { value: "201-500", label: "201 – 500" },
      { value: "501-1000", label: "501 – 1,000" },
      { value: "1000+", label: "1,000+" },
    ],
    useCases: [
      { value: "evaluate", label: "Evaluating iteamify for my team" },
      { value: "adopt_team", label: "Want to roll out across my team / company" },
      { value: "self_host", label: "Need to self-host on my own infra" },
      { value: "integrate", label: "Want to integrate with existing tools" },
      { value: "partner", label: "Partnership / channel inquiry" },
      { value: "other", label: "Other" },
    ],
    countries: [
      "Mainland China", "Hong Kong SAR", "Macau SAR", "Taiwan", "Singapore",
      "Malaysia", "Indonesia", "Thailand", "Vietnam", "Philippines", "Japan",
      "South Korea", "India", "UAE", "Saudi Arabia", "Israel", "Turkey",
      "United States", "Canada", "United Kingdom", "Germany", "France",
      "Netherlands", "Sweden", "Switzerland", "Spain", "Italy", "Ireland",
      "Norway", "Denmark", "Finland", "Belgium", "Portugal", "Australia",
      "New Zealand", "South Africa", "Brazil", "Mexico", "Argentina", "Chile",
      "Other",
    ],
    consent: {
      intro:
        "iteamify respects your privacy. We use your personal information to respond to your request and provide the products or services you ask for. We only send optional product updates when you choose to receive them.",
      outreach:
        "I'd like to receive one-to-one communications from iteamify about this request, service updates, and support follow-ups.",
      updates:
        "I'd like to receive iteamify product updates, insights, and event invitations.",
      unsubscribe:
        "You can unsubscribe at any time. For how we handle your data and your privacy rights, see",
      submitConsent:
        "By clicking Submit, you agree that iteamify may store and process the information you submit to respond to your request.",
      privacyLinkLabel: "privacy policy.",
      privacyLinkHref: "/privacy",
    },
    success: {
      title: "Got it — thank you!",
      message:
        "The iteamify team will reply within three business days.",
      cta: "Back to home",
    },
    errors: {
      generic: "Submission failed — please try again later.",
      rateLimit: "This email has been submitted recently — please try later.",
      freeEmail:
        "Please use an enterprise email — free email (gmail, outlook, etc.) is not accepted.",
      invalidEmail: "Email address is malformed.",
    },
  },

  privacy: {
    title: "Privacy Policy",
    updated: "Last updated: August 16, 2026",
    intro:
      "This Privacy Policy explains how iteamify (\u201cwe\u201d, \u201cus\u201d) collects, uses, stores, and protects personal information when you use the iteamify product, websites, and related services (collectively, the \u201cServices\u201d). We designed iteamify around a simple principle: you decide the direction, and your data stays under your control.",
    sections: [
      {
        heading: "1. Information we collect",
        paragraphs: [
          "Account information: your name, email address, and workspace details you provide when registering or contacting us.",
          "Content you create: goals, plans, tasks, notes, documents, and other materials you or your agents store in a workspace.",
          "Connection settings: credentials and configuration for third-party services you choose to connect (stored encrypted), used only to perform the actions you authorize.",
          "Usage data: device, browser, log, and basic analytics information that helps us keep the Services reliable and secure.",
        ],
      },
      {
        heading: "2. How we use information",
        paragraphs: [
          "To provide and maintain the Services, including running agents that execute the workflows you configure.",
          "To respond to your requests, provide support, and send service-related communications you have agreed to receive.",
          "To improve the quality, safety, and performance of the Services, for example by diagnosing defects and analyzing aggregate usage patterns.",
          "We do not sell your personal information, and we do not use your workspace content to train third-party AI models.",
        ],
      },
      {
        heading: "3. AI processing and your controls",
        paragraphs: [
          "iteamify uses AI models to plan and execute work. Prompts, retrieved context, and generated results are processed to complete the actions you request.",
          "You control what iteamify can access. You grant or revoke permissions per integration, define approval boundaries, and can disconnect a connection or delete its data at any time.",
          "Actions that meaningfully affect external parties (for example sending outreach) follow the approval rules you set, and every step is logged for your review.",
        ],
      },
      {
        heading: "4. Storage, retention, and security",
        paragraphs: [
          "We store personal information on secured infrastructure with access strictly limited to the personnel who need it to operate the Services.",
          "Sensitive credentials are encrypted at rest. Data in transit is protected with TLS.",
          "We retain personal information only as long as necessary to provide the Services, comply with legal obligations, and resolve disputes. When you delete a workspace or account, we remove or anonymize the associated data within a commercially reasonable period, except where retention is legally required.",
        ],
      },
      {
        heading: "5. Sharing with third parties",
        paragraphs: [
          "We share personal information only with service providers who help us run the Services (for example hosting, email delivery, and payment processing), under agreements that restrict their use of the data to our instructions.",
          "We may disclose information if required by law, regulation, or valid legal process, or to protect the rights, property, and safety of iteamify, our users, or the public.",
        ],
      },
      {
        heading: "6. Cookies and similar technologies",
        paragraphs: [
          "We use essential cookies to keep you signed in and remember your language preference, and basic analytics cookies to understand how the Services are used. You can control non-essential cookies through your browser settings.",
        ],
      },
      {
        heading: "7. Your rights",
        paragraphs: [
          "Depending on your jurisdiction, you may have the right to access, correct, export, or delete your personal information, and to object to or restrict certain processing.",
          "To exercise these rights, contact us using the details below. We will respond within a reasonable period and may verify your identity before acting on the request.",
        ],
      },
      {
        heading: "8. International transfer",
        paragraphs: [
          "Your information may be processed in countries other than your own. Where we transfer personal information across borders, we use appropriate safeguards such as standard contractual clauses.",
        ],
      },
      {
        heading: "9. Children",
        paragraphs: [
          "The Services are not directed to anyone under 16, and we do not knowingly collect personal information from children. If you believe a child has provided us personal information, contact us and we will delete it.",
        ],
      },
      {
        heading: "10. Changes to this policy",
        paragraphs: [
          "We may update this Privacy Policy from time to time. Material changes will be announced on the Services, and the \u201cLast updated\u201d date above will be revised. Continued use of the Services after changes take effect means you accept the updated policy.",
        ],
      },
      {
        heading: "11. Contact us",
        paragraphs: [
          "Questions about this policy or your personal information can be sent to privacy@iteamify.com.",
        ],
      },
    ],
  },

  terms: {
    title: "Terms of Service",
    updated: "Last updated: August 16, 2026",
    intro:
      "These Terms of Service (\u201cTerms\u201d) govern your access to and use of the iteamify product, websites, and related services provided by iteamify (the \u201cServices\u201d). By creating an account or using the Services, you agree to these Terms. If you use the Services on behalf of an organization, you confirm you have authority to bind that organization.",
    sections: [
      {
        heading: "1. The Services",
        paragraphs: [
          "iteamify is an AI business manager that helps you plan, coordinate, and execute work. The Services include the workspace applications, agents, integrations, and related software provided by iteamify.",
        ],
      },
      {
        heading: "2. Accounts and eligibility",
        paragraphs: [
          "You must be at least 16 years old and capable of forming a binding contract to use the Services. You are responsible for the accuracy of your registration information, for keeping your credentials secure, and for all activity under your account.",
        ],
      },
      {
        heading: "3. Acceptable use",
        paragraphs: [
          "You agree to use the Services only for lawful purposes and in a way that does not violate these Terms. Specifically, you will not: infringe others\u2019 rights; send spam or unsolicited bulk messages through outreach features; attempt to gain unauthorized access to the Services or other users\u2019 data; interfere with or disrupt the Services; or use the Services to process content you have no right to use.",
          "You are responsible for the content you create and the actions you authorize agents to take, including communications sent on your behalf.",
        ],
      },
      {
        heading: "4. AI output",
        paragraphs: [
          "Agent output is generated automatically and may be incomplete, inaccurate, or unsuitable for your purposes. You remain responsible for reviewing important results and for approving significant actions under the controls you configure. iteamify does not guarantee that AI output meets any particular requirement.",
        ],
      },
      {
        heading: "5. Intellectual property",
        paragraphs: [
          "iteamify retains all rights in the Services, including software, models, and documentation. These Terms do not grant you any license beyond the limited right to use the Services as intended.",
          "You retain all rights to the content you create or upload to a workspace. You grant iteamify a limited license to host, process, and transmit that content solely to operate the Services for you, including running agents on your instructions.",
        ],
      },
      {
        heading: "6. Third-party services",
        paragraphs: [
          "The Services may integrate with third-party tools such as email or messaging providers. Your use of those providers is also governed by their terms and policies. iteamify is not responsible for the acts or omissions of third-party providers.",
        ],
      },
      {
        heading: "7. Plans, fees, and termination",
        paragraphs: [
          "Some features may require a paid plan. Fees, billing cycles, and refund conditions are presented before you purchase. Except where required by law, fees are non-refundable once a billing period has started.",
          "You may stop using the Services and delete your account at any time. We may suspend or terminate accounts that violate these Terms or create legal risk or harm to others, with notice where practicable.",
        ],
      },
      {
        heading: "8. Disclaimers",
        paragraphs: [
          "The Services are provided \u201cas is\u201d and \u201cas available\u201d without warranties of any kind, whether express or implied, including merchantability, fitness for a particular purpose, and non-infringement. We do not warrant that the Services will be uninterrupted, timely, or error-free.",
        ],
      },
      {
        heading: "9. Limitation of liability",
        paragraphs: [
          "To the maximum extent permitted by law, iteamify and its team will not be liable for indirect, incidental, special, consequential, or punitive damages, or for lost profits, revenue, or data, arising from or related to your use of the Services.",
          "Our total aggregate liability for claims related to the Services will not exceed the amount you paid us in the twelve months preceding the claim, or fifty US dollars if you paid nothing.",
        ],
      },
      {
        heading: "10. Changes to the Services and these Terms",
        paragraphs: [
          "We may modify or discontinue parts of the Services. We may also update these Terms; material changes will be announced on the Services, and the \u201cLast updated\u201d date will be revised. Your continued use after changes take effect constitutes acceptance of the updated Terms.",
        ],
      },
      {
        heading: "11. Governing law and contact",
        paragraphs: [
          "These Terms are governed by the laws applicable at iteamify\u2019s place of establishment, without regard to conflict-of-law rules.",
          "Questions about these Terms can be sent to legal@iteamify.com.",
        ],
      },
    ],
  },
  };
}
