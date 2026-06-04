import { useId, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { useI18n } from "../../i18n/i18n";
import { transfersAPI } from "../../services/api";
import { getErrorMessage } from "../../utils/error";
import { isValidEmail } from "../../utils/validation";
import Modal from "../common/Modal";
import { Button, Input } from "../ui";

interface Props {
  articleId: number;
  articleName: string;
  direction: "push" | "pull";
  onDone: () => void;
  onClose: () => void;
}

export default function TransferDialog({
  articleId,
  articleName,
  direction,
  onDone,
  onClose,
}: Props) {
  const { t } = useI18n();
  const titleId = useId();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (direction === "push" && !isValidEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }
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
    <Modal open onClose={onClose} titleId={titleId}>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <ArrowRightLeft className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 id={titleId} className="text-lg font-semibold">
            {t(
              direction === "push"
                ? "transfer.dialog.pushTitle"
                : "transfer.dialog.pullTitle"
            )}
          </h2>
          <p className="text-sm text-muted">{articleName}</p>
        </div>
      </div>

      <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-600 dark:text-yellow-400">
        {t(
          direction === "push"
            ? "transfer.dialog.pushWarning"
            : "transfer.dialog.pullWarning"
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {direction === "push" && (
          <div>
            <label className="mb-1 block text-sm font-medium">
              {t("transfer.dialog.email")}
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              required
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium">
            {t("transfer.dialog.message")}
          </label>
          <textarea
            className="w-full resize-none rounded-md border border-line bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("transfer.dialog.messagePlaceholder")}
            maxLength={500}
          />
        </div>

        {error && <p className="text-sm text-error">{error}</p>}

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
