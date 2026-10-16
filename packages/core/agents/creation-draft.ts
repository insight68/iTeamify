import { z } from "zod";
import { createDraftStore } from "../drafts/create-draft-store";

const formSchema = z.object({
  name: z.string(), description: z.string(), instructions: z.string(),
  avatarUrl: z.string().nullable(), runtimeId: z.string(), model: z.string(),
  thinkingLevel: z.string(), serviceTier: z.string(),
  skillIds: z.array(z.string()), memberIds: z.array(z.string()), teamIds: z.array(z.string()),
  permissionScope: z.enum(["private", "workspace", "members"]),
});
const draftSchema = z.object({
  id: z.string(), ownerId: z.string(), workspaceId: z.string(), context: z.string(),
  mode: z.enum(["choose", "templates", "blank", "template", "ai"]),
  form: formSchema, builderSessionId: z.string(),
  sourceTemplateSlug: z.string().nullable(), selectedTemplateSlug: z.string().nullable(),
  appliedMessageId: z.string().nullable(), completedAgentId: z.string().nullable(),
});
export type AgentCreationDraft = z.infer<typeof draftSchema>;
export type AgentCreationForm = z.infer<typeof formSchema>;

export const useAgentCreationDraftStore = createDraftStore<{
  entries: Record<string, AgentCreationDraft>;
}>({
  storageKey: "iteamify_agent_creation_drafts",
  // Explicit owner/workspace identities also protect delayed async completions.
  workspaceScoped: false,
  emptyData: { entries: {} },
  hasMeaningful: (data) => Object.keys(data.entries).length > 0,
  migrateData: (raw) => {
    const parsed = z.object({ entries: z.record(z.string(), draftSchema) }).safeParse(raw);
    return parsed.success ? parsed.data : { entries: {} };
  },
});

export function findAgentCreationDraft(ownerId: string, workspaceId: string, context: string, id?: string | null) {
  return Object.values(useAgentCreationDraftStore.getState().draft.entries).find((entry) =>
    entry.ownerId === ownerId && entry.workspaceId === workspaceId && entry.context === context && (!id || entry.id === id),
  );
}

export function saveAgentCreationDraft(draft: AgentCreationDraft) {
  const store = useAgentCreationDraftStore.getState();
  // One unfinished draft per creation context, while its stable ID survives navigation.
  const entries = Object.fromEntries(Object.entries(store.draft.entries).filter(([, item]) =>
    item.id === draft.id || item.ownerId !== draft.ownerId || item.workspaceId !== draft.workspaceId || item.context !== draft.context,
  ));
  store.setDraft({ entries: { ...entries, [draft.id]: draft } });
}

export function removeAgentCreationDraft(id: string) {
  const store = useAgentCreationDraftStore.getState();
  const entries = { ...store.draft.entries };
  delete entries[id];
  store.setDraft({ entries });
}
