"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, MessageSquare, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@iteamify/ui/components/ui/button";
import { Input } from "@iteamify/ui/components/ui/input";
import { Label } from "@iteamify/ui/components/ui/label";
import { Textarea } from "@iteamify/ui/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@iteamify/ui/components/ui/dialog";
import { useWorkspaceId } from "@iteamify/core/hooks";
import { useAuthStore } from "@iteamify/core/auth";
import { memberListOptions } from "@iteamify/core/workspace/queries";
import {
  redditConnectionsOptions,
  redditDraftsOptions,
  redditReadOptions,
  useRedditConnect,
  useRedditDisconnect,
  useRedditSaveDraft,
  useRedditDraftAction,
  type RedditContent,
  type RedditDraft,
} from "@iteamify/core/reddit";
import { openExternal } from "../../../platform";
import { useT, useDateTime } from "../../../i18n";

export function RedditConnections() {
  const wsId = useWorkspaceId();
  return <RedditWorkspace key={wsId} wsId={wsId} />;
}

function RedditWorkspace({ wsId }: { wsId: string }) {
  const { t } = useT("connections");
  const user = useAuthStore((s) => s.user);
  const members = useQuery(memberListOptions(wsId));
  const role = members.data?.find((m) => m.user_id === user?.id)?.role;
  const canManage = role === "owner" || role === "admin";
  const connections = useQuery(redditConnectionsOptions(wsId));
  const drafts = useQuery({
    ...redditDraftsOptions(wsId),
    enabled: connections.data?.configured === true,
  });
  const connect = useRedditConnect(wsId);
  const disconnect = useRedditDisconnect(wsId);
  const [selected, setSelected] = useState("");
  const [sub, setSub] = useState("SaaS");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<Record<string, string> | null>(null);
  const [thread, setThread] = useState("");
  const [composer, setComposer] = useState<{
    target: string;
    connection: string;
    draft?: RedditDraft;
  } | null>(null);
  const [review, setReview] = useState<RedditDraft | null>(null);
  const [disconnectId, setDisconnectId] = useState("");
  const accounts = connections.data?.connections ?? [];
  const active = accounts.filter((c) => c.status === "active");
  const connectionId = active.some((c) => c.id === selected)
    ? selected
    : (active[0]?.id ?? "");
  const posts = useQuery({
    ...redditReadOptions(wsId, "search", search ?? {}),
    enabled: !!search && search.connection_id === connectionId,
  });
  const discussion = useQuery({
    ...redditReadOptions(wsId, "thread", {
      connection_id: connectionId,
      fullname: thread,
      limit: "50",
    }),
    enabled: !!thread && !!connectionId,
  });
  async function begin(id = "", reply = false) {
    try {
      const result = await connect.mutateAsync({ id, reply });
      await openExternal(result.url);
    } catch {
      toast.error(t(($) => $.reddit.error));
    }
  }
  const account = active.find((c) => c.id === connectionId);
  if (connections.isLoading)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t(($) => $.reddit.loading)}
      </p>
    );
  if (connections.isError)
    return <p role="alert">{t(($) => $.reddit.error)}</p>;
  if (connections.data?.configured !== true)
    return (
      <p className="rounded-lg border p-5 text-sm text-muted-foreground">
        {t(($) => $.reddit.not_configured)}
      </p>
    );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="reddit-account">{t(($) => $.reddit.account)}</Label>
          {active.length ? (
            <select
              id="reddit-account"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={connectionId}
              onChange={(e) => {
                setSelected(e.target.value);
                setThread("");
                setSearch(null);
              }}
            >
              {active.map((c) => (
                <option key={c.id} value={c.id}>
                  {`u/${c.username} · `}
                  {c.can_reply
                    ? t(($) => $.reddit.reply_enabled)
                    : t(($) => $.reddit.read_only)}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t(($) => $.reddit.empty_accounts)}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t(($) => $.reddit.refresh)}
          onClick={() => void connections.refetch()}
        >
          <RefreshCw className="size-4" />
        </Button>
        {canManage && (
          <Button
            variant="outline"
            disabled={connect.isPending}
            onClick={() => void begin()}
          >
            {t(($) => $.reddit.connect)}
          </Button>
        )}
        {canManage && account && !account.can_reply && (
          <Button
            disabled={connect.isPending}
            onClick={() => void begin(account.id, true)}
          >
            {t(($) => $.reddit.enable_reply)}
          </Button>
        )}
        {canManage && account && (
          <Button variant="ghost" onClick={() => setDisconnectId(account.id)}>
            {t(($) => $.reddit.disconnect)}
          </Button>
        )}
      </div>
      {connectionId && (
        <>
          <form
            className="grid items-end gap-3 sm:grid-cols-[1fr_2fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              setThread("");
              setSearch({
                connection_id: connectionId,
                subreddit: sub.trim(),
                query: query.trim(),
                limit: "25",
              });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="reddit-sub">{t(($) => $.reddit.community)}</Label>
              <Input
                id="reddit-sub"
                value={sub}
                onChange={(e) => setSub(e.target.value)}
                placeholder="SaaS"
                required
                maxLength={23}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reddit-query">{t(($) => $.reddit.query)}</Label>
              <Input
                id="reddit-query"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                maxLength={300}
              />
            </div>
            <Button type="submit" disabled={!sub.trim() || posts.isFetching}>
              {posts.isFetching
                ? t(($) => $.reddit.loading)
                : t(($) => $.reddit.search)}
            </Button>
          </form>
          <div
            className={thread ? "grid min-w-0 gap-5 lg:grid-cols-2" : "min-w-0"}
          >
            <section className="min-w-0 overflow-hidden rounded-lg border">
              <h3 className="border-b bg-muted/30 px-4 py-3 text-sm font-semibold">
                {t(($) => $.reddit.posts)}
              </h3>
              {posts.isError ? (
                <p role="alert" className="p-4 text-sm">
                  {t(($) => $.reddit.read_failed)}
                </p>
              ) : !search ? (
                <p className="p-6 text-sm text-muted-foreground">
                  {t(($) => $.reddit.start_read)}
                </p>
              ) : posts.isFetching ? (
                <p role="status" className="p-4 text-sm">
                  {t(($) => $.reddit.loading)}
                </p>
              ) : (posts.data?.items ?? []).length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">
                  {t(($) => $.reddit.empty_posts)}
                </p>
              ) : (
                <div className="max-h-[34rem] divide-y overflow-y-auto">
                  {posts.data?.items.map((item) => (
                    <ContentRow
                      key={item.fullname}
                      item={item}
                      onExpand={() => setThread(item.fullname)}
                      onReply={() =>
                        setComposer({
                          target: item.fullname,
                          connection: connectionId,
                        })
                      }
                    />
                  ))}
                </div>
              )}
              {posts.data?.next_cursor && (
                <div className="border-t p-3">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={posts.isFetching}
                    onClick={() =>
                      setSearch({ ...search!, after: posts.data!.next_cursor })
                    }
                  >
                    {t(($) => $.reddit.more)}
                  </Button>
                </div>
              )}
            </section>
            {thread && (
              <section className="min-w-0 overflow-hidden rounded-lg border">
                <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
                  <h3 className="text-sm font-semibold">
                    {t(($) => $.reddit.thread)}
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setThread("")}
                  >
                    {t(($) => $.reddit.close)}
                  </Button>
                </div>
                {discussion.isFetching ? (
                  <p role="status" className="p-4 text-sm">
                    {t(($) => $.reddit.loading)}
                  </p>
                ) : discussion.isError ? (
                  <p role="alert" className="p-4 text-sm">
                    {t(($) => $.reddit.read_failed)}
                  </p>
                ) : (
                  <div className="max-h-[34rem] divide-y overflow-y-auto">
                    {discussion.data?.items.map((item) => (
                      <ContentRow
                        key={item.fullname}
                        item={item}
                        onReply={() =>
                          setComposer({
                            target: item.fullname,
                            connection: connectionId,
                          })
                        }
                      />
                    ))}
                  </div>
                )}
                {discussion.data?.partial && (
                  <p className="border-t p-3 text-xs text-muted-foreground">
                    {t(($) => $.reddit.partial)}
                  </p>
                )}
              </section>
            )}
          </div>
        </>
      )}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">{t(($) => $.reddit.drafts)}</h3>
          <p className="text-xs text-muted-foreground">
            {t(($) => $.reddit.retention)}
          </p>
        </div>
        {drafts.isError ? (
          <p role="alert">{t(($) => $.reddit.error)}</p>
        ) : (
          <div className="divide-y rounded-lg border">
            {drafts.data?.length ? (
              drafts.data.map((d) => (
                <DraftRow
                  key={d.id}
                  draft={d}
                  canManage={canManage}
                  onEdit={() =>
                    setComposer({
                      target: d.target_fullname,
                      connection: d.connection_id,
                      draft: d,
                    })
                  }
                  onReview={() => setReview(d)}
                />
              ))
            ) : (
              <p className="p-6 text-sm text-muted-foreground">
                {t(($) => $.reddit.empty_drafts)}
              </p>
            )}
          </div>
        )}
      </section>
      {composer && (
        <ReplyComposer
          key={composer.draft?.id ?? composer.target}
          wsId={wsId}
          connectionId={composer.connection}
          target={composer.target}
          draft={composer.draft}
          onClose={() => setComposer(null)}
        />
      )}
      {review && (
        <ReplyReview
          key={`${review.id}:${review.version}`}
          wsId={wsId}
          draft={review}
          canReply={accounts.some(
            (c) =>
              c.id === review.connection_id &&
              c.can_reply &&
              c.status === "active",
          )}
          onClose={() => setReview(null)}
        />
      )}
      <Dialog
        open={!!disconnectId}
        onOpenChange={(open) => {
          if (!open && !disconnect.isPending) setDisconnectId("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t(($) => $.reddit.disconnect_title)}</DialogTitle>
            <DialogDescription>
              {t(($) => $.reddit.disconnect_description)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisconnectId("")}>
              {t(($) => $.reddit.cancel)}
            </Button>
            <Button
              disabled={disconnect.isPending}
              onClick={async () => {
                try {
                  await disconnect.mutateAsync(disconnectId);
                  setDisconnectId("");
                  setSearch(null);
                  setThread("");
                } catch {
                  toast.error(t(($) => $.reddit.error));
                }
              }}
            >
              {t(($) => $.reddit.disconnect)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ContentRow({
  item,
  onReply,
  onExpand,
}: {
  item: RedditContent;
  onReply: () => void;
  onExpand?: () => void;
}) {
  const { t } = useT("connections");
  return (
    <article className="space-y-2 p-4">
      <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        <span>{`r/${item.subreddit}`}</span>
        <span>
          {item.author ? `u/${item.author}` : t(($) => $.reddit.author_deleted)}
        </span>
        <span>{item.score} ↑</span>
        {item.depth > 0 && <span>{`↳ ${item.depth}`}</span>}
      </div>
      {item.title && (
        <h4 className="break-words text-sm font-medium leading-6">
          {item.title}
        </h4>
      )}
      {item.body && (
        <p className="max-h-60 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6">
          {item.body}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {onExpand && (
          <Button variant="outline" size="sm" onClick={onExpand}>
            <MessageSquare className="size-3" />
            {t(($) => $.reddit.expand)}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={item.can_reply !== true}
          onClick={onReply}
        >
          {t(($) => $.reddit.reply)}
        </Button>
        {item.permalink.startsWith("https://www.reddit.com/r/") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void openExternal(item.permalink)}
          >
            <ExternalLink className="size-3" />
            {t(($) => $.reddit.open_reddit)}
          </Button>
        )}
      </div>
    </article>
  );
}

function DraftRow({
  draft: d,
  canManage,
  onEdit,
  onReview,
}: {
  draft: RedditDraft;
  canManage: boolean;
  onEdit: () => void;
  onReview: () => void;
}) {
  const { t } = useT("connections");
  const date = useDateTime();
  const labels: Record<string, string> = {
    pending: t(($) => $.reddit.pending),
    queued: t(($) => $.reddit.status_queued),
    sending: t(($) => $.reddit.sending),
    sent: t(($) => $.reddit.sent),
    failed: t(($) => $.reddit.failed),
    unknown: t(($) => $.reddit.unknown),
    cancelled: t(($) => $.reddit.cancelled),
  };
  return (
    <article className="space-y-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {`u/${d.username} `}
          <span className="text-muted-foreground">
            {`→ r/${d.subreddit} · ${d.target_fullname}`}
          </span>
        </p>
        <span className="rounded bg-muted px-2 py-1 text-xs">
          {labels[d.status] ?? t(($) => $.reddit.status_unknown)}
        </span>
      </div>
      <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6">
        {d.body}
      </p>
      {d.error_code && (
        <p className="text-xs text-destructive">
          {errorLabel(d.error_code, t)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-xs text-muted-foreground">
          {t(($) => $.reddit.expires)} {date(d.expires_at)}
        </span>
        {["pending", "failed"].includes(d.status) && (
          <Button variant="outline" size="sm" onClick={onEdit}>
            {t(($) => $.reddit.edit)}
          </Button>
        )}
        {canManage &&
          ["pending", "unknown", "queued", "failed"].includes(d.status) && (
            <Button
              size="sm"
              variant={d.status === "unknown" ? "outline" : "default"}
              onClick={onReview}
            >
              {d.status === "unknown"
                ? t(($) => $.reddit.verify)
                : t(($) => $.reddit.review)}
            </Button>
          )}
        {d.status === "sent" && /^t1_[a-z0-9]+$/.test(d.sent_fullname) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void openExternal(
                `https://www.reddit.com/r/${d.subreddit}/comments/${d.post_fullname.slice(3)}/comment/${d.sent_fullname.slice(3)}/`,
              )
            }
          >
            {t(($) => $.reddit.sent_link)}
          </Button>
        )}
      </div>
    </article>
  );
}

function errorLabel(
  code: string,
  t: ReturnType<typeof useT<"connections">>["t"],
) {
  switch (code) {
    case "rate_limited":
      return t(($) => $.reddit.rate_limited);
    case "target_changed":
      return t(($) => $.reddit.target_changed);
    case "target_unavailable":
      return t(($) => $.reddit.target_unavailable);
    case "connection_unavailable":
      return t(($) => $.reddit.connection_unavailable);
    case "approval_unavailable":
      return t(($) => $.reddit.approval_unavailable);
    case "receipt_unknown":
      return t(($) => $.reddit.receipt_unknown);
    case "interrupted":
      return t(($) => $.reddit.interrupted);
    default:
      return t(($) => $.reddit.rejected);
  }
}

function ReplyComposer({
  wsId,
  connectionId,
  target,
  draft,
  onClose,
}: {
  wsId: string;
  connectionId: string;
  target: string;
  draft?: RedditDraft;
  onClose: () => void;
}) {
  const { t } = useT("connections");
  const [body, setBody] = useState(draft?.body ?? "");
  const read = useQuery(
    redditReadOptions(wsId, "thread", {
      connection_id: connectionId,
      fullname: target,
      limit: "50",
    }),
  );
  const item = read.data?.items.find((i) => i.fullname === target);
  const save = useRedditSaveDraft(wsId);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t(($) => $.reddit.reply)}</DialogTitle>
          <DialogDescription>{t(($) => $.reddit.draft_help)}</DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {t(($) => $.reddit.target)} {target}
        </p>
        {read.isFetching ? (
          <p role="status">{t(($) => $.reddit.loading)}</p>
        ) : !item ? (
          <p role="alert">{t(($) => $.reddit.read_failed)}</p>
        ) : (
          <blockquote className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words border-l-2 pl-3 text-sm text-muted-foreground">
            {item.title}
            {item.title && "\n"}
            {item.body}
          </blockquote>
        )}
        <div className="space-y-2">
          <Label htmlFor="reddit-reply-body">{t(($) => $.reddit.body)}</Label>
          <Textarea
            id="reddit-reply-body"
            className="min-h-48"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t(($) => $.reddit.draft_placeholder)}
          />
          <p className="text-right text-xs text-muted-foreground">
            {`${Array.from(body).length} / 9500`}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            {t(($) => $.reddit.cancel)}
          </Button>
          <Button
            disabled={
              save.isPending ||
              read.isFetching ||
              !item?.can_reply ||
              !body.trim() ||
              Array.from(body).length > 9500
            }
            onClick={async () => {
              if (!item) return;
              try {
                await save.mutateAsync({
                  id: draft?.id,
                  input: {
                    connection_id: connectionId,
                    target_fullname: target,
                    target_version: item.content_version,
                    body,
                    expected_version: draft?.version,
                  },
                });
                toast.success(t(($) => $.reddit.saved));
                onClose();
              } catch {
                toast.error(t(($) => $.reddit.error));
              }
            }}
          >
            {t(($) => $.reddit.save)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReplyReview({
  wsId,
  draft: d,
  canReply,
  onClose,
}: {
  wsId: string;
  draft: RedditDraft;
  canReply: boolean;
  onClose: () => void;
}) {
  const { t } = useT("connections");
  const [receipt, setReceipt] = useState("");
  const action = useRedditDraftAction(wsId);
  const read = useQuery({
    ...redditReadOptions(wsId, "thread", {
      connection_id: d.connection_id,
      fullname: d.target_fullname,
      limit: "50",
    }),
    enabled: d.status === "pending",
  });
  const target = read.data?.items.find((i) => i.fullname === d.target_fullname);
  const changed =
    !target || target.content_version !== d.target_version || !target.can_reply;
  async function run(kind: "approve" | "cancel" | "verify") {
    try {
      await action.mutateAsync({
        id: d.id,
        action: kind,
        version: d.version,
        fullname: receipt.trim(),
      });
      if (kind !== "cancel")
        toast.success(
          kind === "approve"
            ? t(($) => $.reddit.queued)
            : t(($) => $.reddit.verified),
        );
      onClose();
    } catch {
      toast.error(t(($) => $.reddit.error));
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !action.isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {d.status === "unknown"
              ? t(($) => $.reddit.verify)
              : t(($) => $.reddit.review)}
          </DialogTitle>
          <DialogDescription>
            {d.status === "unknown"
              ? t(($) => $.reddit.verify_help)
              : t(($) => $.reddit.review_help)}
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">
            {t(($) => $.reddit.account)}
          </dt>
          <dd>{`u/${d.username}`}</dd>
          <dt className="text-muted-foreground">{t(($) => $.reddit.target)}</dt>
          <dd className="break-all">
            {`r/${d.subreddit} · ${d.target_fullname}`}
          </dd>
        </dl>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            void openExternal(
              `https://www.reddit.com/r/${d.subreddit}/comments/${d.post_fullname.slice(3)}/`,
            )
          }
        >
          <ExternalLink className="size-3" />
          {t(($) => $.reddit.open_reddit)}
        </Button>
        {d.status === "pending" &&
          (read.isFetching ? (
            <p role="status">{t(($) => $.reddit.loading)}</p>
          ) : changed ? (
            <p role="alert" className="text-sm text-destructive">
              {t(($) => $.reddit.changed)}
            </p>
          ) : (
            <blockquote className="max-h-40 overflow-auto whitespace-pre-wrap break-words border-l-2 pl-3 text-sm text-muted-foreground">
              {target?.title}
              {target?.title && "\n"}
              {target?.body}
            </blockquote>
          ))}
        <div className="space-y-2">
          <p className="text-sm font-medium">{t(($) => $.reddit.body)}</p>
          <p className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-4 text-sm leading-6">
            {d.body}
          </p>
        </div>
        {d.status === "unknown" && (
          <div className="space-y-2">
            <Label htmlFor="reddit-receipt">{t(($) => $.reddit.receipt)}</Label>
            <Input
              id="reddit-receipt"
              value={receipt}
              onChange={(e) => setReceipt(e.target.value)}
              placeholder="t1_…"
            />
          </div>
        )}
        {!canReply && d.status === "pending" && (
          <p className="text-sm text-muted-foreground">
            {t(($) => $.reddit.permissions)}
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={action.isPending}
            onClick={onClose}
          >
            {t(($) => $.reddit.close)}
          </Button>
          {["pending", "queued", "failed"].includes(d.status) && (
            <Button
              variant="outline"
              disabled={action.isPending}
              onClick={() => void run("cancel")}
            >
              {t(($) => $.reddit.cancel_draft)}
            </Button>
          )}
          {d.status === "pending" && (
            <Button
              disabled={
                action.isPending || changed || !canReply || read.isFetching
              }
              onClick={() => void run("approve")}
            >
              {t(($) => $.reddit.approve)}
            </Button>
          )}
          {d.status === "unknown" && (
            <Button
              disabled={
                action.isPending || !/^t1_[a-z0-9]+$/.test(receipt.trim())
              }
              onClick={() => void run("verify")}
            >
              {t(($) => $.reddit.verify)}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
