// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { useOnboardingDraftStore, readQuestionnaire } from "./draft";
import { resetAllRegisteredDrafts } from "../drafts/cleanup-registry";

beforeEach(() => useOnboardingDraftStore.getState().clearDraft());
describe("onboarding draft", () => {
  it("preserves valid old answers while defaulting malformed fields", () => {
    expect(readQuestionnaire({ role: "invalid", use_case: "write_publish", source: [123] })).toMatchObject({ role: null, use_case: ["write_publish"], source: [] });
  });
  it("persists the owner, resume position and unsent task", () => {
    useOnboardingDraftStore.getState().setDraft({ ownerId: "user-1", workspaceId: "ws-1", step: "task", taskTitle: "My first task", taskDescription: "Keep this input" });
    const saved = JSON.parse(window.localStorage.getItem("iteamify_onboarding_draft")!);
    expect(saved.state.draft).toMatchObject({ ownerId: "user-1", workspaceId: "ws-1", step: "task", taskDescription: "Keep this input" });
  });
  it("clears resume pointers and input with the common logout cleanup", () => {
    useOnboardingDraftStore.getState().setDraft({ ownerId: "user-1", agentId: "agent-1", taskTitle: "private draft" });
    resetAllRegisteredDrafts();
    expect(useOnboardingDraftStore.getState().draft).toMatchObject({ ownerId: "", agentId: "", taskTitle: "" });
  });
});
