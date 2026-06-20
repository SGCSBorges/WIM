/**
 * Messages — secure negotiation chat between Power Users about a shared item.
 *
 * Two-pane inbox: a thread list (each row pinned to the article it concerns,
 * so the owner instantly recognises the item) and the selected conversation.
 * On narrow screens the panes stack — selecting a thread swaps the list for
 * the conversation with a back affordance. The interested party can launch an
 * ownership transfer straight from the thread, tying chat into the existing
 * transfer flow.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  MessagesSquare,
  Send,
  ArrowLeft,
  ArrowRightLeft,
  RotateCw,
} from "lucide-react";
import { useI18n } from "../../i18n/i18n";
import { usePreferences } from "../../preferences/preferences";
import {
  messagesAPI,
  type MessageThreadSummary,
  type MessageThreadDetail,
} from "../../services/api";
import { getErrorMessage } from "../../utils/error";
import { useToast } from "../common/Toast";
import { useMessagesUnread } from "../../messages/unread";
import { PageHeader, Section, Button } from "../ui";
import { EmptyState, ErrorBanner } from "../common/States";
import { Skeleton } from "../common/Skeleton";
import ArticleThumb from "../articles/ArticleThumb";
import TransferDialog from "../articles/TransferDialog";
import { MESSAGE_BODY_MAX } from "./constants";

/** The other participant's email, from the current user's point of view. */
function otherEmail(t: MessageThreadSummary): string {
  return t.role === "owner" ? t.requester.email : t.owner.email;
}

export default function MessagesView() {
  const { t } = useI18n();
  const toast = useToast();
  const { formatDateTime } = usePreferences();
  const { refresh: refreshUnread } = useMessagesUnread();
  const [searchParams, setSearchParams] = useSearchParams();

  const [threads, setThreads] = useState<MessageThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedId = (() => {
    const raw = searchParams.get("thread");
    const n = raw ? Number(raw) : NaN;
    return Number.isInteger(n) && n > 0 ? n : null;
  })();

  const [detail, setDetail] = useState<MessageThreadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);

  // Keeps the message list scrolled to the newest entry. We scroll the
  // container's own scrollTop (not scrollIntoView) so a new message never
  // yanks the whole page.
  const streamRef = useRef<HTMLDivElement | null>(null);

  const loadThreads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { items } = await messagesAPI.getThreads();
      setThreads(items);
    } catch (e) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const loadDetail = useCallback(
    async (id: number) => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const data = await messagesAPI.getThread(id);
        setDetail(data);
        // Opening the thread cleared the unread flag server-side — reflect that
        // locally in the list + the nav badge without a full reload.
        setThreads((prev) =>
          prev.map((th) => (th.id === id ? { ...th, unread: false } : th))
        );
        void refreshUnread();
      } catch (e) {
        setDetailError(getErrorMessage(e, t("common.errorOccurred")));
        setDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [t, refreshUnread]
  );

  useEffect(() => {
    if (selectedId === null) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedId);
    setReply("");
  }, [selectedId, loadDetail]);

  // Auto-scroll to newest message when the conversation grows.
  useEffect(() => {
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [detail?.messages.length]);

  const select = (id: number) => {
    setSearchParams({ thread: String(id) });
  };
  const backToList = () => {
    setSearchParams({});
  };

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending || selectedId === null || reply.trim().length === 0) return;
    setSending(true);
    try {
      await messagesAPI.postMessage(selectedId, reply.trim());
      setReply("");
      await loadDetail(selectedId);
      // Bump the just-replied thread to the top of the inbox locally.
      await loadThreads();
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setSending(false);
    }
  };

  const myUserId =
    detail === null
      ? null
      : detail.role === "owner"
        ? detail.owner.userId
        : detail.requester.userId;

  return (
    <div>
      <PageHeader
        title={t("nav.messages")}
        subtitle={t("messages.subtitle")}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadThreads()}
            disabled={loading}
            leftIcon={
              <RotateCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            }
          >
            {t("common.refresh")}
          </Button>
        }
      />

      {error ? (
        <ErrorBanner
          message={error}
          onRetry={() => void loadThreads()}
          retryLabel={t("common.retry")}
        />
      ) : loading ? (
        <Section>
          <Skeleton height={72} />
          <Skeleton height={72} />
          <Skeleton height={72} />
        </Section>
      ) : threads.length === 0 ? (
        <EmptyState
          icon={<MessagesSquare className="h-8 w-8" />}
          title={t("messages.empty.title")}
          description={t("messages.empty.hint")}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-[minmax(0,22rem)_1fr]">
          {/* Inbox list */}
          <div className={selectedId !== null ? "hidden md:block" : ""}>
            <div className="ui-card overflow-hidden">
              <ul className="divide-y ui-divider">
                {threads.map((th) => {
                  const active = th.id === selectedId;
                  return (
                    <li key={th.id}>
                      <button
                        type="button"
                        onClick={() => select(th.id)}
                        aria-current={active ? "true" : undefined}
                        className={`flex w-full items-start gap-3 px-3 py-3 text-left transition-colors ${
                          active ? "ui-nav-item-active" : "ui-btn-ghost"
                        }`}
                      >
                        <ArticleThumb
                          src={th.article.productImageUrl}
                          alt={th.article.articleNom}
                          size={44}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium ui-title">
                              {th.article.articleNom}
                            </span>
                            {th.unread && (
                              <span
                                className="ml-auto h-2 w-2 shrink-0 rounded-full bg-primary"
                                aria-label={t("messages.unread")}
                              />
                            )}
                          </div>
                          <div className="truncate text-xs ui-text-muted">
                            {otherEmail(th)}
                          </div>
                          {th.lastMessage && (
                            <div
                              className={`mt-0.5 truncate text-xs ${
                                th.unread
                                  ? "font-medium ui-title"
                                  : "ui-text-muted"
                              }`}
                            >
                              {th.lastMessage}
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          {/* Conversation */}
          <div className={selectedId === null ? "hidden md:block" : ""}>
            {selectedId === null ? (
              <div className="hidden h-full min-h-64 place-items-center md:grid">
                <p className="text-sm ui-text-muted">
                  {t("messages.selectThread")}
                </p>
              </div>
            ) : detailLoading ? (
              <Section>
                <Skeleton height={64} />
                <Skeleton height={120} />
              </Section>
            ) : detailError ? (
              <ErrorBanner
                message={detailError}
                onRetry={() => void loadDetail(selectedId)}
                retryLabel={t("common.retry")}
              />
            ) : detail ? (
              <div className="ui-card overflow-hidden">
                {/* Pinned article header — how the owner identifies the item. */}
                <div className="flex items-center gap-3 border-b ui-divider p-3">
                  <button
                    type="button"
                    onClick={backToList}
                    className="ui-btn-ghost grid h-9 w-9 shrink-0 place-items-center rounded-lg md:hidden"
                    aria-label={t("messages.back")}
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <ArticleThumb
                    src={detail.article.productImageUrl}
                    alt={detail.article.articleNom}
                    size={44}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold ui-title">
                      {detail.article.articleNom}
                      {detail.article.articleModele
                        ? ` — ${detail.article.articleModele}`
                        : ""}
                    </div>
                    <div className="truncate text-xs ui-text-muted">
                      {otherEmail(detail)}
                    </div>
                  </div>
                  {/* Only the interested party can pull ownership to themselves. */}
                  {detail.role === "requester" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowTransfer(true)}
                      leftIcon={<ArrowRightLeft className="h-4 w-4" />}
                    >
                      {t("transfer.pull")}
                    </Button>
                  )}
                </div>

                {/* Message stream */}
                <div
                  ref={streamRef}
                  className="max-h-[55vh] space-y-3 overflow-y-auto p-4"
                >
                  {detail.messages.map((m) => {
                    const mine = m.senderUserId === myUserId;
                    return (
                      <div
                        key={m.id}
                        className={`flex ${mine ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                            mine
                              ? "rounded-br-sm bg-primary text-primary-contrast"
                              : "rounded-bl-sm ui-card border ui-divider"
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">
                            {m.body}
                          </p>
                          <p
                            className={`mt-1 text-right text-[10px] tabular-nums ${
                              mine
                                ? "text-primary-contrast/70"
                                : "ui-text-muted"
                            }`}
                          >
                            {formatDateTime(m.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Composer */}
                <form
                  onSubmit={sendReply}
                  className="flex items-end gap-2 border-t ui-divider p-3"
                >
                  <textarea
                    className="min-h-[2.5rem] flex-1 resize-none rounded-md border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    rows={1}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder={t("messages.composer.placeholder")}
                    maxLength={MESSAGE_BODY_MAX}
                    aria-label={t("messages.composer.placeholder")}
                    onKeyDown={(e) => {
                      // Enter sends; Shift+Enter inserts a newline.
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendReply(e);
                      }
                    }}
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    loading={sending}
                    disabled={reply.trim().length === 0}
                    leftIcon={<Send className="h-4 w-4" />}
                  >
                    {t("messages.send")}
                  </Button>
                </form>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {showTransfer && detail && (
        <TransferDialog
          articleId={detail.article.articleId}
          articleName={detail.article.articleNom}
          direction="pull"
          onDone={() => {
            setShowTransfer(false);
            toast.show(t("transfer.requested"), { kind: "success" });
          }}
          onClose={() => setShowTransfer(false)}
        />
      )}
    </div>
  );
}
