/**
 * Article Form Component
 * Form for creating and editing articles
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
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
import BarcodeScanner, { barcodeSupported } from "./BarcodeScanner";
import {
  barcodeLookupEnabled,
  lookupProduct,
} from "../../services/barcodeLookup";

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

  // Tags (owner-scoped). Mirrors the location chip/create pattern.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article?.articleId]);

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

      // Optional cleanup, OFF by default.
      if (deleteProofFromServer && warrantyProofAttachment?.attachmentId) {
        await attachmentsAPI.deleteAttachment(
          warrantyProofAttachment.attachmentId,
          {
            removeFile: true,
          }
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
        // backend returns locations with extra fields; we only need id+name
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

    // Convert empty strings to null for optional fields
    const submitData: Omit<Article, "articleId"> = {
      ...formData,
      articleDescription: formData.articleDescription?.trim() || null,
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
              // Pass through the proof attachment id (or null to clear)
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
    } catch (err) {
      const msg = getErrorMessage(err, t("common.errorOccurred"));
      setFormError(msg);
      toast.show(msg, { kind: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  // Scroll the inline error block into view whenever a new error appears
  // (the toast already announces it; this gives long forms a focal point).
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
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  return (
    <div className="ui-card rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4">
        {article ? t("articleForm.editTitle") : t("articleForm.createTitle")}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="articleNom"
            className="block text-sm font-medium ui-text-muted mb-1"
          >
            {t("articleForm.name")} *
          </label>
          <input
            type="text"
            id="articleNom"
            name="articleNom"
            required
            value={formData.articleNom}
            onChange={handleChange}
            className="w-full px-3 py-2 ui-input rounded-md"
            placeholder={t("articleForm.placeholder.name")}
            maxLength={100}
          />
        </div>

        <div>
          <label
            htmlFor="articleModele"
            className="block text-sm font-medium ui-text-muted mb-1"
          >
            {t("articleForm.model")} *
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              id="articleModele"
              name="articleModele"
              required
              value={formData.articleModele}
              onChange={handleChange}
              className="flex-1 px-3 py-2 ui-input rounded-md"
              placeholder={t("articleForm.placeholder.model")}
              maxLength={100}
            />
            {barcodeSupported() && (
              <button
                type="button"
                onClick={() => setShowScanner(true)}
                className="ui-btn-ghost border ui-divider rounded-md px-3 py-2 text-sm shrink-0"
              >
                {t("scan.button")}
              </button>
            )}
          </div>
        </div>

        {showScanner && (
          <BarcodeScanner
            open={showScanner}
            onClose={() => setShowScanner(false)}
            onDetected={(value) => {
              // Always fill the model with the scanned code; if product lookup
              // is enabled, enrich name/image when the code is recognized.
              setFormData((prev) => ({ ...prev, articleModele: value }));
              setShowScanner(false);
              if (barcodeLookupEnabled()) {
                void lookupProduct(value).then((info) => {
                  if (!info) return;
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

        <div>
          <label
            htmlFor="purchasePrice"
            className="block text-sm font-medium ui-text-muted mb-1"
          >
            {t("articleForm.purchasePrice")}
          </label>
          <input
            type="number"
            id="purchasePrice"
            name="purchasePrice"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={purchasePrice}
            onChange={(e) => setPurchasePrice(e.target.value)}
            className="w-full px-3 py-2 ui-input rounded-md"
            placeholder={t("articleForm.placeholder.purchasePrice")}
          />
        </div>

        <div>
          <label
            htmlFor="depreciationRate"
            className="block text-sm font-medium ui-text-muted mb-1"
          >
            {t("articleForm.depreciationRate")}
          </label>
          <input
            type="number"
            id="depreciationRate"
            name="depreciationRate"
            min="0"
            max="100"
            step="0.01"
            inputMode="decimal"
            value={depreciationRate}
            onChange={(e) => setDepreciationRate(e.target.value)}
            className="w-full px-3 py-2 ui-input rounded-md"
            placeholder={t("articleForm.placeholder.depreciationRate")}
          />
          <p className="mt-1 text-xs ui-text-muted">
            {t("articleForm.depreciationRateHint")}
          </p>
        </div>

        <div>
          <label
            htmlFor="articleDescription"
            className="block text-sm font-medium ui-text-muted mb-1"
          >
            {t("articleForm.description")}
          </label>
          <textarea
            id="articleDescription"
            name="articleDescription"
            value={formData.articleDescription || ""}
            onChange={handleChange}
            rows={3}
            className="w-full px-3 py-2 ui-input rounded-md"
            placeholder={t("articleForm.placeholder.description")}
            maxLength={255}
          />
        </div>

        <div>
          <label
            htmlFor="productImageUrl"
            className="block text-sm font-medium ui-text-muted mb-1"
          >
            {t("articleForm.productImageUrl")}
          </label>
          <input
            type="url"
            id="productImageUrl"
            name="productImageUrl"
            value={formData.productImageUrl || ""}
            onChange={handleChange}
            className="w-full px-3 py-2 ui-input rounded-md"
            placeholder={t("articleForm.placeholder.imageUrl")}
            maxLength={255}
          />
        </div>

        <div className="border-t ui-divider pt-4">
          <div className="flex items-center gap-2">
            <input
              id="warrantyEnabled"
              type="checkbox"
              checked={warrantyEnabled}
              onChange={(e) => setWarrantyEnabled(e.target.checked)}
            />
            <label htmlFor="warrantyEnabled" className="text-sm font-medium">
              {t("articleForm.warranty.toggle")}
            </label>
          </div>

          {warrantyEnabled && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium ui-text-muted mb-1">
                    {t("articleForm.warranty.name")}
                  </label>
                  <input
                    type="text"
                    value={warrantyNom}
                    onChange={(e) => setWarrantyNom(e.target.value)}
                    className="w-full px-3 py-2 ui-input rounded-md"
                    placeholder={t("articleForm.warranty.placeholder.name")}
                    maxLength={100}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium ui-text-muted mb-1">
                    {t("articleForm.warranty.purchaseDate")}
                  </label>
                  <input
                    type="date"
                    value={warrantyDateAchat}
                    onChange={(e) => setWarrantyDateAchat(e.target.value)}
                    className="w-full px-3 py-2 ui-input rounded-md"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium ui-text-muted mb-1">
                    {t("articleForm.warranty.durationMonths")}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={warrantyDuration}
                    onChange={(e) =>
                      setWarrantyDuration(Number(e.target.value))
                    }
                    className="w-full px-3 py-2 ui-input rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium ui-text-muted mb-1">
                  {t("attachments.form.fileUpload")}
                </label>
                <div className="flex flex-col gap-2">
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    disabled={warrantyProofUploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleWarrantyProofSelected(f);
                      // allow selecting same file again
                      e.currentTarget.value = "";
                    }}
                    className="w-full"
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
                    <div className="text-sm flex items-center justify-between gap-3 border ui-divider rounded-md px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {warrantyProofAttachment.fileName ||
                            `#${warrantyProofAttachment.attachmentId}`}
                        </p>
                        <a
                          className="ui-action-primary hover:underline"
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
                          {t("articleForm.warranty.proof.open")}
                        </a>
                      </div>
                      <button
                        type="button"
                        onClick={clearWarrantyProof}
                        className="ui-action-danger whitespace-nowrap"
                      >
                        {t("common.delete")}
                      </button>
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
                      />
                      {t("articleForm.warranty.proof.deleteFromServer")}
                    </label>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium ui-text-muted mb-1">
            {t("articleForm.locations")} *
          </label>

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
            <div className="ui-panel rounded-md p-3 space-y-2 max-h-40 overflow-auto">
              {locations.map((loc) => (
                <label
                  key={loc.locationId}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedSet.has(loc.locationId)}
                    onChange={() => toggleLocation(loc.locationId)}
                  />
                  <span className="text-sm ui-title">{loc.name}</span>
                </label>
              ))}
            </div>
          )}

          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={newLocationName}
              onChange={(e) => setNewLocationName(e.target.value)}
              placeholder={t("articleForm.location.new.placeholder")}
              className="flex-1 px-3 py-2 ui-input rounded-md"
              maxLength={120}
            />
            <button
              type="button"
              onClick={handleCreateLocation}
              disabled={creatingLocation || !newLocationName.trim()}
              className="px-3 py-2 ui-btn-primary rounded-md"
            >
              {creatingLocation
                ? t("articleForm.location.create.loading")
                : t("articleForm.location.create")}
            </button>
          </div>
          {locCreateError && (
            <p className="mt-1 text-sm ui-text-error">{locCreateError}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium ui-text-muted mb-1">
            {t("articleForm.tags")}
          </label>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map((tg) => {
                const active = selectedTagSet.has(tg.tagId);
                return (
                  <button
                    type="button"
                    key={tg.tagId}
                    onClick={() => toggleTag(tg.tagId)}
                    aria-pressed={active}
                    className={`px-2 py-1 text-xs rounded-full border ui-divider ${
                      active ? "ui-badge-info" : "ui-btn-ghost"
                    }`}
                  >
                    {tg.name}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex gap-2">
            <input
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
              className="flex-1 px-3 py-2 ui-input rounded-md"
              maxLength={40}
            />
            <button
              type="button"
              onClick={handleCreateTag}
              disabled={creatingTag || !newTagName.trim()}
              className="px-3 py-2 ui-btn-ghost border ui-divider rounded-md"
            >
              {t("articleForm.tags.add")}
            </button>
          </div>
        </div>

        {formError && (
          <p
            ref={formErrorRef}
            role="alert"
            aria-live="polite"
            className="text-sm ui-text-error"
          >
            {formError}
          </p>
        )}

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={submitting || warrantyProofUploading}
            className="px-4 py-2 ui-btn-primary rounded-md"
          >
            {submitting
              ? t("common.loading")
              : article
                ? t("articleForm.submit.update")
                : t("articleForm.submit.create")}
          </button>

          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 ui-btn-ghost border ui-divider rounded-md"
            >
              {t("common.cancel")}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default ArticleForm;
