import { useState, useEffect, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { ArrowRightLeft, Package, Check, X } from "lucide-react";
import { useI18n, type TranslationKey } from "../../i18n/i18n";
import { transfersAPI, type TransferItem } from "../../services/api";
import { getErrorMessage } from "../../utils/error";
import { useToast } from "../common/Toast";
import { EmptyState } from "../common/States";
import { Skeleton } from "../common/Skeleton";
import { PageHeader, Section, Badge, Button, type BadgeTone } from "../ui";
import { Link } from "react-router-dom";
import type { ExtrasKey } from "../../i18n/translations.extras";

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
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [inc, out] = await Promise.all([
        transfersAPI.getIncoming(),
        transfersAPI.getOutgoing(),
      ]);
      setIncoming(inc.items);
      setOutgoing(out.items);
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAccept(transfer: TransferItem) {
    setActionLoading(transfer.id);
    try {
      await transfersAPI.accept(transfer.token);
      toast.show(t("transfer.accepted"), { kind: "success" });
      void load();
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(transfer: TransferItem) {
    setActionLoading(transfer.id);
    try {
      await transfersAPI.reject(transfer.token);
      toast.show(t("transfer.rejected"), { kind: "success" });
      void load();
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRevoke(transfer: TransferItem) {
    setActionLoading(transfer.id);
    try {
      await transfersAPI.revoke(transfer.id);
      toast.show(t("transfer.revoked"), { kind: "success" });
      void load();
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setActionLoading(null);
    }
  }

  const pendingIncoming = incoming.filter((item) => item.status === "PENDING");

  return (
    <div>
      <PageHeader
        title={t("nav.transfers")}
        subtitle={
          pendingIncoming.length > 0
            ? `${pendingIncoming.length} ${t("transfer.pendingCount")}`
            : undefined
        }
      />

      <div className="mb-6 flex flex-wrap gap-1 rounded-xl bg-surface-muted p-1">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "incoming"}
          onClick={() => setTab("incoming")}
          className={[
            "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            tab === "incoming"
              ? "bg-surface text-fg shadow-sm"
              : "text-muted hover:text-fg",
          ].join(" ")}
        >
          {t("transfer.tabIncoming")}
          {pendingIncoming.length > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-contrast">
              {pendingIncoming.length}
            </span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "outgoing"}
          onClick={() => setTab("outgoing")}
          className={[
            "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            tab === "outgoing"
              ? "bg-surface text-fg shadow-sm"
              : "text-muted hover:text-fg",
          ].join(" ")}
        >
          {t("transfer.tabOutgoing")}
        </button>
      </div>

      {loading ? (
        <Section>
          <Skeleton height={64} />
          <Skeleton height={64} />
        </Section>
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
  actionLoading: number | null;
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
  const busy = actionLoading === transfer.id;
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-muted">
          <Package className="h-5 w-5 text-muted" />
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
            <span>→</span>
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
            {t("transfer.expiresOn")}{" "}
            {format(parseISO(transfer.expiresAt), "PPP")}
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
              loading={busy}
            >
              {t("transfer.accept")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              leftIcon={<X className="h-4 w-4" />}
              onClick={onReject}
              loading={busy}
            >
              {t("transfer.reject")}
            </Button>
          </>
        )}
        {side === "outgoing" && transfer.status === "PENDING" && (
          <Button size="sm" variant="outline" onClick={onRevoke} loading={busy}>
            {t("transfer.revoke")}
          </Button>
        )}
      </div>
    </div>
  );
}
