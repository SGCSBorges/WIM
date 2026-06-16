import { useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { useI18n } from "../../i18n/i18n";
import { transfersAPI } from "../../services/api";
import { getErrorMessage } from "../../utils/error";
import { Button, Input } from "../ui";
import Modal from "../common/Modal";

interface Props {
  articleId: number;
  articleName: string;
  direction: "push" | "pull";
  onDone: () => void;
  onClose: () => void;
}

const TITLE_ID = "transfer-dialog-title";

export default function TransferDialog({
  articleId,
  articleName,
  direction,
  onDone,
  onClose,
}: Props) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Guard against a second Enter/submit landing before the re-render
    // disables the button — two in-flight requests would create two
    // PENDING transfer rows.
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      if (direction === "push") {
        await transfersAPI.pushTransfer(articleId, email, message || undefined);
      } else {
        await transfersAPI.pullTransfer(articleId, message || undefined);
      }
      onDone();
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
          <ArrowRightLeft className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h2 id={TITLE_ID} className="text-lg font-semibold ui-title">
            {t(
              direction === "push"
                ? "transfer.dialog.pushTitle"
                : "transfer.dialog.pullTitle"
            )}
          </h2>
          <p className="text-sm ui-text-muted">{articleName}</p>
        </div>
      </div>

      <div
        role="alert"
        className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm ui-text-warn"
      >
        {t(
          direction === "push"
            ? "transfer.dialog.pushWarning"
            : "transfer.dialog.pullWarning"
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {direction === "push" && (
          <div>
            <label
              htmlFor="transfer-email"
              className="mb-1 block text-sm font-medium ui-title"
            >
              {t("transfer.dialog.email")}
            </label>
            <Input
              id="transfer-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              required
            />
          </div>
        )}

        <div>
          <label
            htmlFor="transfer-message"
            className="mb-1 block text-sm font-medium ui-title"
          >
            {t("transfer.dialog.message")}
          </label>
          <textarea
            id="transfer-message"
            className="w-full resize-none rounded-md border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("transfer.dialog.messagePlaceholder")}
            maxLength={500}
          />
          <p className="mt-1 text-right text-xs ui-text-muted tabular-nums">
            {message.length} / 500
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
          <Button type="submit" variant="primary" loading={loading}>
            {t(
              direction === "push"
                ? "transfer.dialog.pushSubmit"
                : "transfer.dialog.pullSubmit"
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
