/**
 * Insurance portfolio — manage the policies that cover your inventory. Each
 * policy carries a provider, optional policy number, recurring premium, total
 * coverage limit, and a renewal date (which schedules a reminder server-side).
 * Covered items are linked per-article from the article-detail page; this view
 * shows the coverage count and the renewal status at a glance.
 *
 * Lazy-loaded so it stays out of the main bundle until /insurance is opened.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Umbrella, Plus, Pencil, Trash2, Check, Package } from "lucide-react";
import { insuranceAPI } from "../../services/api";
import type { InsurancePolicyItem } from "../../types";
import { useI18n } from "../../i18n/i18n";
import { usePreferences } from "../../preferences/preferences";
import { useToast } from "../common/Toast";
import { getErrorMessage } from "../../utils/error";
import { formatMoney } from "../../utils/money";
import { Skeleton } from "../common/Skeleton";
import { EmptyState } from "../common/States";
import {
  Badge,
  Button,
  ConfirmDialog,
  Field,
  Input,
  PageHeader,
  Section,
  Textarea,
} from "../ui";

type FormState = {
  provider: string;
  policyNumber: string;
  premium: string;
  coverageAmount: string;
  renewalAt: string;
  note: string;
};

const EMPTY_FORM: FormState = {
  provider: "",
  policyNumber: "",
  premium: "",
  coverageAmount: "",
  renewalAt: "",
  note: "",
};

type RenewalBadge = {
  tone: "danger" | "warning" | "success";
  key: "insurance.lapsed" | "insurance.renewingSoon" | "insurance.active";
};

// Days until the renewal date; negative = already lapsed.
function renewalBadge(renewalAt: string | null): RenewalBadge | null {
  if (!renewalAt) return null;
  const days = Math.ceil(
    (new Date(renewalAt).getTime() - Date.now()) / 86_400_000
  );
  if (days < 0) return { tone: "danger", key: "insurance.lapsed" };
  if (days <= 30) return { tone: "warning", key: "insurance.renewingSoon" };
  return { tone: "success", key: "insurance.active" };
}

export default function InsuranceView() {
  const { t, language } = useI18n();
  const { formatDate, currency } = usePreferences();
  const toast = useToast();

  const [policies, setPolicies] = useState<InsurancePolicyItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPolicies(await insuranceAPI.list());
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

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (p: InsurancePolicyItem) => {
    setEditingId(p.policyId);
    setForm({
      provider: p.provider,
      policyNumber: p.policyNumber ?? "",
      premium: p.premium != null ? String(p.premium) : "",
      coverageAmount: p.coverageAmount != null ? String(p.coverageAmount) : "",
      renewalAt: p.renewalAt ? p.renewalAt.slice(0, 10) : "",
      note: p.note ?? "",
    });
    setFormError(null);
    setShowForm(true);
  };

  const submit = async () => {
    if (!form.provider.trim()) {
      setFormError(t("insurance.providerRequired"));
      return;
    }
    const payload = {
      provider: form.provider.trim(),
      policyNumber: form.policyNumber.trim() || null,
      premium: form.premium.trim() ? Number(form.premium) : null,
      coverageAmount: form.coverageAmount.trim()
        ? Number(form.coverageAmount)
        : null,
      renewalAt: form.renewalAt ? new Date(form.renewalAt).toISOString() : null,
      note: form.note.trim() || null,
    };
    setSaving(true);
    try {
      if (editingId != null) await insuranceAPI.update(editingId, payload);
      else await insuranceAPI.create(payload);
      setShowForm(false);
      await load();
      toast.show(t("insurance.saved"), { kind: "success" });
    } catch (e) {
      setFormError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (policyId: number) => {
    setConfirmId(null);
    try {
      await insuranceAPI.remove(policyId);
      await load();
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    }
  };

  return (
    <div>
      <PageHeader
        title={t("nav.insurance")}
        subtitle={t("insurance.subtitle")}
        actions={
          !showForm ? (
            <Button
              onClick={openCreate}
              leftIcon={<Plus className="h-4 w-4" />}
            >
              {t("insurance.addPolicy")}
            </Button>
          ) : undefined
        }
      />

      {showForm && (
        <Section
          icon={<Umbrella className="h-5 w-5" />}
          title={
            editingId != null
              ? t("insurance.editPolicy")
              : t("insurance.addPolicy")
          }
          className="mb-6"
        >
          <form
            noValidate
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {formError && (
              <p className="text-sm text-danger" role="alert">
                {formError}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("insurance.provider")} required>
                <Input
                  value={form.provider}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, provider: e.target.value }))
                  }
                  maxLength={150}
                />
              </Field>
              <Field label={t("insurance.policyNumber")}>
                <Input
                  value={form.policyNumber}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, policyNumber: e.target.value }))
                  }
                  maxLength={100}
                />
              </Field>
              <Field label={t("insurance.premium")}>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step="0.01"
                  value={form.premium}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, premium: e.target.value }))
                  }
                />
              </Field>
              <Field label={t("insurance.coverage")}>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step="0.01"
                  value={form.coverageAmount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, coverageAmount: e.target.value }))
                  }
                />
              </Field>
              <Field label={t("insurance.renewalDate")}>
                <Input
                  type="date"
                  value={form.renewalAt}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, renewalAt: e.target.value }))
                  }
                />
              </Field>
            </div>
            <Field label={t("insurance.note")}>
              <Textarea
                rows={2}
                value={form.note}
                onChange={(e) =>
                  setForm((f) => ({ ...f, note: e.target.value }))
                }
                maxLength={500}
              />
              <p className="text-right text-xs ui-text-muted tabular-nums">
                {form.note.length} / 500
              </p>
            </Field>
            <div className="flex gap-2">
              <Button
                type="submit"
                loading={saving}
                disabled={!form.provider.trim()}
                leftIcon={<Check className="h-4 w-4" />}
              >
                {t("common.save")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowForm(false)}
                disabled={saving}
              >
                {t("common.cancel")}
              </Button>
            </div>
          </form>
        </Section>
      )}

      {loading ? (
        <div className="space-y-3" role="status" aria-busy="true">
          <Skeleton height={96} />
          <Skeleton height={96} />
        </div>
      ) : policies.length === 0 ? (
        <EmptyState
          icon={<Umbrella className="h-6 w-6" />}
          title={t("insurance.empty")}
          description={t("insurance.emptyHint")}
        />
      ) : (
        <ul className="space-y-3">
          {policies.map((p) => {
            const badge = renewalBadge(p.renewalAt);
            return (
              <li key={p.policyId} className="ui-card p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="truncate font-medium ui-title"
                        title={p.provider}
                      >
                        {p.provider}
                      </span>
                      {badge && <Badge tone={badge.tone}>{t(badge.key)}</Badge>}
                    </div>
                    {p.policyNumber && (
                      <p className="font-mono text-xs ui-text-muted">
                        {p.policyNumber}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                      {p.premium != null && (
                        <span>
                          <span className="ui-text-muted">
                            {t("insurance.premium")}:{" "}
                          </span>
                          {formatMoney(Number(p.premium), currency, language)}
                        </span>
                      )}
                      {p.coverageAmount != null && (
                        <span>
                          <span className="ui-text-muted">
                            {t("insurance.coverage")}:{" "}
                          </span>
                          {formatMoney(
                            Number(p.coverageAmount),
                            currency,
                            language
                          )}
                        </span>
                      )}
                      {p.renewalAt && (
                        <span>
                          <span className="ui-text-muted">
                            {t("insurance.renewalDate")}:{" "}
                          </span>
                          {formatDate(p.renewalAt)}
                        </span>
                      )}
                    </div>
                    {p.note && (
                      <p className="mt-1 break-words text-sm ui-text-muted">
                        {p.note}
                      </p>
                    )}
                    <p className="mt-2 inline-flex items-center gap-1 text-xs ui-text-muted">
                      <Package className="h-3 w-3" aria-hidden="true" />
                      {t("insurance.itemsCovered")}: {p.articles.length}
                    </p>
                    {p.articles.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {p.articles.map((a) => (
                          <Link
                            key={a.articleId}
                            to={`/articles/${a.articleId}`}
                            className="ui-action-primary text-xs hover:underline"
                            title={a.articleNom}
                          >
                            <Badge tone="info">{a.articleNom}</Badge>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(p)}
                      aria-label={t("common.edit")}
                      leftIcon={<Pencil className="h-4 w-4" />}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmId(p.policyId)}
                      aria-label={t("common.delete")}
                      className="text-danger"
                      leftIcon={<Trash2 className="h-4 w-4" />}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={confirmId != null}
        title={t("insurance.deleteConfirmTitle")}
        message={t("insurance.deleteConfirmBody")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        tone="danger"
        onConfirm={() => confirmId != null && void remove(confirmId)}
        onCancel={() => setConfirmId(null)}
      />
    </div>
  );
}
