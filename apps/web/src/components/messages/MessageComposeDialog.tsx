/**
 * "Message the owner" composer — opened from a shared item the Power User is
 * interested in. Posts the first message of a negotiation thread (the server
 * upserts the (article, requester) thread) and hands the new thread id back so
 * the caller can jump straight into the conversation.
 */
import { useEffect, useRef, useState } from "react";
import { MessagesSquare } from "lucide-react";
import { useI18n } from "../../i18n/i18n";
import { messagesAPI } from "../../services/api";
import { getErrorMessage } from "../../utils/error";
import { Button } from "../ui";
import Modal from "../common/Modal";
import ArticleThumb from "../articles/ArticleThumb";
import { MESSAGE_BODY_MAX } from "./constants";

interface Props {
  articleId: number;
  articleName: string;
  articleModel?: string | null;
  productImageUrl?: string | null;
  ownerEmail?: string | null;
  onSent: (threadId: number) => void;
  onClose: () => void;
}

const TITLE_ID = "message-compose-title";

export default function MessageComposeDialog({
  articleId,
  articleName,
  articleModel,
  productImageUrl,
  ownerEmail,
  onSent,
  onClose,
}: Props) {
  const { t } = useI18n();
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus the message field on open (jsx-a11y/no-autofocus forbids the prop).
  useEffect(() => {
    const id = setTimeout(() => textareaRef.current?.focus(), 0);
    return () => clearTimeout(id);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Block a double-submit landing before the button disables — that would
    // post the same opening message twice into the thread.
    if (loading || body.trim().length === 0) return;
    setError(null);
    setLoading(true);
    try {
      const { threadId } = await messagesAPI.startThread(
        articleId,
        body.trim()
      );
      onSent(threadId);
    } catch (e) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      titleId={TITLE_ID}
      panelClassName="ui-card w-full max-w-md p-6 space-y-4"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <MessagesSquare className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 id={TITLE_ID} className="text-lg font-semibold ui-title">
            {t("messages.compose.title")}
          </h2>
          <p
            className="truncate text-sm ui-text-muted"
            title={ownerEmail ?? undefined}
          >
            {ownerEmail
              ? t("messages.compose.toOwner").replace("{email}", ownerEmail)
              : t("messages.compose.subtitle")}
          </p>
        </div>
      </div>

      {/* The pinned item so both sides always know which article this is about. */}
      <div className="flex items-center gap-3 rounded-lg border ui-divider p-3">
        <ArticleThumb
          src={productImageUrl ?? null}
          alt={articleName}
          size={44}
        />
        <div className="min-w-0">
          <div
            className="truncate text-sm font-medium ui-title"
            title={articleName}
          >
            {articleName}
          </div>
          {articleModel && (
            <div
              className="truncate text-xs ui-text-muted"
              title={articleModel}
            >
              {articleModel}
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="message-compose-body"
            className="mb-1 block text-sm font-medium ui-title"
          >
            {t("messages.compose.label")}
          </label>
          <textarea
            ref={textareaRef}
            id="message-compose-body"
            className="w-full resize-none rounded-md border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("messages.compose.placeholder")}
            maxLength={MESSAGE_BODY_MAX}
          />
          <p className="mt-1 text-right text-xs ui-text-muted tabular-nums">
            {body.length} / {MESSAGE_BODY_MAX}
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm ui-text-error">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={loading}
            disabled={body.trim().length === 0}
          >
            {t("messages.compose.send")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
