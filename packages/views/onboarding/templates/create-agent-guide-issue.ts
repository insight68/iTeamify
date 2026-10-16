import { HELPER_DESCRIPTION, HELPER_INSTRUCTIONS } from "./helper-instructions";

const HELPER_AGENT_NAME = "iteamify Helper";

/**
 * Skip path, issue 2/2: "Create your first iteamify Agent".
 *
 * Companion to install-runtime-issue.ts. The body is a FUNCTION (not a
 * static const) because it needs to embed:
 *   - A mention chip pointing at the install-runtime issue (so the user
 *     can jump to it from this issue) — requires the install-runtime
 *     issue's identifier + uuid, only known after that issue is created.
 *   - The full Helper markdown block in the user's language (so the
 *     embedded ```md fence matches the surrounding body language).
 *
 * Caller MUST create install-runtime first, then call this with its ids.
 */

/**
 * Step 2 of the skip-path bundle. Localized title for supported locales.
 */
export const CREATE_AGENT_GUIDE_ISSUE_TITLE = {
  en: "Step 2 — Create your first iteamify Agent",
  zh: "第 2 步：创建你的第一个 iteamify 智能体",
  ko: "2단계 — 첫 iteamify Agent 만들기",
  ja: "ステップ2 — 最初の iteamify Agent を作成する",
} as const;

interface BodyOpts {
  lang: "en" | "zh" | "ko" | "ja";
  installRuntimeIdentifier: string;
  installRuntimeId: string;
}

export function getCreateAgentGuideBody(opts: BodyOpts): string {
  const mention = `[${opts.installRuntimeIdentifier}](mention://issue/${opts.installRuntimeId})`;
  if (opts.lang === "zh") {
    return zhBody(mention);
  }
  if (opts.lang === "ko") {
    return koBody(mention);
  }
  if (opts.lang === "ja") {
    return jaBody(mention);
  }
  return enBody(mention);
}

function enBody(installRuntimeMention: string): string {
  return `Once your runtime is online (see ${installRuntimeMention}), build your first agent — iteamify Helper. The prompt below is pre-written; just copy.

## 1. Open the new-agent screen

Go to **Agents** in the sidebar → click **New Agent**.

## 2. Pick the runtime you just installed

Select the runtime under "Runtime". If nothing shows up, the runtime isn't online yet — finish the install steps in ${installRuntimeMention}.

## 3. Copy each block into the matching field

**Name**
\`\`\`md
${HELPER_AGENT_NAME}
\`\`\`

**Description**
\`\`\`md
${HELPER_DESCRIPTION.en}
\`\`\`

**Instructions**
\`\`\`md
${HELPER_INSTRUCTIONS.en}
\`\`\`

## 4. Save → assign an issue

Hit **Create**. The new agent shows up in the workspace agent list.

Now create an issue (or reassign an existing one) → set assignee = iteamify Helper → set status to **todo**. The runtime picks the task up within a few seconds and starts working. Watch progress in the issue's task panel.

## Where to go next

- **Skills** — reusable instruction packs you can attach to any agent.
- **Squads** — groups of agents that can be assigned together.
- **Automations** — scheduled or webhook-triggered runs.
- **Docs** — https://aurocreator.com/docs.`;
}

function zhBody(installRuntimeMention: string): string {
  return `运行环境上线后（参见 ${installRuntimeMention}），就可以创建第一个智能体“iteamify Helper”了。下面的内容已经准备好，复制到对应字段即可。

## 1. 打开智能体创建页面

在侧边栏打开 **智能体**，然后点击 **新建智能体**。

## 2. 选择刚连接的运行环境

在“运行环境”中选择刚才连接的环境。如果没有可选项，说明运行环境尚未上线，请先完成 ${installRuntimeMention} 中的安装步骤。

## 3. 把下面三段分别复制到对应字段

**名称**
\`\`\`md
${HELPER_AGENT_NAME}
\`\`\`

**描述**
\`\`\`md
${HELPER_DESCRIPTION.zh}
\`\`\`

**指令**
\`\`\`md
${HELPER_INSTRUCTIONS.zh}
\`\`\`

## 4. 创建智能体并分配事项

点击 **创建**。新智能体会出现在工作区的智能体列表中。

接着创建一个事项（也可以使用现有事项），将负责人设为 iteamify Helper，再把状态改为 **待办**。运行环境会在几秒内领取任务并开始执行，你可以在事项的任务面板中查看进度。

## 接下来可以了解

- **技能**：可供多个智能体复用的指令和文件。
- **小队**：可以共同负责事项的一组成员和智能体。
- **自动化**：按计划或通过 Webhook 自动触发工作。
- **文档**：https://aurocreator.com/docs。`;
}

function koBody(installRuntimeMention: string): string {
  return `runtime이 online 상태가 되면(${installRuntimeMention} 참고), 첫 agent인 iteamify Helper를 만드세요. 아래 prompt는 미리 작성되어 있으니 그대로 복사하면 됩니다.

## 1. 새 agent 화면 열기

사이드바에서 **Agents**를 열고 **New Agent**를 클릭합니다.

## 2. 방금 설치한 runtime 선택

"Runtime"에서 해당 runtime을 선택합니다. 아무것도 보이지 않는다면 runtime이 아직 online이 아닙니다. ${installRuntimeMention}의 설치 단계를 먼저 끝내세요.

## 3. 각 블록을 맞는 필드에 복사

**Name**
\`\`\`md
${HELPER_AGENT_NAME}
\`\`\`

**Description**
\`\`\`md
${HELPER_DESCRIPTION.ko}
\`\`\`

**Instructions**
\`\`\`md
${HELPER_INSTRUCTIONS.ko}
\`\`\`

## 4. 저장 → issue 배정

**Create**를 누릅니다. 새 agent가 워크스페이스 agent 목록에 표시됩니다.

이제 issue를 만들거나 기존 issue를 다시 배정한 뒤 assignee를 iteamify Helper로 설정하고 status를 **todo**로 바꾸세요. runtime이 몇 초 안에 작업을 가져가 실행을 시작합니다. 진행 상황은 issue의 task panel에서 볼 수 있습니다.

## 다음에 볼 곳

- **Skills** — 어떤 agent에도 붙일 수 있는 재사용 instruction pack입니다.
- **Squads** — 함께 배정할 수 있는 agent 그룹입니다.
- **Automations** — 예약 또는 webhook으로 실행되는 작업입니다.
- **Docs** — https://aurocreator.com/docs.`;
}

function jaBody(installRuntimeMention: string): string {
  return `runtime が online になったら(${installRuntimeMention} を参照)、最初の agent である iteamify Helper を作りましょう。下の prompt はあらかじめ書いてあるので、そのままコピーするだけです。

## 1. 新しい agent の画面を開く

サイドバーの **Agents** を開き、**New Agent** をクリックします。

## 2. さっきインストールした runtime を選ぶ

"Runtime" でその runtime を選びます。何も表示されない場合は runtime がまだ online ではありません。${installRuntimeMention} のインストール手順を先に終わらせてください。

## 3. 各ブロックを対応するフィールドにコピーする

**Name**
\`\`\`md
${HELPER_AGENT_NAME}
\`\`\`

**Description**
\`\`\`md
${HELPER_DESCRIPTION.ja}
\`\`\`

**Instructions**
\`\`\`md
${HELPER_INSTRUCTIONS.ja}
\`\`\`

## 4. 保存 → issue を割り当てる

**Create** を押します。新しい agent がワークスペースの agent 一覧に表示されます。

次に issue を作る(または既存の issue を割り当て直す)→ assignee を iteamify Helper にする → status を **todo** にします。runtime が数秒以内にタスクを受け取って作業を始めます。進捗は issue の task panel で確認できます。

## 次に見る場所

- **Skills** — どの agent にも付けられる、再利用可能な instruction パックです。
- **Squads** — 一緒に割り当てられる agent のグループです。
- **Automations** — スケジュールや webhook で実行される処理です。
- **Docs** — https://aurocreator.com/docs。`;
}
