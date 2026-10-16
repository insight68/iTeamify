import { useCallback, useMemo } from "react";
import { useCurrentUser, useUpdateCurrentUser } from "./queries";
import { useProfileDraftStore } from "./draft";
import { personalProfile, profilePatch, profileValueEqual, type PersonalProfile } from "./model";

export function useProfileForm() {
  const query = useCurrentUser();
  const draft = useProfileDraftStore((state) => state.draft);
  const update = useUpdateCurrentUser();
  const user = query.data;
  const saved = useMemo(() => user ? personalProfile(user) : undefined, [user]);
  const value = useMemo(() => saved ? { ...saved, ...(draft.ownerId === user!.id ? draft.edits : {}) } : undefined, [saved, draft, user]);
  const change = useCallback((patch: Partial<PersonalProfile>) => {
    if (!user) return;
    const state = useProfileDraftStore.getState();
    const edits = state.draft.ownerId === user.id ? { ...state.draft.edits } : {};
    const baseline = personalProfile(user);
    for (const key of Object.keys(patch) as (keyof PersonalProfile)[]) {
      if (profileValueEqual(patch[key], baseline[key])) delete edits[key];
      else Object.assign(edits, { [key]: patch[key] });
    }
    state.setDraft({ ownerId: user.id, edits });
  }, [user]);
  const save = async (next = value) => {
    if (!user || !saved || !next) return;
    const input = profilePatch(next, saved);
    const updated = Object.keys(input).length ? await update.mutateAsync(input) : user;
    const state = useProfileDraftStore.getState();
    if (state.draft.ownerId === updated.id) {
      const edits = { ...state.draft.edits };
      const acknowledged = personalProfile(updated);
      for (const key of Object.keys(edits) as (keyof PersonalProfile)[]) {
        const sent = key in input || key in (input.questionnaire ?? {});
        // Server trimming must settle the draft, while edits made during the
        // request remain pending instead of being cleared by an older receipt.
        if (profileValueEqual(edits[key], acknowledged[key]) || (sent && profileValueEqual(edits[key], next[key]))) delete edits[key];
      }
      state.setDraft({ edits });
    }
    return updated;
  };
  return { user, query, saved, value, change, save, update };
}
