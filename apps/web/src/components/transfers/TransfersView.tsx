import { useState, useEffect, useCallback } from "react";
import { ArrowRightLeft, Package, Check, X } from "lucide-react";
import { useI18n, type TranslationKey } from "../../i18n/i18n";
import { usePreferences } from "../../preferences/preferences";
import { transfersAPI, type TransferItem } from "../../services/api";
import { getErrorMessage } from "../../utils/error";
import { useToast } from "../common/Toast";
import { EmptyState, ErrorBanner } from "../common/States";
import { Skeleton } from "../common/Skeleton";
import {
  PageHeader,
  Section,
  Badge,
  Button,
  Segmented,
  type BadgeTone,
} from "../ui";
import { Link } from "react-router-dom";
import type { ExtrasKey } from "../../i18n/translations.extras";

type TransferAction = { id: number; kind: "accept" | "reject" | "revoke" };

function statusTone(status: string): BadgeTone {
  switch (status) {
    case "PENDING":
      return "warning";
    case "ACCEPTED":
      return "success";
    case "REJECTED":
    case "REVOKED":
    case "EXPIRED":
      return "danger";
    default:
      return "neutral";
  }
}

export default function TransfersView() {
  const { t } = useI18n();
  const toast = useToast();
  const [tab, setTab] = useState<"incoming" | "outgoing">("incoming");
  const [incoming, setIncoming] = useState<TransferItem[]>([]);
  const [outgoing, setOutgoing] = useState<TransferItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<TransferAction | null>(
    null
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [inc, out] = await Promise.all([
        transfersAPI.getIncoming(),
        transfersAPI.getOutgoing(),
      ]);
      setIncoming(inc.items);
      setOutgoing(out.items);
    } catch (e) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(
    action: TransferAction,
    job: () => Promise<unknown>,
    successKey: TranslationKey | ExtrasKey
  ) {
    if (actionLoading !== null) return;
    setActionLoading(action);
    try {
      await job();
      toast.show(t(successKey), { kind: "success" });
      void load();
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setActionLoading(null);
    }
  }

  const handleAccept = (transfer: TransferItem) =>
    runAction(
      { id: transfer.id, kind: "accept" },
      () => transfersAPI.accept(transfer.token),
      "transfer.accepted"
    );

  const handleReject = (transfer: TransferItem) =>
    runAction(
      { id: transfer.id, kind: "reject" },
      () => transfersAPI.reject(transfer.token),
      "transfer.rejected"
    );

  const handleRevoke = (transfer: TransferItem) =>
    runAction(
      { id: transfer.id, kind: "revoke" },
      () => transfersAPI.revoke(transfer.id),
      "transfer.revoked"
    );

  const pendingIncoming = incoming.filter((item) => item.status === "PENDING");

  return (
    <div>
      <PageHeader
        title={t("nav.transfers")}
        subtitle={
          pendingIncoming.length > 0
            ? t("transfer.pendingCount").replace(
                "{count}",
                String(pendingIncoming.length)
              )
            : undefined
        }
      />

      <Segmented
        className="mb-6"
        ariaLabel={t("nav.transfers")}
        value={tab}
        onChange={setTab}
        options={[
          {
            value: "incoming",
            label: (
              <span className="inline-flex items-center gap-2">
                {t("transfer.tabIncoming")}
                {pendingIncoming.length > 0 && (
                  <span
                    className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-contrast"
                    aria-label={t("transfer.pendingCount").replace(
                      "{count}",
                      String(pendingIncoming.length)
                    )}
                  >
                    <span aria-hidden="true">{pendingIncoming.length}</span>
                  </span>
                )}
              </span>
            ),
          },
          { value: "outgoing", label: t("transfer.tabOutgoing") },
        ]}
      />

      {loading ? (
        <Section>
          <Skeleton height={64} />
          <Skeleton height={64} />
        </Section>
      ) : error ? (
        <ErrorBanner
          message={error}
          onRetry={() => void load()}
          retryLabel={t("common.retry")}
        />
      ) : tab === "incoming" ? (
        incoming.length === 0 ? (
          <EmptyState
            icon={<ArrowRightLeft className="h-8 w-8" />}
            title={t("transfer.noIncoming")}
          />
        ) : (
          <Section>
            <div className="divide-y divide-line">
              {incoming.map((transfer) => (
                <TransferRow
                  key={transfer.id}
                  transfer={transfer}
                  side="incoming"
                  actionLoading={actionLoading}
                  onAccept={() => void handleAccept(transfer)}
                  onReject={() => void handleReject(transfer)}
                  t={t}
                />
              ))}
            </div>
          </Section>
        )
      ) : outgoing.length === 0 ? (
        <EmptyState
          icon={<ArrowRightLeft className="h-8 w-8" />}
          title={t("transfer.noOutgoing")}
        />
      ) : (
        <Section>
          <div className="divide-y divide-line">
            {outgoing.map((transfer) => (
              <TransferRow
                key={transfer.id}
                transfer={transfer}
                side="outgoing"
                actionLoading={actionLoading}
                onRevoke={() => void handleRevoke(transfer)}
                t={t}
              />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

interface RowProps {
  transfer: TransferItem;
  side: "incoming" | "outgoing";
  actionLoading: TransferAction | null;
  onAccept?: () => void;
  onReject?: () => void;
  onRevoke?: () => void;
  t: (k: TranslationKey | ExtrasKey) => string;
}

function TransferRow({
  transfer,
  side,
  actionLoading,
  onAccept,
  onReject,
  onRevoke,
  t,
}: RowProps) {
  const { formatDate } = usePreferences();
  const isLoading = (kind: TransferAction["kind"]) =>
    actionLoading?.id === transfer.id && actionLoading.kind === kind;
  // While any action is in flight, every other button is disabled so a
  // click can't silently no-op.
  const otherBusy = actionLoading !== null;
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Package className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          {side === "incoming" ||
          transfer.status !== "ACCEPTED" ||
          transfer.direction === "PULL" ? (
            <Link
              to={`/articles/${transfer.articleId}`}
              className="font-medium hover:underline"
            >
              {transfer.article.articleNom}
            </Link>
          ) : (
            <span className="font-medium">{transfer.article.articleNom}</span>
          )}
          <p className="text-sm text-muted">{transfer.article.articleModele}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Badge tone={statusTone(transfer.status)}>
              {t(
                `transfer.status.${transfer.status}` as
                  | TranslationKey
                  | ExtrasKey
              )}
            </Badge>
            <Badge tone="neutral">
              {t(
                `transfer.direction.${transfer.direction}` as
                  | TranslationKey
                  | ExtrasKey
              )}
            </Badge>
            <span>
              {t("transfer.from")} <strong>{transfer.owner.email}</strong>
            </span>
            <span aria-hidden="true">→</span>
            <span>
              {t("transfer.to")} <strong>{transfer.requester.email}</strong>
            </span>
          </div>
          {transfer.message && (
            <p className="mt-1 text-sm italic text-muted">
              &ldquo;{transfer.message}&rdquo;
            </p>
          )}
          <p className="mt-1 text-xs text-muted">
            {t("transfer.expiresOn")} {formatDate(transfer.expiresAt)}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        {side === "incoming" && transfer.status === "PENDING" && (
          <>
            <Button
              size="sm"
              variant="primary"
              leftIcon={<Check className="h-4 w-4" />}
              onClick={onAccept}
              loading={isLoading("accept")}
              disabled={otherBusy && !isLoading("accept")}
            >
              {t("transfer.accept")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              leftIcon={<X className="h-4 w-4" />}
              onClick={onReject}
              loading={isLoading("reject")}
              disabled={otherBusy && !isLoading("reject")}
            >
              {t("transfer.reject")}
            </Button>
          </>
        )}
        {side === "outgoing" && transfer.status === "PENDING" && (
          <Button
            size="sm"
            variant="outline"
            onClick={onRevoke}
            loading={isLoading("revoke")}
            disabled={otherBusy && !isLoading("revoke")}
          >
            {t("transfer.revoke")}
          </Button>
        )}
      </div>
    </div>
  );
}
