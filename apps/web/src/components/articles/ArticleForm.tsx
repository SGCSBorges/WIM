/**
 * Article Form Component
 * Form for creating and editing articles
 */

import React, { useEffect, useMemo, useState } from "react";
import { attachmentsAPI, locationsAPI } from "../../services/api";
import { useI18n } from "../../i18n/i18n";

interface Article {
  articleId?: number;
  articleNom: string;
  articleModele: string;
  articleDescription?: string | null;
  productImageUrl?: string | null;
  locationIds?: number[];
  // Edit payload from API includes join rows like { locationId, location: { name } }
  locations?: Array<{ locationId: number; location?: { name: string } }>;
  // For create/update we submit a simplified nested warranty payload.
  // For editing, ArticlesList sends `garantie` which can include extra fields.
  garantie?:
    | {
        garantieNom: string;
        garantieDateAchat: string;
        garantieDuration: number;
      }
    | any;
}

interface Location {
  locationId: number;
  name: string;
}

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
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [locationsError, setLocationsError] = useState<string | null>(null);
  const deriveInitialLocationIds = (a?: Article): number[] => {
    const anyA: any = a as any;
    const fromJoin = Array.isArray(anyA?.locations)
      ? anyA.locations
          .map((x: any) => Number(x?.locationId))
          .filter((n: number) => Number.isFinite(n) && n > 0)
      : [];
    const fromLegacy = Array.isArray(anyA?.locationIds)
      ? anyA.locationIds
          .map((x: any) => Number(x))
          .filter((n: number) => Number.isFinite(n) && n > 0)
      : [];

    // Prefer join data if present, fallback to legacy.
    return fromJoin.length > 0 ? fromJoin : fromLegacy;
  };

  const [selectedLocationIds, setSelectedLocationIds] = useState<number[]>(() =>
    deriveInitialLocationIds(article),
  );

  const [newLocationName, setNewLocationName] = useState("");
  const [creatingLocation, setCreatingLocation] = useState(false);

  const [formData, setFormData] = useState<Omit<Article, "articleId">>({
    articleNom: article?.articleNom || "",
    articleModele: article?.articleModele || "",
    articleDescription: article?.articleDescription || "",
    productImageUrl: article?.productImageUrl || "",
  });

  const [warrantyEnabled, setWarrantyEnabled] = useState(
    Boolean((article as any)?.garantie),
  );
  const [warrantyNom, setWarrantyNom] = useState(
    ((article as any)?.garantie?.garantieNom as string) || "",
  );
  const [warrantyDateAchat, setWarrantyDateAchat] = useState(() => {
    const raw = (article as any)?.garantie?.garantieDateAchat;
    if (!raw) return "";
    // API returns ISO string; input[type=date] expects YYYY-MM-DD
    return String(raw).slice(0, 10);
  });
  const [warrantyDuration, setWarrantyDuration] = useState<number>(
    Number((article as any)?.garantie?.garantieDuration) || 24,
  );

  const [warrantyProofAttachment, setWarrantyProofAttachment] = useState<{
    attachmentId: number;
    fileName: string;
    mimeType: string;
    fileUrl: string;
  } | null>(() => {
    const g: any = (article as any)?.garantie;
    if (!g?.garantieImageAttachmentId) return null;
    // We might not have attachment details on the article payload; we at least keep the ID.
    return {
      attachmentId: Number(g.garantieImageAttachmentId),
      fileName: g?.garantieImageAttachment?.fileName || "",
      mimeType: g?.garantieImageAttachment?.mimeType || "",
      fileUrl: g?.garantieImageAttachment?.fileUrl || "",
    };
  });
  const [warrantyProofUploading, setWarrantyProofUploading] = useState(false);
  const [warrantyProofError, setWarrantyProofError] = useState<string | null>(
    null,
  );
  const [deleteProofFromServer, setDeleteProofFromServer] = useState(false);

  useEffect(() => {
    // When switching between create/edit, keep warranty state in sync.
    setSelectedLocationIds(deriveInitialLocationIds(article));
    setWarrantyEnabled(Boolean((article as any)?.garantie));
    setWarrantyNom(((article as any)?.garantie?.garantieNom as string) || "");
    const raw = (article as any)?.garantie?.garantieDateAchat;
    setWarrantyDateAchat(raw ? String(raw).slice(0, 10) : "");
    setWarrantyDuration(
      Number((article as any)?.garantie?.garantieDuration) || 24,
    );

    const g: any = (article as any)?.garantie;
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
      setWarrantyProofError(
        e instanceof Error ? e.message : t("common.errorOccurred"),
      );
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
          },
        );
      }
    } catch (e) {
      setWarrantyProofError(
        e instanceof Error ? e.message : t("common.errorOccurred"),
      );
      return;
    }

    setWarrantyProofAttachment(null);
  };

  const selectedSet = useMemo(
    () => new Set(selectedLocationIds),
    [selectedLocationIds],
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLocationsLoading(true);
        const data = await locationsAPI.getAll();
        // backend returns locations with extra fields; we only need id+name
        const mapped: Location[] = (data || []).map((l: any) => ({
          locationId: l.locationId,
          name: l.name,
        }));
        if (mounted) {
          setLocations(mapped);
          setLocationsError(null);
        }
      } catch (e) {
        if (mounted)
          setLocationsError(
            e instanceof Error ? e.message : t("common.errorOccurred"),
          );
      } finally {
        if (mounted) setLocationsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedLocationIds.length === 0) {
      alert(t("articleForm.locations.required"));
      return;
    }

    // Convert empty strings to null for optional fields
    const submitData: any = {
      ...formData,
      articleDescription: formData.articleDescription?.trim() || null,
      productImageUrl: formData.productImageUrl?.trim() || null,
      locationIds: selectedLocationIds,
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

    if (warrantyEnabled) {
      if (!warrantyNom.trim()) {
        alert(t("articleForm.warranty.requiredName"));
        return;
      }
      if (!warrantyDateAchat) {
        alert(t("articleForm.warranty.requiredDate"));
        return;
      }
      if (!warrantyDuration || warrantyDuration < 1) {
        alert(t("articleForm.warranty.requiredDuration"));
        return;
      }
    }

    void onSubmit(submitData);
  };

  const toggleLocation = (id: number) => {
    setSelectedLocationIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleCreateLocation = async () => {
    const name = newLocationName.trim();
    if (!name) return;
    try {
      setCreatingLocation(true);
      const created = await locationsAPI.create({ name });
      const loc: Location = {
        locationId: created.locationId,
        name: created.name,
      };
      setLocations((prev) => [loc, ...prev]);
      setSelectedLocationIds((prev) =>
        prev.includes(loc.locationId) ? prev : [...prev, loc.locationId],
      );
      setNewLocationName("");
    } catch (e) {
      alert(e instanceof Error ? e.message : t("locations.error.create"));
    } finally {
      setCreatingLocation(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        {article ? t("articleForm.editTitle") : t("articleForm.createTitle")}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="articleNom"
            className="block text-sm font-medium text-gray-700 mb-1"
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
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder={t("articleForm.placeholder.name")}
            maxLength={100}
          />
        </div>

        <div>
          <label
            htmlFor="articleModele"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {t("articleForm.model")} *
          </label>
          <input
            type="text"
            id="articleModele"
            name="articleModele"
            required
            value={formData.articleModele}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder={t("articleForm.placeholder.model")}
            maxLength={100}
          />
        </div>

        <div>
          <label
            htmlFor="articleDescription"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {t("articleForm.description")}
          </label>
          <textarea
            id="articleDescription"
            name="articleDescription"
            value={formData.articleDescription || ""}
            onChange={handleChange}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder={t("articleForm.placeholder.description")}
            maxLength={255}
          />
        </div>

        <div>
          <label
            htmlFor="productImageUrl"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {t("articleForm.productImageUrl")}
          </label>
          <input
            type="url"
            id="productImageUrl"
            name="productImageUrl"
            value={formData.productImageUrl || ""}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder={t("articleForm.placeholder.imageUrl")}
            maxLength={255}
          />
        </div>

        <div className="border-t border-gray-200 pt-4">
          <div className="flex items-center gap-2">
            <input
              id="warrantyEnabled"
              type="checkbox"
              checked={warrantyEnabled}
              onChange={(e) => setWarrantyEnabled(e.target.checked)}
            />
            <label
              htmlFor="warrantyEnabled"
              className="text-sm font-medium text-gray-700"
            >
              {t("articleForm.warranty.toggle")}
            </label>
          </div>

          {warrantyEnabled && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t("articleForm.warranty.name")}
                  </label>
                  <input
                    type="text"
                    value={warrantyNom}
                    onChange={(e) => setWarrantyNom(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder={t("articleForm.warranty.placeholder.name")}
                    maxLength={100}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t("articleForm.warranty.purchaseDate")}
                  </label>
                  <input
                    type="date"
                    value={warrantyDateAchat}
                    onChange={(e) => setWarrantyDateAchat(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                    <p className="text-sm text-gray-500">
                      {t("common.loading")}
                    </p>
                  )}

                  {warrantyProofError && (
                    <p className="text-sm text-red-600">{warrantyProofError}</p>
                  )}

                  {warrantyProofAttachment && (
                    <div className="text-sm text-gray-700 flex items-center justify-between gap-3 border border-gray-200 rounded-md px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {warrantyProofAttachment.fileName ||
                            `#${warrantyProofAttachment.attachmentId}`}
                        </p>
                        <a
                          className="text-blue-600 hover:underline"
                          href={
                            warrantyProofAttachment.fileUrl ||
                            `http://localhost:3000/api/attachments/${warrantyProofAttachment.attachmentId}`
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
                        className="text-red-600 hover:underline whitespace-nowrap"
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  )}

                  {warrantyProofAttachment && (
                    <label className="flex items-center gap-2 text-xs text-gray-600">
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
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("articleForm.locations")} *
          </label>

          {locationsLoading ? (
            <p className="text-sm text-gray-500">
              {t("articleForm.locations.loading")}
            </p>
          ) : locationsError ? (
            <p className="text-sm text-red-600">{locationsError}</p>
          ) : locations.length === 0 ? (
            <p className="text-sm text-gray-500">
              {t("articleForm.locations.none")}
            </p>
          ) : (
            <div className="border border-gray-200 rounded-md p-3 space-y-2 max-h-40 overflow-auto">
              {locations.map((loc) => (
                <label key={loc.locationId} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedSet.has(loc.locationId)}
                    onChange={() => toggleLocation(loc.locationId)}
                  />
                  <span className="text-sm text-gray-700">{loc.name}</span>
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
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
              maxLength={120}
            />
            <button
              type="button"
              onClick={handleCreateLocation}
              disabled={creatingLocation || !newLocationName.trim()}
              className="px-3 py-2 bg-gray-900 text-white rounded-md disabled:opacity-50"
            >
              {creatingLocation
                ? t("articleForm.location.create.loading")
                : t("articleForm.location.create")}
            </button>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            {article
              ? t("articleForm.submit.update")
              : t("articleForm.submit.create")}
          </button>

          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
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
