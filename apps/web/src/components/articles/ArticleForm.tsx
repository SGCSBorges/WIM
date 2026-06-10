/**
 * Article create/edit form. Used for both flows — `article` prop is null in
 * create mode, populated in edit mode. The form bundles four sub-concerns:
 *
 *   • Identity + price fields (the simple part).
 *   • Multi-select locations + tags with inline "create new" controls
 *     (`selectedLocationIds` / `selectedTagIds` are number arrays so
 *     deduplication is trivial).
 *   • Optional inline warranty (the warranty block is rendered conditionally
 *     and submitted as part of the same body).
 *   • Optional warranty-proof attachment uploaded ahead of save so the
 *     server only needs an attachmentId reference.
 *
 * `useUnsavedChangesGuard(dirty)` warns on tab-close while edits are
 * pending; the Cancel button confirms the discard separately because
 * BrowserRouter doesn't give us a SPA-nav blocker.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { addMonths } from "date-fns";
import {
  ScanLine,
  Plus,
  Trash2,
  ExternalLink,
  UploadCloud,
} from "lucide-react";
import { useFileDrop } from "../../hooks/useFileDrop";
import { usePreferences } from "../../preferences/preferences";
import {
  attachmentsAPI,
  locationsAPI,
  tagsAPI,
  API_BASE_URL,
} from "../../services/api";
import { useI18n } from "../../i18n/i18n";
import type { Article, Location, Tag } from "../../types";
import { getErrorMessage } from "../../utils/error";
import { useToast } from "../common/Toast";
import { useUnsavedChangesGuard } from "../../hooks/useUnsavedChangesGuard";
import BarcodeScanner, { barcodeSupported } from "./BarcodeScanner";
import TemplateBar from "./TemplateBar";
import {
  barcodeLookupEnabled,
  lookupProduct,
} from "../../services/barcodeLookup";
import { Button, Field, Input, Textarea } from "../ui";

interface ArticleFormProps {
  article?: Article;
  onSubmit: (article: Omit<Article, "articleId">) => void | Promise<void>;
  onCancel?: () => void;
}

const ArticleForm: React.FC<ArticleFormProps> = ({
  article,
  onSubmit,
  onCancel,
}) => {
  const { t } = useI18n();
  const toast = useToast();
  const formErrorRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );
  const [dirty, setDirty] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [locationsError, setLocationsError] = useState<string | null>(null);
  const deriveInitialLocationIds = (a?: Article): number[] => {
    const fromJoin = Array.isArray(a?.locations)
      ? a!
          .locations!.map((x) => Number(x?.locationId))
          .filter((n) => Number.isFinite(n) && n > 0)
      : [];
    const fromLegacy = Array.isArray(a?.locationIds)
      ? a!
          .locationIds!.map((x) => Number(x))
          .filter((n) => Number.isFinite(n) && n > 0)
      : [];
    return fromJoin.length > 0 ? fromJoin : fromLegacy;
  };

  const [selectedLocationIds, setSelectedLocationIds] = useState<number[]>(() =>
    deriveInitialLocationIds(article)
  );
  const [newLocationName, setNewLocationName] = useState("");
  const [creatingLocation, setCreatingLocation] = useState(false);
  const [locCreateError, setLocCreateError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const deriveInitialTagIds = (a?: Article): number[] =>
    Array.isArray(a?.tags)
      ? a!
          .tags!.map((x) => Number(x?.tagId))
          .filter((n) => Number.isFinite(n) && n > 0)
      : [];
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>(() =>
    deriveInitialTagIds(article)
  );
  const [newTagName, setNewTagName] = useState("");
  const [creatingTag, setCreatingTag] = useState(false);

  const [formData, setFormData] = useState<Omit<Article, "articleId">>({
    articleNom: article?.articleNom || "",
    articleModele: article?.articleModele || "",
    articleDescription: article?.articleDescription || "",
    brand: article?.brand || "",
    serialNumber: article?.serialNumber || "",
    productImageUrl: article?.productImageUrl || "",
  });
  const [purchasePrice, setPurchasePrice] = useState<string>(
    article?.purchasePrice != null ? String(article.purchasePrice) : ""
  );
  const [depreciationRate, setDepreciationRate] = useState<string>(
    article?.depreciationRate != null ? String(article.depreciationRate) : ""
  );
  const [showScanner, setShowScanner] = useState(false);

  const [warrantyEnabled, setWarrantyEnabled] = useState(
    Boolean(article?.garantie)
  );
  const [warrantyNom, setWarrantyNom] = useState(
    article?.garantie?.garantieNom || ""
  );
  const [warrantyDateAchat, setWarrantyDateAchat] = useState(() => {
    const raw = article?.garantie?.garantieDateAchat;
    if (!raw) return "";
    return String(raw).slice(0, 10);
  });
  const [warrantyDuration, setWarrantyDuration] = useState<number>(
    Number(article?.garantie?.garantieDuration) || 24
  );

  const [warrantyProofAttachment, setWarrantyProofAttachment] = useState<{
    attachmentId: number;
    fileName: string;
    mimeType: string;
    fileUrl: string;
  } | null>(() => {
    const g = article?.garantie;
    if (!g?.garantieImageAttachmentId) return null;
    return {
      attachmentId: Number(g.garantieImageAttachmentId),
      fileName: g?.garantieImageAttachment?.fileName || "",
      mimeType: g?.garantieImageAttachment?.mimeType || "",
      fileUrl: g?.garantieImageAttachment?.fileUrl || "",
    };
  });
  const [warrantyProofUploading, setWarrantyProofUploading] = useState(false);
  const [warrantyProofError, setWarrantyProofError] = useState<string | null>(
    null
  );
  const [deleteProofFromServer, setDeleteProofFromServer] = useState(false);

  useEffect(() => {
    // When switching between create/edit, keep all form state in sync.
    setFormData({
      articleNom: article?.articleNom || "",
      articleModele: article?.articleModele || "",
      articleDescription: article?.articleDescription || "",
      brand: article?.brand || "",
      serialNumber: article?.serialNumber || "",
      productImageUrl: article?.productImageUrl || "",
    });
    setPurchasePrice(
      article?.purchasePrice != null ? String(article.purchasePrice) : ""
    );
    setDepreciationRate(
      article?.depreciationRate != null ? String(article.depreciationRate) : ""
    );
    setSelectedLocationIds(deriveInitialLocationIds(article));
    setSelectedTagIds(deriveInitialTagIds(article));
    setWarrantyEnabled(Boolean(article?.garantie));
    setWarrantyNom(article?.garantie?.garantieNom || "");
    const raw = article?.garantie?.garantieDateAchat;
    setWarrantyDateAchat(raw ? String(raw).slice(0, 10) : "");
    setWarrantyDuration(Number(article?.garantie?.garantieDuration) || 24);

    const g = article?.garantie;
    if (g?.garantieImageAttachmentId) {
      setWarrantyProofAttachment({
        attachmentId: Number(g.garantieImageAttachmentId),
        fileName: g?.garantieImageAttachment?.fileName || "",
        mimeType: g?.garantieImageAttachment?.mimeType || "",
        fileUrl: g?.garantieImageAttachment?.fileUrl || "",
      });
    } else {
      setWarrantyProofAttachment(null);
    }
    setWarrantyProofError(null);
    setDeleteProofFromServer(false);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article?.articleId]);

  useUnsavedChangesGuard(dirty);

  const handleCancel = () => {
    if (dirty && !window.confirm(t("common.unsaved.discardConfirm"))) return;
    onCancel?.();
  };

  const { formatDate } = usePreferences();

  // Live "Warranty expires on …" hint under the duration field.
  const warrantyEndsAt = useMemo(() => {
    if (!warrantyEnabled || !warrantyDateAchat || !warrantyDuration)
      return null;
    const start = new Date(warrantyDateAchat);
    if (Number.isNaN(start.getTime())) return null;
    return formatDate(addMonths(start, warrantyDuration)) || null;
  }, [warrantyEnabled, warrantyDateAchat, warrantyDuration, formatDate]);

  // Drag-and-drop wrapper for the proof input. The hidden <input> below stays
  // for keyboard / screen-reader users; this just makes the surrounding area
  // accept dropped files as well.
  const { isOver: proofDragOver, dropProps: proofDropProps } = useFileDrop({
    onFiles: (files) => {
      const f = files[0];
      if (f) void handleWarrantyProofSelected(f);
    },
    accept: ["image/", "application/pdf"],
    disabled: warrantyProofUploading,
  });

  const handleWarrantyProofSelected = async (file: File) => {
    try {
      setWarrantyProofError(null);
      setWarrantyProofUploading(true);
      const created = await attachmentsAPI.uploadFile(file, "WARRANTY");
      setWarrantyProofAttachment({
        attachmentId: Number(created.attachmentId),
        fileName: created.fileName,
        mimeType: created.mimeType,
        fileUrl: created.fileUrl,
      });
    } catch (e) {
      setWarrantyProofError(getErrorMessage(e, t("common.errorOccurred")));
    } finally {
      setWarrantyProofUploading(false);
    }
  };

  const clearWarrantyProof = async () => {
    try {
      setWarrantyProofError(null);
      if (deleteProofFromServer && warrantyProofAttachment?.attachmentId) {
        await attachmentsAPI.deleteAttachment(
          warrantyProofAttachment.attachmentId,
          { removeFile: true }
        );
      }
    } catch (e) {
      setWarrantyProofError(getErrorMessage(e, t("common.errorOccurred")));
      return;
    }
    setWarrantyProofAttachment(null);
    setDeleteProofFromServer(false);
  };

  const selectedSet = useMemo(
    () => new Set(selectedLocationIds),
    [selectedLocationIds]
  );
  const selectedTagSet = useMemo(
    () => new Set(selectedTagIds),
    [selectedTagIds]
  );

  useEffect(() => {
    let mounted = true;
    tagsAPI
      .getAll()
      .then((data) => {
        if (mounted)
          setTags(data.map((tg) => ({ tagId: tg.tagId, name: tg.name })));
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const toggleTag = (id: number) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleCreateTag = async () => {
    const name = newTagName.trim();
    if (!name) return;
    try {
      setCreatingTag(true);
      const created = await tagsAPI.create(name);
      setTags((prev) =>
        prev.some((tg) => tg.tagId === created.tagId)
          ? prev
          : [...prev, { tagId: created.tagId, name: created.name }]
      );
      setSelectedTagIds((prev) =>
        prev.includes(created.tagId) ? prev : [...prev, created.tagId]
      );
      setNewTagName("");
      toast.show(
        t("articles.form.tagCreated").replace("{name}", created.name),
        { kind: "success" }
      );
    } catch (e) {
      toast.show(getErrorMessage(e, t("common.errorOccurred")), {
        kind: "error",
      });
    } finally {
      setCreatingTag(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLocationsLoading(true);
        const data = await locationsAPI.getAll();
        const mapped: Location[] = (data || []).map(
          (l: { locationId: number; name: string }) => ({
            locationId: l.locationId,
            name: l.name,
          })
        );
        if (mounted) {
          setLocations(mapped);
          setLocationsError(null);
        }
      } catch (e) {
        if (mounted)
          setLocationsError(getErrorMessage(e, t("common.errorOccurred")));
      } finally {
        if (mounted) setLocationsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.articleNom.trim()) {
      setFormError(t("articleForm.name.required"));
      return;
    }
    if (!formData.articleModele.trim()) {
      setFormError(t("articleForm.model.required"));
      return;
    }
    if (selectedLocationIds.length === 0) {
      setFormError(t("articleForm.locations.required"));
      return;
    }
    if (warrantyEnabled) {
      if (!warrantyNom.trim()) {
        setFormError(t("articleForm.warranty.requiredName"));
        return;
      }
      if (!warrantyDateAchat) {
        setFormError(t("articleForm.warranty.requiredDate"));
        return;
      }
      if (!warrantyDuration || warrantyDuration < 1) {
        setFormError(t("articleForm.warranty.requiredDuration"));
        return;
      }
    }

    const submitData: Omit<Article, "articleId"> = {
      ...formData,
      articleDescription: formData.articleDescription?.trim() || null,
      brand: formData.brand?.toString().trim() || null,
      serialNumber: formData.serialNumber?.toString().trim() || null,
      productImageUrl: formData.productImageUrl?.trim() || null,
      purchasePrice: purchasePrice.trim() === "" ? null : Number(purchasePrice),
      depreciationRate:
        depreciationRate.trim() === "" ? null : Number(depreciationRate),
      locationIds: selectedLocationIds,
      tagIds: selectedTagIds,
      ...(warrantyEnabled
        ? {
            garantie: {
              garantieNom: warrantyNom.trim(),
              garantieDateAchat: warrantyDateAchat,
              garantieDuration: warrantyDuration,
              garantieImageAttachmentId: warrantyProofAttachment
                ? warrantyProofAttachment.attachmentId
                : null,
            },
          }
        : article?.articleId
          ? { removeGarantie: true }
          : {}),
    };

    setSubmitting(true);
    try {
      await onSubmit(submitData);
      setDirty(false);
    } catch (err) {
      const msg = getErrorMessage(err, t("common.errorOccurred"));
      setFormError(msg);
      toast.show(msg, { kind: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (formError && formErrorRef.current) {
      formErrorRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [formError]);

  const toggleLocation = (id: number) => {
    setSelectedLocationIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleCreateLocation = async () => {
    const name = newLocationName.trim();
    if (!name) return;
    try {
      setCreatingLocation(true);
      setLocCreateError(null);
      const created = await locationsAPI.create({ name });
      const loc: Location = {
        locationId: created.locationId,
        name: created.name,
      };
      setLocations((prev) => [loc, ...prev]);
      setSelectedLocationIds((prev) =>
        prev.includes(loc.locationId) ? prev : [...prev, loc.locationId]
      );
      setNewLocationName("");
      toast.show(
        t("articles.form.locationCreated").replace("{name}", loc.name),
        { kind: "success" }
      );
    } catch (e) {
      setLocCreateError(getErrorMessage(e, t("locations.error.create")));
    } finally {
      setCreatingLocation(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="ui-card p-6 sm:p-8 animate-fade-in">
      <h2 className="mb-6 text-xl font-bold tracking-tight ui-title">
        {article ? t("articleForm.editTitle") : t("articleForm.createTitle")}
      </h2>

      {!article && (
        <TemplateBar
          locations={locations}
          tags={tags}
          getCurrentPayload={() => ({
            articleNom: formData.articleNom || undefined,
            articleModele: formData.articleModele || undefined,
            articleDescription: formData.articleDescription || null,
            brand: formData.brand || null,
            serialNumber: formData.serialNumber || null,
            productImageUrl: formData.productImageUrl || null,
            purchasePrice:
              purchasePrice.trim() === "" ? null : Number(purchasePrice),
            depreciationRate:
              depreciationRate.trim() === "" ? null : Number(depreciationRate),
            locationNames: locations
              .filter((l) => selectedLocationIds.includes(l.locationId))
              .map((l) => l.name),
            tagNames: tags
              .filter((tg) => selectedTagIds.includes(tg.tagId))
              .map((tg) => tg.name),
          })}
          onApply={(payload) => {
            // Apply a template's payload onto the form state. Strings overwrite
            // current values; lists merge by name → live id.
            setFormData((prev) => ({
              ...prev,
              articleNom: payload.articleNom ?? prev.articleNom,
              articleModele: payload.articleModele ?? prev.articleModele,
              articleDescription:
                payload.articleDescription ?? prev.articleDescription,
              brand: payload.brand ?? prev.brand,
              serialNumber: payload.serialNumber ?? prev.serialNumber,
              productImageUrl: payload.productImageUrl ?? prev.productImageUrl,
            }));
            if (payload.purchasePrice !== undefined)
              setPurchasePrice(
                payload.purchasePrice == null
                  ? ""
                  : String(payload.purchasePrice)
              );
            if (payload.depreciationRate !== undefined)
              setDepreciationRate(
                payload.depreciationRate == null
                  ? ""
                  : String(payload.depreciationRate)
              );
            if (payload.locationNames?.length) {
              const ids = payload.locationNames
                .map(
                  (n) => locations.find((l) => l.name === n)?.locationId ?? null
                )
                .filter((x): x is number => x !== null);
              setSelectedLocationIds(ids);
            }
            if (payload.tagNames?.length) {
              const ids = payload.tagNames
                .map((n) => tags.find((tg) => tg.name === n)?.tagId ?? null)
                .filter((x): x is number => x !== null);
              setSelectedTagIds(ids);
            }
            setDirty(true);
          }}
        />
      )}

      <form
        onSubmit={handleSubmit}
        onChange={() => setDirty(true)}
        className="space-y-5"
      >
        <Field label={t("articleForm.name")} htmlFor="articleNom" required>
          <Input
            type="text"
            id="articleNom"
            name="articleNom"
            required
            value={formData.articleNom}
            onChange={handleChange}
            placeholder={t("articleForm.placeholder.name")}
            maxLength={100}
          />
        </Field>

        <Field label={t("articleForm.model")} htmlFor="articleModele" required>
          <div className="flex gap-2">
            <Input
              type="text"
              id="articleModele"
              name="articleModele"
              required
              value={formData.articleModele}
              onChange={handleChange}
              placeholder={t("articleForm.placeholder.model")}
              maxLength={100}
              className="flex-1"
            />
            {barcodeSupported() && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowScanner(true)}
                leftIcon={<ScanLine className="h-4 w-4" />}
              >
                {t("scan.button")}
              </Button>
            )}
          </div>
        </Field>

        {showScanner && (
          <BarcodeScanner
            open={showScanner}
            onClose={() => setShowScanner(false)}
            onDetected={(value) => {
              setFormData((prev) => ({ ...prev, articleModele: value }));
              setShowScanner(false);
              if (barcodeLookupEnabled()) {
                void lookupProduct(value).then((info) => {
                  if (!mountedRef.current || !info) return;
                  setFormData((prev) => ({
                    ...prev,
                    articleNom:
                      prev.articleNom.trim() === "" && info.name
                        ? info.name
                        : prev.articleNom,
                    productImageUrl:
                      (prev.productImageUrl ?? "").trim() === "" &&
                      info.imageUrl
                        ? info.imageUrl
                        : prev.productImageUrl,
                  }));
                });
              }
            }}
          />
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("articleForm.brand")} htmlFor="brand">
            <Input
              type="text"
              id="brand"
              name="brand"
              value={formData.brand?.toString() ?? ""}
              onChange={handleChange}
              maxLength={120}
              placeholder={t("articleForm.placeholder.brand")}
            />
          </Field>
          <Field label={t("articleForm.serialNumber")} htmlFor="serialNumber">
            <Input
              type="text"
              id="serialNumber"
              name="serialNumber"
              value={formData.serialNumber?.toString() ?? ""}
              onChange={handleChange}
              maxLength={120}
              placeholder={t("articleForm.placeholder.serialNumber")}
              className="font-mono"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("articleForm.purchasePrice")} htmlFor="purchasePrice">
            <Input
              type="number"
              id="purchasePrice"
              name="purchasePrice"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(e.target.value)}
              placeholder={t("articleForm.placeholder.purchasePrice")}
            />
          </Field>
          <Field
            label={t("articleForm.depreciationRate")}
            htmlFor="depreciationRate"
            hint={t("articleForm.depreciationRateHint")}
          >
            <Input
              type="number"
              id="depreciationRate"
              name="depreciationRate"
              min="0"
              max="100"
              step="0.01"
              inputMode="decimal"
              value={depreciationRate}
              onChange={(e) => setDepreciationRate(e.target.value)}
              placeholder={t("articleForm.placeholder.depreciationRate")}
            />
          </Field>
        </div>

        <Field
          label={t("articleForm.description")}
          htmlFor="articleDescription"
        >
          <Textarea
            id="articleDescription"
            name="articleDescription"
            value={formData.articleDescription || ""}
            onChange={handleChange}
            rows={3}
            placeholder={t("articleForm.placeholder.description")}
            maxLength={255}
          />
        </Field>

        <Field
          label={t("articleForm.productImageUrl")}
          htmlFor="productImageUrl"
        >
          <Input
            type="url"
            id="productImageUrl"
            name="productImageUrl"
            value={formData.productImageUrl || ""}
            onChange={handleChange}
            placeholder={t("articleForm.placeholder.imageUrl")}
            maxLength={255}
          />
        </Field>

        {/* Warranty toggle + block */}
        <div className="rounded-xl border ui-divider p-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              id="warrantyEnabled"
              type="checkbox"
              checked={warrantyEnabled}
              onChange={(e) => setWarrantyEnabled(e.target.checked)}
              className="h-4 w-4 accent-[var(--primary)]"
            />
            <span className="text-sm font-medium ui-title">
              {t("articleForm.warranty.toggle")}
            </span>
          </label>

          {warrantyEnabled && (
            <div className="mt-4 space-y-4 animate-fade-in">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Field label={t("articleForm.warranty.name")}>
                  <Input
                    type="text"
                    value={warrantyNom}
                    onChange={(e) => setWarrantyNom(e.target.value)}
                    placeholder={t("articleForm.warranty.placeholder.name")}
                    maxLength={100}
                  />
                </Field>
                <Field label={t("articleForm.warranty.purchaseDate")}>
                  <Input
                    type="date"
                    value={warrantyDateAchat}
                    onChange={(e) => setWarrantyDateAchat(e.target.value)}
                  />
                </Field>
                <Field
                  label={t("articleForm.warranty.durationMonths")}
                  hint={
                    warrantyEndsAt
                      ? `${t("articleForm.warranty.endsOn")} ${warrantyEndsAt}`
                      : undefined
                  }
                >
                  <Input
                    type="number"
                    min={1}
                    max={120}
                    value={warrantyDuration}
                    onChange={(e) =>
                      setWarrantyDuration(Number(e.target.value))
                    }
                  />
                </Field>
              </div>

              <Field label={t("attachments.form.fileUpload")}>
                <div
                  {...proofDropProps}
                  className={`flex flex-col gap-2 rounded-lg p-2 transition-colors ${
                    proofDragOver ? "bg-surface-muted ring-2 ring-primary" : ""
                  }`}
                >
                  <p className="flex items-center gap-1.5 text-xs ui-text-muted">
                    <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("articleForm.warranty.proof.dropHint")}
                  </p>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    disabled={warrantyProofUploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleWarrantyProofSelected(f);
                      e.currentTarget.value = "";
                    }}
                    className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-contrast file:hover:brightness-105"
                  />

                  {warrantyProofUploading && (
                    <p className="text-sm ui-text-muted">
                      {t("common.loading")}
                    </p>
                  )}

                  {warrantyProofError && (
                    <p className="text-sm ui-text-error">
                      {warrantyProofError}
                    </p>
                  )}

                  {warrantyProofAttachment && (
                    <div className="flex items-center justify-between gap-3 rounded-lg border ui-divider px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium ui-title">
                          {warrantyProofAttachment.fileName ||
                            `#${warrantyProofAttachment.attachmentId}`}
                        </p>
                        <a
                          className="inline-flex items-center gap-1 text-xs ui-action-primary hover:underline"
                          href={
                            /^https?:\/\//i.test(
                              warrantyProofAttachment.fileUrl || ""
                            )
                              ? warrantyProofAttachment.fileUrl
                              : `${API_BASE_URL}/attachments/${warrantyProofAttachment.attachmentId}`
                          }
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink
                            className="h-3 w-3"
                            aria-hidden="true"
                          />
                          {t("articleForm.warranty.proof.open")}
                        </a>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearWarrantyProof}
                        className="text-danger"
                        leftIcon={<Trash2 className="h-4 w-4" />}
                      >
                        {t("common.delete")}
                      </Button>
                    </div>
                  )}

                  {warrantyProofAttachment && (
                    <label className="flex items-center gap-2 text-xs ui-text-muted">
                      <input
                        type="checkbox"
                        checked={deleteProofFromServer}
                        onChange={(e) =>
                          setDeleteProofFromServer(e.target.checked)
                        }
                        className="h-3.5 w-3.5 accent-[var(--primary)]"
                      />
                      {t("articleForm.warranty.proof.deleteFromServer")}
                    </label>
                  )}
                </div>
              </Field>
            </div>
          )}
        </div>

        {/* Locations */}
        <Field
          label={
            <>
              {t("articleForm.locations")}
              <span className="text-danger" aria-hidden="true">
                {" "}
                *
              </span>
            </>
          }
        >
          {locationsLoading ? (
            <p className="text-sm ui-text-muted">
              {t("articleForm.locations.loading")}
            </p>
          ) : locationsError ? (
            <p className="text-sm ui-text-error">{locationsError}</p>
          ) : locations.length === 0 ? (
            <p className="text-sm ui-text-muted">
              {t("articleForm.locations.none")}
            </p>
          ) : (
            <div className="ui-panel max-h-44 space-y-2 overflow-auto rounded-lg p-3">
              {locations.map((loc) => (
                <label
                  key={loc.locationId}
                  className="flex cursor-pointer items-center gap-2"
                >
                  <input
                    type="checkbox"
                    checked={selectedSet.has(loc.locationId)}
                    onChange={() => toggleLocation(loc.locationId)}
                    className="h-4 w-4 accent-[var(--primary)]"
                  />
                  <span className="text-sm ui-title">{loc.name}</span>
                </label>
              ))}
            </div>
          )}

          <div className="mt-3 flex gap-2">
            <Input
              type="text"
              value={newLocationName}
              onChange={(e) => setNewLocationName(e.target.value)}
              placeholder={t("articleForm.location.new.placeholder")}
              maxLength={120}
              className="flex-1"
            />
            <Button
              type="button"
              onClick={handleCreateLocation}
              loading={creatingLocation}
              disabled={!newLocationName.trim()}
              leftIcon={<Plus className="h-4 w-4" />}
            >
              {t("articleForm.location.create")}
            </Button>
          </div>
          {locCreateError && (
            <p className="mt-1 text-sm ui-text-error">{locCreateError}</p>
          )}
        </Field>

        {/* Tags */}
        <Field label={t("articleForm.tags")}>
          {tags.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {tags.map((tg) => {
                const active = selectedTagSet.has(tg.tagId);
                return (
                  <button
                    type="button"
                    key={tg.tagId}
                    onClick={() => toggleTag(tg.tagId)}
                    aria-pressed={active}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      active
                        ? "ui-badge-info"
                        : "border border-line ui-text-muted hover:bg-surface-muted"
                    }`}
                  >
                    {tg.name}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreateTag();
                }
              }}
              placeholder={t("articleForm.tags.placeholder")}
              maxLength={40}
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleCreateTag}
              loading={creatingTag}
              disabled={!newTagName.trim()}
              leftIcon={<Plus className="h-4 w-4" />}
            >
              {t("articleForm.tags.add")}
            </Button>
          </div>
        </Field>

        {formError && (
          <div
            ref={formErrorRef}
            role="alert"
            aria-live="polite"
            className="rounded-lg border ui-alert-error p-3 text-sm ui-text-error"
          >
            {formError}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t ui-divider pt-4">
          {onCancel && (
            <Button variant="ghost" onClick={handleCancel}>
              {t("common.cancel")}
            </Button>
          )}
          <Button
            type="submit"
            loading={submitting}
            disabled={warrantyProofUploading}
          >
            {article
              ? t("articleForm.submit.update")
              : t("articleForm.submit.create")}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ArticleForm;
