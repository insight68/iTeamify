import { resetQueryClient } from "./query-client";
import { useCommentSelectStore } from "./comment-select-store";
import { useViewedIssuesStore } from "./viewed-issues-store";
import { useChatSelectStore } from "./chat-select-store";
import { useChatDraftsStore } from "./stores/chat-drafts-store";
import { useChatSessionPickerStore } from "./stores/chat-session-picker-store";
import { useFailedCommentsStore } from "./stores/failed-comments-store";
import { useIssuesViewStore } from "./stores/issues-view-store";
import { useLastViewedStore } from "./stores/last-viewed-store";
import { useMentionDraftStore } from "./stores/mention-draft-store";
import { useMyIssuesViewStore } from "./stores/my-issues-view-store";
import { useNewIssueDraftStore } from "./stores/new-issue-draft-store";
import { useNewProjectDraftStore } from "./stores/new-project-draft-store";
import { useReplyTargetStore } from "./stores/reply-target-store";

/** Account exit only. Workspace changes retain their independently keyed drafts. */
export function resetSessionState() {
  resetQueryClient();
  useCommentSelectStore.setState(useCommentSelectStore.getInitialState());
  useViewedIssuesStore.setState(useViewedIssuesStore.getInitialState());
  useChatSelectStore.setState(useChatSelectStore.getInitialState());
  useChatDraftsStore.setState(useChatDraftsStore.getInitialState());
  useChatSessionPickerStore.setState(useChatSessionPickerStore.getInitialState());
  useFailedCommentsStore.setState(useFailedCommentsStore.getInitialState());
  useIssuesViewStore.setState(useIssuesViewStore.getInitialState());
  useLastViewedStore.setState(useLastViewedStore.getInitialState());
  useMentionDraftStore.setState(useMentionDraftStore.getInitialState());
  useMyIssuesViewStore.setState(useMyIssuesViewStore.getInitialState());
  useNewIssueDraftStore.setState(useNewIssueDraftStore.getInitialState());
  useNewProjectDraftStore.setState(useNewProjectDraftStore.getInitialState());
  useReplyTargetStore.setState(useReplyTargetStore.getInitialState());
}
