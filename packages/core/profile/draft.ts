import { z } from "zod";
import { createDraftStore } from "../drafts/create-draft-store";
import { questionnaireSchema } from "./questionnaire";

const editSchema = questionnaireSchema.pick({ role: true, role_other: true, role_skipped: true }).extend({
  name: z.string(), avatar_url: z.string(), profile_description: z.string(),
}).partial();
const schema = z.object({ ownerId: z.string(), edits: editSchema });
export const useProfileDraftStore = createDraftStore<z.infer<typeof schema>>({
  storageKey: "iteamify_profile_draft", workspaceScoped: false,
  emptyData: { ownerId: "", edits: {} },
  hasMeaningful: (draft) => Object.keys(draft.edits).length > 0,
  migrateData: (raw) => schema.safeParse(raw).data ?? { ownerId: "", edits: {} },
});
