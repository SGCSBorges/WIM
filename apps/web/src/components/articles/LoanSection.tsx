/**
 * Loan/borrow tracker for an article-detail page. Shows the open loan (who has
 * it, when it's due — highlighted if overdue) with a one-click "mark returned",
 * a "lend out" form, and past loan history. Reuses the loans API; lending an
 * item sets it LOANED and (with a due date) schedules a reminder server-side.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { HandHelping, Check, Trash2, Plus, CalendarClock } from "lucide-react";
import { loansAPI } from "../../services/api";
import type { LoanItem } from "../../types";
import { useI18n } from "../../i18n/i18n";
import { usePreferences } from "../../preferences/preferences";
import { getErrorMessage } from "../../utils/error";
import { useFeature, useFeatures } from "../../features/features";
import LockedFeatureNotice from "../common/LockedFeatureNotice";
import { useToast } from "../common/Toast";
import { Section, Button, Input, Textarea, Badge } from "../ui";

function isOverdue(loan: LoanItem): boolean {
  return (
    loan.returnedAt === null &&
    loan.dueAt !== null &&
    new Date(loan.dueAt).getTime() < Date.now()
  );
}

export default function LoanSection({
  articleId,
  onChanged,
}: {
  articleId: number;
  onChanged?: () => void;
}) {
  const { t } = useI18n();
  const { formatDate } = usePreferences();
  const toast = useToast();
  const allowed = useFeature("loans");
  const { loaded: featuresLoaded } = useFeatures();
  const [loans, setLoans] = useState<LoanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [borrowerName, setBorrowerName] = useState("");
  const [borrowerEmail, setBorrowerEmail] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);

  // Sibling links (bundles, "bundled with") navigate article → article without
  // unmounting this section, so a slow response for the previous article must
  // not overwrite the newer one. Same request-sequence guard as ArticleDetail.
  const requestSeqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    setLoading(true);
    try {
      const items = await loansAPI.list({ articleId });
      if (seq !== requestSeqRef.current) return;
      setLoans(items);
    } catch {
      // Section self-hides its content on error; leave the list empty.
      if (seq !== requestSeqRef.current) return;
      setLoans([]);
    } finally {
      if (seq === requestSeqRef.current) setLoading(false);
    }
  }, [articleId]);

  useEffect(() => {
    if (allowed) void load();
  }, [load, allowed]);

  const active = loans.find((l) => l.returnedAt === null) ?? null;
  const history = loans.filter((l) => l.returnedAt !== null);

  const createLoan = async () => {
    if (!borrowerName.trim()) return;
    setCreating(true);
    try {
      await loansAPI.create({
        articleId,
        borrowerName: borrowerName.trim(),
        borrowerEmail: borrowerEmail.trim() || null,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        note: note.trim() || null,
      });
      setBorrowerName("");
      setBorrowerEmail("");
      setDueAt("");
      setNote("");
      setShowForm(false);
      await load();
      onChanged?.();
      toast.show(t("loan.lentOut.success"), { kind: "success" });
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setCreating(false);
    }
  };

  const markReturned = async (loanId: number) => {
    setBusyId(loanId);
    try {
      await loansAPI.markReturned(loanId);
      await load();
      onChanged?.();
      toast.show(t("loan.returned.success"), { kind: "success" });
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setBusyId(null);
    }
  };

  const removeLoan = async (loanId: number) => {
    setBusyId(loanId);
    try {
      await loansAPI.remove(loanId);
      await load();
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setBusyId(null);
    }
  };

  if (!featuresLoaded) return null;
  if (!allowed)
    return (
      <LockedFeatureNotice
        icon={<HandHelping className="h-5 w-5" />}
        title={t("loan.title")}
      />
    );

  return (
    <Section
      icon={<HandHelping className="h-5 w-5" />}
      title={t("loan.title")}
      className="mb-6"
      actions={
        !active && !showForm ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowForm(true)}
            leftIcon={<Plus className="h-4 w-4" />}
          >
            {t("loan.lendOut")}
          </Button>
        ) : undefined
      }
    >
      {/* Active loan */}
      {active && (
        <div
          className={`flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between ${
            isOverdue(active) ? "ui-alert-error" : "ui-divider"
          }`}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium ui-title">
                {active.borrowerName}
              </span>
              {isOverdue(active) ? (
                <Badge tone="danger">{t("loan.overdue")}</Badge>
              ) : (
                <Badge tone="warning">{t("loan.out")}</Badge>
              )}
            </div>
            <div className="mt-0.5 text-xs ui-text-muted">
              {t("loan.lentOn")}: {formatDate(active.loanedAt)}
              {active.dueAt && (
                <>
                  {" · "}
                  <CalendarClock
                    className="inline h-3 w-3"
                    aria-hidden="true"
                  />{" "}
                  {t("loan.due")}: {formatDate(active.dueAt)}
                </>
              )}
            </div>
            {active.note && (
              <div className="mt-1 break-words text-sm ui-text-muted">
                {active.note}
              </div>
            )}
          </div>
          <Button
            size="sm"
            onClick={() => void markReturned(active.loanId)}
            loading={busyId === active.loanId}
            leftIcon={<Check className="h-4 w-4" />}
          >
            {t("loan.markReturned")}
          </Button>
        </div>
      )}

      {/* Lend-out form */}
      {!active && showForm && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              value={borrowerName}
              onChange={(e) => setBorrowerName(e.target.value)}
              placeholder={t("loan.borrowerName")}
              aria-label={t("loan.borrowerName")}
              maxLength={120}
            />
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={borrowerEmail}
              onChange={(e) => setBorrowerEmail(e.target.value)}
              placeholder={t("loan.borrowerEmail")}
              aria-label={t("loan.borrowerEmail")}
              maxLength={180}
            />
            <Input
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              aria-label={t("loan.due")}
              title={t("loan.due")}
            />
          </div>
          <div>
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("loan.note")}
              aria-label={t("loan.note")}
              maxLength={500}
            />
            <p className="text-right text-xs ui-text-muted tabular-nums">
              {note.length} / 500
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={createLoan}
              loading={creating}
              disabled={!borrowerName.trim()}
              leftIcon={<HandHelping className="h-4 w-4" />}
            >
              {t("loan.lendOut")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowForm(false)}
              disabled={creating}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      )}

      {/* Empty + history */}
      {!active && !showForm && history.length === 0 && !loading && (
        <p className="text-sm ui-text-muted">{t("loan.none")}</p>
      )}

      {history.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide ui-text-muted">
            {t("loan.history")}
          </p>
          <ul className="divide-y ui-divider text-sm">
            {history.map((l) => (
              <li
                key={l.loanId}
                className="flex items-center justify-between gap-3 py-2"
              >
                <span className="min-w-0">
                  <span className="font-medium ui-title">{l.borrowerName}</span>
                  <span className="ml-2 text-xs ui-text-muted">
                    {formatDate(l.loanedAt)} → {formatDate(l.returnedAt)}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void removeLoan(l.loanId)}
                  loading={busyId === l.loanId}
                  aria-label={t("common.delete")}
                  className="text-danger"
                  leftIcon={<Trash2 className="h-4 w-4" />}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}
