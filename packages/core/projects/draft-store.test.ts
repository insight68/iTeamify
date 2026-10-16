import { beforeEach, expect, it } from "vitest";
import { useProjectDraftStore } from "./draft-store";

beforeEach(() => useProjectDraftStore.getState().clearDraft());

it("preserves selected sources as meaningful draft intent", () => {
  const store = useProjectDraftStore.getState();
  store.setDraft({ selectedRepos: ["https://github.com/example/repo"], customRepoUrl: "unfinished URL" });
  expect(useProjectDraftStore.getState().hasDraft()).toBe(true);
  store.setDraft({ sourceMode: "local", selectedLocalPath: "/work/project", selectedLocalLabel: "project" });
  expect(useProjectDraftStore.getState().draft.selectedRepos).toEqual(["https://github.com/example/repo"]);
  expect(useProjectDraftStore.getState().draft.selectedLocalPath).toBe("/work/project");
  store.clearDraft();
  expect(useProjectDraftStore.getState().hasDraft()).toBe(false);
  expect(useProjectDraftStore.getState().draft.selectedRepos).toEqual([]);
  expect(useProjectDraftStore.getState().draft.selectedLocalPath).toBeNull();
});
