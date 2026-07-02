/**
 * Public, read-only item page — the target of a QR label. Renders a
 * privacy-safe card (name / brand / model / description / photo / category +
 * a coarse warranty flag) for anyone with the link; no auth, no app shell.
 * Sensitive fields (price, serial, owner, location) are never sent here.
 *
 * Lost & found: while the owner has the item marked LOST the page shows a
 * banner + an anonymous "notify the owner" form. The finder's message (and
 * optional contact) is relayed to the owner as a notification — neither
 * party learns anything about the other beyond what they type.
 */
import { useEffect, useState } from "react";
import {
  Loader2,
  Package,
  SearchCheck,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import { publicAPI } from "../../services/api";
import type { PublicItem, ArticleCategory } from "../../types";
import { useI18n } from "../../i18n/i18n";
import { getErrorMessage } from "../../utils/error";
import ArticleThumb from "../articles/ArticleThumb";
import { Badge, Button, Field, Input, Textarea } from "../ui";

const MESSAGE_MAX = 500;

function FoundReportForm({ token }: { token: string }) {
  const { t } = useI18n();
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!message.trim()) {
      setError(t("publicItem.found.messageRequired"));
      return;
    }
    setSending(true);
    try {
      await publicAPI.reportFound(token, message.trim(), contact.trim());
      setSent(true);
    } catch (err) {
      setError(getErrorMessage(err, t("common.errorOccurred")));
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <p
        role="status"
        className="rounded-lg border ui-alert-success p-3 text-center text-sm ui-text-success"
      >
        {t("publicItem.found.sent")}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3">
      <Field label={t("publicItem.found.messageLabel")} htmlFor="found-message">
        <Textarea
          id="found-message"
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={MESSAGE_MAX}
          placeholder={t("publicItem.found.messagePlaceholder")}
        />
      </Field>
      <p className="text-right text-xs ui-text-muted tabular-nums">
        {message.length} / {MESSAGE_MAX}
      </p>
      <Field label={t("publicItem.found.contactLabel")} htmlFor="found-contact">
        <Input
          id="found-contact"
          type="text"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          maxLength={120}
          autoComplete="email"
          placeholder={t("publicItem.found.contactPlaceholder")}
        />
      </Field>
      {error && (
        <p role="alert" className="text-sm ui-text-error">
          {error}
        </p>
      )}
      <Button
        type="submit"
        variant="primary"
        className="w-full"
        loading={sending}
        aria-busy={sending}
        leftIcon={
          sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <SearchCheck className="h-4 w-4" />
          )
        }
      >
        {t("publicItem.found.submit")}
      </Button>
    </form>
  );
}

export default function PublicItemView({ token }: { token: string }) {
  const { t } = useI18n();
  const [item, setItem] = useState<PublicItem | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let alive = true;
    publicAPI
      .getItem(token)
      .then((i) => {
        if (!alive) return;
        setItem(i);
        setState("ok");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [token]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg p-4">
      <main className="ui-card w-full max-w-md p-6">
        {state === "loading" && (
          <p className="text-center text-sm ui-text-muted" role="status">
            {t("common.loading")}
          </p>
        )}

        {state === "error" && (
          <div className="text-center">
            <Package
              className="mx-auto h-10 w-10 ui-text-muted"
              aria-hidden="true"
            />
            <p className="mt-3 text-sm ui-text-muted" role="alert">
              {t("publicItem.notFound")}
            </p>
          </div>
        )}

        {state === "ok" && item && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <ArticleThumb
                src={item.productImageUrl}
                alt={item.articleNom}
                size={140}
              />
            </div>
            <div className="text-center">
              <h1 className="text-xl font-semibold ui-title">
                {item.articleNom}
              </h1>
              <p className="ui-text-muted">
                {[item.brand, item.articleModele].filter(Boolean).join(" · ")}
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-2">
              {item.category && (
                <Badge tone="neutral">
                  {t(`articleCategory.${item.category as ArticleCategory}`)}
                </Badge>
              )}
              {item.warrantyActive === true && (
                <Badge
                  tone="success"
                  icon={<ShieldCheck className="h-3 w-3" />}
                >
                  {t("publicItem.warrantyActive")}
                </Badge>
              )}
              {item.warrantyActive === false && (
                <Badge tone="neutral" icon={<ShieldX className="h-3 w-3" />}>
                  {t("publicItem.warrantyExpired")}
                </Badge>
              )}
            </div>

            {item.articleDescription && (
              <p className="whitespace-pre-line break-words text-center text-sm">
                {item.articleDescription}
              </p>
            )}

            {item.isLost && (
              <div className="space-y-3 rounded-lg border ui-alert-warning p-4">
                <p className="text-center text-sm font-medium" role="alert">
                  {t("publicItem.found.banner")}
                </p>
                <FoundReportForm token={token} />
              </div>
            )}
          </div>
        )}
      </main>
      <p className="mt-4 text-xs ui-text-muted">{t("publicItem.footer")}</p>
    </div>
  );
}
