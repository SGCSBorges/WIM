/**
 * Wishlist / planned purchases. Add wishes with an optional target price and
 * link; mark them purchased (kept, struck through) or delete with the shared
 * 5s-undo pattern. When the budget feature is on and a monthly budget is set,
 * a summary line shows whether buying every open wish fits the month's
 * remaining budget — the "should I buy this now?" signal.
 */
import { useEffect, useState } from "react";
import {
  Check,
  ExternalLink,
  Gift,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { wishlistAPI, statisticsAPI } from "../../services/api";
import type { WishlistItemRow, BudgetStatus } from "@wim/types";
import { useI18n } from "../../i18n/i18n";
import { usePreferences } from "../../preferences/preferences";
import { useFeature } from "../../features/features";
import { getErrorMessage } from "../../utils/error";
import { formatMoney } from "../../utils/money";
import { useUndoableDelete } from "../../hooks/useUndoableDelete";
import { ErrorBanner, EmptyState } from "../common/States";
import { PageHeader, Button, Field, Input, Textarea } from "../ui";

export default function WishlistView() {
  const { t, language } = useI18n();
  const { currency } = usePreferences();
  const canBudget = useFeature("budget");
  const undoableDelete = useUndoableDelete();

  const [items, setItems] = useState<WishlistItemRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [budget, setBudget] = useState<BudgetStatus | null>(null);

  // Add form
  const [name, setName] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    wishlistAPI
      .list()
      .then((rows) => alive && setItems(rows))
      .catch(
        (e) => alive && setError(getErrorMessage(e, t("common.errorOccurred")))
      );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Budget context is optional garnish — guard the fetch on the flag so a
  // locked user never fires a doomed 403.
  useEffect(() => {
    if (!canBudget) return;
    let alive = true;
    statisticsAPI
      .getBudget()
      .then((b) => alive && setBudget(b))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [canBudget]);

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) {
      setFormError(t("wishlist.nameRequired"));
      return;
    }
    const price = targetPrice.trim() === "" ? null : Number(targetPrice);
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      setFormError(t("wishlist.priceInvalid"));
      return;
    }
    if (url.trim() && !/^https?:\/\//i.test(url.trim())) {
      setFormError(t("wishlist.urlInvalid"));
      return;
    }
    setSaving(true);
    try {
      const created = await wishlistAPI.create({
        name: name.trim(),
        targetPrice: price,
        url: url.trim() || null,
        note: note.trim() || null,
      });
      setItems((prev) => [created, ...(prev ?? [])]);
      setName("");
      setTargetPrice("");
      setUrl("");
      setNote("");
    } catch (err) {
      setFormError(getErrorMessage(err, t("common.errorOccurred")));
    } finally {
      setSaving(false);
    }
  };

  const togglePurchased = async (item: WishlistItemRow) => {
    setBusyId(item.id);
    try {
      const updated = await wishlistAPI.setPurchased(
        item.id,
        item.purchasedAt === null
      );
      setItems((prev) =>
        (prev ?? []).map((r) => (r.id === item.id ? updated : r))
      );
    } catch (e) {
      setError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setBusyId(null);
    }
  };

  const removeItem = (item: WishlistItemRow) => {
    undoableDelete({
      message: t("wishlist.deleted"),
      kind: "success",
      remove: () =>
        setItems((prev) => (prev ?? []).filter((r) => r.id !== item.id)),
      restore: () =>
        setItems((prev) =>
          (prev ?? []).some((r) => r.id === item.id)
            ? prev
            : [item, ...(prev ?? [])]
        ),
      commit: () => wishlistAPI.remove(item.id),
    });
  };

  const open = (items ?? []).filter((i) => i.purchasedAt === null);
  const plannedTotal = open.reduce(
    (sum, i) => sum + (i.targetPrice != null ? Number(i.targetPrice) : 0),
    0
  );
  const monthlyRemaining =
    budget && budget.monthlyBudget != null
      ? budget.monthlyBudget - budget.monthlySpend
      : null;
  const overBy =
    monthlyRemaining !== null ? plannedTotal - monthlyRemaining : null;

  return (
    <div>
      <PageHeader
        icon={<Gift className="h-5 w-5" />}
        title={t("wishlist.title")}
        subtitle={t("wishlist.subtitle")}
      />

      {error && <ErrorBanner message={error} />}

      <form onSubmit={addItem} noValidate className="ui-card mb-6 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t("wishlist.form.name")} htmlFor="wish-name" required>
            <Input
              id="wish-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
            />
          </Field>
          <Field label={t("wishlist.form.targetPrice")} htmlFor="wish-price">
            <Input
              id="wish-price"
              type="text"
              inputMode="numeric"
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
              placeholder="0.00"
            />
          </Field>
          <Field label={t("wishlist.form.url")} htmlFor="wish-url">
            <Input
              id="wish-url"
              type="text"
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              maxLength={500}
              placeholder="https://"
            />
          </Field>
          <Field label={t("wishlist.form.note")} htmlFor="wish-note">
            <Textarea
              id="wish-note"
              rows={1}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
          </Field>
        </div>
        {formError && (
          <p role="alert" className="mt-2 text-sm ui-text-error">
            {formError}
          </p>
        )}
        <div className="mt-3 flex justify-end">
          <Button
            type="submit"
            variant="primary"
            loading={saving}
            aria-busy={saving}
            leftIcon={<Plus className="h-4 w-4" />}
          >
            {t("wishlist.form.add")}
          </Button>
        </div>
      </form>

      {monthlyRemaining !== null && open.length > 0 && plannedTotal > 0 && (
        <p
          role="status"
          className={`mb-4 rounded-lg border p-3 text-sm ${
            overBy !== null && overBy > 0
              ? "ui-alert-warning"
              : "ui-alert-success"
          }`}
        >
          {overBy !== null && overBy > 0
            ? t("wishlist.budget.over")
                .replace(
                  "{total}",
                  formatMoney(plannedTotal, currency, language)
                )
                .replace("{over}", formatMoney(overBy, currency, language))
            : t("wishlist.budget.fits").replace(
                "{total}",
                formatMoney(plannedTotal, currency, language)
              )}
        </p>
      )}

      {items === null && !error && (
        <div className="space-y-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="ui-card h-16 animate-pulse" />
          ))}
        </div>
      )}

      {items !== null && items.length === 0 && (
        <EmptyState
          icon={<Gift className="h-8 w-8" />}
          title={t("wishlist.empty.title")}
          description={t("wishlist.empty.subtitle")}
        />
      )}

      {items !== null && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item) => {
            const purchased = item.purchasedAt !== null;
            return (
              <li
                key={item.id}
                className={`ui-card flex items-center gap-3 p-4 ${
                  purchased ? "opacity-60" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate font-medium ui-title ${
                      purchased ? "line-through" : ""
                    }`}
                    title={item.name}
                  >
                    {item.name}
                  </p>
                  {item.note && (
                    <p
                      className="truncate text-sm ui-text-muted"
                      title={item.note}
                    >
                      {item.note}
                    </p>
                  )}
                </div>
                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-primary hover:opacity-80"
                    aria-label={t("wishlist.openLink")}
                    title={item.url}
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </a>
                )}
                {item.targetPrice != null && (
                  <span className="shrink-0 text-sm font-medium tabular-nums">
                    {formatMoney(item.targetPrice, currency, language)}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => togglePurchased(item)}
                  disabled={busyId === item.id}
                  aria-busy={busyId === item.id}
                  leftIcon={
                    busyId === item.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : purchased ? (
                      <RotateCcw className="h-4 w-4" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )
                  }
                >
                  {purchased
                    ? t("wishlist.unmarkPurchased")
                    : t("wishlist.markPurchased")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeItem(item)}
                  aria-label={t("common.delete")}
                  leftIcon={<Trash2 className="h-4 w-4" />}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
